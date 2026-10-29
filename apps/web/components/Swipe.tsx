"use client";

import { SCHEMAS, type TableName } from "@moving/shared";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocalState } from "@/lib/hooks";
import { usePrefs } from "@/lib/prefs";
import { useStore } from "@/lib/store-context";
import { Glyph } from "./Symbols";

// ---------- hidden cards & rows (per device, managed in Settings) ----------

export interface HiddenCard {
  id: string;
  label: string;
  href: string;
}
export interface HiddenRow {
  table: TableName;
  id: string;
  label: string;
}

export function useHiddenCards() {
  const [cards, setCards] = useLocalState<HiddenCard[]>("hidden-cards", []);
  return {
    cards,
    isHidden: (id: string) => cards.some((c) => c.id === id),
    hide: (c: HiddenCard) => setCards([...cards.filter((x) => x.id !== c.id), c]),
    unhide: (id: string) => setCards(cards.filter((x) => x.id !== id)),
    clear: () => setCards([]),
  };
}

export function useHiddenRows() {
  const [rows, setRows] = useLocalState<HiddenRow[]>("hidden-rows", []);
  return {
    rows,
    isHidden: (table: TableName, id: string) => rows.some((r) => r.table === table && r.id === id),
    hide: (r: HiddenRow) => setRows([...rows.filter((x) => !(x.table === r.table && x.id === r.id)), r]),
    unhide: (table: TableName, id: string) => setRows(rows.filter((x) => !(x.table === table && x.id === id))),
    setAll: setRows,
    clear: () => setRows([]),
  };
}

// ---------- undo toast ----------

type Toast = { id: number; text: string; undo?: () => void };
let toast: Toast | null = null;
const toastListeners = new Set<() => void>();
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function showUndo(text: string, undo?: () => void) {
  toast = { id: Date.now(), text, undo };
  toastListeners.forEach((f) => f());
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast = null;
    toastListeners.forEach((f) => f());
  }, 6000);
}

const subscribeToast = (f: () => void) => {
  toastListeners.add(f);
  return () => toastListeners.delete(f);
};

