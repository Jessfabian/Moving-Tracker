import { milesDollarValue } from './airlines';
import { fundTax } from './funding';
import type { FamilyMember, Fund, Move, TravelItem } from './types';
import { addDays } from './util';

const dow = (date: string) => new Date(date + 'T12:00:00').getDay();

/** Next date on/after `date` that falls on `weekday` (0 = Sunday … 5 = Friday). */
export function nextWeekday(date: string, weekday: number): string {
  return addDays(date, (weekday - dow(date) + 7) % 7);
}

/**
 * First weekly paycheck for a job that starts on `startDate`. Weekly payroll usually pays one week in
 * arrears, so the first check lands on the payday after the first full week worked.
 */
export function firstWeeklyPayday(startDate: string, payday = 5, lagWeeks = 1): string {
  return nextWeekday(addDays(startDate, 7 * lagWeeks), payday);
}

/** The `n`th payday (1-based) of a month, e.g. the 2nd Friday of January 2027. */
export function nthPaydayInMonth(year: number, month: number, n: number, payday = 5): string {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  return addDays(nextWeekday(first, payday), 7 * (n - 1));
}

export interface StipendInstallment {
  source: string;
  amount: number;
  expected_date: string;
  notes: string;
}

/** Split a relocation stipend across paychecks: first weekly check after the start date, then the Nth check of a later month. */
export function stipendSchedule(opts: {
  employer: string;
  startDate: string;
  first: number;
  second: number;
  secondMonth: number;
  secondCheckOfMonth?: number;
  payday?: number;
}): StipendInstallment[] {
  const payday = opts.payday ?? 5;
  const firstDate = firstWeeklyPayday(opts.startDate, payday);
  const startYear = Number(opts.startDate.slice(0, 4));
  const startMonth = Number(opts.startDate.slice(5, 7));
  const year = opts.secondMonth <= startMonth ? startYear + 1 : startYear;
  const secondDate = nthPaydayInMonth(year, opts.secondMonth, opts.secondCheckOfMonth ?? 2, payday);
  const who = opts.employer.trim() || 'Employer';
  return [
    { source: `${who} relocation stipend — 1st check`, amount: opts.first, expected_date: firstDate, notes: 'Paid on the first weekly paycheck. Covers the first-week flights & hotel.' },
    { source: `${who} relocation stipend — 2nd payment`, amount: opts.second, expected_date: secondDate, notes: 'Second half of the relocation stipend.' },
  ];
}

export interface TripSummary {
  /** Cash + the dollar value of miles used. */
  total: number;
  cash: number;
  milesUsed: number;
  /** Dollar value of miles/points spent. */
  milesValue: number;
  /** Part of milesValue we plan to pay ourselves back for from the stipend. */
  milesToRecover: number;
  paid: number;
  unpaid: number;
  /** Costs the stipend is meant to cover. */
  covered: number;
  /** Covered costs already paid out of pocket and not yet reimbursed. */
  fronted: number;
  reimbursed: number;
  /** Costs nobody is reimbursing. */
  personal: number;
  byKind: { kind: string; total: number }[];
  start: string | null;
  end: string | null;
  nights: number;
}

export function tripSummary(items: TravelItem[]): TripSummary {
  const live = items.filter((t) => !t.deleted);
  let total = 0, cash = 0, milesUsed = 0, milesValue = 0, milesToRecover = 0, paid = 0, covered = 0, fronted = 0, reimbursed = 0, nights = 0;
  const kinds = new Map<string, number>();
  let start: string | null = null;
  let end: string | null = null;
  for (const t of live) {
    const money = t.cost ?? 0;
    const mv = milesDollarValue(t);
    const recover = t.reimbursable && t.recover_miles !== false ? mv : 0;
    const c = money + mv;
    cash += money;
    milesUsed += t.miles_used ?? 0;
    milesValue += mv;
    milesToRecover += recover;
    total += c;
    // Miles are spent the moment the ticket is booked, so they count as already paid.
    if (t.paid) paid += money;
    paid += mv;
    if (t.reimbursable) {
      const claim = money + recover;
      covered += claim;
      if (t.reimbursed) reimbursed += claim;
      else fronted += (t.paid ? money : 0) + recover;
    }
    kinds.set(t.kind, (kinds.get(t.kind) ?? 0) + c);
    const s = t.start_date;
    const e = t.end_date ?? t.start_date;
    if (s && (!start || s < start)) start = s;
    if (e && (!end || e > end)) end = e;
    if (t.kind === 'lodging' && t.start_date && t.end_date) {
      nights += Math.max(0, Math.round((Date.parse(t.end_date) - Date.parse(t.start_date)) / 86400000));
    }
  }
  return {
    total,
    cash,
    milesUsed,
    milesValue,
    milesToRecover,
    paid,
    unpaid: total - paid,
    covered,
    fronted,
    reimbursed,
    personal: total - covered,
    byKind: [...kinds].map(([kind, n]) => ({ kind, total: n })).sort((a, b) => b.total - a.total),
    start,
    end,
    nights,
  };
}

