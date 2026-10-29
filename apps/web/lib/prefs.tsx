"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useLocalState } from "./hooks";

export type ThemePref = "auto" | "light" | "dark";

/** Device-level appearance & gesture settings (Settings → Appearance / Gestures). */
export function usePrefs() {
  const [theme, setTheme] = useLocalState<ThemePref>("theme", "auto");
  const [swipeCards, setSwipeCards] = useLocalState<boolean>("pref:swipe-cards", true);
  const [swipeRows, setSwipeRows] = useLocalState<boolean>("pref:swipe-rows", true);
  return { theme, setTheme, swipeCards, setSwipeCards, swipeRows, setSwipeRows };
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Whether the phone/computer itself is in Dark Mode right now. */
export function useSystemDark() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(DARK_QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
}

/** Keeps `<html class="dark">` and the browser chrome colour in step with the appearance setting. */
export function ThemeController() {
  const { theme } = usePrefs();
  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY);
    const apply = () => {
      const dark = theme === "dark" || (theme === "auto" && mq.matches);
      const root = document.documentElement;
      root.classList.toggle("dark", dark);
      root.style.colorScheme = dark ? "dark" : "light";
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? "#000000" : "#f3f1ec"));
    };
    apply();
    if (theme !== "auto") return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  return null;
}
