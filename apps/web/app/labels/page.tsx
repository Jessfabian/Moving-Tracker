"use client";

import { GroupToggle, SelectBar, useSelection } from "@/components/Selection";
import { Card } from "@/components/Swipe";
import { buildLabelSheet, DEFAULT_LABEL_OPTIONS, LABEL_SIZES, nextBoxNumber, roomCode, type LabelOptions } from "@moving/shared";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, Segmented, Toggle } from "@/components/ui";
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
    <Card id="labels-quick-create" title="Quick-create boxes" icon="⚡" bodyClassName="mt-3 space-y-3">
      <div className="muted">Make a batch of numbered boxes for a room, then print their labels.</div>
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
        <Toggle className="text-sm" label="Fragile" checked={fragile} onChange={setFragile} />
        <Toggle className="text-sm" label="Open first" checked={openFirst} onChange={setOpenFirst} />
      </div>
      <button className="btn-primary w-full" disabled={!canCreate} onClick={create}>
        Create {count} box{count === 1 ? "" : "es"}
        {room ? ` for ${room.name}` : roomId === NEW && newName.trim() ? ` for ${newName.trim()}` : ""}
      </button>
    </Card>
  );
}

export default function LabelsPage() {
  const db = useDb();
  const [opts, setOpts] = useState<LabelOptions>(loadOpts);
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
  const sel = useSelection(boxes.map((b) => b.id), { alwaysOn: true });
  const ids = useMemo(() => boxes.filter((b) => sel.has(b.id)).map((b) => b.id), [boxes, sel]);

  useEffect(() => {
    let cancelled = false;
    void buildLabelSheet(db, ids, { ...opts, householdName: household }).then((h) => {
      if (!cancelled) setHtml(h);
    });
    return () => {
      cancelled = true;
    };
  }, [db, ids, opts, household]);

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
          <Card id="labels-pick" title="1 · Pick boxes" summary={`${ids.length} picked`} bodyClassName="mt-3 space-y-3">
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
            {!boxes.length ? <div className="muted">No boxes yet. Quick-create some below.</div> : <SelectBar sel={sel} noun="box" sticky={false} className="bg-ink/[0.04]! shadow-none!" />}
            <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {visible.map((r) => {
                const roomIds = r.boxes.map((b) => b.id);
                return (
                  <div key={r.id}>
                    <div className="mb-1 flex items-center gap-1">
                      <GroupToggle sel={sel} ids={roomIds} label={r.name} />
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                        <span className="h-3 w-3 rounded" style={{ background: r.color }} />
                        {r.name} · {roomIds.filter((id) => sel.has(id)).length} of {r.boxes.length}
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-4">
                      {r.boxes.map((b, i) => {
                        const on = sel.has(b.id);
                        return (
                          <button
                            key={b.id}
                            title={b.label || `Box ${b.number}`}
                            role="checkbox"
                            aria-checked={on}
                            onClick={() => sel.toggle(b.id)}
                            className={`relative rounded-xl border px-1 py-2 text-center text-xs font-bold transition ${on ? "text-white shadow-md" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                            style={on ? { background: r.color, borderColor: r.color } : undefined}
                          >
                            {on && (
                              <span aria-hidden className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] text-ink shadow ring-1 ring-black/10">
                                ✓
                              </span>
                            )}
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
          </Card>

          <Card id="labels-style" title="2 · Label style" summary={size.label} bodyClassName="mt-3 space-y-3">
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
              <Toggle className="text-sm" label="Room color band" checked={opts.colorBand} onChange={(v) => set("colorBand", v)} />
              <Toggle className="text-sm" label="Show contents" checked={opts.showContents} onChange={(v) => set("showContents", v)} />
              <Toggle className="text-sm" label="Show “from” room" checked={opts.showFromRoom} onChange={(v) => set("showFromRoom", v)} />
              <Toggle className="text-sm" label="Fragile / open-first flags" checked={opts.showFlags} onChange={(v) => set("showFlags", v)} />
            </div>
          </Card>

          <QuickCreate onCreated={(newIds) => sel.setMany(newIds, true)} />
        </div>

        <Card
          id="labels-preview"
          title="3 · Preview"
          summary={`${labelCount} label${labelCount === 1 ? "" : "s"}`}
          className="xl:sticky xl:top-4 xl:self-start"
          bodyClassName="mt-3 flex min-h-[460px] flex-col overflow-hidden rounded-2xl xl:h-[calc(100vh-9rem)]"
          right={
            <div className="text-xs text-slate-500">
              {labelCount} label{labelCount === 1 ? "" : "s"}
              {opts.size === "thermal4x6" ? "" : ` · ${sheets} sheet${sheets === 1 ? "" : "s"}`}
            </div>
          }
        >
          {ids.length ? (
            <iframe title="Label preview" srcDoc={html} className="min-h-[680px] w-full flex-1 rounded-2xl bg-[#e7e4dc] xl:min-h-0" />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center text-slate-400">
              <div className="text-5xl">🏷️</div>
              <div>Pick boxes in step 1 to preview their labels.</div>
              <div className="text-xs">Tip: print 2 copies per box, one for the top and one for the side.</div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
