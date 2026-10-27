import { describe, expect, it } from 'vitest';
import { estimateMoveSize, estimateSupplies, roomKind, suppliesShoppingList, type Snapshot } from '../src';

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
    const s = estimateSupplies(db);
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
    expect(s.boxes.medium).toBe(15 - 2);
    expect(s.haveBoxes).toBe(2);
  });
});
