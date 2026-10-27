import type { Book, BookSale, Move } from './types';

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------
// USPS Media Mail
// ---------------------------------------------------------------------------

/** USPS Notice 123 — Media Mail single-piece price by "weight not over" (lbs 1–70). Retail and commercial are identical. */
export const MEDIA_MAIL_EFFECTIVE = '2026-10-04';
const MEDIA_MAIL: number[] = [
  4.39, 5.13, 5.86, 6.6, 7.34, 8.08, 8.81, 9.55, 10.29, 11.02, 11.76, 12.5, 13.23, 13.97, 14.71, 15.44, 16.18, 16.92, 17.65, 18.39, 19.13, 19.86, 20.6, 21.34, 22.07, 22.81, 23.55, 24.29, 25.02,
  25.76, 26.5, 27.23, 27.97, 28.71, 29.44, 30.18, 30.92, 31.65, 32.39, 33.13, 33.86, 34.6, 35.34, 36.07, 36.81, 37.55, 38.28, 39.02, 39.76, 40.49, 41.23, 41.97, 42.71, 43.44, 44.18, 44.92, 45.65,
  46.39, 47.13, 47.86, 48.6, 49.34, 50.07, 50.81, 51.55, 52.28, 53.02, 53.76, 54.49, 55.23,
];
export const MEDIA_MAIL_MAX_LBS = 70;

/** Pounds USPS bills for: any fraction rounds up to the next whole pound (min 1). */
export function billedPounds(weightOz: number): number {
  return Math.max(1, Math.ceil(Math.max(0, weightOz) / 16 - 1e-9));
}

/** Media Mail postage for a package, or null when over the 70 lb limit. */
export function mediaMailRate(weightOz: number): number | null {
  const lbs = billedPounds(weightOz);
  return lbs > MEDIA_MAIL_MAX_LBS ? null : MEDIA_MAIL[lbs - 1];
}

/** Shipping a PangoBooks buyer pays at checkout (Pango supplies a prepaid Media Mail label). */
export function pangoShipping(weightOz: number): number {
  const lbs = Math.max(0, weightOz) / 16;
  const tiers: [number, number][] = [[1, 3.99], [2, 5.69], [3, 5.99], [4, 6.99], [5, 7.99], [7, 8.99], [8, 9.99], [9, 10.99], [10, 11.99]];
  for (const [max, price] of tiers) if (lbs <= max) return price;
  return round2(11.99 + Math.ceil(lbs - 10) * 0.75);
}

// ---------------------------------------------------------------------------
// Book physical estimates
// ---------------------------------------------------------------------------

export type BookFormat = 'hardcover' | 'paperback' | 'mass_market' | 'board' | 'spiral' | 'box_set' | 'other';

const HEAVY_GENRES = new Set(['textbook', 'art', 'cooking']);

/** Best-guess weight in ounces when the book hasn't been weighed. */
export function estimateBookWeightOz(book: Pick<Book, 'pages' | 'genre'> & { format?: string | null; weight_oz?: number | null }): number {
  if (book.weight_oz && book.weight_oz > 0) return book.weight_oz;
  const pages = book.pages && book.pages > 0 ? book.pages : 320;
  const heavy = HEAVY_GENRES.has(book.genre) ? 1.45 : 1;
  switch (book.format) {
    case 'hardcover':
      return round1((6 + pages * 0.045) * heavy);
    case 'mass_market':
      return round1(2 + pages * 0.018);
    case 'board':
      return 9;
    case 'spiral':
      return round1((4 + pages * 0.04) * heavy);
    case 'box_set':
      return round1(Math.max(48, pages * 0.035));
    default:
      return round1((3 + pages * 0.032) * heavy);
  }
}

/** Approximate closed-book dimensions in inches: [length, width, thickness]. */
export function estimateBookDims(book: Pick<Book, 'pages' | 'genre'> & { format?: string | null }): [number, number, number] {
  const pages = book.pages && book.pages > 0 ? book.pages : 320;
  const big = HEAVY_GENRES.has(book.genre);
  switch (book.format) {
    case 'hardcover':
      return big ? [11, 8.5, round1(0.5 + pages * 0.0035)] : [9.5, 6.5, round1(0.45 + pages * 0.0033)];
    case 'mass_market':
      return [7, 4.25, round1(0.15 + pages * 0.0028)];
    case 'board':
      return [7, 7, 0.75];
    case 'spiral':
      return [10, 8, round1(0.5 + pages * 0.003)];
    case 'box_set':
      return [9, 6.5, 5];
    default:
      return big ? [10, 8, round1(0.2 + pages * 0.0028)] : [8.5, 5.5, round1(0.1 + pages * 0.0026)];
  }
}

