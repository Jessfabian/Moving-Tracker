import { describe, expect, it } from 'vitest';
import { apartmentSearchLinks, bookCoverCandidates, filterRentals, isbn13to10, parseAbeBooksBook, thriftBooksCover, type RentalResult } from '../src';

const rental = (id: string, priceMin: number, priceMax: number): RentalResult =>
  ({
    id,
    priceMin,
    priceMax,
    bedsMax: 3,
    bathsMax: 2,
    amenities: [],
    floorPlans: [{ beds: 2, baths: 2, priceMin, priceMax, sqftMin: null, sqftMax: null }],
  }) as unknown as RentalResult;

describe('rent price range', () => {
  const list = [rental('a', 1200, 1400), rental('b', 1700, 1900), rental('c', 2600, 2900)];
  const s = { beds: null, baths: null, mustHaves: [] };
  it('keeps listings inside the min–max range', () => {
    expect(filterRentals(list, { ...s, minRent: 1500, maxRent: 2000 }).map((r) => r.id)).toEqual(['b']);
    expect(filterRentals(list, { ...s, minRent: 2500, maxRent: null }).map((r) => r.id)).toEqual(['c']);
    expect(filterRentals(list, { ...s, minRent: null, maxRent: null })).toHaveLength(3);
  });
  it('passes the range to outside search links', () => {
    const links = apartmentSearchLinks({ city: 'Germantown', state: 'TN', zip: '', beds: 2, baths: null, minRent: 1500, maxRent: 2000, homeType: 'any', mustHaves: [] });
    expect(links.find((l) => l.site === 'Apartments.com')!.url).toContain('2-bedrooms-1500-to-2000');
    expect(decodeURIComponent(links.find((l) => l.site === 'Zillow')!.url)).toContain('"mp":{"min":1500,"max":2000}');
  });
});

describe('book details + covers from the web', () => {
  it('converts ISBN-13 to ISBN-10 for Amazon cover links', () => {
    expect(isbn13to10('9780441172719')).toBe('0441172717');
    expect(isbn13to10('9791234567896')).toBeNull();
    expect(bookCoverCandidates('9780441172719')[0]!.url).toContain('/P/0441172717.01.L.jpg');
  });

  it('reads title, author, publisher, format and cover from AbeBooks', () => {
    const ld = {
      '@type': 'ItemList',
      itemListElement: [
        {
          item: {
            '@type': 'Book',
            name: "Regine&#39;s Book : A Teen Girl's Last Words",
            isbn: '9781936976010',
            bookFormat: 'https://schema.org/Paperback',
            author: { name: 'Stokke, Regine' },
            publisher: { name: 'Zest Books' },
            image: 'https://pictures.abebooks.com/isbn/9781936976010-us._SL300_.jpg',
          },
        },
      ],
    };
    const b = parseAbeBooksBook(`<script type="application/ld+json" id="item-list">${JSON.stringify(ld)}</script>`, '9781936976010')!;
    expect(b).toMatchObject({ title: "Regine's Book", subtitle: "A Teen Girl's Last Words", authors: ['Regine Stokke'], publisher: 'Zest Books', format: 'paperback', cover_url: 'https://pictures.abebooks.com/isbn/9781936976010-us._SL300_.jpg' });
  });

  it('only trusts a ThriftBooks cover for the same edition', () => {
    const page = (isbn10: string) => `<a href="x%23isbn%3D${isbn10}"></a><img src="https://i.thriftbooks.com/api/imagehandler/m/ABC123.jpeg">`;
    expect(thriftBooksCover(page('0441172717'), '9780441172719')).toBe('https://i.thriftbooks.com/api/imagehandler/m/ABC123.jpeg');
    expect(thriftBooksCover(page('0805368442'), '9780441172719')).toBeNull();
  });
});
