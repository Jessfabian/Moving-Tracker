"use client";

import {
  estimateMoveCosts,
  estimateMoveSize,
  formatMoney,
  MOVER_DIRECTORY,
  MOVER_QUESTIONS,
  quoteRequestText,
  type MethodEstimate,
  type MoverDirectoryEntry,
  type MoveSize,
} from "@moving/shared";
import { useState, useSyncExternalStore } from "react";
import { printHtml } from "@/lib/media";
import { InstantQuoteCard } from "./InstantQuote";
import { useDb, useStore } from "@/lib/store-context";

type Db = ReturnType<typeof useDb>;

const KIND_LABELS: Record<MoverDirectoryEntry["kind"], { label: string; icon: string; note: string }> = {
  full_service: { label: "Full-service van lines", icon: "🚛", note: "They pack, load, drive and unload" },
  container: { label: "Portable containers", icon: "📦", note: "You pack & load, they drive" },
  truck: { label: "Rental trucks", icon: "🚚", note: "Do-it-yourself, one-way" },
  labor: { label: "Loading help", icon: "💪", note: "Hourly crews for trucks & containers" },
};

export const fmcsaSearchUrl = (name: string) => `https://safer.fmcsa.dot.gov/keywordx.asp?searchstring=${encodeURIComponent(`*${name.toUpperCase()}*`)}&SEARCHTYPE=`;

export function moveEstimates(db: Db) {
  const size = estimateMoveSize(db);
  const miles = db.moves[0]?.distance_miles ?? 0;
  const estimates = estimateMoveCosts(size, miles);
  return { size, miles, estimates };
}

/** Which ballpark estimate a quote should be compared to. */
export function methodFor(estimates: MethodEstimate[], movingMethod: string | undefined, includesPacking: boolean): MethodEstimate | undefined {
  const m = movingMethod === "container" || movingMethod === "rental_truck" ? movingMethod : includesPacking ? "full_service" : "self_pack";
  return estimates.find((e) => e.method === m);
}

function contactFor(db: Db) {
  const people = db.family_members.filter((m) => m.relationship === "self" || m.relationship === "spouse").sort((a, b) => (a.relationship === "self" ? 0 : 1) - (b.relationship === "self" ? 0 : 1));
  const self = people[0];
  return {
    name: people.map((p) => p.name).filter(Boolean).join(" & ") || undefined,
    phone: people.map((p) => p.phone ?? "").find(Boolean) || undefined,
    email: self?.email || people.map((p) => p.email ?? "").find(Boolean) || undefined,
  };
}

