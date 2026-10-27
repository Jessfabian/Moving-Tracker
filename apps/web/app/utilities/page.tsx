"use client";

import { formatDate } from "@moving/shared";
import { CrudPage, StatusPill } from "@/components/CrudPage";
import { Segmented } from "@/components/ui";
import { useDb } from "@/lib/store-context";
import { useState } from "react";

const COLORS: Record<string, string> = { todo: "#dc2626", scheduled: "#d97706", done: "#16a34a" };
const OPTS = [
  { value: "todo", label: "To do" },
  { value: "scheduled", label: "Scheduled" },
  { value: "done", label: "Done" },
];

export default function UtilitiesPage() {
  const db = useDb();
  const [loc, setLoc] = useState<"all" | "old" | "new">("all");
  const move = db.moves[0];
  const done = db.utilities.filter((u) => u.status === "done").length;
  return (
    <CrudPage
      table="utilities"
      subtitle={
        <>
          Stop service at the old home the day after you leave{move?.move_date ? ` (${formatDate(move.move_date)})` : ""}, and start service at the new home a day or two before you arrive. {done}/{db.utilities.length} done.
        </>
      }
      top={
        <div className="mb-3">
          <Segmented
            value={loc}
            onChange={setLoc}
            options={[
              { value: "all", label: "Both homes" },
              { value: "old", label: "🏚️ Old home – stop" },
              { value: "new", label: "🏡 New home – start" },
            ]}
          />
        </div>
      }
      where={(u) => loc === "all" || u.location === loc}
      groupBy="location"
      columns={["provider", "action_date", "account_number", "phone"]}
      filters={["status"]}
      sort={(a, b) => a.utility_type.localeCompare(b.utility_type)}
      renderBadge={(u) => <StatusPill value={u.status} options={OPTS} color={COLORS[u.status]} />}
    />
  );
}
