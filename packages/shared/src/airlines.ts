import type { TravelItem } from './types';

export interface Airline {
  /** IATA code (DL). */
  code: string;
  /** ICAO code used in flight callsigns (DAL). */
  icao: string;
  name: string;
  /** Manage-trip / find-reservation page. */
  manageUrl: string;
  /** Typical redemption value of one mile/point, in cents. */
  centsPerMile: number;
  program: string;
}

export const AIRLINES: Airline[] = [
  { code: 'DL', icao: 'DAL', name: 'Delta', manageUrl: 'https://www.delta.com/my-trips/search', centsPerMile: 1.2, program: 'SkyMiles' },
  { code: 'AA', icao: 'AAL', name: 'American', manageUrl: 'https://www.aa.com/reservation/view/find-your-trip', centsPerMile: 1.4, program: 'AAdvantage' },
  { code: 'UA', icao: 'UAL', name: 'United', manageUrl: 'https://www.united.com/en/us/manageres/mytrips', centsPerMile: 1.3, program: 'MileagePlus' },
  { code: 'WN', icao: 'SWA', name: 'Southwest', manageUrl: 'https://www.southwest.com/air/manage-reservation/', centsPerMile: 1.35, program: 'Rapid Rewards' },
  { code: 'AS', icao: 'ASA', name: 'Alaska', manageUrl: 'https://www.alaskaair.com/booking/reservation-lookup', centsPerMile: 1.45, program: 'Mileage Plan' },
  { code: 'B6', icao: 'JBU', name: 'JetBlue', manageUrl: 'https://www.jetblue.com/manage-trips', centsPerMile: 1.3, program: 'TrueBlue' },
  { code: 'NK', icao: 'NKS', name: 'Spirit', manageUrl: 'https://www.spirit.com/my-trips', centsPerMile: 1.0, program: 'Free Spirit' },
  { code: 'F9', icao: 'FFT', name: 'Frontier', manageUrl: 'https://www.flyfrontier.com/travel/my-trips/manage-trip/', centsPerMile: 1.0, program: 'FRONTIER Miles' },
  { code: 'G4', icao: 'AAY', name: 'Allegiant', manageUrl: 'https://www.allegiantair.com/manage-travel', centsPerMile: 1.0, program: 'Allways Rewards' },
  { code: 'SY', icao: 'SCX', name: 'Sun Country', manageUrl: 'https://www.suncountry.com/manage-travel', centsPerMile: 1.0, program: 'Sun Country Rewards' },
  { code: 'MX', icao: 'MXY', name: 'Breeze', manageUrl: 'https://www.flybreeze.com/trips', centsPerMile: 1.0, program: 'BreezePoints' },
  { code: 'HA', icao: 'HAL', name: 'Hawaiian', manageUrl: 'https://www.hawaiianairlines.com/manage-flights', centsPerMile: 1.1, program: 'HawaiianMiles' },
];

export const AIRLINE_OPTIONS = [
  { value: '', label: '—' },
  ...AIRLINES.map((a) => ({ value: a.code, label: `${a.name} (${a.code})` })),
];

export function airlineByCode(code: string | null | undefined): Airline | undefined {
  if (!code) return undefined;
  const c = code.trim().toUpperCase();
  return AIRLINES.find((a) => a.code === c || a.icao === c || a.name.toUpperCase() === c);
}

/** Best-guess airline from free text ("Delta Air Lines", "DL 1234", "southwest"). */
export function guessAirline(text: string): Airline | undefined {
  const t = text.toLowerCase();
  return AIRLINES.find((a) => t.includes(a.name.toLowerCase())) ?? airlineByCode(text.match(/\b([A-Z][A-Z0-9])\s?\d{1,4}\b/)?.[1]);
}

/** "DL1234" from airline + "1234" (also accepts "DL 1234" typed into the number field). */
export function flightCode(airline: string | null | undefined, number: string | null | undefined): string | null {
  const raw = (number ?? '').toUpperCase().replace(/\s+/g, '');
  const m = raw.match(/^([A-Z][A-Z0-9])?(\d{1,4})$/);
  if (!m) return null;
  const code = m[1] ?? airlineByCode(airline)?.code;
  return code ? `${code}${m[2]}` : null;
}

