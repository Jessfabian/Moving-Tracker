import type { Snapshot } from './csv';
import { estimateBookWeightOz } from './bookselling';
import { priceRowFor } from './itemPricing';
import type { Item, Move, MoverQuote } from './types';

/** Typical weight per item (lbs) by inventory category — used when an item isn't packed in a box. */
export const CATEGORY_WEIGHT_LBS: Record<string, number> = {
  furniture: 90,
  appliances: 150,
  electronics: 25,
  kitchenware: 5,
  clothing: 3,
  linens: 3,
  decor: 8,
  toys: 4,
  tools: 10,
  sports: 15,
  documents: 2,
  media: 1,
  jewelry: 1,
  collectibles: 5,
  plants: 15,
  garden: 20,
  bath: 2,
  office: 5,
  other: 10,
};

export const DEFAULT_BOX_LBS = 40;
/** Industry rule of thumb: household goods average ~7 lbs per cubic foot. */
export const LBS_PER_CUFT = 7;
/** Books should go in small 1.5 cu ft boxes and stay under ~35 lbs so a box can be lifted safely. */
export const BOOK_BOX_MAX_LBS = 35;
const BOOK_BOX_TARE_LBS = 1;
/** A full small box of books (~35 lbs in 1.5 cu ft) packs far denser than average household goods. */
const BOOK_LBS_PER_CUFT = 23;

const SPECIAL_ITEM = /piano|safe\b|pool table|hot tub|treadmill|elliptical|peloton|grandfather clock|gun safe|aquarium|fish tank|motorcycle|golf cart|chandelier|armoire|sleeper sofa|sectional/i;
const HOME_SIZE_LBS: [number, string, number][] = [
  [0, 'Studio', 2000],
  [1, '1 bedroom', 3000],
  [2, '2 bedrooms', 5000],
  [3, '3 bedrooms', 8000],
  [4, '4 bedrooms', 11000],
  [5, '5+ bedrooms', 14000],
];

export interface MoveSize {
  rooms: number;
  bedrooms: number;
  homeLabel: string;
  itemsToMove: number;
  /** Items riding with the family in the car (not counted anywhere else here). */
  inCarItems: number;
  boxes: number;
  booksToMove: number;
  /** Weight of the books being moved, packed (included in weightLbs on top of the household figure). */
  bookLbs: number;
  /** Small (1.5 cu ft) boxes still needed for books that aren't packed yet. */
  bookBoxesNeeded: number;
  /** Weight from what's logged in the inventory (books included). */
  inventoryLbs: number;
  /** Volume of just what's in the inventory (no typical-home padding). */
  inventoryCubicFeet: number;
  /** Rule-of-thumb weight for this many bedrooms. */
  typicalLbs: number;
  /** Weight used for estimates (the larger of the two — inventories are rarely complete). */
  weightLbs: number;
  basis: 'inventory' | 'typical';
  cubicFeet: number;
  truck: string;
  containers: number;
  specialItems: string[];
  fragileItems: number;
  highValueItems: { name: string; value: number }[];
  byRoom: { room: string; items: number; boxes: number; lbs: number }[];
}

const isMoving = (d: string) => d === 'move' || d === 'store' || d === 'undecided';

/** Weight of one of this item: what was entered, or a typical weight for its category. */
/** Typical weight of one of a few common small things the price table doesn't cover. */
const SMALL_ITEM_LBS: [RegExp, number][] = [
  [/plate|bowl|mug|\bcups?\b|glass(es|ware)?\b|stemware|saucer/i, 1],
  [/cast iron|skillet|dutch oven/i, 6],
  [/\bpots?\b|\bpans?\b|cookware|baking/i, 4],
  [/blender|toaster|coffee|kettle|mixer|air fryer|instant pot|slow cooker|crock ?pot/i, 8],
  [/utensil|silverware|flatware|cutlery|knife|knives/i, 1],
  [/pillow|cushion/i, 2],
  [/picture|photo frame|frames?\b/i, 3],
  [/blanket|throw|towel|sheet/i, 2],
  [/shoes?\b|boots?\b/i, 2],
];

