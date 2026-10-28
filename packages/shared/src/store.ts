import { emptySnapshot, type Snapshot } from './csv';
import { DEFAULTS, SCHEMAS } from './schemas';
import type { Activity, BaseRow, MediaRef, NewRow, TableMap, TableName } from './types';
import { TABLES } from './types';
import { cloudErrorMessage, nowIso, uuid } from './util';

/** Minimal async key-value storage (IndexedDB on web, SQLite kv-store on mobile). */
export interface KV {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface RemoteAdapter {
  push(table: TableName, rows: BaseRow[]): Promise<void>;
  pull(table: TableName, since: string | null): Promise<(BaseRow & { server_updated_at?: string })[]>;
  subscribe(onRow: (table: TableName, row: BaseRow) => void): () => void;
  uploadMedia?(ref: MediaRef): Promise<MediaRef>;
}

export interface SyncStatus {
  mode: 'local' | 'cloud';
  syncing: boolean;
  pending: number;
  lastSync: string | null;
  error: string | null;
}

interface PendingOp {
  table: TableName;
  id: string;
}

const TRACKED: TableName[] = TABLES.filter((t) => t !== 'activity');

export class MovingStore {
  private db: Snapshot = emptySnapshot();
  private snapshot: Snapshot = emptySnapshot();
  private listeners = new Set<() => void>();
  private pending: PendingOp[] = [];
  private lastPulled: Partial<Record<TableName, string>> = {};
  private dirtyTables = new Set<TableName>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeRemote: (() => void) | null = null;
  private syncPromise: Promise<void> | null = null;
  status: SyncStatus;
  loaded = false;

  constructor(
    private kv: KV,
    readonly householdId: string,
    private actor: () => string,
    private remote: RemoteAdapter | null = null,
  ) {
    this.status = { mode: remote ? 'cloud' : 'local', syncing: false, pending: 0, lastSync: null, error: null };
  }

  private key(suffix: string) {
    return `mt:${this.householdId}:${suffix}`;
  }

  async load(): Promise<void> {
    for (const t of TABLES) {
      const raw = await this.kv.getItem(this.key(t));
      (this.db as Record<string, BaseRow[]>)[t] = raw ? (JSON.parse(raw) as BaseRow[]) : [];
    }
    const pend = await this.kv.getItem(this.key('_pending'));
    this.pending = pend ? JSON.parse(pend) : [];
    const lp = await this.kv.getItem(this.key('_lastPulled'));
    this.lastPulled = lp ? JSON.parse(lp) : {};
    this.status.lastSync = (await this.kv.getItem(this.key('_lastSync'))) ?? null;
    this.status.pending = this.pending.length;
    this.loaded = true;
    this.emit();
  }

  // ---------- React integration ----------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): Snapshot => this.snapshot;

  private emit() {
    const s = {} as Snapshot;
    for (const t of TABLES) (s as Record<string, BaseRow[]>)[t] = (this.db[t] as BaseRow[]).filter((r) => !r.deleted);
    this.snapshot = s;
    this.status = { ...this.status, pending: this.pending.length };
    this.listeners.forEach((l) => l());
  }

  // ---------- CRUD ----------
  list<T extends TableName>(table: T): TableMap[T][] {
    return this.snapshot[table];
  }

  get<T extends TableName>(table: T, id: string | null | undefined): TableMap[T] | undefined {
    if (!id) return undefined;
    return (this.db[table] as TableMap[T][]).find((r) => r.id === id && !r.deleted);
  }

  private markDirty(table: TableName, id: string) {
    this.dirtyTables.add(table);
    if (this.remote && !this.pending.some((p) => p.table === table && p.id === id)) this.pending.push({ table, id });
    this.scheduleSave();
  }

  private write<T extends TableName>(table: T, row: TableMap[T]) {
    const rows = this.db[table] as TableMap[T][];
    const i = rows.findIndex((r) => r.id === row.id);
    if (i >= 0) rows[i] = row;
    else rows.push(row);
    this.markDirty(table, row.id);
  }

  insert<T extends TableName>(table: T, data: NewRow<T>, opts: { silent?: boolean } = {}): TableMap[T] {
    const ts = nowIso();
    const row = {
      ...structuredCloneSafe(DEFAULTS[table]),
      ...data,
      id: data.id ?? uuid(),
      household_id: this.householdId,
      created_at: ts,
      updated_at: ts,
      updated_by: this.actor(),
      deleted: false,
    } as unknown as TableMap[T];
    this.write(table, row);
    if (!opts.silent) this.log(table, row, 'created');
    this.emit();
    return row;
  }

  insertMany<T extends TableName>(table: T, rows: NewRow<T>[]): TableMap[T][] {
    const out = rows.map((r) => this.insert(table, r, { silent: true }));
    if (out.length) this.logText(table, `Added ${out.length} ${SCHEMAS[table].plural.toLowerCase()}`);
    this.emit();
    return out;
  }

