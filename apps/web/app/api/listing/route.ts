import { listingFromUrl, mergeListing, parseListingHtml, unwrapLink, type ListingInfo } from "@moving/shared";
import { fetchPage, safeUrl } from "@/lib/serverFetch";

/** GET /api/listing?url=… → photos, title, address, rent, beds… scraped from a rental listing page. */
export async function GET(request: Request) {
  const raw = unwrapLink(new URL(request.url).searchParams.get("url") ?? "");
  const target = await safeUrl(raw);
  if (!target) return Response.json({ error: "Enter a valid public http(s) link" }, { status: 400 });
  const fromUrl = listingFromUrl(raw);
  const hasUrlInfo = Boolean(fromUrl.address || fromUrl.title);
  // When the site won't let us in, still hand back what the link itself says.
  const fallback = (why: string, status: number) =>
    hasUrlInfo
      ? Response.json({ ...fromUrl, url: raw, partial: true, note: `${why} We filled what the link itself says — paste the page text below for rent, beds and size.` } satisfies ListingInfo)
      : Response.json({ error: `${why} Paste the page text below instead, or add details by hand.` }, { status });
  const page = await fetchPage(target);
  if (!page.ok) {
    if (page.reason === "redirect") return fallback("That listing redirected somewhere we can't open.", 400);
    if (page.reason === "network") return fallback("Couldn't reach that link.", 502);
    return fallback(page.reason === "blocked" ? "That site blocks automatic downloads." : `The site answered ${page.status || "nothing"}.`, 502);
  }
  const info = mergeListing(parseListingHtml(page.html, page.url.toString()), fromUrl);
  const empty = !info.images.length && !info.address && info.rent == null;
  if (empty) return fallback("We couldn't read that page.", 502);
  return Response.json({ ...info, url: raw });
}