export interface StipendCheckpoint {
  fund: Fund;
  date: string | null;
  net: number;
  /** Covered trip costs still un-repaid after this check lands. */
  remainingAfter: number;
}

export interface StipendCoverage {
  covered: number;
  checks: StipendCheckpoint[];
  /** Date the first stipend money lands. */
  firstDate: string | null;
  /** Days between the first trip expense and the first stipend check. */
  daysFronted: number | null;
  /** How much of the covered trip cost the first check's take-home doesn't cover. */
  gapAfterFirst: number;
  /** Stipend take-home left after covering the trip. */
  leftover: number;
}

/** How long you'll float trip costs before the relocation stipend arrives, and whether each check covers them. */
export function stipendCoverage(
  items: TravelItem[],
  funds: Fund[],
  opts: { members?: Pick<FamilyMember, 'id' | 'birth_date'>[]; state?: string | null } = {},
): StipendCoverage {
  const trip = tripSummary(items);
  const byId = new Map((opts.members ?? []).map((m) => [m.id, m]));
  const stipends = funds
    .filter((f) => !f.deleted && f.kind === 'relocation_stipend')
    .sort((a, b) => (a.expected_date ?? '9999').localeCompare(b.expected_date ?? '9999'));
  let remaining = trip.covered - trip.reimbursed;
  let total = 0;
  const checks = stipends.map((f) => {
    const net = fundTax(f, { member: f.member_id ? byId.get(f.member_id) : null, state: opts.state }).net;
    total += net;
    remaining = Math.max(0, remaining - net);
    return { fund: f, date: f.expected_date, net, remainingAfter: remaining };
  });
  const firstDate = checks[0]?.date ?? null;
  const daysFronted = firstDate && trip.start ? Math.max(0, Math.round((Date.parse(firstDate) - Date.parse(trip.start)) / 86400000)) : null;
  const owed = trip.covered - trip.reimbursed;
  return {
    covered: trip.covered,
    checks,
    firstDate,
    daysFronted,
    gapAfterFirst: Math.max(0, owed - (checks[0]?.net ?? 0)),
    leftover: total - owed,
  };
}

/**
 * Whether the trip section is on. Not every move has someone travelling ahead, so it's opt-in;
 * households that already logged trip items keep seeing it until they switch it off.
 */
export function tripEnabled(move: Pick<Move, 'work_trip'> | undefined, travel: Pick<TravelItem, 'deleted'>[] = []): boolean {
  return move?.work_trip ?? travel.some((t) => !t.deleted);
}

/** Each trip item is ONE thing — a flight, a hotel stay, a rental car… — so its form only shows the fields that apply. */
export interface TravelForm {
  noun: string;
  hidden: string[];
  labels: Record<string, string>;
}

const MILES = ['miles_used', 'miles_value', 'recover_miles'];
const FLIGHTISH = ['airline', 'flight_number', 'seat', 'aircraft', 'operated_by', 'origin', 'destination'];

export const TRAVEL_FORMS: Record<TravelItem['kind'], TravelForm> = {
  flight: {
    noun: 'flight',
    // airline, flight # and confirmation live in the flight lookup panel
    hidden: ['provider', 'address', 'airline', 'flight_number', 'confirmation'],
    labels: { title: 'Name', start_date: 'Departs', start_time: 'Departure time', end_date: 'Arrives', end_time: 'Arrival time', files: 'Boarding pass / receipt (PDF)' },
  },
  lodging: {
    noun: 'hotel stay',
    hidden: [...FLIGHTISH, ...MILES],
    labels: { provider: 'Hotel / Airbnb', address: 'Hotel address', start_date: 'Check-in', start_time: 'Check-in time', end_date: 'Check-out', end_time: 'Check-out time', cost: 'Total for the stay', files: 'Booking / folio (PDF)' },
  },
  car: {
    noun: 'rental car',
    hidden: [...FLIGHTISH, ...MILES],
    labels: { provider: 'Rental company', address: 'Pick-up location', start_date: 'Pick-up', start_time: 'Pick-up time', end_date: 'Drop-off', end_time: 'Drop-off time', files: 'Rental agreement / receipt (PDF)' },
  },
  ground: {
    noun: 'ride / parking',
    hidden: [...FLIGHTISH, ...MILES, 'end_date', 'end_time'],
    labels: { provider: 'Company', start_date: 'Date', files: 'Receipt (PDF)' },
  },
  meals: {
    noun: 'meals',
    hidden: [...FLIGHTISH, ...MILES, 'confirmation', 'address', 'start_time', 'end_time'],
    labels: { provider: 'Where', start_date: 'From', end_date: 'To', files: 'Receipts (PDF)' },
  },
  other: {
    noun: 'trip expense',
    hidden: [...FLIGHTISH, ...MILES],
    labels: { files: 'Receipt (PDF)' },
  },
};

export function travelForm(kind: string | undefined): TravelForm {
  return TRAVEL_FORMS[(kind as TravelItem['kind']) ?? 'other'] ?? TRAVEL_FORMS.other;
}