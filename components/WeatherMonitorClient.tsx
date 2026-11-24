"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
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
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getMetricMeta, type ParsedWeatherReading, type RiskLevel } from "@/lib/domain";
import { cn, formatCurrency } from "@/lib/utils";
import {
  WeatherFaultInjector,
  type FaultToggles,
  type ResilienceSyncResult,
} from "@/components/WeatherFaultInjector";

interface EvaluatedPolicy {
  id: string;
  metricType: string;
  thresholdValue: number;
  coverageAmount: number;
  status: string;
  observedValue: number | null;
  riskLevel: RiskLevel;
  ratio: number;
  claims: Array<{ id: string; status: string; payoutAmount: number }>;
}

interface MonitoredFarm {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  cropType: string;
  sizeHectares: number;
  user: { id: string; name: string; email: string };
  policies: EvaluatedPolicy[];
  weather: ParsedWeatherReading | null;
  lastFetchedAt: string | null;
  cacheAgeMinutes: number | null;
  dataSource: string;
  farmStatus: "NORMAL" | "ELEVATED_RISK" | "TRIGGER_BREACHED";
}

interface SyncBanner {
  type: "success" | "warning" | "error";
  message: string;
}

const RISK_STYLES: Record<RiskLevel, { badge: string; bar: string; label: string }> = {
  HEALTHY: {
    badge: "bg-emerald-100 text-emerald-800",
    bar: "bg-emerald-500",
    label: "HEALTHY",
  },
  AT_RISK: {
    badge: "bg-amber-100 text-amber-800",
    bar: "bg-amber-500",
    label: "AT RISK",
  },
  BREACHED: {
    badge: "bg-rose-100 text-rose-800",
    bar: "bg-rose-600",
    label: "TRIGGER BREACHED",
  },
  CLAIMED: {
    badge: "bg-indigo-100 text-indigo-800",
    bar: "bg-indigo-500",
    label: "CLAIMED",
  },
  UNKNOWN: {
    badge: "bg-slate-100 text-slate-600",
    bar: "bg-slate-400",
    label: "UNSYNCED",
  },
};

