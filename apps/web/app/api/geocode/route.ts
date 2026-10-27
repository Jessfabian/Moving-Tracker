import { parsePhoton, parseZippopotam, normalizeZip, parseOsrmRoute, estimateRoadDistance, type AddressSuggestion } from "@moving/shared";

const UA = "MovingTracker/1.0 (personal moving planner)";

async function zipInfo(zip: string) {
  const res = await fetch(`https://api.zippopotam.us/us/${zip}`, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  return parseZippopotam(await res.json());
}

async function routeBetweenZips(fromZip: string, toZip: string) {
  const a = normalizeZip(fromZip);
  const b = normalizeZip(toZip);
  if (!a || !b) return Response.json({ error: "Enter two 5-digit ZIPs" }, { status: 400 });
  const [p, q] = await Promise.all([zipInfo(a).catch(() => null), zipInfo(b).catch(() => null)]);
  if (!p || !q) return Response.json({ error: `ZIP ${!p ? a : b} not found` }, { status: 404 });
  const cache = { "cache-control": "public, max-age=86400" };
  const places = { from: { zip: a, city: p.city, state: p.state }, to: { zip: b, city: q.city, state: q.state } };
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${p.lng},${p.lat};${q.lng},${q.lat}?overview=false`, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    const route = res.ok ? parseOsrmRoute(await res.json()) : null;
    if (route) return Response.json({ ...route, ...places }, { headers: cache });
  } catch {
    // fall through to the estimate
  }
  return Response.json({ ...estimateRoadDistance(p, q), ...places });
}

async function photon(q: string, bias: { lat?: string | null; lng?: string | null }): Promise<AddressSuggestion[]> {
  const u = new URL("https://photon.komoot.io/api/");
  u.searchParams.set("q", q);
  u.searchParams.set("limit", "8");
  u.searchParams.set("lang", "en");
  if (bias.lat && bias.lng) {
    u.searchParams.set("lat", bias.lat);
    u.searchParams.set("lon", bias.lng);
  }
  const res = await fetch(u, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const json = (await res.json()) as { features?: { properties?: { countrycode?: string } }[] };
  const us = (json.features ?? []).filter((f) => f.properties?.countrycode === "US");
  return parsePhoton({ features: us.length ? us : json.features });
}

const cap = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** US Census geocoder — free, no key, and the most accurate for US street addresses. */
async function census(q: string): Promise<AddressSuggestion[]> {
  const u = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
  u.searchParams.set("address", q);
  u.searchParams.set("benchmark", "Public_AR_Current");
  u.searchParams.set("format", "json");
  const res = await fetch(u, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const json = (await res.json()) as { result?: { addressMatches?: { matchedAddress: string; coordinates: { x: number; y: number } }[] } };
  return (json.result?.addressMatches ?? []).flatMap((m) => {
    const [street, city, state, zip] = m.matchedAddress.split(/\s*,\s*/);
    if (!street || !city || !state) return [];
    const s = cap(street);
    const c = cap(city);
    return [{ label: `${s}, ${c}, ${state} ${zip ?? ""}`.trim(), street: s, city: c, state, zip: zip ?? "", lat: m.coordinates.y, lng: m.coordinates.x }];
  });
}

// Nominatim usage policy: at most one request per second from this server.
let nominatimNext = 0;
async function nominatim(q: string): Promise<AddressSuggestion[]> {
  const wait = nominatimNext - Date.now();
  nominatimNext = Math.max(Date.now(), nominatimNext) + 1000;
  if (wait > 2500) return [];
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.searchParams.set("q", q);
  u.searchParams.set("format", "jsonv2");
  u.searchParams.set("addressdetails", "1");
  u.searchParams.set("countrycodes", "us");
  u.searchParams.set("limit", "6");
  const res = await fetch(u, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) return [];
  const rows = (await res.json()) as { lat: string; lon: string; name?: string; address?: Record<string, string> }[];
  // Reuse the Photon parser by reshaping Nominatim rows into GeoJSON-like features.
  return parsePhoton({
    features: rows.map((r) => ({
      geometry: { coordinates: [Number(r.lon), Number(r.lat)] },
      properties: {
        name: r.name,
        housenumber: r.address?.house_number,
        street: r.address?.road,
        city: r.address?.city ?? r.address?.town ?? r.address?.village ?? r.address?.suburb,
        state: r.address?.state,
        postcode: r.address?.postcode,
      },
    })),
  });
}

/**
 * GET /api/geocode?q=…            → address / place suggestions (Photon, falling back to Nominatim)
 * GET /api/geocode?zip=38103      → { city, state, lat, lng }
 * GET /api/geocode?from=02118&to=38103 → { miles, minutes, method } driving distance between two ZIPs
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  if (from && to) return routeBetweenZips(from, to);
  const zip = sp.get("zip");
  if (zip) {
    const z = normalizeZip(zip);
    if (!z) return Response.json({ error: "Enter a 5-digit ZIP" }, { status: 400 });
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${z}`, { signal: AbortSignal.timeout(6000) });
      if (res.status === 404) return Response.json({ error: "ZIP not found" }, { status: 404 });
      const info = parseZippopotam(await res.json());
      return info ? Response.json(info, { headers: { "cache-control": "public, max-age=86400" } }) : Response.json({ error: "ZIP not found" }, { status: 404 });
    } catch {
      return Response.json({ error: "ZIP lookup unavailable" }, { status: 502 });
    }
  }
  const q = (sp.get("q") ?? "").trim();
  if (q.length < 3) return Response.json({ results: [] });
  try {
    const num = /^(\d+[A-Za-z]?)\s+\S/.exec(q)?.[1];
    const [ph, nm, cs] = await Promise.all([
      photon(q, { lat: sp.get("lat"), lng: sp.get("lng") }).catch(() => [] as AddressSuggestion[]),
      num && q.length >= 8 ? nominatim(q).catch(() => [] as AddressSuggestion[]) : Promise.resolve([] as AddressSuggestion[]),
      num && /,/.test(q) ? census(q).catch(() => [] as AddressSuggestion[]) : Promise.resolve([] as AddressSuggestion[]),
    ]);
    let results = num ? [...cs, ...nm, ...ph] : ph;
    if (!results.length && !num) results = await nominatim(q).catch(() => []);
    if (num) {
      // Street-level matches get the typed house number; exact address matches rank first.
      results = results.map((r) => {
        if (r.name || /^\d/.test(r.street) || !r.street) return r;
        const street = `${num} ${r.street}`;
        return { ...r, street, label: [street, r.city, [r.state, r.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") };
      });
      const rank = (r: AddressSuggestion) => (r.street.startsWith(`${num} `) ? (r.name ? 1 : 0) : 2);
      results = results.sort((a, b) => rank(a) - rank(b));
    }
    const seen = new Set<string>();
    results = results.filter((r) => !seen.has(r.label) && seen.add(r.label)).slice(0, 8);
    return Response.json({ results }, { headers: { "cache-control": "public, max-age=3600" } });
  } catch {
    return Response.json({ results: [] }, { status: 502 });
  }
}