export function UndoToast() {
  const t = useSyncExternalStore(
    subscribeToast,
    () => toast,
    () => null,
  );
  if (!t) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 lg:bottom-6" role="status">
      <div key={t.id} className="animate-pop pointer-events-auto flex max-w-md min-w-0 items-center gap-3 ink-panel rounded-2xl bg-ink py-2 pr-2 pl-4 text-sm text-white shadow-2xl">
        <span className="min-w-0 flex-1 truncate">{t.text}</span>
        {t.undo && (
          <button
            type="button"
            className="min-h-10 shrink-0 rounded-xl bg-white/10 px-3 font-semibold text-lime active:opacity-60"
            onClick={() => {
              t.undo?.();
              toast = null;
              toastListeners.forEach((f) => f());
            }}
          >
            Undo
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Delete a row with an Undo toast. */
export function useDeleteWithUndo() {
  const store = useStore();
  return useCallback(
    (table: TableName, id: string, label?: string) => {
      store.remove(table, id);
      showUndo(`Deleted ${label || SCHEMAS[table].singular.toLowerCase()}`, () => store.restore(table, id));
    },
    [store],
  );
}

// ---------- swipe-left gesture ----------

const OPEN_EVENT = "mt:swipe-open";

function useSwipe(width: number, enabled = true) {
  const myId = useId();
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const g = useRef<{ x: number; y: number; base: number; lock: "x" | "y" | null; moved: boolean; pid: number } | null>(null);
  const suppress = useRef(false);
  const press = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const open = offset !== 0 && !dragging;
  const reveal = useCallback(() => {
    setOffset(-width);
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: myId }));
  }, [width, myId]);

  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== myId) setOffset(0);
    };
    window.addEventListener(OPEN_EVENT, onOther);
    return () => window.removeEventListener(OPEN_EVENT, onOther);
  }, [myId]);

  const close = useCallback(() => setOffset(0), []);

  const handlers = enabled
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          g.current = { x: e.clientX, y: e.clientY, base: offset, lock: null, moved: false, pid: e.pointerId };
          clearTimeout(press.current);
          // Long-press (touch) is the non-swipe way to reach the same actions.
          if (e.pointerType !== "mouse" && offset === 0)
            press.current = setTimeout(() => {
              if (g.current && !g.current.lock) {
                g.current = null;
                suppress.current = true;
                navigator.vibrate?.(10);
                reveal();
              }
            }, 550);
        },
        onPointerMove: (e: React.PointerEvent) => {
          const s = g.current;
          if (!s || s.pid !== e.pointerId) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (!s.lock) {
            if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearTimeout(press.current);
            if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
              s.lock = "x";
              setDragging(true);
              (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            } else if (Math.abs(dy) > 8) {
              s.lock = "y";
              return;
            } else return;
          }
          if (s.lock !== "x") return;
          s.moved = true;
          const next = Math.min(0, Math.max(-width - 24, s.base + dx));
          setOffset(next);
        },
        onPointerUp: (e: React.PointerEvent) => {
          clearTimeout(press.current);
          const s = g.current;
          g.current = null;
          if (!s || s.pid !== e.pointerId) return;
          if (s.lock === "x" && s.moved) {
            suppress.current = true;
            setDragging(false);
            const shouldOpen = offset < -width / 2.5;
            setOffset(shouldOpen ? -width : 0);
            if (shouldOpen) window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: myId }));
          } else if (offset !== 0) {
            // Tapping an open row closes it instead of opening the row.
            suppress.current = true;
            setOffset(0);
          }
        },
        onPointerCancel: () => {
          clearTimeout(press.current);
          g.current = null;
          setDragging(false);
          setOffset((o) => (o < -width / 2.5 ? -width : 0));
        },
        onContextMenu: (e: React.MouseEvent) => {
          // iOS/Android fire this on long-press; we show our own actions instead of the browser menu.
          if (g.current || suppress.current) e.preventDefault();
        },
        onClickCapture: (e: React.MouseEvent) => {
          if (suppress.current) {
            suppress.current = false;
            e.preventDefault();
            e.stopPropagation();
          }
        },
      }
    : {};

  return { offset, dragging, open, close, reveal, handlers };
}

export interface SwipeAction {
  label: string;
  icon?: string;
  tone?: "danger" | "neutral";
  onClick: () => void;
}

const ACTION_W = 76;

