"use client";

import { Card } from "@/components/Swipe";
import {
  NO_WAGE_TAX_STATES,
  flightCode,
  formatDate,
  formatMoney,
  formatTime,
  fundTax,
  milesDollarValue,
  stipendCoverage,
  stipendSchedule,
  tripEnabled,
  travelForm,
  tripSummary,
  type TravelItem,
} from "@moving/shared";
import Link from "next/link";
import { useState } from "react";
import { CrudPage, type CrudApi } from "@/components/CrudPage";
import { FlightTracker, ImportBooking } from "@/components/Flights";
import { Stat } from "@/components/ui";
import { useDb, useStore } from "@/lib/store-context";

const KIND_ICON: Record<string, string> = { flight: "✈️", lodging: "🏨", car: "🚗", ground: "🚕", meals: "🍽️", other: "🧳" };

const ADD_BUTTONS: { kind: TravelItem["kind"]; label: string; title: (city: string) => string }[] = [
  { kind: "flight", label: "Add flight", title: (city) => `Flight to ${city}` },
  { kind: "lodging", label: "Add hotel stay", title: () => "Hotel — first week" },
  { kind: "car", label: "Rental car", title: () => "Rental car" },
  { kind: "ground", label: "Parking / rideshare", title: () => "Airport parking / rideshare" },
  { kind: "meals", label: "Meals", title: () => "Meals for the week" },
];

const GROUP_ADD: Partial<Record<TravelItem["kind"], string>> = { flight: "+ Add flight", lodging: "+ Add hotel stay", car: "+ Add rental car", ground: "+ Add", meals: "+ Add", other: "+ Add" };

const nightsBetween = (a: string | null, b: string | null) => (a && b ? Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86400000)) : 0);

