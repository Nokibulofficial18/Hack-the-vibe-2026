"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowUpDown,
  Calculator,
  CheckCircle2,
  FileCheck2,
  Plus,
  Search,
  ShieldCheck,
  Sprout,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  METRIC_OPTIONS,
  calculateParametricPayout,
  getMetricMeta,
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
  ACTIVE: "bg-emerald-100 text-emerald-800",
  CLAIMED: "bg-indigo-100 text-indigo-800",
  EXPIRED: "bg-amber-100 text-amber-800",
  CANCELLED: "bg-slate-200 text-slate-700",
};

export function PolicyRegistryClient() {
  const { user, isAdmin, getAuthHeaders } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedFarmId = searchParams.get("farmId") ?? "";

  const [farms, setFarms] = useState<FarmOption[]>([]);
  const [policies, setPolicies] = useState<PolicyRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & sorting (M05)
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [metricFilter, setMetricFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<"createdAt" | "coverageAmount" | "thresholdValue">("createdAt");

  // Policy Form
  const [farmId, setFarmId] = useState(preselectedFarmId);
  const [metricType, setMetricType] = useState<MetricType>("RAINFALL_MAX");
  const [thresholdValue, setThresholdValue] = useState("50");
  const [coverageAmount, setCoverageAmount] = useState("1000");
  const [premiumPaid, setPremiumPaid] = useState("60");
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
      setFormError("Failed to load policy registry.");
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, preselectedFarmId]);

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
      setFormError("Please fix the validation errors before issuing this policy.");
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
        setFormError(data.error ?? "Failed to create parametric policy.");
        return;
      }

      const meta = getMetricMeta(metricType);
      setSuccessMessage(
        `Issued active ${meta.label} policy (≥ ${thresholdValue}${meta.unit}, max ${formatCurrency(Number(coverageAmount))}) for ${data.policy?.farm.name}.`
      );
      await loadData();
      router.refresh();
    } catch {
      setFormError("Network error while creating policy.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelPolicy = async (policy: PolicyRecord) => {
    if (!window.confirm(`Cancel active policy on ${policy.farm.name}?`)) return;
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
        setSuccessMessage(`Cancelled policy on ${policy.farm.name}.`);
        await loadData();
        router.refresh();
      }
    } catch {
      setFormError("Unable to update policy status.");
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

  return (
    <div className="space-y-6">
      {/* Header & KPI Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {isAdmin ? (
              <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" aria-hidden="true" />
            ) : (
              <Sprout className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            )}
            {isAdmin
              ? "Admin View · Global Policy Portfolio"
              : `Farmer View · ${user.name}'s Contracts`}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            Parametric Policy Registry
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure objective weather triggers, coverage caps, and automated payout multipliers per farm plot.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <p className="text-[11px] font-semibold uppercase text-slate-500">Active Liability</p>
            <p className="mt-0.5 text-lg font-bold text-slate-900">
              {formatCurrency(kpis.activeLiability)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <p className="text-[11px] font-semibold uppercase text-slate-500">Active / Claimed</p>
            <p className="mt-0.5 text-lg font-bold text-slate-900">
              {kpis.activeCount} <span className="text-sm font-medium text-indigo-600">/ {kpis.claimedCount}</span>
            </p>
          </div>
          <div className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:col-span-1">
            <p className="text-[11px] font-semibold uppercase text-slate-500">Premiums Pool</p>
            <p className="mt-0.5 text-lg font-bold text-emerald-700">
              {formatCurrency(kpis.totalPremiums)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Create Policy Form */}
        <section
          aria-labelledby="issue-policy-heading"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-5"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <Plus className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            <h2 id="issue-policy-heading" className="text-base font-semibold text-slate-900">
              Issue Parametric Policy
            </h2>
          </div>

          {formError && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
              <span>{formError}</span>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <span>{successMessage}</span>
            </div>
          )}

          {farms.length === 0 && !loading ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center">
              <p className="text-sm font-medium text-slate-700">No farm plots registered yet</p>
              <p className="mt-1 text-xs text-slate-500">
                Register a farm plot before purchasing a parametric climate policy.
              </p>
              <Link
                href="/farms"
                className="mt-3 inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Go to Farm Registry
              </Link>
            </div>
          ) : (
            <form onSubmit={handleCreatePolicy} noValidate className="mt-4 space-y-4">
              <div>
                <label htmlFor="policy-farm" className="block text-xs font-semibold text-slate-700">
                  Target Farm Plot
                </label>
                <select
                  id="policy-farm"
                  value={farmId}
                  onChange={(e) => setFarmId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  {farms.map((farm) => (
                    <option key={farm.id} value={farm.id}>
                      {farm.name} — {farm.cropType}
                      {isAdmin ? ` (${farm.user.name})` : ""}
                    </option>
                  ))}
                </select>
                {fieldErrors.farmId && (
                  <p className="mt-1 text-xs font-medium text-rose-600">{fieldErrors.farmId}</p>
                )}
              </div>

              <div>
                <label htmlFor="metric-type" className="block text-xs font-semibold text-slate-700">
                  Parametric Trigger Metric
                </label>
                <select
                  id="metric-type"
                  value={metricType}
                  onChange={(e) => handleMetricChange(e.target.value as MetricType)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  {METRIC_OPTIONS.map((m) => (
                    <option key={m.type} value={m.type}>
                      {m.label} ({m.type})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">{activeMetricMeta.description}</p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="threshold-val" className="block text-xs font-semibold text-slate-700">
                    Trigger Threshold ({activeMetricMeta.unit})
                  </label>
                  <input
                    id="threshold-val"
                    type="number"
                    step="any"
                    value={thresholdValue}
                    onChange={(e) => setThresholdValue(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                  {fieldErrors.thresholdValue && (
                    <p className="mt-1 text-xs font-medium text-rose-600">
                      {fieldErrors.thresholdValue}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="coverage-amount" className="block text-xs font-semibold text-slate-700">
                    Max Coverage Cap (USD)
                  </label>
                  <input
                    id="coverage-amount"
                    type="number"
                    step="50"
                    value={coverageAmount}
                    onChange={(e) => handleCoverageChange(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                  {fieldErrors.coverageAmount && (
                    <p className="mt-1 text-xs font-medium text-rose-600">
                      {fieldErrors.coverageAmount}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="premium-paid" className="block text-xs font-semibold text-slate-700">
                    Premium Paid (USD)
                  </label>
                  <input
                    id="premium-paid"
                    type="number"
                    step="any"
                    value={premiumPaid}
                    onChange={(e) => setPremiumPaid(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                  {fieldErrors.premiumPaid && (
                    <p className="mt-1 text-xs font-medium text-rose-600">
                      {fieldErrors.premiumPaid}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="duration-days" className="block text-xs font-semibold text-slate-700">
                    Coverage Window (Days)
                  </label>
                  <input
                    id="duration-days"
                    type="number"
                    value={durationDays}
                    onChange={(e) => setDurationDays(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                  {fieldErrors.durationDays && (
                    <p className="mt-1 text-xs font-medium text-rose-600">
                      {fieldErrors.durationDays}
                    </p>
                  )}
                </div>
              </div>

              {/* Live Payout Formula Preview */}
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900">
                  <Calculator className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                  Automated Payout Formula Preview
                </div>
                <p className="mt-1 text-[11px] text-emerald-800/80">
                  Payout = min(Coverage, Coverage × Observed / Threshold) when Observed ≥ Threshold.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-white/80 p-2">
                    <span className="text-[11px] text-slate-500">
                      At {parsedThreshold}
                      {activeMetricMeta.unit} (1.0x)
                    </span>
                    <p className="font-bold text-slate-900">
                      {formatCurrency(
                        calculateParametricPayout(parsedCoverage, parsedThreshold, parsedThreshold)
                      )}
                    </p>
                  </div>
                  <div className="rounded-lg bg-white/80 p-2">
                    <span className="text-[11px] text-slate-500">
                      At {(parsedThreshold * 1.5).toFixed(1)}
                      {activeMetricMeta.unit} (1.5x cap)
                    </span>
                    <p className="font-bold text-emerald-700">
                      {formatCurrency(
                        calculateParametricPayout(
                          parsedCoverage,
                          parsedThreshold * 1.5,
                          parsedThreshold
                        )
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                {submitting ? "Issuing Parametric Policy..." : "Issue Parametric Policy"}
              </button>
            </form>
          )}
        </section>

        {/* Policy Portfolio Table with Search / Filter / Sort */}
        <section aria-labelledby="policy-list-heading" className="space-y-4 lg:col-span-7">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="policy-list-heading" className="text-base font-semibold text-slate-900">
                Policy Contracts ({filteredPolicies.length})
              </h2>
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
                    placeholder="Filter farm, crop..."
                    aria-label="Filter policies"
                    className="w-40 rounded-lg border border-slate-200 py-1.5 pl-8 pr-2.5 text-xs text-slate-700 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="CLAIMED">CLAIMED</option>
                  <option value="CANCELLED">CANCELLED</option>
                  <option value="EXPIRED">EXPIRED</option>
                </select>
                <select
                  aria-label="Filter by metric"
                  value={metricFilter}
                  onChange={(e) => setMetricFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
                >
                  <option value="ALL">All Metrics</option>
                  {METRIC_OPTIONS.map((m) => (
                    <option key={m.type} value={m.type}>
                      {m.shortLabel}
                    </option>
                  ))}
                </select>
                <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1">
                  <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
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
                    <option value="createdAt">Newest</option>
                    <option value="coverageAmount">Highest Coverage</option>
                    <option value="thresholdValue">Highest Threshold</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {loading ? (
              <div className="p-10 text-center text-sm text-slate-500">
                Loading policies for {user.name}...
              </div>
            ) : filteredPolicies.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                No parametric policies match the current filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Farm &amp; Window</th>
                      <th className="px-4 py-3">Trigger Rule</th>
                      <th className="px-4 py-3">Coverage / Premium</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPolicies.map((policy) => {
                      const meta = getMetricMeta(policy.metricType);
                      return (
                        <tr key={policy.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-slate-900">{policy.farm.name}</div>
                            <div className="text-xs text-slate-500">
                              {policy.farm.cropType}
                              {isAdmin ? ` · ${policy.farm.user.name}` : ""}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-400">
                              {new Date(policy.startDate).toLocaleDateString()} –{" "}
                              {new Date(policy.endDate).toLocaleDateString()}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="inline-block rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                              {policy.metricType}
                            </span>
                            <div className="mt-1 text-xs font-medium text-slate-800">
                              ≥ {policy.thresholdValue} {meta.unit}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-slate-900">
                              {formatCurrency(policy.coverageAmount)}
                            </div>
                            <div className="text-xs text-slate-500">
                              Premium: {formatCurrency(policy.premiumPaid)}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                                STATUS_BADGE[policy.status] ?? "bg-slate-100 text-slate-700"
                              )}
                            >
                              {policy.status}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            {policy.status === "ACTIVE" ? (
                              <button
                                type="button"
                                onClick={() => handleCancelPolicy(policy)}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                              >
                                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                Cancel
                              </button>
                            ) : (
                              <Link
                                href="/claims"
                                className="text-xs font-semibold text-indigo-600 hover:underline"
                              >
                                View Ledger
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
