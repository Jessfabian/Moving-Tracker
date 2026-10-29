"use client";

import { buildReport, EXPORTABLE, makeLookup, REPORTS, SCHEMAS, tableToCsv, today, type Snapshot } from "@moving/shared";
import { useRef, useState } from "react";
import { askConfirm } from "@/components/ConfirmSheet";
import { Card } from "@/components/Swipe";
import { PageHeader } from "@/components/ui";
import { download, printHtml } from "@/lib/media";
import { useDb, useStore } from "@/lib/store-context";

export default function ReportsPage() {
  const db = useDb();
  const store = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const importBackup = async (f: File | undefined) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text()) as Partial<Snapshot> & { app?: string };
      if (!data.moves && !data.tasks) throw new Error("This doesn't look like a Moving Tracker backup.");
      if (!(await askConfirm({ title: "Import this backup?", message: "It is merged into your current data. Records that match are replaced with the backup copy.", confirm: "Import backup" }))) return;
      store.importSnapshot(data);
      setMsg("✅ Backup imported.");
    } catch (e) {
      setMsg(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Reports & export" icon="🖨️" subtitle="Print or save as PDF (choose “Save as PDF” in the print dialog), export spreadsheets, or back up everything." />
      {msg && <p className="rounded-lg bg-gray-100 p-2 text-sm">{msg}</p>}
      <Card id="reports.printable" title="Printable reports (PDF)" tone="plain" bodyClassName="mt-2">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {REPORTS.map((r) => (
            <button key={r.kind} className="card text-left transition hover:shadow-md" onClick={() => void buildReport(r.kind, db).then(printHtml)}>
              <div className="font-bold">{r.label}</div>
              <div className="mt-1 text-sm text-gray-500">{r.description}</div>
            </button>
          ))}
        </div>
      </Card>
      <Card id="reports.spreadsheets" title="Spreadsheets (CSV)" tone="plain" bodyClassName="mt-2">
        <div className="flex flex-wrap gap-2">
          {EXPORTABLE.map((t) => (
            <button key={t} className="btn-secondary" onClick={() => download(`${t}-${today()}.csv`, tableToCsv(t, db[t] as never, makeLookup(db)), "text/csv")}>
              {SCHEMAS[t].icon} {SCHEMAS[t].plural} ({db[t].length})
            </button>
          ))}
        </div>
      </Card>
      <Card id="reports.backup" title="Backup" bodyClassName="mt-3 space-y-3">
        <p className="text-sm text-gray-500">Download a complete copy of your move (photos included) or restore from a previous backup file.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => download(`moving-tracker-backup-${today()}.json`, JSON.stringify({ app: "moving-tracker", version: 1, ...store.exportSnapshot() }), "application/json")}>
            ⬇️ Download backup
          </button>
          <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
            ⬆️ Restore backup
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void importBackup(e.target.files?.[0]).then(() => (e.target.value = ""))} />
        </div>
      </Card>
    </div>
  );
}