/** Regional airlines that fly "Express / Connection / Eagle" flights; they broadcast their own callsign. */
export const REGIONAL_OPERATORS: { match: RegExp; icao: string; name: string }[] = [
  { match: /skywest/i, icao: 'SKW', name: 'SkyWest' },
  { match: /republic/i, icao: 'RPA', name: 'Republic' },
  { match: /envoy/i, icao: 'ENY', name: 'Envoy' },
  { match: /piedmont/i, icao: 'PDT', name: 'Piedmont' },
  { match: /\bpsa\b/i, icao: 'JIA', name: 'PSA' },
  { match: /endeavor/i, icao: 'EDV', name: 'Endeavor' },
  { match: /mesa/i, icao: 'ASH', name: 'Mesa' },
  { match: /air wisconsin/i, icao: 'AWI', name: 'Air Wisconsin' },
  { match: /horizon/i, icao: 'QXE', name: 'Horizon' },
  { match: /gojet/i, icao: 'GJS', name: 'GoJet' },
  { match: /commutair/i, icao: 'UCA', name: 'CommutAir' },
];

export function regionalOperator(operatedBy: string | null | undefined) {
  return operatedBy ? REGIONAL_OPERATORS.find((o) => o.match.test(operatedBy)) : undefined;
}

/**
 * ICAO callsign used by flight trackers ("DAL1234"). Regional flights broadcast
 * the operator's prefix ("UA 5574 operated by SkyWest" → "SKW5574").
 */
export function flightCallsign(airline: string | null | undefined, number: string | null | undefined, operatedBy?: string | null): string | null {
  const code = flightCode(airline, number);
  if (!code) return null;
  const op = regionalOperator(operatedBy);
  if (op) return `${op.icao}${code.slice(2)}`;
  const a = airlineByCode(code.slice(0, 2));
  return a ? `${a.icao}${code.slice(2)}` : code;
}

