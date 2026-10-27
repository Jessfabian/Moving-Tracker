"use client";

import {
  createHousehold,
  createSupabase,
  emptySnapshot,
  joinHousehold,
  listHouseholds,
  MovingStore,
  supabaseAdapter,
  type Household,
  type Snapshot,
  type SyncStatus,
} from "@moving/shared";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
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
const defaultSettings: Settings = {
  mode: "local",
  displayName: "",
  householdId: null,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const s = raw ? { ...defaultSettings, ...JSON.parse(raw) } : defaultSettings;
    return { ...s, supabaseUrl: s.supabaseUrl || defaultSettings.supabaseUrl, supabaseKey: s.supabaseKey || defaultSettings.supabaseKey };
  } catch {
    return defaultSettings;
  }
}

interface Ctx {
  store: MovingStore | null;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  supabase: SupabaseClient | null;
  session: Session | null;
  households: Household[];
  refreshHouseholds: () => Promise<void>;
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

  useEffect(() => {
    // localStorage is only available after mount; reading it during render would break hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(loadSettings());
    setSettingsLoaded(true);
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
    if (!supabase || !session) return setHouseholds([]);
    setHouseholds(await listHouseholds(supabase));
  }, [supabase, session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshHouseholds().catch(() => setHouseholds([]));
  }, [refreshHouseholds]);

  const actorName = settings.displayName || session?.user.email || "Me";

  useEffect(() => {
    if (!settingsLoaded) return;
    let s: MovingStore | null = null;
    if (settings.mode === "local") {
      s = new MovingStore(idbKV, "local", () => actorName);
    } else if (supabase && session && settings.householdId) {
      s = new MovingStore(idbKV, settings.householdId, () => actorName, supabaseAdapter(supabase, settings.householdId, readMedia));
    }
    if (!s) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStore(null);
      return;
    }
    let cancelled = false;
    const inst = s;
    void inst.load().then(() => {
      if (cancelled) return;
      setStore(inst);
      if (inst.status.mode === "cloud") {
        void inst.sync();
        inst.startRealtime();
      }
    });
    const onOnline = () => void inst.sync();
    window.addEventListener("online", onOnline);
    const timer = setInterval(() => void inst.sync(), 60000);
    return () => {
      cancelled = true;
      inst.stop();
      window.removeEventListener("online", onOnline);
      clearInterval(timer);
    };
    // actorName is read lazily through the closure on each write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded, settings.mode, settings.householdId, supabase, session?.user.id]);

  const value: Ctx = {
    store,
    settings,
    updateSettings,
    supabase,
    session,
    households,
    refreshHouseholds,
    createHousehold: async (name) => {
      const id = await createHousehold(supabase!, name, actorName);
      await refreshHouseholds();
      updateSettings({ householdId: id });
    },
    joinHousehold: async (code) => {
      const id = await joinHousehold(supabase!, code, actorName);
      await refreshHouseholds();
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
