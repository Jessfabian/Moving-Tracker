"use client";

import {
  SCHOOL_DISTRICTS,
  SCHOOL_LEVELS,
  SCHOOL_RESOURCES,
  SCHOOLS_DATA_YEAR,
  apartmentLatLng,
  bestNearby,
  directionsUrl,
  distanceMiles,
  gradeColor,
  levelForAge,
  memberAge,
  resolveZone,
  schoolGrades,
  schoolLinks,
  type Apartment,
  type LatLng,
  type School,
  type SchoolLevel,
  type SchoolZone,
  type SchoolZoneRaw,
} from "@moving/shared";
import { useEffect, useMemo, useState } from "react";
import { useDb, useStore } from "@/lib/store-context";

/* ---------- zone lookups (cached in memory + localStorage) ---------- */

const LS_KEY = "mt-school-zones-v1";
const memo = new Map<string, Promise<SchoolZoneRaw>>();
const keyOf = (ll: LatLng) => `${ll.lat.toFixed(5)},${ll.lng.toFixed(5)}`;
export const inShelby = (ll: LatLng) => ll.lat > 34.98 && ll.lat < 35.42 && ll.lng > -90.32 && ll.lng < -89.62;

function readLs(): Record<string, SchoolZoneRaw> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function lookupZone(ll: LatLng): Promise<SchoolZoneRaw> {
  const k = keyOf(ll);
  const hit = memo.get(k);
  if (hit) return hit;
  const saved = readLs()[k];
  const p = saved
    ? Promise.resolve(saved)
    : fetch(`/api/school-zones?lat=${ll.lat}&lng=${ll.lng}`).then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Zone lookup failed");
        try {
          localStorage.setItem(LS_KEY, JSON.stringify({ ...readLs(), [k]: j }));
        } catch {}
        return j as SchoolZoneRaw;
      });
  memo.set(k, p);
  p.catch(() => memo.delete(k));
  return p;
}

export type ZoneState = { status: "none" | "outside" | "loading" | "error"; zone: null; error?: string } | { status: "ok"; zone: SchoolZone };

