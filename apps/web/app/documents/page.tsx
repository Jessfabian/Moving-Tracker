"use client";

import {
  DOC_FOLDERS,
  DOC_TYPES,
  FOLDER_TEMPLATES,
  folderStatus,
  folderTemplate,
  folderTemplateRows,
  formatDate,
  optionLabel,
  signedMediaUrl,
  type DocumentRow,
  type MediaRef,
} from "@moving/shared";
import { useRef, useState } from "react";
import { CrudPage, StatusPill } from "@/components/CrudPage";
import { EntityForm } from "@/components/EntityForm";
import { MediaLightbox, MediaThumb } from "@/components/Media";
import { Drawer, PageHeader, Segmented } from "@/components/ui";
import { compressImage, download } from "@/lib/media";
import { buildPacketPdf } from "@/lib/packet";
import { useApp, useDb, useStore } from "@/lib/store-context";

const STATUS_COLORS: Record<string, string> = { needed: "#dc2626", requested: "#d97706", received: "#2563eb", filed: "#16a34a" };
const STATUS_OPTS = [
  { value: "needed", label: "Needed" },
  { value: "requested", label: "Requested" },
  { value: "received", label: "Received" },
  { value: "filed", label: "Filed" },
];

const SUGGESTED: { title: string; doc_type: string; folder: string; perMember?: boolean }[] = [
  { title: "Driver's license / ID", doc_type: "id", folder: "household", perMember: true },
  { title: "Birth certificate", doc_type: "birth_certificate", folder: "household", perMember: true },
  { title: "Social Security card", doc_type: "social_security", folder: "household", perMember: true },
  { title: "Passport", doc_type: "id", folder: "household", perMember: true },
  { title: "Medical records", doc_type: "medical", folder: "medical", perMember: true },
  { title: "Lease / closing documents (current home)", doc_type: "lease", folder: "household" },
  { title: "Lease / purchase agreement (new home)", doc_type: "deed", folder: "moving" },
  { title: "Mover contract & bill of lading", doc_type: "mover_contract", folder: "moving" },
  { title: "Homeowners / renters insurance", doc_type: "insurance", folder: "household" },
  { title: "Vehicle titles & registrations", doc_type: "vehicle", folder: "vehicle" },
  { title: "Tax returns (last 3 years)", doc_type: "tax_return", folder: "financial" },
  { title: "Relocation / employment letter", doc_type: "employment", folder: "new_job" },
];

/** Older rows don't have a folder; infer one from the document type. */
const TYPE_FOLDER: Record<string, string> = {
  id: "household",
  birth_certificate: "household",
  social_security: "household",
  lease: "household",
  deed: "moving",
  mortgage: "financial",
  mover_contract: "moving",
  insurance: "household",
  school: "medical",
  medical: "medical",
  immunization: "medical",
  vet: "pets",
  vehicle: "vehicle",
  financial: "financial",
  employment: "new_job",
  offer_letter: "new_job",
  relocation_agreement: "new_job",
  direct_deposit: "new_job",
  pay_stub: "apartment",
  proof_of_income: "apartment",
  bank_statement: "apartment",
  credit_report: "apartment",
  rental_application: "apartment",
  reference: "apartment",
  tax_return: "financial",
  settlement: "financial",
  retirement: "financial",
  utility_bill: "household",
};
const folderOf = (d: DocumentRow) => (d.folder && d.folder !== "other" ? d.folder : (TYPE_FOLDER[d.doc_type] ?? "other"));

const FOLDER_META: Record<string, { icon: string; tone: string; blurb: string }> = {
  ...Object.fromEntries(FOLDER_TEMPLATES.map((t) => [t.folder, { icon: t.icon, tone: t.tone, blurb: t.blurb }])),
  pets: { icon: "🐾", tone: "bg-blush", blurb: "Vet records, vaccinations and travel certificates." },
  other: { icon: "🗂️", tone: "bg-ink/5", blurb: "Everything else." },
};

function useResolveUrl() {
  const { supabase } = useApp();
  return async (m: MediaRef) => m.uri ?? (m.remotePath && supabase ? await signedMediaUrl(supabase, m.remotePath) : null);
}