/** One item's weight: what was entered, else a typical weight for that kind of item (by name, then category). */
export function itemWeightLbs(i: Pick<Item, 'category'> & { name?: string; weight_lbs?: number | null }): { lbs: number; actual: boolean } {
  if (i.weight_lbs != null && i.weight_lbs > 0) return { lbs: i.weight_lbs, actual: true };
  const name = i.name ?? '';
  const typical = (name && (priceRowFor(name)?.lbs ?? SMALL_ITEM_LBS.find(([re]) => re.test(name))?.[1])) || CATEGORY_WEIGHT_LBS[i.category] || CATEGORY_WEIGHT_LBS.other!;
  return { lbs: typical, actual: false };
}

/** Items the movers will carry: going with us (or to storage / undecided) and not riding in our car. */
export const isMoverItem = (i: Pick<Item, 'deleted' | 'disposition' | 'in_car'>) => !i.deleted && isMoving(i.disposition) && !i.in_car;

export function estimateMoveSize(db: Pick<Snapshot, 'rooms' | 'items' | 'boxes' | 'books'>, opts: { basis?: 'auto' | 'inventory' } = {}): MoveSize {
  const rooms = db.rooms.filter((r) => !r.deleted);
  const items = db.items.filter(isMoverItem);
  const inCarItems = db.items.filter((i) => !i.deleted && isMoving(i.disposition) && i.in_car).reduce((a, i) => a + Math.max(1, i.quantity ?? 1), 0);
  const boxes = db.boxes.filter((b) => !b.deleted);
  const books = db.books.filter((b) => !b.deleted && isMoving(b.disposition));
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const byRoom = new Map<string, { items: number; boxes: number; lbs: number }>();
  const bump = (roomId: string | null, k: 'items' | 'boxes', n: number, lbs: number) => {
    const key = (roomId && roomName.get(roomId)) || 'Unassigned';
    const r = byRoom.get(key) ?? { items: 0, boxes: 0, lbs: 0 };
    r[k] += n;
    r.lbs += lbs;
    byRoom.set(key, r);
  };

  const bookLbsOf = (b: (typeof books)[number]) => estimateBookWeightOz(b) / 16;
  const bookLbsByBox = new Map<string, number>();
  for (const b of books) if (b.box_id) bookLbsByBox.set(b.box_id, (bookLbsByBox.get(b.box_id) ?? 0) + bookLbsOf(b));

  let lbs = 0;
  let bookLbs = 0;
  for (const b of boxes) {
    const inside = bookLbsByBox.get(b.id);
    // A weighed box is trusted as-is; an unweighed box of books weighs what its books do (plus cardboard).
    const w = b.weight_lbs ?? (inside ? inside + BOOK_BOX_TARE_LBS : DEFAULT_BOX_LBS);
    if (inside) bookLbs += b.weight_lbs ? Math.min(inside, b.weight_lbs) : w;
    lbs += w;
    bump(b.room_id, 'boxes', 1, w);
  }
  const boxIds = new Set(boxes.map((b) => b.id));
  const loose = books.filter((b) => !b.box_id || !boxIds.has(b.box_id));
  const looseLbs = loose.reduce((a, b) => a + bookLbsOf(b), 0);
  const bookBoxesNeeded = looseLbs > 0 ? Math.ceil(looseLbs / BOOK_BOX_MAX_LBS) : 0;
  for (const b of loose) bump(b.room_id, 'items', 0, bookLbsOf(b));
  lbs += looseLbs + bookBoxesNeeded * BOOK_BOX_TARE_LBS;
  bookLbs += looseLbs + bookBoxesNeeded * BOOK_BOX_TARE_LBS;
  let count = 0;
  for (const i of items) {
    const qty = Math.max(1, i.quantity ?? 1);
    count += qty;
    const w = i.box_id ? 0 : itemWeightLbs(i).lbs * qty;
    lbs += w;
    bump(i.room_id, 'items', qty, w);
  }
  const bedrooms = rooms.filter((r) => /bed|nursery|kid|guest|child|['’]s room/i.test(r.name) && !/bath|closet/i.test(r.name)).length;
  const sizeRow = HOME_SIZE_LBS[Math.min(bedrooms, 5)]!;
  const typicalLbs = rooms.length ? Math.max(sizeRow[2], bedrooms === 0 ? rooms.length * 700 : 0) : 0;
  const inventoryLbs = Math.round(lbs);
  // Books are added on top of the household figure: a typical-home estimate doesn't account for a big library.
  const otherLbs = Math.round(lbs - bookLbs);
  // Downsizing households can size the move from their inventory alone instead of the house size.
  const basis = otherLbs >= typicalLbs || (opts.basis === 'inventory' && otherLbs > 0) ? 'inventory' : 'typical';
  const baseLbs = basis === 'inventory' ? otherLbs : typicalLbs;
  const weightLbs = Math.round(baseLbs + bookLbs);
  const cubicFeet = Math.round(baseLbs / LBS_PER_CUFT + bookLbs / BOOK_LBS_PER_CUFT);
  const truck = cubicFeet <= 380 ? '10-ft truck' : cubicFeet <= 760 ? '15-ft truck' : cubicFeet <= 1010 ? '20-ft truck' : cubicFeet <= 1680 ? '26-ft truck' : '26-ft truck + trailer, or full-service';

  return {
    rooms: rooms.length,
    bedrooms,
    homeLabel: rooms.length ? sizeRow[1] : '—',
    itemsToMove: count,
    inCarItems,
    boxes: boxes.length,
    booksToMove: books.length,
    bookLbs: Math.round(bookLbs),
    bookBoxesNeeded,
    inventoryLbs,
    inventoryCubicFeet: Math.round(otherLbs / LBS_PER_CUFT + bookLbs / BOOK_LBS_PER_CUFT),
    typicalLbs,
    weightLbs,
    basis,
    cubicFeet,
    truck,
    containers: Math.max(1, Math.ceil(cubicFeet / 850)),
    specialItems: items.filter((i) => SPECIAL_ITEM.test(`${i.name} ${i.model}`)).map((i) => i.name),
    fragileItems: items.filter((i) => i.fragile).length,
    highValueItems: items
      .filter((i) => (i.est_value ?? 0) >= 500)
      .map((i) => ({ name: i.name, value: i.est_value ?? 0 }))
      .sort((a, b) => b.value - a.value),
    byRoom: [...byRoom].map(([room, r]) => ({ room, ...r, lbs: Math.round(r.lbs) })).sort((a, b) => b.lbs - a.lbs),
  };
}

export type MoveMethod = 'full_service' | 'self_pack' | 'container' | 'rental_truck';

export interface MethodEstimate {
  method: MoveMethod;
  label: string;
  low: number;
  high: number;
  mid: number;
  includes: string;
  breakdown: { label: string; amount: number }[];
}

const round50 = (n: number) => Math.round(n / 50) * 50;

/** Ballpark cost ranges for each way of moving, from weight and driving distance. Planning estimates only. */
export function estimateMoveCosts(size: Pick<MoveSize, 'weightLbs' | 'cubicFeet' | 'containers'>, miles: number, opts: { fuelPrice?: number } = {}): MethodEstimate[] {
  const w = Math.max(size.weightLbs, 1000);
  const mi = Math.max(miles, 50);
  const fuel = opts.fuelPrice ?? 3.4;

  const lineHaul = w * (0.4 + mi * 0.00045);
  const packing = w * 0.12;
  const full = lineHaul + packing;
  const containerEach = 1100 + mi * 1.0;
  const container = containerEach * size.containers;
  const truckRental = 500 + mi * 1.05;
  const truckFuel = (mi / 9) * fuel;
  const nights = Math.max(0, Math.ceil(mi / 500) - 1);
  const hotels = nights * 130;
  const labor = 2 * 350;
  const truck = truckRental + truckFuel + hotels + labor;

  const make = (method: MoveMethod, label: string, mid: number, lo: number, hi: number, includes: string, breakdown: { label: string; amount: number }[]): MethodEstimate => ({
    method,
    label,
    mid: round50(mid),
    low: round50(mid * lo),
    high: round50(mid * hi),
    includes,
    breakdown: breakdown.map((b) => ({ ...b, amount: round50(b.amount) })),
  });

  return [
    make('full_service', 'Full-service movers', full, 0.8, 1.35, 'They pack, load, drive and unload', [
      { label: 'Transport (weight × distance)', amount: lineHaul },
      { label: 'Packing & materials', amount: packing },
    ]),
    make('self_pack', 'Movers — we pack', lineHaul, 0.8, 1.3, 'You pack; they load, drive and unload', [{ label: 'Transport (weight × distance)', amount: lineHaul }]),
    make('container', `Portable container (${size.containers}×)`, container, 0.8, 1.25, 'You pack & load; they drive it', [
      { label: `${size.containers} container${size.containers > 1 ? 's' : ''} × ${Math.round(mi).toLocaleString()} mi`, amount: container },
    ]),
    make('rental_truck', 'Rental truck (DIY)', truck, 0.85, 1.2, 'You do everything and drive', [
      { label: 'One-way truck rental', amount: truckRental },
      { label: `Fuel (~${Math.round(mi / 9)} gal)`, amount: truckFuel },
      { label: `Hotels (${nights} night${nights === 1 ? '' : 's'})`, amount: hotels },
      { label: 'Hourly loading/unloading help', amount: labor },
    ]),
  ];
}

export interface QuoteFlag {
  level: 'bad' | 'warn' | 'good';
  text: string;
}

/** Red flags and good signs for a mover's quote. */
export function quoteFlags(q: MoverQuote, ctx: { estimateLow?: number; weightLbs?: number; interstate?: boolean } = {}): QuoteFlag[] {
  const out: QuoteFlag[] = [];
  const price = q.price ?? 0;
  if (ctx.interstate !== false && !q.usdot.trim()) out.push({ level: 'bad', text: 'No USDOT number — interstate movers must have one. Verify with FMCSA before booking.' });
  if (q.usdot.trim()) out.push({ level: 'good', text: 'USDOT listed — check it on FMCSA' });
  if (price && ctx.estimateLow && price < ctx.estimateLow * 0.7) out.push({ level: 'bad', text: 'Far below typical cost — lowball quotes are a common bait-and-switch sign.' });
  if (price && q.deposit && q.deposit > price * 0.2) out.push({ level: 'bad', text: `Deposit is ${Math.round((q.deposit / price) * 100)}% — reputable movers rarely ask for more than ~20% up front.` });
  if (q.quote_type === 'indicative') out.push({ level: 'warn', text: 'Indicative online price — not an estimate yet. Book the free survey and get a written binding or not-to-exceed estimate.' });
  else if (q.quote_type === 'non_binding') out.push({ level: 'warn', text: 'Non-binding: the final bill can go up (you owe at most 110% at delivery, the rest within 30 days).' });
  else out.push({ level: 'good', text: q.quote_type === 'binding_not_to_exceed' ? 'Binding not-to-exceed — price can only go down' : 'Binding — price is locked' });
  if (q.survey_type === 'none') out.push({ level: 'warn', text: 'No in-home or video survey — the quote is a guess and may change.' });
  if (q.valuation === 'released') out.push({ level: 'warn', text: 'Released value only pays $0.60 per lb per item — a 10-lb TV gets $6.' });
  else if (q.valuation === 'full_value') out.push({ level: 'good', text: 'Full value protection' });
  if (q.estimated_weight_lbs && ctx.weightLbs && Math.abs(q.estimated_weight_lbs - ctx.weightLbs) / ctx.weightLbs > 0.3) {
    out.push({ level: 'warn', text: `Their weight (${q.estimated_weight_lbs.toLocaleString()} lbs) is far from ours (${ctx.weightLbs.toLocaleString()} lbs) — ask how they got it.` });
  }
  return out;
}

export interface QuoteRanking {
  id: string;
  score: number;
  bad: number;
}

/** Best value = cheapest quote without serious red flags (binding & full value break ties). */
export function bestQuote(quotes: MoverQuote[], ctx: Parameters<typeof quoteFlags>[1] = {}): string | null {
  const ranked = quotes
    .filter((q) => !q.deleted && q.status !== 'rejected' && q.price)
    .map((q) => {
      const flags = quoteFlags(q, ctx);
      const bad = flags.filter((f) => f.level === 'bad').length;
      const warn = flags.filter((f) => f.level === 'warn').length;
      return { id: q.id, bad, score: (q.price ?? 0) * (1 + warn * 0.05) };
    })
    .sort((a, b) => a.bad - b.bad || a.score - b.score);
  return ranked[0]?.id ?? null;
}

export interface MoverDirectoryEntry {
  name: string;
  kind: 'full_service' | 'container' | 'truck' | 'labor';
  url: string;
  note: string;
}

export const MOVER_DIRECTORY: MoverDirectoryEntry[] = [
  { name: 'United Van Lines', kind: 'full_service', url: 'https://www.unitedvanlines.com/', note: 'Large interstate van line, in-home & virtual surveys' },
  { name: 'Allied Van Lines', kind: 'full_service', url: 'https://www.allied.com/', note: 'Interstate full-service' },
  { name: 'North American Van Lines', kind: 'full_service', url: 'https://www.northamerican.com/', note: 'Often used for corporate relocations' },
  { name: 'Mayflower', kind: 'full_service', url: 'https://www.mayflower.com/', note: 'Interstate full-service' },
  { name: 'Atlas Van Lines', kind: 'full_service', url: 'https://www.atlasvanlines.com/', note: 'Agent network, good for corporate moves' },
  { name: 'Bekins', kind: 'full_service', url: 'https://www.bekins.com/', note: 'Interstate full-service' },
  { name: 'U-Pack', kind: 'container', url: 'https://www.upack.com/', note: 'You load; pay only for the space used' },
  { name: 'PODS', kind: 'container', url: 'https://www.pods.com/', note: 'Containers with optional storage' },
  { name: '1-800-PACK-RAT', kind: 'container', url: 'https://www.1800packrat.com/', note: 'Steel containers, long-distance' },
  { name: 'U-Haul U-Box', kind: 'container', url: 'https://www.uhaul.com/UBox/', note: 'Smaller wooden containers' },
  { name: 'U-Haul trucks', kind: 'truck', url: 'https://www.uhaul.com/Truck-Rentals/', note: 'One-way truck rental' },
  { name: 'Penske Truck Rental', kind: 'truck', url: 'https://www.pensketruckrental.com/', note: 'One-way, newer trucks' },
  { name: 'Budget Truck Rental', kind: 'truck', url: 'https://www.budgettruck.com/', note: 'One-way, frequent discounts' },
  { name: 'HireAHelper', kind: 'labor', url: 'https://www.hireahelper.com/', note: 'Hourly loading/unloading crews for trucks & containers' },
];

export const MOVER_QUESTIONS = [
  'Are you the carrier or a broker? (Brokers sell your job to another company.)',
  'What is your USDOT and MC number?',
  'Is this estimate binding or binding not-to-exceed?',
  'What does valuation coverage cost for full value protection?',
  'Are there extra charges for stairs, long carries, elevators, shuttles or bulky items?',
  'What is the guaranteed pickup and delivery window? Is there a per-day penalty if late?',
  'What deposit is required and how is it paid? (Avoid cash-only.)',
  'Do you need a 2nd truck or shuttle if a semi can’t reach the new address?',
  'Can storage-in-transit be added if the apartment isn’t ready?',
  'How are claims for damage handled and how long do they take?',
  'Is a holiday-season move (late December / early January) priced differently, and do you have availability then?',
  'Can you guarantee delivery by our deadline in writing?',
  'Does a flexible load window lower the price?',
  'Will our things be on a dedicated truck or consolidated with other shipments?',
  'Are your crews your own employees, or subcontracted?',
  'If our final inventory ends up smaller than this list, will the price go down?',
  'Is packing material included, or charged separately?',
  'Are fuel surcharges, tolls and long-distance fees included in the price?',
];

/** Questions ticked by default in the quote email (indexes into MOVER_QUESTIONS). */
export const DEFAULT_EMAIL_QUESTIONS = [0, 1, 2, 3, 5, 10, 11, 15];

export const PLEASE_INCLUDE = [
  'Total price and estimate type (binding / not-to-exceed)',
  'Your USDOT and MC numbers',
  'Valuation options and cost (full value protection)',
  'Deposit amount and payment terms',
  'Pickup and delivery windows',
  'Any extra charges (stairs, long carry, shuttle, bulky items)',
];

export type QuoteSection =
  | 'details'
  | 'size'
  | 'books'
  | 'special'
  | 'fragile'
  | 'highValue'
  | 'notes'
  | 'itemList'
  | 'attachment'
  | 'pleaseInclude'
  | 'questions'
  | 'walkthrough'
  | 'emailOnly';

export const QUOTE_SECTIONS: { key: QuoteSection; label: string; on: boolean }[] = [
  { key: 'details', label: 'Move details (from, to, dates, home)', on: true },
  { key: 'notes', label: 'Our notes', on: true },
  { key: 'size', label: 'Item, box & book counts', on: true },
  { key: 'books', label: 'Books', on: true },
  { key: 'special', label: 'Bulky / special items', on: true },
  { key: 'fragile', label: 'Fragile item count', on: true },
  { key: 'highValue', label: 'High-value items', on: true },
  { key: 'attachment', label: 'Mention the attached inventory PDF', on: true },
  { key: 'itemList', label: 'Full item list in the email body', on: false },
  { key: 'pleaseInclude', label: '“Please include in your quote” list', on: true },
  { key: 'questions', label: 'Questions', on: true },
  { key: 'walkthrough', label: 'Offer a video walk-through', on: true },
  { key: 'emailOnly', label: 'Ask them to reply by email only (no phone number)', on: true },
];

export interface QuoteListItem {
  room: string;
  name: string;
  qty: number;
  note?: string;
}

export interface QuoteRequestOptions {
  name?: string;
  phone?: string;
  email?: string;
  method?: string;
  sections?: Partial<Record<QuoteSection, boolean>>;
  /** Replaces the load date line, e.g. "Flexible — anytime from …". */
  loadWindow?: string;
  /** Replaces the delivery date line. */
  deliveryWindow?: string;
  notes?: string[];
  questions?: string[];
  pleaseInclude?: string[];
  items?: QuoteListItem[];
}

const fmtDate = (d: string | null) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'flexible');

/** Items grouped by room, one line per room — compact enough for an email body. */
export function itemListLines(items: QuoteListItem[]): string[] {
  const rooms = new Map<string, QuoteListItem[]>();
  for (const i of items) rooms.set(i.room, [...(rooms.get(i.room) ?? []), i]);
  return [...rooms].map(([room, list]) => `• ${room}: ${list.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ')}`);
}

/** A ready-to-send quote request with everything a mover needs to price the job. */
export function quoteRequestText(move: Move | undefined, size: MoveSize, opts: QuoteRequestOptions = {}): { subject: string; body: string } {
  const on = (k: QuoteSection) => opts.sections?.[k] ?? QUOTE_SECTIONS.find((s) => s.key === k)!.on;
  const from = move ? [move.from_city, move.from_state, move.from_zip].filter(Boolean).join(', ') : '';
  const to = move ? [move.to_city, move.to_state, move.to_zip].filter(Boolean).join(', ') : '';
  const method =
    opts.method ?? (move?.moving_method === 'self_pack' ? 'loading, transport and unloading (we will pack)' : move?.moving_method === 'container' ? 'a portable container' : 'full-service packing, loading, transport and unloading');
  const notes = (opts.notes ?? []).map((n) => n.trim()).filter(Boolean);
  const questions = opts.questions ?? DEFAULT_EMAIL_QUESTIONS.map((i) => MOVER_QUESTIONS[i]!);
  const include = opts.pleaseInclude ?? PLEASE_INCLUDE;
  const items = opts.items ?? [];
  const emailOnly = on('emailOnly');
  const section = (title: string, rows: string[]) => (rows.length ? ['', title, ...rows] : []);

  // Weight and volume stay out of the email — they're in the attached PDF, from the actual inventory.
  const sizeRows = [
    ...(on('size') ? [`• ${size.itemsToMove} items${size.boxes ? `, ${size.boxes} boxes` : ''}${size.booksToMove ? `, ${size.booksToMove} books` : ''}${on('attachment') ? ' — weights are in the attached inventory' : ''}`] : []),
    ...(on('books') && size.booksToMove ? [`• Books: ${size.booksToMove.toLocaleString()} books${size.bookBoxesNeeded ? ` — about ${size.bookBoxesNeeded} small book boxes` : ''}`] : []),
    ...(on('special') && size.specialItems.length ? [`• Bulky / special items: ${size.specialItems.join(', ')}`] : []),
    ...(on('fragile') && size.fragileItems ? [`• ${size.fragileItems} fragile items`] : []),
    ...(on('highValue') && size.highValueItems.length ? [`• High-value items: ${size.highValueItems.slice(0, 6).map((h) => h.name).join(', ')}`] : []),
  ];

  const lines = [
    'Hello,',
    '',
    `We're moving long-distance and would like a written ${move?.moving_method === 'container' ? 'quote' : 'binding (or binding not-to-exceed) estimate'} for ${method}.`,
    ...section(
      'MOVE DETAILS',
      on('details')
        ? [
            `• From: ${from || '—'}${move?.distance_miles ? `  (${move.distance_miles.toLocaleString()} driving miles)` : ''}`,
            `• To: ${to || '—'}`,
            `• Load date: ${opts.loadWindow?.trim() || fmtDate(move?.load_date ?? move?.move_date ?? null)}`,
            `• Delivery needed by: ${opts.deliveryWindow?.trim() || fmtDate(move?.delivery_date ?? null)}`,
            `• Home: ${size.homeLabel}${size.rooms ? `, ${size.rooms} rooms` : ''}${move?.to_tenure === 'rent' ? ' → moving into a rental' : ''}`,
          ]
        : [],
    ),
    ...(on('notes') && notes.length ? ['', 'PLEASE NOTE', ...notes.map((n) => `• ${n}`)] : []),
    ...section('SIZE (from our inventory)', sizeRows),
    ...(on('attachment') ? ['', `📎 Attached is an itemized inventory (PDF) of everything we need moved${items.length ? ` — ${items.reduce((a, i) => a + i.qty, 0)} items` : ''}, room by room, with weights.`] : []),
    ...(on('itemList') && items.length ? section('ITEMS TO MOVE', itemListLines(items)) : []),
    ...(on('pleaseInclude') ? section('PLEASE INCLUDE IN YOUR QUOTE', include.map((s) => `• ${s}`)) : []),
    ...(on('questions') ? section('QUESTIONS', questions.map((q, i) => `${i + 1}. ${q}`)) : []),
    '',
    [
      on('walkthrough') ? "We're happy to do a video walk-through." : '',
      emailOnly ? 'Please reply by email only — we are not taking phone calls about this move.' : '',
    ]
      .filter(Boolean)
      .join(' '),
    '',
    'Thank you,',
    opts.name || '',
    (emailOnly ? [opts.email] : [opts.phone, opts.email]).filter(Boolean).join(' · '),
  ];
  return {
    subject: `Moving quote request: ${move?.from_city || 'our home'} → ${move?.to_city || 'new city'}${opts.loadWindow?.trim() ? ' (flexible dates)' : move?.load_date || move?.move_date ? ` (${fmtDate(move?.load_date ?? move?.move_date ?? null)})` : ''}`,
    body: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
  };
}