// ---------------------------------------------------------------------------
// Used-book market pricing
// ---------------------------------------------------------------------------

const CONDITION_FACTOR: Record<string, number> = { new: 1, like_new: 0.92, very_good: 0.82, good: 0.7, acceptable: 0.5, poor: 0.25 };
const FORMAT_BASE: Record<string, number> = { hardcover: 10, paperback: 7, mass_market: 3.5, board: 4.5, spiral: 6, box_set: 22, other: 6 };
const GENRE_FACTOR: Record<string, number> = {
  textbook: 2.2,
  art: 1.6,
  cooking: 1.3,
  comics: 1.35,
  history: 1.1,
  science: 1.15,
  business: 1.1,
  religion: 0.95,
  children: 0.8,
  romance: 0.8,
  young_adult: 0.9,
  mystery: 0.85,
};

export interface PriceEstimate {
  low: number;
  mid: number;
  high: number;
  basis: string[];
}

export function publishedYear(published: string | null | undefined): number | null {
  const m = /(1[5-9]\d\d|20\d\d)/.exec(published ?? '');
  return m ? Number(m[1]) : null;
}

/**
 * Heuristic used-book market price. Anchors on the original list price when known (used copies typically sell for
 * 20–55% of cover depending on age) or on typical sold prices by format, then adjusts for genre, age and condition.
 */
export function estimateBookPrice(
  book: Pick<Book, 'genre' | 'pages' | 'published' | 'condition'> & { format?: string | null; list_price?: number | null },
  today = new Date(),
): PriceEstimate {
  const basis: string[] = [];
  const year = publishedYear(book.published);
  const age = year ? Math.max(0, today.getFullYear() - year) : null;
  const format = book.format || 'paperback';
  const textbook = book.genre === 'textbook';
  let base: number;
  if (book.list_price && book.list_price > 0) {
    const a = age ?? 8;
    let keep = a <= 1 ? 0.55 : a <= 3 ? 0.45 : a <= 7 ? 0.35 : a <= 15 ? 0.28 : 0.22;
    if (textbook) keep = a <= 3 ? 0.5 : a <= 6 ? 0.25 : 0.12;
    base = book.list_price * keep;
    basis.push(`${Math.round(keep * 100)}% of $${book.list_price.toFixed(2)} cover price${age !== null ? ` (${age} yr old)` : ''}`);
  } else {
    base = FORMAT_BASE[format] ?? FORMAT_BASE.other;
    basis.push(`Typical sold price for a used ${format.replace('_', ' ')} ≈ $${base.toFixed(2)}`);
    const g = GENRE_FACTOR[book.genre] ?? 1;
    if (textbook && age !== null && age > 6) {
      base *= 0.6;
      basis.push('Older textbook edition — newer editions cut demand');
    } else if (g !== 1) {
      base *= g;
      basis.push(`${g > 1 ? 'In-demand' : 'Plentiful'} genre ×${g}`);
    }
    if (age !== null) {
      const af = age <= 1 ? 1.3 : age <= 3 ? 1.12 : age <= 12 ? 1 : age <= 40 ? 0.85 : 0.95;
      if (af !== 1) {
        base *= af;
        basis.push(age <= 3 ? `Recent release (${year}) ×${af}` : `Published ${year} ×${af}`);
      }
    }
    if ((book.pages ?? 0) > 600) {
      base *= 1.1;
      basis.push('Long book (600+ pages) ×1.1');
    }
  }
  const cf = CONDITION_FACTOR[book.condition] ?? 0.7;
  base *= cf;
  basis.push(`Condition “${book.condition.replace('_', ' ')}” ×${cf}`);
  const mid = Math.max(2, roundHalf(base));
  return { low: Math.max(1, roundHalf(mid * 0.7)), mid, high: roundHalf(mid * 1.4), basis };
}

// ---------------------------------------------------------------------------
// Selling channels
// ---------------------------------------------------------------------------

export type ChannelId = 'pango' | 'half_price_books' | 'ebay' | 'amazon' | 'facebook' | 'bookscouter' | 'local' | 'other';

