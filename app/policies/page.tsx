import { Suspense } from "react";
import { PolicyRegistryClient } from "@/components/PolicyRegistryClient";

export const dynamic = "force-dynamic";

export default function PoliciesPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-xl border border-slate-200/80 bg-white p-10 text-center text-sm text-slate-500 shadow-xs">
          Loading parametric policy registry...
        </div>
      }
    >
      <PolicyRegistryClient />
    </Suspense>
  );
}
