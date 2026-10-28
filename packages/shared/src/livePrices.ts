/**
 * Free "live" prices scraped from public store pages (no API keys).
 * Books: AbeBooks, ThriftBooks, ValoreBooks (by ISBN). Items: Walmart + Bing Shopping (by name).
 * Store prices are *asking* prices, so resale suggestions discount them.
 */

import { isbn10to13 } from './books';

export interface LiveOffer {
  source: string;
  title: string;
  /** "Used", "New", "Very Good", "Acceptable"… */
  condition: string;
  used: boolean;
  price: number;
  seller?: string;
  link: string;
  image?: string;
}

export interface LivePriceSummary {
  count: number;
  usedCount: number;
  newCount: number;
  usedLow: number | null;
  usedMedian: number | null;
  newLow: number | null;
  newMedian: number | null;
  /** Suggested resale value (what it will realistically sell for used). */
  suggested: number | null;
  basis: string;
}

export interface LivePriceResult {
  query: string;
  offers: LiveOffer[];
  summary: LivePriceSummary;
  sources: { name: string; ok: boolean; count: number }[];
  checkedAt: string;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&#183;/g, '·')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));

const money = (raw: unknown): number | null => {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 && n < 100000 ? Math.round(n * 100) / 100 : null;
};

const titleCase = (s: string) => s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function bookLivePriceUrls(isbn: string) {
  return {
    abebooks: `https://www.abebooks.com/servlet/SearchResults?isbn=${isbn}&sortby=17`,
    thriftbooks: `https://www.thriftbooks.com/browse/?b.search=${isbn}`,
    valore: `https://www.valorebooks.com/textbooks/${isbn}`,
  };
}

export function itemLivePriceUrls(query: string) {
  const q = encodeURIComponent(query.trim());
  return {
    walmart: `https://www.walmart.com/search?q=${q}`,
    bing: `https://www.bing.com/shop?q=${q}`,
  };
}

/** AbeBooks search results embed a schema.org ItemList with one Offer per copy for sale. */
export function parseAbeBooks(html: string): LiveOffer[] {
  const out: LiveOffer[] = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let json: unknown;
    try {
      json = JSON.parse(m[1]!);
    } catch {
      continue;
    }
    const list = (json as { itemListElement?: unknown[] })?.itemListElement;
    if (!Array.isArray(list)) continue;
    for (const el of list) {
      const item = (el as { item?: Record<string, unknown> })?.item;
      const offer = item?.offers as Record<string, unknown> | undefined;
      const price = money(offer?.price);
      if (!item || !offer || price == null || (offer.priceCurrency && offer.priceCurrency !== 'USD')) continue;
      const used = !/NewCondition/i.test(String(offer.itemCondition ?? ''));
      const format = String(item.bookFormat ?? '').split('/').pop() ?? '';
      out.push({
        source: 'AbeBooks',
        title: decode(String(item.name ?? '')),
        condition: `${used ? 'Used' : 'New'}${format ? ` · ${titleCase(format)}` : ''}`,
        used,
        price,
        seller: decode(String((offer.seller as { name?: string } | undefined)?.name ?? '')) || undefined,
        link: String(offer.url ?? item.url ?? ''),
        image: typeof item.image === 'string' ? item.image : undefined,
      });
    }
  }
  return out;
}

/** ThriftBooks book pages list a "from" price per condition (Like New, Very Good, Good, Acceptable, New).
 *  Searches can land on a different edition of the same work, so when `isbn13` is given the page must be for that ISBN. */
