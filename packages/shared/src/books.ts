export interface BookInfo {
  isbn: string;
  title: string;
  subtitle: string;
  authors: string[];
  publisher: string;
  published: string;
  pages: number | null;
  cover_url: string;
  subjects: string[];
  genre: string;
  format?: string;
  weight_oz?: number | null;
  list_price?: number | null;
  source: 'openlibrary' | 'google' | 'isbndb' | 'web' | 'none';
  /** Live merchant offers (ISBNdb Pro plans only). */
  offers?: BookOffer[];
}

/** Maps a free-text binding ("Mass Market Paperback", "Hardback"…) to a BookFormat id. */
export function parseBookFormat(raw: string | null | undefined): string | undefined {
  const s = (raw ?? '').toLowerCase();
  if (!s) return undefined;
  if (/mass[- ]?market/.test(s)) return 'mass_market';
  if (/board/.test(s)) return 'board';
  if (/spiral|ring|comb/.test(s)) return 'spiral';
  if (/box(ed)? ?set|slipcase/.test(s)) return 'box_set';
  if (/hard|cloth|library binding/.test(s)) return 'hardcover';
  if (/paper|soft|trade/.test(s)) return 'paperback';
  return 'other';
}

/** Parses "1.2 pounds", "14 ounces", "540 g" into ounces. */
export function parseWeightOz(raw: string | null | undefined): number | null {
  const m = /([\d.]+)\s*(pounds?|lbs?|ounces?|oz|kg|kilograms?|g|grams?)\b/i.exec(raw ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = m[2].toLowerCase();
  const oz = u.startsWith('p') || u.startsWith('lb') ? n * 16 : u.startsWith('o') ? n : u.startsWith('k') ? n * 35.274 : n / 28.3495;
  return Math.round(oz * 10) / 10;
}

/** Physical details from an Open Library edition record (https://openlibrary.org/isbn/{isbn}.json). */
export function parseOpenLibraryEdition(json: unknown): { format?: string; weight_oz: number | null; pages: number | null } {
  const e = (json ?? {}) as { physical_format?: string; weight?: string; number_of_pages?: number };
  return { format: parseBookFormat(e.physical_format), weight_oz: parseWeightOz(e.weight), pages: e.number_of_pages ?? null };
}

type FetchLike = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export function cleanIsbn(raw: string): string {
  return raw.replace(/[^0-9Xx]/g, '').toUpperCase();
}

export function isValidIsbn10(isbn: string): boolean {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  let total = 0;
  for (let i = 0; i < 10; i++) total += (isbn[i] === 'X' ? 10 : Number(isbn[i])) * (10 - i);
  return total % 11 === 0;
}

export function isValidIsbn13(isbn: string): boolean {
  if (!/^\d{13}$/.test(isbn)) return false;
  let total = 0;
  for (let i = 0; i < 13; i++) total += Number(isbn[i]) * (i % 2 ? 3 : 1);
  return total % 10 === 0;
}

/** Book barcodes are EAN-13 starting with 978/979 ("Bookland"). */
export function isBookBarcode(code: string): boolean {
  const c = cleanIsbn(code);
  return (c.length === 13 && /^97[89]/.test(c) && isValidIsbn13(c)) || (c.length === 10 && isValidIsbn10(c));
}

export function isbn10to13(isbn10: string): string {
  const core = '978' + isbn10.slice(0, 9);
  let total = 0;
  for (let i = 0; i < 12; i++) total += Number(core[i]) * (i % 2 ? 3 : 1);
  return core + ((10 - (total % 10)) % 10);
}

export function normalizeIsbn(raw: string): string | null {
  const c = cleanIsbn(raw);
  if (c.length === 13 && isValidIsbn13(c)) return c;
  if (c.length === 10 && isValidIsbn10(c)) return isbn10to13(c);
  return null;
}

const GENRE_KEYWORDS: [string, RegExp][] = [
  ['children', /juvenile|children|picture book|board book/i],
  ['young_adult', /young adult|teen/i],
  ['comics', /comic|graphic novel|manga/i],
  ['mystery', /mystery|thriller|detective|crime|suspense/i],
  ['scifi_fantasy', /science fiction|fantasy|dystopi|space opera|magic/i],
  ['romance', /romance|love stor/i],
  ['biography', /biograph|memoir|autobiograph/i],
  ['cooking', /cook|recipe|baking|food/i],
  ['history', /history|historical|war\b|civil war/i],
  ['science', /science|physics|biology|chemistry|nature|mathemat|astronom/i],
  ['business', /business|economics|finance|management|investing|marketing/i],
  ['self_help', /self-help|self help|personal development|psychology|motivation/i],
  ['religion', /religio|christian|bible|spiritual|islam|buddh|judais/i],
  ['art', /\bart\b|photograph|design|architecture|painting/i],
  ['travel', /travel|guidebook/i],
  ['poetry', /poetry|poems/i],
  ['textbook', /textbook|study guide|reference|dictionar|encyclop/i],
  ['fiction', /fiction|novel|literature/i],
];

export function guessGenre(subjects: string[], title = ''): string {
  const hay = subjects.join(' | ') + ' | ' + title;
  for (const [genre, re] of GENRE_KEYWORDS) if (re.test(hay)) return genre;
  return subjects.length ? 'nonfiction' : 'other';
}

interface OpenLibraryBook {
  title?: string;
  subtitle?: string;
  authors?: { name: string }[];
  publishers?: { name: string }[];
  publish_date?: string;
  number_of_pages?: number;
  cover?: { large?: string; medium?: string };
  subjects?: { name: string }[];
}

interface GoogleVolumes {
  items?: {
    volumeInfo: {
      title?: string;
      subtitle?: string;
      authors?: string[];
      publisher?: string;
      publishedDate?: string;
      pageCount?: number;
      categories?: string[];
      imageLinks?: { thumbnail?: string; smallThumbnail?: string };
      printType?: string;
    };
    saleInfo?: { listPrice?: { amount?: number; currencyCode?: string }; retailPrice?: { amount?: number; currencyCode?: string } };
  }[];
}

export function parseOpenLibrary(isbn: string, json: unknown): BookInfo | null {
  const b = (json as Record<string, OpenLibraryBook>)[`ISBN:${isbn}`];
  if (!b?.title) return null;
  const subjects = (b.subjects ?? []).map((s) => s.name).slice(0, 8);
  return {
    isbn,
    title: b.title,
    subtitle: b.subtitle ?? '',
    authors: (b.authors ?? []).map((a) => a.name),
    publisher: b.publishers?.[0]?.name ?? '',
    published: b.publish_date ?? '',
    pages: b.number_of_pages ?? null,
    cover_url: b.cover?.medium ?? b.cover?.large ?? '',
    subjects,
    genre: guessGenre(subjects, b.title),
    source: 'openlibrary',
  };
}

export function parseGoogleBooks(isbn: string, json: unknown): BookInfo | null {
  const item = (json as GoogleVolumes).items?.[0];
  const v = item?.volumeInfo;
  if (!v?.title) return null;
  const lp = item?.saleInfo?.listPrice;
  const subjects = v.categories ?? [];
  return {
    isbn,
    title: v.title,
    subtitle: v.subtitle ?? '',
    authors: v.authors ?? [],
    publisher: v.publisher ?? '',
    published: v.publishedDate ?? '',
    pages: v.pageCount ?? null,
    cover_url: (v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail ?? '').replace(/^http:/, 'https:'),
    subjects,
    genre: guessGenre(subjects, v.title),
    list_price: lp?.currencyCode === 'USD' && lp.amount ? lp.amount : null,
    source: 'google',
  };
}

export interface BookOffer {
  merchant: string;
  condition: string;
  total: number | null;
  link: string;
}

/** Publication dates come as "2017", "May 3, 2017", "2017-05-03"… — keep just the 4-digit year. */
export function yearOnly(published: string | null | undefined): string {
  const m = /(1[5-9]\d\d|20\d\d)/.exec(published ?? '');
  return m ? m[1]! : (published ?? '').trim();
}

const toNum = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function isbndbWeightOz(dims: unknown, text?: string): number | null {
  const w = (dims && typeof dims === 'object' && !Array.isArray(dims) ? (dims as Record<string, unknown>).weight : null) as
    | { unit?: string; value?: number | string }
    | null
    | undefined;
  if (w && w.value != null) {
    const viaUnit = parseWeightOz(`${w.value} ${w.unit ?? 'pounds'}`);
    if (viaUnit) return viaUnit;
  }
  return parseWeightOz(/weight:\s*([^,]+)/i.exec(text ?? '')?.[1]);
}

/** Parses an ISBNdb `GET /book/{isbn}` response (https://api2.isbndb.com). */
export function parseIsbndb(json: unknown): BookInfo | null {
  const b = (json as { book?: Record<string, unknown> } | null)?.book;
  const title = typeof b?.title === 'string' ? b.title : '';
  if (!b || !title) return null;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const subjects = Array.isArray(b.subjects) ? (b.subjects as unknown[]).map(String).slice(0, 8) : [];
  const lp = b.list_price as { amount?: number; currency?: string } | null | undefined;
  const offers = Array.isArray(b.prices)
    ? (b.prices as Record<string, unknown>[]).map((p) => ({ merchant: str(p.merchant), condition: str(p.condition), total: toNum(p.total ?? p.price), link: str(p.link) }))
    : undefined;
  const cover = str(b.image);
  return {
    isbn: str(b.isbn13) || str(b.isbn),
    title,
    subtitle: '',
    authors: Array.isArray(b.authors) ? (b.authors as unknown[]).map(String) : [],
    publisher: str(b.publisher),
    published: yearOnly(str(b.date_published)),
    pages: toNum(b.pages),
    cover_url: /placeholder/i.test(cover) ? '' : cover,
    subjects,
    genre: guessGenre(subjects, title),
    format: parseBookFormat(str(b.binding)),
    weight_oz: isbndbWeightOz(b.dimensions_structured, str(b.dimensions)),
    list_price: lp?.amount && (!lp.currency || lp.currency === 'USD') ? lp.amount : toNum(b.msrp),
    offers: offers?.filter((o) => o.link),
    source: 'isbndb',
  };
}

/** Fills blanks in `a` with values from the other sources, in order. */
export function mergeBookInfo(a: BookInfo, ...more: (BookInfo | null | undefined)[]): BookInfo {
  const out = { ...a };
  for (const b of more) {
    if (!b) continue;
    for (const k of Object.keys(b) as (keyof BookInfo)[]) {
      const cur = out[k];
      const empty = cur == null || cur === '' || (Array.isArray(cur) && cur.length === 0) || (k === 'genre' && cur === 'Other');
      if (empty && b[k] != null && b[k] !== '') (out as Record<string, unknown>)[k] = b[k];
    }
  }
  return out;
}

/**
 * Looks up a book by ISBN using Open Library and Google Books (plus an optional extra source such as ISBNdb),
 * merging whatever each one knows. Never throws.
 */
export async function lookupBook(
  rawIsbn: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  extra?: (isbn: string) => Promise<BookInfo | null>,
): Promise<BookInfo | null> {
  const isbn = normalizeIsbn(rawIsbn);
  if (!isbn) return null;
  const get = async (url: string) => {
    try {
      const res = await fetchImpl(url);
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  };
  const [data, edition, google, more] = await Promise.all([
    get(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`),
    get(`https://openlibrary.org/isbn/${isbn}.json`),
    get(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`),
    extra ? extra(isbn).catch(() => null) : Promise.resolve(null),
  ]);
  const ol = data ? parseOpenLibrary(isbn, data) : null;
  const gb = google ? parseGoogleBooks(isbn, google) : null;
  const first = ol ?? more ?? gb;
  if (!first) return null;
  const phys = edition ? parseOpenLibraryEdition(edition) : { weight_oz: null, pages: null };
  const merged = mergeBookInfo(first, more, gb);
  return {
    ...merged,
    isbn,
    published: yearOnly(merged.published),
    pages: merged.pages ?? phys.pages ?? null,
    format: phys.format ?? merged.format,
    weight_oz: phys.weight_oz ?? merged.weight_oz ?? null,
    list_price: merged.list_price ?? null,
  };
}

/** Sites that look a book up by ISBN (details, editions, covers). */
export function bookLookupLinks(isbn: string): { label: string; url: string }[] {
  return [
    { label: 'ISBNdb', url: `https://isbndb.com/book/${isbn}` },
    { label: 'ISBNsearch', url: `https://isbnsearch.org/isbn/${isbn}` },
    { label: 'Open Library', url: `https://openlibrary.org/isbn/${isbn}` },
    { label: 'Google Books', url: `https://www.google.com/search?tbm=bks&q=isbn:${isbn}` },
  ];
}

/** Links for checking real-world resale prices of a book. */
export function bookPriceLinks(isbn: string): { label: string; url: string }[] {
  return [
    { label: 'BookScouter (buyback offers)', url: `https://bookscouter.com/book/${isbn}` },
    { label: 'DirectTextbook (compare prices)', url: `https://www.directtextbook.com/isbn/${isbn}` },
    { label: 'eBay sold listings', url: `https://www.ebay.com/sch/i.html?_nkw=${isbn}&LH_Sold=1&LH_Complete=1` },
    { label: 'Amazon', url: `https://www.amazon.com/s?k=${isbn}` },
    { label: 'AbeBooks', url: `https://www.abebooks.com/servlet/SearchResults?isbn=${isbn}` },
    { label: 'ISBNsearch', url: `https://isbnsearch.org/isbn/${isbn}` },
  ];
}
