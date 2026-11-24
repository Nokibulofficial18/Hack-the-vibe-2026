"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  ArrowUpDown,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FilterX,
  KeyRound,
  Lock,
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
import { useTranslation } from "@/lib/i18n";
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
  DISBURSED: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  RESERVED: "bg-amber-50 text-amber-700 border border-amber-200",
  CALCULATED: "bg-amber-50 text-amber-700 border border-amber-200",
  VALIDATED: "bg-slate-100 text-slate-600 border border-slate-200",
  TRIGGERED: "bg-amber-50 text-amber-700 border border-amber-200",
  FAILED: "bg-rose-50 text-rose-700 border border-rose-200",
};

const POLICY_STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  CLAIMED: "bg-amber-50 text-amber-700 border border-amber-200",
  EXPIRED: "bg-amber-50 text-amber-700 border border-amber-200",
  CANCELLED: "bg-slate-100 text-slate-600 border border-slate-200",
};

export function ClaimLedgerClient() {
  const { user, isAdmin, getAuthHeaders } = useAuth();
  const { t, translateStatus, translateMetric } = useTranslation();
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
      setFeedback({ type: "error", text: t("ledgerLoadFailedDesc") });
      toast({
        variant: "error",
        title: t("ledgerLoadFailedTitle"),
        description: t("ledgerLoadFailedDesc"),
      });
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, toast, t]);

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
        const msg = data.message ?? data.error ?? t("resumeFailedTitle");
        setFeedback({ type: "error", text: msg });
        toast({
          variant: response.status === 409 ? "warning" : "error",
          title: response.status === 409 ? t("duplicateBlockedTitle") : t("resumeFailedTitle"),
          description: msg,
        });
        return;
      }

      const msg = data.message ?? t("payoutDisbursedTitle");
      setFeedback({ type: "success", text: msg });
      toast({ variant: "success", title: t("payoutDisbursedTitle"), description: msg });
      setExpandedIds((prev) => ({ ...prev, [claimId]: true }));
      if (data.claim?.status === "DISBURSED") {
        setReceiptClaim(data.claim);
      }
      await handleWorkflowUpdated();
    } catch {
      setFeedback({ type: "error", text: t("resumeNetworkErrDesc") });
      toast({
        variant: "error",
        title: t("networkErrorTitle"),
        description: t("resumeNetworkErrDesc"),
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
      {/* Minimalist Page Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600">
            {isAdmin ? (
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
            ) : (
              <Sprout className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
            )}
            <span>
              {isAdmin ? t("claimsRoleAdmin") : t("claimsRoleFarmer", { name: user.name })}
            </span>
          </span>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {t("claimsHeading")}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{t("claimsSubtitle")}</p>
        </div>

        <div className="flex shrink-0 items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-xs">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <Wallet className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wider text-slate-500">
              {isAdmin ? t("reservePool") : t("walletBalance")}
            </p>
            <p className="text-lg font-semibold tracking-tight text-slate-900">
              {formatCurrency(liveBalance)}
            </p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <section aria-label="Ledger KPIs" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 border-t-2 border-t-emerald-500/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              {t("totalPayouts")}
            </p>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-600/20">
              <Banknote className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-semibold tracking-tight text-slate-900">
              {formatCurrency(metrics.totalDisbursed)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {t("kpiSettledPayoutsSub", { count: metrics.disbursedCount })}
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 border-t-2 border-t-sky-500/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              {t("kpiTotalClaims")}
            </p>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm shadow-sky-500/20">
              <Activity className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-semibold tracking-tight text-slate-900">
              {metrics.totalClaims}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {t("kpiPausedFailedSub", {
                paused: metrics.pausedCount,
                failed: metrics.failedCount,
              })}
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 border-t-2 border-t-amber-500/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              {t("totalCoverage")}
            </p>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm shadow-amber-500/20">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-semibold tracking-tight text-slate-900">
              {formatCurrency(metrics.activeLiability)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {t("kpiOpenContractsSub", { count: activePolicies.length })}
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 border-t-2 border-t-teal-500/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              {t("kpiDataScope")}
            </p>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-sm shadow-teal-600/20">
              <Lock className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-semibold tracking-tight text-slate-900">
              {isAdmin ? t("scopeGlobal") : t("scopeIsolated")}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {isAdmin ? t("scopeGlobalSub") : t("scopeIsolatedSub")}
            </p>
          </div>
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
        <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-5 py-3.5 text-xs text-slate-600 shadow-xs">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
          <span>
            <strong className="font-medium text-slate-900">{t("farmerWorkflowNoteTitle")}</strong>{" "}
            {t("farmerWorkflowNoteBody")}
          </span>
        </div>
      )}

      {feedback && (
        <div
          role={feedback.type === "error" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-2 rounded-xl border p-3.5 text-xs font-medium",
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          )}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Unified Claims & Payout Audit Table Card */}
      <section
        aria-label="Claims Search, Filter, and Sort Controls"
        className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs"
      >
        <div className="space-y-3 border-b border-slate-100 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-900">{t("claimsTableTitle")}</h2>
              <span className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                {t("showingOfCount", { shown: filteredClaims.length, total: claims.length })}
              </span>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
              >
                <FilterX className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{t("resetFiltersBtn")}</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative lg:col-span-1">
              <label htmlFor="claims-search" className="sr-only">
                {t("searchClaimsPlaceholder")}
              </label>
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="claims-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("searchClaimsPlaceholder")}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
              />
            </div>

            <div>
              <label htmlFor="claims-policy-status-filter" className="sr-only">
                {t("filterPolicyStatusAll")}
              </label>
              <select
                id="claims-policy-status-filter"
                value={policyStatusFilter}
                onChange={(e) => setPolicyStatusFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 focus:border-emerald-700 focus:outline-none"
              >
                <option value="ALL">{t("filterPolicyStatusAll")}</option>
                <option value="ACTIVE">{translateStatus("ACTIVE")}</option>
                <option value="CLAIMED">{translateStatus("CLAIMED")}</option>
                <option value="EXPIRED">{translateStatus("EXPIRED")}</option>
                <option value="CANCELLED">{translateStatus("CANCELLED")}</option>
              </select>
            </div>

            <div>
              <label htmlFor="claims-status-filter" className="sr-only">
                {t("filterClaimStatusAll")}
              </label>
              <select
                id="claims-status-filter"
                value={claimStatusFilter}
                onChange={(e) => setClaimStatusFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 focus:border-emerald-700 focus:outline-none"
              >
                <option value="ALL">{t("filterClaimStatusAll")}</option>
                <option value="DISBURSED">{translateStatus("DISBURSED")}</option>
                <option value="CALCULATED">{translateStatus("CALCULATED")}</option>
                <option value="RESERVED">{translateStatus("RESERVED")}</option>
                <option value="VALIDATED">{translateStatus("VALIDATED")}</option>
                <option value="TRIGGERED">{translateStatus("TRIGGERED")}</option>
                <option value="FAILED">{translateStatus("FAILED")}</option>
              </select>
            </div>

            <div>
              <label htmlFor="claims-metric-filter" className="sr-only">
                {t("filterMetricAll")}
              </label>
              <select
                id="claims-metric-filter"
                value={metricFilter}
                onChange={(e) => setMetricFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 focus:border-emerald-700 focus:outline-none"
              >
                <option value="ALL">{t("filterMetricAll")}</option>
                {METRIC_OPTIONS.map((m) => (
                  <option key={m.type} value={m.type}>
                    {translateMetric(m.type)}
                  </option>
                ))}
              </select>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
              <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
              <label htmlFor="claims-sort" className="sr-only">
                Sort claims table
              </label>
              <select
                id="claims-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as ClaimSortKey)}
                className="w-full bg-transparent text-xs font-medium text-slate-700 focus:outline-none"
              >
                <option value="createdAtDesc">{t("sortNewestFirst")}</option>
                <option value="createdAtAsc">{t("sortOldestFirst")}</option>
                <option value="payoutDesc">{t("sortHighestPayout")}</option>
                <option value="payoutAsc">{t("sortLowestPayout")}</option>
                <option value="coverageDesc">{t("sortClaimsHighestCoverage")}</option>
                <option value="triggerDesc">{t("sortHighestTrigger")}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Claims Accordion Rows */}
        {loading ? (
          <div className="p-5">
            <ListCardSkeleton rows={3} />
          </div>
        ) : filteredClaims.length === 0 ? (
          <div className="p-12 text-center">
            <ReceiptText className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-slate-900">
              {claims.length === 0 ? t("noClaimsRecorded") : t("noClaimsMatch")}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {claims.length === 0
                ? isAdmin
                  ? t("noClaimsAdminHint")
                  : t("noClaimsFarmerHint")
                : t("noClaimsFilterHint")}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-800"
              >
                <FilterX className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{t("clearAllFiltersBtn")}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
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
                <article key={claim.id}>
                  <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5 transition hover:bg-slate-50/80 sm:px-5">
                    <button
                      type="button"
                      onClick={() => toggleExpand(claim.id)}
                      aria-expanded={isExpanded}
                      aria-label={`Toggle workflow logs for ${claim.policy.farm.name} claim ${claim.idempotencyKey}`}
                      className="flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30"
                    >
                      <span className="mt-0.5 shrink-0 text-slate-400">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            {claim.policy.farm.name}
                          </span>
                          <span
                            className={cn(
                              "whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                              CLAIM_BADGE[claim.status] ??
                                "border border-slate-200 bg-slate-100 text-slate-600"
                            )}
                          >
                            {translateStatus(claim.status)}
                          </span>
                          <span
                            className={cn(
                              "whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium",
                              POLICY_STATUS_BADGE[claim.policy.status] ??
                                "border border-slate-200 bg-slate-100 text-slate-600"
                            )}
                          >
                            {translateStatus(claim.policy.status)}
                          </span>
                          {claim.severityTier && (
                            <span
                              className={cn(
                                "whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                claim.severityTier === "SEVERE"
                                  ? "border-rose-200 bg-rose-50 text-rose-700"
                                  : "border-amber-200 bg-amber-50 text-amber-700"
                              )}
                            >
                              {translateStatus(claim.severityTier)} ({claim.payoutPercentage ?? 50}%)
                            </span>
                          )}
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium",
                              mfsMeta.badgeClass
                            )}
                          >
                            <Smartphone className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                            {mfsMeta.label}
                          </span>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-2.5 text-xs text-slate-500">
                          <span>
                            {t("observedLabel")}{" "}
                            <strong className="font-medium text-slate-900">
                              {claim.triggerValue}
                              {meta.unit}
                            </strong>{" "}
                            ({t("thresholdInline", { val: claim.policy.thresholdValue, unit: meta.unit })})
                          </span>
                          <span className="text-slate-300">·</span>
                          <span>
                            {claim.policy.farm.user.name} ({maskBdMobileNumber(walletPhone)})
                          </span>
                          {claim.transactionId ? (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="font-mono text-[11px] font-medium text-slate-700">
                                Txn: {claim.transactionId}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500">
                                <KeyRound className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
                                {claim.idempotencyKey}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>

                    <div className="flex shrink-0 flex-wrap items-center gap-2.5">
                      {claim.status === "DISBURSED" && (
                        <button
                          type="button"
                          onClick={() => setReceiptClaim(claim)}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30"
                        >
                          <Receipt className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>{t("viewReceipt")}</span>
                        </button>
                      )}

                      {canResume && (
                        <button
                          type="button"
                          onClick={() => handleResumeClaimRow(claim.id)}
                          disabled={resumingClaimId === claim.id}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm shadow-emerald-600/20 transition hover:from-emerald-700 hover:to-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/30 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>{resumingClaimId === claim.id ? "..." : t("resumeWorkflow")}</span>
                        </button>
                      )}

                      <div className="text-right">
                        <p
                          className={cn(
                            "text-base font-semibold tracking-tight",
                            claim.status === "DISBURSED" ? "text-emerald-700" : "text-amber-700"
                          )}
                        >
                          {formatCurrency(claim.payoutAmount)}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {t("stepProgressInline", { step: claim.currentStep })} ·{" "}
                          {new Date(claim.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                          {t("workflowLogsHeading", { count: claim.workflowLogs.length })}
                        </h3>
                        <span className="text-xs text-slate-600">
                          {t("maxCapLabel")}{" "}
                          <strong className="font-medium text-slate-900">
                            {formatCurrency(claim.policy.coverageAmount)}
                          </strong>{" "}
                          · {t("keyLabel")}{" "}
                          <span className="font-mono text-[11px]">{claim.idempotencyKey}</span>
                        </span>
                      </div>

                      {claim.failureReason && (
                        <div
                          role="alert"
                          className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
                        >
                          <strong className="font-semibold">{t("pausedFailureLabel")}</strong>{" "}
                          {claim.failureReason}
                        </div>
                      )}

                      <ol className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/80 bg-white">
                        {claim.workflowLogs.map((log, idx) => (
                          <li
                            key={log.id}
                            className="flex flex-wrap items-start justify-between gap-2 px-4 py-3"
                          >
                            <div className="flex items-start gap-2.5">
                              {log.status === "SUCCESS" || log.status === "RETRIED" ? (
                                <CheckCircle2
                                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"
                                  aria-hidden="true"
                                />
                              ) : log.status === "FAILED" ? (
                                <XCircle
                                  className="mt-0.5 h-4 w-4 shrink-0 text-rose-600"
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
                                  <span className="text-xs font-semibold text-slate-900">
                                    #{idx + 1} · {log.stepName}
                                  </span>
                                  <span
                                    className={cn(
                                      "whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                      log.status === "SUCCESS" || log.status === "RETRIED"
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                        : log.status === "FAILED"
                                          ? "border-rose-200 bg-rose-50 text-rose-700"
                                          : "border-amber-200 bg-amber-50 text-amber-700"
                                    )}
                                  >
                                    {log.status === "RETRIED"
                                      ? t("stageStatusRecovered")
                                      : log.status === "SUCCESS"
                                        ? t("stageStatusSuccess")
                                        : log.status === "FAILED"
                                          ? t("stageStatusFailed")
                                          : t("stageStatusPending")}
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
      </section>

      {/* Digital MFS Disbursement Receipt Modal */}
      <DisbursementReceiptModal claim={receiptClaim} onClose={() => setReceiptClaim(null)} />
    </div>
  );
}
