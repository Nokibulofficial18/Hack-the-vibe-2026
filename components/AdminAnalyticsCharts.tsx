"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getMetricMeta, getSevereThresholdCutoff } from "@/lib/domain";
import { useTranslation } from "@/lib/i18n";
import { formatCurrency } from "@/lib/utils";
import type { MapFarmItem } from "@/components/BangladeshRiskMap";

export interface DistrictChartPoint {
  district: string;
  coverage: number;
  payouts: number;
  farmCount: number;
  policyCount: number;
  riskStatus: "SAFE" | "WARNING" | "BREACHED";
}

interface AdminAnalyticsChartsProps {
  byDistrict: DistrictChartPoint[];
  farms: MapFarmItem[];
  isAdmin: boolean;
}

function formatCompactTaka(value: number): string {
  if (value >= 100000) return `৳${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `৳${Math.round(value / 1000)}k`;
  return `৳${value}`;
}

export function AdminAnalyticsCharts({
  byDistrict,
  farms,
  isAdmin,
}: AdminAnalyticsChartsProps) {
  const { t } = useTranslation();
  const [selectedFarmId, setSelectedFarmId] = useState<string>(farms[0]?.id ?? "");

  useEffect(() => {
    if (farms.length > 0 && !farms.some((f) => f.id === selectedFarmId)) {
      setSelectedFarmId(farms[0].id);
    }
  }, [farms, selectedFarmId]);

  const activeFarm = farms.find((f) => f.id === selectedFarmId) ?? farms[0] ?? null;

  const primaryPolicy = useMemo(() => {
    if (!activeFarm || activeFarm.policies.length === 0) return null;
    return (
      activeFarm.policies.find(
        (p) => p.metricType === "RAINFALL_MAX" || p.metricType === "TEMP_MAX"
      ) ?? activeFarm.policies[0]
    );
  }, [activeFarm]);

  const trendData = useMemo(() => {
    if (!activeFarm?.weather?.forecast7d?.length) return [];
    return activeFarm.weather.forecast7d;
  }, [activeFarm]);

  const primaryMeta = primaryPolicy ? getMetricMeta(primaryPolicy.metricType) : null;
  const severeCutoff = primaryPolicy
    ? getSevereThresholdCutoff(primaryPolicy.metricType, primaryPolicy.thresholdValue)
    : null;
  const isTempPrimary = primaryPolicy?.metricType === "TEMP_MAX";

  return (
    <div className="space-y-6">
      {/* Chart 1: Total Coverage vs. Payouts by District (Bar Chart in ৳) */}
      <section
        aria-labelledby="district-bar-chart-heading"
        className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
          <div>
            <h2 id="district-bar-chart-heading" className="text-sm font-semibold text-slate-900">
              {t("chartDistrictTitle")}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {isAdmin ? t("chartDistrictSubAdmin") : t("chartDistrictSubFarmer")}
            </p>
          </div>
          <span className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
            {t("districtCountBadge", { count: byDistrict.length })}
          </span>
        </div>

        <div className="mt-4 h-56 w-full">
          {byDistrict.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              {t("noDistrictChartData")}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDistrict} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="coverageBarGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#059669" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#0D9488" stopOpacity={0.75} />
                  </linearGradient>
                  <linearGradient id="payoutBarGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#EA580C" stopOpacity={0.75} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis
                  dataKey="district"
                  tick={{ fill: "#475569", fontSize: 11, fontWeight: 500 }}
                  axisLine={{ stroke: "#E2E8F0" }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={formatCompactTaka}
                  tick={{ fill: "#64748B", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={54}
                />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => [
                    formatCurrency(Number(value ?? 0)),
                    String(name),
                  ]}
                  contentStyle={{
                    backgroundColor: "#FFFFFF",
                    borderColor: "#E2E8F0",
                    borderRadius: "10px",
                    color: "#0F172A",
                    fontSize: "12px",
                    boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
                  }}
                  labelStyle={{ color: "#0F172A", fontWeight: 600, marginBottom: "4px" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }} />
                <Bar
                  dataKey="coverage"
                  name={t("legendCoverage")}
                  fill="url(#coverageBarGradient)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={36}
                />
                <Bar
                  dataKey="payouts"
                  name={t("legendPayouts")}
                  fill="url(#payoutBarGradient)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={36}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Chart 2: 7-Day Rainfall & Temperature Trend with Smooth SVG Area Gradients */}
      <section
        aria-labelledby="trend-chart-heading"
        className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div>
            <h2 id="trend-chart-heading" className="text-sm font-semibold text-slate-900">
              {t("chartTrendTitle")}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">{t("chartTrendSubtitle")}</p>
          </div>

          {farms.length > 0 && (
            <div>
              <label htmlFor="trend-farm-select" className="sr-only">
                {t("chartTrendTitle")}
              </label>
              <select
                id="trend-farm-select"
                value={selectedFarmId}
                onChange={(e) => setSelectedFarmId(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-xs focus:border-emerald-700 focus:outline-none"
              >
                {farms.map((farm) => (
                  <option key={farm.id} value={farm.id}>
                    {farm.district} — {farm.cropType}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {primaryPolicy && primaryMeta && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-medium">
            <span className="whitespace-nowrap rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-rose-700">
              {t("triggerLabel")} ({primaryPolicy.metricType}): {primaryPolicy.thresholdValue}
              {primaryMeta.unit}
            </span>
            {severeCutoff !== null && (
              <span className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-slate-600">
                {t("severe100Label")}: {severeCutoff}
                {primaryMeta.unit}
              </span>
            )}
          </div>
        )}

        <div className="mt-3 h-60 w-full">
          {trendData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              {t("noTrendData")}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendData} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="rainAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0284C7" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="#0284C7" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="tempAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis
                  dataKey="dayLabel"
                  tick={{ fill: "#475569", fontSize: 11 }}
                  axisLine={{ stroke: "#E2E8F0" }}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="rain"
                  orientation="left"
                  unit="mm"
                  tick={{ fill: "#64748B", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={46}
                />
                <YAxis
                  yAxisId="temp"
                  orientation="right"
                  unit="°C"
                  domain={[20, 46]}
                  tick={{ fill: "#64748B", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#FFFFFF",
                    borderColor: "#E2E8F0",
                    borderRadius: "10px",
                    color: "#0F172A",
                    fontSize: "12px",
                    boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
                  }}
                  labelStyle={{ color: "#0F172A", fontWeight: 600, marginBottom: "4px" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }} />
                <Area
                  yAxisId="rain"
                  type="monotone"
                  dataKey="rainMm"
                  name={t("legendRainfall")}
                  stroke="#0284C7"
                  strokeWidth={2}
                  fill="url(#rainAreaGradient)"
                  dot={{ r: 3, fill: "#0284C7", stroke: "#FFFFFF", strokeWidth: 1.5 }}
                  activeDot={{ r: 5 }}
                />
                <Area
                  yAxisId="temp"
                  type="monotone"
                  dataKey="tempMaxC"
                  name={t("legendMaxTemp")}
                  stroke="#D97706"
                  strokeWidth={2}
                  fill="url(#tempAreaGradient)"
                  dot={{ r: 3, fill: "#D97706", stroke: "#FFFFFF", strokeWidth: 1.5 }}
                  activeDot={{ r: 5 }}
                />
                {primaryPolicy &&
                  (primaryPolicy.metricType === "RAINFALL_MAX" ||
                    primaryPolicy.metricType === "TEMP_MAX") && (
                    <ReferenceLine
                      yAxisId={isTempPrimary ? "temp" : "rain"}
                      y={primaryPolicy.thresholdValue}
                      stroke="#E11D48"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      label={{
                        value: `${t("triggerLabel")} ${primaryPolicy.thresholdValue}${primaryMeta?.unit ?? ""}`,
                        position: "insideTopRight",
                        fill: "#E11D48",
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    />
                  )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </div>
  );
}
