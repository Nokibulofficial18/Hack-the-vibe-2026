"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  FileWarning,
  Play,
  Timer,
  WifiOff,
  XCircle,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface FaultToggles {
  simulateTimeout: boolean;
  simulateMalformedJson: boolean;
  forceOffline: boolean;
}

export interface AttemptLogEntry {
  attempt: number;
  status: string;
  durationMs: number;
  backoffMs: number;
  message: string;
  timestamp: string;
}

export interface ResilienceSyncResult {
  farmId: string;
  farmName: string;
  source: "LIVE_API" | "CACHE_FALLBACK" | "FAILED";
  attempts: number;
  totalDurationMs: number;
  fetchedAt: string | null;
  cacheAgeMinutes: number | null;
  warningBanner: string | null;
  errorSummary: string | null;
  rateLimitRemaining: number;
  attemptLogs: AttemptLogEntry[];
}

interface WeatherFaultInjectorProps {
  farms: Array<{ id: string; name: string }>;
  toggles: FaultToggles;
  onChangeToggles: (next: FaultToggles) => void;
  onRunTest: (farmId?: string) => Promise<void>;
  isRunning: boolean;
  lastResults: ResilienceSyncResult[];
}

const ATTEMPT_BADGE: Record<string, string> = {
  SUCCESS: "border-emerald-200 bg-emerald-50 text-emerald-700",
  TIMEOUT: "border-amber-200 bg-amber-50 text-amber-700",
  MALFORMED_JSON: "border-rose-200 bg-rose-50 text-rose-700",
  HTTP_ERROR: "border-rose-200 bg-rose-50 text-rose-700",
  NETWORK_ERROR: "border-rose-200 bg-rose-50 text-rose-700",
  RATE_LIMITED: "border-slate-200 bg-slate-100 text-slate-700",
  OFFLINE_FORCED: "border-slate-200 bg-slate-100 text-slate-700",
};

