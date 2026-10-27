import { DEFAULTS, SCHEMAS, optionLabel, type FieldDef } from './schemas';
import type { MediaRef, TableMap, TableName } from './types';
import { formatMoney } from './util';

export type Snapshot = { [K in TableName]: TableMap[K][] };

export function emptySnapshot(): Snapshot {
  const s = {} as Snapshot;
  for (const k of Object.keys(DEFAULTS) as TableName[]) (s as Record<string, unknown[]>)[k] = [];
  return s;
}

export interface Lookup {
  member(id: string | null | undefined): string;
  pet(id: string | null | undefined): string;
  room(id: string | null | undefined): string;
  box(id: string | null | undefined): string;
}

export function makeLookup(db: Pick<Snapshot, 'family_members' | 'pets' | 'rooms' | 'boxes'>): Lookup {
  const idx = <T extends { id: string }>(rows: T[], f: (r: T) => string) => {
    const m = new Map(rows.map((r) => [r.id, f(r)]));
    return (id: string | null | undefined) => (id ? (m.get(id) ?? '') : '');
  };
  return {
    member: idx(db.family_members, (m) => m.name),
    pet: idx(db.pets, (p) => p.name),
    room: idx(db.rooms, (r) => r.name),
    box: idx(db.boxes, (b) => `#${b.number}${b.label ? ' ' + b.label : ''}`),
  };
}

export function displayValue(field: FieldDef, value: unknown, lookup: Lookup): string {
  if (value === null || value === undefined) return '';
  switch (field.type) {
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'money':
      return typeof value === 'number' ? formatMoney(value) : '';
    case 'select':
      return optionLabel(field.options, value);
    case 'member':
      return lookup.member(value as string);
    case 'pet':
      return lookup.pet(value as string);
    case 'room':
      return lookup.room(value as string);
    case 'box':
      return lookup.box(value as string);
    case 'tags':
      return Array.isArray(value) ? value.join(', ') : String(value);
    case 'media':
      return Array.isArray(value) ? `${(value as MediaRef[]).length} file(s)` : '';
    case 'images':
      return Array.isArray(value) ? `${value.length} photo(s)` : '';
    case 'members':
      return Array.isArray(value) ? (value as string[]).map((id) => lookup.member(id)).filter(Boolean).join(', ') : '';
    case 'rating':
      return typeof value === 'number' ? '★'.repeat(value) : '';
    default:
      return String(value);
  }
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function tableToCsv<T extends TableName>(table: T, rows: TableMap[T][], lookup: Lookup): string {
  const fields = SCHEMAS[table].fields.filter((f) => f.type !== 'media');
  return toCsv(
    fields.map((f) => f.label),
    rows.filter((r) => !r.deleted).map((r) => fields.map((f) => displayValue(f, (r as unknown as Record<string, unknown>)[f.key], lookup))),
  );
}

export const EXPORTABLE: TableName[] = [
  'tasks',
  'family_members',
  'pets',
  'items',
  'books',
  'book_sales',
  'boxes',
  'rooms',
  'quotes',
  'apartments',
  'documents',
  'expenses',
  'funds',
  'travel',
  'utilities',
  'appointments',
  'bills',
  'incomes',
  'address_changes',
  'contacts',
];
