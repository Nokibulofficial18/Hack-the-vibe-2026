"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CloudRain,
  CloudSun,
  Database,
  Flame,
  MapPin,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sprout,
  Sun,
  Thermometer,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ToastProvider";
import { getMetricMeta, type ParsedWeatherReading, type RiskLevel } from "@/lib/domain";
import { cn, formatCurrency, formatLandArea } from "@/lib/utils";
import {
  WeatherFaultInjector,
  type FaultToggles,
  type ResilienceSyncResult,
} from "@/components/WeatherFaultInjector";
import {
  BangladeshRiskMap,
  type MapFarmItem,
  type MapPolicyItem,
} from "@/components/BangladeshRiskMap";
import {
  AdminAnalyticsCharts,
  type DistrictChartPoint,
} from "@/components/AdminAnalyticsCharts";
import { DashboardSkeleton } from "@/components/DashboardSkeletons";

interface EvaluatedPolicy extends MapPolicyItem {
  claims: Array<{ id: string; status: string; payoutAmount: number }>;
}

interface MonitoredFarm extends MapFarmItem {
  policies: EvaluatedPolicy[];
  weather: ParsedWeatherReading | null;
  cacheAgeMinutes: number | null;
  dataSource: string;
  farmStatus: "NORMAL" | "ELEVATED_RISK" | "TRIGGER_BREACHED";
}

interface DashboardKpis {
  totalLiability: number;
  totalPayoutsIssued: number;
  disbursedClaimsCount: number;
  activeRiskExposure: number;
  activePoliciesCount: number;
  healthyPoliciesCount: number;
  atRiskPoliciesCount: number;
  breachedPoliciesCount: number;
  monitoredFarmsCount: number;
}

interface SyncBanner {
  type: "success" | "warning" | "error";
  message: string;
}

const RISK_STYLES: Record<RiskLevel, { badge: string; bar: string; label: string }> = {
  HEALTHY: {
    badge: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300",
    bar: "bg-[#065F46]",
    label: "SAFE",
  },
  AT_RISK: {
    badge: "bg-amber-100 text-amber-950 ring-1 ring-amber-300",
    bar: "bg-amber-500",
    label: "WARNING (≤15%)",
  },
  BREACHED: {
    badge: "bg-rose-100 text-rose-950 ring-1 ring-rose-300",
    bar: "bg-rose-600",
    label: "BREACHED",
  },
  CLAIMED: {
    badge: "bg-indigo-100 text-indigo-950 ring-1 ring-indigo-300",
    bar: "bg-indigo-600",
    label: "CLAIMED",
  },
  UNKNOWN: {
    badge: "bg-slate-200 text-slate-800",
    bar: "bg-slate-400",
    label: "UNSYNCED",
  },
};

