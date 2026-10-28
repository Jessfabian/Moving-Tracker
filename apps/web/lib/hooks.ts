"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

/** Wide/landscape layouts (desktop, tablets, unfolded dual-screen phones) get a side-by-side list + detail. */
export const useTwoPane = () => useMediaQuery("(min-width: 1180px), (min-width: 720px) and (orientation: landscape)");

const localListeners = new Set<() => void>();
const subscribeLocal = (fn: () => void) => {
  localListeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    localListeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
};

/** A small UI preference remembered on this device (sort order, filters, views). */
export function useLocalState<T>(key: string, fallback: T): [T, (v: T) => void] {
  const k = `mt:ui:${key}`;
  const raw = useSyncExternalStore(
    subscribeLocal,
    () => localStorage.getItem(k),
    () => null,
  );
  const value = useMemo<T>(() => {
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fallback is a literal default
  }, [raw]);
  const set = useCallback(
    (v: T) => {
      localStorage.setItem(k, JSON.stringify(v));
      for (const fn of localListeners) fn();
    },
    [k],
  );
  return [value, set];
}