function FolderCard({ folder, docs, onOpen }: { folder: string; docs: DocumentRow[]; onOpen: () => void }) {
  const meta = FOLDER_META[folder] ?? FOLDER_META.other!;
  const s = folderStatus(docs);
  const files = docs.reduce((n, d) => n + (d.files ?? []).length, 0);
  return (
    <button onClick={onOpen} className={`tile group relative flex min-h-48 flex-col justify-between overflow-hidden text-left transition hover:-translate-y-0.5 hover:shadow-lg ${meta.tone}`}>
      {/* folder tab */}
      <span className="absolute top-0 left-6 h-2 w-20 rounded-b-lg bg-ink/10" />
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/80 text-2xl shadow-sm">{meta.icon}</span>
        <span className="font-display text-3xl font-extrabold tracking-tight">{s.total ? `${s.pct}%` : "—"}</span>
      </div>
      <div>
        <div className="font-display text-xl font-bold tracking-tight">{optionLabel(DOC_FOLDERS, folder)}</div>
        <div className="mt-0.5 line-clamp-2 text-xs text-ink/65">{s.total ? `${s.ready}/${s.total} ready · ${files} file${files === 1 ? "" : "s"} attached${s.missing ? ` · ${s.missing} missing` : ""}` : meta.blurb}</div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10">
          <div className="h-full rounded-full bg-ink" style={{ width: `${s.pct}%` }} />
        </div>
      </div>
    </button>
  );
}

function DocRow({ d, member, onEdit, onPreview }: { d: DocumentRow; member?: string; onEdit: () => void; onPreview: (m: MediaRef) => void }) {
  const store = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const attach = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      const refs = await Promise.all([...list].map((f) => compressImage(f)));
      store.update("documents", d.id, { files: [...(d.files ?? []), ...refs], status: d.status === "needed" || d.status === "requested" ? "received" : d.status });
    } finally {
      setBusy(false);
    }
  };
  const next = d.status === "needed" ? "requested" : d.status === "requested" ? "received" : d.status === "received" ? "filed" : "needed";
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <button
        title={`Mark ${next}`}
        onClick={() => store.update("documents", d.id, { status: next })}
        className={`grid h-7 w-7 flex-none place-items-center rounded-full border-2 text-xs font-bold ${d.status === "received" || d.status === "filed" ? "border-ink bg-lime" : "border-ink/25"}`}
      >
        {d.status === "received" || d.status === "filed" ? "✓" : ""}
      </button>
      <button className="min-w-0 flex-1 text-left" onClick={onEdit}>
        <div className="truncate font-semibold">{d.title}</div>
        <div className="truncate text-xs text-gray-500">
          {[optionLabel(DOC_TYPES, d.doc_type), member, d.expires_on ? `expires ${formatDate(d.expires_on)}` : null].filter(Boolean).join(" · ")}
        </div>
      </button>
      <div className="flex items-center gap-1.5">
        {(d.files ?? []).slice(0, 4).map((m) => (
          <MediaThumb key={m.id} media={m} className="h-11 w-11" onClick={() => onPreview(m)} />
        ))}
        {(d.files ?? []).length > 4 && <span className="text-xs text-gray-500">+{d.files.length - 4}</span>}
      </div>
      <StatusPill value={d.status} options={STATUS_OPTS} color={STATUS_COLORS[d.status]} />
      <button className="btn-secondary px-3 py-1.5 text-xs" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? "Saving…" : "📎 Attach PDF"}
      </button>
      <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={(e) => void attach(e.target.files).then(() => (e.target.value = ""))} />
    </li>
  );
}

