"use client";

import {
  AIRLINES,
  airlineByCode,
  bookedRoute,
  flightCallsign,
  flightCode,
  flightTrackerLinks,
  formatDate,
  formatMoney,
  formatTime,
  lookupFlightRoute,
  lookupLivePosition,
  milesDollarValue,
  parseItinerary,
  type FlightRoute,
  type LivePosition,
  type ParsedFlight,
  type ParsedItinerary,
  regionalOperator,
  type TravelItem,
} from "@moving/shared";
import { useEffect, useMemo, useState } from "react";
import { MapView, type MapLine, type MapPin } from "./MapView";
import { Drawer } from "./ui";
import { useDb, useStore } from "@/lib/store-context";

type Row = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v : "");

function copy(text: string) {
  void navigator.clipboard?.writeText(text).catch(() => undefined);
}

/** Opens the airline's "find my trip" page (with the confirmation # copied) — airlines don't offer a public lookup API. */
function FindBookingButtons({ airline, confirmation }: { airline: string; confirmation: string }) {
  const a = airlineByCode(airline);
  if (!a) return null;
  return (
    <a
      className="btn-secondary"
      href={a.manageUrl}
      target="_blank"
      rel="noreferrer"
      onClick={() => {
        if (confirmation) copy(confirmation);
      }}
    >
      Open {a.name} trip lookup ↗
    </a>
  );
}

export function routeTitle(airline: string, number: string, origin: string, destination: string) {
  const code = flightCode(airline, number);
  const route = origin || destination ? `${origin || "?"} → ${destination || "?"}` : "";
  return [code, route].filter(Boolean).join(" · ") || "Flight";
}

