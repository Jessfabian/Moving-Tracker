"use client";

import { formatMoney, type LivePriceResult } from "@moving/shared";
import { useState } from "react";
import { cachedLivePrices, fetchLivePrices, livePriceKey } from "@/lib/livePrices";

export interface LivePriceAction {
  label: string;
  onClick: () => void;
}

interface Props {
  isbn?: string;
  query?: string;
  kind: "book" | "item";
  /** Buttons to offer once prices are in (e.g. "Use $12 as resale value"). */
  actions?: (r: LivePriceResult) => LivePriceAction[];
  className?: string;
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} hr ago`;
};

/** "💲 Live prices" — real listings from stores right now, with a suggested value. Free, no API key. */
export function LivePrices(props: Props) {
  const key = livePriceKey(props);
  return <LivePricesInner key={key} {...props} />;
}

function LivePricesInner({ isbn, query, kind, actions, className = "" }: Props) {
  const key = livePriceKey({ isbn, query });
  const [result, setResult] = useState<LivePriceResult | null>(() => (typeof window === "undefined" ? null : cachedLivePrices(key)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const canRun = !!isbn || (query ?? "").trim().length >= 3;

  const run = async (force = false) => {
    setBusy(true);
    setErr(null);
    try {
      setResult(await fetchLivePrices({ isbn, query }, force));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t reach the stores.");
    } finally {
      setBusy(false);
    }
  };

  if (!canRun) return null;
  if (!result) {
    return (
      <div className={className}>
        <button type="button" className="btn-secondary min-h-11 w-full text-sm" disabled={busy} onClick={() => void run()}>
          {busy ? "Checking stores…" : kind === "book" ? "💲 Check live prices (AbeBooks, ThriftBooks, Valore)" : "💲 Check live prices (Walmart, Bing Shopping)"}
        </button>
        {err && <p className="mt-1 text-xs text-rose-600">{err}</p>}
      </div>
    );
  }

  const s = result.summary;
  const tiles: [string, number | null][] =
    kind === "book"
      ? [
          ["Lowest used", s.usedLow],
          ["Typical used", s.usedMedian],
          ["Suggested", s.suggested],
        ]
      : [
          ["Lowest new", s.newLow],
          ["Typical new", s.newMedian],
          ["Used / refurb", s.usedLow],
        ];
  const list = showAll ? result.offers : result.offers.slice(0, 5);
  const btns = s.count > 0 && actions ? actions(result) : [];

  return (
    <div className={`rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3 text-sm ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold">💲 Live prices</span>
        <span className="flex items-center gap-2 text-[11px] text-slate-500">
          {ago(result.checkedAt)}
          <button type="button" className="min-h-8 rounded-full bg-white px-2.5 font-semibold text-emerald-700 ring-1 ring-emerald-200" disabled={busy} onClick={() => void run(true)}>
            {busy ? "…" : "↻ Refresh"}
          </button>
        </span>
      </div>
      {s.count === 0 ? (
        <p className="mt-1 text-[13px] text-slate-600">
          {kind === "book" ? "No copies of this ISBN for sale at these stores right now." : "No matching store listings — try a more specific name (brand + model)."}
        </p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {tiles.map(([label, v]) => (
              <div key={label} className="min-w-0 rounded-xl bg-white px-2 py-1.5 text-center ring-1 ring-emerald-100">
                <div className="text-[10px] leading-tight font-semibold text-slate-500 uppercase">{label}</div>
                <div className={`truncate font-bold ${label === "Suggested" ? "text-emerald-700" : ""}`}>{v != null ? formatMoney(v) : "—"}</div>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] leading-snug text-slate-600">{s.basis}</p>
          {btns.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {btns.map((b) => (
                <button key={b.label} type="button" className="min-h-9 rounded-full bg-emerald-600 px-3 text-[12px] font-semibold text-white" onClick={b.onClick}>
                  {b.label}
                </button>
              ))}
            </div>
          )}
          <ul className="mt-2 divide-y divide-emerald-100 overflow-hidden rounded-xl bg-white text-[12px] ring-1 ring-emerald-100">
            {list.map((o, i) => (
              <li key={`${o.link}-${i}`}>
                <a href={o.link} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{kind === "book" ? `${o.condition}` : o.title}</span>
                    <span className="block truncate text-slate-500">
                      {o.source}
                      {o.seller ? ` · ${o.seller}` : ""}
                      {kind === "item" ? ` · ${o.condition}` : ""}
                    </span>
                  </span>
                  <b className="flex-none">{formatMoney(o.price)}</b>
                  <span className="flex-none text-indigo-600">↗</span>
                </a>
              </li>
            ))}
          </ul>
          {result.offers.length > 5 && (
            <button type="button" className="mt-1 min-h-9 text-[12px] font-semibold text-emerald-700" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show fewer" : `See all ${result.offers.length} listings`}
            </button>
          )}
        </>
      )}
      <p className="mt-1 text-[11px] text-slate-400">
        Checked {result.sources.map((x) => `${x.name}${x.ok ? ` (${x.count})` : " (no answer)"}`).join(" · ")}
        {kind === "book" ? " · prices before shipping" : ""}
      </p>
      {err && <p className="mt-1 text-xs text-rose-600">{err}</p>}
    </div>
  );
}