export interface SellChannel {
  id: ChannelId;
  label: string;
  emoji: string;
  /** Who handles postage: you buy Media Mail, the platform provides a prepaid label, or nothing ships. */
  shipping: 'seller' | 'prepaid' | 'none';
  summary: string;
  tips: string[];
  searchUrl: (isbn: string) => string;
  sellUrl: string;
}

export const SELL_CHANNELS: SellChannel[] = [
  {
    id: 'pango',
    label: 'PangoBooks',
    emoji: '🐼',
    shipping: 'prepaid',
    summary: 'Free to list. 20% fee (min $0.40) when it sells. Buyer pays Media Mail shipping and Pango emails you a prepaid label.',
    tips: ['Scan the ISBN in the Pango app — weight auto-fills; round up if unsure', 'Bundle a series into one listing to move slower titles', 'Funds release 72 hours after delivery'],
    searchUrl: (isbn) => `https://www.pangobooks.com/search?q=${isbn}`,
    sellUrl: 'https://www.pangobooks.com/sell-books',
  },
  {
    id: 'half_price_books',
    label: 'Half Price Books',
    emoji: '📕',
    shipping: 'none',
    summary: 'Walk-in buy counter: cash on the spot for the whole stack, no fees or shipping. Offers are low (often $0.25–$3 a book) but it clears shelves fast.',
    tips: ['Bring everything at once — they make one offer for the lot', 'Pull out valuable titles first and list those online', 'Unaccepted books can go straight to donation'],
    searchUrl: (isbn) => `https://www.hpb.com/search?q=${isbn}`,
    sellUrl: 'https://www.hpb.com/sell-to-hpb',
  },
  {
    id: 'ebay',
    label: 'eBay',
    emoji: '🛒',
    shipping: 'seller',
    summary: '≈15.3% final value fee + $0.40 per order (books category). You charge shipping and print a discounted Media Mail label in eBay.',
    tips: ['Price from “Sold” listings, not active ones', 'Offer combined shipping for multi-book buyers', 'List lots of 5–10 for common paperbacks'],
    searchUrl: (isbn) => `https://www.ebay.com/sch/i.html?_nkw=${isbn}&LH_Sold=1&LH_Complete=1`,
    sellUrl: 'https://www.ebay.com/sl/sell',
  },
  {
    id: 'amazon',
    label: 'Amazon',
    emoji: '📦',
    shipping: 'seller',
    summary: '15% referral + $1.80 media closing fee + $0.99 per item (individual plan). Buyer pays a $3.99 shipping credit; you ship Media Mail.',
    tips: ['Best for textbooks and recent non-fiction', 'Match the condition guidelines strictly to avoid returns'],
    searchUrl: (isbn) => `https://www.amazon.com/s?k=${isbn}`,
    sellUrl: 'https://sellercentral.amazon.com',
  },
  {
    id: 'facebook',
    label: 'Facebook Marketplace',
    emoji: '👥',
    shipping: 'none',
    summary: 'Free for local pickup. Great for lots, kids’ books and cookbooks before a move.',
    tips: ['Photograph spines in a grid and sell by the box', 'Meet in a public place'],
    searchUrl: (isbn) => `https://www.facebook.com/marketplace/search?query=${isbn}`,
    sellUrl: 'https://www.facebook.com/marketplace/create',
  },
  {
    id: 'bookscouter',
    label: 'BookScouter buyback',
    emoji: '🔎',
    shipping: 'prepaid',
    summary: 'Compares 30+ buyback vendors. Instant quotes, free prepaid shipping label — best for textbooks.',
    tips: ['Quotes expire quickly — ship within the vendor window', 'Many vendors need a $10 minimum order'],
    searchUrl: (isbn) => `https://bookscouter.com/book/${isbn}`,
    sellUrl: 'https://bookscouter.com',
  },
  { id: 'local', label: 'Garage sale / local', emoji: '🏷️', shipping: 'none', summary: 'No fees. Price $1–$3 and sell by the bag on moving weekend.', tips: [], searchUrl: () => '', sellUrl: '' },
  { id: 'other', label: 'Other', emoji: '•', shipping: 'seller', summary: 'Any other marketplace.', tips: [], searchUrl: () => '', sellUrl: '' },
];

export function channelById(id: string | null | undefined): SellChannel | undefined {
  return SELL_CHANNELS.find((c) => c.id === id);
}

