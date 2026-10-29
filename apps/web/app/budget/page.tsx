"use client";

import { Card } from "@/components/Swipe";
import {
  EXPENSE_CATEGORIES,
  FUND_KINDS,
  formatDate,
  formatMoney,
  fundRule,
  fundTax,
  fundingSummary,
  optionLabel,
  SALES_TO_BUDGET,
  salesForBudget,
  salesProceeds,
  suggestBudgetLines,
  sum,
  type Fund,
  type FundTax,
  type SalesToBudget,
} from "@moving/shared";
import { useState } from "react";
import { CrudPage } from "@/components/CrudPage";
import { EntityForm } from "@/components/EntityForm";
import { Drawer, Progress, Segmented, Stat } from "@/components/ui";
import { useDb, useStore } from "@/lib/store-context";

const QUICK_FUNDS: { kind: string; source: string }[] = [
  { kind: "relocation_stipend", source: "Relocation stipend" },
  { kind: "retirement_401k", source: "401k withdrawal" },
  { kind: "savings", source: "Savings" },
  { kind: "settlement", source: "Settlement money" },
  { kind: "signing_bonus", source: "Signing bonus" },
  { kind: "deposit_refund", source: "Security deposit refund" },
];

const shortTaxLabel = (label: string) =>
  label.startsWith("Federal withholding") ? "federal 20%" : label.startsWith("Federal") ? "federal 22%" : label.startsWith("10%") ? "penalty (at filing)" : label.replace(" state tax", "").replace("State tax", "state").replace("Social Security", "Soc. Sec.");

function TaxChips({ tax }: { tax: FundTax }) {
  return (
    <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">
      {tax.lines.map((l, i) => (
        <span key={l.label}>
          {i > 0 && " · "}
          {l.amount ? `−${formatMoney(l.amount)}` : "$0"} {shortTaxLabel(l.label)}
        </span>
      ))}
    </span>
  );
}

