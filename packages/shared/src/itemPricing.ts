import { CATEGORY_WEIGHT_LBS } from './movers';
import { isComputerPart } from './products';
import type { Item } from './types';

/**
 * Typical *used* resale prices (good condition, local marketplace — Facebook
 * Marketplace / OfferUp / Craigslist, 2025-26) plus a rough weight for the
 * keep-or-sell math. First matching pattern wins, so specific names come first.
 */
interface PriceRow {
  match: RegExp;
  name: string;
  category: string;
  low: number;
  likely: number;
  high: number;
  lbs: number;
  /** Shown under the price — selling tips specific to this kind of item. */
  tip?: string;
}

export const USED_PRICES: PriceRow[] = [
  { match: /sectional/i, name: 'Sectional sofa', category: 'furniture', low: 150, likely: 350, high: 800, lbs: 250, tip: 'Big pieces sell fastest with measurements and “must pick up” in the title.' },
  { match: /sleeper sofa|sofa ?bed|futon/i, name: 'Sleeper sofa / futon', category: 'furniture', low: 60, likely: 150, high: 350, lbs: 180 },
  { match: /love ?seat/i, name: 'Loveseat', category: 'furniture', low: 50, likely: 120, high: 250, lbs: 100 },
  { match: /\b(sofa|couch)\b/i, name: 'Sofa', category: 'furniture', low: 75, likely: 200, high: 450, lbs: 150, tip: 'Clean it and photograph in daylight — sofas are the #1 Marketplace search.' },
  { match: /recliner|lift chair/i, name: 'Recliner', category: 'furniture', low: 50, likely: 120, high: 300, lbs: 80 },
  { match: /makeup vanity|vanity (table|desk)|\bvanity\b/i, name: 'Makeup vanity', category: 'furniture', low: 40, likely: 90, high: 200, lbs: 60, tip: 'Lighted-mirror vanities go for the top of the range.' },
  { match: /night ?stand|bedside table/i, name: 'Nightstand', category: 'furniture', low: 15, likely: 40, high: 90, lbs: 30, tip: 'Sell pairs together — a matching set gets ~2.5× a single.' },
  { match: /\bdresser|chest of drawers|tall ?boy|bureau/i, name: 'Dresser', category: 'furniture', low: 50, likely: 120, high: 280, lbs: 120 },
  { match: /armoire|wardrobe/i, name: 'Armoire / wardrobe', category: 'furniture', low: 60, likely: 150, high: 350, lbs: 150 },
  { match: /headboard/i, name: 'Headboard', category: 'furniture', low: 20, likely: 50, high: 120, lbs: 40 },
  { match: /mattress/i, name: 'Mattress', category: 'furniture', low: 30, likely: 100, high: 250, lbs: 70, tip: 'Many buyers skip used mattresses — usually cheaper to sell/donate and buy new there.' },
  { match: /bunk ?bed|loft bed/i, name: 'Bunk / loft bed', category: 'furniture', low: 60, likely: 150, high: 350, lbs: 150 },
  { match: /\bcrib\b/i, name: 'Crib', category: 'furniture', low: 40, likely: 80, high: 180, lbs: 50 },
  { match: /\bbed\b|bed ?frame|platform bed/i, name: 'Bed frame', category: 'furniture', low: 50, likely: 120, high: 280, lbs: 80, tip: 'List the size (twin/full/queen/king) in the title.' },
  { match: /dining (table|set)|kitchen table/i, name: 'Dining table', category: 'furniture', low: 60, likely: 150, high: 350, lbs: 100 },
  { match: /dining chair|kitchen chair/i, name: 'Dining chair', category: 'furniture', low: 10, likely: 20, high: 45, lbs: 15 },
  { match: /office chair|desk chair|gaming chair/i, name: 'Office chair', category: 'furniture', low: 20, likely: 50, high: 150, lbs: 30 },
  { match: /arm ?chair|accent chair/i, name: 'Accent chair', category: 'furniture', low: 25, likely: 60, high: 150, lbs: 35 },
  { match: /\bchairs?\b/i, name: 'Chair', category: 'furniture', low: 10, likely: 25, high: 60, lbs: 15 },
  { match: /coffee table/i, name: 'Coffee table', category: 'furniture', low: 20, likely: 50, high: 120, lbs: 40 },
  { match: /(end|side|accent) table/i, name: 'Side table', category: 'furniture', low: 10, likely: 25, high: 60, lbs: 15 },
  { match: /tv (stand|console)|media (console|center)|entertainment center/i, name: 'TV stand', category: 'furniture', low: 20, likely: 50, high: 150, lbs: 50 },
  { match: /book ?(case|shelf|shelves)|shelving unit|cube organizer/i, name: 'Bookcase', category: 'furniture', low: 15, likely: 40, high: 100, lbs: 50 },
  { match: /\bdesk\b/i, name: 'Desk', category: 'furniture', low: 25, likely: 70, high: 180, lbs: 60 },
  { match: /ottoman|pouf/i, name: 'Ottoman', category: 'furniture', low: 10, likely: 30, high: 70, lbs: 20 },
  { match: /bar ?stool|\bstool/i, name: 'Stool', category: 'furniture', low: 10, likely: 20, high: 50, lbs: 12 },
  { match: /\bbench\b/i, name: 'Bench', category: 'furniture', low: 15, likely: 40, high: 100, lbs: 30 },
  { match: /cabinet|hutch|sideboard|buffet|credenza/i, name: 'Cabinet / sideboard', category: 'furniture', low: 30, likely: 80, high: 200, lbs: 80 },
  { match: /\btables?\b/i, name: 'Table', category: 'furniture', low: 20, likely: 50, high: 120, lbs: 40 },
  { match: /refrigerator|fridge/i, name: 'Refrigerator', category: 'appliances', low: 150, likely: 300, high: 700, lbs: 250, tip: 'Most apartments include one — usually worth selling rather than moving.' },
  { match: /chest freezer|freezer/i, name: 'Freezer', category: 'appliances', low: 60, likely: 120, high: 250, lbs: 100 },
  { match: /washer|washing machine/i, name: 'Washer', category: 'appliances', low: 100, likely: 200, high: 400, lbs: 160 },
  { match: /dryer/i, name: 'Dryer', category: 'appliances', low: 75, likely: 150, high: 350, lbs: 120 },
  { match: /\boven\b|\brange\b|\bstove\b/i, name: 'Range / oven', category: 'appliances', low: 100, likely: 250, high: 500, lbs: 200 },
  { match: /microwave/i, name: 'Microwave', category: 'appliances', low: 15, likely: 35, high: 70, lbs: 35 },
  { match: /air fryer/i, name: 'Air fryer', category: 'appliances', low: 15, likely: 30, high: 60, lbs: 10 },
  { match: /stand mixer|kitchenaid/i, name: 'Stand mixer', category: 'appliances', low: 80, likely: 150, high: 250, lbs: 25 },
  { match: /coffee (maker|machine)|espresso|keurig/i, name: 'Coffee maker', category: 'appliances', low: 10, likely: 25, high: 80, lbs: 8 },
  { match: /toaster/i, name: 'Toaster', category: 'appliances', low: 5, likely: 12, high: 30, lbs: 5 },
  { match: /vacuum|roomba/i, name: 'Vacuum', category: 'appliances', low: 20, likely: 60, high: 150, lbs: 15 },
  { match: /\b(tv|television)\b/i, name: 'TV', category: 'electronics', low: 60, likely: 150, high: 400, lbs: 35, tip: 'Include the screen size and model # — buyers search by inches.' },
  { match: /laptop|macbook|notebook computer/i, name: 'Laptop', category: 'electronics', low: 100, likely: 250, high: 600, lbs: 5 },
  { match: /monitor/i, name: 'Monitor', category: 'electronics', low: 30, likely: 60, high: 150, lbs: 12 },
  { match: /printer/i, name: 'Printer', category: 'electronics', low: 10, likely: 30, high: 80, lbs: 20 },
  { match: /playstation|xbox|nintendo|switch|game console/i, name: 'Game console', category: 'electronics', low: 100, likely: 200, high: 350, lbs: 8 },
  { match: /keyboard/i, name: 'Keyboard', category: 'electronics', low: 5, likely: 15, high: 50, lbs: 2 },
  { match: /speaker|soundbar/i, name: 'Speaker / soundbar', category: 'electronics', low: 15, likely: 40, high: 120, lbs: 10 },
  { match: /\bmirror/i, name: 'Mirror', category: 'decor', low: 10, likely: 30, high: 80, lbs: 20 },
  { match: /\blamp|floor lamp|table lamp/i, name: 'Lamp', category: 'decor', low: 5, likely: 15, high: 40, lbs: 8 },
  { match: /\brug\b|area rug/i, name: 'Rug', category: 'decor', low: 15, likely: 40, high: 120, lbs: 20 },
  { match: /clock/i, name: 'Clock', category: 'decor', low: 5, likely: 15, high: 40, lbs: 5 },
  { match: /vase/i, name: 'Vase', category: 'decor', low: 3, likely: 10, high: 30, lbs: 4 },
  { match: /painting|wall art|framed|canvas/i, name: 'Wall art', category: 'decor', low: 5, likely: 20, high: 80, lbs: 8 },
  { match: /plant/i, name: 'Potted plant', category: 'plants', low: 5, likely: 15, high: 40, lbs: 15, tip: 'Most movers won’t take plants on a long haul — plan to car-ride or rehome them.' },
  { match: /stroller/i, name: 'Stroller', category: 'toys', low: 25, likely: 60, high: 200, lbs: 20 },
  { match: /high ?chair/i, name: 'High chair', category: 'toys', low: 15, likely: 30, high: 80, lbs: 15 },
  { match: /teddy|stuffed animal|plush/i, name: 'Stuffed animal', category: 'toys', low: 1, likely: 3, high: 10, lbs: 1 },
  { match: /bicycle|\bbike\b/i, name: 'Bicycle', category: 'sports', low: 40, likely: 100, high: 300, lbs: 30 },
  { match: /treadmill/i, name: 'Treadmill', category: 'sports', low: 100, likely: 250, high: 600, lbs: 250, tip: 'Heavy and charged as a special item by movers — strong sell candidate.' },
  { match: /exercise bike|peloton|elliptical/i, name: 'Exercise machine', category: 'sports', low: 100, likely: 300, high: 900, lbs: 150 },
  { match: /dumbbell|weights|kettlebell/i, name: 'Weights', category: 'sports', low: 20, likely: 50, high: 150, lbs: 60 },
  { match: /suitcase|luggage/i, name: 'Suitcase', category: 'other', low: 10, likely: 30, high: 80, lbs: 10 },
  { match: /grill|bbq|smoker/i, name: 'Grill', category: 'garden', low: 40, likely: 100, high: 300, lbs: 60 },
  { match: /lawn ?mower|mower/i, name: 'Lawn mower', category: 'garden', low: 50, likely: 120, high: 300, lbs: 70 },
  { match: /patio (set|furniture|table)/i, name: 'Patio set', category: 'garden', low: 50, likely: 150, high: 400, lbs: 100 },
  { match: /hair ?dryer|hair drier|straightener|curling/i, name: 'Hair tool', category: 'bath', low: 5, likely: 12, high: 40, lbs: 2 },
  { match: /tool ?box|drill|saw\b|tool set/i, name: 'Tools', category: 'tools', low: 15, likely: 40, high: 120, lbs: 15 },
];

