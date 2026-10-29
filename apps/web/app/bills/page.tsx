"use client";

import {
  BILL_CATEGORIES,
  BILL_STATUSES,
  FREQUENCIES,
  INCOME_KINDS,
  INCOME_STATUSES,
  apartmentCosts,
  billDue,
  cashflow,
  formatDate,
  formatMoney,
  incomeMonthly,
  markBillPaid,
  maxAffordableRent,
  monthlyAmount,
  optionLabel,
  subscriptionSummary,
  today,
  type Bill,
  type Income,
  type Phase,
} from "@moving/shared";
import Link from "next/link";
import { useState } from "react";
import { EntityForm } from "@/components/EntityForm";
import { MoneyImport } from "@/components/MoneyImport";
import { InboxConnect } from "@/components/InboxConnect";
import { BULK_BTN, BULK_DANGER, BULK_PRIMARY, SelectableRow, SelectActions, SelectBar, useBulkDelete, useBulkHide, useBulkUpdate, useSelection } from "@/components/Selection";
import { EmailSource } from "@/components/EmailSource";
import { Card, showUndo, SwipeRow, useDeleteWithUndo, useHiddenRows } from "@/components/Swipe";
import { Drawer } from "@/components/ui";
import { useDb, useStore } from "@/lib/store-context";
import { useMoveRecords } from "@/lib/moveRecords";

const CAT_COLORS: Record<string, string> = {
  housing: "#ff5a1f",
  utilities: "#0891b2",
  internet_phone: "#6366f1",
  insurance: "#7c3aed",
  transportation: "#0d0d0f",
  debt: "#dc2626",
  childcare: "#db2777",
  health: "#16a34a",
  food: "#d97706",
  subscriptions: "#a855f7",
  pets: "#65a30d",
  savings: "#059669",
  other: "#78716c",
};

const STATUS_STYLE: Record<string, string> = {
  active: "bg-gray-100 text-gray-700",
  transfer: "bg-sky text-sky-900",
  cancel_before_move: "bg-red-100 text-red-700",
  new_after_move: "bg-lime text-ink",
  current: "bg-gray-100 text-gray-700",
  ending: "bg-red-100 text-red-700",
  new_job: "bg-lime text-ink",
};

type Editing = { table: "bills"; row: Bill | null } | { table: "incomes"; row: Income | null } | null;

function Flow({ phase, active, onClick }: { phase: Phase; active: boolean; onClick: () => void }) {
  const db = useDb();
  const f = cashflow(db, phase);
  const pct = f.incomeNet ? Math.min(100, (f.bills / f.incomeNet) * 100) : 0;
  return (
    <button onClick={onClick} className={`tile w-full text-left transition ${active ? "bg-ink text-white" : "bg-white hover:shadow-md"}`}>
      <div className={`eyebrow ${active ? "text-white/50" : ""}`}>{phase === "now" ? "Today, before the move" : "After the move"}</div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className={`font-display text-5xl font-bold tracking-tight ${f.leftover < 0 ? "text-red-500" : active ? "text-lime" : ""}`}>{formatMoney(f.leftover)}</span>
        <span className={`text-sm ${active ? "text-white/50" : "text-gray-500"}`}>left / month</span>
      </div>
      <div className={`mt-4 h-2.5 overflow-hidden rounded-full ${active ? "bg-white/10" : "bg-gray-100"}`}>
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <div className={`mt-2 flex justify-between text-xs ${active ? "text-white/60" : "text-gray-500"}`}>
        <span>Bills {formatMoney(f.bills)}</span>
        <span>Take-home {formatMoney(f.incomeNet)}</span>
      </div>
    </button>
  );
}

