import { describe, expect, it } from 'vitest';
import {
  bestQuote,
  estimateMoveCosts,
  estimateMoveSize,
  flightCallsign,
  flightCode,
  flightTrackerLinks,
  milesDollarValue,
  parseItinerary,
  quoteFlags,
  quoteRequestText,
  salesForBudget,
  salesProceeds,
  tripSummary,
  type MoverQuote,
  type Snapshot,
  type TravelItem,
} from '../src';

const item = (p: Partial<TravelItem>): TravelItem =>
  ({ id: Math.random().toString(36), kind: 'flight', title: '', trip: '', member_id: null, provider: '', confirmation: '', airline: '', flight_number: '', start_date: null, start_time: '', end_date: null, end_time: '', origin: '', destination: '', address: '', cost: null, paid: false, paid_with: '', reimbursable: true, reimbursed: false, recover_miles: true, files: [], notes: '', ...p }) as TravelItem;

describe('airlines & flights', () => {
  it('builds flight codes, callsigns and tracker links', () => {
    expect(flightCode('DL', '1234')).toBe('DL1234');
    expect(flightCode('', 'WN 88')).toBe('WN88');
    expect(flightCallsign('WN', '88')).toBe('SWA88');
    expect(flightCallsign('AA', 'abc')).toBeNull();
    expect(flightTrackerLinks('DL', '1234')[0]!.url).toBe('https://www.flightaware.com/live/flight/DAL1234');
  });

  it('parses a pasted confirmation e-mail', () => {
    const p = parseItinerary(
      `Delta Air Lines â€” Your trip confirmation
Confirmation #: HXK7QP
Sun, Nov 15, 2026
DL 1520  DEN â†’ MEM  Depart 7:05 AM  Arrive 10:48 AM
Sat, Nov 21, 2026
DL 2231  MEM â†’ DEN  Depart 5:40 PM  Arrive 7:15 PM
Paid with 25,000 miles. Total taxes & fees: $11.20`,
      { year: 2026 },
    );
    expect(p.confirmation).toBe('HXK7QP');
    expect(p.airline).toBe('DL');
    expect(p.flights).toHaveLength(2);
    expect(p.flights[0]).toMatchObject({ flight_number: '1520', origin: 'DEN', destination: 'MEM', start_date: '2026-11-15', start_time: '07:05', end_time: '10:48' });
    expect(p.flights[1]).toMatchObject({ flight_number: '2231', origin: 'MEM', destination: 'DEN', start_date: '2026-11-21', start_time: '17:40' });
    expect(p.miles_used).toBe(25000);
    expect(p.cost).toBe(11.2);
  });

  it('values miles and counts them toward what the stipend pays back', () => {
    expect(milesDollarValue({ miles_used: 25000, miles_value: null, airline: 'DL', provider: '' })).toBe(300);
    expect(milesDollarValue({ miles_used: 25000, miles_value: 350, airline: 'DL', provider: '' })).toBe(350);
    const t = tripSummary([
      item({ cost: 11.2, paid: true, miles_used: 25000, airline: 'DL' }),
      item({ cost: 200, paid: true, airline: 'DL' }),
      item({ cost: 0, miles_used: 10000, airline: 'AA', recover_miles: false }),
    ]);
    expect(t.cash).toBe(211.2);
    expect(t.milesUsed).toBe(35000);
    expect(t.milesValue).toBe(440);
    expect(t.milesToRecover).toBe(300);
    expect(t.covered).toBeCloseTo(511.2);
    expect(t.fronted).toBeCloseTo(511.2);
    expect(t.personal).toBeCloseTo(140);
  });
});

describe('sales toward the budget', () => {
  const db = {
    items: [
      { id: 'i1', name: 'Couch', disposition: 'sell', sale_status: 'sold', sale_price: 300, est_value: 400, quantity: 1 },
      { id: 'i2', name: 'Desk', disposition: 'sell', sale_status: 'listed', sale_price: null, est_value: 80, quantity: 1 },
      { id: 'i3', name: 'Lamp', disposition: 'move', sale_status: 'unlisted', est_value: 50, quantity: 1 },
    ],
    books: [
      { id: 'b1', title: 'A', disposition: 'sell', sale_status: 'sold', sale_price: 12 },
      { id: 'b2', title: 'B', disposition: 'sell', sale_status: 'unlisted', est_value: 5 },
    ],
    book_sales: [{ id: 's1', book_ids: ['b1'], status: 'shipped', price: 15, shipping_charged: 4, fees: 3, postage: 4, channel: 'ebay', buyer_name: 'Pat' }],
  } as unknown as Snapshot;

  it('groups proceeds without double-counting books in orders', () => {
    const p = salesProceeds(db);
    expect(p.sold).toBe(312);
    expect(p.listed).toBe(80);
    expect(p.unlisted).toBe(5);
    expect(salesForBudget(p, 'none')).toBe(0);
    expect(salesForBudget(p, 'sold')).toBe(312);
    expect(salesForBudget(p, 'listed')).toBe(397);
  });
});