function Actions({ actions, close, offset, width }: { actions: SwipeAction[]; close: () => void; offset: number; width: number }) {
  return (
    <div className="absolute inset-y-0 right-0 flex" style={{ width: Math.max(width, -offset) }} aria-hidden={offset === 0}>
      {actions.map((a, i) => (
        <button
          key={a.label}
          type="button"
          tabIndex={offset === 0 ? -1 : 0}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[13px] font-semibold text-white active:opacity-70 ${a.tone === "danger" ? "bg-red-500" : "bg-gray-500"} ${i === actions.length - 1 ? "pr-1" : ""}`}
          onClick={() => {
            close();
            a.onClick();
          }}
        >
          {a.icon && <span className="text-lg leading-none">{a.icon}</span>}
          {a.label}
        </button>
      ))}
    </div>
  );
}

/**
 * iOS-style row: swipe left (or long-press) to reveal actions (Hide, Delete…).
 * HIG Gestures/Accessibility: the same actions are also real buttons for VoiceOver and keyboard users.
 */
export function SwipeRow({ actions, children, className = "", radius = "rounded-2xl", label }: { actions: SwipeAction[]; children: ReactNode; className?: string; radius?: string; label?: string }) {
  const width = actions.length * ACTION_W;
  const { swipeRows } = usePrefs();
  const { offset, dragging, close, handlers } = useSwipe(width, actions.length > 0 && swipeRows);
  return (
    <div className={`relative touch-pan-y ${offset !== 0 ? "overflow-hidden" : ""} ${radius} ${className}`} {...handlers}>
      {offset !== 0 && <Actions actions={actions} close={close} offset={offset} width={width} />}
      {offset === 0 && actions.length > 0 && (
        <div className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:inset-y-0 focus-within:right-0 focus-within:z-10 focus-within:flex">
          {actions.map((a) => (
            <button key={a.label} type="button" className={`px-4 text-[13px] font-semibold text-white ${a.tone === "danger" ? "bg-red-500" : "bg-gray-500"}`} onClick={a.onClick}>
              {label ? `${a.label} ${label}` : a.label}
            </button>
          ))}
        </div>
      )}
      <div className={`relative ${dragging ? "" : "transition-transform duration-200 ease-out"}`} style={{ transform: offset ? `translateX(${offset}px)` : undefined }}>
        {children}
      </div>
    </div>
  );
}

// ---------- collapsible card ----------

/**
 * Card with a tappable header that collapses it (remembered per device) and a swipe-left "Hide" action.
 * Hidden cards are listed under Settings → Hidden cards & items.
 */
export function Card({
  id,
  title,
  icon,
  summary,
  right,
  tone = "card",
  className = "",
  bodyClassName = "mt-4",
  defaultOpen = true,
  hideable = true,
  children,
}: {
  id: string;
  title: ReactNode;
  icon?: string;
  /** Shown next to the title while collapsed (e.g. "4,200 lbs"). */
  summary?: ReactNode;
  /** Extra header controls (links, buttons). */
  right?: ReactNode;
  tone?: "card" | "card-ink" | "plain";
  className?: string;
  bodyClassName?: string;
  defaultOpen?: boolean;
  hideable?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useLocalState<boolean>(`card:${id}`, defaultOpen);
  const bodyId = useId();
  const hidden = useHiddenCards();
  const label = typeof title === "string" ? title : id;
  const width = ACTION_W;
  const { swipeCards } = usePrefs();
  const { offset, dragging, close, handlers } = useSwipe(width, hideable && swipeCards);
  if (hidden.isHidden(id)) return null;
  const ink = tone === "card-ink";
  const hide = () => {
    hidden.hide({ id, label, href: typeof window === "undefined" ? "/" : window.location.pathname });
    showUndo(`Hid “${label}” · find it in Settings`, () => hidden.unhide(id));
  };
  return (
    <div className={`relative rounded-[1.25rem] lg:rounded-[1.75rem] ${offset !== 0 ? "overflow-hidden" : ""} ${className}`}>
      {offset !== 0 && <Actions actions={[{ label: "Hide", icon: "🙈", onClick: hide }]} close={close} offset={offset} width={width} />}
      <section
        className={`relative ${tone === "plain" ? "" : tone} ${dragging ? "" : "transition-transform duration-200 ease-out"}`}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex min-h-10 min-w-[40%] flex-1 touch-pan-y items-center gap-2 text-left select-none"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen(!open)}
            {...handlers}
          >
            {icon && <span className="text-lg">{icon}</span>}
            <h2 className={`min-w-0 truncate font-display text-xl font-bold tracking-tight ${ink ? "text-white" : ""}`}>{title}</h2>
            {!open && summary != null && <span className={`ml-auto shrink-0 truncate text-sm font-semibold ${ink ? "text-lime" : "text-gray-500"}`}>{summary}</span>}
          </button>
          {open && right != null && <div className="flex min-w-0 shrink items-center">{right}</div>}
          {hideable && (
            <button type="button" className={`hidden h-8 shrink-0 rounded-full px-2.5 text-xs font-semibold opacity-60 hover:opacity-100 sm:[@media(hover:hover)]:inline-block ${ink ? "text-white" : "text-gray-500"}`} onClick={hide} title="Hide this card (restore in Settings)">
              Hide
            </button>
          )}
          <button
            type="button"
            aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
            aria-expanded={open}
            aria-controls={bodyId}
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition ${ink ? "bg-white/10 text-white" : "bg-ink/5 text-gray-600"}`}
            onClick={() => setOpen(!open)}
          >
            <Glyph name="chevron" className={`h-4 w-4 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} strokeWidth={2.4} />
          </button>
        </div>
        {open && (
          <div id={bodyId} className={`animate-fade ${bodyClassName}`}>
            {children}
          </div>
        )}
      </section>
    </div>
  );
}
