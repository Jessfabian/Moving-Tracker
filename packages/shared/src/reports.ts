import QRCode from 'qrcode';
import { makeLookup, type Snapshot } from './csv';
import { APARTMENT_STATUSES, BILL_CATEGORIES, BILL_STATUSES, BOX_STATUSES, DISPOSITIONS, DISPOSITION_COLORS, FREQUENCIES, INCOME_KINDS, INCOME_STATUSES, ITEM_CATEGORIES, RELATIONSHIPS, TASK_CATEGORIES, optionLabel } from './schemas';
import { cashflow, incomeMonthly, monthlyAmount } from './cashflow';
import { bucketFor, TIMELINE_BUCKETS } from './tailoring';
import { boxQrValue } from './products';
import { apartmentCosts } from './apartments';
import type { Box } from './types';
import { daysBetween, formatDate, formatMoney, groupBy, memberAge, sum } from './util';

export type ReportKind = 'inventory' | 'books' | 'sell' | 'labels' | 'manifest' | 'checklist' | 'family' | 'quotes' | 'apartments' | 'budget' | 'bills';

export const REPORTS: { kind: ReportKind; label: string; description: string }[] = [
  { kind: 'checklist', label: 'Moving checklist', description: 'All tasks grouped by timeline' },
  { kind: 'inventory', label: 'Home inventory', description: 'Items by room with photos & values (for insurance)' },
  { kind: 'labels', label: 'Box labels with QR codes', description: 'Printable labels — scan to see contents' },
  { kind: 'manifest', label: 'Box manifest', description: 'Every box, room, status, and contents' },
  { kind: 'books', label: 'Book catalog', description: 'All books grouped by plan' },
  { kind: 'sell', label: 'Sell & donate list', description: 'Items and books to sell or donate' },
  { kind: 'family', label: 'Family info sheet', description: 'Medical, school, and contact info per person' },
  { kind: 'quotes', label: 'Mover quote comparison', description: 'Side-by-side quote table' },
  { kind: 'apartments', label: 'Apartment comparison', description: 'Rent, true monthly cost, move-in cash, pros & cons' },
  { kind: 'budget', label: 'Budget report', description: 'Budgeted vs actual costs' },
  { kind: 'bills', label: 'Bills & income', description: 'Monthly cash flow now vs. after the move' },
];

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const CSS = `
*{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;margin:24px;font-size:12px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:20px 0 8px;border-bottom:2px solid #e5e7eb;padding-bottom:4px}
.muted{color:#6b7280}table{width:100%;border-collapse:collapse;margin-bottom:12px}th,td{border:1px solid #e5e7eb;padding:6px;text-align:left;vertical-align:top}
th{background:#f3f4f6}.pill{display:inline-block;padding:1px 8px;border-radius:999px;color:#fff;font-size:10px}
.thumb{width:48px;height:48px;object-fit:cover;border-radius:4px;margin-right:2px}.right{text-align:right}
.labels{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.label{border:2px dashed #9ca3af;border-radius:8px;padding:12px;display:flex;gap:12px;page-break-inside:avoid;min-height:180px}
.label .qr{width:130px;height:130px;flex:none}.label .num{font-size:40px;font-weight:800;line-height:1}.label .room{font-size:18px;font-weight:700;padding:2px 8px;border-radius:6px;color:#fff;display:inline-block;margin:6px 0}
.flag{font-weight:800;color:#dc2626;margin-right:8px}.card{border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:10px;page-break-inside:avoid}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px}@media print{body{margin:10mm}.noprint{display:none}}
`;

