import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CloudSun,
  FileCheck2,
  MapPin,
  ReceiptText,
  ShieldCheck,
  Sprout,
  Wallet,
} from "lucide-react";
import prisma from "@/lib/prisma";
import { getServerSessionUser } from "@/lib/auth-server";
import { getPayoutMethodMeta, maskBdMobileNumber } from "@/lib/domain";
import { formatCurrency, formatLandArea } from "@/lib/utils";
import { MobileWalletCard } from "@/components/MobileWalletCard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const currentUser = await getServerSessionUser();
  const isAdmin = currentUser.role === "ADMIN";

  const [farms, policies, claims, weatherCacheCount] = await Promise.all([
    prisma.farm.findMany({
      where: isAdmin ? undefined : { userId: currentUser.id },
      include: {
        user: { select: { name: true, email: true } },
        policies: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.policy.findMany({
      where: isAdmin ? undefined : { farm: { userId: currentUser.id } },
      include: {
        farm: {
          select: {
            name: true,
            cropType: true,
            sizeHectares: true,
            latitude: true,
            longitude: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.claim.findMany({
      where: isAdmin ? undefined : { policy: { farm: { userId: currentUser.id } } },
      select: { id: true, status: true, payoutAmount: true },
    }),
    prisma.weatherCache.count(),
  ]);

  const activePolicies = policies.filter((p) => p.status === "ACTIVE");
  const totalCoverage = activePolicies.reduce((sum, p) => sum + p.coverageAmount, 0);
  const totalPayouts = claims
    .filter((c) => c.status === "DISBURSED")
    .reduce((sum, c) => sum + c.payoutAmount, 0);

  return (
    <div className="space-y-8">
      {/* Active Session Banner */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {isAdmin ? (
                <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" aria-hidden="true" />
              ) : (
                <Sprout className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              )}
              Active Session: {currentUser.role}
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              Welcome, {currentUser.name}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {isAdmin
                ? "Viewing global insurer risk exposure across all registered farms, active parametric policies, and automated payouts."
                : "Viewing your isolated smallholder farm plots, active climate policies, and instant payout wallet."}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
              {isAdmin ? "Liquidity Reserve Pool" : "Farmer Wallet Balance"}
            </p>
            <p className="mt-0.5 text-2xl font-bold text-emerald-900">
              {formatCurrency(currentUser.balance)}
            </p>
            <p className="text-xs text-emerald-800">
              {currentUser.email} · {getPayoutMethodMeta(currentUser.payoutMethod).label}{" "}
              {maskBdMobileNumber(currentUser.mobileNumber)}
            </p>
          </div>
        </div>
      </section>

      {/* Mobile Payout Wallet Configuration */}
      <MobileWalletCard />

      {/* KPI Summary Cards */}
      <section
        aria-label="Key Metrics"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wide">
              Monitored Farms
            </span>
            <MapPin className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-900">{farms.length}</p>
          <p className="mt-1 text-xs text-slate-500">
            {isAdmin ? "All registered plots" : "Scoped to your account"}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wide">
              Active Policies
            </span>
            <ShieldCheck className="h-4 w-4 text-indigo-600" aria-hidden="true" />
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-900">{activePolicies.length}</p>
          <p className="mt-1 text-xs text-slate-500">
            {policies.length} total contract(s)
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wide">
              Active Coverage Liability
            </span>
            <Wallet className="h-4 w-4 text-amber-600" aria-hidden="true" />
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {formatCurrency(totalCoverage)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Maximum automated payout</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wide">
              Disbursed / Telemetry
            </span>
            <Activity className="h-4 w-4 text-sky-600" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-700">
            {formatCurrency(totalPayouts)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {claims.length} claim(s) · {weatherCacheCount} weather snapshots
          </p>
        </div>
      </section>

      {/* Core Module Quick Launch Cards */}
      <section aria-label="Core Modules" className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/farms"
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <MapPin className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-emerald-600" />
          </div>
          <h2 className="mt-3 text-sm font-bold text-slate-900">Farm Plot Registry</h2>
          <p className="mt-1 text-xs text-slate-500">
            Register GPS coordinates with strict lat/lon bounds and manage crop plots.
          </p>
        </Link>

        <Link
          href="/policies"
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <FileCheck2 className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600" />
          </div>
          <h2 className="mt-3 text-sm font-bold text-slate-900">Parametric Policies</h2>
          <p className="mt-1 text-xs text-slate-500">
            Create rainfall, heat, or drought contracts with live payout previews.
          </p>
        </Link>

        <Link
          href="/dashboard"
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <CloudSun className="h-5 w-5 text-sky-600" aria-hidden="true" />
            <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-sky-600" />
          </div>
          <h2 className="mt-3 text-sm font-bold text-slate-900">Weather Monitor</h2>
          <p className="mt-1 text-xs text-slate-500">
            Track real-time weather telemetry, threshold gauges, and breach alerts.
          </p>
        </Link>

        <Link
          href="/claims"
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <ReceiptText className="h-5 w-5 text-amber-600" aria-hidden="true" />
            <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-amber-600" />
          </div>
          <h2 className="mt-3 text-sm font-bold text-slate-900">Claim &amp; Payout Ledger</h2>
          <p className="mt-1 text-xs text-slate-500">
            Audit triggered payouts, idempotency locks, and 5-step workflow logs.
          </p>
        </Link>
      </section>

      {/* Active Policies Preview */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <CloudSun className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-900">
              Parametric Policies ({policies.length})
            </h2>
          </div>
          <Link
            href="/policies"
            className="text-xs font-semibold text-emerald-700 hover:underline"
          >
            Manage Policies →
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3">Farm &amp; Crop</th>
                <th className="px-6 py-3">Coordinates</th>
                <th className="px-6 py-3">Trigger Metric</th>
                <th className="px-6 py-3">Threshold</th>
                <th className="px-6 py-3">Max Coverage</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {policies.map((policy) => (
                <tr key={policy.id} className="hover:bg-slate-50/80">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{policy.farm.name}</div>
                    <div className="text-xs text-slate-600">
                      {policy.farm.cropType} · {formatLandArea(policy.farm.sizeHectares)}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-600">
                    {policy.farm.latitude.toFixed(4)}, {policy.farm.longitude.toFixed(4)}
                  </td>
                  <td className="px-6 py-4">
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                      {policy.metricType}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-800">
                    {policy.thresholdValue}
                  </td>
                  <td className="px-6 py-4 font-semibold text-slate-900">
                    {formatCurrency(policy.coverageAmount)}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={
                        policy.status === "ACTIVE"
                          ? "inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800"
                          : "inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800"
                      }
                    >
                      {policy.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
