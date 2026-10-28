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

/** Parses a public http(s) URL, refusing anything that resolves to a private / local address (SSRF guard). */
export async function safeUrl(raw: string): Promise<URL | null> {
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

const BROWSER_HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
};

export type PageResult = { ok: true; html: string; url: URL } | { ok: false; status: number; reason: "blocked" | "redirect" | "status" | "network" };

/** Fetches a public web page like a browser would, re-checking every redirect hop. */
export async function fetchPage(target: URL, timeoutMs = 12000): Promise<PageResult> {
  try {
    let url = target;
    let res: Response | null = null;
    for (let hop = 0; hop < 5; hop++) {
      res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers: BROWSER_HEADERS });
      const loc = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!loc) break;
      const next = await safeUrl(new URL(loc, url).toString());
      if (!next) return { ok: false, status: 400, reason: "redirect" };
      url = next;
    }
    if (!res || !res.ok) return { ok: false, status: res?.status ?? 0, reason: res?.status === 403 || res?.status === 429 || res?.status === 503 ? "blocked" : "status" };
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
    return { ok: true, html, url };
  } catch {
    return { ok: false, status: 0, reason: "network" };
  }
}

const MAX_IMAGE_BYTES = 12_000_000;

/** Downloads one image (≤12 MB), re-checking redirects. Returns null for non-images. */
export async function fetchImage(target: URL): Promise<{ body: ArrayBuffer; type: string } | null> {
  try {
    let url = target;
    let res: Response | null = null;
    for (let hop = 0; hop < 5; hop++) {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
        headers: { "user-agent": BROWSER_HEADERS["user-agent"], accept: "image/avif,image/webp,image/*,*/*;q=0.8", referer: `${target.origin}/` },
      });
      const loc = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!loc) break;
      const next = await safeUrl(new URL(loc, url).toString());
      if (!next) return null;
      url = next;
    }
    if (!res?.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
    if (!type.startsWith("image/") || type.includes("svg")) return null;
    if (Number(res.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) return null;
    const body = await res.arrayBuffer();
    return body.byteLength > MAX_IMAGE_BYTES ? null : { body, type };
  } catch {
    return null;
  }
}
