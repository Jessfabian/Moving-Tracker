"use client";

import { SCHEMAS, displayValue, makeLookup, optionLabel, type TableMap, type TableName } from "@moving/shared";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTwoPane } from "@/lib/hooks";
import { useDb } from "@/lib/store-context";
import { EntityForm } from "./EntityForm";
import { MediaThumb } from "./Media";
import { Drawer, Empty, PageHeader } from "./ui";

type Row = Record<string, unknown>;

export interface CrudPageProps<T extends TableName> {
  table: T;
  title?: string;
  subtitle?: ReactNode;
  /** Field keys shown as small details under each row title. */
  columns?: string[];
  /** Select-type field keys offered as filters. */
  filters?: string[];
  groupBy?: string;
  /** Group keys in display order; listed groups show even when empty. */
  groupOrder?: string[];
  groupAction?: (key: string, api: CrudApi<T>) => ReactNode;
  formTitle?: (row: TableMap[T] | null, initial: Partial<TableMap[T]> | undefined) => string;
  addLabel?: string;
  sort?: (a: TableMap[T], b: TableMap[T]) => number;
  where?: (r: TableMap[T]) => boolean;
  initial?: Partial<TableMap[T]>;
  actions?: ReactNode;
  top?: ReactNode | ((api: CrudApi<T>) => ReactNode);
  /** Optional custom card renderer; when set the list renders as a responsive card grid. */
  renderCard?: (r: TableMap[T], open: () => void) => ReactNode;
  renderBadge?: (r: TableMap[T]) => ReactNode;
  renderDetail?: (r: TableMap[T]) => ReactNode;
  emptyText?: ReactNode;
  hideFields?: string[];
  onSaved?: (r: TableMap[T] | null) => void;
  /** Always open the form in a slide-over drawer instead of the side pane on wide screens. */
  drawerForm?: boolean;
}

export interface CrudApi<T extends TableName> {
  open: (id: string) => void;
  add: (initial?: Partial<TableMap[T]>) => void;
}

