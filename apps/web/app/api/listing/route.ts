import { listingFromUrl, mergeListing, parseListingHtml, unwrapLink, type ListingInfo } from "@moving/shared";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 4_000_000;

function isPrivate(ip: string): boolean {
  if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  const v4 = ip.replace(/^::ffff:/, "");
  if (isIP(v4) !== 4) return false;
  const [a, b] = v4.split(".").map(Number) as [number, number];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function safeUrl(raw: string): Promise<URL | null> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.hostname === "localhost" || u.hostname.endsWith(".local") || u.hostname.endsWith(".internal")) return null;
  try {
    const addrs = await lookup(u.hostname, { all: true });
    if (addrs.some((a) => isPrivate(a.address))) return null;
  } catch {
    return null;
  }
  return u;
}

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
  try {
    let url = target;
    let res: Response | null = null;
    // Follow redirects manually so every hop is re-checked against private addresses.
    for (let hop = 0; hop < 5; hop++) {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(12000),
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "none",
          "sec-fetch-user": "?1",
          "upgrade-insecure-requests": "1",
        },
      });
      const loc = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!loc) break;
      const next = await safeUrl(new URL(loc, url).toString());
      if (!next) return fallback("That listing redirected somewhere we can't open.", 400);
      url = next;
    }
    if (!res || !res.ok) {
      return fallback(res?.status === 403 || res?.status === 429 ? "That site blocks automatic downloads." : `The site answered ${res?.status ?? "nothing"}.`, 502);
    }
    const reader = res.body?.getReader();
    let html = "";
    if (reader) {
      const dec = new TextDecoder();
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        html += dec.decode(value, { stream: true });
        if (size > MAX_BYTES) {
          await reader.cancel();
          break;
        }
      }
    }
    const info = mergeListing(parseListingHtml(html, url.toString()), fromUrl);
    const empty = !info.images.length && !info.address && info.rent == null;
    if (empty) return fallback("We couldn't read that page.", 502);
    return Response.json({ ...info, url: raw });
  } catch {
    return fallback("Couldn't reach that link.", 502);
  }
}
