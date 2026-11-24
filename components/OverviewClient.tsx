"use client";

import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  CloudSun,
  FileCheck2,
  MapPin,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { getPayoutMethodMeta, maskBdMobileNumber } from "@/lib/domain";
import { cn, formatCurrency, formatLandArea } from "@/lib/utils";
import { MobileWalletCard } from "@/components/MobileWalletCard";

export interface OverviewPolicyRow {
  id: string;
  metricType: string;
  thresholdValue: number;
  coverageAmount: number;
  status: string;
  farm: {
    name: string;
    cropType: string;
    sizeHectares: number;
    latitude: number;
    longitude: number;
  };
}

export interface OverviewClientProps {
  currentUser: {
    name: string;
    role: string;
    balance: number;
    payoutMethod: string;
    mobileNumber: string;
  };
  farmsCount: number;
  districtsCount: number;
  alertCount: number;
  activePoliciesCount: number;
  totalPoliciesCount: number;
  totalCoverage: number;
  totalPayouts: number;
  claimsCount: number;
  weatherCacheCount: number;
  policies: OverviewPolicyRow[];
}

export function OverviewClient({
  currentUser,
  farmsCount,
  districtsCount,
  alertCount,
  activePoliciesCount,
  totalPoliciesCount,
  totalCoverage,
  totalPayouts,
  claimsCount,
  weatherCacheCount,
  policies,
}: OverviewClientProps) {
  const { t, translateStatus } = useTranslation();
  const isAdmin = currentUser.role === "ADMIN";

  const modules = [
    {
      href: "/farms",
      title: t("moduleFarmsTitle"),
      desc: t("moduleFarmsDesc"),
      icon: MapPin,
      iconBg: "from-sky-500 to-cyan-600 shadow-sky-500/20",
    },
    {
      href: "/policies",
      title: t("modulePoliciesTitle"),
      desc: t("modulePoliciesDesc"),
      icon: FileCheck2,
      iconBg: "from-emerald-500 to-teal-600 shadow-emerald-500/20",
    },
    {
      href: "/dashboard",
      title: t("moduleMonitorTitle"),
      desc: t("moduleMonitorDesc"),
      icon: CloudSun,
      iconBg: "from-amber-500 to-orange-500 shadow-amber-500/20",
    },
    {
      href: "/claims",
      title: t("moduleClaimsTitle"),
      desc: t("moduleClaimsDesc"),
      icon: ReceiptText,
      iconBg: "from-teal-500 to-emerald-600 shadow-teal-500/20",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Compact Dark Emerald-to-Teal Hero / Welcome Banner Card */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950 via-emerald-800 to-teal-700 p-6 text-white shadow-md">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-teal-400/15 blur-2xl"
        />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-medium text-emerald-100 backdrop-blur-sm">
              <Sparkles className="h-3 w-3 shrink-0 text-teal-200" aria-hidden="true" />
              <span>{isAdmin ? t("overviewEyebrowAdmin") : t("overviewEyebrowFarmer")}</span>
            </span>
            <h1 className="mt-2.5 text-2xl font-semibold tracking-tight text-white">
              {t("welcomeBack", { name: currentUser.name })}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-emerald-100/90">
              {t("heroRiskSummary", {
                farms: farmsCount,
                districts: districtsCount,
                active: activePoliciesCount,
                alerts: alertCount,
              })}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 backdrop-blur-md">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
                <Wallet className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wider text-emerald-100/90">
                  {isAdmin ? t("reservePool") : t("walletBalance")}
                </p>
                <p className="text-base font-semibold tracking-tight text-white">
                  {formatCurrency(currentUser.balance)}
                </p>
                <p className="text-[11px] text-emerald-100/80">
                  {getPayoutMethodMeta(currentUser.payoutMethod).label} ·{" "}
                  {maskBdMobileNumber(currentUser.mobileNumber)}
                </p>
              </div>
            </div>

            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              <CloudSun className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
              <span>{t("heroOpenMonitorBtn")}</span>
            </Link>
          </div>
        </div>
      </section>

      {/* KPI Summary Cards with Subtle Top Accent Borders & Soft Gradient Icon Badges */}
      <section aria-label="Key Metrics" className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 border-t-2 border-t-sky-500/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
              {t("monitoredFarms")}
            </span>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm shadow-sky-500/20">
              <MapPin className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-semibold tracking-tight text-slate-900">{farmsCount}</p>
            <p className="mt-1 text-xs text-slate-600">
              {isAdmin ? t("monitoredFarmsSubAdmin") : t("monitoredFarmsSubFarmer")}
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 border-t-2 border-t-emerald-500/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
              {t("activePolicies")}
            </span>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-600/20">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-semibold tracking-tight text-slate-900">
              {activePoliciesCount}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {t("totalContractsCount", { count: totalPoliciesCount })}
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 border-t-2 border-t-amber-500/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
              {t("totalCoverage")}
            </span>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm shadow-amber-500/20">
              <Wallet className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-semibold tracking-tight text-slate-900">
              {formatCurrency(totalCoverage)}
            </p>
            <p className="mt-1 text-xs text-slate-600">{t("totalCoverageSub")}</p>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 border-t-2 border-t-teal-500/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
              {t("totalPayouts")}
            </span>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-sm shadow-teal-600/20">
              <Activity className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-semibold tracking-tight text-slate-900">
              {formatCurrency(totalPayouts)}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {t("claimsAndSnapshots", { claims: claimsCount, snapshots: weatherCacheCount })}
            </p>
          </div>
        </div>
      </section>

      {/* Mobile Wallet Profile Card */}
      <MobileWalletCard />

      {/* Quick Navigation Strip */}
      <section aria-label="Workspace Modules" className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {modules.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-emerald-200 hover:shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm",
                      item.iconBg
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-emerald-700" />
                </div>
                <h2 className="mt-3 text-sm font-semibold text-slate-900">{item.title}</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.desc}</p>
              </div>
            </Link>
          );
        })}
      </section>

      {/* Clean Data Table */}
      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {t("tablePoliciesTitle", { count: policies.length })}
            </h2>
            <p className="text-xs text-slate-500">{t("tablePoliciesSubtitle")}</p>
          </div>
          <Link
            href="/policies"
            className="whitespace-nowrap text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
          >
            {t("managePoliciesLink")}
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              <tr>
                <th className="whitespace-nowrap px-4 py-3">{t("colFarmArea")}</th>
                <th className="whitespace-nowrap px-4 py-3">{t("colCoordinates")}</th>
                <th className="whitespace-nowrap px-4 py-3">{t("colTriggerMetric")}</th>
                <th className="whitespace-nowrap px-4 py-3">{t("colThreshold")}</th>
                <th className="whitespace-nowrap px-4 py-3">{t("colCoverage")}</th>
                <th className="whitespace-nowrap px-4 py-3">{t("colStatus")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {policies.map((policy) => (
                <tr key={policy.id} className="transition hover:bg-slate-50/80">
                  <td className="px-4 py-3.5">
                    <div className="font-medium text-slate-900">{policy.farm.name}</div>
                    <div className="text-xs text-slate-500">
                      {policy.farm.cropType} · {formatLandArea(policy.farm.sizeHectares)}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs text-slate-600">
                    {policy.farm.latitude.toFixed(4)}, {policy.farm.longitude.toFixed(4)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5">
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-700">
                      {policy.metricType}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 font-medium text-slate-900">
                    {policy.thresholdValue}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-900">
                    {formatCurrency(policy.coverageAmount)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5">
                    <span
                      className={cn(
                        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
                        policy.status === "ACTIVE"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : policy.status === "CLAIMED"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-slate-200 bg-slate-100 text-slate-700"
                      )}
                    >
                      {translateStatus(policy.status)}
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
