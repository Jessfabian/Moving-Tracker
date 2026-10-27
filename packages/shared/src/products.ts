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
  const patch: Partial<Pick<Item, 'barcode' | 'name' | 'brand' | 'model' | 'description' | 'image_url' | 'category' | 'retail_price' | 'est_value'>> = { barcode: info.barcode };
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
