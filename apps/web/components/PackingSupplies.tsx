"use client";

import {
  BOX_SIZES,
  estimateSupplies,
  formatMoney,
  packItemsFor,
  packLane,
  packLocally,
  suppliesShoppingList,
  type Item,
  type PackBoxKey,
  type PackItem,
  type Snapshot,
  type SupplyBasis,
  type SupplyLine,
} from "@moving/shared";
import { useMemo, useState } from "react";
import { useLocalState } from "@/lib/hooks";
import { printHtml } from "@/lib/media";
import { useDb } from "@/lib/store-context";

const GROUPS: [SupplyLine["group"], string][] = [
  ["boxes", "Boxes by size"],
  ["specialty", "Specialty boxes"],
  ["packing", "Tape, paper & wrap"],
  ["furniture", "Furniture protection"],
];

const SIZE_LABEL: Record<string, string> = Object.fromEntries(BOX_SIZES.map((s) => [s.key, s.name]));
const BASIS_LABEL = { inventory: "from your inventory", packed: "packed exactly", typical: "typical room", none: "" } as const;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

interface PackRun {
  hash: string;
  engine: "wyldapi" | "local";
  at: number;
  rooms: Record<string, { boxes: Record<PackBoxKey, number>; notFit: { name: string; qty: number }[] }>;
}

const isMoving = (i: Item) => !i.deleted && (i.disposition === "move" || i.disposition === "store" || i.disposition === "undecided");

/** Per room, the loose items that need regular boxes, ready for a packer. */
function packInput(db: Pick<Snapshot, "rooms" | "items">): { id: string; items: PackItem[] }[] {
  return db.rooms
    .filter((r) => !r.deleted)
    .map((r) => ({ id: r.id, items: packItemsFor(db.items.filter((i) => i.room_id === r.id && isMoving(i))) }))
    .filter((r) => r.items.length);
}

