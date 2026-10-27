import { describe, expect, it } from 'vitest';
import { apartmentFit, cashflow, distanceMiles, estimateDriveMinutes, listingToApartmentPatch, monthlyAmount, needsGeocode, parseListingHtml, upcomingBills, DEFAULTS, type Bill, type Income } from '../src';

const bill = (p: Partial<Bill>): Bill => ({ ...DEFAULTS.bills, id: Math.random().toString(), household_id: 'h', created_at: '', updated_at: '', ...p }) as Bill;
const income = (p: Partial<Income>): Income => ({ ...DEFAULTS.incomes, id: Math.random().toString(), household_id: 'h', created_at: '', updated_at: '', ...p }) as Income;

describe('geo', () => {
  it('measures distance between Memphis landmarks', () => {
    const graceland = { lat: 35.0477, lng: -90.026 };
    const downtown = { lat: 35.1495, lng: -90.049 };
    const d = distanceMiles(graceland, downtown);
    expect(d).toBeGreaterThan(6.5);
    expect(d).toBeLessThan(7.5);
    expect(estimateDriveMinutes(d)).toBeGreaterThan(10);
  });

  it('flags apartments whose address changed since geocoding', () => {
    expect(needsGeocode({ address: '1 Main St', city: 'Memphis', state: 'TN' })).toBe(true);
    expect(needsGeocode({ address: '1 Main St', city: 'Memphis', state: 'TN', latitude: 1, longitude: 2, geocoded_address: '1 Main St, Memphis, TN' })).toBe(false);
    expect(needsGeocode({ address: '', city: 'Memphis' })).toBe(false);
  });

  it('parses listing photos and facts from HTML', () => {
    const html = `<html><head><title>The Lofts | Zillow</title>
      <meta property="og:image" content="https://cdn.example.com/a/photo1.jpg">
      <meta property="og:description" content="Nice">
      <script type="application/ld+json">{"@type":"Apartment","name":"The Lofts","image":["https://cdn.example.com/a/photo2.jpg"],
        "address":{"streetAddress":"10 Main St","addressLocality":"Memphis","addressRegion":"TN","postalCode":"38103"},
        "geo":{"latitude":35.14,"longitude":-90.05},"numberOfBedrooms":2}</script></head>
      <body><img src="/img/logo.svg"><img src="/photos/3.jpg" width="800"><p>$1,450/mo · 1 ba · 950 sq ft</p></body></html>`;
    const info = parseListingHtml(html, 'https://listing.example.com/unit/5');
    expect(info.images).toEqual(['https://cdn.example.com/a/photo1.jpg', 'https://cdn.example.com/a/photo2.jpg', 'https://listing.example.com/photos/3.jpg']);
    expect(info).toMatchObject({ title: 'The Lofts', address: '10 Main St', city: 'Memphis', zip: '38103', lat: 35.14, lng: -90.05, rent: 1450, bedrooms: 2, bathrooms: 1, sqft: 950 });
    const patch = listingToApartmentPatch(info, { name: 'Mine', image_urls: ['https://cdn.example.com/a/photo1.jpg'], latitude: null });
    expect(patch.name).toBeUndefined();
    expect(patch.image_urls).toHaveLength(3);
    expect(patch.geocoded_address).toBe('10 Main St, Memphis, TN 38103');
  });
});

describe('cashflow', () => {
  it('normalises frequencies to monthly', () => {
    expect(monthlyAmount(100, 'weekly')).toBeCloseTo(433.33, 1);
    expect(monthlyAmount(2000, 'biweekly')).toBeCloseTo(4333.33, 1);
    expect(monthlyAmount(1200, 'yearly')).toBe(100);
  });

  it('compares now vs after the move and rates apartment affordability', () => {
    const db = {
      incomes: [income({ amount: 6000, basis: 'gross', frequency: 'monthly' }), income({ amount: 1000, status: 'ending' })],
      bills: [
        bill({ name: 'Rent', category: 'housing', amount: 1500 }),
        bill({ name: 'Gym', category: 'other', amount: 50, status: 'cancel_before_move' }),
        bill({ name: 'Car', category: 'transportation', amount: 400 }),
        bill({ name: 'Toll pass', category: 'transportation', amount: 20, status: 'new_after_move' }),
      ],
    };
    const now = cashflow(db, 'now');
    expect(now.bills).toBe(1950);
    expect(now.incomeNet).toBeCloseTo(6000 * 0.76 + 1000);
    const after = cashflow(db, 'after');
    expect(after.bills).toBe(1920);
    const fit = apartmentFit({ rent: 1500, utilities_est: 150 }, db);
    expect(fit.rentShare).toBeCloseTo(1650 / 6000);
    expect(fit.verdict).toBe('comfortable');
    expect(apartmentFit({ rent: 2800 }, db).verdict).toBe('over');
  });

  it('lists upcoming due dates', () => {
    const due = upcomingBills([bill({ name: 'A', amount: 1, due_day: 30 }), bill({ name: 'B', amount: 1, due_day: 2 })], '2027-02-10');
    expect(due.map((d) => [d.bill.name, d.date])).toEqual([
      ['A', '2027-02-28'],
      ['B', '2027-03-02'],
    ]);
  });
});
