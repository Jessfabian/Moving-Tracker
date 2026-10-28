import type { Apartment } from './types';
import { apartmentAddress } from './geo';
import type { ApartmentSearch } from './apartments';

/** One rental found by the in-app search, ready to show as a card and save as an Apartment. */
export interface RentalResult {
  id: string;
  source: 'rent.com';
  name: string;
  url: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  priceMin: number | null;
  priceMax: number | null;
  bedsMin: number | null;
  bedsMax: number | null;
  bathsMin: number | null;
  bathsMax: number | null;
  sqftMin: number | null;
  sqftMax: number | null;
  homeType: Apartment['home_type'];
  phone: string;
  manager: string;
  amenities: string[];
  images: string[];
  special: string;
  available: string;
  floorPlans: { beds: number | null; baths: number | null; priceMin: number | null; priceMax: number | null; sqftMin: number | null; sqftMax: number | null }[];
}

const STATES: Record<string, string> = {
  AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california', CO: 'colorado', CT: 'connecticut', DE: 'delaware', DC: 'district-of-columbia',
  FL: 'florida', GA: 'georgia', HI: 'hawaii', ID: 'idaho', IL: 'illinois', IN: 'indiana', IA: 'iowa', KS: 'kansas', KY: 'kentucky', LA: 'louisiana', ME: 'maine',
  MD: 'maryland', MA: 'massachusetts', MI: 'michigan', MN: 'minnesota', MS: 'mississippi', MO: 'missouri', MT: 'montana', NE: 'nebraska', NV: 'nevada',
  NH: 'new-hampshire', NJ: 'new-jersey', NM: 'new-mexico', NY: 'new-york', NC: 'north-carolina', ND: 'north-dakota', OH: 'ohio', OK: 'oklahoma', OR: 'oregon',
  PA: 'pennsylvania', RI: 'rhode-island', SC: 'south-carolina', SD: 'south-dakota', TN: 'tennessee', TX: 'texas', UT: 'utah', VT: 'vermont', VA: 'virginia',
  WA: 'washington', WV: 'west-virginia', WI: 'wisconsin', WY: 'wyoming',
};

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Rent.com search pages to read for a city (or ZIP) and home type. */
export function rentComSearchUrls(s: Pick<ApartmentSearch, 'city' | 'state' | 'zip' | 'homeType'>, pages = 3): string[] {
  const state = STATES[s.state.trim().toUpperCase()];
  const kinds = s.homeType === 'house' ? ['houses'] : s.homeType === 'townhome' ? ['townhouses'] : s.homeType === 'apartment' ? ['apartments'] : ['apartments', 'townhouses', 'houses'];
  const out: string[] = [];
  for (const kind of kinds) {
    const base = s.city.trim() && state ? `https://www.rent.com/${state}/${slug(s.city)}-${kind}` : /^\d{5}$/.test(s.zip.trim()) ? `https://www.rent.com/zip-${s.zip.trim()}-${kind}` : '';
    if (!base) return [];
    const n = kinds.length > 1 && kind !== 'apartments' ? 1 : pages;
    for (let p = 1; p <= n; p++) out.push(p === 1 ? base : `${base}/page-${p}`);
  }
  return out;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const minOf = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.min(...v) : null;
};
const maxOf = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.max(...v) : null;
};
const range = (text: string): [number | null, number | null] => {
  const n = [...text.replace(/,/g, '').matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  if (/studio/i.test(text)) n.unshift(0);
  return n.length ? [Math.min(...n), Math.max(...n)] : [null, null];
};

const TYPES: Record<string, Apartment['home_type']> = { APARTMENTS: 'apartment', APARTMENT: 'apartment', CONDO: 'condo', CONDOS: 'condo', TOWNHOME: 'townhouse', TOWNHOMES: 'townhouse', TOWNHOUSE: 'townhouse', TOWNHOUSES: 'townhouse', HOUSE: 'house', HOUSES: 'house', SINGLE_FAMILY: 'house' };

/** Reads the listings embedded in a Rent.com search results page. */
export function parseRentComSearch(html: string): RentalResult[] {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  let data: unknown;
  try {
    data = JSON.parse(m[1]!);
  } catch {
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listings: any[] = (data as any)?.props?.pageProps?.pageData?.location?.listingSearch?.listings ?? [];
  return listings
    .filter((l) => l && l.id && l.name && !l.offMarket)
    .map((l): RentalResult => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const plans = (Array.isArray(l.floorPlans) ? l.floorPlans : []).map((f: any) => ({
        beds: num(f.bedCount),
        baths: num(f.bathCount),
        priceMin: num(f.priceRange?.min),
        priceMax: num(f.priceRange?.max),
        sqftMin: num(f.sqFtRange?.min),
        sqftMax: num(f.sqFtRange?.max),
      }));
      const [bedsT0, bedsT1] = range(str(l.bedText));
      const [bathT0, bathT1] = range(str(l.bathText));
      const [sqT0, sqT1] = range(str(l.squareFeetText));
      const loc = l.location ?? {};
      const amen = [...new Set<string>([...(l.uniqueHighlights ?? []), ...(l.amenitiesHighlighted ?? [])].filter((a: unknown): a is string => typeof a === 'string'))];
      return {
        id: `rent.com:${l.id}`,
        source: 'rent.com',
        name: str(l.name).replace(/#{2,}/g, '#'),
        url: l.urlPathname ? `https://www.rent.com${l.urlPathname}` : '',
        address: str(l.address),
        city: str(loc.city),
        state: str(loc.stateAbbr),
        zip: str(loc.zip) || str(l.zipCode),
        lat: num(loc.lat),
        lng: num(loc.lng),
        priceMin: num(l.priceRange?.min) ?? num(l.price) ?? minOf(plans.map((p: { priceMin: number | null }) => p.priceMin)),
        priceMax: num(l.priceRange?.max) ?? maxOf(plans.map((p: { priceMax: number | null }) => p.priceMax)),
        bedsMin: num(l.bedRange?.min) ?? bedsT0,
        bedsMax: num(l.bedRange?.max) ?? bedsT1,
        bathsMin: bathT0,
        bathsMax: bathT1,
        sqftMin: sqT0,
        sqftMax: sqT1,
        homeType: TYPES[str(l.propertyType)] ?? 'apartment',
        phone: str(l.phoneDesktopText) || str(l.phoneMobileText),
        manager: str(l.propertyManagementCompany?.name).replace(/\s*https?:\/\/\S+/g, '').trim(),
        amenities: amen.filter((a) => !/pet/i.test(a)).slice(0, 12),
        images: (Array.isArray(l.optimizedPhotos) ? l.optimizedPhotos : [])
          .map((p: { id?: string }) => (p?.id ? `https://i.rent.com/t_3x2_fixed_webp_lg/${p.id}` : ''))
          .filter(Boolean)
          .slice(0, 20),
        special: str(l.dealsText) || (Array.isArray(l.deals) && l.deals[0]?.description ? str(l.deals[0].description) : ''),
        available: str(l.unitsAvailableText),
        floorPlans: plans,
      };
    });
}

/** The cheapest floor plan that satisfies the beds/baths asked for (else the listing's starting price). */
export function rentalBestPlan(r: RentalResult, s: Pick<ApartmentSearch, 'beds' | 'baths'>) {
  const fit = r.floorPlans
    .filter((p) => (!s.beds || (p.beds ?? 0) >= s.beds) && (!s.baths || (p.baths ?? 0) >= s.baths) && p.priceMin != null)
    .sort((a, b) => a.priceMin! - b.priceMin!);
  return fit[0] ?? null;
}

/** Keeps listings that could match: enough bedrooms/baths in some floor plan and a price inside the min–max range. */
export function filterRentals(list: RentalResult[], s: Pick<ApartmentSearch, 'beds' | 'baths' | 'maxRent' | 'minRent' | 'mustHaves'>): RentalResult[] {
  const seen = new Set<string>();
  return list.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    if (s.beds && r.bedsMax != null && r.bedsMax < s.beds) return false;
    if (s.baths && r.bathsMax != null && r.bathsMax < s.baths) return false;
    const plan = rentalBestPlan(r, s);
    const price = plan?.priceMin ?? r.priceMin;
    if (s.maxRent && price != null && price > s.maxRent) return false;
    if (s.minRent) {
      const fits = r.floorPlans.filter((p) => (!s.beds || (p.beds ?? 0) >= s.beds) && (!s.baths || (p.baths ?? 0) >= s.baths));
      const tops = fits.map((p) => p.priceMax ?? p.priceMin).filter((n): n is number => n != null);
      const top = tops.length ? Math.max(...tops) : (r.priceMax ?? r.priceMin);
      if (top != null && top < s.minRent) return false;
    }
    return true;
  });
}

