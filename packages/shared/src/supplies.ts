import type { Snapshot } from './csv';
import { estimateMoveSize } from './movers';

export type BoxSize = 'small' | 'medium' | 'large' | 'xl' | 'wardrobe' | 'dish';

export interface BoxSizeInfo {
  key: BoxSize;
  name: string;
  dims: string;
  cuft: number;
  useFor: string;
  price: number;
}

/** Standard moving-box sizes (what U-Haul, Home Depot & Lowe's sell) with typical per-box prices. */
export const BOX_SIZES: BoxSizeInfo[] = [
  { key: 'small', name: 'Small', dims: '16×12×12 in', cuft: 1.5, useFor: 'Books, canned food, tools, files — heavy stuff', price: 1.5 },
  { key: 'medium', name: 'Medium', dims: '18×18×16 in', cuft: 3, useFor: 'Kitchen items, toys, decor, small electronics', price: 2 },
  { key: 'large', name: 'Large', dims: '18×18×24 in', cuft: 4.5, useFor: 'Clothes, towels, shoes, light bulky things', price: 2.75 },
  { key: 'xl', name: 'Extra-large', dims: '24×18×24 in', cuft: 6, useFor: 'Bedding, pillows, comforters, lampshades', price: 3.5 },
  { key: 'wardrobe', name: 'Wardrobe', dims: '24×21×46 in, with hanging bar', cuft: 13, useFor: 'Hanging clothes straight from the closet', price: 18 },
  { key: 'dish', name: 'Dish pack', dims: '18×18×28 in, double-wall + cell kit', cuft: 5.2, useFor: 'Plates, glasses, stemware', price: 10 },
];

type Counts = Record<BoxSize, number>;
const zero = (): Counts => ({ small: 0, medium: 0, large: 0, xl: 0, wardrobe: 0, dish: 0 });

export type RoomKind = 'kitchen' | 'primary' | 'bedroom' | 'bath' | 'living' | 'dining' | 'office' | 'garage' | 'laundry' | 'closet' | 'outdoor' | 'other';

/** Rule-of-thumb box counts for a typical, fully-furnished room (from mover packing guides). */
const ROOM_BASELINE: Record<RoomKind, Partial<Counts>> = {
  kitchen: { small: 4, medium: 8, large: 2, dish: 4 },
  primary: { small: 3, medium: 5, large: 4, xl: 2, wardrobe: 3 },
  bedroom: { small: 2, medium: 4, large: 3, xl: 1, wardrobe: 2 },
  bath: { small: 2, medium: 2 },
  living: { small: 3, medium: 5, large: 3, xl: 1 },
  dining: { small: 2, medium: 3, dish: 1 },
  office: { small: 6, medium: 3, large: 1 },
  garage: { small: 3, medium: 6, large: 3 },
  laundry: { medium: 2 },
  closet: { large: 2, wardrobe: 3 },
  outdoor: { medium: 1, large: 2 },
  other: { small: 2, medium: 3, large: 1 },
};

