import { describe, expect, it } from 'vitest';
import {
  apartmentCosts,
  boxDisplayCode,
  buildLabelSheet,
  contrastText,
  DEFAULTS,
  emptySnapshot,
  lookupProduct,
  parseUpcItem,
  pickPrice,
  productToItemPatch,
  roomCode,
  type Box,
  type Room,
} from '../src';

describe('product auto-fill', () => {
  it('picks median offer price, else recorded range', () => {
    expect(pickPrice({ offers: [{ price: 10 }, { price: 30 }, { price: 20 }] })).toBe(20);
    expect(pickPrice({ lowest_recorded_price: 100, highest_recorded_price: 200 })).toBe(150);
    expect(pickPrice({})).toBeNull();
  });

  it('parses a UPCitemdb record into full product info', () => {
    const p = parseUpcItem('885909950805', {
      title: 'Apple iPhone 6 16GB',
      brand: 'Apple',
      model: 'MG5W2LL/A',
      description: 'Smartphone',
      category: 'Electronics > Phones',
      images: ['http://x/a.jpg', 'https://x/b.jpg'],
      offers: [{ price: 199.99 }, { price: 249.99 }],
    })!;
    expect(p).toMatchObject({ name: 'Apple iPhone 6 16GB', brand: 'Apple', model: 'MG5W2LL/A', category: 'electronics', image: 'https://x/b.jpg', price: 224.99, resale: 90 });
  });

  it('lookupProduct uses the injected fetch and fills only blanks', async () => {
    const fake = async () => ({ ok: true, json: async () => ({ items: [{ title: 'KitchenAid Stand Mixer', brand: 'KitchenAid', offers: [{ price: 400 }] }] }) });
    const info = (await lookupProduct('012345678905', fake))!;
    expect(info.category).toBe('appliances');
    const patch = productToItemPatch(info, { name: 'My mixer', category: 'other' });
    expect(patch.name).toBeUndefined();
    expect(patch).toMatchObject({ brand: 'KitchenAid', retail_price: 400, est_value: 160, category: 'appliances' });
  });
});

describe('apartments', () => {
  it('computes true monthly, move-in, and first-year costs', () => {
    const c = apartmentCosts({ ...DEFAULTS.apartments, rent: 2000, pet_rent: 50, parking_fee: 100, utilities_est: 150, deposit: 2000, application_fee: 50, sqft: 1000, bedrooms: 2 });
    expect(c.monthly).toBe(2250);
    expect(c.moveIn).toBe(4300);
    expect(c.firstYear).toBe(2250 * 12 + 50);
    expect(c.perSqft).toBe(2);
    expect(c.perBedroom).toBe(1000);
  });
});

describe('QR label maker', () => {
  const base = { household_id: 'h', created_at: '', updated_at: '', deleted: false };
  const rooms = [
    { ...base, ...DEFAULTS.rooms, id: 'r1', name: 'Kitchen', color: '#eab308', destination_room: 'Kitchen' },
    { ...base, ...DEFAULTS.rooms, id: 'r2', name: 'Master Bedroom', color: '#3b82f6' },
  ] as Room[];
  const boxes = [
    { ...base, ...DEFAULTS.boxes, id: 'b1', number: 1, room_id: 'r1', fragile: true, label: 'Plates' },
    { ...base, ...DEFAULTS.boxes, id: 'b2', number: 2, room_id: 'r2' },
    { ...base, ...DEFAULTS.boxes, id: 'b3', number: 3, room_id: 'r1', open_first: true },
  ] as Box[];

  it('makes room codes and per-room numbering', () => {
    expect(roomCode('Kitchen')).toBe('KIT');
    expect(roomCode('Master Bedroom')).toBe('MB');
    expect(roomCode('Living Room')).toBe('LIV');
    expect(boxDisplayCode(boxes[2], boxes, rooms, 'room')).toBe('KIT-2');
    expect(boxDisplayCode(boxes[2], boxes, rooms, 'global')).toBe('#3');
  });

  it('picks readable text color', () => {
    expect(contrastText('#eab308')).toBe('#111827');
    expect(contrastText('#1e3a8a')).toBe('#ffffff');
  });

  it('renders a printable sheet with QR codes, copies, and room colors', async () => {
    const db = emptySnapshot();
    db.rooms = rooms;
    db.boxes = boxes;
    db.items = [{ ...base, ...DEFAULTS.items, id: 'i1', name: 'Dinner plates', box_id: 'b1', quantity: 12 }] as typeof db.items;
    const html = await buildLabelSheet(db, ['b1', 'b3'], { copies: 2, numbering: 'room', size: 'thermal4x6' });
    expect((html.match(/class="lbl/g) ?? []).length).toBe(4);
    expect((html.match(/<svg/g) ?? []).length).toBe(4);
    expect(html).toContain('KIT-1');
    expect(html).toContain('Dinner plates ×12');
    expect(html).toContain('FRAGILE');
    expect(html).toContain('OPEN FIRST');
    expect(html).toContain('size:4in 6in');
  });
});
