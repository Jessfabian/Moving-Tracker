"use client";

import type { CloudGap } from "@moving/shared";
import { useState } from "react";
import { useApp, useSyncStatus } from "@/lib/store-context";

const TABLE_LABEL: Record<string, string> = {
  subscriptions: "Subscriptions",
  bills: "Bills",
  items: "Inventory items",
  books: "Books",
};
const COLUMN_LABEL: Record<string, string> = {
  next_due: "due dates",
  last_paid: "last paid",
  account: "account numbers",
  purchase_date: "purchase dates",
  purchase_price: "purchase prices",
  product_url: "product links",
  photos: "photos",
};

export function describeGap(g: CloudGap): string {
  const name = TABLE_LABEL[g.table] ?? g.table.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  if (!g.columns.length) return name;
  return `${name} — ${g.columns.map((c) => COLUMN_LABEL[c] ?? c.replace(/_/g, " ")).join(", ")}`;
}

function sqlEditorUrl(supabaseUrl: string): string {
  const ref = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(supabaseUrl)?.[1];
  return ref ? `https://supabase.com/dashboard/project/${ref}/sql/new` : "https://supabase.com/dashboard";
}

/** Shown when the cloud database is older than the app, so some changes can't reach the rest of the family. */
export function CloudUpdateNotice() {
  const status = useSyncStatus();
  const { settings } = useApp();
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  if (!status || status.mode !== "cloud" || !status.behind.length) return null;

  const copy = async () => {
    try {
      const sql = await (await fetch("/db-update.sql", { cache: "no-store" })).text();
      await navigator.clipboard.writeText(sql);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  };

  return (
    <div id="cloud-update" role="status" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
      <div className="font-semibold">Your cloud database needs a one-time update</div>
      <p className="mt-1 text-sm">
        Until it’s updated, these stay on this device only, so your family can’t see them
        {status.waiting ? ` (${status.waiting} change${status.waiting === 1 ? "" : "s"} waiting)` : ""}:
      </p>
      <ul className="mt-1 list-disc pl-5 text-sm">
        {status.behind.map((g) => (
          <li key={g.table}>{describeGap(g)}</li>
        ))}
      </ul>
      <ol className="mt-3 list-decimal space-y-0.5 pl-5 text-sm">
        <li>Tap <b>Copy update</b>.</li>
        <li>Tap <b>Open Supabase</b> and sign in. A blank SQL editor opens.</li>
        <li>Paste, then tap <b>Run</b>. You should see “Success”.</li>
        <li>Come back here and tap <b>Sync now</b>. Everything waiting uploads on its own.</li>
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => void copy()}>
          {copied === "ok" ? "Copied ✓" : "Copy update"}
        </button>
        <a className="btn-secondary" href={sqlEditorUrl(settings.supabaseUrl)} target="_blank" rel="noreferrer">
          Open Supabase ↗
        </a>
      </div>
      {copied === "fail" && (
        <p className="mt-2 text-sm">
          Couldn’t copy automatically.{" "}
          <a className="underline" href="/db-update.sql" target="_blank" rel="noreferrer">
            Open the update
          </a>
          , select all and copy it.
        </p>
      )}
      <p className="mt-2 text-xs opacity-80">Only the person who created the Supabase project can do this. It takes about a minute and is safe to run more than once.</p>
    </div>
  );
}
