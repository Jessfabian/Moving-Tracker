import type { Item } from './types';

export interface ProductInfo {
  barcode: string;
  name: string;
  brand: string;
  model: string;
  description: string;
  category: string;
  image: string;
  /** Typical new/retail price (median of store offers when available). */
  price: number | null;
  /** Rough used/resale estimate (~40% of retail). */
  resale: number | null;
  source: string;
}

export const resaleEstimate = (retail: number | null) => (retail && retail > 0 ? Math.round(retail * 0.4) : null);

interface UpcItem {
  title?: string;
  brand?: string;
  model?: string;
  description?: string;
  category?: string;
  images?: string[];
  lowest_recorded_price?: number;
  highest_recorded_price?: number;
  offers?: { price?: number }[];
}

/** Picks a representative retail price from a UPCitemdb record. */
export function pickPrice(it: UpcItem): number | null {
  const prices = (it.offers ?? []).map((o) => Number(o.price)).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (prices.length) {
    const mid = Math.floor(prices.length / 2);
    const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
    return Math.round(median * 100) / 100;
  }
  const lo = Number(it.lowest_recorded_price) || 0;
  const hi = Number(it.highest_recorded_price) || 0;
  if (lo && hi) return Math.round(((lo + hi) / 2) * 100) / 100;
  return lo || hi || null;
}

export function parseUpcItem(code: string, it: UpcItem): ProductInfo | null {
  if (!it?.title) return null;
  const price = pickPrice(it);
  const text = `${it.category ?? ''} ${it.title}`;
  const category = guessItemCategory(it.title) !== 'other' ? guessItemCategory(it.title) : mapCategory(text);
  return {
    barcode: code,
    name: it.title.trim(),
    brand: it.brand ?? '',
    model: it.model ?? '',
    description: (it.description ?? '').trim().slice(0, 600),
    category,
    image: (it.images ?? []).find((u) => u.startsWith('https://')) ?? it.images?.[0] ?? '',
    price,
    resale: resaleEstimate(price),
    source: 'UPCitemdb',
  };
}
type FetchLike = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const CATEGORY_MAP: [RegExp, string][] = [
  [/electronic|computer|camera|phone|audio|video|tv/i, 'electronics'],
  [/appliance/i, 'appliances'],
  [/kitchen|cookware|dining|bakeware/i, 'kitchenware'],
  [/furniture/i, 'furniture'],
  [/toy|game/i, 'toys'],
  [/tool|hardware/i, 'tools'],
  [/sport|outdoor|fitness/i, 'sports'],
  [/apparel|cloth|shoe/i, 'clothing'],
  [/bed|bath|linen|towel/i, 'linens'],
  [/media|dvd|blu-ray|music|cd/i, 'media'],
  [/office/i, 'office'],
  [/garden|lawn/i, 'garden'],
  [/health|beauty|personal care/i, 'bath'],
];

export function mapCategory(raw: string): string {
  for (const [re, cat] of CATEGORY_MAP) if (re.test(raw)) return cat;
  return 'other';
}

const ITEM_WORDS: [RegExp, string][] = [
  [/\b(sofa|couch|chair|table|desk|dresser|bed ?frame|bed|mattress|bookcase|bookshelf|shel(f|ves)|cabinet|nightstand|ottoman|recliner|futon|crib|wardrobe|armoire|bench|stool|sideboard|credenza|hutch|headboard)s?\b/i, 'furniture'],
  [/\b(tv|television|monitor|laptop|computer|pc|printer|speaker|soundbar|stereo|console|playstation|xbox|nintendo|router|tablet|ipad|camera|headphones)s?\b/i, 'electronics'],
  [/\b(fridge|refrigerator|freezer|washer|dryer|dishwasher|microwave|oven|stove|range|vacuum|air ?conditioner|dehumidifier|humidifier|fan|heater|blender|toaster|mixer|air fryer|coffee (maker|machine)|kettle)s?\b/i, 'appliances'],
  [/\b(dish(es)?|plates?|bowls?|cups?|mugs?|glass(es|ware)?|pots?|pans?|utensils?|silverware|cutlery|knives|knife|cookware|bakeware|tupperware)\b/i, 'kitchenware'],
  [/\b(clothes|clothing|shirts?|pants|jeans|dress(es)?|coats?|jackets?|shoes|boots|sweaters?|suits?)\b/i, 'clothing'],
  [/\b(sheets?|blankets?|comforters?|duvets?|pillows?|towels?|quilts?|linens?|curtains?)\b/i, 'linens'],
  [/\b(lamps?|rugs?|mirrors?|paintings?|art|prints?|frames?|vases?|clocks?|decor)\b/i, 'decor'],
  [/\b(toys?|games?|puzzles?|lego|dolls?|board games?)\b/i, 'toys'],
  [/\b(drill|saw|hammer|tool ?box|tools?|ladder|wrench|workbench)\b/i, 'tools'],
  [/\b(bikes?|bicycles?|treadmill|weights|dumbbells?|golf|skis?|tent|kayak|camping|yoga)\b/i, 'sports'],
  [/\b(dvds?|blu-?rays?|cds?|vinyl|records?)\b/i, 'media'],
  [/\b(plants?|planters?)\b/i, 'plants'],
  [/\b(mower|grill|bbq|hose|rake|shovel|patio|wheelbarrow|snow ?blower)\b/i, 'garden'],
  [/\b(jewel(ry|lery)|rings?|necklaces?|watch(es)?|bracelets?)\b/i, 'jewelry'],
  [/\b(files?|papers|documents?|safe)\b/i, 'documents'],
];

