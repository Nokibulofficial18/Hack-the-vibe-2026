"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  KeyRound,
  ReceiptText,
  RotateCcw,
  Search,
  ShieldCheck,
  Sprout,
  Wallet,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getMetricMeta } from "@/lib/domain";
import { cn, formatCurrency } from "@/lib/utils";
import {
  WorkflowRunnerWidget,
  type RunnerClaim,
  type RunnerPolicyOption,
} from "@/components/WorkflowRunnerWidget";

interface LedgerMetrics {
  totalClaims: number;
  disbursedCount: number;
  pausedCount: number;
  failedCount: number;
  totalDisbursed: number;
  activeLiability: number;
}

const CLAIM_BADGE: Record<string, string> = {
  DISBURSED: "bg-emerald-100 text-emerald-800",
  RESERVED: "bg-sky-100 text-sky-800",
  CALCULATED: "bg-amber-100 text-amber-900",
  VALIDATED: "bg-blue-100 text-blue-800",
  TRIGGERED: "bg-amber-100 text-amber-800",
  FAILED: "bg-rose-100 text-rose-800",
};

export function ClaimLedgerClient() {
  const { user, isAdmin, getAuthHeaders } = useAuth();
  const router = useRouter();

  const [claims, setClaims] = useState<RunnerClaim[]>([]);
  const [activePolicies, setActivePolicies] = useState<RunnerPolicyOption[]>([]);
  const [liveBalance, setLiveBalance] = useState<number>(user.balance);
  const [metrics, setMetrics] = useState<LedgerMetrics>({
    totalClaims: 0,
    disbursedCount: 0,
    pausedCount: 0,
    failedCount: 0,
    totalDisbursed: 0,
    activeLiability: 0,
  });
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [resumingClaimId, setResumingClaimId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<"createdAt" | "payoutAmount">("createdAt");

  const loadLedger = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/claims", {
        headers: getAuthHeaders(),
        cache: "no-store",
      });
      if (response.ok) {
        const data = (await response.json()) as {
          claims: RunnerClaim[];
          activePolicies: RunnerPolicyOption[];
          currentUser: { balance: number };
          metrics: LedgerMetrics;
        };
        setClaims(data.claims);
        setActivePolicies(data.activePolicies);
        setMetrics(data.metrics);
        setLiveBalance(data.currentUser.balance);

        if (data.claims.length > 0) {
          setExpandedIds((prev) =>
            Object.keys(prev).length === 0 ? { [data.claims[0].id]: true } : prev
          );
        }
      }
    } catch {
      setFeedback({ type: "error", text: "Unable to load claim & payout ledger." });
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    void loadLedger();
  }, [user.id, loadLedger]);

  const handleWorkflowUpdated = useCallback(async () => {
    await loadLedger();
    router.refresh();
  }, [loadLedger, router]);

  const handleResumeClaimRow = async (claimId: string) => {
    setResumingClaimId(claimId);
    setFeedback(null);
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
      };

      if (!response.ok) {
        setFeedback({ type: "error", text: data.message ?? data.error ?? "Resume failed." });
        return;
      }

      setFeedback({
        type: "success",
        text: data.message ?? "Workflow resumed cleanly from Step 4 and disbursed payout.",
      });
      setExpandedIds((prev) => ({ ...prev, [claimId]: true }));
      await handleWorkflowUpdated();
    } catch {
      setFeedback({ type: "error", text: "Network error while resuming workflow." });
    } finally {
      setResumingClaimId(null);
    }
  };

  const toggleExpand = (claimId: string) => {
    setExpandedIds((prev) => ({ ...prev, [claimId]: !prev[claimId] }));
  };

  const filteredClaims = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return claims
      .filter((c) => {
        if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
        if (
          q &&
          !c.idempotencyKey.toLowerCase().includes(q) &&
          !c.policy.farm.name.toLowerCase().includes(q) &&
          !c.policy.farm.user.name.toLowerCase().includes(q) &&
          !c.policy.metricType.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "payoutAmount") return b.payoutAmount - a.payoutAmount;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [claims, searchQuery, statusFilter, sortBy]);

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
              ? "Admin Audit · Global Payout & A07 Workflow Engine"
              : `Farmer Ledger · Isolated to ${user.name}'s Payouts`}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            Claim &amp; Payout Ledger
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Immutable audit trail of triggered claims, severity payout calculations, idempotency locks, and 5-step state recovery logs.
          </p>
        </div>

        <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-right">
          <div className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
            <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
            {isAdmin ? "Insurer Reserve Pool" : "Your Wallet Balance"}
          </div>
          <p className="mt-0.5 text-2xl font-bold text-emerald-950">
            {formatCurrency(liveBalance)}
          </p>
          <p className="text-xs text-emerald-700/80">{user.email}</p>
        </div>
      </div>

      {/* KPI Cards */}
      <section aria-label="Ledger KPIs" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Total Disbursed
          </p>
          <p className="mt-1.5 text-2xl font-bold text-emerald-700">
            {formatCurrency(metrics.totalDisbursed)}
          </p>
          <p className="text-xs text-slate-500">{metrics.disbursedCount} settled payouts</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Total Claims Logged
          </p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900">{metrics.totalClaims}</p>
          <p className="text-xs text-slate-500">
            {metrics.pausedCount} paused · {metrics.failedCount} failed
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Active Liability Exposure
          </p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900">
            {formatCurrency(metrics.activeLiability)}
          </p>
          <p className="text-xs text-slate-500">{activePolicies.length} open contracts</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Data Access Scope
          </p>
          <p className="mt-1.5 text-lg font-bold text-indigo-700">
            {isAdmin ? "Global (All Farmers)" : "Owner-Isolated"}
          </p>
          <p className="text-xs text-slate-500">Role-based enforcement active</p>
        </div>
      </section>

      {/* A07 Interactive Workflow Runner Visualizer (Admin Command) */}
      {isAdmin ? (
        <WorkflowRunnerWidget
          activePolicies={activePolicies}
          claims={claims}
          getAuthHeaders={getAuthHeaders}
          onWorkflowUpdated={handleWorkflowUpdated}
        />
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-600" aria-hidden="true" />
            <span>
              <strong>5-Step Parametric Settlement Active:</strong> Every payout is protected by an idempotency lock and step-by-step audit trail. Switch to <strong>Admin</strong> in the header to test the A07 Workflow Runner and Step 4 failure recovery.
            </span>
          </span>
        </div>
      )}

      {feedback && (
        <div
          role={feedback.type === "error" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-2 rounded-xl border p-3.5 text-xs font-medium",
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          )}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <ReceiptText className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          <h2 className="text-base font-semibold text-slate-900">
            Audit Records ({filteredClaims.length})
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search key, farm, farmer..."
              aria-label="Search claims"
              className="w-48 rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs text-slate-700 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <select
            aria-label="Filter claims by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
          >
            <option value="ALL">All Statuses</option>
            <option value="DISBURSED">DISBURSED</option>
            <option value="RESERVED">RESERVED</option>
            <option value="CALCULATED">CALCULATED (Paused)</option>
            <option value="VALIDATED">VALIDATED</option>
            <option value="TRIGGERED">TRIGGERED</option>
            <option value="FAILED">FAILED</option>
          </select>

          <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1">
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <select
              aria-label="Sort claims"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "createdAt" | "payoutAmount")}
              className="bg-transparent text-xs font-medium text-slate-700 focus:outline-none"
            >
              <option value="createdAt">Newest First</option>
              <option value="payoutAmount">Highest Payout</option>
            </select>
          </div>
        </div>
      </div>

      {/* Claims Accordion List */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          Loading claim ledger for {user.name}...
        </div>
      ) : filteredClaims.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <ReceiptText className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-slate-700">No claims recorded yet</p>
          <p className="mt-1 text-xs text-slate-500">
            {isAdmin
              ? "Use the Interactive 5-Step Workflow Runner above to execute a full payout or simulate a Step 4 failure and recovery."
              : "When monitored weather breaches one of your active policy thresholds, payouts and full audit logs will appear here automatically."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredClaims.map((claim) => {
            const isExpanded = Boolean(expandedIds[claim.id]);
            const meta = getMetricMeta(claim.policy.metricType);
            const canResume =
              claim.status !== "DISBURSED" &&
              claim.status !== "FAILED" &&
              claim.currentStep >= 3 &&
              claim.currentStep < 5;

            return (
              <article
                key={claim.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50/70">
                  <button
                    type="button"
                    onClick={() => toggleExpand(claim.id)}
                    aria-expanded={isExpanded}
                    className="flex flex-1 items-start gap-3 text-left"
                  >
                    <span className="mt-0.5 text-slate-400">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      )}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">
                          {claim.policy.farm.name}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                            CLAIM_BADGE[claim.status] ?? "bg-slate-100 text-slate-700"
                          )}
                        >
                          {claim.status}
                        </span>
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                          {claim.policy.metricType}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span>
                          Observed:{" "}
                          <strong className="text-slate-800">
                            {claim.triggerValue}
                            {meta.unit}
                          </strong>{" "}
                          (Threshold: {claim.policy.thresholdValue}
                          {meta.unit})
                        </span>
                        <span>·</span>
                        <span>Beneficiary: {claim.policy.farm.user.name}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                          <KeyRound className="h-3 w-3 text-slate-400" aria-hidden="true" />
                          {claim.idempotencyKey}
                        </span>
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-3">
                    {canResume && (
                      <button
                        type="button"
                        onClick={() => handleResumeClaimRow(claim.id)}
                        disabled={resumingClaimId === claim.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        {resumingClaimId === claim.id
                          ? "Resuming..."
                          : "Resume Workflow"}
                      </button>
                    )}

                    <div className="text-right">
                      <p
                        className={cn(
                          "text-lg font-bold",
                          claim.status === "DISBURSED"
                            ? "text-emerald-700"
                            : "text-amber-700"
                        )}
                      >
                        {formatCurrency(claim.payoutAmount)}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Step {claim.currentStep}/5 ·{" "}
                        {new Date(claim.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
                        Workflow Execution State Logs ({claim.workflowLogs.length})
                      </h3>
                      <span className="text-[11px] text-slate-500">
                        Max Coverage Cap: {formatCurrency(claim.policy.coverageAmount)}
                      </span>
                    </div>

                    {claim.failureReason && (
                      <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                        <strong>Paused / Failure Snapshot:</strong> {claim.failureReason}
                      </div>
                    )}

                    <ol className="mt-3 space-y-2.5">
                      {claim.workflowLogs.map((log, idx) => (
                        <li
                          key={log.id}
                          className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3"
                        >
                          <div className="flex items-start gap-2.5">
                            {log.status === "SUCCESS" || log.status === "RETRIED" ? (
                              <CheckCircle2
                                className={cn(
                                  "mt-0.5 h-4 w-4 shrink-0",
                                  log.status === "RETRIED"
                                    ? "text-sky-600"
                                    : "text-emerald-600"
                                )}
                                aria-hidden="true"
                              />
                            ) : log.status === "FAILED" ? (
                              <XCircle
                                className="mt-0.5 h-4 w-4 shrink-0 text-rose-600"
                                aria-hidden="true"
                              />
                            ) : (
                              <Clock
                                className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
                                aria-hidden="true"
                              />
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-900">
                                  Log #{idx + 1}: {log.stepName}
                                </span>
                                <span
                                  className={cn(
                                    "rounded px-1.5 py-0.5 text-[10px] font-bold",
                                    log.status === "SUCCESS"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : log.status === "RETRIED"
                                        ? "bg-sky-100 text-sky-800"
                                        : log.status === "FAILED"
                                          ? "bg-rose-100 text-rose-800"
                                          : "bg-amber-100 text-amber-800"
                                  )}
                                >
                                  {log.status}
                                </span>
                              </div>
                              <p className="mt-0.5 text-xs text-slate-600">{log.details}</p>
                            </div>
                          </div>
                          <span className="font-mono text-[11px] text-slate-400">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
