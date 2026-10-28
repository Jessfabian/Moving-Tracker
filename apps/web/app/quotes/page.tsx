"use client";

import { bestQuote, formatMoney, optionLabel, quoteFlags, SCHEMAS, type MoverQuote, type QuoteFlag } from "@moving/shared";
import { useState, type ReactNode } from "react";
import { CrudPage, StatusPill } from "@/components/CrudPage";
import { PageHeader, Segmented } from "@/components/ui";
import { useDb, useStore } from "@/lib/store-context";
import { methodFor, moveEstimates, QuoteKit } from "./QuoteKit";
import { useEmailPrefs } from "./QuoteEmail";

type Tab = "get" | "compare";

const STATUS_COLORS: Record<string, string> = { requested: "#9ca3af", received: "#2563eb", accepted: "#16a34a", rejected: "#dc2626" };
const FLAG_STYLES: Record<QuoteFlag["level"], string> = { bad: "bg-red-100 text-red-800", warn: "bg-amber-100 text-amber-900", good: "bg-emerald-100 text-emerald-800" };
const FLAG_ICONS: Record<QuoteFlag["level"], string> = { bad: "⛔", warn: "⚠️", good: "✓" };
const field = (k: string) => SCHEMAS.quotes.fields.find((f) => f.key === k)!;

const SUBTITLE = (
  <>
    Size the move, send one clear request to several movers, then compare the quotes. Prefer binding or not-to-exceed estimates and always{" "}
    <a className="text-indigo-700 underline" href="https://ai.fmcsa.dot.gov/hhg/search.asp" target="_blank" rel="noreferrer">
      verify the USDOT number with FMCSA
    </a>
    .
  </>
);

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <div className="mb-5">
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "get", label: "📨 Get quotes" },
          { value: "compare", label: "⚖️ Compare" },
        ]}
      />
    </div>
  );
}

