"use client";

import { cloudErrorMessage } from "@moving/shared";
import { useState, type ReactNode } from "react";
import { useApp } from "@/lib/store-context";

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 to-violet-100 p-4">
      <div className="card w-full max-w-md space-y-4 p-6">
        <div className="text-center text-2xl font-extrabold text-indigo-700">📦 Moving Tracker</div>
        {children}
      </div>
    </div>
  );
}

function AuthScreen() {
  const { supabase, updateSettings } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    const res = mode === "in" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (res.error) setMsg(res.error.message);
    else if (mode === "up" && !res.data.session) setMsg("Check your email to confirm your account, then sign in.");
  };

  return (
    <Centered>
      <p className="muted text-center">Sign in so your whole family can share and edit the same move.</p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {msg && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">{msg}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>
      <button className="btn-ghost w-full" onClick={() => setMode(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
      </button>
      <button className="w-full text-xs text-gray-500 underline" onClick={() => updateSettings({ mode: "local" })}>
        Use on this device only (no account)
      </button>
    </Centered>
  );
}

function HouseholdScreen() {
  const { households, createHousehold, joinHousehold, updateSettings, signOut, session } = useApp();
  const [name, setName] = useState("Our family move");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(cloudErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Centered>
      <p className="muted text-center">Signed in as {session?.user.email}</p>
      {households.length > 0 && (
        <div className="space-y-2">
          <div className="label">Open an existing move</div>
          {households.map((h) => (
            <button key={h.id} className="btn-secondary w-full justify-between" onClick={() => updateSettings({ householdId: h.id })}>
              <span>{h.name}</span>
              <span className="text-xs text-gray-400">{h.role}</span>
            </button>
          ))}
        </div>
      )}
      <div className="space-y-2">
        <div className="label">Start a new move</div>
        <div className="flex gap-2">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn-primary" disabled={busy || !name.trim()} onClick={() => void run(() => createHousehold(name.trim()))}>
            Create
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <div className="label">Join your family&apos;s move with an invite code</div>
        <div className="flex gap-2">
          <input className="input uppercase" placeholder="e.g. 7K2QXA" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn-secondary" disabled={busy || !code.trim()} onClick={() => void run(() => joinHousehold(code.trim()))}>
            Join
          </button>
        </div>
      </div>
      {err && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      <button className="w-full text-xs text-gray-500 underline" onClick={() => void signOut()}>
        Sign out
      </button>
    </Centered>
  );
}

function ConfigScreen() {
  const { updateSettings } = useApp();
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  return (
    <Centered>
      <p className="text-sm">Cloud sync is selected but no Supabase project is configured yet.</p>
      <div>
        <label className="label">Supabase project URL</label>
        <input className="input" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      <div>
        <label className="label">Supabase anon (public) key</label>
        <input className="input" value={key} onChange={(e) => setKey(e.target.value)} />
      </div>
      <button className="btn-primary w-full" disabled={!url.startsWith("https://") || !key} onClick={() => updateSettings({ supabaseUrl: url.trim(), supabaseKey: key.trim() })}>
        Connect
      </button>
      <button className="btn-secondary w-full" onClick={() => updateSettings({ mode: "local" })}>
        Use on this device only
      </button>
      <p className="muted text-xs">Tip: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/web/.env.local so everyone gets them automatically.</p>
    </Centered>
  );
}

export function CloudGate({ children }: { children: ReactNode }) {
  const { settings, supabase, session } = useApp();
  if (settings.mode !== "cloud") return <>{children}</>;
  if (!supabase) return <ConfigScreen />;
  if (!session) return <AuthScreen />;
  if (!settings.householdId) return <HouseholdScreen />;
  return <>{children}</>;
}
