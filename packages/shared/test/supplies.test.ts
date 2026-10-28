import { describe, expect, it } from 'vitest';
import { estimateMoveSize, itemWeightLbs, estimateSupplies, isBulkyItem, packItemsFor, packLane, packLocally, parseDims, roomKind, suppliesShoppingList, type Item, type Snapshot } from '../src';

const books = (n: number, extra: object = {}) =>
  Array.from({ length: n }, (_, i) => ({ id: `b${i}`, title: `Book ${i}`, disposition: 'move', format: 'paperback', pages: 320, box_id: null, room_id: 'r1', ...extra }));

describe('book weight in the move size', () => {
  it('adds hundreds of loose books on top of the household estimate', () => {
    const base = { rooms: [{ id: 'r1', name: 'Living room' }], items: [], boxes: [] } as unknown as Snapshot;
    const without = estimateMoveSize({ ...base, books: [] });
    const withBooks = estimateMoveSize({ ...base, books: books(300) } as unknown as Snapshot);
    expect(withBooks.bookLbs).toBeGreaterThan(200);
    expect(withBooks.bookLbs).toBeLessThan(330);
    expect(withBooks.weightLbs - without.weightLbs).toBe(withBooks.bookLbs);
    expect(withBooks.bookBoxesNeeded).toBe(Math.ceil((withBooks.bookLbs - withBooks.bookBoxesNeeded) / 35));
    expect(withBooks.cubicFeet).toBeGreaterThan(without.cubicFeet);
  });

  it('ignores books being sold or donated', () => {
    const db = { rooms: [{ id: 'r1', name: 'Den' }], items: [], boxes: [], books: books(50, { disposition: 'sell' }) } as unknown as Snapshot;
    expect(estimateMoveSize(db).bookLbs).toBe(0);
  });
});

describe('packing supplies', () => {
  it('classifies rooms', () => {
    expect(roomKind('Kitchen')).toBe('kitchen');
    expect(roomKind('Primary bedroom')).toBe('primary');
    expect(roomKind("Kids' room")).toBe('bedroom');
    expect(roomKind('Primary bathroom')).toBe('bath');
    expect(roomKind('Sam’s room')).toBe('bedroom');
    expect(roomKind('Garage')).toBe('garage');
    expect(roomKind('Sunroom')).toBe('other');
  });

  it('uses typical-room counts for a sparse inventory and adds book boxes', () => {
    const db = { rooms: [{ id: 'r1', name: 'Kitchen' }, { id: 'r2', name: 'Bedroom' }], items: [], boxes: [], books: books(100) } as unknown as Snapshot;
    const s = estimateSupplies(db, { basis: 'typical' });
    expect(s.rooms.every((r) => r.basis === 'typical')).toBe(true);
    expect(s.boxes.dish).toBe(4);
    expect(s.boxes.wardrobe).toBe(2);
    expect(s.bookBoxes).toBeGreaterThan(0);
    expect(s.boxes.small).toBe(4 + 2 + s.bookBoxes);
    expect(s.lines.find((l) => l.key === 'tape')!.qty).toBe(Math.ceil(s.totalBoxes / 15) + 1);
    expect(s.lines.find((l) => l.key === 'mattress')!.qty).toBe(1);
    expect(s.totalCost).toBeGreaterThan(0);
    expect(suppliesShoppingList(s)).toMatch(/Dish pack/);
  });

  it('sizes from the inventory when it is bigger, and subtracts boxes already made', () => {
    const db = {
      rooms: [{ id: 'r1', name: 'Kitchen' }],
      items: [
        { id: 'i1', name: 'Dinner plates', category: 'kitchenware', quantity: 150, disposition: 'move', room_id: 'r1', box_id: null, fragile: true },
        { id: 'i2', name: 'Pots & pans', category: 'kitchenware', quantity: 120, disposition: 'move', room_id: 'r1', box_id: null },
        { id: 'i3', name: 'Old blender', category: 'kitchenware', quantity: 1, disposition: 'donate', room_id: 'r1', box_id: null },
      ],
      boxes: [{ id: 'x1', room_id: 'r1' }, { id: 'x2', room_id: 'r1' }],
      books: [],
    } as unknown as Snapshot;
    const s = estimateSupplies(db);
    expect(s.rooms[0]!.basis).toBe('inventory');
    expect(s.boxes.dish).toBe(6);
    const packed = packLocally(packItemsFor(db.items.slice(0, 2) as Item[])).boxes;
    const regular = (b: Record<'small' | 'medium' | 'large' | 'xl', number>) => b.small + b.medium + b.large + b.xl;
    expect(regular(s.boxes)).toBe(regular(packed) - 2);
    expect(s.haveBoxes).toBe(2);
  });
});

