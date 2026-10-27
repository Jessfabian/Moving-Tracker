import { describe, expect, it } from 'vitest';
import { billedPounds, buildShippingLabelHtml, estimateBookPrice, estimateBookWeightOz, mediaMailRate, packagingAdvice, pangoShipping, quoteChannel } from '../src';

describe('Media Mail', () => {
  it('rounds any fraction up to the next pound and uses the Notice 123 table', () => {
    expect(billedPounds(0)).toBe(1);
    expect(billedPounds(16)).toBe(1);
    expect(billedPounds(16.1)).toBe(2);
    expect(mediaMailRate(10)).toBe(4.39);
    expect(mediaMailRate(17)).toBe(5.13);
    expect(mediaMailRate(70 * 16)).toBe(55.23);
    expect(mediaMailRate(70 * 16 + 1)).toBeNull();
  });

  it('matches Pango buyer shipping tiers', () => {
    expect(pangoShipping(12)).toBe(3.99);
    expect(pangoShipping(20)).toBe(5.69);
    expect(pangoShipping(6.5 * 16)).toBe(8.99);
    expect(pangoShipping(12 * 16)).toBe(13.49);
  });
});

describe('book estimates', () => {
  it('estimates weight from format and pages unless weighed', () => {
    const hc = estimateBookWeightOz({ pages: 300, genre: 'fiction', format: 'hardcover' });
    const pb = estimateBookWeightOz({ pages: 300, genre: 'fiction', format: 'paperback' });
    expect(hc).toBeGreaterThan(pb);
    expect(hc).toBeGreaterThan(16);
    expect(pb).toBeLessThan(16);
    expect(estimateBookWeightOz({ pages: 300, genre: 'fiction', format: 'paperback', weight_oz: 11 })).toBe(11);
  });

  it('prices from cover price, age and condition', () => {
    const now = new Date('2026-10-27');
    const fresh = estimateBookPrice({ genre: 'fiction', pages: 350, published: '2026', condition: 'like_new', format: 'hardcover', list_price: 30 }, now);
    const old = estimateBookPrice({ genre: 'fiction', pages: 350, published: '2005', condition: 'acceptable', format: 'hardcover', list_price: 30 }, now);
    expect(fresh.mid).toBeGreaterThan(old.mid);
    expect(fresh.low).toBeLessThan(fresh.mid);
    expect(fresh.high).toBeGreaterThan(fresh.mid);
    expect(old.mid).toBeGreaterThanOrEqual(2);
    const guess = estimateBookPrice({ genre: 'textbook', pages: 800, published: '2025', condition: 'good', format: 'hardcover' }, now);
    expect(guess.mid).toBeGreaterThan(fresh.mid);
    expect(guess.basis.length).toBeGreaterThan(1);
  });
});

describe('channels', () => {
  it('nets out fees and postage per channel', () => {
    const pango = quoteChannel('pango', [10], 12);
    expect(pango.fees).toBe(2);
    expect(pango.buyerShipping).toBe(3.99);
    expect(pango.net).toBe(8);
    const ebay = quoteChannel('ebay', [10], 12, 0.5);
    expect(ebay.postage).toBe(4.39);
    expect(ebay.net).toBeLessThan(10);
    const hpb = quoteChannel('half_price_books', [10, 1], 0);
    expect(hpb.net).toBe(1.45);
    expect(quoteChannel('pango', [1], 8).fees).toBe(0.4);
  });
});

describe('packaging', () => {
  it('uses a bubble mailer for one paperback', () => {
    const a = packagingAdvice([{ pages: 300, genre: 'fiction', format: 'paperback' }]);
    expect(a.package?.kind).toBe('bubble');
    expect(a.postage).toBe(4.39);
  });

  it('uses a rigid mailer for a hardcover and a box for a stack', () => {
    expect(packagingAdvice([{ pages: 350, genre: 'fiction', format: 'hardcover' }]).package?.kind).toBe('book_mailer');
    const many = packagingAdvice(Array.from({ length: 10 }, () => ({ pages: 400, genre: 'fiction', format: 'hardcover' })));
    expect(many.package?.kind).toBe('box');
    expect(many.billedLbs).toBeGreaterThan(10);
    expect(many.postage).toBe(mediaMailRate(many.totalWeightOz));
    expect(many.tips.join(' ')).toMatch(/MEDIA MAIL/);
  });

  it('returns nothing for an empty selection', () => {
    expect(packagingAdvice([]).package).toBeNull();
  });
});

describe('shipping label', () => {
  it('renders addresses, Media Mail marking and a packing slip, escaping input', () => {
    const html = buildShippingLabelHtml({
      from: { name: 'Sam', street: '1 Main St', city: 'Boston', state: 'MA', zip: '02108' },
      to: { name: 'Pat <Buyer>', street: '9 Elm', city: 'Memphis', state: 'TN', zip: '38103' },
      books: [{ title: 'Dune', authors: ['Frank Herbert'], isbn: '9780441013593' }],
      weightOz: 20,
      channel: 'pango',
    });
    expect(html).toContain('MEDIA MAIL');
    expect(html).toContain('MEMPHIS, TN 38103');
    expect(html).toContain('PAT &lt;BUYER&gt;');
    expect(html).toContain('1 lb 4 oz');
    expect(html).toContain('Packing slip');
    expect(html).toContain('PangoBooks');
  });
});

import { parseBookFormat, parseWeightOz } from '../src';
describe('ISBN physical details', () => {
  it('parses bindings and weights', () => {
    expect(parseBookFormat('Mass Market Paperback')).toBe('mass_market');
    expect(parseBookFormat('Hardback')).toBe('hardcover');
    expect(parseBookFormat('Trade Paperback')).toBe('paperback');
    expect(parseWeightOz('1.5 pounds')).toBe(24);
    expect(parseWeightOz('12 ounces')).toBe(12);
    expect(parseWeightOz('454 g')).toBe(16);
    expect(parseWeightOz('heavy')).toBeNull();
  });
});
