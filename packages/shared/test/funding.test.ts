import { describe, expect, it } from 'vitest';
import { estimateRoadDistance, folderStatus, folderTemplate, folderTemplateRows, fundNet, fundTax, fundingSummary, parseOsrmRoute, suggestBudgetLines, type Fund } from '../src';

const today = new Date('2026-10-27T12:00:00');
const fund = (p: Partial<Fund>): Fund => ({ id: Math.random().toString(36), source: '', kind: 'savings', amount: 0, net_amount: null, expected_date: null, received: false, member_id: null, files: [], notes: '', ...p }) as Fund;

describe('funding', () => {
  it('itemizes stipend tax: 22% federal + 6.2% SS + 1.45% Medicare + state', () => {
    const t = fundTax(fund({ kind: 'relocation_stipend', amount: 5000 }), { today, state: 'TN' });
    expect(t.lines.map((l) => l.amount)).toEqual([1100, 310, 72.5, 0]);
    expect(t.withheld).toBe(1482.5);
    expect(t.net).toBe(3517.5);
    expect(fundNet(fund({ kind: 'relocation_stipend', amount: 5000, tax_state: 'tx' }), null, today)).toBe(3517.5);
    expect(fundNet(fund({ kind: 'relocation_stipend', amount: 5000, grossed_up: true }), null, today, 'TN')).toBe(5000);
    expect(fundTax(fund({ kind: 'signing_bonus', amount: 1000 }), { state: 'IL' }).lines[3]!.amount).toBe(49.5);
  });

  it('applies withholding + penalty to an early 401k withdrawal', () => {
    expect(fundNet(fund({ kind: 'retirement_401k', amount: 10000 }), { birth_date: '1990-01-01' }, today)).toBe(7000);
    expect(fundNet(fund({ kind: 'retirement_401k', amount: 10000 }), { birth_date: '1960-01-01' }, today)).toBe(8000);
    expect(fundNet(fund({ kind: 'savings', amount: 3000 }), null, today)).toBe(3000);
  });

  it('respects a user-entered net amount', () => {
    expect(fundNet(fund({ kind: 'retirement_401k', amount: 10000, net_amount: 7500 }), null, today)).toBe(7500);
  });

  it('summarises funds against the budget', () => {
    const s = fundingSummary(
      [fund({ kind: 'savings', amount: 4000, received: true }), fund({ kind: 'relocation_stipend', amount: 1000 })],
      [{ estimated: 3000, actual: null }, { estimated: 500, actual: 900 }],
      [],
      today,
      'TN',
    );
    expect(s.net).toBe(4703.5);
    expect(s.received).toBe(4000);
    expect(s.pending).toBe(703.5);
    expect(s.budgeted).toBe(3500);
    expect(s.surplus).toBe(803.5);
  });

  it('sizes the starter budget by distance and household', () => {
    const short = suggestBudgetLines({ miles: 200, people: 2, vehicles: 1, pets: 0 });
    const long = suggestBudgetLines({ miles: 1300, people: 4, vehicles: 2, pets: 1 });
    const total = (l: typeof short) => l.reduce((a, b) => a + (b.estimated ?? 0), 0);
    expect(total(long)).toBeGreaterThan(total(short));
    expect(long.some((l) => /hotel/i.test(l.title))).toBe(true);
  });
});

describe('document files', () => {
  it('creates per-adult checklist rows and skips existing ones', () => {
    const tpl = folderTemplate('apartment')!;
    const members = [
      { id: 'a', birth_date: '1990-01-01' },
      { id: 'b', birth_date: '1992-01-01' },
      { id: 'kid', birth_date: '2018-01-01' },
    ];
    const rows = folderTemplateRows(tpl, members, [], today);
    expect(rows.length).toBeGreaterThanOrEqual(tpl.items.length);
    expect(rows.some((r) => r.member_id === 'kid' && tpl.items.find((i) => i.title === r.title)?.perAdult)).toBe(false);
    const again = folderTemplateRows(tpl, members, rows, today);
    expect(again).toHaveLength(0);
  });

  it('reports folder readiness', () => {
    expect(folderStatus([{ status: 'received', files: ['x'] }, { status: 'needed', files: [] }] as never)).toMatchObject({ total: 2, ready: 1, withFiles: 1, pct: 50 });
  });
});

describe('route distance', () => {
  it('parses an OSRM route', () => {
    expect(parseOsrmRoute({ code: 'Ok', routes: [{ distance: 2101800, duration: 69000 }] })).toEqual({ miles: 1306, minutes: 1150, method: 'road' });
    expect(parseOsrmRoute({ code: 'NoRoute', routes: [] })).toBeNull();
  });

  it('estimates road miles from straight-line distance', () => {
    const r = estimateRoadDistance({ lat: 42.35, lng: -71.07 }, { lat: 35.15, lng: -90.05 });
    expect(r.method).toBe('estimate');
    expect(r.miles).toBeGreaterThan(1100);
    expect(r.miles).toBeLessThan(1500);
  });
});
