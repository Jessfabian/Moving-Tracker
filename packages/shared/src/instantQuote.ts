import type { Snapshot } from './csv';
import { estimateMoveSize, type MoveSize } from './movers';
import type { Move, MoverQuote } from './types';

/**
 * Instant online quotes from carriers that publish a free pricing API.
 * Only sizes, ZIPs and the date are sent — never names, phones or e-mails.
 */
export interface InstantQuoteProvider {
  id: string;
  name: string;
  url: string;
  docs: string;
  usdot: string;
  mc: string;
  phone: string;
  website: string;
  coverage: string;
}

export const NGM_PROVIDER: InstantQuoteProvider = {
  id: 'ngm',
  name: 'Next Generation Movers',
  url: 'https://ngm-agent-api.nextgenmovers.workers.dev/quote/free',
  docs: 'https://github.com/nextgenmove/ngm-agent-api',
  usdot: '3764697',
  mc: '1341637',
  phone: '(240) 422-2243',
  website: 'https://nextgeneration-movers.com',
  coverage: 'Long-distance moves between any of the 48 contiguous states (local moves only in DC/MD/VA)',
};

export const NGM_SPECIALTY = ['piano_upright', 'piano_grand', 'piano_baby_grand', 'motorcycle', 'atv', 'pool_table', 'jacuzzi', 'appliance', 'aquarium', 'misc_bulky'] as const;
export type NgmSpecialty = (typeof NGM_SPECIALTY)[number];

export interface InstantQuoteOptions {
  packing?: boolean;
  unpacking?: boolean;
  storageMonths?: number;
  stairsFlights?: number;
  guaranteedDelivery?: boolean;
  /** Fallback pickup date (YYYY-MM-DD) when the move has none — the API requires one. */
  today?: string;
  /** Use our inventory-based cubic feet instead of the carrier's typical size for the home. */
  useOurSize?: boolean;
}

export interface NgmQuoteRequest {
  from_zip: string;
  to_zip: string;
  move_date: string;
  home_size?: 'studio' | '1br' | '2br' | '3br' | '4br' | '5br+';
  cubic_feet?: number;
  specialty_items?: NgmSpecialty[];
  packing?: 'none' | 'full';
  unpacking?: 'none' | 'full';
  storage_months?: number;
  stairs_flights?: number;
  guaranteed_delivery?: boolean;
}

/** Map our special inventory items onto the carrier's flat-fee specialty list. */
export function specialtyFor(names: string[]): NgmSpecialty[] {
  const out: NgmSpecialty[] = [];
  for (const n of names) {
    const s = n.toLowerCase();
    if (/baby grand/.test(s)) out.push('piano_baby_grand');
    else if (/grand piano|piano.*grand/.test(s)) out.push('piano_grand');
    else if (/piano/.test(s)) out.push('piano_upright');
    else if (/motorcycle/.test(s)) out.push('motorcycle');
    else if (/\batv\b|golf cart/.test(s)) out.push('atv');
    else if (/pool table/.test(s)) out.push('pool_table');
    else if (/hot tub|jacuzzi/.test(s)) out.push('jacuzzi');
    else if (/aquarium|fish tank/.test(s)) out.push('aquarium');
    else if (/treadmill|elliptical|peloton|safe\b|grandfather clock/.test(s)) out.push('misc_bulky');
  }
  return out;
}

const homeSize = (bedrooms: number): NgmQuoteRequest['home_size'] => (bedrooms <= 0 ? 'studio' : bedrooms >= 5 ? '5br+' : (`${bedrooms}br` as NgmQuoteRequest['home_size']));

