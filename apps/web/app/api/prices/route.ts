import {
  bookLivePriceUrls,
  itemLivePriceUrls,
  normalizeIsbn,
  parseAbeBooks,
  parseBingShopping,
  parseThriftBooks,
  parseValoreBooks,
  parseWalmartSearch,
  relevantOffers,
  summarizeOffers,
  type LiveOffer,
  type LivePriceResult,
} from "@moving/shared";
import { fetchPage } from "@/lib/serverFetch";

type Source = { name: string; url: string; plain?: boolean; parse: (html: string, url: string) => LiveOffer[] };

/** GET /api/prices?isbn=… (books) or ?q=… (items) → live store listings + a suggested resale value. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const isbn = normalizeIsbn(params.get("isbn") ?? "");
  const q = (params.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!isbn && q.length < 3) return Response.json({ error: "Send an ISBN or an item name." }, { status: 400 });

  let sources: Source[];
  if (isbn) {
    const u = bookLivePriceUrls(isbn);
    sources = [
      { name: "AbeBooks", url: u.abebooks, parse: (h) => parseAbeBooks(h) },
      { name: "ThriftBooks", url: u.thriftbooks, parse: (h, url) => parseThriftBooks(h, url, isbn) },
      { name: "ValoreBooks", url: u.valore, parse: parseValoreBooks },
    ];
  } else {
    const u = itemLivePriceUrls(q);
    sources = [
      { name: "Walmart", url: u.walmart, plain: true, parse: (h) => parseWalmartSearch(h) },
      { name: "Bing Shopping", url: u.bing, parse: (h) => parseBingShopping(h) },
    ];
  }

  const pages = await Promise.all(sources.map((s) => fetchPage(new URL(s.url), 15000, { plain: s.plain })));
  const status: LivePriceResult["sources"] = [];
  let offers: LiveOffer[] = [];
  pages.forEach((p, i) => {
    const s = sources[i]!;
    let found: LiveOffer[] = [];
    if (p.ok) {
      try {
        found = s.parse(p.html, p.url.toString());
      } catch {
        found = [];
      }
    }
    if (!isbn) found = relevantOffers(q, found);
    status.push({ name: s.name, ok: p.ok, count: found.length });
    offers = offers.concat(found);
  });
  offers.sort((a, b) => Number(b.used) - Number(a.used) || a.price - b.price);

  const body: LivePriceResult = {
    query: isbn ?? q,
    offers: offers.slice(0, 40),
    summary: summarizeOffers(offers, isbn ? "book" : "item"),
    sources: status,
    checkedAt: new Date().toISOString(),
  };
  return Response.json(body, { headers: { "cache-control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
}