export interface ChannelQuote {
  channel: ChannelId;
  /** What the buyer pays for the books. */
  price: number;
  /** Shipping the buyer pays on top (to you or to the platform). */
  buyerShipping: number;
  fees: number;
  /** Postage you pay out of pocket. */
  postage: number;
  packaging: number;
  net: number;
  note: string;
}

/**
 * What you'd net selling a batch of books together on one channel.
 * `prices` are the listing prices per book; `weightOz` the packed weight; `packaging` your material cost.
 */
export function quoteChannel(channel: ChannelId, prices: number[], weightOz: number, packaging = 0): ChannelQuote {
  const price = round2(prices.reduce((a, b) => a + b, 0));
  const n = prices.length;
  const postage = mediaMailRate(weightOz) ?? 0;
  const q = (buyerShipping: number, fees: number, paidPostage: number, pack: number, note: string): ChannelQuote => ({
    channel,
    price,
    buyerShipping: round2(buyerShipping),
    fees: round2(fees),
    postage: round2(paidPostage),
    packaging: round2(pack),
    net: round2(price + buyerShipping - fees - paidPostage - pack),
    note,
  });
  switch (channel) {
    case 'pango': {
      const ship = pangoShipping(weightOz);
      return q(ship, Math.max(0.4, price * 0.2), ship, packaging, 'Buyer-paid shipping covers the prepaid label');
    }
    case 'ebay': {
      const ship = postage;
      return q(ship, (price + ship) * 0.153 + 0.4, postage, packaging, 'Shipping charged at cost');
    }
    case 'amazon': {
      const credit = 3.99 * n;
      return q(credit, (price + credit) * 0.15 + 1.8 * n + 0.99 * n, postage, packaging, `$3.99 shipping credit ×${n}`);
    }
    case 'half_price_books': {
      const offer = prices.reduce((a, p) => a + Math.max(0.25, p * 0.12), 0);
      return { ...q(0, 0, 0, 0, 'Rough in-store offer'), price: round2(offer), net: round2(offer) };
    }
    case 'bookscouter': {
      const offer = prices.reduce((a, p) => a + p * 0.3, 0);
      return { ...q(0, 0, 0, 0, 'Typical buyback ≈30% of resale — check live quotes'), price: round2(offer), net: round2(offer) };
    }
    case 'facebook':
    case 'local':
      return q(0, 0, 0, 0, 'Local pickup, no fees');
    default:
      return q(postage, 0, postage, packaging, 'You charge shipping at cost');
  }
}

// ---------------------------------------------------------------------------
// Packaging advice
// ---------------------------------------------------------------------------

export interface PackagingOption {
  id: string;
  kind: 'bubble' | 'book_mailer' | 'box';
  name: string;
  /** Usable inside dimensions in inches (L, W, max thickness/height). */
  inner: [number, number, number];
  weightOz: number;
  cost: number;
}

export const PACKAGING: PackagingOption[] = [
  { id: 'bubble-0', kind: 'bubble', name: '#0 bubble mailer (6×10″)', inner: [9.5, 5.5, 1.25], weightOz: 1, cost: 0.4 },
  { id: 'bubble-2', kind: 'bubble', name: '#2 bubble mailer (8.5×12″)', inner: [11, 7.5, 1.75], weightOz: 1.5, cost: 0.55 },
  { id: 'bubble-4', kind: 'bubble', name: '#4 bubble mailer (9.5×14.5″)', inner: [13.5, 8.5, 2], weightOz: 2, cost: 0.75 },
  { id: 'bubble-5', kind: 'bubble', name: '#5 bubble mailer (10.5×16″)', inner: [15, 9.5, 2.25], weightOz: 2.5, cost: 0.9 },
  { id: 'mailer-s', kind: 'book_mailer', name: 'Rigid book-fold mailer, small (9.5×6.5×1–3.5″)', inner: [9.75, 6.75, 3.5], weightOz: 4, cost: 1.1 },
  { id: 'mailer-m', kind: 'book_mailer', name: 'Rigid book-fold mailer, medium (12.5×9.5×1–4″)', inner: [12.75, 9.75, 4], weightOz: 6, cost: 1.4 },
  { id: 'mailer-l', kind: 'book_mailer', name: 'Rigid book-fold mailer, large (14×11×1–4″)', inner: [14.25, 11.25, 4], weightOz: 8, cost: 1.7 },
  { id: 'box-9x6x4', kind: 'box', name: 'Box 9×6×4″', inner: [9, 6, 4], weightOz: 5, cost: 0.9 },
  { id: 'box-10x8x6', kind: 'box', name: 'Box 10×8×6″', inner: [10, 8, 6], weightOz: 8, cost: 1.1 },
  { id: 'box-12x9x6', kind: 'box', name: 'Box 12×9×6″', inner: [12, 9, 6], weightOz: 10, cost: 1.3 },
  { id: 'box-12x12x8', kind: 'box', name: 'Box 12×12×8″', inner: [12, 12, 8], weightOz: 14, cost: 1.75 },
  { id: 'box-14x10x10', kind: 'box', name: 'Box 14×10×10″', inner: [14, 10, 10], weightOz: 16, cost: 2 },
  { id: 'box-16x12x12', kind: 'box', name: 'Box 16×12×12″ (small moving box)', inner: [16, 12, 12], weightOz: 22, cost: 2.5 },
  { id: 'box-18x18x16', kind: 'box', name: 'Box 18×18×16″ (medium moving box)', inner: [18, 18, 16], weightOz: 32, cost: 3.5 },
];

