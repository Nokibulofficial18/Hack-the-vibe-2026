"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowUpDown,
  Banknote,
  Calculator,
  CheckCircle2,
  FileCheck2,
  FileText,
  Plus,
  Search,
  ShieldCheck,
  Sprout,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";
import { ListCardSkeleton } from "@/components/DashboardSkeletons";
import {
  METRIC_OPTIONS,
  evaluateTieredPayout,
  getMetricMeta,
  getSevereThresholdCutoff,
  validatePolicyPayload,
  type MetricType,
} from "@/lib/domain";
import { cn, formatCurrency } from "@/lib/utils";

interface FarmOption {
  id: string;
  name: string;
  cropType: string;
  latitude: number;
  longitude: number;
  user: { id: string; name: string };
}

interface PolicyRecord {
  id: string;
  farmId: string;
  metricType: string;
  thresholdValue: number;
  coverageAmount: number;
  premiumPaid: number;
  startDate: string;
  endDate: string;
  status: string;
  createdAt: string;
  farm: {
    id: string;
    name: string;
    cropType: string;
    latitude: number;
    longitude: number;
    user: { id: string; name: string; email: string };
  };
  claims: Array<{
    id: string;
    status: string;
    payoutAmount: number;
  }>;
}

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  CLAIMED: "bg-amber-50 text-amber-700 border border-amber-200",
  EXPIRED: "bg-amber-50 text-amber-700 border border-amber-200",
  CANCELLED: "bg-slate-100 text-slate-600 border border-slate-200",
};