const QKEY = "moving-tracker.mover-questions";
const qListeners = new Set<() => void>();
const subscribeQuestions = (cb: () => void) => {
  qListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    qListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
};
const readQuestions = () => localStorage.getItem(QKEY) ?? "[]";
const serverQuestions = () => "[]";

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function packetHtml(db: Db, size: MoveSize, estimates: MethodEstimate[], request: { subject: string; body: string }) {
  const move = db.moves[0];
  const rooms = db.rooms.filter((r) => !r.deleted);
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const moving = db.items.filter((i) => !i.deleted && ["move", "store", "undecided"].includes(i.disposition));
  const groups = new Map<string, typeof moving>();
  for (const i of moving) {
    const k = (i.room_id && roomName.get(i.room_id)) || "Unassigned";
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  const boxesByRoom = new Map<string, number>();
  for (const b of db.boxes.filter((x) => !x.deleted)) {
    const k = (b.room_id && roomName.get(b.room_id)) || "Unassigned";
    boxesByRoom.set(k, (boxesByRoom.get(k) ?? 0) + 1);
  }
  const roomOrder = [...new Set([...size.byRoom.map((r) => r.room), ...groups.keys()])];
  const where = (city?: string, state?: string, zip?: string, addr?: string) => [addr, city, state, zip].filter(Boolean).join(", ") || "—";
  const css = `body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;margin:24px;font-size:12px}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 6px;border-bottom:2px solid #e5e7eb;padding-bottom:4px}table{width:100%;border-collapse:collapse;margin-bottom:10px}th,td{border:1px solid #e5e7eb;padding:5px 6px;text-align:left;vertical-align:top}th{background:#f3f4f6}.muted{color:#6b7280}.grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px}.room{page-break-inside:avoid}pre{white-space:pre-wrap;font:inherit}.box{display:inline-block;width:12px;height:12px;border:1px solid #6b7280;margin-right:6px;vertical-align:middle}@media print{body{margin:10mm}}`;
  const body = `
<h1>Moving quote packet</h1>
<div class="muted">${esc(request.subject)}</div>
<h2>Move details</h2>
<div class="grid">
<div><b>From:</b> ${esc(where(move?.from_city, move?.from_state, move?.from_zip, move?.from_address))}</div>
<div><b>To:</b> ${esc(where(move?.to_city, move?.to_state, move?.to_zip, move?.to_address))}</div>
<div><b>Distance:</b> ${move?.distance_miles ? `${move.distance_miles.toLocaleString()} driving miles` : "—"}</div>
<div><b>Load date:</b> ${esc(move?.load_date ?? move?.move_date ?? "flexible")}</div>
<div><b>Delivery by:</b> ${esc(move?.delivery_date ?? "flexible")}</div>
<div><b>Home:</b> ${esc(size.homeLabel)} · ${size.rooms} rooms</div>
<div><b>Estimated weight:</b> ${size.weightLbs.toLocaleString()} lbs (${size.basis === "inventory" ? "from inventory" : "typical for home size"})</div>
<div><b>Volume:</b> ${size.cubicFeet.toLocaleString()} cu ft · ${esc(size.truck)}</div>
<div><b>Items / boxes / books:</b> ${size.itemsToMove} / ${size.boxes} / ${size.booksToMove}</div>
<div><b>Fragile items:</b> ${size.fragileItems}</div>
</div>
${size.specialItems.length ? `<p><b>Bulky / special items:</b> ${esc(size.specialItems.join(", "))}</p>` : ""}
${size.highValueItems.length ? `<p><b>High-value items:</b> ${size.highValueItems.map((h) => `${esc(h.name)} (${esc(formatMoney(h.value))})`).join(", ")}</p>` : ""}
<h2>Ballpark costs (planning only)</h2>
<table><tr><th>Method</th><th>Includes</th><th class="right">Range</th></tr>
${estimates.map((e) => `<tr><td>${esc(e.label)}</td><td>${esc(e.includes)}</td><td>${esc(formatMoney(e.low))} – ${esc(formatMoney(e.high))}</td></tr>`).join("")}
</table>
<h2>Inventory by room</h2>
${roomOrder
  .map((room) => {
    const items = groups.get(room) ?? [];
    const stats = size.byRoom.find((r) => r.room === room);
    return `<div class="room"><h3 style="margin:10px 0 4px;font-size:13px">${esc(room)} <span class="muted">· ${items.reduce((a, i) => a + Math.max(1, i.quantity ?? 1), 0)} items · ${boxesByRoom.get(room) ?? 0} boxes${stats ? ` · ~${stats.lbs.toLocaleString()} lbs` : ""}</span></h3>${
      items.length
        ? `<table><tr><th>Item</th><th>Qty</th><th>Notes</th></tr>${items
            .map((i) => `<tr><td>${esc(i.name)}${i.brand ? ` <span class="muted">${esc(i.brand)}</span>` : ""}</td><td>${Math.max(1, i.quantity ?? 1)}</td><td>${[i.fragile ? "Fragile" : "", i.box_id ? "In a box" : "", (i.est_value ?? 0) >= 500 ? "High value" : "", i.disposition === "store" ? "To storage" : ""].filter(Boolean).join(" · ")}</td></tr>`)
            .join("")}</table>`
        : ""
    }</div>`;
  })
  .join("")}
<h2>Questions to ask every mover</h2>
${MOVER_QUESTIONS.map((q) => `<div style="margin:4px 0"><span class="box"></span>${esc(q)}</div>`).join("")}
<h2>Quote request</h2>
<pre>${esc(request.body)}</pre>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Moving quote packet</title><style>${css}</style></head><body>${body}</body></html>`;
}

export function QuoteKit({ onCompare }: { onCompare: () => void }) {
  const db = useDb();
  const store = useStore();
  const move = db.moves[0];
  const { size, miles, estimates } = moveEstimates(db);
  const contact = contactFor(db);
  const request = quoteRequestText(move, size, contact);
  const [copied, setCopied] = useState(false);
  const checkedRaw = useSyncExternalStore(subscribeQuestions, readQuestions, serverQuestions);
  const checked = new Set<number>(JSON.parse(checkedRaw) as number[]);
  const toggleQuestion = (i: number) => {
    const next = new Set(checked);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    localStorage.setItem(QKEY, JSON.stringify([...next]));
    qListeners.forEach((l) => l());
  };

  const quotes = db.quotes.filter((q) => !q.deleted);
  const requestedEmails = [...new Set(quotes.filter((q) => q.status === "requested" && (q.email ?? "").trim()).map((q) => q.email.trim()))];
  const mailto = (bcc?: string[]) =>
    `mailto:?${bcc?.length ? `bcc=${encodeURIComponent(bcc.join(","))}&` : ""}subject=${encodeURIComponent(request.subject)}&body=${encodeURIComponent(request.body)}`;
  const inTracker = (name: string) => quotes.some((q) => q.company.trim().toLowerCase() === name.toLowerCase());
  const addToTracker = (m: MoverDirectoryEntry) => store.insert("quotes", { company: m.name, website: m.url, status: "requested", notes: m.note });
  const preferred = move?.moving_method;
  const kinds = Object.keys(KIND_LABELS) as MoverDirectoryEntry["kind"][];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="card-ink p-6">
          <div className="eyebrow text-white/50">How big is this move?</div>
          <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <div className="font-display text-5xl leading-none font-extrabold tracking-[-0.05em] text-lime">{size.weightLbs.toLocaleString()} lbs</div>
              <div className="mt-1 text-sm text-white/60">
                ≈ {size.cubicFeet.toLocaleString()} cu ft · {size.truck} · {size.containers} container{size.containers === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {[
              ["Home", size.homeLabel],
              ["Items", size.itemsToMove.toLocaleString()],
              ["Boxes", size.boxes.toLocaleString()],
              ["Books", size.booksToMove.toLocaleString()],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-white/10 p-2.5">
                <div className="text-[11px] uppercase tracking-wide text-white/50">{k}</div>
                <div className="font-semibold">{v}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-white/60">
            Inventory adds up to <b className="text-white">{size.inventoryLbs.toLocaleString()} lbs</b>; a typical {size.homeLabel.toLowerCase()} home is about{" "}
            <b className="text-white">{size.typicalLbs.toLocaleString()} lbs</b>. Using the {size.basis === "inventory" ? "inventory" : "typical"} figure
            {size.basis === "typical" ? " — inventories are rarely complete, so keep logging items for a sharper number." : "."}
          </p>
          {(size.specialItems.length > 0 || size.fragileItems > 0 || size.highValueItems.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {size.specialItems.map((s, i) => (
                <span key={`${s}-${i}`} className="chip bg-amber-300/20 text-amber-100">
                  🏋️ {s}
                </span>
              ))}
              {size.fragileItems > 0 && <span className="chip bg-white/10 text-white/85">🥚 {size.fragileItems} fragile</span>}
              {size.highValueItems.slice(0, 6).map((h, i) => (
                <span key={`${h.name}-${i}`} className="chip bg-lime/20 text-lime">
                  💎 {h.name} {formatMoney(h.value)}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold tracking-tight">By room</h2>
            <a className="text-xs text-indigo-700 underline" href="/inventory">
              Inventory →
            </a>
          </div>
          {size.byRoom.length ? (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="py-1">Room</th>
                  <th className="py-1 text-right">Items</th>
                  <th className="py-1 text-right">Boxes</th>
                  <th className="py-1 text-right">Lbs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {size.byRoom.map((r) => (
                  <tr key={r.room}>
                    <td className="py-1.5 font-medium">{r.room}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.items}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.boxes}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.lbs.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-sm text-gray-500">Log rooms, items and boxes in the inventory for a room-by-room breakdown movers can price.</p>
          )}
        </div>
      </div>

      <InstantQuoteCard size={size} estimates={estimates} />

      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-bold tracking-tight">What it should cost</h2>
          <span className="text-xs text-gray-500">{miles ? `${miles.toLocaleString()} driving miles · planning ballparks, not quotes` : "Add both ZIP codes on the move to size the distance"}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {estimates.map((e) => (
            <div key={e.method} className={`card ${preferred === e.method ? "ring-2 ring-ink" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="eyebrow">{e.label}</div>
                {preferred === e.method && <span className="chip bg-lime text-ink">Your plan</span>}
              </div>
              <div className="mt-2 font-display text-2xl font-bold tracking-tight">
                {formatMoney(e.low)} – {formatMoney(e.high)}
              </div>
              <div className="text-xs text-gray-500">{e.includes}</div>
              <ul className="mt-3 space-y-0.5 text-xs text-gray-600">
                {e.breakdown.map((b) => (
                  <li key={b.label} className="flex justify-between gap-2">
                    <span>{b.label}</span>
                    <span className="tabular-nums">{formatMoney(b.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl font-bold tracking-tight">Quote request</h2>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(`Subject: ${request.subject}\n\n${request.body}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? "✓ Copied" : "📋 Copy"}
              </button>
              <a className="btn-secondary" href={mailto()}>
                ✉️ Email
              </a>
              <a className={`btn-primary ${requestedEmails.length ? "" : "pointer-events-none opacity-50"}`} href={requestedEmails.length ? mailto(requestedEmails) : undefined} aria-disabled={!requestedEmails.length}>
                📨 Email all requested ({requestedEmails.length})
              </a>
              <button className="btn-ghost" onClick={() => printHtml(packetHtml(db, size, estimates, request))}>
                🖨️ Print quote packet
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Sent from {contact.name ?? "you"}
            {contact.email ? ` · ${contact.email}` : " — add your email to Family (self) to sign it"}. “Email all requested” BCCs every quote marked <b>requested</b> that has an email.
          </p>
          <div className="mt-3 rounded-xl bg-sand/60 p-3 text-sm font-semibold">{request.subject}</div>
          <pre className="mt-2 max-h-96 overflow-auto rounded-xl bg-ink/[0.03] p-3 font-sans text-sm leading-relaxed whitespace-pre-wrap">{request.body}</pre>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold tracking-tight">Ask every mover</h2>
            <span className="chip bg-ink/5">
              {checked.size}/{MOVER_QUESTIONS.length}
            </span>
          </div>
          <ul className="mt-3 space-y-2">
            {MOVER_QUESTIONS.map((q, i) => (
              <li key={q}>
                <label className="flex cursor-pointer gap-2.5 text-sm">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 flex-none" style={{ accentColor: "#0d0d0f" }} checked={checked.has(i)} onChange={() => toggleQuestion(i)} />
                  <span className={checked.has(i) ? "text-gray-400 line-through" : ""}>{q}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-bold tracking-tight">Who to ask</h2>
          <a className="text-xs text-indigo-700 underline" href="https://ai.fmcsa.dot.gov/hhg/search.asp" target="_blank" rel="noreferrer">
            Search all FMCSA-registered movers ↗
          </a>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {kinds.map((k) => (
            <div key={k} className="card">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-sand text-lg">{KIND_LABELS[k].icon}</span>
                <div>
                  <div className="font-bold">{KIND_LABELS[k].label}</div>
                  <div className="text-xs text-gray-500">{KIND_LABELS[k].note}</div>
                </div>
              </div>
              <ul className="mt-3 divide-y divide-ink/5">
                {MOVER_DIRECTORY.filter((m) => m.kind === k).map((m) => {
                  const added = inTracker(m.name);
                  return (
                    <li key={m.name} className="flex flex-wrap items-center gap-2 py-2">
                      <div className="min-w-0 flex-1">
                        <a className="font-semibold hover:underline" href={m.url} target="_blank" rel="noreferrer">
                          {m.name} ↗
                        </a>
                        <div className="text-xs text-gray-500">{m.note}</div>
                      </div>
                      {k !== "truck" && (
                        <a className="text-xs text-indigo-700 underline" href={fmcsaSearchUrl(m.name)} target="_blank" rel="noreferrer">
                          Verify FMCSA
                        </a>
                      )}
                      <button className={added ? "chip bg-sage text-ink" : "btn-secondary px-2.5 py-1 text-xs"} disabled={added} onClick={() => addToTracker(m)}>
                        {added ? "✓ In tracker" : "+ Add to tracker"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-lime/50 p-4 text-sm">
        <span>
          <b>{quotes.length}</b> mover{quotes.length === 1 ? "" : "s"} in the tracker · {quotes.filter((q) => q.price != null).length} with a price.
        </span>
        <button className="btn-primary" onClick={onCompare}>
          Compare quotes →
        </button>
      </div>
    </div>
  );
}
