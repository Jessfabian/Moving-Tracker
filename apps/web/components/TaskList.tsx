"use client";

import { CATEGORY_ICONS, daysUntil, formatDate, type Task } from "@moving/shared";
import { useState } from "react";
import { useDb, useStore } from "@/lib/store-context";
import { EntityForm } from "./EntityForm";
import { Drawer } from "./ui";

const PRIORITY: Record<string, string> = { high: "bg-red-500", medium: "bg-amber-400", low: "bg-gray-300" };

export function TaskRow({ task, onOpen, showMember = true }: { task: Task; onOpen: (t: Task) => void; showMember?: boolean }) {
  const store = useStore();
  const db = useDb();
  const done = task.status === "done" || task.status === "skipped";
  const d = daysUntil(task.due_date);
  const overdue = !done && d !== null && d < 0;
  const who = db.family_members.find((m) => m.id === (task.assignee_id ?? task.member_id));
  const pet = db.pets.find((p) => p.id === task.pet_id);
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <input
        type="checkbox"
        aria-label={`Mark ${task.title} done`}
        className="mt-1 h-5 w-5 flex-none cursor-pointer accent-green-600"
        checked={done}
        onChange={(e) => store.update("tasks", task.id, { status: e.target.checked ? "done" : "todo" })}
      />
      <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(task)}>
        <div className={`flex items-center gap-2 font-medium ${done ? "text-gray-400 line-through" : ""}`}>
          <span className={`h-2 w-2 flex-none rounded-full ${PRIORITY[task.priority]}`} title={`${task.priority} priority`} />
          <span className="truncate">{task.title}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-gray-500">
          <span>
            {CATEGORY_ICONS[task.category]} {task.category.replace("_", " ")}
          </span>
          {task.due_date && (
            <span className={overdue ? "font-semibold text-red-600" : d !== null && d <= 7 && !done ? "font-semibold text-amber-600" : ""}>
              📅 {formatDate(task.due_date)}
              {!done && d !== null && (overdue ? ` · ${-d}d overdue` : d === 0 ? " · today" : d <= 14 ? ` · in ${d}d` : "")}
            </span>
          )}
          {showMember && who && <span>👤 {who.name}</span>}
          {pet && <span>🐾 {pet.name}</span>}
          {task.source === "tailored" && <span className="text-violet-600">✨ tailored</span>}
          {task.status === "in_progress" && <span className="text-blue-600">⏳ in progress</span>}
        </div>
      </button>
    </li>
  );
}

export function TaskList({ tasks, showMember, empty }: { tasks: Task[]; showMember?: boolean; empty?: string }) {
  const [open, setOpen] = useState<Task | null>(null);
  const db = useDb();
  const current = open ? (db.tasks.find((t) => t.id === open.id) ?? null) : null;
  return (
    <>
      {tasks.length ? (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} onOpen={setOpen} showMember={showMember} />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">{empty ?? "Nothing here."}</p>
      )}
      <TaskDrawer task={current} open={!!open} onClose={() => setOpen(null)} />
    </>
  );
}

export function TaskDrawer({ task, open, onClose, initial }: { task: Task | null; open: boolean; onClose: () => void; initial?: Partial<Task> }) {
  return (
    <Drawer open={open} onClose={onClose} title={task ? "Edit task" : "New task"}>
      {open && <EntityForm key={task?.id ?? "new"} table="tasks" row={task} initial={initial ?? { source: "custom" }} onDone={onClose} />}
    </Drawer>
  );
}