describe('packing from the inventory', () => {
  const item = (o: Partial<Item>) => ({ id: 'i', name: 'Thing', category: 'other', quantity: 1, disposition: 'move', room_id: 'r1', box_id: null, model: '', ...o }) as Item;

  it('never boxes big furniture, mattresses or appliances', () => {
    expect(isBulkyItem(item({ name: 'Sectional couch' }))).toBe(true);
    expect(isBulkyItem(item({ name: 'Queen mattress' }))).toBe(true);
    expect(isBulkyItem(item({ name: 'Anything', category: 'furniture' }))).toBe(true);
    expect(isBulkyItem(item({ name: 'Mattress protector' }))).toBe(false);
    expect(isBulkyItem(item({ name: 'Table lamp' }))).toBe(false);
    expect(isBulkyItem(item({ name: 'Table lamp', category: 'furniture' }))).toBe(false);
    expect(isBulkyItem(item({ name: 'Garden statue', weight_lbs: 90 }))).toBe(true);
    expect(packLane(item({ name: '65" Samsung TV', category: 'electronics' }))).toBe('tv');
    expect(packLane(item({ name: 'TV stand' }))).toBe('bulky');
    expect(packLane(item({ name: 'King mattress' }))).toBe('mattress');
    expect(packLane(item({ name: 'Bed frame' }))).toBe('bulky');
    expect(packLane(item({ name: 'Wine glasses', category: 'kitchenware' }))).toBe('dish');
    expect(packLane(item({ name: 'Winter coats', category: 'clothing' }))).toBe('wardrobe');
    expect(packLane(item({ name: 'Blender', category: 'kitchenware' }))).toBe('box');
  });

  it('reads measured sizes in inches or cm', () => {
    expect(parseDims('12 x 24 x 6')).toEqual([24, 12, 6]);
    expect(parseDims('50×25.4×10 cm')).toEqual([50 / 2.54, 10, 10 / 2.54]);
    expect(parseDims('big')).toBeNull();
  });

  it('packs by volume and weight, heavy things in small boxes', () => {
    const r = packLocally([
      { name: 'Cast iron', dims: [12, 10, 4], lbs: 12, qty: 6 },
      { name: 'Pillows', dims: [20, 14, 6], lbs: 1, qty: 4 },
      { name: 'Kayak paddle', dims: [80, 8, 4], lbs: 3, qty: 1 },
    ]);
    expect(r.boxes.small).toBeGreaterThanOrEqual(2);
    expect(r.boxes.medium + r.boxes.large + r.boxes.xl).toBeGreaterThanOrEqual(1);
    expect(r.notFit).toEqual([{ name: 'Kayak paddle', qty: 1 }]);
  });

  it('counts only what is logged when downsizing, and gives empty rooms zero', () => {
    const db = {
      rooms: [{ id: 'r1', name: 'Living room' }, { id: 'r2', name: 'Bedroom 4' }, { id: 'r3', name: 'Bedroom 5' }],
      items: [
        item({ id: 'a', name: 'Sofa', category: 'furniture' }),
        item({ id: 'b', name: 'Throw blankets', category: 'linens', quantity: 4 }),
        item({ id: 'c', name: 'Picture frames', category: 'decor', quantity: 3 }),
      ],
      boxes: [],
      books: [],
    } as unknown as Snapshot;
    const inv = estimateSupplies(db);
    const typ = estimateSupplies(db, { basis: 'typical' });
    expect(inv.basis).toBe('inventory');
    expect(inv.emptyRooms).toBe(2);
    expect(inv.rooms.filter((r) => r.basis === 'none').map((r) => r.room)).toEqual(['Bedroom 4', 'Bedroom 5']);
    expect(inv.rooms[0]!.noBox).toBe(1);
    expect(inv.totalBoxes).toBeLessThan(5);
    expect(typ.totalBoxes).toBeGreaterThan(20);
    expect(inv.lines.find((l) => l.key === 'mattress')).toBeUndefined();
    expect(inv.lines.find((l) => l.key === 'pads')!.qty).toBe(12);
  });

  it('uses box counts from a packing run when given', () => {
    const db = { rooms: [{ id: 'r1', name: 'Office' }], items: [item({ name: 'Cables', category: 'electronics', quantity: 30 })], boxes: [], books: [] } as unknown as Snapshot;
    const s = estimateSupplies(db, { packed: { r1: { small: 1, large: 2 } } });
    expect(s.rooms[0]!.basis).toBe('packed');
    expect(s.boxes.small + s.boxes.large + s.boxes.medium).toBe(3);
  });
});

describe('typical item weights', () => {
  const lbs = (name: string, category = 'furniture') => itemWeightLbs({ category: category as Item['category'], name }).lbs;
  it('uses the item name, not just the category', () => {
    expect(lbs('table lamp')).toBe(8);
    expect(lbs('coffee table')).toBe(40);
    expect(lbs('dinner plates', 'kitchen')).toBe(1);
    expect(lbs('blender', 'appliances')).toBe(8);
  });
  it('prefers a weighed value', () => {
    expect(itemWeightLbs({ category: 'furniture', name: 'table lamp', weight_lbs: 12 })).toEqual({ lbs: 12, actual: true });
  });
});