export function parseThriftBooks(html: string, pageUrl: string, isbn13?: string): LiveOffer[] {
  if (isbn13) {
    const shown = /(?:[#?&]|%23|%26)isbn(?:=|%3D)(\d{9}[\dX]|\d{13})/i.exec(html)?.[1];
    const shown13 = shown ? (shown.length === 10 ? isbn10to13(shown) : shown) : null;
    if (shown13 && shown13 !== isbn13) return [];
  }
  const out: LiveOffer[] = [];
  const title = decode(/<h1[^>]*>([^<]+)<\/h1>/.exec(html)?.[1]?.trim() ?? /<title>([^<|]+)/.exec(html)?.[1]?.trim() ?? '');
  const seen = new Set<string>();
  for (const m of html.matchAll(/WorkSelector-bold[^"]*">(Like New|Very Good|Good|Acceptable|New|Brand New)<\/div><div class="[^"]*"><span>\$([\d,]+\.\d\d)/g)) {
    const cond = m[1]!;
    const price = money(m[2]);
    if (price == null || seen.has(cond)) continue;
    seen.add(cond);
    out.push({ source: 'ThriftBooks', title, condition: cond, used: !/^(New|Brand New)$/.test(cond), price, link: pageUrl });
  }
  return out;
}

/** ValoreBooks lists each offer with data-condition / data-current-price attributes. */
export function parseValoreBooks(html: string, pageUrl: string): LiveOffer[] {
  const out: LiveOffer[] = [];
  const title = decode(/<h1[^>]*>\s*([^<]+?)\s*<\/h1>/.exec(html)?.[1] ?? '');
  for (const m of html.matchAll(/data-condition='([^']+)'[^>]*?data-current-price='\$?([\d,.]+)'/g)) {
    const price = money(m[2]);
    if (price == null) continue;
    const cond = titleCase(m[1]!);
    out.push({ source: 'ValoreBooks', title, condition: cond, used: !/^new$/i.test(m[1]!), price, link: pageUrl });
  }
  return out;
}

/** Walmart search pages ship their results in __NEXT_DATA__. */
export function parseWalmartSearch(html: string): LiveOffer[] {
  const raw = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!raw) return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }
  const stacks = (json as { props?: { pageProps?: { initialData?: { searchResult?: { itemStacks?: { items?: Record<string, unknown>[] }[] } } } } })?.props?.pageProps
    ?.initialData?.searchResult?.itemStacks;
  if (!Array.isArray(stacks)) return [];
  const out: LiveOffer[] = [];
  for (const it of stacks.flatMap((s) => s.items ?? [])) {
    const name = typeof it.name === 'string' ? it.name : '';
    const price = money(it.price ?? (it.priceInfo as { currentPrice?: { price?: number } } | undefined)?.currentPrice?.price);
    if (!name || price == null) continue;
    const condCode = (it.conditionV2 as { code?: number } | undefined)?.code;
    const used = condCode != null && condCode !== 1;
    const url = typeof it.canonicalUrl === 'string' ? it.canonicalUrl : '';
    out.push({
      source: 'Walmart',
      title: decode(name),
      condition: used ? 'Used / restored' : 'New',
      used,
      price,
      seller: typeof it.sellerName === 'string' ? it.sellerName : undefined,
      link: url.startsWith('http') ? url : `https://www.walmart.com${url.split('?')[0]}`,
      image: typeof it.image === 'string' ? it.image : undefined,
    });
  }
  return out;
}

/** Bing Shopping cards: full title in a title attribute, price, store name, link. */
export function parseBingShopping(html: string): LiveOffer[] {
  const out: LiveOffer[] = [];
  const parts = html.split('class="br-offLink"').slice(1);
  for (const part of parts) {
    const card = part.slice(0, 12000);
    const link = decode(/href="([^"]+)"/.exec(card)?.[1] ?? '');
    const title = decode(/class="br-offTtl[^"]*"><span title="([^"]+)"/.exec(card)?.[1] ?? '');
    const price = money(/class="br-price[^"]*">\$([\d,]+\.?\d*)/.exec(card)?.[1]);
    if (!title || price == null || !link) continue;
    const seller = decode(/class="br-offSlrTxt">([^<]+)</.exec(card)?.[1] ?? '');
    const used = /\b(used|pre-owned|refurbished|renewed|open box)\b/i.test(`${title} ${/class="br-offDec[^"]*"[^>]*>([^<]{0,60})/.exec(card)?.[1] ?? ''}`);
    out.push({ source: 'Bing Shopping', title, condition: used ? 'Used / refurbished' : 'New', used, price, seller: seller || undefined, link });
  }
  return out;
}

