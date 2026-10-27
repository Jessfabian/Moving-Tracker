"use client";

import { CrudPage, StatusPill } from "@/components/CrudPage";
import { useDb } from "@/lib/store-context";

const COLORS: Record<string, string> = { todo: "#dc2626", done: "#16a34a", not_needed: "#9ca3af" };
const OPTS = [
  { value: "todo", label: "To do" },
  { value: "done", label: "Done" },
  { value: "not_needed", label: "N/A" },
];

export default function AddressesPage() {
  const db = useDb();
  const done = db.address_changes.filter((a) => a.status !== "todo").length;
  return (
    <CrudPage
      table="address_changes"
      subtitle={
        <>
          Everyone who needs your new address. Start with USPS mail forwarding ({" "}
          <a className="text-indigo-700 underline" href="https://moversguide.usps.com" target="_blank" rel="noreferrer">
            moversguide.usps.com
          </a>
          ). {done}/{db.address_changes.length} updated.
        </>
      }
      columns={["member_id", "method", "done_date"]}
      filters={["status", "category", "member_id"]}
      groupBy="category"
      renderBadge={(a) => <StatusPill value={a.status} options={OPTS} color={COLORS[a.status]} />}
    />
  );
}
