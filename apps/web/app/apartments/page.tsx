"use client";

/* eslint-disable @next/next/no-img-element -- listing photos come from arbitrary hosts */
import {
  APARTMENT_CHECKLIST,
  APARTMENT_STATUSES,
  SCHOOL_LEVELS,
  SCHOOLS_DATA_YEAR,
  allSchools,
  distanceMiles,
  filterSchools,
  gradeColor,
  apartmentAddress,
  apartmentCosts,
  apartmentFit,
  apartmentLatLng,
  cashflow,
  directionsUrl,
  distanceToPlace,
  formatDate,
  formatMiles,
  formatMoney,
  incomeNeeded,
  maxAffordableRent,
  needsGeocode,
  primaryPlace,
  uuid,
  type Apartment,
  type ApartmentFit,
  type Place,
  type School,
  type SchoolLevel,
} from "@moving/shared";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AddressInput } from "@/components/AddressInput";
import { CrudPage, StatusPill, type CrudApi } from "@/components/CrudPage";
import { Gallery } from "@/components/Gallery";
import { MapView, type MapLine, type MapPin } from "@/components/MapView";
import { SchoolsPanel, SchoolsSection, ZoneChip, useKidLevels, useSchoolZone } from "./Schools";
import { geocodeOne } from "@/lib/geo";
import { useDb, useStore } from "@/lib/store-context";

const STATUS_COLORS: Record<string, string> = {
  researching: "#78716c",
  contacted: "#0ea5e9",
  tour_scheduled: "#6366f1",
  toured: "#8b5cf6",
  applied: "#f59e0b",
  approved: "#10b981",
  signed: "#16a34a",
  rejected: "#ef4444",
};

const FIT_STYLE: Record<ApartmentFit["verdict"], { label: string; cls: string }> = {
  comfortable: { label: "Fits budget", cls: "bg-emerald-100 text-emerald-800" },
  stretch: { label: "A stretch", cls: "bg-amber-100 text-amber-800" },
  over: { label: "Over budget", cls: "bg-red-100 text-red-700" },
  unknown: { label: "", cls: "" },
};

const PIPELINE = APARTMENT_STATUSES.filter((s) => s.value !== "rejected");

const shortMoney = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}k` : `$${Math.round(n)}`);

/** Geocodes apartments whose address changed (one at a time, politely). */
function useAutoGeocode() {
  const db = useDb();
  const store = useStore();
  const tried = useRef(new Set<string>());
  useEffect(() => {
    const next = db.apartments.find((a) => needsGeocode(a) && !tried.current.has(`${a.id}|${apartmentAddress(a)}`));
    if (!next) return;
    const addr = apartmentAddress(next);
    tried.current.add(`${next.id}|${addr}`);
    const t = setTimeout(() => {
      void geocodeOne(addr).then((g) => {
        if (g) store.update("apartments", next.id, { latitude: g.lat, longitude: g.lng, geocoded_address: addr });
      });
    }, 1100);
    return () => clearTimeout(t);
  }, [db.apartments, store]);
}

function Places() {
  const db = useDb();
  const store = useStore();
  const move = db.moves[0];
  const places = move?.places ?? [];
  const [adding, setAdding] = useState(!places.length);
  const [label, setLabel] = useState("");
  const [query, setQuery] = useState("");
  if (!move) return null;
  const save = (next: Place[]) => store.update("moves", move.id, { places: next });
  const bias = places[0] ? { lat: places[0].lat, lng: places[0].lng } : null;
  return (
    <div className="card-ink flex flex-col gap-4">
      <div>
        <div className="eyebrow text-white/50">Distance from</div>
        <div className="font-display text-2xl font-bold tracking-tight">Your places</div>
        <p className="mt-1 text-sm text-white/60">Work, school, family — every rental shows how far it is from your starred place.</p>
      </div>
      {places.length > 0 && (
        <ul className="space-y-2">
          {places.map((p) => {
            const star = primaryPlace(places)?.id === p.id;
            return (
              <li key={p.id} className={`flex items-center gap-3 rounded-2xl p-3 ${star ? "bg-lime text-ink" : "bg-white/8"}`}>
                <button
                  title={star ? "Measuring distances from here" : "Measure distances from here"}
                  onClick={() => save(places.map((x) => ({ ...x, primary: x.id === p.id })))}
                  className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-sm ${star ? "bg-ink text-lime" : "bg-white/10 text-white/60 hover:text-white"}`}
                >
                  ★
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{p.label}</div>
                  <div className={`truncate text-xs ${star ? "text-ink/60" : "text-white/50"}`}>{p.address}</div>
                </div>
                <button className={`text-xs ${star ? "text-ink/50 hover:text-ink" : "text-white/40 hover:text-white"}`} onClick={() => save(places.filter((x) => x.id !== p.id))} aria-label={`Remove ${p.label}`}>
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {adding ? (
        <div className="space-y-2 rounded-2xl bg-white/5 p-3">
          <input className="input border-white/10 bg-white/10 text-white placeholder:text-white/40" placeholder="Name (e.g. Sharp office)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <AddressInput
            className="input border-white/10 bg-white/10 text-white placeholder:text-white/40"
            value={query}
            onChange={setQuery}
            bias={bias}
            placeholder="Search a place or address — “Sharp offices Memphis”"
            onSelect={(s) => {
              const place: Place = { id: uuid(), label: label.trim() || s.name || s.street || s.city, address: s.label, lat: s.lat, lng: s.lng, primary: !places.length };
              save([...places, place]);
              setLabel("");
              setQuery("");
              setAdding(false);
            }}
          />
          {places.length > 0 && (
            <button className="text-xs text-white/50 hover:text-white" onClick={() => setAdding(false)}>
              Cancel
            </button>
          )}
        </div>
      ) : (
        <button className="btn self-start bg-white/10 text-white hover:bg-white/20" onClick={() => setAdding(true)}>
          + Add a place
        </button>
      )}
    </div>
  );
}

