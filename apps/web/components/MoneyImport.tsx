"use client";

import {
  BILL_CATEGORIES,
  SUB_CATEGORIES,
  emlToText,
  formatDate,
  formatMoney,
  matchExisting,
  optionLabel,
  parseEmails,
  parseStatement,
  subscriptionCost,
  today,
  type FoundBill,
  type FoundSubscription,
  type ParseResult,
} from "@moving/shared";
import { useState } from "react";
import { applyFound } from "@/lib/inbox";
import { useDb, useStore } from "@/lib/store-context";
import { Drawer, Segmented } from "./ui";
import { PickAll, SelectCircle } from "./Selection";

type Mode = "email" | "statement";

/** Reads a PDF in the browser and rebuilds its text line by line (bank statements are tables). */
async function pdfText(file: File): Promise<string> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const out: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of content.items as { str?: string; transform?: number[] }[]) {
      if (!it.str?.trim() || !it.transform) continue;
      const y = Math.round(it.transform[5]! / 3);
      rows.set(y, [...(rows.get(y) ?? []), { x: it.transform[4]!, s: it.str }]);
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a))
      out.push(
        rows
          .get(y)!
          .sort((a, b) => a.x - b.x)
          .map((c) => c.s.trim())
          .join("  "),
      );
  }
  return out.join("\n");
}

async function readFile(file: File): Promise<string> {
  if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") return pdfText(file);
  const raw = await file.text();
  return /\.eml$/i.test(file.name) || /^(received|return-path|mime-version|from):/im.test(raw.slice(0, 2000)) ? emlToText(raw) : raw;
}

const EMAIL_HELP = [
  "Easiest: close this and tap “Connect my email” under “My email” — the app then reads your inbox on its own.",
  "Or search your inbox for words like receipt, subscription, renewal, “your plan” or “amount due”.",
  "Open an email, select all the text and copy it. Paste below — you can paste many emails one after another.",
  "Or save the emails as .eml files (on a computer: drag them out of the mail app) and upload them.",
];

const STATEMENT_HELP = [
  "Download your last 2–3 monthly statements from your bank's website as PDF (or CSV).",
  "Upload them together — recurring charges are found by matching the same merchant month to month.",
  "Everything is read on this phone; the statement is not uploaded anywhere.",
];