export function WeatherFaultInjector({
  farms,
  toggles,
  onChangeToggles,
  onRunTest,
  isRunning,
  lastResults,
}: WeatherFaultInjectorProps) {
  const { t, translateStatus } = useTranslation();
  const [targetFarmId, setTargetFarmId] = useState<string>(farms[0]?.id ?? "ALL");
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (farms.length > 0 && targetFarmId !== "ALL" && !farms.some((f) => f.id === targetFarmId)) {
      setTargetFarmId(farms[0].id);
    }
  }, [farms, targetFarmId]);

  useEffect(() => {
    if (!isRunning) {
      setElapsedMs(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => setElapsedMs(Date.now() - start), 100);
    return () => clearInterval(interval);
  }, [isRunning]);

  const toggleField = (key: keyof FaultToggles) => {
    onChangeToggles({ ...toggles, [key]: !toggles[key] });
  };

  const activeFaultCount = [
    toggles.simulateTimeout,
    toggles.simulateMalformedJson,
    toggles.forceOffline,
  ].filter(Boolean).length;

  return (
    <section
      aria-labelledby="a06-fault-injector-heading"
      className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs"
    >
      <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-center">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            {t("a06Eyebrow")}
          </p>
          <h2 id="a06-fault-injector-heading" className="mt-1 text-sm font-semibold text-slate-900">
            {t("a06Heading")}
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">{t("a06Subtitle")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="fault-target-farm" className="sr-only">
            {t("targetFarmPlot")}
          </label>
          <select
            id="fault-target-farm"
            value={targetFarmId}
            onChange={(e) => setTargetFarmId(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-xs focus:border-emerald-700 focus:outline-none"
          >
            {farms.map((farm) => (
              <option key={farm.id} value={farm.id}>
                {farm.name}
              </option>
            ))}
            <option value="ALL">{t("allMonitoredFarmsOption", { count: farms.length })}</option>
          </select>

          <button
            type="button"
            onClick={() => onRunTest(targetFarmId === "ALL" ? undefined : targetFarmId)}
            disabled={isRunning || farms.length === 0}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 py-2 text-xs font-medium text-white shadow-sm shadow-emerald-600/20 transition hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {isRunning
                ? t("testingSeconds", { sec: (elapsedMs / 1000).toFixed(1) })
                : activeFaultCount > 0
                  ? t("runFaultTest", { count: activeFaultCount })
                  : t("testLiveSync")}
            </span>
          </button>
        </div>
      </div>

      {/* Minimalist Toggle Switches */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          {
            key: "simulateTimeout" as const,
            title: t("faultTimeoutTitle"),
            desc: t("faultTimeoutDesc"),
            icon: Timer,
          },
          {
            key: "simulateMalformedJson" as const,
            title: t("faultMalformedTitle"),
            desc: t("faultMalformedDesc"),
            icon: FileWarning,
          },
          {
            key: "forceOffline" as const,
            title: t("faultOfflineTitle"),
            desc: t("faultOfflineDesc"),
            icon: WifiOff,
          },
        ].map((item) => {
          const Icon = item.icon;
          const active = toggles[item.key];
          return (
            <div
              key={item.key}
              className={cn(
                "flex items-start justify-between gap-3 rounded-xl border p-4 transition",
                active
                  ? "border-emerald-200 bg-emerald-50/40"
                  : "border-slate-200/80 bg-slate-50/40"
              )}
            >
              <div className="flex items-start gap-2.5">
                <Icon
                  className={cn("mt-0.5 h-4 w-4 shrink-0", active ? "text-emerald-700" : "text-slate-400")}
                  aria-hidden="true"
                />
                <div>
                  <p className="text-xs font-medium text-slate-900">{item.title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{item.desc}</p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={active}
                aria-label={item.title}
                onClick={() => toggleField(item.key)}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700",
                  active ? "bg-emerald-700" : "bg-slate-200"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition",
                    active ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>
          );
        })}
      </div>

      {/* Execution Trace */}
      {lastResults.length > 0 && (
        <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-700">
              {t("executionTraceHeading", { count: lastResults.length })}
            </span>
            <span className="font-mono text-[11px] text-slate-500">
              {t("quotaLabel", { remaining: lastResults[0].rateLimitRemaining })}
            </span>
          </div>

          {lastResults.map((res) => (
            <div
              key={res.farmId}
              className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-900">{res.farmName}</span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      res.source === "LIVE_API"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : res.source === "CACHE_FALLBACK"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-rose-200 bg-rose-50 text-rose-700"
                    )}
                  >
                    {res.source === "LIVE_API" ? (
                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                    ) : res.source === "CACHE_FALLBACK" ? (
                      <Database className="h-3 w-3 shrink-0" />
                    ) : (
                      <XCircle className="h-3 w-3 shrink-0" />
                    )}
                    {translateStatus(res.source)}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-slate-500">
                  {t("attemptsSummary", { attempts: res.attempts, ms: res.totalDurationMs })}
                </span>
              </div>

              {res.warningBanner && (
                <div
                  role="status"
                  className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>{res.warningBanner}</span>
                </div>
              )}

              {res.attemptLogs.length > 0 && (
                <ol className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200/70 bg-white">
                  {res.attemptLogs.map((log) => (
                    <li
                      key={`${res.farmId}-${log.attempt}-${log.timestamp}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] font-medium text-slate-500">
                          #{log.attempt}
                        </span>
                        <span
                          className={cn(
                            "whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium",
                            ATTEMPT_BADGE[log.status] ?? "border-slate-200 bg-slate-100 text-slate-700"
                          )}
                        >
                          {log.status}
                        </span>
                        <span className="text-slate-700">{log.message}</span>
                      </div>
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500">
                        <Clock className="h-3 w-3 shrink-0" />
                        {log.durationMs}ms
                        {log.backoffMs > 0 ? ` (+${log.backoffMs}ms)` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
