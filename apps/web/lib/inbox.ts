"use client";

import { htmlToText, matchExisting, parseEmailList, subscriptionToBill, today, withEmailRefs, type EmailRef, type MovingStore, type ParseResult, type Snapshot, type Subscription } from "@moving/shared";

export type InboxProvider = "gmail" | "icloud" | "yahoo" | "aol" | "imap" | "google" | "microsoft";

export interface InboxAccount {
  id: string;
  provider: InboxProvider;
  email: string;
  host?: string;
  port?: number;
  /** App password — only kept when "remember on this phone" is on. */
  pass?: string;
  /** Google/Microsoft access token and its expiry (ms). */
  token?: string;
  tokenExp?: number;
  /** Microsoft refresh token for silent re-checks. */
  refresh?: string;
  lastScan?: string;
  lastResult?: string;
}

export interface ImapPreset {
  provider: InboxProvider;
  label: string;
  host: string;
  port: number;
  passwordUrl: string;
  steps: string[];
}

export const IMAP_PRESETS: ImapPreset[] = [
  {
    provider: "gmail",
    label: "Gmail",
    host: "imap.gmail.com",
    port: 993,
    passwordUrl: "https://myaccount.google.com/apppasswords",
    steps: [
      "2-Step Verification must be on for your Google account (Google requires it for app passwords).",
      "Open the App passwords page below and sign in.",
      "Type a name like “Moving Tracker” and tap Create.",
      "Copy the 16-letter password Google shows and paste it here.",
    ],
  },
  {
    provider: "icloud",
    label: "iCloud Mail",
    host: "imap.mail.me.com",
    port: 993,
    passwordUrl: "https://account.apple.com/account/manage",
    steps: [
      "Open your Apple Account page below and sign in.",
      "Go to Sign-In and Security → App-Specific Passwords.",
      "Tap Generate, name it “Moving Tracker”, and copy the password.",
      "Use your full @icloud.com (or @me.com) address as the email.",
    ],
  },
  {
    provider: "yahoo",
    label: "Yahoo Mail",
    host: "imap.mail.yahoo.com",
    port: 993,
    passwordUrl: "https://login.yahoo.com/account/security",
    steps: ["Open Yahoo Account Security below and sign in.", "Tap Generate app password (or Manage app passwords).", "Name it “Moving Tracker”, then copy the password and paste it here."],
  },
  {
    provider: "aol",
    label: "AOL Mail",
    host: "imap.aol.com",
    port: 993,
    passwordUrl: "https://login.aol.com/account/security",
    steps: ["Open AOL Account Security below and sign in.", "Tap Generate app password.", "Name it “Moving Tracker”, then copy the password and paste it here."],
  },
  {
    provider: "imap",
    label: "Other email",
    host: "",
    port: 993,
    passwordUrl: "",
    steps: ["Look up your provider's “IMAP server” (for example imap.example.com) — it's usually on their help site.", "If your provider offers app passwords, make one for Moving Tracker and use it here."],
  },
];

export const PROVIDER_LABEL: Record<InboxProvider, string> = {
  gmail: "Gmail",
  icloud: "iCloud Mail",
  yahoo: "Yahoo Mail",
  aol: "AOL Mail",
  imap: "Email",
  google: "Gmail (Google sign-in)",
  microsoft: "Outlook",
};

const ACCOUNTS_KEY = "mt:inbox:accounts";
const CLIENT_IDS_KEY = "mt:inbox:clientIds";
const OAUTH_STATE_KEY = "mt:inbox:oauth";
export const PENDING_SCAN_KEY = "mt:inbox:pendingScan";
export const LOOKBACK_MONTHS = 12;
const AUTO_EVERY_MS = 12 * 60 * 60 * 1000;

/** Passwords the user chose not to remember live only in memory until the tab closes. */
const sessionPasswords = new Map<string, string>();
const listeners = new Set<() => void>();

function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

let cache: InboxAccount[] | null = null;
export function getAccounts(): InboxAccount[] {
  if (!cache) cache = readJson<InboxAccount[]>(ACCOUNTS_KEY, []);
  return cache;
}
const EMPTY: InboxAccount[] = [];
export const getServerAccounts = () => EMPTY;

