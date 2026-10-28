import type { Item } from './types';
import { itemWeightLbs } from './movers';

/** Big things that get pads / wrap (or their own specialty box), never a regular moving box. */
const BULKY =
  /sofa|couch|sectional|loveseat|love seat|recliner|arm ?chair|ottoman|chaise|mattress|box ?spring|bed ?frame|headboard|bunk ?bed|\bbed\b|crib|futon|dresser|chest of drawers|night ?stand|\bdesk\b|\btable\b|bookcase|book ?shelf|shelving unit|cabinet|armoire|hutch|buffet|credenza|sideboard|tv stand|entertainment (center|unit)|piano|treadmill|elliptical|rowing machine|exercise bike|peloton|bicycle|\bbikes?\b|grill|refrigerator|fridge|freezer|washer|dryer|dishwasher|lawn ?mower|snow ?blower|\brug\b|area rug|\bchairs?\b|\bstools?\b|\bbench\b|vanity|wardrobe(?! box)|high ?chair|stroller|car seat|kayak|canoe|surfboard|paddle ?board|ladder|wheelbarrow|safe\b|\bmirror\b|painting|canvas|wall art|artwork|\btv\b|television|crib|pack ?n ?play|playpen|trampoline|swing set|hot tub|pool table|ping pong|foosball|air hockey|arcade|\bsofa table\b/i;
/** Small things that merely mention a big one ("table lamp", "mattress protector", "desk organizer"). */
const SMALL_HINT = /lamp|cloth|runner|organi[sz]er|\bmat\b|placemat|cover|sheet|pillow|cushion|protector|topper|pad\b|accessor|charger|cable|remote|mount|light|fan\b|decor|figurine|bag\b|skirt|caddy|tray|knob|hardware|screws?|bolts?|parts?\b|key|lock\b|bell|bottle|pump|tool kit|tube|helmet|glove|game\b|toy|hair|brush|cleaner|tablet/i;

/** True for furniture, appliances, mattresses, bikes, TVs, mirrors etc. — wrapped or padded, not boxed. */
export function isBulkyItem(i: Pick<Item, 'name' | 'category'> & { model?: string; weight_lbs?: number | null }): boolean {
  if ((i.weight_lbs ?? 0) >= 70) return true;
  const text = `${i.name} ${i.model ?? ''}`;
  if (SMALL_HINT.test(text)) return false;
  return i.category === 'furniture' || i.category === 'appliances' || i.category === 'plants' || BULKY.test(text);
}

/** "24 x 18 x 6", "24×18×6 in", "24in x 18in x 6in" → [24, 18, 6] (inches), largest first. */
export function parseDims(s: string | null | undefined): [number, number, number] | null {
  const n = (s ?? '').match(/\d+(?:\.\d+)?/g)?.map(Number).filter((x) => x > 0);
  if (!n || n.length < 3) return null;
  const cm = /\bcm\b/i.test(s ?? '');
  const d = n.slice(0, 3).map((x) => (cm ? x / 2.54 : x));
  return d.sort((a, b) => b - a) as [number, number, number];
}

/** Typical size of one item (inches) by category, when it hasn't been measured. */
const CATEGORY_DIMS_IN: Record<string, [number, number, number]> = {
  kitchenware: [10, 8, 6],
  clothing: [12, 10, 3],
  linens: [16, 12, 6],
  decor: [12, 9, 8],
  toys: [10, 8, 6],
  tools: [14, 6, 4],
  sports: [24, 10, 8],
  documents: [12, 9, 2],
  media: [7, 5, 1],
  jewelry: [6, 4, 2],
  collectibles: [10, 8, 6],
  garden: [24, 12, 10],
  bath: [8, 4, 3],
  office: [10, 8, 4],
  electronics: [16, 12, 8],
  other: [12, 10, 6],
};

export function itemDimsIn(i: Pick<Item, 'category'> & { dims_in?: string }): { dims: [number, number, number]; measured: boolean } {
  const d = parseDims(i.dims_in);
  return d ? { dims: d, measured: true } : { dims: CATEGORY_DIMS_IN[i.category] ?? CATEGORY_DIMS_IN.other!, measured: false };
}

/** Regular box sizes that loose items get packed into (inches inside, lbs a person can safely carry). */
export const PACK_BOXES = [
  { key: 'small', name: 'Small', dims: [16, 12, 12] as [number, number, number], maxLbs: 50 },
  { key: 'medium', name: 'Medium', dims: [18, 18, 16] as [number, number, number], maxLbs: 60 },
  { key: 'large', name: 'Large', dims: [24, 18, 18] as [number, number, number], maxLbs: 60 },
  { key: 'xl', name: 'Extra-large', dims: [24, 24, 18] as [number, number, number], maxLbs: 65 },
] as const;
export type PackBoxKey = (typeof PACK_BOXES)[number]['key'];