export default function BillsPage() {
  const db = useDb();
  const store = useStore();
  const hiddenRows = useHiddenRows();
  const del = useDeleteWithUndo();
  const [phase, setPhase] = useState<Phase>("after");
  const [tab, setTab] = useState<"bills" | "income">("bills");
  const [editing, setEditing] = useState<Editing>(null);
  const [importing, setImporting] = useState(false);
  const t = today();
  const flow = cashflow(db, phase);
  const now = cashflow(db, "now");
  const after = cashflow(db, "after");
  const subs = subscriptionSummary(db.subscriptions ?? []);
  const due = db.bills
    .filter((b) => b.status !== "new_after_move" && !hiddenRows.isHidden("bills", b.id))
    .map((b) => ({ bill: b, d: billDue(b, t) }))
    .filter((x): x is { bill: Bill; d: NonNullable<ReturnType<typeof billDue>> } => !!x.d && x.d.daysAway <= 31)
    .sort((a, b) => a.d.daysAway - b.d.daysAway);
  const overdue = due.filter((x) => x.d.overdue);
  const maxRent = maxAffordableRent(db);
  const signed = db.apartments.find((a) => a.status === "signed");
  const bills = db.bills.filter((b) => !hiddenRows.isHidden("bills", b.id)).sort((a, b) => monthlyAmount(b.amount, b.frequency) - monthlyAmount(a.amount, a.frequency));
  const incomes = db.incomes.filter((i) => !hiddenRows.isHidden("incomes", i.id)).sort((a, b) => incomeMonthly(b).net - incomeMonthly(a).net);
  const delta = after.leftover - now.leftover;
  const memberName = (id: string | null) => db.family_members.find((m) => m.id === id)?.name;
  const pay = (b: Bill) => {
    const before = { last_paid: b.last_paid ?? null, next_due: b.next_due ?? null };
    store.update("bills", b.id, markBillPaid(b, t));
    showUndo(`${b.name} marked paid`, () => store.update("bills", b.id, before, { silent: true }));
  };
  const rowActions = (table: "bills" | "incomes", id: string, label: string) => [
    {
      label: "Hide",
      icon: "🙈",
      onClick: () => {
        hiddenRows.hide({ table, id, label });
        showUndo(`Hid “${label}” · find it in Settings`, () => hiddenRows.unhide(table, id));
      },
    },
    { label: "Delete", icon: "🗑", tone: "danger" as const, onClick: () => del(table, id, `“${label}”`) },
  ];
  const billSel = useSelection(tab === "bills" ? bills.map((b) => b.id) : []);
  const move = useMoveRecords();
  const incSel = useSelection(tab === "income" ? incomes.map((i) => i.id) : []);
  const sel = tab === "bills" ? billSel : incSel;
  const noun = tab === "bills" ? "bill" : "income";
  const billUpdate = useBulkUpdate<Bill>("bills", billSel, "bill");
  const billDelete = useBulkDelete("bills", billSel, "bill");
  const billHide = useBulkHide("bills", billSel, (id) => db.bills.find((b) => b.id === id)?.name ?? "Bill", "bill");
  const incUpdate = useBulkUpdate<Income>("incomes", incSel, "income");
  const incDelete = useBulkDelete("incomes", incSel, "income");
  const incHide = useBulkHide("incomes", incSel, (id) => db.incomes.find((i) => i.id === id)?.source ?? "Income", "income");
  const bulkPaid = () => {
    const picked = db.bills.filter((b) => billSel.ids.includes(b.id));
    if (!picked.length) return;
    const before = picked.map((b) => ({ id: b.id, prev: { last_paid: b.last_paid ?? null, next_due: b.next_due ?? null } }));
    for (const b of picked) store.update("bills", b.id, markBillPaid(b, t), { silent: true });
    billSel.release(picked.map((b) => b.id));
    showUndo(`✓ Marked paid · ${picked.length} bill${picked.length === 1 ? "" : "s"}`, () => {
      for (const b of before) store.update("bills", b.id, b.prev, { silent: true });
    });
  };
  const dueLabel = (d: { daysAway: number; overdue: boolean }) => (d.overdue ? `${-d.daysAway}d overdue` : d.daysAway === 0 ? "due today" : d.daysAway === 1 ? "due tomorrow" : `in ${d.daysAway}d`);

  return (
    <div className="space-y-6">
      <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <div className="eyebrow">Money · monthly cash flow</div>
          <h1 className="display mt-2">
            Bills <span className="text-gray-300">&amp;</span> <span className="highlight">income</span>
          </h1>
          <p className="muted mt-3 max-w-2xl">Put in what comes in and what goes out — today and after the move — to see what&apos;s left, what to cancel or transfer, and how much rent you can afford.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setImporting(true)}>
            ✉️ Import
          </button>
          <button className="btn-secondary" onClick={() => setEditing({ table: "incomes", row: null })}>
            + Income
          </button>
          <button className="btn-primary" onClick={() => setEditing({ table: "bills", row: null })}>
            + Bill
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <Flow phase="now" active={phase === "now"} onClick={() => setPhase("now")} />
        <Flow phase="after" active={phase === "after"} onClick={() => setPhase("after")} />
        <div className="tile flex flex-col bg-lime">
          <div className="eyebrow">The move changes your month by</div>
          <div className="mt-3 font-display text-5xl font-bold tracking-tight">
            {delta >= 0 ? "+" : "−"}
            {formatMoney(Math.abs(delta))}
          </div>
          <div className="mt-auto pt-3 text-sm text-ink/70">
            {maxRent ? (
              <>
                Max housing at 30% of gross: <b>{formatMoney(maxRent)}/mo</b>
                {signed ? ` · your new place is ${formatMoney(apartmentCosts(signed).monthly)}` : ""}
              </>
            ) : (
              "Add income to see the rent you can afford."
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card id="bills-list" title="Bills & income" icon="🧾" summary={tab === "bills" ? `${formatMoney(flow.bills)}/mo` : `${formatMoney(flow.incomeNet)}/mo`} bodyClassName="mt-3">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-full bg-gray-100 p-1">
              {(
                [
                  ["bills", `Bills · ${db.bills.length}`],
                  ["income", `Income · ${db.incomes.length}`],
                ] as const
              ).map(([v, l]) => (
                <button key={v} onClick={() => setTab(v)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === v ? "bg-ink text-white" : "text-gray-600"}`}>
                  {l}
                </button>
              ))}
            </div>
            <span className="text-sm text-gray-500">{tab === "bills" ? `${formatMoney(flow.bills)}/mo ${phase === "now" ? "today" : "after moving"}` : `${formatMoney(flow.incomeNet)}/mo take-home`}</span>
            {!sel.active && <SelectBar sel={sel} noun={noun} />}
          </div>
          {sel.active && <SelectBar sel={sel} noun={noun} className="mb-3" />}
          {tab === "bills" ? (
            bills.length ? (
              <ul className="space-y-2">
                {subs.count > 0 && (
                  <li>
                    <Link href="/subscriptions" className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-gray-300 p-3 text-left transition hover:shadow-md">
                      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl text-lg text-white" style={{ background: CAT_COLORS.subscriptions }}>
                        🔁
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">Subscriptions</span>
                        <span className="block truncate text-xs text-gray-500">
                          {subs.count} active{subs.toConfirm ? ` · ${subs.toConfirm} to confirm` : ""} · {formatMoney(subs.yearly)}/yr
                        </span>
                      </span>
                      <span className="text-right">
                        <b className="block font-display">{formatMoney(subs.monthly)}</b>
                        <span className="text-[11px] text-gray-400">/mo ›</span>
                      </span>
                    </Link>
                  </li>
                )}
                {bills.map((b) => {
                  const m = monthlyAmount(b.amount, b.frequency);
                  const d = billDue(b, t);
                  const soon = !!d && (d.overdue || d.daysAway <= 7);
                  return (
                    <li key={b.id}>
                      <SelectableRow sel={billSel} id={b.id} actions={rowActions("bills", b.id, b.name)} label={b.name}>
                      <div className={`flex w-full items-center gap-2 rounded-2xl border bg-white p-3 transition hover:shadow-md ${d?.overdue ? "border-red-300" : "border-gray-200/80"}`}>
                      <button onClick={() => setEditing({ table: "bills", row: b })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl font-display font-bold text-white" style={{ background: CAT_COLORS[b.category] ?? "#78716c" }}>
                          {b.name.slice(0, 1).toUpperCase() || "?"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-semibold">{b.name}</span>
                            {d && soon && <span className={`chip shrink-0 ${d.overdue ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{dueLabel(d)}</span>}
                          </span>
                          <span className="block truncate text-xs text-gray-500">
                            {optionLabel(BILL_CATEGORIES, b.category)}
                            {d ? ` · due ${formatDate(d.date, { month: "short", day: "numeric" })}` : ""}
                            {b.autopay ? " · autopay" : ""}
                            {b.account ? ` · ${b.account}` : ""}
                            {memberName(b.payer_id) ? ` · ${memberName(b.payer_id)}` : ""}
                          </span>
                        </span>
                        <span className={`hidden rounded-full px-2 py-0.5 text-[11px] font-semibold sm:inline ${STATUS_STYLE[b.status] ?? ""}`}>{optionLabel(BILL_STATUSES, b.status)}</span>
                        <span className="text-right">
                          <b className="block font-display">{formatMoney(m)}</b>
                          <span className="text-[11px] text-gray-400">{b.frequency === "monthly" ? "/mo" : `${formatMoney(b.amount)} ${optionLabel(FREQUENCIES, b.frequency).toLowerCase()}`}</span>
                        </span>
                      </button>
                      {d && soon && !b.autopay && (
                        <button type="button" className="min-h-10 shrink-0 rounded-xl bg-ink px-3 text-xs font-semibold text-white active:opacity-70" onClick={() => pay(b)}>
                          Paid
                        </button>
                      )}
                      </div>
                      </SelectableRow>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="py-10 text-center">
                <div className="font-display text-2xl font-bold">No bills yet</div>
                <p className="mt-1 text-sm text-gray-500">Add rent, utilities, phone, insurance, car payments, subscriptions… mark which ones transfer, cancel or start after the move.</p>
                <button className="btn-primary mt-4" onClick={() => setEditing({ table: "bills", row: null })}>
                  + Add your first bill
                </button>
              </div>
            )
          ) : incomes.length ? (
            <ul className="space-y-2">
              {incomes.map((i) => {
                const m = incomeMonthly(i);
                return (
                  <li key={i.id}>
                    <SelectableRow sel={incSel} id={i.id} actions={rowActions("incomes", i.id, i.source)} label={i.source}>
                    <button onClick={() => setEditing({ table: "incomes", row: i })} className="flex w-full items-center gap-3 rounded-2xl border border-gray-200/80 bg-white p-3 text-left transition hover:shadow-md">
                      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-sage font-display font-bold">$</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{i.source}</span>
                        <span className="block truncate text-xs text-gray-500">
                          {optionLabel(INCOME_KINDS, i.kind)}
                          {memberName(i.member_id) ? ` · ${memberName(i.member_id)}` : ""} · {i.basis === "gross" ? "before tax" : "take-home"}
                        </span>
                      </span>
                      <span className={`hidden rounded-full px-2 py-0.5 text-[11px] font-semibold sm:inline ${STATUS_STYLE[i.status] ?? ""}`}>{optionLabel(INCOME_STATUSES, i.status)}</span>
                      <span className="text-right">
                        <b className="block font-display">{formatMoney(m.net)}</b>
                        <span className="text-[11px] text-gray-400">/mo take-home</span>
                      </span>
                    </button>
                    </SelectableRow>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="py-10 text-center">
              <div className="font-display text-2xl font-bold">No income yet</div>
              <p className="mt-1 text-sm text-gray-500">Add each paycheck or income source — salary or hourly, before or after tax. Mark a new job that starts after the move.</p>
              <button className="btn-primary mt-4" onClick={() => setEditing({ table: "incomes", row: null })}>
                + Add income
              </button>
            </div>
          )}
          {tab === "bills" ? (
            <SelectActions sel={billSel} noun="bill">
              <div className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
                <button type="button" className={BULK_PRIMARY} onClick={bulkPaid}>
                  ✓ Mark paid
                </button>
                <select className={BULK_BTN} aria-label="Set after-the-move status" value="" onChange={(e) => e.target.value && billUpdate({ status: e.target.value as Bill["status"] }, `After the move: ${optionLabel(BILL_STATUSES, e.target.value)}`)}>
                  <option value="">After the move…</option>
                  {BILL_STATUSES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select className={BULK_BTN} aria-label="Set category" value="" onChange={(e) => e.target.value && billUpdate({ category: e.target.value as Bill["category"] }, `Category: ${optionLabel(BILL_CATEGORIES, e.target.value)}`)}>
                  <option value="">Category…</option>
                  {BILL_CATEGORIES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select className={BULK_BTN} aria-label="Set autopay" value="" onChange={(e) => e.target.value && billUpdate({ autopay: e.target.value === "on" }, e.target.value === "on" ? "Autopay on" : "Autopay off")}>
                  <option value="">Autopay…</option>
                  <option value="on">On autopay</option>
                  <option value="off">Not on autopay</option>
                </select>
                <button type="button" className={BULK_BTN} onClick={billHide}>
                  🙈 Hide
                </button>
                <button
                  type="button"
                  className={BULK_BTN}
                  onClick={() => {
                    move.toSubscriptions(bills.filter((b) => billSel.has(b.id)));
                    billSel.done();
                  }}
                >
                  🔁 Move to Subscriptions
                </button>
                <button type="button" className={BULK_DANGER} onClick={billDelete}>
                  🗑 Delete
                </button>
              </div>
            </SelectActions>
          ) : (
            <SelectActions sel={incSel} noun="income">
              <div className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
                <select className={BULK_BTN} aria-label="Set status around the move" value="" onChange={(e) => e.target.value && incUpdate({ status: e.target.value as Income["status"] }, `Around the move: ${optionLabel(INCOME_STATUSES, e.target.value)}`)}>
                  <option value="">Around the move…</option>
                  {INCOME_STATUSES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select className={BULK_BTN} aria-label="Set type" value="" onChange={(e) => e.target.value && incUpdate({ kind: e.target.value as Income["kind"] }, `Type: ${optionLabel(INCOME_KINDS, e.target.value)}`)}>
                  <option value="">Type…</option>
                  {INCOME_KINDS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button type="button" className={BULK_BTN} onClick={incHide}>
                  🙈 Hide
                </button>
                <button type="button" className={BULK_DANGER} onClick={incDelete}>
                  🗑 Delete
                </button>
              </div>
            </SelectActions>
          )}
        </Card>

        <aside className="space-y-4">
          <InboxConnect id="bills.inbox" />
          <Card id="bills.due" title="Due in the next 30 days" icon="📅" summary={overdue.length ? `${overdue.length} overdue` : due.length ? `${due.length} bills` : undefined}>
            {due.length ? (
              <ul className="space-y-2">
                {due.slice(0, 10).map(({ bill, d }) => (
                  <li key={bill.id}>
                    <SwipeRow actions={rowActions("bills", bill.id, bill.name)} label={bill.name} radius="rounded-xl">
                    <div className="flex items-center gap-3 rounded-xl bg-white">
                    <span className={`flex h-11 w-11 flex-none flex-col items-center justify-center rounded-xl ${d.overdue ? "bg-red-100 text-red-700" : "bg-gray-100"}`}>
                      <span className="text-[9px] uppercase opacity-70">{formatDate(d.date, { month: "short" })}</span>
                      <span className="font-display text-lg leading-none font-bold">{Number(d.date.slice(8))}</span>
                    </span>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing({ table: "bills", row: bill })}>
                      <span className="block truncate text-sm font-semibold">{bill.name}</span>
                      <span className={`block text-xs ${d.overdue ? "font-semibold text-red-600" : d.daysAway <= 3 ? "font-semibold text-accent" : "text-gray-400"}`}>
                        {formatMoney(bill.amount)} · {dueLabel(d)}
                        {bill.autopay ? " · autopay" : ""}
                      </span>
                    </button>
                    {!bill.autopay && (
                      <button type="button" className="min-h-10 shrink-0 rounded-xl bg-ink/5 px-3 text-xs font-semibold active:opacity-60" onClick={() => pay(bill)}>
                        Paid ✓
                      </button>
                    )}
                    </div>
                    </SwipeRow>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">Add a due date to bills to see them here and on the calendar. “Paid ✓” moves each one to its next due date.</p>
            )}
          </Card>
          <Card id="bills.split" title={`Where it goes · ${phase === "now" ? "today" : "after"}`} icon="📊" summary={`${formatMoney(flow.bills)}/mo`}>
            {flow.byCategory.length ? (
              <>
                <div className="flex h-4 overflow-hidden rounded-full">
                  {flow.byCategory.map((c) => (
                    <div key={c.category} title={c.category} style={{ width: `${(c.monthly / flow.bills) * 100}%`, background: CAT_COLORS[c.category] ?? "#78716c" }} />
                  ))}
                </div>
                <ul className="mt-4 space-y-2 text-sm">
                  {flow.byCategory.map((c) => (
                    <li key={c.category} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: CAT_COLORS[c.category] ?? "#78716c" }} />
                      <span className="flex-1 truncate">{c.category === "subscriptions" ? <Link href="/subscriptions" className="underline">Subscriptions</Link> : optionLabel(BILL_CATEGORIES, c.category)}</span>
                      <b>{formatMoney(c.monthly)}</b>
                      <span className="w-10 text-right text-xs text-gray-400">{Math.round((c.monthly / flow.bills) * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-gray-400">Your spending breakdown appears here.</p>
            )}
          </Card>
          <Card id="bills.moving" title="Moving checklist for bills" tone="card-ink">
            <ul className="space-y-2 text-sm text-white/80">
              <li>• {db.bills.filter((b) => b.status === "cancel_before_move").length} to cancel before you leave</li>
              <li>• {db.bills.filter((b) => b.status === "transfer").length} to transfer to the new address</li>
              <li>• {db.bills.filter((b) => b.status === "new_after_move").length} new bills to set up after</li>
              <li>• {db.bills.filter((b) => b.autopay).length} on autopay — update the billing address</li>
              {subs.count > 0 && (
                <li>
                  •{" "}
                  <Link href="/subscriptions" className="underline">
                    {subs.count} subscriptions
                  </Link>{" "}
                  — update the card/address, cancel local ones (gym!)
                </li>
              )}
            </ul>
          </Card>
        </aside>
      </div>

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing ? (editing.row ? (editing.table === "bills" ? editing.row.name : editing.row.source) : editing.table === "bills" ? "New bill" : "New income") : ""}>
        {editing?.table === "bills" && editing.row && (
          <div className="mb-4">
            <EmailSource notes={editing.row.notes} />
          </div>
        )}
        {editing?.table === "bills" && <EntityForm key={editing.row?.id ?? "new-bill"} table="bills" row={editing.row}         onDone={() => setEditing(null)} />}
        {editing?.table === "bills" && editing.row && (
          <button
            type="button"
            className="btn-secondary mt-4 w-full"
            onClick={() => {
              const row = editing.row as Bill;
              setEditing(null);
              move.toSubscriptions([row]);
            }}
          >
            🔁 This is a subscription — move to Subscriptions
          </button>
        )}
        {editing?.table === "incomes" && <EntityForm key={editing.row?.id ?? "new-income"} table="incomes" row={editing.row} onDone={() => setEditing(null)} />}
      </Drawer>
      <MoneyImport open={importing} onClose={() => setImporting(false)} focus="bills" />
    </div>
  );
}
