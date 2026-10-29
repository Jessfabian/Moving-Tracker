"use client";

import { personName, type ChangeEvent } from "@moving/shared";
import { useEffect, useRef, useState } from "react";
import { useApp, useDb } from "@/lib/store-context";

type Toast = { id: number; kind: "saved" | "remote"; text: string; sub: string; state: "saving" | "shared" | "local" | "error" | "info"; since?: string | null };

const VERB: Record<string, string> = { created: "added", updated: "updated", deleted: "removed" };

/** "Saved ✓" after every save, then "Shared with the family ✓" once the cloud has it. Also shows the other person's changes. */
export function SyncToaster() {
  const { store, settings } = useApp();
  const db = useDb();
  const [toast, setToast] = useState<Toast | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const familyRef = useRef(db.family_members);
  useEffect(() => {
    familyRef.current = db.family_members;
  }, [db.family_members]);

  useEffect(() => {
    if (!store) return;
    let n = 0;
    const show = (t: Omit<Toast, "id">, ms: number) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setToast({ ...t, id: ++n });
      hideTimer.current = setTimeout(() => setToast(null), ms);
    };
    const off = store.onChange((e: ChangeEvent) => {
      if (e.source === "remote") {
        show({ kind: "remote", text: `${personName(e.actor, familyRef.current)} ${VERB[e.action] ?? "changed"} ${e.label.replace(/^[^:]+:\s*/, "")}`, sub: "Just now on their phone", state: "info" }, 5000);
        return;
      }
      const cloud = store.status.mode === "cloud";
      show(
        {
          kind: "saved",
          text: e.action === "deleted" ? "Removed" : "Saved",
          sub: cloud ? "Sharing with your family…" : "Saved on this device",
          state: cloud ? "saving" : "local",
          since: store.status.lastSync,
        },
        cloud ? 12000 : 2500,
      );
    });
    // Upgrade the "Saved" toast once the sync that carries it finishes.
    const offStatus = store.subscribe(() => {
      setToast((t) => {
        if (!t || t.kind !== "saved" || t.state !== "saving") return t;
        const st = store.status;
        if (st.syncing) return t;
        let next: Toast;
        if (typeof navigator !== "undefined" && !navigator.onLine) next = { ...t, state: "local", sub: "Saved on this phone — will share when you're back online" };
        else if (st.lastSync === t.since) return t;
        else if (st.error) next = { ...t, state: "error", sub: "Saved on this phone — couldn't reach the family copy yet. It will keep trying." };
        else next = { ...t, state: "shared", sub: "Shared with your family ✓" };
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setToast(null), next.state === "shared" ? 2200 : 5000);
        return next;
      });
    });
    return () => {
      off();
      offStatus();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [store, settings.mode]);

  if (!toast) return null;
  const icon = toast.kind === "remote" ? "👋" : toast.state === "error" ? "⚠️" : toast.state === "saving" ? null : "✓";
  const tone = toast.state === "error" ? "bg-amber-500" : toast.kind === "remote" ? "bg-sky-500" : "bg-emerald-500";
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] flex justify-center px-4" role="status" aria-live="polite">
      <div key={toast.id} className="animate-fade pointer-events-auto flex max-w-[22rem] items-center gap-3 rounded-2xl bg-ink/95 px-4 py-3 text-white shadow-[0_18px_40px_-14px_rgba(13,13,15,0.7)] backdrop-blur" onClick={() => setToast(null)}>
        <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-sm font-bold ${tone}`}>{icon ?? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{toast.text}</p>
          <p className="text-xs text-white/70">{toast.sub}</p>
        </div>
      </div>
    </div>
  );
}

const THRESHOLD = 70;

/** Pull down from the top of any page to fetch the latest changes from the family. */
export function PullToRefresh() {
  const { store } = useApp();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!store) return;
    let startY: number | null = null;
    let dist = 0;
    const scrolledInside = (el: EventTarget | null) => {
      for (let n = el as HTMLElement | null; n && n !== document.body; n = n.parentElement) {
        if (n.closest?.('[role="dialog"]')) return true;
        if (n.scrollTop > 0) return true;
      }
      return false;
    };
    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || e.touches.length !== 1 || scrolledInside(e.target)) return;
      startY = e.touches[0]!.clientY;
      dist = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (startY == null) return;
      const dy = e.touches[0]!.clientY - startY;
      if (dy <= 0 || window.scrollY > 0) {
        dist = 0;
        setPull(0);
        return;
      }
      dist = Math.min(120, dy * 0.5);
      setPull(dist);
    };
    const onEnd = async () => {
      if (startY == null) return;
      startY = null;
      const go = dist >= THRESHOLD * 0.75;
      setPull(0);
      if (!go) return;
      setBusy(true);
      if (store.status.mode === "cloud") store.restartRealtime();
      await store.sync();
      setBusy(false);
      setDone(
        store.status.mode !== "cloud"
          ? "Up to date"
          : store.status.error
            ? "Couldn't reach the cloud — try again"
            : store.status.behind.length
              ? "Synced — some items need a database update (see Settings)"
              : "Up to date ✓",
      );
      setTimeout(() => setDone(null), store.status.behind.length ? 3500 : 1800);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [store]);

  if (!pull && !busy && !done) return null;
  const ready = pull >= THRESHOLD * 0.75;
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[65] flex justify-center" style={{ top: `calc(env(safe-area-inset-top) + ${busy || done ? 12 : Math.max(0, pull - 30)}px)` }} aria-live="polite">
      <div className="flex items-center gap-2 rounded-full bg-ink/90 px-4 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur">
        {busy ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Getting the latest…
          </>
        ) : done ? (
          done
        ) : (
          <>
            <span className="inline-block transition-transform" style={{ transform: `rotate(${ready ? 180 : 0}deg)` }}>
              ↓
            </span>
            {ready ? "Let go to refresh" : "Pull to refresh"}
          </>
        )}
      </div>
    </div>
  );
}

/** One-time "What's your name?" so the family sees a name, not an email. */
export function NamePrompt() {
  const { settings, session, saveMyName } = useApp();
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [later, setLater] = useState(false);
  if (settings.mode !== "cloud" || !session || later) return null;
  if (saved)
    return (
      <div className="mb-4 rounded-2xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800" role="status">
        ✓ Thanks, {settings.displayName}! Your family will see your name on everything you change.
      </div>
    );
  if (settings.displayName.trim()) return null;
  return (
    <form
      className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        await saveMyName(name);
        setSaved(true);
        setTimeout(() => setLater(true), 4000);
      }}
    >
      <label htmlFor="whoami" className="block text-sm font-semibold text-sky-900">
        👋 What&apos;s your first name?
      </label>
      <p className="mb-2 text-xs text-sky-800">So your family sees “{name.trim() || "your name"} added…” instead of your email.</p>
      <div className="flex gap-2">
        <input id="whoami" className="input min-w-0 flex-1" autoComplete="given-name" placeholder="First name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary flex-none" disabled={!name.trim()}>
          Save
        </button>
      </div>
      <button type="button" className="mt-1 text-xs text-sky-700 underline" onClick={() => setLater(true)}>
        Later
      </button>
    </form>
  );
}
