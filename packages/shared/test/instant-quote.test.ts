import { describe, expect, it } from 'vitest';
import { buildInstantQuoteRequest, fetchInstantQuote, instantQuoteToRow, quoteFlags, specialtyFor, type Move, type MoveSize, type MoverQuote } from '../src';

const size = { cubicFeet: 429, bedrooms: 1, specialItems: ['Upright piano', 'Treadmill'] } as MoveSize;
const move = { from_zip: '80202', to_zip: '38103', move_date: '2026-12-12', load_date: null } as unknown as Move;

const sample = {
  quote_id: 'q_test',
  move_type: 'long_distance',
  distance_miles_est: 1040,
  billed_cubic_feet: 429,
  est_weight_lbs: 2789,
  cubic_feet_source: 'cubic_feet given',
  breakdown: { linehaul: 2347.49, fuel_surcharge: 352.12, origin_destination_surcharge: 164.32, guaranteed_delivery: 0, specialty_items: [{ item: 'piano_upright', fee: 250 }], storage: 0 },
  indicative_total: 3113.93,
  price_type: 'indicative price per tariff',
  rates_status: 'published',
  handoff: { text: 'Next: a free in-home or video survey.' },
  verified_carrier: { usdot_status: 'ACTIVE', operating_authority: 'AUTHORIZED', verify_url: 'https://safer.fmcsa.dot.gov/x' },
};

describe('instant mover quote', () => {
  it('builds a request with only sizes, ZIPs and date — no contact info', () => {
    const r = buildInstantQuoteRequest(move, size, { packing: true });
    expect(r).toEqual({ from_zip: '80202', to_zip: '38103', move_date: '2026-12-12', cubic_feet: 429, specialty_items: ['piano_upright', 'misc_bulky'], packing: 'full' });
    expect(JSON.stringify(r)).not.toMatch(/contact|email|phone|name/);
    expect(buildInstantQuoteRequest({ ...move, to_zip: '' }, size)).toHaveProperty('error');
    expect(buildInstantQuoteRequest({ ...move, move_date: null }, size, { today: '2026-11-20' })).toMatchObject({ move_date: '2026-11-20' });
    expect(buildInstantQuoteRequest(move, size, { useOurSize: false })).toMatchObject({ home_size: '1br' });
    expect(specialtyFor(['Baby grand piano', 'Hot tub'])).toEqual(['piano_baby_grand', 'jacuzzi']);
  });

  it('parses the response and saves it as an indicative quote', async () => {
    const fake = (async () => new Response(JSON.stringify(sample), { status: 200 })) as unknown as typeof fetch;
    const q = await fetchInstantQuote({ from_zip: '80202', to_zip: '38103', move_date: '2026-12-12' }, fake);
    if ('error' in q) throw new Error(q.error);
    expect(q.total).toBe(3113.93);
    expect(q.breakdown.map((b) => b.amount)).toEqual([2347.49, 352.12, 164.32, 250]);
    expect(q.carrierStatus).toMatch(/ACTIVE/);
    const row = instantQuoteToRow(q);
    expect(row).toMatchObject({ company: 'Next Generation Movers', usdot: '3764697', quote_type: 'indicative', price: 3113.93, status: 'received' });
    const flags = quoteFlags({ ...row, id: 'x', deposit: null } as MoverQuote);
    expect(flags.some((f) => /Indicative/.test(f.text))).toBe(true);
  });

  it('reports API errors', async () => {
    const fake = (async () => new Response(JSON.stringify({ error: 'move_date must be YYYY-MM-DD' }), { status: 400 })) as unknown as typeof fetch;
    expect(await fetchInstantQuote({ from_zip: '1', to_zip: '2', move_date: 'x' }, fake)).toEqual({ error: 'move_date must be YYYY-MM-DD' });
  });
});
