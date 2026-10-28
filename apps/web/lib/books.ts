"use client";

import { lookupBook as lookupShared, type BookInfo } from "@moving/shared";

export const ISBNDB_KEY_STORAGE = "mt:ui:isbndb-key";

const savedKey = (): string => {
  try {
    const raw = localStorage.getItem(ISBNDB_KEY_STORAGE);
    return raw ? String(JSON.parse(raw) ?? "") : "";
  } catch {
    return "";
  }
};

/** ISBNdb via our server route; quietly returns null when no key is set up or the book isn't there. */
export async function isbndbLookup(isbn: string, opts: { prices?: boolean } = {}): Promise<BookInfo | null> {
  const key = savedKey();
  const res = await fetch(`/api/isbndb?isbn=${encodeURIComponent(isbn)}${opts.prices ? "&prices=1" : ""}`, {
    headers: key ? { "x-isbndb-key": key } : undefined,
  }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json().catch(() => null)) as BookInfo | null;
}

/** Checks Open Library, Google Books and ISBNdb together and merges what they know. */
export const lookupBook = (isbn: string) => lookupShared(isbn, undefined, (i) => isbndbLookup(i));

/** Book fields safe to save on a book record (drops lookup-only extras). */
export function bookPatch(info: BookInfo): Partial<BookInfo> {
  const { source: _s, offers: _o, ...rest } = info;
  return rest;
}
