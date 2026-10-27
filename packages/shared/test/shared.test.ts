import { describe, expect, it } from 'vitest';
import {
  applyPlan,
  buildPlan,
  cleanIsbn,
  computeInsights,
  DEFAULTS,
  diffPlan,
  guessItemCategory,
  isBookBarcode,
  isbn10to13,
  makeLookup,
  memoryKV,
  MovingStore,
  normalizeIsbn,
  parseBoxQr,
  boxQrValue,
  parseGoogleBooks,
  parseOpenLibrary,
  lookupBook,
  tableToCsv,
  toCsv,
  buildReport,
  seedHousehold,
  ageOn,
  addDays,
  guessGenre,
  type FamilyMember,
  type Move,
  type Pet,
} from '../src';

const base = { household_id: 'h', created_at: '', updated_at: '' };
const member = (p: Partial<FamilyMember>): FamilyMember => ({ ...DEFAULTS.family_members, ...base, id: p.name ?? 'm', ...p }) as FamilyMember;
const pet = (p: Partial<Pet>): Pet => ({ ...DEFAULTS.pets, ...base, id: p.name ?? 'p', ...p }) as Pet;
const move = (p: Partial<Move> = {}): Move => ({ ...DEFAULTS.moves, ...base, id: 'mv', move_date: '2027-06-15', from_state: 'MA', to_state: 'CO', moving_method: 'full_service', ...p }) as Move;

describe('dates', () => {
  it('computes ages and offsets without timezone drift', () => {
    expect(ageOn('2015-06-16', '2027-06-15')).toBe(11);
    expect(ageOn('2015-06-15', '2027-06-15')).toBe(12);
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });
});

describe('tailoring engine', () => {
  it('adds school tasks for school-age kids and childcare for toddlers', () => {
    const plan = buildPlan({ move: move(), members: [member({ name: 'Ava', age: 9, relationship: 'child' }), member({ name: 'Leo', age: 2, relationship: 'child' })], pets: [] });
    const titles = plan.map((d) => d.title);
    expect(titles).toContain('Request school records/transcripts for Ava');
    expect(titles.some((t) => t.includes('childcare') && t.includes('Leo'))).toBe(true);
    expect(titles.some((t) => t.includes('school records') && t.includes('Leo'))).toBe(false);
  });

  it('adds interstate license tasks only for drivers and USDOT check for interstate movers', () => {
    const plan = buildPlan({ move: move(), members: [member({ name: 'Sam', age: 40, drives: true }), member({ name: 'Kim', age: 38, drives: false })], pets: [] });
    expect(plan.some((d) => d.title.includes('Sam’s new-state driver’s license'))).toBe(true);
    expect(plan.some((d) => d.title.includes('Kim’s new-state driver’s license'))).toBe(false);
    expect(plan.some((d) => d.rule_key === 'movers:usdot')).toBe(true);
    const local = buildPlan({ move: move({ to_state: 'MA' }), members: [], pets: [] });
    expect(local.some((d) => d.rule_key === 'movers:usdot')).toBe(false);
  });

  it('tailors seniors, medications, remote work and pets', () => {
    const plan = buildPlan({
      move: move(),
      members: [member({ name: 'Nana', age: 72, medications: 'Lisinopril' }), member({ name: 'Dev', age: 35, works_remote: true, employed: true })],
      pets: [pet({ name: 'Rex', travel_method: 'air_cabin', vaccinations_current: false })],
    });
    const keys = plan.map((d) => d.rule_key);
    expect(keys).toContain('member:Nana:medicare-plan');
    expect(keys).toContain('member:Nana:rx-refill');
    expect(keys).toContain('member:Dev:office');
    expect(keys).toContain('member:Dev:withholding');
    expect(keys).toContain('pet:Rex:cvi');
    expect(keys).toContain('pet:Rex:flight');
    expect(keys).toContain('pet:Rex:vaccines');
  });

  it('is idempotent and reschedules when move date changes', () => {
    const m = move();
    const drafts = buildPlan({ move: m, members: [], pets: [] });
    const tasks = drafts.map((d, i) => ({ ...DEFAULTS.tasks, ...base, id: String(i), rule_key: d.rule_key, due_date: addDays(m.move_date!, d.offset), status: 'todo' as const }));
    expect(diffPlan(drafts, tasks, m.move_date).create).toHaveLength(0);
    expect(diffPlan(drafts, tasks, m.move_date).reschedule).toHaveLength(0);
    expect(diffPlan(drafts, tasks, '2027-07-01').reschedule.length).toBe(tasks.length);
  });
});

