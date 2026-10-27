import { guessItemCategory } from './products';

/** Kind of room, guessed from its name — drives which items we suggest. */
export type RoomType = 'bedroom' | 'kids' | 'nursery' | 'living' | 'kitchen' | 'dining' | 'bathroom' | 'office' | 'garage' | 'laundry' | 'patio' | 'closet' | 'other';

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  bedroom: 'Bedroom',
  kids: "Kid's room",
  nursery: 'Nursery',
  living: 'Living room',
  kitchen: 'Kitchen',
  dining: 'Dining room',
  bathroom: 'Bathroom',
  office: 'Office',
  garage: 'Garage',
  laundry: 'Laundry',
  patio: 'Patio / yard',
  closet: 'Closet / storage',
  other: 'Other room',
};

export function roomTypeFromName(name: string): RoomType {
  const n = name.toLowerCase();
  if (/nursery|baby/.test(n)) return 'nursery';
  if (/kid|child|boy|girl|\bson\b|daughter|play ?room|'s (bed)?room/.test(n)) return 'kids';
  if (/bed|guest|master|primary suite/.test(n)) return 'bedroom';
  if (/living|family|den|great room|lounge|tv room/.test(n)) return 'living';
  if (/kitchen|pantry/.test(n)) return 'kitchen';
  if (/dining/.test(n)) return 'dining';
  if (/bath|powder/.test(n)) return 'bathroom';
  if (/office|study|work/.test(n)) return 'office';
  if (/garage|shed|workshop/.test(n)) return 'garage';
  if (/laundry|utility/.test(n)) return 'laundry';
  if (/patio|yard|porch|deck|balcony|garden/.test(n)) return 'patio';
  if (/closet|storage|attic|basement/.test(n)) return 'closet';
  return 'other';
}

/**
 * COCO object-detector labels (what the on-device model can see) → inventory names.
 * null = not a household item (people, pets, food, cars, fixtures).
 */
export const DETECTOR_LABELS: Record<string, string | null> = {
  bed: 'Bed',
  couch: 'Sofa',
  chair: 'Chair',
  'dining table': 'Table',
  tv: 'TV',
  laptop: 'Laptop',
  'potted plant': 'Potted plant',
  clock: 'Clock',
  vase: 'Vase',
  book: 'Books',
  refrigerator: 'Refrigerator',
  oven: 'Range / oven',
  microwave: 'Microwave',
  toaster: 'Toaster',
  bench: 'Bench',
  bicycle: 'Bicycle',
  suitcase: 'Suitcase',
  backpack: 'Backpack',
  handbag: 'Handbag',
  umbrella: 'Umbrella',
  'teddy bear': 'Stuffed animal',
  'hair drier': 'Hair dryer',
  keyboard: 'Keyboard',
  mouse: 'Computer mouse',
  remote: null,
  'cell phone': null,
  'sports ball': 'Sports balls',
  skateboard: 'Skateboard',
  surfboard: 'Surfboard',
  'tennis racket': 'Tennis racket',
  'baseball bat': 'Baseball bat',
  'baseball glove': 'Baseball glove',
  skis: 'Skis',
  snowboard: 'Snowboard',
  kite: 'Kite',
  'wine glass': 'Wine glasses',
  cup: 'Mugs & cups',
  bowl: 'Bowls',
  bottle: null,
  fork: null,
  knife: null,
  spoon: null,
  scissors: null,
  toothbrush: null,
  sink: null,
  toilet: null,
  person: null,
  cat: null,
  dog: null,
};

/** Things that are counted as a set rather than one-by-one (a shelf of books is "Books", not 23 items). */
const AS_A_SET = new Set(['Books', 'Mugs & cups', 'Bowls', 'Wine glasses', 'Sports balls']);

export interface PixelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Detection {
  label: string;
  score: number;
  /** Pixel box in the source photo. */
  box?: PixelBox;
}

export interface ScannedItem {
  key: string;
  name: string;
  quantity: number;
  category: string;
  /** 0–1. Suggestions that weren't seen get 0. */
  confidence: number;
  source: 'photo' | 'suggested' | 'manual' | 'ai';
  /** Which photo(s) it was seen in. */
  photos: number[];
  /** Ticked = will be added to inventory. */
  keep: boolean;
  /** Best sighting, for cropping a thumbnail of just this item. */
  crop?: { photo: number; box: PixelBox };
}

/**
 * Merge detections from several photos of the same room. Counts use the most
 * seen in any *one* photo, because two photos of the same room usually show the
 * same bed twice — not two beds.
 */
export function mergeDetections(perPhoto: Detection[][], minScore = 0.35): ScannedItem[] {
  const best = new Map<string, { qty: number; score: number; photos: number[]; crop?: { photo: number; box: PixelBox } }>();
  perPhoto.forEach((dets, idx) => {
    const counts = new Map<string, { n: number; score: number; box?: PixelBox }>();
    for (const d of dets) {
      if (d.score < minScore) continue;
      const name = DETECTOR_LABELS[d.label.toLowerCase()];
      if (!name) continue;
      const c = counts.get(name) ?? { n: 0, score: 0 };
      c.n += 1;
      if (d.score > c.score) {
        c.score = d.score;
        c.box = d.box;
      }
      counts.set(name, c);
    }
    for (const [name, c] of counts) {
      const prev = best.get(name) ?? { qty: 0, score: 0, photos: [] };
      prev.qty = Math.max(prev.qty, AS_A_SET.has(name) ? 1 : c.n);
      if (c.score > prev.score) {
        prev.score = c.score;
        prev.crop = c.box ? { photo: idx, box: c.box } : prev.crop;
      }
      prev.photos.push(idx);
      best.set(name, prev);
    }
  });
  return [...best.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .map(([name, v]) => ({
      key: `det:${name}`,
      name,
      quantity: v.qty,
      category: guessItemCategory(name),
      confidence: Math.round(v.score * 100) / 100,
      source: 'photo' as const,
      photos: v.photos,
      keep: true,
      ...(v.crop ? { crop: v.crop } : {}),
    }));
}

interface Suggestion {
  name: string;
  qty?: number;
  /** Only suggest when one of these was seen (e.g. nightstands go with a bed). */
  when?: string[];
}

/** What's usually in each kind of room — offered (unticked) for the things the camera can't name. */
export const ROOM_SUGGESTIONS: Record<RoomType, Suggestion[]> = {
  bedroom: [
    { name: 'Mattress', when: ['Bed'] },
    { name: 'Nightstand', qty: 2, when: ['Bed'] },
    { name: 'Dresser' },
    { name: 'Makeup vanity' },
    { name: 'Mirror' },
    { name: 'Table lamp', qty: 2 },
    { name: 'Headboard', when: ['Bed'] },
    { name: 'Bedding & pillows' },
    { name: 'Clothes' },
    { name: 'Rug' },
    { name: 'Wall art' },
  ],
  kids: [
    { name: 'Mattress', when: ['Bed'] },
    { name: 'Nightstand', when: ['Bed'] },
    { name: 'Dresser' },
    { name: 'Desk' },
    { name: 'Bookcase' },
    { name: 'Toy bin / toys' },
    { name: 'Lamp' },
    { name: 'Bedding & pillows' },
    { name: 'Clothes' },
    { name: 'Rug' },
  ],
  nursery: [{ name: 'Crib' }, { name: 'Changing table' }, { name: 'Dresser' }, { name: 'Glider / rocker' }, { name: 'Stroller' }, { name: 'High chair' }, { name: 'Baby clothes' }, { name: 'Toys' }],
  living: [
    { name: 'Coffee table', when: ['Sofa'] },
    { name: 'TV stand', when: ['TV'] },
    { name: 'Side table', qty: 2 },
    { name: 'Floor lamp' },
    { name: 'Rug' },
    { name: 'Bookcase', when: ['Books'] },
    { name: 'Accent chair' },
    { name: 'Throw pillows & blankets', when: ['Sofa'] },
    { name: 'Soundbar / speakers', when: ['TV'] },
    { name: 'Wall art' },
    { name: 'Curtains' },
  ],
  kitchen: [{ name: 'Dishes' }, { name: 'Pots & pans' }, { name: 'Small appliances' }, { name: 'Coffee maker' }, { name: 'Bar stools', qty: 2 }, { name: 'Kitchen table' }, { name: 'Pantry food' }, { name: 'Utensils & knives' }],
  dining: [{ name: 'Dining chair', qty: 4, when: ['Table', 'Chair'] }, { name: 'Sideboard / buffet' }, { name: 'Rug' }, { name: 'Light fixture' }, { name: 'Tableware' }],
  bathroom: [{ name: 'Towels' }, { name: 'Bath mat' }, { name: 'Shower curtain' }, { name: 'Toiletries' }, { name: 'Storage cart' }, { name: 'Hair tools' }],
  office: [{ name: 'Desk' }, { name: 'Office chair' }, { name: 'Monitor' }, { name: 'Printer' }, { name: 'Bookcase' }, { name: 'Filing cabinet' }, { name: 'Desk lamp' }],
  garage: [{ name: 'Tool box' }, { name: 'Lawn mower' }, { name: 'Ladder' }, { name: 'Storage shelves' }, { name: 'Bins' }, { name: 'Bicycle' }, { name: 'Holiday decorations' }],
  laundry: [{ name: 'Washer' }, { name: 'Dryer' }, { name: 'Laundry baskets' }, { name: 'Iron & ironing board' }, { name: 'Drying rack' }],
  patio: [{ name: 'Patio set' }, { name: 'Grill' }, { name: 'Planters' }, { name: 'Outdoor chairs' }, { name: 'Garden hose' }],
  closet: [{ name: 'Storage bins' }, { name: 'Clothes' }, { name: 'Shoes' }, { name: 'Luggage' }, { name: 'Holiday decorations' }],
  other: [{ name: 'Lamp' }, { name: 'Rug' }, { name: 'Wall art' }, { name: 'Shelves' }],
};

const same = (a: string, b: string) => {
  const x = a.toLowerCase().replace(/s$/, '');
  const y = b.toLowerCase().replace(/s$/, '');
  return x === y || x.includes(y) || y.includes(x);
};

/** Room-typical extras, skipping anything already detected. Unticked by default. */
export function roomSuggestions(type: RoomType, detected: string[]): ScannedItem[] {
  return ROOM_SUGGESTIONS[type]
    .filter((s) => !s.when || s.when.some((w) => detected.some((d) => same(d, w))))
    .filter((s) => !detected.some((d) => same(d, s.name)))
    .map((s) => ({ key: `sug:${s.name}`, name: s.name, quantity: s.qty ?? 1, category: guessItemCategory(s.name), confidence: 0, source: 'suggested' as const, photos: [], keep: false }));
}

/** Refine generic detector names using the room: a "Table" in a bedroom is likely a nightstand or desk, etc. */
export function refineForRoom(items: ScannedItem[], type: RoomType): ScannedItem[] {
  return items.map((i) => {
    if (i.name === 'Table') {
      const name = type === 'dining' || type === 'kitchen' ? 'Dining table' : type === 'living' ? 'Coffee table' : type === 'office' ? 'Desk' : type === 'bedroom' || type === 'kids' ? 'Desk' : 'Table';
      return { ...i, name, category: guessItemCategory(name) };
    }
    if (i.name === 'Chair' && (type === 'dining' || type === 'kitchen')) return { ...i, name: 'Dining chair' };
    if (i.name === 'Chair' && type === 'office') return { ...i, name: 'Office chair' };
    if (i.name === 'Chair' && (type === 'living' || type === 'bedroom')) return { ...i, name: 'Accent chair', category: guessItemCategory('Accent chair') };
    if (i.name === 'Bed' && type === 'nursery') return { ...i, name: 'Crib' };
    // Big sectionals and chaises often read as "bed" to the detector.
    if (i.name === 'Bed' && (type === 'living' || type === 'office' || type === 'patio')) return { ...i, name: type === 'patio' ? 'Outdoor lounger' : 'Sofa / sectional', category: guessItemCategory('Sofa') };
    return i;
  }).reduce<ScannedItem[]>((out, i) => {
    const twin = out.find((o) => o.name === i.name || (o.name.startsWith('Sofa') && i.name.startsWith('Sofa')));
    if (!twin) return [...out, i];
    twin.quantity = Math.max(twin.quantity, i.quantity);
    if (i.confidence > twin.confidence) {
      twin.confidence = i.confidence;
      if (i.crop) twin.crop = i.crop;
    }
    twin.photos = [...new Set([...twin.photos, ...i.photos])];
    return out;
  }, []);
}

const area = (b: PixelBox) => Math.max(0, b.w) * Math.max(0, b.h);
function overlap(a: PixelBox, b: PixelBox) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * One object seen in the full photo and again in zoomed tiles should count once.
 * Keeps the highest-scoring box and drops same-label boxes that mostly overlap it
 * or sit mostly inside it (a tile that only saw half the bed).
 */
export function suppressDuplicates(dets: Detection[], iou = 0.45, inside = 0.7): Detection[] {
  const sorted = [...dets].sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  for (const d of sorted) {
    const dup = d.box && kept.some((k) => {
      if (!k.box || DETECTOR_LABELS[k.label.toLowerCase()] !== DETECTOR_LABELS[d.label.toLowerCase()]) return false;
      const o = overlap(k.box, d.box!);
      const small = Math.min(area(k.box), area(d.box!)) || 1;
      return o / (area(k.box) + area(d.box!) - o || 1) > iou || o / small > inside;
    });
    if (!dup) kept.push(d);
  }
  return kept;
}
