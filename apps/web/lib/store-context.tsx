"use client";

import {
  createHousehold,
  createSupabase,
  emptySnapshot,
  joinHousehold,
  listHouseholdMembers,
  listHouseholds,
  MovingStore,
  personName,
  setMyDisplayName,
  supabaseAdapter,
  type Household,
  type Snapshot,
  type SyncStatus,
} from "@moving/shared";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { idbKV } from "./kv";
import { readMedia } from "./media";

export interface Settings {
  mode: "local" | "cloud";
  displayName: string;
  householdId: string | null;
  supabaseUrl: string;
  supabaseKey: string;
}

const SETTINGS_KEY = "mt:settings";
// The Supabase publishable (anon) key is meant to be public; Row Level Security protects the data.
// Vercel/.env values win when set, so another family can point the app at their own project.
const DEFAULT_SUPABASE_URL = "https://xvhgkawvhddubajwlqsg.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_V5uuR5_dmCmZ-YY1DlgFTg_UyvLcX3l";
const defaultSettings: Settings = {
  mode: "cloud",
  displayName: "",
  householdId: null,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL,
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY,
};

function loadSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const s = { ...defaultSettings, ...JSON.parse(raw) };
    return { ...s, supabaseUrl: s.supabaseUrl || defaultSettings.supabaseUrl, supabaseKey: s.supabaseKey || defaultSettings.supabaseKey };
  } catch {
    return null;
  }
}

