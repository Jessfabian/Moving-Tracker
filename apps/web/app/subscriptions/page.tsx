"use client";

import {
  FREQUENCIES,
  SUB_CATEGORIES,
  SUBSCRIPTION_STATUSES,
  addPeriod,
  cancelHelp,
  daysBetween,
  findService,
  formatDate,
  formatMoney,
  optionLabel,
  rollForward,
  subscriptionAlerts,
  subscriptionCost,
  subscriptionSummary,
  today,
  type Subscription,
} from "@moving/shared";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EntityForm } from "@/components/EntityForm";
import { InboxConnect } from "@/components/InboxConnect";
import { MoneyImport } from "@/components/MoneyImport";
import { BULK_BTN, BULK_DANGER, BULK_PRIMARY, SelectableRow, SelectActions, SelectBar, useBulkDelete, useBulkHide, useBulkUpdate, useSelection, type Selection } from "@/components/Selection";
import { Card, showUndo, useDeleteWithUndo, useHiddenRows } from "@/components/Swipe";
import { Drawer, PageHeader, Stat } from "@/components/ui";
import { useDb, useStore } from "@/lib/store-context";

const CAT_COLORS: Record<string, string> = {
  entertainment: "#e50914",
  music: "#1db954",
  gaming: "#7c3aed",
  design_tools: "#ff5a1f",
  software: "#0d0d0f",
  cloud: "#0891b2",
  finance: "#059669",
  fitness: "#db2777",
  food: "#d97706",
  shopping: "#f59e0b",
  news: "#475569",
  education: "#2563eb",
  health: "#16a34a",
  security: "#0f766e",
  kids: "#ec4899",
  pets: "#65a30d",
  other: "#78716c",
};