export interface PackItem {
  name: string;
  dims: [number, number, number];
  lbs: number;
  qty: number;
}

export interface PackResult {
  boxes: Record<PackBoxKey, number>;
  /** Items too big for any box (wrap or pad them instead). */
  notFit: { name: string; qty: number }[];
}

const vol = (d: readonly number[]) => d[0]! * d[1]! * d[2]!;
const fits = (item: readonly number[], box: readonly number[]) => {
  const a = [...item].sort((x, y) => y - x);
  const b = [...box].sort((x, y) => y - x);
  return a.every((v, k) => v <= b[k]!);
};
/** Real packing never fills a box solid — leave room for paper and odd shapes. */
const FILL = 0.8;

/**
 * Packs items into the fewest regular boxes, first-fit-decreasing by volume with a per-box weight limit.
 * Heavy things (> 2 lbs per 100 in³) go in small boxes, like movers recommend; bigger boxes are for light, bulky things.
 */
export function packLocally(items: PackItem[]): PackResult {
  const boxes: Record<PackBoxKey, number> = { small: 0, medium: 0, large: 0, xl: 0 };
  const notFit: PackResult['notFit'] = [];
  const units = items
    .flatMap((i) => Array.from({ length: Math.max(1, Math.min(2000, Math.round(i.qty))) }, () => i))
    .sort((a, b) => vol(b.dims) - vol(a.dims));
  const open: { key: PackBoxKey; room: number; lbs: number; max: number }[] = [];
  for (const u of units) {
    const v = vol(u.dims);
    const dense = u.lbs / (v / 100) > 2;
    const slot = open.find(
      (b) => (!dense || b.key === 'small') && b.room >= v && b.lbs + u.lbs <= b.max && fits(u.dims, PACK_BOXES.find((p) => p.key === b.key)!.dims),
    );
    if (slot) {
      slot.room -= v;
      slot.lbs += u.lbs;
      continue;
    }
    const choices = PACK_BOXES.filter((p) => fits(u.dims, p.dims) && u.lbs <= p.maxLbs);
    const pick = (dense ? choices[0] : choices.find((p) => p.key === 'medium' || p.key === 'large') ?? choices[0]) ?? null;
    if (!pick) {
      const nf = notFit.find((n) => n.name === u.name);
      if (nf) nf.qty++;
      else notFit.push({ name: u.name, qty: 1 });
      continue;
    }
    boxes[pick.key]++;
    open.push({ key: pick.key, room: vol(pick.dims) * FILL - v, lbs: u.lbs, max: pick.maxLbs });
  }
  return { boxes, notFit };
}

const DISHES = /dish|plate|bowl|glass|mug|cup|stemware|china|wine/i;
const HANGING = /hanging|suit\b|suits\b|dress(es)?\b|gown|coat|blazer|jacket/i;
const TV = /\btv\b|television|monitor/i;
const NOT_TV = /stand|mount|console|cabinet|remote|baby/i;
const MATTRESS = /mattress|box ?spring|futon|\bbed\b(?! ?frame| ?rail)/i;
const MIRROR = /\bmirror|painting|picture|canvas|framed|wall art|artwork/i;

export type PackLane = 'box' | 'dish' | 'wardrobe' | 'tv' | 'mattress' | 'mirror' | 'bulky';

/** Where an item goes: a regular box, a dish pack, a wardrobe box, a specialty box/bag, or no box at all. */
export function packLane(i: Pick<Item, 'name' | 'category'> & { model?: string; weight_lbs?: number | null }): PackLane {
  const text = `${i.name} ${i.model ?? ''}`;
  if (TV.test(text) && !NOT_TV.test(text) && !SMALL_HINT.test(text)) return 'tv';
  if (MATTRESS.test(text) && !/headboard|frame/i.test(text) && !SMALL_HINT.test(text)) return 'mattress';
  if (MIRROR.test(text) && !SMALL_HINT.test(text) && i.category !== 'furniture') return 'mirror';
  if (isBulkyItem(i)) return 'bulky';
  if (i.category === 'kitchenware' && DISHES.test(text)) return 'dish';
  if (i.category === 'clothing' && HANGING.test(text)) return 'wardrobe';
  return 'box';
}

/** The loose (not yet boxed) items in one room that need regular boxes, ready for a packer. */
export function packItemsFor(items: Item[]): PackItem[] {
  return items
    .filter((i) => !i.box_id && packLane(i) === 'box')
    .map((i) => ({ name: i.name || 'Item', dims: itemDimsIn(i).dims, lbs: Math.max(0.1, itemWeightLbs(i).lbs), qty: Math.max(1, i.quantity ?? 1) }));
}