function TaxBreakdown({ tax, kind }: { tax: FundTax; kind: string }) {
  const pct = (r: number) => `${(r * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
  const wages = fundRule(kind).tax === "wages";
  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="eyebrow">How the take-home is figured</div>
        <span className="chip bg-ink/5 text-[11px]">{tax.summary}</span>
      </div>
      <table className="mt-3 w-full text-sm">
        <tbody className="divide-y divide-ink/5">
          <tr>
            <td className="py-1.5 font-semibold">Gross amount</td>
            <td />
            <td className="py-1.5 text-right font-semibold">{formatMoney(tax.gross)}</td>
          </tr>
          {tax.lines.map((l) => (
            <tr key={l.label} className="text-gray-600">
              <td className="py-1.5">
                {l.label}
                {l.when === "at_filing" && <span className="ml-1 text-[11px] text-amber-700">owed at tax time</span>}
                {l.estimated && l.rate > 0 && <span className="ml-1 text-[11px] text-gray-400">est.</span>}
                {l.rate === 0 && /state/i.test(l.label) && tax.state && <span className="ml-1 text-[11px] text-emerald-700">no state wage tax</span>}
              </td>
              <td className="py-1.5 text-right tabular-nums text-gray-400">{pct(l.rate)}</td>
              <td className="py-1.5 text-right tabular-nums">{l.amount ? `−${formatMoney(l.amount)}` : "$0.00"}</td>
            </tr>
          ))}
          <tr>
            <td className="py-1.5 font-semibold">Estimated deposit</td>
            <td />
            <td className="py-1.5 text-right font-semibold">{formatMoney(tax.deposit)}</td>
          </tr>
          {tax.owedLater > 0 && (
            <tr>
              <td className="py-1.5 font-semibold">Keep after penalty</td>
              <td />
              <td className="py-1.5 text-right font-semibold">{formatMoney(tax.deposit - tax.owedLater)}</td>
            </tr>
          )}
          {tax.manual && (
            <tr className="bg-lime/30">
              <td className="py-1.5 pl-1 font-semibold">Actual deposit (you entered)</td>
              <td />
              <td className="py-1.5 pr-1 text-right font-semibold">{formatMoney(tax.net)}</td>
            </tr>
          )}
        </tbody>
      </table>
      {wages && (
        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          Payroll usually withholds supplemental pay (stipends, bonuses) at a flat 22% federal — the W-4 setting doesn&apos;t change that rate. If it&apos;s instead lumped into a regular weekly check (“aggregate method”), withholding
          for that one check can come out higher. Either way this is just <em>withholding</em>; the real tax is settled when you file. Social Security (6.2%) and Medicare (1.45%) always apply. Once the check lands, type the actual
          amount in “Actual deposit” to replace this estimate.
        </p>
      )}
    </div>
  );
}

const SALES_MODE_SHORT: Record<SalesToBudget, string> = { sold: "Sold only", pending: "+ Pending", listed: "+ Listed (projected)", none: "Keep separate" };

function SalesTowardMove() {
  const db = useDb();
  const store = useStore();
  const move = db.moves[0];
  const mode: SalesToBudget = move?.sales_to_budget ?? "sold";
  const p = salesProceeds(db);
  const counted = salesForBudget(p, mode);
  const stages: { key: keyof typeof p.counts; label: string; tone: string; on: boolean }[] = [
    { key: "sold", label: "Sold", tone: "bg-sage", on: mode !== "none" },
    { key: "pending", label: "Pending", tone: "bg-lime/60", on: mode === "pending" || mode === "listed" },
    { key: "listed", label: "Listed", tone: "bg-sand", on: mode === "listed" },
    { key: "unlisted", label: "Not listed yet", tone: "bg-ink/5", on: mode === "listed" },
  ];
  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">💰 Sales toward the move</div>
          <div className="mt-1 font-display text-3xl font-bold tracking-tight">{formatMoney(counted)}</div>
          <p className="text-xs text-gray-500">{optionLabel(SALES_TO_BUDGET, mode)} — counted in “available to spend” above.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <a className="btn-ghost" href="/sell">
            🏷️ Sell & donate →
          </a>
          <a className="btn-ghost" href="/books">
            📚 Books →
          </a>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {stages.map((s) => (
          <div key={s.key} className={`rounded-2xl p-3 ${s.tone} ${s.on ? "ring-2 ring-ink/70" : "opacity-70"}`}>
            <div className="eyebrow text-ink/60">{s.label}</div>
            <div className="mt-1 font-display text-xl font-bold">{formatMoney(p[s.key])}</div>
            <div className="text-[11px] text-ink/60">
              {p.counts[s.key]} {p.counts[s.key] === 1 ? "sale" : "sales"}
              {s.on ? " · counted" : ""}
            </div>
          </div>
        ))}
      </div>
      {move && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">Count toward the budget:</span>
          <Segmented<SalesToBudget>
            value={mode}
            onChange={(v) => store.update("moves", move.id, { sales_to_budget: v })}
            options={SALES_TO_BUDGET.map((o) => ({ value: o.value as SalesToBudget, label: SALES_MODE_SHORT[o.value as SalesToBudget] ?? o.label }))}
          />
        </div>
      )}
    </div>
  );
}

function Funding() {
  const db = useDb();
  const [editing, setEditing] = useState<Fund | Partial<Fund> | null>(null);
  const funds = db.funds ?? [];
  const soldValue = salesForBudget(salesProceeds(db), db.moves[0]?.sales_to_budget ?? "sold");
  const taxState = db.moves[0]?.to_state ?? "";
  const s = fundingSummary(funds, db.expenses, db.family_members, undefined, taxState);
  const available = s.net + soldValue;
  const need = sum(db.expenses.map((e) => Math.max(e.estimated ?? 0, e.actual ?? 0)));
  const surplus = available - need;
  const memberOf = (id: string | null) => db.family_members.find((m) => m.id === id) ?? null;
  const editingRow = editing && "id" in editing && editing.id ? (funds.find((f) => f.id === editing.id) ?? (editing as Fund)) : null;

  return (
    <section className="mb-6 space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="card-ink relative overflow-hidden p-6">
          <div className="eyebrow text-white/50">Moving money</div>
          <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <div className="font-display text-5xl leading-none font-extrabold tracking-[-0.05em] text-lime">{formatMoney(available)}</div>
              <div className="mt-1 text-sm text-white/60">available to spend{soldValue ? ` · incl. ${formatMoney(soldValue)} from sales` : ""}</div>
            </div>
            <div className="pb-1">
              <div className={`font-display text-2xl font-bold ${surplus >= 0 ? "text-lime" : "text-red-300"}`}>
                {surplus >= 0 ? "+" : "−"}
                {formatMoney(Math.abs(surplus))}
              </div>
              <div className="text-xs text-white/60">{surplus >= 0 ? "left over after the budget" : "shortfall vs. budget"}</div>
            </div>
          </div>
          <div className="mt-5">
            <div className="h-3 overflow-hidden rounded-full bg-white/10">
              <div className={`h-full rounded-full ${surplus >= 0 ? "bg-lime" : "bg-red-400"}`} style={{ width: `${need ? Math.min(100, (available / need) * 100) : available ? 100 : 0}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-white/60">
              <span>{!need ? "Add expenses to compare" : available >= need ? `Funds cover the whole ${formatMoney(need)} budget` : `Funds cover ${Math.round((available / need) * 100)}% of ${formatMoney(need)} budget`}</span>
              <span>
                {formatMoney(s.received)} received · {formatMoney(s.pending)} pending
              </span>
            </div>
          </div>
          {s.byKind.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {s.byKind.map((k) => (
                <span key={k.kind} className="chip bg-white/10 text-white/85">
                  {fundRule(k.kind).icon} {optionLabel(FUND_KINDS, k.kind)} {formatMoney(k.net)}
                </span>
              ))}
            </div>
          )}
        </div>
        <Card id="budget.funding" title="Funding sources" right={<button className="btn-primary" onClick={() => setEditing({ kind: "savings" })}>+ Add funds</button>}>
          <p className="mt-1 text-xs text-gray-500">Where the moving money comes from. Tap a quick-add, then attach the PDF paperwork.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {QUICK_FUNDS.map((q) => (
              <button key={q.kind} className="chip bg-ink/5 hover:bg-lime" onClick={() => setEditing({ kind: q.kind, source: q.source })}>
                {fundRule(q.kind).icon} {q.source}
              </button>
            ))}
          </div>
          <ul className="mt-4 divide-y divide-ink/5">
            {funds.length === 0 && <li className="py-6 text-center text-sm text-gray-400">No funding sources yet.</li>}
            {funds.map((f) => {
              const tax = fundTax(f, { member: memberOf(f.member_id), state: taxState });
              const net = tax.net;
              return (
                <li key={f.id}>
                  <button className="flex w-full items-center gap-3 py-2.5 text-left" onClick={() => setEditing(f)}>
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-sand text-lg">{fundRule(f.kind).icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{f.source}</span>
                      <span className="block truncate text-xs text-gray-500">
                        {f.source !== optionLabel(FUND_KINDS, f.kind) ? optionLabel(FUND_KINDS, f.kind) : f.received ? "In hand" : "Not received yet"}
                        {f.expected_date ? ` · ${f.received ? "received" : "expected"} ${formatDate(f.expected_date)}` : ""}
                        {(f.files ?? []).length ? ` · 📎${f.files.length}` : ""}
                      </span>
                      {tax.manual ? (
                        f.amount != null && f.amount !== net && <span className="block text-[11px] text-gray-500">Actual deposit · {formatMoney(f.amount - net)} came out</span>
                      ) : (
                        tax.lines.length > 0 && <TaxChips tax={tax} />
                      )}
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold">{formatMoney(net)}</span>
                      {f.amount != null && net !== f.amount && <span className="block text-[11px] text-gray-400">of {formatMoney(f.amount)} gross</span>}
                    </span>
                    <span className={`chip ${f.received ? "bg-sage text-ink" : "bg-ink/5 text-gray-600"}`}>{f.received ? "In hand" : "Pending"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
      <SalesTowardMove />
      <Drawer open={!!editing} onClose={() => setEditing(null)} title={editingRow ? editingRow.source : "Add funding source"}>
        {editing && (
          <div className="space-y-4">
            {editingRow && editingRow.amount != null && fundRule(editingRow.kind).tax !== "none" && (
              <TaxBreakdown tax={fundTax(editingRow, { member: memberOf(editingRow.member_id), state: taxState })} kind={editingRow.kind} />
            )}
            {fundRule(editing.kind ?? "other").note && (
              <p className="rounded-xl bg-sand/70 p-3 text-sm text-ink/80">
                {fundRule(editing.kind ?? "other").icon} {fundRule(editing.kind ?? "other").note}
              </p>
            )}
            <EntityForm
              key={editingRow?.id ?? `new-${editing.kind}`}
              table="funds"
              row={editingRow}
              initial={editingRow ? undefined : editing}
              submitLabel={editingRow ? "Save" : "Add funding source"}
              onDone={() => setEditing(null)}
            />
          </div>
        )}
      </Drawer>
    </section>
  );
}

function Summary() {
  const db = useDb();
  const store = useStore();
  const est = sum(db.expenses.map((e) => e.estimated));
  const act = sum(db.expenses.map((e) => e.actual));
  const paid = sum(db.expenses.filter((e) => e.paid).map((e) => e.actual));
  const accepted = db.quotes.find((q) => q.status === "accepted");
  const move = db.moves[0];
  const byCat = EXPENSE_CATEGORIES.map((c) => {
    const rows = db.expenses.filter((e) => e.category === c.value);
    return { ...c, est: sum(rows.map((r) => r.estimated)), act: sum(rows.map((r) => r.actual)) };
  }).filter((c) => c.est || c.act);
  const max = Math.max(1, ...byCat.map((c) => Math.max(c.est, c.act)));
  const addStarter = () => {
    const lines = suggestBudgetLines({
      miles: move?.distance_miles ?? null,
      people: Math.max(1, db.family_members.length),
      vehicles: Math.max(1, db.family_members.filter((m) => m.drives).length),
      pets: db.pets.length,
      method: move?.moving_method,
      moverQuote: accepted?.price ?? null,
      renting: move?.to_tenure !== "own",
    });
    const inserts: typeof lines = [];
    for (const l of lines) {
      const same = db.expenses.filter((e) => e.category === l.category);
      const blank = same.find((e) => e.estimated == null && e.actual == null);
      if (blank && l.estimated != null) store.update("expenses", blank.id, { estimated: l.estimated, notes: blank.notes || l.notes });
      else if (!same.length) inserts.push(l);
    }
    if (inserts.length) store.insertMany("expenses", inserts);
  };
  return (
    <div className="mb-5 space-y-4">
      <Funding />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Budgeted" icon="📝" value={formatMoney(est)} />
        <Stat label="Actual so far" icon="💳" value={<span className={act > est && est ? "text-red-600" : ""}>{formatMoney(act)}</span>} sub={est ? `${Math.round((act / est) * 100)}% of budget` : undefined} />
        <Stat label="Paid" icon="✅" value={formatMoney(paid)} sub={`${formatMoney(act - paid)} still owed`} />
        <Stat label="Distance" icon="🛣️" value={move?.distance_miles ? `${move.distance_miles.toLocaleString()} mi` : "—"} sub="driving miles between your ZIPs" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-lime/50 p-4">
        <div className="text-sm">
          {db.expenses.length < 4 ? (
            <>
              <b>Adding your budget:</b> use <b>“+ Add expense”</b> for each cost, or start from a typical long-distance budget sized to your{" "}
              {move?.distance_miles ? `${move.distance_miles.toLocaleString()}-mile ` : ""}move.
            </>
          ) : (
            <>Fill gaps with typical costs for a {move?.distance_miles ? `${move.distance_miles.toLocaleString()}-mile ` : ""}move (fuel, hotels, meals, deposits…). Fills blank lines and adds missing categories.</>
          )}
        </div>
        <button className="btn-primary" onClick={addStarter}>
          ✨ Add starter budget
        </button>
      </div>
      {accepted && (
        <p className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">
          🚛 Chosen mover <b>{accepted.company}</b> quoted {formatMoney(accepted.price)}
          {accepted.deposit ? ` (deposit ${formatMoney(accepted.deposit)})` : ""}. Make sure it&apos;s reflected in the Movers line.
        </p>
      )}
      {byCat.length > 0 && (
        <Card id="budget.categories" title="By category" bodyClassName="mt-3">
          <div className="space-y-2">
            {byCat.map((c) => (
              <div key={c.value} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[12rem_1fr_auto]">
                <span className="truncate">{optionLabel(EXPENSE_CATEGORIES, c.value)}</span>
                <div className="space-y-1">
                  <Progress value={(c.est / max) * 100} color="bg-gray-400" />
                  <Progress value={(c.act / max) * 100} color={c.act > c.est ? "bg-red-500" : "bg-indigo-600"} />
                </div>
                <span className="text-right text-xs text-gray-500">
                  {formatMoney(c.act)} / {formatMoney(c.est)}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-400">Grey = budgeted, colour = actual. Moving expenses may be tax-deductible for some (e.g. active-duty military) — keep receipts.</p>
        </Card>
      )}
    </div>
  );
}

export default function BudgetPage() {
  return (
    <CrudPage
      table="expenses"
      title="Moving budget"
      subtitle="Add where the money comes from (stipend, 401k, savings, settlement…), then each expected cost with “+ Add expense”. Track actuals and snap receipts as you go."
      top={<Summary />}
      columns={["estimated", "actual", "date", "paid_by"]}
      filters={["category"]}
      groupBy="category"
      renderBadge={(e) => (
        <span className="flex flex-none items-center gap-2 text-sm">
          {e.receipts.length > 0 && <span className="text-xs text-gray-400">🧾{e.receipts.length}</span>}
          <span className={e.actual && e.estimated && e.actual > e.estimated ? "font-semibold text-red-600" : "font-semibold"}>{formatMoney(e.actual ?? e.estimated)}</span>
          {e.paid && <span className="chip bg-green-50 text-green-700">Paid</span>}
        </span>
      )}
    />
  );
}