export function WeatherMonitorClient() {
  const { user, isAdmin, getAuthHeaders } = useAuth();
  const router = useRouter();

  const [farms, setFarms] = useState<MonitoredFarm[]>([]);
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
        const data = (await response.json()) as { farms: MonitoredFarm[] };
        setFarms(data.farms);
      }
    } catch {
      setBanner({
        type: "error",
        message: "Failed to load monitored farm telemetry.",
      });
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    void loadWeather();
  }, [user.id, loadWeather]);

  // Reset fault injection logs when switching away from Admin
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
        setBanner({ type: "error", message: data.error ?? "Weather sync failed." });
        return;
      }

      const results = data.results ?? [];
      setLastSyncResults(results);

      const fallbackResults = results.filter((r) => r.source === "CACHE_FALLBACK");
      const liveResults = results.filter((r) => r.source === "LIVE_API");
      const failedResults = results.filter((r) => r.source === "FAILED");

      if (failedResults.length > 0 && liveResults.length === 0 && fallbackResults.length === 0) {
        setBanner({
          type: "error",
          message:
            failedResults[0].warningBanner ??
            "External weather API failed and no cached snapshot is available.",
        });
      } else if (fallbackResults.length > 0 && liveResults.length === 0) {
        setBanner({
          type: "warning",
          message:
            fallbackResults[0].warningBanner ??
            `External API unavailable for ${fallbackResults.length} plot(s). Displaying cached weather snapshot.`,
        });
      } else if (fallbackResults.length > 0) {
        setBanner({
          type: "warning",
          message: `Synced ${liveResults.length} plot(s) from live Open-Meteo API and served ${fallbackResults.length} from WeatherCache fallback.`,
        });
      } else {
        setBanner({
          type: "success",
          message: `Successfully synced live Open-Meteo telemetry for ${liveResults.length} monitored plot(s).`,
        });
      }

      await loadWeather();
    } catch {
      setBanner({
        type: "error",
        message: "Network error while syncing meteorological feeds.",
      });
    } finally {
      setSyncingFarmId(null);
      setSyncingAll(false);
    }
  };

  const handleEvaluatePolicy = async (policy: EvaluatedPolicy, useSimulatedOverride = false) => {
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
        claim?: { id: string; payoutAmount: number; idempotencyKey: string };
        error?: string;
      };

      if (!response.ok) {
        setBanner({
          type: response.status === 422 ? "warning" : "error",
          message: data.error ?? "Policy evaluation did not trigger a claim.",
        });
        return;
      }

      setBanner({
        type: "success",
        message: `Parametric claim executed! Payout of ${formatCurrency(data.claim?.payoutAmount ?? 0)} disbursed (Key: ${data.claim?.idempotencyKey}). View full audit logs in Claim Ledger.`,
      });

      await loadWeather();
      router.refresh();
    } catch {
      setBanner({
        type: "error",
        message: "Failed to run parametric claim evaluation.",
      });
    } finally {
      setEvaluatingPolicyId(null);
    }
  };

  const summary = useMemo(() => {
    const allPolicies = farms.flatMap((f) => f.policies);
    const activePolicies = allPolicies.filter((p) => p.status === "ACTIVE");
    const breached = activePolicies.filter((p) => p.riskLevel === "BREACHED").length;
    const atRisk = activePolicies.filter((p) => p.riskLevel === "AT_RISK").length;
    const healthy = activePolicies.filter((p) => p.riskLevel === "HEALTHY").length;
    return {
      farmCount: farms.length,
      activeCount: activePolicies.length,
      breached,
      atRisk,
      healthy,
    };
  }, [farms]);

  const latestResultByFarm = useMemo(() => {
    const map = new Map<string, ResilienceSyncResult>();
    for (const r of lastSyncResults) {
      map.set(r.farmId, r);
    }
    return map;
  }, [lastSyncResults]);

  const isAnySyncRunning = syncingAll || syncingFarmId !== null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {isAdmin ? (
              <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" aria-hidden="true" />
            ) : (
              <Sprout className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            )}
            {isAdmin
              ? "Admin Command · Global Weather Telemetry & A06 Resilience Controls"
              : `Farmer Monitor · ${user.name}'s Plots Only`}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            Weather Monitoring Engine
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Resilient Open-Meteo environmental monitoring (3.5s timeout, exponential backoff, PostgreSQL cache fallback) with automatic threshold breach detection.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => handleSync()}
            disabled={isAnySyncRunning || farms.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={cn("h-4 w-4", syncingAll && "animate-spin")}
              aria-hidden="true"
            />
            {syncingAll ? "Syncing Weather..." : "Sync All Monitored Farms"}
          </button>
          <Link
            href="/claims"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Open Claim Ledger
          </Link>
        </div>
      </div>

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
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-600" aria-hidden="true" />
            <span>
              <strong>Resilience Pipeline Active:</strong> All weather syncs use 3.5s timeout, 3x exponential retries, and WeatherCache fallback. Switch to <strong>Admin</strong> in the header to open the A06 Fault Injector controls.
            </span>
          </span>
        </div>
      )}

      {/* KPI Strip */}
      <section aria-label="Monitoring Summary" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Monitored Plots
          </p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900">{summary.farmCount}</p>
          <p className="text-xs text-slate-500">{summary.activeCount} active trigger rules</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Healthy Policies
          </p>
          <p className="mt-1.5 text-2xl font-bold text-emerald-900">{summary.healthy}</p>
          <p className="text-xs text-emerald-700/80">Below 75% risk threshold</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Elevated Risk
          </p>
          <p className="mt-1.5 text-2xl font-bold text-amber-900">{summary.atRisk}</p>
          <p className="text-xs text-amber-700/80">75%–99% of trigger level</p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
            Triggers Breached
          </p>
          <p className="mt-1.5 text-2xl font-bold text-rose-900">{summary.breached}</p>
          <p className="text-xs text-rose-700/80">Eligible for instant payout</p>
        </div>
      </section>

      {/* Status Banner */}
      {banner && (
        <div
          role={banner.type === "error" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-2.5 rounded-xl border p-4 text-xs font-medium",
            banner.type === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900",
            banner.type === "warning" && "border-amber-200 bg-amber-50 text-amber-900",
            banner.type === "error" && "border-rose-200 bg-rose-50 text-rose-900"
          )}
        >
          {banner.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{banner.message}</span>
        </div>
      )}

      {/* Monitored Farm Cards */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          Loading environmental telemetry for {user.name}...
        </div>
      ) : farms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <CloudSun className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-slate-700">No farms under monitoring</p>
          <p className="mt-1 text-xs text-slate-500">
            Register a farm plot and attach a parametric policy to view live climate monitoring here.
          </p>
          <Link
            href="/farms"
            className="mt-4 inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Register a Farm Plot
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {farms.map((farm) => {
            const farmSyncTrace = latestResultByFarm.get(farm.id);

            return (
              <article
                key={farm.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div>
                  {/* Farm Header */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold text-slate-900">{farm.name}</h2>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                            farm.farmStatus === "TRIGGER_BREACHED"
                              ? "bg-rose-100 text-rose-800"
                              : farm.farmStatus === "ELEVATED_RISK"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-emerald-100 text-emerald-800"
                          )}
                        >
                          {farm.farmStatus.replace("_", " ")}
                        </span>
                        {farmSyncTrace && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
                              farmSyncTrace.source === "LIVE_API"
                                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                            )}
                          >
                            {farmSyncTrace.source === "CACHE_FALLBACK" && (
                              <Database className="h-3 w-3" aria-hidden="true" />
                            )}
                            {farmSyncTrace.source} ({farmSyncTrace.attempts}/3)
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span>{farm.cropType}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 font-mono">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                          {farm.latitude.toFixed(4)}, {farm.longitude.toFixed(4)}
                        </span>
                        {isAdmin && (
                          <>
                            <span>·</span>
                            <span className="font-medium text-indigo-700">{farm.user.name}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSync(farm.id)}
                      disabled={isAnySyncRunning}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                    >
                      <RefreshCw
                        className={cn("h-3.5 w-3.5", syncingFarmId === farm.id && "animate-spin")}
                        aria-hidden="true"
                      />
                      Sync Plot
                    </button>
                  </div>

                  {/* Meteorological Readings Grid */}
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-3">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-700">
                        <CloudRain className="h-3.5 w-3.5" aria-hidden="true" />
                        24h Rainfall
                      </div>
                      <p className="mt-1 text-xl font-bold text-sky-950">
                        {farm.weather ? `${farm.weather.rainMm} mm` : "—"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-orange-100 bg-orange-50/70 p-3">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-orange-700">
                        <Thermometer className="h-3.5 w-3.5" aria-hidden="true" />
                        Peak Temp
                      </div>
                      <p className="mt-1 text-xl font-bold text-orange-950">
                        {farm.weather ? `${farm.weather.tempMaxC} °C` : "—"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
                        <Sun className="h-3.5 w-3.5" aria-hidden="true" />
                        Dry Streak
                      </div>
                      <p className="mt-1 text-xl font-bold text-amber-950">
                        {farm.weather ? `${farm.weather.droughtDays} d` : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      Last telemetry:{" "}
                      {farm.lastFetchedAt
                        ? new Date(farm.lastFetchedAt).toLocaleString()
                        : "Not yet synced"}
                    </span>
                    <span>{farm.weather?.timezone ?? "UTC"}</span>
                  </div>

                  {/* Policy Threshold Gauges */}
                  <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Armed Parametric Triggers ({farm.policies.length})
                      </h3>
                      <Link
                        href={`/policies?farmId=${farm.id}`}
                        className="text-xs font-semibold text-emerald-700 hover:underline"
                      >
                        + Add Policy
                      </Link>
                    </div>

                    {farm.policies.length === 0 ? (
                      <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
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
                            className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="rounded bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">
                                  {policy.metricType}
                                </span>
                                <span className="text-xs font-semibold text-slate-800">
                                  {policy.observedValue !== null
                                    ? `${policy.observedValue}${meta.unit}`
                                    : "—"}{" "}
                                  / {policy.thresholdValue}
                                  {meta.unit}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-700">
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

                            {/* Threshold Meter Bar */}
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

                            {/* Trigger Evaluation Actions */}
                            {policy.status === "ACTIVE" && (
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                {policy.riskLevel === "BREACHED" ? (
                                  <button
                                    type="button"
                                    onClick={() => handleEvaluatePolicy(policy, false)}
                                    disabled={evaluatingPolicyId === policy.id}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                                  >
                                    <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                                    {evaluatingPolicyId === policy.id
                                      ? "Executing Payout..."
                                      : "Execute Parametric Payout"}
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-slate-500">
                                    {progressPct}% of breach trigger ({meta.shortLabel})
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
                                      className="w-20 rounded-md border border-indigo-200 bg-white px-2 py-1 font-mono text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleEvaluatePolicy(policy, true)}
                                      disabled={evaluatingPolicyId === policy.id}
                                      className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
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
                              <div className="mt-2.5 flex items-center justify-between text-xs text-indigo-700">
                                <span className="inline-flex items-center gap-1 font-medium">
                                  <Play className="h-3 w-3" aria-hidden="true" />
                                  Payout issued: {formatCurrency(policy.claims[0].payoutAmount)}
                                </span>
                                <Link href="/claims" className="font-semibold hover:underline">
                                  Audit Log →
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
      )}
    </div>
  );
}