/** Fallback when the name doesn't match anything above. */
const CATEGORY_PRICE: Record<string, [number, number, number]> = {
  furniture: [20, 50, 120],
  appliances: [30, 80, 200],
  electronics: [20, 60, 150],
  kitchenware: [2, 8, 20],
  clothing: [2, 6, 20],
  linens: [2, 8, 20],
  decor: [5, 15, 40],
  toys: [2, 8, 25],
  tools: [5, 20, 60],
  sports: [10, 30, 80],
  documents: [0, 0, 0],
  media: [1, 3, 8],
  jewelry: [10, 30, 150],
  collectibles: [10, 25, 100],
  plants: [5, 15, 40],
  garden: [10, 30, 80],
  bath: [1, 5, 15],
  office: [5, 15, 40],
  other: [5, 15, 40],
};

/** How much of the new price a used item keeps, by category. */
const RETAIL_KEEP: Record<string, number> = { pc_parts: 0.75, furniture: 0.35, electronics: 0.45, appliances: 0.4, sports: 0.4, tools: 0.45, toys: 0.3, jewelry: 0.4 };

/**
 * Depreciation by age: share of the new price kept in the first year, what's kept each extra year, and the floor.
 * Electronics drop fast; PC parts, tools, jewelry and collectibles hold value.
 */
