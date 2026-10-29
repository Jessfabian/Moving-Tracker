import type { SVGProps } from "react";

/** Line icons drawn in the style of SF Symbols (regular weight, rounded caps) for the tab bar and side rail. */
const PATHS: Record<string, string> = {
  house: "M3.5 10.5 12 3.5l8.5 7M5.5 9v10.5h4.5v-6h4v6h4.5V9",
  calendar: "M4 6.5h16v13.5H4zM4 10.5h16M8.5 3.5v5M15.5 3.5v5",
  scan: "M4 8.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3M15.5 4h3A1.5 1.5 0 0 1 20 5.5v3M20 15.5v3a1.5 1.5 0 0 1-1.5 1.5h-3M8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3M8 8.5v7M11 8.5v7M13.5 8.5v7M16 8.5v7",
  box: "M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4zM3.5 7.5 12 11.5l8.5-4M12 11.5v9M7.75 5.5l8.5 4",
  more: "M6.5 12h.01M12 12h.01M17.5 12h.01",
  back: "M14.5 5 7.5 12l7 7",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.25 15.25 20 20",
  xmark: "M7 7l10 10M17 7 7 17",
  chevron: "M6.5 9.5 12 15l5.5-5.5",
  ellipsis: "M6.5 12h.01M12 12h.01M17.5 12h.01",
};

/** Decorative by default; pass `label` when the symbol is the only thing conveying meaning (HIG Icons / Accessibility). */
export function Glyph({ name, className = "h-6 w-6", label, ...rest }: { name: keyof typeof PATHS | string; label?: string } & SVGProps<SVGSVGElement>) {
  const d = PATHS[name];
  if (!d) return null;
  const dots = name === "more" || name === "ellipsis";
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={dots ? 3.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })} {...rest}>
      {name === "more" && <circle cx="12" cy="12" r="9.25" strokeWidth={1.8} />}
      <path d={d} />
    </svg>
  );
}