function hashOf(x: unknown): string {
  const s = JSON.stringify(x);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Supply estimate shared by Boxes, Movers and the supplies sheet, using the saved "count from" choice and packing run. */
export function useSupplies() {
  const db = useDb();
  const [basis] = useLocalState<SupplyBasis>("supplies-basis", "inventory");
  const [run] = useLocalState<PackRun | null>("supplies-pack", null);
  const input = useMemo(() => packInput(db), [db]);
  const hash = useMemo(() => hashOf(input), [input]);
  const fresh = run && run.hash === hash ? run : null;
  return useMemo(
    () => ({ ...estimateSupplies(db, { basis, packed: fresh ? Object.fromEntries(Object.entries(fresh.rooms).map(([id, r]) => [id, r.boxes])) : undefined }), run: fresh, stale: !!run && !fresh }),
    [db, basis, fresh, run],
  );
}

export function PackingSupplies() {
  const db = useDb();
  const s = useSupplies();
  const [basis, setBasis] = useLocalState<SupplyBasis>("supplies-basis", "inventory");
  const [, setRun] = useLocalState<PackRun | null>("supplies-pack", null);
  const [note, setNote] = useState<string | null>(null);
  const [packNote, setPackNote] = useState<string | null>(null);
  const [packing, setPacking] = useState(false);

  const input = useMemo(() => packInput(db), [db]);
  const noBox = useMemo(() => {
    const out = new Map<string, number>();
    for (const i of db.items) {
      const lane = isMoving(i) && !i.box_id ? packLane(i) : null;
      if (lane === "bulky" || lane === "mattress") out.set(i.name || "Item", (out.get(i.name || "Item") ?? 0) + Math.max(1, i.quantity ?? 1));
    }
    return [...out.entries()].sort((a, b) => b[1] - a[1]);
  }, [db]);
  const notFit = useMemo(() => {
    const rooms = s.run ? Object.values(s.run.rooms) : input.map((r) => packLocally(r.items));
    return rooms.flatMap((r) => r.notFit);
  }, [s.run, input]);

  const packNow = async () => {
    setPacking(true);
    setPackNote(null);
    const hash = hashOf(input);
    try {
      const res = await fetch("/api/pack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rooms: input }) });
      const data = (await res.json().catch(() => null)) as { rooms?: { id: string; boxes: Record<PackBoxKey, number>; notFit: { name: string; qty: number }[] }[]; error?: string } | null;
      if (!res.ok || !data?.rooms) throw new Error(data?.error || "Packing service unavailable");
      const rooms: PackRun["rooms"] = Object.fromEntries(data.rooms.map((r) => [r.id, { boxes: r.boxes, notFit: r.notFit }]));
      // Rooms the service skipped (over the per-run limit) still get the built-in packer.
      for (const r of input) if (!rooms[r.id]) rooms[r.id] = packLocally(r.items);
      setRun({ hash, engine: "wyldapi", at: Date.now(), rooms });
      setPackNote(`Packed ${input.length} room${input.length === 1 ? "" : "s"} with the 3D bin packer.`);
    } catch (e) {
      setRun({ hash, engine: "local", at: Date.now(), rooms: Object.fromEntries(input.map((r) => [r.id, packLocally(r.items)])) });
      setPackNote(`${e instanceof Error ? e.message : "Packing service unavailable"} — used the built-in packer instead.`);
    } finally {
      setPacking(false);
    }
  };
  const share = async () => {
    const text = suppliesShoppingList(s);
    try {
      if (navigator.share) await navigator.share({ title: "Moving supplies", text });
      else {
        await navigator.clipboard.writeText(text);
        setNote("Copied — paste it into Notes or Reminders.");
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  const print = () => {
    const rows = GROUPS.map(([g, title]) => {
      const ls = s.lines.filter((l) => l.group === g);
      if (!ls.length) return "";
      return `<h2>${title}</h2><table>${ls.map((l) => `<tr><td class="box">☐</td><td><b>${l.qty} × ${esc(l.name)}</b><div class="muted">${esc(l.detail)}</div></td><td class="right">${formatMoney(l.cost)}</td></tr>`).join("")}</table>`;
    }).join("");
    void printHtml(
      `<!doctype html><html><head><meta charset="utf-8"><title>Moving supplies</title><style>body{font:14px -apple-system,system-ui,sans-serif;margin:32px;color:#111}h1{font-size:22px;margin:0 0 4px}h2{font-size:13px;text-transform:uppercase;color:#666;margin:20px 0 6px}table{width:100%;border-collapse:collapse}td{padding:6px 4px;border-bottom:1px solid #eee;vertical-align:top}.muted{color:#777;font-size:12px}.right{text-align:right;white-space:nowrap}.box{width:20px;font-size:16px}</style></head><body><h1>Moving supplies</h1><div class="muted">${s.totalBoxes} boxes · about ${formatMoney(s.totalCost)}</div>${rows}</body></html>`,
    );
  };

  if (!s.rooms.length && !s.bookBoxes)
    return <p className="py-8 text-center text-sm text-gray-500">Add your rooms (and what&apos;s in them) in Inventory, and this will work out the boxes and supplies you need.</p>;

  return (
    <div className="space-y-5">
      <div>
        <div className="grid grid-cols-2 gap-0.5 rounded-full bg-ink/[0.06] p-0.5" role="radiogroup" aria-label="Count boxes from">
          {(
            [
              ["inventory", "My inventory"],
              ["typical", "Typical home"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={basis === m}
              className={`seg-btn min-h-9 rounded-full px-3 text-[13px] font-semibold transition ${basis === m ? "bg-white text-ink shadow-sm" : "text-gray-600"}`}
              onClick={() => setBasis(m)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 px-1 text-[12px] leading-snug text-gray-500">
          {basis === "inventory"
            ? `Only what you've logged — best since you're downsizing.${s.emptyRooms ? ` ${s.emptyRooms} room${s.emptyRooms === 1 ? " has" : "s have"} nothing logged yet, so ${s.emptyRooms === 1 ? "it counts" : "they count"} as 0.` : ""}`
            : "At least a typical furnished room's worth of boxes, even where you haven't logged much."}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-indigo-50 px-2 py-3">
          <div className="text-2xl font-bold text-indigo-700">{s.totalBoxes}</div>
          <div className="text-[11px] font-medium text-indigo-700/80">boxes to get</div>
        </div>
        <div className="rounded-2xl bg-emerald-50 px-2 py-3">
          <div className="text-2xl font-bold text-emerald-700">{formatMoney(s.totalCost)}</div>
          <div className="text-[11px] font-medium text-emerald-700/80">est. cost</div>
        </div>
        <div className="rounded-2xl bg-gray-100 px-2 py-3">
          <div className="text-2xl font-bold text-gray-700">{s.haveBoxes}</div>
          <div className="text-[11px] font-medium text-gray-600">already made</div>
        </div>
      </div>

      {input.length > 0 && (
        <div className="rounded-2xl bg-indigo-50/70 p-3">
          <button type="button" className="btn-primary w-full" disabled={packing} onClick={() => void packNow()}>
            {packing ? "Packing…" : s.run ? "📦 Re-pack my inventory" : "📦 Pack my inventory (exact)"}
          </button>
          <p className="mt-2 text-[12px] leading-snug text-indigo-900/70">
            {s.run
              ? `Box counts from ${s.run.engine === "wyldapi" ? "the 3D bin packer" : "the built-in packer"}, ${new Date(s.run.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.`
              : s.stale
                ? "Your inventory changed since the last packing run — re-pack for exact counts."
                : "Fits your logged items into real box sizes by size and weight. Enter an item's weight and size in Inventory for the most exact count."}
          </p>
        </div>
      )}
      {packNote && <p className="text-center text-[13px] text-indigo-700">{packNote}</p>}

      {GROUPS.map(([g, title]) => {
        const ls = s.lines.filter((l) => l.group === g);
        if (!ls.length) return null;
        return (
          <section key={g}>
            <h3 className="mb-1.5 px-4 text-[13px] font-medium uppercase tracking-wide text-gray-500">{title}</h3>
            <div className="ios-list" style={{ ["--ios-sep" as string]: "3.75rem" }}>
              {ls.map((l) => (
                <div key={l.key} className="flex min-h-11 items-center gap-3 px-4 py-2.5">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-indigo-50 text-[15px] font-bold tabular-nums text-indigo-700">{l.qty}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold leading-snug">{l.name}</div>
                    <div className="text-[12px] leading-snug text-gray-500">{l.detail}</div>
                  </div>
                  <div className="flex-none text-right text-[15px] tabular-nums text-gray-700">{formatMoney(l.cost)}</div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {s.rooms.length > 0 && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-[15px] font-medium text-indigo-600">
            Boxes by room
            <span className="text-gray-400 transition-transform group-open:rotate-90">›</span>
          </summary>
          <div className="ios-list mt-1">
            {s.rooms.map((r) => {
              const parts = Object.entries(r.boxes)
                .filter(([, n]) => n > 0)
                .map(([k, n]) => `${n} ${SIZE_LABEL[k]?.toLowerCase()}`);
              return (
                <div key={r.roomId} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[15px] font-semibold">{r.room}</span>
                    <span className="flex-none text-[12px] text-gray-500">{BASIS_LABEL[r.basis]}</span>
                  </div>
                  <div className="text-[13px] text-gray-600">
                    {parts.length ? parts.join(" · ") : r.basis === "none" ? "Nothing logged yet" : "All set"}
                    {r.have ? ` (${r.have} already made)` : ""}
                    {r.noBox ? ` · ${r.noBox} big item${r.noBox === 1 ? "" : "s"}, no box` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {noBox.length > 0 && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-[15px] font-medium text-indigo-600">
            No box needed ({noBox.reduce((a, [, n]) => a + n, 0)})
            <span className="text-gray-400 transition-transform group-open:rotate-90">›</span>
          </summary>
          <p className="px-4 pb-1 text-[12px] text-gray-500">Furniture and appliances get pads and stretch wrap; mattresses get a bag. (TVs and framed art go in the specialty boxes above.)</p>
          <div className="ios-list mt-1">
            {noBox.map(([name, n]) => (
              <div key={name} className="flex items-center justify-between gap-2 px-4 py-2">
                <span className="min-w-0 truncate text-[14px]">{name}</span>
                {n > 1 && <span className="flex-none text-[13px] tabular-nums text-gray-500">×{n}</span>}
              </div>
            ))}
          </div>
        </details>
      )}

      {notFit.length > 0 && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          Too big for any box — wrap or pad these: {notFit.map((n) => (n.qty > 1 ? `${n.name} ×${n.qty}` : n.name)).join(", ")}
        </p>
      )}

      <p className="px-4 text-[12px] leading-relaxed text-gray-500">
        Boxes are worked out room by room by fitting each loose item you&apos;ve logged into real box sizes, by its size and weight — heavy things go in small boxes. Big furniture, mattresses and appliances never get a box. Boxes you&apos;ve already made come off the list, and books go in small boxes kept under 35 lbs. Buy about 10% extra — unused boxes can usually be returned.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary w-full" onClick={print}>
          🖨️ Print list
        </button>
        <button type="button" className="btn-primary w-full" onClick={() => void share()}>
          Share list
        </button>
      </div>
      {note && <p className="text-center text-[13px] text-emerald-700">{note}</p>}
    </div>
  );
}