/** Big US airports so the route map can be drawn straight from the booking, even offline. */
export const AIRPORTS: Record<string, { name: string; city: string; lat: number; lon: number }> = {
  ATL: { name: 'Hartsfield–Jackson Atlanta', city: 'Atlanta', lat: 33.6407, lon: -84.4277 },
  AUS: { name: 'Austin–Bergstrom', city: 'Austin', lat: 30.1975, lon: -97.6664 },
  BNA: { name: 'Nashville International', city: 'Nashville', lat: 36.1263, lon: -86.6774 },
  BOS: { name: 'Boston Logan', city: 'Boston', lat: 42.3656, lon: -71.0096 },
  BWI: { name: 'Baltimore/Washington', city: 'Baltimore', lat: 39.1754, lon: -76.6683 },
  CLT: { name: 'Charlotte Douglas', city: 'Charlotte', lat: 35.214, lon: -80.9431 },
  DAL: { name: 'Dallas Love Field', city: 'Dallas', lat: 32.8471, lon: -96.8518 },
  DCA: { name: 'Reagan National', city: 'Washington', lat: 38.8512, lon: -77.0402 },
  DEN: { name: 'Denver International', city: 'Denver', lat: 39.8561, lon: -104.6737 },
  DFW: { name: 'Dallas/Fort Worth', city: 'Dallas', lat: 32.8998, lon: -97.0403 },
  DTW: { name: 'Detroit Metro', city: 'Detroit', lat: 42.2162, lon: -83.3554 },
  ELP: { name: 'El Paso International', city: 'El Paso', lat: 31.8072, lon: -106.3776 },
  EWR: { name: 'Newark Liberty', city: 'Newark', lat: 40.6895, lon: -74.1745 },
  FLL: { name: 'Fort Lauderdale', city: 'Fort Lauderdale', lat: 26.0742, lon: -80.1506 },
  HOU: { name: 'Houston Hobby', city: 'Houston', lat: 29.6454, lon: -95.2789 },
  IAD: { name: 'Washington Dulles', city: 'Washington', lat: 38.9531, lon: -77.4565 },
  IAH: { name: 'Houston Bush Intercontinental', city: 'Houston', lat: 29.9902, lon: -95.3368 },
  JFK: { name: 'New York JFK', city: 'New York', lat: 40.6413, lon: -73.7781 },
  LAS: { name: 'Harry Reid Las Vegas', city: 'Las Vegas', lat: 36.084, lon: -115.1537 },
  LAX: { name: 'Los Angeles International', city: 'Los Angeles', lat: 33.9416, lon: -118.4085 },
  LGA: { name: 'New York LaGuardia', city: 'New York', lat: 40.7769, lon: -73.874 },
  LIT: { name: 'Clinton National', city: 'Little Rock', lat: 34.7294, lon: -92.2243 },
  MCI: { name: 'Kansas City International', city: 'Kansas City', lat: 39.2976, lon: -94.7139 },
  MCO: { name: 'Orlando International', city: 'Orlando', lat: 28.4312, lon: -81.3081 },
  MDW: { name: 'Chicago Midway', city: 'Chicago', lat: 41.7868, lon: -87.7522 },
  MEM: { name: 'Memphis International', city: 'Memphis', lat: 35.0424, lon: -89.9767 },
  MIA: { name: 'Miami International', city: 'Miami', lat: 25.7959, lon: -80.287 },
  MSP: { name: 'Minneapolis–St Paul', city: 'Minneapolis', lat: 44.8848, lon: -93.2223 },
  MSY: { name: 'New Orleans Armstrong', city: 'New Orleans', lat: 29.9934, lon: -90.258 },
  OKC: { name: 'Will Rogers', city: 'Oklahoma City', lat: 35.3931, lon: -97.6007 },
  ORD: { name: "Chicago O'Hare", city: 'Chicago', lat: 41.9742, lon: -87.9073 },
  PDX: { name: 'Portland International', city: 'Portland', lat: 45.5898, lon: -122.5951 },
  PHL: { name: 'Philadelphia International', city: 'Philadelphia', lat: 39.8744, lon: -75.2424 },
  PHX: { name: 'Phoenix Sky Harbor', city: 'Phoenix', lat: 33.4352, lon: -112.0101 },
  SAN: { name: 'San Diego International', city: 'San Diego', lat: 32.7338, lon: -117.1933 },
  SAT: { name: 'San Antonio International', city: 'San Antonio', lat: 29.5337, lon: -98.4698 },
  SEA: { name: 'Seattle–Tacoma', city: 'Seattle', lat: 47.4502, lon: -122.3088 },
  SFO: { name: 'San Francisco International', city: 'San Francisco', lat: 37.6213, lon: -122.379 },
  SLC: { name: 'Salt Lake City', city: 'Salt Lake City', lat: 40.7899, lon: -111.9791 },
  STL: { name: 'St. Louis Lambert', city: 'St. Louis', lat: 38.7487, lon: -90.37 },
  TPA: { name: 'Tampa International', city: 'Tampa', lat: 27.9755, lon: -82.5332 },
  TUL: { name: 'Tulsa International', city: 'Tulsa', lat: 36.1984, lon: -95.8881 },
};