type PackBook = Pick<Book, 'pages' | 'genre'> & { format?: string | null; weight_oz?: number | null };

export interface PackagingAdvice {
  count: number;
  bookWeightOz: number;
  package: PackagingOption | null;
  /** Packaging + void fill. */
  packagingWeightOz: number;
  totalWeightOz: number;
  billedLbs: number;
  postage: number | null;
  stack: [number, number, number];
  piles: number;
  alternatives: PackagingOption[];
  tips: string[];
  warnings: string[];
}

/** Picks the smallest suitable mailer or box for a set of books shipping together and prices it via Media Mail. */
export function packagingAdvice(books: PackBook[]): PackagingAdvice {
  const count = books.length;
  const dims = books.map((b) => estimateBookDims(b));
  const bookWeightOz = round1(books.reduce((a, b) => a + estimateBookWeightOz(b), 0));
  const L = Math.max(0, ...dims.map((d) => d[0]));
  const W = Math.max(0, ...dims.map((d) => d[1]));
  const T = round1(dims.reduce((a, d) => a + d[2], 0));
  const hardcover = books.some((b) => b.format === 'hardcover' || b.format === 'box_set' || HEAVY_GENRES.has(b.genre));
  const tips: string[] = [];
  const warnings: string[] = [];

  const fits = (p: PackagingOption, piles: number) => {
    const pad = p.kind === 'box' ? 1 : p.kind === 'book_mailer' ? 0.25 : 0.5;
    const footprint = [L + pad, W * piles + pad].sort((a, b) => b - a);
    const inner = [p.inner[0], p.inner[1]].sort((a, b) => b - a);
    return footprint[0] <= inner[0] && footprint[1] <= inner[1] && T / piles + (p.kind === 'box' ? 1 : 0) <= p.inner[2];
  };

  const allowed = PACKAGING.filter((p) => {
    if (count === 0) return false;
    if (p.kind === 'bubble') return !hardcover && count <= 2 && T <= 1.75;
    if (p.kind === 'book_mailer') return count <= 4;
    return true;
  });
  let pick: PackagingOption | null = null;
  let piles = 1;
  for (const p of allowed) {
    if (fits(p, 1)) {
      pick = p;
      break;
    }
  }
  if (!pick) {
    for (const n of [2, 3, 4]) {
      pick = allowed.find((p) => p.kind === 'box' && fits(p, n)) ?? null;
      if (pick) {
        piles = n;
        break;
      }
    }
  }
  const fillOz = pick?.kind === 'box' ? Math.min(8, 1.5 * count) : 0;
  const packagingWeightOz = round1((pick?.weightOz ?? 0) + fillOz);
  const totalWeightOz = round1(bookWeightOz + packagingWeightOz);
  const billedLbs = billedPounds(totalWeightOz);
  const postage = mediaMailRate(totalWeightOz);
  const alternatives = pick ? allowed.filter((p) => p.id !== pick!.id && p.kind !== pick!.kind && fits(p, 1)).slice(0, 2) : [];

  if (count === 0) return { count, bookWeightOz, package: null, packagingWeightOz: 0, totalWeightOz: 0, billedLbs: 0, postage: null, stack: [0, 0, 0], piles: 1, alternatives: [], tips, warnings };

  if (pick?.kind === 'bubble') {
    tips.push('Slip the book into a plastic sleeve or zip bag first — bubble mailers aren’t waterproof');
    tips.push('Fold excess mailer flap over and tape so the book can’t slide around');
  } else if (pick?.kind === 'book_mailer') {
    tips.push('Rigid book-fold mailers protect corners and spines on hardcovers — wrap each book in plastic first');
    if (count > 1) tips.push('Stack books spine-to-spine alternating so the pile is level');
  } else if (pick?.kind === 'box') {
    tips.push('Bag or wrap each book, then lay them flat — never on their spines or fore-edges');
    tips.push(piles > 1 ? `Make ${piles} side-by-side piles, largest books on the bottom` : 'Largest, heaviest books on the bottom');
    tips.push('Fill every gap with crumpled paper or air pillows — books shouldn’t shift when you shake the box');
    tips.push('Tape all seams with 2″ packing tape using the H-pattern');
  }
  tips.push('Write “MEDIA MAIL” near the postage — USPS may open it to verify contents are books/media only');
  if (bookWeightOz % 16 > 13) tips.push(`You’re ${round1(16 - (totalWeightOz % 16))} oz under the next pound — a lighter mailer could save you a pound of postage`);

  if (!pick) warnings.push('Too many books for one parcel — split into two shipments');
  if (postage === null) warnings.push('Over 70 lb — Media Mail limit. Split into multiple boxes');
  if (totalWeightOz > 40 * 16) warnings.push('Over 40 lb — boxes this heavy often get crushed; consider two boxes');
  if (books.some((b) => !b.weight_oz)) warnings.push('Weights are estimated from page count — weigh the packed parcel on a kitchen scale before buying postage and round up');

  return { count, bookWeightOz, package: pick, packagingWeightOz, totalWeightOz, billedLbs, postage, stack: [L, W, T], piles, alternatives, tips, warnings };
}

