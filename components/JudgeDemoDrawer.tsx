"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  FileWarning,
  FlaskConical,
  Lock,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Timer,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";
import { getPayoutMethodMeta, maskBdMobileNumber } from "@/lib/domain";
import { cn, formatCurrency } from "@/lib/utils";

interface A06AttemptLog {
  attempt: number;
  status: string;
  durationMs: number;
  backoffMs: number;
  message: string;
}

interface A06ResultState {
  mode: "TIMEOUT" | "MALFORMED";
  source: string;
  attempts: number;
  totalDurationMs: number;
  warningBanner: string | null;
  attemptLogs: A06AttemptLog[];
}

interface A07ClaimSnapshot {
  id: string;
  status: string;
  currentStep: number;
  payoutAmount: number;
  severityTier: string | null;
  payoutPercentage: number | null;
  idempotencyKey: string;
  payoutMethod: string | null;
  recipientPhone: string | null;
  transactionId: string | null;
  failureReason: string | null;
}

interface A07ResultState {
  outcome: string;
  message: string;
  stepsExecuted: string[];
  duplicateBlocked: boolean;
  claim: A07ClaimSnapshot | null;
}

interface JudgeDemoDrawerProps {
  open: boolean;
  onClose: () => void;
}

const SUNAMGANJ_FARM_ID = "farm-sunamganj-haor";
const SUNAMGANJ_POLICY_ID = "policy-sunamganj-flood";

