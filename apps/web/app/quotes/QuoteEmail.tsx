"use client";

import {
  DEFAULT_BOX_LBS,
  DEFAULT_EMAIL_QUESTIONS,
  estimateBookWeightOz,
  formatMoney,
  isMoverItem,
  itemPriceIdea,
  itemWeightLbs,
  LBS_PER_CUFT,
  MOVER_QUESTIONS,
  PLEASE_INCLUDE,
  QUOTE_SECTIONS,
  quoteRequestText,
  signedMediaUrl,
  type Item,
  type MoveSize,
  type QuoteListItem,
  type QuoteSection,
} from "@moving/shared";
import { useMemo, useState, useSyncExternalStore } from "react";
import { download } from "@/lib/media";
import { askConfirm } from "@/components/ConfirmSheet";
import { Card } from "@/components/Swipe";
import { buildInventoryPdf, type InventoryPdfRoom, type InventoryPdfRow } from "@/lib/inventoryPdf";
import { useApp, useDb, useStore } from "@/lib/store-context";

/** Square ~96px JPEG thumbnail, or null when the item has no usable picture. */
async function thumbFrom(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const S = 96;
    const side = Math.min(bmp.width, bmp.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, S, S);
    ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, S, S);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.75));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

type Db = ReturnType<typeof useDb>;
type Line = { text: string; on: boolean };

export interface EmailPrefs {
  sections: Partial<Record<QuoteSection, boolean>>;
  loadWindow: string;
  deliveryWindow: string;
  notes: Line[];
  questions: number[];
  custom: Line[];
  include: number[];
  /** Item ids left off the list (still counted in the size — use "in our car" to drop them entirely). */
  excluded: string[];
  /** Size the move from the inventory alone, not the house size. */
  downsizing: boolean;
  /** Show item thumbnails in the inventory PDF. */
  pdfPhotos: boolean;
  /** Show each item's value (and room / total values) in the inventory PDF. */
  pdfValues: boolean;
}

const PKEY = "moving-tracker.quote-email.v1";
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
};

export function defaultPrefs(db: Db): EmailPrefs {
  const move = db.moves[0];
  const to = [move?.to_city, move?.to_state].filter(Boolean).join(", ") || "Tennessee";
  return {
    sections: {},
    loadWindow: "Flexible — anytime from the last week of December through January 4",
    deliveryWindow: "January 4–8 at the latest (we'll be there ourselves by January 2)",
    notes: [
      { text: "Our dates are flexible — we can load anytime from the last week of December through January 4. If a particular day in that window is cheaper, please quote it.", on: true },
      { text: `Our belongings need to arrive in ${to} by January 4–8 at the latest. We'll be there ourselves by January 2.`, on: true },
      {
        text: "Yes, it's a 5-bedroom home — but we're selling and consolidating a lot, so we are NOT bringing 5 bedrooms' worth of items. Please price the job from our attached inventory, not the size of the house.",
        on: true,
      },
      { text: "A few personal items are coming with us in our car, so they're not on the list.", on: true },
    ],
    questions: DEFAULT_EMAIL_QUESTIONS,
    custom: [],
    include: PLEASE_INCLUDE.map((_, i) => i),
    excluded: [],
    downsizing: true,
    pdfPhotos: true,
    pdfValues: true,
  };
}

export function useEmailPrefs(db: Db): [EmailPrefs, (p: EmailPrefs | null) => void] {
  const raw = useSyncExternalStore(subscribe, () => localStorage.getItem(PKEY), () => null);
  const prefs = useMemo(() => {
    const base = defaultPrefs(db);
    if (!raw) return base;
    try {
      return { ...base, ...(JSON.parse(raw) as Partial<EmailPrefs>) };
    } catch {
      return base;
    }
  }, [raw, db]);
  const set = (p: EmailPrefs | null) => {
    if (p) localStorage.setItem(PKEY, JSON.stringify(p));
    else localStorage.removeItem(PKEY);
    listeners.forEach((l) => l());
  };
  return [prefs, set];
}

export function contactFor(db: Db) {
  const people = db.family_members.filter((m) => m.relationship === "self" || m.relationship === "spouse").sort((a, b) => (a.relationship === "self" ? 0 : 1) - (b.relationship === "self" ? 0 : 1));
  const self = people[0];
  return {
    name: people.map((p) => p.name).filter(Boolean).join(" & ") || undefined,
    phone: people.map((p) => p.phone ?? "").find(Boolean) || undefined,
    email: self?.email || people.map((p) => p.email ?? "").find(Boolean) || undefined,
  };
}