export function WeatherMonitorClient() {
  const { user, isAdmin, getAuthHeaders } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [farms, setFarms] = useState<MonitoredFarm[]>([]);
  const [districtChart, setDistrictChart] = useState<DistrictChartPoint[]>([]);
  const [kpis, setKpis] = useState<DashboardKpis>({
    totalLiability: 0,
    totalPayoutsIssued: 0,
    disbursedClaimsCount: 0,
    activeRiskExposure: 0,
    activePoliciesCount: 0,
    healthyPoliciesCount: 0,
    atRiskPoliciesCount: 0,
    breachedPoliciesCount: 0,
    monitoredFarmsCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [syncingFarmId, setSyncingFarmId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [evaluatingPolicyId, setEvaluatingPolicyId] = useState<string | null>(null);
  const [overrideValues, setOverrideValues] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<SyncBanner | null>(null);

  // A06 Admin Fault Injection state & resilience execution traces
  const [faultToggles, setFaultToggles] = useState<FaultToggles>({
    simulateTimeout: false,
    simulateMalformedJson: false,
    forceOffline: false,
  });
  const [lastSyncResults, setLastSyncResults] = useState<ResilienceSyncResult[]>([]);

  const loadWeather = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/weather", {
        headers: getAuthHeaders(),
        cache: "no-store",
      });
      if (response.ok) {
        const data = (await response.json()) as {
          farms: MonitoredFarm[];
          kpis: DashboardKpis;
          charts?: { byDistrict: DistrictChartPoint[] };
        };
        setFarms(data.farms);
        if (data.kpis) setKpis(data.kpis);
        if (data.charts?.byDistrict) setDistrictChart(data.charts.byDistrict);
      }
    } catch {
      setBanner({
        type: "error",
        message: "Failed to load monitored farm telemetry.",
      });
      toast({
        variant: "error",
        title: "Telemetry Load Error",
        description: "Unable to load farm weather readings.",
      });
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, toast]);

  useEffect(() => {
    void loadWeather();
  }, [user.id, loadWeather]);

  useEffect(() => {
    if (!isAdmin) {
      setFaultToggles({
        simulateTimeout: false,
        simulateMalformedJson: false,
        forceOffline: false,
      });
      setLastSyncResults([]);
    }
  }, [isAdmin]);

  const handleSync = async (farmId?: string) => {
    setBanner(null);
    if (farmId) {
      setSyncingFarmId(farmId);
    } else {
      setSyncingAll(true);
    }

    try {
      const response = await fetch("/api/weather", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          ...(farmId ? { farmId } : {}),
          ...(isAdmin ? { simulateOptions: faultToggles } : {}),
        }),
      });

      const data = (await response.json()) as {
        results?: ResilienceSyncResult[];
        error?: string;
      };

      if (!response.ok) {
        const errMsg = data.error ?? "Weather sync failed.";
        setBanner({ type: "error", message: errMsg });
        toast({ variant: "error", title: "Weather Sync Blocked", description: errMsg });
        return;
      }

      const results = data.results ?? [];
      setLastSyncResults(results);

      const fallbackResults = results.filter((r) => r.source === "CACHE_FALLBACK");
      const liveResults = results.filter((r) => r.source === "LIVE_API");
      const failedResults = results.filter((r) => r.source === "FAILED");

      if (failedResults.length > 0 && liveResults.length === 0 && fallbackResults.length === 0) {
        const msg =
          failedResults[0].warningBanner ??
          "External weather API failed and no cached snapshot is available.";
        setBanner({ type: "error", message: msg });
        toast({ variant: "error", title: "API & Cache Unavailable", description: msg });
      } else if (fallbackResults.length > 0 && liveResults.length === 0) {
        const msg =
          fallbackResults[0].warningBanner ??
          `External API unavailable for ${fallbackResults.length} plot(s). Displaying cached weather snapshot.`;
        setBanner({ type: "warning", message: msg });
        toast({ variant: "warning", title: "Cache Fallback Activated", description: msg });
      } else if (fallbackResults.length > 0) {
        const msg = `Synced ${liveResults.length} plot(s) from live Open-Meteo API and served ${fallbackResults.length} from WeatherCache fallback.`;
        setBanner({ type: "warning", message: msg });
        toast({ variant: "warning", title: "Partial Cache Fallback", description: msg });
      } else {
        const msg = `Synced live Open-Meteo telemetry for ${liveResults.length} monitored plot(s).`;
        setBanner({ type: "success", message: msg });
        toast({ variant: "success", title: "Live Telemetry Updated", description: msg });
      }

      await loadWeather();
    } catch {
      const msg = "Network error while syncing meteorological feeds.";
      setBanner({ type: "error", message: msg });
      toast({ variant: "error", title: "Sync Failed", description: msg });
    } finally {
      setSyncingFarmId(null);
      setSyncingAll(false);
    }
  };

  const handleEvaluatePolicy = async (policy: MapPolicyItem, useSimulatedOverride = false) => {
    setBanner(null);
    setEvaluatingPolicyId(policy.id);

    try {
      const overrideVal = useSimulatedOverride
        ? overrideValues[policy.id] || String(Math.round(policy.thresholdValue * 1.25))
        : undefined;

      const response = await fetch("/api/claims", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          policyId: policy.id,
          ...(overrideVal !== undefined ? { observedValue: Number(overrideVal) } : {}),
        }),
      });

      const data = (await response.json()) as {
        claim?: { id: string; payoutAmount: number; idempotencyKey: string; transactionId?: string };
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        const msg = data.message ?? data.error ?? "Policy evaluation did not trigger a claim.";
        setBanner({
          type: response.status === 422 || response.status === 409 ? "warning" : "error",
          message: msg,
        });
        toast({
          variant: response.status === 409 ? "warning" : "error",
          title:
            response.status === 409 ? "Duplicate Payout Prevented" : "Evaluation Not Triggered",
          description: msg,
        });
        return;
      }

      const msg = `Payout of ${formatCurrency(data.claim?.payoutAmount ?? 0)} disbursed${data.claim?.transactionId ? ` (Txn: ${data.claim.transactionId})` : ""}.`;
      setBanner({ type: "success", message: `Parametric claim executed! ${msg}` });
      toast({
        variant: "success",
        title: "Parametric MFS Payout Disbursed",
        description: msg,
      });

      await loadWeather();
      router.refresh();
    } catch {
      const msg = "Failed to run parametric claim evaluation.";
      setBanner({ type: "error", message: msg });
      toast({ variant: "error", title: "Evaluation Error", description: msg });
    } finally {
      setEvaluatingPolicyId(null);
    }
  };

  const latestResultByFarm = useMemo(() => {
    const map = new Map<string, ResilienceSyncResult>();
    for (const r of lastSyncResults) {
      map.set(r.farmId, r);
    }
    return map;
  }, [lastSyncResults]);

  const riskExposurePct =
    kpis.totalLiability > 0
      ? Math.round((kpis.activeRiskExposure / kpis.totalLiability) * 100)
      : 0;

  const isAnySyncRunning = syncingAll || syncingFarmId !== null;

  return (
    <div className="space-y-6">
      {/* Deep Emerald Climate Fintech Header */}
      <div className="relative overflow-hidden rounded-2xl border border-[#065F46]/20 bg-gradient-to-r from-[#065F46] via-[#047857] to-slate-900 p-6 text-white shadow-md">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-emerald-50 backdrop-blur">
              {isAdmin ? (
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
              ) : (
                <Sprout className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
              )}
              {isAdmin
                ? "Admin Climate Command · Geospatial Risk Radar & Live Analytics"
                : `Farmer Telemetry · Isolated to ${user.name}`}
            </div>
            <h1 className="mt-2.5 text-2xl font-extrabold tracking-tight text-white">
              Weather Monitoring &amp; Risk Intelligence
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-emerald-100/90">
              Real-time Open-Meteo monitoring across climate-vulnerable Bangladesh districts with 3.5s resilient failover, tiered BDT payouts, and geospatial trigger tracking.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleSync()}
              disabled={isAnySyncRunning || farms.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-xs font-bold text-[#065F46] shadow-sm transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={cn("h-4 w-4", syncingAll && "animate-spin")}
                aria-hidden="true"
              />
              {syncingAll ? "Syncing Open-Meteo..." : "Sync All Districts"}
            </button>
            <Link
              href="/claims"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur transition hover:bg-white/20"
            >
              Claim &amp; MFS Ledger
            </Link>
          </div>
        </div>
      </div>

      {/* Skeleton Loader for Initial Async Fetch */}
      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* Aggregate KPI Summary Cards (M05) */}
          <section
            aria-label="Aggregate Risk and Financial KPIs"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-slate-700">
                <span className="text-xs font-bold uppercase tracking-wide">Total Liability</span>
                <Wallet className="h-4 w-4 text-[#065F46]" aria-hidden="true" />
              </div>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">
                {formatCurrency(kpis.totalLiability)}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-600">
                Across {kpis.activePoliciesCount} active parametric{" "}
                {kpis.activePoliciesCount === 1 ? "policy" : "policies"}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm">
              <div className="flex items-center justify-between text-[#065F46]">
                <span className="text-xs font-bold uppercase tracking-wide">
                  Total Payouts Issued
                </span>
                <Banknote className="h-4 w-4 text-[#065F46]" aria-hidden="true" />
              </div>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-[#064E3B]">
                {formatCurrency(kpis.totalPayoutsIssued)}
              </p>
              <p className="mt-1 text-xs font-medium text-emerald-900">
                {kpis.disbursedClaimsCount} MFS{" "}
                {kpis.disbursedClaimsCount === 1 ? "claim" : "claims"} settled
              </p>
            </div>

            <div
              className={cn(
                "rounded-xl border p-5 shadow-sm",
                kpis.breachedPoliciesCount > 0
                  ? "border-rose-300 bg-rose-50/80"
                  : "border-amber-200 bg-amber-50/70"
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-between",
                  kpis.breachedPoliciesCount > 0 ? "text-rose-900" : "text-amber-900"
                )}
              >
                <span className="text-xs font-bold uppercase tracking-wide">
                  Active Risk Exposure
                </span>
                <ShieldAlert
                  className={cn(
                    "h-4 w-4",
                    kpis.breachedPoliciesCount > 0 ? "text-rose-700" : "text-amber-700"
                  )}
                  aria-hidden="true"
                />
              </div>
              <p
                className={cn(
                  "mt-2 text-3xl font-extrabold tracking-tight",
                  kpis.breachedPoliciesCount > 0 ? "text-rose-950" : "text-amber-950"
                )}
              >
                {formatCurrency(kpis.activeRiskExposure)}
              </p>
              <p
                className={cn(
                  "mt-1 text-xs font-medium",
                  kpis.breachedPoliciesCount > 0 ? "text-rose-800" : "text-amber-800"
                )}
              >
                {riskExposurePct}% of liability · {kpis.atRiskPoliciesCount} warning,{" "}
                {kpis.breachedPoliciesCount} breached
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-slate-700">
                <span className="text-xs font-bold uppercase tracking-wide">
                  Safe vs Monitored
                </span>
                <MapPin className="h-4 w-4 text-[#065F46]" aria-hidden="true" />
              </div>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">
                {kpis.healthyPoliciesCount}{" "}
                <span className="text-base font-semibold text-slate-600">
                  / {kpis.activePoliciesCount} safe
                </span>
              </p>
              <p className="mt-1 text-xs font-medium text-slate-600">
                {kpis.monitoredFarmsCount} farm plot{kpis.monitoredFarmsCount === 1 ? "" : "s"} across Bangladesh
              </p>
            </div>
          </section>

          {/* Status Banner */}
          {banner && (
            <div
              role={banner.type === "error" ? "alert" : "status"}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border p-4 text-xs font-semibold",
                banner.type === "success" && "border-emerald-300 bg-emerald-50 text-emerald-950",
                banner.type === "warning" && "border-amber-300 bg-amber-50 text-amber-950",
                banner.type === "error" && "border-rose-300 bg-rose-50 text-rose-950"
              )}
            >
              {banner.type === "success" ? (
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#065F46]"
                  aria-hidden="true"
                />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span>{banner.message}</span>
            </div>
          )}

          {/* Geospatial Bangladesh Risk Map + Recharts Climate Fintech Analytics */}
          {farms.length > 0 && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <BangladeshRiskMap
                  farms={farms}
                  isAdmin={isAdmin}
                  syncingFarmId={syncingFarmId}
                  evaluatingPolicyId={evaluatingPolicyId}
                  onSyncFarm={(id) => handleSync(id)}
                  onEvaluatePolicy={(p, sim) => handleEvaluatePolicy(p, sim)}
                />
              </div>
              <div className="lg:col-span-7">
                <AdminAnalyticsCharts
                  byDistrict={districtChart}
                  farms={farms}
                  isAdmin={isAdmin}
                />
              </div>
            </div>
          )}

          {/* A06 Admin Resilience & Fault Injector Widget */}
          {isAdmin ? (
            <WeatherFaultInjector
              farms={farms.map((f) => ({ id: f.id, name: f.name }))}
              toggles={faultToggles}
              onChangeToggles={setFaultToggles}
              onRunTest={(farmId) => handleSync(farmId)}
              isRunning={isAnySyncRunning}
              lastResults={lastSyncResults}
            />
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-100/80 px-4 py-3 text-xs text-slate-700">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-[#065F46]" aria-hidden="true" />
                <span>
                  <strong>Resilience Pipeline Active:</strong> All weather syncs enforce a 3.5s timeout, 3x exponential retries, and WeatherCache fallback. Switch to <strong>Admin</strong> in the header to open the A06 Fault Injector controls.
                </span>
              </span>
            </div>
          )}

          {/* Detailed Monitored Farm Cards */}
          {farms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <CloudSun className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-slate-800">
                No farms under monitoring
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Register a farm plot and attach a parametric policy to view live climate monitoring here.
              </p>
              <Link
                href="/farms"
                className="mt-4 inline-flex items-center rounded-lg bg-[#065F46] px-4 py-2 text-xs font-semibold text-white hover:bg-[#047857]"
              >
                Register a Farm Plot
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                District Plot Telemetry Cards ({farms.length})
              </h2>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {farms.map((farm) => {
                  const farmSyncTrace = latestResultByFarm.get(farm.id);

                  return (
                    <article
                      key={farm.id}
                      className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 sm:p-6"
                    >
                      <div>
                        {/* Farm Header */}
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-bold text-slate-950">{farm.name}</h3>
                              <span
                                className={cn(
                                  "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                                  farm.pinStatus === "BREACHED"
                                    ? "bg-rose-100 text-rose-950 ring-1 ring-rose-300"
                                    : farm.pinStatus === "WARNING"
                                      ? "bg-amber-100 text-amber-950 ring-1 ring-amber-300"
                                      : "bg-emerald-100 text-emerald-950 ring-1 ring-emerald-300"
                                )}
                              >
                                {farm.pinStatus === "BREACHED"
                                  ? "BREACHED"
                                  : farm.pinStatus === "WARNING"
                                    ? "WARNING (≤15%)"
                                    : "SAFE"}
                              </span>
                              {farmSyncTrace && (
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
                                    farmSyncTrace.source === "LIVE_API"
                                      ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-300"
                                      : "bg-amber-50 text-amber-900 ring-1 ring-amber-300"
                                  )}
                                >
                                  {farmSyncTrace.source === "CACHE_FALLBACK" && (
                                    <Database className="h-3 w-3" aria-hidden="true" />
                                  )}
                                  {farmSyncTrace.source} ({farmSyncTrace.attempts}/3)
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2.5 text-xs font-medium text-slate-600">
                              <span>{farm.cropType}</span>
                              <span>·</span>
                              <span>{formatLandArea(farm.sizeHectares)}</span>
                              <span>·</span>
                              <span className="inline-flex items-center gap-1 font-mono">
                                <MapPin className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                                {farm.latitude.toFixed(4)}, {farm.longitude.toFixed(4)}
                              </span>
                              {isAdmin && (
                                <>
                                  <span>·</span>
                                  <span className="font-semibold text-[#065F46]">
                                    {farm.user.name}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleSync(farm.id)}
                            disabled={isAnySyncRunning}
                            aria-label={`Sync live weather for ${farm.name}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#065F46] disabled:opacity-50"
                          >
                            <RefreshCw
                              className={cn(
                                "h-3.5 w-3.5",
                                syncingFarmId === farm.id && "animate-spin"
                              )}
                              aria-hidden="true"
                            />
                            Sync Plot
                          </button>
                        </div>

                        {/* Meteorological Readings Grid */}
                        <div className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-3">
                          <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3">
                            <div className="flex items-center gap-1 text-[11px] font-bold text-sky-900">
                              <CloudRain className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span>24h Rain</span>
                            </div>
                            <p className="mt-1 text-lg font-extrabold text-sky-950 sm:text-xl">
                              {farm.weather ? `${farm.weather.rainMm} mm` : "—"}
                            </p>
                          </div>

                          <div className="rounded-xl border border-orange-200 bg-orange-50/80 p-3">
                            <div className="flex items-center gap-1 text-[11px] font-bold text-orange-900">
                              <Thermometer className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span>Peak Temp</span>
                            </div>
                            <p className="mt-1 text-lg font-extrabold text-orange-950 sm:text-xl">
                              {farm.weather ? `${farm.weather.tempMaxC} °C` : "—"}
                            </p>
                          </div>

                          <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
                            <div className="flex items-center gap-1 text-[11px] font-bold text-amber-900">
                              <Sun className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span>Dry Streak</span>
                            </div>
                            <p className="mt-1 text-lg font-extrabold text-amber-950 sm:text-xl">
                              {farm.weather ? `${farm.weather.droughtDays} d` : "—"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between text-[11px] font-medium text-slate-600">
                          <span>
                            Last telemetry:{" "}
                            {farm.lastFetchedAt
                              ? new Date(farm.lastFetchedAt).toLocaleString()
                              : "Not yet synced"}
                          </span>
                          <span>{farm.weather?.timezone ?? "Asia/Dhaka"}</span>
                        </div>

                        {/* Policy Threshold Gauges */}
                        <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                              Armed Parametric Triggers ({farm.policies.length})
                            </h4>
                            <Link
                              href={`/policies?farmId=${farm.id}`}
                              className="text-xs font-bold text-[#065F46] hover:underline"
                            >
                              + Add Policy
                            </Link>
                          </div>

                          {farm.policies.length === 0 ? (
                            <p className="rounded-lg bg-slate-100 p-3 text-xs text-slate-700">
                              No parametric policies attached to this plot yet.
                            </p>
                          ) : (
                            farm.policies.map((policy) => {
                              const meta = getMetricMeta(policy.metricType);
                              const riskStyle = RISK_STYLES[policy.riskLevel];
                              const progressPct = Math.min(100, Math.round(policy.ratio * 100));
                              const defaultSimValue = Math.round(policy.thresholdValue * 1.25);

                              return (
                                <div
                                  key={policy.id}
                                  className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="rounded bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-slate-800 ring-1 ring-slate-300">
                                        {policy.metricType}
                                      </span>
                                      <span className="text-xs font-bold text-slate-900">
                                        {policy.observedValue !== null
                                          ? `${policy.observedValue}${meta.unit}`
                                          : "—"}{" "}
                                        / {policy.thresholdValue}
                                        {meta.unit}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-slate-900">
                                        {formatCurrency(policy.coverageAmount)}
                                      </span>
                                      <span
                                        className={cn(
                                          "rounded-full px-2 py-0.5 text-[10px] font-bold",
                                          riskStyle.badge
                                        )}
                                      >
                                        {riskStyle.label}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                                    <div
                                      className={cn("h-full rounded-full transition-all", riskStyle.bar)}
                                      style={{ width: `${progressPct}%` }}
                                      role="progressbar"
                                      aria-valuenow={progressPct}
                                      aria-valuemin={0}
                                      aria-valuemax={100}
                                      aria-label={`${meta.label} threshold progress`}
                                    />
                                  </div>

                                  {policy.status === "ACTIVE" && (
                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                      {policy.riskLevel === "BREACHED" ? (
                                        <button
                                          type="button"
                                          onClick={() => handleEvaluatePolicy(policy, false)}
                                          disabled={evaluatingPolicyId === policy.id}
                                          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-800 disabled:opacity-50"
                                        >
                                          <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                                          {evaluatingPolicyId === policy.id
                                            ? "Executing Payout..."
                                            : "Execute Parametric Payout"}
                                        </button>
                                      ) : (
                                        <span className="text-[11px] font-medium text-slate-600">
                                          {progressPct}% of trigger ({meta.shortLabel})
                                        </span>
                                      )}

                                      {isAdmin && (
                                        <div className="flex items-center gap-1.5">
                                          <label htmlFor={`sim-${policy.id}`} className="sr-only">
                                            Simulated weather value for {policy.metricType}
                                          </label>
                                          <input
                                            id={`sim-${policy.id}`}
                                            type="number"
                                            step="any"
                                            placeholder={String(defaultSimValue)}
                                            value={overrideValues[policy.id] ?? ""}
                                            onChange={(e) =>
                                              setOverrideValues((prev) => ({
                                                ...prev,
                                                [policy.id]: e.target.value,
                                              }))
                                            }
                                            className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-[#065F46] focus:outline-none focus:ring-2 focus:ring-[#065F46]/25"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => handleEvaluatePolicy(policy, true)}
                                            disabled={evaluatingPolicyId === policy.id}
                                            className="inline-flex items-center gap-1 rounded-md bg-[#065F46] px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-[#047857] disabled:opacity-50"
                                          >
                                            <Flame className="h-3 w-3" aria-hidden="true" />
                                            {evaluatingPolicyId === policy.id
                                              ? "Running..."
                                              : "Simulate Breach"}
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {policy.status === "CLAIMED" && policy.claims[0] && (
                                    <div className="mt-2.5 flex items-center justify-between text-xs text-indigo-900">
                                      <span className="inline-flex items-center gap-1 font-semibold">
                                        <Play className="h-3 w-3" aria-hidden="true" />
                                        Payout issued:{" "}
                                        {formatCurrency(policy.claims[0].payoutAmount)}
                                      </span>
                                      <Link href="/claims" className="font-bold hover:underline">
                                        View Receipt →
                                      </Link>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
