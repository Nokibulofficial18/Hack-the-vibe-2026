"use client";

export function DashboardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading climate telemetry and risk analytics"
      className="space-y-6 animate-pulse"
    >
      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-28 rounded bg-slate-200" />
              <div className="h-4 w-4 rounded bg-slate-200" />
            </div>
            <div className="mt-3 h-8 w-36 rounded bg-slate-200" />
            <div className="mt-2 h-3 w-44 rounded bg-slate-100" />
          </div>
        ))}
      </div>

      {/* Interactive Map + Analytics Charts Skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-5">
          <div className="h-4 w-48 rounded bg-slate-200" />
          <div className="mt-2 h-3 w-64 rounded bg-slate-100" />
          <div className="mt-4 h-80 w-full rounded-xl bg-slate-100" />
        </div>
        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="h-4 w-56 rounded bg-slate-200" />
            <div className="mt-4 h-56 w-full rounded-xl bg-slate-100" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="h-4 w-64 rounded bg-slate-200" />
            <div className="mt-4 h-56 w-full rounded-xl bg-slate-100" />
          </div>
        </div>
      </div>

      {/* Monitored Farm Cards Skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-5 w-52 rounded bg-slate-200" />
                <div className="h-3 w-40 rounded bg-slate-100" />
              </div>
              <div className="h-8 w-24 rounded-lg bg-slate-200" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[1, 2, 3].map((k) => (
                <div key={k} className="h-20 rounded-xl bg-slate-100" />
              ))}
            </div>
            <div className="mt-5 h-20 rounded-xl bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading records" className="space-y-4 animate-pulse">
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="h-4 w-56 rounded bg-slate-200" />
              <div className="h-3 w-72 rounded bg-slate-100" />
            </div>
            <div className="h-8 w-24 rounded-lg bg-slate-200" />
          </div>
        </div>
      ))}
    </div>
  );
}
