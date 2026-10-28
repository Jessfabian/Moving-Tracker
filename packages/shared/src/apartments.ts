import type { Apartment } from './types';
import { rentComSearchUrls } from './rentalSearch';

const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export interface ApartmentCosts {
  monthly: number;
  moveIn: number;
  firstYear: number;
  perSqft: number | null;
  perBedroom: number | null;
}

/** True monthly cost, cash needed to move in, and total cost over the first 12 months.
 *  Pet rent / pet deposits are excluded: our pet is an ESA, so under the Fair Housing Act landlords can't charge them. */
export function apartmentCosts(a: Partial<Apartment>): ApartmentCosts {
  const monthly = n(a.rent) + n(a.parking_fee) + n(a.utilities_est) + n(a.other_monthly);
  const oneTime = n(a.deposit) + n(a.application_fee) + n(a.admin_fee) + n(a.broker_fee);
  const moveIn = oneTime + monthly;
  const refundable = n(a.deposit);
  const firstYear = monthly * 12 + oneTime - refundable;
  return {
    monthly,
    moveIn,
    firstYear,
    perSqft: a.sqft && n(a.rent) ? Math.round((n(a.rent) / a.sqft) * 100) / 100 : null,
    perBedroom: a.bedrooms && n(a.rent) ? Math.round(n(a.rent) / a.bedrooms) : null,
  };
}

/** Rule of thumb: rent should be ≤ 30% of gross monthly income. */
export function incomeNeeded(monthlyRent: number, ratio = 0.3) {
  return monthlyRent > 0 ? Math.round(monthlyRent / ratio) * 12 : 0;
}

export const APARTMENT_CHECKLIST: string[] = [
  'Verify the landlord / management company is legitimate (never wire money before touring)',
  'Ask what utilities are included and average monthly bills',
  'Send the ESA letter with the application — no pet rent, pet deposit or pet fees can be charged for an emotional support animal (Fair Housing Act)',
  'Check cell signal and internet providers available',
  'Test water pressure, hot water, appliances, HVAC, windows and locks',
  'Look for signs of pests, mold, leaks or water damage',
  'Ask about parking, guest parking and EV charging',
  'Ask about noise, quiet hours and who lives above/below',
  'Clarify lease break penalties, renewal increases and subletting rules',
  'Ask about renters insurance requirements',
  'Confirm move-in date, elevator reservation and moving-truck rules',
  'Drive the commute at rush hour; visit at night',
  'Look up school ratings and walkability for the neighborhood',
  'Take photos/video of existing damage at move-in',
];

export interface ApartmentSearch {
  city: string;
  state: string;
  zip: string;
  beds: number | null;
  baths: number | null;
  maxRent: number | null;
  homeType: 'any' | 'apartment' | 'house' | 'townhome';
  mustHaves: string[];
}

export const APARTMENT_MUST_HAVES = ['In-unit laundry', 'Garage', 'Pool', 'Fitness center', 'Dishwasher', 'Fenced yard', 'Washer/dryer hookups', 'Gated'] as const;

export interface SearchLink {
  site: string;
  url: string;
  note: string;
}

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Pre-filled search pages on the big rental sites for what the family is looking for. */
export function apartmentSearchLinks(s: ApartmentSearch): SearchLink[] {
  const city = s.city.trim();
  const st = s.state.trim().toUpperCase();
  const zip = s.zip.trim();
  if (!city && !zip) return [];
  const cityState = city ? `${slug(city)}-${st.toLowerCase()}` : zip;
  const beds = s.beds && s.beds > 0 ? Math.min(Math.round(s.beds), 4) : null;
  const max = s.maxRent && s.maxRent > 0 ? Math.round(s.maxRent) : null;
  const where = city ? `${city}, ${st}` : zip;
  const homeType = s.homeType === 'house' ? 'houses' : s.homeType === 'townhome' ? 'townhomes' : s.homeType === 'apartment' ? 'apartments' : '';

  const acParts = [beds ? `${beds}-bedrooms` : '', max ? `under-${max}` : ''].filter(Boolean).join('-');
  const apartmentsCom = `https://www.apartments.com/${homeType && homeType !== 'apartments' ? `${homeType}/` : ''}${zip && !city ? zip : cityState}/${acParts ? `${acParts}/` : ''}`;

  const zillowQ = encodeURIComponent(
    JSON.stringify({
      usersSearchTerm: where,
      filterState: {
        fr: { value: true },
        fsba: { value: false },
        fsbo: { value: false },
        nc: { value: false },
        cmsn: { value: false },
        auc: { value: false },
        fore: { value: false },
        ...(beds ? { beds: { min: beds } } : {}),
        ...(s.baths ? { baths: { min: s.baths } } : {}),
        ...(max ? { mp: { max } } : {}),
      },
    }),
  );
  const zillow = `https://www.zillow.com/${city ? cityState : zip}/rentals/?searchQueryState=${zillowQ}`;

  const realtorCity = city ? `${city.replace(/\s+/g, '-')}_${st}` : zip;
  const realtor = `https://www.realtor.com/apartments/${realtorCity}${beds ? `/beds-${beds}` : ''}${max ? `/price-na-${max}` : ''}`;

  const hp = new URLSearchParams();
  if (beds) hp.set('beds', `${beds}-8+`);
  if (max) hp.set('maxPrice', String(max));
  const hotpads = `https://hotpads.com/${city ? cityState : zip}/${homeType || 'apartments'}-for-rent${hp.toString() ? `?${hp}` : ''}`;

  const trulia = `https://www.trulia.com/for_rent/${city ? `${city.replace(/\s+/g, '_')},${st}` : zip}/${beds ? `${beds}p_beds/` : ''}${max ? `0-${max}_price/` : ''}`;

  const rentCom = rentComSearchUrls({ city, state: st, zip, homeType: s.homeType === 'any' ? 'apartment' : s.homeType }, 1)[0];

  return [
    { site: 'Apartments.com', url: apartmentsCom, note: 'Biggest apartment inventory' },
    { site: 'Zillow', url: zillow, note: 'Houses, townhomes and apartments' },
    { site: 'Realtor.com', url: realtor, note: 'Rentals from local agents' },
    { site: 'HotPads', url: hotpads, note: 'Map-first rental search' },
    { site: 'Trulia', url: trulia, note: 'Neighborhood and crime maps' },
    ...(rentCom ? [{ site: 'Rent.com', url: rentCom, note: 'Same results as the in-app search' }] : []),
  ];
}