function StipendSetup() {
  const db = useDb();
  const store = useStore();
  const [employer, setEmployer] = useState("Sharp");
  const [start, setStart] = useState("2026-11-16");
  const [first, setFirst] = useState(5000);
  const [second, setSecond] = useState(5000);
  const [month, setMonth] = useState(1);
  const plan = stipendSchedule({ employer, startDate: start, first, second, secondMonth: month });
  const traveler = db.family_members.find((m) => m.relationship === "spouse") ?? db.family_members.find((m) => m.relationship === "self") ?? null;

  const create = () => {
    const undated = (db.funds ?? []).filter((f) => !f.deleted && f.kind === "relocation_stipend" && !f.expected_date);
    const rows = plan.map((p) => ({ ...p, kind: "relocation_stipend", tax_state: db.moves[0]?.to_state || "TN", member_id: traveler?.id ?? null }));
    rows.forEach((r, i) => {
      const existing = undated[i];
      if (existing) store.update("funds", existing.id, { ...r, member_id: existing.member_id ?? r.member_id, notes: existing.notes || r.notes });
      else store.insert("funds", r);
    });
  };

  return (
    <div className="rounded-2xl border border-dashed border-ink/20 bg-white/60 p-4">
      <div className="font-display text-lg font-bold tracking-tight">Set up the stipend payments</div>
      <p className="mt-1 text-xs text-gray-500">Adds both stipend checks to Funding sources and the calendar, taxed as supplemental pay (TN: no state tax).</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
        <label className="col-span-2 sm:col-span-1">
          <span className="text-xs text-gray-500">Employer</span>
          <input className="input" value={employer} onChange={(e) => setEmployer(e.target.value)} />
        </label>
        <label>
          <span className="text-xs text-gray-500">Start date</span>
          <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          <span className="text-xs text-gray-500">1st check</span>
          <input className="input" type="number" value={first} onChange={(e) => setFirst(Number(e.target.value) || 0)} />
        </label>
        <label>
          <span className="text-xs text-gray-500">2nd payment</span>
          <input className="input" type="number" value={second} onChange={(e) => setSecond(Number(e.target.value) || 0)} />
        </label>
        <label>
          <span className="text-xs text-gray-500">2nd paid in</span>
          <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i + 1}>
                {new Date(2027, i, 1).toLocaleString("en-US", { month: "long" })}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {plan.map((p) => (
          <li key={p.source} className="flex justify-between gap-2">
            <span>{p.source}</span>
            <span className="text-gray-500">
              {formatMoney(p.amount)} · payday {formatDate(p.expected_date)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-gray-400">Weekly pay usually runs a week behind, so the first check is the Friday after his first full week. Adjust the dates on the Budget page once HR confirms.</p>
      <button className="btn-primary mt-3" onClick={create}>
        Add stipend payments
      </button>
    </div>
  );
}

function MilesExplainer() {
  return (
    <details className="card">
      <summary className="cursor-pointer font-display text-lg font-bold tracking-tight">How miles are counted</summary>
      <div className="mt-3 grid gap-3 text-sm text-gray-600 md:grid-cols-3">
        <p>
          <b className="text-ink">Cash paid</b> is what actually left the bank — for an award ticket that&apos;s just the taxes &amp; fees (often $5.60–$11.20). It counts as fronted until the stipend arrives.
        </p>
        <p>
          <b className="text-ink">Miles used</b> are turned into dollars at the airline&apos;s typical value (Delta ≈ 1.2¢, Southwest ≈ 1.35¢, American ≈ 1.4¢ per mile) — or type your own value, e.g. what the same cash fare cost. Miles are spent the moment you book, so they show as already paid.
        </p>
        <p>
          <b className="text-ink">Paying yourselves back:</b> with “pay ourselves back for the miles” on, the miles&apos; value is added to what the stipend covers, so the timeline sets that money aside when the check lands. Turn it off on an item if you&apos;d rather just let the miles go. Mark the item “Covered” once you&apos;ve moved the money.
        </p>
      </div>
    </details>
  );
}

function TripOptIn() {
  const db = useDb();
  const store = useStore();
  const move = db.moves[0];
  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="card-ink p-8">
        <div className="eyebrow text-white/50">Optional</div>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-[-0.04em]">Is anyone travelling ahead of the move?</h1>
        <p className="mt-3 text-white/70">
          Starting a new job early, house-hunting, or signing a lease in person? Turn this on to track flights (with live flight tracking), hotels, rental cars, miles &amp; points, and which costs a relocation stipend or employer will pay back — and when.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {move ? (
            <button className="btn bg-lime text-ink hover:brightness-95" onClick={() => store.update("moves", move.id, { work_trip: true })}>
              Yes — turn on trip planning
            </button>
          ) : (
            <Link className="btn bg-lime text-ink" href="/move">
              Set up your move first
            </Link>
          )}
          <Link className="btn bg-white/10 text-white hover:bg-white/20" href="/">
            No, skip it
          </Link>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-gray-500">You can switch it on or off any time under Move details → Logistics.</p>
    </div>
  );
}

function TripTop({ api }: { api: CrudApi<"travel"> }) {
  const db = useDb();
  const items = (db.travel ?? []).filter((t) => !t.deleted);
  const trip = tripSummary(items);
  const state = db.moves[0]?.to_state || "TN";
  const cov = stipendCoverage(items, db.funds ?? [], { members: db.family_members, state });
  const flights = items.filter((t) => t.kind === "flight");
  const hotel = items.find((t) => t.kind === "lodging");
  const taxState = (db.funds ?? []).find((f) => !f.deleted && f.kind === "relocation_stipend" && f.tax_state)?.tax_state || state;
  const owed = trip.covered - trip.reimbursed;
  const move = db.moves[0];
  const city = move?.to_city || "the new city";
  const tripName = items.find((t) => t.trip)?.trip || "Travelling ahead";
  const [importing, setImporting] = useState(false);
  const store = useStore();
  const traveler = db.family_members.find((m) => m.relationship === "spouse") ?? db.family_members.find((m) => m.relationship === "self") ?? null;

  return (
    <section className="mb-6 space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="card-ink relative overflow-hidden p-6">
          <div className="flex items-start justify-between gap-2">
            <div className="eyebrow text-white/50">{tripName}</div>
            {move && (
              <button className="text-[11px] text-white/40 underline hover:text-white/80" onClick={() => store.update("moves", move.id, { work_trip: false })} title="Hide the trip section — your trip items are kept">
                Hide trip section
              </button>
            )}
          </div>
          <div className="mt-3 font-display text-4xl leading-none font-extrabold tracking-[-0.04em]">
            {trip.start ? (
              <>
                {formatDate(trip.start)}
                {trip.end && trip.end !== trip.start ? <span className="text-white/50"> → {formatDate(trip.end)}</span> : null}
              </>
            ) : (
              "Add flights & hotel"
            )}
          </div>
          <div className="mt-2 text-sm text-white/60">
            {flights.length ? `${flights.length} flight${flights.length > 1 ? "s" : ""}` : "No flights yet"}
            {hotel ? ` · ${hotel.provider || hotel.title}` : ""}
            {trip.nights ? ` · ${trip.nights} night${trip.nights > 1 ? "s" : ""}` : ""}
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div>
              <div className="font-display text-2xl font-bold text-lime">{formatMoney(trip.total)}</div>
              <div className="text-xs text-white/60">trip total{trip.milesValue ? ` · incl. ${formatMoney(trip.milesValue)} in miles` : ""}</div>
            </div>
            <div>
              <div className="font-display text-2xl font-bold">{formatMoney(trip.fronted)}</div>
              <div className="text-xs text-white/60">paid by us, waiting on stipend</div>
            </div>
            <div>
              <div className="font-display text-2xl font-bold">{formatMoney(trip.unpaid)}</div>
              <div className="text-xs text-white/60">still to pay</div>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button className="chip bg-lime text-ink hover:brightness-95" onClick={() => setImporting(true)}>
              ✉️ Import flight booking
            </button>
            {ADD_BUTTONS.map((q) => (
              <button
                key={q.kind}
                className="chip bg-white/10 text-white/85 hover:bg-lime hover:text-ink"
                onClick={() => api.add({ kind: q.kind, title: q.title(city) })}
              >
                {KIND_ICON[q.kind]} {q.label}
              </button>
            ))}
          </div>
        </div>

        <Card id="travel.stipend-costs" title="Stipend vs. trip costs">
          <p className="mt-1 text-xs text-gray-500">We pay up front; the relocation stipend arrives on his paychecks. Amounts are take-home after tax (22% federal + 7.65% Social Security/Medicare{taxState ? ` + ${taxState} state${(NO_WAGE_TAX_STATES as readonly string[]).includes(taxState.toUpperCase()) ? " ($0)" : ""}` : ""}).</p>
          {cov.checks.length === 0 || !cov.checks.some((c) => c.date) ? (
            <div className="mt-4">
              <StipendSetup />
            </div>
          ) : (
            <ol className="relative mt-4 space-y-4 border-l-2 border-ink/10 pl-5">
              <li className="relative">
                <span className="absolute top-1 -left-[27px] h-3 w-3 rounded-full bg-ink" />
                <div className="text-xs text-gray-500">{trip.start ? formatDate(trip.start) : "Before the trip"}</div>
                <div className="font-semibold">We front {formatMoney(owed)} for covered travel</div>
                {cov.daysFronted != null && <div className="text-xs text-gray-500">≈ {cov.daysFronted} days until the first stipend check</div>}
              </li>
              {cov.checks.map((c, i) => {
                const gross = fundTax(c.fund, { state }).gross;
                return (
                  <li key={c.fund.id} className="relative">
                    <span className={`absolute top-1 -left-[27px] h-3 w-3 rounded-full bg-lime ${c.fund.received ? "ring-2 ring-ink" : ""}`} />
                    <div className="text-xs text-gray-500">
                      {c.date ? formatDate(c.date) : "Date TBD"} · {c.fund.received ? "received" : "expected"}
                    </div>
                    <div className="font-semibold">
                      {c.fund.source}: +{formatMoney(c.net)}
                      <span className="ml-1 text-xs font-normal text-gray-400">of {formatMoney(gross)}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {i === 0
                        ? c.remainingAfter > 0
                          ? `Still ${formatMoney(c.remainingAfter)} short after this check`
                          : `Covers the trip ✓ ${formatMoney(c.net - owed)} left over`
                        : c.remainingAfter > 0
                          ? `${formatMoney(c.remainingAfter)} still uncovered`
                          : "Goes toward the move"}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {cov.checks.some((c) => c.date) && (
            <div className={`mt-4 rounded-xl p-3 text-sm ${cov.gapAfterFirst > 0 ? "bg-red-50 text-red-800" : "bg-sage/60 text-ink"}`}>
              {cov.gapAfterFirst > 0
                ? `The first check's take-home is ${formatMoney(cov.gapAfterFirst)} short of the trip — plan to float that until the next payment.`
                : `Stipend take-home left for the move after the trip: ${formatMoney(cov.leftover)}.`}
            </div>
          )}
        </Card>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Covered by stipend" icon="💼" value={formatMoney(trip.covered)} sub={`${formatMoney(trip.reimbursed)} paid back`} />
        <Stat label="Not covered" icon="🧾" value={formatMoney(trip.personal)} />
        <Stat label="Miles used" icon="🎟️" value={trip.milesUsed ? trip.milesUsed.toLocaleString() : "—"} sub={trip.milesValue ? `≈ ${formatMoney(trip.milesValue)} · ${formatMoney(trip.milesToRecover)} to pay back` : "award tickets"} />
        <Stat label="Hotel nights" icon="🏨" value={trip.nights || "—"} sub={`${items.reduce((n, t) => n + (t.files ?? []).length, 0)} receipts attached`} />
      </div>
      {trip.milesUsed > 0 && <MilesExplainer />}
      <ImportBooking open={importing} onClose={() => setImporting(false)} trip={tripName === "Travelling ahead" ? "" : tripName} memberId={traveler?.id ?? null} year={trip.start ? Number(trip.start.slice(0, 4)) : undefined} />
    </section>
  );
}

function MoneyChips({ t }: { t: TravelItem }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <b>{formatMoney(t.cost)}</b>
      {(t.miles_used ?? 0) > 0 && (
        <span className="text-xs text-gray-500" title="Miles used, at the value shown">
          + {(t.miles_used ?? 0).toLocaleString()} mi ≈ {formatMoney(milesDollarValue(t))}
        </span>
      )}
      <span className={`chip ${t.reimbursed ? "bg-sage" : t.paid ? "bg-amber-100 text-amber-900" : "bg-ink/5 text-gray-600"}`}>{t.reimbursed ? "Covered" : t.paid ? (t.reimbursable ? "Fronted" : "Paid") : "Unpaid"}</span>
      {(t.files ?? []).length > 0 && <span className="text-xs text-gray-400">📎 {t.files.length}</span>}
    </span>
  );
}

function FlightCard({ t, open }: { t: TravelItem; open: () => void }) {
  if (!flightCode(t.airline, t.flight_number)) {
    return (
      <button className="card flex w-full flex-col gap-2 text-left" onClick={open}>
        <span className="font-semibold">✈️ {t.title}</span>
        <span className="text-sm text-gray-500">Add the airline and flight number to fill in the route and start tracking.</span>
        <MoneyChips t={t} />
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <FlightTracker flight={t} onEdit={open} />
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 text-sm">
        <span className="text-gray-500">
          {t.title}
          {t.seat ? ` · seat ${t.seat}` : ""}
          {t.confirmation && <span className="ml-2 rounded-md bg-ink/5 px-1.5 py-0.5 font-mono text-xs text-ink">Conf # {t.confirmation}</span>}
        </span>
        <MoneyChips t={t} />
      </div>
    </div>
  );
}

function StayCard({ t, open }: { t: TravelItem; open: () => void }) {
  const nights = t.kind === "lodging" ? nightsBetween(t.start_date, t.end_date) : 0;
  const form = travelForm(t.kind);
  return (
    <button className="card flex w-full items-start gap-3 text-left transition hover:-translate-y-0.5" onClick={open}>
      <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-sand text-xl">{KIND_ICON[t.kind] ?? "🧳"}</span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block truncate font-semibold">{t.provider || t.title}</span>
        {t.provider && t.title !== t.provider && <span className="block truncate text-xs text-gray-500">{t.title}</span>}
        {t.address && <span className="block truncate text-xs text-gray-500">📍 {t.address}</span>}
        {(t.start_date || t.end_date) && (
          <span className="block text-sm">
            {t.start_date && (
              <>
                <span className="text-gray-400">{form.labels.start_date ?? "From"} </span>
                {formatDate(t.start_date)}
                {t.start_time ? ` ${formatTime(t.start_time)}` : ""}
              </>
            )}
            {t.end_date && (
              <>
                <span className="text-gray-400"> → {form.labels.end_date ?? "To"} </span>
                {formatDate(t.end_date)}
                {t.end_time ? ` ${formatTime(t.end_time)}` : ""}
              </>
            )}
          </span>
        )}
        {nights > 0 && (
          <span className="block text-xs text-gray-500">
            {nights} night{nights > 1 ? "s" : ""}
            {t.cost ? ` · ${formatMoney(t.cost / nights)}/night` : ""}
          </span>
        )}
        {t.confirmation && <span className="inline-block rounded-md bg-ink/5 px-1.5 py-0.5 font-mono text-xs">Conf # {t.confirmation}</span>}
        <span className="block pt-1 text-sm">
          <MoneyChips t={t} />
        </span>
      </span>
    </button>
  );
}

export default function TravelPage() {
  const db = useDb();
  if (!tripEnabled(db.moves[0], db.travel ?? [])) return <TripOptIn />;
  return (
    <CrudPage
      table="travel"
      drawerForm
      title="Work trip"
      subtitle="Flights and hotel stays kept separately — live flight tracking, confirmation numbers, miles, receipts, and when the relocation stipend pays it back."
      top={(api) => <TripTop api={api} />}
      addLabel="+ Add to trip"
      groupBy="kind"
      groupOrder={["flight", "lodging"]}
      groupAction={(kind, api) => (
        <button className="btn-secondary text-sm" onClick={() => api.add({ kind: kind as TravelItem["kind"], title: kind === "flight" ? `Flight to ${db.moves[0]?.to_city || "the new city"}` : kind === "lodging" ? "Hotel — first week" : "" })}>
          {GROUP_ADD[kind as TravelItem["kind"]] ?? "+ Add"}
        </button>
      )}
      formTitle={(row, init) => (row ? row.title || `Edit ${travelForm(row.kind).noun}` : `New ${travelForm(init?.kind ?? "other").noun}`)}
      sort={(a, b) => (a.start_date ?? "9999").localeCompare(b.start_date ?? "9999") || (a.start_time || "99").localeCompare(b.start_time || "99")}
      initial={{ trip: "First week at the new job", reimbursable: true }}
      renderDetail={(t) => (t.kind === "flight" ? <FlightTracker flight={t} /> : null)}
      renderCard={(t, open) => (t.kind === "flight" ? <FlightCard t={t} open={open} /> : <StayCard t={t} open={open} />)}
      emptyText="Nothing booked yet — add the flights and the hotel stay separately with the buttons above."
    />
  );
}
