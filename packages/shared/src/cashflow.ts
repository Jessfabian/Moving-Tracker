import { apartmentCosts } from './apartments';
import type { Apartment, Bill, Frequency, Income } from './types';

const PER_MONTH: Record<Frequency, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  semimonthly: 2,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

/** Rough take-home share of gross pay used when only one of gross/net is known. */
export const NET_RATIO = 0.76;

export function monthlyAmount(amount: number | null | undefined, frequency: Frequency | undefined): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return 0;
  return amount * (PER_MONTH[frequency ?? 'monthly'] ?? 1);
}

export function incomeMonthly(i: Pick<Income, 'amount' | 'frequency' | 'basis'>): { net: number; gross: number } {
  const m = monthlyAmount(i.amount, i.frequency);
  return i.basis === 'gross' ? { gross: m, net: m * NET_RATIO } : { net: m, gross: m / NET_RATIO };
}

export type Phase = 'now' | 'after';

const live = <T extends { deleted?: boolean }>(rows: T[] | undefined) => (rows ?? []).filter((r) => !r.deleted);

export function billsFor(bills: Bill[] | undefined, phase: Phase): Bill[] {
  return live(bills).filter((b) => (phase === 'now' ? b.status !== 'new_after_move' : b.status !== 'cancel_before_move'));
}

export function incomesFor(incomes: Income[] | undefined, phase: Phase): Income[] {
  return live(incomes).filter((i) => (phase === 'now' ? i.status !== 'new_job' : i.status !== 'ending'));
}

export interface Cashflow {
  incomeNet: number;
  incomeGross: number;
  bills: number;
  /** Monthly bills by category, largest first. */
  byCategory: { category: string; monthly: number }[];
  housing: number;
  leftover: number;
  /** Share of take-home pay left after bills (0–1). */
  savingsRate: number;
}

export function cashflow(db: { bills?: Bill[]; incomes?: Income[] }, phase: Phase, opts: { excludeHousing?: boolean; extraMonthly?: number } = {}): Cashflow {
  const inc = incomesFor(db.incomes, phase).map(incomeMonthly);
  const incomeNet = inc.reduce((s, x) => s + x.net, 0);
  const incomeGross = inc.reduce((s, x) => s + x.gross, 0);
  const cats = new Map<string, number>();
  for (const b of billsFor(db.bills, phase)) {
    if (opts.excludeHousing && b.category === 'housing') continue;
    cats.set(b.category, (cats.get(b.category) ?? 0) + monthlyAmount(b.amount, b.frequency));
  }
  if (opts.extraMonthly) cats.set('housing', (cats.get('housing') ?? 0) + opts.extraMonthly);
  const byCategory = [...cats.entries()].map(([category, monthly]) => ({ category, monthly })).filter((c) => c.monthly > 0).sort((a, b) => b.monthly - a.monthly);
  const bills = byCategory.reduce((s, c) => s + c.monthly, 0);
  const leftover = incomeNet - bills;
  return { incomeNet, incomeGross, bills, byCategory, housing: cats.get('housing') ?? 0, leftover, savingsRate: incomeNet > 0 ? leftover / incomeNet : 0 };
}

export type Affordability = 'comfortable' | 'stretch' | 'over' | 'unknown';

export interface ApartmentFit {
  monthly: number;
  /** Rent as a share of gross income (the 30% rule). */
  rentShare: number | null;
  /** Take-home left each month after this place plus all other after-move bills. */
  leftover: number | null;
  verdict: Affordability;
}

/** How a rental fits the household budget after the move (replaces any current rent/mortgage bills). */
export function apartmentFit(a: Partial<Apartment>, db: { bills?: Bill[]; incomes?: Income[] }): ApartmentFit {
  const monthly = apartmentCosts(a).monthly;
  const flow = cashflow(db, 'after', { excludeHousing: true, extraMonthly: monthly });
  if (!flow.incomeGross || !monthly) return { monthly, rentShare: null, leftover: flow.incomeGross ? flow.leftover : null, verdict: 'unknown' };
  const rentShare = monthly / flow.incomeGross;
  const verdict: Affordability = rentShare <= 0.3 && flow.leftover > 0 ? 'comfortable' : rentShare <= 0.4 && flow.leftover > 0 ? 'stretch' : 'over';
  return { monthly, rentShare, leftover: flow.leftover, verdict };
}

/** Max total monthly housing cost at 30% of gross income. */
export function maxAffordableRent(db: { incomes?: Income[] }, ratio = 0.3): number {
  return Math.floor(cashflow({ incomes: db.incomes }, 'after').incomeGross * ratio);
}

export interface DueBill {
  bill: Bill;
  date: string;
  daysAway: number;
}

/** Bills with a due day, ordered by their next due date from `today` (YYYY-MM-DD). */
export function upcomingBills(bills: Bill[] | undefined, today: string, phase: Phase = 'now', within = 31): DueBill[] {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const base = Date.UTC(y, m - 1, d);
  const out: DueBill[] = [];
  for (const b of billsFor(bills, phase)) {
    if (!b.due_day || b.frequency !== 'monthly') continue;
    let month = m - 1;
    let year = y;
    if (b.due_day < d) month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const t = Date.UTC(year, month, Math.min(b.due_day, last));
    const daysAway = Math.round((t - base) / 86400000);
    if (daysAway <= within) out.push({ bill: b, date: new Date(t).toISOString().slice(0, 10), daysAway });
  }
  return out.sort((a, b) => a.daysAway - b.daysAway);
}
