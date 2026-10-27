import type { Snapshot } from './csv';
import type { Book, BookSale, Item, SalesToBudget } from './types';

export type SaleStage = 'sold' | 'pending' | 'listed' | 'unlisted';

export interface SaleLine {
  id: string;
  kind: 'item' | 'book' | 'book_sale';
  name: string;
  amount: number;
  stage: SaleStage;
  /** Where it was sold (book channel), if known. */
  channel?: string;
}

export interface SalesProceeds {
  /** Money in hand from finished sales (after fees and postage for book orders). */
  sold: number;
  /** Agreed sales waiting on payment or pickup. */
  pending: number;
  /** Listed but not sold yet, at the asking price. */
  listed: number;
  /** Marked "sell" but not listed yet, at the estimated value. */
  unlisted: number;
  lines: SaleLine[];
  counts: Record<SaleStage, number>;
}

/** Net from a book order: price + shipping charged − fees − postage. */
export function bookSaleNet(s: Pick<BookSale, 'price' | 'shipping_charged' | 'fees' | 'postage'>): number {
  return (s.price ?? 0) + (s.shipping_charged ?? 0) - (s.fees ?? 0) - (s.postage ?? 0);
}

const SALE_DONE: BookSale['status'][] = ['paid', 'packed', 'shipped', 'delivered', 'picked_up'];

const itemStage = (s: Item['sale_status']): SaleStage => (s === 'sold' ? 'sold' : s === 'pending' ? 'pending' : s === 'listed' ? 'listed' : 'unlisted');

/** Everything you're selling, grouped by how sure the money is. Book orders replace the per-book prices of the books they include. */
export function salesProceeds(db: Pick<Snapshot, 'items' | 'books'> & Partial<Pick<Snapshot, 'book_sales'>>): SalesProceeds {
  const lines: SaleLine[] = [];
  const inOrder = new Set<string>();
  for (const s of db.book_sales ?? []) {
    if (s.deleted || s.status === 'cancelled') continue;
    for (const id of s.book_ids ?? []) inOrder.add(id);
    lines.push({
      id: s.id,
      kind: 'book_sale',
      name: `${(s.book_ids ?? []).length} book${(s.book_ids ?? []).length === 1 ? '' : 's'} → ${s.buyer_name || s.channel || 'buyer'}`,
      amount: bookSaleNet(s),
      stage: SALE_DONE.includes(s.status) ? 'sold' : 'pending',
      channel: s.channel,
    });
  }
  for (const i of db.items) {
    if (i.deleted || i.disposition !== 'sell') continue;
    const qty = Math.max(1, i.quantity ?? 1);
    const each = i.sale_price ?? i.est_value ?? 0;
    lines.push({ id: i.id, kind: 'item', name: i.name, amount: i.sale_price != null ? i.sale_price : each * qty, stage: itemStage(i.sale_status) });
  }
  for (const b of db.books as Book[]) {
    if (b.deleted || b.disposition !== 'sell' || inOrder.has(b.id)) continue;
    lines.push({ id: b.id, kind: 'book', name: b.title, amount: b.sale_price ?? b.est_value ?? 0, stage: itemStage(b.sale_status) });
  }
  const total = (st: SaleStage) => Math.round(lines.filter((l) => l.stage === st).reduce((a, l) => a + l.amount, 0) * 100) / 100;
  const counts = { sold: 0, pending: 0, listed: 0, unlisted: 0 } as Record<SaleStage, number>;
  for (const l of lines) counts[l.stage]++;
  return { sold: total('sold'), pending: total('pending'), listed: total('listed'), unlisted: total('unlisted'), lines, counts };
}

/** How much sale money counts toward the moving budget under the chosen setting. */
export function salesForBudget(p: SalesProceeds, mode: SalesToBudget = 'sold'): number {
  if (mode === 'none') return 0;
  if (mode === 'sold') return p.sold;
  if (mode === 'pending') return p.sold + p.pending;
  return p.sold + p.pending + p.listed + p.unlisted;
}