/** How many of the must-haves a listing's amenity list mentions — used to sort the best matches first. */
export function mustHaveScore(r: RentalResult, mustHaves: string[]): number {
  const text = r.amenities.join(' ').toLowerCase();
  const words: Record<string, RegExp> = {
    'In-unit laundry': /washer|in.unit laundry|w\/d/,
    Garage: /garage/,
    Pool: /pool/,
    'Fitness center': /fitness|gym/,
    Dishwasher: /dishwasher/,
    'Fenced yard': /fenced|yard/,
    'Washer/dryer hookups': /hookup|washer/,
    Gated: /gated|controlled access/,
  };
  return mustHaves.filter((m) => (words[m] ?? new RegExp(m.toLowerCase())).test(text)).length;
}

/** Turns a search result into a full Apartment row so it lives on our site like any other. */
export function rentalToApartment(r: RentalResult, s: Pick<ApartmentSearch, 'beds' | 'baths'>): Partial<Apartment> {
  const plan = rentalBestPlan(r, s);
  const amen = r.amenities.join(' ').toLowerCase();
  const lines = [
    `Found on Rent.com${r.manager ? ` · managed by ${r.manager}` : ''}.`,
    r.priceMin != null ? `Rent range ${fmt(r.priceMin)}${r.priceMax && r.priceMax !== r.priceMin ? `–${fmt(r.priceMax)}` : ''}/mo.` : '',
    r.available,
    r.floorPlans.length
      ? `Floor plans:\n${r.floorPlans
          .map((p) => `• ${p.beds === 0 ? 'Studio' : `${p.beds ?? '?'} bd`} / ${p.baths ?? '?'} ba${p.sqftMin ? ` · ${p.sqftMin}${p.sqftMax && p.sqftMax !== p.sqftMin ? `–${p.sqftMax}` : ''} ft²` : ''}${p.priceMin != null ? ` · ${fmt(p.priceMin)}${p.priceMax && p.priceMax !== p.priceMin ? `–${fmt(p.priceMax)}` : ''}` : ''}`)
          .join('\n')}`
      : '',
  ].filter(Boolean);
  return {
    name: r.name,
    address: r.address,
    city: r.city,
    state: r.state,
    zip: r.zip,
    listing_url: r.url,
    contact_name: r.manager,
    phone: r.phone,
    status: 'researching',
    home_type: r.homeType,
    rent: plan?.priceMin ?? r.priceMin,
    bedrooms: plan?.beds ?? r.bedsMin,
    bathrooms: plan?.baths ?? r.bathsMin,
    sqft: plan?.sqftMin ?? r.sqftMin,
    pets_allowed: true,
    amenities: r.amenities,
    laundry: /washer|laundry/.test(amen) ? 'in_unit' : 'unknown',
    parking: /garage/.test(amen) ? 'garage' : 'unknown',
    move_in_special: r.special,
    image_urls: r.images,
    latitude: r.lat,
    longitude: r.lng,
    geocoded_address: r.lat != null ? apartmentAddress(r) : '',
    notes: lines.join('\n'),
  };
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
