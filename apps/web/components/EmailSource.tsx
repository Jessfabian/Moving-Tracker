"use client";

import { emailSearch, formatDate, readEmailRefs, type EmailRef } from "@moving/shared";
import { useState, useSyncExternalStore } from "react";
import { getAccounts, getServerAccounts, subscribeAccounts } from "@/lib/inbox";

function gmailLink(r: EmailRef, isGoogle: boolean): string | null {
  if (!r.inbox || !(isGoogle || /@(gmail|googlemail)\.com$/i.test(r.inbox))) return null;
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(r.inbox)}#search/${encodeURIComponent(emailSearch(r))}`;
}

/** Notes without the saved "found in email" block, for display. */
export const notesText = (notes: string | null | undefined) => readEmailRefs(notes).rest;

/**
 * Shows which email(s) a subscription or bill was found in — sender, subject, date and inbox —
 * with a way to jump to it (Gmail) or copy a search for any mail app.
 */
export function EmailSource({ notes }: { notes: string | null | undefined }) {
  const { refs } = readEmailRefs(notes);
  const accounts = useSyncExternalStore(subscribeAccounts, getAccounts, getServerAccounts);
  const [copied, setCopied] = useState<number | null>(null);
  if (!refs.length) return null;
  return (
    <section className="rounded-2xl border border-gray-200 p-4" aria-label="Found in email">
      <h3 className="text-sm font-semibold">📧 Found in {refs.length === 1 ? "this email" : "these emails"}</h3>
      <ul className="mt-2 divide-y divide-gray-100">
        {refs.map((r, i) => {
          const isGoogle = accounts.some((a) => a.email === r.inbox && (a.provider === "google" || a.provider === "gmail"));
          const link = gmailLink(r, isGoogle);
          return (
            <li key={`${r.subject}${r.date}${i}`} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-semibold">{r.from || r.address || "Unknown sender"}</span>
                {r.date && <span className="flex-none text-xs text-gray-500">{formatDate(r.date)}</span>}
              </div>
              {r.subject && <div className="mt-0.5 text-sm break-words text-gray-700">“{r.subject}”</div>}
              <div className="mt-0.5 text-xs break-all text-gray-500">
                {[r.from && r.address ? r.address : "", r.inbox ? `in ${r.inbox}` : ""].filter(Boolean).join(" · ")}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {link && (
                  <a className="btn-secondary min-h-10 px-3 text-xs" href={link} target="_blank" rel="noreferrer">
                    Open in Gmail ↗
                  </a>
                )}
                <button
                  type="button"
                  className="btn-secondary min-h-10 px-3 text-xs"
                  onClick={() => {
                    void navigator.clipboard?.writeText(r.subject || r.address || r.from);
                    setCopied(i);
                    setTimeout(() => setCopied(null), 2000);
                  }}
                >
                  {copied === i ? "Copied ✓" : r.subject ? "Copy subject" : "Copy sender"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-gray-500">Paste it into your mail app&apos;s search to find the email.</p>
    </section>
  );
}
