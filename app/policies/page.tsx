import { Suspense } from "react";
import { PolicyRegistryClient } from "@/components/PolicyRegistryClient";

export const dynamic = "force-dynamic";

export default function PoliciesPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Loading parametric policy registry...
        </div>
      }
    >
      <PolicyRegistryClient />
    </Suspense>
  );
}
