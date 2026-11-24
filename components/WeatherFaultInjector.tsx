"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  FileWarning,
  Play,
  ShieldAlert,
  Timer,
  WifiOff,
  XCircle,
} from "lucide-react";
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
  SUCCESS: "bg-emerald-100 text-emerald-800",
  TIMEOUT: "bg-amber-100 text-amber-900",
  MALFORMED_JSON: "bg-rose-100 text-rose-800",
  HTTP_ERROR: "bg-rose-100 text-rose-800",
  NETWORK_ERROR: "bg-rose-100 text-rose-800",
  RATE_LIMITED: "bg-purple-100 text-purple-800",
  OFFLINE_FORCED: "bg-slate-200 text-slate-800",
};

export function WeatherFaultInjector({
  farms,
  toggles,
  onChangeToggles,
  onRunTest,
  isRunning,
  lastResults,
}: WeatherFaultInjectorProps) {
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
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 100);
    return () => clearInterval(interval);
  }, [isRunning]);

  const toggleField = (key: keyof FaultToggles) => {
    const nextValue = !toggles[key];
    onChangeToggles({
      ...toggles,
      [key]: nextValue,
    });
  };

  const activeFaultCount = [
    toggles.simulateTimeout,
    toggles.simulateMalformedJson,
    toggles.forceOffline,
  ].filter(Boolean).length;

  return (
    <section
      aria-labelledby="a06-fault-injector-heading"
      className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 via-white to-slate-50 p-6 shadow-sm"
    >
      <div className="flex flex-col justify-between gap-4 border-b border-indigo-100 pb-4 lg:flex-row lg:items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-indigo-800">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            Advanced Challenge A06 · Weather API Resilience &amp; Fault Injector
          </div>
          <h2
            id="a06-fault-injector-heading"
            className="mt-2 text-lg font-bold text-slate-900"
          >
            Live Resilience Pipeline Tester
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Verify strict <strong>3.5s AbortController timeout</strong>,{" "}
            <strong>exponential backoff retries (3x)</strong>, corrupted payload rejection, and
            automatic <strong>WeatherCache</strong> fallback.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label htmlFor="fault-target-farm" className="sr-only">
            Target Farm Plot
          </label>
          <select
            id="fault-target-farm"
            value={targetFarmId}
            onChange={(e) => setTargetFarmId(e.target.value)}
            className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none"
          >
            {farms.map((farm) => (
              <option key={farm.id} value={farm.id}>
                Target: {farm.name}
              </option>
            ))}
            <option value="ALL">Target: All Monitored Farms ({farms.length})</option>
          </select>

          <button
            type="button"
            onClick={() => onRunTest(targetFarmId === "ALL" ? undefined : targetFarmId)}
            disabled={isRunning || farms.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            {isRunning
              ? `Testing (${(elapsedMs / 1000).toFixed(1)}s)...`
              : activeFaultCount > 0
                ? `Run Fault Test (${activeFaultCount} Active)`
                : "Test Live Open-Meteo Sync"}
          </button>
        </div>
      </div>

      {/* Interactive Toggle Switches */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* Toggle 1: Simulate API Timeout */}
        <div
          className={cn(
            "flex items-start justify-between gap-3 rounded-xl border p-3.5 transition",
            toggles.simulateTimeout
              ? "border-amber-300 bg-amber-50/70 shadow-sm"
              : "border-slate-200 bg-white"
          )}
        >
          <div className="flex items-start gap-2.5">
            <Timer
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                toggles.simulateTimeout ? "text-amber-600" : "text-slate-400"
              )}
              aria-hidden="true"
            />
            <div>
              <p className="text-xs font-bold text-slate-900">Simulate API Timeout</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Triggers real 3.5s AbortController timeout &amp; 3 exponential backoff retries.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={toggles.simulateTimeout}
            aria-label="Simulate API Timeout"
            onClick={() => toggleField("simulateTimeout")}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1",
              toggles.simulateTimeout ? "bg-amber-500" : "bg-slate-200"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition",
                toggles.simulateTimeout ? "translate-x-4" : "translate-x-0"
              )}
            />
          </button>
        </div>

        {/* Toggle 2: Simulate Malformed JSON */}
        <div
          className={cn(
            "flex items-start justify-between gap-3 rounded-xl border p-3.5 transition",
            toggles.simulateMalformedJson
              ? "border-rose-300 bg-rose-50/70 shadow-sm"
              : "border-slate-200 bg-white"
          )}
        >
          <div className="flex items-start gap-2.5">
            <FileWarning
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                toggles.simulateMalformedJson ? "text-rose-600" : "text-slate-400"
              )}
              aria-hidden="true"
            />
            <div>
              <p className="text-xs font-bold text-slate-900">Simulate Malformed JSON</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Injects corrupted payload (&#123; invalid: true &#125;), rejects dirty values &amp; falls back.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={toggles.simulateMalformedJson}
            aria-label="Simulate Malformed JSON"
            onClick={() => toggleField("simulateMalformedJson")}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1",
              toggles.simulateMalformedJson ? "bg-rose-600" : "bg-slate-200"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition",
                toggles.simulateMalformedJson ? "translate-x-4" : "translate-x-0"
              )}
            />
          </button>
        </div>

        {/* Toggle 3: Force Offline / Cache Mode */}
        <div
          className={cn(
            "flex items-start justify-between gap-3 rounded-xl border p-3.5 transition",
            toggles.forceOffline
              ? "border-slate-400 bg-slate-100 shadow-sm"
              : "border-slate-200 bg-white"
          )}
        >
          <div className="flex items-start gap-2.5">
            <WifiOff
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                toggles.forceOffline ? "text-slate-800" : "text-slate-400"
              )}
              aria-hidden="true"
            />
            <div>
              <p className="text-xs font-bold text-slate-900">Force Offline / Cache Mode</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Skips external Open-Meteo network calls and reads directly from WeatherCache.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={toggles.forceOffline}
            aria-label="Force Offline / Cache Mode"
            onClick={() => toggleField("forceOffline")}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1",
              toggles.forceOffline ? "bg-slate-700" : "bg-slate-200"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition",
                toggles.forceOffline ? "translate-x-4" : "translate-x-0"
              )}
            />
          </button>
        </div>
      </div>

      {/* Live Resilience Telemetry & Retry Log Output */}
      {lastResults.length > 0 && (
        <div className="mt-5 space-y-3 border-t border-indigo-100 pt-4">
          <div className="flex items-center justify-between">
            <h3 className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-700">
              <Activity className="h-3.5 w-3.5 text-indigo-600" aria-hidden="true" />
              Last Pipeline Execution Trace ({lastResults.length} plot
              {lastResults.length === 1 ? "" : "s"})
            </h3>
            <span className="text-[11px] text-slate-500">
              Rate-Limit Window Remaining: {lastResults[0].rateLimitRemaining} / 30
            </span>
          </div>

          <div className="space-y-3">
            {lastResults.map((res) => (
              <div
                key={res.farmId}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{res.farmName}</span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                        res.source === "LIVE_API"
                          ? "bg-emerald-100 text-emerald-800"
                          : res.source === "CACHE_FALLBACK"
                            ? "bg-amber-100 text-amber-900"
                            : "bg-rose-100 text-rose-800"
                      )}
                    >
                      {res.source === "LIVE_API" ? (
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      ) : res.source === "CACHE_FALLBACK" ? (
                        <Database className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <XCircle className="h-3 w-3" aria-hidden="true" />
                      )}
                      {res.source}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 font-mono text-[11px] text-slate-500">
                    <span>Attempts: {res.attempts}/3</span>
                    <span>Total: {res.totalDurationMs}ms</span>
                    {res.cacheAgeMinutes !== null && res.source === "CACHE_FALLBACK" && (
                      <span>Cache Age: {res.cacheAgeMinutes}m</span>
                    )}
                  </div>
                </div>

                {res.warningBanner && (
                  <div
                    role="status"
                    className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900"
                  >
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                      aria-hidden="true"
                    />
                    <span>{res.warningBanner}</span>
                  </div>
                )}

                {res.attemptLogs.length > 0 && (
                  <ol className="mt-3 space-y-1.5">
                    {res.attemptLogs.map((log) => (
                      <li
                        key={`${res.farmId}-${log.attempt}-${log.timestamp}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11px] font-bold text-slate-600">
                            Attempt #{log.attempt}
                          </span>
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 font-mono text-[10px] font-bold",
                              ATTEMPT_BADGE[log.status] ?? "bg-slate-200 text-slate-700"
                            )}
                          >
                            {log.status}
                          </span>
                          <span className="text-slate-700">{log.message}</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {log.durationMs}ms
                          </span>
                          {log.backoffMs > 0 && (
                            <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-semibold text-indigo-700">
                              backoff +{log.backoffMs}ms
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