export const MEDIA_MAIL_RULES = [
  'Books (8+ pages), printed music, sound recordings, DVDs, educational materials only',
  'No advertising (except incidental book announcements) and no personal notes beyond an invoice/packing slip',
  'Max 70 lb; length + girth ≤ 108″',
  'Typically 2–8 business days; USPS may open and inspect the package',
  'USPS Tracking is included free; signature and insurance are optional extras',
];

// ---------------------------------------------------------------------------
// Shipping label + packing slip
// ---------------------------------------------------------------------------

export interface ShipAddress {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}

/** Return address — the new home once the move has happened, otherwise the current one. */
export function returnAddress(move: Move | null | undefined, name: string, today = new Date()): ShipAddress {
  if (!move) return { name, street: '', city: '', state: '', zip: '' };
  const moved = !!move.move_date && new Date(move.move_date + 'T12:00:00') <= today;
  return moved
    ? { name, street: move.to_address, city: move.to_city, state: move.to_state, zip: move.to_zip }
    : { name, street: move.from_address, city: move.from_city, state: move.from_state, zip: move.from_zip };
}

export function saleShipTo(sale: Pick<BookSale, 'buyer_name' | 'ship_address' | 'ship_city' | 'ship_state' | 'ship_zip'>): ShipAddress {
  return { name: sale.buyer_name, street: sale.ship_address, city: sale.ship_city, state: sale.ship_state, zip: sale.ship_zip };
}