  update<T extends TableName>(table: T, id: string, patch: Partial<TableMap[T]>, opts: { silent?: boolean } = {}): TableMap[T] | undefined {
    const existing = this.get(table, id);
    if (!existing) return undefined;
    const row = { ...existing, ...patch, id, household_id: existing.household_id, updated_at: nowIso(), updated_by: this.actor() } as TableMap[T];
    this.write(table, row);
    if (!opts.silent) this.log(table, row, 'updated');
    this.emit();
    return row;
  }

  remove<T extends TableName>(table: T, id: string): void {
    const existing = this.get(table, id);
    if (!existing) return;
    this.write(table, { ...existing, deleted: true, updated_at: nowIso(), updated_by: this.actor() });
    this.log(table, existing, 'deleted');
    this.emit();
  }

  /** Replaces all data (used by backup import). */
  importSnapshot(data: Partial<Snapshot>) {
    for (const t of TABLES) {
      const rows = (data[t] ?? []) as BaseRow[];
      for (const r of rows) this.write(t, { ...r, household_id: this.householdId } as never);
    }
    this.emit();
  }

  exportSnapshot(): Snapshot {
    return JSON.parse(JSON.stringify(this.snapshot));
  }

  // ---------- Activity feed ----------
  private log(table: TableName, row: BaseRow, action: Activity['action']) {
    if (!TRACKED.includes(table)) return;
    const title = String((row as unknown as Record<string, unknown>)[SCHEMAS[table].titleField] ?? '') || SCHEMAS[table].singular;
    const actor = this.actor();
    const recent = (this.db.activity as Activity[]).find(
      (a) => a.entity_id === row.id && a.actor === actor && a.action === action && Date.now() - Date.parse(a.updated_at) < 120000,
    );
    if (recent) {
      this.write('activity', { ...recent, updated_at: nowIso() });
      return;
    }
    const ts = nowIso();
    this.write('activity', {
      id: uuid(),
      household_id: this.householdId,
      created_at: ts,
      updated_at: ts,
      updated_by: actor,
      deleted: false,
      entity: table,
      entity_id: row.id,
      action,
      label: `${SCHEMAS[table].singular}: ${title}`,
      actor,
    });
    this.trimActivity();
  }

  private logText(table: TableName, label: string) {
    const ts = nowIso();
    this.write('activity', {
      id: uuid(),
      household_id: this.householdId,
      created_at: ts,
      updated_at: ts,
      updated_by: this.actor(),
      deleted: false,
      entity: table,
      entity_id: '',
      action: 'created',
      label,
      actor: this.actor(),
    });
    this.trimActivity();
  }

  private trimActivity() {
    const acts = this.db.activity as Activity[];
    if (acts.length > 300) {
      acts.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      acts.length = 250;
    }
  }

