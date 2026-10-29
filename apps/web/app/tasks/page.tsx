"use client";

import { applyPlan, bucketFor, CATEGORY_ICONS, daysBetween, optionLabel, TASK_CATEGORIES, TIMELINE_BUCKETS, type Task } from "@moving/shared";
import { useMemo, useState } from "react";
import { askConfirm } from "@/components/ConfirmSheet";
import { BULK_BTN, BULK_DANGER, BULK_PRIMARY, SelectActions, SelectBar, useBulkDelete, useBulkHide, useBulkUpdate, useSelection } from "@/components/Selection";
import { useHiddenRows } from "@/components/Swipe";
import { TaskDrawer, TaskList } from "@/components/TaskList";
import { PageHeader, Progress, Segmented, SearchField } from "@/components/ui";
import { useDb, useStore } from "@/lib/store-context";

type View = "timeline" | "category" | "person";
type StatusFilter = "open" | "all" | "done";

export default function TasksPage() {
  const db = useDb();
  const store = useStore();
  const move = db.moves[0];
  const [view, setView] = useState<View>("timeline");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [member, setMember] = useState("");
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const hiddenRows = useHiddenRows();
  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return db.tasks
      .filter((t) => !hiddenRows.rows.some((h) => h.table === "tasks" && h.id === t.id))
      .filter((t) => (status === "all" ? true : status === "done" ? t.status === "done" || t.status === "skipped" : t.status === "todo" || t.status === "in_progress"))
      .filter((t) => !member || t.assignee_id === member || t.member_id === member)
      .filter((t) => !cat || t.category === cat)
      .filter((t) => !needle || `${t.title} ${t.description} ${t.notes}`.toLowerCase().includes(needle))
      .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || a.title.localeCompare(b.title));
  }, [db.tasks, status, member, cat, q, hiddenRows.rows]);
  const hiddenCount = db.tasks.filter((t) => hiddenRows.isHidden("tasks", t.id)).length;

  const moveDate = move?.move_date;
  const groups = useMemo(() => {
    const map = new Map<string, Task[]>();
    const add = (k: string, t: Task) => map.set(k, [...(map.get(k) ?? []), t]);
    for (const t of filtered) {
      if (view === "timeline") add(t.due_date && moveDate ? bucketFor(daysBetween(moveDate, t.due_date)) : "No date", t);
      else if (view === "category") add(t.category, t);
      else add(t.assignee_id ?? t.member_id ?? "", t);
    }
    const order =
      view === "timeline"
        ? [...TIMELINE_BUCKETS.map((b) => b.label), "No date"]
        : view === "category"
          ? TASK_CATEGORIES.map((c) => c.value)
          : [...db.family_members.map((m) => m.id), ""];
    return order.filter((k) => map.has(k)).map((k) => ({
      key: k,
      label:
        view === "timeline"
          ? k
          : view === "category"
            ? `${CATEGORY_ICONS[k as Task["category"]]} ${optionLabel(TASK_CATEGORIES, k)}`
            : k
              ? `👤 ${db.family_members.find((m) => m.id === k)?.name}`
              : "👥 Whole household",
      tasks: map.get(k)!,
    }));
  }, [filtered, view, moveDate, db.family_members]);

  const done = db.tasks.filter((t) => t.status === "done" || t.status === "skipped").length;
  const sel = useSelection(filtered.map((t) => t.id));
  const bulkUpdate = useBulkUpdate<Task>("tasks", sel, "task");
  const bulkDelete = useBulkDelete("tasks", sel, "task");
  const bulkHide = useBulkHide("tasks", sel, (id) => db.tasks.find((t) => t.id === id)?.title ?? "Task", "task");

  return (
    <div>
      <PageHeader
        title="Checklist & timeline"
        icon="✅"
        subtitle={`${done} of ${db.tasks.length} done · tasks are tailored to your move, family and pets`}
        actions={
          <>
            <button
              className="btn-secondary"
              onClick={async () => {
                const choice = await askConfirm({
                  title: "Refresh your plan",
                  message: "New tasks are added and dates are updated. Do you also want to remove untouched tasks that no longer apply, like ones for people you removed?",
                  confirm: "Refresh and remove old tasks",
                  alt: "Refresh only",
                });
                if (!choice) return;
                const r = applyPlan(store, { removeObsolete: choice === true });
                setMsg(`Plan refreshed: ${r.created} added, ${r.rescheduled} rescheduled, ${r.removed} removed.`);
              }}
            >
              ✨ Refresh tailored plan
            </button>
            <button className="btn-primary" onClick={() => setAdding(true)}>
              + Add task
            </button>
          </>
        }
      />
      <Progress value={db.tasks.length ? (done / db.tasks.length) * 100 : 0} color="bg-green-500" />
      {msg && <p className="mt-3 rounded-lg bg-green-50 p-2 text-sm text-green-800">{msg}</p>}
      <div className="my-4 flex flex-wrap items-center gap-2">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "timeline", label: "📅 Timeline" },
            { value: "category", label: "🗂️ Category" },
            { value: "person", label: "👤 Person" },
          ]}
        />
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: "open", label: "Open" },
            { value: "done", label: "Done" },
            { value: "all", label: "All" },
          ]}
        />
        <select className="input w-auto" value={member} onChange={(e) => setMember(e.target.value)}>
          <option value="">Everyone</option>
          {db.family_members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {TASK_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <SearchField className="max-w-xs flex-1" placeholder="Search tasks…" value={q} onChange={setQ} />
        <span className="self-center text-sm text-gray-500">
          {filtered.length} of {db.tasks.length}
          {hiddenCount > 0 && (
            <a href="/settings#hidden" className="ml-1 text-gray-400 underline">
              · {hiddenCount} hidden
            </a>
          )}
        </span>
        {!sel.active && <SelectBar sel={sel} noun="task" />}
      </div>
      {sel.active && <SelectBar sel={sel} noun="task" className="mb-3" />}
      {!move?.move_date && view === "timeline" && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Set your move date in Move details to place tasks on the timeline.</p>}
      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.key}>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">
              {g.label} <span className="font-normal">({g.tasks.length})</span>
            </h2>
            <TaskList tasks={g.tasks} showMember={view !== "person"} sel={sel} />
          </section>
        ))}
        {!groups.length && <p className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-500">{status === "open" ? "All caught up! 🎉" : "No tasks match."}</p>}
      </div>
      <SelectActions sel={sel} noun="task">
        <div className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
          <button type="button" className={BULK_PRIMARY} onClick={() => bulkUpdate({ status: "done" }, "Marked done")}>
            ✓ Mark done
          </button>
          <button type="button" className={BULK_BTN} onClick={() => bulkUpdate({ status: "todo" }, "Marked not done")}>
            ↺ Not done
          </button>
          <select className={BULK_BTN} aria-label="Set priority" value="" onChange={(e) => e.target.value && bulkUpdate({ priority: e.target.value as Task["priority"] }, `Priority: ${e.target.value}`)}>
            <option value="">Priority…</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select className={BULK_BTN} aria-label="Set category" value="" onChange={(e) => e.target.value && bulkUpdate({ category: e.target.value as Task["category"] }, `Category: ${optionLabel(TASK_CATEGORIES, e.target.value)}`)}>
            <option value="">Category…</option>
            {TASK_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            className={BULK_BTN}
            aria-label="Assign to"
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              bulkUpdate({ assignee_id: v === "__none" ? null : v }, v === "__none" ? "Unassigned" : `Assigned to ${db.family_members.find((m) => m.id === v)?.name ?? "someone"}`);
            }}
          >
            <option value="">Assign to…</option>
            {db.family_members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            <option value="__none">Nobody (household)</option>
          </select>
          <button type="button" className={BULK_BTN} onClick={bulkHide}>
            🙈 Hide
          </button>
          <button type="button" className={BULK_DANGER} onClick={bulkDelete}>
            🗑 Delete
          </button>
        </div>
      </SelectActions>
      <TaskDrawer task={null} open={adding} onClose={() => setAdding(false)} initial={{ source: "custom", assignee_id: member || null }} />
    </div>
  );
}
