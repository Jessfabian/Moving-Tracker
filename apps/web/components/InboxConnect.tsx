"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  IMAP_PRESETS,
  NeedsSignIn,
  PENDING_SCAN_KEY,
  PROVIDER_LABEL,
  accountId,
  canCheckSilently,
  checkInbox,
  clientId,
  dueForAutoCheck,
  getAccounts,
  getAutoCheck,
  getServerAccounts,
  getServerAutoCheck,
  oauthRedirect,
  removeAccount,
  setAutoCheck,
  setClientId,
  startOAuth,
  subscribeAccounts,
  upsertAccount,
  type InboxAccount,
  type InboxProvider,
} from "@/lib/inbox";
import { useApp, useStore } from "@/lib/store-context";
import { Card } from "./Swipe";
import { Drawer, Toggle } from "./ui";

function useAccounts() {
  return useSyncExternalStore(subscribeAccounts, getAccounts, getServerAccounts);
}

function ago(iso?: string): string {
  if (!iso) return "not checked yet";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "checked just now";
  if (m < 60) return `checked ${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `checked ${h} hr ago`;
  const d = Math.round(h / 24);
  return `checked ${d} day${d === 1 ? "" : "s"} ago`;
}

const CHOICES: { provider: InboxProvider; label: string; icon: string }[] = [
  { provider: "gmail", label: "Gmail", icon: "✉️" },
  { provider: "icloud", label: "iCloud", icon: "☁️" },
  { provider: "microsoft", label: "Outlook / Hotmail", icon: "📨" },
  { provider: "yahoo", label: "Yahoo", icon: "💌" },
  { provider: "aol", label: "AOL", icon: "📧" },
  { provider: "imap", label: "Other", icon: "🌐" },
];

/** Connect email accounts so subscriptions and bills are found automatically. */
export function InboxConnect({ id = "inbox" }: { id?: string }) {
  const store = useStore();
  const accounts = useAccounts();
  const auto = useSyncExternalStore(subscribeAccounts, getAutoCheck, getServerAutoCheck);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, { text: string; error?: boolean }>>({});
  const [retry, setRetry] = useState<InboxAccount | null>(null);

  const check = async (a: InboxAccount) => {
    setBusy(a.id);
    setMsg((m) => ({ ...m, [a.id]: { text: "Reading receipts, bills and cancellations…" } }));
    try {
      const r = await checkInbox(a, store);
      setMsg((m) => ({ ...m, [a.id]: { text: r.text } }));
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      setMsg((m) => ({ ...m, [a.id]: { text, error: true } }));
      if (e instanceof NeedsSignIn) {
        if (a.provider === "google" || a.provider === "microsoft") void startOAuth(a.provider, a.email).catch(() => {});
        else setRetry(a);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card id={id} title="My email" icon="📬" summary={accounts.length ? `${accounts.length} connected` : undefined}>
      {accounts.length === 0 ? (
        <p className="text-sm text-gray-600">Connect your email and the app reads your receipts and bills for you — Netflix, Hulu, phone, power, anything that renews. It checks again on its own about twice a day.</p>
      ) : (
        <ul className="divide-y divide-ink/[0.06]">
          {accounts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{a.email}</p>
                <p className={`text-[13px] ${msg[a.id]?.error ? "text-red-600" : "text-gray-500"}`} role="status" aria-live="polite">
                  {PROVIDER_LABEL[a.provider]} · {msg[a.id]?.text ?? `${ago(a.lastScan)}${a.lastResult ? ` · ${a.lastResult}` : ""}`}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary min-h-11 whitespace-nowrap" disabled={!!busy} onClick={() => check(a)}>
                  {busy === a.id ? <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" aria-label="Checking" /> : "Check now"}
                </button>
                <button type="button" className="btn-ghost min-h-11 whitespace-nowrap text-red-600" onClick={() => removeAccount(a.id)} aria-label={`Disconnect ${a.email}`}>
                  Disconnect
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-col gap-2">
        <button type="button" className="btn-primary w-full" onClick={() => setAdding(true)}>
          {accounts.length ? "Connect another email" : "Connect my email"}
        </button>
        {accounts.length > 0 && <Toggle checked={auto} onChange={setAutoCheck} label="Check automatically" description="When you open the app, if it's been 12 hours since the last check." />}
        <p className="text-xs text-gray-500">It looks through every folder, including Sent, for receipts, renewals, bills and cancellations from the last 12 months — so it can tell what you&apos;ve cancelled and what&apos;s still charging you. Nothing is sent or deleted, and your password stays on this phone.</p>
      </div>
      <ConnectSheet
        open={adding || !!retry}
        retry={retry}
        onClose={() => {
          setAdding(false);
          setRetry(null);
        }}
        onConnected={(a) => {
          setAdding(false);
          setRetry(null);
          void check(a);
        }}
      />
    </Card>
  );
}

function ConnectSheet({ open, retry, onClose, onConnected }: { open: boolean; retry: InboxAccount | null; onClose: () => void; onConnected: (a: InboxAccount) => void }) {
  const [provider, setProvider] = useState<InboxProvider | null>(null);
  const shown = retry?.provider ?? provider;
  const close = () => {
    setProvider(null);
    onClose();
  };
  return (
    <Drawer open={open} onClose={close} title={shown ? `Connect ${PROVIDER_LABEL[shown]}` : "Connect your email"}>
      {!shown ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Which email do your receipts and bills go to? You can connect more than one.</p>
          <div className="grid grid-cols-2 gap-2">
            {CHOICES.map((c) => (
              <button key={c.provider} type="button" onClick={() => setProvider(c.provider)} className="flex min-h-14 items-center gap-2 rounded-2xl border border-ink/10 bg-card px-3 text-left text-[15px] font-semibold active:bg-ink/5">
                <span aria-hidden>{c.icon}</span>
                {c.label}
              </button>
            ))}
          </div>
          <p className="rounded-2xl bg-ink/[0.04] p-3 text-xs text-gray-600">
            Apple doesn&apos;t let websites read the iPhone Mail app directly, so you connect the email account itself — the same one the Mail app uses.
          </p>
        </div>
      ) : shown === "microsoft" ? (
        <OAuthSetup kind="microsoft" onBack={retry ? undefined : () => setProvider(null)} />
      ) : (
        <ImapForm key={shown} provider={shown} retry={retry} onBack={retry ? undefined : () => setProvider(null)} onConnected={onConnected} />
      )}
    </Drawer>
  );
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{i + 1}</span>
          <span className="pt-0.5">{s}</span>
        </li>
      ))}
    </ol>
  );
}

function ImapForm({ provider, retry, onBack, onConnected }: { provider: InboxProvider; retry: InboxAccount | null; onBack?: () => void; onConnected: (a: InboxAccount) => void }) {
  const preset = IMAP_PRESETS.find((p) => p.provider === provider) ?? IMAP_PRESETS[IMAP_PRESETS.length - 1]!;
  const [email, setEmail] = useState(retry?.email ?? "");
  const [pass, setPass] = useState("");
  const [host, setHost] = useState(retry?.host ?? preset.host);
  const [port, setPort] = useState(retry?.port ?? preset.port);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [google, setGoogle] = useState(false);

  const connect = async () => {
    setError("");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter your full email address.");
    if (!pass.trim()) return setError("Paste the app password.");
    if (!host.trim()) return setError("Enter the mail server (IMAP) name.");
    setBusy(true);
    try {
      // Quick sign-in check with a short look-back so mistakes show up right away.
      const res = await fetch("/api/inbox/imap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: host.trim(), port, user: email.trim(), pass, months: 1 }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error || "Couldn't sign in to that inbox.");
        return;
      }
      const a: InboxAccount = { id: accountId(provider, email), provider, email: email.trim(), host: host.trim(), port, ...(remember ? { pass: pass.replace(/\s+/g, "") } : {}) };
      upsertAccount(a, remember ? undefined : pass.replace(/\s+/g, ""));
      onConnected(a);
    } finally {
      setBusy(false);
    }
  };

  if (google) return <OAuthSetup kind="google" onBack={() => setGoogle(false)} />;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void connect();
      }}
    >
      {retry ? (
        <p className="text-sm text-gray-600">Enter the app password for {retry.email} again to keep checking it.</p>
      ) : (
        <>
          <p className="text-sm text-gray-600">You&apos;ll make an <b>app password</b> — a separate password just for this app. It can only read mail, and you can delete it anytime without changing your real password.</p>
          <Steps steps={preset.steps} />
          {preset.passwordUrl && (
            <a href={preset.passwordUrl} target="_blank" rel="noreferrer" className="btn-secondary flex w-full justify-center">
              Open {preset.label} app passwords ↗
            </a>
          )}
        </>
      )}
      <label className="block">
        <span className="label">Email address</span>
        <input className="input" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" disabled={!!retry} />
      </label>
      <label className="block">
        <span className="label">App password</span>
        <input className="input font-mono" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="xxxx xxxx xxxx xxxx" />
      </label>
      {provider === "imap" && !retry && (
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <label className="block">
            <span className="label">Mail server (IMAP)</span>
            <input className="input" autoCapitalize="none" spellCheck={false} value={host} onChange={(e) => setHost(e.target.value)} placeholder="imap.example.com" />
          </label>
          <label className="block">
            <span className="label">Port</span>
            <select className="input" value={port} onChange={(e) => setPort(Number(e.target.value))}>
              <option value={993}>993</option>
              <option value={143}>143</option>
            </select>
          </label>
        </div>
      )}
      <Toggle checked={remember} onChange={setRemember} label="Remember on this phone" description="Needed for automatic checks. Turn off to type it each time you open the app." />
      {error && (
        <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        {onBack && (
          <button type="button" className="btn-secondary" onClick={onBack}>
            Back
          </button>
        )}
        <button type="submit" className="btn-primary flex-1" disabled={busy}>
          {busy ? "Connecting…" : "Connect & check"}
        </button>
      </div>
      {provider === "gmail" && !retry && (
        <button type="button" className="w-full text-center text-sm text-accent underline" onClick={() => setGoogle(true)}>
          Or sign in with Google instead
        </button>
      )}
    </form>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-ink/[0.05] p-2 pl-3">
      <code className="min-w-0 flex-1 truncate text-xs">{value}</code>
      <button
        type="button"
        className="btn-secondary min-h-9 px-3 text-xs"
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}

const OAUTH_HELP: Record<"google" | "microsoft", { name: string; consoleUrl: string; steps: (redirect: string) => string[]; note: string }> = {
  google: {
    name: "Google",
    consoleUrl: "https://console.cloud.google.com/apis/credentials",
    note: "Google only keeps sign-in access for an hour, so with this option you'll tap “Check now” yourself. The app password option above checks on its own.",
    steps: () => [
      "Open Google Cloud Console below, create a project, and turn on the “Gmail API”.",
      "Under OAuth consent screen choose External, then add your Gmail address as a test user.",
      "Create credentials → OAuth client ID → Web application.",
      "Add the address below as an Authorized redirect URI, then Create.",
      "Copy the Client ID and paste it here.",
    ],
  },
  microsoft: {
    name: "Microsoft",
    consoleUrl: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
    note: "Outlook.com and Hotmail no longer allow app passwords, so Microsoft sign-in is the way to connect. Microsoft asks you to sign in again about once a day.",
    steps: () => [
      "Open Microsoft Entra below (sign in with your Outlook/Hotmail account) → App registrations → New registration.",
      "Name it “Moving Tracker”. For who can use it, pick “Personal Microsoft accounts” (or any account + personal).",
      "Under Redirect URI choose “Single-page application (SPA)” and paste the address below. Register.",
      "Under API permissions add Microsoft Graph → Delegated → Mail.Read.",
      "Copy the Application (client) ID from Overview and paste it here.",
    ],
  },
};

function OAuthSetup({ kind, onBack }: { kind: "google" | "microsoft"; onBack?: () => void }) {
  const [id, setId] = useState(() => clientId(kind));
  const [error, setError] = useState("");
  const redirect = typeof window === "undefined" ? "" : oauthRedirect();
  const [ready] = useState(() => !!clientId(kind));
  const help = OAUTH_HELP[kind];

  const go = async () => {
    setError("");
    if (!id.trim()) return setError("Paste the client ID first.");
    setClientId(kind, id);
    try {
      await startOAuth(kind);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">{help.note}</p>
      <details className="rounded-2xl border border-ink/10 p-3" open={!ready}>
        <summary className="cursor-pointer text-sm font-semibold">{ready ? "Setup steps" : "One-time setup (about 5 minutes)"}</summary>
        <div className="mt-3 space-y-3">
          <Steps steps={help.steps(redirect)} />
          <a href={help.consoleUrl} target="_blank" rel="noreferrer" className="btn-secondary flex w-full justify-center">
            Open {help.name} setup ↗
          </a>
          <span className="label">Redirect address</span>
          <CopyField value={redirect} />
        </div>
      </details>
      <label className="block">
        <span className="label">Client ID</span>
        <input className="input font-mono text-xs" autoCapitalize="none" spellCheck={false} value={id} onChange={(e) => setId(e.target.value)} placeholder={kind === "google" ? "1234…apps.googleusercontent.com" : "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"} />
      </label>
      {error && (
        <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        {onBack && (
          <button type="button" className="btn-secondary" onClick={onBack}>
            Back
          </button>
        )}
        <button type="button" className="btn-primary flex-1" onClick={() => void go()}>
          Sign in with {help.name}
        </button>
      </div>
    </div>
  );
}

/** Mounted once in the app shell: re-checks connected inboxes in the background and reports what it found. */
export function InboxAutoCheck() {
  const { store } = useApp();
  const [note, setNote] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    let running = false;
    const run = async (first: boolean) => {
      const pending = localStorage.getItem(PENDING_SCAN_KEY);
      if (running || (!first && !pending)) return;
      running = true;
      localStorage.removeItem(PENDING_SCAN_KEY);
      const list = getAccounts().filter((a) => a.id === pending || (first && getAutoCheck() && dueForAutoCheck(a) && canCheckSilently(a)));
      let added = 0;
      let confirm = 0;
      let updated = 0;
      const needs: string[] = [];
      for (const a of list) {
        try {
          const r = await checkInbox(a, store);
          added += r.counts.added;
          confirm += r.counts.toConfirm;
          updated += r.counts.updated;
        } catch (e) {
          if (e instanceof NeedsSignIn) needs.push(a.email);
        }
      }
      running = false;
      if (cancelled) return;
      if (added || confirm) setNote({ text: `📬 Found ${added} new in your email${confirm ? ` · ${confirm} to confirm` : ""}`, tone: "ok" });
      else if (list.some((a) => a.id === pending)) setNote({ text: `📬 Email connected · ${updated ? `${updated} updated` : "nothing new yet"}`, tone: "ok" });
      else if (needs.length) setNote({ text: `Sign in again to keep checking ${needs[0]}`, tone: "warn" });
    };
    // Wait for the first cloud sync so finds are matched against the family's latest list.
    const timer = setTimeout(() => {
      const first = !ran.current;
      ran.current = true;
      void run(first);
    }, 2500);
    const off = subscribeAccounts(() => void run(false));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      off();
    };
  }, [store]);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 7000);
    return () => clearTimeout(t);
  }, [note]);

  if (!note) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[69] flex justify-center px-4" role="status" aria-live="polite">
      <Link href="/subscriptions" onClick={() => setNote(null)} className="animate-fade pointer-events-auto flex max-w-[22rem] items-center gap-3 rounded-2xl bg-ink/95 px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-14px_rgba(13,13,15,0.7)]">
        <span className="min-w-0 flex-1">{note.text}</span>
        <span className={note.tone === "warn" ? "text-amber-300" : "text-lime"}>View</span>
      </Link>
    </div>
  );
}
