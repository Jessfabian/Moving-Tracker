import { describe, expect, it } from 'vitest';
import { itemPriceIdea, mergeDetections, refineForRoom, roomSuggestions, roomTypeFromName, suppressDuplicates } from '../src';

describe('room photo scan', () => {
  it('guesses room types from names', () => {
    expect(roomTypeFromName('Primary bedroom')).toBe('bedroom');
    expect(roomTypeFromName("Sam's room")).toBe('kids');
    expect(roomTypeFromName('Family room')).toBe('living');
    expect(roomTypeFromName('Garage')).toBe('garage');
  });

  it('merges several photos without double counting', () => {
    const items = mergeDetections([
      [{ label: 'bed', score: 0.9, box: { x: 1, y: 2, w: 3, h: 4 } }, { label: 'chair', score: 0.6 }, { label: 'person', score: 0.99 }, { label: 'book', score: 0.5 }, { label: 'book', score: 0.5 }],
      [{ label: 'bed', score: 0.8 }, { label: 'chair', score: 0.7 }, { label: 'chair', score: 0.5 }, { label: 'tv', score: 0.2 }],
    ]);
    const by = Object.fromEntries(items.map((i) => [i.name, i]));
    expect(by.Bed!.quantity).toBe(1);
    expect(by.Bed!.photos).toEqual([0, 1]);
    expect(by.Bed!.crop).toEqual({ photo: 0, box: { x: 1, y: 2, w: 3, h: 4 } });
    expect(by.Chair!.quantity).toBe(2);
    expect(by.Books!.quantity).toBe(1);
    expect(by.TV).toBeUndefined();
    expect(items.find((i) => /person/i.test(i.name))).toBeUndefined();
  });

  it('suggests what goes with a bed in a bedroom (2 nightstands, vanity…) unticked', () => {
    const s = roomSuggestions('bedroom', ['Bed']);
    expect(s.find((x) => x.name === 'Nightstand')).toMatchObject({ quantity: 2, keep: false, source: 'suggested' });
    expect(s.some((x) => x.name === 'Makeup vanity')).toBe(true);
    expect(roomSuggestions('bedroom', []).some((x) => x.name === 'Nightstand')).toBe(false);
    expect(refineForRoom([{ key: 'k', name: 'Table', quantity: 1, category: 'furniture', confidence: 1, source: 'photo', photos: [0], keep: true }], 'dining')[0]!.name).toBe('Dining table');
  });
});

describe('item price ideas', () => {
  it('prices common furniture and nudges keep vs sell', () => {
    const ns = itemPriceIdea({ name: 'Nightstand', category: 'furniture', condition: 'good', quantity: 2 });
    expect(ns.likely).toBe(40);
    expect(ns.low).toBeLessThan(ns.likely);
    expect(ns.high).toBeGreaterThan(ns.likely);
    expect(['sell', 'either']).toContain(ns.verdict);
    expect(itemPriceIdea({ name: 'Treadmill', category: 'other', condition: 'fair', quantity: 1 }).verdict).toBe('sell');
    expect(ns.links[0]!.url).toContain('LH_Sold=1');
    const laptop = itemPriceIdea({ name: 'MacBook laptop', category: 'electronics', condition: 'like_new', quantity: 1 });
    expect(laptop.verdict).toBe('keep');
    const fair = itemPriceIdea({ name: 'Sofa', category: 'furniture', condition: 'fair', quantity: 1 });
    expect(fair.likely).toBeLessThan(200);
  });

  it('uses the retail price from a barcode lookup when known', () => {
    const p = itemPriceIdea({ name: 'Instant Pot Duo 6qt', category: 'appliances', condition: 'good', quantity: 1, retail_price: 100 });
    expect(p.likely).toBe(40);
    expect(p.basis).toMatch(/new price/);
  });
});

describe('room scan clean-up', () => {
  it('counts an object seen in the full photo and a zoomed tile once', () => {
    const dets = suppressDuplicates([
      { label: 'bed', score: 0.8, box: { x: 100, y: 100, w: 600, h: 400 } },
      { label: 'bed', score: 0.5, box: { x: 100, y: 100, w: 350, h: 380 } }, // half the bed, from a tile
      { label: 'chair', score: 0.7, box: { x: 0, y: 0, w: 100, h: 100 } },
      { label: 'chair', score: 0.6, box: { x: 300, y: 0, w: 100, h: 100 } }, // a second, separate chair
    ]);
    expect(dets.map((d) => d.label).sort()).toEqual(['bed', 'chair', 'chair']);
  });

  it('reads a "bed" in a living room as the sectional and merges it with a seen sofa', () => {
    const items = mergeDetections([[{ label: 'bed', score: 0.7 }, { label: 'couch', score: 0.5 }]]);
    const living = refineForRoom(items, 'living');
    expect(living.filter((i) => i.name.startsWith('Sofa'))).toHaveLength(1);
    expect(refineForRoom(items, 'bedroom').some((i) => i.name === 'Bed')).toBe(true);
  });
});
