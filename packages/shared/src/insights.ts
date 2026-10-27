import type { Snapshot } from './csv';
import type { MovingStore } from './store';
import { buildPlan, diffPlan, dueDateFor } from './tailoring';
import { defaultAddressChanges, defaultBudget, defaultRooms, defaultUtilities } from './templates';
import type { Disposition, Task, TaskCategory } from './types';
import { daysUntil, groupBy, sum, today } from './util';

export interface Insights {
  daysToMove: number | null;
  tasks: { total: number; done: number; overdue: Task[]; upcoming: Task[]; pct: number };
  byCategory: { category: TaskCategory; total: number; done: number }[];
  budget: { estimated: number; actual: number; paid: number; quotedMovers: number | null };
  inventory: { items: number; value: number; byDisposition: Record<Disposition, number>; photos: number };
  boxes: { total: number; byStatus: Record<string, number> };
  books: { total: number; byDisposition: Record<Disposition, number> };
  sales: { toSell: number; potential: number; sold: number; soldValue: number };
  utilitiesDone: { done: number; total: number };
  addressDone: { done: number; total: number };
  documents: { needed: number; total: number };
  perMember: { id: string; name: string; open: number; done: number }[];
}

const emptyDisp = (): Record<Disposition, number> => ({ move: 0, sell: 0, donate: 0, give: 0, trash: 0, store: 0, undecided: 0 });

export function computeInsights(db: Snapshot): Insights {
  const move = db.moves[0];
  const t = today();
  const tasks = db.tasks;
  const open = tasks.filter((x) => x.status === 'todo' || x.status === 'in_progress');
  const done = tasks.filter((x) => x.status === 'done' || x.status === 'skipped').length;
  const overdue = open.filter((x) => x.due_date && x.due_date < t).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const upcoming = open
    .filter((x) => x.due_date && x.due_date >= t && (daysUntil(x.due_date) ?? 99) <= 14)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const cats = groupBy(tasks, (x) => x.category);
  const items = db.items;
  const itemDisp = emptyDisp();
  items.forEach((i) => (itemDisp[i.disposition] += 1));
  const bookDisp = emptyDisp();
  db.books.forEach((b) => (bookDisp[b.disposition] += 1));
  const boxStatus: Record<string, number> = {};
  db.boxes.forEach((b) => (boxStatus[b.status] = (boxStatus[b.status] ?? 0) + 1));
  const sellables = [...items.filter((i) => i.disposition === 'sell'), ...db.books.filter((b) => b.disposition === 'sell')];
  const sold = sellables.filter((s) => s.sale_status === 'sold');
  const accepted = db.quotes.find((q) => q.status === 'accepted');
  const lowest = db.quotes.filter((q) => q.price).sort((a, b) => a.price! - b.price!)[0];

  return {
    daysToMove: daysUntil(move?.move_date),
    tasks: { total: tasks.length, done, overdue, upcoming, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 },
    byCategory: Object.entries(cats)
      .map(([category, rows]) => ({ category: category as TaskCategory, total: rows.length, done: rows.filter((r) => r.status === 'done' || r.status === 'skipped').length }))
      .sort((a, b) => b.total - a.total),
    budget: {
      estimated: sum(db.expenses.map((e) => e.estimated)),
      actual: sum(db.expenses.map((e) => e.actual)),
      paid: sum(db.expenses.filter((e) => e.paid).map((e) => e.actual)),
      quotedMovers: (accepted ?? lowest)?.price ?? null,
    },
    inventory: {
      items: items.length,
      value: sum(items.map((i) => (i.est_value ?? 0) * (i.quantity || 1))),
      byDisposition: itemDisp,
      photos: sum(items.map((i) => i.photos.length)),
    },
    boxes: { total: db.boxes.length, byStatus: boxStatus },
    books: { total: db.books.length, byDisposition: bookDisp },
    sales: {
      toSell: sellables.length,
      potential: sum(sellables.map((s) => s.sale_price ?? s.est_value)),
      sold: sold.length,
      soldValue: sum(sold.map((s) => s.sale_price ?? s.est_value)),
    },
    utilitiesDone: { done: db.utilities.filter((u) => u.status === 'done').length, total: db.utilities.length },
    addressDone: { done: db.address_changes.filter((a) => a.status !== 'todo').length, total: db.address_changes.length },
    documents: { needed: db.documents.filter((d) => d.status === 'needed' || d.status === 'requested').length, total: db.documents.length },
    perMember: db.family_members.map((m) => {
      const mine = tasks.filter((x) => x.member_id === m.id || x.assignee_id === m.id);
      return { id: m.id, name: m.name, open: mine.filter((x) => x.status === 'todo' || x.status === 'in_progress').length, done: mine.filter((x) => x.status === 'done').length };
    }),
  };
}

export interface PlanResult {
  created: number;
  rescheduled: number;
  removed: number;
}

/** Regenerates the tailored plan and applies it to the store. Safe to call repeatedly. */
export function applyPlan(store: MovingStore, opts: { removeObsolete?: boolean } = {}): PlanResult {
  const db = store.getSnapshot();
  const move = db.moves[0] ?? null;
  const drafts = buildPlan({ move, members: db.family_members, pets: db.pets });
  const diff = diffPlan(drafts, db.tasks, move?.move_date);
  if (diff.create.length) {
    store.insertMany(
      'tasks',
      diff.create.map((d) => ({
        title: d.title,
        description: [d.description, d.reason ? `Why: ${d.reason}` : ''].filter(Boolean).join('\n'),
        category: d.category,
        priority: d.priority,
        due_date: dueDateFor(d, move?.move_date),
        member_id: d.member_id ?? null,
        assignee_id: d.member_id ?? null,
        pet_id: d.pet_id ?? null,
        source: d.source,
        rule_key: d.rule_key,
      })),
    );
  }
  for (const r of diff.reschedule) store.update('tasks', r.task.id, { due_date: r.due_date }, { silent: true });
  if (opts.removeObsolete) for (const o of diff.obsolete) store.remove('tasks', o.id);
  return { created: diff.create.length, rescheduled: diff.reschedule.length, removed: opts.removeObsolete ? diff.obsolete.length : 0 };
}

/** Seeds rooms, utilities, address changes and budget lines if empty. */
export function seedHousehold(store: MovingStore) {
  const db = store.getSnapshot();
  if (!db.rooms.length) store.insertMany('rooms', defaultRooms(db.family_members));
  if (!db.utilities.length) store.insertMany('utilities', defaultUtilities());
  if (!db.address_changes.length) store.insertMany('address_changes', defaultAddressChanges());
  if (!db.expenses.length) store.insertMany('expenses', defaultBudget());
}

export function nextBoxNumber(db: Snapshot): number {
  return db.boxes.reduce((m, b) => Math.max(m, b.number || 0), 0) + 1;
}
