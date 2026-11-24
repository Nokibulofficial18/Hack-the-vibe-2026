"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CloudRain,
  Compass,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Sun,
  Thermometer,
  X,
} from "lucide-react";
import {
  getMetricMeta,
  getPayoutMethodMeta,
  getSevereThresholdCutoff,
  maskBdMobileNumber,
  type ParsedWeatherReading,
  type RiskLevel,
} from "@/lib/domain";
import { cn, formatCurrency, formatLandArea } from "@/lib/utils";

export interface MapPolicyItem {
  id: string;
  metricType: string;
  thresholdValue: number;
  coverageAmount: number;
  status: string;
  observedValue: number | null;
  riskLevel: RiskLevel;
  ratio: number;
}

export interface MapFarmItem {
  id: string;
  name: string;
  district: string;
  latitude: number;
  longitude: number;
  cropType: string;
  sizeHectares: number;
  pinStatus: "SAFE" | "WARNING" | "BREACHED";
  activeCoverage: number;
  totalPayouts: number;
  lastFetchedAt: string | null;
  weather: ParsedWeatherReading | null;
  user: {
    id: string;
    name: string;
    email: string;
    payoutMethod?: string;
    mobileNumber?: string;
  };
  policies: MapPolicyItem[];
}

interface BangladeshRiskMapProps {
  farms: MapFarmItem[];
  isAdmin: boolean;
  syncingFarmId: string | null;
  evaluatingPolicyId: string | null;
  onSyncFarm: (farmId: string) => Promise<void>;
  onEvaluatePolicy: (policy: MapPolicyItem, useSim?: boolean) => Promise<void>;
}

// High-precision geographic bounding box for Bangladesh
const MAP_BOUNDS = {
  minLat: 20.55,
  maxLat: 26.68,
  minLon: 88.0,
  maxLon: 92.68,
};

