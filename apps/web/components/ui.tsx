"use client";

import { usePathname } from "next/navigation";
import { Children, Fragment, isValidElement, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { NAV_GROUPS } from "@/lib/nav";
import { Glyph } from "./Symbols";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let openSheets = 0;

/**
 * HIG (Modality, Sheets, Accessibility): a sheet takes focus when it opens, keeps Tab inside itself,
 * closes with Escape (topmost sheet only), and hands focus back to whatever opened it.
 */
export function useSheetFocus(open: boolean, onClose: () => void, ref: RefObject<HTMLElement | null>) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const panel = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    if (panel && !panel.contains(document.activeElement)) panel.querySelector<HTMLElement>("[data-sheet-title]")?.focus({ preventScroll: true });
    const isTop = () => {
      const all = document.querySelectorAll('[aria-modal="true"]');
      return !!panel && all[all.length - 1]?.contains(panel);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!isTop()) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const f = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    openSheets++;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      openSheets = Math.max(0, openSheets - 1);
      if (!openSheets) document.body.style.overflow = "";
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, ref]);
}

const noop = () => () => {};

function Portal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return mounted ? createPortal(children, document.body) : null;
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <>
      <button type="button" className="hidden h-9 w-9 shrink-0 place-items-center rounded-full bg-ink/5 text-sm transition hover:bg-ink hover:text-white lg:grid" onClick={onClose} aria-label="Close">
        ✕
      </button>
      <button type="button" className="-mr-2 h-11 shrink-0 rounded-full px-3 text-[17px] font-semibold text-accent active:opacity-60 lg:hidden" onClick={onClose}>
        Close
      </button>
    </>
  );
}

function Grabber() {
  return (
    <div className="flex justify-center pt-2 lg:hidden short:hidden" aria-hidden>
      <span className="h-1.5 w-10 rounded-full bg-black/15" />
    </div>
  );
}

export function Drawer({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useSheetFocus(open, onClose, ref);
  if (!open) return null;
  return (
    <Portal>
    <div ref={ref} className="duo-sheet fixed inset-0 z-50 flex items-end justify-end p-0 sm:items-stretch sm:p-3 short:items-stretch short:p-0" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="duo-backdrop animate-fade absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`duo-panel animate-sheet relative flex h-[calc(100dvh-max(2.5rem,env(safe-area-inset-top)))] w-full flex-col overflow-hidden rounded-t-[1.75rem] bg-paper shadow-2xl sm:h-full sm:rounded-[1.75rem] sm:animate-none short:h-full short:animate-none short:rounded-none ${wide ? "max-w-3xl" : "max-w-xl"}`}>
        <Grabber />
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-3 sm:px-6 sm:pt-5">
          <h2 id={titleId} data-sheet-title tabIndex={-1} className="min-w-0 truncate font-display text-[22px] font-bold tracking-tight outline-none sm:text-2xl">{title}</h2>
          <CloseButton onClose={onClose} />
        </div>
        <div className="@container min-h-0 flex-1 overscroll-contain overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">{children}</div>
      </div>
    </div>
    </Portal>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useSheetFocus(open, onClose, ref);
  if (!open) return null;
  return (
    <Portal>
    <div ref={ref} className="duo-modal fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="animate-fade absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="@container animate-sheet relative max-h-[92dvh] w-full max-w-lg short:max-h-[96dvh] overscroll-contain overflow-y-auto rounded-t-[1.75rem] bg-paper px-5 pt-0 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[1.75rem] sm:p-6 sm:animate-none">
        <Grabber />
        <div className="mb-4 flex items-center justify-between gap-3 pt-3 sm:pt-0">
          <h2 id={titleId} data-sheet-title tabIndex={-1} className="min-w-0 truncate font-display text-[22px] font-bold tracking-tight outline-none sm:text-2xl">{title}</h2>
          <CloseButton onClose={onClose} />
        </div>
        {children}
      </div>
    </div>
    </Portal>
  );
}

const LEGACY_COLORS: Record<string, string> = {
  "bg-indigo-600": "bg-ink",
  "bg-indigo-500": "bg-ink",
  "bg-violet-500": "bg-accent",
  "bg-white": "bg-lime",
};

export function Progress({ value, color = "bg-ink" }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.max(0, Math.min(100, value)))}>
      <div className={`h-full rounded-full transition-all ${LEGACY_COLORS[color] ?? color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

const TILE_TONES = ["bg-sand", "bg-sky", "bg-sage", "bg-lilac", "bg-blush"];

function toneFor(label: string) {
  let h = 0;
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TILE_TONES[h % TILE_TONES.length];
}

export function Stat({ label, value, sub, icon, href, tone }: { label: string; value: ReactNode; sub?: ReactNode; icon?: string; href?: string; tone?: string }) {
  const body = (
    <div className={`tile flex h-full min-h-28 flex-col justify-between gap-3 ${tone ?? toneFor(label)}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow text-ink/60">{label}</span>
        {icon && <span className="text-lg opacity-80">{icon}</span>}
      </div>
      <div>
        <div className="font-display text-3xl leading-none font-bold tracking-tight">{value}</div>
        {sub && <div className="mt-1.5 text-xs text-ink/60">{sub}</div>}
      </div>
    </div>
  );
  return href ? (
    <a href={href} className="block">
      {body}
    </a>
  ) : (
    body
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="dot-grid flex flex-col items-center gap-3 rounded-[1.75rem] border border-dashed border-ink/15 px-6 py-14 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-3xl shadow-sm">{icon}</div>
      <div className="font-display text-2xl font-bold tracking-tight">{title}</div>
      {children && <div className="max-w-md text-sm text-gray-500">{children}</div>}
    </div>
  );
}

