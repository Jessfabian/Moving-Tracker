import { describe, expect, it } from 'vitest';
import {
  apartmentSearchLinks,
  filterRentals,
  parseRentComSearch,
  rentalToApartment,
  rentComSearchUrls,
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
  it("assumes a 1-month deposit when none is entered, but honours an explicit value", () => {
    expect(apartmentCosts({ ...DEFAULTS.apartments, rent: 1800, deposit: null }).moveIn).toBe(3600);
    expect(apartmentCosts({ ...DEFAULTS.apartments, rent: 1800, deposit: 500 }).moveIn).toBe(2300);
    expect(apartmentCosts({ ...DEFAULTS.apartments, rent: 1800, deposit: 0 }).moveIn).toBe(1800);
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

describe('apartment search links', () => {
  it('builds pre-filled searches for each site', () => {
    const links = apartmentSearchLinks({ city: 'Germantown', state: 'TN', zip: '', beds: 2, baths: null, maxRent: 2000, homeType: 'any', mustHaves: [] });
    const ac = links.find((l) => l.site === 'Apartments.com')!;
    expect(ac.url).toBe('https://www.apartments.com/germantown-tn/2-bedrooms-under-2000/');
    expect(links.find((l) => l.site === 'Realtor.com')!.url).toBe('https://www.realtor.com/apartments/Germantown_TN/beds-2/price-na-2000');
    expect(links.length).toBeGreaterThan(5);
    expect(apartmentSearchLinks({ city: '', state: '', zip: '', beds: null, baths: null, maxRent: null, homeType: 'any', mustHaves: [] })).toEqual([]);
  });
});
describe('in-app rental search (Rent.com)', () => {
  const listing = {
    id: 'lc1', name: 'The Residences at Thornwood', urlPathname: '/apartment/thornwood-lc1', address: '7794 Kings College Ave',
    location: { lat: 35.1, lng: -89.8, city: 'Germantown', stateAbbr: 'TN', zip: '38138' }, bedText: '1–2 Beds', bathText: '1.5–2 Baths',
    squareFeetText: '918–1170 Sqft', price: 2184, priceRange: { min: 2184, max: 2830 }, bedRange: { min: 1, max: 2 }, propertyType: 'APARTMENTS',
    phoneDesktopText: '(901) 589-1196', propertyManagementCompany: { name: 'Fogelman' }, uniqueHighlights: ['Pool', 'Pet Friendly', 'Garage', 'Washer'],
    optimizedPhotos: [{ id: 'abc' }, { id: 'def' }], unitsAvailableText: '2 Units Available',
    floorPlans: [
      { bedCount: 1, bathCount: 1, priceRange: { min: 2184, max: 2184 }, sqFtRange: { min: 918, max: 918 } },
      { bedCount: 2, bathCount: 2, priceRange: { min: 2600, max: 2830 }, sqFtRange: { min: 1170, max: 1170 } },
    ],
  };
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { pageData: { location: { listingSearch: { listings: [listing] } } } } } })}</script>`;

  it('builds Rent.com search pages for the area', () => {
    expect(rentComSearchUrls({ city: 'Germantown', state: 'TN', zip: '', homeType: 'apartment' }, 2)).toEqual([
      'https://www.rent.com/tennessee/germantown-apartments',
      'https://www.rent.com/tennessee/germantown-apartments/page-2',
    ]);
    expect(rentComSearchUrls({ city: '', state: '', zip: '38138', homeType: 'house' }, 1)).toEqual(['https://www.rent.com/zip-38138-houses']);
  });

  it('parses listings, filters by beds and budget, and saves a full apartment', () => {
    const [r] = parseRentComSearch(html);
    expect(r!.name).toBe('The Residences at Thornwood');
    expect(r!.images[0]).toBe('https://i.rent.com/t_3x2_fixed_webp_lg/abc');
    expect(r!.amenities).not.toContain('Pet Friendly');
    const s = { beds: 2, baths: null, maxRent: 2700, mustHaves: [] };
    expect(filterRentals([r!], s)).toHaveLength(1);
    expect(filterRentals([r!], { ...s, maxRent: 2500 })).toHaveLength(0);
    const a = rentalToApartment(r!, s);
    expect(a).toMatchObject({ rent: 2600, bedrooms: 2, bathrooms: 2, sqft: 1170, zip: '38138', pets_allowed: true, parking: 'garage', laundry: 'in_unit', latitude: 35.1 });
    expect(a.geocoded_address).toBe('7794 Kings College Ave, Germantown, TN 38138');
    expect(a.listing_url).toBe('https://www.rent.com/apartment/thornwood-lc1');
  });
});