function projectCoord(lat: number, lon: number): { x: number; y: number } {
  const clampedLat = Math.max(MAP_BOUNDS.minLat, Math.min(MAP_BOUNDS.maxLat, lat));
  const clampedLon = Math.max(MAP_BOUNDS.minLon, Math.min(MAP_BOUNDS.maxLon, lon));
  const x =
    36 +
    ((clampedLon - MAP_BOUNDS.minLon) / (MAP_BOUNDS.maxLon - MAP_BOUNDS.minLon)) * 328;
  const y =
    26 +
    ((MAP_BOUNDS.maxLat - clampedLat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * 368;
  return { x, y };
}

const PIN_STYLES = {
  SAFE: {
    fill: "#059669",
    ring: "#34D399",
    badge: "bg-emerald-100 text-emerald-950 ring-1 ring-emerald-300",
    label: "Safe",
  },
  WARNING: {
    fill: "#D97706",
    ring: "#FBBF24",
    badge: "bg-amber-100 text-amber-950 ring-1 ring-amber-300",
    label: "Warning (≤15%)",
  },
  BREACHED: {
    fill: "#DC2626",
    ring: "#F87171",
    badge: "bg-rose-100 text-rose-950 ring-1 ring-rose-300",
    label: "Breached / Triggered",
  },
} as const;

export function BangladeshRiskMap({
  farms,
  isAdmin,
  syncingFarmId,
  evaluatingPolicyId,
  onSyncFarm,
  onEvaluatePolicy,
}: BangladeshRiskMapProps) {
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);
  const [hoveredFarmId, setHoveredFarmId] = useState<string | null>(null);

  const selectedFarm = farms.find((f) => f.id === selectedFarmId) ?? null;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedFarmId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const counts = {
    safe: farms.filter((f) => f.pinStatus === "SAFE").length,
    warning: farms.filter((f) => f.pinStatus === "WARNING").length,
    breached: farms.filter((f) => f.pinStatus === "BREACHED").length,
  };

  return (
    <section
      aria-labelledby="bd-risk-map-heading"
      className="relative flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      {/* Header & Legend */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#065F46]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#065F46]">
            <Compass className="h-3.5 w-3.5" aria-hidden="true" />
            Geospatial Parametric Risk Radar
          </div>
          <h2 id="bd-risk-map-heading" className="mt-1.5 text-base font-bold text-slate-950">
            Bangladesh Live District Risk Map
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Click any color-coded farm pin to inspect live Open-Meteo telemetry and trigger status.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-900 ring-1 ring-emerald-200">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
            Safe ({counts.safe})
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-amber-950 ring-1 ring-amber-200">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            Warning ({counts.warning})
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-rose-950 ring-1 ring-rose-200">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-600" />
            Breached ({counts.breached})
          </span>
        </div>
      </div>

      {/* Interactive Bangladesh SVG Map */}
      <div className="relative mt-4 overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-slate-900 via-slate-900 to-[#064E3B]">
        <svg
          viewBox="0 0 400 420"
          role="img"
          aria-label="Interactive Bangladesh climate risk map plotting monitored farm locations"
          className="h-[360px] w-full select-none sm:h-[420px]"
        >
          <defs>
            <linearGradient id="bdLandGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#065F46" stopOpacity="0.92" />
              <stop offset="100%" stopColor="#047857" stopOpacity="0.88" />
            </linearGradient>
            <pattern id="fintechGrid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path
                d="M 32 0 L 0 0 0 32"
                fill="none"
                stroke="#334155"
                strokeWidth="0.5"
                strokeOpacity="0.45"
              />
            </pattern>
          </defs>

          {/* Fintech Coordinate Grid Backdrop */}
          <rect width="400" height="420" fill="url(#fintechGrid)" />

          {/* Bay of Bengal Label */}
          <text
            x="175"
            y="398"
            textAnchor="middle"
            fontSize="10"
            letterSpacing="3"
            fontWeight="700"
            fill="#64748B"
          >
            BAY OF BENGAL
          </text>

          {/* Detailed Bangladesh National Silhouette */}
          <path
            d="M 86,28 L 114,22 L 138,44 L 166,46 L 194,64 L 210,94 L 244,98 L 282,102 L 326,112 L 340,126 L 316,148 L 298,166 L 274,174 L 266,204 L 278,236 L 294,264 L 318,284 L 348,298 L 356,336 L 342,366 L 334,394 L 322,388 L 314,344 L 292,312 L 264,296 L 248,314 L 228,334 L 204,332 L 184,344 L 154,340 L 128,348 L 106,336 L 102,300 L 112,268 L 96,242 L 82,210 L 66,184 L 74,152 L 88,128 L 78,94 L 68,62 Z"
            fill="url(#bdLandGrad)"
            stroke="#34D399"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />

          {/* Major River Systems (Jamuna, Padma, Meghna) */}
          <path
            d="M 164,54 Q 178,124 176,188 T 208,266 T 236,322"
            fill="none"
            stroke="#38BDF8"
            strokeWidth="2.2"
            strokeOpacity="0.45"
            strokeLinecap="round"
          />
          <path
            d="M 76,174 Q 130,194 176,208 T 232,262"
            fill="none"
            stroke="#38BDF8"
            strokeWidth="2"
            strokeOpacity="0.45"
            strokeLinecap="round"
          />
          <path
            d="M 296,120 Q 254,154 236,204 T 234,282"
            fill="none"
            stroke="#38BDF8"
            strokeWidth="1.8"
            strokeOpacity="0.42"
            strokeLinecap="round"
          />

          {/* Subtle Regional Watermarks */}
          <text x="116" y="168" fontSize="8" fill="#A7F3D0" fillOpacity="0.65" fontWeight="600">
            BARIND
          </text>
          <text x="256" y="138" fontSize="8" fill="#A7F3D0" fillOpacity="0.65" fontWeight="600">
            HAOR BASIN
          </text>
          <text x="148" y="320" fontSize="8" fill="#A7F3D0" fillOpacity="0.65" fontWeight="600">
            SUNDARBANS COAST
          </text>

          {/* Interactive Color-Coded Farm Risk Pins */}
          {farms.map((farm) => {
            const { x, y } = projectCoord(farm.latitude, farm.longitude);
            const pin = PIN_STYLES[farm.pinStatus];
            const isSelected = selectedFarmId === farm.id;
            const isHovered = hoveredFarmId === farm.id;

            return (
              <g
                key={farm.id}
                role="button"
                tabIndex={0}
                aria-label={`${farm.district} — ${farm.name} (${pin.label}). Click for live weather metrics.`}
                onClick={() => setSelectedFarmId(farm.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedFarmId(farm.id);
                  }
                }}
                onMouseEnter={() => setHoveredFarmId(farm.id)}
                onMouseLeave={() => setHoveredFarmId(null)}
                className="cursor-pointer outline-none"
              >
                {/* Animated Radar Pulse for Warning / Breached Pins */}
                {farm.pinStatus !== "SAFE" && (
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? 18 : 14}
                    fill={pin.ring}
                    fillOpacity="0.28"
                    className="animate-ping"
                    style={{ transformOrigin: `${x}px ${y}px`, animationDuration: "2.2s" }}
                  />
                )}

                {/* Halo Ring */}
                <circle
                  cx={x}
                  cy={y}
                  r={isSelected || isHovered ? 13 : 10}
                  fill={pin.fill}
                  fillOpacity="0.3"
                />

                {/* Core Pin */}
                <circle
                  cx={x}
                  cy={y}
                  r={isSelected || isHovered ? 7.5 : 6}
                  fill={pin.fill}
                  stroke="#FFFFFF"
                  strokeWidth={isSelected ? 2.6 : 2}
                />

                {/* District Callout Tag */}
                <g transform={`translate(${x > 250 ? x - 84 : x + 12}, ${y - 11})`}>
                  <rect
                    width="72"
                    height="22"
                    rx="6"
                    fill="#0F172A"
                    fillOpacity={isSelected || isHovered ? "0.96" : "0.84"}
                    stroke={isSelected ? "#34D399" : pin.ring}
                    strokeWidth={isSelected ? "1.4" : "0.9"}
                  />
                  <text
                    x="36"
                    y="14"
                    textAnchor="middle"
                    fontSize="9.5"
                    fontWeight="700"
                    fill="#F8FAFC"
                  >
                    {farm.district}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>

        {/* Bottom Map Quick-Select Pills (keyboard & mobile friendly) */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-800 bg-slate-950/80 px-3 py-2.5">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Quick Inspect:
          </span>
          {farms.map((farm) => {
            const dotColor =
              farm.pinStatus === "BREACHED"
                ? "bg-rose-500"
                : farm.pinStatus === "WARNING"
                  ? "bg-amber-400"
                  : "bg-emerald-400";
            return (
              <button
                key={farm.id}
                type="button"
                onClick={() => setSelectedFarmId(farm.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold transition",
                  selectedFarmId === farm.id
                    ? "bg-[#065F46] text-white ring-1 ring-emerald-400"
                    : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", dotColor)} />
                {farm.district}
              </button>
            );
          })}
        </div>
      </div>

      {/* Slide-Over Detail Drawer Card (opens when clicking any farm pin) */}
      {selectedFarm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Live weather telemetry drawer for ${selectedFarm.name}`}
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-xs"
          onClick={() => setSelectedFarmId(null)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl"
          >
            {/* Slide-Over Deep Emerald Header */}
            <div className="bg-[#065F46] px-6 py-5 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide",
                      PIN_STYLES[selectedFarm.pinStatus].badge
                    )}
                  >
                    {PIN_STYLES[selectedFarm.pinStatus].label}
                  </span>
                  <h3 className="mt-2 text-lg font-extrabold leading-tight">
                    {selectedFarm.name}
                  </h3>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-100">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    {selectedFarm.district}, Bangladesh · {selectedFarm.latitude.toFixed(4)},{" "}
                    {selectedFarm.longitude.toFixed(4)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedFarmId(null)}
                  aria-label="Close district weather slide-over"
                  className="rounded-lg bg-white/15 p-1.5 text-white transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Slide-Over Content */}
            <div className="flex-1 space-y-5 p-6">
              {/* Plot & Beneficiary Metadata */}
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
                <div>
                  <p className="font-semibold text-slate-500">Crop / Activity</p>
                  <p className="mt-0.5 font-bold text-slate-900">{selectedFarm.cropType}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-500">Land Area</p>
                  <p className="mt-0.5 font-bold text-slate-900">
                    {formatLandArea(selectedFarm.sizeHectares)}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-slate-500">Policyholder</p>
                  <p className="mt-0.5 font-bold text-slate-900">{selectedFarm.user.name}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-500">MFS Payout Wallet</p>
                  <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] font-bold text-slate-900">
                    <Smartphone className="h-3 w-3 text-[#065F46]" aria-hidden="true" />
                    {getPayoutMethodMeta(selectedFarm.user.payoutMethod).label} ·{" "}
                    {maskBdMobileNumber(selectedFarm.user.mobileNumber)}
                  </p>
                </div>
              </div>

              {/* Live Open-Meteo Metrics */}
              <div>
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                    Live Open-Meteo Telemetry
                  </h4>
                  <button
                    type="button"
                    onClick={() => onSyncFarm(selectedFarm.id)}
                    disabled={syncingFarmId === selectedFarm.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#065F46] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#047857] disabled:opacity-50"
                  >
                    <RefreshCw
                      className={cn(
                        "h-3 w-3",
                        syncingFarmId === selectedFarm.id && "animate-spin"
                      )}
                      aria-hidden="true"
                    />
                    {syncingFarmId === selectedFarm.id ? "Syncing..." : "Refresh Live"}
                  </button>
                </div>

                <div className="mt-2.5 grid grid-cols-3 gap-2.5">
                  <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-sky-900">
                      <CloudRain className="h-3.5 w-3.5" aria-hidden="true" />
                      24h Rain
                    </div>
                    <p className="mt-1 text-lg font-extrabold text-sky-950">
                      {selectedFarm.weather ? `${selectedFarm.weather.rainMm} mm` : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-orange-900">
                      <Thermometer className="h-3.5 w-3.5" aria-hidden="true" />
                      Max Temp
                    </div>
                    <p className="mt-1 text-lg font-extrabold text-orange-950">
                      {selectedFarm.weather ? `${selectedFarm.weather.tempMaxC}°C` : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-amber-900">
                      <Sun className="h-3.5 w-3.5" aria-hidden="true" />
                      Dry Streak
                    </div>
                    <p className="mt-1 text-lg font-extrabold text-amber-950">
                      {selectedFarm.weather ? `${selectedFarm.weather.droughtDays} d` : "—"}
                    </p>
                  </div>
                </div>

                <p className="mt-1.5 text-[11px] text-slate-500">
                  Last fetched:{" "}
                  {selectedFarm.lastFetchedAt
                    ? new Date(selectedFarm.lastFetchedAt).toLocaleString()
                    : "Not yet synced"}{" "}
                  · {selectedFarm.weather?.timezone ?? "Asia/Dhaka"}
                </p>
              </div>

              {/* Armed Parametric Policies for This District */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                  Parametric Policies ({selectedFarm.policies.length})
                </h4>

                {selectedFarm.policies.map((policy) => {
                  const meta = getMetricMeta(policy.metricType);
                  const severeCutoff = getSevereThresholdCutoff(
                    policy.metricType,
                    policy.thresholdValue
                  );
                  const pct = Math.min(100, Math.round(policy.ratio * 100));

                  return (
                    <div
                      key={policy.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-slate-800 ring-1 ring-slate-300">
                          {policy.metricType}
                        </span>
                        <span className="text-xs font-extrabold text-slate-950">
                          {formatCurrency(policy.coverageAmount)}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700">
                          Observed:{" "}
                          <strong>
                            {policy.observedValue !== null
                              ? `${policy.observedValue}${meta.unit}`
                              : "—"}
                          </strong>
                        </span>
                        <span className="text-slate-600">
                          Mod ≥ {policy.thresholdValue}
                          {meta.unit} · Sev ≥ {severeCutoff}
                          {meta.unit}
                        </span>
                      </div>

                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            policy.riskLevel === "BREACHED"
                              ? "bg-rose-600"
                              : policy.riskLevel === "AT_RISK"
                                ? "bg-amber-500"
                                : policy.riskLevel === "CLAIMED"
                                  ? "bg-indigo-600"
                                  : "bg-emerald-600"
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      {policy.status === "ACTIVE" && policy.riskLevel === "BREACHED" && (
                        <button
                          type="button"
                          onClick={() => onEvaluatePolicy(policy, false)}
                          disabled={evaluatingPolicyId === policy.id}
                          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-rose-800 disabled:opacity-50"
                        >
                          <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                          {evaluatingPolicyId === policy.id
                            ? "Executing MFS Settlement..."
                            : "Trigger Parametric Payout Now"}
                        </button>
                      )}

                      {policy.status === "ACTIVE" &&
                        policy.riskLevel !== "BREACHED" &&
                        isAdmin && (
                          <button
                            type="button"
                            onClick={() => onEvaluatePolicy(policy, true)}
                            disabled={evaluatingPolicyId === policy.id}
                            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-800 disabled:opacity-50"
                          >
                            {evaluatingPolicyId === policy.id
                              ? "Running..."
                              : "Admin: Simulate Threshold Breach"}
                          </button>
                        )}
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-slate-100 pt-4">
                <Link
                  href="/claims"
                  className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-50"
                >
                  Open Claim &amp; MFS Payout Ledger →
                </Link>
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
