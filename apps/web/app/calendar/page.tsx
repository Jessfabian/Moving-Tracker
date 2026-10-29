"use client";

import { Card } from "@/components/Swipe";
import { CALENDAR_LEGEND, calendarEvents, formatDate, formatTime, monthGrid, today, toDateString, addDays, type Appointment, type CalendarEvent, type CalendarSource } from "@moving/shared";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EntityForm } from "@/components/EntityForm";
import { Drawer } from "@/components/ui";
import { useDb } from "@/lib/store-context";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function shiftMonth(anchor: string, n: number): string {
  const [y, m] = anchor.split("-").map(Number) as [number, number];
  return toDateString(new Date(y, m - 1 + n, 1));
}

function EventRow({ e, onOpen }: { e: CalendarEvent; onOpen: (e: CalendarEvent) => void }) {
  return (
    <button onClick={() => onOpen(e)} className={`group flex w-full items-start gap-3 rounded-2xl p-3 text-left transition hover:bg-gray-50 ${e.done ? "opacity-50" : ""}`}>
      <span className="mt-1 h-8 w-1.5 flex-none rounded-full" style={{ background: e.color }} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-semibold ${e.done ? "line-through" : ""}`}>{e.title}</span>
        <span className="block truncate text-xs text-gray-500">
          {e.kind}
          {e.time ? ` · ${formatTime(e.time)}` : ""}
          {e.location ? ` · ${e.location}` : ""}
        </span>
      </span>
      {e.important && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-accent uppercase">Key</span>}
    </button>
  );
}

export default function CalendarPage() {
  const db = useDb();
  const now = today();
  const [anchor, setAnchor] = useState(() => `${now.slice(0, 7)}-01`);
  const [selected, setSelected] = useState(now);
  const [hidden, setHidden] = useState<Set<CalendarSource>>(new Set());
  const [editing, setEditing] = useState<Appointment | "new" | null>(() => {
    if (typeof window === "undefined") return null;
    const id = new URLSearchParams(window.location.search).get("appointment");
    return id ? (db.appointments.find((a) => a.id === id) ?? null) : null;
  });
  const [view, setView] = useState<"month" | "agenda">("month");

  const grid = useMemo(() => monthGrid(anchor), [anchor]);
  const all = useMemo(() => calendarEvents(db, { from: shiftMonth(anchor, -1), to: shiftMonth(anchor, 13) }), [db, anchor]);
  const events = useMemo(() => all.filter((e) => !hidden.has(e.source)), [all, hidden]);
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return m;
  }, [events]);
  const dayEvents = byDay.get(selected) ?? [];
  const upcoming = events.filter((e) => e.date >= now && !e.done).slice(0, 40);
  const nextKey = upcoming.find((e) => e.important);
  const monthLabel = new Date(`${anchor}T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const monthCount = events.filter((e) => e.date.slice(0, 7) === anchor.slice(0, 7)).length;
  const apptsUpcoming = db.appointments.filter((a) => a.date && a.date >= now && a.status === "scheduled").length;

  const open = (e: CalendarEvent) => {
    if (e.source === "appointment") {
      const a = db.appointments.find((x) => `appt-${x.id}` === e.id || e.href.endsWith(x.id));
      if (a) return setEditing(a);
    }
    window.location.href = e.href;
  };

  const groupedMap = new Map<string, CalendarEvent[]>();
  for (const e of upcoming) groupedMap.set(e.date, [...(groupedMap.get(e.date) ?? []), e]);
  const grouped = [...groupedMap.entries()];

  return (
    <div className="space-y-6">
      <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <div className="eyebrow">Plan · {monthCount} things this month</div>
          <h1 className="display mt-2">
            Every <span className="highlight">date</span> that matters.
          </h1>
          <p className="muted mt-3 max-w-2xl">Appointments, task deadlines, tours, paperwork expirations, utility switch-overs, bills and birthdays — one calendar.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-full bg-white p-1 shadow-sm">
            {(["month", "agenda"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize ${view === v ? "bg-ink text-white" : "text-gray-600"}`}>
                {v}
              </button>
            ))}
          </div>
          <button className="btn-accent" onClick={() => setEditing("new")}>
            + Appointment
          </button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="ink-panel tile bg-ink text-white md:col-span-1">
          <div className="eyebrow text-white/50">Next key date</div>
          {nextKey ? (
            <>
              <div className="mt-2 font-display text-2xl leading-tight font-bold">{nextKey.title}</div>
              <div className="mt-1 text-sm text-lime">{formatDate(nextKey.date, { weekday: "long", month: "long", day: "numeric" })}</div>
            </>
          ) : (
            <div className="mt-2 text-white/60">Nothing flagged yet.</div>
          )}
        </div>
        <div className="tile bg-sky">
          <div className="eyebrow">Appointments ahead</div>
          <div className="mt-2 font-display text-5xl font-bold">{apptsUpcoming}</div>
        </div>
        <div className="tile bg-sand">
          <div className="eyebrow">Next 30 days</div>
          <div className="mt-2 font-display text-5xl font-bold">{upcoming.filter((e) => e.date <= addDays(now, 30)).length}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CALENDAR_LEGEND.map((l) => {
          const off = hidden.has(l.source);
          const color = all.find((e) => e.source === l.source)?.color;
          return (
            <button
              key={l.source}
              onClick={() => setHidden((h) => (h.has(l.source) ? new Set([...h].filter((x) => x !== l.source)) : new Set([...h, l.source])))}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${off ? "border-gray-200 text-gray-400 line-through" : "border-gray-200 bg-white text-gray-700"}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: off ? "#d6d3d1" : (color ?? "#0d0d0f") }} />
              {l.label}
            </button>
          );
        })}
      </div>

      {view === "month" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card id="calendar.month" title={monthLabel} bodyClassName="mt-4">
            <div className="mb-4 flex items-center justify-end gap-2">
              <div className="flex gap-1">
                <button className="btn-ghost px-3" onClick={() => setAnchor(shiftMonth(anchor, -1))} aria-label="Previous month">
                  ←
                </button>
                <button
                  className="btn-secondary px-3 text-xs"
                  onClick={() => {
                    setAnchor(`${now.slice(0, 7)}-01`);
                    setSelected(now);
                  }}
                >
                  Today
                </button>
                <button className="btn-ghost px-3" onClick={() => setAnchor(shiftMonth(anchor, 1))} aria-label="Next month">
                  →
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold tracking-wide text-gray-400 uppercase">
              {WEEKDAYS.map((d) => (
                <div key={d} className="pb-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {grid.map((c) => {
                const evs = byDay.get(c.date) ?? [];
                const isToday = c.date === now;
                const isSel = c.date === selected;
                const moveDay = evs.some((e) => e.source === "move");
                return (
                  <button
                    key={c.date}
                    onClick={() => setSelected(c.date)}
                    onDoubleClick={() => setEditing("new")}
                    className={`flex min-h-[64px] flex-col rounded-xl p-1.5 text-left transition sm:min-h-[104px] sm:p-2 ${c.inMonth ? "bg-gray-50/80" : "bg-transparent opacity-40"} ${isSel ? "ring-2 ring-ink" : "hover:bg-gray-100"} ${moveDay ? "bg-accent/10" : ""}`}
                  >
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${isToday ? "bg-accent text-white" : ""}`}>{Number(c.date.slice(8))}</span>
                    <span className="mt-1 hidden min-w-0 flex-col gap-0.5 sm:flex">
                      {evs.slice(0, 3).map((e) => (
                        <span key={e.id} className={`truncate rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${e.done ? "line-through opacity-50" : ""}`} style={{ background: `${e.color}1f`, color: e.color }}>
                          {e.time ? `${formatTime(e.time)} ` : ""}
                          {e.title}
                        </span>
                      ))}
                      {evs.length > 3 && <span className="px-1 text-[10px] font-semibold text-gray-400">+{evs.length - 3} more</span>}
                    </span>
                    {evs.length > 0 && (
                      <span className="mt-auto flex flex-wrap gap-0.5 sm:hidden">
                        {evs.slice(0, 4).map((e) => (
                          <span key={e.id} className="h-1.5 w-1.5 rounded-full" style={{ background: e.color }} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>
          <aside className="card self-start xl:sticky xl:top-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="eyebrow">{selected === now ? "Today" : formatDate(selected, { weekday: "long" })}</div>
                <div className="font-display text-3xl font-bold tracking-tight">{formatDate(selected, { month: "long", day: "numeric" })}</div>
              </div>
              <button className="btn-secondary px-3 text-xs" onClick={() => setEditing("new")}>
                + Add
              </button>
            </div>
            <div className="mt-3 -mx-2">
              {dayEvents.length ? dayEvents.map((e) => <EventRow key={e.id} e={e} onOpen={open} />) : <p className="px-2 py-6 text-center text-sm text-gray-400">Nothing scheduled. Double-click a day to add an appointment.</p>}
            </div>
          </aside>
        </div>
      ) : (
        <section className="card">
          {grouped.length ? (
            <ol className="divide-y divide-gray-100">
              {grouped.map(([date, evs]) => (
                <li key={date} className="grid gap-2 py-4 sm:grid-cols-[140px_minmax(0,1fr)]">
                  <div>
                    <div className="font-display text-2xl font-bold">{formatDate(date, { month: "short", day: "numeric" })}</div>
                    <div className="text-xs text-gray-500">{date === now ? "Today" : formatDate(date, { weekday: "long" })}</div>
                  </div>
                  <div className="-mx-2">
                    {evs.map((e) => (
                      <EventRow key={e.id} e={e} onOpen={open} />
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-10 text-center text-gray-400">Nothing coming up. Add an appointment or set due dates on tasks.</p>
          )}
        </section>
      )}

      <div className="text-center text-xs text-gray-400">
        Appointments also appear on the <Link href="/" className="underline">dashboard</Link>. Task deadlines come from your <Link href="/tasks" className="underline">checklist</Link>.
      </div>

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "New appointment" : editing ? editing.title : ""}>
        {editing && (
          <EntityForm
            key={editing === "new" ? `new-${selected}` : editing.id}
            table="appointments"
            row={editing === "new" ? null : editing}
            initial={{ date: selected }}
            onDone={() => setEditing(null)}
          />
        )}
      </Drawer>
    </div>
  );
}
