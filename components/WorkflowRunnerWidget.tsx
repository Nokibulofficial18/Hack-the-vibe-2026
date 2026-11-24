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
  Sparkles,
  XCircle,
} from "lucide-react";
import { getMetricMeta } from "@/lib/domain";
import { cn, formatCurrency } from "@/lib/utils";

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
      user: { id: string; name: string; email: string; balance: number };
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

const PIPELINE_STAGES = [
  { step: 1, name: "EVENT_DETECTED", label: "Event Detected", stateBadge: "TRIGGERED" },
  { step: 2, name: "POLICY_VALIDATED", label: "Policy Validated", stateBadge: "VALIDATED" },
  { step: 3, name: "PAYOUT_CALCULATED", label: "Payout Calculated", stateBadge: "CALCULATED" },
  { step: 4, name: "FUNDS_RESERVED", label: "Funds Reserved", stateBadge: "RESERVED" },
  { step: 5, name: "DISBURSEMENT_ISSUED", label: "Disbursement Issued", stateBadge: "DISBURSED" },
] as const;

type StageVisualStatus = "SUCCESS" | "RETRIED" | "FAILED" | "PENDING";

export function WorkflowRunnerWidget({
  activePolicies,
  claims,
  getAuthHeaders,
  onWorkflowUpdated,
}: WorkflowRunnerWidgetProps) {
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>("");
  const [observedValue, setObservedValue] = useState<string>("");
  const [activeClaimId, setActiveClaimId] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState<
    "FULL" | "FAIL_STEP_4" | "RESUME" | "IDEMPOTENCY" | null
  >(null);
  const [banner, setBanner] = useState<WorkflowExecutionBanner | null>(null);
  const [lastStepsExecuted, setLastStepsExecuted] = useState<string[]>([]);

  // Auto-select first active policy when available
  useEffect(() => {
    if (activePolicies.length === 0) {
      setSelectedPolicyId("");
      return;
    }
    if (!selectedPolicyId || !activePolicies.some((p) => p.id === selectedPolicyId)) {
      const first = activePolicies[0];
      setSelectedPolicyId(first.id);
      setObservedValue(String(Math.round(first.thresholdValue * 1.25)));
    }
  }, [activePolicies, selectedPolicyId]);

  // Keep inspected claim synced with latest DB state (prefer any paused claim if none chosen yet)
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
      setObservedValue(String(Math.round(chosen.thresholdValue * 1.25)));
    }
  };

  const runEvaluate = async (forceSimulatedFailure: boolean, actionKey: "FULL" | "FAIL_STEP_4" | "IDEMPOTENCY") => {
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
        setBanner({
          tone: "success",
          title: "Workflow Completed (Steps 1 → 5 DISBURSED)",
          detail: data.message ?? "All 5 steps succeeded and funds were disbursed.",
        });
      } else if (data.outcome === "PAUSED_AT_STEP_4") {
        setBanner({
          tone: "warning",
          title: "Step 4 Failed & Rolled Back — Paused at Step 3 (CALCULATED)",
          detail:
            data.message ??
            "Transaction rolled back cleanly before disbursement. Use Resume Workflow to recover from Step 4.",
        });
      } else if (data.outcome === "DUPLICATE_BLOCKED" || response.status === 409) {
        setBanner({
          tone: "info",
          title: "Idempotency Safeguard Triggered (409 Duplicate Blocked)",
          detail:
            data.message ??
            data.error ??
            "Duplicate payout prevented by idempotencyKey lock.",
        });
      } else {
        setBanner({
          tone: "error",
          title: "Workflow Halted",
          detail: data.message ?? data.error ?? "Evaluation did not trigger a payout.",
        });
      }

      await onWorkflowUpdated();
    } catch {
      setBanner({
        tone: "error",
        title: "Network Error",
        detail: "Unable to communicate with /api/weather/evaluate.",
      });
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
        setBanner({
          tone: "success",
          title: `Recovered & Completed from Step ${data.resumedFromStep ?? 4} → Step 5`,
          detail:
            data.message ??
            "Resumed cleanly from Step 4 without re-running Steps 1–3.",
        });
      } else if (data.outcome === "DUPLICATE_BLOCKED" || response.status === 409) {
        setBanner({
          tone: "info",
          title: "Already Settled (Idempotency Lock)",
          detail: data.message ?? "Duplicate disbursement prevented.",
        });
      } else {
        setBanner({
          tone: "error",
          title: "Resume Failed",
          detail: data.message ?? data.error ?? "Unable to resume claim workflow.",
        });
      }

      await onWorkflowUpdated();
    } catch {
      setBanner({
        tone: "error",
        title: "Network Error",
        detail: "Failed to resume workflow.",
      });
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

    const matchingLogs = inspectedClaim.workflowLogs.filter(
      (l) => l.stepName === stepName
    );
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
  const selectedUnit = selectedPolicy ? getMetricMeta(selectedPolicy.metricType).unit : "";

  return (
    <section
      aria-labelledby="a07-workflow-runner-heading"
      className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 via-white to-emerald-50/40 p-6 shadow-sm"
    >
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-indigo-100 pb-4 lg:flex-row lg:items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-indigo-800">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Advanced Challenge A07 · Parametric Claim State Machine &amp; Recovery
          </div>
          <h2
            id="a07-workflow-runner-heading"
            className="mt-2 text-lg font-bold text-slate-900"
          >
            Interactive 5-Step Workflow Runner Visualizer
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Test full automated settlement, inject a mid-workflow{" "}
            <strong>Step 4 Fund Reservation failure</strong> with transactional rollback, resume
            directly from Step 4, and verify <strong>idempotencyKey</strong> double-payout locks.
          </p>
        </div>

        {inspectedClaim && (
          <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-right shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Active Claim State
            </p>
            <div className="mt-0.5 flex items-center justify-end gap-2">
              <span className="text-sm font-bold text-slate-900">
                {inspectedClaim.status}
              </span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
                Step {inspectedClaim.currentStep}/5
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[10px] text-slate-500">
              {inspectedClaim.idempotencyKey}
            </p>
          </div>
        )}
      </div>

      {/* Controls Bar */}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="runner-policy-select"
              className="block text-[11px] font-semibold text-slate-700"
            >
              Active Policy Target
            </label>
            <select
              id="runner-policy-select"
              value={selectedPolicyId}
              onChange={(e) => handleSelectPolicy(e.target.value)}
              disabled={activePolicies.length === 0 || runningAction !== null}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:outline-none"
            >
              {activePolicies.length === 0 ? (
                <option value="">No active policies available — issue one in /policies</option>
              ) : (
                activePolicies.map((p) => {
                  const meta = getMetricMeta(p.metricType);
                  return (
                    <option key={p.id} value={p.id}>
                      {p.farm.name} · {p.metricType} ≥ {p.thresholdValue}
                      {meta.unit} ({formatCurrency(p.coverageAmount)})
                    </option>
                  );
                })
              )}
            </select>
          </div>

          <div>
            <label
              htmlFor="runner-observed-val"
              className="block text-[11px] font-semibold text-slate-700"
            >
              Observed Weather ({selectedUnit || "value"})
            </label>
            <input
              id="runner-observed-val"
              type="number"
              step="any"
              value={observedValue}
              onChange={(e) => setObservedValue(e.target.value)}
              disabled={activePolicies.length === 0 || runningAction !== null}
              className="mt-1 w-28 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => runEvaluate(false, "FULL")}
            disabled={!selectedPolicyId || runningAction !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            {runningAction === "FULL" ? "Running Pipeline..." : "Run Full 5-Step Pipeline"}
          </button>

          <button
            type="button"
            onClick={() => runEvaluate(true, "FAIL_STEP_4")}
            disabled={!selectedPolicyId || runningAction !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <AlertOctagon className="h-3.5 w-3.5" aria-hidden="true" />
            {runningAction === "FAIL_STEP_4"
              ? "Simulating Step 4 Fault..."
              : "Simulate Step 4 Failure"}
          </button>

          {isPausedRecoverable && (
            <button
              type="button"
              onClick={handleResumeWorkflow}
              disabled={runningAction !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm ring-2 ring-indigo-300 transition hover:bg-indigo-700 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {runningAction === "RESUME"
                ? "Resuming Step 4 → 5..."
                : "Resume Workflow (Step 4 → 5)"}
            </button>
          )}

          {isAlreadyDisbursed && (
            <button
              type="button"
              onClick={() => runEvaluate(false, "IDEMPOTENCY")}
              disabled={runningAction !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 transition hover:bg-indigo-100 disabled:opacity-50"
            >
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              {runningAction === "IDEMPOTENCY"
                ? "Checking Lock..."
                : "Test Idempotency Lock"}
            </button>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div
          role={banner.tone === "error" ? "alert" : "status"}
          className={cn(
            "mt-4 flex items-start gap-2.5 rounded-xl border p-3.5 text-xs",
            banner.tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900",
            banner.tone === "warning" && "border-amber-300 bg-amber-50 text-amber-950",
            banner.tone === "info" && "border-indigo-200 bg-indigo-50 text-indigo-900",
            banner.tone === "error" && "border-rose-200 bg-rose-50 text-rose-900"
          )}
        >
          {banner.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          ) : banner.tone === "info" ? (
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <div>
            <p className="font-bold">{banner.title}</p>
            <p className="mt-0.5">{banner.detail}</p>
            {lastStepsExecuted.length > 0 && (
              <p className="mt-1 font-mono text-[11px] opacity-80">
                Executed this run: {lastStepsExecuted.join(" → ")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 5-Step Progress Bar & Stage Visualizer */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700">
            Pipeline Execution Progress
            {inspectedClaim ? ` · ${inspectedClaim.policy.farm.name}` : ""}
          </span>
          <span className="font-mono font-semibold text-slate-600">
            {progressPercent}% ({inspectedClaim?.currentStep ?? 0} / 5 steps persisted)
          </span>
        </div>

        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Parametric workflow execution progress"
            className={cn(
              "h-full rounded-full transition-all duration-300",
              isPausedRecoverable
                ? "bg-amber-500"
                : inspectedClaim?.status === "FAILED"
                  ? "bg-rose-600"
                  : "bg-emerald-600"
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
          {PIPELINE_STAGES.map((stage) => {
            const { status, log } = resolveStageState(stage.step, stage.name);

            return (
              <div
                key={stage.name}
                className={cn(
                  "flex flex-col justify-between rounded-xl border p-3.5 transition",
                  status === "SUCCESS" && "border-emerald-200 bg-emerald-50/60",
                  status === "RETRIED" && "border-sky-200 bg-sky-50/70",
                  status === "FAILED" && "border-rose-300 bg-rose-50/80 ring-1 ring-rose-200",
                  status === "PENDING" && "border-slate-200 bg-white"
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-[10px] font-bold text-slate-500">
                      STEP {stage.step}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
                        status === "SUCCESS" && "bg-emerald-100 text-emerald-800",
                        status === "RETRIED" && "bg-sky-100 text-sky-800",
                        status === "FAILED" && "bg-rose-100 text-rose-800",
                        status === "PENDING" && "bg-slate-100 text-slate-600"
                      )}
                    >
                      {status === "SUCCESS" || status === "RETRIED" ? (
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      ) : status === "FAILED" ? (
                        <XCircle className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <Clock className="h-3 w-3" aria-hidden="true" />
                      )}
                      {status === "RETRIED"
                        ? "Recovered"
                        : status === "SUCCESS"
                          ? "Success"
                          : status === "FAILED"
                            ? "Failed"
                            : "Pending"}
                    </span>
                  </div>

                  <p className="mt-2 text-xs font-bold text-slate-900">{stage.label}</p>
                  <p className="font-mono text-[10px] text-slate-500">{stage.name}</p>

                  {log ? (
                    <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-slate-700">
                      {log.details}
                    </p>
                  ) : (
                    <p className="mt-2 text-[11px] text-slate-400">
                      Waiting for previous step...
                    </p>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-200/70 pt-2 text-[10px] text-slate-500">
                  <span className="font-mono">{stage.stateBadge}</span>
                  {log && (
                    <span className="font-mono">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Financial Safety & Idempotency Footer */}
        {inspectedClaim && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-slate-700">
                <KeyRound className="h-3.5 w-3.5 text-indigo-600" aria-hidden="true" />
                {inspectedClaim.idempotencyKey}
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-600">
                Beneficiary: <strong>{inspectedClaim.policy.farm.user.name}</strong>
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-600">
                Calculated Payout:{" "}
                <strong>{formatCurrency(inspectedClaim.payoutAmount)}</strong>
              </span>
            </div>
            <div>
              {isPausedRecoverable ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900">
                  Rolled Back Safely · $0.00 Disbursed Until Resumed
                </span>
              ) : isAlreadyDisbursed ? (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
                  Disbursed · Double-Payout Locked
                </span>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