/** What to search stores for: brand + model when we have a model number, otherwise the item name (with brand). */
export function itemPriceQuery(item: { name?: unknown; brand?: unknown; model?: unknown }): string {
  const name = String(item.name ?? '').trim();
  const brand = String(item.brand ?? '').trim();
  const model = String(item.model ?? '').trim();
  if (brand && model) return `${brand} ${model}`;
  if (brand && !name.toLowerCase().includes(brand.toLowerCase())) return `${brand} ${name}`;
  return name;
}

const STOP = new Set(['the', 'and', 'with', 'for', 'of', 'a', 'an', 'in', 'to', 'by', 'set', 'new', 'used', '-', '&']);
const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));

/** Keeps offers whose title actually matches the item (drops accessories / other products), then trims price outliers. */
export function relevantOffers(query: string, offers: LiveOffer[]): LiveOffer[] {
  const q = tokens(query);
  if (!q.length) return offers;
  const need = Math.max(1, Math.ceil(q.length * 0.6));
  const scored = offers.filter((o) => {
    const t = new Set(tokens(o.title));
    return q.filter((w) => t.has(w)).length >= need;
  });
  if (scored.length < 3) return scored;
  const med = median(scored.map((o) => o.price))!;
  return scored.filter((o) => o.price >= med / 3 && o.price <= med * 3);
}

export function median(nums: number[]): number | null {
  const s = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const half = (n: number) => Math.max(1, Math.round(n * 2) / 2);

/**
 * Books: listed used copies are asking prices from dealers; a private seller realistically gets ~80% of the
 * typical used listing (and never more than the cheapest copy, or buyers just pick that one).
 * Items: we report the typical new price; the resale value comes from the age/condition model.
 */
export function summarizeOffers(offers: LiveOffer[], kind: 'book' | 'item'): LivePriceSummary {
  const used = offers.filter((o) => o.used).map((o) => o.price);
  const fresh = offers.filter((o) => !o.used).map((o) => o.price);
  const usedMedian = median(used);
  const newMedian = median(fresh);
  const usedLow = used.length ? Math.min(...used) : null;
  const newLow = fresh.length ? Math.min(...fresh) : null;
  let suggested: number | null = null;
  let basis = 'No live listings found.';
  if (kind === 'book') {
    if (usedMedian != null) {
      suggested = half(Math.min(usedMedian * 0.8, (usedLow ?? usedMedian) * 1.1));
      basis = `${used.length} used cop${used.length === 1 ? 'y' : 'ies'} listed now (typical $${usedMedian.toFixed(2)}, cheapest $${usedLow!.toFixed(2)}). Asking prices run high, so we suggest ~80% of typical, close to the cheapest copy.`;
    } else if (newMedian != null) {
      suggested = half(newMedian * 0.4);
      basis = `Only new copies listed (typical $${newMedian.toFixed(2)}); used usually sells for ~40% of that.`;
    }
  } else if (newMedian != null) {
    basis = `${offers.length} matching listing${offers.length === 1 ? '' : 's'} at stores right now — typical new price $${newMedian.toFixed(2)}. Used value comes from that new price, its age and condition.`;
  }
  return {
    count: offers.length,
    usedCount: used.length,
    newCount: fresh.length,
    usedLow: usedLow != null ? r2(usedLow) : null,
    usedMedian: usedMedian != null ? r2(usedMedian) : null,
    newLow: newLow != null ? r2(newLow) : null,
    newMedian: newMedian != null ? r2(newMedian) : null,
    suggested,
    basis,
  };
}
