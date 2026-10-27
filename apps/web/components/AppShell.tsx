"use client";

import { daysUntil, formatDate, tripEnabled } from "@moving/shared";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { MOBILE_TABS, NAV_GROUPS } from "@/lib/nav";
import { useApp, useDb, useSyncStatus } from "@/lib/store-context";
import { CloudGate } from "./CloudGate";
import { useSyncMoveDistance } from "./MoveDistance";

function SyncBadge({ dark }: { dark?: boolean }) {
  const status = useSyncStatus();
  if (!status) return null;
  const base = `chip ${dark ? "bg-white/10 text-white/80" : "bg-ink/5 text-gray-700"}`;
  const dot = (c: string) => <span className={`h-1.5 w-1.5 rounded-full ${c}`} />;
  if (status.mode === "local")
    return (
      <span className={base} title="Data is stored on this device only">
        {dot("bg-gray-400")} On this device
      </span>
    );
  if (status.error)
    return (
      <span className={base} title={status.error}>
        {dot("bg-red-500")} Sync error
      </span>
    );
  if (status.syncing) return <span className={base}>{dot("animate-pulse bg-sky-400")} Syncing…</span>;
  if (status.pending) return <span className={base}>{dot("bg-amber-400")} {status.pending} unsynced</span>;
  return <span className={base}>{dot("bg-emerald-400")} Synced</span>;
}

