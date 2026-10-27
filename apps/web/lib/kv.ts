import type { KV } from "@moving/shared";

const DB_NAME = "moving-tracker";
const STORE = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** IndexedDB-backed key-value store: holds far more than localStorage (photos are stored inline). */
export const idbKV: KV = {
  getItem: async (k) => ((await tx("readonly", (s) => s.get(k))) as string | undefined) ?? null,
  setItem: async (k, v) => void (await tx("readwrite", (s) => s.put(v, k))),
  removeItem: async (k) => void (await tx("readwrite", (s) => s.delete(k))),
};
