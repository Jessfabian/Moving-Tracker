export function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const nowIso = () => new Date().toISOString();

/** Parses a YYYY-MM-DD date as a local calendar date (no timezone shift). */
export function parseDate(d: string | null | undefined): Date | null {
  if (!d) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function toDateString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(date: string, days: number): string {
  const d = parseDate(date);
  if (!d) return date;
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

export function today(): string {
  return toDateString(new Date());
}

export function daysBetween(from: string, to: string): number {
  const a = parseDate(from);
  const b = parseDate(to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  return daysBetween(today(), date);
}

export function formatDate(d: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }): string {
  const date = parseDate(d);
  if (!date) return '';
  return date.toLocaleDateString('en-US', opts);
}

export function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n % 1 === 0 ? 0 : 2 });
}

export function ageOn(birth: string | null | undefined, on: string = today()): number | null {
  const b = parseDate(birth);
  const o = parseDate(on);
  if (!b || !o) return null;
  let age = o.getFullYear() - b.getFullYear();
  const m = o.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && o.getDate() < b.getDate())) age--;
  return age;
}

export function memberAge(m: { birth_date: string | null; age: number | null }, on?: string): number | null {
  return ageOn(m.birth_date, on) ?? (m.age ?? null);
}

export function sum(values: (number | null | undefined)[]): number {
  return values.reduce<number>((a, b) => a + (typeof b === 'number' && !Number.isNaN(b) ? b : 0), 0);
}

export function groupBy<T>(rows: T[], key: (r: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const r of rows) (out[key(r)] ??= []).push(r);
  return out;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}
