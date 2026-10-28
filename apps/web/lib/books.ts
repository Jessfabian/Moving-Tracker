"use client";

import { lookupBook as lookupShared, type BookInfo } from "@moving/shared";

/** Checks Open Library and Google Books together and merges what they know. */
export const lookupBook = (isbn: string) => lookupShared(isbn);

/** Book fields safe to save on a book record (drops lookup-only extras). */
export function bookPatch(info: BookInfo): Partial<BookInfo> {
  const { source: _s, offers: _o, ...rest } = info;
  return rest;
}