interface Ctx {
  store: MovingStore | null;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  supabase: SupabaseClient | null;
  session: Session | null;
  households: Household[];
  householdsLoaded: boolean;
  refreshHouseholds: () => Promise<void>;
  /** Sets the name shown to the family (activity feed, "Mike added…"). */
  saveMyName: (name: string) => Promise<void>;
  createHousehold: (name: string) => Promise<void>;
  joinHousehold: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
  ready: boolean;
}

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [store, setStore] = useState<MovingStore | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [householdsLoaded, setHouseholdsLoaded] = useState(false);

  useEffect(() => {
    // localStorage is only available after mount; reading it during render would break hydration.
    const saved = loadSettings();
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSettings(saved);
      setSettingsLoaded(true);
      return;
    }
    // Never saved settings: new devices start on family sign-in, but a device that already has
    // device-only data (from before cloud became the default) stays on it.
    void idbKV
      .getItem("mt:local:moves")
      .catch(() => null)
      .then((localMoves) => {
        const hasLocal = !!localMoves && localMoves !== "[]";
        setSettings({ ...defaultSettings, mode: hasLocal ? "local" : "cloud" });
        setSettingsLoaded(true);
      });
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const supabase = useMemo(() => {
    if (!settingsLoaded || settings.mode !== "cloud" || !settings.supabaseUrl || !settings.supabaseKey) return null;
    try {
      return createSupabase(settings.supabaseUrl, settings.supabaseKey, idbKV);
    } catch {
      return null;
    }
  }, [settingsLoaded, settings.mode, settings.supabaseUrl, settings.supabaseKey]);

  useEffect(() => {
    if (!supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSession(null);
      setAuthChecked(true);
      return;
    }
    setAuthChecked(false);
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const refreshHouseholds = useCallback(async () => {
    if (!supabase || !session) {
      setHouseholds([]);
      setHouseholdsLoaded(!supabase || authChecked);
      return;
    }
    try {
      const list = await listHouseholds(supabase);
      setHouseholds(list);
      // A fresh device (or the Home Screen app, which has its own storage) has no move picked yet:
      // open the family's move automatically instead of asking again after every sign-in.
      if (list.length === 1) {
        setSettings((s) => {
          if (s.householdId && list.some((h) => h.id === s.householdId)) return s;
          const next = { ...s, householdId: list[0].id };
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
          return next;
        });
      }
    } finally {
      setHouseholdsLoaded(true);
    }
  }, [supabase, session, authChecked]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHouseholdsLoaded(false);
    void refreshHouseholds().catch(() => setHouseholds([]));
  }, [refreshHouseholds]);

  const actorName = settings.displayName.trim() || (session?.user.email ? personName(session.user.email) : "Me");
  const actorRef = useRef(actorName);
  useEffect(() => {
    actorRef.current = actorName;
  }, [actorName]);

  // No name on this device yet: use the one saved on the shared move (from joining or another device).
  useEffect(() => {
    if (!supabase || !session || !settings.householdId || settings.displayName.trim()) return;
    void listHouseholdMembers(supabase, settings.householdId)
      .then((list) => {
        const mine = list.find((m) => m.user_id === session.user.id)?.display_name?.trim();
        if (mine && !mine.includes("@")) updateSettings({ displayName: mine });
      })
      .catch(() => undefined);
  }, [supabase, session, settings.householdId, settings.displayName, updateSettings]);

  const saveMyName = useCallback(
    async (raw: string) => {
      const name = raw.trim();
      if (!name) return;
      const old = new Set([settings.displayName.trim(), session?.user.email ?? "", actorRef.current].filter(Boolean).map((x) => x.toLowerCase()));
      updateSettings({ displayName: name });
      actorRef.current = name;
      // Re-label your earlier activity so it says your name instead of your email.
      if (store) for (const a of store.list("activity")) if (a.actor && a.actor !== name && old.has(a.actor.toLowerCase())) store.update("activity", a.id, { actor: name }, { silent: true });
      if (supabase && session && settings.householdId) await setMyDisplayName(supabase, settings.householdId, session.user.id, name).catch(() => undefined);
    },
    [settings.displayName, settings.householdId, session, supabase, store, updateSettings],
  );

  useEffect(() => {
    if (!settingsLoaded) return;
    let s: MovingStore | null = null;
    const actor = () => actorRef.current;
    if (settings.mode === "local") {
      s = new MovingStore(idbKV, "local", actor);
    } else if (supabase && session && settings.householdId) {
      s = new MovingStore(idbKV, settings.householdId, actor, supabaseAdapter(supabase, settings.householdId, readMedia));
    }
    if (!s) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStore(null);
      return;
    }
    let cancelled = false;
    const inst = s;
    void inst.load().then(async () => {
      if (cancelled) return;
      // First open on this device: download the shared move before showing pages, so the app
      // doesn't think there's no move yet and send you to "create a new move".
      if (inst.status.mode === "cloud" && !inst.status.lastSync) await inst.sync();
      if (cancelled) return;
      setStore(inst);
      if (inst.status.mode === "cloud") {
        if (inst.status.lastSync) void inst.sync();
        inst.startRealtime();
      }
    });
    const onOnline = () => void inst.sync();
    window.addEventListener("online", onOnline);
    // Phones freeze timers and drop the live connection in the background: catch up as soon as
    // the app is back on screen, and check every 15 seconds while it's open.
    let hiddenAt = 0;
    const onVisible = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (inst.status.mode !== "cloud") return;
      if (hiddenAt && Date.now() - hiddenAt > 20000) inst.restartRealtime();
      void inst.sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void inst.sync();
    }, 15000);
    return () => {
      cancelled = true;
      inst.stop();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
      clearInterval(timer);
    };
    // The actor name is read through actorRef on each write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded, settings.mode, settings.householdId, supabase, session?.user.id]);

  const value: Ctx = {
    store,
    settings,
    updateSettings,
    supabase,
    session,
    households,
    householdsLoaded,
    refreshHouseholds,
    saveMyName,
    createHousehold: async (name) => {
      const id = await createHousehold(supabase!, name, actorName);
      await refreshHouseholds().catch(() => undefined);
      updateSettings({ householdId: id });
    },
    joinHousehold: async (code) => {
      const id = await joinHousehold(supabase!, code, actorName);
      await refreshHouseholds().catch(() => undefined);
      updateSettings({ householdId: id });
    },
    signOut: async () => {
      await supabase?.auth.signOut();
      updateSettings({ householdId: null });
    },
    ready: settingsLoaded && authChecked,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useApp must be used inside StoreProvider");
  return ctx;
}

const EMPTY = emptySnapshot();
const noop = () => () => {};

export function useStore(): MovingStore {
  const { store } = useApp();
  if (!store) throw new Error("Store not ready");
  return store;
}

export function useDb(): Snapshot {
  const { store } = useApp();
  return useSyncExternalStore(store?.subscribe ?? noop, store?.getSnapshot ?? (() => EMPTY), () => EMPTY);
}

export function useSyncStatus(): SyncStatus | null {
  const { store } = useApp();
  useDb();
  return store?.status ?? null;
}