function haversineMilesPts(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 3958.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Route built from the airports on the booking (null when either airport isn't in the table). */
export function bookedRoute(origin: string | null | undefined, destination: string | null | undefined, callsign = ''): FlightRoute | null {
  const o = AIRPORTS[(origin ?? '').trim().toUpperCase()];
  const d = AIRPORTS[(destination ?? '').trim().toUpperCase()];
  if (!o || !d) return null;
  const origin_ = { iata: origin!.trim().toUpperCase(), ...o };
  const dest_ = { iata: destination!.trim().toUpperCase(), ...d };
  return { callsign, airline: '', origin: origin_, destination: dest_, distanceMiles: haversineMilesPts(o, d) };
}

export interface TrackerLink {
  label: string;
  url: string;
}

export function flightTrackerLinks(airline: string | null | undefined, number: string | null | undefined, date?: string | null, operatedBy?: string | null): TrackerLink[] {
  const code = flightCode(airline, number);
  const call = flightCallsign(airline, number, operatedBy);
  if (!code || !call) return [];
  const links: TrackerLink[] = [
    { label: 'FlightAware', url: `https://www.flightaware.com/live/flight/${call}` },
    { label: 'Flightradar24', url: `https://www.flightradar24.com/data/flights/${code.toLowerCase()}` },
    { label: 'Google', url: `https://www.google.com/search?q=${encodeURIComponent(`${code} flight status ${date ?? ''}`.trim())}` },
  ];
  return links;
}

/** Dollar value of miles spent on an item: the typed value, else miles × the airline's typical cents-per-mile. */
export function milesDollarValue(t: Pick<TravelItem, 'miles_used' | 'miles_value' | 'airline' | 'provider'>): number {
  if (t.miles_value != null && t.miles_value > 0) return t.miles_value;
  const miles = t.miles_used ?? 0;
  if (miles <= 0) return 0;
  const cpm = (airlineByCode(t.airline) ?? guessAirline(t.provider ?? ''))?.centsPerMile ?? 1.2;
  return Math.round(miles * cpm) / 100;
}

/* ---------- confirmation e-mail parser ---------- */

export interface ParsedFlight {
  airline: string;
  flight_number: string;
  origin: string;
  destination: string;
  start_date: string | null;
  start_time: string;
  end_date: string | null;
  end_time: string;
  seat: string;
  aircraft: string;
  /** Regional partner actually flying it ("SKYWEST") — shown so a tracker mismatch makes sense. */
  operated_by: string;
}

export interface ParsedItinerary {
  confirmation: string;
  airline: string;
  flights: ParsedFlight[];
  cost: number | null;
  miles_used: number | null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const NOT_AIRPORTS = new Set(['THE', 'AND', 'FOR', 'YOU', 'ARE', 'PNR', 'USD', 'TSA', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN', 'DOT', 'FAA', 'SKY', 'SEAT', 'NON', 'ONE', 'WAY', 'ALL', 'NOT', 'PER', 'FEE', 'TAX', 'GET', 'DBA', 'PDF', 'FAQ', 'APT', 'SUV', 'URL', 'WWW', 'COM', 'NEW', 'YES', 'OFF', 'VIA', 'CAR']);
const NOT_CONFIRMATION = new Set(['NUMBER', 'STATUS', 'TICKET', 'RECORD', 'LOCATOR', 'DETAIL', 'EMAILS', 'CHANGE', 'CANCEL', 'TRAVEL', 'UNITED', 'FLIGHT', 'AMOUNT', 'BOOKED']);
const DEPART = /\bdepart(?:s|ing|ure)?\b/i;

/**
 * Copied web pages glue words together and some airlines add screen-reader
 * spellings ("A,U,SAUSAustin" = AUS Austin). Pull them apart so the regexes see words.
 */
function normalizeItinerary(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;|[\u00a0\u200b-\u200d\ufeff]/g, ' ')
    .replace(/([A-Z]),([A-Z]),([A-Z])(?=\1\2\3)/g, ' ')
    .replace(/([A-Z]),([A-Z]),([A-Z])(?![a-z])/g, ' $1$2$3 ')
    .replace(/([a-z\d)])([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Z\d])([A-Z][a-z]{2,})/g, '$1 $2')
    .replace(/\b((?:19|20)\d{2})(\d{1,2}:\d{2})/g, '$1 $2')
    .replace(/(\d)([AP]M)([A-Z])/g, '$1 $2 $3')
    .replace(/\b(flight)([A-Z0-9]{2}\s?\d)/gi, '$1 $2')
    .replace(/[ \t]+/g, ' ');
}

function parseDates(text: string, fallbackYear: number): string[] {
  const out: { i: number; d: string }[] = [];
  const pad = (n: number) => String(n).padStart(2, '0');
  const yr = (y: string | undefined) => (!y ? fallbackYear : y.length === 2 ? 2000 + +y : +y);
  for (const m of text.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b,?\s*(\d{4})?/gi)) {
    out.push({ i: m.index ?? 0, d: `${yr(m[3])}-${pad(MONTHS.indexOf(m[1].toLowerCase()) + 1)}-${pad(+m[2])}` });
  }
  // "15 Nov 2026" and receipt-style "15NOV26"
  for (const m of text.matchAll(/\b(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s*(\d{4}|\d{2}(?![\d:]))?/gi)) {
    out.push({ i: m.index ?? 0, d: `${yr(m[3])}-${pad(MONTHS.indexOf(m[2].toLowerCase()) + 1)}-${pad(+m[1])}` });
  }
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g)) {
    out.push({ i: m.index ?? 0, d: `${yr(m[3])}-${pad(+m[1])}-${pad(+m[2])}` });
  }
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.push({ i: m.index ?? 0, d: m[0] });
  return out.sort((a, b) => a.i - b.i).map((x) => x.d);
}

function parseTimes(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b(\d{1,2}):(\d{2})\s*([ap])\.?m?\.?(?![a-z])|\b([01]?\d|2[0-3]):([0-5]\d)\b/gi)) {
    let h: number, min: string;
    if (m[3]) {
      h = +m[1] % 12 + (m[3].toLowerCase() === 'p' ? 12 : 0);
      min = m[2];
    } else {
      h = +m[4];
      min = m[5];
    }
    out.push(`${String(h).padStart(2, '0')}:${min}`);
  }
  return out;
}