describe('mover quote kit', () => {
  const db = {
    rooms: [{ id: 'r1', name: 'Bedroom' }, { id: 'r2', name: 'Living room' }],
    items: [{ id: 'i', name: 'Piano', model: '', category: 'furniture', disposition: 'move', quantity: 1, room_id: 'r2', box_id: null, fragile: true, est_value: 2000 }],
    boxes: [{ id: 'x', room_id: 'r1', weight_lbs: null }],
    books: [],
  } as unknown as Snapshot;

  it('sizes the move and prices each method', () => {
    const s = estimateMoveSize(db);
    expect(s.weightLbs).toBeGreaterThan(0);
    expect(s.specialItems).toContain('Piano');
    const costs = estimateMoveCosts(s, 1040);
    expect(costs.map((c) => c.method)).toEqual(['full_service', 'self_pack', 'container', 'rental_truck']);
    expect(costs.find((c) => c.method === 'container')!.mid).toBeGreaterThan(0);
    expect(costs.find((c) => c.method === 'rental_truck')!.breakdown).toHaveLength(4);
  });

  it('flags risky quotes and picks the best one', () => {
    const q = (p: Partial<MoverQuote>) => ({ id: Math.random().toString(36), company: 'X', usdot: '', quote_type: 'binding', price: 5000, deposit: 0, valuation: 'full_value', survey_type: 'video', status: 'received', ...p }) as MoverQuote;
    const shady = q({ id: 'shady', price: 1500, deposit: 800, quote_type: 'non_binding' });
    const good = q({ id: 'good', usdot: '123456', price: 5200 });
    const flags = quoteFlags(shady, { estimateLow: 4000 }).filter((f) => f.level === 'bad');
    expect(flags.length).toBeGreaterThanOrEqual(3);
    expect(bestQuote([shady, good], { estimateLow: 4000 })).toBe('good');
  });

  it('writes a quote request with the cities', () => {
    const s = estimateMoveSize(db);
    const r = quoteRequestText({ from_city: 'Denver', from_state: 'CO', to_city: 'Memphis', to_state: 'TN' } as never, s, { name: 'Sam' });
    expect(r.subject).toMatch(/Denver/);
    expect(r.body).toMatch(/Memphis/);
  });

  it('leaves in-car items off the mover size', () => {
    const withCar = {
      ...db,
      items: [...db.items, { id: 'c', name: 'Laptop', model: '', category: 'electronics', disposition: 'move', quantity: 2, room_id: 'r1', box_id: null, fragile: true, est_value: 1500, in_car: true }],
    } as unknown as Snapshot;
    const a = estimateMoveSize(db);
    const b = estimateMoveSize(withCar);
    expect(b.itemsToMove).toBe(a.itemsToMove);
    expect(b.inventoryLbs).toBe(a.inventoryLbs);
    expect(b.inCarItems).toBe(2);
    expect(b.highValueItems.map((h) => h.name)).not.toContain('Laptop');
  });

  it('sizes from the inventory alone when downsizing', () => {
    const big = { ...db, rooms: ['Bedroom 1', 'Bedroom 2', 'Bedroom 3', 'Bedroom 4', 'Bedroom 5'].map((name, i) => ({ id: `b${i}`, name })) } as unknown as Snapshot;
    const typical = estimateMoveSize(big);
    const lean = estimateMoveSize(big, { basis: 'inventory' });
    expect(typical.basis).toBe('typical');
    expect(lean.basis).toBe('inventory');
    expect(lean.weightLbs).toBeLessThan(typical.weightLbs);
  });

  it('customizes the quote email: sections, notes, questions, email-only', () => {
    const s = estimateMoveSize(db);
    const move = { from_city: 'Georgetown', to_city: 'Germantown', load_date: '2026-12-28' } as never;
    const def = quoteRequestText(move, s, { name: 'Sam', phone: '555-1234', email: 'sam@x.com' });
    expect(def.body).not.toMatch(/555-1234/);
    expect(def.body).toMatch(/reply by email only/);
    expect(def.body).toMatch(/sam@x\.com/);
    expect(def.body).toMatch(/Attached is an itemized inventory/);

    const r = quoteRequestText(move, s, {
      name: 'Sam',
      phone: '555-1234',
      loadWindow: 'Flexible — last week of December through January 4',
      deliveryWindow: 'January 4–8 at the latest',
      notes: ["It's a 5-bedroom home, but we're consolidating", ''],
      questions: ['Custom question?'],
      items: [
        { room: 'Bedroom', name: 'Bed', qty: 1 },
        { room: 'Bedroom', name: 'Lamp', qty: 2 },
      ],
      sections: { highValue: false, pleaseInclude: false, itemList: true, emailOnly: false },
    });
    expect(r.subject).toMatch(/flexible dates/);
    expect(r.body).toMatch(/Load date: Flexible — last week of December/);
    expect(r.body).toMatch(/Delivery needed by: January 4–8/);
    expect(r.body).toMatch(/5-bedroom home, but we're consolidating/);
    expect(r.body).toMatch(/1\. Custom question\?/);
    expect(r.body).toMatch(/• Bedroom: Bed, Lamp ×2/);
    expect(r.body).not.toMatch(/High-value/);
    expect(r.body).not.toMatch(/PLEASE INCLUDE/);
    expect(r.body).toMatch(/555-1234/);
  });
});