export function JudgeDemoDrawer({ open, onClose }: JudgeDemoDrawerProps) {
  const { isAdmin, getAuthHeaders } = useAuth();
  const { t, translateStatus } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"A06" | "A07">("A06");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [a06Result, setA06Result] = useState<A06ResultState | null>(null);
  const [a07Result, setA07Result] = useState<A07ResultState | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!busyAction) {
      setElapsedMs(0);
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => setElapsedMs(Date.now() - start), 100);
    return () => clearInterval(timer);
  }, [busyAction]);

  if (!isAdmin || !open) return null;

  const runA06Test = async (mode: "TIMEOUT" | "MALFORMED") => {
    setBusyAction(mode);
    setA06Result(null);
    try {
      const response = await fetch("/api/weather", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          farmId: SUNAMGANJ_FARM_ID,
          simulateOptions:
            mode === "TIMEOUT"
              ? { simulateTimeout: true }
              : { simulateMalformedJson: true },
        }),
      });

      const data = (await response.json()) as {
        results?: Array<{
          source: string;
          attempts: number;
          totalDurationMs: number;
          warningBanner: string | null;
          attemptLogs: A06AttemptLog[];
        }>;
        error?: string;
      };

      const entry = data.results?.[0];
      if (!response.ok || !entry) {
        toast({
          variant: "error",
          title: t("syncFailedTitle"),
          description: data.error ?? t("syncNetErrDesc"),
        });
        return;
      }

      setA06Result({
        mode,
        source: entry.source,
        attempts: entry.attempts,
        totalDurationMs: entry.totalDurationMs,
        warningBanner: entry.warningBanner,
        attemptLogs: entry.attemptLogs ?? [],
      });

      toast({
        variant: "warning",
        title: t("cacheFallbackTitle"),
        description:
          entry.warningBanner ??
          t("attemptsSummary", { attempts: entry.attempts, ms: entry.totalDurationMs }),
      });
    } catch {
      toast({
        variant: "error",
        title: t("networkErrorTitle"),
        description: t("syncNetErrDesc"),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const triggerSunamganjStep4Failure = async () => {
    setBusyAction("A07_FAIL");
    try {
      const response = await fetch("/api/weather/evaluate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          policyId: SUNAMGANJ_POLICY_ID,
          observedValue: 120,
          forceSimulatedFailure: true,
        }),
      });

      const data = (await response.json()) as {
        outcome?: string;
        message?: string;
        error?: string;
        stepsExecuted?: string[];
        duplicateBlocked?: boolean;
        claim?: A07ClaimSnapshot | null;
      };

      setA07Result({
        outcome: data.outcome ?? "ERROR",
        message: data.message ?? data.error ?? t("wfPausedTitle"),
        stepsExecuted: data.stepsExecuted ?? [],
        duplicateBlocked: Boolean(data.duplicateBlocked),
        claim: data.claim ?? null,
      });

      if (data.outcome === "PAUSED_AT_STEP_4") {
        toast({
          variant: "warning",
          title: t("wfPausedTitle"),
          description: t("rolledBackPill"),
        });
      } else if (data.duplicateBlocked || response.status === 409) {
        toast({
          variant: "info",
          title: t("duplicateBlockedTitle"),
          description: data.message ?? t("wfAlreadySettledTitle"),
        });
      }

      router.refresh();
    } catch {
      toast({
        variant: "error",
        title: t("networkErrorTitle"),
        description: t("evalErrDesc"),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const resumeSunamganjWorkflow = async () => {
    const claimId = a07Result?.claim?.id;
    if (!claimId) return;

    setBusyAction("A07_RESUME");
    try {
      const response = await fetch(`/api/claims/${claimId}/resume`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ simulateStep4Failure: false }),
      });

      const data = (await response.json()) as {
        outcome?: string;
        message?: string;
        error?: string;
        stepsExecuted?: string[];
        duplicateBlocked?: boolean;
        claim?: A07ClaimSnapshot | null;
      };

      setA07Result({
        outcome: data.outcome ?? "ERROR",
        message: data.message ?? data.error ?? t("payoutDisbursedTitle"),
        stepsExecuted: data.stepsExecuted ?? [],
        duplicateBlocked: Boolean(data.duplicateBlocked),
        claim: data.claim ?? null,
      });

      if (data.outcome === "DISBURSED") {
        toast({
          variant: "success",
          title: t("payoutDisbursedTitle"),
          description: `${formatCurrency(data.claim?.payoutAmount ?? 0)} · ${getPayoutMethodMeta(data.claim?.payoutMethod).label} (Txn: ${data.claim?.transactionId ?? "—"})`,
        });
      } else if (data.duplicateBlocked || response.status === 409) {
        toast({
          variant: "warning",
          title: t("duplicateBlockedTitle"),
          description: data.message ?? t("wfDuplicateTitle"),
        });
      }

      router.refresh();
    } catch {
      toast({
        variant: "error",
        title: t("resumeFailedTitle"),
        description: t("resumeNetworkErrDesc"),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const resetForReplay = async () => {
    setBusyAction("RESET");
    try {
      const res = await fetch("/api/demo/reset", {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setA06Result(null);
        setA07Result(null);
        toast({
          variant: "success",
          title: t("demoResetSuccessTitle"),
          description: t("demoResetSuccessDesc"),
        });
        router.refresh();
      }
    } finally {
      setBusyAction(null);
    }
  };

  const claim = a07Result?.claim ?? null;
  const isPausedStep3 =
    claim !== null &&
    claim.status !== "DISBURSED" &&
    claim.status !== "FAILED" &&
    claim.currentStep >= 3 &&
    claim.currentStep < 5;
  const isDisbursed = claim !== null && claim.status === "DISBURSED";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("judgePanelTitle")}
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl"
      >
        {/* Minimalist Drawer Header */}
        <div className="flex h-16 items-center justify-between gap-2 border-b border-slate-200 px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700">
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-slate-900">
                {t("judgePanelTitle")}
              </h2>
              <p className="truncate text-xs text-slate-500">{t("judgePanelSubtitle")}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={resetForReplay}
              disabled={busyAction !== null}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t("resetShortBtn")}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("closeMenuAria")}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Clean Segmented Tabs */}
        <div className="border-b border-slate-200/80 bg-slate-50/70 px-5 py-3">
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200/80 bg-white p-1">
            <button
              type="button"
              onClick={() => setActiveTab("A06")}
              className={cn(
                "whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium transition",
                activeTab === "A06"
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm shadow-emerald-600/20"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              {t("tabA06")}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("A07")}
              className={cn(
                "whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium transition",
                activeTab === "A07"
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm shadow-emerald-600/20"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              {t("tabA07")}
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {activeTab === "A06" ? (
            <>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 text-xs leading-relaxed text-slate-600">
                {t("judgeA06Desc")}
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => runA06Test("TIMEOUT")}
                  disabled={busyAction !== null}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-medium text-white shadow-sm shadow-emerald-600/20 transition hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
                >
                  <Timer className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {busyAction === "TIMEOUT"
                      ? t("judgeTimeoutRunning", { sec: (elapsedMs / 1000).toFixed(1) })
                      : t("judgeTimeoutBtn")}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => runA06Test("MALFORMED")}
                  disabled={busyAction !== null}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
                >
                  <FileWarning className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
                  <span>
                    {busyAction === "MALFORMED"
                      ? t("judgeMalformedRunning")
                      : t("judgeMalformedBtn")}
                  </span>
                </button>
              </div>

              {a06Result && (
                <div className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
                      <Database className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {translateStatus(a06Result.source)}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {t("attemptsSummary", {
                        attempts: a06Result.attempts,
                        ms: a06Result.totalDurationMs,
                      })}
                    </span>
                  </div>

                  {a06Result.warningBanner && (
                    <div
                      role="status"
                      className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
                    >
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <span>{a06Result.warningBanner}</span>
                    </div>
                  )}

                  <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200/70">
                    {a06Result.attemptLogs.map((log) => (
                      <li
                        key={log.attempt}
                        className="flex items-center justify-between gap-2 px-3 py-2 font-mono text-[11px] text-slate-700"
                      >
                        <span>
                          <strong className="text-slate-900">#{log.attempt}</strong> {log.status}
                        </span>
                        <span className="text-slate-500">
                          {log.durationMs}ms
                          {log.backoffMs > 0 ? ` · +${log.backoffMs}ms` : ""}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 text-xs leading-relaxed text-slate-600">
                {t("judgeA07Desc")}
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={triggerSunamganjStep4Failure}
                  disabled={busyAction !== null}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                >
                  <AlertOctagon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {busyAction === "A07_FAIL"
                      ? t("judgeFloodFailRunning")
                      : t("judgeFloodFailBtn")}
                  </span>
                </button>

                {isPausedStep3 && (
                  <button
                    type="button"
                    onClick={resumeSunamganjWorkflow}
                    disabled={busyAction !== null}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-medium text-white shadow-sm shadow-emerald-600/20 transition hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      {busyAction === "A07_RESUME"
                        ? t("judgeResumeRunning")
                        : t("judgeResumeBtn")}
                    </span>
                  </button>
                )}

                {isDisbursed && (
                  <button
                    type="button"
                    onClick={resumeSunamganjWorkflow}
                    disabled={busyAction !== null}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Lock className="h-3.5 w-3.5 shrink-0 text-slate-600" aria-hidden="true" />
                    <span>{t("judgeVerifyIdempotencyBtn")}</span>
                  </button>
                )}
              </div>

              {a07Result && (
                <div className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                        a07Result.outcome === "DISBURSED"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : a07Result.outcome === "DUPLICATE_BLOCKED"
                            ? "border-slate-200 bg-slate-100 text-slate-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                      )}
                    >
                      {a07Result.outcome === "DISBURSED" ? (
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                      ) : a07Result.outcome === "DUPLICATE_BLOCKED" ? (
                        <ShieldCheck className="h-3 w-3 shrink-0" />
                      ) : (
                        <Clock className="h-3 w-3 shrink-0" />
                      )}
                      {translateStatus(a07Result.outcome)}
                    </span>
                    {claim && (
                      <span className="font-mono text-[11px] text-slate-500">
                        {t("stepProgressInline", { step: claim.currentStep })}
                      </span>
                    )}
                  </div>

                  <p className="text-xs leading-relaxed text-slate-700">{a07Result.message}</p>

                  {a07Result.stepsExecuted.length > 0 && (
                    <p className="rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-700">
                      {a07Result.stepsExecuted.join(" → ")}
                    </p>
                  )}

                  {claim && isDisbursed && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-xs text-slate-900">
                      <div className="flex items-center justify-between font-semibold">
                        <span className="inline-flex items-center gap-1.5 text-emerald-700">
                          <Smartphone className="h-3.5 w-3.5 shrink-0" />
                          {t("receiptShort", {
                            method: getPayoutMethodMeta(claim.payoutMethod).label,
                          })}
                        </span>
                        <span>{formatCurrency(claim.payoutAmount)}</span>
                      </div>
                      <p className="mt-1.5 font-mono text-[11px] text-slate-600">
                        Txn: <strong className="text-slate-900">{claim.transactionId}</strong> ·{" "}
                        {maskBdMobileNumber(claim.recipientPhone)}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