const STATUS_CHIP: Record<string, string> = {
  confirm: "bg-amber-100 text-amber-800",
  free_trial: "bg-lilac text-ink",
  cancelling: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const STATUS_SHORT: Record<string, string> = { confirm: "Confirm?", free_trial: "Free trial", cancelling: "Cancelling", cancelled: "Cancelled" };

function Logo({ s, size = "h-11 w-11" }: { s: Pick<Subscription, "name" | "category">; size?: string }) {
  return (
    <span className={`flex ${size} flex-none items-center justify-center rounded-xl font-display text-lg font-bold text-white`} style={{ background: CAT_COLORS[s.category] ?? "#78716c" }}>
      {s.name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

function dueText(date: string | null, t: string) {
  if (!date) return "";
  const d = daysBetween(t, date);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d > 1 && d <= 14) return `in ${d} days`;
  return formatDate(date, { month: "short", day: "numeric" });
}

export default function SubscriptionsPage() {
  const db = useDb();
  const store = useStore();
  const t = today();
  const subs = useMemo(() => db.subscriptions ?? [], [db.subscriptions]);
  const hiddenRows = useHiddenRows();
  const del = useDeleteWithUndo();
  const [editing, setEditing] = useState<Subscription | "new" | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [cat, setCat] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [copied, setCopied] = useState(false);

  const sum = subscriptionSummary(subs);
  const alerts = subscriptionAlerts(subs, t);
  const visible = subs.filter((x) => !hiddenRows.isHidden("subscriptions", x.id));
  const confirm = visible.filter((x) => x.status === "confirm");
  const live = visible.filter((x) => x.status !== "confirm" && x.status !== "cancelled" && (!cat || x.category === cat));
  const cancelled = visible.filter((x) => x.status === "cancelled");
  const groups = SUB_CATEGORIES.map((c) => ({ ...c, rows: live.filter((x) => x.category === c.value).sort((a, b) => subscriptionCost(b).monthly - subscriptionCost(a).monthly) })).filter((g) => g.rows.length);
  const nextUp = subs
    .filter((x) => x.status === "active" || x.status === "free_trial")
    .map((x) => ({ x, date: rollForward(x.next_due, x.frequency, t) }))
    .filter((d): d is { x: Subscription; date: string } => !!d.date && daysBetween(t, d.date) <= 31)
    .sort((a, b) => a.date.localeCompare(b.date));
  const current = viewing ? subs.find((x) => x.id === viewing) : undefined;
  const help = current ? cancelHelp(current) : null;

  const listIds = [...groups.flatMap((g) => g.rows.map((x) => x.id)), ...(showCancelled ? cancelled.map((x) => x.id) : [])];
  const sel = useSelection(listIds);
  const nameOf = (id: string) => subs.find((x) => x.id === id)?.name ?? "Subscription";
  const bulkUpdate = useBulkUpdate<Subscription>("subscriptions", sel, "subscription");
  const bulkDelete = useBulkDelete("subscriptions", sel, "subscription");
  const bulkHide = useBulkHide("subscriptions", sel, nameOf, "subscription");
  const confirmSel = useSelection(confirm.map((x) => x.id));
  const confirmUpdate = useBulkUpdate<Subscription>("subscriptions", confirmSel, "subscription");
  const confirmDelete = useBulkDelete("subscriptions", confirmSel, "subscription");
  const confirmHide = useBulkHide("subscriptions", confirmSel, nameOf, "subscription");

  const actions = (x: Subscription) => [
    {
      label: "Hide",
      icon: "🙈",
      onClick: () => {
        hiddenRows.hide({ table: "subscriptions", id: x.id, label: x.name });
        showUndo(`Hid “${x.name}” · find it in Settings`, () => hiddenRows.unhide("subscriptions", x.id));
      },
    },
    { label: "Delete", icon: "🗑", tone: "danger" as const, onClick: () => del("subscriptions", x.id, `“${x.name}”`) },
  ];

  /** Fill in category & cancel page from the catalog when one is typed in by hand. */
  const enrich = (r: Subscription | null) => {
    if (!r) return;
    const svc = findService(r.name);
    if (!svc) return;
    const patch: Partial<Subscription> = {};
    if (!r.service) patch.service = svc.key;
    if (!r.cancel_url) patch.cancel_url = svc.cancel;
    if (!r.service && r.category === "entertainment" && svc.category !== "entertainment") patch.category = svc.category;
    if (Object.keys(patch).length) store.update("subscriptions", r.id, patch, { silent: true });
  };

  const row = (x: Subscription, s: Selection = sel) => {
    const c = subscriptionCost(x);
    const next = x.status === "cancelled" ? null : rollForward(x.next_due, x.frequency, t);
    return (
      <li key={x.id}>
        <SelectableRow sel={s} id={x.id} actions={actions(x)} label={x.name}>
          <button type="button" onClick={() => setViewing(x.id)} className="flex w-full items-center gap-3 rounded-2xl border border-gray-200/80 bg-white p-3 text-left transition hover:shadow-md">
            <Logo s={x} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <b className={`truncate ${x.status === "cancelled" ? "text-gray-400 line-through" : ""}`}>{x.name}</b>
                {STATUS_SHORT[x.status] && <span className={`chip shrink-0 ${STATUS_CHIP[x.status]}`}>{STATUS_SHORT[x.status]}</span>}
              </span>
              <span className="block truncate text-xs text-gray-500">
                {next ? `${x.status === "free_trial" ? "Trial ends" : "Renews"} ${dueText(next, t)}` : x.status === "cancelled" && x.cancelled_on ? `Cancelled ${formatDate(x.cancelled_on)}` : optionLabel(FREQUENCIES, x.frequency)}
                {x.pay_method ? ` · ${x.pay_method}` : ""}
              </span>
            </span>
            <span className="text-right">
              <b className="block font-display">{x.amount != null ? formatMoney(c.monthly) : "—"}</b>
              <span className="text-[11px] whitespace-nowrap text-gray-400">{x.amount != null ? `/mo · ${formatMoney(c.yearly)}/yr` : "add price"}</span>
            </span>
          </button>
        </SelectableRow>
      </li>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Subscriptions"
        icon="🔁"
        eyebrow="Money · recurring charges"
        subtitle="Every streaming service, app and membership in one place — what it costs a month and a year, when it renews, and help cancelling what you don't need before the move."
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => setImporting(true)}>
              ✉️ Import
            </button>
            <button type="button" className="btn-primary" onClick={() => setEditing("new")}>
              + Add subscription
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Per month" value={formatMoney(sum.monthly)} sub={`${sum.count} paying`} tone="bg-lime" />
        <Stat label="Per year" value={formatMoney(sum.yearly)} sub="if nothing changes" tone="bg-sand" />
        <Stat label="To confirm" value={sum.toConfirm} sub={sum.trials ? `${sum.trials} free trial${sum.trials === 1 ? "" : "s"}` : "from imports"} tone="bg-sky" />
        <Stat label="Saved / yr" value={formatMoney(sum.savedYearly)} sub="by cancelling" tone="bg-sage" />
      </div>

      <InboxConnect id="subs.inbox" />

      {alerts.length > 0 && (
        <Card id="subs.alerts" title={`Heads up · ${alerts.length}`} icon="⚠️">
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.kind + a.ids.join()} className={`rounded-2xl p-3 text-sm ${a.kind === "duplicate" ? "bg-red-50 text-red-900" : a.kind === "trial" ? "bg-lilac" : "bg-amber-50 text-amber-950"}`}>
                <b className="block">{a.title}</b>
                <span className="mt-0.5 block opacity-80">{a.detail}</span>
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {a.ids.map((id) => {
                    const s = subs.find((x) => x.id === id);
                    return s ? (
                      <button key={id} type="button" className="chip min-h-8 bg-white/80 text-ink" onClick={() => setViewing(id)}>
                        {s.name} ›
                      </button>
                    ) : null;
                  })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {confirm.length > 0 && (
        <Card id="subs.confirm" title={`Is this a subscription? · ${confirm.length}`} icon="🤔" right={!confirmSel.active && <SelectBar sel={confirmSel} noun="subscription" />}>
          <p className="-mt-2 mb-3 text-sm text-gray-500">These charge you regularly, but the app isn&apos;t sure they&apos;re subscriptions.</p>
          {confirmSel.active && <SelectBar sel={confirmSel} noun="subscription" className="mb-3" />}
          <ul className="space-y-2">
            {confirm.map((x) => (
              <li key={x.id}>
                <SelectableRow sel={confirmSel} id={x.id} actions={actions(x)} label={x.name}>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
                <div className="flex items-center gap-3">
                  <Logo s={x} size="h-10 w-10" />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setViewing(x.id)}>
                    <b className="block truncate">{x.name}</b>
                    <span className="block truncate text-xs text-gray-500">
                      {x.amount != null ? `${formatMoney(x.amount)} ${optionLabel(FREQUENCIES, x.frequency).toLowerCase()}` : "amount unknown"}
                      {x.last_charged ? ` · last ${formatDate(x.last_charged, { month: "short", day: "numeric" })}` : ""}
                    </span>
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button type="button" className="btn-primary" onClick={() => store.update("subscriptions", x.id, { status: "active" })}>
                    ✓ Yes, it is
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => del("subscriptions", x.id, `“${x.name}”`)}>
                    Not a subscription
                  </button>
                </div>
              </div>
                </SelectableRow>
              </li>
            ))}
          </ul>
          <SelectActions sel={confirmSel} noun="subscription">
            <div className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
              <button type="button" className={BULK_PRIMARY} onClick={() => confirmUpdate({ status: "active" }, "Confirmed")}>
                ✓ Yes, they are
              </button>
              <button type="button" className={BULK_BTN} onClick={confirmHide}>
                🙈 Hide
              </button>
              <button type="button" className={BULK_DANGER} onClick={confirmDelete}>
                🗑 Not subscriptions
              </button>
            </div>
          </SelectActions>
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          {sum.byCategory.length > 0 && (
            <div className="flex items-center gap-2">
            <div className="no-scrollbar -mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1">
              <button type="button" onClick={() => setCat("")} className={`chip min-h-9 shrink-0 px-3 ${!cat ? "bg-ink! text-white!" : ""}`}>
                All · {formatMoney(sum.monthly)}
              </button>
              {sum.byCategory.map((c) => (
                <button key={c.category} type="button" onClick={() => setCat(cat === c.category ? "" : c.category)} className={`chip min-h-9 shrink-0 px-3 ${cat === c.category ? "bg-ink! text-white!" : ""}`}>
                  <span className="h-2 w-2 rounded-full" style={{ background: CAT_COLORS[c.category] }} />
                  {optionLabel(SUB_CATEGORIES, c.category)} · {formatMoney(c.monthly)}
                </button>
              ))}
            </div>
              {!sel.active && <SelectBar sel={sel} noun="subscription" className="shrink-0" />}
            </div>
          )}
          {sum.byCategory.length === 0 && !sel.active && listIds.length > 0 && <SelectBar sel={sel} noun="subscription" />}
          {sel.active && <SelectBar sel={sel} noun="subscription" />}

          {groups.length ? (
            groups.map((g) => (
              <section key={g.value}>
                <h2 className="mb-2 flex items-baseline gap-2 font-display text-xl font-bold tracking-tight">
                  <span className="h-2.5 w-2.5 self-center rounded-full" style={{ background: CAT_COLORS[g.value] }} />
                  {g.label}
                  <span className="ml-auto text-sm font-semibold text-gray-500">{formatMoney(g.rows.reduce((a, x) => a + (x.status === "free_trial" ? 0 : subscriptionCost(x).monthly), 0))}/mo</span>
                </h2>
                <ul className="space-y-2">{g.rows.map((x) => row(x))}</ul>
              </section>
            ))
          ) : (
            <div className="dot-grid flex flex-col items-center gap-3 rounded-[1.75rem] border border-dashed border-ink/15 px-6 py-12 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-3xl shadow-sm">🔁</div>
              <div className="font-display text-2xl font-bold tracking-tight">{subs.length ? "Nothing here" : "No subscriptions yet"}</div>
              <p className="max-w-md text-sm text-gray-500">Upload a bank statement PDF or paste receipt emails and the app will find Netflix, Hulu, Spotify, gym memberships and everything else that charges you every month.</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" className="btn-primary" onClick={() => setImporting(true)}>
                  Find my subscriptions
                </button>
                <button type="button" className="btn-secondary" onClick={() => setEditing("new")}>
                  Add one by hand
                </button>
              </div>
            </div>
          )}

          {cancelled.length > 0 && (
            <section>
              <button type="button" className="flex min-h-11 w-full items-center gap-2 text-left font-display text-lg font-bold" onClick={() => setShowCancelled(!showCancelled)}>
                <span className={`text-xs transition-transform ${showCancelled ? "" : "-rotate-90"}`}>▼</span> Cancelled · {cancelled.length}
                <span className="ml-auto text-sm font-semibold text-emerald-700">saving {formatMoney(sum.savedYearly)}/yr</span>
              </button>
              {showCancelled && <ul className="mt-2 space-y-2">{cancelled.map((x) => row(x))}</ul>}
            </section>
          )}

          <SelectActions sel={sel} noun="subscription">
            <div className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
              <select className={BULK_BTN} aria-label="Set status" value="" onChange={(e) => e.target.value && bulkUpdate(e.target.value === "cancelled" ? { status: "cancelled", cancelled_on: t, remind: false } : { status: e.target.value as Subscription["status"] }, `Status: ${optionLabel(SUBSCRIPTION_STATUSES, e.target.value)}`)}>
                <option value="">Status…</option>
                {SUBSCRIPTION_STATUSES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select className={BULK_BTN} aria-label="Set category" value="" onChange={(e) => e.target.value && bulkUpdate({ category: e.target.value as Subscription["category"] }, `Category: ${optionLabel(SUB_CATEGORIES, e.target.value)}`)}>
                <option value="">Category…</option>
                {SUB_CATEGORIES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select className={BULK_BTN} aria-label="Set calendar reminders" value="" onChange={(e) => e.target.value && bulkUpdate({ remind: e.target.value === "on" }, e.target.value === "on" ? "Reminders on" : "Reminders off")}>
                <option value="">Calendar…</option>
                <option value="on">Show renewals</option>
                <option value="off">Hide renewals</option>
              </select>
              <button type="button" className={BULK_BTN} onClick={bulkHide}>
                🙈 Hide
              </button>
              <button type="button" className={BULK_DANGER} onClick={bulkDelete}>
                🗑 Delete
              </button>
            </div>
          </SelectActions>
        </div>

        <aside className="space-y-4">
          <Card id="subs.upcoming" title="Next 30 days" icon="📅" summary={nextUp.length ? `${nextUp.length} charges` : undefined}>
            {nextUp.length ? (
              <ul className="space-y-2">
                {nextUp.slice(0, 10).map(({ x, date }) => (
                  <li key={x.id}>
                    <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setViewing(x.id)}>
                      <span className="flex h-11 w-11 flex-none flex-col items-center justify-center rounded-xl bg-gray-100">
                        <span className="text-[9px] text-gray-500 uppercase">{formatDate(date, { month: "short" })}</span>
                        <span className="font-display text-lg leading-none font-bold">{Number(date.slice(8))}</span>
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{x.name}</span>
                      <span className="text-right text-xs">
                        <b className="block text-sm">{x.status === "free_trial" ? "trial ends" : formatMoney(x.amount)}</b>
                        <span className={daysBetween(t, date) <= 3 ? "font-semibold text-accent" : "text-gray-400"}>{dueText(date, t)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">Add the next charge date to see renewals here and on the calendar.</p>
            )}
          </Card>
          <Card id="subs.split" title="By category" icon="📊" summary={formatMoney(sum.monthly) + "/mo"}>
            {sum.byCategory.length ? (
              <>
                <div className="flex h-4 overflow-hidden rounded-full">
                  {sum.byCategory.map((c) => (
                    <div key={c.category} style={{ width: `${(c.monthly / (sum.monthly || 1)) * 100}%`, background: CAT_COLORS[c.category] }} />
                  ))}
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  {sum.byCategory.map((c) => (
                    <li key={c.category} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: CAT_COLORS[c.category] }} />
                      <span className="min-w-0 flex-1 truncate">
                        {optionLabel(SUB_CATEGORIES, c.category)} <span className="text-gray-400">· {c.count}</span>
                      </span>
                      <b>{formatMoney(c.monthly)}</b>
                      <span className="w-16 text-right text-xs text-gray-400">{formatMoney(c.monthly * 12)}/yr</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-gray-400">Your breakdown appears once you add subscriptions.</p>
            )}
          </Card>
          <Link href="/bills" className="card flex items-center gap-3 text-sm">
            <span className="text-2xl">🧾</span>
            <span className="min-w-0 flex-1">
              <b className="block">Bills &amp; income</b>
              <span className="text-gray-500">Subscriptions are counted in your monthly cash flow.</span>
            </span>
            <span className="text-gray-400">›</span>
          </Link>
        </aside>
      </div>

      <Drawer open={!!current} onClose={() => setViewing(null)} title={current?.name ?? ""}>
        {current && help && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Logo s={current} size="h-14 w-14" />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-gray-500">
                  {optionLabel(SUB_CATEGORIES, current.category)} · {optionLabel(FREQUENCIES, current.frequency)}
                </div>
                <span className={`chip mt-1 ${STATUS_CHIP[current.status] ?? "bg-lime text-ink"}`}>{STATUS_SHORT[current.status] ?? "Active"}</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Charge", current.amount != null ? formatMoney(current.amount) : "—"],
                ["Monthly", formatMoney(subscriptionCost(current).monthly)],
                ["Yearly", formatMoney(subscriptionCost(current).yearly)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-2xl bg-ink/5 p-3">
                  <div className="eyebrow">{k}</div>
                  <div className="mt-1 font-display text-lg font-bold">{v}</div>
                </div>
              ))}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {(
                [
                  [current.status === "free_trial" ? "Trial ends" : "Next charge", current.next_due ? formatDate(rollForward(current.next_due, current.frequency, t)) : "—"],
                  ["Last charged", current.last_charged ? formatDate(current.last_charged) : ""],
                  ["Billed to", current.pay_method],
                  ["Account", current.account_email],
                  ["Whose", db.family_members.find((m) => m.id === current.payer_id)?.name ?? ""],
                  ["Found in", current.source === "statement" ? "bank statement" : current.source === "email" ? "email" : "added by hand"],
                  ["Cancelled", current.cancelled_on ? formatDate(current.cancelled_on) : ""],
                ] as [string, string][]
              )
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-gray-500">{k}</dt>
                    <dd className="min-w-0 truncate font-medium">{v}</dd>
                  </div>
                ))}
            </dl>
            {current.notes && <p className="rounded-2xl bg-ink/5 p-3 text-sm whitespace-pre-wrap text-gray-600">{current.notes}</p>}

            {current.status === "confirm" && (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn-primary" onClick={() => store.update("subscriptions", current.id, { status: "active" })}>
                  ✓ It&apos;s a subscription
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setViewing(null);
                    del("subscriptions", current.id, `“${current.name}”`);
                  }}
                >
                  Not a subscription
                </button>
              </div>
            )}

            {current.status !== "cancelled" && current.status !== "confirm" && (
              <section className="rounded-2xl border border-gray-200 p-4">
                <h3 className="font-display text-lg font-bold">Unsubscribe</h3>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-600">
                  {help.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {help.url && (
                    <a className="btn-primary" href={help.url} target="_blank" rel="noreferrer" onClick={() => current.status !== "cancelling" && store.update("subscriptions", current.id, { status: "cancelling" }, { silent: true })}>
                      Open cancel page ↗
                    </a>
                  )}
                  <a className="btn-secondary" href={`mailto:?subject=${encodeURIComponent(help.email.subject)}&body=${encodeURIComponent(help.email.body)}`}>
                    ✉️ Write cancel email
                  </a>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      void navigator.clipboard?.writeText(`${help.email.subject}\n\n${help.email.body}`);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? "Copied ✓" : "Copy cancel message"}
                  </button>
                  {current.status !== "cancelling" && (
                    <button type="button" className="btn-secondary" onClick={() => store.update("subscriptions", current.id, { status: "cancelling" })}>
                      Mark “cancel requested”
                    </button>
                  )}
                </div>
                <button type="button" className="btn-danger mt-2 w-full" onClick={() => store.update("subscriptions", current.id, { status: "cancelled", cancelled_on: t, remind: false })}>
                  ✓ It&apos;s cancelled
                </button>
              </section>
            )}
            {current.status === "cancelled" && (
              <button type="button" className="btn-secondary w-full" onClick={() => store.update("subscriptions", current.id, { status: "active", cancelled_on: null })}>
                Re-subscribed? Mark active again
              </button>
            )}
            {current.status === "active" && current.next_due && (
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => {
                  const due = rollForward(current.next_due, current.frequency, t) ?? current.next_due!;
                  store.update("subscriptions", current.id, { last_charged: due, next_due: addPeriod(due, current.frequency) });
                }}
              >
                Charged — move to next renewal
              </button>
            )}
            <div className="sheet-footer sticky bottom-0 -mx-5 flex gap-2 border-t border-gray-200 bg-paper px-5 py-3">
              <button
                type="button"
                className="btn-secondary"
                aria-label="Delete"
                onClick={() => {
                  setViewing(null);
                  del("subscriptions", current.id, `“${current.name}”`);
                }}
              >
                🗑
              </button>
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={() => {
                  setEditing(current);
                  setViewing(null);
                }}
              >
                ✏️ Edit
              </button>
            </div>
          </div>
        )}
      </Drawer>

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing && editing !== "new" ? `Edit ${editing.name}` : "New subscription"}>
        {editing && (
          <EntityForm
            key={editing === "new" ? "new-sub" : editing.id}
            table="subscriptions"
            row={editing === "new" ? null : editing}
            initial={{ status: "active", frequency: "monthly", remind: true, source: "manual" }}
            onDone={(r) => {
              enrich(r);
              setEditing(null);
              if (r) setViewing(r.id);
            }}
          />
        )}
      </Drawer>

      <MoneyImport open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}