/** Booking helpers shown at the top of the travel form when the item is a flight. */
export function FlightLookup({ draft, setDraft }: { draft: Row; setDraft: (fn: (d: Row) => Row) => void }) {
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [extra, setExtra] = useState<ParsedFlight[]>([]);
  const store = useStore();
  const airline = str(draft.airline);
  const number = str(draft.flight_number);
  const conf = str(draft.confirmation);
  const operatedBy = str(draft.operated_by);
  const a = airlineByCode(airline);

  useEffect(() => {
    const code = flightCode(airline, number);
    if (!code || (str(draft.origin) && str(draft.destination))) return;
    let alive = true;
    const t = setTimeout(() => {
      setMsg("Looking up the flight…");
      lookupFlightRoute(airline, number, fetch, operatedBy)
        .then((r) => {
          if (!alive) return;
          if (!r) return setMsg("No route found for that flight number yet — type the airports, or paste the confirmation e-mail below.");
          setDraft((d) => ({
            ...d,
            origin: str(d.origin) || r.origin.iata,
            destination: str(d.destination) || r.destination.iata,
            title: !str(d.title) || /^flight/i.test(str(d.title)) ? routeTitle(airline, number, r.origin.iata, r.destination.iata) : d.title,
          }));
          setMsg(`✓ ${r.origin.city} (${r.origin.iata}) → ${r.destination.city} (${r.destination.iata}) · ${r.distanceMiles.toLocaleString()} mi — check it matches your booking.`);
        })
        .catch(() => alive && setMsg("Couldn't reach the flight database — fill the airports in by hand."));
    }, 700);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // only re-run when the flight itself changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airline, number]);

  const setNumber = (v: string) => {
    const m = /^\s*([A-Za-z0-9]{2})\s*-?\s*(\d{1,4})\s*$/.exec(v);
    const guess = m && /[A-Za-z]/.test(m[1]!) ? airlineByCode(m[1]!.toUpperCase()) : null;
    setDraft((d) => (guess ? { ...d, airline: guess.code, flight_number: m![2]! } : { ...d, flight_number: v }));
  };

  const fillRoute = async () => {
    if (!flightCode(airline, number)) return setMsg("Pick the airline and type the flight number first.");
    setBusy(true);
    setMsg("Looking up the flight…");
    try {
      const r = await lookupFlightRoute(airline, number, fetch, operatedBy);
      if (!r) return setMsg("No route found for that flight number — fill the airports in by hand.");
      const o = str(draft.origin).toUpperCase();
      const dst = str(draft.destination).toUpperCase();
      if ((o && o !== r.origin.iata) || (dst && dst !== r.destination.iata)) {
        return setMsg(`The flight database lists ${r.origin.iata} → ${r.destination.iata}, but your booking says ${o || "?"} → ${dst || "?"}. Keeping your booking — the database often lags schedule changes.`);
      }
      setDraft((d) => ({
        ...d,
        origin: r.origin.iata,
        destination: r.destination.iata,
        provider: str(d.provider) || a?.name || r.airline,
        title: !str(d.title) || /^flight/i.test(str(d.title)) ? routeTitle(airline, number, r.origin.iata, r.destination.iata) : d.title,
      }));
      setMsg(`${r.origin.city} (${r.origin.iata}) → ${r.destination.city} (${r.destination.iata}) · ${r.distanceMiles.toLocaleString()} mi`);
    } catch {
      setMsg("Couldn't reach the flight database — check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const fillFromPaste = () => {
    const p = parseItinerary(paste, { airline, year: Number(str(draft.start_date).slice(0, 4)) || undefined });
    const f = p.flights[0];
    if (!f && !p.confirmation) return setMsg("Couldn't find a flight in that text. Paste the whole confirmation e-mail.");
    setDraft((d) => ({
      ...d,
      ...(p.confirmation ? { confirmation: p.confirmation } : {}),
      ...(f
        ? {
            airline: f.airline || d.airline,
            flight_number: f.flight_number,
            origin: f.origin || d.origin,
            destination: f.destination || d.destination,
            start_date: f.start_date ?? d.start_date,
            start_time: f.start_time || d.start_time,
            end_date: f.end_date ?? d.end_date,
            end_time: f.end_time || d.end_time,
            seat: f.seat || d.seat,
            aircraft: f.aircraft || d.aircraft,
            operated_by: f.operated_by || d.operated_by,
            provider: str(d.provider) || airlineByCode(f.airline)?.name || "",
            title: !str(d.title) || /^flight/i.test(str(d.title)) ? routeTitle(f.airline, f.flight_number, f.origin, f.destination) : d.title,
          }
        : {}),
      ...(p.cost != null && d.cost == null ? { cost: p.cost } : {}),
      ...(p.miles_used != null && d.miles_used == null ? { miles_used: p.miles_used } : {}),
    }));
    setExtra(p.flights.slice(1));
    setMsg(`Filled ${f ? `${flightCode(f.airline, f.flight_number) ?? "flight"} ${f.origin}→${f.destination}${f.seat ? ` · seat ${f.seat}` : ""}` : "confirmation #"}.${p.flights.length > 1 ? " This booking has more flights — add them below." : ""}`);
    setPaste("");
  };

  const addExtra = () => {
    store.insertMany(
      "travel",
      extra.map((f) =>
        flightRow(f, {
          airline,
          confirmation: str(draft.confirmation),
          trip: str(draft.trip),
          memberId: (draft.member_id as string | null) ?? null,
          note: `Same booking as ${routeTitle(airline, number, str(draft.origin), str(draft.destination))} — fare is on that flight.`,
        }),
      ),
    );
    setMsg(`✓ Added ${extra.map((f) => `${flightCode(f.airline || airline, f.flight_number)} ${f.origin}→${f.destination}`).join(", ")} as separate flights. Save this one to finish.`);
    setExtra([]);
  };

  const miles = Number(draft.miles_used) || 0;
  const milesValue = milesDollarValue({ miles_used: miles, miles_value: (draft.miles_value as number | null) ?? null, airline, provider: str(draft.provider) });

  return (
    <div className="space-y-3 rounded-3xl bg-ink p-4 text-white">
      <div>
        <div className="font-display text-lg font-bold tracking-tight">Pull up the flight</div>
        <p className="text-xs text-white/60">
          Type the airline and flight number and the route fills itself in — or paste the confirmation e-mail to fill everything (times, cost, miles). Airlines only show bookings on their own site, so “trip lookup” opens it with your confirmation # copied.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select className="input border-white/10 bg-white/10 text-white" value={airline} onChange={(e) => setDraft((d) => ({ ...d, airline: e.target.value }))} aria-label="Airline">
          <option value="" className="text-ink">
            Airline…
          </option>
          {AIRLINES.map((x) => (
            <option key={x.code} value={x.code} className="text-ink">
              {x.name}
            </option>
          ))}
        </select>
        <input className="input border-white/10 bg-white/10 text-white placeholder:text-white/40" placeholder="Flight # (DL1520)" value={number} onChange={(e) => setNumber(e.target.value)} aria-label="Flight number" />
        <input className="input border-white/10 bg-white/10 font-mono text-white uppercase placeholder:text-white/40" placeholder="Confirmation #" value={conf} onChange={(e) => setDraft((d) => ({ ...d, confirmation: e.target.value.toUpperCase() }))} aria-label="Confirmation number" />
        <button type="button" className="btn bg-lime text-ink hover:brightness-95" onClick={() => void fillRoute()} disabled={busy}>
          {busy ? "Looking…" : "Look up flight"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <FindBookingButtons airline={airline} confirmation={conf} />
        {flightTrackerLinks(airline, number, str(draft.start_date), operatedBy).map((l) => (
          <a key={l.label} className="chip bg-white/10 text-white/85 hover:bg-white/20" href={l.url} target="_blank" rel="noreferrer">
            {l.label} ↗
          </a>
        ))}
      </div>
      <details className="rounded-2xl bg-white/5 p-3">
        <summary className="cursor-pointer text-sm font-semibold">Paste the confirmation e-mail</summary>
        <textarea className="input mt-2 min-h-28 border-white/10 bg-white/10 text-sm text-white placeholder:text-white/40" placeholder="Copy everything from the airline's e-mail or “My trips” page and paste it here…" value={paste} onChange={(e) => setPaste(e.target.value)} />
        <button type="button" className="btn mt-2 bg-white text-ink" onClick={fillFromPaste} disabled={!paste.trim()}>
          Fill from paste
        </button>
      </details>
      {msg && <p className="text-xs text-white/80">{msg}</p>}
      {extra.length > 0 && (
        <div className="rounded-2xl bg-white/10 p-3 text-sm">
          <div className="font-semibold">Also on this booking</div>
          <ul className="my-2 space-y-1 text-white/80">
            {extra.map((f) => (
              <li key={f.flight_number}>
                ✈︎ {flightCode(f.airline || airline, f.flight_number)} · {f.origin || "?"} → {f.destination || "?"} · {f.start_date ? formatDate(f.start_date) : ""} {f.start_time ? formatTime(f.start_time) : ""}
                {f.end_time ? `–${formatTime(f.end_time)}` : ""}
                {f.seat ? ` · seat ${f.seat}` : ""}
                {f.operated_by ? ` · operated by ${f.operated_by}` : ""}
              </li>
            ))}
          </ul>
          <button type="button" className="btn bg-lime text-ink hover:brightness-95" onClick={addExtra}>
            Add {extra.length === 1 ? "it" : `all ${extra.length}`} as separate flight{extra.length === 1 ? "" : "s"}
          </button>
        </div>
      )}
      {miles > 0 && (
        <p className="rounded-xl bg-white/10 p-2 text-xs text-white/80">
          {miles.toLocaleString()} {a?.program ?? "miles"} ≈ <b className="text-lime">{formatMoney(milesValue)}</b>
          {draft.miles_value ? " (your value)" : ` at ${a?.centsPerMile ?? 1.2}¢ each`}
          {draft.recover_miles === false ? " · not counted toward the stipend" : " · counted toward what the stipend pays back"}
        </p>
      )}
    </div>
  );
}

function useNow(intervalMs = 30000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}

function until(ms: number) {
  const m = Math.round(Math.abs(ms) / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${mm}m` : `${mm}m`;
}

/** Polls the live position every minute while the flight is (scheduled to be) in the air. */
function LivePoller({ active, poll }: { active: boolean; poll: () => Promise<void> }) {
  useEffect(() => {
    if (!active) return;
    const first = setTimeout(() => void poll(), 0);
    const id = setInterval(() => void poll(), 60000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return null;
}

function RouteMap({ code, route, live }: { code: string; route: FlightRoute | null; live: LivePosition | null }) {
  const pins = useMemo<MapPin[]>(() => {
    const out: MapPin[] = [];
    if (route) {
      out.push({ id: "o", lat: route.origin.lat, lng: route.origin.lon, label: route.origin.iata, kind: "airport", title: route.origin.name });
      out.push({ id: "d", lat: route.destination.lat, lng: route.destination.lon, label: route.destination.iata, kind: "airport", title: route.destination.name });
    }
    if (live) out.push({ id: "plane", lat: live.lat, lng: live.lon, label: code, kind: "plane", heading: live.heading ?? 90, title: code });
    return out;
  }, [route, live, code]);
  const lines = useMemo<MapLine[]>(() => (route ? [{ id: "r", from: [route.origin.lat, route.origin.lon], to: [route.destination.lat, route.destination.lon], dashed: true, color: "#0d0d0f" }] : []), [route]);
  if (!pins.length) return null;
  return <MapView pins={pins} lines={lines} className="h-48" />;
}

/** Route, countdown and live position for a saved flight. */
export function FlightTracker({ flight, onEdit }: { flight: TravelItem; onEdit?: () => void }) {
  const airline = flight.airline ?? "";
  const number = flight.flight_number ?? "";
  const code = flightCode(airline, number);
  const operatedBy = flight.operated_by ?? "";
  const callsign = flightCallsign(airline, number, operatedBy);
  const booked = useMemo(() => bookedRoute(flight.origin, flight.destination, callsign ?? ""), [flight.origin, flight.destination, callsign]);
  const [route, setRoute] = useState<{ key: string; r: FlightRoute | null } | null>(null);
  const [live, setLive] = useState<{ at: number; p: LivePosition | null; err?: boolean } | null>(null);
  const now = useNow();

  useEffect(() => {
    if (!code || booked) return;
    let alive = true;
    lookupFlightRoute(airline, number, fetch, operatedBy)
      .then((r) => alive && setRoute({ key: code, r }))
      .catch(() => alive && setRoute({ key: code, r: null }));
    return () => {
      alive = false;
    };
  }, [airline, number, code, operatedBy, booked]);

  if (!code) {
    return <p className="rounded-2xl bg-sand p-3 text-sm">Add the airline and flight number below to get the route, live tracking and status links.</p>;
  }

  // What's on the booking always wins; the public flight database is only a fallback for the map.
  const found = booked ? null : route?.key === code ? route.r : null;
  const mismatch = !!found && !!flight.origin && flight.origin.toUpperCase() !== found.origin.iata;
  const r = booked ?? (mismatch ? null : found);
  const op = regionalOperator(operatedBy);
  const dep = flight.start_date ? Date.parse(`${flight.start_date}T${flight.start_time || "12:00"}:00`) : null;
  const arr = flight.end_date || flight.start_date ? Date.parse(`${flight.end_date || flight.start_date}T${flight.end_time || flight.start_time || "12:00"}:00`) : null;
  let status = "Add the date to see a countdown";
  let tone = "bg-ink/5 text-gray-700";
  if (now != null && dep != null) {
    if (now < dep - 86400000) status = `Departs in ${until(dep - now)}`;
    else if (now < dep) {
      status = `Departs in ${until(dep - now)} — check in & track below`;
      tone = "bg-amber-100 text-amber-900";
    } else if (arr != null && now < arr + 3600000) {
      status = "In the air (scheduled) — tap Live position";
      tone = "bg-lime text-ink";
    } else {
      status = `Landed ${until(now - (arr ?? dep))} ago (scheduled)`;
      tone = "bg-sage text-ink";
    }
  }

  const inAir = now != null && dep != null && now >= dep - 1800000 && arr != null && now < arr + 3600000;

  const checkLive = async () => {
    try {
      const res = await fetch(`/api/flight-live?callsign=${callsign ?? ""}`);
      if (res.status === 502) throw new Error("unreachable");
      const p = await lookupLivePosition(airline, number, () => Promise.resolve(res), operatedBy);
      setLive({ at: Date.now(), p });
    } catch {
      setLive({ at: Date.now(), p: null, err: true });
    }
  };

  return (
    <div className="space-y-3 rounded-3xl border border-ink/10 bg-white p-4">
      <LivePoller active={inAir} poll={checkLive} />
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="eyebrow">Flight tracker</div>
          <div className="font-display text-2xl font-extrabold tracking-tight">
            {code} <span className="text-base font-semibold text-gray-400">{airlineByCode(airline)?.name}</span>
          </div>
        </div>
        <span className="flex flex-wrap items-center justify-end gap-2">
          <span className={`chip ${tone}`}>{status}</span>
          {onEdit && (
            <button type="button" className="btn-ghost text-xs" onClick={onEdit}>
              Edit
            </button>
          )}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div>
          <div className="font-display text-3xl font-bold">{flight.origin || r?.origin.iata || "—"}</div>
          <div className="truncate text-xs text-gray-500">{r?.origin.city ?? ""}</div>
          <div className="text-sm">{flight.start_date ? `${formatDate(flight.start_date)} ${flight.start_time ? formatTime(flight.start_time) : ""}` : ""}</div>
        </div>
        <div className="text-center text-xs text-gray-400">
          ✈︎
          <div>{r ? `${r.distanceMiles.toLocaleString()} mi` : ""}</div>
        </div>
        <div className="text-right">
          <div className="font-display text-3xl font-bold">{flight.destination || r?.destination.iata || "—"}</div>
          <div className="truncate text-xs text-gray-500">{r?.destination.city ?? ""}</div>
          <div className="text-sm">{flight.end_time ? formatTime(flight.end_time) : ""}</div>
        </div>
      </div>
      {(flight.seat || flight.aircraft || operatedBy || flight.confirmation) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {flight.confirmation && <span className="chip bg-ink/5 font-mono">Conf {flight.confirmation}</span>}
          {flight.seat && <span className="chip bg-ink/5">💺 Seat {flight.seat}</span>}
          {flight.aircraft && <span className="chip bg-ink/5">{flight.aircraft}</span>}
          {operatedBy && (
            <span className="chip bg-ink/5" title={op ? `Trackers follow it as ${callsign}` : undefined}>
              Operated by {op?.name ?? operatedBy}
              {op ? ` · tracks as ${callsign}` : ""}
            </span>
          )}
        </div>
      )}
      <RouteMap code={code} route={r} live={live?.p ?? null} />
      {mismatch && found ? (
        <p className="text-xs text-amber-700">
          The public flight database lists {code} as {found.origin.iata} → {found.destination.iata}; showing your booking ({flight.origin} → {flight.destination || "?"}) instead. Flight numbers get reused by season, so trust the airline&apos;s itinerary.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => void checkLive()}>
          📡 Live position
        </button>
        {flightTrackerLinks(airline, number, flight.start_date, operatedBy).map((l) => (
          <a key={l.label} className="btn-secondary" href={l.url} target="_blank" rel="noreferrer">
            {l.label} ↗
          </a>
        ))}
        <FindBookingButtons airline={airline} confirmation={flight.confirmation} />
      </div>
      {live && (
        <div className="rounded-2xl bg-sand p-3 text-sm">
          {live.p ? (
            <>
              {live.p.onGround ? "On the ground" : `Flying at ${live.p.altitudeFt?.toLocaleString() ?? "?"} ft, ${Math.round(live.p.speedKt ?? 0)} kt`} ·{" "}
              <a className="underline" href={`https://www.openstreetmap.org/?mlat=${live.p.lat}&mlon=${live.p.lon}#map=7/${live.p.lat}/${live.p.lon}`} target="_blank" rel="noreferrer">
                see on map ↗
              </a>
            </>
          ) : live.err ? (
            "Couldn't reach the live tracker from this network — use FlightAware instead."
          ) : (
            "Not airborne right now (or out of receiver range). Live position shows up once the plane takes off."
          )}
        </div>
      )}
    </div>
  );
}

/** A travel row for one parsed flight segment. */
function flightRow(f: ParsedFlight, o: { airline: string; confirmation: string; trip: string; memberId: string | null; note: string }) {
  const air = f.airline || o.airline;
  return {
    kind: "flight" as const,
    trip: o.trip,
    member_id: o.memberId,
    airline: air,
    flight_number: f.flight_number,
    provider: airlineByCode(air)?.name ?? "",
    confirmation: o.confirmation,
    title: routeTitle(air, f.flight_number, f.origin, f.destination),
    origin: f.origin,
    destination: f.destination,
    start_date: f.start_date,
    start_time: f.start_time,
    end_date: f.end_date,
    end_time: f.end_time,
    seat: f.seat,
    aircraft: f.aircraft,
    operated_by: f.operated_by,
    cost: null,
    paid: false,
    reimbursable: true,
    recover_miles: true,
    notes: o.note,
  };
}

/** Import every flight from a pasted confirmation e-mail at once. */
export function ImportBooking({ open, onClose, trip, memberId, year }: { open: boolean; onClose: () => void; trip: string; memberId: string | null; year?: number }) {
  const store = useStore();
  const [airline, setAirline] = useState("");
  const [conf, setConf] = useState("");
  const [paste, setPaste] = useState("");
  const [parsed, setParsed] = useState<ParsedItinerary | null>(null);
  const [cash, setCash] = useState<string>("");
  const [miles, setMiles] = useState<string>("");
  const db = useDb();
  const existing = db.travel.filter((t) => t.kind === "flight" && (t.trip || "") === (trip || ""));
  const [replace, setReplace] = useState(true);

  const parse = () => {
    const p = parseItinerary(paste, { airline, year });
    setParsed(p);
    if (p.confirmation && !conf) setConf(p.confirmation);
    if (p.airline && !airline) setAirline(p.airline);
    const oldCash = existing.reduce((s, t) => s + (t.cost ?? 0), 0);
    const oldMiles = existing.reduce((s, t) => s + (t.miles_used ?? 0), 0);
    // Itinerary pages rarely show the fare — keep what was already typed on the flights being replaced.
    if (p.cost != null) setCash(String(p.cost));
    else if (!cash && oldCash > 0) setCash(String(oldCash));
    if (p.miles_used != null) setMiles(String(p.miles_used));
    else if (!miles && oldMiles > 0) setMiles(String(oldMiles));
  };

  const add = () => {
    if (!parsed?.flights.length) return;
    const total = Number(cash) || null;
    const m = Number(miles) || null;
    const first = existing[0];
    if (replace) for (const t of existing) store.remove("travel", t.id);
    store.insertMany(
      "travel",
      // The whole booking's fare/miles go on the first flight so totals aren't double-counted.
      parsed.flights.map((f, i) => ({
        ...flightRow(f, {
          airline,
          confirmation: conf,
          trip,
          memberId,
          note: i === 0 ? "" : `Same booking as ${routeTitle(parsed.flights[0]!.airline || airline, parsed.flights[0]!.flight_number, parsed.flights[0]!.origin, parsed.flights[0]!.destination)} — fare is on that flight.`,
        }),
        cost: i === 0 ? total : null,
        miles_used: i === 0 ? m : null,
        ...(i === 0 && replace && first
          ? { paid: first.paid, paid_with: first.paid_with, reimbursable: first.reimbursable, reimbursed: first.reimbursed, miles_value: first.miles_value ?? null, recover_miles: first.recover_miles ?? true, files: first.files ?? [] }
          : { paid: true }),
      })),
    );
    setParsed(null);
    setPaste("");
    onClose();
  };

  return (
    <Drawer open={open} onClose={onClose} title="Import a flight booking">
      <div className="space-y-4">
        <ol className="space-y-1 text-sm text-gray-600">
          <li>
            <b>1.</b> Pick the airline and enter the confirmation # → open their trip page (the # is copied for you).
          </li>
          <li>
            <b>2.</b> Copy the itinerary (or the confirmation e-mail) and paste it below.
          </li>
          <li>
            <b>3.</b> Check the flights we found and add them all.
          </li>
        </ol>
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={airline} onChange={(e) => setAirline(e.target.value)} aria-label="Airline">
            <option value="">Airline…</option>
            {AIRLINES.map((x) => (
              <option key={x.code} value={x.code}>
                {x.name}
              </option>
            ))}
          </select>
          <input className="input font-mono uppercase" placeholder="Confirmation #" value={conf} onChange={(e) => setConf(e.target.value.toUpperCase())} aria-label="Confirmation number" />
        </div>
        <FindBookingButtons airline={airline} confirmation={conf} />
        <textarea className="input min-h-40 text-sm" placeholder="Paste the confirmation e-mail / itinerary here…" value={paste} onChange={(e) => setPaste(e.target.value)} />
        <button className="btn-primary" onClick={parse} disabled={!paste.trim()}>
          Find flights
        </button>
        {parsed && (
          <div className="space-y-3">
            {parsed.flights.length === 0 ? (
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">No flights found — make sure the paste includes the flight numbers (e.g. “DL 1520”).</p>
            ) : (
              <ul className="divide-y divide-ink/5 rounded-2xl bg-white">
                {parsed.flights.map((f) => (
                  <li key={f.airline + f.flight_number} className="flex items-center justify-between gap-2 p-3 text-sm">
                    <span className="font-semibold">
                      {flightCode(f.airline || airline, f.flight_number)} · {f.origin || "?"} → {f.destination || "?"}
                    </span>
                    <span className="text-right text-gray-500">
                      {f.start_date ? formatDate(f.start_date) : "date?"} {f.start_time ? formatTime(f.start_time) : ""}
                      {f.end_time ? ` → ${formatTime(f.end_time)}` : ""}
                      {(f.seat || f.operated_by) && (
                        <span className="block text-xs">
                          {f.seat ? `seat ${f.seat}` : ""}
                          {f.seat && f.operated_by ? " · " : ""}
                          {f.operated_by ? `operated by ${f.operated_by}` : ""}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="text-xs text-gray-500">Cash paid (whole booking)</span>
                <input className="input" type="number" step="0.01" value={cash} onChange={(e) => setCash(e.target.value)} />
              </label>
              <label>
                <span className="text-xs text-gray-500">Miles / points used</span>
                <input className="input" type="number" value={miles} onChange={(e) => setMiles(e.target.value)} />
              </label>
            </div>
            {Number(miles) > 0 && (
              <p className="text-xs text-gray-500">
                ≈ {formatMoney(milesDollarValue({ miles_used: Number(miles), miles_value: null, airline: parsed.airline || airline, provider: "" }))} in miles — counted toward what the stipend pays back. You can change the value per flight.
              </p>
            )}
            {existing.length > 0 && parsed.flights.length > 0 && (
              <label className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
                <input type="checkbox" className="mt-1" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                <span>
                  Replace the {existing.length} flight{existing.length === 1 ? "" : "s"} already on this trip ({existing.map((t) => t.title || routeTitle(t.airline ?? "", t.flight_number ?? "", t.origin, t.destination)).join(", ")}) with this booking
                </span>
              </label>
            )}
            <button className="btn-primary w-full" onClick={add} disabled={!parsed.flights.length}>
              Add {parsed.flights.length} flight{parsed.flights.length === 1 ? "" : "s"}
            </button>
          </div>
        )}
      </div>
    </Drawer>
  );
}