describe('books', () => {
  it('validates and converts ISBNs', () => {
    expect(cleanIsbn('978-0-306-40615-7')).toBe('9780306406157');
    expect(isBookBarcode('9780306406157')).toBe(true);
    expect(isBookBarcode('012345678905')).toBe(false);
    expect(isbn10to13('0306406152')).toBe('9780306406157');
    expect(normalizeIsbn('0-306-40615-2')).toBe('9780306406157');
    expect(normalizeIsbn('123')).toBeNull();
  });

  it('parses Open Library and Google Books responses', () => {
    const ol = parseOpenLibrary('9780306406157', {
      'ISBN:9780306406157': { title: 'Dune', authors: [{ name: 'Frank Herbert' }], publishers: [{ name: 'Ace' }], subjects: [{ name: 'Science fiction' }], number_of_pages: 412 },
    });
    expect(ol).toMatchObject({ title: 'Dune', authors: ['Frank Herbert'], genre: 'scifi_fantasy', pages: 412 });
    const g = parseGoogleBooks('1', { items: [{ volumeInfo: { title: 'Salt Fat Acid Heat', categories: ['Cooking'], imageLinks: { thumbnail: 'http://x/y.jpg' } } }] });
    expect(g).toMatchObject({ genre: 'cooking', cover_url: 'https://x/y.jpg' });
    expect(guessGenre(['Juvenile Fiction'])).toBe('children');
  });

  it('falls back to Google Books when Open Library has nothing', async () => {
    const calls: string[] = [];
    const fakeFetch = async (url: string) => {
      calls.push(url);
      return { ok: true, json: async () => (url.includes('openlibrary') ? {} : { items: [{ volumeInfo: { title: 'Fallback' } }] }) };
    };
    const info = await lookupBook('9780306406157', fakeFetch);
    expect(info?.title).toBe('Fallback');
    expect(calls.some((u) => u.includes('googleapis'))).toBe(true);
  });

  it('merges physical format, weight and list price from secondary sources', async () => {
    const fakeFetch = async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes('/isbn/')
          ? { physical_format: 'Hardcover', weight: '1.4 pounds' }
          : url.includes('openlibrary')
            ? { 'ISBN:9780306406157': { title: 'Dune', number_of_pages: 412 } }
            : { items: [{ volumeInfo: { title: 'Dune' }, saleInfo: { listPrice: { amount: 18.99, currencyCode: 'USD' } } }] },
    });
    const info = await lookupBook('9780306406157', fakeFetch);
    expect(info).toMatchObject({ title: 'Dune', format: 'hardcover', weight_oz: 22.4, list_price: 18.99, pages: 412 });
  });
});

describe('box QR codes', () => {
  it('round-trips', () => {
    expect(parseBoxQr(boxQrValue('abc'))).toBe('abc');
    expect(parseBoxQr('random')).toBeNull();
  });
});

describe('csv', () => {
  it('escapes cells', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'he said "hi"']])).toBe('a,b\r\n"x,y","he said ""hi"""');
  });
});

