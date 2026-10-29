"use client";

import { SCHEMAS, formatDate, personName } from "@moving/shared";
import Link from "next/link";
import { useState } from "react";
import { useDb, useStore, useSyncStatus } from "@/lib/store-context";
import { showUndo, useHiddenCards, useHiddenRows } from "./Swipe";

const PAGE_NAMES: Record<string, string> = { "/": "Dashboard" };
const pageName = (href: string) => PAGE_NAMES[href] ?? href.replace(/^\//, "").replace(/[-/]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Settings → hidden cards & items (swiped away) and recently deleted rows. */
export function HiddenSettings() {
  const db = useDb();
  const store = useStore();
  const status = useSyncStatus();
  const cards = useHiddenCards();
  const rows = useHiddenRows();
  const [showAll, setShowAll] = useState(false);
  const deleted = store.recentlyDeleted(30).filter((d) => d.table in SCHEMAS);
  const shown = showAll ? deleted : deleted.slice(0, 8);
  const title = (table: keyof typeof SCHEMAS, r: object) => String((r as Record<string, unknown>)[SCHEMAS[table].titleField] || SCHEMAS[table].singular);

  return (
    <>
      <section id="hidden" className="card scroll-mt-4 space-y-3">
        <h2 className="font-bold">🙈 Hidden cards &amp; items</h2>
        <p className="text-sm text-gray-600">Swipe left on any card or list item and tap Hide to tuck it away. Tap a card&apos;s title to fold it up instead. Everything you&apos;ve hidden on this device is listed here.</p>
        {!cards.cards.length && !rows.rows.length ? (
          <p className="rounded-2xl bg-ink/5 p-3 text-sm text-gray-500">Nothing hidden.</p>
        ) : (
          <>
            {cards.cards.length > 0 && (
              <div>
                <div className="eyebrow mb-1.5">Cards · {cards.cards.length}</div>
                <ul className="ios-list divide-y divide-ink/5 rounded-2xl bg-ink/[0.03]">
                  {cards.cards.map((c) => (
                    <li key={c.id} className="flex min-h-12 items-center gap-3 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{c.label}</span>
                        <Link href={c.href} className="text-xs text-gray-500 underline">
                          {pageName(c.href)}
                        </Link>
                      </span>
                      <button type="button" className="btn-secondary min-h-9! px-3! text-xs" onClick={() => cards.unhide(c.id)}>
                        Show
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {rows.rows.length > 0 && (
              <div>
                <div className="eyebrow mb-1.5">Items · {rows.rows.length}</div>
                <ul className="ios-list divide-y divide-ink/5 rounded-2xl bg-ink/[0.03]">
                  {rows.rows.map((r) => (
                    <li key={`${r.table}:${r.id}`} className="flex min-h-12 items-center gap-3 px-3 py-2">
                      <span className="text-lg">{SCHEMAS[r.table]?.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{r.label}</span>
                        <span className="text-xs text-gray-500">{SCHEMAS[r.table]?.plural}</span>
                      </span>
                      <button type="button" className="btn-secondary min-h-9! px-3! text-xs" onClick={() => rows.unhide(r.table, r.id)}>
                        Show
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button
              type="button"
              className="text-sm font-semibold text-accent"
              onClick={() => {
                cards.clear();
                rows.clear();
              }}
            >
              Show everything again
            </button>
          </>
        )}
      </section>

      <section id="deleted" className="card scroll-mt-4 space-y-3">
        <h2 className="font-bold">🗑 Recently deleted</h2>
        <p className="text-sm text-gray-600">Deleted something by mistake? Anything deleted in the last 30 days can be put back{status?.mode === "cloud" ? " — for everyone sharing the move" : ""}.</p>
        {deleted.length ? (
          <>
            <ul className="ios-list divide-y divide-ink/5 rounded-2xl bg-ink/[0.03]">
              {shown.map(({ table, row }) => (
                <li key={`${table}:${row.id}`} className="flex min-h-12 items-center gap-3 px-3 py-2">
                  <span className="text-lg">{SCHEMAS[table].icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{title(table, row)}</span>
                    <span className="text-xs text-gray-500">
                      {SCHEMAS[table].singular} · {formatDate(row.updated_at.slice(0, 10), { month: "short", day: "numeric" })}
                      {row.updated_by ? ` · by ${personName(row.updated_by, db.family_members)}` : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn-secondary min-h-9! px-3! text-xs"
                    onClick={() => {
                      store.restore(table, row.id);
                      showUndo(`Restored “${title(table, row)}”`);
                    }}
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
            {deleted.length > shown.length && (
              <button type="button" className="text-sm font-semibold text-accent" onClick={() => setShowAll(true)}>
                Show all {deleted.length}
              </button>
            )}
          </>
        ) : (
          <p className="rounded-2xl bg-ink/5 p-3 text-sm text-gray-500">Nothing deleted recently.</p>
        )}
      </section>
    </>
  );
}