function SchoolControls({ on, setOn, level, setLevel, municipalOnly, setMunicipalOnly, minGrade, setMinGrade, count }: {
  on: boolean;
  setOn: (v: boolean) => void;
  level: SchoolLevel;
  setLevel: (l: SchoolLevel) => void;
  municipalOnly: boolean;
  setMunicipalOnly: (v: boolean) => void;
  minGrade: string;
  setMinGrade: (g: string) => void;
  count: number;
}) {
  return (
    <div className="absolute top-4 right-4 z-[400] flex max-w-[calc(100%-2rem)] flex-col items-end gap-2">
      <button onClick={() => setOn(!on)} className={`rounded-full px-3 py-1.5 text-xs font-semibold shadow ${on ? "bg-ink text-white" : "bg-white/95 text-ink"}`}>
        🏫 Schools {on ? `· ${count}` : "off"}
      </button>
      {on && (
        <div className="flex flex-col gap-2 rounded-2xl bg-white/95 p-2 text-xs shadow-lg">
          <div className="flex gap-1">
            {SCHOOL_LEVELS.map((l) => (
              <button key={l.key} onClick={() => setLevel(l.key)} className={`rounded-full px-2.5 py-1 font-semibold ${level === l.key ? "bg-ink text-white" : "bg-gray-100 hover:bg-gray-200"}`}>
                {l.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 px-1">
            <input type="checkbox" checked={municipalOnly} onChange={(e) => setMunicipalOnly(e.target.checked)} /> Municipal districts only
          </label>
          <label className="flex items-center gap-2 px-1">
            Grade
            <select className="rounded-lg border border-gray-200 px-1 py-0.5" value={minGrade} onChange={(e) => setMinGrade(e.target.value)}>
              <option value="">Any</option>
              <option value="A">A only</option>
              <option value="B">B or better</option>
              <option value="C">C or better</option>
            </select>
          </label>
          <div className="flex items-center gap-1 px-1 text-[10px] text-gray-500">
            {["A", "B", "C", "D", "F"].map((g) => (
              <span key={g} className="grid h-4 w-4 place-items-center rounded-full font-bold text-white" style={{ background: gradeColor(g) }}>
                {g}
              </span>
            ))}
            <span>TN {SCHOOLS_DATA_YEAR}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function MapSection({ api }: { api: CrudApi<"apartments"> }) {
  const db = useDb();
  const place = primaryPlace(db.moves[0]?.places);
  const [active, setActive] = useState<string | null>(null);
  const live = db.apartments.filter((a) => a.status !== "rejected");
  const located = live.filter((a) => apartmentLatLng(a));
  const { levels: kidLevels } = useKidLevels();
  const [showSchools, setShowSchools] = useState(true);
  const [levelPick, setLevel] = useState<SchoolLevel | null>(null);
  const level = levelPick ?? kidLevels[0] ?? "E";
  const [municipalOnly, setMunicipalOnly] = useState(false);
  const [minGrade, setMinGrade] = useState("");
  const [focusSchool, setFocusSchool] = useState<School | null>(null);
  const focusApt = located.find((a) => a.id === active) ?? located.find((a) => a.status === "signed") ?? located[0] ?? null;
  const focusLL = focusApt ? apartmentLatLng(focusApt) : null;
  const zone = useSchoolZone(showSchools ? focusLL : null);
  const zonedPicks = useMemo(() => {
    const pick = zone.zone?.picks.find((p) => p.level === level);
    if (!pick) return [];
    return pick.school ? [{ school: pick.school, miles: pick.miles ?? 0 }] : pick.candidates;
  }, [zone.zone, level]);
  const schoolList = useMemo(
    () => (showSchools ? filterSchools(allSchools(), { levels: [level], municipalOnly, minGrade: minGrade || null }) : []),
    [showSchools, level, municipalOnly, minGrade],
  );
  const pins = useMemo<MapPin[]>(() => {
    const out: MapPin[] = [];
    const zonedIds = new Set(zonedPicks.map((z) => z.school.id));
    const shown = new Set<string>();
    for (const s of [...schoolList, ...zonedPicks.map((z) => z.school)]) {
      if (shown.has(s.id)) continue;
      shown.add(s.id);
      out.push({ id: `school:${s.id}`, lat: s.lat, lng: s.lng, kind: "school", label: s.letter ?? "–", title: `${s.name} · ${s.district.short}${s.letter ? ` · grade ${s.letter}` : ""}`, color: gradeColor(s.letter), active: zonedIds.has(s.id) || focusSchool?.id === s.id });
    }
    for (const a of live) {
      const ll = apartmentLatLng(a);
      if (!ll) continue;
      const m = apartmentCosts(a).monthly;
      out.push({ id: a.id, ...ll, label: m ? shortMoney(m) : a.name.slice(0, 14) || "Rental", title: a.name, color: a.status === "signed" ? "#16a34a" : "#0d0d0f", active: a.id === focusApt?.id });
    }
    for (const p of db.moves[0]?.places ?? []) out.push({ id: `place:${p.id}`, lat: p.lat, lng: p.lng, label: p.label, kind: "place" });
    return out;
  }, [live, db.moves, focusApt?.id, schoolList, zonedPicks, focusSchool]);
  const lines = useMemo<MapLine[]>(() => {
    if (!focusLL) return [];
    const out: MapLine[] = zonedPicks.map((z) => ({ id: `zone:${z.school.id}`, from: [focusLL.lat, focusLL.lng], to: [z.school.lat, z.school.lng], color: gradeColor(z.school.letter), label: `${z.school.name} · ${z.miles.toFixed(1)} mi` }));
    if (focusSchool && !zonedPicks.some((z) => z.school.id === focusSchool.id))
      out.push({ id: "focus-school", from: [focusLL.lat, focusLL.lng], to: [focusSchool.lat, focusSchool.lng], color: "#6366f1", dashed: true, label: `${focusSchool.name} · ${distanceMiles(focusLL, focusSchool).toFixed(1)} mi` });
    return out;
  }, [focusLL, zonedPicks, focusSchool]);
  const fitTo = useMemo(() => {
    const ids = pins.filter((p) => p.kind !== "school").map((p) => p.id);
    return ids.length ? ids : undefined;
  }, [pins]);
  const onPin = (id: string) => {
    if (id.startsWith("place:")) return;
    if (id.startsWith("school:")) {
      setFocusSchool(allSchools().find((s) => `school:${s.id}` === id) ?? null);
      return;
    }
    setActive(id);
    if (!showSchools) api.open(id);
  };
  const missing = live.filter((a) => !apartmentLatLng(a));
  const ranked = live
    .map((a) => ({ a, d: distanceToPlace(a, place) }))
    .sort((x, y) => (x.d?.miles ?? 9e9) - (y.d?.miles ?? 9e9) || apartmentCosts(x.a).monthly - apartmentCosts(y.a).monthly);

  return (
    <>
    <section className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="relative">
        <MapView pins={pins} lines={lines} fitTo={fitTo} className="h-[440px] lg:h-[560px]" onPinClick={onPin} />
        <SchoolControls on={showSchools} setOn={setShowSchools} level={level} setLevel={setLevel} municipalOnly={municipalOnly} setMunicipalOnly={setMunicipalOnly} minGrade={minGrade} setMinGrade={setMinGrade} count={schoolList.length} />
        <div className="pointer-events-none absolute top-4 left-4 z-[400] flex flex-wrap gap-2">
          <span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold shadow">
            {located.length} rental{located.length === 1 ? "" : "s"} on map
          </span>
          {place && (
            <span className="rounded-full bg-lime px-3 py-1.5 text-xs font-semibold text-ink shadow">
              ★ {place.label}
            </span>
          )}
          {missing.length > 0 && <span className="rounded-full bg-white/95 px-3 py-1.5 text-xs text-gray-500 shadow">{missing.length} need an address</span>}
        </div>
        {!located.length && !showSchools && (
          <div className="absolute inset-0 z-[400] flex items-center justify-center p-6">
            <div className="max-w-sm rounded-3xl bg-white/95 p-5 text-center shadow-xl">
              <div className="font-display text-xl font-bold">Your map is empty</div>
              <p className="mt-1 text-sm text-gray-500">Add a rental with an address — or paste its listing link — and a price pin drops here automatically.</p>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-4">
        <Places />
        {place && ranked.length > 0 && (
          <div className="card">
            <div className="eyebrow">Closest to {place.label}</div>
            <ol className="mt-3 space-y-1">
              {ranked.slice(0, 6).map(({ a, d }, i) => (
                <li key={a.id}>
                  <button className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-gray-50" onMouseEnter={() => setActive(a.id)} onClick={() => api.open(a.id)}>
                    <span className="w-5 font-display text-lg font-bold text-gray-300">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{a.name}</span>
                    <span className="text-right text-xs">
                      <b className="block">{d ? formatMiles(d.miles) : "—"}</b>
                      <span className="text-gray-400">{d ? `~${d.minutes} min` : "no address"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
    {showSchools && (
      <SchoolsSection
        apartments={located}
        focusId={focusApt?.id ?? null}
        setFocus={setActive}
        level={level}
        municipalOnly={municipalOnly}
        focusSchool={focusSchool}
        setFocusSchool={setFocusSchool}
      />
    )}
    </>
  );
}

function Overview({ api }: { api: CrudApi<"apartments"> }) {
  const db = useDb();
  const apts = db.apartments;
  const live = apts.filter((a) => a.status !== "rejected");
  const rents = live.map((a) => apartmentCosts(a).monthly).filter((n) => n > 0);
  const signed = apts.find((a) => a.status === "signed");
  const maxRent = maxAffordableRent(db);
  const annualIncome = Math.round(cashflow({ incomes: db.incomes }, "after").incomeGross * 12);
  const upcoming = live
    .flatMap((a) => [a.tour_date ? { a, what: "Tour", date: a.tour_date } : null, a.application_deadline ? { a, what: "Apply by", date: a.application_deadline } : null])
    .filter((x): x is { a: Apartment; what: string; date: string } => !!x)
    .sort((x, y) => x.date.localeCompare(y.date))
    .slice(0, 4);
  return (
    <div className="mb-6 space-y-4">
      {signed && (
        <button onClick={() => api.open(signed.id)} className="card-ink flex w-full flex-wrap items-center gap-5 text-left">
          {signed.image_urls?.[0] && <img src={signed.image_urls[0]} alt="" referrerPolicy="no-referrer" className="h-20 w-28 rounded-2xl object-cover" />}
          <div className="min-w-0 flex-1">
            <div className="eyebrow text-lime">Lease signed</div>
            <div className="font-display text-2xl font-bold tracking-tight">{signed.name}</div>
            <div className="text-sm text-white/60">{apartmentAddress(signed)}</div>
          </div>
          <div className="text-right">
            <div className="font-display text-3xl font-bold">{formatMoney(apartmentCosts(signed).monthly)}<span className="text-base text-white/50">/mo</span></div>
            <div className="text-sm text-white/60">Move-in cash {formatMoney(apartmentCosts(signed).moveIn)}</div>
          </div>
        </button>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="tile bg-sand">
          <div className="eyebrow">Options</div>
          <div className="mt-2 font-display text-4xl font-bold">{live.length}</div>
          <div className="text-xs text-gray-600">{apts.length - live.length} ruled out</div>
        </div>
        <div className="tile bg-sage">
          <div className="eyebrow">Cheapest monthly</div>
          <div className="mt-2 font-display text-4xl font-bold">{rents.length ? formatMoney(Math.min(...rents)) : "—"}</div>
          <div className="text-xs text-gray-600">rent + fees + utilities</div>
        </div>
        <div className="tile bg-sky">
          <div className="eyebrow">Your max rent</div>
          <div className="mt-2 font-display text-4xl font-bold">{maxRent ? formatMoney(maxRent) : "—"}</div>
          <div className="text-xs text-gray-600">{maxRent ? "30% of after-move gross income" : <a href="/bills" className="underline">Add income to see this</a>}</div>
        </div>
        <div className="tile bg-lilac">
          <div className="eyebrow">{rents.length ? "Income needed" : "Your income"}</div>
          {rents.length ? (
            <>
              <div className="mt-2 font-display text-4xl font-bold">{formatMoney(incomeNeeded(Math.min(...rents)))}</div>
              <div className="text-xs text-gray-600">
                /yr for the cheapest (30% rule)
                {annualIncome > 0 && (annualIncome >= incomeNeeded(Math.min(...rents)) ? ` · you make ${formatMoney(annualIncome)} ✓` : ` · you make ${formatMoney(annualIncome)}`)}
              </div>
            </>
          ) : (
            <>
              <div className="mt-2 font-display text-4xl font-bold">{annualIncome ? formatMoney(annualIncome) : "—"}</div>
              <div className="text-xs text-gray-600">{annualIncome ? "/yr gross after the move · add a rent to a rental to compare" : <a href="/bills" className="underline">Add income to see this</a>}</div>
            </>
          )}
        </div>
      </div>
      {apts.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {PIPELINE.map((s, i) => {
            const n = apts.filter((a) => a.status === s.value).length;
            return (
              <div key={s.value} className={`min-w-[120px] flex-1 rounded-2xl border p-3 ${n ? "border-gray-200 bg-white" : "border-dashed border-gray-200"}`}>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLORS[s.value] }} />
                  {i + 1}. {s.label}
                </div>
                <div className={`mt-1 font-display text-3xl font-bold ${n ? "" : "text-gray-300"}`}>{n}</div>
              </div>
            );
          })}
        </div>
      )}
      {upcoming.length > 0 && (
        <div className="card">
          <div className="eyebrow">Coming up</div>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {upcoming.map((u) => (
              <li key={u.a.id + u.what}>
                <button onClick={() => api.open(u.a.id)} className="flex w-full items-center gap-3 rounded-2xl bg-gray-50 p-3 text-left hover:bg-gray-100">
                  <span className="flex h-11 w-11 flex-none flex-col items-center justify-center rounded-xl bg-ink text-white">
                    <span className="text-[9px] uppercase">{formatDate(u.date, { month: "short" })}</span>
                    <span className="font-display text-lg leading-none font-bold">{formatDate(u.date, { day: "numeric" })}</span>
                  </span>
                  <span className="min-w-0">
                    <b className="block text-sm">{u.what}</b>
                    <span className="block truncate text-xs text-gray-500">{u.a.name}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ApartmentCard({ a, open }: { a: Apartment; open: () => void }) {
  const db = useDb();
  const place = primaryPlace(db.moves[0]?.places);
  const d = distanceToPlace(a, place);
  const c = apartmentCosts(a);
  const fit = apartmentFit(a, db);
  const cover = a.image_urls?.[0];
  return (
    <button onClick={open} className="group flex h-full w-full flex-col overflow-hidden rounded-[1.75rem] border border-gray-200/80 bg-white text-left transition hover:-translate-y-0.5 hover:shadow-[0_24px_50px_-28px_rgba(13,13,15,0.5)]">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-sand to-sky">
        {cover ? (
          <img src={cover} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center font-display text-5xl text-ink/15">🏢</div>
        )}
        <div className="absolute top-3 left-3 flex gap-1.5">
          <StatusPill value={a.status} options={APARTMENT_STATUSES} color={STATUS_COLORS[a.status]} />
        </div>
        {(a.image_urls?.length ?? 0) > 1 && <span className="absolute top-3 right-3 rounded-full bg-ink/70 px-2 py-0.5 text-[11px] font-semibold text-white">{a.image_urls.length} photos</span>}
        {c.monthly > 0 && (
          <span className="absolute bottom-3 left-3 rounded-full bg-white px-3 py-1 font-display text-lg font-bold shadow">
            {formatMoney(c.monthly)}
            <span className="text-xs font-medium text-gray-500">/mo</span>
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-display text-lg font-bold tracking-tight">{a.name || "Untitled rental"}</div>
            <div className="truncate text-xs text-gray-500">{[a.neighborhood, a.city].filter(Boolean).join(" · ") || apartmentAddress(a) || "No address yet"}</div>
          </div>
          {a.rating ? <span className="flex-none text-sm text-accent">{"★".repeat(a.rating)}</span> : null}
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {(a.bedrooms != null || a.bathrooms != null) && <span className="rounded-full bg-gray-100 px-2 py-1">{a.bedrooms ?? "?"} bd · {a.bathrooms ?? "?"} ba</span>}
          {a.sqft ? <span className="rounded-full bg-gray-100 px-2 py-1">{a.sqft.toLocaleString()} ft²</span> : null}
          {a.pets_allowed && <span className="rounded-full bg-gray-100 px-2 py-1">Pets ok</span>}
          {fit.verdict !== "unknown" && <span className={`rounded-full px-2 py-1 font-semibold ${FIT_STYLE[fit.verdict].cls}`}>{FIT_STYLE[fit.verdict].label}</span>}
          <ZoneChip a={a} />
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-3 text-xs">
          {d && place ? (
            <span>
              <b className="text-sm">{formatMiles(d.miles)}</b> <span className="text-gray-500">· ~{d.minutes} min to {place.label}</span>
            </span>
          ) : (
            <span className="text-gray-400">{place ? (apartmentAddress(a) ? "Locating…" : "Add an address for distance") : "Add a place to see distance"}</span>
          )}
          {a.tour_date && <span className="text-gray-500">Tour {formatDate(a.tour_date, { month: "short", day: "numeric" })}</span>}
        </div>
      </div>
    </button>
  );
}

function Detail({ a }: { a: Apartment }) {
  const db = useDb();
  const c = apartmentCosts(a);
  const fit = apartmentFit(a, db);
  const place = primaryPlace(db.moves[0]?.places);
  const ll = apartmentLatLng(a);
  const { levels } = useKidLevels();
  return (
    <div className="space-y-4">
      {(a.image_urls?.length ?? 0) > 0 && <Gallery urls={a.image_urls} />}
      {(c.monthly > 0 || c.moveIn > 0) && (
        <div className="grid grid-cols-3 gap-2 rounded-3xl bg-ink p-4 text-white">
          {[
            ["Monthly", c.monthly],
            ["Move-in", c.moveIn],
            ["1st year", c.firstYear],
          ].map(([l, v]) => (
            <div key={l as string}>
              <div className="text-[11px] tracking-wide text-white/50 uppercase">{l}</div>
              <div className="font-display text-xl font-bold">{formatMoney(v as number)}</div>
            </div>
          ))}
          {fit.verdict !== "unknown" && (
            <div className="col-span-3 mt-1 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3 text-xs">
              <span className={`rounded-full px-2 py-0.5 font-semibold ${FIT_STYLE[fit.verdict].cls}`}>{FIT_STYLE[fit.verdict].label}</span>
              {fit.rentShare != null && <span className="text-white/70">{Math.round(fit.rentShare * 100)}% of gross income</span>}
              {fit.leftover != null && <span className="text-white/70">· {formatMoney(fit.leftover)} left/mo after bills</span>}
            </div>
          )}
        </div>
      )}
      {ll && (
        <div className="flex flex-wrap gap-2">
          {place && (
            <a className="btn-secondary" href={directionsUrl(ll, place)} target="_blank" rel="noreferrer">
              🧭 {formatMiles(distanceToPlace(a, place)!.miles)} to {place.label} — directions
            </a>
          )}
          {a.listing_url && (
            <a className="btn-ghost" href={a.listing_url} target="_blank" rel="noreferrer">
              Open listing ↗
            </a>
          )}
        </div>
      )}
      <div className="rounded-3xl border border-gray-200 p-4">
        <div className="eyebrow mb-3">🏫 Schools for this address</div>
        <SchoolsPanel a={a} levels={levels} compact />
      </div>
      {!ll && a.listing_url && (
        <a className="btn-ghost" href={a.listing_url} target="_blank" rel="noreferrer">
          Open listing ↗
        </a>
      )}
    </div>
  );
}

function Top({ api }: { api: CrudApi<"apartments"> }) {
  useAutoGeocode();
  return (
    <>
      <Overview api={api} />
      <MapSection api={api} />
      <Comparison />
      <Checklist />
    </>
  );
}

export default function ApartmentsPage() {
  return (
    <CrudPage
      table="apartments"
      title="Apartments & rentals"
      subtitle="Every place you're considering — on a map, with photos, true monthly cost, distance to the places that matter and how it fits your budget."
      top={(api) => <Top api={api} />}
      filters={["status"]}
      sort={(a, b) => apartmentCosts(a).monthly - apartmentCosts(b).monthly}
      renderCard={(a, open) => <ApartmentCard a={a} open={open} />}
      renderDetail={(a) => <Detail a={a} />}
      emptyText="Add each apartment or rental you find — or paste a listing link and we'll pull the photos, address and rent."
    />
  );
}

/* ---- Comparison table & checklist ---- */
function Comparison() {
  const db = useDb();
  const store = useStore();
  const apts = db.apartments.filter((a) => a.status !== "rejected").sort((a, b) => apartmentCosts(a).monthly - apartmentCosts(b).monthly);
  if (apts.length < 2) return null;
  const cheapest = apts.find((a) => apartmentCosts(a).monthly > 0)?.id;
  const choose = (a: Apartment) => {
    for (const o of db.apartments) if (o.id !== a.id && o.status === "signed") store.update("apartments", o.id, { status: "approved" });
    store.update("apartments", a.id, { status: "signed" });
  };
  const rows: [string, (a: Apartment) => ReactNode][] = [
    ["Rent", (a) => formatMoney(a.rent)],
    ["True monthly", (a) => <span className={a.id === cheapest ? "font-bold text-emerald-600" : "font-semibold"}>{formatMoney(apartmentCosts(a).monthly)}</span>],
    ["Cash to move in", (a) => formatMoney(apartmentCosts(a).moveIn)],
    ["1st-year cost", (a) => formatMoney(apartmentCosts(a).firstYear)],
    ["Bed / bath", (a) => `${a.bedrooms ?? "?"} / ${a.bathrooms ?? "?"}`],
    ["Sq ft", (a) => (a.sqft ? a.sqft.toLocaleString() : "—")],
    ["Rent / sq ft", (a) => (apartmentCosts(a).perSqft != null ? `$${apartmentCosts(a).perSqft!.toFixed(2)}` : "—")],
    ["Lease", (a) => (a.lease_months ? `${a.lease_months} mo` : "—")],
    ["Special", (a) => a.move_in_special || "—"],
    ["Laundry", (a) => a.laundry.replace(/_/g, " ")],
    ["Parking", (a) => a.parking],
    ["Pets", (a) => (a.pets_allowed ? "✅" : "🚫")],
    ["Commute", (a) => (a.commute_minutes ? `${a.commute_minutes} min` : "—")],
    ["Schools", (a) => a.school_district || "—"],
    ["Available", (a) => formatDate(a.available_date) || "—"],
    ["Rating", (a) => (a.rating ? "★".repeat(a.rating) : "—")],
  ];
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="sticky left-0 bg-slate-50 p-3 text-left text-xs uppercase text-slate-500">Compare</th>
            {apts.map((a) => (
              <th key={a.id} className="p-3 text-left align-top">
                <div className="font-bold">{a.name}</div>
                <StatusPill value={a.status} options={APARTMENT_STATUSES} color={STATUS_COLORS[a.status]} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, fn]) => (
            <tr key={label} className="border-b border-slate-100">
              <td className="sticky left-0 bg-white p-3 text-xs font-semibold text-slate-500">{label}</td>
              {apts.map((a) => (
                <td key={a.id} className="p-3">
                  {fn(a)}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td className="sticky left-0 bg-white p-3" />
            {apts.map((a) => (
              <td key={a.id} className="p-3">
                {a.status !== "signed" && (
                  <button className="btn-secondary px-2 py-1 text-xs" onClick={() => choose(a)}>
                    Choose this place
                  </button>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Checklist() {
  const [open, setOpen] = useState(false);
  return (
    <div className="card mb-5">
      <button className="flex w-full items-center justify-between text-left text-sm font-bold" onClick={() => setOpen(!open)}>
        <span>🔎 Touring & lease checklist</span>
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <ul className="mt-3 grid gap-1.5 text-sm text-slate-700 md:grid-cols-2">
          {APARTMENT_CHECKLIST.map((c) => (
            <li key={c} className="flex gap-2">
              <span className="text-indigo-500">•</span>
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

