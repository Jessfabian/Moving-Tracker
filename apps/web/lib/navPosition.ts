"use client";

import { useSyncExternalStore } from "react";
import { NAV_POSITION_KEY as KEY } from "./navPositionScript";

export type NavPosition = "auto" | "side" | "bottom";

const listeners = new Set<() => void>();

function read(): NavPosition {
  try {
    const v = localStorage.getItem(KEY);
    return v === "side" || v === "bottom" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function setNavPosition(p: NavPosition) {
  try {
    if (p === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, p);
  } catch {}
  const cl = document.documentElement.classList;
  cl.remove("nav-side", "nav-bottom");
  if (p !== "auto") cl.add(`nav-${p}`);
  listeners.forEach((l) => l());
}

export function useNavPosition(): NavPosition {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => "auto",
  );
}
