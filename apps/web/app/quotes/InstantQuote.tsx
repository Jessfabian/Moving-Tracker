"use client";

import {
  NGM_PROVIDER,
  buildInstantQuoteRequest,
  fetchInstantQuote,
  formatMoney,
  instantQuoteToRow,
  type InstantQuote,
  type InstantQuoteOptions,
  type MethodEstimate,
  type MoveSize,
} from "@moving/shared";
import Link from "next/link";
import { Card } from "@/components/Swipe";
import { useState } from "react";
import { Toggle } from "@/components/ui";
import { useDb, useStore } from "@/lib/store-context";

/** One-click indicative price from a carrier with a free public quote API. Sends ZIPs, date and sizes only. */
export function InstantQuoteCard({ size, estimates }: { size: MoveSize; estimates: MethodEstimate[] }) {
  const db = useDb();
  const store = useStore();
  const move = db.moves[0];
  const [opts, setOpts] = useState<InstantQuoteOptions>({ useOurSize: true });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InstantQuote | { error: string } | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const set = (patch: Partial<InstantQuoteOptions>) => {
    setOpts((o) => ({ ...o, ...patch }));
    setSavedId(null);
  };

  const run = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const body = buildInstantQuoteRequest(move, size, { ...opts, today });
    if ("error" in body) return setResult(body);
    setBusy(true);
    setSavedId(null);
    try {
      setResult(await fetchInstantQuote(body));
    } catch {
      setResult({ error: "Couldn't reach the quote service — check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!result || "error" in result) return;
    const row = instantQuoteToRow(result, opts);
    const existing = db.quotes.find((q) => !q.deleted && q.company === row.company && q.quote_type === "indicative");
    if (existing) void store.update("quotes", existing.id, row);
    else void store.insert("quotes", row);
    setSavedId(String(result.total));
  };

  const ballpark = estimates.find((e) => e.method === (opts.packing ? "full_service" : "self_pack"));
  const q = result && !("error" in result) ? result : null;

  return (
    <Card id="quotes.instant" title="Get an instant online quote" bodyClassName="mt-2 grid gap-5 lg:grid-cols-[1fr_1.1fr]" summary={q ? formatMoney(Math.round(q.total)) : undefined}>
      <div>
        <div className="flex items-center gap-2">
          <span className="chip bg-lime text-ink">⚡ Instant</span>
          <span className="chip bg-ink/5 text-gray-600">free · no sign-up</span>
        </div>
        <p className="mt-2 text-sm text-gray-600">
          From <b>{NGM_PROVIDER.name}</b> (USDOT {NGM_PROVIDER.usdot}), a licensed interstate carrier that publishes its tariff pricing. It&apos;s one company&apos;s price — use it as a real-world benchmark next to the quotes you request.
        </p>
        <p className="mt-2 rounded-xl bg-sand p-2.5 text-xs text-gray-700">
          🔒 Only your ZIP codes, move date and size are sent — no names, phone numbers or e-mails, so it won&apos;t trigger sales calls.
        </p>
        <div className="ios-list mt-3 bg-gray-50 text-[15px]">
          {(
            [
              ["useOurSize", `Use our size (${size.cubicFeet.toLocaleString()} cu ft)`, opts.useOurSize !== false, `Off = their typical ${size.homeLabel.toLowerCase()}`],
              ["packing", "They pack", !!opts.packing],
              ["unpacking", "They unpack", !!opts.unpacking],
              ["guaranteedDelivery", "Guaranteed delivery date", !!opts.guaranteedDelivery],
            ] as const
          ).map(([key, label, checked, hint]) => (
            <Toggle key={key} className="px-3.5" label={label} description={hint} checked={checked} onChange={(v) => set({ [key]: v })} />
          ))}
          <label className="flex min-h-11 items-center gap-3 px-3.5 py-1.5">
            <span className="flex-1">Flights of stairs</span>
            <input className="input w-20 py-1 text-right" type="number" inputMode="numeric" min={0} max={10} value={opts.stairsFlights ?? 0} onChange={(e) => set({ stairsFlights: Number(e.target.value) || 0 })} />
          </label>
          <label className="flex min-h-11 items-center gap-3 px-3.5 py-1.5">
            <span className="flex-1">Storage (months)</span>
            <input className="input w-20 py-1 text-right" type="number" inputMode="numeric" min={0} max={24} value={opts.storageMonths ?? 0} onChange={(e) => set({ storageMonths: Number(e.target.value) || 0 })} />
          </label>
        </div>
        <button className="btn-primary mt-4" onClick={() => void run()} disabled={busy}>
          {busy ? "Pricing…" : q ? "Re-price" : "Get instant quote"}
        </button>
      </div>

      <div className="min-h-40 rounded-3xl bg-ink/[0.03] p-4">
        {!result && (
          <div className="grid h-full place-items-center text-center text-sm text-gray-500">
            <div>
              {move?.from_zip && move?.to_zip ? (
                <>
                  {move.from_zip} → {move.to_zip}
                  <br />
                  Tap “Get instant quote” to price it.
                </>
              ) : (
                <>
                  Add both ZIP codes on <Link className="underline" href="/move">Move details</Link> first.
                </>
              )}
            </div>
          </div>
        )}
        {result && "error" in result && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{result.error}</p>}
        {q && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="eyebrow">Indicative price</div>
                <div className="font-display text-4xl font-extrabold tracking-[-0.04em]">{formatMoney(Math.round(q.total))}</div>
                <div className="text-xs text-gray-500">
                  {q.cubicFeet?.toLocaleString()} cu ft · ~{q.weightLbs?.toLocaleString()} lbs · {q.miles?.toLocaleString()} mi
                </div>
              </div>
              {ballpark && (
                <div className="text-right text-xs text-gray-500">
                  Our ballpark
                  <div className="font-semibold text-ink">
                    {formatMoney(ballpark.low)} – {formatMoney(ballpark.high)}
                  </div>
                  {q.total < ballpark.low ? "below range" : q.total > ballpark.high ? "above range" : "within range ✓"}
                </div>
              )}
            </div>
            <ul className="space-y-0.5 text-sm">
              {q.breakdown.map((b) => (
                <li key={b.label} className="flex justify-between gap-2">
                  <span className="text-gray-600">{b.label}</span>
                  <span className="tabular-nums">{formatMoney(b.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {q.carrierStatus && <span className="chip bg-sage text-ink">FMCSA: {q.carrierStatus.split(" · ")[0]}</span>}
              <span className="chip bg-amber-100 text-amber-900">Not an estimate until surveyed</span>
              <span className="chip bg-ink/5 text-gray-600">Basic $0.60/lb coverage</span>
            </div>
            <p className="text-xs text-gray-500">{q.nextStep || "Next: a free in-home or video survey, then a written estimate."}</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={save}>
                {savedId ? "✓ Saved to quotes" : "Save to my quotes"}
              </button>
              {q.verifyUrl && (
                <a className="btn-secondary" href={q.verifyUrl} target="_blank" rel="noreferrer">
                  Verify on FMCSA ↗
                </a>
              )}
              <a className="btn-ghost" href={`tel:${NGM_PROVIDER.phone.replace(/\D/g, "")}`}>
                📞 {NGM_PROVIDER.phone}
              </a>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
