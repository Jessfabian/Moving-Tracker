import { parseProductHtml, productFromUrl, unwrapLink } from "@moving/shared";
import { fetchPage, safeUrl } from "@/lib/serverFetch";

/** GET /api/product?url=… → name, brand, price, picture from a store's product page. */
export async function GET(request: Request) {
  const raw = unwrapLink(new URL(request.url).searchParams.get("url") ?? "");
  const target = await safeUrl(raw);
  if (!target) return Response.json({ error: "Paste the full product link, starting with https://" }, { status: 400 });
  const guess = productFromUrl(raw);
  const page = await fetchPage(target);
  if (page.ok) {
    const info = parseProductHtml(page.html, page.url.toString());
    // Bot-check pages ("Robot Check", "Access Denied") parse to junk names — fall back to the link.
    const junk = !info.name || /robot check|captcha|access denied|are you a human|page not found|sorry/i.test(info.name);
    if (!junk) return Response.json({ ...info, partial: info.price == null });
  }
  if (guess) return Response.json({ ...guess, partial: true, note: "The store blocked us, so we used the name in the link — add the price yourself." });
  return Response.json({ error: "That store blocks automatic downloads — fill in the name and price yourself." }, { status: 502 });
}
