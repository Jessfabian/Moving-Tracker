"use client";

import { CrudPage } from "@/components/CrudPage";

export default function ContactsPage() {
  return (
    <CrudPage
      table="contacts"
      subtitle="Movers, realtors, landlords, schools, doctors — everyone you need on moving day."
      columns={["role", "company", "phone", "email"]}
      filters={["role"]}
      groupBy="role"
      renderBadge={(c) =>
        c.phone ? (
          <span
            role="link"
            onClick={(e) => {
              e.stopPropagation();
              window.location.href = `tel:${c.phone}`;
            }}
            className="btn-secondary px-2 py-1 text-xs"
          >
            📞 Call
          </span>
        ) : null
      }
    />
  );
}