function parseAirports(text: string): string[] {
  const codes: { i: number; c: string }[] = [];
  const strong =
    /\(([A-Z]{3})(?:\s*[-–][^)]*)?\)|\b([A-Z]{3})\b(?=\s*(?:→|->|–|-|to\b|\u2708))|(?:→|->|–|\bto\b)\s*([A-Z]{3})\b|^\s*([A-Z]{3})\s*$|\b([A-Z]{3})\s+(?=[A-Z][a-z]+(?:[ .'-][A-Za-z]+)*,\s*[A-Z]{2}\b)/gm;
  for (const m of text.matchAll(strong)) {
    const c = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5];
    if (c && !NOT_AIRPORTS.has(c)) codes.push({ i: m.index ?? 0, c });
  }
  if (codes.length < 2) {
    for (const m of text.matchAll(/\b([A-Z]{3})\b/g)) {
      const i = m.index ?? 0;
      if (!NOT_AIRPORTS.has(m[1]) && !codes.some((x) => x.c === m[1] && Math.abs(x.i - i) < 8)) codes.push({ i, c: m[1] });
    }
  }
  const list = codes.sort((a, b) => a.i - b.i).map((x) => x.c);
  return list.filter((c, i) => c !== list[i - 1]);
}

function segmentDetails(chunk: string) {
  return {
    seat: chunk.match(/\bseats?\s*(?:#|:)?\s*(\d{1,2}[A-K])(?![a-z])/i)?.[1] ?? '',
    aircraft: chunk.match(/\b[Aa]ircraft\s*:?\s*([A-Z][\w-]*(?: [A-Z0-9][\w-]*){0,2})/)?.[1]?.replace(/\s+(?:Fare|Meal|Seats?|Duration)$/, '').trim() ?? '',
    operated_by: chunk.match(/\boperated by\s*:?\s*([A-Za-z][A-Za-z&.' ]*?)(?=\s+(?:DBA|D\/B\/A|AS|FOR)\b|\s+(?:Duration|Aircraft|Fare|Meal|Seat)|[\n,;]|$)/i)?.[1]?.trim() ?? '',
  };
}

/** Ad / upsell blurbs whose dollar amounts are not what you paid for the ticket. */
const NOT_FARE = /per (?:person|day|night|traveler)|\/day|rental|vehicle|\bcar\b|insurance|plan cost|upgrade|bundle|economy plus|premier access|from \$|starting at|offer|subscription|checked bag/i;

/**
 * Pull flights out of a pasted airline confirmation e-mail, receipt or "My trips"
 * page: confirmation code, flight numbers, airports, dates/times, seats, fare and miles.
 */
export function parseItinerary(raw: string, opts: { airline?: string; year?: number } = {}): ParsedItinerary {
  const text = normalizeItinerary(raw);
  const year = opts.year ?? new Date().getFullYear();
  let conf = '';
  for (const m of text.matchAll(/(?:confirmation|record locator|booking reference|booking code|reservation|pnr|conf\.?)\s*(?:#|no\.?|number|code)?\s*[:#]?\s*([A-Za-z0-9]{6})\b/gi)) {
    const c = m[1];
    if (c === c.toUpperCase() && !NOT_CONFIRMATION.has(c) && /[A-Z]/.test(c)) {
      conf = c;
      break;
    }
  }
  const defaultAirline = airlineByCode(opts.airline) ?? guessAirline(text);

  const flightRe = /\b(?:([A-Z][A-Z0-9])\s?(\d{1,4})|flight\s*(?:#|no\.?|number)?\s*(\d{1,4}))\b/gi;
  const hits: { i: number; end: number; code: string; num: string }[] = [];
  for (const m of text.matchAll(flightRe)) {
    const code = m[1]?.toUpperCase();
    if (code && (m[1] !== code || !airlineByCode(code))) continue;
    const num = m[2] ?? m[3];
    if (!num) continue;
    const air = code ?? defaultAirline?.code ?? '';
    if (hits.some((h) => h.code === air && h.num === num)) continue;
    hits.push({ i: m.index ?? 0, end: (m.index ?? 0) + m[0].length, code: air, num });
  }

  const prevEnd = (k: number) => (k > 0 ? hits[k - 1].end : 0);
  // Web "My trips" pages print "Depart … Arrive … Flight UA 1966" (details *before* the number);
  // e-mails and receipts print "DL 1520 DEN → MEM 7:05 AM" (details after). Decide once per paste.
  const beforeChunk = (k: number) => {
    let seg = text.slice(prevEnd(k), hits[k].i);
    const parts = seg.split(DEPART);
    if (parts.length > 1) seg = parts[parts.length - 1];
    else if (seg.length > 400) seg = seg.slice(-400);
    return seg;
  };
  const afterChunk = (k: number) => text.slice(hits[k].end, hits[k + 1]?.i ?? text.length);
  const detailsBefore = hits.length > 0 && parseAirports(beforeChunk(0)).length >= 2 && parseTimes(beforeChunk(0)).length >= 1;

  const flights: ParsedFlight[] = hits.map((h, k) => {
    // Seat / aircraft / operator lines follow the flight number in both layouts.
    const tail = afterChunk(k).split(DEPART)[0];
    let start: string | null;
    let end: string | null;
    let airports: string[];
    let times: string[];
    if (detailsBefore) {
      const chunk = beforeChunk(k);
      airports = parseAirports(chunk);
      times = parseTimes(chunk);
      const dates = parseDates(chunk, year);
      start = dates[0] ?? null;
      end = dates[1] ?? start;
    } else {
      const chunk = afterChunk(k);
      airports = parseAirports(chunk);
      times = parseTimes(chunk);
      const before = text.slice(prevEnd(k), h.i);
      if (airports.length < 2) airports = [...parseAirports(before).slice(-2), ...airports].slice(-2);
      // Itineraries usually print the date as a header above each flight; fall back to a date inside the flight's own block.
      start = parseDates(before, year).pop() ?? parseDates(chunk, year)[0] ?? null;
      end = start;
    }
    return {
      airline: h.code,
      flight_number: h.num,
      origin: airports[0] ?? '',
      destination: airports[1] ?? '',
      start_date: start,
      start_time: times[0] ?? '',
      end_date: end,
      end_time: times[1] ?? '',
      ...segmentDetails(tail),
    };
  });

  const money: number[] = [];
  for (const m of text.matchAll(/(?:total(?: price| fare| charged| paid| per passenger)?|amount paid|amount charged|airfare|grand total|fare total|charged)[^$\d\n]{0,30}(?:\$\s?|USD\s?)?([\d,]+\.\d{2})(?!\d)/gi)) {
    const i = m.index ?? 0;
    if (NOT_FARE.test(text.slice(Math.max(0, i - 80), i + m[0].length + 30))) continue;
    money.push(Number(m[1].replace(/,/g, '')));
  }
  let milesUsed: number | null = null;
  for (const m of text.matchAll(/([\d,]{3,})\s*(?:miles|points|skymiles|pts)\b/gi)) {
    const i = m.index ?? 0;
    const pre = text.slice(Math.max(0, i - 30), i);
    const post = text.slice(i + m[0].length, i + m[0].length + 25);
    if (/earn|bonus|join|sign/i.test(pre) || /earned|by signing|per (?:completed|rental)/i.test(post)) continue;
    milesUsed = Number(m[1].replace(/,/g, ''));
    break;
  }
  return {
    confirmation: conf,
    airline: flights[0]?.airline ?? defaultAirline?.code ?? '',
    flights,
    cost: money.length ? Math.max(...money) : null,
    miles_used: milesUsed,
  };
}

/* ---------- live route / status lookup ---------- */

export interface FlightRoute {
  callsign: string;
  airline: string;
  origin: { iata: string; name: string; city: string; lat: number; lon: number };
  destination: { iata: string; name: string; city: string; lat: number; lon: number };
  distanceMiles: number;
}

function haversineMiles(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 3958.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

interface AdsbdbAirport { iata_code: string; name: string; municipality: string; latitude: number; longitude: number }

/** Scheduled route for a flight number from adsbdb.com (free, no key). */
export async function lookupFlightRoute(airline: string | null | undefined, number: string | null | undefined, fetcher: typeof fetch = fetch, operatedBy?: string | null): Promise<FlightRoute | null> {
  const call = flightCallsign(airline, number, operatedBy);
  if (!call) return null;
  const res = await fetcher(`https://api.adsbdb.com/v0/callsign/${call}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { response?: { flightroute?: { callsign: string; airline?: { name: string }; origin: AdsbdbAirport; destination: AdsbdbAirport } } };
  const r = json.response?.flightroute;
  if (!r?.origin || !r.destination) return null;
  const ap = (a: AdsbdbAirport) => ({ iata: a.iata_code, name: a.name, city: a.municipality, lat: a.latitude, lon: a.longitude });
  const origin = ap(r.origin);
  const destination = ap(r.destination);
  return { callsign: r.callsign, airline: r.airline?.name ?? '', origin, destination, distanceMiles: haversineMiles(origin, destination) };
}

export interface LivePosition {
  lat: number;
  lon: number;
  altitudeFt: number | null;
  speedKt: number | null;
  heading: number | null;
  onGround: boolean;
}

/** Live position by callsign from adsb.lol (free, community ADS-B). Null when the plane isn't airborne / not visible. */
export async function lookupLivePosition(airline: string | null | undefined, number: string | null | undefined, fetcher: typeof fetch = fetch, operatedBy?: string | null): Promise<LivePosition | null> {
  const call = flightCallsign(airline, number, operatedBy);
  if (!call) return null;
  const res = await fetcher(`https://api.adsb.lol/v2/callsign/${call}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { ac?: { lat?: number; lon?: number; alt_baro?: number | 'ground'; gs?: number; track?: number }[] };
  const a = json.ac?.find((x) => x.lat != null && x.lon != null);
  if (!a || a.lat == null || a.lon == null) return null;
  return {
    lat: a.lat,
    lon: a.lon,
    altitudeFt: typeof a.alt_baro === 'number' ? a.alt_baro : null,
    speedKt: a.gs ?? null,
    heading: a.track ?? null,
    onGround: a.alt_baro === 'ground',
  };
}