export function useSchoolZone(ll: LatLng | null): ZoneState {
  const key = ll ? keyOf(ll) : "";
  const inside = !!ll && inShelby(ll);
  const [res, setRes] = useState<{ key: string; raw?: SchoolZoneRaw; error?: string } | null>(null);
  useEffect(() => {
    if (!ll || !inside) return;
    let live = true;
    lookupZone(ll).then(
      (raw) => live && setRes({ key, raw }),
      (e: Error) => live && setRes({ key, error: e.message }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures lat/lng
  }, [key, inside]);
  const zone = useMemo(() => (ll && res?.key === key && res.raw ? resolveZone(res.raw, ll) : null), [res, key, ll]);
  if (!ll) return { status: "none", zone: null };
  if (!inside) return { status: "outside", zone: null };
  if (zone) return { status: "ok", zone };
  if (res?.key === key && res.error) return { status: "error", zone: null, error: res.error };
  return { status: "loading", zone: null };
}

/** Kids in the family → the school levels you care about (defaults to all three). */
export function useKidLevels() {
  const db = useDb();
  return useMemo(() => {
    const kids = (db.family_members ?? [])
      .filter((m) => m.relationship === "child")
      .map((m) => ({ name: m.name, age: memberAge(m), level: levelForAge(memberAge(m)) }))
      .filter((k): k is { name: string; age: number; level: SchoolLevel } => !!k.level);
    return { kids, levels: [...new Set(kids.map((k) => k.level))] as SchoolLevel[] };
  }, [db.family_members]);
}

export const zoneSummary = (z: SchoolZone) =>
  z.municipal
    ? `${z.district?.name} (municipal)`
    : [z.district?.short, ...z.picks.map((p) => (p.school ? `${p.school.name}${p.school.letter ? ` (${p.school.letter})` : ""}` : p.zonedName)).filter(Boolean)].join(" · ");

/* ---------- small pieces ---------- */

export function GradeBadge({ letter, size = "md" }: { letter: string | null; size?: "sm" | "md" | "lg" }) {
  const dim = size === "lg" ? "h-12 w-12 text-2xl" : size === "sm" ? "h-6 w-6 text-xs" : "h-9 w-9 text-lg";
  return (
    <span
      title={letter ? `TN ${SCHOOLS_DATA_YEAR} letter grade ${letter}` : "No TN letter grade"}
      className={`grid flex-none place-items-center rounded-full font-display font-bold text-white ${dim}`}
      style={{ background: gradeColor(letter) }}
    >
      {letter ?? "–"}
    </span>
  );
}

function SchoolLinks({ s }: { s: School }) {
  const l = schoolLinks(s);
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      <a className="text-indigo-600 hover:underline" href={l.niche} target="_blank" rel="noreferrer">
        Niche ↗
      </a>
      <a className="text-indigo-600 hover:underline" href={l.greatSchools} target="_blank" rel="noreferrer">
        GreatSchools ↗
      </a>
      <a className="text-indigo-600 hover:underline" href={l.usNews} target="_blank" rel="noreferrer">
        US News ↗
      </a>
      <a className="text-indigo-600 hover:underline" href={l.reportCard} target="_blank" rel="noreferrer">
        TN report card ↗
      </a>
    </span>
  );
}

export function SchoolRow({ s, miles, tag, from, onFocus }: { s: School; miles?: number | null; tag?: string; from?: LatLng | null; onFocus?: (s: School) => void }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl p-2 hover:bg-gray-50">
      <GradeBadge letter={s.letter} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <button className="truncate text-left font-semibold hover:underline" onClick={() => onFocus?.(s)}>
            {s.name}
          </button>
          {tag && <span className="chip bg-lime text-ink">{tag}</span>}
          {s.district.municipal && <span className="chip bg-sky text-ink">Municipal · {s.district.short}</span>}
          {s.charter && <span className="chip bg-amber-100 text-amber-900">Charter</span>}
        </div>
        <div className="text-xs text-gray-500">
          {schoolGrades(s)} · {s.district.short}
          {miles != null && <b className="text-ink"> · {miles.toFixed(1)} mi</b>}
          {s.successRate != null && ` · ${s.successRate}% on grade level`}
          {s.enrollment ? ` · ${s.enrollment.toLocaleString()} students` : ""}
          {s.ratio ? ` · ${s.ratio}:1` : ""}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <SchoolLinks s={s} />
          {from && (
            <a className="text-xs text-gray-500 hover:underline" href={directionsUrl(from, s)} target="_blank" rel="noreferrer">
              Directions ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- the main panel for one apartment ---------- */

export function SchoolsPanel({ a, levels, municipalOnly = false, onFocus, compact = false }: { a: Apartment; levels: SchoolLevel[]; municipalOnly?: boolean; onFocus?: (s: School) => void; compact?: boolean }) {
  const ll = apartmentLatLng(a);
  const z = useSchoolZone(ll);
  const store = useStore();
  const zone = z.zone;
  useEffect(() => {
    if (zone && !a.school_district) store.update("apartments", a.id, { school_district: zoneSummary(zone) });
  }, [zone, a.id, a.school_district, store]);

  if (z.status === "none") return <p className="text-sm text-gray-500">Add an address to see the zoned schools.</p>;
  if (z.status === "outside")
    return (
      <p className="text-sm text-gray-500">
        School zones are built in for Shelby County, TN (Memphis area). For other areas use the district&apos;s own zone finder.
      </p>
    );
  if (z.status === "loading") return <p className="animate-pulse text-sm text-gray-500">Looking up the school zone for this address…</p>;
  if (z.status === "error")
    return (
      <p className="text-sm text-gray-500">
        Couldn&apos;t reach the county zone finder ({z.error}).{" "}
        <a className="underline" href={SCHOOL_DISTRICTS[792].zoneLookup} target="_blank" rel="noreferrer">
          Check it on schoolsitelocator.com ↗
        </a>
      </p>
    );

  const zn = z.zone;
  if (!zn) return null;
  const want = levels.length ? levels : SCHOOL_LEVELS.map((l) => l.key);
  return (
    <div className="space-y-4">
      <div className={`rounded-2xl p-3 ${zn.municipal ? "bg-sky" : "bg-sand"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-lg font-bold">{zn.district?.name ?? "District unknown"}</span>
          <span className="chip bg-white/70 text-ink">{zn.municipal ? "Municipal district" : "County district"}</span>
        </div>
        <p className="mt-1 text-xs text-gray-700">{zn.district?.note}</p>
        {!zn.municipal && (
          <p className="mt-1 text-xs text-gray-700">
            Want a municipal school? You&apos;d need an address inside Germantown, Collierville, Bartlett, Arlington, Lakeland or Millington — compare rentals there below.
          </p>
        )}
      </div>
      {SCHOOL_LEVELS.filter((l) => want.includes(l.key)).map(({ key, label }) => {
        const pick = zn.picks.find((p) => p.level === key)!;
        const zonedIds = new Set([pick.school?.id, ...pick.candidates.map((c) => c.school.id)]);
        const better = ll
          ? bestNearby(ll, key, { radiusMiles: 6, limit: compact ? 3 : 5, filter: { municipalOnly, minGrade: pick.school?.letter && pick.school.letter !== "A" ? pick.school.letter : "A" } }).filter((x) => !zonedIds.has(x.school.id))
          : [];
        return (
          <div key={key}>
            <div className="eyebrow mb-1">{label} school</div>
            {pick.school ? (
              <SchoolRow s={pick.school} miles={pick.miles} tag="Zoned" from={ll} onFocus={onFocus} />
            ) : pick.candidates.length ? (
              <div className="space-y-1">
                <p className="text-xs text-gray-500">{zn.district?.short} assigns {label.toLowerCase()} schools by street — confirm the exact one with the district. All of its options:</p>
                {pick.candidates.map((c) => (
                  <SchoolRow key={c.school.id} s={c.school} miles={c.miles} from={ll} onFocus={onFocus} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">{pick.zonedName ? `Zoned: ${pick.zonedName} (not found in state data)` : "No zoned school returned for this address."}</p>
            )}
            {better.length > 0 && (
              <details className="mt-1 rounded-2xl bg-gray-50 px-3 py-2" open={!compact}>
                <summary className="cursor-pointer text-xs font-semibold text-gray-600">Top-rated {label.toLowerCase()} options within 6 mi ({better.length})</summary>
                <p className="mt-1 text-[11px] text-gray-500">Not zoned to this address — open to you only via a municipal address, MSCS optional-school application, charter lottery or transfer.</p>
                {better.map((b) => (
                  <SchoolRow key={b.school.id} s={b.school} miles={b.miles} from={ll} onFocus={onFocus} />
                ))}
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- compare all rentals by their zoned school ---------- */

function ZoneCell({ a, level, active, onClick }: { a: Apartment; level: SchoolLevel; active: boolean; onClick: () => void }) {
  const z = useSchoolZone(apartmentLatLng(a));
  const pick = z.zone?.picks.find((p) => p.level === level);
  const best = pick?.school ?? pick?.candidates.slice().sort((x, y) => (y.school.score ?? 0) - (x.school.score ?? 0))[0]?.school ?? null;
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${active ? "border-ink bg-ink text-white" : "border-gray-200 bg-white hover:border-gray-400"}`}>
      <GradeBadge letter={best?.letter ?? null} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{a.name || "Rental"}</span>
        <span className={`block truncate text-xs ${active ? "text-white/70" : "text-gray-500"}`}>
          {z.status === "ok"
            ? pick?.school
              ? `${pick.school.name} · ${pick.miles?.toFixed(1)} mi`
              : z.zone.municipal
                ? `${z.zone.district?.short} municipal · ${pick?.candidates.length ?? 0} options`
                : pick?.zonedName || "No zone"
            : z.status === "loading"
              ? "Looking up…"
              : z.status === "outside"
                ? "Outside Shelby County"
                : z.status === "none"
                  ? "Needs an address"
                  : "Zone lookup failed"}
        </span>
      </span>
      {z.zone?.municipal && <span className={`chip ${active ? "bg-lime text-ink" : "bg-sky text-ink"}`}>Municipal</span>}
    </button>
  );
}

export function SchoolsSection({
  apartments,
  focusId,
  setFocus,
  level,
  municipalOnly,
  focusSchool,
  setFocusSchool,
}: {
  apartments: Apartment[];
  focusId: string | null;
  setFocus: (id: string) => void;
  level: SchoolLevel;
  municipalOnly: boolean;
  focusSchool: School | null;
  setFocusSchool: (s: School | null) => void;
}) {
  const focus = apartments.find((a) => a.id === focusId) ?? null;
  const { kids } = useKidLevels();
  const levelLabel = SCHOOL_LEVELS.find((l) => l.key === level)!.label;
  const fll = focus ? apartmentLatLng(focus) : null;
  return (
    <section className="mb-6 grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="card-ink">
          <div className="eyebrow text-white/50">Schools</div>
          <div className="font-display text-2xl font-bold tracking-tight">{levelLabel} options by rental</div>
          <p className="mt-1 text-sm text-white/60">
            Pick a rental to see its zoned schools, how far they are and better-rated choices nearby.
            {kids.length > 0 && ` Tailored for ${kids.map((k) => `${k.name} (${k.age})`).join(", ")}.`}
          </p>
        </div>
        {apartments.length ? (
          apartments.map((a) => <ZoneCell key={a.id} a={a} level={level} active={a.id === focusId} onClick={() => setFocus(a.id)} />)
        ) : (
          <p className="card text-sm text-gray-500">Add a rental with an address to compare school zones.</p>
        )}
        <div className="card">
          <div className="eyebrow mb-2">Research more</div>
          <ul className="space-y-1.5 text-sm">
            {SCHOOL_RESOURCES.map((r) => (
              <li key={r.url}>
                <a className="text-indigo-600 hover:underline" href={r.url} target="_blank" rel="noreferrer">
                  {r.label} ↗
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
            Zones: Shelby County School Site Locator. Schools: NCES {SCHOOLS_DATA_YEAR}. Grades: TN Dept. of Education {SCHOOLS_DATA_YEAR} A–F letter grades. Zones change yearly — always confirm with the district before signing a lease.
          </p>
        </div>
      </div>
      <div className="space-y-4">
        {focusSchool && (
          <div className="card border-2 border-ink">
            <div className="flex items-start gap-4">
              <GradeBadge letter={focusSchool.letter} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="font-display text-xl font-bold">{focusSchool.name}</div>
                <div className="text-sm text-gray-500">
                  {focusSchool.street}, {focusSchool.city} {focusSchool.zip} · {focusSchool.phone}
                </div>
                <div className="mt-1 text-xs text-gray-500">{focusSchool.district.name}</div>
              </div>
              <button className="text-gray-400 hover:text-ink" onClick={() => setFocusSchool(null)} aria-label="Close school">
                ✕
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {[
                ["Grades", schoolGrades(focusSchool)],
                ["Achievement", focusSchool.achievement ?? "—"],
                ["Growth", focusSchool.growth ?? "—"],
                ["On grade level", focusSchool.successRate != null ? `${focusSchool.successRate}%` : "—"],
                ["Students", focusSchool.enrollment?.toLocaleString() ?? "—"],
                ["Student:teacher", focusSchool.ratio ? `${focusSchool.ratio}:1` : "—"],
                ["College/career ready", focusSchool.ccrRate != null ? `${focusSchool.ccrRate}%` : "—"],
                ["From rental", fll ? `${distanceMiles(fll, focusSchool).toFixed(1)} mi` : "—"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-gray-50 p-2">
                  <div className="text-[11px] text-gray-500 uppercase">{k}</div>
                  <div className="font-semibold">{v}</div>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <SchoolLinks s={focusSchool} />
            </div>
          </div>
        )}
        <div className="card">
          {focus ? (
            <>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div className="font-display text-xl font-bold">Schools for {focus.name || "this rental"}</div>
                <span className="text-xs text-gray-500">Click a school name to focus it on the map</span>
              </div>
              <SchoolsPanel a={focus} levels={[level]} municipalOnly={municipalOnly} onFocus={setFocusSchool} />
            </>
          ) : (
            <p className="text-sm text-gray-500">Pick a rental on the left (or click its pin) to see its schools.</p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Tiny "🏫 Idlewild Elementary · B" chip for rental cards. */
export function ZoneChip({ a }: { a: Apartment }) {
  const { levels } = useKidLevels();
  const level = levels[0] ?? "E";
  const z = useSchoolZone(apartmentLatLng(a));
  if (z.status !== "ok") return null;
  const pick = z.zone.picks.find((p) => p.level === level);
  if (z.zone.municipal)
    return <span className="rounded-full bg-sky px-2 py-1 font-semibold">🏫 {z.zone.district?.short} municipal</span>;
  if (!pick?.school) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 py-0.5 pr-2 pl-0.5">
      <GradeBadge letter={pick.school.letter} size="sm" />
      {pick.school.name.replace(/ School$/i, "")}
    </span>
  );
}