function saveAccounts(list: InboxAccount[]) {
  cache = list;
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
  listeners.forEach((l) => l());
}

export function subscribeAccounts(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === ACCOUNTS_KEY) {
      cache = null;
      fn();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function upsertAccount(a: InboxAccount, sessionPass?: string) {
  if (sessionPass) sessionPasswords.set(a.id, sessionPass);
  const list = getAccounts().filter((x) => x.id !== a.id);
  saveAccounts([...list, a]);
}

export function patchAccount(id: string, patch: Partial<InboxAccount>) {
  saveAccounts(getAccounts().map((x) => (x.id === id ? { ...x, ...patch } : x)));
}

export function removeAccount(id: string) {
  sessionPasswords.delete(id);
  saveAccounts(getAccounts().filter((x) => x.id !== id));
}

export function accountId(provider: InboxProvider, email: string) {
  return `${provider}:${email.trim().toLowerCase()}`;
}

const AUTO_KEY = "mt:inbox:auto";
export const getAutoCheck = () => typeof localStorage === "undefined" || localStorage.getItem(AUTO_KEY) !== "off";
export const getServerAutoCheck = () => true;
export function setAutoCheck(on: boolean) {
  localStorage.setItem(AUTO_KEY, on ? "on" : "off");
  listeners.forEach((l) => l());
}

/** Whether this account can be checked right now without asking the user for anything. */
export function canCheckSilently(a: InboxAccount): boolean {
  if (a.provider === "google") return !!a.token && (a.tokenExp ?? 0) > Date.now() + 60_000;
  if (a.provider === "microsoft") return !!a.refresh || (!!a.token && (a.tokenExp ?? 0) > Date.now() + 60_000);
  return !!(a.pass || sessionPasswords.has(a.id));
}

export function dueForAutoCheck(a: InboxAccount): boolean {
  return !a.lastScan || Date.now() - Date.parse(a.lastScan) > AUTO_EVERY_MS;
}

// ---------- client IDs for Google / Microsoft sign-in ----------

export function clientId(kind: "google" | "microsoft"): string {
  const env = kind === "google" ? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID : process.env.NEXT_PUBLIC_MS_CLIENT_ID;
  return env || readJson<Record<string, string>>(CLIENT_IDS_KEY, {})[kind] || "";
}

export function setClientId(kind: "google" | "microsoft", id: string) {
  const all = readJson<Record<string, string>>(CLIENT_IDS_KEY, {});
  all[kind] = id.trim();
  localStorage.setItem(CLIENT_IDS_KEY, JSON.stringify(all));
}

export function oauthRedirect(): string {
  return `${window.location.origin}/oauth`;
}

function randomString(bytes = 32): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pkceChallenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

interface OAuthState {
  provider: "google" | "microsoft";
  state: string;
  verifier?: string;
  returnTo: string;
}

export async function startOAuth(provider: "google" | "microsoft", hint?: string) {
  const id = clientId(provider);
  if (!id) throw new Error("Missing client ID");
  const state = randomString(16);
  const returnTo = window.location.pathname;
  if (provider === "google") {
    localStorage.setItem(OAUTH_STATE_KEY, JSON.stringify({ provider, state, returnTo } satisfies OAuthState));
    const p = new URLSearchParams({
      client_id: id,
      redirect_uri: oauthRedirect(),
      response_type: "token",
      scope: "https://www.googleapis.com/auth/gmail.readonly email",
      include_granted_scopes: "true",
      state,
      ...(hint ? { login_hint: hint } : { prompt: "consent select_account" }),
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
    return;
  }
  const verifier = randomString(48);
  localStorage.setItem(OAUTH_STATE_KEY, JSON.stringify({ provider, state, verifier, returnTo } satisfies OAuthState));
  const p = new URLSearchParams({
    client_id: id,
    redirect_uri: oauthRedirect(),
    response_type: "code",
    response_mode: "query",
    scope: "offline_access Mail.Read User.Read",
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
    state,
    ...(hint ? { login_hint: hint } : {}),
  });
  window.location.href = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${p}`;
}

/** Runs on /oauth after Google or Microsoft sends the user back. Returns where to go next. */
export async function finishOAuth(): Promise<string> {
  const saved = readJson<OAuthState | null>(OAUTH_STATE_KEY, null);
  localStorage.removeItem(OAUTH_STATE_KEY);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  const params = hash.get("state") ? hash : query;
  if (!saved || params.get("state") !== saved.state) throw new Error("This sign-in link expired. Please try connecting again.");
  const err = params.get("error_description") || params.get("error");
  if (err) throw new Error(err === "access_denied" ? "Access wasn't allowed, so nothing was connected." : err);

  if (saved.provider === "google") {
    const token = params.get("access_token");
    if (!token) throw new Error("Google didn't send back access.");
    const exp = Date.now() + Number(params.get("expires_in") || 3600) * 1000;
    const prof = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json() as Promise<{ emailAddress?: string }>);
    const email = prof.emailAddress || "Gmail";
    const id = accountId("google", email);
    const prev = getAccounts().find((a) => a.id === id);
    upsertAccount({ ...prev, id, provider: "google", email, token, tokenExp: exp });
    localStorage.setItem(PENDING_SCAN_KEY, id);
    return saved.returnTo;
  }

  const code = params.get("code");
  if (!code || !saved.verifier) throw new Error("Microsoft didn't send back access.");
  const tok = await msToken({ grant_type: "authorization_code", code, redirect_uri: oauthRedirect(), code_verifier: saved.verifier });
  const me = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json() as Promise<{ mail?: string; userPrincipalName?: string }>);
  const email = me.mail || me.userPrincipalName || "Outlook";
  const id = accountId("microsoft", email);
  const prev = getAccounts().find((a) => a.id === id);
  upsertAccount({ ...prev, id, provider: "microsoft", email, token: tok.access_token, tokenExp: Date.now() + tok.expires_in * 1000, refresh: tok.refresh_token });
  localStorage.setItem(PENDING_SCAN_KEY, id);
  return saved.returnTo;
}

async function msToken(body: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId("microsoft"), scope: "offline_access Mail.Read User.Read", ...body }),
  });
  const j = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !j.access_token) throw new Error(j.error_description?.split("\n")[0] || "Microsoft sign-in failed.");
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_in: j.expires_in ?? 3600 };
}

// ---------- reading mail ----------

export class NeedsSignIn extends Error {}

const SUBJECT_WORDS = ["receipt", "subscription", "renew", "renewal", "membership", "invoice", "billing", "\"your plan\"", "payment", "bill", "statement", "\"amount due\"", "trial", "charged", "policy", "premium", "autopay", "cancel", "canceled", "cancelled", "cancellation", "ended", "expired"];

function cutoff(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - LOOKBACK_MONTHS);
  return d;
}

function b64urlText(data?: string): string {
  if (!data) return "";
  const bin = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
}

function gmailBody(p: GmailPart): { plain: string; html: string } {
  let plain = "";
  let html = "";
  const walk = (x: GmailPart) => {
    if (x.mimeType === "text/plain" && !plain) plain = b64urlText(x.body?.data);
    else if (x.mimeType === "text/html" && !html) html = b64urlText(x.body?.data);
    x.parts?.forEach(walk);
  };
  walk(p);
  return { plain, html };
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]!);
      }
    }),
  );
  return out;
}

async function readGmail(a: InboxAccount): Promise<string[]> {
  if (!a.token || (a.tokenExp ?? 0) < Date.now() + 30_000) throw new NeedsSignIn("Sign in to Google again to check Gmail.");
  const auth = { Authorization: `Bearer ${a.token}` };
  const q = `newer_than:${LOOKBACK_MONTHS}m subject:(${SUBJECT_WORDS.join(" OR ")})`;
  const ids: string[] = [];
  let page = "";
  while (ids.length < 300) {
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q, maxResults: "100", ...(page ? { pageToken: page } : {}) })}`, { headers: auth });
    if (r.status === 401) throw new NeedsSignIn("Sign in to Google again to check Gmail.");
    const j = (await r.json()) as { messages?: { id: string }[]; nextPageToken?: string };
    ids.push(...(j.messages ?? []).map((m) => m.id));
    if (!j.nextPageToken) break;
    page = j.nextPageToken;
  }
  const texts = await pool(ids.slice(0, 300), 10, async (id) => {
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: auth });
    if (!r.ok) return "";
    const m = (await r.json()) as { payload?: GmailPart; internalDate?: string; labelIds?: string[] };
    const h = (n: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? "";
    const { plain, html } = m.payload ? gmailBody(m.payload) : { plain: "", html: "" };
    const body = plain.trim() || (html ? htmlToText(html) : "");
    return [`From: ${h("from")}`, `To: ${h("to")}`, `Subject: ${h("subject")}`, `Date: ${h("date")}`, ...(m.labelIds?.includes("SENT") ? ["Folder: Sent"] : []), "", body].join("\n").slice(0, 6000);
  });
  return texts.filter(Boolean).reverse();
}