export function MoneyImport({ open, onClose, focus = "subscriptions" }: { open: boolean; onClose: () => void; focus?: "subscriptions" | "bills" }) {
  const db = useDb();
  const store = useStore();
  const [mode, setMode] = useState<Mode>("statement");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [found, setFound] = useState<ParseResult | null>(null);
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState("");

  const reset = () => {
    setText("");
    setFiles([]);
    setFound(null);
    setPick({});
    setError("");
    setDone("");
  };
  const close = () => {
    reset();
    onClose();
  };

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const parts = [text];
      for (const f of files) parts.push(await readFile(f));
      const all = parts.filter((p) => p.trim()).join(mode === "email" ? "\n\n=====\n\n" : "\n");
      if (!all.trim()) {
        setError(mode === "email" ? "Paste an email or choose .eml files first." : "Choose a statement PDF/CSV or paste its text first.");
        return;
      }
      const t = today();
      const res = matchExisting(mode === "email" ? parseEmails(all, t) : parseStatement(all, t), db.subscriptions ?? [], db.bills);
      setFound(res);
      const p: Record<string, boolean> = {};
      for (const s of res.subscriptions) p[`s:${s.key}`] = true;
      for (const b of res.bills) p[`b:${b.key}`] = true;
      setPick(p);
      if (!res.subscriptions.length && !res.bills.length)
        setError(mode === "email" ? "No subscriptions or bills found in that text. Make sure the email body (with the price) is included." : "No repeating charges found. Statements from 2–3 months in a row work best.");
    } catch (e) {
      setError(`Couldn't read that file: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!found) return;
    const c = applyFound(found, db, store, mode === "email" ? "email" : "statement", { pick: (k, key) => !!pick[`${k}:${key}`] });
    setDone(`${c.added} added${c.updated ? `, ${c.updated} updated` : ""}.`);
    setFound(null);
    setText("");
    setFiles([]);
  };

  const subs = found?.subscriptions ?? [];
  const bills = found?.bills ?? [];
  const sure = subs.filter((s) => s.confidence === "sure");
  const unsure = subs.filter((s) => s.confidence === "unsure");
  const doubles = subs.filter((s) => s.doubleCharged);
  const chosen = Object.values(pick).filter(Boolean).length;
  const allKeys = [...subs.map((s) => `s:${s.key}`), ...bills.map((b) => `b:${b.key}`)];

  const subRow = (s: FoundSubscription) => {
    const c = subscriptionCost(s);
    return (
      <label key={s.key} className="flex items-start gap-3 rounded-2xl border border-gray-200/80 bg-white p-3">
        <input type="checkbox" className="sr-only" checked={!!pick[`s:${s.key}`]} onChange={(e) => setPick({ ...pick, [`s:${s.key}`]: e.target.checked })} />
        <SelectCircle on={!!pick[`s:${s.key}`]} className="mt-0.5" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <b className="truncate">{s.name}</b>
            {s.existingId && <span className="chip bg-sky text-ink">already saved · will update</span>}
            {s.status === "free_trial" && <span className="chip bg-lilac text-ink">free trial</span>}
            {s.doubleCharged && <span className="chip bg-red-100 text-red-700">charged twice</span>}
          </span>
          <span className="mt-0.5 block text-xs text-gray-500">
            {optionLabel(SUB_CATEGORIES, s.category)}
            {s.next_due ? ` · next ${formatDate(s.next_due, { month: "short", day: "numeric" })}` : ""}
            {s.pay_method ? ` · ${s.pay_method}` : ""}
          </span>
          {s.reason && <span className="mt-1 block text-xs text-gray-400">{s.reason}</span>}
        </span>
        <span className="text-right">
          <b className="block font-display">{s.amount != null ? formatMoney(s.amount) : "—"}</b>
          <span className="text-[11px] whitespace-nowrap text-gray-400">{s.amount != null ? `${formatMoney(c.yearly)}/yr` : ""}</span>
        </span>
      </label>
    );
  };

  const billRow = (b: FoundBill) => (
    <label key={b.key} className="flex items-start gap-3 rounded-2xl border border-gray-200/80 bg-white p-3">
      <input type="checkbox" className="sr-only" checked={!!pick[`b:${b.key}`]} onChange={(e) => setPick({ ...pick, [`b:${b.key}`]: e.target.checked })} />
      <SelectCircle on={!!pick[`b:${b.key}`]} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <b className="truncate">{b.name}</b>
          {b.existingId && <span className="chip bg-sky text-ink">already saved · will update</span>}
          {b.autopay && <span className="chip">autopay</span>}
        </span>
        <span className="mt-0.5 block text-xs text-gray-500">
          {optionLabel(BILL_CATEGORIES, b.category)}
          {b.next_due ? ` · due ${formatDate(b.next_due, { month: "short", day: "numeric" })}` : b.due_day ? ` · due the ${b.due_day}` : ""}
          {b.account ? ` · ${b.account}` : ""}
        </span>
      </span>
      <b className="font-display">{b.amount != null ? formatMoney(b.amount) : "—"}</b>
    </label>
  );

  const billSection = bills.length > 0 && (
    <section>
      <h3 className="mb-2 font-display text-lg font-bold">Bills · {bills.length}</h3>
      <div className="space-y-2">{bills.map(billRow)}</div>
    </section>
  );

  return (
    <Drawer open={open} onClose={close} title={focus === "bills" ? "Import bills" : "Find subscriptions"}>
      <div className="space-y-5">
        {done && (
          <div className="animate-fade rounded-2xl bg-lime p-4 text-sm font-semibold">
            ✓ Saved — {done}
            <button type="button" className="ml-2 underline" onClick={() => setDone("")}>
              Import more
            </button>
          </div>
        )}
        {!found && !done && (
          <>
            <Segmented<Mode>
              value={mode}
              onChange={(m) => {
                setMode(m);
                setFiles([]);
                setError("");
              }}
              options={[
                { value: "statement", label: "🏦 Bank statement" },
                { value: "email", label: "✉️ Emails" },
              ]}
            />
            <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-600">
              {(mode === "email" ? EMAIL_HELP : STATEMENT_HELP).map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ol>
            <label className="block">
              <span className="btn-secondary w-full cursor-pointer">{mode === "email" ? "📎 Choose .eml / .txt files" : "📄 Choose statement PDF / CSV"}</span>
              <input
                type="file"
                multiple
                className="sr-only"
                accept={mode === "email" ? ".eml,.txt,.html,.htm,message/rfc822,text/plain,text/html" : ".pdf,.csv,.txt,application/pdf,text/csv"}
                onChange={(e) => setFiles([...(e.target.files ?? [])])}
              />
            </label>
            {files.length > 0 && (
              <ul className="space-y-1 text-sm">
                {files.map((f) => (
                  <li key={f.name} className="flex items-center gap-2 truncate rounded-xl bg-ink/5 px-3 py-2">
                    {/\.pdf$/i.test(f.name) ? "📄" : "✉️"} <span className="truncate">{f.name}</span>
                  </li>
                ))}
              </ul>
            )}
            <label className="block">
              <span className="label">{mode === "email" ? "…or paste emails here" : "…or paste statement lines here"}</span>
              <textarea
                className="input min-h-40 font-mono text-xs"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={mode === "email" ? "From: Netflix <info@account.netflix.com>\nSubject: Your Netflix membership…\n\nYour plan: Standard  $15.49/month\nNext billing date: November 14" : "10/03  NETFLIX.COM  LOS GATOS CA   15.49\n10/05  SPOTIFY USA   11.99\n…"}
              />
            </label>
            {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button type="button" className="btn-primary w-full" disabled={busy} onClick={run}>
              {busy ? "Reading…" : focus === "bills" ? "Find bills & subscriptions" : "Find subscriptions"}
            </button>
          </>
        )}
        {found && (
          <>
            <p className="text-sm text-gray-600">
              Read {found.scanned} {mode === "email" ? "email" : "line"}
              {found.scanned === 1 ? "" : "s"}. Untick anything you don&apos;t want to save.
            </p>
            <PickAll count={chosen} total={allKeys.length} noun="result" onAll={() => setPick(Object.fromEntries(allKeys.map((k) => [k, true])))} onClear={() => setPick({})} />
            {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {doubles.length > 0 && (
              <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-800">
                ⚠️ <b>Possible double charge:</b> {doubles.map((d) => d.name).join(", ")} billed more than once in the same period.
              </div>
            )}
            {focus === "bills" && billSection}
            {sure.length > 0 && (
              <section>
                <h3 className="mb-2 font-display text-lg font-bold">Subscriptions · {sure.length}</h3>
                <div className="space-y-2">{sure.map(subRow)}</div>
              </section>
            )}
            {unsure.length > 0 && (
              <section>
                <h3 className="font-display text-lg font-bold">Not sure · {unsure.length}</h3>
                <p className="mb-2 text-xs text-gray-500">These repeat but aren&apos;t a service we recognize. They&apos;ll be saved as “please confirm” so you can say yes or no.</p>
                <div className="space-y-2">{unsure.map(subRow)}</div>
              </section>
            )}
            {focus !== "bills" && billSection}
            <div className="sheet-footer sticky bottom-0 -mx-5 flex gap-2 border-t border-gray-200 bg-paper px-5 py-3">
              <button type="button" className="btn-secondary" onClick={() => setFound(null)}>
                Back
              </button>
              <button type="button" className="btn-primary flex-1" disabled={!chosen} onClick={save}>
                Save {chosen} selected
              </button>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