export function Chip({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span className="chip" style={color ? { background: `${color}1a`, color } : { background: "color-mix(in oklab, var(--color-ink) 7%, transparent)", color: "var(--color-ink)" }}>
      {children}
    </span>
  );
}

/** The switch graphic on its own (green when on, like iOS). */
export function SwitchKnob({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={`relative inline-block h-[31px] w-[51px] flex-none rounded-full transition-colors duration-200 ${on ? "bg-[#34c759]" : "bg-[#e9e9eb] dark-switch-off"}`}>
      <span className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-[#fff] shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)] transition-[left] duration-200 ${on ? "left-[22px]" : "left-[2px]"}`} />
    </span>
  );
}

/**
 * HIG Toggles: every on/off setting uses a switch. The whole row is the control, so it's an easy target,
 * and VoiceOver reads it as "<label>, switch, on/off".
 */
export function Toggle({ checked, onChange, label, description, disabled, className = "" }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex min-h-11 w-full items-center gap-3 py-1.5 text-left disabled:opacity-40 ${className}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] leading-snug text-gray-500">{description}</span>}
      </span>
      <SwitchKnob on={checked} />
    </button>
  );
}

function flatten(node: ReactNode): ReactNode[] {
  return Children.toArray(node).flatMap((c) => (isValidElement<{ children?: ReactNode }>(c) && c.type === Fragment ? flatten(c.props.children) : [c]));
}

const isButtonLike = (n: ReactNode) => isValidElement<{ className?: unknown }>(n) && typeof n.props.className === "string" && /\bbtn-/.test(n.props.className);

/** iOS pattern: keep the primary action visible on phones and tuck secondary actions into a "…" pull-down menu. */
function HeaderActions({ actions }: { actions: ReactNode }) {
  const [open, setOpen] = useState(false);
  const items = flatten(actions);
  const buttons = items.filter(isButtonLike);
  const collapse = buttons.length >= 3;
  const primary = collapse ? (buttons.find((b) => isValidElement<{ className: string }>(b) && /\bbtn-primary\b/.test(b.props.className)) ?? buttons[buttons.length - 1]) : null;
  const secondary = collapse ? buttons.filter((b) => b !== primary) : [];
  const others = collapse ? items.filter((i) => !isButtonLike(i)) : [];

  return (
    <>
      <div className={`flex-wrap gap-2 ${collapse ? "hidden lg:flex" : "flex"}`}>{actions}</div>
      {collapse && (
        <div className="relative flex w-full items-center gap-2 lg:hidden">
          {others}
          <div className="flex-1 [&>*]:w-full">{primary}</div>
          <button type="button" className="btn-secondary h-11 w-11 shrink-0 px-0! text-xl leading-none" aria-label="More actions" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            •••
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div className="ios-menu animate-pop absolute top-full right-0 z-50 mt-2 w-64 origin-top-right" role="menu" onClickCapture={() => setTimeout(() => setOpen(false))}>
                {secondary}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

export function PageHeader({ title, icon, subtitle, actions, eyebrow }: { title: string; icon?: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  const path = usePathname();
  const group = NAV_GROUPS.find((g) => g.items.some((i) => i.href !== "/" && path.startsWith(i.href)))?.title;
  const words = title.split(" ");
  const last = words.pop();
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 short:mb-4 short:gap-3">
      <div className="min-w-0 max-w-3xl">
        <div className="eyebrow flex items-center gap-2">
          {icon && <span className="grid h-6 w-6 place-items-center rounded-lg bg-white text-sm shadow-sm">{icon}</span>}
          {eyebrow ?? group ?? "Moving tracker"}
        </div>
        <h1 className="h1 mt-2 short:mt-1 short:text-[2rem]">
          {words.length ? `${words.join(" ")} ` : ""}
          <span className="highlight">{last}</span>
        </h1>
        {subtitle && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-gray-600 short:mt-1 short:text-sm">{subtitle}</p>}
      </div>
      {actions && <HeaderActions actions={actions} />}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  const move = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length];
    onChange(next.value);
    requestAnimationFrame(() => (e.currentTarget.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus());
  };
  return (
    <div className="no-scrollbar inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-ink/[0.06] p-1" role="radiogroup" aria-label={label} onKeyDown={move}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          tabIndex={value === o.value ? 0 : -1}
          onClick={() => onChange(o.value)}
          className={`min-h-9 shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap transition ${value === o.value ? "bg-ink text-white shadow-sm" : "text-gray-600 hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * HIG Search fields: magnifying glass, a placeholder that says what can be searched,
 * a clear (×) button once there is text, and a Search key on the keyboard.
 */
export function SearchField({ value, onChange, placeholder, label, className = "" }: { value: string; onChange: (v: string) => void; placeholder: string; label?: string; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <Glyph name="search" className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-gray-400" />
      <input
        type="search"
        role="searchbox"
        enterKeyHint="search"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-label={label ?? placeholder.replace(/…$/, "")}
        className="input search-input w-full pr-11! pl-10!"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape" && value) {
            e.stopPropagation();
            onChange("");
          }
        }}
      />
      {value && (
        <button type="button" className="absolute top-1/2 right-1 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-gray-400 active:opacity-60" aria-label="Clear search" onClick={() => onChange("")}>
          <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-gray-400 text-white">
            <Glyph name="xmark" className="h-3 w-3" strokeWidth={2.6} />
          </span>
        </button>
      )}
    </div>
  );
}
