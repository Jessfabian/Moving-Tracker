"use client";

import { useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useSheetFocus } from "./ui";

/**
 * HIG Alerts / Action sheets: an app-styled replacement for window.confirm().
 * Short title, optional message, a specific verb for the action (never "OK"/"Yes"),
 * destructive actions in red, and Cancel always available (Escape or tapping outside).
 */
export interface ConfirmOptions {
  title: string;
  message?: string;
  confirm: string;
  cancel?: string;
  destructive?: boolean;
  /** Secondary, non-destructive choice. Resolves to "alt". */
  alt?: string;
}

type Pending = ConfirmOptions & { id: number; resolve: (v: boolean | "alt") => void };
let pending: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

export function askConfirm(opts: ConfirmOptions & { alt: string }): Promise<boolean | "alt">;
export function askConfirm(opts: ConfirmOptions): Promise<boolean>;
export function askConfirm(opts: ConfirmOptions): Promise<boolean | "alt"> {
  pending?.resolve(false);
  return new Promise((resolve) => {
    pending = { ...opts, id: Date.now(), resolve };
    emit();
  });
}

function finish(v: boolean | "alt") {
  const p = pending;
  pending = null;
  emit();
  p?.resolve(v);
}

function Dialog({ p }: { p: Pending }) {
  const ref = useRef<HTMLDivElement>(null);
  useSheetFocus(true, () => finish(false), ref);
  const row = "flex min-h-12 w-full items-center justify-center px-4 text-[17px] active:bg-black/5";
  return (
    <div ref={ref} className="fixed inset-0 z-[70] flex items-end justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={p.message ? "confirm-msg" : undefined}>
      <div className="animate-fade absolute inset-0 bg-black/30" onClick={() => finish(false)} />
      <div className="animate-pop relative w-full max-w-sm space-y-2">
        <div className="overflow-hidden rounded-2xl bg-white/95 text-center shadow-2xl backdrop-blur-xl">
          <div className="px-5 pt-4 pb-3">
            <h2 id="confirm-title" data-sheet-title tabIndex={-1} className="text-[15px] font-semibold text-ink outline-none">
              {p.title}
            </h2>
            {p.message && (
              <p id="confirm-msg" className="mt-1 text-[13px] leading-snug text-gray-500">
                {p.message}
              </p>
            )}
          </div>
          <button type="button" className={`${row} border-t border-black/10 font-semibold ${p.destructive ? "text-red-600" : "text-accent"}`} onClick={() => finish(true)}>
            {p.confirm}
          </button>
          {p.alt && (
            <button type="button" className={`${row} border-t border-black/10 text-accent`} onClick={() => finish("alt")}>
              {p.alt}
            </button>
          )}
        </div>
        <button type="button" className={`${row} rounded-2xl bg-white font-semibold text-accent shadow-2xl`} onClick={() => finish(false)}>
          {p.cancel ?? "Cancel"}
        </button>
      </div>
    </div>
  );
}

export function ConfirmHost() {
  const p = useSyncExternalStore(
    subscribe,
    () => pending,
    () => null,
  );
  return p ? createPortal(<Dialog key={p.id} p={p} />, document.body) : null;
}
