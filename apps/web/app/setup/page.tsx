"use client";

import { applyPlan, memberAge, optionLabel, RELATIONSHIPS, SCHEMAS, seedHousehold, type FamilyMember, type Pet } from "@moving/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EntityForm, FieldInput } from "@/components/EntityForm";
import { MoveDistance } from "@/components/MoveDistance";
import { Modal } from "@/components/ui";
import { useDb, useStore } from "@/lib/store-context";

const STEPS = ["Your move", "Family", "Pets", "Your plan"];
const MOVE_FIELDS = ["title", "move_date", "from_zip", "from_city", "from_state", "from_tenure", "to_zip", "to_city", "to_state", "to_tenure", "distance_miles", "moving_method"];

function memberSummary(m: FamilyMember) {
  const age = memberAge(m);
  const bits = [optionLabel(RELATIONSHIPS, m.relationship), age !== null ? `${age} yrs` : null, m.drives && "drives", m.employed && (m.works_remote ? "remote worker" : "employed"), m.school_name && "school", m.medications && "medications", m.special_needs && "special needs"];
  return bits.filter(Boolean).join(" · ");
}

export default function SetupPage() {
  const store = useStore();
  const db = useDb();
  const router = useRouter();
  const existing = db.moves[0];
  const [step, setStep] = useState(0);
  const [move, setMove] = useState<Record<string, unknown>>(() => ({ ...(existing ?? { title: "Our move", from_tenure: "own", to_tenure: "rent", moving_method: "undecided" }) }));
  const [editMember, setEditMember] = useState<FamilyMember | "new" | null>(null);
  const [editPet, setEditPet] = useState<Pet | "new" | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const saveMove = () => {
    const { id: _i, household_id: _h, created_at: _c, updated_at: _u, ...data } = move;
    if (existing) store.update("moves", existing.id, data);
    else store.insert("moves", data);
    setStep(1);
  };

  const finish = () => {
    seedHousehold(store);
    const r = applyPlan(store);
    setResult(`Created ${r.created} tasks tailored to your family${r.rescheduled ? ` and rescheduled ${r.rescheduled}` : ""}.`);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 text-center">
        <div className="text-4xl">📦</div>
        <h1 className="h1 mt-2">Let&apos;s plan your move</h1>
        <p className="muted">A few details and we&apos;ll build a complete, personalised moving plan.</p>
      </div>
      <ol className="mb-6 flex justify-between gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <button onClick={() => (i === 0 || existing ? setStep(i) : null)} className="w-full text-left" aria-current={i === step ? "step" : undefined}>
              <div className={`h-1.5 rounded-full ${i <= step ? "bg-indigo-600" : "bg-gray-200"}`} />
              <div className={`mt-1 text-xs font-semibold ${i === step ? "text-indigo-700" : "text-gray-400"}`}>
                {i + 1}. {s}
              </div>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="card space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {MOVE_FIELDS.map((k) => {
              const f = SCHEMAS.moves.fields.find((x) => x.key === k)!;
              const label = f.section && f.section.startsWith("Moving") ? `${f.section} – ${f.label}` : f.label;
              return (
                <div key={k} className={k === "title" ? "sm:col-span-2" : ""}>
                  <label className="label" htmlFor={`f-${k}`}>
                    {label}
                  </label>
                  <FieldInput field={f} value={move[k]} onChange={(v) => setMove((m) => ({ ...m, [k]: v }))} onPatch={(p) => setMove((m) => ({ ...m, ...p }))} />
                </div>
              );
            })}
          </div>
          <MoveDistance fromZip={move.from_zip} toZip={move.to_zip} value={move.distance_miles} onChange={(m) => setMove((x) => ({ ...x, distance_miles: m }))} />
          <p className="text-xs text-gray-500">You can add exact addresses, packing/load/delivery dates and more later under “Move details”.</p>
          <button className="btn-primary w-full" onClick={saveMove}>
            Continue →
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="card space-y-4">
          <div>
            <h2 className="text-lg font-bold">Who&apos;s moving?</h2>
            <p className="muted">Add everyone — ages, school, work, health and driving details let us tailor tasks (school records, prescriptions, license transfers, IEPs and more).</p>
          </div>
          <ul className="space-y-2">
            {db.family_members.map((m) => (
              <li key={m.id}>
                <button className="flex w-full items-center gap-3 rounded-xl border border-gray-200 p-3 text-left hover:bg-gray-50" onClick={() => setEditMember(m)}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 font-bold text-violet-700">{m.name.slice(0, 1).toUpperCase()}</span>
                  <span>
                    <span className="block font-semibold">{m.name}</span>
                    <span className="text-xs text-gray-500">{memberSummary(m)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button className="btn-secondary w-full" onClick={() => setEditMember("new")}>
            + Add family member
          </button>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setStep(0)}>
              ← Back
            </button>
            <button className="btn-primary flex-1" onClick={() => setStep(2)}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card space-y-4">
          <div>
            <h2 className="text-lg font-bold">Any pets?</h2>
            <p className="muted">We&apos;ll add vet records, health certificates and travel tasks for each pet.</p>
          </div>
          <ul className="space-y-2">
            {db.pets.map((p) => (
              <li key={p.id}>
                <button className="flex w-full items-center gap-3 rounded-xl border border-gray-200 p-3 text-left hover:bg-gray-50" onClick={() => setEditPet(p)}>
                  <span className="text-2xl">🐾</span>
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-xs text-gray-500">{p.species}</span>
                </button>
              </li>
            ))}
          </ul>
          <button className="btn-secondary w-full" onClick={() => setEditPet("new")}>
            + Add pet
          </button>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setStep(1)}>
              ← Back
            </button>
            <button className="btn-primary flex-1" onClick={() => setStep(3)}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card space-y-4 text-center">
          <div className="text-5xl">✨</div>
          <h2 className="text-xl font-bold">Ready to build your plan</h2>
          <p className="muted">
            We&apos;ll create a week-by-week checklist for {db.family_members.length || "your"} {db.family_members.length === 1 ? "person" : "people"}
            {db.pets.length ? ` and ${db.pets.length} pet${db.pets.length > 1 ? "s" : ""}` : ""}, plus starter rooms, utilities, address-change and budget lists. You can edit everything.
          </p>
          {result ? (
            <div className="space-y-3">
              <p className="rounded-xl bg-green-50 p-3 font-semibold text-green-800" role="status">
                ✅ {result}
              </p>
              <button className="btn-primary w-full" autoFocus onClick={() => router.push("/")}>
                See my plan
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setStep(2)}>
                ← Back
              </button>
              <button className="btn-primary flex-1" onClick={finish}>
                Build my moving plan
              </button>
            </div>
          )}
        </div>
      )}

      <Modal open={!!editMember} onClose={() => setEditMember(null)} title={editMember === "new" ? "Add family member" : "Edit family member"}>
        {editMember && <EntityForm table="family_members" row={editMember === "new" ? null : editMember} onDone={() => setEditMember(null)} />}
      </Modal>
      <Modal open={!!editPet} onClose={() => setEditPet(null)} title={editPet === "new" ? "Add pet" : "Edit pet"}>
        {editPet && <EntityForm table="pets" row={editPet === "new" ? null : editPet} onDone={() => setEditPet(null)} />}
      </Modal>
    </div>
  );
}
