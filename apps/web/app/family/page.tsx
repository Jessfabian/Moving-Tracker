"use client";

import { applyPlan, initials, memberAge, optionLabel, RELATIONSHIPS, type FamilyMember } from "@moving/shared";
import Link from "next/link";
import { useState } from "react";
import { EntityForm } from "@/components/EntityForm";
import { TaskList } from "@/components/TaskList";
import { Drawer, Empty, PageHeader } from "@/components/ui";
import { useTwoPane } from "@/lib/hooks";
import { useDb, useStore } from "@/lib/store-context";

const COLORS = ["bg-violet-100 text-violet-700", "bg-sky-100 text-sky-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-teal-100 text-teal-700"];

function Tags({ m }: { m: FamilyMember }) {
  const age = memberAge(m);
  const tags = [
    age !== null && (age < 5 ? "👶 Little one" : age < 13 ? "🎒 School age" : age < 18 ? "🧑‍🎓 Teen" : age >= 65 ? "🧓 65+" : null),
    m.drives && "🚗 Driver",
    m.employed && (m.works_remote ? "💻 Remote worker" : "💼 Employed"),
    m.school_name && `🏫 ${m.school_name}`,
    m.medications && "💊 Medications",
    m.allergies && "⚠️ Allergies",
    m.special_needs && "♿ Accommodations",
    m.dietary && "🥗 Dietary",
  ].filter(Boolean) as string[];
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="chip bg-gray-100 text-gray-700">
          {t}
        </span>
      ))}
    </div>
  );
}