function page(title: string, subtitle: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body><h1>${esc(title)}</h1><div class="muted">${esc(subtitle)} · Generated ${esc(new Date().toLocaleString())}</div>${body}</body></html>`;
}

const pill = (label: string, color: string) => `<span class="pill" style="background:${color}">${esc(label)}</span>`;
const dispPill = (d: string) => pill(optionLabel(DISPOSITIONS, d), DISPOSITION_COLORS[d] ?? '#6b7280');

/** Photos are only embedded when they are portable (data: or https: URIs). */
const imgs = (photos: { uri?: string | null }[]) =>
  photos
    .filter((p) => p.uri && /^(data:|https:)/.test(p.uri))
    .slice(0, 3)
    .map((p) => `<img class="thumb" src="${esc(p.uri)}"/>`)
    .join('');

export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
}

export async function buildReport(kind: ReportKind, db: Snapshot, opts: { boxIds?: string[] } = {}): Promise<string> {
  const live = <T extends { deleted?: boolean }>(rows: T[]) => rows.filter((r) => !r.deleted);
  const L = makeLookup(db);
  const move = live(db.moves)[0];
  const sub = move ? `${move.title}${move.move_date ? ' · ' + formatDate(move.move_date) : ''}` : 'Moving Tracker';

  switch (kind) {
    case 'checklist': {
      const tasks = live(db.tasks);
      const moveDate = move?.move_date ?? null;
      const groups = groupBy(tasks, (t) => bucketFor(moveDate && t.due_date ? daysBetween(moveDate, t.due_date) : null));
      const order = [...TIMELINE_BUCKETS.map((b) => b.label), 'No date'];
      const body = order
        .filter((g) => groups[g])
        .map(
          (g) =>
            `<h2>${esc(g)}</h2><table><tr><th style="width:24px"></th><th>Task</th><th>Category</th><th>Due</th><th>Who</th></tr>${groups[g]!
              .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
              .map(
                (t) =>
                  `<tr><td>${t.status === 'done' ? '☑' : '☐'}</td><td><b>${esc(t.title)}</b>${t.description ? `<div class="muted">${esc(t.description)}</div>` : ''}</td><td>${esc(optionLabel(TASK_CATEGORIES, t.category))}</td><td>${esc(formatDate(t.due_date))}</td><td>${esc(L.member(t.assignee_id) || L.member(t.member_id) || L.pet(t.pet_id))}</td></tr>`,
              )
              .join('')}</table>`,
        )
        .join('');
      return page('Moving checklist', sub, body || '<p>No tasks yet.</p>');
    }
    case 'inventory': {
      const items = live(db.items);
      const rooms = [...live(db.rooms)].sort((a, b) => a.sort - b.sort);
      const byRoom = groupBy(items, (i) => i.room_id ?? '');
      const sections = [...rooms.map((r) => ({ id: r.id, name: r.name })), { id: '', name: 'Unassigned' }]
        .filter((r) => byRoom[r.id]?.length)
        .map((r) => {
          const rows = byRoom[r.id]!;
          const total = sum(rows.map((i) => (i.est_value ?? 0) * (i.quantity || 1)));
          return `<h2>${esc(r.name)} <span class="muted">(${rows.length} items · ${formatMoney(total)})</span></h2><table><tr><th>Photo</th><th>Item</th><th>Category</th><th>Qty</th><th>Condition</th><th>Box</th><th>Plan</th><th class="right">Value</th></tr>${rows
            .map(
              (i) =>
                `<tr><td>${imgs(i.photos)}</td><td><b>${esc(i.name)}</b>${i.brand ? `<div class="muted">${esc(i.brand)}</div>` : ''}${i.barcode ? `<div class="muted">UPC ${esc(i.barcode)}</div>` : ''}</td><td>${esc(optionLabel(ITEM_CATEGORIES, i.category))}</td><td>${i.quantity}</td><td>${esc(i.condition)}</td><td>${esc(L.box(i.box_id))}</td><td>${dispPill(i.disposition)}</td><td class="right">${formatMoney(i.est_value)}</td></tr>`,
            )
            .join('')}</table>`;
        })
        .join('');
      const total = sum(items.map((i) => (i.est_value ?? 0) * (i.quantity || 1)));
      return page('Home inventory', `${sub} · ${items.length} items · ${formatMoney(total)} estimated`, sections || '<p>No items yet.</p>');
    }
    case 'books': {
      const books = live(db.books);
      const groups = groupBy(books, (b) => b.disposition);
      const body = DISPOSITIONS.filter((d) => groups[d.value])
        .map(
          (d) =>
            `<h2>${dispPill(d.value)} ${esc(d.label)} (${groups[d.value]!.length})</h2><table><tr><th>Title</th><th>Author(s)</th><th>ISBN</th><th>Genre</th><th>Condition</th><th>Owner</th><th class="right">Value</th></tr>${groups[d.value]!
              .sort((a, b) => a.title.localeCompare(b.title))
              .map(
                (b) =>
                  `<tr><td><b>${esc(b.title)}</b>${b.subtitle ? `<div class="muted">${esc(b.subtitle)}</div>` : ''}</td><td>${esc(b.authors.join(', '))}</td><td>${esc(b.isbn)}</td><td>${esc(b.genre)}</td><td>${esc(b.condition)}</td><td>${esc(L.member(b.owner_member_id))}</td><td class="right">${formatMoney(b.sale_price ?? b.est_value)}</td></tr>`,
              )
              .join('')}</table>`,
        )
        .join('');
      return page('Book catalog', `${sub} · ${books.length} books`, body || '<p>No books yet.</p>');
    }
    case 'sell': {
      const items = live(db.items).filter((i) => ['sell', 'donate', 'give'].includes(i.disposition));
      const books = live(db.books).filter((b) => ['sell', 'donate', 'give'].includes(b.disposition));
      const rows = [
        ...items.map((i) => ({ kind: 'Item', name: i.name, d: i.disposition, price: i.sale_price ?? i.est_value, status: i.sale_status, extra: L.room(i.room_id), photos: imgs(i.photos) })),
        ...books.map((b) => ({ kind: 'Book', name: `${b.title} — ${b.authors.join(', ')}`, d: b.disposition, price: b.sale_price ?? b.est_value, status: b.sale_status, extra: `ISBN ${b.isbn}`, photos: b.cover_url ? `<img class="thumb" src="${esc(b.cover_url)}"/>` : '' })),
      ];
      const groups = groupBy(rows, (r) => r.d);
      const body = ['sell', 'donate', 'give']
        .filter((d) => groups[d])
        .map(
          (d) =>
            `<h2>${dispPill(d)} ${esc(optionLabel(DISPOSITIONS, d))} (${groups[d]!.length}${d === 'sell' ? ` · ${formatMoney(sum(groups[d]!.map((r) => r.price)))}` : ''})</h2><table><tr><th></th><th>Type</th><th>Name</th><th>Details</th><th>Status</th><th class="right">Price</th></tr>${groups[d]!
              .map((r) => `<tr><td>${r.photos}</td><td>${r.kind}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.extra)}</td><td>${esc(r.status)}</td><td class="right">${formatMoney(r.price)}</td></tr>`)
              .join('')}</table>`,
        )
        .join('');
      return page('Sell & donate list', sub, body || '<p>Nothing marked to sell or donate yet.</p>');
    }
    case 'labels': {
      const boxes = live(db.boxes)
        .filter((b) => !opts.boxIds || opts.boxIds.includes(b.id))
        .sort((a, b) => a.number - b.number);
      const roomColor = new Map(live(db.rooms).map((r) => [r.id, r.color]));
      const labels = await Promise.all(
        boxes.map(async (b: Box) => {
          const svg = await qrSvg(boxQrValue(b.id));
          const items = live(db.items).filter((i) => i.box_id === b.id).map((i) => i.name);
          const contents = b.contents || items.slice(0, 6).join(', ');
          return `<div class="label"><div class="qr">${svg}</div><div><div class="num">#${b.number}</div><div class="room" style="background:${roomColor.get(b.room_id ?? '') ?? '#374151'}">${esc(b.destination_room || L.room(b.room_id) || 'Room?')}</div><div>${b.fragile ? '<span class="flag">FRAGILE</span>' : ''}${b.open_first ? '<span class="flag" style="color:#16a34a">OPEN FIRST</span>' : ''}</div><div><b>${esc(b.label)}</b></div><div class="muted">${esc(contents)}</div></div></div>`;
        }),
      );
      return page('Box labels', `${sub} · Scan the QR code in the app to see box contents`, `<div class="labels">${labels.join('')}</div>`);
    }
    case 'manifest': {
      const boxes = live(db.boxes).sort((a, b) => a.number - b.number);
      const body = `<table><tr><th>#</th><th>Label</th><th>From</th><th>To</th><th>Status</th><th>Flags</th><th>Contents</th><th>✓ Delivered</th></tr>${boxes
        .map((b) => {
          const items = live(db.items).filter((i) => i.box_id === b.id).map((i) => i.name);
          return `<tr><td><b>${b.number}</b></td><td>${esc(b.label)}</td><td>${esc(L.room(b.room_id))}</td><td>${esc(b.destination_room)}</td><td>${esc(optionLabel(BOX_STATUSES, b.status))}</td><td>${b.fragile ? 'Fragile ' : ''}${b.open_first ? 'Open first' : ''}</td><td>${esc([b.contents, ...items].filter(Boolean).join(', '))}</td><td>☐</td></tr>`;
        })
        .join('')}</table>`;
      return page('Box manifest', `${sub} · ${boxes.length} boxes`, body);
    }
    case 'family': {
      const body =
        live(db.family_members)
          .map((m) => {
            const age = memberAge(m);
            const row = (k: string, v: string) => (v ? `<div><b>${k}:</b> ${esc(v)}</div>` : '');
            return `<div class="card"><h2 style="margin-top:0">${esc(m.name)} <span class="muted">${esc(optionLabel(RELATIONSHIPS, m.relationship))}${age !== null ? ` · age ${age}` : ''}</span></h2><div class="grid2">${row('Birth date', formatDate(m.birth_date))}${row('Phone', m.phone)}${row('Email', m.email)}${row('Employer', m.employer)}${row('School', m.school_name)}${row('Grade', m.grade)}${row('Medical', m.medical_conditions)}${row('Medications', m.medications)}${row('Allergies', m.allergies)}${row('Doctors', m.doctors)}${row('Insurance', m.insurance)}${row('Special needs', m.special_needs)}${row('Dietary', m.dietary)}${row('Activities', m.activities)}${row('Notes', m.notes)}</div></div>`;
          })
          .join('') +
        live(db.pets)
          .map(
            (p) =>
              `<div class="card"><h2 style="margin-top:0">🐾 ${esc(p.name)} <span class="muted">${esc(p.species)} ${esc(p.breed)}</span></h2><div class="grid2"><div><b>Vet:</b> ${esc(p.vet_name)} ${esc(p.vet_phone)}</div><div><b>Microchip:</b> ${esc(p.microchip)}</div><div><b>Vaccines current:</b> ${p.vaccinations_current ? 'Yes' : 'No'}</div><div><b>Medications:</b> ${esc(p.medications)}</div></div></div>`,
          )
          .join('');
      return page('Family info sheet', sub, body || '<p>No family members yet.</p>');
    }
    case 'quotes': {
      const quotes = live(db.quotes);
      if (!quotes.length) return page('Mover quote comparison', sub, '<p>No quotes yet.</p>');
      const rows: [string, (q: (typeof quotes)[number]) => string][] = [
        ['Price', (q) => formatMoney(q.price)],
        ['Estimate type', (q) => q.quote_type.replace(/_/g, ' ')],
        ['Deposit', (q) => formatMoney(q.deposit)],
        ['Est. weight', (q) => (q.estimated_weight_lbs ? `${q.estimated_weight_lbs} lbs` : '')],
        ['Price / lb', (q) => (q.price && q.estimated_weight_lbs ? formatMoney(q.price / q.estimated_weight_lbs) : '')],
        ['Valuation', (q) => q.valuation.replace(/_/g, ' ')],
        ['Coverage', (q) => formatMoney(q.coverage_amount)],
        ['Pickup', (q) => q.pickup_window],
        ['Delivery', (q) => q.delivery_window],
        ['Packing incl.', (q) => (q.includes_packing ? 'Yes' : 'No')],
        ['Storage incl.', (q) => (q.includes_storage ? 'Yes' : 'No')],
        ['USDOT / MC', (q) => [q.usdot, q.mc_number].filter(Boolean).join(' / ')],
        ['Rating', (q) => (q.rating ? '★'.repeat(q.rating) : '')],
        ['Status', (q) => q.status],
        ['Notes', (q) => q.notes],
      ];
      const body = `<table><tr><th></th>${quotes.map((q) => `<th>${esc(q.company)}</th>`).join('')}</tr>${rows.map(([label, f]) => `<tr><th>${label}</th>${quotes.map((q) => `<td>${esc(f(q))}</td>`).join('')}</tr>`).join('')}</table>`;
      return page('Mover quote comparison', sub, body);
    }
    case 'apartments': {
      const apts = live(db.apartments).filter((a) => a.status !== 'rejected');
      if (!apts.length) return page('Apartment comparison', sub, '<p>No apartments yet.</p>');
      type A = (typeof apts)[number];
      const rows: [string, (a: A) => string][] = [
        ['Status', (a) => optionLabel(APARTMENT_STATUSES, a.status)],
        ['Address', (a) => [a.address, a.city, a.state].filter(Boolean).join(', ')],
        ['Rent', (a) => formatMoney(a.rent)],
        ['True monthly', (a) => formatMoney(apartmentCosts(a).monthly)],
        ['Cash to move in', (a) => formatMoney(apartmentCosts(a).moveIn)],
        ['First-year cost', (a) => formatMoney(apartmentCosts(a).firstYear)],
        ['Bed / bath', (a) => `${a.bedrooms ?? '?'} bd / ${a.bathrooms ?? '?'} ba`],
        ['Sq ft', (a) => (a.sqft ? String(a.sqft) : '')],
        ['Rent / sq ft', (a) => (apartmentCosts(a).perSqft != null ? `$${apartmentCosts(a).perSqft}` : '')],
        ['Lease', (a) => (a.lease_months ? `${a.lease_months} mo` : '')],
        ['Special', (a) => a.move_in_special],
        ['Laundry', (a) => a.laundry.replace(/_/g, ' ')],
        ['Parking', (a) => a.parking],
        ['Pets', (a) => (a.pets_allowed ? 'Yes' : 'No')],
        ['Commute', (a) => (a.commute_minutes ? `${a.commute_minutes} min` : '')],
        ['Schools', (a) => a.school_district],
        ['Available', (a) => formatDate(a.available_date)],
        ['Rating', (a) => (a.rating ? '★'.repeat(a.rating) : '')],
        ['Pros', (a) => a.pros],
        ['Cons', (a) => a.cons],
      ];
      const body = `<table><tr><th></th>${apts.map((a) => `<th>${esc(a.name)}</th>`).join('')}</tr>${rows.map(([label, f]) => `<tr><th>${label}</th>${apts.map((a) => `<td>${esc(f(a))}</td>`).join('')}</tr>`).join('')}</table>`;
      return page('Apartment comparison', sub, body);
    }
    case 'budget': {      const ex = live(db.expenses);
      const est = sum(ex.map((e) => e.estimated));
      const act = sum(ex.map((e) => e.actual));
      const body = `<table><tr><th>Expense</th><th>Category</th><th>Date</th><th class="right">Budgeted</th><th class="right">Actual</th><th>Paid</th></tr>${ex
        .map((e) => `<tr><td>${esc(e.title)}</td><td>${esc(e.category)}</td><td>${esc(formatDate(e.date))}</td><td class="right">${formatMoney(e.estimated)}</td><td class="right">${formatMoney(e.actual)}</td><td>${e.paid ? '✔' : ''}</td></tr>`)
        .join('')}<tr><th colspan="3">Total</th><th class="right">${formatMoney(est)}</th><th class="right">${formatMoney(act)}</th><th></th></tr></table>`;
      return page('Budget report', sub, body);
    }
    case 'bills': {
      const now = cashflow(db, 'now');
      const after = cashflow(db, 'after');
      const inc = live(db.incomes);
      const bills = live(db.bills).sort((a, b) => a.category.localeCompare(b.category));
      const body = `<h2>Summary (per month)</h2><table><tr><th></th><th class="right">Now</th><th class="right">After the move</th></tr>
<tr><td>Take-home income</td><td class="right">${formatMoney(now.incomeNet)}</td><td class="right">${formatMoney(after.incomeNet)}</td></tr>
<tr><td>Bills</td><td class="right">${formatMoney(now.bills)}</td><td class="right">${formatMoney(after.bills)}</td></tr>
<tr><th>Left over</th><th class="right">${formatMoney(now.leftover)}</th><th class="right">${formatMoney(after.leftover)}</th></tr></table>
<h2>Income</h2><table><tr><th>Source</th><th>Type</th><th>How often</th><th class="right">Amount</th><th class="right">Monthly take-home</th><th>Status</th></tr>${inc
        .map((i) => `<tr><td>${esc(i.source)}</td><td>${esc(optionLabel(INCOME_KINDS, i.kind))}</td><td>${esc(optionLabel(FREQUENCIES, i.frequency))}</td><td class="right">${formatMoney(i.amount)} ${i.basis}</td><td class="right">${formatMoney(incomeMonthly(i).net)}</td><td>${esc(optionLabel(INCOME_STATUSES, i.status))}</td></tr>`)
        .join('')}</table>
<h2>Bills</h2><table><tr><th>Bill</th><th>Category</th><th>How often</th><th>Due</th><th class="right">Amount</th><th class="right">Monthly</th><th>After the move</th></tr>${bills
        .map((b) => `<tr><td>${esc(b.name)}${b.autopay ? ' (autopay)' : ''}</td><td>${esc(optionLabel(BILL_CATEGORIES, b.category))}</td><td>${esc(optionLabel(FREQUENCIES, b.frequency))}</td><td>${b.due_day ? `Day ${b.due_day}` : ''}</td><td class="right">${formatMoney(b.amount)}</td><td class="right">${formatMoney(monthlyAmount(b.amount, b.frequency))}</td><td>${esc(optionLabel(BILL_STATUSES, b.status))}</td></tr>`)
        .join('')}</table>`;
      return page('Bills & income', 'Monthly cash flow before and after the move', body);
    }
  }
}
