import type { Snapshot } from './csv';
import { addPeriod, rollForward, upcomingBills } from './cashflow';
import { addDays, toDateString } from './util';

export type CalendarSource = 'appointment' | 'task' | 'move' | 'apartment' | 'document' | 'utility' | 'bill' | 'birthday' | 'travel' | 'money';

export interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  source: CalendarSource;
  /** Short category label shown on the event chip. */
  kind: string;
  time?: string;
  location?: string;
  done?: boolean;
  /** Path in the app to open the related record. */
  href: string;
  /** Hex colour for the event dot/chip. */
  color: string;
  important?: boolean;
}

export const CALENDAR_COLORS: Record<CalendarSource, string> = {
  move: '#ff5a1f',
  appointment: '#2563eb',
  task: '#0d0d0f',
  apartment: '#7c3aed',
  document: '#d97706',
  utility: '#0891b2',
  bill: '#16a34a',
  birthday: '#db2777',
  travel: '#0f766e',
  money: '#65a30d',
};

export const CALENDAR_LEGEND: { source: CalendarSource; label: string }[] = [
  { source: 'move', label: 'Move dates' },
  { source: 'appointment', label: 'Appointments' },
  { source: 'task', label: 'Task deadlines' },
  { source: 'apartment', label: 'Tours & applications' },
  { source: 'document', label: 'Paperwork' },
  { source: 'utility', label: 'Utilities' },
  { source: 'bill', label: 'Bills due' },
  { source: 'birthday', label: 'Birthdays' },
  { source: 'travel', label: 'Work trip & travel' },
  { source: 'money', label: 'Money coming in' },
];

const APPT_SHORT: Record<string, string> = {
  tour: 'Tour',
  movers: 'Movers',
  utility: 'Install',
  medical: 'Medical',
  school: 'School',
  work: 'Work',
  closing: 'Signing',
  inspection: 'Inspection',
  travel: 'Travel',
  government: 'DMV / gov',
};

const live = <T extends { deleted?: boolean }>(rows: T[] | undefined) => (rows ?? []).filter((r) => !r.deleted);

