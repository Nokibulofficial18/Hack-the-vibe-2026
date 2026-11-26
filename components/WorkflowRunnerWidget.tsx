"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  KeyRound,
  Lock,
  Play,
  RotateCcw,
  ShieldCheck,
  Workflow,
  XCircle,
} from "lucide-react";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";
import { DisbursementReceiptCard } from "@/components/DisbursementReceiptCard";
import {
  evaluateTieredPayout,
  getMetricMeta,
  getSevereThresholdCutoff,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

export interface RunnerWorkflowLog {
  id: string;
  stepName: string;
  status: string;
  details: string;
  timestamp: string;
}

export interface RunnerClaim {
  id: string;
  policyId: string;
  idempotencyKey: string;
  triggerValue: number;
  payoutAmount: number;
  severityTier: string | null;
  payoutPercentage: number | null;
  payoutMethod: string | null;
  recipientPhone: string | null;
  transactionId: string | null;
  disbursedAt: string | null;
  status: string;
  currentStep: number;
  failureReason: string | null;
  createdAt: string;
  policy: {
    id: string;
    metricType: string;
    thresholdValue: number;
    coverageAmount: number;
    status: string;
    farm: {
      id: string;
      name: string;
      cropType: string;
      user: {
        id: string;
        name: string;
        email: string;
        balance: number;
        payoutMethod?: string;
        mobileNumber?: string;
      };
    };
  };
  workflowLogs: RunnerWorkflowLog[];
}

export interface RunnerPolicyOption {
  id: string;
  metricType: string;
  thresholdValue: number;
  coverageAmount: number;
  farm: {
    id: string;
    name: string;
    cropType: string;
    user: { id: string; name: string };
  };
}

interface WorkflowExecutionBanner {
  tone: "success" | "warning" | "error" | "info";
  title: string;
  detail: string;
}

interface WorkflowRunnerWidgetProps {
  activePolicies: RunnerPolicyOption[];
  claims: RunnerClaim[];
  getAuthHeaders: () => Record<string, string>;
  onWorkflowUpdated: () => Promise<void>;
}

const PIPELINE_STAGES: ReadonlyArray<{
  step: number;
  name: string;
  labelKey: TranslationKey;
  stateBadge: string;
}> = [
  { step: 1, name: "EVENT_DETECTED", labelKey: "stage1Label", stateBadge: "TRIGGERED" },
  { step: 2, name: "POLICY_VALIDATED", labelKey: "stage2Label", stateBadge: "VALIDATED" },
  { step: 3, name: "PAYOUT_CALCULATED", labelKey: "stage3Label", stateBadge: "CALCULATED" },
  { step: 4, name: "FUNDS_RESERVED", labelKey: "stage4Label", stateBadge: "RESERVED" },
  { step: 5, name: "DISBURSEMENT_ISSUED", labelKey: "stage5Label", stateBadge: "DISBURSED" },
];

type StageVisualStatus = "SUCCESS" | "RETRIED" | "FAILED" | "PENDING";

function getModerateSample(metricType: string, threshold: number): number {
  const severeCutoff = getSevereThresholdCutoff(metricType, threshold);
  return Math.round((threshold + severeCutoff) / 2);
}

function getSevereSample(metricType: string, threshold: number): number {
  const severeCutoff = getSevereThresholdCutoff(metricType, threshold);
  return metricType === "TEMP_MAX" ? severeCutoff + 1 : severeCutoff + 15;
}

export function WorkflowRunnerWidget({
  activePolicies,
  claims,
  getAuthHeaders,
  onWorkflowUpdated,
}: WorkflowRunnerWidgetProps) {
  const {
    t,
    translateStatus,
    translateFarmName,
    translatePerson,
    translateMetricShort,
    translateUnit,
    translateStepName,
    formatNum,
    formatTaka,
    formatTime,
  } = useTranslation();
  const { toast } = useToast();
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>("");
  const [observedValue, setObservedValue] = useState<string>("");
  const [activeClaimId, setActiveClaimId] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState<
    "FULL" | "FAIL_STEP_4" | "RESUME" | "IDEMPOTENCY" | null
  >(null);
  const [banner, setBanner] = useState<WorkflowExecutionBanner | null>(null);
  const [lastStepsExecuted, setLastStepsExecuted] = useState<string[]>([]);

  useEffect(() => {
    if (activePolicies.length === 0) {
      setSelectedPolicyId("");
      return;
    }
    if (!selectedPolicyId || !activePolicies.some((p) => p.id === selectedPolicyId)) {
      const first = activePolicies[0];
      setSelectedPolicyId(first.id);
      setObservedValue(String(getModerateSample(first.metricType, first.thresholdValue)));
    }
  }, [activePolicies, selectedPolicyId]);

  const inspectedClaim = useMemo(() => {
    if (activeClaimId) {
      const match = claims.find((c) => c.id === activeClaimId);
      if (match) return match;
    }
    const paused = claims.find(
      (c) => c.status !== "DISBURSED" && c.status !== "FAILED" && c.currentStep < 5
    );
    return paused ?? claims[0] ?? null;
  }, [activeClaimId, claims]);

  const handleSelectPolicy = (policyId: string) => {
    setSelectedPolicyId(policyId);
    const chosen = activePolicies.find((p) => p.id === policyId);
    if (chosen) {
      setObservedValue(String(getModerateSample(chosen.metricType, chosen.thresholdValue)));
    }
  };

  const runEvaluate = async (
    forceSimulatedFailure: boolean,
    actionKey: "FULL" | "FAIL_STEP_4" | "IDEMPOTENCY"
  ) => {
    const targetPolicyId =
      actionKey === "IDEMPOTENCY" && inspectedClaim ? inspectedClaim.policyId : selectedPolicyId;
    const targetObserved =
      actionKey === "IDEMPOTENCY" && inspectedClaim
        ? inspectedClaim.triggerValue
        : Number(observedValue);

    if (!targetPolicyId) return;

    setRunningAction(actionKey);
    setBanner(null);

    try {
      const response = await fetch("/api/weather/evaluate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          policyId: targetPolicyId,
          observedValue: targetObserved,
          forceSimulatedFailure,
        }),
      });

      const data = (await response.json()) as {
        outcome?: string;
        claim?: RunnerClaim | null;
        stepsExecuted?: string[];
        duplicateBlocked?: boolean;
        message?: string;
        error?: string;
      };

      if (data.claim?.id) {
        setActiveClaimId(data.claim.id);
      }
      setLastStepsExecuted(data.stepsExecuted ?? []);

      if (data.outcome === "DISBURSED") {
        const detail = data.message ?? t("payoutDisbursedTitle");
        setBanner({ tone: "success", title: t("wfCompletedTitle"), detail });
        toast({ variant: "success", title: t("payoutDisbursedTitle"), description: detail });
      } else if (data.outcome === "PAUSED_AT_STEP_4") {
        const detail = data.message ?? t("rolledBackPill");
        setBanner({ tone: "warning", title: t("wfPausedTitle"), detail });
        toast({ variant: "warning", title: t("wfPausedTitle"), description: detail });
      } else if (data.outcome === "DUPLICATE_BLOCKED" || response.status === 409) {
        const detail = data.message ?? data.error ?? t("duplicateBlockedTitle");
        setBanner({ tone: "info", title: t("wfDuplicateTitle"), detail });
        toast({ variant: "warning", title: t("duplicateBlockedTitle"), description: detail });
      } else {
        const detail = data.message ?? data.error ?? t("wfHaltedTitle");
        setBanner({ tone: "error", title: t("wfHaltedTitle"), detail });
        toast({ variant: "error", title: t("wfHaltedTitle"), description: detail });
      }

      await onWorkflowUpdated();
    } catch {
      const detail = t("resumeNetworkErrDesc");
      setBanner({ tone: "error", title: t("networkErrorTitle"), detail });
      toast({ variant: "error", title: t("networkErrorTitle"), description: detail });
    } finally {
      setRunningAction(null);
    }
  };

  const handleResumeWorkflow = async () => {
    if (!inspectedClaim) return;
    setRunningAction("RESUME");
    setBanner(null);

    try {
      const response = await fetch(`/api/claims/${inspectedClaim.id}/resume`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ simulateStep4Failure: false }),
      });

      const data = (await response.json()) as {
        outcome?: string;
        claim?: RunnerClaim | null;
        stepsExecuted?: string[];
        resumedFromStep?: number | null;
        message?: string;
        error?: string;
      };

      if (data.claim?.id) {
        setActiveClaimId(data.claim.id);
      }
      setLastStepsExecuted(data.stepsExecuted ?? []);

      if (data.outcome === "DISBURSED") {
        const detail = data.message ?? t("payoutDisbursedTitle");
        const title = t("wfRecoveredTitle", { step: data.resumedFromStep ?? 4 });
        setBanner({ tone: "success", title, detail });
        toast({ variant: "success", title, description: detail });
      } else if (data.outcome === "DUPLICATE_BLOCKED" || response.status === 409) {
        const detail = data.message ?? t("duplicateBlockedTitle");
        setBanner({ tone: "info", title: t("wfAlreadySettledTitle"), detail });
        toast({ variant: "warning", title: t("duplicateBlockedTitle"), description: detail });
      } else {
        const detail = data.message ?? data.error ?? t("resumeFailedTitle");
        setBanner({ tone: "error", title: t("resumeFailedTitle"), detail });
        toast({ variant: "error", title: t("resumeFailedTitle"), description: detail });
      }

      await onWorkflowUpdated();
    } catch {
      const detail = t("resumeNetworkErrDesc");
      setBanner({ tone: "error", title: t("networkErrorTitle"), detail });
      toast({ variant: "error", title: t("networkErrorTitle"), description: detail });
    } finally {
      setRunningAction(null);
    }
  };

  const isPausedRecoverable =
    inspectedClaim !== null &&
    inspectedClaim.status !== "DISBURSED" &&
    inspectedClaim.status !== "FAILED" &&
    inspectedClaim.currentStep >= 3 &&
    inspectedClaim.currentStep < 5;

  const isAlreadyDisbursed =
    inspectedClaim !== null && inspectedClaim.status === "DISBURSED";

  const progressPercent = inspectedClaim
    ? Math.min(100, Math.round((inspectedClaim.currentStep / 5) * 100))
    : 0;

  const resolveStageState = (
    step: number,
    stepName: string
  ): { status: StageVisualStatus; log: RunnerWorkflowLog | null } => {
    if (!inspectedClaim) return { status: "PENDING", log: null };

    const matchingLogs = inspectedClaim.workflowLogs.filter((l) => l.stepName === stepName);
    const latestLog = matchingLogs[matchingLogs.length - 1] ?? null;

    if (latestLog) {
      if (latestLog.status === "RETRIED") return { status: "RETRIED", log: latestLog };
      if (latestLog.status === "SUCCESS") return { status: "SUCCESS", log: latestLog };
      if (latestLog.status === "FAILED") return { status: "FAILED", log: latestLog };
    }

    if (step <= inspectedClaim.currentStep) {
      return { status: "SUCCESS", log: latestLog };
    }

    return { status: "PENDING", log: null };
  };

  const selectedPolicy = activePolicies.find((p) => p.id === selectedPolicyId);
  const selectedUnit = selectedPolicy
    ? translateUnit(getMetricMeta(selectedPolicy.metricType).unit)
    : "";
  const livePreviewTier = selectedPolicy
    ? evaluateTieredPayout(
        selectedPolicy.metricType,
        selectedPolicy.coverageAmount,
        Number(observedValue) || 0,
        selectedPolicy.thresholdValue
      )
    : null;

  return (
    <section
      aria-labelledby="a07-workflow-runner-heading"
      className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs"
    >
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
            <Workflow className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{t("a07Badge")}</span>
          </span>
          <h2
            id="a07-workflow-runner-heading"
            className="mt-2 text-base font-semibold text-slate-900"
          >
            {t("a07Heading")}
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">{t("a07Subtitle")}</p>
        </div>

        {inspectedClaim && (
          <div className="shrink-0 rounded-lg border border-slate-200/80 bg-slate-50/70 px-3.5 py-2 text-right">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              {t("activeClaimState")}
            </p>
            <div className="mt-0.5 flex items-center justify-end gap-2">
              <span className="text-sm font-semibold text-slate-900">
                {translateStatus(inspectedClaim.status)}
              </span>
              <span className="whitespace-nowrap rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-600">
                {t("stepProgressInline", { step: inspectedClaim.currentStep })}
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[10px] text-slate-500">
              {inspectedClaim.idempotencyKey}
            </p>
          </div>
        )}
      </div>

      {/* Controls Bar */}
      <div className="mt-4 space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor="runner-policy-select"
                className="block text-[11px] font-medium text-slate-600"
              >
                {t("activePolicyTarget")}
              </label>
              <select
                id="runner-policy-select"
                value={selectedPolicyId}
                onChange={(e) => handleSelectPolicy(e.target.value)}
                disabled={activePolicies.length === 0 || runningAction !== null}
                className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
              >
                {activePolicies.length === 0 ? (
                  <option value="">{t("noActivePoliciesOption")}</option>
                ) : (
                  activePolicies.map((p) => {
                    const meta = getMetricMeta(p.metricType);
                    return (
                      <option key={p.id} value={p.id}>
                        {translateFarmName(p.farm.name)} · {translateMetricShort(p.metricType)} ≥{" "}
                        {formatNum(p.thresholdValue)} {translateUnit(meta.unit)} (
                        {formatTaka(p.coverageAmount)})
                      </option>
                    );
                  })
                )}
              </select>
            </div>

            <div>
              <label
                htmlFor="runner-observed-val"
                className="block text-[11px] font-medium text-slate-600"
              >
                {t("observedMetricInput", { unit: selectedUnit || "val" })}
              </label>
              <input
                id="runner-observed-val"
                type="number"
                step="any"
                value={observedValue}
                onChange={(e) => setObservedValue(e.target.value)}
                disabled={activePolicies.length === 0 || runningAction !== null}
                className="mt-1 w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
              />
            </div>

            {selectedPolicy && (
              <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
                <button
                  type="button"
                  onClick={() =>
                    setObservedValue(
                      String(
                        getModerateSample(
                          selectedPolicy.metricType,
                          selectedPolicy.thresholdValue
                        )
                      )
                    )
                  }
                  className="whitespace-nowrap rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 transition hover:bg-amber-100/70"
                >
                  {t("moderate50Btn")} (
                  {formatNum(
                    getModerateSample(selectedPolicy.metricType, selectedPolicy.thresholdValue)
                  )}{" "}
                  {selectedUnit})
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setObservedValue(
                      String(
                        getSevereSample(selectedPolicy.metricType, selectedPolicy.thresholdValue)
                      )
                    )
                  }
                  className="whitespace-nowrap rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-700 transition hover:bg-rose-100/70"
                >
                  {t("severe100Btn")} (
                  {formatNum(
                    getSevereSample(selectedPolicy.metricType, selectedPolicy.thresholdValue)
                  )}{" "}
                  {selectedUnit})
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => runEvaluate(false, "FULL")}
              disabled={!selectedPolicyId || runningAction !== null}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 py-2 text-xs font-medium text-white shadow-sm shadow-emerald-600/20 transition hover:from-emerald-700 hover:to-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {runningAction === "FULL" ? t("runningPipelineBtn") : t("runFullPipelineBtn")}
              </span>
            </button>

            <button
              type="button"
              onClick={() => runEvaluate(true, "FAIL_STEP_4")}
              disabled={!selectedPolicyId || runningAction !== null}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <AlertOctagon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {runningAction === "FAIL_STEP_4"
                  ? t("simulatingStep4Btn")
                  : t("simStep4FailBtn")}
              </span>
            </button>

            {isPausedRecoverable && (
              <button
                type="button"
                onClick={handleResumeWorkflow}
                disabled={runningAction !== null}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 py-2 text-xs font-medium text-white shadow-sm shadow-emerald-600/20 transition hover:from-emerald-700 hover:to-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/30 disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {runningAction === "RESUME"
                    ? t("resumingStep4To5Btn")
                    : t("resumeStep4To5Btn")}
                </span>
              </button>
            )}

            {isAlreadyDisbursed && (
              <button
                type="button"
                onClick={() => runEvaluate(false, "IDEMPOTENCY")}
                disabled={runningAction !== null}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <Lock className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
                <span>
                  {runningAction === "IDEMPOTENCY"
                    ? t("checkingLockBtn")
                    : t("testIdempotencyBtn")}
                </span>
              </button>
            )}
          </div>
        </div>

        {selectedPolicy && livePreviewTier && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-2.5 text-[11px] text-slate-600">
            <span>
              <strong className="font-medium text-slate-800">{t("tierRuleLabel")}</strong>{" "}
              {t("moderateLabel")} ({formatNum(selectedPolicy.thresholdValue)}–
              {formatNum(livePreviewTier.severeCutoff - 0.1)} {selectedUnit}) = {formatNum(50)}% ·{" "}
              {t("severeLabel")} (≥ {formatNum(livePreviewTier.severeCutoff)} {selectedUnit}) ={" "}
              {formatNum(100)}%
            </span>
            <span className="font-medium text-slate-700">
              {t("projectedPayoutLabel")}{" "}
              <span className="font-semibold text-emerald-700">
                {formatTaka(livePreviewTier.payoutAmount)} (
                {formatNum(livePreviewTier.payoutPercentage)}%)
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div
          role={banner.tone === "error" ? "alert" : "status"}
          className={cn(
            "mt-4 flex items-start gap-2.5 rounded-xl border p-3.5 text-xs",
            banner.tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800",
            banner.tone === "warning" && "border-amber-200 bg-amber-50 text-amber-800",
            banner.tone === "info" && "border-slate-200 bg-slate-50 text-slate-700",
            banner.tone === "error" && "border-rose-200 bg-rose-50 text-rose-800"
          )}
        >
          {banner.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
          ) : banner.tone === "info" ? (
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <div>
            <p className="font-semibold">{banner.title}</p>
            <p className="mt-0.5">{banner.detail}</p>
            {lastStepsExecuted.length > 0 && (
              <p className="mt-1 text-[11px] opacity-85">
                {t("executedPrefix")} {lastStepsExecuted.map(translateStepName).join(" → ")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 5-Step Progress Bar & Stage Visualizer */}
      <div className="mt-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-medium text-slate-700">
            {t("pipelineProgressLabel")}
            {inspectedClaim ? ` · ${translateFarmName(inspectedClaim.policy.farm.name)}` : ""}
          </span>
          <span className="font-mono text-xs text-slate-600">
            {t("stepsPersistedLabel", {
              pct: progressPercent,
              step: inspectedClaim?.currentStep ?? 0,
            })}
          </span>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("pipelineProgressLabel")}
            className={cn(
              "h-full rounded-full transition-all duration-300",
              isPausedRecoverable
                ? "bg-amber-500"
                : inspectedClaim?.status === "FAILED"
                  ? "bg-rose-500"
                  : "bg-emerald-700"
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {PIPELINE_STAGES.map((stage) => {
            const { status, log } = resolveStageState(stage.step, stage.name);

            return (
              <div
                key={stage.name}
                className={cn(
                  "flex flex-col justify-between rounded-xl border p-3.5 transition",
                  status === "SUCCESS" && "border-emerald-200/90 bg-emerald-50/30",
                  status === "RETRIED" && "border-emerald-200/90 bg-emerald-50/30",
                  status === "FAILED" && "border-rose-200 bg-rose-50/40",
                  status === "PENDING" && "border-slate-200/80 bg-white"
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="whitespace-nowrap font-mono text-[10px] font-medium text-slate-500">
                      {t("stepPrefix", { n: stage.step })}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium",
                        status === "SUCCESS" &&
                          "border-emerald-200 bg-emerald-50 text-emerald-700",
                        status === "RETRIED" &&
                          "border-emerald-200 bg-emerald-50 text-emerald-700",
                        status === "FAILED" && "border-rose-200 bg-rose-50 text-rose-700",
                        status === "PENDING" && "border-slate-200 bg-slate-100 text-slate-600"
                      )}
                    >
                      {status === "SUCCESS" || status === "RETRIED" ? (
                        <CheckCircle2 className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                      ) : status === "FAILED" ? (
                        <XCircle className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                      ) : (
                        <Clock className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                      )}
                      {status === "RETRIED"
                        ? t("stageStatusRecovered")
                        : status === "SUCCESS"
                          ? t("stageStatusSuccess")
                          : status === "FAILED"
                            ? t("stageStatusFailed")
                            : t("stageStatusPending")}
                    </span>
                  </div>

                  <p className="mt-2 text-xs font-semibold text-slate-900">{t(stage.labelKey)}</p>
                  <p className="text-[10px] text-slate-500">{translateStepName(stage.name)}</p>

                  {log ? (
                    <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-slate-600">
                      {log.details}
                    </p>
                  ) : (
                    <p className="mt-2 text-[11px] text-slate-400">{t("waitingPrevStep")}</p>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-500">
                  <span className="truncate">{translateStatus(stage.stateBadge)}</span>
                  {log && (
                    <span className="shrink-0 font-mono">{formatTime(log.timestamp)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Financial Safety & Idempotency Footer */}
        {inspectedClaim && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-3 text-slate-600">
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium text-slate-700">
                <KeyRound className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                {inspectedClaim.idempotencyKey}
              </span>
              <span className="text-slate-300">|</span>
              <span>
                {t("beneficiaryLabel")}{" "}
                <strong className="font-medium text-slate-900">
                  {translatePerson(inspectedClaim.policy.farm.user.name)}
                </strong>
              </span>
              <span className="text-slate-300">|</span>
              <span>
                {t("payoutLabel")}{" "}
                <strong className="font-semibold text-slate-900">
                  {formatTaka(inspectedClaim.payoutAmount)}
                  {inspectedClaim.payoutPercentage
                    ? ` (${formatNum(inspectedClaim.payoutPercentage)}%)`
                    : ""}
                </strong>
              </span>
            </div>
            <div>
              {isPausedRecoverable ? (
                <span className="whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
                  {t("rolledBackPill")}
                </span>
              ) : isAlreadyDisbursed ? (
                <span className="whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                  {t("disbursedLockedPill")}
                </span>
              ) : null}
            </div>
          </div>
        )}

        {/* Simulated Digital MFS Disbursement Receipt shown immediately on Step 5 completion */}
        {isAlreadyDisbursed && inspectedClaim && (
          <div className="mt-5">
            <DisbursementReceiptCard claim={inspectedClaim} />
          </div>
        )}
      </div>
    </section>
  );
}
