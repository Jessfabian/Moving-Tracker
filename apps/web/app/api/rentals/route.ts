import {
  distanceMiles,
  estimateDriveMinutes,
  parseRentComPage,
  rentComCityPath,
  rentComKinds,
  rentComPageUrl,
  type ApartmentSearch,
  type LatLng,
  type RentalResult,
  type RentComKind,
  type RentComNearby,
} from "@moving/shared";
import { fetchPage } from "@/lib/serverFetch";

export const maxDuration = 60;

const MAX_FETCHES = 60;
/** Fetches allowed for discovering towns; the rest go to more pages in the towns that are in range. */
const WAVE_BUDGET = 30;
const POOL = 4;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : NaN;
};
const centroid = (list: RentalResult[]): LatLng | null => {
  const pts = list.filter((r) => r.lat != null && r.lng != null);
  return pts.length ? { lat: median(pts.map((r) => r.lat!)), lng: median(pts.map((r) => r.lng!)) } : null;
};

async function pool<T>(jobs: (() => Promise<T>)[], size: number): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, jobs.length) }, async () => {
      while (next < jobs.length) {
        const i = next++;
        out[i] = await jobs[i]!();
      }
    }),
  );
  return out;
}

/** Real drive times from the center to each listing (OSRM table, 99 at a time); null where the router didn't answer. */
async function driveTimes(center: LatLng, pts: LatLng[]): Promise<({ minutes: number; miles: number } | null)[]> {
  const out: ({ minutes: number; miles: number } | null)[] = new Array(pts.length).fill(null);
  for (let i = 0; i < pts.length; i += 99) {
    const chunk = pts.slice(i, i + 99);
    const coords = [center, ...chunk].map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
    try {
      const res = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=duration,distance`, {
        headers: { "user-agent": "moving-tracker/1.0" },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) break;
      const j = (await res.json()) as { durations?: (number | null)[][]; distances?: (number | null)[][] };
      const d = j.durations?.[0];
      const m = j.distances?.[0];
      chunk.forEach((_, k) => {
        const sec = d?.[k + 1];
        if (typeof sec === "number") out[i + k] = { minutes: Math.round(sec / 60), miles: Math.round(((m?.[k + 1] ?? 0) / 1609.344) * 10) / 10 };
      });
    } catch {
      break;
    }
  }
  return out;
}

/**
 * GET /api/rentals?city=&state=&zip=&type=[&lat=&lng=&radius=&minutes=]
 * Rentals from Rent.com. With a radius, it walks out from the city through Rent.com's nearby cities
 * (across state lines too) and keeps listings within that many miles — or that drive time — of lat/lng.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const type = q.get("type");
  const homeType = (["apartment", "townhome", "house"].includes(type ?? "") ? type : "any") as ApartmentSearch["homeType"];
  const city = (q.get("city") ?? "").slice(0, 60);
  const state = (q.get("state") ?? "").slice(0, 2);
  const zip = (q.get("zip") ?? "").replace(/\D/g, "").slice(0, 5);
  const radius = Math.min(60, Math.max(0, Number(q.get("radius")) || 0)) || null;
  const maxMinutes = Math.min(90, Math.max(0, Number(q.get("minutes")) || 0)) || null;
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));
  const given: LatLng | null = Number.isFinite(lat) && Number.isFinite(lng) && q.get("lat") && q.get("lng") ? { lat, lng } : null;

  const seed = rentComCityPath(city, state) ?? (zip.length === 5 ? `/zip-${zip}` : null);
  if (!seed) return Response.json({ error: "Enter a city and state (like Germantown, TN) or a 5-digit ZIP." }, { status: 400 });
  const kinds = rentComKinds(homeType);
  const first = kinds[0]!;

  let fetches = 0;
  let failures = 0;
  let blocked = false;
  const all = new Map<string, RentalResult>();
  const load = async (path: string, kind: RentComKind, page: number) => {
    if (fetches >= MAX_FETCHES || blocked) return null;
    fetches++;
    const p = await fetchPage(new URL(rentComPageUrl(path, kind, page)), 15000);
    if (!p.ok) {
      failures++;
      return null;
    }
    // Rent.com's firewall answers with a JavaScript challenge when it thinks we're going too fast — stop and keep what we have.
    if (!p.html.includes("__NEXT_DATA__")) {
      if (/awsWaf|challenge/i.test(p.html)) blocked = true;
      failures++;
      return null;
    }
    const parsed = parseRentComPage(p.html);
    for (const r of parsed.listings) if (!all.has(r.id)) all.set(r.id, r);
    return parsed;
  };

  const seedPage = await load(seed, first, 1);
  if (!seedPage)
    return Response.json(
      { error: blocked ? "The rental site is asking us to slow down — wait a few minutes and search again, or use the site links below." : "The rental site didn't answer — try again in a minute, or use the site links below." },
      { status: 502 },
    );
  const searched = [city ? `${city}${state ? `, ${state.toUpperCase()}` : ""}` : zip];

  if (!radius) {
    await pool(
      [...[2, 3].map((p) => () => load(seed, first, p)), ...kinds.slice(1).map((k) => () => load(seed, k, 1))],
      POOL,
    );
  } else {
    const center = given ?? centroid(seedPage.listings);
    if (!center) return Response.json({ error: "Couldn't place that area on the map — try a different city." }, { status: 404 });
    const seedAt = centroid(seedPage.listings.filter((r) => !city || r.city.toLowerCase() === city.toLowerCase())) ?? centroid(seedPage.listings) ?? center;
    const visited = new Set<string>([seed]);
    // Distance lower bound for a nearby city: |its distance from the page's city − that city's distance from the center|.
    let frontier: { c: RentComNearby; low: number }[] = seedPage.nearby.map((c) => ({ c, low: Math.abs(c.miles - distanceMiles(seedAt, center)) }));
    // More pages for the big towns come after every town's first page; ordered page 2s first, biggest towns first.
    const extra: { order: number; size: number; run: () => Promise<unknown> }[] = [];
    const queueMore = (path: string, total: number | null) => {
      const n = Math.min(8, Math.ceil((total ?? 0) / 30));
      for (let p = 2; p <= n; p++) extra.push({ order: p, size: total ?? 0, run: () => load(path, first, p) });
      for (const k of kinds.slice(1)) extra.push({ order: 2.5, size: total ?? 0, run: () => load(path, k, 1) });
    };
    if (distanceMiles(seedAt, center) <= radius + 5) queueMore(seed, seedPage.total);
    for (let wave = 0; wave < 3 && frontier.length && fetches < WAVE_BUDGET; wave++) {
      const todo = frontier
        .filter((f) => f.low <= radius + 3 && !visited.has(f.c.path))
        .sort((a, b) => a.low - b.low)
        .slice(0, WAVE_BUDGET - fetches);
      todo.forEach((f) => visited.add(f.c.path));
      frontier = [];
      const loaded = await pool(
        todo.map((f) => async () => ({ f, page: await load(f.c.path, first, 1) })),
        POOL,
      );
      for (const { f, page } of loaded) {
        if (!page) continue;
        const at = centroid(page.listings.filter((r) => r.city.toLowerCase() === f.c.name.toLowerCase())) ?? centroid(page.listings);
        const d = at ? distanceMiles(at, center) : f.low;
        if (d > radius + 5) continue;
        if (page.listings.some((r) => r.city.toLowerCase() === f.c.name.toLowerCase())) searched.push(`${f.c.name}${f.c.state ? `, ${f.c.state}` : ""}`);
        queueMore(f.c.path, page.total);
        for (const n of page.nearby) if (!visited.has(n.path)) frontier.push({ c: n, low: Math.abs(n.miles - d) });
      }
    }
    await pool(
      extra.sort((a, b) => a.order - b.order || b.size - a.size).map((e) => e.run),
      POOL,
    );

    const inRange = [...all.values()]
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => ({ ...r, miles: Math.round(distanceMiles(center, { lat: r.lat!, lng: r.lng! }) * 10) / 10 }))
      .filter((r) => r.miles <= radius);
    const drive = given ? await driveTimes(center, inRange.map((r) => ({ lat: r.lat!, lng: r.lng! }))) : [];
    const results = inRange
      .map((r, i) => {
        const d = drive[i];
        return d ? { ...r, minutes: d.minutes, driveBy: "road" as const } : { ...r, minutes: estimateDriveMinutes(r.miles), driveBy: "estimate" as const };
      })
      .filter((r) => !maxMinutes || r.minutes <= maxMinutes)
      .sort((a, b) => a.miles - b.miles)
      .map((r) => ({ ...r, images: r.images.slice(0, 10) }));
    if (!results.length)
      return Response.json(
        { error: blocked ? "The rental site is asking us to slow down — wait a few minutes and search again." : `Nothing listed within ${maxMinutes ? `${maxMinutes} minutes` : `${radius} miles`} — try a wider radius.` },
        { status: blocked ? 502 : 404 },
      );
    return Response.json({ results, source: "Rent.com", searched: [...new Set(searched)], pages: fetches, partial: failures > 0 }, { headers: { "cache-control": failures ? "no-store" : "public, s-maxage=1800, stale-while-revalidate=3600" } });
  }

  const results = [...all.values()];
  if (!results.length) return Response.json({ error: "No rentals found for that area. Check the city spelling or try a ZIP." }, { status: 404 });
  return Response.json({ results, source: "Rent.com", searched, pages: fetches, partial: failures > 0 }, { headers: { "cache-control": failures ? "no-store" : "public, s-maxage=1800, stale-while-revalidate=3600" } });
}
