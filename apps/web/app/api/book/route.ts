import {
  bookCoverCandidates,
  bookLivePriceUrls,
  mergeBookInfo,
  normalizeIsbn,
  parseAbeBooksBook,
  parseGoogleBooks,
  thriftBooksCover,
  yearOnly,
  type BookInfo,
} from "@moving/shared";
import { fetchImage, fetchPage } from "@/lib/serverFetch";

/** Real covers are several KB; "no cover" placeholders (Amazon's 1×1 gif, etc.) are tiny. */
async function realCover(url: string): Promise<boolean> {
  const img = await fetchImage(new URL(url));
  return !!img && img.body.byteLength > 1500;
}

async function google(isbn: string): Promise<BookInfo | null> {
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`, { signal: AbortSignal.timeout(8000) });
    return res.ok ? parseGoogleBooks(isbn, await res.json()) : null;
  } catch {
    return null;
  }
}

/** GET /api/book?isbn=… → extra book details plus a verified cover, gathered from free store pages. */
export async function GET(request: Request) {
  const isbn = normalizeIsbn(new URL(request.url).searchParams.get("isbn") ?? "");
  if (!isbn) return Response.json({ error: "Send a valid ISBN." }, { status: 400 });

  const urls = bookLivePriceUrls(isbn);
  const candidates = bookCoverCandidates(isbn);
  const [abe, thrift, gb, ...checks] = await Promise.all([
    fetchPage(new URL(urls.abebooks), 12000),
    fetchPage(new URL(urls.thriftbooks), 12000),
    google(isbn),
    ...candidates.map((c) => realCover(c.url)),
  ]);

  const fromAbe = abe.ok ? parseAbeBooksBook(abe.html, isbn) : null;
  const covers = candidates.filter((_, i) => checks[i]).map((c) => c.url);
  const tb = thrift.ok ? thriftBooksCover(thrift.html, isbn) : null;
  if (tb) covers.push(tb);
  if (gb?.cover_url) covers.push(gb.cover_url);

  const base = fromAbe ?? gb;
  const info: BookInfo | null = base ? { ...mergeBookInfo(base, gb), isbn, cover_url: covers[0] ?? "" } : null;
  if (info) info.published = yearOnly(info.published);

  return Response.json({ info, covers }, { headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
}
