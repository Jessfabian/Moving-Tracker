"use client";

import { BOX_SIZES, BOX_STATUSES, buildLabelSheet, buildReport, formatMoney, nextBoxNumber, optionLabel, parseBoxQr, qrSvg, boxQrValue, type Box } from "@moving/shared";
import { useEffect, useMemo, useState } from "react";
import { EntityForm } from "@/components/EntityForm";
import { MediaThumb } from "@/components/Media";
import { PackingSupplies, useSupplies } from "@/components/PackingSupplies";
import { Scanner } from "@/components/Scanner";
import { Drawer, Empty, PageHeader, Progress } from "@/components/ui";
import { useTwoPane } from "@/lib/hooks";
import Link from "next/link";
import { printHtml } from "@/lib/media";
import { useDb, useStore } from "@/lib/store-context";

const STATUS_COLORS: Record<string, string> = { empty: "#9ca3af", packing: "#d97706", packed: "#2563eb", loaded: "#7c3aed", delivered: "#0891b2", unpacked: "#16a34a" };

function BoxDetail({ box, onEdit }: { box: Box; onEdit: () => void }) {
  const db = useDb();
  const store = useStore();
  const [svg, setSvg] = useState("");
  const [add, setAdd] = useState("");
  useEffect(() => {
    void qrSvg(boxQrValue(box.id)).then(setSvg);
  }, [box.id]);
  const items = db.items.filter((i) => i.box_id === box.id);
  const books = db.books.filter((b) => b.box_id === box.id);
  const room = db.rooms.find((r) => r.id === box.room_id);
  const loose = db.items.filter((i) => !i.box_id && i.disposition !== "sell" && i.disposition !== "donate" && i.disposition !== "trash" && (!box.room_id || i.room_id === box.room_id));

  return (
    <div className="space-y-5">
      <div className="flex gap-4">
        <div className="h-32 w-32 flex-none rounded-lg border border-gray-200 bg-white p-1" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="min-w-0">
          <div className="text-3xl font-black">#{box.number}</div>
          <div className="font-semibold">{box.label || "Unlabeled box"}</div>
          <div className="text-sm text-gray-500">
            {room?.name ?? "No room"} → {box.destination_room || room?.destination_room || "?"}
          </div>
          <div className="mt-1 flex gap-1">
            {box.fragile && <span className="chip bg-red-50 text-red-700">⚠️ Fragile</span>}
            {box.open_first && <span className="chip bg-amber-50 text-amber-700">⭐ Open first</span>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {BOX_STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => store.update("boxes", box.id, { status: s.value as Box["status"] })}
            className="rounded-lg border px-2 py-1 text-xs font-semibold"
            style={box.status === s.value ? { background: STATUS_COLORS[s.value], color: "white", borderColor: STATUS_COLORS[s.value] } : { color: STATUS_COLORS[s.value], borderColor: `${STATUS_COLORS[s.value]}55` }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button className="btn-secondary" onClick={onEdit}>
          ✏️ Edit box
        </button>
        <button className="btn-secondary" onClick={() => void buildLabelSheet(db, [box.id], { householdName: db.moves[0]?.title }).then(printHtml)}>
          🖨️ Print label
        </button>
      </div>
      {box.contents && <p className="whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm">{box.contents}</p>}
      <section>
        <h3 className="mb-2 font-bold">Inside this box ({items.length + books.length})</h3>
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              {i.photos[0] && <MediaThumb media={i.photos[0]} className="h-8 w-8" />}
              <span className="flex-1">
                {i.quantity > 1 ? `${i.quantity}× ` : ""}
                {i.name}
              </span>
              <button className="text-xs text-gray-400 hover:text-red-600" onClick={() => store.update("items", i.id, { box_id: null })}>
                remove
              </button>
            </li>
          ))}
          {books.map((b) => (
            <li key={b.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              📚 <span className="flex-1">{b.title}</span>
              <button className="text-xs text-gray-400 hover:text-red-600" onClick={() => store.update("books", b.id, { box_id: null })}>
                remove
              </button>
            </li>
          ))}
          {!items.length && !books.length && <li className="px-3 py-4 text-center text-sm text-gray-400">Empty — add inventory items below.</li>}
        </ul>
        {loose.length > 0 && (
          <div className="mt-2 flex gap-2">
            <select className="input" value={add} onChange={(e) => setAdd(e.target.value)}>
              <option value="">Add an unpacked item{room ? ` from ${room.name}` : ""}…</option>
              {loose.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            <button
              className="btn-primary"
              disabled={!add}
              onClick={() => {
                store.update("items", add, { box_id: box.id });
                if (box.status === "empty") store.update("boxes", box.id, { status: "packing" });
                setAdd("");
              }}
            >
              Add
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export default function BoxesPage() {
  const db = useDb();
  const store = useStore();
  const twoPane = useTwoPane();
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Box | "new" | null>(null);
  const [status, setStatus] = useState("");
  const [roomId, setRoomId] = useState("");
  const [scan, setScan] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [showSupplies, setShowSupplies] = useState(false);
  const supplies = useSupplies();
  const sizeSummary = BOX_SIZES.filter((s) => supplies.boxes[s.key] > 0)
    .slice(0, 3)
    .map((s) => `${supplies.boxes[s.key]} ${s.name.toLowerCase()}`)
    .join(", ");

  const boxes = useMemo(
    () => [...db.boxes].filter((b) => (!status || b.status === status) && (!roomId || b.room_id === roomId)).sort((a, b) => a.number - b.number),
    [db.boxes, status, roomId],
  );
  const current = db.boxes.find((b) => b.id === selected) ?? null;
  const counts = BOX_STATUSES.map((s) => ({ ...s, n: db.boxes.filter((b) => b.status === s.value).length }));
  const delivered = db.boxes.filter((b) => b.status === "delivered" || b.status === "unpacked").length;

  const onScan = (code: string) => {
    const id = parseBoxQr(code);
    const box = id ? db.boxes.find((b) => b.id === id) : db.boxes.find((b) => String(b.number) === code.trim());
    if (box) {
      setSelected(box.id);
      setMsg(null);
    } else setMsg(`No box found for “${code}”.`);
  };

  const quickBox = () => {
    const room = db.rooms.find((r) => r.id === roomId);
    const b = store.insert("boxes", { number: nextBoxNumber(db), label: room ? `${room.name}` : "", room_id: roomId || null, destination_room: room?.destination_room ?? "" });
    setSelected(b.id);
  };

  const list = (
    <div className="space-y-2">
      {boxes.map((b) => {
        const room = db.rooms.find((r) => r.id === b.room_id);
        const n = db.items.filter((i) => i.box_id === b.id).length + db.books.filter((x) => x.box_id === b.id).length;
        return (
          <div key={b.id} className={`flex items-center gap-3 rounded-2xl border bg-white px-3 py-2 ${selected === b.id ? "border-indigo-500 ring-1 ring-indigo-500" : "border-gray-200"}`} style={{ borderLeft: `6px solid ${room?.color || "#e5e7eb"}` }}>
            <input
              type="checkbox"
              className="h-5 w-5 accent-indigo-600"
              aria-label={`Select box ${b.number}`}
              checked={checked.has(b.id)}
              onChange={() =>
                setChecked((s) => {
                  const x = new Set(s);
                  if (x.has(b.id)) x.delete(b.id);
                  else x.add(b.id);
                  return x;
                })
              }
            />
            <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setSelected(b.id)}>
              <span className="w-12 text-xl font-black">#{b.number}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {b.label || "Unlabeled"} {b.fragile && "⚠️"} {b.open_first && "⭐"}
                </span>
                <span className="text-xs text-gray-500">
                  {room?.name ?? "No room"} · {n} items{b.weight_lbs ? ` · ${b.weight_lbs} lbs` : ""}
                </span>
              </span>
              <span className="chip flex-none" style={{ background: `${STATUS_COLORS[b.status]}1a`, color: STATUS_COLORS[b.status] }}>
                {optionLabel(BOX_STATUSES, b.status)}
              </span>
            </button>
          </div>
        );
      })}
      {!boxes.length && (
        <Empty icon="📦" title={db.boxes.length ? "No boxes match" : "No boxes yet"}>
          Create a box, print its QR label, and scan it any time to see what&apos;s inside.
        </Empty>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Boxes & labels"
        icon="📦"
        subtitle={`${db.boxes.length} boxes · ${delivered} delivered. Scan a label's QR code to see exactly what's inside.`}
        actions={
          <>
            <button className="btn-secondary" onClick={() => setScan(true)}>
              ▦ Scan box label
            </button>
            <Link className="btn-secondary" href="/labels">
              🏷️ QR label maker
            </Link>
            <button
              className="btn-secondary"
              disabled={!db.boxes.length}
              onClick={() => void buildLabelSheet(db, checked.size ? [...checked] : boxes.map((b) => b.id), { householdName: db.moves[0]?.title }).then(printHtml)}
            >
              🖨️ Print {checked.size ? `${checked.size} labels` : "all labels"}
            </button>
            <button className="btn-secondary" disabled={!db.boxes.length} onClick={() => void buildReport("manifest", db).then(printHtml)}>
              📋 Manifest
            </button>
            <button className="btn-primary" onClick={quickBox}>
              + New box #{nextBoxNumber(db)}
            </button>
          </>
        }
      />
      {msg && <p className="mb-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">{msg}</p>}
      {supplies.totalBoxes > 0 && (
        <button type="button" onClick={() => setShowSupplies(true)} className="card mb-4 flex w-full items-center gap-3 text-left">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-amber-100 text-2xl">🧰</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Packing supplies</span>
            <span className="block text-[13px] text-gray-500">
              About {supplies.totalBoxes} more boxes ({sizeSummary}) + tape, paper &amp; wrap · ~{formatMoney(supplies.totalCost)}
            </span>
          </span>
          <span className="flex-none text-xl text-gray-300">›</span>
        </button>
      )}
      {db.boxes.length > 0 && (
        <div className="card mb-4">
          <Progress value={(delivered / db.boxes.length) * 100} color="bg-cyan-600" />
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {counts.map((c) => (
              <button key={c.value} onClick={() => setStatus(status === c.value ? "" : c.value)} className={`chip ${status === c.value ? "ring-2 ring-offset-1" : ""}`} style={{ background: `${STATUS_COLORS[c.value]}1a`, color: STATUS_COLORS[c.value] }}>
                {c.label}: {c.n}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mb-4 flex gap-2">
        <select className="input w-auto" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="">All rooms</option>
          {db.rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      {twoPane ? (
        <div className="grid grid-cols-2 gap-7">
          <div>{list}</div>
          <div className="card sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
            {current ? <BoxDetail box={current} onEdit={() => setEditing(current)} /> : <p className="py-16 text-center text-gray-400">Select or scan a box.</p>}
          </div>
        </div>
      ) : (
        <>
          {list}
          <Drawer open={!!current} onClose={() => setSelected(null)} title={current ? `Box #${current.number}` : ""}>
            {current && <BoxDetail box={current} onEdit={() => setEditing(current)} />}
          </Drawer>
        </>
      )}
      <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "New box" : "Edit box"}>
        {editing && (
          <EntityForm
            table="boxes"
            row={editing === "new" ? null : editing}
            initial={{ number: nextBoxNumber(db) }}
            onDone={(b) => {
              setEditing(null);
              if (!b) setSelected(null);
            }}
          />
        )}
      </Drawer>
      <Drawer open={showSupplies} onClose={() => setShowSupplies(false)} title="Packing supplies">
        {showSupplies && <PackingSupplies />}
      </Drawer>
      <Scanner open={scan} onClose={() => setScan(false)} onScan={onScan} title="Scan a box label" hint="Point the camera at the QR code on the box label, or type the box number." />
    </div>
  );
}
