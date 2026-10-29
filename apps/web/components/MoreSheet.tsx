"use client";

import { daysUntil, formatDate, tripEnabled } from "@moving/shared";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { NAV_GROUPS } from "@/lib/nav";
import { useDb } from "@/lib/store-context";
import { NavPositionPicker } from "./NavPositionPicker";
import { useSheetFocus } from "./ui";

const GROUP_TINT: Record<string, string> = {
  Overview: "bg-sand",
  People: "bg-blush",
  Belongings: "bg-sage",
  Logistics: "bg-sky",
  More: "bg-lilac",
};

/**
 * iOS-style "More" menu: a light, inset-grouped list (like the Settings app) with 44pt+ rows.
 * Bottom-bar layouts get a sheet that slides up; the side-rail layout (closed iPhone Duo,
 * landscape) gets a panel beside the rail, like Apple's "…" overflow menu.
 */
export function MoreSheet({ onClose }: { onClose: () => void }) {
  const path = usePathname();
  const db = useDb();
  const move = db.moves[0];
  const d = daysUntil(move?.move_date);
  const showTrip = tripEnabled(move, db.travel ?? []);

  const ref = useRef<HTMLDivElement>(null);
  useSheetFocus(true, onClose, ref);

  return (
    <div ref={ref} className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-labelledby="more-sheet-title">
      <div className="animate-fade absolute inset-0 bg-black/25" onClick={onClose} />
      <div
        className="animate-sheet absolute inset-x-0 bottom-0 flex max-h-[calc(100dvh-max(2.5rem,env(safe-area-inset-top)))] flex-col overflow-hidden rounded-t-[1.75rem] bg-grouped shadow-2xl
          short:animate-pop short:inset-x-auto short:top-[max(0.5rem,env(safe-area-inset-top))] short:right-[calc(4.5rem+env(safe-area-inset-right))] short:bottom-[max(0.5rem,env(safe-area-inset-bottom))] short:max-h-none short:w-[min(22rem,calc(100vw-6rem))] short:rounded-[1.5rem]"
      >
        <div className="flex justify-center pt-2 short:hidden">
          <span className="h-1.5 w-10 rounded-full bg-black/15" />
        </div>
        <div className="flex items-center justify-between px-5 pt-2 pb-2 short:pt-4">
          <h2 id="more-sheet-title" data-sheet-title tabIndex={-1} className="text-[28px] leading-tight font-bold tracking-[-0.02em] text-ink outline-none">More</h2>
          <button onClick={onClose} className="h-11 rounded-full px-3 text-[17px] font-semibold text-accent active:opacity-60">
            Done
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {move && (
            <Link href="/move" onClick={onClose} className="ink-panel flex items-center gap-4 rounded-2xl bg-ink p-4 text-white active:opacity-80">
              <div className="flex flex-col items-center leading-none">
                <span className="font-display text-[34px] font-extrabold tracking-[-0.05em] text-lime">{d === null ? "—" : d > 0 ? d : "✓"}</span>
                <span className="mt-1 text-[11px] text-white/60">{d !== null && d > 0 ? (d === 1 ? "day" : "days") : ""}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[17px] font-semibold">{move.title}</div>
                <div className="truncate text-[13px] text-white/60">
                  {move.from_city || "?"} → {move.to_city || "?"}
                  {move.move_date ? ` · ${formatDate(move.move_date)}` : ""}
                </div>
              </div>
              <span className="text-xl text-white/40">›</span>
            </Link>
          )}

          {NAV_GROUPS.map((g) => {
            const items = g.items.filter((i) => i.href !== "/travel" || showTrip || path.startsWith("/travel"));
            return (
              <section key={g.title}>
                <h3 className="mb-1.5 px-4 text-[13px] font-normal text-gray-500">{g.title}</h3>
                <ul className="overflow-hidden rounded-2xl bg-white">
                  {items.map((i, idx) => {
                    const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
                    return (
                      <li key={i.href}>
                        <Link
                          href={i.href}
                          onClick={onClose}
                          aria-current={active ? "page" : undefined}
                          className="flex min-h-12 items-center gap-3 pl-4 active:bg-black/5"
                        >
                          <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg text-[17px] ${GROUP_TINT[g.title] ?? "bg-gray-100"}`}>{i.icon}</span>
                          <span className={`flex min-h-12 flex-1 items-center gap-2 pr-4 ${idx < items.length - 1 ? "border-b border-black/[0.08]" : ""}`}>
                            <span className={`flex-1 truncate text-[17px] ${active ? "font-semibold text-ink" : "text-ink"}`}>{i.label}</span>
                            {active && <span className="h-2 w-2 rounded-full bg-accent" />}
                            <span className="text-xl text-gray-300">›</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          <section>
            <h3 className="mb-1.5 px-4 text-[13px] font-normal text-gray-500">Navigation bar</h3>
            <div className="rounded-2xl bg-white p-3">
              <NavPositionPicker />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