async function msAccess(a: InboxAccount): Promise<string> {
  if (a.token && (a.tokenExp ?? 0) > Date.now() + 60_000) return a.token;
  if (!a.refresh) throw new NeedsSignIn("Sign in to Microsoft again to check Outlook.");
  try {
    const t = await msToken({ grant_type: "refresh_token", refresh_token: a.refresh });
    patchAccount(a.id, { token: t.access_token, tokenExp: Date.now() + t.expires_in * 1000, refresh: t.refresh_token ?? a.refresh });
    return t.access_token;
  } catch {
    patchAccount(a.id, { refresh: undefined, token: undefined });
    throw new NeedsSignIn("Sign in to Microsoft again to check Outlook.");
  }
}

async function readOutlook(a: InboxAccount): Promise<string[]> {
  const token = await msAccess(a);
  const since = cutoff().getTime();
  const search = SUBJECT_WORDS.map((w) => `subject:${w}`).join(" OR ");
  let url = `https://graph.microsoft.com/v1.0/me/messages?${new URLSearchParams({ $search: `"${search.replace(/"/g, "")}"`, $top: "50", $select: "subject,from,toRecipients,receivedDateTime,body" })}`;
  const out: { d: number; t: string }[] = [];
  let pages = 0;
  while (url && pages++ < 6) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' } });
    if (r.status === 401) throw new NeedsSignIn("Sign in to Microsoft again to check Outlook.");
    const j = (await r.json()) as {
      value?: { subject?: string; receivedDateTime?: string; from?: { emailAddress?: { name?: string; address?: string } }; toRecipients?: { emailAddress?: { address?: string } }[]; body?: { content?: string } }[];
      "@odata.nextLink"?: string;
    };
    for (const m of j.value ?? []) {
      const d = Date.parse(m.receivedDateTime ?? "");
      if (!d || d < since) continue;
      const from = m.from?.emailAddress;
      out.push({
        d,
        t: [`From: ${from?.name ?? ""} <${from?.address ?? ""}>`, `To: ${(m.toRecipients ?? []).map((x) => x.emailAddress?.address).join(", ")}`, `Subject: ${m.subject ?? ""}`, `Date: ${new Date(d).toUTCString()}`, "", m.body?.content ?? ""].join("\n").slice(0, 6000),
      });
    }
    url = j["@odata.nextLink"] ?? "";
  }
  return out.sort((x, y) => x.d - y.d).map((x) => x.t);
}