function addrHtml(a: ShipAddress) {
  return [a.name, a.street, [a.city, a.state].filter(Boolean).join(', ') + (a.zip ? ` ${a.zip}` : '')]
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<div>${esc(l.toUpperCase())}</div>`)
    .join('');
}

export interface ShippingLabelInput {
  from: ShipAddress;
  to: ShipAddress;
  books: Pick<Book, 'title' | 'authors' | 'isbn'>[];
  weightOz: number;
  orderRef?: string;
  channel?: string;
  tracking?: string;
  packageName?: string;
  price?: number | null;
  shipping?: number | null;
}

/** Printable 4×6″ Media Mail address label plus a packing slip. Postage is bought separately (counter, Click-N-Ship, Pirate Ship or the marketplace). */
export function buildShippingLabelHtml(input: ShippingLabelInput): string {
  const lbs = Math.floor(input.weightOz / 16);
  const oz = Math.ceil(input.weightOz % 16);
  const weight = `${lbs} lb ${oz} oz`;
  const ch = channelById(input.channel ?? '');
  const items = input.books
    .map((b, i) => `<tr><td>${i + 1}</td><td><b>${esc(b.title)}</b><br/><span>${esc(b.authors.join(', '))}</span></td><td>${esc(b.isbn)}</td></tr>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Media Mail label</title><style>
@page { size: 4in 6in; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; background: #e9e7e1; }
.sheet { width: 4in; height: 6in; background: #fff; margin: 12px auto; padding: 0.14in; display: flex; flex-direction: column; page-break-after: always; overflow: hidden; }
.top { display: flex; border: 3px solid #000; }
.cls { flex: 0 0 1.15in; display: grid; place-items: center; font: 900 64px/1 Arial Black, Arial, sans-serif; border-right: 3px solid #000; }
.svc { flex: 1; padding: 6px 8px; display: flex; flex-direction: column; justify-content: center; }
.svc b { font-size: 22px; letter-spacing: .5px; }
.svc small { font-size: 9.5px; }
.bar { background: #000; color: #fff; text-align: center; font-weight: 900; font-size: 15px; letter-spacing: 2px; padding: 5px 0; margin-top: 6px; }
.from { font-size: 10px; line-height: 1.3; padding: 7px 2px 6px; border-bottom: 1px solid #000; }
.from .k { font-weight: 700; font-size: 8.5px; letter-spacing: 1px; }
.to { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 6px 6px 6px 0.35in; font-size: 17px; line-height: 1.3; font-weight: 700; }
.to .k { font-size: 9px; letter-spacing: 1px; margin-bottom: 4px; font-weight: 700; }
.track { border-top: 3px solid #000; border-bottom: 3px solid #000; padding: 6px 4px; text-align: center; font-size: 10px; }
.track .box { height: 0.62in; border: 1.5px dashed #000; margin: 4px 0; display: grid; place-items: center; font-size: 11px; color: #444; }
.meta { display: flex; justify-content: space-between; font-size: 9.5px; padding-top: 5px; }
.slip h1 { font-size: 18px; margin: 0 0 2px; }
.slip p { font-size: 10px; margin: 0 0 8px; }
.slip table { width: 100%; border-collapse: collapse; font-size: 10px; }
.slip td { border-bottom: 1px solid #ccc; padding: 4px 3px; vertical-align: top; }
.slip td span { color: #555; }
.slip .tot { margin-top: auto; font-size: 10px; border-top: 2px solid #000; padding-top: 6px; }
@media print { body { background: #fff; } .sheet { margin: 0; } }
</style></head><body>
<section class="sheet">
  <div class="top"><div class="cls">M</div><div class="svc"><b>USPS MEDIA MAIL®</b><small>Contents: books — may be opened for postal inspection</small><small>Weight: ${esc(weight)}</small></div></div>
  <div class="bar">MEDIA MAIL</div>
  <div class="from"><div class="k">FROM</div>${addrHtml(input.from) || '<div>(add your return address)</div>'}</div>
  <div class="to"><div class="k">SHIP TO</div>${addrHtml(input.to) || '<div>(buyer address)</div>'}</div>
  <div class="track">USPS TRACKING #<div class="box">${input.tracking ? `<b style="font-size:15px;letter-spacing:1px;color:#000">${esc(input.tracking)}</b>` : 'Affix postage / tracking label here'}</div></div>
  <div class="meta"><span>${esc(input.packageName ?? '')}</span><span>${input.orderRef ? `Order ${esc(input.orderRef)}` : ''}${ch ? ` · ${esc(ch.label)}` : ''}</span></div>
</section>
<section class="sheet slip">
  <h1>Packing slip</h1>
  <p>${esc(input.to.name || 'Buyer')}${input.orderRef ? ` · Order ${esc(input.orderRef)}` : ''}${ch ? ` · ${esc(ch.label)}` : ''}</p>
  <table>${items}</table>
  <div class="tot">${input.books.length} book${input.books.length === 1 ? '' : 's'} · ${esc(weight)}${input.price ? ` · Books $${input.price.toFixed(2)}` : ''}${input.shipping ? ` · Shipping $${input.shipping.toFixed(2)}` : ''}<br/>Thank you for your order!</div>
</section>
</body></html>`;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function roundHalf(n: number) {
  return Math.round(n * 2) / 2;
}
