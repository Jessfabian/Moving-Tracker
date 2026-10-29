"use client";

import { billToSubscription, subscriptionToBill, type Bill, type Subscription } from "@moving/shared";
import { useCallback } from "react";
import { showUndo } from "@/components/Swipe";
import { useStore } from "@/lib/store-context";

/** Moves subscriptions to Bills (or bills to Subscriptions) — for things like car insurance filed in the wrong place. */
export function useMoveRecords() {
  const store = useStore();

  const toBills = useCallback(
    (rows: Subscription[]) => {
      if (!rows.length) return;
      const made = rows.map((s) => {
        const b = store.insert("bills", subscriptionToBill(s), { silent: true });
        store.remove("subscriptions", s.id);
        return { from: s.id, to: b.id };
      });
      showUndo(rows.length === 1 ? `Moved “${rows[0]!.name}” to Bills` : `Moved ${rows.length} to Bills`, () =>
        made.forEach((m) => {
          store.remove("bills", m.to);
          store.restore("subscriptions", m.from);
        }),
      );
    },
    [store],
  );

  const toSubscriptions = useCallback(
    (rows: Bill[]) => {
      if (!rows.length) return;
      const made = rows.map((b) => {
        const s = store.insert("subscriptions", billToSubscription(b), { silent: true });
        store.remove("bills", b.id);
        return { from: b.id, to: s.id };
      });
      showUndo(rows.length === 1 ? `Moved “${rows[0]!.name}” to Subscriptions` : `Moved ${rows.length} to Subscriptions`, () =>
        made.forEach((m) => {
          store.remove("subscriptions", m.to);
          store.restore("bills", m.from);
        }),
      );
    },
    [store],
  );

  return { toBills, toSubscriptions };
}