function Profile({ m, onEdit }: { m: FamilyMember; onEdit: () => void }) {
  const db = useDb();
  const tasks = db.tasks.filter((t) => t.member_id === m.id || t.assignee_id === m.id).sort((a, b) => (a.due_date ?? "9").localeCompare(b.due_date ?? "9"));
  const open = tasks.filter((t) => t.status === "todo" || t.status === "in_progress");
  const docs = db.documents.filter((d) => d.member_id === m.id);
  const addr = db.address_changes.filter((a) => a.member_id === m.id);
  const books = db.books.filter((b) => b.owner_member_id === m.id);
  const age = memberAge(m);
  const info: [string, string][] = (
    [
      ["Phone", m.phone],
      ["Email", m.email],
      ["Employer", m.employer],
      ["School", [m.school_name, m.grade && `grade ${m.grade}`].filter(Boolean).join(" · ")],
      ["Activities", m.activities],
      ["Medical", m.medical_conditions],
      ["Medications", m.medications],
      ["Allergies", m.allergies],
      ["Doctors", m.doctors],
      ["Insurance", m.insurance],
      ["Accommodations", m.special_needs],
      ["Dietary", m.dietary],
      ["Notes", m.notes],
    ] as [string, string][]
  ).filter(([, v]) => v);
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{m.name}</h2>
          <p className="muted">
            {optionLabel(RELATIONSHIPS, m.relationship)}
            {age !== null && ` · ${age} years old`}
          </p>
        </div>
        <button className="btn-secondary" onClick={onEdit}>
          ✏️ Edit profile
        </button>
      </div>
      <Tags m={m} />
      {info.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          {info.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold text-gray-500">{k}</dt>
              <dd className="whitespace-pre-wrap">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <section>
        <h3 className="mb-2 font-bold">
          ✨ {m.name}&apos;s tasks ({open.length} open)
        </h3>
        <TaskList tasks={tasks} showMember={false} empty="No personal tasks yet. Add details like school, driving, work or medications to get tailored tasks." />
      </section>
      <section>
        <div className="mb-2 flex justify-between">
          <h3 className="font-bold">📄 Documents ({docs.length})</h3>
          <Link className="text-sm text-indigo-700" href="/documents">
            Manage →
          </Link>
        </div>
        {docs.length ? (
          <ul className="space-y-1 text-sm">
            {docs.map((d) => (
              <li key={d.id} className="flex justify-between">
                <span>{d.title}</span>
                <span className={d.status === "needed" ? "text-red-600" : "text-gray-500"}>{d.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No documents linked yet.</p>
        )}
      </section>
      {addr.length > 0 && (
        <section>
          <h3 className="mb-2 font-bold">📮 Address changes</h3>
          <ul className="space-y-1 text-sm">
            {addr.map((a) => (
              <li key={a.id} className="flex justify-between">
                <span>{a.organization}</span>
                <span className="text-gray-500">{a.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {books.length > 0 && <p className="text-sm text-gray-600">📚 Owns {books.length} catalogued books.</p>}
    </div>
  );
}

export default function FamilyPage() {
  const db = useDb();
  const store = useStore();
  const twoPane = useTwoPane();
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<FamilyMember | "new" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const members = [...db.family_members].sort((a, b) => (memberAge(b) ?? 0) - (memberAge(a) ?? 0));
  const current = members.find((m) => m.id === selected) ?? (twoPane ? members[0] : undefined);

  const onSaved = (saved: FamilyMember | null) => {
    setEditing(null);
    const r = applyPlan(store, { removeObsolete: true });
    if (r.created || r.removed) setMsg(`Plan updated: ${r.created} tailored tasks added${r.removed ? `, ${r.removed} removed` : ""}.`);
    if (saved) setSelected(saved.id);
  };

  const cards = (
    <div className="grid gap-3 sm:grid-cols-2">
      {members.map((m, i) => {
        const open = db.tasks.filter((t) => (t.member_id === m.id || t.assignee_id === m.id) && (t.status === "todo" || t.status === "in_progress")).length;
        const age = memberAge(m);
        return (
          <button key={m.id} onClick={() => setSelected(m.id)} className={`card text-left transition hover:shadow-md ${current?.id === m.id && twoPane ? "ring-2 ring-indigo-500" : ""}`}>
            <div className="flex items-center gap-3">
              <span className={`flex h-12 w-12 flex-none items-center justify-center rounded-full text-lg font-bold ${COLORS[i % COLORS.length]}`}>{initials(m.name)}</span>
              <div className="min-w-0">
                <div className="truncate font-bold">{m.name}</div>
                <div className="text-xs text-gray-500">
                  {optionLabel(RELATIONSHIPS, m.relationship)}
                  {age !== null && ` · ${age}`} · {open} open tasks
                </div>
              </div>
            </div>
            <div className="mt-3">
              <Tags m={m} />
            </div>
          </button>
        );
      })}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Family"
        icon="👨‍👩‍👧"
        subtitle="Everyone's details in one place. Each profile tailors the checklist — school transfers, prescriptions, license changes, accommodations and more."
        actions={
          <button className="btn-primary" onClick={() => setEditing("new")}>
            + Add family member
          </button>
        }
      />
      {msg && <p className="mb-4 rounded-lg bg-green-50 p-2 text-sm text-green-800">{msg}</p>}
      {!members.length ? (
        <Empty icon="👨‍👩‍👧" title="Add your family">
          Add each person moving with you, including ages, school, work and health info.
        </Empty>
      ) : twoPane ? (
        <div className="grid grid-cols-2 gap-7">
          <div>{cards}</div>
          <div className="card sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">{current && <Profile m={current} onEdit={() => setEditing(current)} />}</div>
        </div>
      ) : (
        <>
          {cards}
          <Drawer open={!!selected && !!current} onClose={() => setSelected(null)} title="Family member">
            {current && <Profile m={current} onEdit={() => setEditing(current)} />}
          </Drawer>
        </>
      )}
      <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Add family member" : "Edit profile"}>
        {editing && <EntityForm key={editing === "new" ? "new" : editing.id} table="family_members" row={editing === "new" ? null : editing} onDone={onSaved} />}
      </Drawer>
    </div>
  );
}
