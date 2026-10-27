"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NAV_GROUPS } from "@/lib/nav";

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
}

const noop = () => () => {};

function Portal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return mounted ? createPortal(children, document.body) : null;
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink/5 text-sm transition hover:bg-ink hover:text-white" onClick={onClose} aria-label="Close">
      ✕
    </button>
  );
}

export function Drawer({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <Portal>
    <div className="duo-sheet fixed inset-0 z-50 flex justify-end p-0 sm:p-3 short:p-0" role="dialog" aria-modal="true">
      <div className="duo-backdrop absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`duo-panel relative flex h-full w-full short:rounded-none flex-col overflow-hidden bg-paper shadow-2xl sm:rounded-[1.75rem] ${wide ? "max-w-3xl" : "max-w-xl"}`}>
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
          <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
          <CloseButton onClose={onClose} />
        </div>
        <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-6 pb-6">{children}</div>
      </div>
    </div>
    </Portal>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <Portal>
    <div className="duo-modal fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative max-h-[92dvh] w-full max-w-lg short:max-h-[96dvh] overscroll-contain overflow-y-auto rounded-t-[1.75rem] bg-paper p-6 shadow-2xl sm:rounded-[1.75rem]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
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
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
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
    <span className="chip" style={color ? { background: `${color}1a`, color } : { background: "rgba(13,13,15,.06)", color: "#0d0d0f" }}>
      {children}
    </span>
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
        {subtitle && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-gray-600 short:mt-1 short:line-clamp-1 short:text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-full bg-ink/[0.06] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${value === o.value ? "bg-ink text-white shadow-sm" : "text-gray-600 hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}