describe('store', () => {
  it('persists, logs activity, applies plan and computes insights', async () => {
    const kv = memoryKV();
    const store = new MovingStore(kv, 'local', () => 'Me');
    await store.load();
    store.insert('moves', { title: 'Test', move_date: '2027-06-15', from_state: 'MA', to_state: 'CO' });
    const kid = store.insert('family_members', { name: 'Ava', age: 9, relationship: 'child' });
    seedHousehold(store);
    const res = applyPlan(store);
    expect(res.created).toBeGreaterThan(20);
    expect(applyPlan(store).created).toBe(0);
    expect(store.list('rooms').some((r) => r.name === 'Ava’s room')).toBe(true);

    const room = store.list('rooms')[0]!;
    const box = store.insert('boxes', { number: 1, room_id: room.id, label: 'Pots' });
    store.insert('items', { name: 'Couch', room_id: room.id, box_id: box.id, est_value: 500, disposition: 'sell' });
    store.insert('books', { title: 'Dune', isbn: '9780306406157', authors: ['Frank Herbert'], disposition: 'donate' });
    const ins = computeInsights(store.getSnapshot());
    expect(ins.inventory.value).toBe(500);
    expect(ins.sales.toSell).toBe(1);
    expect(ins.books.byDisposition.donate).toBe(1);
    expect(ins.perMember[0]!.name).toBe('Ava');
    expect(store.list('activity').length).toBeGreaterThan(0);

    store.remove('family_members', kid.id);
    expect(store.list('family_members')).toHaveLength(0);

    await store.flushToDisk();
    const reloaded = new MovingStore(kv, 'local', () => 'Me');
    await reloaded.load();
    expect(reloaded.list('items')[0]!.name).toBe('Couch');

    const csv = tableToCsv('items', reloaded.list('items'), makeLookup(reloaded.getSnapshot()));
    expect(csv).toContain('Couch');
    expect(csv).toContain(room.name);

    const labels = await buildReport('labels', reloaded.getSnapshot());
    expect(labels).toContain('<svg');
    for (const kind of ['inventory', 'books', 'sell', 'manifest', 'checklist', 'family', 'quotes', 'budget'] as const) {
      expect(await buildReport(kind, reloaded.getSnapshot())).toContain('<html>');
    }
  });

  it('syncs with a remote adapter and merges remote rows', async () => {
    const server: Record<string, Map<string, Record<string, unknown>>> = {};
    let clock = 0;
    const remote = {
      push: async (table: string, rows: { id: string }[]) => {
        server[table] ??= new Map();
        for (const r of rows) server[table]!.set(r.id, { ...r, server_updated_at: String(++clock).padStart(6, '0') });
      },
      pull: async (table: string, since: string | null) =>
        [...(server[table]?.values() ?? [])].filter((r) => !since || (r.server_updated_at as string) > since) as never[],
      subscribe: () => () => {},
    };
    const a = new MovingStore(memoryKV(), 'h1', () => 'A', remote);
    const b = new MovingStore(memoryKV(), 'h1', () => 'B', remote);
    await a.load();
    await b.load();
    a.insert('tasks', { title: 'From A' });
    await a.sync();
    await b.sync();
    expect(b.list('tasks').map((t) => t.title)).toContain('From A');
    const id = b.list('tasks').find((t) => t.title === 'From A')!.id;
    b.update('tasks', id, { status: 'done' });
    await b.sync();
    await a.sync();
    expect(a.get('tasks', id)?.status).toBe('done');
    expect(a.status.error).toBeNull();
  });
});

describe('guessItemCategory', () => {
  it('maps common household names', () => {
    expect(guessItemCategory('dining chair')).toBe('furniture');
    expect(guessItemCategory('Sofa')).toBe('furniture');
    expect(guessItemCategory('TV')).toBe('electronics');
    expect(guessItemCategory('Microwave')).toBe('appliances');
    expect(guessItemCategory('box of plates')).toBe('kitchenware');
    expect(guessItemCategory('mystery thing')).toBe('other');
  });
});