/** Build the request body from the move + inventory. Returns an error string when ZIPs are missing. */
export function buildInstantQuoteRequest(move: Move | undefined, size: MoveSize, opts: InstantQuoteOptions = {}): NgmQuoteRequest | { error: string } {
  const from = (move?.from_zip ?? '').trim().slice(0, 5);
  const to = (move?.to_zip ?? '').trim().slice(0, 5);
  if (!/^\d{5}$/.test(from) || !/^\d{5}$/.test(to)) return { error: 'Add both ZIP codes on Move details first.' };
  const date = (move?.load_date || move?.move_date || opts.today || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Add a move date on Move details first.' };
  const req: NgmQuoteRequest = { from_zip: from, to_zip: to, move_date: date };
  if (opts.useOurSize !== false && size.cubicFeet > 0) req.cubic_feet = size.cubicFeet;
  else req.home_size = homeSize(size.bedrooms);
  const spec = specialtyFor(size.specialItems);
  if (spec.length) req.specialty_items = spec;
  if (opts.packing) req.packing = 'full';
  if (opts.unpacking) req.unpacking = 'full';
  if (opts.storageMonths) req.storage_months = opts.storageMonths;
  if (opts.stairsFlights) req.stairs_flights = opts.stairsFlights;
  if (opts.guaranteedDelivery) req.guaranteed_delivery = true;
  return req;
}

export interface InstantQuote {
  provider: InstantQuoteProvider;
  quoteId: string;
  total: number;
  moveType: string;
  miles: number | null;
  cubicFeet: number | null;
  weightLbs: number | null;
  sizeSource: string;
  breakdown: { label: string; amount: number }[];
  valuation: string;
  notes: string[];
  nextStep: string;
  carrierStatus: string | null;
  verifyUrl: string | null;
  priceType: string;
  ratesStatus: string;
}

const LABELS: Record<string, string> = {
  linehaul: 'Line haul (after published discount)',
  fuel_surcharge: 'Fuel surcharge',
  origin_destination_surcharge: 'Origin / destination services',
  guaranteed_delivery: 'Guaranteed delivery',
  full_packing: 'Full packing',
  full_unpacking: 'Full unpacking',
  stairs: 'Stairs',
  long_carry: 'Long carry',
  shuttle: 'Shuttle',
  extra_stops: 'Extra stops',
  safes: 'Safes',
  storage: 'Storage',
};

type Json = Record<string, unknown>;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function parseNgmQuote(json: Json): InstantQuote | { error: string } {
  if (json.move_type === 'local_not_offered') return { error: 'This carrier only prices local moves in DC/MD/VA.' };
  const total = num(json.indicative_total) ?? num(json.total);
  if (total == null) return { error: typeof json.error === 'string' ? json.error : typeof json.message === 'string' ? json.message : 'No price came back.' };
  const b = (json.breakdown ?? {}) as Json;
  const breakdown: { label: string; amount: number }[] = [];
  for (const [k, label] of Object.entries(LABELS)) {
    const v = num(b[k]);
    if (v) breakdown.push({ label, amount: v });
  }
  if (Array.isArray(b.specialty_items)) {
    for (const s of b.specialty_items as Json[]) {
      const v = num(s.fee) ?? num(s.amount) ?? num(s.price);
      if (v) breakdown.push({ label: String(s.item ?? s.name ?? 'Specialty item').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), amount: v });
    }
  }
  const vc = (json.verified_carrier ?? {}) as Json;
  const handoff = (json.handoff ?? {}) as Json;
  return {
    provider: NGM_PROVIDER,
    quoteId: String(json.quote_id ?? ''),
    total,
    moveType: String(json.move_type ?? ''),
    miles: num(json.distance_miles_est),
    cubicFeet: num(json.billed_cubic_feet) ?? num(json.est_cubic_feet),
    weightLbs: num(json.est_weight_lbs),
    sizeSource: String(json.cubic_feet_source ?? ''),
    breakdown,
    valuation: String(json.valuation ?? ''),
    notes: Array.isArray(json.notes) ? (json.notes as unknown[]).map(String) : [],
    nextStep: String(handoff.text ?? ''),
    carrierStatus: typeof vc.usdot_status === 'string' ? `${vc.usdot_status}${vc.operating_authority ? ` · ${String(vc.operating_authority)}` : ''}` : null,
    verifyUrl: typeof vc.verify_url === 'string' ? vc.verify_url : null,
    priceType: String(json.price_type ?? 'indicative'),
    ratesStatus: String(json.rates_status ?? ''),
  };
}

/** Ask the carrier's free endpoint for an indicative price. No contact info is sent, so it doesn't create a sales lead. */
export async function fetchInstantQuote(body: NgmQuoteRequest, fetcher: typeof fetch = fetch): Promise<InstantQuote | { error: string }> {
  const res = await fetcher(NGM_PROVIDER.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let json: Json = {};
  try {
    json = (await res.json()) as Json;
  } catch {
    return { error: `The quote service answered ${res.status}.` };
  }
  if (res.status === 429) return { error: 'Too many quote requests — try again in a minute.' };
  if (!res.ok && json.indicative_total == null) return { error: typeof json.error === 'string' ? json.error : `The quote service answered ${res.status}.` };
  return parseNgmQuote(json);
}

/** Turn an instant quote into a row for the quotes tracker. */
export function instantQuoteToRow(q: InstantQuote, opts: InstantQuoteOptions = {}): Partial<MoverQuote> {
  return {
    company: q.provider.name,
    website: q.provider.website,
    phone: q.provider.phone,
    usdot: q.provider.usdot,
    mc_number: q.provider.mc,
    quote_type: 'indicative',
    price: Math.round(q.total * 100) / 100,
    estimated_weight_lbs: q.weightLbs,
    valuation: 'released',
    includes_packing: !!opts.packing,
    includes_storage: !!opts.storageMonths,
    survey_type: 'none',
    status: 'received',
    notes: [
      `Instant online quote ${q.quoteId} (${q.priceType}).`,
      q.cubicFeet ? `${q.cubicFeet.toLocaleString()} cu ft · ${q.miles?.toLocaleString() ?? '?'} mi.` : '',
      ...q.breakdown.map((b) => `${b.label}: $${b.amount.toFixed(2)}`),
      q.nextStep,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

export function instantQuoteFromDb(db: Pick<Snapshot, 'rooms' | 'items' | 'boxes' | 'books' | 'moves'>, opts: InstantQuoteOptions = {}) {
  return buildInstantQuoteRequest(db.moves[0], estimateMoveSize(db), opts);
}
