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
  FilterX,
  KeyRound,
  Receipt,
  ReceiptText,
  RotateCcw,
  Search,
  ShieldCheck,
  Smartphone,
  Sprout,
  Wallet,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ToastProvider";
import {
  METRIC_OPTIONS,
  getMetricMeta,
  getPayoutMethodMeta,
  maskBdMobileNumber,
} from "@/lib/domain";
import { cn, formatCurrency } from "@/lib/utils";
import {
  WorkflowRunnerWidget,
  type RunnerClaim,
  type RunnerPolicyOption,
} from "@/components/WorkflowRunnerWidget";
import { MobileWalletCard } from "@/components/MobileWalletCard";
import { DisbursementReceiptModal } from "@/components/DisbursementReceiptCard";
import { ListCardSkeleton } from "@/components/DashboardSkeletons";

interface LedgerMetrics {
  totalClaims: number;
  disbursedCount: number;
  pausedCount: number;
  failedCount: number;
  totalDisbursed: number;
  activeLiability: number;
}

type ClaimSortKey =
  | "createdAtDesc"
  | "createdAtAsc"
  | "payoutDesc"
  | "payoutAsc"
  | "coverageDesc"
  | "triggerDesc";

const CLAIM_BADGE: Record<string, string> = {
  DISBURSED: "bg-emerald-100 text-emerald-950 ring-1 ring-emerald-300",
  RESERVED: "bg-sky-100 text-sky-950 ring-1 ring-sky-300",
  CALCULATED: "bg-amber-100 text-amber-950 ring-1 ring-amber-300",
  VALIDATED: "bg-blue-100 text-blue-950 ring-1 ring-blue-300",
  TRIGGERED: "bg-amber-100 text-amber-950 ring-1 ring-amber-300",
  FAILED: "bg-rose-100 text-rose-950 ring-1 ring-rose-300",
};

const POLICY_STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-300",
  CLAIMED: "bg-indigo-50 text-indigo-900 ring-1 ring-indigo-300",
  EXPIRED: "bg-amber-50 text-amber-900 ring-1 ring-amber-300",
  CANCELLED: "bg-slate-200 text-slate-800",
};