const AGE_CURVE: Record<string, { first: number; perYear: number; floor: number }> = {
  pc_parts: { first: 0.8, perYear: 0.88, floor: 0.35 },
  electronics: { first: 0.65, perYear: 0.75, floor: 0.08 },
  appliances: { first: 0.6, perYear: 0.85, floor: 0.12 },
  furniture: { first: 0.5, perYear: 0.88, floor: 0.15 },
  tools: { first: 0.6, perYear: 0.9, floor: 0.2 },
  sports: { first: 0.55, perYear: 0.88, floor: 0.15 },
  toys: { first: 0.45, perYear: 0.85, floor: 0.1 },
  jewelry: { first: 0.5, perYear: 0.98, floor: 0.35 },
  collectibles: { first: 0.6, perYear: 1, floor: 0.5 },
  other: { first: 0.45, perYear: 0.88, floor: 0.12 },
};
/** Typical marketplace listings are a few years old — the age curve is compared against this. */
const TYPICAL_AGE_YEARS = 3;

/** Share of the new price kept after `years` (before condition). */
export function ageKeep(category: string, years: number): number {
  const c = AGE_CURVE[category] ?? AGE_CURVE.other!;
  return Math.max(c.floor, c.first * Math.pow(c.perYear, Math.max(0, years - 1)));
}

