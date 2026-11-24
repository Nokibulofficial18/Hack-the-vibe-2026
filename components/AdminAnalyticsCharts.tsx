"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, TrendingUp } from "lucide-react";
import { getMetricMeta, getSevereThresholdCutoff } from "@/lib/domain";
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
  if (value >= 100000) {
    return `৳${(value / 100000).toFixed(1)}L`;
  }
  if (value >= 1000) {
    return `৳${Math.round(value / 1000)}k`;
  }
  return `৳${value}`;
}

export function AdminAnalyticsCharts({
  byDistrict,
  farms,
  isAdmin,
}: AdminAnalyticsChartsProps) {
  const [selectedFarmId, setSelectedFarmId] = useState<string>(farms[0]?.id ?? "");

  useEffect(() => {
    if (farms.length > 0 && !farms.some((f) => f.id === selectedFarmId)) {
      setSelectedFarmId(farms[0].id);
    }
  }, [farms, selectedFarmId]);

  const activeFarm = farms.find((f) => f.id === selectedFarmId) ?? farms[0] ?? null;

  // Pick the primary weather policy (preferring RAINFALL_MAX or TEMP_MAX for threshold reference line)
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
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3.5">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#065F46]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#065F46]">
              <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
              {isAdmin ? "Portfolio Exposure Analytics (BDT)" : "Your District Exposure (BDT)"}
            </div>
            <h2
              id="district-bar-chart-heading"
              className="mt-1 text-base font-bold text-slate-950"
            >
              Total Coverage vs. Payouts by District (৳)
            </h2>
          </div>
          <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] font-semibold text-slate-700">
            {byDistrict.length} District{byDistrict.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-4 h-60 w-full">
          {byDistrict.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              No district coverage data available yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={byDistrict}
                margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="district"
                  tick={{ fill: "#334155", fontSize: 11, fontWeight: 600 }}
                  axisLine={{ stroke: "#CBD5E1" }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={formatCompactTaka}
                  tick={{ fill: "#475569", fontSize: 11, fontWeight: 600 }}
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
                    backgroundColor: "#0F172A",
                    borderColor: "#1E293B",
                    borderRadius: "12px",
                    color: "#F8FAFC",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "#6EE7B7", fontWeight: 700, marginBottom: "4px" }}
                />
                <Legend
                  wrapperStyle={{ fontSize: "11px", fontWeight: 600, paddingTop: "6px" }}
                />
                <Bar
                  dataKey="coverage"
                  name="Total Coverage (৳)"
                  fill="#065F46"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={42}
                />
                <Bar
                  dataKey="payouts"
                  name="Payouts Issued (৳)"
                  fill="#D97706"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={42}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Chart 2: 7-Day Rainfall & Temperature Trend vs. Policy Trigger Threshold Line */}
      <section
        aria-labelledby="trend-chart-heading"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-900">
              <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
              7-Day Open-Meteo Forecast vs. Trigger Threshold
            </div>
            <h2 id="trend-chart-heading" className="mt-1 text-base font-bold text-slate-950">
              7-Day Rainfall &amp; Temperature Trend
            </h2>
          </div>

          {farms.length > 0 && (
            <div>
              <label htmlFor="trend-farm-select" className="sr-only">
                Select district plot for 7-day weather trend
              </label>
              <select
                id="trend-farm-select"
                value={selectedFarmId}
                onChange={(e) => setSelectedFarmId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-[#065F46] focus:outline-none"
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
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
            <span className="rounded-md bg-rose-50 px-2 py-0.5 text-rose-900 ring-1 ring-rose-200">
              Policy Trigger ({primaryPolicy.metricType}): {primaryPolicy.thresholdValue}
              {primaryMeta.unit} (50% Moderate)
            </span>
            {severeCutoff !== null && (
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-800">
                Severe 100% Cutoff: {severeCutoff}
                {primaryMeta.unit}
              </span>
            )}
          </div>
        )}

        <div className="mt-3 h-64 w-full">
          {trendData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              Sync Open-Meteo weather to display the 7-day meteorological trend.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={trendData}
                margin={{ top: 12, right: 12, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="dayLabel"
                  tick={{ fill: "#334155", fontSize: 11, fontWeight: 600 }}
                  axisLine={{ stroke: "#CBD5E1" }}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="rain"
                  orientation="left"
                  unit="mm"
                  tick={{ fill: "#0369A1", fontSize: 11, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <YAxis
                  yAxisId="temp"
                  orientation="right"
                  unit="°C"
                  domain={[20, 46]}
                  tick={{ fill: "#C2410C", fontSize: 11, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0F172A",
                    borderColor: "#1E293B",
                    borderRadius: "12px",
                    color: "#F8FAFC",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "#6EE7B7", fontWeight: 700, marginBottom: "4px" }}
                />
                <Legend
                  wrapperStyle={{ fontSize: "11px", fontWeight: 600, paddingTop: "6px" }}
                />
                <Bar
                  yAxisId="rain"
                  dataKey="rainMm"
                  name="Rainfall (mm)"
                  fill="#0284C7"
                  fillOpacity={0.82}
                  radius={[5, 5, 0, 0]}
                  maxBarSize={28}
                />
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="tempMaxC"
                  name="Max Temp (°C)"
                  stroke="#EA580C"
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: "#EA580C", stroke: "#FFFFFF", strokeWidth: 1.5 }}
                  activeDot={{ r: 5.5 }}
                />
                {primaryPolicy &&
                  (primaryPolicy.metricType === "RAINFALL_MAX" ||
                    primaryPolicy.metricType === "TEMP_MAX") && (
                    <ReferenceLine
                      yAxisId={isTempPrimary ? "temp" : "rain"}
                      y={primaryPolicy.thresholdValue}
                      stroke="#DC2626"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      label={{
                        value: `Trigger ${primaryPolicy.thresholdValue}${primaryMeta?.unit ?? ""}`,
                        position: "insideTopRight",
                        fill: "#DC2626",
                        fontSize: 10,
                        fontWeight: 700,
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
