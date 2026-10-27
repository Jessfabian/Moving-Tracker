"use client";

import { applyPlan, isInterstate, isLongDistance } from "@moving/shared";
import { useState } from "react";
import { EntityForm } from "@/components/EntityForm";
import { formatDrive, useZipRoute } from "@/components/MoveDistance";
import { PageHeader } from "@/components/ui";
import { useDb, useStore } from "@/lib/store-context";

export default function MovePage() {
  const db = useDb();
  const store = useStore();
  const move = db.moves[0];
  const [msg, setMsg] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const { route } = useZipRoute(move?.from_zip, move?.to_zip);
  if (!move) return null;
  const from = [move.from_address, move.from_city, move.from_state, move.from_zip].filter(Boolean).join(", ");
  const to = [move.to_address, move.to_city, move.to_state, move.to_zip].filter(Boolean).join(", ");

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <PageHeader title="Move details" icon="🚚" subtitle="Dates, addresses and logistics. Changing the move date automatically reschedules tasks you haven't started." />
        <div className="card">
          <EntityForm
            key={`${move.id}-${rev}`}
            table="moves"
            row={move}
            submitLabel="Save move details"
            onDone={() => {
              const r = applyPlan(store);
              setMsg(`Saved.${r.created ? ` Added ${r.created} new tasks.` : ""}${r.rescheduled ? ` Rescheduled ${r.rescheduled} tasks.` : ""}`);
              setRev((x) => x + 1);
            }}
          />
          {msg && <p className="mt-3 rounded-lg bg-green-50 p-2 text-sm text-green-800">{msg}</p>}
        </div>
      </div>
      <aside className="space-y-4 lg:pt-16">
        {from && to && (
          <a className="card block hover:shadow-md" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/${encodeURIComponent(from)}/${encodeURIComponent(to)}`}>
            <div className="font-bold">🗺️ Route</div>
            <div className="mt-1 text-sm text-gray-600">
              {from}
              <br />↓<br />
              {to}
            </div>
            {route && (
              <div className="mt-2 text-sm">
                <b className="text-2xl">{route.miles.toLocaleString()}</b> driving miles
                <div className="text-xs text-gray-500">{formatDrive(route.minutes)}</div>
              </div>
            )}
            <div className="mt-2 text-sm font-semibold text-indigo-700">Open driving directions →</div>
          </a>
        )}
        {isInterstate(move) && (
          <div className="card border-amber-200 bg-amber-50">
            <div className="font-bold">⚖️ Interstate move</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
              <li>Movers must have a USDOT number — verify at FMCSA before booking.</li>
              <li>You should receive the “Your Rights and Responsibilities When You Move” booklet.</li>
              <li>New driver&apos;s licenses are usually required within 30–60 days; vehicle registration soon after.</li>
              <li>Check state income tax and voter registration changes.</li>
            </ul>
            <a className="mt-2 block text-sm font-semibold text-amber-800 underline" href="https://ai.fmcsa.dot.gov/hhg/search.asp" target="_blank" rel="noreferrer">
              FMCSA mover lookup →
            </a>
          </div>
        )}
        {isLongDistance(move) && (
          <div className="card">
            <div className="font-bold">🛣️ Long-distance tips</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
              <li>Delivery windows can be 2–21 days — pack an “open first” suitcase per person.</li>
              <li>Plan overnight stops (pet-friendly if needed) and car maintenance before the drive.</li>
              <li>Carry documents, medications, jewelry and laptops with you.</li>
              <li>Get binding or not-to-exceed estimates based on an in-home or video survey.</li>
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