async function readImap(a: InboxAccount): Promise<string[]> {
  const pass = a.pass || sessionPasswords.get(a.id);
  if (!pass) throw new NeedsSignIn("Enter the app password again to check this inbox.");
  const res = await fetch("/api/inbox/imap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ host: a.host, port: a.port ?? 993, user: a.email, pass, months: LOOKBACK_MONTHS }),
  });
  const j = (await res.json().catch(() => ({}))) as { emails?: string[]; error?: string };
  if (res.status === 401) throw new NeedsSignIn(j.error || "The app password was not accepted.");
  if (!res.ok) throw new Error(j.error || `Couldn't check ${a.email}.`);
  return j.emails ?? [];
}

export async function readInbox(a: InboxAccount): Promise<string[]> {
  if (a.provider === "google") return readGmail(a);
  if (a.provider === "microsoft") return readOutlook(a);
  return readImap(a);
}

// ---------- adding what was found ----------

export interface ApplyCounts {
  added: number;
  updated: number;
  toConfirm: number;
  doubles: number;
  bills: number;
  cancelled: number;
  moved: number;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Saves found subscriptions and bills. Existing ones get fresh prices and dates; new ones are added
 * (unsure ones land in "Is this a subscription?"). With `auto`, anything the user already removed —
 * e.g. tapped "Not a subscription" — stays removed, and already-cancelled finds aren't added.
 */
export function applyFound(found: ParseResult, db: Snapshot, store: MovingStore, source: string, opts: { auto?: boolean; pick?: (kind: "s" | "b", key: string) => boolean; inbox?: string } = {}): ApplyCounts {
  const refs = (list?: EmailRef[]) => (list ?? []).map((r) => (opts.inbox ? { ...r, inbox: opts.inbox } : r));
  const notesWith = (cur: string | null | undefined, list?: EmailRef[]) => {
    const next = withEmailRefs(cur, refs(list));
    return next !== (cur ?? "") ? { notes: next } : {};
  };
  const res = matchExisting(found, db.subscriptions ?? [], db.bills);
  const removed = new Set(
    opts.auto
      ? store
          .recentlyDeleted(400)
          .filter((d) => d.table === "subscriptions" || d.table === "bills")
          .map((d) => `${d.table}:${norm(String((d.row as { name?: string }).name ?? ""))}`)
      : [],
  );
  const counts: ApplyCounts = { added: 0, updated: 0, toConfirm: 0, doubles: 0, bills: 0, cancelled: 0, moved: 0 };
  const billNames = new Set(db.bills.filter((x) => !x.deleted).map((x) => norm(x.name)));
  for (const s of res.subscriptions) {
    if (opts.pick && !opts.pick("s", s.key)) continue;
    if (s.existingId) {
      const cur = db.subscriptions?.find((x) => x.id === s.existingId);
      const seen = s.cancelled_on ?? s.seen ?? "";
      const staleNote = s.stale && s.last_charged ? `No receipt since ${s.last_charged} — is it still active?` : "";
      const status: Partial<Subscription> =
        s.status === "cancelled" && cur?.status !== "cancelled" && seen >= (cur?.last_charged ?? "")
          ? { status: "cancelled", cancelled_on: s.cancelled_on ?? s.seen ?? today(), remind: false }
          : s.status === "cancelling" && (cur?.status === "active" || cur?.status === "confirm" || cur?.status === "free_trial") && seen >= (cur?.last_charged ?? "")
            ? { status: "cancelling" }
            : cur?.status === "cancelled" && s.status !== "cancelled" && s.status !== "cancelling" && s.last_charged && s.last_charged > (cur.cancelled_on ?? "")
              ? { status: "active", cancelled_on: null }
              : staleNote && cur?.status === "active" && !(cur.last_charged && cur.last_charged > (s.last_charged ?? "")) && !(cur.notes ?? "").includes(staleNote)
                ? { status: "confirm" }
                : {};
      const baseNotes = status.status === "confirm" ? [staleNote, cur?.notes ?? ""].filter(Boolean).join("\n") : cur?.notes;
      const patch = {
        ...(s.amount != null && s.amount !== cur?.amount ? { amount: s.amount } : {}),
        ...(s.next_due && (!cur?.next_due || s.next_due > cur.next_due) ? { next_due: s.next_due } : {}),
        ...(s.last_charged && (!cur?.last_charged || s.last_charged > cur.last_charged) ? { last_charged: s.last_charged } : {}),
        ...(s.pay_method && !cur?.pay_method ? { pay_method: s.pay_method } : {}),
        ...(s.account_email && !cur?.account_email ? { account_email: s.account_email } : {}),
        ...status,
        ...(status.status === "confirm" ? { notes: withEmailRefs(baseNotes, refs(s.emails)) } : notesWith(cur?.notes, s.emails)),
      };
      if (Object.keys(patch).length) {
        store.update("subscriptions", s.existingId, patch, { silent: true });
        counts.updated++;
        if (status.status === "cancelled" || status.status === "cancelling") counts.cancelled++;
        if (status.status === "confirm") counts.toConfirm++;
      }
      continue;
    }
    // Already tracked as a bill (e.g. the user moved car insurance over) — leave it there.
    if (billNames.has(norm(s.name))) continue;
    if (opts.auto && (removed.has(`subscriptions:${norm(s.name)}`) || s.status === "cancelled" || (s.status === "cancelling" && !s.charges.length))) continue;
    store.insert(
      "subscriptions",
      {
        name: s.name,
        service: s.service,
        category: s.category,
        amount: s.amount,
        frequency: s.frequency,
        next_due: s.next_due,
        status: s.status,
        source,
        pay_method: s.pay_method,
        account_email: s.account_email,
        cancel_url: s.cancel_url,
        last_charged: s.last_charged,
        remind: true,
        notes: withEmailRefs([s.reason, s.doubleCharged ? "⚠️ Charged twice in one billing period — check with the company." : ""].filter(Boolean).join("\n"), refs(s.emails)),
      },
      { silent: true },
    );
    counts.added++;
    if (s.status === "confirm") counts.toConfirm++;
    if (s.doubleCharged) counts.doubles++;
  }
  for (const b of res.bills) {
    if (opts.pick && !opts.pick("b", b.key)) continue;
    if (b.existingId) {
      const cur = db.bills.find((x) => x.id === b.existingId);
      const patch = {
        ...(b.amount != null && b.amount !== cur?.amount ? { amount: b.amount } : {}),
        ...(b.next_due && (!cur?.next_due || b.next_due > cur.next_due) ? { next_due: b.next_due } : {}),
        ...(b.due_day && !cur?.due_day ? { due_day: b.due_day } : {}),
        ...(b.account && !cur?.account ? { account: b.account } : {}),
        ...notesWith(cur?.notes, b.emails),
      };
      if (Object.keys(patch).length) {
        store.update("bills", b.existingId, patch, { silent: true });
        counts.updated++;
      }
      continue;
    }
    if (opts.auto && removed.has(`bills:${norm(b.name)}`)) continue;
    // An earlier scan filed it as a subscription (e.g. GEICO "policy renewal") — move it over.
    const misfiled = (db.subscriptions ?? []).find((x) => !x.deleted && x.source !== "manual" && norm(x.name) === norm(b.name));
    const fields = { name: b.name, category: b.category, amount: b.amount, frequency: b.frequency, next_due: b.next_due, due_day: b.due_day, autopay: b.autopay, account: b.account, website: b.website, status: "active" as const };
    if (misfiled) {
      const moved = subscriptionToBill(misfiled);
      store.insert("bills", { ...moved, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v != null && v !== "")), notes: withEmailRefs(moved.notes, refs(b.emails)) }, { silent: true });
      store.remove("subscriptions", misfiled.id);
      counts.moved++;
      continue;
    }
    store.insert("bills", { ...fields, notes: withEmailRefs(b.reason, refs(b.emails)) }, { silent: true });
    counts.added++;
    counts.bills++;
  }
  return counts;
}

