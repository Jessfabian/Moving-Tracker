import type { KV } from "@moving/shared";
import Storage from "expo-sqlite/kv-store";

/** SQLite-backed key/value store used for the offline cache, settings and the Supabase session. */
export const kv: KV = {
  getItem: (key) => Storage.getItem(key),
  setItem: (key, value) => Storage.setItem(key, value),
  removeItem: (key) => Storage.removeItem(key),
};
