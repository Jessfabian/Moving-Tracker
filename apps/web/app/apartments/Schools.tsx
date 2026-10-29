"use client";

import {
  SCHOOL_DISTRICTS,
  SCHOOL_LEVELS,
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
import { Card } from "@/components/Swipe";

const gradeRank = (letter: string | null | undefined) => {
  const i = "ABCDF".indexOf((letter ?? "").charAt(0));
  return i < 0 ? 0 : 5 - i;
};

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
  if (compact) {
    const tops = SCHOOL_LEVELS.filter((l) => want.includes(l.key)).map(({ key, label }) => {
      const pick = zn.picks.find((p) => p.level === key);
      const best = pick?.school
        ? { s: pick.school, miles: pick.miles, note: "Zoned" }
        : pick?.candidates.length
          ? (() => {
              const c = [...pick.candidates].sort((x, y) => gradeRank(y.school.letter) - gradeRank(x.school.letter))[0]!;
              return { s: c.school, miles: c.miles, note: `Top of ${pick.candidates.length} options` };
            })()
          : null;
      return { key, label, best };
    });
    return (
      <ul className="divide-y divide-gray-200/70 rounded-2xl bg-gray-50">
        {tops.map(({ key, label, best }) => (
          <li key={key} className="flex min-h-14 items-center gap-3 px-3 py-2">
            <GradeBadge letter={best?.s.letter ?? null} />
            <div className="min-w-0 flex-1">
              {best ? (
                <button type="button" className="block max-w-full truncate text-left text-[15px] font-semibold hover:underline" onClick={() => onFocus?.(best.s)}>
                  {best.s.name}
                </button>
              ) : (
                <span className="text-[15px] text-gray-500">No zoned school found</span>
              )}
              <div className="truncate text-[13px] text-gray-500">
                {[label, best?.note, best?.miles != null ? `${best.miles.toFixed(1)} mi` : null, zn.district?.short].filter(Boolean).join(" · ")}
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }
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

/** Details for a school tapped on the map. */
export function SchoolCard({ school, from, fromName, onClose }: { school: School; from: LatLng | null; fromName?: string; onClose: () => void }) {
  return (
    <Card
      id="apt-school-detail"
      title={school.name}
      icon="🏫"
      summary={school.letter ? `Grade ${school.letter}` : undefined}
      hideable={false}
      className="ring-2 ring-ink"
      bodyClassName="mt-2"
      right={
        <button className="flex h-11 w-11 flex-none items-center justify-center text-gray-400 hover:text-ink" onClick={onClose} aria-label="Close school">
          ✕
        </button>
      }
    >
      <div className="flex items-start gap-4">
        <GradeBadge letter={school.letter} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-gray-500">
            {school.street}, {school.city} {school.zip} · {school.phone}
          </div>
          <div className="mt-1 text-xs text-gray-500">{school.district.name}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {[
          ["Grades", schoolGrades(school)],
          ["Achievement", school.achievement ?? "—"],
          ["Growth", school.growth ?? "—"],
          ["On grade level", school.successRate != null ? `${school.successRate}%` : "—"],
          ["Students", school.enrollment?.toLocaleString() ?? "—"],
          ["Student:teacher", school.ratio ? `${school.ratio}:1` : "—"],
          ["College/career ready", school.ccrRate != null ? `${school.ccrRate}%` : "—"],
          [fromName ? `From ${fromName}` : "From rental", from ? `${distanceMiles(from, school).toFixed(1)} mi` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0 rounded-xl bg-gray-50 p-2">
            <div className="truncate text-[11px] text-gray-500 uppercase">{k}</div>
            <div className="font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <SchoolLinks s={school} />
      </div>
    </Card>
  );
}

/** Zoned school (first kid's level) for a compare-table cell. */
export function TopSchoolCell({ a }: { a: Apartment }) {
  const { levels } = useKidLevels();
  const level = levels[0] ?? "E";
  const z = useSchoolZone(apartmentLatLng(a));
  if (z.status === "loading") return <span className="text-gray-400">…</span>;
  if (z.status !== "ok") return <span className="text-gray-400">—</span>;
  if (z.zone.municipal) return <span className="font-semibold">{z.zone.district?.short} municipal</span>;
  const pick = z.zone.picks.find((p) => p.level === level);
  const s = pick?.school ?? [...(pick?.candidates ?? [])].sort((x, y) => gradeRank(y.school.letter) - gradeRank(x.school.letter))[0]?.school;
  if (!s) return <span className="text-gray-400">—</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <GradeBadge letter={s.letter} size="sm" />
      <span className="line-clamp-2 min-w-0 leading-tight">{s.name.replace(/ School$/i, "")}</span>
    </span>
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