export function describeCounts(c: ApplyCounts, scanned: number): string {
  if (!c.added && !c.updated && !c.moved) return `Checked ${scanned} email${scanned === 1 ? "" : "s"} — nothing new.`;
  const parts = [
    c.added ? `${c.added} new${c.bills ? ` (${c.bills} bill${c.bills === 1 ? "" : "s"})` : ""}` : "",
    c.updated ? `${c.updated} updated` : "",
    c.cancelled ? `${c.cancelled} cancelled` : "",
    c.moved ? `${c.moved} moved to Bills` : "",
    c.toConfirm ? `${c.toConfirm} to confirm` : "",
  ].filter(Boolean);
  return `${parts.join(", ")}${c.doubles ? " · ⚠️ possible double charge" : ""}`;
}

/** Reads one inbox and saves what it finds. */
export async function checkInbox(a: InboxAccount, store: MovingStore): Promise<{ counts: ApplyCounts; scanned: number; text: string }> {
  const emails = await readInbox(a);
  const found = parseEmailList(emails, today(), true, a.email);
  const counts = applyFound(found, store.getSnapshot(), store, "inbox", { auto: true, inbox: a.email });
  const text = describeCounts(counts, emails.length);
  patchAccount(a.id, { lastScan: new Date().toISOString(), lastResult: text });
  return { counts, scanned: emails.length, text };
}