export function CrudPage<T extends TableName>(props: CrudPageProps<T>) {
  const { table, columns = [], filters = [], groupBy, groupOrder, groupAction, formTitle, addLabel, sort, where, initial, actions, top, renderBadge, renderDetail, renderCard,   emptyText, hideFields, onSaved, drawerForm } = props;
  const schema = SCHEMAS[table];
  const db = useDb();
  const lookup = useMemo(() => makeLookup(db), [db]);
    const wide = useTwoPane();
    const twoPane = wide && !drawerForm;
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | "new" | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("open")));
  const [addInitial, setAddInitial] = useState<Partial<TableMap[T]> | undefined>(undefined);
  const api: CrudApi<T> = {
    open: (id) => setEditing(id),
    add: (init) => {
      setAddInitial(init);
      setEditing("new");
    },
  };

  const all = db[table] as TableMap[T][];
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = all.filter((r) => (where ? where(r) : true));
    for (const [k, v] of Object.entries(filter)) if (v) out = out.filter((r) => String((r as unknown as Row)[k] ?? "") === v);
    if (needle) out = out.filter((r) => JSON.stringify(r).toLowerCase().includes(needle));
    return sort ? [...out].sort(sort) : [...out].sort((a, b) => String((a as unknown as Row)[schema.titleField] ?? "").localeCompare(String((b as unknown as Row)[schema.titleField] ?? "")));
  }, [all, q, filter, where, sort, schema.titleField]);

  const groups = useMemo(() => {
    if (!groupBy) return [{ key: "", label: "", rows }];
    const f = schema.fields.find((x) => x.key === groupBy);
    const map = new Map<string, TableMap[T][]>();
    for (const r of rows) {
      const k = String((r as unknown as Row)[groupBy] ?? "");
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    const keys = groupOrder ? [...groupOrder, ...[...map.keys()].filter((k) => !groupOrder.includes(k))] : [...map.keys()];
    return keys.map((key) => ({ key, label: f ? displayValue(f, key, lookup) || "Unassigned" : key, rows: map.get(key) ?? [] }));
  }, [rows, groupBy, groupOrder, schema.fields, lookup]);

  const current = editing && editing !== "new" ? (all.find((r) => r.id === editing) ?? null) : null;
  const formOpen = editing === "new" || !!current;
  // New records always open in a sheet so it's obvious something opened; the side pane is for viewing/editing existing rows.
  const paneOpen = twoPane && !!current;
  const sheetOpen = formOpen && !paneOpen;
  const paneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!paneOpen || !paneRef.current) return;
    const r = paneRef.current.getBoundingClientRect();
    if (r.top > window.innerHeight * 0.6 || r.bottom < 80) paneRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [paneOpen, editing]);
  const drawerTitle = formTitle ? formTitle(current, addInitial) : current ? String((current as unknown as Row)[schema.titleField] || schema.singular) : `New ${schema.singular.toLowerCase()}`;
  const close = () => {
    setEditing(null);
    setAddInitial(undefined);
  };

  const form = formOpen ? (
    <div>
      {current && renderDetail && <div className="mb-5">{renderDetail(current)}</div>}
      <EntityForm
        key={editing === "new" ? `new:${JSON.stringify(addInitial ?? {})}` : editing}
        table={table}
        row={current}
        initial={addInitial ? { ...initial, ...addInitial } : initial}
        hide={hideFields}
        onDone={(r) => {
          close();
          onSaved?.(r);
        }}
      />
    </div>
  ) : null;

  const photoKey = schema.fields.find((f) => f.type === "media")?.key;

  const list = (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.key}>
          {g.label && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-baseline gap-2 font-display text-xl font-bold tracking-tight">
                {g.label} <span className="text-sm font-medium text-gray-400">{g.rows.length}</span>
              </h2>
              {groupAction?.(g.key, api)}
            </div>
          )}
          {renderCard ? (
            <div className={`grid gap-4 ${twoPane ? "" : "sm:grid-cols-2"} ${twoPane && !formOpen ? "xl:grid-cols-2" : ""}`}>
              {g.rows.map((r) => (
                <div key={r.id}>{renderCard(r, () => setEditing(r.id))}</div>
              ))}
            </div>
          ) : (
          <ul className="space-y-2">
            {g.rows.map((r) => {
              const row = r as unknown as Row;
              const media = photoKey ? ((row[photoKey] as TableMap["items"]["photos"]) ?? []) : [];
              return (
                <li key={r.id}>
                  <button
                    onClick={() => setEditing(r.id)}
                    className={`group flex w-full items-center gap-4 rounded-2xl border bg-white px-4 py-3.5 text-left transition hover:-translate-y-px hover:shadow-[0_10px_30px_-18px_rgba(13,13,15,0.5)] ${editing === r.id ? "border-ink ring-1 ring-ink" : "border-gray-200/80"}`}
                  >
                    {media[0] ? <MediaThumb media={media[0]} className="h-12 w-12" /> : <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-gray-100 text-lg">{schema.icon}</span>}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{String(row[schema.titleField] || `Untitled ${schema.singular.toLowerCase()}`)}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                        {columns.map((c) => {
                          const f = schema.fields.find((x) => x.key === c);
                          const v = f ? displayValue(f, row[c], lookup) : "";
                          return v ? (
                            <span key={c}>
                              <span className="text-gray-400">{f!.label}:</span> {v}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>
                    {renderBadge?.(r)}
                    <span className="hidden text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-ink sm:block">→</span>
                  </button>
                </li>
              );
            })}
          </ul>
          )}
        </section>
      ))}
      {!rows.length && (
        <Empty icon={schema.icon} title={all.length ? "Nothing matches" : `No ${schema.plural.toLowerCase()} yet`}>
          {all.length ? "Try clearing the search or filters." : emptyText}
        </Empty>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title={props.title ?? schema.plural}
        icon={schema.icon}
        subtitle={props.subtitle}
        actions={
          <>
            {actions}
            <button className="btn-primary" onClick={() => api.add()}>
              {addLabel ?? `+ Add ${schema.singular.toLowerCase()}`}
            </button>
          </>
        }
      />
      {typeof top === "function" ? top(api) : top}
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs flex-1" placeholder={`Search ${schema.plural.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
        {filters.map((k) => {
          const f = schema.fields.find((x) => x.key === k);
          if (!f) return null;
          const opts =
            f.options ??
            (f.type === "member"
              ? db.family_members.map((m) => ({ value: m.id, label: m.name }))
              : f.type === "room"
                ? db.rooms.map((m) => ({ value: m.id, label: m.name }))
                : []);
          return (
            <select key={k} aria-label={`Filter by ${f.label.toLowerCase()}`} className="input w-auto" value={filter[k] ?? ""} onChange={(e) => setFilter({ ...filter, [k]: e.target.value })}>
              <option value="">Any {f.label.toLowerCase()}</option>
              {opts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          );
        })}
        <span className="self-center text-sm text-gray-500">
          {rows.length} of {all.length}
        </span>
      </div>
      {twoPane ? (
        <div className="grid grid-cols-2 gap-7">
          <div className="min-w-0">{list}</div>
          <div className="min-w-0">
            <div ref={paneRef} className="card sticky top-4 max-h-[calc(100vh-2rem)] scroll-mt-4 overflow-y-auto">
              {paneOpen ? (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-bold">{drawerTitle}</h2>
                    <button className="btn-ghost" onClick={close}>
                      ✕
                    </button>
                  </div>
                  {form}
                </>
              ) : (
                <div className="py-16 text-center text-gray-400">Select a {schema.singular.toLowerCase()} to see details, or add a new one.</div>
              )}
            </div>
          </div>
        </div>
      ) : (
        list
      )}
      <Drawer open={sheetOpen} onClose={close} title={drawerTitle}>
        {sheetOpen && form}
      </Drawer>
    </div>
  );
}

export function StatusPill({ value, options, color }: { value: string; options?: { value: string; label: string }[]; color?: string }) {
  return (
    <span className="chip flex-none" style={{ background: `${color ?? "#6b7280"}1a`, color: color ?? "#374151" }}>
      {optionLabel(options, value)}
    </span>
  );
}
