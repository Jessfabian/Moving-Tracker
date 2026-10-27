import { describe, expect, it } from 'vitest';
import { calendarEvents, firstWeeklyPayday, nthPaydayInMonth, stipendCoverage, stipendSchedule, tripSummary, type Fund, type Snapshot, type TravelItem } from '../src';

const item = (p: Partial<TravelItem>): TravelItem =>
  ({ id: Math.random().toString(36), kind: 'flight', title: '', trip: '', member_id: null, provider: '', confirmation: '', start_date: null, start_time: '', end_date: null, end_time: '', origin: '', destination: '', address: '', cost: null, paid: false, paid_with: '', reimbursable: true, reimbursed: false, files: [], notes: '', ...p }) as TravelItem;

describe('work trip', () => {
  it('finds the first weekly payday and the 2nd January check', () => {
    expect(firstWeeklyPayday('2026-11-16')).toBe('2026-11-27');
    expect(nthPaydayInMonth(2027, 1, 2)).toBe('2027-01-08');
    const s = stipendSchedule({ employer: 'Sharp', startDate: '2026-11-16', first: 5000, second: 5000, secondMonth: 1 });
    expect(s.map((x) => x.expected_date)).toEqual(['2026-11-27', '2027-01-08']);
    expect(s[0]!.source).toMatch(/Sharp/);
  });

  it('totals the trip and what the stipend still owes', () => {
    const items = [
      item({ kind: 'flight', cost: 420, paid: true, start_date: '2026-11-15' }),
      item({ kind: 'lodging', cost: 900, paid: true, start_date: '2026-11-15', end_date: '2026-11-21' }),
      item({ kind: 'meals', cost: 200, reimbursable: false }),
    ];
    const t = tripSummary(items);
    expect(t.total).toBe(1520);
    expect(t.covered).toBe(1320);
    expect(t.fronted).toBe(1320);
    expect(t.nights).toBe(6);
    const funds = [
      { id: 'b', kind: 'relocation_stipend', amount: 5000, net_amount: null, expected_date: '2027-01-08' },
      { id: 'a', kind: 'relocation_stipend', amount: 5000, net_amount: null, expected_date: '2026-11-27' },
    ] as Fund[];
    const c = stipendCoverage(items, funds, { state: 'TN' });
    expect(c.firstDate).toBe('2026-11-27');
    expect(c.checks[0]!.net).toBe(3517.5);
    expect(c.gapAfterFirst).toBe(0);
    expect(c.daysFronted).toBe(12);
    expect(c.leftover).toBe(7035 - 1320);
  });

  it('puts flights, hotel check-out and paydays on the calendar', () => {
    const db = {
      travel: [item({ id: 't1', title: 'DEN to MEM', origin: 'DEN', destination: 'MEM', start_date: '2026-11-15' }), item({ id: 't2', kind: 'lodging', title: 'Hampton Inn', start_date: '2026-11-15', end_date: '2026-11-21' })],
      funds: [{ id: 'f', source: 'Stipend', kind: 'relocation_stipend', expected_date: '2026-11-27', received: false }],
    } as unknown as Snapshot;
    const ev = calendarEvents(db, { from: '2026-11-01', to: '2026-11-30' });
    expect(ev.map((e) => e.title)).toEqual(['DEN to MEM · DEN→MEM', 'Check in: Hampton Inn', 'Check out: Hampton Inn', '💰 Stipend']);
  });
});