"use client";

/**
 * One multi-select system for every list (inventory, books, boxes, labels…), modelled on
 * iOS edit mode: tap "Select", tap rows to check them (filled circle + checkmark, not just
 * color), a header with a tri-state "Select All" (dash when some are picked), Clear and Done,
 * and a bottom bar with the actions. After an action the affected rows are unchecked.
 */
import type { TableName } from "@moving/shared";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/store-context";
import { showUndo, SwipeRow, useHiddenRows, type SwipeAction } from "./Swipe";
import { useSheetFocus } from "./ui";

export interface Selection {
  active: boolean;
  /** Pickers (e.g., labels) are always selecting — no Select/Done buttons. */
  alwaysOn: boolean;
  ids: string[];
  count: number;
  total: number;
  all: boolean;
  some: boolean;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  /** Check or uncheck a group of rows at once (e.g., everything in one room). */
  setMany: (ids: string[], on: boolean) => void;
  selectAll: () => void;
  clear: () => void;
  /** Uncheck just these rows (after they've been edited). */
  release: (ids: string[]) => void;
  start: () => void;
  done: () => void;
}

/** `visibleIds` = the rows currently on screen; only those can be selected. */
export function useSelection(visibleIds: string[], opts: { alwaysOn?: boolean } = {}): Selection {
  const [on, setOn] = useState(!!opts.alwaysOn);
  const [picked, setPicked] = useState<string[]>([]);
  const key = visibleIds.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visible = useMemo(() => new Set(visibleIds), [key]);
  const ids = useMemo(() => picked.filter((id) => visible.has(id)), [picked, visible]);
  const set = useMemo(() => new Set(ids), [ids]);
  const total = visible.size;
  const active = on || !!opts.alwaysOn;

  const toggle = useCallback((id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])), []);
  const setMany = useCallback(
    (list: string[], value: boolean) =>
      setPicked((p) => {
        const s = new Set(p);
        for (const id of list) {
          if (value) s.add(id);
          else s.delete(id);
        }
        return [...s];
      }),
    [],
  );
  const release = useCallback((list: string[]) => setPicked((p) => p.filter((id) => !list.includes(id))), []);

  return {
    active,
    alwaysOn: !!opts.alwaysOn,
    ids,
    count: ids.length,
    total,
    all: total > 0 && ids.length === total,
    some: ids.length > 0 && ids.length < total,
    has: (id) => set.has(id),
    toggle,
    setMany,
    selectAll: () => setPicked([...visible]),
    clear: () => setPicked([]),
    release,
    start: () => setOn(true),
    done: () => {
      setOn(false);
      setPicked([]);
    },
  };
}