/** Guesses an inventory category from a free-text item name ("Sofa" → furniture). */
export function guessItemCategory(name: string): string {
  for (const [re, cat] of ITEM_WORDS) if (re.test(name)) return cat;
  return mapCategory(name);
}

/** Looks up a retail UPC/EAN product (UPCitemdb free trial, then Open Food Facts). Never throws. */
export async function lookupProduct(barcode: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<ProductInfo | null> {
  const code = barcode.replace(/\D/g, '');
  if (code.length < 8) return null;
  try {
    const res = await fetchImpl(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`);
    if (res.ok) {
      const json = (await res.json()) as { items?: UpcItem[] };
      const parsed = json.items?.[0] ? parseUpcItem(code, json.items[0]) : null;
      if (parsed) return parsed;
    }
  } catch {
    /* try next source */
  }
  try {
    const res = await fetchImpl(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
    if (res.ok) {
      const json = (await res.json()) as {
        status?: number;
        product?: { product_name?: string; brands?: string; image_url?: string; quantity?: string; generic_name?: string };
      };
      if (json.status === 1 && json.product?.product_name) {
        const p = json.product;
        return {
          barcode: code,
          name: p.product_name ?? '',
          brand: p.brands ?? '',
          model: p.quantity ?? '',
          description: p.generic_name ?? '',
          category: 'kitchenware',
          image: p.image_url ?? '',
          price: null,
          resale: null,
          source: 'Open Food Facts',
        };
      }
    }
  } catch {
    /* offline */
  }
  return null;
}

/** Converts a product lookup into Item fields; only fills blanks unless overwrite is true. */
export function productToItemPatch(
  info: ProductInfo,
  current: Partial<Record<'name' | 'brand' | 'model' | 'description' | 'image_url' | 'category' | 'retail_price' | 'est_value', unknown>> = {},
  overwrite = false,
) {
  const blank = (v: unknown) => overwrite || v === null || v === undefined || v === '' || v === 'other';
  const patch: Partial<Pick<Item, 'barcode' | 'name' | 'brand' | 'model' | 'description' | 'image_url' | 'category' | 'retail_price' | 'est_value'>> = info.barcode ? { barcode: info.barcode } : {};
  if (blank(current.name) && info.name) patch.name = info.name;
  if (blank(current.brand) && info.brand) patch.brand = info.brand;
  if (blank(current.model) && info.model) patch.model = info.model;
  if (blank(current.description) && info.description) patch.description = info.description;
  if (blank(current.image_url) && info.image) patch.image_url = info.image;
  if (blank(current.category) && info.category) patch.category = info.category;
  if (blank(current.retail_price) && info.price != null) patch.retail_price = info.price;
  if (blank(current.est_value) && info.resale != null) patch.est_value = info.resale;
  return patch;
}
export const BOX_QR_PREFIX = 'MOVINGTRACKER:BOX:';
export const boxQrValue = (boxId: string) => `${BOX_QR_PREFIX}${boxId}`;
export function parseBoxQr(value: string): string | null {
  return value.startsWith(BOX_QR_PREFIX) ? value.slice(BOX_QR_PREFIX.length) : null;
}

/* ---- Shopping-page import (Amazon, Target, Walmart, IKEA, Wayfair, Best Buy…) ---- */

const decodeHtml = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();

const toPrice = (v: unknown): number | null => {
  if (typeof v === 'number') return v > 0 ? v : null;
  if (typeof v !== 'string') return null;
  const n = Number(v.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

function metaTags(html: string, names: string[]): string | undefined {
  for (const name of names) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m =
      new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${esc}["'][^>]*content=["']([^"']*)["']`, 'i').exec(html) ??
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${esc}["']`, 'i').exec(html);
    if (m?.[1]?.trim()) return decodeHtml(m[1]);
  }
  return undefined;
}

function findProductLd(node: unknown, depth = 0): Record<string, unknown> | null {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findProductLd(n, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const o = node as Record<string, unknown>;
  const t = o['@type'];
  if ((Array.isArray(t) ? t : [t]).some((x) => typeof x === 'string' && /^(Product|ProductGroup|IndividualProduct)$/i.test(x))) return o;
  return findProductLd(o['@graph'], depth + 1) ?? findProductLd(o.mainEntity, depth + 1);
}

const ldText = (v: unknown): string => (typeof v === 'string' ? decodeHtml(v) : v && typeof v === 'object' && 'name' in v ? ldText((v as { name: unknown }).name) : '');
const ldImage = (v: unknown): string => (typeof v === 'string' ? v : Array.isArray(v) ? ldImage(v[0]) : v && typeof v === 'object' ? ldImage((v as { url?: unknown; contentUrl?: unknown }).url ?? (v as { contentUrl?: unknown }).contentUrl) : '');

function ldPrice(offers: unknown): number | null {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  for (const o of list) {
    if (!o || typeof o !== 'object') continue;
    const r = o as Record<string, unknown>;
    const p = toPrice(r.price) ?? toPrice(r.lowPrice) ?? toPrice((r.priceSpecification as Record<string, unknown> | undefined)?.price) ?? ldPrice(r.offers);
    if (p) return p;
  }
  return null;
}

/** Product name, brand, price, picture and UPC from a store's product page. */
export function parseProductHtml(html: string, pageUrl: string): ProductInfo {
  let ld: Record<string, unknown> | null = null;
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      ld = findProductLd(JSON.parse(m[1]!.trim()));
    } catch {
      /* some sites ship broken JSON-LD */
    }
    if (ld) break;
  }
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const amazonTitle = /id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i.exec(html)?.[1];
  const name = (ldText(ld?.name) || (amazonTitle && decodeHtml(amazonTitle)) || metaTags(html, ['og:title', 'twitter:title']) || (title ? decodeHtml(title) : '') || '')
    .replace(/\s*[|:–-]\s*(Amazon\.com|Target|Walmart\.com|IKEA|Wayfair|Best Buy|Home Depot|Lowe'?s)\b.*$/i, '')
    .replace(/^Amazon\.com\s*:\s*/i, '')
    .slice(0, 160);
  const brand = ldText(ld?.brand) || ldText(ld?.manufacturer) || metaTags(html, ['product:brand', 'og:brand', 'brand']) || '';
  const model = ldText(ld?.model) || ldText(ld?.mpn) || '';
  const gtin = [ld?.gtin13, ld?.gtin12, ld?.gtin, ld?.gtin14, ld?.gtin8].find((g) => typeof g === 'string' && /^\d{8,14}$/.test(g)) as string | undefined;
  const amazonPrice = /class=["']a-offscreen["'][^>]*>\s*\$([\d,]+\.\d{2})/i.exec(html)?.[1];
  const price =
    ldPrice(ld?.offers) ??
    toPrice(metaTags(html, ['product:price:amount', 'og:price:amount', 'price', 'twitter:data1'])) ??
    toPrice(amazonPrice) ??
    toPrice(/"(?:currentPrice|salePrice|price)"\s*:\s*\{?\s*"?(?:price"?\s*:\s*)?"?(\d{1,6}(?:\.\d{2})?)"?/i.exec(html)?.[1]);
  let image = ldImage(ld?.image) || metaTags(html, ['og:image', 'og:image:secure_url', 'twitter:image']) || /id=["']landingImage["'][^>]*src=["']([^"']+)["']/i.exec(html)?.[1] || '';
  try {
    if (image) image = new URL(image, pageUrl).toString();
  } catch {
    image = '';
  }
  const description = (ldText(ld?.description) || metaTags(html, ['og:description', 'description']) || '').slice(0, 500);
  const category = name ? guessItemCategory(name) : 'other';
  return { barcode: gtin ?? '', name, brand, model, description, category, image, price, resale: resaleEstimate(price), source: hostLabel(pageUrl) };
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'link';
  }
}

/** Best guess from the link alone when the store blocks us (Amazon/Walmart/Target slugs carry the product name). */
export function productFromUrl(raw: string): ProductInfo | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const parts = u.pathname.split('/').filter(Boolean);
  const slug = parts
    .filter((p) => /[a-z]-[a-z]/i.test(p) && !/^(dp|ip|p|gp|product|products|s|b)$/i.test(p))
    .sort((a, b) => b.length - a.length)[0];
  if (!slug) return null;
  const name = decodeURIComponent(slug)
    .replace(/\.(html?|aspx?)$/i, '')
    .replace(/[-_+]+/g, ' ')
    .replace(/\b(A-?\d{6,}|\d{6,})\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 120);
  if (name.length < 4) return null;
  return { barcode: '', name, brand: '', model: '', description: '', category: guessItemCategory(name), image: '', price: null, resale: null, source: hostLabel(raw) };
}