/** Every dated thing in the household — appointments, deadlines, move days, tours, bills — as one sorted list. */
export function calendarEvents(db: Snapshot, range?: { from: string; to: string }): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  const push = (e: Omit<CalendarEvent, 'color'>) => out.push({ ...e, color: CALENDAR_COLORS[e.source] });

  const move = live(db.moves)[0];
  if (move) {
    const days: [keyof typeof move, string][] = [
      ['pack_date', 'Packing starts'],
      ['load_date', 'Load day'],
      ['move_date', 'Moving day'],
      ['delivery_date', 'Delivery'],
    ];
    for (const [k, label] of days) {
      const d = move[k] as string | null;
      if (d) push({ id: `move-${String(k)}`, date: d, title: label, source: 'move', kind: 'Move', href: '/move', important: true });
    }
  }

  for (const a of live(db.appointments)) {
    if (!a.date || a.status === 'cancelled') continue;
    push({
      id: `appt-${a.id}`,
      date: a.date,
      title: a.title,
      source: 'appointment',
      kind: APPT_SHORT[a.kind] ?? 'Appointment',
      time: a.all_day ? undefined : a.start_time || undefined,
      location: a.location || undefined,
      done: a.status === 'done',
      href: `/calendar?appointment=${a.id}`,
      important: a.kind === 'closing' || a.kind === 'movers',
    });
  }

  for (const t of live(db.tasks)) {
    if (!t.due_date || t.status === 'skipped') continue;
    push({ id: `task-${t.id}`, date: t.due_date, title: t.title, source: 'task', kind: 'Deadline', done: t.status === 'done', href: '/tasks', important: t.priority === 'high' });
  }

  for (const a of live(db.apartments)) {
    if (a.status === 'rejected') continue;
    if (a.tour_date) push({ id: `apt-tour-${a.id}`, date: a.tour_date, title: `Tour: ${a.name}`, source: 'apartment', kind: 'Tour', location: a.address || undefined, href: '/apartments' });
    if (a.application_deadline) push({ id: `apt-apply-${a.id}`, date: a.application_deadline, title: `Apply by: ${a.name}`, source: 'apartment', kind: 'Deadline', href: '/apartments', important: true });
    if (a.available_date && a.status === 'signed') push({ id: `apt-avail-${a.id}`, date: a.available_date, title: `Keys: ${a.name}`, source: 'apartment', kind: 'Move-in', href: '/apartments', important: true });
  }

  for (const d of live(db.documents)) {
    if (d.expires_on) push({ id: `doc-${d.id}`, date: d.expires_on, title: `${d.title} expires`, source: 'document', kind: 'Paperwork', href: '/documents' });
  }

  for (const u of live(db.utilities)) {
    if (u.action_date) push({ id: `util-${u.id}`, date: u.action_date, title: `${u.location === 'old' ? 'Stop' : 'Start'} ${u.utility_type}${u.provider ? ` (${u.provider})` : ''}`, source: 'utility', kind: 'Utility', done: u.status === 'done', href: '/utilities' });
  }

  const TRAVEL_SHORT: Record<string, string> = { flight: 'Flight', lodging: 'Hotel', car: 'Car', ground: 'Ride', meals: 'Meals', other: 'Travel' };
  for (const t of live(db.travel)) {
    if (!t.start_date) continue;
    const route = t.origin && t.destination ? ` · ${t.origin}→${t.destination}` : '';
    const isStay = t.kind === 'lodging' || t.kind === 'car';
    push({
      id: `travel-${t.id}`,
      date: t.start_date,
      title: isStay ? `Check in: ${t.title}` : `${t.title}${route}`,
      source: 'travel',
      kind: TRAVEL_SHORT[t.kind] ?? 'Travel',
      time: t.start_time || undefined,
      location: t.address || t.provider || undefined,
      href: '/travel',
      important: t.kind === 'flight',
    });
    if (isStay && t.end_date && t.end_date !== t.start_date) {
      push({ id: `travel-out-${t.id}`, date: t.end_date, title: `Check out: ${t.title}`, source: 'travel', kind: TRAVEL_SHORT[t.kind] ?? 'Travel', time: t.end_time || undefined, href: '/travel' });
    }
  }

  for (const f of live(db.funds)) {
    if (!f.expected_date) continue;
    push({ id: `fund-${f.id}`, date: f.expected_date, title: `💰 ${f.source}`, source: 'money', kind: f.received ? 'Received' : 'Expected', done: f.received, href: '/budget', important: f.kind === 'relocation_stipend' });
  }

  for (const m of live(db.family_members)) {
    if (!m.birth_date) continue;
    const md = m.birth_date.slice(5);
    const years = range ? [Number(range.from.slice(0, 4)), Number(range.to.slice(0, 4))] : [new Date().getFullYear()];
    for (const y of new Set(years)) push({ id: `bday-${m.id}-${y}`, date: `${y}-${md}`, title: `${m.name}'s birthday`, source: 'birthday', kind: 'Birthday', href: '/family' });
  }

  if (range) {
    // Monthly bills repeat; expand them across the visible range.
    let cursor = range.from;
    let guard = 0;
    while (cursor <= range.to && guard++ < 24) {
      for (const due of upcomingBills(db.bills, cursor, 'now', 31)) {
        if (due.date < cursor || due.date > range.to) continue;
        if (out.some((e) => e.id === `bill-${due.bill.id}-${due.date}`)) continue;
        push({ id: `bill-${due.bill.id}-${due.date}`, date: due.date, title: `${due.bill.name} due`, source: 'bill', kind: due.bill.autopay ? 'Autopay' : 'Bill', href: '/bills' });
      }
      cursor = addDays(cursor, 28);
    }
    // Subscription renewals (and free trials ending) for the ones set to remind you.
    for (const x of live(db.subscriptions)) {
      if (!x.remind || !x.next_due || !['active', 'free_trial', 'cancelling'].includes(x.status)) continue;
      for (let i = 0, d = rollForward(x.next_due, x.frequency, range.from)!; d <= range.to && i < 60; i++, d = addPeriod(d, x.frequency)) {
        const trial = x.status === 'free_trial' && i === 0;
        push({ id: `sub-${x.id}-${d}`, date: d, title: trial ? `${x.name} free trial ends` : `${x.name} renews${x.amount ? ` · $${x.amount.toFixed(2)}` : ''}`, source: 'bill', kind: trial ? 'Trial ends' : 'Subscription', href: '/subscriptions', important: trial });
        if (trial) break;
      }
    }
  }

  const inRange = range ? out.filter((e) => e.date >= range.from && e.date <= range.to) : out;
  return inRange.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99') || Number(!!b.important) - Number(!!a.important));
}

/** 6-week grid (Sunday first) covering the month of `anchor` (YYYY-MM-DD). */
export function monthGrid(anchor: string): { date: string; inMonth: boolean }[] {
  const [y, m] = anchor.split('-').map(Number) as [number, number];
  const first = new Date(y, m - 1, 1);
  const start = addDays(toDateString(first), -first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const date = addDays(start, i);
    return { date, inMonth: Number(date.slice(5, 7)) === m };
  });
}

export function formatTime(t: string | undefined | null): string {
  if (!t) return '';
  const [h, min] = t.split(':').map(Number) as [number, number];
  if (!Number.isFinite(h)) return t;
  return `${((h + 11) % 12) + 1}${min ? `:${String(min).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}
