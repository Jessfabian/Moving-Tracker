import { describe, expect, it } from 'vitest';
import { cityStateFromAddress, parseRentComPage, rentComCityPath, rentComKinds, rentComPageUrl, searchRadiusMiles } from '../src';

const page = (location: unknown) => `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { pageData: { location } } } })}</script>`;

describe('radius rental search helpers', () => {
  it('reads listings, total, and nearby cities (including other states)', () => {
    const html = page({
      listingSearch: {
        total: 53,
        listings: [{ id: 'a1', name: 'Oak Park', urlPathname: '/tennessee/germantown-apartments/oak-park-4-a1', location: { city: 'Germantown', state: 'TN', lat: 35.08, lng: -89.8 }, prices: { low: 1500 } }],
      },
      seoLinks: {
        nearby: {
          cities: [
            { displayName: 'Olive Branch, MS', url: '/mississippi/olive-branch-apartments', distanceInMiles: 11.2 },
            { displayName: 'Collierville, TN', url: '/tennessee/collierville-apartments', distanceInMiles: 7 },
            { displayName: 'Bad', url: '/nope' },
          ],
        },
      },
    });
    const r = parseRentComPage(html);
    expect(r.total).toBe(53);
    expect(r.listings).toHaveLength(1);
    expect(r.nearby).toEqual([
      { name: 'Olive Branch', state: 'MS', path: '/mississippi/olive-branch', miles: 11.2 },
      { name: 'Collierville', state: 'TN', path: '/tennessee/collierville', miles: 7 },
    ]);
    expect(parseRentComPage('<html></html>')).toEqual({ listings: [], nearby: [], total: null });
  });

  it('builds Rent.com city paths and page URLs', () => {
    expect(rentComCityPath('Germantown', 'tn')).toBe('/tennessee/germantown');
    expect(rentComCityPath('Germantown', 'ZZ')).toBeNull();
    expect(rentComPageUrl('/tennessee/germantown', 'apartments')).toBe('https://www.rent.com/tennessee/germantown-apartments');
    expect(rentComPageUrl('/tennessee/germantown', 'houses', 2)).toBe('https://www.rent.com/tennessee/germantown-houses/page-2');
    expect(rentComKinds('any')).toEqual(['apartments', 'townhouses', 'houses']);
    expect(rentComKinds('house')).toEqual(['houses']);
  });

  it('pulls the city and state out of a job address', () => {
    expect(cityStateFromAddress('6000 Poplar Ave, Memphis, TN 38119, United States')).toEqual({ city: 'Memphis', state: 'TN' });
    expect(cityStateFromAddress('6000 Poplar Ave, Memphis, Shelby County, Tennessee, 38119, United States')).toEqual({ city: 'Memphis', state: 'TN' });
    expect(cityStateFromAddress('somewhere')).toBeNull();
  });

  it('turns a drive-time limit into a capped search radius', () => {
    expect(searchRadiusMiles({ radiusMode: 'miles', radiusMiles: 20 })).toBe(20);
    expect(searchRadiusMiles({ radiusMode: 'minutes', maxMinutes: 30 })).toBe(24);
    expect(searchRadiusMiles({ radiusMode: 'minutes', maxMinutes: 120 })).toBe(60);
    expect(searchRadiusMiles({ radiusMode: 'miles', radiusMiles: null })).toBeNull();
  });
});