/** The round check shown on each row while selecting. Checked = filled + ✓, mixed = filled + –. */
export function SelectCircle({ on, mixed, className = "" }: { on: boolean; mixed?: boolean; className?: string }) {
  const filled = on || mixed;
  return (
    <span
      aria-hidden
      className={`flex h-6 w-6 flex-none items-center justify-center rounded-full transition-colors duration-150 ${filled ? "bg-accent text-white shadow-[0_2px_6px_-2px_rgba(255,90,31,0.8)]" : "bg-white ring-2 ring-inset ring-gray-300"} ${className}`}
    >
      {mixed && !on ? (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
          <path d="M4 8h8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      ) : on ? (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  );
}

/** A tappable check (its own button) for rows where tapping the row itself does something else. */
export function SelectToggle({ sel, id, label, className = "" }: { sel: Selection; id: string; label: string; className?: string }) {
  const on = sel.has(id);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={`Select ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        sel.toggle(id);
      }}
      className={`flex min-h-11 min-w-11 flex-none items-center justify-center active:scale-90 ${className}`}
    >
      <SelectCircle on={on} />
    </button>
  );
}

/** Tri-state checkbox for a group (e.g., a room heading): checks/unchecks every row in it. */
export function GroupToggle({ sel, ids, label }: { sel: Selection; ids: string[]; label: string }) {
  const n = ids.filter((id) => sel.has(id)).length;
  const all = ids.length > 0 && n === ids.length;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={all ? true : n ? "mixed" : false}
      aria-label={`Select all in ${label}`}
      onClick={() => sel.setMany(ids, !all)}
      className="flex min-h-11 min-w-11 flex-none items-center justify-center active:scale-90"
    >
      <SelectCircle on={all} mixed={n > 0} />
    </button>
  );
}

/**
 * Start button + sticky selection header. Shows "Select" when idle; while selecting shows
 * [◯ Select All] · "3 of 20" · Clear · Done.
 */
export function SelectBar({ sel, noun = "item", className = "", startLabel = "Select", sticky = true }: { sel: Selection; noun?: string; className?: string; startLabel?: string; sticky?: boolean }) {
  if (!sel.active) {
    return (
      <button type="button" className={`btn-secondary ${className}`} onClick={sel.start} disabled={!sel.total}>
        <SelectCircle on={false} className="h-[18px] w-[18px]" /> {startLabel}
      </button>
    );
  }
  const plural = (n: number) => `${n} ${noun}${n === 1 ? "" : "s"}`;
  return (
    <div
      className={`${sticky ? "sticky top-14 z-20 short:top-2 lg:top-2" : ""} flex min-h-12 items-center gap-1 rounded-2xl bg-white/90 p-1 pr-1.5 shadow-[0_8px_24px_-12px_rgba(13,13,15,0.35)] ring-1 ring-ink/5 backdrop-blur-xl ${className}`}
      role="toolbar"
      aria-label="Selection"
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={sel.all ? true : sel.some ? "mixed" : false}
        onClick={sel.all ? sel.clear : sel.selectAll}
        className="flex min-h-10 items-center gap-2 rounded-xl px-2 text-[15px] font-semibold active:bg-ink/5"
      >
        <SelectCircle on={sel.all} mixed={sel.some} />
        <span className="whitespace-nowrap">{sel.all ? "Deselect All" : "Select All"}</span>
      </button>
      <span className="min-w-0 flex-1 truncate text-center text-[13px] text-gray-500" aria-live="polite">
        {sel.count ? `${sel.count} of ${sel.total}` : `0 of ${plural(sel.total)}`}
      </span>
      <button type="button" className="min-h-10 rounded-xl px-2.5 text-[15px] font-medium text-gray-600 active:bg-ink/5 disabled:opacity-30" disabled={!sel.count} onClick={sel.clear}>
        Clear
      </button>
      {!sel.alwaysOn && (
        <button type="button" className="min-h-10 rounded-xl bg-ink px-3.5 text-[15px] font-semibold text-white active:opacity-70" onClick={sel.done}>
          Done
        </button>
      )}
    </div>
  );
}

/** Select All / Clear header for simple always-on pick lists that keep their own state. */
export function PickAll({ count, total, onAll, onClear, noun = "item", className = "" }: { count: number; total: number; onAll: () => void; onClear: () => void; noun?: string; className?: string }) {
  if (!total) return null;
  const all = count === total;
  return (
    <div className={`flex min-h-11 items-center gap-1 rounded-2xl bg-ink/[0.04] p-1 pr-1.5 ${className}`} role="toolbar" aria-label="Selection">
      <button type="button" role="checkbox" aria-checked={all ? true : count ? "mixed" : false} onClick={all ? onClear : onAll} className="flex min-h-10 items-center gap-2 rounded-xl px-2 text-[15px] font-semibold active:bg-ink/5">
        <SelectCircle on={all} mixed={count > 0} />
        <span className="whitespace-nowrap">{all ? "Deselect All" : "Select All"}</span>
      </button>
      <span className="min-w-0 flex-1 truncate text-center text-[13px] text-gray-500">
        {count} of {total} {noun}
        {total === 1 ? "" : "s"}
      </span>
      <button type="button" className="min-h-10 rounded-xl px-2.5 text-[15px] font-medium text-gray-600 active:bg-ink/5 disabled:opacity-30" disabled={!count} onClick={onClear}>
        Clear
      </button>
    </div>
  );
}

/**
 * Bottom toolbar while selecting (HIG Toolbars + Action sheets): a slim, solid bar docked to the
 * bottom edge that only shows once something is picked — "3 books selected · Actions". Actions opens a
 * sheet from the bottom, so the list stays readable instead of being covered by a big panel.
 */
export function SelectActions({ sel, children, summary, noun = "item" }: { sel: Selection; children: ReactNode; summary?: ReactNode; noun?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const show = open && sel.active && sel.count > 0;
  useSheetFocus(show, close, ref);
  if (!sel.active || !sel.count) return null;
  const label = `${sel.count} ${noun}${sel.count === 1 ? "" : "s"} selected`;
  return (
    <>
      <div className="h-16" aria-hidden />
      <div
        className="fixed inset-x-[max(0.75rem,env(safe-area-inset-left))] bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-xl short:right-[calc(4.5rem+env(safe-area-inset-right))] short:bottom-[max(0.75rem,env(safe-area-inset-bottom))] lg:bottom-4 lg:left-[18.5rem] lg:right-10"
        role="toolbar"
        aria-label={`Actions for ${label}`}
      >
        <div className="ink-panel animate-pop flex min-h-14 items-center gap-2 rounded-2xl bg-ink p-1.5 pl-4 text-white shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)]">
          <span className="min-w-0 flex-1 truncate text-[15px]" aria-live="polite">
            <b>{sel.count}</b> {noun}
            {sel.count === 1 ? "" : "s"} selected
          </span>
          <button type="button" className="min-h-11 shrink-0 rounded-xl bg-white px-4 text-[15px] font-semibold text-ink active:opacity-70" aria-haspopup="dialog" onClick={() => setOpen(true)}>
            Actions
          </button>
        </div>
      </div>
      {show &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-end justify-center" role="presentation">
            <button type="button" aria-label="Close actions" tabIndex={-1} className="animate-fade absolute inset-0 bg-black/40" onClick={close} />
            <div
              ref={ref}
              role="dialog"
              aria-modal="true"
              aria-label={label}
              className="ink-panel animate-sheet relative w-full max-w-xl rounded-t-3xl bg-ink p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-white shadow-2xl"
              onClickCapture={(e) => {
                if ((e.target as HTMLElement).closest("button")) setTimeout(close, 0);
              }}
              onChangeCapture={(e) => {
                if ((e.target as HTMLElement).tagName === "SELECT") setTimeout(close, 0);
              }}
            >
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/25" aria-hidden />
              <div className="mb-3 flex items-center gap-2">
                <h2 data-sheet-title tabIndex={-1} className="min-w-0 flex-1 truncate text-[17px] font-semibold outline-none">
                  {label}
                  {summary}
                </h2>
                <button type="button" className="min-h-10 rounded-xl px-3 text-[15px] font-semibold text-white/80 active:bg-white/10" onClick={close}>
                  Cancel
                </button>
              </div>
              {children}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Apply one change to every selected row, confirm it, offer Undo, and uncheck those rows. */
export function useBulkUpdate<T extends object>(table: TableName, sel: Selection, noun = "item") {
  const store = useStore();
  return useCallback(
    (patch: Partial<T>, what?: string) => {
      const ids = sel.ids;
      if (!ids.length) return;
      const keys = Object.keys(patch);
      const before = ids.map((id) => {
        const row = store.get(table, id) as Record<string, unknown> | undefined;
        return { id, prev: Object.fromEntries(keys.map((k) => [k, row?.[k] ?? null])) };
      });
      for (const id of ids) store.update(table, id, patch as never, { silent: true });
      sel.release(ids);
      const n = `${ids.length} ${noun}${ids.length === 1 ? "" : "s"}`;
      showUndo(`✓ ${what ? `${what} · ` : "Updated "}${n}`, () => {
        for (const b of before) store.update(table, b.id, b.prev as never, { silent: true });
      });
    },
    [store, table, sel, noun],
  );
}

/** Delete every selected row (with Undo). */
export function useBulkDelete(table: TableName, sel: Selection, noun = "item") {
  const store = useStore();
  return useCallback(() => {
    const ids = sel.ids;
    if (!ids.length) return;
    for (const id of ids) store.remove(table, id);
    sel.release(ids);
    showUndo(`Deleted ${ids.length} ${noun}${ids.length === 1 ? "" : "s"}`, () => {
      for (const id of ids) store.restore(table, id);
    });
  }, [store, table, sel, noun]);
}

/** Hide every selected row on this device (restore from Settings → Hidden), with Undo. */
export function useBulkHide(table: TableName, sel: Selection, labelOf: (id: string) => string, noun = "item") {
  const hidden = useHiddenRows();
  return useCallback(() => {
    const ids = sel.ids;
    if (!ids.length) return;
    const before = hidden.rows;
    hidden.setAll([...before.filter((h) => !(h.table === table && ids.includes(h.id))), ...ids.map((id) => ({ table, id, label: labelOf(id) }))]);
    sel.release(ids);
    showUndo(`Hid ${ids.length} ${noun}${ids.length === 1 ? "" : "s"} · find them in Settings`, () => hidden.setAll(before));
  }, [hidden, table, sel, labelOf, noun]);
}

/** Standard look for buttons/pickers inside <SelectActions>. */
export const BULK_BTN = "min-h-11 min-w-0 truncate rounded-xl bg-white/15 px-3 font-semibold";
export const BULK_PRIMARY = "min-h-11 min-w-0 truncate rounded-xl bg-white px-3 font-semibold text-ink";
export const BULK_DANGER = "min-h-11 min-w-0 rounded-xl bg-red-600 px-3 font-semibold";

/**
 * The one list-row pattern used on every page (HIG Lists and tables, edit mode):
 *  - normally: tap opens the row; swipe left (or press and hold) for Hide / Delete;
 *  - while selecting: a check circle appears on the left and tapping anywhere on the row checks it.
 */
export function SelectableRow({
  sel,
  id,
  label,
  actions = [],
  radius = "rounded-2xl",
  className = "",
  children,
}: {
  sel?: Selection;
  id: string;
  label: string;
  actions?: SwipeAction[];
  radius?: string;
  className?: string;
  children: ReactNode;
}) {
  const selecting = !!sel?.active;
  const on = selecting && sel!.has(id);
  return (
    <SwipeRow actions={selecting ? [] : actions} label={label} radius={radius} className={className}>
      <div className="relative flex items-center">
        {selecting && (
          <span className="flex w-10 shrink-0 justify-center">
            <SelectCircle on={on} />
          </span>
        )}
        <div className={`min-w-0 flex-1 ${radius} transition-shadow ${on ? "ring-2 ring-accent" : ""}`} inert={selecting || undefined}>
          {children}
        </div>
        {selecting && <button type="button" role="checkbox" aria-checked={on} aria-label={`Select ${label}`} onClick={() => sel!.toggle(id)} className={`absolute inset-0 z-10 ${radius} active:bg-ink/5`} />}
      </div>
    </SwipeRow>
  );
}