export function ClaimLedgerClient() {
  const { user, isAdmin, getAuthHeaders } = useAuth();
  const { toast } = useToast();
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
  const [receiptClaim, setReceiptClaim] = useState<RunnerClaim | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  // Filters & sorting (M05)
  const [searchQuery, setSearchQuery] = useState("");
  const [policyStatusFilter, setPolicyStatusFilter] = useState("ALL");
  const [claimStatusFilter, setClaimStatusFilter] = useState("ALL");
  const [metricFilter, setMetricFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<ClaimSortKey>("createdAtDesc");

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
      toast({
        variant: "error",
        title: "Ledger Load Failed",
        description: "Unable to load claim audit records.",
      });
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, toast]);

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
        claim?: RunnerClaim | null;
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        const msg = data.message ?? data.error ?? "Resume failed.";
        setFeedback({ type: "error", text: msg });
        toast({
          variant: response.status === 409 ? "warning" : "error",
          title: response.status === 409 ? "Duplicate Payout Blocked" : "Resume Failed",
          description: msg,
        });
        return;
      }

      const msg = data.message ?? "Workflow resumed cleanly from Step 4 and disbursed payout.";
      setFeedback({ type: "success", text: msg });
      toast({ variant: "success", title: "Workflow Resumed & Disbursed", description: msg });
      setExpandedIds((prev) => ({ ...prev, [claimId]: true }));
      if (data.claim?.status === "DISBURSED") {
        setReceiptClaim(data.claim);
      }
      await handleWorkflowUpdated();
    } catch {
      setFeedback({ type: "error", text: "Network error while resuming workflow." });
      toast({
        variant: "error",
        title: "Network Error",
        description: "Unable to resume claim workflow.",
      });
    } finally {
      setResumingClaimId(null);
    }
  };

  const toggleExpand = (claimId: string) => {
    setExpandedIds((prev) => ({ ...prev, [claimId]: !prev[claimId] }));
  };

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    policyStatusFilter !== "ALL" ||
    claimStatusFilter !== "ALL" ||
    metricFilter !== "ALL" ||
    sortBy !== "createdAtDesc";

  const resetFilters = () => {
    setSearchQuery("");
    setPolicyStatusFilter("ALL");
    setClaimStatusFilter("ALL");
    setMetricFilter("ALL");
    setSortBy("createdAtDesc");
  };

  const filteredClaims = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return claims
      .filter((c) => {
        if (policyStatusFilter !== "ALL" && c.policy.status !== policyStatusFilter) {
          return false;
        }
        if (claimStatusFilter !== "ALL" && c.status !== claimStatusFilter) {
          return false;
        }
        if (metricFilter !== "ALL" && c.policy.metricType !== metricFilter) {
          return false;
        }
        if (
          q &&
          !c.idempotencyKey.toLowerCase().includes(q) &&
          !(c.transactionId ?? "").toLowerCase().includes(q) &&
          !(c.payoutMethod ?? "").toLowerCase().includes(q) &&
          !c.policy.farm.name.toLowerCase().includes(q) &&
          !c.policy.farm.cropType.toLowerCase().includes(q) &&
          !c.policy.farm.user.name.toLowerCase().includes(q) &&
          !c.policy.metricType.toLowerCase().includes(q) &&
          !c.policy.status.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "createdAtAsc":
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          case "payoutDesc":
            return b.payoutAmount - a.payoutAmount;
          case "payoutAsc":
            return a.payoutAmount - b.payoutAmount;
          case "coverageDesc":
            return b.policy.coverageAmount - a.policy.coverageAmount;
          case "triggerDesc":
            return b.triggerValue - a.triggerValue;
          case "createdAtDesc":
          default:
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
      });
  }, [claims, searchQuery, policyStatusFilter, claimStatusFilter, metricFilter, sortBy]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
            {isAdmin ? (
              <ShieldCheck className="h-3.5 w-3.5 text-indigo-700" aria-hidden="true" />
            ) : (
              <Sprout className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
            )}
            {isAdmin
              ? "Admin Audit · Global MFS Payout & A07 Workflow Engine"
              : `Farmer Ledger · Isolated to ${user.name}'s Payouts`}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            Claim &amp; MFS Payout Ledger
          </h1>
          <p className="mt-1 text-sm text-slate-700">
            Immutable audit trail of tiered parametric claims (50% Moderate / 100% Severe), instant{" "}
            <strong>bKash / Nagad / Rocket</strong> disbursement receipts, and 5-step workflow logs.
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-right">
          <div className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
            <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
            {isAdmin ? "Insurer Reserve Pool" : "Your Wallet Balance"}
          </div>
          <p className="mt-0.5 text-2xl font-extrabold text-emerald-950">
            {formatCurrency(liveBalance)}
          </p>
          <p className="text-xs font-medium text-emerald-800">{user.email}</p>
        </div>
      </div>

      {/* KPI Cards */}
      <section aria-label="Ledger KPIs" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
            Total Payouts Issued
          </p>
          <p className="mt-1.5 text-2xl font-extrabold text-emerald-800">
            {formatCurrency(metrics.totalDisbursed)}
          </p>
          <p className="text-xs font-medium text-slate-600">
            {metrics.disbursedCount} settled MFS payouts
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
            Total Claims Logged
          </p>
          <p className="mt-1.5 text-2xl font-extrabold text-slate-950">{metrics.totalClaims}</p>
          <p className="text-xs font-medium text-slate-600">
            {metrics.pausedCount} paused · {metrics.failedCount} failed
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
            Total Active Liability
          </p>
          <p className="mt-1.5 text-2xl font-extrabold text-slate-950">
            {formatCurrency(metrics.activeLiability)}
          </p>
          <p className="text-xs font-medium text-slate-600">
            {activePolicies.length} open contracts
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
            Data Access Scope
          </p>
          <p className="mt-1.5 text-lg font-extrabold text-indigo-800">
            {isAdmin ? "Global (All Farmers)" : "Owner-Isolated"}
          </p>
          <p className="text-xs font-medium text-slate-600">Role-based enforcement active</p>
        </div>
      </section>

      {/* Mobile Wallet Configuration Card */}
      <MobileWalletCard />

      {/* A07 Interactive Workflow Runner Visualizer */}
      {isAdmin ? (
        <WorkflowRunnerWidget
          activePolicies={activePolicies}
          claims={claims}
          getAuthHeaders={getAuthHeaders}
          onWorkflowUpdated={handleWorkflowUpdated}
        />
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-100/80 px-4 py-3 text-xs text-slate-700">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-indigo-700" aria-hidden="true" />
            <span>
              <strong>5-Step MFS Settlement Active:</strong> Moderate breaches disburse 50% and severe breaches disburse 100% straight to your configured mobile wallet with a digital receipt. Switch to <strong>Admin</strong> in the header to test the A07 Workflow Runner.
            </span>
          </span>
        </div>
      )}

      {feedback && (
        <div
          role={feedback.type === "error" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-2 rounded-xl border p-3.5 text-xs font-semibold",
            feedback.type === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-950"
              : "border-rose-300 bg-rose-50 text-rose-950"
          )}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" aria-hidden="true" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Search, Policy Status Filter, Claim Status Filter, & Dynamic Sort Toolbar */}
      <section
        aria-label="Claims Search, Filter, and Sort Controls"
        className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-emerald-700" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-950">
              Claims &amp; MFS Payout Audit Table
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
              Showing {filteredClaims.length} of {claims.length}
            </span>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <FilterX className="h-3.5 w-3.5" aria-hidden="true" />
              Reset Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-1">
            <label htmlFor="claims-search" className="sr-only">
              Search claims by farm, farmer, bKash/Nagad/Rocket, or transaction ID
            </label>
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <input
              id="claims-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search farm, Txn ID, bKash..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
            />
          </div>

          <div>
            <label htmlFor="claims-policy-status-filter" className="sr-only">
              Filter by Policy Status
            </label>
            <select
              id="claims-policy-status-filter"
              value={policyStatusFilter}
              onChange={(e) => setPolicyStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-none"
            >
              <option value="ALL">Policy Status: All</option>
              <option value="ACTIVE">Policy: ACTIVE</option>
              <option value="CLAIMED">Policy: CLAIMED</option>
              <option value="EXPIRED">Policy: EXPIRED</option>
              <option value="CANCELLED">Policy: CANCELLED</option>
            </select>
          </div>

          <div>
            <label htmlFor="claims-status-filter" className="sr-only">
              Filter by Claim Status
            </label>
            <select
              id="claims-status-filter"
              value={claimStatusFilter}
              onChange={(e) => setClaimStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-none"
            >
              <option value="ALL">Claim Status: All</option>
              <option value="DISBURSED">Claim: DISBURSED</option>
              <option value="CALCULATED">Claim: CALCULATED (Paused)</option>
              <option value="RESERVED">Claim: RESERVED</option>
              <option value="VALIDATED">Claim: VALIDATED</option>
              <option value="TRIGGERED">Claim: TRIGGERED</option>
              <option value="FAILED">Claim: FAILED</option>
            </select>
          </div>

          <div>
            <label htmlFor="claims-metric-filter" className="sr-only">
              Filter by Weather Metric
            </label>
            <select
              id="claims-metric-filter"
              value={metricFilter}
              onChange={(e) => setMetricFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-none"
            >
              <option value="ALL">Metric: All</option>
              {METRIC_OPTIONS.map((m) => (
                <option key={m.type} value={m.type}>
                  Metric: {m.shortLabel}
                </option>
              ))}
            </select>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-2">
            <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
            <label htmlFor="claims-sort" className="sr-only">
              Sort claims table
            </label>
            <select
              id="claims-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as ClaimSortKey)}
              className="w-full bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
            >
              <option value="createdAtDesc">Sort: Newest First</option>
              <option value="createdAtAsc">Sort: Oldest First</option>
              <option value="payoutDesc">Sort: Highest Payout</option>
              <option value="payoutAsc">Sort: Lowest Payout</option>
              <option value="coverageDesc">Sort: Highest Coverage</option>
              <option value="triggerDesc">Sort: Highest Trigger Value</option>
            </select>
          </div>
        </div>
      </section>

      {/* Claims Table / Accordion List */}
      {loading ? (
        <ListCardSkeleton rows={3} />
      ) : filteredClaims.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <ReceiptText className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-slate-800">
            {claims.length === 0 ? "No claims recorded yet" : "No claims match your filters"}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {claims.length === 0
              ? isAdmin
                ? "Use the Interactive 5-Step Workflow Runner above to execute a Moderate (50%) or Severe (100%) payout and generate a digital bKash/Nagad receipt."
                : "When monitored weather breaches one of your active policy thresholds, payouts and digital MFS receipts will appear here automatically."
              : "Try adjusting or clearing your search, policy status, or claim status filters."}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <FilterX className="h-3.5 w-3.5" aria-hidden="true" />
              Clear All Filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredClaims.map((claim) => {
            const isExpanded = Boolean(expandedIds[claim.id]);
            const meta = getMetricMeta(claim.policy.metricType);
            const walletMethod = claim.payoutMethod ?? claim.policy.farm.user.payoutMethod ?? "BKASH";
            const mfsMeta = getPayoutMethodMeta(walletMethod);
            const walletPhone = claim.recipientPhone ?? claim.policy.farm.user.mobileNumber;
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
                <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50/80 sm:px-6">
                  <button
                    type="button"
                    onClick={() => toggleExpand(claim.id)}
                    aria-expanded={isExpanded}
                    aria-label={`Toggle workflow logs for ${claim.policy.farm.name} claim ${claim.idempotencyKey}`}
                    className="flex flex-1 items-start gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                  >
                    <span className="mt-0.5 text-slate-500">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      )}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-slate-950">
                          {claim.policy.farm.name}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                            CLAIM_BADGE[claim.status] ?? "bg-slate-200 text-slate-800"
                          )}
                        >
                          Claim: {claim.status}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold",
                            POLICY_STATUS_BADGE[claim.policy.status] ??
                              "bg-slate-100 text-slate-700"
                          )}
                        >
                          Policy: {claim.policy.status}
                        </span>
                        {claim.severityTier && (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-extrabold",
                              claim.severityTier === "SEVERE"
                                ? "bg-rose-100 text-rose-900"
                                : "bg-amber-100 text-amber-950"
                            )}
                          >
                            {claim.severityTier} ({claim.payoutPercentage ?? 50}%)
                          </span>
                        )}
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
                            mfsMeta.badgeClass
                          )}
                        >
                          <Smartphone className="h-2.5 w-2.5" aria-hidden="true" />
                          {mfsMeta.label}
                        </span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600">
                        <span>
                          Observed:{" "}
                          <strong className="text-slate-950">
                            {claim.triggerValue}
                            {meta.unit}
                          </strong>{" "}
                          (Threshold: {claim.policy.thresholdValue}
                          {meta.unit})
                        </span>
                        <span>·</span>
                        <span>
                          {claim.policy.farm.user.name} ({maskBdMobileNumber(walletPhone)})
                        </span>
                        {claim.transactionId ? (
                          <>
                            <span>·</span>
                            <span className="font-mono text-[11px] font-bold text-slate-800">
                              Txn: {claim.transactionId}
                            </span>
                          </>
                        ) : (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                              <KeyRound className="h-3 w-3 text-slate-500" aria-hidden="true" />
                              {claim.idempotencyKey}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {claim.status === "DISBURSED" && (
                      <button
                        type="button"
                        onClick={() => setReceiptClaim(claim)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                      >
                        <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
                        View Receipt
                      </button>
                    )}

                    {canResume && (
                      <button
                        type="button"
                        onClick={() => handleResumeClaimRow(claim.id)}
                        disabled={resumingClaimId === claim.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        {resumingClaimId === claim.id ? "Resuming..." : "Resume Workflow"}
                      </button>
                    )}

                    <div className="text-right">
                      <p
                        className={cn(
                          "text-lg font-extrabold",
                          claim.status === "DISBURSED" ? "text-emerald-800" : "text-amber-800"
                        )}
                      >
                        {formatCurrency(claim.payoutAmount)}
                      </p>
                      <p className="text-[11px] font-medium text-slate-600">
                        Step {claim.currentStep}/5 · {new Date(claim.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-200 bg-slate-50/80 px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                        Workflow Execution State Logs ({claim.workflowLogs.length})
                      </h3>
                      <span className="text-xs font-semibold text-slate-700">
                        Max Coverage Cap: {formatCurrency(claim.policy.coverageAmount)} · Key:{" "}
                        <span className="font-mono">{claim.idempotencyKey}</span>
                      </span>
                    </div>

                    {claim.failureReason && (
                      <div
                        role="alert"
                        className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs font-medium text-rose-950"
                      >
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
                                    ? "text-sky-700"
                                    : "text-emerald-700"
                                )}
                                aria-hidden="true"
                              />
                            ) : log.status === "FAILED" ? (
                              <XCircle
                                className="mt-0.5 h-4 w-4 shrink-0 text-rose-700"
                                aria-hidden="true"
                              />
                            ) : (
                              <Clock
                                className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                                aria-hidden="true"
                              />
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-950">
                                  Log #{idx + 1}: {log.stepName}
                                </span>
                                <span
                                  className={cn(
                                    "rounded px-1.5 py-0.5 text-[10px] font-bold",
                                    log.status === "SUCCESS"
                                      ? "bg-emerald-100 text-emerald-900"
                                      : log.status === "RETRIED"
                                        ? "bg-sky-100 text-sky-900"
                                        : log.status === "FAILED"
                                          ? "bg-rose-100 text-rose-900"
                                          : "bg-amber-100 text-amber-900"
                                  )}
                                >
                                  {log.status}
                                </span>
                              </div>
                              <p className="mt-0.5 text-xs text-slate-700">{log.details}</p>
                            </div>
                          </div>
                          <span className="font-mono text-[11px] font-medium text-slate-600">
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

      {/* Digital MFS Disbursement Receipt Modal */}
      <DisbursementReceiptModal claim={receiptClaim} onClose={() => setReceiptClaim(null)} />
    </div>
  );
}
