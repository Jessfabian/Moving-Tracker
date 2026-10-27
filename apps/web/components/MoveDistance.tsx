"use client";

import { useEffect, useState } from "react";
import type { RouteDistance } from "@moving/shared";

export interface ZipRoute extends RouteDistance {
  from: { zip: string; city: string; state: string };
  to: { zip: string; city: string; state: string };
}

const cache = new Map<string, Promise<ZipRoute | null>>();

export function fetchZipRoute(fromZip: string, toZip: string): Promise<ZipRoute | null> {
  const key = `${fromZip}-${toZip}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/geocode?from=${encodeURIComponent(fromZip)}&to=${encodeURIComponent(toZip)}`)
      .then((r) => (r.ok ? (r.json() as Promise<ZipRoute>) : null))
      .catch(() => null);
    cache.set(key, p);
    void p.then((v) => {
      if (!v) cache.delete(key);
    });
  }
  return p;
}

const zip5 = (z: unknown) => {
  const m = /^\s*(\d{5})/.exec(String(z ?? ""));
  return m ? m[1]! : null;
};

/** Looks up the driving distance between two ZIPs whenever either changes. */
export function useZipRoute(fromZip: unknown, toZip: unknown) {
  const a = zip5(fromZip);
  const b = zip5(toZip);
  const key = a && b ? `${a}-${b}` : null;
  const [state, setState] = useState<{ key: string; route: ZipRoute | null } | null>(null);
  useEffect(() => {
    if (!a || !b) return;
    let live = true;
    void fetchZipRoute(a, b).then((route) => {
      if (live) setState({ key: `${a}-${b}`, route });
    });
    return () => {
      live = false;
    };
  }, [a, b]);
  const current = state && state.key === key ? state : null;
  return { route: current?.route ?? null, loading: !!key && !current, failed: !!current && !current.route, ready: !!key };
}

/** Keeps the saved move's `distance_miles` in sync with the real driving distance between its ZIPs. */
export function useSyncMoveDistance(
  move: { id: string; from_zip?: string; to_zip?: string; distance_miles?: number | null } | undefined,
  update: (id: string, miles: number) => void,
) {
  const id = move?.id;
  const a = zip5(move?.from_zip);
  const b = zip5(move?.to_zip);
  const stored = move?.distance_miles ?? null;
  useEffect(() => {
    if (!id || !a || !b) return;
    let live = true;
    void fetchZipRoute(a, b).then((r) => {
      if (live && r && r.miles !== stored) update(id, r.miles);
    });
    return () => {
      live = false;
    };
  }, [id, a, b, stored, update]);
}

export const formatDrive = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const days = Math.ceil(minutes / 60 / 9);
  return `${h}h ${minutes % 60}m driving${h >= 10 ? ` · ~${days} days at 9h/day` : ""}`;
};

/** Inline banner for the move form: computes driving miles from the ZIPs and writes `distance_miles`. */
export function MoveDistance({ fromZip, toZip, value, onChange }: { fromZip: unknown; toZip: unknown; value: unknown; onChange: (miles: number) => void }) {
  const { route, loading, failed, ready } = useZipRoute(fromZip, toZip);
  const miles = route?.miles ?? null;
  useEffect(() => {
    if (miles != null && miles !== value) onChange(miles);
    // Only react to a new route result; `value` changes from typing shouldn't re-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miles]);
  if (!ready) return <p className="rounded-xl bg-sand/60 px-3 py-2 text-xs text-ink/70">🛣️ Enter both ZIP codes and the distance fills in automatically.</p>;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-lime/40 px-3 py-2 text-sm">
      <span className="font-semibold">🛣️ {loading ? "Calculating driving distance…" : failed ? "Couldn’t calculate distance" : `${route!.miles.toLocaleString()} driving miles`}</span>
      {route && (
        <span className="text-xs text-ink/70">
          {route.from.city}, {route.from.state} → {route.to.city}, {route.to.state} · {formatDrive(route.minutes)} · {route.method === "road" ? "road route via OSRM" : "estimated from straight-line distance"}
        </span>
      )}
    </div>
  );
}