/** Whole-ish years since a YYYY-MM-DD purchase date (null when unknown / in the future). */
export function itemAgeYears(purchaseDate: string | null | undefined, today = new Date()): number | null {
  if (!purchaseDate) return null;
  const d = new Date(`${purchaseDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const years = (today.getTime() - d.getTime()) / (365.25 * 86400000);
  return years < 0 ? null : Math.round(years * 10) / 10;
}

const ageText = (y: number) => (y < 1 ? 'under a year old' : `${y % 1 === 0 ? y : y.toFixed(1)} year${y === 1 ? '' : 's'} old`);

export const CONDITION_FACTOR: Record<Item['condition'], number> = { new: 1.3, like_new: 1.15, good: 1, fair: 0.65, poor: 0.35 };

/** Long-distance movers bill roughly $0.50–$1.00 per lb for ~1,000 miles. */
export const DEFAULT_MOVE_COST_PER_LB = 0.75;

export interface PriceIdea {
  low: number;
  likely: number;
  high: number;
  /** Where the number came from. */
  basis: string;
  /** Step-by-step "how we got this number", for the explainer. */
  steps: string[];
  /** Age in years when a purchase date is known. */
  ageYears: number | null;
  /** Rough shipping weight, for the keep-or-sell math. */
  lbs: number;
  /** About what it costs to haul this many to the new place. */
  moveCost: number;
  verdict: 'sell' | 'keep' | 'either' | 'donate';
  why: string;
  tip?: string;
  links: { label: string; url: string }[];
}

export function priceRowFor(name: string): PriceRow | undefined {
  return USED_PRICES.find((r) => r.match.test(name));
}

const round = (n: number) => (n >= 20 ? Math.round(n / 5) * 5 : Math.round(n));

export function marketplaceLinks(name: string, city = ''): { label: string; url: string }[] {
  const q = encodeURIComponent(name.trim());
  return [
    { label: 'eBay sold', url: `https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1` },
    { label: 'FB Marketplace', url: `https://www.facebook.com/marketplace/search/?query=${q}` },
    { label: 'OfferUp', url: `https://offerup.com/search?q=${q}` },
    { label: 'Google', url: `https://www.google.com/search?q=${encodeURIComponent(`used ${name} price ${city}`.trim())}` },
  ];
}

/**
 * A used-price range for an inventory item plus a keep / sell nudge:
 * if hauling it costs about as much as it's worth, sell it and re-buy there.
 */