export function roomKind(name: string): RoomKind {
  const n = name.toLowerCase();
  if (/kitchen|pantry/.test(n)) return 'kitchen';
  if (/closet|wardrobe/.test(n)) return 'closet';
  if (/bath|powder|restroom|toilet/.test(n)) return 'bath';
  if (/master|primary|main bed/.test(n)) return 'primary';
  if (/bed|nursery|kid|guest|child|['’]s room/.test(n)) return 'bedroom';
  if (/dining/.test(n)) return 'dining';
  if (/office|study|den|library/.test(n)) return 'office';
  if (/garage|shed|attic|basement|storage|workshop/.test(n)) return 'garage';
  if (/laundry|utility|mud/.test(n)) return 'laundry';
  if (/outdoor|patio|porch|deck|yard|balcony|garden/.test(n)) return 'outdoor';
  if (/living|family|great|game|media|play|bonus|lounge/.test(n)) return 'living';
  return 'other';
}

/** Which box an inventory category packs into, and roughly how many items fit in one. */
const CATEGORY_PACKING: Record<string, [BoxSize, number] | null> = {
  furniture: null,
  appliances: null,
  plants: null,
  kitchenware: ['medium', 8],
  clothing: ['large', 15],
  linens: ['xl', 6],
  decor: ['medium', 5],
  toys: ['medium', 8],
  tools: ['small', 6],
  sports: ['large', 4],
  documents: ['small', 20],
  media: ['small', 30],
  jewelry: ['small', 30],
  collectibles: ['medium', 5],
  garden: ['large', 3],
  bath: ['small', 15],
  office: ['small', 15],
  electronics: ['medium', 3],
  other: ['medium', 6],
};

const TV = /\btv\b|television|monitor/i;
const MATTRESS = /mattress|\bbed\b|bed frame|crib|futon|box spring/i;
const MIRROR = /mirror|painting|picture|canvas|framed|wall art|artwork/i;
const DISHES = /dish|plate|bowl|glass|mug|cup|stemware|china|wine/i;

export interface SupplyLine {
  key: string;
  group: 'boxes' | 'specialty' | 'packing' | 'furniture';
  name: string;
  detail: string;
  qty: number;
  unit: string;
  unitPrice: number;
  cost: number;
}

export interface SupplyRoom {
  room: string;
  kind: RoomKind;
  basis: 'inventory' | 'typical';
  boxes: Counts;
  have: number;
}

export interface SupplyEstimate {
  boxes: Counts;
  totalBoxes: number;
  /** Boxes already created in the app (subtracted from what's still needed). */
  haveBoxes: number;
  bookBoxes: number;
  lines: SupplyLine[];
  totalCost: number;
  rooms: SupplyRoom[];
}

const line = (key: string, group: SupplyLine['group'], name: string, detail: string, qty: number, unit: string, unitPrice: number): SupplyLine => ({
  key,
  group,
  name,
  detail,
  qty,
  unit,
  unitPrice,
  cost: Math.round(qty * unitPrice * 100) / 100,
});

const isMoving = (d: string) => d === 'move' || d === 'store' || d === 'undecided';
const ORDER: BoxSize[] = ['medium', 'large', 'small', 'xl', 'dish', 'wardrobe'];

/**
 * Packing-supply shopping list from the inventory: boxes by size per room (the larger of a typical-room
 * baseline and what the logged items need), minus boxes already made, plus tape, paper, wrap and pads.
 */
export function estimateSupplies(db: Pick<Snapshot, 'rooms' | 'items' | 'boxes' | 'books'>): SupplyEstimate {
  const rooms = db.rooms.filter((r) => !r.deleted);
  const items = db.items.filter((i) => !i.deleted && isMoving(i.disposition));
  const boxes = db.boxes.filter((b) => !b.deleted);
  const size = estimateMoveSize(db);

  const perRoom: SupplyRoom[] = [];
  const total = zero();
  for (const r of rooms) {
    const kind = roomKind(r.name);
    const base = { ...zero(), ...ROOM_BASELINE[kind] };
    const inv = zero();
    const loose = new Map<BoxSize, number>();
    for (const i of items) {
      if (i.room_id !== r.id || i.box_id) continue;
      const qty = Math.max(1, i.quantity ?? 1);
      const text = `${i.name} ${i.model ?? ''}`;
      if (TV.test(text) || MATTRESS.test(text) || MIRROR.test(text)) continue;
      let pack = CATEGORY_PACKING[i.category] ?? CATEGORY_PACKING.other!;
      if (i.category === 'kitchenware' && DISHES.test(text)) pack = ['dish', 25];
      if (!pack) continue;
      loose.set(pack[0], (loose.get(pack[0]) ?? 0) + qty / pack[1]);
    }
    for (const [k, n] of loose) inv[k] = Math.ceil(n);
    const invTotal = Object.values(inv).reduce((a, b) => a + b, 0);
    const baseTotal = Object.values(base).reduce((a, b) => a + b, 0);
    const basis: SupplyRoom['basis'] = invTotal >= baseTotal ? 'inventory' : 'typical';
    const need = zero();
    for (const k of ORDER) need[k] = Math.max(base[k], inv[k]);

    // Boxes already set up for this room come off the list, regular sizes first.
    const have = boxes.filter((b) => b.room_id === r.id).length;
    let left = have;
    for (const k of ORDER) {
      const take = Math.min(left, need[k]);
      need[k] -= take;
      left -= take;
    }
    for (const k of ORDER) total[k] += need[k];
    perRoom.push({ room: r.name, kind, basis, boxes: need, have });
  }

  const bookBoxes = size.bookBoxesNeeded;
  total.small += bookBoxes;
  const totalBoxes = Object.values(total).reduce((a, b) => a + b, 0);
  const lines: SupplyLine[] = [];
  for (const s of BOX_SIZES) {
    if (!total[s.key]) continue;
    const detail = s.key === 'small' && bookBoxes ? `${s.dims} · includes ${bookBoxes} for books (≤35 lbs each)` : `${s.dims} · ${s.useFor}`;
    lines.push(line(`box-${s.key}`, 'boxes', `${s.name} boxes`, detail, total[s.key], 'box', s.price));
  }

  const qtyOf = (re: RegExp) => items.filter((i) => re.test(`${i.name} ${i.model ?? ''}`)).reduce((a, i) => a + Math.max(1, i.quantity ?? 1), 0);
  const bedrooms = rooms.filter((r) => ['primary', 'bedroom'].includes(roomKind(r.name))).length;
  const livingRooms = rooms.filter((r) => roomKind(r.name) === 'living').length;
  const tvs = qtyOf(TV);
  const mattresses = Math.max(qtyOf(/mattress|\bbed\b|crib|futon/i), bedrooms);
  const mirrors = Math.max(qtyOf(MIRROR), rooms.length ? Math.ceil((bedrooms + livingRooms) / 2) : 0);
  if (tvs) lines.push(line('tv', 'specialty', 'TV boxes', 'Adjustable 32–70 in, with foam corners', tvs, 'box', 25));
  if (mattresses) lines.push(line('mattress', 'specialty', 'Mattress bags', 'Heavy plastic, sized to each bed', mattresses, 'bag', 6));
  if (mirrors) lines.push(line('mirror', 'specialty', 'Mirror & picture boxes', '4-piece telescoping kit for frames & art', mirrors, 'kit', 10));

  const dishBoxes = total.dish;
  const fragileItems = items.filter((i) => i.fragile).reduce((a, i) => a + Math.max(1, i.quantity ?? 1), 0);
  const paperLbs = Math.ceil((dishBoxes * 4 + total.medium * 0.25 + fragileItems * 0.5) / 10) * 10;
  const bubbleFt = Math.max(totalBoxes ? 100 : 0, Math.ceil((fragileItems * 3 + tvs * 10 + mirrors * 6) / 100) * 100);
  const tapeRolls = totalBoxes ? Math.ceil(totalBoxes / 15) + 1 : 0;
  if (tapeRolls) lines.push(line('tape', 'packing', 'Packing tape', '2 in × 55 yd rolls — about 15 boxes per roll', tapeRolls, 'roll', 3.5));
  if (totalBoxes) lines.push(line('gun', 'packing', 'Tape gun', 'Makes sealing boxes much faster', totalBoxes > 60 ? 2 : 1, 'gun', 10));
  if (paperLbs) lines.push(line('paper', 'packing', 'Packing paper', 'Unprinted newsprint, for dishes & fragile items', paperLbs / 10, '10-lb bundle', 13));
  if (bubbleFt) lines.push(line('bubble', 'packing', 'Bubble wrap', '12 in × 100 ft rolls — fragile items, TVs, frames', bubbleFt / 100, 'roll', 20));
  if (totalBoxes) {
    lines.push(line('markers', 'packing', 'Permanent markers', 'Label room + contents on 2 sides', 1, 'pack', 5));
    lines.push(line('labels', 'packing', 'Label sheets', '2×4 in, 10 per sheet — print QR labels from Labels', Math.ceil(totalBoxes / 10), 'sheet', 0.5));
  }

  const furniture = items.filter((i) => i.category === 'furniture' || i.category === 'appliances').reduce((a, i) => a + Math.max(1, i.quantity ?? 1), 0);
  // About one pad per piece of furniture (big pieces take 2–3, small ones none), bought by the dozen.
  const furnitureEst = Math.max(furniture, rooms.length * 2);
  if (rooms.length) {
    lines.push(line('pads', 'furniture', 'Furniture pads', 'Moving blankets — skip if full-service movers bring them', Math.min(48, Math.max(12, Math.ceil(furnitureEst / 12) * 12)), 'pad', 6));
    lines.push(line('stretch', 'furniture', 'Stretch wrap', '20 in × 1000 ft — keeps drawers shut & pads on', Math.max(1, Math.ceil(furnitureEst / 12)), 'roll', 20));
    lines.push(line('bags', 'furniture', 'Zip bags', 'Quart size, for screws & hardware — tape to the furniture', 1, 'box', 5));
  }

  const totalCost = Math.round(lines.reduce((a, l) => a + l.cost, 0));
  return { boxes: total, totalBoxes, haveBoxes: boxes.length, bookBoxes, lines, totalCost, rooms: perRoom };
}

export function suppliesShoppingList(s: SupplyEstimate): string {
  const groups: [SupplyLine['group'], string][] = [
    ['boxes', 'BOXES'],
    ['specialty', 'SPECIALTY BOXES'],
    ['packing', 'PACKING'],
    ['furniture', 'FURNITURE PROTECTION'],
  ];
  const out = [`Moving supplies — ${s.totalBoxes} boxes, about $${s.totalCost}`];
  for (const [g, title] of groups) {
    const ls = s.lines.filter((l) => l.group === g);
    if (!ls.length) continue;
    out.push('', title);
    for (const l of ls) out.push(`☐ ${l.qty} × ${l.name} (${l.detail})`);
  }
  return out.join('\n');
}