function FolderView({ folder, docs, onBack }: { folder: string; docs: DocumentRow[]; onBack: () => void }) {
  const db = useDb();
  const store = useStore();
  const resolveUrl = useResolveUrl();
  const [editing, setEditing] = useState<DocumentRow | "new" | null>(null);
  const [preview, setPreview] = useState<MediaRef | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const tpl = folderTemplate(folder);
  const meta = FOLDER_META[folder] ?? FOLDER_META.other!;
  const s = folderStatus(docs);
  const memberName = (id: string | null) => db.family_members.find((m) => m.id === id)?.name;
  const missingTpl = tpl ? folderTemplateRows(tpl, db.family_members, db.documents.map((d) => ({ ...d, folder: folderOf(d) }))) : [];
  const sorted = [...docs].sort((a, b) => Number(a.status === "filed" || a.status === "received") - Number(b.status === "filed" || b.status === "received") || a.title.localeCompare(b.title));
  const name = optionLabel(DOC_FOLDERS, folder);

  const compile = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { bytes, included, skipped } = await buildPacketPdf({
        title: name,
        subtitle: `${s.ready}/${s.total} documents ready`,
        household: db.moves[0]?.title,
        docs: sorted.map((d) => ({ title: d.title, type: optionLabel(DOC_TYPES, d.doc_type), member: memberName(d.member_id), status: d.status, expires: d.expires_on, files: d.files ?? [] })),
        resolveUrl,
      });
      download(`${name.replace(/[^\w]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`, new Blob([bytes as BlobPart], { type: "application/pdf" }), "application/pdf");
      setMsg(`Compiled ${included} document${included === 1 ? "" : "s"} into one PDF with a cover checklist.${skipped.length ? ` Skipped: ${skipped.join("; ")}` : ""}`);
    } catch (e) {
      setMsg(`Couldn't build the packet: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className={`tile mb-5 flex flex-wrap items-center gap-4 ${meta.tone}`}>
        <button className="btn-ghost px-2" onClick={onBack} aria-label="Back to files">
          ←
        </button>
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/80 text-3xl shadow-sm">{meta.icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-3xl font-extrabold tracking-tight">{name}</h2>
          <p className="text-sm text-ink/70">{meta.blurb}</p>
        </div>
        <div className="text-right">
          <div className="font-display text-4xl font-extrabold">{s.pct}%</div>
          <div className="text-xs text-ink/60">
            {s.ready}/{s.total} ready
          </div>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => setEditing("new")}>
          + Add document
        </button>
        {missingTpl.length > 0 && (
          <button className="btn-secondary" onClick={() => store.insertMany("documents", missingTpl)}>
            ✨ Add {missingTpl.length} checklist item{missingTpl.length === 1 ? "" : "s"}
          </button>
        )}
        <button className="btn-accent" disabled={busy || !docs.length} onClick={() => void compile()}>
          {busy ? "Compiling…" : "📥 Download file as one PDF"}
        </button>
      </div>
      {msg && <p className="mb-4 rounded-xl bg-sage/70 p-3 text-sm">{msg}</p>}
      <div className="card">
        {docs.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            This file is empty. {tpl ? "Add the checklist to see exactly what you need." : "Add your first document."}
          </div>
        ) : (
          <ul className="divide-y divide-ink/5">
            {sorted.map((d) => (
              <DocRow key={d.id} d={d} member={memberName(d.member_id)} onEdit={() => setEditing(d)} onPreview={setPreview} />
            ))}
          </ul>
        )}
      </div>
      <p className="mt-3 text-xs text-gray-500">Tip: tap the circle to advance status (needed → requested → received → filed). Attaching a PDF marks it received.</p>
      <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? `Add to ${name}` : editing ? editing.title : ""}>
        {editing && (
          <EntityForm
            key={editing === "new" ? "new" : editing.id}
            table="documents"
            row={editing === "new" ? null : editing}
            initial={editing === "new" ? { folder } : undefined}
            onDone={() => setEditing(null)}
          />
        )}
      </Drawer>
      <MediaLightbox media={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function FilesView({ view, setView }: { view: "files" | "list"; setView: (v: "files" | "list") => void }) {
  const db = useDb();
  const store = useStore();
  const [open, setOpen] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("folder")));
  const byFolder = new Map<string, DocumentRow[]>();
  for (const d of db.documents) {
    const f = folderOf(d);
    byFolder.set(f, [...(byFolder.get(f) ?? []), d]);
  }
  const folders = [...FOLDER_TEMPLATES.map((t) => t.folder), ...["pets", "other"].filter((f) => byFolder.has(f))];
  const all = folderStatus(db.documents);
  const expiring = db.documents.filter((d) => d.expires_on && d.expires_on >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.expires_on!.localeCompare(b.expires_on!)).slice(0, 4);
  const createFile = (folder: string) => {
    const tpl = folderTemplate(folder);
    if (tpl) store.insertMany("documents", folderTemplateRows(tpl, db.family_members, db.documents.map((d) => ({ ...d, folder: folderOf(d) }))));
    setOpen(folder);
  };

  return (
    <div>
      <PageHeader
        title="Paperwork & files"
        icon="📄"
        subtitle="Build ready-to-send files — your apartment application, new-job onboarding, household vital records — attach PDFs and download each file as one packet."
        actions={<Segmented value={view} onChange={setView} options={[{ value: "files", label: "Files" }, { value: "list", label: "All documents" }]} />}
      />
      {open ? (
        <FolderView folder={open} docs={byFolder.get(open) ?? []} onBack={() => setOpen(null)} />
      ) : (
        <>
          <div className="mb-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="card-ink flex flex-wrap items-center gap-6 p-6">
              <div>
                <div className="eyebrow text-white/50">All paperwork</div>
                <div className="font-display mt-2 text-6xl leading-none font-extrabold tracking-[-0.05em] text-lime">{all.pct}%</div>
                <div className="mt-1 text-sm text-white/60">
                  {all.ready} of {all.total} documents in hand · {all.withFiles} with scans/PDFs
                </div>
              </div>
              <div className="min-w-48 flex-1 space-y-2 text-sm text-white/80">
                <div>📎 Attach PDFs or snap photos of each document.</div>
                <div>🗂️ Every document lives in a file (folder).</div>
                <div>📥 Download any file as a single PDF to email a leasing office or HR.</div>
              </div>
            </div>
            <div className="card">
              <div className="eyebrow">Expiring soon</div>
              {expiring.length ? (
                <ul className="mt-2 space-y-1.5 text-sm">
                  {expiring.map((d) => (
                    <li key={d.id} className="flex justify-between gap-2">
                      <span className="truncate">{d.title}</span>
                      <span className="flex-none text-gray-500">{formatDate(d.expires_on)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-gray-500">No upcoming expirations. Add expiry dates to IDs, leases and insurance to be reminded.</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {folders.map((f) => {
              const docs = byFolder.get(f) ?? [];
              return docs.length ? (
                <FolderCard key={f} folder={f} docs={docs} onOpen={() => setOpen(f)} />
              ) : (
                <div key={f} className="dot-grid flex min-h-48 flex-col justify-between rounded-[1.75rem] border border-dashed border-ink/20 p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-2xl shadow-sm">{FOLDER_META[f]?.icon}</span>
                    <div className="font-display text-lg font-bold tracking-tight">{optionLabel(DOC_FOLDERS, f)}</div>
                  </div>
                  <p className="text-xs text-gray-500">{FOLDER_META[f]?.blurb}</p>
                  <button className="btn-primary self-start" onClick={() => createFile(f)}>
                    + Create {optionLabel(DOC_FOLDERS, f).toLowerCase()}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function DocumentsPage() {
  const db = useDb();
  const store = useStore();
  const [view, setView] = useState<"files" | "list">("files");
  if (view === "files") return <FilesView view={view} setView={setView} />;
  const addSuggested = () => {
    const existing = new Set(db.documents.map((d) => `${d.title}|${d.member_id ?? ""}`));
    const rows = SUGGESTED.flatMap((s) =>
      s.perMember && db.family_members.length
        ? db.family_members.map((m) => ({ title: s.title, doc_type: s.doc_type, folder: s.folder, member_id: m.id as string | null }))
        : [{ title: s.title, doc_type: s.doc_type, folder: s.folder, member_id: null as string | null }],
    ).filter((r) => !existing.has(`${r.title}|${r.member_id ?? ""}`));
    if (rows.length) store.insertMany("documents", rows);
  };
  return (
    <CrudPage
      table="documents"
      title="Paperwork & files"
      subtitle="Every document in one list. Hand-carry originals — never pack them on the truck."
      columns={["member_id", "expires_on"]}
      filters={["folder", "status", "doc_type", "member_id"]}
      groupBy="folder"
      sort={(a, b) => (a.doc_type + a.title).localeCompare(b.doc_type + b.title)}
      renderBadge={(d) => (
        <span className="flex items-center gap-2">
          {(d.files ?? []).length > 0 && <span className="text-xs text-gray-400">📎{d.files.length}</span>}
          <StatusPill value={d.status} options={STATUS_OPTS} color={STATUS_COLORS[d.status]} />
        </span>
      )}
      actions={
        <>
          <Segmented value={view} onChange={setView} options={[{ value: "files", label: "Files" }, { value: "list", label: "All documents" }]} />
          <button className="btn-secondary" onClick={addSuggested}>
            ✨ Add essential documents
          </button>
        </>
      }
      emptyText={`Track ${DOC_TYPES.length} kinds of paperwork. Tap “Add essential documents” for a starter list for every family member.`}
    />
  );
}