export function itemPriceIdea(
  item: Pick<Item, 'name' | 'category' | 'condition' | 'quantity'> & Partial<Pick<Item, 'retail_price' | 'brand' | 'purchase_date' | 'purchase_price'>>,
  opts: { costPerLb?: number; today?: Date } = {},
): PriceIdea {
  const qty = Math.max(1, item.quantity || 1);
  const pcPart = isComputerPart(item.name);
  const row = pcPart ? undefined : priceRowFor(item.name);
  const category = row?.category ?? (pcPart ? 'electronics' : item.category) ?? 'other';
  const curve = pcPart ? 'pc_parts' : category;
  const kindText = pcPart ? 'computer parts' : category;
  const cond = CONDITION_FACTOR[item.condition] ?? 1;
  const age = itemAgeYears(item.purchase_date, opts.today);
  const newPrice = item.retail_price && item.retail_price > 0 ? item.retail_price : item.purchase_price && item.purchase_price > 0 ? item.purchase_price : null;
  const priceWord = item.retail_price && item.retail_price > 0 ? 'current new price' : 'price you paid';
  const condText = `Condition “${item.condition.replace('_', ' ')}” × ${cond}`;
  const steps: string[] = [];
  // When today's price is well above what was paid, the market is hot — used sells off today's price, not the old one.
  const paid = item.purchase_price && item.purchase_price > 0 ? item.purchase_price : null;
  const rising = !!(paid && item.retail_price && item.retail_price > paid * 1.15);
  const risingStep = rising
    ? `Prices are up ${Math.round((item.retail_price! / paid! - 1) * 100)}% since you paid $${Math.round(paid!)}${pcPart ? ' — computer parts are in short supply, so used ones sell close to today’s price' : ''}.`
    : '';
  let low: number, likely: number, high: number, basis: string;
  if (newPrice && age != null) {
    const keep = ageKeep(curve, age);
    likely = newPrice * keep * cond;
    low = likely * (pcPart ? 0.8 : 0.6);
    high = Math.min(newPrice * (pcPart ? 0.95 : 0.85), likely * (pcPart ? 1.25 : 1.6));
    basis = `${Math.round(keep * 100)}% of the $${Math.round(newPrice)} ${priceWord} for ${ageText(age)} ${kindText}, adjusted for condition`;
    steps.push(`Started from the $${Math.round(newPrice)} ${priceWord}.`);
    if (risingStep) steps.push(risingStep);
    steps.push(`It’s ${ageText(age)}: used ${kindText} keep about ${Math.round(keep * 100)}% at that age.`, `${condText}.`);
  } else if (newPrice) {
    const keep = RETAIL_KEEP[curve] ?? 0.3;
    likely = newPrice * keep * cond;
    low = likely * (pcPart ? 0.8 : 0.6);
    high = Math.min(newPrice * (pcPart ? 0.95 : 0.8), likely * (pcPart ? 1.25 : 1.6));
    basis = `${Math.round(keep * 100)}% of the $${Math.round(newPrice)} ${priceWord}, adjusted for condition`;
    steps.push(`Started from the $${Math.round(newPrice)} ${priceWord}.`);
    if (risingStep) steps.push(risingStep);
    steps.push(`Used ${kindText} typically resell for ~${Math.round(keep * 100)}% of new (add a purchase date to make this sharper).`, `${condText}.`);
  } else {
    let l: number, m: number, h: number;
    if (row) {
      [l, m, h] = [row.low, row.likely, row.high];
      basis = `typical used ${row.name.toLowerCase()} on local marketplaces`;
      steps.push(`Matched “${row.name}” — usually sells used for $${row.low}–$${row.high} (most around $${row.likely}).`);
    } else {
      [l, m, h] = CATEGORY_PRICE[category] ?? CATEGORY_PRICE.other!;
      basis = 'typical for the category — check sold listings for a closer number';
      steps.push(`No price known, so we used a typical used ${category} range: $${l}–$${h}. Add the retail price or a shopping link to sharpen it.`);
    }
    let ageF = 1;
    if (age != null) {
      ageF = Math.min(1.6, Math.max(0.5, ageKeep(category, age) / ageKeep(category, TYPICAL_AGE_YEARS)));
      if (ageF !== 1) steps.push(`It’s ${ageText(age)} vs a typical ${TYPICAL_AGE_YEARS}-year-old listing → × ${ageF.toFixed(2)}.`);
      basis += `, ${ageText(age)}`;
    }
    [low, likely, high] = [l * cond * ageF, m * cond * ageF, h * cond * ageF];
    steps.push(`${condText}.`);
  }
  if (qty > 1) steps.push(`Prices are per item — you have ${qty}.`);
  steps.push('Range: low ≈ quick sale, high ≈ patient seller. Always check eBay “sold” listings for the real number.');
  const lbs = pcPart ? 2 : (row?.lbs ?? CATEGORY_WEIGHT_LBS[category] ?? CATEGORY_WEIGHT_LBS.other!);
  const moveCost = Math.round(lbs * qty * (opts.costPerLb ?? DEFAULT_MOVE_COST_PER_LB));
  const value = likely * qty;
  let verdict: PriceIdea['verdict'];
  let why: string;
  if (value < 5 && moveCost < 10) {
    verdict = 'either';
    why = 'Small and cheap — pack it if you love it.';
  } else if (value < 15 && moveCost >= 15) {
    verdict = 'donate';
    why = `Worth little used but ~$${moveCost} to move — donate it.`;
  } else if (moveCost >= value * 0.8) {
    verdict = 'sell';
    why = `Moving it costs ~$${moveCost}, about what it sells for — sell here and re-buy in the new place.`;
  } else if (moveCost <= value * 0.35) {
    verdict = 'keep';
    why = `Worth more than the ~$${moveCost} it costs to move — keep it unless you don’t love it.`;
  } else {
    verdict = 'either';
    why = `Sells for ~$${round(value)}, ~$${moveCost} to move — your call.`;
  }
  return {
    low: round(low),
    likely: round(likely),
    high: round(high),
    basis,
    steps,
    ageYears: age,
    lbs,
    moveCost,
    verdict,
    why,
    tip: row?.tip,
    links: marketplaceLinks([item.brand, row?.name ?? item.name].filter(Boolean).join(' ')),
  };
}
