import { describe, expect, it } from 'vitest';
import { calendarEvents, formatTime, monthGrid, DEFAULTS, type Snapshot } from '../src';

const row = <T,>(table: keyof typeof DEFAULTS, p: Partial<T>): T => ({ ...DEFAULTS[table], id: Math.random().toString(36).slice(2), household_id: 'h', created_at: '', updated_at: '', ...p }) as T;

describe('calendar', () => {
  it('builds a Sunday-first 6-week month grid', () => {
    const g = monthGrid('2026-10-15');
    expect(g).toHaveLength(42);
    expect(new Date(`${g[0]!.date}T12:00:00`).getDay()).toBe(0);
    expect(g.find((c) => c.date === '2026-10-01')?.inMonth).toBe(true);
    expect(g.find((c) => c.date === '2026-09-27')?.inMonth).toBe(false);
  });

  it('merges move dates, appointments, tasks and bills into one sorted list', () => {
    const empty = Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, []])) as unknown as Snapshot;
    const db = {
      ...empty,
      moves: [row('moves', { move_date: '2026-11-20' })],
      appointments: [
        row('appointments', { title: 'Tour The Lofts', kind: 'tour', date: '2026-11-02', start_time: '14:30', all_day: false, status: 'scheduled' }),
        row('appointments', { title: 'Cancelled', date: '2026-11-03', status: 'cancelled' }),
      ],
      tasks: [row('tasks', { title: 'Book movers', due_date: '2026-11-01', status: 'todo' })],
      bills: [row('bills', { name: 'Car insurance', amount: 140, frequency: 'monthly', due_day: 5, status: 'keep' })],
    } as unknown as Snapshot;
    const ev = calendarEvents(db, { from: '2026-11-01', to: '2026-11-30' });
    const titles = ev.map((e) => e.title);
    expect(titles).toContain('Moving day');
    expect(titles).toContain('Tour The Lofts');
    expect(titles).not.toContain('Cancelled');
    expect(titles).toContain('Car insurance due');
    expect(ev.find((e) => e.title === 'Tour The Lofts')?.kind).toBe('Tour');
    expect(ev.map((e) => e.date)).toEqual([...ev.map((e) => e.date)].sort());
  });

  it('formats times', () => {
    expect(formatTime('14:30')).toBe('2:30pm');
    expect(formatTime('09:00')).toBe('9am');
  });
});