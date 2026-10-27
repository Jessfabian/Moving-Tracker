"use client";

import { listHouseholdMembers, MovingStore, type HouseholdMember } from "@moving/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NavPositionPicker } from "@/components/NavPositionPicker";
import { PageHeader } from "@/components/ui";
import { idbKV } from "@/lib/kv";
import { useApp, useSyncStatus } from "@/lib/store-context";

export default function SettingsPage() {
  const app = useApp();
  const { settings, updateSettings, store, supabase, session, households } = app;
  const status = useSyncStatus();
  const router = useRouter();
  const [name, setName] = useState(settings.displayName);
  const [url, setUrl] = useState(settings.supabaseUrl);
  const [key, setKey] = useState(settings.supabaseKey);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const household = households.find((h) => h.id === settings.householdId);

  useEffect(() => {
    if (supabase && settings.householdId) void listHouseholdMembers(supabase, settings.householdId).then(setMembers).catch(() => setMembers([]));
  }, [supabase, settings.householdId]);

  const copyLocalToCloud = async () => {
    if (!store) return;
    const local = new MovingStore(idbKV, "local", () => settings.displayName || "Me");
    await local.load();
    const snap = local.exportSnapshot();
    const n = Object.values(snap).reduce((a, rows) => a + rows.length, 0);
    if (!n) return setMsg("There is no device-only data to copy.");
    if (!confirm(`Copy ${n} records from this device into the shared cloud move?`)) return;
    store.importSnapshot(snap);
    await store.sync();
    setMsg(`✅ Copied ${n} records to the cloud.`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Settings & sharing" icon="⚙️" />
      {msg && <p className="rounded-lg bg-gray-100 p-2 text-sm">{msg}</p>}

      <section className="card space-y-3">
        <h2 className="font-bold">👤 You</h2>
        <div>
          <label className="label" htmlFor="dn">
            Your name (shown in activity)
          </label>
          <div className="flex gap-2">
            <input id="dn" className="input" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn-secondary" onClick={() => updateSettings({ displayName: name.trim() })}>
              Save
            </button>
          </div>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">📱 Navigation bar</h2>
        <p className="text-sm text-gray-600">Where the main tabs sit on a phone. Auto puts them on the right edge on phone-width screens (like the closed iPhone Duo) and sideways screens, and at the bottom on the opened Duo held upright. Choose Right side or Bottom to always keep them there on this device.</p>
        <NavPositionPicker />
      </section>

      <section className="card space-y-4">
        <h2 className="font-bold">☁️ Storage & family sharing</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => updateSettings({ mode: "local" })}
            className={`rounded-xl border-2 p-3 text-left ${settings.mode === "local" ? "border-indigo-600 bg-indigo-50" : "border-gray-200"}`}
          >
            <div className="font-semibold">📱 This device only</div>
            <div className="text-xs text-gray-500">Works offline, no account. Data stays in this browser.</div>
          </button>
          <button
            onClick={() => updateSettings({ mode: "cloud" })}
            className={`rounded-xl border-2 p-3 text-left ${settings.mode === "cloud" ? "border-indigo-600 bg-indigo-50" : "border-gray-200"}`}
          >
            <div className="font-semibold">👨‍👩‍👧 Cloud sync with family</div>
            <div className="text-xs text-gray-500">Everyone edits the same move on web and phone. Still works offline.</div>
          </button>
        </div>
        {settings.mode === "cloud" && (
          <div className="space-y-3">
            <details className="rounded-xl border border-gray-200 p-3" open={!settings.supabaseUrl}>
              <summary className="cursor-pointer text-sm font-semibold">Supabase connection</summary>
              <div className="mt-3 space-y-2">
                <input className="input" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
                <input className="input" placeholder="anon public key" value={key} onChange={(e) => setKey(e.target.value)} />
                <button className="btn-secondary" onClick={() => updateSettings({ supabaseUrl: url.trim(), supabaseKey: key.trim() })}>
                  Save connection
                </button>
              </div>
            </details>
            {session && (
              <>
                <p className="text-sm">
                  Signed in as <b>{session.user.email}</b>
                </p>
                {household && (
                  <div className="rounded-xl bg-indigo-50 p-4">
                    <div className="text-sm text-indigo-900">
                      Invite family to <b>{household.name}</b> with this code:
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="font-mono text-3xl font-black tracking-widest text-indigo-700">{household.invite_code}</span>
                      <button className="btn-secondary px-2 py-1 text-xs" onClick={() => void navigator.clipboard.writeText(household.invite_code)}>
                        Copy
                      </button>
                    </div>
                    <div className="mt-1 text-xs text-indigo-800">They sign up, choose “Join”, and enter the code. Your role: {household.role}.</div>
                  </div>
                )}
                {members.length > 0 && (
                  <div>
                    <div className="label">People with access</div>
                    <ul className="text-sm">
                      {members.map((m) => (
                        <li key={m.user_id} className="flex justify-between border-b border-gray-100 py-1">
                          <span>{m.display_name || "Member"}</span>
                          <span className="text-gray-500">{m.role}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {status && (
                  <p className="text-xs text-gray-500">
                    Last sync: {status.lastSync ? new Date(status.lastSync).toLocaleString() : "never"} · {status.pending} pending changes
                    {status.error && <span className="text-red-600"> · {status.error}</span>}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary" onClick={() => void store?.sync()}>
                    ⟳ Sync now
                  </button>
                  <button className="btn-secondary" onClick={() => void copyLocalToCloud()}>
                    Copy device-only data to cloud
                  </button>
                  {households.length > 1 && (
                    <button className="btn-secondary" onClick={() => updateSettings({ householdId: null })}>
                      Switch move
                    </button>
                  )}
                  <button className="btn-ghost" onClick={() => void app.signOut()}>
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <section className="card space-y-3 border-red-200">
        <h2 className="font-bold text-red-700">Danger zone</h2>
        <p className="text-sm text-gray-500">
          {settings.mode === "local" ? "Erase all moving data stored on this device." : "Clear this device's offline copy and re-download from the cloud (shared data is not deleted)."}
        </p>
        <button
          className="btn-danger"
          onClick={async () => {
            if (!store || !confirm(settings.mode === "local" ? "Permanently erase ALL data on this device? Download a backup first!" : "Clear the offline copy on this device?")) return;
            await store.clearAll();
            if (settings.mode === "cloud") await store.sync();
            router.push(settings.mode === "local" ? "/setup" : "/");
          }}
        >
          {settings.mode === "local" ? "Erase all data" : "Reset offline copy"}
        </button>
      </section>
    </div>
  );
}