/** Everything the movers would carry, grouped by room in the house's room order. */
export function moverItems(db: Db) {
  const rooms = [...db.rooms].filter((r) => !r.deleted).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const order = [...rooms.map((r) => r.name), "Unassigned"];
  const all = db.items.filter((i) => !i.deleted && ["move", "store", "undecided"].includes(i.disposition));
  const room = (i: Item) => (i.room_id && roomName.get(i.room_id)) || "Unassigned";
  const byRoom = (list: Item[]) => order.map((r) => [r, list.filter((i) => room(i) === r)] as const).filter(([, l]) => l.length);
  return { all, movers: all.filter(isMoverItem), car: all.filter((i) => i.in_car), room, byRoom, order, roomName };
}

function itemNotes(i: Item, db: Db, size: MoveSize) {
  const box = i.box_id ? db.boxes.find((b) => b.id === i.box_id && !b.deleted) : null;
  return [
    size.specialItems.includes(i.name) ? "Bulky / special handling" : "",
    i.fragile ? "Fragile" : "",
    box ? `Packed in box #${box.number}` : "",
    (i.est_value ?? 0) >= 500 ? "High value" : "",
    i.disposition === "store" ? "To storage" : "",
    i.disposition === "undecided" ? "May not come" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

const fileName = (db: Db) => `Moving inventory - ${[db.moves[0]?.from_city, db.moves[0]?.to_city].filter(Boolean).join(" to ") || "movers"}.pdf`;

export function QuoteEmail({ size, prefs, setPrefs, onPrint }: { size: MoveSize; prefs: EmailPrefs; setPrefs: (p: EmailPrefs | null) => void; onPrint: (request: { subject: string; body: string }, items: Item[]) => void }) {
  const db = useDb();
  const store = useStore();
  const { supabase } = useApp();
  const itemThumb = async (i: Item): Promise<Uint8Array | null> => {
    for (const m of i.photos ?? []) {
      const url = m.uri ?? (m.remotePath && supabase ? await signedMediaUrl(supabase, m.remotePath).catch(() => null) : null);
      const t = url ? await thumbFrom(url) : null;
      if (t) return t;
    }
    return i.image_url ? thumbFrom(/^(data|blob):/.test(i.image_url) ? i.image_url : `/api/image?url=${encodeURIComponent(i.image_url)}`) : null;
  };
  const move = db.moves[0];
  const contact = contactFor(db);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [newQ, setNewQ] = useState("");
  const [newNote, setNewNote] = useState("");

  const { movers, car, room, byRoom } = moverItems(db);
  const excluded = new Set(prefs.excluded);
  const listed = movers.filter((i) => !excluded.has(i.id));
  const listItems: QuoteListItem[] = listed.map((i) => ({ room: room(i), name: i.name, qty: Math.max(1, i.quantity ?? 1) }));
  const on = (k: QuoteSection) => prefs.sections[k] ?? QUOTE_SECTIONS.find((s) => s.key === k)!.on;

  const request = quoteRequestText(move, size, {
    ...contact,
    sections: prefs.sections,
    loadWindow: prefs.loadWindow,
    deliveryWindow: prefs.deliveryWindow,
    notes: prefs.notes.filter((n) => n.on && (n.text !== defaultPrefs(db).notes[3]!.text || car.length)).map((n) => n.text),
    questions: [...prefs.questions.filter((i) => MOVER_QUESTIONS[i]).sort((a, b) => a - b).map((i) => MOVER_QUESTIONS[i]!), ...prefs.custom.filter((c) => c.on && c.text.trim()).map((c) => c.text.trim())],
    pleaseInclude: prefs.include.filter((i) => PLEASE_INCLUDE[i]).sort((a, b) => a - b).map((i) => PLEASE_INCLUDE[i]!),
    items: listItems,
  });

  const update = (patch: Partial<EmailPrefs>) => setPrefs({ ...prefs, ...patch });
  const toggleIn = (list: number[], i: number) => (list.includes(i) ? list.filter((x) => x !== i) : [...list, i]);
  const toggleItem = (id: string) => update({ excluded: excluded.has(id) ? prefs.excluded.filter((x) => x !== id) : [...prefs.excluded, id] });

  const quotes = db.quotes.filter((q) => !q.deleted);
  const requestedEmails = [...new Set(quotes.filter((q) => q.status === "requested" && (q.email ?? "").trim()).map((q) => q.email.trim()))];
  const mailto = (bcc?: string[]) =>
    `mailto:?${bcc?.length ? `bcc=${encodeURIComponent(bcc.join(","))}&` : ""}subject=${encodeURIComponent(request.subject)}&body=${encodeURIComponent(request.body)}`;

  const makePdf = async () => {
    const boxes = db.boxes.filter((b) => !b.deleted);
    const books = db.books.filter((b) => !b.deleted && ["move", "store", "undecided"].includes(b.disposition));
    const roomOf = (id: string | null) => (id ? db.rooms.find((r) => r.id === id && !r.deleted)?.name : undefined) ?? "Unassigned";
    const bookLbs = (list: typeof books) => list.reduce((a, b) => a + estimateBookWeightOz(b) / 16, 0);
    const fmt = (n: number, est: boolean) => `${est ? "~" : ""}${Math.round(n).toLocaleString()}`;
    const boxRows = (room: string) =>
      boxes
        .filter((b) => roomOf(b.room_id) === room)
        .sort((a, b) => a.number - b.number)
        .map((b) => {
          const inside = books.filter((x) => x.box_id === b.id);
          const lbs = b.weight_lbs ?? (inside.length ? bookLbs(inside) + 1 : DEFAULT_BOX_LBS);
          const label = [b.label, b.contents].filter(Boolean).join(" — ") || (inside.length ? `${inside.length} books` : "");
          return { row: { name: `Box #${b.number}`, detail: label, qty: 1, lbs: fmt(lbs, b.weight_lbs == null), notes: [b.fragile ? "Fragile" : "", b.weight_lbs == null ? "" : "Weighed"].filter(Boolean).join(" · ") }, lbs };
        });
    const boxIds = new Set(boxes.map((b) => b.id));
    const names = [...new Set([...byRoom(listed).map(([n]) => n), ...boxes.map((b) => roomOf(b.room_id)), ...books.filter((b) => !b.box_id || !boxIds.has(b.box_id)).map((b) => roomOf(b.room_id))])];
    const order = (n: string) => {
      const i = byRoom(listed).findIndex(([x]) => x === n);
      return i < 0 ? 999 : i;
    };
    const thumbs = new Map<string, Uint8Array | null>();
    if (prefs.pdfPhotos) {
      setBusy("Adding photos…");
      await Promise.all(listed.map(async (i) => thumbs.set(i.id, await itemThumb(i))));
    }
    let totalLbs = 0;
    let estimated = false;
    let totalValue = 0;
    let valueEstimated = false;
    const rooms: InventoryPdfRoom[] = names
      .sort((a, b) => order(a) - order(b))
      .map((name) => {
        const list = byRoom(listed).find(([n]) => n === name)?.[1] ?? [];
        let lbs = 0;
        let roomValue = 0;
        let roomEst = false;
        const rows = list.map((i): InventoryPdfRow => {
          const qty = Math.max(1, i.quantity ?? 1);
          const w = itemWeightLbs(i);
          if (!i.box_id) {
            lbs += w.lbs * qty;
            if (!w.actual) estimated = true;
          }
          const each = i.est_value ?? itemPriceIdea(i).likely;
          roomValue += each * qty;
          if (i.est_value == null) valueEstimated = roomEst = true;
          return {
            name: i.name,
            detail: [i.brand, i.model, i.dims_in ? `${i.dims_in} in` : ""].filter(Boolean).join(" "),
            qty,
            lbs: i.box_id ? "in box" : fmt(w.lbs * qty, !w.actual),
            value: each ? `${i.est_value == null ? "~" : ""}${formatMoney(each * qty)}` : "",
            thumb: prefs.pdfPhotos ? (thumbs.get(i.id) ?? null) : undefined,
            notes: itemNotes(i, db, size),
          };
        });
        const loose = books.filter((b) => roomOf(b.room_id) === name && (!b.box_id || !boxIds.has(b.box_id)));
        if (loose.length) {
          const w = bookLbs(loose);
          lbs += w;
          estimated = true;
          rows.push({ name: `Books (not boxed yet)`, detail: "", qty: loose.length, lbs: fmt(w, true), notes: `About ${Math.ceil(w / 35)} small book boxes` });
        }
        const bx = boxRows(name);
        for (const b of bx) {
          lbs += b.lbs;
          if (b.row.lbs.startsWith("~")) estimated = true;
          rows.push(b.row);
        }
        totalLbs += lbs;
        totalValue += roomValue;
        return { room: name, rows, boxes: bx.length ? `${bx.length} box${bx.length === 1 ? "" : "es"}` : "", lbs: Math.round(lbs), value: roomValue ? `${roomEst ? "~" : ""}${formatMoney(roomValue)}` : "" };
      })
      .filter((r) => r.rows.length);
    const from = [move?.from_city, move?.from_state].filter(Boolean).join(", ") || "—";
    const to = [move?.to_city, move?.to_state].filter(Boolean).join(", ") || "—";
    const bytes = await buildInventoryPdf({
      title: "Household inventory for movers",
      subtitle: `${from} -> ${to}${move?.distance_miles ? ` (${move.distance_miles.toLocaleString()} miles)` : ""}  |  ${contact.name ?? ""}${contact.email ? `  |  ${contact.email}` : ""}  |  ${new Date().toLocaleDateString()}`,
      summary: [
        ["Total weight", `${Math.round(totalLbs).toLocaleString()} lbs`],
        ["Volume", `${Math.round(totalLbs / LBS_PER_CUFT).toLocaleString()} cu ft`],
        ["Items listed", listItems.reduce((a, i) => a + i.qty, 0).toLocaleString()],
        ...(prefs.pdfValues && totalValue ? ([["Total value", `${valueEstimated ? "~" : ""}${formatMoney(totalValue)}`]] as [string, string][]) : []),
        ["Boxes", boxes.length.toLocaleString()],
        ...(books.length ? ([["Books", books.length.toLocaleString()]] as [string, string][]) : []),
        ...(size.fragileItems ? ([["Fragile", String(size.fragileItems)]] as [string, string][]) : []),
      ],
      notes: [
        ...(prefs.loadWindow.trim() ? [`Load date: ${prefs.loadWindow.trim()}`] : []),
        ...(prefs.deliveryWindow.trim() ? [`Delivery needed by: ${prefs.deliveryWindow.trim()}`] : []),
        ...(on("notes") ? prefs.notes.filter((n) => n.on && n.text.trim()).map((n) => n.text.trim()) : []),
      ],
      rooms,
      photos: prefs.pdfPhotos,
      values: prefs.pdfValues,
      footnote: `Weights are from our room-by-room inventory${estimated ? " (~ = typical weight for that kind of item, not weighed)" : ""}.${prefs.pdfValues && valueEstimated ? " Values marked ~ are estimates." : ""} Items riding with us in our car are not listed.${on("emailOnly") && contact.email ? ` Reply by email: ${contact.email}` : ""}`,
    });
    return new File([bytes as BlobPart], fileName(db), { type: "application/pdf" });
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setPdfError(null);
    try {
      await fn();
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setPdfError(`Couldn't make the PDF: ${(e as Error)?.message ?? e}. Try again, or turn off Photos to make the file smaller.`);
    } finally {
      setBusy(null);
    }
  };
  const canShareFiles = typeof navigator !== "undefined" && "canShare" in navigator;

  return (
    <Card
      id="quotes.email"
      title="Quote request email"
      bodyClassName="mt-0"
      right={
        <button className="text-xs text-indigo-700 underline" onClick={() => void askConfirm({ title: "Reset this email?", message: "Your wording and choices go back to the defaults.", confirm: "Reset email", destructive: true }).then((ok) => ok && setPrefs(null))}>
          Reset
        </button>
      }
    >
      <p className="mt-1 text-xs text-gray-500">
        Tick what goes in the email. From {contact.name ?? "you"}
        {contact.email ? ` · ${contact.email}` : " — add your email to Family (self) to sign it"}
        {on("emailOnly") ? " · no phone number, replies by email only" : ""}.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
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
        <button className="btn-secondary" disabled={!!busy} onClick={() => run("Making PDF…", async () => download(fileName(db), await makePdf(), "application/pdf"))}>
          📄 Item list PDF
        </button>
        {canShareFiles && (
          <button
            className="btn-secondary"
            disabled={!!busy}
            onClick={() =>
              run("Making PDF…", async () => {
                const file = await makePdf();
                if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: request.subject, text: request.body });
                else download(file.name, file, "application/pdf");
              })
            }
          >
            📤 Share email + PDF
          </button>
        )}
        <a
          className={`btn-primary col-span-2 ${requestedEmails.length ? "" : "pointer-events-none opacity-50"}`}
          href={requestedEmails.length ? mailto(requestedEmails) : undefined}
          aria-disabled={!requestedEmails.length}
        >
          📨 Email all requested ({requestedEmails.length})
        </a>
        <button className="btn-ghost col-span-2" onClick={() => onPrint(request, listed)}>
          🖨️ Print quote packet
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-ink/[0.04] px-3 py-1.5 text-[13px]">
        <span className="font-semibold text-gray-500 max-sm:w-full max-sm:pt-1">In the PDF:</span>
        <label className="flex min-h-9 items-center gap-2">
          <input type="checkbox" className="h-4 w-4" style={{ accentColor: "#0d0d0f" }} checked={prefs.pdfPhotos} onChange={() => update({ pdfPhotos: !prefs.pdfPhotos })} />
          Photos
        </label>
        <label className="flex min-h-9 items-center gap-2">
          <input type="checkbox" className="h-4 w-4" style={{ accentColor: "#0d0d0f" }} checked={prefs.pdfValues} onChange={() => update({ pdfValues: !prefs.pdfValues })} />
          Values
        </label>
      </div>
      {pdfError && (
        <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">
          {pdfError}
        </p>
      )}
      <p className="mt-2 text-xs text-gray-500" aria-live="polite">
        {busy ?? (
          <>
            Email links can&apos;t attach files: save the <b>📄 Item list PDF</b> and attach it, or use <b>📤 Share email + PDF</b> on your phone to open Mail with it attached. “Email all
            requested” BCCs every mover marked <b>requested</b>.
          </>
        )}
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-2">
          <Group title="What's in the email" count={`${QUOTE_SECTIONS.filter((s) => on(s.key)).length}/${QUOTE_SECTIONS.length}`} open>
            {QUOTE_SECTIONS.map((s) => (
              <Check key={s.key} checked={on(s.key)} onChange={() => update({ sections: { ...prefs.sections, [s.key]: !on(s.key) } })}>
                {s.label}
              </Check>
            ))}
            <Check checked={prefs.downsizing} onChange={() => update({ downsizing: !prefs.downsizing })}>
              Size the move from our inventory, not the house size <span className="text-gray-400">(we&apos;re downsizing)</span>
            </Check>
          </Group>

          <Group title="Dates" count={prefs.loadWindow || prefs.deliveryWindow ? "custom" : "from move"}>
            <label className="block text-xs font-semibold text-gray-500">
              Load date
              <input className="input mt-1" value={prefs.loadWindow} placeholder="Leave blank to use the move's load date" onChange={(e) => update({ loadWindow: e.target.value })} />
            </label>
            <label className="block text-xs font-semibold text-gray-500">
              Delivery needed by
              <input className="input mt-1" value={prefs.deliveryWindow} placeholder="Leave blank to use the move's delivery date" onChange={(e) => update({ deliveryWindow: e.target.value })} />
            </label>
          </Group>

          <Group title="Our notes" count={`${prefs.notes.filter((n) => n.on).length}/${prefs.notes.length}`}>
            {prefs.notes.map((n, i) => (
              <div key={i} className="flex items-start gap-2">
                <input type="checkbox" aria-label="Include this note" className="mt-2.5 h-4 w-4 flex-none" style={{ accentColor: "#0d0d0f" }} checked={n.on} onChange={() => update({ notes: prefs.notes.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) })} />
                <textarea
                  className={`input min-w-0 flex-1 text-sm ${n.on ? "" : "opacity-50"}`}
                  rows={3}
                  value={n.text}
                  onChange={(e) => update({ notes: prefs.notes.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                />
                <button aria-label="Remove note" className="mt-1.5 grid h-8 w-8 flex-none place-items-center rounded-full text-gray-400 hover:bg-ink/5" onClick={() => update({ notes: prefs.notes.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              </div>
            ))}
            <AddLine value={newNote} onChange={setNewNote} placeholder="Add a note…" onAdd={() => (update({ notes: [...prefs.notes, { text: newNote.trim(), on: true }] }), setNewNote(""))} />
          </Group>

          <Group title="Questions to ask" count={`${prefs.questions.length + prefs.custom.filter((c) => c.on).length} on`}>
            {MOVER_QUESTIONS.map((q, i) => (
              <Check key={q} checked={prefs.questions.includes(i)} onChange={() => update({ questions: toggleIn(prefs.questions, i) })}>
                {q}
              </Check>
            ))}
            {prefs.custom.map((c, i) => (
              <div key={i} className="flex items-start gap-2">
                <Check checked={c.on} onChange={() => update({ custom: prefs.custom.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) })}>
                  {c.text}
                </Check>
                <button aria-label="Remove question" className="grid h-8 w-8 flex-none place-items-center rounded-full text-gray-400 hover:bg-ink/5" onClick={() => update({ custom: prefs.custom.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              </div>
            ))}
            <AddLine value={newQ} onChange={setNewQ} placeholder="Add your own question…" onAdd={() => (update({ custom: [...prefs.custom, { text: newQ.trim(), on: true }] }), setNewQ(""))} />
          </Group>

          <Group title="“Please include in your quote”" count={`${prefs.include.length}/${PLEASE_INCLUDE.length}`}>
            {PLEASE_INCLUDE.map((s, i) => (
              <Check key={s} checked={prefs.include.includes(i)} onChange={() => update({ include: toggleIn(prefs.include, i) })}>
                {s}
              </Check>
            ))}
          </Group>

          <Group title="Items on the list" count={`${listed.length}/${movers.length}`}>
            <p className="text-xs text-gray-500">
              Unticked items are left off the email and PDF. Tap <b>🚗</b> for things riding in your car — they come off the list <i>and</i> the size estimate.
            </p>
            <div className="flex gap-2">
              <button className="btn-secondary px-3 py-1 text-xs" onClick={() => update({ excluded: [] })}>
                All
              </button>
              <button className="btn-secondary px-3 py-1 text-xs" onClick={() => update({ excluded: movers.map((i) => i.id) })}>
                None
              </button>
            </div>
            {movers.length === 0 && <p className="text-sm text-gray-500">No items marked to move yet — add them in the inventory.</p>}
            {byRoom(movers).map(([r, list]) => (
              <div key={r}>
                <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{r}</div>
                {list.map((i) => (
                  <div key={i.id} className="flex items-center gap-2">
                    <Check checked={!excluded.has(i.id)} onChange={() => toggleItem(i.id)}>
                      {i.name}
                      {i.quantity > 1 && <span className="text-gray-400"> ×{i.quantity}</span>}
                    </Check>
                    <button
                      aria-label={`${i.name} is coming in our car`}
                      title="Coming in our car"
                      className="grid h-9 w-9 flex-none place-items-center rounded-full text-base hover:bg-ink/5"
                      onClick={() => store.update("items", i.id, { in_car: true })}
                    >
                      🚗
                    </button>
                  </div>
                ))}
              </div>
            ))}
            {car.length > 0 && (
              <div className="mt-3 rounded-xl bg-sky-50 p-2.5">
                <div className="text-xs font-semibold text-sky-900">🚗 Coming in our car — not sent to movers ({car.length})</div>
                {car.map((i) => (
                  <div key={i.id} className="flex items-center gap-2 py-0.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {i.name}
                      {i.quantity > 1 && <span className="text-gray-400"> ×{i.quantity}</span>}
                    </span>
                    <button className="flex-none text-xs text-indigo-700 underline" onClick={() => store.update("items", i.id, { in_car: false })}>
                      Movers take it
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Group>
        </div>

        <div className="min-w-0">
          <div className="eyebrow mb-1.5">Preview</div>
          <div className="rounded-xl bg-sand/60 p-3 text-sm font-semibold break-words">{request.subject}</div>
          <pre className="mt-2 max-h-[32rem] overflow-auto rounded-xl bg-ink/[0.03] p-3 font-sans text-sm leading-relaxed break-words whitespace-pre-wrap">{request.body}</pre>
        </div>
      </div>
    </Card>
  );
}

function Group({ title, count, open, children }: { title: string; count: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl ring-1 ring-ink/10" open={open}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold">
        <span className="min-w-0 flex-1">{title}</span>
        <span className="chip flex-none bg-ink/5 text-[11px]">{count}</span>
        <span className="flex-none text-gray-400 transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="space-y-2 px-3 pb-3">{children}</div>
    </details>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-1 cursor-pointer gap-2.5 py-0.5 text-sm">
      <input type="checkbox" className="mt-0.5 h-4 w-4 flex-none" style={{ accentColor: "#0d0d0f" }} checked={checked} onChange={onChange} />
      <span className={`min-w-0 break-words ${checked ? "" : "text-gray-400"}`}>{children}</span>
    </label>
  );
}

function AddLine({ value, onChange, placeholder, onAdd }: { value: string; onChange: (v: string) => void; placeholder: string; onAdd: () => void }) {
  return (
    <div className="flex gap-2">
      <input className="input min-w-0 flex-1" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && value.trim() && onAdd()} />
      <button className="btn-secondary flex-none" disabled={!value.trim()} onClick={onAdd}>
        Add
      </button>
    </div>
  );
}
