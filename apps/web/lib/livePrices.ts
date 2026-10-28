"use client";

import type { LivePriceResult } from "@moving/shared";

const TTL_MS = 12 * 60 * 60 * 1000;
const cacheKey = (k: string) => `mt:live:${k.toLowerCase()}`;

export const livePriceKey = (p: { isbn?: string; query?: string }) => (p.isbn ? `isbn:${p.isbn}` : `q:${(p.query ?? "").trim()}`);

export function cachedLivePrices(key: string): LivePriceResult | null {
  try {
    const raw = localStorage.getItem(cacheKey(key));
    if (!raw) return null;
    const r = JSON.parse(raw) as LivePriceResult;
    return Date.now() - new Date(r.checkedAt).getTime() < TTL_MS ? r : null;
  } catch {
    return null;
  }
}

/** Live store listings for a book (ISBN) or item (name), remembered on this device for 12 hours. */
export async function fetchLivePrices(p: { isbn?: string; query?: string }, force = false): Promise<LivePriceResult> {
  const key = livePriceKey(p);
  if (!force) {
    const hit = cachedLivePrices(key);
    if (hit) return hit;
  }
  const qs = p.isbn ? `isbn=${encodeURIComponent(p.isbn)}` : `q=${encodeURIComponent((p.query ?? "").trim())}`;
  const res = await fetch(`/api/prices?${qs}`);
  const body = (await res.json().catch(() => null)) as (LivePriceResult & { error?: string }) | null;
  if (!res.ok || !body || body.error) throw new Error(body?.error || "Couldn’t reach the stores — try again in a minute.");
  try {
    localStorage.setItem(cacheKey(key), JSON.stringify(body));
  } catch {
    /* storage full — fine, just don't cache */
  }
  return body;
}