function Logo({ dark }: { dark?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${dark ? "bg-lime text-ink" : "bg-ink text-lime"}`}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden>
          <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
          <path d="M3 7.5 12 12l9-4.5M12 12v9" />
        </svg>
      </span>
      <span className="font-display text-[1.15rem] leading-none font-extrabold tracking-[-0.04em]">
        moving<span className="text-accent">.</span>tracker
      </span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const db = useDb();
  const showTrip = tripEnabled(db.moves[0], db.travel ?? []);
  return (
    <nav className="space-y-6">
      {NAV_GROUPS.map((g) => (
        <div key={g.title}>
          <div className="mb-2 px-3 text-[10px] font-semibold tracking-[0.18em] text-white/35 uppercase">{g.title}</div>
          <div className="space-y-0.5">
            {g.items.filter((i) => i.href !== "/travel" || showTrip || path.startsWith("/travel")).map((i) => {
              const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={onNavigate}
                  className={`group flex items-center gap-3 rounded-full px-3 py-2 text-[13.5px] font-medium transition-all ${
                    active ? "bg-white text-ink" : "text-white/65 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[13px] transition ${active ? "bg-ink/5" : "grayscale-[0.4] group-hover:grayscale-0"}`}>{i.icon}</span>
                  <span className="flex-1 truncate">{i.label}</span>
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function DistanceSync() {
  const db = useDb();
  const { store } = useApp();
  const update = useCallback((id: string, miles: number) => void store?.update("moves", id, { distance_miles: miles }), [store]);
  useSyncMoveDistance(store ? db.moves[0] : undefined, update);
  return null;
}

function Countdown() {
  const db = useDb();
  const move = db.moves[0];
  const d = daysUntil(move?.move_date);
  if (!move) return null;
  return (
    <Link href="/move" className="dot-grid relative block flex-none overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <div className="text-[10px] font-semibold tracking-[0.18em] text-white/45 uppercase">{move.title}</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-display text-5xl leading-none font-extrabold tracking-[-0.06em] text-lime">{d === null ? "—" : d > 0 ? d : d === 0 ? "0" : "✓"}</span>
        <span className="text-sm text-white/70">{d === null ? "set a date" : d > 0 ? (d === 1 ? "day to go" : "days to go") : d === 0 ? "moving day" : "moved"}</span>
      </div>
      <div className="mt-3 truncate text-xs text-white/55">
        {move.from_city || "?"} → {move.to_city || "?"}
        {move.move_date ? ` · ${formatDate(move.move_date)}` : ""}
      </div>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { ready, store } = useApp();
  const db = useDb();
  const path = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);

  const needsSetup = !!store && store.loaded && db.moves.length === 0 && path !== "/setup" && path !== "/settings";
  useEffect(() => {
    if (needsSetup) router.replace("/setup");
  }, [needsSetup, router]);

  if (!ready) return <div className="flex min-h-screen items-center justify-center text-gray-500">Loading…</div>;

  return (
    <CloudGate>
      <DistanceSync />
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-[16.5rem] flex-none flex-col gap-6 overflow-y-auto bg-ink px-4 py-5 text-white lg:flex [&>*]:flex-none">
          <div className="px-2">
            <Logo dark />
          </div>
          <Countdown />
          <NavLinks />
          <div className="mt-auto px-2">
            <SyncBadge dark />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center justify-between bg-paper/80 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl lg:hidden short:hidden">
            <Logo />
            <SyncBadge />
          </header>
          <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pt-3 pb-32 sm:px-6 lg:px-10 lg:pt-10 lg:pb-14 short:pt-[max(0.75rem,env(safe-area-inset-top))] short:pb-6 short:pr-[calc(5.5rem+env(safe-area-inset-right))] short:pl-[max(1.5rem,env(safe-area-inset-left))]">{store ? children : <div className="text-gray-500">Loading your move…</div>}</main>
        </div>

        <nav aria-label="Main" className="duo-tabbar fixed inset-x-3 bottom-3 z-40 mb-[env(safe-area-inset-bottom)] grid grid-cols-5 gap-1 rounded-full bg-ink p-1.5 shadow-[0_18px_40px_-14px_rgba(13,13,15,0.6)] lg:hidden short:hidden">
          {MOBILE_TABS.map((t) => {
            const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex flex-col items-center rounded-full py-1.5 text-[10.5px] font-semibold transition ${active ? "bg-lime text-ink" : "text-white/60"}`}
              >
                <span className="text-lg leading-6">{t.icon}</span>
                {t.label}
              </Link>
            );
          })}
          <button onClick={() => setMenu(true)} className="flex flex-col items-center rounded-full py-1.5 text-[10.5px] font-semibold text-white/60">
            <span className="text-lg leading-6">☰</span>
            More
          </button>
        </nav>

        {/* Outer display / landscape phone: tab bar on the trailing edge, keeping the short screen's height for content. */}
        <nav
          aria-label="Main"
          className="fixed inset-y-2 right-2 z-40 mr-[env(safe-area-inset-right)] hidden w-[4.5rem] flex-col justify-center gap-1 rounded-[2rem] bg-ink p-1.5 shadow-[0_18px_40px_-14px_rgba(13,13,15,0.6)] short:flex"
        >
          {MOBILE_TABS.map((t) => {
            const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-label={t.label}
                className={`flex flex-1 flex-col items-center justify-center rounded-[1.4rem] text-[10px] leading-tight font-semibold transition ${active ? "bg-lime text-ink" : "text-white/60"}`}
              >
                <span className="text-lg leading-5">{t.icon}</span>
                {t.label}
              </Link>
            );
          })}
          <button onClick={() => setMenu(true)} className="flex flex-1 flex-col items-center justify-center rounded-[1.4rem] text-[10px] leading-tight font-semibold text-white/60">
            <span className="text-lg leading-5">☰</span>
            More
          </button>
        </nav>

        {menu && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setMenu(false)} />
            <div className="absolute inset-y-0 left-0 w-[18rem] space-y-6 overflow-y-auto bg-ink p-4 pt-[max(1rem,env(safe-area-inset-top))] pl-[max(1rem,env(safe-area-inset-left))] text-white shadow-2xl short:right-0 short:left-auto short:pr-[calc(1rem+env(safe-area-inset-right))]">
              <Logo dark />
              <Countdown />
              <NavLinks onNavigate={() => setMenu(false)} />
            </div>
          </div>
        )}
      </div>
    </CloudGate>
  );
}