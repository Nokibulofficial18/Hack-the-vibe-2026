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
  Sun,
  Thermometer,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
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

const RISK_STYLES: Record<RiskLevel, { badge: string; bar: string }> = {
  HEALTHY: {
    badge: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    bar: "bg-emerald-700",
  },
  AT_RISK: {
    badge: "bg-amber-50 text-amber-700 border border-amber-200",
    bar: "bg-amber-500",
  },
  BREACHED: {
    badge: "bg-rose-50 text-rose-700 border border-rose-200",
    bar: "bg-rose-600",
  },
  CLAIMED: {
    badge: "bg-slate-100 text-slate-700 border border-slate-200",
    bar: "bg-slate-600",
  },
  UNKNOWN: {
    badge: "bg-slate-100 text-slate-600 border border-slate-200",
    bar: "bg-slate-400",
  },
};

export function WeatherMonitorClient() {
  const { user, isAdmin, getAuthHeaders } = useAuth();
  const { t, translateStatus } = useTranslation();
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
      setBanner({ type: "error", message: t("telemetryLoadErrDesc") });
      toast({
        variant: "error",
        title: t("telemetryLoadErrTitle"),
        description: t("telemetryLoadErrDesc"),
      });
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, toast, t]);

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
    if (farmId) setSyncingFarmId(farmId);
    else setSyncingAll(true);

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
        const errMsg = data.error ?? t("syncNetErrDesc");
        setBanner({ type: "error", message: errMsg });
        toast({ variant: "error", title: t("syncBlockedTitle"), description: errMsg });
        return;
      }

      const results = data.results ?? [];
      setLastSyncResults(results);

      const fallbackResults = results.filter((r) => r.source === "CACHE_FALLBACK");
      const liveResults = results.filter((r) => r.source === "LIVE_API");
      const failedResults = results.filter((r) => r.source === "FAILED");

      if (failedResults.length > 0 && liveResults.length === 0 && fallbackResults.length === 0) {
        const msg = failedResults[0].warningBanner ?? t("apiCacheUnavailableTitle");
        setBanner({ type: "error", message: msg });
        toast({ variant: "error", title: t("apiCacheUnavailableTitle"), description: msg });
      } else if (fallbackResults.length > 0 && liveResults.length === 0) {
        const msg =
          fallbackResults[0].warningBanner ??
          `External API unavailable for ${fallbackResults.length} plot(s). Displaying cached snapshot.`;
        setBanner({ type: "warning", message: msg });
        toast({ variant: "warning", title: t("cacheFallbackTitle"), description: msg });
      } else if (fallbackResults.length > 0) {
        const msg = `Synced ${liveResults.length} live & ${fallbackResults.length} cached plot(s).`;
        setBanner({ type: "warning", message: msg });
        toast({ variant: "warning", title: t("cacheFallbackTitle"), description: msg });
      } else {
        const msg = `${t("liveTelemetryTitle")} (${liveResults.length})`;
        setBanner({ type: "success", message: msg });
        toast({ variant: "success", title: t("liveTelemetryTitle"), description: msg });
      }

      await loadWeather();
    } catch {
      const msg = t("syncNetErrDesc");
      setBanner({ type: "error", message: msg });
      toast({ variant: "error", title: t("syncFailedTitle"), description: msg });
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
        const msg = data.message ?? data.error ?? t("evalNotTriggeredTitle");
        setBanner({
          type: response.status === 422 || response.status === 409 ? "warning" : "error",
          message: msg,
        });
        toast({
          variant: response.status === 409 ? "warning" : "error",
          title: response.status === 409 ? t("duplicateBlockedTitle") : t("evalNotTriggeredTitle"),
          description: msg,
        });
        return;
      }

      const msg = `${t("disbursedAmount", { amount: formatCurrency(data.claim?.payoutAmount ?? 0) })}${data.claim?.transactionId ? ` (Txn: ${data.claim.transactionId})` : ""}`;
      setBanner({ type: "success", message: msg });
      toast({ variant: "success", title: t("payoutDisbursedTitle"), description: msg });

      await loadWeather();
      router.refresh();
    } catch {
      const msg = t("evalErrDesc");
      setBanner({ type: "error", message: msg });
      toast({ variant: "error", title: t("evalErrTitle"), description: msg });
    } finally {
      setEvaluatingPolicyId(null);
    }
  };

  const latestResultByFarm = useMemo(() => {
    const map = new Map<string, ResilienceSyncResult>();
    for (const r of lastSyncResults) map.set(r.farmId, r);
    return map;
  }, [lastSyncResults]);

  const riskExposurePct =
    kpis.totalLiability > 0
      ? Math.round((kpis.activeRiskExposure / kpis.totalLiability) * 100)
      : 0;

  const isAnySyncRunning = syncingAll || syncingFarmId !== null;

  return (
    <div className="space-y-6">
      {/* Compact Dark Emerald-to-Teal Hero Summary Banner */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950 via-emerald-800 to-teal-700 p-6 text-white shadow-md">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-teal-400/15 blur-2xl"
        />
        <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-200">
              {isAdmin ? t("monitorEyebrowAdmin") : t("monitorEyebrowFarmer", { name: user.name })}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
              {t("monitorHeading")}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-emerald-100/90">{t("monitorSubtitle")}</p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleSync()}
              disabled={isAnySyncRunning || farms.length === 0}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-50 disabled:opacity-50"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5 shrink-0 text-emerald-700", syncingAll && "animate-spin")}
                aria-hidden="true"
              />
              <span>{syncingAll ? t("syncingWeather") : t("triggerWeatherSync")}</span>
            </button>
            <Link
              href="/claims"
              className="inline-flex items-center whitespace-nowrap rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-xs font-medium text-white backdrop-blur-md transition hover:bg-white/20"
            >
              {t("navClaims")}
            </Link>
          </div>
        </div>
      </section>

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* Fintech KPI Cards with Top Accent Borders & Gradient Icon Badges */}
          <section
            aria-label="Aggregate Risk and Financial KPIs"
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4"
          >
            <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 border-t-2 border-t-emerald-500/80 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  {t("totalLiability")}
                </span>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-600/20">
                  <Wallet className="h-4 w-4" aria-hidden="true" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-semibold tracking-tight text-slate-900">
                  {formatCurrency(kpis.totalLiability)}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {t("kpiActiveContractsSub", { count: kpis.activePoliciesCount })}
                </p>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 border-t-2 border-t-teal-500/80 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  {t("totalPayoutsIssued")}
                </span>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-sm shadow-teal-600/20">
                  <Banknote className="h-4 w-4" aria-hidden="true" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-semibold tracking-tight text-slate-900">
                  {formatCurrency(kpis.totalPayoutsIssued)}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {t("kpiSettledPayoutsSub", { count: kpis.disbursedClaimsCount })}
                </p>
              </div>
            </div>

            <div
              className={cn(
                "flex flex-col justify-between rounded-xl border border-slate-200/80 border-t-2 bg-white p-5 shadow-xs",
                kpis.breachedPoliciesCount > 0 ? "border-t-rose-500/80" : "border-t-amber-500/80"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  {t("activeRiskExposure")}
                </span>
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm",
                    kpis.breachedPoliciesCount > 0
                      ? "from-rose-500 to-pink-600 shadow-rose-500/20"
                      : "from-amber-500 to-orange-500 shadow-amber-500/20"
                  )}
                >
                  <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-semibold tracking-tight text-slate-900">
                  {formatCurrency(kpis.activeRiskExposure)}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {t("kpiRiskExposureSub", {
                    pct: riskExposurePct,
                    warning: kpis.atRiskPoliciesCount,
                    breached: kpis.breachedPoliciesCount,
                  })}
                </p>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 border-t-2 border-t-sky-500/80 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  {t("safeVsMonitored")}
                </span>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm shadow-sky-500/20">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-semibold tracking-tight text-slate-900">
                  {kpis.healthyPoliciesCount}{" "}
                  <span className="text-sm font-normal text-slate-500">
                    {t("kpiSafeTag", { count: kpis.activePoliciesCount })}
                  </span>
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {t("kpiMonitoredPlotsSub", { count: kpis.monitoredFarmsCount })}
                </p>
              </div>
            </div>
          </section>

          {banner && (
            <div
              role={banner.type === "error" ? "alert" : "status"}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border p-4 text-xs font-medium",
                banner.type === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800",
                banner.type === "warning" && "border-amber-200 bg-amber-50 text-amber-800",
                banner.type === "error" && "border-rose-200 bg-rose-50 text-rose-800"
              )}
            >
              {banner.type === "success" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{banner.message}</span>
            </div>
          )}

          {/* Geospatial Risk Map + Recharts Analytics */}
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

          {/* A06 Fault Injector (Admin) */}
          {isAdmin && (
            <WeatherFaultInjector
              farms={farms.map((f) => ({ id: f.id, name: f.name }))}
              toggles={faultToggles}
              onChangeToggles={setFaultToggles}
              onRunTest={(farmId) => handleSync(farmId)}
              isRunning={isAnySyncRunning}
              lastResults={lastSyncResults}
            />
          )}

          {/* District Plot Cards */}
          {farms.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <CloudSun className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-slate-900">{t("noMonitoredFarms")}</p>
              <Link
                href="/farms"
                className="mt-4 inline-flex items-center whitespace-nowrap rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-medium text-white shadow-sm shadow-emerald-600/20 transition hover:from-emerald-700 hover:to-teal-700"
              >
                {t("registerFarmBtn")}
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-xs font-medium uppercase tracking-wider text-slate-500">
                {t("districtTelemetryHeading", { count: farms.length })}
              </h2>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {farms.map((farm) => {
                  const farmSyncTrace = latestResultByFarm.get(farm.id);

                  return (
                    <article
                      key={farm.id}
                      className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-slate-900">{farm.name}</h3>
                            <span
                              className={cn(
                                "whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                                farm.pinStatus === "BREACHED"
                                  ? "border-rose-200 bg-rose-50 text-rose-700"
                                  : farm.pinStatus === "WARNING"
                                    ? "border-amber-200 bg-amber-50 text-amber-700"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                              )}
                            >
                              {translateStatus(farm.pinStatus)}
                            </span>
                            {farmSyncTrace && (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                  farmSyncTrace.source === "LIVE_API"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-amber-200 bg-amber-50 text-amber-700"
                                )}
                              >
                                {farmSyncTrace.source === "CACHE_FALLBACK" && (
                                  <Database className="h-3 w-3 shrink-0" />
                                )}
                                {translateStatus(farmSyncTrace.source)}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>{farm.cropType}</span>
                            <span>·</span>
                            <span>{formatLandArea(farm.sizeHectares)}</span>
                            <span>·</span>
                            <span className="font-mono">
                              {farm.latitude.toFixed(4)}, {farm.longitude.toFixed(4)}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSync(farm.id)}
                          disabled={isAnySyncRunning}
                          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          <RefreshCw
                            className={cn("h-3 w-3 shrink-0", syncingFarmId === farm.id && "animate-spin")}
                          />
                          <span>{t("syncBtn")}</span>
                        </button>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-3">
                        <div className="rounded-lg border border-slate-200/70 bg-slate-50/70 p-3">
                          <div className="flex items-center gap-1 text-[11px] text-slate-500">
                            <CloudRain className="h-3.5 w-3.5 shrink-0 text-sky-600" />
                            <span className="truncate">{t("rain24h")}</span>
                          </div>
                          <p className="mt-1 text-base font-semibold text-slate-900">
                            {farm.weather ? `${farm.weather.rainMm} mm` : "—"}
                          </p>
                        </div>

                        <div className="rounded-lg border border-slate-200/70 bg-slate-50/70 p-3">
                          <div className="flex items-center gap-1 text-[11px] text-slate-500">
                            <Thermometer className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                            <span className="truncate">{t("peakTemp")}</span>
                          </div>
                          <p className="mt-1 text-base font-semibold text-slate-900">
                            {farm.weather ? `${farm.weather.tempMaxC} °C` : "—"}
                          </p>
                        </div>

                        <div className="rounded-lg border border-slate-200/70 bg-slate-50/70 p-3">
                          <div className="flex items-center gap-1 text-[11px] text-slate-500">
                            <Sun className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                            <span className="truncate">{t("dryStreak")}</span>
                          </div>
                          <p className="mt-1 text-base font-semibold text-slate-900">
                            {farm.weather ? `${farm.weather.droughtDays} ${t("unitDaysShort")}` : "—"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-4">
                        {farm.policies.map((policy) => {
                          const meta = getMetricMeta(policy.metricType);
                          const riskStyle = RISK_STYLES[policy.riskLevel];
                          const progressPct = Math.min(100, Math.round(policy.ratio * 100));
                          const defaultSimValue = Math.round(policy.thresholdValue * 1.25);

                          return (
                            <div
                              key={policy.id}
                              className="rounded-lg border border-slate-200/70 bg-slate-50/50 p-3.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-medium text-slate-700">
                                    {policy.metricType}
                                  </span>
                                  <span className="font-medium text-slate-900">
                                    {policy.observedValue !== null
                                      ? `${policy.observedValue}${meta.unit}`
                                      : "—"}{" "}
                                    / {policy.thresholdValue}
                                    {meta.unit}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-slate-900">
                                    {formatCurrency(policy.coverageAmount)}
                                  </span>
                                  <span
                                    className={cn(
                                      "whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium",
                                      riskStyle.badge
                                    )}
                                  >
                                    {translateStatus(policy.riskLevel)}
                                  </span>
                                </div>
                              </div>

                              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className={cn("h-full rounded-full", riskStyle.bar)}
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>

                              {policy.status === "ACTIVE" && (
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                  {policy.riskLevel === "BREACHED" ? (
                                    <button
                                      type="button"
                                      onClick={() => handleEvaluatePolicy(policy, false)}
                                      disabled={evaluatingPolicyId === policy.id}
                                      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm shadow-emerald-600/20 transition hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
                                    >
                                      <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                                      <span>
                                        {evaluatingPolicyId === policy.id
                                          ? t("executingPayout")
                                          : t("executePayoutBtn")}
                                      </span>
                                    </button>
                                  ) : (
                                    <span className="text-[11px] text-slate-500">
                                      {t("pctOfThreshold", { pct: progressPct })}
                                    </span>
                                  )}

                                  {isAdmin && (
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        aria-label={`Simulated weather value for ${policy.metricType}`}
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
                                        className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-emerald-700 focus:outline-none"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleEvaluatePolicy(policy, true)}
                                        disabled={evaluatingPolicyId === policy.id}
                                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50"
                                      >
                                        <Flame className="h-3 w-3 shrink-0 text-amber-600" />
                                        <span>{t("simulateBtn")}</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}

                              {policy.status === "CLAIMED" && policy.claims[0] && (
                                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                                  <span className="inline-flex items-center gap-1">
                                    <Play className="h-3 w-3 shrink-0 text-emerald-700" />
                                    {t("disbursedAmount", {
                                      amount: formatCurrency(policy.claims[0].payoutAmount),
                                    })}
                                  </span>
                                  <Link
                                    href="/claims"
                                    className="whitespace-nowrap font-medium text-emerald-700 hover:underline"
                                  >
                                    {t("viewReceiptArrow")}
                                  </Link>
                                </div>
                              )}
                            </div>
                          );
                        })}
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
