"use client";

import { applyPlan } from "@moving/shared";
import { CrudPage, StatusPill } from "@/components/CrudPage";
import { useStore } from "@/lib/store-context";

export default function PetsPage() {
  const store = useStore();
  return (
    <CrudPage
      table="pets"
      onSaved={() => applyPlan(store, { removeObsolete: true })}
      subtitle="Each pet gets tailored tasks: vet records, health certificates, travel plans and a calm moving-day plan."
      columns={["species", "breed", "travel_method", "vet_name"]}
      renderBadge={(p) => (p.vaccinations_current ? <StatusPill value="Vaccines ✓" color="#16a34a" /> : <StatusPill value="Check vaccines" color="#d97706" />)}
      emptyText="Add your pets so the checklist includes vet records, travel crates and pet-friendly stops."
    />
  );
}
