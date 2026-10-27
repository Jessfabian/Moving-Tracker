"use client";

import { useEffect, useState } from "react";

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