  // ---------- Persistence ----------
  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flushToDisk();
      if (this.remote) void this.sync();
    }, 400);
  }

  async flushToDisk() {
    const tables = [...this.dirtyTables];
    this.dirtyTables.clear();
    for (const t of tables) await this.kv.setItem(this.key(t), JSON.stringify(this.db[t]));
    await this.kv.setItem(this.key('_pending'), JSON.stringify(this.pending));
  }

  async clearAll() {
    for (const t of TABLES) {
      await this.kv.removeItem(this.key(t));
      (this.db as Record<string, BaseRow[]>)[t] = [];
    }
    for (const k of ['_pending', '_lastPulled', '_lastSync']) await this.kv.removeItem(this.key(k));
    this.pending = [];
    this.lastPulled = {};
    this.emit();
  }

  // ---------- Cloud sync ----------
  sync(): Promise<void> {
    if (!this.remote) return Promise.resolve();
    if (this.syncPromise) return this.syncPromise;
    this.syncPromise = this.doSync().finally(() => {
      this.syncPromise = null;
    });
    return this.syncPromise;
  }

  private async doSync() {
    const remote = this.remote!;
    this.status = { ...this.status, syncing: true, error: null };
    this.listeners.forEach((l) => l());
    try {
      // Push local changes, uploading new media first.
      const ops = [...this.pending];
      const byTable = new Map<TableName, BaseRow[]>();
      const pushedVersion = new Map<string, string>();
      for (const op of ops) {
        const row = (this.db[op.table] as BaseRow[]).find((r) => r.id === op.id);
        if (!row) continue;
        const prepared = await this.prepareForPush(op.table, row);
        pushedVersion.set(`${op.table}:${op.id}`, prepared.updated_at);
        (byTable.get(op.table) ?? byTable.set(op.table, []).get(op.table)!).push(prepared);
      }
      for (const [table, rows] of byTable) await remote.push(table, rows);
      this.pending = this.pending.filter((p) => {
        if (!ops.includes(p)) return true;
        const current = (this.db[p.table] as BaseRow[]).find((r) => r.id === p.id);
        return !!current && current.updated_at !== pushedVersion.get(`${p.table}:${p.id}`);
      });

      // Pull remote changes.
      for (const t of TABLES) {
        const rows = await remote.pull(t, this.lastPulled[t] ?? null);
        for (const r of rows) {
          this.applyRemote(t, r);
          if (r.server_updated_at && (!this.lastPulled[t] || r.server_updated_at > this.lastPulled[t]!)) this.lastPulled[t] = r.server_updated_at;
        }
        if (rows.length) this.dirtyTables.add(t);
      }
      const ts = nowIso();
      await this.kv.setItem(this.key('_lastPulled'), JSON.stringify(this.lastPulled));
      await this.kv.setItem(this.key('_lastSync'), ts);
      await this.flushToDisk();
      this.status = { ...this.status, syncing: false, lastSync: ts, error: null };
    } catch (e) {
      this.status = { ...this.status, syncing: false, error: e instanceof Error ? e.message : cloudErrorMessage(e) };
    }
    this.emit();
  }

  private async prepareForPush(table: TableName, row: BaseRow): Promise<BaseRow> {
    const mediaKeys = SCHEMAS[table].fields.filter((f) => f.type === 'media').map((f) => f.key);
    if (!mediaKeys.length || !this.remote?.uploadMedia) return row;
    const local = row as unknown as Record<string, MediaRef[]>;
    let changed = false;
    const out: Record<string, unknown> = { ...row };
    for (const k of mediaKeys) {
      const refs = local[k] ?? [];
      const uploaded: MediaRef[] = [];
      for (const ref of refs) {
        if (!ref.remotePath && ref.uri) {
          const up = await this.remote.uploadMedia(ref);
          uploaded.push({ ...ref, remotePath: up.remotePath });
          changed = true;
        } else uploaded.push(ref);
      }
      out[k] = uploaded;
    }
    if (changed) {
      // Persist remote paths locally so we don't upload twice.
      const rows = this.db[table] as BaseRow[];
      const i = rows.findIndex((r) => r.id === row.id);
      if (i >= 0 && rows[i]!.updated_at === row.updated_at) rows[i] = out as unknown as BaseRow;
      this.dirtyTables.add(table);
    }
    // Device-local URIs are meaningless to other devices; only data/https URIs are shared.
    for (const k of mediaKeys) {
      out[k] = (out[k] as MediaRef[]).map((r) => ({ ...r, uri: r.uri && /^https:/.test(r.uri) ? r.uri : null }));
    }
    return out as unknown as BaseRow;
  }

  private applyRemote(table: TableName, incoming: BaseRow & { server_updated_at?: string }) {
    if (this.pending.some((p) => p.table === table && p.id === incoming.id)) return;
    const rows = this.db[table] as BaseRow[];
    const i = rows.findIndex((r) => r.id === incoming.id);
    const { server_updated_at: _s, ...row } = incoming;
    if (i >= 0) {
      if (rows[i]!.updated_at > row.updated_at) return;
      // Spread the local row first so on-device-only columns (not in the cloud schema yet) survive a pull.
      rows[i] = mergeLocalMedia(table, rows[i]!, { ...rows[i]!, ...row } as BaseRow);
    } else rows.push(row);
  }

  startRealtime() {
    if (!this.remote || this.unsubscribeRemote) return;
    this.unsubscribeRemote = this.remote.subscribe((table, row) => {
      this.applyRemote(table, row);
      this.dirtyTables.add(table);
      this.scheduleSave();
      this.emit();
    });
  }

  stop() {
    this.unsubscribeRemote?.();
    this.unsubscribeRemote = null;
  }
}

function mergeLocalMedia(table: TableName, local: BaseRow, incoming: BaseRow): BaseRow {
  const mediaKeys = SCHEMAS[table].fields.filter((f) => f.type === 'media').map((f) => f.key);
  if (!mediaKeys.length) return incoming;
  const out = { ...incoming } as unknown as Record<string, MediaRef[]>;
  const loc = local as unknown as Record<string, MediaRef[]>;
  for (const k of mediaKeys) {
    const localById = new Map((loc[k] ?? []).map((m) => [m.id, m]));
    out[k] = (out[k] ?? []).map((m) => ({ ...m, uri: m.uri ?? localById.get(m.id)?.uri ?? null }));
  }
  return out as unknown as BaseRow;
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/** In-memory KV, handy for tests. */
export function memoryKV(): KV {
  const m = new Map<string, string>();
  return {
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => void m.set(k, v),
    removeItem: async (k) => void m.delete(k),
  };
}
