import { useEffect, useState } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const RAIL_WIDTH = 84;
/** Width of the physical hinge between the two Duo screens when an app is spanned (dp). */
export const DUO_HINGE = 28;

export interface DuoLayout {
  width: number;
  height: number;
  landscape: boolean;
  /** Side navigation rail instead of bottom tabs. */
  rail: boolean;
  /** List on the left screen, detail on the right screen. */
  twoPane: boolean;
  /** True when the window spans both Duo screens, so content must avoid the hinge. */
  spanned: boolean;
  /** Width of the left (list) pane, excluding the rail. */
  leftPane: number;
  rightPane: number;
  gutter: number;
  columns: number;
}

/**
 * Layout rules for dual-screen phones (iPhone Duo / Surface Duo style) and regular phones.
 * - Single screen, portrait: bottom tabs, one column.
 * - Single screen, landscape or ≥700dp wide: side rail.
 * - Spanned across both screens (≥1000dp, or landscape ≥720dp): two panes split exactly at the hinge.
 */
export function computeDuoLayout(width: number, height: number): DuoLayout {
  const landscape = width > height;
  const rail = landscape || width >= 700;
  const spanned = width >= 1000;
  const twoPane = spanned || (landscape && width >= 720);
  const gutter = spanned ? DUO_HINGE : 12;
  const half = (width - gutter) / 2;
  const leftPane = twoPane ? half - (rail ? RAIL_WIDTH : 0) : width - (rail ? RAIL_WIDTH : 0);
  const rightPane = twoPane ? half : 0;
  const columns = leftPane >= 900 ? 4 : leftPane >= 640 ? 3 : leftPane >= 360 ? 2 : 1;
  return { width, height, landscape, rail, twoPane, spanned, leftPane, rightPane, gutter, columns };
}

export function useDuoLayout(): DuoLayout & { insets: ReturnType<typeof useSafeAreaInsets> } {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return { ...computeDuoLayout(width, height), insets };
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
