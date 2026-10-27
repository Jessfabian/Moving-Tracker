"use client";

import { BOX_SIZES, estimateSupplies, formatMoney, suppliesShoppingList, type SupplyLine } from "@moving/shared";
import { useMemo, useState } from "react";
import { printHtml } from "@/lib/media";
import { useDb } from "@/lib/store-context";

const GROUPS: [SupplyLine["group"], string][] = [
  ["boxes", "Boxes by size"],
  ["specialty", "Specialty boxes"],
  ["packing", "Tape, paper & wrap"],
  ["furniture", "Furniture protection"],
];

const SIZE_LABEL: Record<string, string> = Object.fromEntries(BOX_SIZES.map((s) => [s.key, s.name]));

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function useSupplies() {
  const db = useDb();
  return useMemo(() => estimateSupplies(db), [db]);
}

export function PackingSupplies() {
  const s = useSupplies();
  const [note, setNote] = useState<string | null>(null);

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
                <div key={r.room} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[15px] font-semibold">{r.room}</span>
                    <span className="flex-none text-[12px] text-gray-500">{r.basis === "inventory" ? "from your inventory" : "typical room"}</span>
                  </div>
                  <div className="text-[13px] text-gray-600">
                    {parts.length ? parts.join(" · ") : "All set"}
                    {r.have ? ` (${r.have} already made)` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      <p className="px-4 text-[12px] leading-relaxed text-gray-500">
        Each room gets the larger of a typical-room count and what your inventory needs; boxes you&apos;ve already made come off the list. Books go in small boxes, kept under 35 lbs. Buy about 10% extra — unused boxes can usually be returned.
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
