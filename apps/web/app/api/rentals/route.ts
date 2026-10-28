import { parseRentComSearch, rentComSearchUrls, type ApartmentSearch, type RentalResult } from "@moving/shared";
import { fetchPage } from "@/lib/serverFetch";

/** GET /api/rentals?city=&state=&zip=&type= → rentals listed on Rent.com for that area. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const type = q.get("type");
  const search = {
    city: (q.get("city") ?? "").slice(0, 60),
    state: (q.get("state") ?? "").slice(0, 2),
    zip: (q.get("zip") ?? "").replace(/\D/g, "").slice(0, 5),
    homeType: (["apartment", "townhome", "house"].includes(type ?? "") ? type : "any") as ApartmentSearch["homeType"],
  };
  const urls = rentComSearchUrls(search);
  if (!urls.length) return Response.json({ error: "Enter a city and state (like Germantown, TN) or a 5-digit ZIP." }, { status: 400 });
  const pages = await Promise.all(urls.map((u) => fetchPage(new URL(u), 15000)));
  const results: RentalResult[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    if (!p.ok) continue;
    for (const r of parseRentComSearch(p.html)) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      results.push(r);
    }
  }
  if (!results.length) {
    const blocked = pages.every((p) => !p.ok);
    return Response.json(
      { error: blocked ? "The rental site didn't answer — try again in a minute, or use the site links below." : "No rentals found for that area. Check the city spelling or try a ZIP." },
      { status: blocked ? 502 : 404 },
    );
  }
  return Response.json({ results, source: "Rent.com", searched: urls.length }, { headers: { "cache-control": "public, s-maxage=1800, stale-while-revalidate=3600" } });
}
