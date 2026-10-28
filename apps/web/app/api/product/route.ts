import {
  fillProductGaps,
  isJunkProductName,
  itemLivePriceUrls,
  itemPriceQuery,
  median,
  parseBingShopping,
  parseProductHtml,
  parseTargetProduct,
  productFromUrl,
  relevantOffers,
  resaleEstimate,
  targetProductApi,
  targetTcin,
  unwrapLink,
  type ProductInfo,
} from "@moving/shared";
import { fetchPage, safeUrl } from "@/lib/serverFetch";

/** Stores often hide the price from bots — use the typical new price at other stores instead. */
async function storePrice(info: ProductInfo): Promise<number | null> {
  const q = itemPriceQuery(info).slice(0, 120);
  if (q.length < 3) return null;
  const page = await fetchPage(new URL(itemLivePriceUrls(q).bing), 12000);
  if (!page.ok) return null;
  const offers = relevantOffers(q, parseBingShopping(page.html)).filter((o) => !o.used);
  const typical = median(offers.map((o) => o.price));
  return typical != null ? Math.round(typical * 100) / 100 : null;
}

async function finish(info: ProductInfo, note?: string) {
  const full = fillProductGaps(info);
  let priceNote = "";
  if (full.price == null) {
    const p = await storePrice(full).catch(() => null);
    if (p != null) {
      full.price = p;
      full.resale = resaleEstimate(p);
      priceNote = "price is the typical price at stores right now";
    }
  }
  const partial = full.price == null;
  const msg = [note, priceNote].filter(Boolean).join(" · ");
  return Response.json({ ...full, partial, note: msg || undefined });
}

/** GET /api/product?url=… → name, brand, model, price, picture from a store's product page. */
export async function GET(request: Request) {
  const raw = unwrapLink(new URL(request.url).searchParams.get("url") ?? "");
  const target = await safeUrl(raw);
  if (!target) return Response.json({ error: "Paste the full product link, starting with https://" }, { status: 400 });

  const tcin = targetTcin(target.toString());
  if (tcin) {
    try {
      const res = await fetch(targetProductApi(tcin), {
        headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      const info = res.ok ? parseTargetProduct(await res.json()) : null;
      if (new URL(request.url).searchParams.has("diag")) return Response.json({ diag: res.status, body: info ? "ok" : (await res.text().catch(() => "")).slice(0, 300) });
      if (info) return finish(info);
    } catch (e) {
      if (new URL(request.url).searchParams.has("diag")) return Response.json({ diag: String(e) });
      /* fall back to the page */
    }
  }

  const guess = productFromUrl(raw);
  const page = await fetchPage(target);
  if (page.ok) {
    const info = parseProductHtml(page.html, page.url.toString());
    // Bot-check pages ("Robot or human?", "Access Denied") parse to junk names — fall back to the link.
    if (!isJunkProductName(info.name)) return finish(info);
  }
  if (guess) return finish(guess, "The store blocked us, so we used the name in the link");
  return Response.json({ error: "That store blocks automatic downloads — fill in the name and price yourself." }, { status: 502 });
}
