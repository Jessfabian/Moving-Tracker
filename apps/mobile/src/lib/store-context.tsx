import "react-native-url-polyfill/auto";
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
import * as Crypto from "expo-crypto";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { AppState } from "react-native";
import { kv } from "./kv";
import { readMedia } from "./media";

const g = globalThis as { crypto?: { randomUUID?: () => string } };
if (!g.crypto) g.crypto = {};
if (!g.crypto.randomUUID) g.crypto.randomUUID = () => Crypto.randomUUID();

export interface Settings {
  mode: "local" | "cloud";
  displayName: string;
  householdId: string | null;
  supabaseUrl: string;
  supabaseKey: string;
  remindersEnabled: boolean;
  reminderHour: number;
}

const SETTINGS_KEY = "mt:settings";
const defaultSettings: Settings = {
  mode: "local",
  displayName: "",
  householdId: null,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  remindersEnabled: false,
  reminderHour: 9,
};

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
    void kv.getItem(SETTINGS_KEY).then((raw) => {
      if (raw) {
        try {
          const s = { ...defaultSettings, ...JSON.parse(raw) } as Settings;
          setSettings({ ...s, supabaseUrl: s.supabaseUrl || defaultSettings.supabaseUrl, supabaseKey: s.supabaseKey || defaultSettings.supabaseKey });
        } catch {
          /* corrupt settings: keep defaults */
        }
      }
      setSettingsLoaded(true);
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      void kv.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const supabase = useMemo(() => {
    if (!settingsLoaded || settings.mode !== "cloud" || !settings.supabaseUrl || !settings.supabaseKey) return null;
    try {
      return createSupabase(settings.supabaseUrl, settings.supabaseKey, kv);
    } catch {
      return null;
    }
  }, [settingsLoaded, settings.mode, settings.supabaseUrl, settings.supabaseKey]);

  useEffect(() => {
    if (!supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when cloud mode is turned off
      setSession(null);
      setAuthChecked(true);
      return;
    }
    setAuthChecked(false);
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void supabase.auth.startAutoRefresh();
      else void supabase.auth.stopAutoRefresh();
    });
    return () => {
      data.subscription.unsubscribe();
      sub.remove();
    };
  }, [supabase]);

  const refreshHouseholds = useCallback(async () => {
    if (!supabase || !session) return setHouseholds([]);
    setHouseholds(await listHouseholds(supabase));
  }, [supabase, session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads remote data when the session changes
    void refreshHouseholds().catch(() => setHouseholds([]));
  }, [refreshHouseholds]);

  const actorName = settings.displayName || session?.user.email || "Me";

  useEffect(() => {
    if (!settingsLoaded) return;
    let s: MovingStore | null = null;
    if (settings.mode === "local") {
      s = new MovingStore(kv, "local", () => actorName);
    } else if (supabase && session && settings.householdId) {
      s = new MovingStore(kv, settings.householdId, () => actorName, supabaseAdapter(supabase, settings.householdId, readMedia));
    }
    if (!s) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no usable store for the current settings
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
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void inst.sync();
      else void inst.flushToDisk();
    });
    const timer = setInterval(() => void inst.sync(), 60000);
    return () => {
      cancelled = true;
      inst.stop();
      sub.remove();
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
  return useSyncExternalStore(store?.subscribe ?? noop, store?.getSnapshot ?? (() => EMPTY));
}

export function useSyncStatus(): SyncStatus | null {
  const { store } = useApp();
  useDb();
  return store?.status ?? null;
}
