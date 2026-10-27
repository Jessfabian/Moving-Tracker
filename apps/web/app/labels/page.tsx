"use client";

import { buildLabelSheet, DEFAULT_LABEL_OPTIONS, LABEL_SIZES, nextBoxNumber, roomCode, type LabelOptions } from "@moving/shared";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, Segmented } from "@/components/ui";
import { printHtml } from "@/lib/media";
import { useDb, useStore } from "@/lib/store-context";

const OPTS_KEY = "mt.labelOptions";
const NEW = "__new__";
const ROOM_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#78716c"];

function loadOpts(): LabelOptions {
  if (typeof window === "undefined") return DEFAULT_LABEL_OPTIONS;
  try {
    return { ...DEFAULT_LABEL_OPTIONS, ...JSON.parse(localStorage.getItem(OPTS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_LABEL_OPTIONS;
  }
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1 text-sm">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 flex-none rounded-full transition ${value ? "bg-indigo-600" : "bg-slate-300"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${value ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

function QuickCreate({ onCreated }: { onCreated: (ids: string[]) => void }) {
  const db = useDb();
  const store = useStore();
  const [roomId, setRoomId] = useState("");
  const [count, setCount] = useState(5);
  const [label, setLabel] = useState("");
  const [fragile, setFragile] = useState(false);
  const [openFirst, setOpenFirst] = useState(false);
  const room = db.rooms.find((r) => r.id === roomId);
  const [newName, setNewName] = useState("");
  const [newDest, setNewDest] = useState("");
  const [newColor, setNewColor] = useState(ROOM_COLORS[5]);

  const create = () => {
    let rid = roomId;
    let target = room;
    if (roomId === NEW) {
      const same = db.rooms.find((r) => r.name.trim().toLowerCase() === newName.trim().toLowerCase());
      target = same ?? store.insert("rooms", { name: newName.trim(), destination_room: newDest.trim() || newName.trim(), color: newColor, sort: db.rooms.length });
      rid = target.id;
      setRoomId(rid);
      setNewName("");
      setNewDest("");
    }
    let n = nextBoxNumber(store.getSnapshot());
    const rows = Array.from({ length: Math.max(1, Math.min(50, count)) }, () => ({
      number: n++,
      label,
      room_id: rid || null,
      destination_room: target?.destination_room || target?.name || "",
      fragile,
      open_first: openFirst,
      status: "packing" as const,
    }));
    const made = store.insertMany("boxes", rows);
    onCreated(made.map((b) => b.id));
  };
  const canCreate = roomId === NEW ? !!newName.trim() : !!roomId;

  return (
    <div className="card space-y-3">
      <div>
        <div className="text-sm font-bold">⚡ Quick-create boxes</div>
        <div className="muted">Make a batch of numbered boxes for a room, then print their labels.</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <span className="label">Room</span>
          <select className="input" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">— Choose room —</option>
            {db.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.destination_room && r.destination_room !== r.name ? ` → ${r.destination_room}` : ""}
              </option>
            ))}
            <option value={NEW}>＋ New room…</option>
          </select>
        </div>
        {roomId === NEW && (
          <>
            <div>
              <span className="label">Room name</span>
              <input className="input" value={newName} placeholder="Kitchen" onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div>
              <span className="label">Goes to (new home)</span>
              <input className="input" value={newDest} placeholder="Same" onChange={(e) => setNewDest(e.target.value)} />
            </div>
            <div className="col-span-2 flex flex-wrap gap-2">
              {ROOM_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  onClick={() => setNewColor(c)}
                  className={`h-7 w-7 rounded-full ring-offset-2 transition ${newColor === c ? "ring-2 ring-slate-900" : ""}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </>
        )}
        <div>
          <span className="label">How many</span>
          <input className="input" type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} />
        </div>
        <div>
          <span className="label">Label (optional)</span>
          <input className="input" value={label} placeholder="Books, dishes…" onChange={(e) => setLabel(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <Toggle label="Fragile" value={fragile} onChange={setFragile} />
        <Toggle label="Open first" value={openFirst} onChange={setOpenFirst} />
      </div>
      <button className="btn-primary w-full" disabled={!canCreate} onClick={create}>
        Create {count} box{count === 1 ? "" : "es"}
        {room ? ` for ${room.name}` : roomId === NEW && newName.trim() ? ` for ${newName.trim()}` : ""}
      </button>
    </div>
  );
}

export default function LabelsPage() {
  const db = useDb();
  const [opts, setOpts] = useState<LabelOptions>(loadOpts);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [roomFilter, setRoomFilter] = useState<string>("all");
  const [html, setHtml] = useState("");

  const household = db.moves[0]?.title ?? "";
  const set = <K extends keyof LabelOptions>(k: K, v: LabelOptions[K]) => {
    const next = { ...opts, [k]: v };
    setOpts(next);
    localStorage.setItem(OPTS_KEY, JSON.stringify(next));
  };

  const boxes = useMemo(() => [...db.boxes].sort((a, b) => a.number - b.number), [db.boxes]);
  const roomsWithBoxes = useMemo(
    () =>
      [...db.rooms, { id: "", name: "No room", color: "#94a3b8" }]
        .map((r) => ({ ...r, boxes: boxes.filter((b) => (b.room_id ?? "") === r.id) }))
        .filter((r) => r.boxes.length),
    [db.rooms, boxes],
  );
  const visible = roomFilter === "all" ? roomsWithBoxes : roomsWithBoxes.filter((r) => r.id === roomFilter);
  const ids = useMemo(() => boxes.filter((b) => selected.has(b.id)).map((b) => b.id), [boxes, selected]);

  useEffect(() => {
    let cancelled = false;
    void buildLabelSheet(db, ids, { ...opts, householdName: household }).then((h) => {
      if (!cancelled) setHtml(h);
    });
    return () => {
      cancelled = true;
    };
  }, [db, ids, opts, household]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const selectMany = (list: string[], on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      for (const id of list) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });

  const size = LABEL_SIZES.find((s) => s.value === opts.size)!;
  const labelCount = ids.length * opts.copies;
  const sheets = Math.ceil(labelCount / size.perPage);

  return (
    <div>
      <PageHeader
        title="QR label maker"
        icon="🏷️"
        subtitle="Color-coded labels for every box, generated from its room. Scan the QR with the app to see exactly what's inside."
        actions={
          <button className="btn-primary" disabled={!ids.length} onClick={() => printHtml(html)}>
            🖨️ {labelCount ? `Print ${labelCount} label${labelCount === 1 ? "" : "s"}` : "Print labels"}
          </button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0 xl:block xl:space-y-4">
          <div className="card space-y-3">
            <div className="text-sm font-bold">1 · Pick boxes</div>
            <div className="flex flex-wrap gap-1.5">
              <button className={`chip border ${roomFilter === "all" ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-700"}`} onClick={() => setRoomFilter("all")}>
                All rooms
              </button>
              {roomsWithBoxes.map((r) => (
                <button
                  key={r.id}
                  className="chip border"
                  style={roomFilter === r.id ? { background: r.color, borderColor: r.color, color: "#fff" } : { borderColor: `${r.color}66`, color: "#334155", background: `${r.color}14` }}
                  onClick={() => setRoomFilter(r.id)}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                  {r.name}
                </button>
              ))}
            </div>
            {!boxes.length && <div className="muted">No boxes yet. Quick-create some below.</div>}
            <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {visible.map((r) => {
                const roomIds = r.boxes.map((b) => b.id);
                const all = roomIds.every((id) => selected.has(id));
                return (
                  <div key={r.id}>
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                        <span className="h-3 w-3 rounded" style={{ background: r.color }} />
                        {r.name} · {r.boxes.length}
                      </div>
                      <button className="text-xs font-semibold text-indigo-600" onClick={() => selectMany(roomIds, !all)}>
                        {all ? "Clear" : "Select all"}
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-4">
                      {r.boxes.map((b, i) => {
                        const on = selected.has(b.id);
                        return (
                          <button
                            key={b.id}
                            title={b.label || `Box ${b.number}`}
                            onClick={() => toggle(b.id)}
                            className={`rounded-xl border px-1 py-2 text-center text-xs font-bold transition ${on ? "text-white shadow-md" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                            style={on ? { background: r.color, borderColor: r.color } : undefined}
                          >
                            {opts.numbering === "room" ? `${roomCode(r.name)}-${i + 1}` : `#${b.number}`}
                            {(b.fragile || b.open_first) && <div className="text-[10px] font-medium opacity-80">{b.fragile ? "fragile" : "open 1st"}</div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {boxes.length > 0 && (
              <div className="flex gap-2">
                <button className="btn-secondary flex-1 py-1.5 text-xs" onClick={() => selectMany(boxes.map((b) => b.id), true)}>
                  Select every box
                </button>
                <button className="btn-ghost flex-1 py-1.5 text-xs" onClick={() => setSelected(new Set())}>
                  Clear
                </button>
              </div>
            )}
          </div>

          <div className="card space-y-3">
            <div className="text-sm font-bold">2 · Label style</div>
            <div>
              <span className="label">Label stock</span>
              <select className="input" value={opts.size} onChange={(e) => set("size", e.target.value as LabelOptions["size"])}>
                {LABEL_SIZES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-slate-500">{size.description}</div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="label mb-0">Numbering</span>
              <Segmented
                value={opts.numbering}
                options={[
                  { value: "global", label: "#12" },
                  { value: "room", label: "KIT-3" },
                ]}
                onChange={(v) => set("numbering", v)}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="label mb-0">Copies per box</span>
              <Segmented
                value={String(opts.copies) as "1" | "2" | "3" | "4"}
                options={[
                  { value: "1", label: "1" },
                  { value: "2", label: "2" },
                  { value: "3", label: "3" },
                  { value: "4", label: "4" },
                ]}
                onChange={(v) => set("copies", Number(v))}
              />
            </div>
            <div className="divide-y divide-slate-100">
              <Toggle label="Room color band" value={opts.colorBand} onChange={(v) => set("colorBand", v)} />
              <Toggle label="Show contents" value={opts.showContents} onChange={(v) => set("showContents", v)} />
              <Toggle label="Show “from” room" value={opts.showFromRoom} onChange={(v) => set("showFromRoom", v)} />
              <Toggle label="Fragile / open-first flags" value={opts.showFlags} onChange={(v) => set("showFlags", v)} />
            </div>
          </div>

          <QuickCreate onCreated={(newIds) => selectMany(newIds, true)} />
        </div>

        <div className="card flex min-h-[520px] flex-col overflow-hidden p-0 xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)] xl:self-start">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div className="text-sm font-bold">3 · Preview</div>
            <div className="text-xs text-slate-500">
              {labelCount} label{labelCount === 1 ? "" : "s"}
              {opts.size === "thermal4x6" ? "" : ` · ${sheets} sheet${sheets === 1 ? "" : "s"}`}
            </div>
          </div>
          {ids.length ? (
            <iframe title="Label preview" srcDoc={html} className="min-h-[680px] w-full flex-1 bg-[#e7e4dc] xl:min-h-0" />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center text-slate-400">
              <div className="text-5xl">🏷️</div>
              <div>Pick boxes in step 1 to preview their labels.</div>
              <div className="text-xs">Tip: print 2 copies per box, one for the top and one for the side.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
