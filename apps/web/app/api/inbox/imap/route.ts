import { htmlToText } from "@moving/shared";
import { ImapFlow, type SearchObject } from "imapflow";
import { simpleParser } from "mailparser";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const SUBJECT_WORDS = ["receipt", "subscription", "renew", "membership", "invoice", "billing", "your plan", "payment", "bill", "statement", "amount due", "trial", "charged", "order confirmation", "policy", "premium", "autopay", "cancel", "cancellation", "ended", "expired"];
const MAX_MESSAGES = 300;
const MAX_CHARS = 6000;
const SKIP_USES = new Set(["\\Trash", "\\Junk", "\\Drafts", "\\Flagged", "\\Important"]);

function privateAddress(ip: string): boolean {
  if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  const m = /^(\d+)\.(\d+)\./.exec(ip.replace(/^::ffff:/, ""));
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** Only real, public mail servers — the app must not be usable to poke at private networks. */
async function safeHost(host: string): Promise<boolean> {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) || isIP(host)) return false;
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !privateAddress(a.address));
  } catch {
    return false;
  }
}

function friendly(e: unknown): { status: number; error: string } {
  const err = e as { authenticationFailed?: boolean; code?: string; responseText?: string; message?: string };
  if (err?.authenticationFailed || /auth|login|credentials|password/i.test(err?.responseText ?? err?.message ?? ""))
    return { status: 401, error: "The email or app password was not accepted. Check that you used an app password (not your normal password) and that IMAP is turned on." };
  if (err?.code === "ENOTFOUND" || err?.code === "ECONNREFUSED" || err?.code === "ETIMEDOUT" || err?.code === "ETIMEOUT" || /greeting|timed?\s?out/i.test(err?.message ?? ""))
    return { status: 502, error: "Couldn't reach that mail server. Check the server name and port." };
  return { status: 500, error: `The mail server said: ${err?.responseText || err?.message || "unknown error"}` };
}

export async function POST(req: Request) {
  let body: { host?: string; port?: number; user?: string; pass?: string; months?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const host = String(body.host ?? "").trim().toLowerCase();
  const port = Number(body.port) || 993;
  const user = String(body.user ?? "").trim();
  const pass = String(body.pass ?? "").replace(/\s+/g, "");
  const months = Math.min(24, Math.max(1, Number(body.months) || 12));
  if (!host || !user || !pass) return Response.json({ error: "Email, password and server are required." }, { status: 400 });
  if (port !== 993 && port !== 143) return Response.json({ error: "Only ports 993 or 143 are supported." }, { status: 400 });
  if (!(await safeHost(host))) return Response.json({ error: "That mail server name doesn't look right." }, { status: 400 });

  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const client = new ImapFlow({ host, port, secure: port === 993, auth: { user, pass }, logger: false, socketTimeout: 45_000, connectionTimeout: 15_000, greetingTimeout: 15_000 });
  const started = Date.now();
  try {
    await client.connect();
    const boxes = await client.list();
    const all = boxes.find((b) => b.specialUse === "\\All");
    const sent = boxes.find((b) => b.specialUse === "\\Sent") ?? boxes.find((b) => /^(inbox[./])?sent(\s?(items|mail|messages))?$/i.test(b.path));
    const rank = (b: { path: string; specialUse?: string }) => (b.path.toUpperCase() === "INBOX" ? 0 : b.path === sent?.path ? 1 : b.specialUse === "\\Archive" ? 2 : 3);
    // Every real folder (Inbox first, then Sent, Archive and the user's own folders) — not Trash, Spam or Drafts.
    const folders = boxes
      .filter((b) => !b.flags?.has("\\Noselect") && !b.flags?.has("\\NonExistent") && !SKIP_USES.has(b.specialUse ?? "") && !/^(trash|junk|spam|drafts?|deleted( items| messages)?|bulk mail|outbox)$/i.test(b.name))
      .sort((a, b) => rank(a) - rank(b))
      .map((b) => b.path);
    // Gmail's "All Mail" already holds every label, including Sent.
    const paths = all ? [all.path] : folders;
    const gmail = client.capabilities.has("X-GM-EXT-1");
    const perFolder = paths.length > 1 ? Math.max(40, Math.floor(MAX_MESSAGES / Math.min(paths.length, 6))) : MAX_MESSAGES;

    const emails: { date: number; text: string }[] = [];
    for (const path of paths) {
      if (emails.length >= MAX_MESSAGES || Date.now() - started > 40_000) break;
      const lock = await client.getMailboxLock(path, { readOnly: true });
      try {
        const query: SearchObject = gmail
          ? { gmraw: `newer_than:${months}m subject:(${SUBJECT_WORDS.map((w) => (w.includes(" ") ? `"${w}"` : w)).join(" OR ")})` }
          : { since, or: SUBJECT_WORDS.map((w) => ({ subject: w })) };
        const found = await client.search(query, { uid: true });
        const uids = (Array.isArray(found) ? found : []).slice(-Math.min(perFolder, MAX_MESSAGES - emails.length));
        if (!uids.length) continue;
        const isSent = path === sent?.path;
        for await (const msg of client.fetch(uids, { uid: true, source: { maxLength: 60_000 } }, { uid: true })) {
          if (!msg.source) continue;
          try {
            const p = await simpleParser(msg.source, { skipImageLinks: true, skipTextToHtml: true, skipTextLinks: true });
            const text = (p.text?.trim() || (typeof p.html === "string" ? htmlToText(p.html) : "")).replace(/\n{3,}/g, "\n\n");
            const date = p.date ?? new Date();
            if (date < since) continue;
            const fromMe = isSent || (p.from?.value ?? []).some((a) => a.address?.toLowerCase() === user.toLowerCase());
            emails.push({
              date: date.getTime(),
              text: [`From: ${p.from?.text ?? ""}`, `To: ${Array.isArray(p.to) ? p.to.map((t) => t.text).join(", ") : (p.to?.text ?? "")}`, `Subject: ${p.subject ?? ""}`, `Date: ${date.toUTCString()}`, ...(fromMe ? ["Folder: Sent"] : []), "", text].join("\n").slice(0, MAX_CHARS),
            });
          } catch {
            // Skip messages that can't be parsed.
          }
          if (Date.now() - started > 45_000) break;
        }
      } finally {
        lock.release();
      }
    }
    await client.logout().catch(() => {});
    emails.sort((a, b) => a.date - b.date);
    return Response.json({ emails: emails.map((e) => e.text), mailbox: paths.join(", ") });
  } catch (e) {
    client.close();
    const f = friendly(e);
    return Response.json({ error: f.error }, { status: f.status });
  }
}
