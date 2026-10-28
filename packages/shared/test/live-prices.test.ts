import { describe, expect, it } from 'vitest';
import {
  itemPriceQuery,
  median,
  parseAbeBooks,
  parseBingShopping,
  parseThriftBooks,
  parseValoreBooks,
  parseWalmartSearch,
  relevantOffers,
  summarizeOffers,
  type LiveOffer,
} from '../src';

const abe = `<script type="application/ld+json" id="item-list">${JSON.stringify({
  '@type': 'ItemList',
  itemListElement: [
    { item: { name: 'Campbell Biology', bookFormat: 'https://schema.org/Hardcover', url: 'https://abe/1', offers: { price: 26.93, priceCurrency: 'USD', itemCondition: 'https://schema.org/UsedCondition', url: 'https://abe/1', seller: { name: 'GCCebooks' } } } },
    { item: { name: 'Campbell Biology', url: 'https://abe/2', offers: { price: 210, priceCurrency: 'USD', itemCondition: 'https://schema.org/NewCondition', url: 'https://abe/2' } } },
    { item: { name: 'Campbell Biology', url: 'https://abe/3', offers: { price: 30, priceCurrency: 'GBP', url: 'https://abe/3' } } },
  ],
})}</script>`;

const thrift = (isbn10: string) =>
  `<h1>Harry Potter and the Sorcerer's Stone</h1><a href="https%3A%2F%2Fwww.thriftbooks.com%2Fw%2Fx%2F1%2F%23isbn%3D${isbn10}">share</a>` +
  `<div class="WorkSelector-bold">Like New</div><div class=""><span>Unavailable</span></div>` +
  `<div class="WorkSelector-bold">Very Good</div><div class=""><span>$5.29</span></div>` +
  `<div class="WorkSelector-bold">Good</div><div class="WorkSelector-bold TbRed"><span>$4.49</span></div>` +
  `<div class="WorkSelector-bold">Acceptable</div><div class=""><span>$3.79</span></div>`;

describe('live prices — books', () => {
  it('reads AbeBooks offers (USD only) with condition, format and seller', () => {
    const o = parseAbeBooks(abe);
    expect(o).toHaveLength(2);
    expect(o[0]).toMatchObject({ source: 'AbeBooks', price: 26.93, used: true, condition: 'Used · Hardcover', seller: 'GCCebooks', link: 'https://abe/1' });
    expect(o[1]).toMatchObject({ price: 210, used: false });
  });

  it('reads ThriftBooks condition prices, but only for the same edition', () => {
    const ok = parseThriftBooks(thrift('0439708184'), 'https://tb/w/1', '9780439708180');
    expect(ok.map((x) => [x.condition, x.price])).toEqual([
      ['Very Good', 5.29],
      ['Good', 4.49],
      ['Acceptable', 3.79],
    ]);
    expect(parseThriftBooks(thrift('0805368442'), 'https://tb/w/1', '9780134093413')).toEqual([]);
  });

  it('reads ValoreBooks offers', () => {
    const html = `<h1> Biology </h1><div data-target='product-offer-item' data-condition='acceptable' data-current-price='$16.99' data-x='1'></div><div data-condition='new' data-current-price='$40.00'></div>`;
    expect(parseValoreBooks(html, 'https://v/1').map((o) => [o.condition, o.price, o.used])).toEqual([
      ['Acceptable', 16.99, true],
      ['New', 40, false],
    ]);
  });

  it('suggests ~80% of the typical used price, never far above the cheapest copy', () => {
    const offers = [3.79, 4.49, 7.15, 8, 12].map((price) => ({ source: 'x', title: 't', condition: 'Used', used: true, price, link: 'l' }));
    const s = summarizeOffers(offers, 'book');
    expect(s.usedLow).toBe(3.79);
    expect(s.usedMedian).toBe(7.15);
    expect(s.suggested).toBe(4); // min(7.15×0.8=5.72, 3.79×1.1=4.17) → nearest $0.50
    expect(summarizeOffers([], 'book').suggested).toBeNull();
  });
});

describe('live prices — items', () => {
  it('reads Walmart search results from __NEXT_DATA__', () => {
    const data = { props: { pageProps: { initialData: { searchResult: { itemStacks: [{ items: [{ name: 'Dyson V8 Cordless Vacuum', price: 299.99, canonicalUrl: '/ip/Dyson-V8/123?x=1', conditionV2: { code: 1 } }, { name: 'Ad', price: null }] }] } } } } };
    const o = parseWalmartSearch(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`);
    expect(o).toEqual([expect.objectContaining({ source: 'Walmart', price: 299.99, used: false, link: 'https://www.walmart.com/ip/Dyson-V8/123' })]);
  });

  it('reads Bing Shopping cards', () => {
    const card = (title: string, price: string, seller: string) =>
      `<a class="br-offLink" href="https://www.bing.com/aclick?ld=1&amp;u=2"><div class="br-offTtl b_primtxt"><span title="${title}">${title.slice(0, 10)}…</span></div><div class="br-price br-standardPrice">$${price}</div><span class="br-offSlrTxt">${seller}</span></a>`;
    const o = parseBingShopping(card('KitchenAid Artisan Stand Mixer', '249.99', 'Target') + card('Refurbished KitchenAid Artisan Stand Mixer', '199.00', 'eBay'));
    expect(o.map((x) => [x.price, x.seller, x.used])).toEqual([
      [249.99, 'Target', false],
      [199, 'eBay', true],
    ]);
    expect(o[0]!.link).toBe('https://www.bing.com/aclick?ld=1&u=2');
  });

  it('keeps only listings that match the item and drops price outliers', () => {
    const mk = (title: string, price: number): LiveOffer => ({ source: 's', title, condition: 'New', used: false, price, link: 'l' });
    const kept = relevantOffers('Dyson V8 vacuum', [mk('Dyson V8 Animal Cordless Vacuum', 300), mk('Dyson V8 Origin vacuum', 280), mk('Dyson V8 vacuum filter', 12), mk('Shark Navigator', 150), mk('Dyson V8 Absolute Vacuum', 350)]);
    expect(kept.map((o) => o.price)).toEqual([300, 280, 350]);
  });

  it('builds a store search from brand + model, else name', () => {
    expect(itemPriceQuery({ name: 'Stand mixer', brand: 'KitchenAid', model: 'KSM150PS' })).toBe('KitchenAid KSM150PS');
    expect(itemPriceQuery({ name: 'Stand mixer', brand: 'KitchenAid' })).toBe('KitchenAid Stand mixer');
    expect(itemPriceQuery({ name: 'KitchenAid mixer', brand: 'KitchenAid' })).toBe('KitchenAid mixer');
  });

  it('item summaries report the typical new price and leave resale to the age model', () => {
    const s = summarizeOffers([{ source: 's', title: 't', condition: 'New', used: false, price: 300, link: 'l' }, { source: 's', title: 't', condition: 'New', used: false, price: 350, link: 'l' }], 'item');
    expect(s.newMedian).toBe(325);
    expect(s.suggested).toBeNull();
    expect(median([1, 3, 2])).toBe(2);
  });
});
