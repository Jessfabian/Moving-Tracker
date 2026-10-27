import type { Apartment, Place } from './types';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeocodeResult extends LatLng {
  label: string;
  /** Short name such as the business or building, when known. */
  name?: string;
}

const toRad = (d: number) => (d * Math.PI) / 180;

/** Straight-line ("as the crow flies") distance in miles. */
export function distanceMiles(a: LatLng, b: LatLng): number {
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rough drive-time estimate from straight-line miles (roads are ~25% longer; slower for short city trips). */
export function estimateDriveMinutes(miles: number): number {
  const road = miles * 1.25;
  const mph = road < 5 ? 22 : road < 20 ? 32 : 50;
  return Math.max(1, Math.round((road / mph) * 60));
}

export function formatMiles(miles: number | null | undefined): string {
  if (miles == null || !Number.isFinite(miles)) return '—';
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
}

export interface RouteDistance {
  miles: number;
  minutes: number;
  /** 'road' = real driving route (OSRM); 'estimate' = straight line × road factor. */
  method: 'road' | 'estimate';
}

/** OSRM `/route/v1/driving` response → driving miles & minutes. */
export function parseOsrmRoute(json: unknown): RouteDistance | null {
  const r = (json as { code?: string; routes?: { distance?: number; duration?: number }[] })?.routes?.[0];
  if (!r || typeof r.distance !== 'number' || !(r.distance > 0)) return null;
  return { miles: Math.round(r.distance / 1609.344), minutes: Math.round((r.duration ?? 0) / 60), method: 'road' };
}

/** Fallback when no routing service is reachable: straight-line distance × typical highway detour factor. */
export function estimateRoadDistance(a: LatLng, b: LatLng): RouteDistance {
  const straight = distanceMiles(a, b);
  const miles = Math.round(straight * (straight > 50 ? 1.18 : 1.3));
  return { miles, minutes: Math.round((miles / (straight > 50 ? 60 : 35)) * 60), method: 'estimate' };
}

export function apartmentAddress(a: Partial<Apartment>): string {
  const street = (a.address ?? '').trim();
  const cityLine = [a.city, [a.state, a.zip].filter(Boolean).join(' ')].map((s) => (s ?? '').trim()).filter(Boolean).join(', ');
  return [street, cityLine].filter(Boolean).join(', ');
}

export function apartmentLatLng(a: Partial<Apartment>): LatLng | null {
  return typeof a.latitude === 'number' && typeof a.longitude === 'number' ? { lat: a.latitude, lng: a.longitude } : null;
}

/** True when the apartment has an address that hasn't been turned into map coordinates yet. */
export function needsGeocode(a: Partial<Apartment>): boolean {
  const addr = apartmentAddress(a);
  if (!addr || !(a.address ?? '').trim()) return false;
  return addr !== (a.geocoded_address ?? '') || !apartmentLatLng(a);
}

export function primaryPlace(places: Place[] | undefined | null): Place | null {
  if (!places?.length) return null;
  return places.find((p) => p.primary) ?? places[0]!;
}

export function distanceToPlace(a: Partial<Apartment>, place: Place | null): { miles: number; minutes: number } | null {
  const ll = apartmentLatLng(a);
  if (!ll || !place) return null;
  const miles = distanceMiles(ll, place);
  return { miles, minutes: estimateDriveMinutes(miles) };
}

export function directionsUrl(from: LatLng | string, to: LatLng | string): string {
  const fmt = (p: LatLng | string) => (typeof p === 'string' ? p : `${p.lat},${p.lng}`);
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(fmt(from))}&destination=${encodeURIComponent(fmt(to))}&travelmode=driving`;
}

/* ------------------------------------------------------------------ */
/* Listing pages: pull photos and basics out of a rental listing's HTML */
/* ------------------------------------------------------------------ */

export interface ListingInfo {
  title?: string;
  description?: string;
  images: string[];
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  rent?: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  phone?: string;
  /** The real listing link (after unwrapping e-mail safe-links). */
  url?: string;
  /** True when the site blocked us and only the link's own text was used. */
  partial?: boolean;
  note?: string;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;|&#47;/g, '/')
    .replace(/\\u002F/gi, '/')
    .trim();

function absolutize(src: string, base: string): string | null {
  const s = decode(src);
  if (!s || s.startsWith('data:') || s.startsWith('blob:')) return null;
  try {
    const u = new URL(s.startsWith('//') ? `https:${s}` : s, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

const JUNK = /(logo|icon|sprite|favicon|avatar|badge|pixel|spacer|placeholder|blank|tracking|analytics|doubleclick|facebook\.com\/tr|maps\.googleapis|staticmap|\/ads?\/|banner|emoji|loader|spinner|xad\.com|bidagent|\/conv\/|\/pixel|stamp\.png)/i;

function looksLikePhoto(url: string): boolean {
  if (JUNK.test(url)) return false;
  if (/\.(svg|gif|ico)(\?|$)/i.test(url)) return false;
  return true;
}

function metaContent(html: string, names: string[]): string[] {
  const out: string[] = [];
  const re = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const key = /(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    if (!key || !names.includes(key)) continue;
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (content) out.push(decode(content));
  }
  return out;
}

const num = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && v.match(/\d/) ? n : undefined;
  }
  if (v && typeof v === 'object' && 'value' in v) return num((v as { value: unknown }).value);
  return undefined;
};

function walkJsonLd(node: unknown, info: ListingInfo, imgs: string[], base: string, depth = 0) {
  if (!node || depth > 8) return;
  if (Array.isArray(node)) {
    for (const n of node) walkJsonLd(n, info, imgs, base, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;
  const o = node as Record<string, unknown>;
  const pushImg = (v: unknown) => {
    if (typeof v === 'string') {
      const u = absolutize(v, base);
      if (u) imgs.push(u);
    } else if (Array.isArray(v)) v.forEach(pushImg);
    else if (v && typeof v === 'object') {
      const io = v as Record<string, unknown>;
      pushImg(io.contentUrl ?? io.url);
    }
  };
  pushImg(o.image);
  pushImg(o.photo);
  pushImg(o.photos);
  if (!info.title && typeof o.name === 'string' && o.name.length < 140) info.title = decode(o.name);
  const addr = o.address;
  if (addr && typeof addr === 'object' && !Array.isArray(addr)) {
    const a = addr as Record<string, unknown>;
    if (!info.address && typeof a.streetAddress === 'string') info.address = decode(a.streetAddress);
    if (!info.city && typeof a.addressLocality === 'string') info.city = decode(a.addressLocality);
    if (!info.state && typeof a.addressRegion === 'string') info.state = decode(a.addressRegion);
    if (!info.zip && (typeof a.postalCode === 'string' || typeof a.postalCode === 'number')) info.zip = String(a.postalCode);
  }
  const geo = o.geo as Record<string, unknown> | undefined;
  if (geo && info.lat == null) {
    const lat = num(geo.latitude);
    const lng = num(geo.longitude);
    if (lat != null && lng != null) {
      info.lat = typeof geo.latitude === 'string' && geo.latitude.trim().startsWith('-') ? -lat : lat;
      info.lng = typeof geo.longitude === 'string' && geo.longitude.trim().startsWith('-') ? -lng : lng;
    }
  }
  if (info.bedrooms == null) info.bedrooms = num(o.numberOfBedrooms) ?? num(o.numberOfRooms);
  if (info.bathrooms == null) info.bathrooms = num(o.numberOfBathroomsTotal) ?? num(o.numberOfFullBathrooms);
  if (info.sqft == null) info.sqft = num(o.floorSize);
  if (!info.phone && typeof o.telephone === 'string') info.phone = o.telephone;
  const offers = o.offers as Record<string, unknown> | undefined;
  if (offers && info.rent == null) info.rent = num(offers.price) ?? num(offers.lowPrice);
  for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object' && !['image', 'photo', 'photos', 'address', 'geo'].includes(k)) walkJsonLd(v, info, imgs, base, depth + 1);
}

/** Extract photos and basic facts (address, rent, beds…) from a listing page's HTML. Works without a DOM. */
export function parseListingHtml(html: string, pageUrl: string): ListingInfo {
  const info: ListingInfo = { images: [] };
  const fromMeta: string[] = [];
  const fromLd: string[] = [];
  const fromImg: string[] = [];

  for (const v of metaContent(html, ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src', 'image'])) {
    const u = absolutize(v, pageUrl);
    if (u) fromMeta.push(u);
  }
  info.title = metaContent(html, ['og:title', 'twitter:title'])[0] ?? decode(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? '') ?? undefined;
  info.description = metaContent(html, ['og:description', 'description', 'twitter:description'])[0];
  const lat = metaContent(html, ['place:location:latitude', 'og:latitude', 'geo.position'])[0];
  const lng = metaContent(html, ['place:location:longitude', 'og:longitude'])[0];
  if (lat && lng && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    info.lat = Number(lat);
    info.lng = Number(lng);
  }
  const street = metaContent(html, ['og:street-address', 'business:contact_data:street_address'])[0];
  if (street) info.address = street;
  const city = metaContent(html, ['og:locality', 'business:contact_data:locality'])[0];
  if (city) info.city = city;
  const region = metaContent(html, ['og:region', 'business:contact_data:region'])[0];
  if (region) info.state = region;
  const zip = metaContent(html, ['og:postal-code', 'business:contact_data:postal_code'])[0];
  if (zip) info.zip = zip;
  const price = metaContent(html, ['product:price:amount', 'og:price:amount'])[0];
  if (price) info.rent = num(price);

  const ldRe = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = ldRe.exec(html))) {
    try {
      walkJsonLd(JSON.parse(m[1]!.trim()), info, fromLd, pageUrl);
    } catch {
      /* ignore malformed JSON-LD */
    }
  }

  const imgRe = /<(?:img|source)\b[^>]*>/gi;
  while ((m = imgRe.exec(html))) {
    const tag = m[0];
    const width = Number(/\bwidth\s*=\s*["']?(\d+)/i.exec(tag)?.[1] ?? 0);
    if (width && width < 200) continue;
    const srcset = /\b(?:data-srcset|srcset)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const best = srcset
      ?.split(',')
      .map((s) => s.trim().split(/\s+/))
      .sort((a, b) => parseInt(b[1] ?? '0') - parseInt(a[1] ?? '0'))[0]?.[0];
    const src = best ?? /\b(?:data-src|data-lazy-src|data-original|src)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const u = src ? absolutize(src, pageUrl) : null;
    if (u) fromImg.push(u);
  }
  // Many listing sites embed photo URLs in inline JSON rather than <img> tags.
  const jsonImg = /https?:\\?\/\\?\/[^"'\s<>()]+?\.(?:jpe?g|webp|png)(?:\?[^"'\s<>()]*)?/gi;
  while ((m = jsonImg.exec(html)) && fromImg.length < 200) {
    const u = absolutize(m[0].replace(/\\\//g, '/'), pageUrl);
    if (u) fromImg.push(u);
  }

  // Inline app data (Angular transfer state, Next/Redux JSON…) often has the facts even when JSON-LD doesn't.
  const raw = html.replace(/\\?&q;/g, '"').replace(/&quot;/g, '"').replace(/\\"/g, '"');
  const jnum = (keys: string, min: number, max: number) => {
    const re = new RegExp(`"(?:${keys})"\\s*:\\s*"?(-?\\d+(?:\\.\\d+)?)`, 'g');
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(raw))) {
      const v = Number(mm[1]);
      if (v >= min && v <= max) return v;
    }
    return undefined;
  };
  const jstr = (keys: string, ok: RegExp) => {
    const re = new RegExp(`"(?:${keys})"\\s*:\\s*"([^"]{1,80})"`, 'g');
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(raw))) if (ok.test(mm[1]!)) return decode(mm[1]!);
    return undefined;
  };
  info.rent ??= jnum('rent|Rent|monthlyRent|MonthlyRent|MaxRent|maxRent|MinRent|minRent|listPrice|rentAmount|marketRent', 300, 30000);
  info.bedrooms ??= jnum('bedrooms|Bedrooms|beds|Beds|MinBeds|minBeds|bedroomCount', 0, 15);
  info.bathrooms ??= jnum('bathrooms|Bathrooms|baths|Baths|MinBaths|minBaths|bathroomCount', 0.5, 15);
  info.sqft ??= jnum('squareFeet|SquareFeet|sqft|Sqft|livingArea|area|MinSquareFeet|minSquareFeet', 200, 20000);
  if (info.lat == null) {
    const la = jnum('latitude|Latitude', -90, 90);
    const lo = jnum('longitude|Longitude', -180, 180);
    const gj = /"coordinates"\s*:\s*\[\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\]/.exec(raw);
    if (la != null && lo != null && Math.abs(la) > 1) [info.lat, info.lng] = [la, lo];
    else if (gj) [info.lng, info.lat] = [Number(gj[1]), Number(gj[2])];
  }
  info.address ??= jstr('streetAddress|StreetAddress|Address|address|addressLine1', /^\d+\s+\S/);
  info.city ??= jstr('addressLocality|City|city', /^(?!city$)[A-Za-z][A-Za-z .'-]{1,40}$/i);
  info.state ??= jstr('addressRegion|State|state|StateCode|stateCode', /^[A-Z]{2}$/);
  info.zip ??= jstr('postalCode|PostalCode|zip|Zip|ZipCode|zipCode', /^\d{5}$/);
  info.phone ??= jstr('telephone|phone|Phone|PhoneNumber|phoneNumber', /^\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/);
  // Photo galleries stored as bare ids ("url":"f86764…") next to an og:image built from one of them.
  const hashImg = fromMeta.map((u) => /^(.*?)([0-9a-f]{32,64})(.*)$/i.exec(u)).find(Boolean);
  if (hashImg) {
    const len = hashImg[2]!.length;
    const re = new RegExp(`"(?:url|id|hash|key)"\\s*:\\s*"([0-9a-f]{${len}})"`, 'gi');
    while ((m = re.exec(raw)) && fromImg.length < 200) fromImg.push(`${hashImg[1]}${m[1]}${hashImg[3]}`);
  }

  const seen = new Set<string>();
  const key = (u: string) => u.replace(/[?#].*$/, '').replace(/[-_](\d{2,4}x\d{2,4}|small|thumb|medium)(?=\.\w+$)/i, '');
  for (const u of [...fromMeta, ...fromLd, ...fromImg]) {
    if (!looksLikePhoto(u)) continue;
    const k = key(u);
    if (seen.has(k)) continue;
    seen.add(k);
    info.images.push(u);
    if (info.images.length >= 30) break;
  }

  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  if (!info.address) {
    const a = findAddressInText(text.replace(/\s+/g, ' '));
    if (a) {
      info.address = a.address;
      info.city ??= a.city;
      info.state ??= a.state;
      info.zip ??= a.zip;
    }
  }
  if (info.rent == null) {
    const r = /\$\s?((?:[1-9]\d{0,2}(?:,\d{3})+)|(?:[1-9]\d{2,4}))(?:\.\d{2})?\s*(?:\/\s*mo|per month|\/\s*month|a month|monthly)/i.exec(text);
    if (r) info.rent = num(r[1]);
  }
  if (info.bedrooms == null) {
    const b = /(\d+(?:\.\d)?)\s*(?:bd|beds?|bedrooms?)\b/i.exec(text);
    if (b) info.bedrooms = Number(b[1]);
    else if (/\bstudio\b/i.test(text)) info.bedrooms = 0;
  }
  if (info.bathrooms == null) {
    const b = /(\d+(?:\.\d)?)\s*(?:ba|baths?|bathrooms?)\b/i.exec(text);
    if (b) info.bathrooms = Number(b[1]);
  }
  if (info.sqft == null) {
    const s = /([1-9][\d,]{2,5})\s*(?:sq\.?\s*ft|sqft|square feet)/i.exec(text);
    if (s) info.sqft = num(s[1]);
  }
  for (const k of ['address', 'city'] as const) {
    const v = info[k];
    if (v && v.length > 3 && v === v.toUpperCase() && /[A-Z]/.test(v)) info[k] = titleCase(v.split(/\s+/));
  }
  if (info.title) {
    info.title = info.title
      .split(/\s+\|\s+/)[0]!
      .replace(/\s*[|–-]\s*(Zillow|Apartments\.com|Trulia|Realtor\.com|Rent\.com|Redfin|HotPads|Craigslist|Zumper|Apartment List).*$/i, '')
      .replace(/\s+[-–]\s+(?:[\w ]+\s+)?for\s+rent\b.*$/i, '')
      .replace(/\s+(?:single[- ]family\s+)?(?:home|house|apartment|condo|townhome|townhouse|duplex|room)s?\s+for\s+rent$/i, '')
      .trim();
  }
  return info;
}

/** Fill blank apartment fields from listing info and merge in new photos. */
export function listingToApartmentPatch(info: ListingInfo, current: Partial<Apartment>): Partial<Apartment> {
  const patch: Partial<Apartment> = {};
  const blank = (v: unknown) => v === undefined || v === null || v === '';
  if (blank(current.name) && info.title) patch.name = info.title.slice(0, 120);
  if (blank(current.address) && info.address) patch.address = info.address;
  if (blank(current.city) && info.city) patch.city = info.city;
  if (blank(current.state) && info.state) patch.state = info.state;
  if (blank(current.zip) && info.zip) patch.zip = info.zip;
  if (blank(current.rent) && info.rent && info.rent >= 100 && info.rent < 100000) patch.rent = info.rent;
  if (blank(current.bedrooms) && info.bedrooms != null && info.bedrooms < 20) patch.bedrooms = info.bedrooms;
  if (blank(current.bathrooms) && info.bathrooms != null && info.bathrooms < 20) patch.bathrooms = info.bathrooms;
  if (blank(current.sqft) && info.sqft && info.sqft > 100 && info.sqft < 20000) patch.sqft = info.sqft;
  if (blank(current.phone) && info.phone) patch.phone = info.phone;
  if (current.latitude == null && info.lat != null && info.lng != null) {
    patch.latitude = info.lat;
    patch.longitude = info.lng;
    patch.geocoded_address = apartmentAddress({ ...current, ...patch });
  }
  const existing = current.image_urls ?? [];
  const merged = [...existing, ...info.images.filter((u) => !existing.includes(u))];
  if (merged.length !== existing.length) patch.image_urls = merged;
  return patch;
}

/* ------------------------------------------------------------------ */
/* Address autocomplete & ZIP lookup                                   */
/* ------------------------------------------------------------------ */

export interface AddressSuggestion {
  /** One-line label for the dropdown. */
  label: string;
  name?: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
}

export const STATE_ABBR: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE',
  'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN',
  Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR',
  Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT',
  Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'Puerto Rico': 'PR',
};

export const stateCode = (s: string | undefined | null) => (s ? (STATE_ABBR[s] ?? (s.length === 2 ? s.toUpperCase() : s)) : '');

export function normalizeZip(z: string): string | null {
  const m = /^\s*(\d{5})(?:-?\d{4})?\s*$/.exec(z);
  return m ? m[1]! : null;
}

/** Parse https://api.zippopotam.us/us/{zip} */
export function parseZippopotam(json: unknown): { city: string; state: string; lat: number; lng: number } | null {
  const place = (json as { places?: Record<string, string>[] })?.places?.[0];
  if (!place) return null;
  return {
    city: place['place name'] ?? '',
    state: place['state abbreviation'] ?? stateCode(place.state),
    lat: Number(place.latitude),
    lng: Number(place.longitude),
  };
}

/** Parse a Photon (komoot, OpenStreetMap) GeoJSON response into address suggestions. */
export function parsePhoton(json: unknown): AddressSuggestion[] {
  const features = (json as { features?: { geometry?: { coordinates?: [number, number] }; properties?: Record<string, string> }[] })?.features ?? [];
  const out: AddressSuggestion[] = [];
  for (const f of features) {
    const p = f.properties ?? {};
    const c = f.geometry?.coordinates;
    if (!c) continue;
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    const city = p.city ?? p.town ?? p.village ?? p.district ?? p.county ?? '';
    const state = stateCode(p.state);
    const isPlace = p.name && p.name !== p.street && p.name !== city;
    const name = isPlace ? p.name : undefined;
    const line1 = street || (name ?? '');
    const label = [name && street ? `${name} — ${street}` : line1, city, [state, p.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    if (!label) continue;
    if (out.some((o) => o.label === label)) continue;
    out.push({ label, name, street: street || (name ?? ''), city, state, zip: p.postcode ?? '', lat: c[1], lng: c[0] });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Listing links: unwrap e-mail "safe links" and read the URL itself    */
/* ------------------------------------------------------------------ */

/**
 * Work e-mail wraps links (Proofpoint urldefense v2/v3, Outlook Safe Links, Google redirects).
 * Return the real listing URL inside.
 */
export function unwrapLink(raw: string): string {
  let s = raw.trim().replace(/^<|>$/g, '');
  for (let i = 0; i < 3; i++) {
    const v3 = /^https?:\/\/urldefense(?:\.proofpoint)?\.com\/v3\/__(.+?)__;([^!]*)!!/i.exec(s);
    if (v3) {
      let url = v3[1]!;
      if (url.includes('*') && v3[2]) {
        let chars: string[] = [];
        try {
          const b64 = v3[2].replace(/-/g, '+').replace(/_/g, '/');
          chars = [...decodeURIComponent(escape(atob(b64 + '==='.slice((b64.length + 3) % 4))))];
        } catch {
          chars = [];
        }
        let k = 0;
        url = url.replace(/\*\*[A-Za-z0-9-_]|\*/g, (m) => (m.length === 1 ? (chars[k++] ?? '') : (chars[k++] ?? '')));
      }
      s = url;
      continue;
    }
    const v2 = /^https?:\/\/urldefense\.proofpoint\.com\/v2\/url\?u=([^&]+)/i.exec(s);
    if (v2) {
      try {
        s = decodeURIComponent(v2[1]!.replace(/-/g, '%').replace(/_/g, '/'));
        continue;
      } catch {
        break;
      }
    }
    try {
      const u = new URL(s);
      const inner =
        /safelinks\.protection\.outlook\.com$/i.test(u.hostname) || /^(www\.)?google\.[a-z.]+$/i.test(u.hostname) && u.pathname === '/url'
          ? (u.searchParams.get('url') ?? u.searchParams.get('q'))
          : null;
      if (inner && /^https?:\/\//i.test(inner)) {
        s = inner;
        continue;
      }
    } catch {
      /* not a URL */
    }
    break;
  }
  // Tracking noise doesn't change the listing.
  try {
    const u = new URL(s);
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_)/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return s;
  }
}

const STREET_SUFFIX = new Set(
  'st street ave avenue rd road dr drive ln lane blvd boulevard ct court cv cove pl place way cir circle pkwy pky parkway trl trail ter terrace loop run hwy highway sq square xing crossing pt point row walk path pass bnd bend gln glen holw hollow crk creek cres crescent aly alley plz plaza mnr manor vw view rdg ridge hts heights cmns commons grv grove'.split(' '),
);
const DIRECTION = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'north', 'south', 'east', 'west']);
const SMALL_WORDS = new Set(['at', 'the', 'of', 'on', 'in', 'and', 'by']);
const STATE_CODES = new Set(Object.values(STATE_ABBR).map((s) => s.toLowerCase()));

const titleCase = (words: string[]) =>
  words
    .map((w, i) => {
      const l = w.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(l)) return l;
      if (DIRECTION.has(l) && l.length <= 2) return l.toUpperCase();
      return l.charAt(0).toUpperCase() + l.slice(1);
    })
    .join(' ');

/** Split "9954 lake geneva st lakeland" / "the willows at the lake district lakeland" into street|name and city. */
function splitStreetAndCity(words: string[]): { street?: string; name?: string; city?: string } {
  if (!words.length) return {};
  const numbered = /^\d/.test(words[0]!);
  // Last street suffix (optionally followed by a direction) marks where the street ends.
  let end = -1;
  for (let i = 1; i < words.length - 1; i++) if (STREET_SUFFIX.has(words[i]!.toLowerCase())) end = i;
  if (end > 0 && DIRECTION.has(words[end + 1]?.toLowerCase() ?? '') && end + 2 < words.length) end += 1;
  if (numbered && end > 0) return { street: titleCase(words.slice(0, end + 1)), city: titleCase(words.slice(end + 1)) };
  // Unknown split: assume a one-word city (Lakeland, Memphis, Germantown, Collierville, Bartlett…).
  const city = titleCase(words.slice(-1));
  const rest = words.slice(0, -1);
  if (!rest.length) return { city };
  return numbered ? { street: titleCase(rest), city } : { name: titleCase(rest), city };
}

/**
 * Many listing URLs spell out the address — apartments.com/9954-lake-geneva-st-lakeland-tn-unit-1/…,
 * firstkeyhomes.com/…/10242-evergreen-manor-cove-lakeland-tn-38002, zillow /homedetails/…-TN-38002/…
 * Used when the site won't let us read the page.
 */
export function listingFromUrl(raw: string): ListingInfo {
  const info: ListingInfo = { images: [] };
  let u: URL;
  try {
    u = new URL(unwrapLink(raw));
  } catch {
    return info;
  }
  const segs = u.pathname.split('/').map((s) => decodeURIComponent(s).toLowerCase()).filter(Boolean);
  for (const seg of [...segs].reverse()) {
    const words = seg.split(/[-_+\s]+/).filter(Boolean);
    let si = -1;
    for (let i = words.length - 1; i >= 1; i--) {
      if (STATE_CODES.has(words[i]!) && (i === words.length - 1 || /^\d{5}$/.test(words[i + 1]!) || /^(unit|apt|apartment|ste|suite|lot|bldg|#)/.test(words[i + 1]!))) {
        si = i;
        break;
      }
    }
    if (si < 1) continue;
    const after = words.slice(si + 1);
    const zip = after.find((w) => /^\d{5}$/.test(w));
    const unitIdx = after.findIndex((w) => /^(unit|apt|apartment|ste|suite|lot|bldg)$/.test(w));
    const unit = unitIdx >= 0 && after[unitIdx + 1] ? `${titleCase([after[unitIdx]!])} ${after[unitIdx + 1]!.toUpperCase()}` : undefined;
    const { street, name, city } = splitStreetAndCity(words.slice(0, si));
    if (street) info.address = unit ? `${street} ${unit}` : street;
    if (city) info.city = city;
    info.state = words[si]!.toUpperCase();
    if (zip) info.zip = zip;
    info.title = name ?? info.address;
    return info;
  }
  return info;
}

/** First "123 Some St, City, ST 12345" style address in plain text. */
export function findAddressInText(text: string): Pick<ListingInfo, 'address' | 'city' | 'state' | 'zip'> | null {
  const re = /\b(\d{1,6}\s+[A-Za-z0-9][A-Za-z0-9 .'#-]{2,60}?)\s*,?\s+([A-Za-z][A-Za-z .'-]{1,40}?)\s*,\s*([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (!STATE_CODES.has(m[3]!.toLowerCase())) continue;
    let street = m[1]!.trim();
    let city = m[2]!.trim();
    // "9932 LAKE GENEVA ST N LAKELAND, TN" — no comma between street and city.
    if (!/,/.test(m[0].slice(0, m[0].indexOf(city)))) {
      const split = splitStreetAndCity(`${street} ${city}`.split(/\s+/));
      if (split.street && split.city) {
        street = split.street;
        city = split.city;
      }
    }
    const up = street === street.toUpperCase();
    return { address: up ? titleCase(street.split(/\s+/)) : street, city: city === city.toUpperCase() ? titleCase(city.split(/\s+/)) : city, state: m[3]!.toUpperCase(), zip: m[4] };
  }
  return null;
}

/** Fill gaps in `primary` from `fallback`. */
export function mergeListing(primary: ListingInfo, fallback: ListingInfo): ListingInfo {
  const out: ListingInfo = { ...fallback, ...Object.fromEntries(Object.entries(primary).filter(([, v]) => v !== undefined && v !== '')) } as ListingInfo;
  out.images = primary.images.length ? primary.images : fallback.images;
  // The URL often keeps the unit number the page's structured data leaves off.
  if (primary.address && fallback.address && fallback.address.toLowerCase().startsWith(primary.address.toLowerCase())) out.address = fallback.address;
  return out;
}

/** Copy-pasted listing text (Ctrl+A, Ctrl+C on the listing page) → rent, beds, baths, size, address. */
export function parseListingText(text: string): ListingInfo {
  const t = text.replace(/\u00a0/g, ' ');
  const info: ListingInfo = { images: [] };
  const addr = findAddressInText(t);
  if (addr) Object.assign(info, addr);
  const label = (re: RegExp) => re.exec(t)?.[1];
  const rent =
    label(/(?:monthly rent|rent|price)\s*:?\s*\$\s?([\d,]{3,7})/i) ??
    label(/\$\s?([\d,]{3,7})(?:\.\d{2})?\s*(?:\/\s*mo|per month|\/\s*month|a month|monthly)/i) ??
    label(/^\s*\$\s?([\d,]{3,7})(?:\s*[-–]\s*\$?[\d,]{3,7})?\s*$/m);
  if (rent) info.rent = num(rent);
  const beds = label(/bedrooms?\s*:?\s*(\d+(?:\.\d)?)/i) ?? label(/(\d+(?:\.\d)?)\s*(?:bd|beds?|bedrooms?|br)\b/i);
  if (beds) info.bedrooms = Number(beds);
  else if (/\bstudio\b/i.test(t)) info.bedrooms = 0;
  const baths = label(/bathrooms?\s*:?\s*(\d+(?:\.\d)?)/i) ?? label(/(\d+(?:\.\d)?)\s*(?:ba|baths?|bathrooms?)\b/i);
  if (baths) info.bathrooms = Number(baths);
  const sqft = label(/square feet\s*:?\s*([\d,]{3,6})/i) ?? label(/([1-9][\d,]{2,5})\s*(?:sq\.?\s*ft|sqft|square feet|sf)\b/i);
  if (sqft) info.sqft = num(sqft);
  const phone = /\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/.exec(t)?.[0];
  if (phone) info.phone = phone;
  if (info.address) {
    // Listing sites put the property name on the line just above the street address.
    const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const at = lines.findIndex((l) => l.startsWith(info.address!));
    const prev = at > 0 ? lines[at - 1] : undefined;
    const looksLikeName = prev && prev.length <= 80 && /[a-z]/i.test(prev) && !/[$|]|\d{5}|photos?|tours?|videos?|›|>|sign in|menu/i.test(prev) && !/^(tennessee|texas|[A-Z][a-z]+)\s{2,}/.test(prev);
    info.title = looksLikeName ? prev : [info.address, info.city].filter(Boolean).join(', ');
  }
  return info;
}
