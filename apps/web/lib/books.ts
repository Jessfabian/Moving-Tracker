"use client";

import { lookupBook as lookupShared, type BookInfo } from "@moving/shared";

/** Extra details + a verified cover from AbeBooks, ThriftBooks, Amazon, Open Library and Google (via our server). */
export async function lookupBookWeb(isbn: string): Promise<{ info: BookInfo | null; covers: string[] }> {
  try {
    const res = await fetch(`/api/book?isbn=${encodeURIComponent(isbn)}`);
    if (!res.ok) return { info: null, covers: [] };
    return (await res.json()) as { info: BookInfo | null; covers: string[] };
  } catch {
    return { info: null, covers: [] };
  }
}

/** Checks Open Library and Google Books, then fills gaps (and a missing cover) from the store pages. */
export async function lookupBook(isbn: string): Promise<BookInfo | null> {
  let covers: string[] = [];
  const info = await lookupShared(isbn, undefined, async (i) => {
    const web = await lookupBookWeb(i);
    covers = web.covers;
    return web.info;
  });
  if (info && !info.cover_url && covers[0]) info.cover_url = covers[0];
  return info;
}

/** Book fields safe to save on a book record (drops lookup-only extras and blanks, so a lookup never erases what you have). */
export function bookPatch(info: BookInfo): Partial<BookInfo> {
  const { source: _s, offers: _o, ...rest } = info;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return out as Partial<BookInfo>;
}