function Comparison() {
  const db = useDb();
  const store = useStore();
  const move = db.moves[0];
  const [prefs] = useEmailPrefs(db);
  const { size, estimates } = moveEstimates(db, prefs.downsizing);
  const interstate = move?.from_state && move?.to_state ? move.from_state !== move.to_state : undefined;
  const ctxFor = (q: MoverQuote) => ({ estimateLow: methodFor(estimates, move?.moving_method, q.includes_packing)?.low, weightLbs: size.weightLbs, interstate });
  const quotes = db.quotes.filter((q) => !q.deleted && q.status !== "rejected").sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  if (!quotes.length) return null;
  const lowest = quotes.find((q) => q.price)?.id;
  const best = bestQuote(quotes, { weightLbs: size.weightLbs, interstate, estimateLow: methodFor(estimates, move?.moving_method, true)?.low });
  const flagsOf = new Map(quotes.map((q) => [q.id, quoteFlags(q, ctxFor(q))]));
  const accept = (q: MoverQuote) => {
    for (const o of db.quotes) if (o.id !== q.id && o.status === "accepted") store.update("quotes", o.id, { status: "received" });
    store.update("quotes", q.id, { status: "accepted" });
    if (q.price != null) {
      const line = db.expenses.find((e) => !e.deleted && e.category === "movers" && !e.paid) ?? db.expenses.find((e) => !e.deleted && e.category === "movers");
      const notes = `Chosen mover: ${q.company}`;
      if (line) store.update("expenses", line.id, { estimated: q.price, notes: line.notes?.includes(notes) ? line.notes : [line.notes, notes].filter(Boolean).join("\n") });
      else store.insert("expenses", { title: `Movers — ${q.company}`, category: "movers", estimated: q.price, notes });
    }
  };
  const rows: [string, (q: MoverQuote) => ReactNode][] = [
    ["Price", (q) => <span className={q.id === lowest ? "font-bold text-green-700" : "font-semibold"}>{formatMoney(q.price)}</span>],
    [
      "Flags",
      (q) => (
        <div className="flex max-w-[16rem] flex-wrap gap-1">
          {(flagsOf.get(q.id) ?? []).map((f) => (
            <span key={f.text} title={f.text} className={`chip text-[11px] leading-snug ${FLAG_STYLES[f.level]}`}>
              {FLAG_ICONS[f.level]} {f.text.split(" — ")[0]}
            </span>
          ))}
        </div>
      ),
    ],
    ["Estimate type", (q) => optionLabel(field("quote_type").options, q.quote_type)],
    ["Deposit", (q) => formatMoney(q.deposit)],
    ["Est. weight", (q) => (q.estimated_weight_lbs ? `${q.estimated_weight_lbs.toLocaleString()} lbs` : "—")],
    ["Price / lb", (q) => (q.price && q.estimated_weight_lbs ? `$${(q.price / q.estimated_weight_lbs).toFixed(2)}` : "—")],
    ["Valuation", (q) => optionLabel(field("valuation").options, q.valuation)],
    ["Coverage", (q) => formatMoney(q.coverage_amount)],
    ["Packing", (q) => (q.includes_packing ? "✅" : "—")],
    ["Storage", (q) => (q.includes_storage ? "✅" : "—")],
    ["Survey", (q) => optionLabel(field("survey_type").options, q.survey_type)],
    ["Pickup", (q) => q.pickup_window || "—"],
    ["Delivery", (q) => q.delivery_window || "—"],
    [
      "USDOT",
      (q) =>
        q.usdot ? (
          <a className="text-indigo-700 underline" target="_blank" rel="noreferrer" href={`https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${encodeURIComponent(q.usdot)}`}>
            {q.usdot} ↗
          </a>
        ) : (
          <span className="text-red-600">missing</span>
        ),
    ],
    ["Rating", (q) => (q.rating ? "★".repeat(q.rating) : "—")],
  ];
  return (
    <div className="card mb-5 overflow-x-auto p-0">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="sticky left-0 bg-gray-50 p-3 text-left text-xs uppercase text-gray-500">Compare</th>
            {quotes.map((q) => (
              <th key={q.id} className="p-3 text-left align-top">
                <div className="font-bold">{q.company}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <StatusPill value={q.status} options={field("status").options} color={STATUS_COLORS[q.status]} />
                  {q.id === best && <span className="chip bg-lime text-ink">🏆 Best value</span>}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, fn]) => (
            <tr key={label} className="border-b border-gray-100">
              <td className="sticky left-0 bg-white p-3 text-xs font-semibold text-gray-500">{label}</td>
              {quotes.map((q) => (
                <td key={q.id} className="p-3 align-top">
                  {fn(q)}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td className="sticky left-0 bg-white p-3" />
            {quotes.map((q) => (
              <td key={q.id} className="p-3">
                {q.status !== "accepted" ? (
                  <button className="btn-secondary px-2 py-1 text-xs" onClick={() => accept(q)} title="Marks this quote accepted and sets the Movers budget line to its price">
                    Choose this mover
                  </button>
                ) : (
                  <a className="text-xs text-indigo-700 underline" href="/budget">
                    In the budget →
                  </a>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function QuotesPage() {
  const db = useDb();
  const [tab, setTab] = useState<Tab>(() => (db.quotes.some((q) => !q.deleted && q.price != null) ? "compare" : "get"));

  if (tab === "get")
    return (
      <div>
        <PageHeader title={SCHEMAS.quotes.plural} icon={SCHEMAS.quotes.icon} subtitle={SUBTITLE} />
        <Tabs tab={tab} setTab={setTab} />
        <QuoteKit onCompare={() => setTab("compare")} />
      </div>
    );

  return (
    <CrudPage
      table="quotes"
      subtitle={SUBTITLE}
      drawerForm
      top={
        <>
          <Tabs tab={tab} setTab={setTab} />
          <Comparison />
        </>
      }
      columns={["price", "quote_type", "pickup_window", "rating"]}
      filters={["status"]}
      sort={(a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)}
      renderBadge={(q) => <StatusPill value={q.status} options={field("status").options} color={STATUS_COLORS[q.status]} />}
      emptyText="Add each moving company's estimate to compare prices, coverage and delivery windows side-by-side — or use “Get quotes” to request them."
    />
  );
}