export function PolicyRegistryClient() {
  const { user, isAdmin, getAuthHeaders } = useAuth();
  const { t, translateStatus, translateMetric } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedFarmId = searchParams.get("farmId") ?? "";

  const [farms, setFarms] = useState<FarmOption[]>([]);
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [metricFilter, setMetricFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<"createdAt" | "coverageAmount" | "thresholdValue">("createdAt");

  const [farmId, setFarmId] = useState(preselectedFarmId);
  const [metricType, setMetricType] = useState<MetricType>("RAINFALL_MAX");
  const [thresholdValue, setThresholdValue] = useState("65");
  const [coverageAmount, setCoverageAmount] = useState("15000");
  const [premiumPaid, setPremiumPaid] = useState("900");
  const [durationDays, setDurationDays] = useState("180");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const [farmsRes, policiesRes] = await Promise.all([
        fetch("/api/farms", { headers, cache: "no-store" }),
        fetch("/api/policies", { headers, cache: "no-store" }),
      ]);

      if (farmsRes.ok) {
        const farmData = (await farmsRes.json()) as { farms: FarmOption[] };
        setFarms(farmData.farms);
        setFarmId((prev) => {
          if (preselectedFarmId && farmData.farms.some((f) => f.id === preselectedFarmId)) {
            return preselectedFarmId;
          }
          if (prev && farmData.farms.some((f) => f.id === prev)) {
            return prev;
          }
          return farmData.farms[0]?.id ?? "";
        });
      }

      if (policiesRes.ok) {
        const policyData = (await policiesRes.json()) as { policies: PolicyRecord[] };
        setPolicies(policyData.policies);
      }
    } catch {
      setFormError(t("policyLoadErr"));
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, preselectedFarmId, t]);

  useEffect(() => {
    void loadData();
  }, [user.id, loadData]);

  const handleMetricChange = (nextMetric: MetricType) => {
    setMetricType(nextMetric);
    const meta = getMetricMeta(nextMetric);
    setThresholdValue(String(meta.defaultThreshold));
  };

  const handleCoverageChange = (val: string) => {
    setCoverageAmount(val);
    const num = Number(val);
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (val !== "" && (Number.isNaN(num) || num <= 0)) {
        next.coverageAmount = t("policyCoverageMinErr");
      } else if (num > 5000000) {
        next.coverageAmount = t("policyCoverageMaxErr");
      } else {
        delete next.coverageAmount;
      }
      return next;
    });
    if (!Number.isNaN(num) && num > 0) {
      setPremiumPaid(String(Math.round(num * 0.06 * 100) / 100));
    }
  };

  const handleCreatePolicy = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const validation = validatePolicyPayload({
      farmId,
      metricType,
      thresholdValue,
      coverageAmount,
      premiumPaid,
      durationDays,
    });

    if (!validation.valid) {
      setFieldErrors(validation.errors);
      const firstError = Object.values(validation.errors)[0];
      setFormError(t("policyFixErrors"));
      toast({
        variant: "error",
        title: t("policyInvalidToastTitle"),
        description: firstError,
      });
      return;
    }

    setFieldErrors({});
    setSubmitting(true);

    try {
      const response = await fetch("/api/policies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          farmId,
          metricType,
          thresholdValue: Number(thresholdValue),
          coverageAmount: Number(coverageAmount),
          premiumPaid: Number(premiumPaid),
          durationDays: Number(durationDays),
        }),
      });

      const data = (await response.json()) as {
        policy?: PolicyRecord;
        error?: string;
        fieldErrors?: Record<string, string>;
      };

      if (!response.ok) {
        setFieldErrors(data.fieldErrors ?? {});
        const msg = data.error ?? t("policyRejectedTitle");
        setFormError(msg);
        toast({ variant: "error", title: t("policyRejectedTitle"), description: msg });
        return;
      }

      const meta = getMetricMeta(metricType);
      const msg = t("policyIssuedDesc", {
        metric: translateMetric(metricType),
        threshold: thresholdValue,
        unit: meta.unit,
        coverage: formatCurrency(Number(coverageAmount)),
        farm: data.policy?.farm.name ?? "",
      });
      setSuccessMessage(msg);
      toast({ variant: "success", title: t("policyIssuedTitle"), description: msg });
      await loadData();
      router.refresh();
    } catch {
      const msg = t("policyRejectedTitle");
      setFormError(msg);
      toast({ variant: "error", title: t("networkErrorTitle"), description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelPolicy = async (policy: PolicyRecord) => {
    if (!window.confirm(t("policyCancelConfirm", { farm: policy.farm.name }))) return;
    try {
      const response = await fetch(`/api/policies/${policy.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      if (response.ok) {
        const msg = t("policyCancelledDesc", { farm: policy.farm.name });
        setSuccessMessage(msg);
        toast({ variant: "info", title: t("policyCancelledTitle"), description: msg });
        await loadData();
        router.refresh();
      }
    } catch {
      const msg = t("policyUpdateErrDesc");
      setFormError(msg);
      toast({ variant: "error", title: t("policyUpdateErrTitle"), description: msg });
    }
  };

  const filteredPolicies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return policies
      .filter((p) => {
        if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
        if (metricFilter !== "ALL" && p.metricType !== metricFilter) return false;
        if (
          q &&
          !p.farm.name.toLowerCase().includes(q) &&
          !p.farm.cropType.toLowerCase().includes(q) &&
          !p.farm.user.name.toLowerCase().includes(q) &&
          !p.metricType.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "coverageAmount") return b.coverageAmount - a.coverageAmount;
        if (sortBy === "thresholdValue") return b.thresholdValue - a.thresholdValue;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [policies, searchQuery, statusFilter, metricFilter, sortBy]);

  const kpis = useMemo(() => {
    const active = policies.filter((p) => p.status === "ACTIVE");
    const claimed = policies.filter((p) => p.status === "CLAIMED");
    return {
      activeCount: active.length,
      claimedCount: claimed.length,
      activeLiability: active.reduce((sum, p) => sum + p.coverageAmount, 0),
      totalPremiums: policies.reduce((sum, p) => sum + p.premiumPaid, 0),
    };
  }, [policies]);

  const activeMetricMeta = getMetricMeta(metricType);
  const parsedThreshold = Math.max(1, Number(thresholdValue) || 1);
  const parsedCoverage = Math.max(0, Number(coverageAmount) || 0);
  const severeCutoff = getSevereThresholdCutoff(metricType, parsedThreshold);
  const moderatePreview = evaluateTieredPayout(
    metricType,
    parsedCoverage,
    parsedThreshold,
    parsedThreshold
  );
  const severePreview = evaluateTieredPayout(
    metricType,
    parsedCoverage,
    severeCutoff,
    parsedThreshold
  );

  return (
    <div className="space-y-6">
      {/* Minimalist Page Header */}
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {isAdmin ? (
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
          ) : (
            <Sprout className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
          )}
          <span>
            {isAdmin ? t("policiesRoleAdmin") : t("policiesRoleFarmer", { name: user.name })}
          </span>
        </span>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          {t("policiesHeading")}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{t("policiesSubtitle")}</p>
      </div>

      {/* KPI Cards Row */}
      <section aria-label="Policy Portfolio KPIs" className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 border-t-2 border-t-emerald-500/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              {t("kpiActiveLiability")}
            </p>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-600/20">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-semibold tracking-tight text-slate-900">
              {formatCurrency(kpis.activeLiability)}
            </p>
            <p className="mt-1 text-xs text-slate-500">{t("kpiActiveLiabilitySub")}</p>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 border-t-2 border-t-sky-500/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              {t("kpiActiveVsClaimed")}
            </p>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm shadow-sky-500/20">
              <FileText className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-semibold tracking-tight text-slate-900">
              {kpis.activeCount}{" "}
              <span className="text-base font-medium text-slate-400">/ {kpis.claimedCount}</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">{t("kpiActiveVsClaimedSub")}</p>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 border-t-2 border-t-amber-500/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              {t("kpiPremiumsPool")}
            </p>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm shadow-amber-500/20">
              <Banknote className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-semibold tracking-tight text-slate-900">
              {formatCurrency(kpis.totalPremiums)}
            </p>
            <p className="mt-1 text-xs text-slate-500">{t("kpiPremiumsPoolSub")}</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Create Policy Form */}
        <section
          aria-labelledby="issue-policy-heading"
          className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs lg:col-span-5"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Plus className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 id="issue-policy-heading" className="text-sm font-semibold text-slate-900">
              {t("issuePolicyHeading")}
            </h2>
          </div>

          {formError && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
              <span>{formError}</span>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-700"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
              <span>{successMessage}</span>
            </div>
          )}

          {farms.length === 0 && !loading ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center">
              <p className="text-sm font-medium text-slate-900">{t("noFarmsYetTitle")}</p>
              <p className="mt-1 text-xs text-slate-500">{t("noFarmsYetDesc")}</p>
              <Link
                href="/farms"
                className="mt-3 inline-flex items-center whitespace-nowrap rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-800"
              >
                {t("goToFarmRegistry")}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleCreatePolicy} noValidate className="mt-4 space-y-4">
              <div>
                <label htmlFor="policy-farm" className="block text-xs font-medium text-slate-600">
                  {t("targetFarmPlot")}
                </label>
                <select
                  id="policy-farm"
                  value={farmId}
                  onChange={(e) => setFarmId(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
                >
                  {farms.map((farm) => (
                    <option key={farm.id} value={farm.id}>
                      {farm.name} — {farm.cropType}
                      {isAdmin ? ` (${farm.user.name})` : ""}
                    </option>
                  ))}
                </select>
                {fieldErrors.farmId && (
                  <p className="mt-1 text-xs font-medium text-rose-700">{fieldErrors.farmId}</p>
                )}
              </div>

              <div>
                <label htmlFor="metric-type" className="block text-xs font-medium text-slate-600">
                  {t("parametricMetricLabel")}
                </label>
                <select
                  id="metric-type"
                  value={metricType}
                  onChange={(e) => handleMetricChange(e.target.value as MetricType)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
                >
                  {METRIC_OPTIONS.map((m) => (
                    <option key={m.type} value={m.type}>
                      {translateMetric(m.type)} ({m.type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="threshold-val"
                    className="block text-xs font-medium text-slate-600"
                  >
                    {t("triggerThresholdLabel", { unit: activeMetricMeta.unit })}
                  </label>
                  <input
                    id="threshold-val"
                    type="number"
                    step="any"
                    value={thresholdValue}
                    onChange={(e) => setThresholdValue(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
                  />
                  {fieldErrors.thresholdValue && (
                    <p className="mt-1 text-xs font-medium text-rose-700">
                      {fieldErrors.thresholdValue}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="coverage-amount"
                    className="block text-xs font-medium text-slate-600"
                  >
                    {t("maxCoverageLabel")}
                  </label>
                  <input
                    id="coverage-amount"
                    type="number"
                    step="1000"
                    min="1"
                    value={coverageAmount}
                    onChange={(e) => handleCoverageChange(e.target.value)}
                    aria-invalid={Boolean(fieldErrors.coverageAmount)}
                    aria-describedby={fieldErrors.coverageAmount ? "coverage-amount-error" : undefined}
                    className={cn(
                      "mt-1.5 w-full rounded-lg border px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2",
                      fieldErrors.coverageAmount
                        ? "border-rose-300 bg-rose-50/40 focus:border-rose-500 focus:ring-rose-500/20"
                        : "border-slate-200 focus:border-emerald-700 focus:ring-emerald-700/15"
                    )}
                  />
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {[5000, 15000, 25000, 50000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleCoverageChange(String(preset))}
                        className={cn(
                          "whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition",
                          Number(coverageAmount) === preset
                            ? "border-emerald-700 bg-emerald-700 text-white"
                            : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:text-slate-900"
                        )}
                      >
                        {formatCurrency(preset)}
                      </button>
                    ))}
                  </div>
                  {fieldErrors.coverageAmount && (
                    <p
                      id="coverage-amount-error"
                      role="alert"
                      className="mt-1 text-xs font-medium text-rose-700"
                    >
                      {fieldErrors.coverageAmount}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="premium-paid" className="block text-xs font-medium text-slate-600">
                    {t("premiumPaidLabel")}
                  </label>
                  <input
                    id="premium-paid"
                    type="number"
                    step="any"
                    value={premiumPaid}
                    onChange={(e) => setPremiumPaid(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
                  />
                  {fieldErrors.premiumPaid && (
                    <p className="mt-1 text-xs font-medium text-rose-700">
                      {fieldErrors.premiumPaid}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="duration-days"
                    className="block text-xs font-medium text-slate-600"
                  >
                    {t("coverageWindowLabel")}
                  </label>
                  <input
                    id="duration-days"
                    type="number"
                    value={durationDays}
                    onChange={(e) => setDurationDays(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
                  />
                  {fieldErrors.durationDays && (
                    <p className="mt-1 text-xs font-medium text-rose-700">
                      {fieldErrors.durationDays}
                    </p>
                  )}
                </div>
              </div>

              {/* Live Tiered Payout Rules Preview */}
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                  <Calculator className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
                  <span>{t("tieredScheduleTitle")}</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-600">{t("tieredScheduleDesc")}</p>
                <div className="mt-2.5 grid grid-cols-2 gap-2.5 text-xs">
                  <div className="rounded-lg border border-slate-200/80 bg-white p-2.5">
                    <span className="text-[11px] font-medium text-amber-700">
                      {t("moderateLabel")} ({parsedThreshold}–{severeCutoff - 0.1}
                      {activeMetricMeta.unit}) · 50%
                    </span>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900">
                      {formatCurrency(moderatePreview.payoutAmount)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200/80 bg-white p-2.5">
                    <span className="text-[11px] font-medium text-emerald-700">
                      {t("severeLabel")} (≥ {severeCutoff}
                      {activeMetricMeta.unit}) · 100%
                    </span>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900">
                      {formatCurrency(severePreview.payoutAmount)}
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-emerald-600/20 transition hover:from-emerald-700 hover:to-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FileCheck2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{submitting ? t("issuingPolicy") : t("issuePolicyBtn")}</span>
              </button>
            </form>
          )}
        </section>

        {/* Policy Portfolio Table with Search / Filter / Sort */}
        <section aria-labelledby="policy-list-heading" className="lg:col-span-7">
          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <h2 id="policy-list-heading" className="text-sm font-semibold text-slate-900">
                  {t("policyContractsHeading")}
                </h2>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  {filteredPolicies.length}
                </span>
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
                    placeholder={t("filterFarmPlaceholder")}
                    aria-label={t("filterFarmPlaceholder")}
                    className="w-40 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
                  />
                </div>
                <select
                  aria-label={t("allStatuses")}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-emerald-700 focus:outline-none"
                >
                  <option value="ALL">{t("allStatuses")}</option>
                  <option value="ACTIVE">{translateStatus("ACTIVE")}</option>
                  <option value="CLAIMED">{translateStatus("CLAIMED")}</option>
                  <option value="CANCELLED">{translateStatus("CANCELLED")}</option>
                  <option value="EXPIRED">{translateStatus("EXPIRED")}</option>
                </select>
                <select
                  aria-label={t("allMetrics")}
                  value={metricFilter}
                  onChange={(e) => setMetricFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-emerald-700 focus:outline-none"
                >
                  <option value="ALL">{t("allMetrics")}</option>
                  {METRIC_OPTIONS.map((m) => (
                    <option key={m.type} value={m.type}>
                      {translateMetric(m.type)}
                    </option>
                  ))}
                </select>
                <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                  <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                  <select
                    aria-label="Sort policies"
                    value={sortBy}
                    onChange={(e) =>
                      setSortBy(
                        e.target.value as "createdAt" | "coverageAmount" | "thresholdValue"
                      )
                    }
                    className="bg-transparent text-xs font-medium text-slate-700 focus:outline-none"
                  >
                    <option value="createdAt">{t("sortNewest")}</option>
                    <option value="coverageAmount">{t("sortHighestCoverage")}</option>
                    <option value="thresholdValue">{t("sortHighestThreshold")}</option>
                  </select>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="p-5">
                <ListCardSkeleton rows={3} />
              </div>
            ) : filteredPolicies.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                {t("noPoliciesMatch")}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-3">{t("colFarmWindow")}</th>
                      <th className="whitespace-nowrap px-4 py-3">{t("colTriggerRule")}</th>
                      <th className="whitespace-nowrap px-4 py-3">{t("colCoveragePremium")}</th>
                      <th className="whitespace-nowrap px-4 py-3">{t("colStatus")}</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right">{t("colActions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPolicies.map((policy) => {
                      const meta = getMetricMeta(policy.metricType);
                      return (
                        <tr key={policy.id} className="transition hover:bg-slate-50/80">
                          <td className="px-4 py-3.5">
                            <div className="font-medium text-slate-900">{policy.farm.name}</div>
                            <div className="text-xs text-slate-500">
                              {policy.farm.cropType}
                              {isAdmin ? ` · ${policy.farm.user.name}` : ""}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-400">
                              {new Date(policy.startDate).toLocaleDateString()} –{" "}
                              {new Date(policy.endDate).toLocaleDateString()}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5">
                            <span className="inline-block rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-700">
                              {policy.metricType}
                            </span>
                            <div className="mt-1 text-xs font-medium text-slate-700">
                              ≥ {policy.thresholdValue} {meta.unit}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5">
                            <div className="font-semibold text-slate-900">
                              {formatCurrency(policy.coverageAmount)}
                            </div>
                            <div className="text-xs text-slate-500">
                              {t("premiumPrefix")} {formatCurrency(policy.premiumPaid)}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5">
                            <span
                              className={cn(
                                "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
                                STATUS_BADGE[policy.status] ??
                                  "border border-slate-200 bg-slate-100 text-slate-600"
                              )}
                            >
                              {translateStatus(policy.status)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 text-right">
                            {policy.status === "ACTIVE" ? (
                              <button
                                type="button"
                                onClick={() => handleCancelPolicy(policy)}
                                className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                              >
                                <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span>{t("cancelBtn")}</span>
                              </button>
                            ) : (
                              <Link
                                href="/claims"
                                className="whitespace-nowrap text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
                              >
                                {t("viewLedgerLink")}
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
