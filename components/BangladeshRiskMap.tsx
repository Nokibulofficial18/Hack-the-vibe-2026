"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CloudRain,
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
import { useTranslation } from "@/lib/i18n";
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
    fill: "#047857",
    ring: "#A7F3D0",
    badge: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  },
  WARNING: {
    fill: "#D97706",
    ring: "#FDE68A",
    badge: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  BREACHED: {
    fill: "#E11D48",
    ring: "#FECDD3",
    badge: "bg-rose-50 text-rose-700 border border-rose-200",
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
  const { t, translateStatus } = useTranslation();
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
      className="flex h-full flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs"
    >
      {/* Header & Soft Pastel Legend */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 id="bd-risk-map-heading" className="text-sm font-semibold text-slate-900">
            {t("riskMapTitle")}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{t("riskMapSubtitle")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
            {translateStatus("SAFE")} ({counts.safe})
          </span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            {translateStatus("WARNING")} ({counts.warning})
          </span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-rose-700">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
            {translateStatus("BREACHED")} ({counts.breached})
          </span>
        </div>
      </div>

      {/* Minimalist Light-Mode Bangladesh SVG Map */}
      <div className="relative mt-4 overflow-hidden rounded-xl border border-slate-200/70 bg-slate-50/70">
        <svg
          viewBox="0 0 400 420"
          role="img"
          aria-label={t("riskMapTitle")}
          className="h-[360px] w-full select-none sm:h-[410px]"
        >
          <defs>
            <pattern id="stripeGrid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path
                d="M 32 0 L 0 0 0 32"
                fill="none"
                stroke="#E2E8F0"
                strokeWidth="0.6"
              />
            </pattern>
          </defs>

          <rect width="400" height="420" fill="url(#stripeGrid)" />

          <text
            x="175"
            y="400"
            textAnchor="middle"
            fontSize="9"
            letterSpacing="2"
            fontWeight="600"
            fill="#94A3B8"
          >
            {t("bayOfBengal")}
          </text>

          <path
            d="M 86,28 L 114,22 L 138,44 L 166,46 L 194,64 L 210,94 L 244,98 L 282,102 L 326,112 L 340,126 L 316,148 L 298,166 L 274,174 L 266,204 L 278,236 L 294,264 L 318,284 L 348,298 L 356,336 L 342,366 L 334,394 L 322,388 L 314,344 L 292,312 L 264,296 L 248,314 L 228,334 L 204,332 L 184,344 L 154,340 L 128,348 L 106,336 L 102,300 L 112,268 L 96,242 L 82,210 L 66,184 L 74,152 L 88,128 L 78,94 L 68,62 Z"
            fill="#ECFDF5"
            stroke="#047857"
            strokeOpacity="0.45"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />

          <path
            d="M 164,54 Q 178,124 176,188 T 208,266 T 236,322"
            fill="none"
            stroke="#93C5FD"
            strokeWidth="1.8"
            strokeOpacity="0.55"
            strokeLinecap="round"
          />
          <path
            d="M 76,174 Q 130,194 176,208 T 232,262"
            fill="none"
            stroke="#93C5FD"
            strokeWidth="1.6"
            strokeOpacity="0.55"
            strokeLinecap="round"
          />
          <path
            d="M 296,120 Q 254,154 236,204 T 234,282"
            fill="none"
            stroke="#93C5FD"
            strokeWidth="1.5"
            strokeOpacity="0.5"
            strokeLinecap="round"
          />

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
                aria-label={`${farm.district} — ${farm.name} (${translateStatus(farm.pinStatus)})`}
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
                {farm.pinStatus !== "SAFE" && (
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? 17 : 13}
                    fill={pin.ring}
                    fillOpacity="0.6"
                    className="animate-ping"
                    style={{ transformOrigin: `${x}px ${y}px`, animationDuration: "2.4s" }}
                  />
                )}

                <circle cx={x} cy={y} r={isSelected || isHovered ? 12 : 9.5} fill={pin.ring} fillOpacity="0.8" />
                <circle
                  cx={x}
                  cy={y}
                  r={isSelected || isHovered ? 7 : 5.5}
                  fill={pin.fill}
                  stroke="#FFFFFF"
                  strokeWidth="2"
                />

                <g transform={`translate(${x > 250 ? x - 84 : x + 12}, ${y - 11})`}>
                  <rect
                    width="72"
                    height="22"
                    rx="6"
                    fill="#FFFFFF"
                    stroke={isSelected ? "#047857" : "#CBD5E1"}
                    strokeWidth={isSelected ? "1.4" : "0.9"}
                  />
                  <text
                    x="36"
                    y="14"
                    textAnchor="middle"
                    fontSize="9.5"
                    fontWeight="600"
                    fill="#0F172A"
                  >
                    {farm.district}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>

        {/* Subtle Quick-Inspect Strip */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200/70 bg-white px-3.5 py-2.5">
          {farms.map((farm) => {
            const dotColor =
              farm.pinStatus === "BREACHED"
                ? "bg-rose-600"
                : farm.pinStatus === "WARNING"
                  ? "bg-amber-500"
                  : "bg-emerald-600";
            return (
              <button
                key={farm.id}
                type="button"
                onClick={() => setSelectedFarmId(farm.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-[11px] font-medium transition",
                  selectedFarmId === farm.id
                    ? "border-transparent bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm shadow-emerald-600/20"
                    : "border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-slate-100"
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    selectedFarmId === farm.id ? "bg-white" : dotColor
                  )}
                />
                {farm.district}
              </button>
            );
          })}
        </div>
      </div>

      {/* Minimalist Slide-Over Detail Drawer */}
      {selectedFarm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Live weather telemetry drawer for ${selectedFarm.name}`}
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-[1px]"
          onClick={() => setSelectedFarmId(null)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-5">
              <div>
                <span
                  className={cn(
                    "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                    PIN_STYLES[selectedFarm.pinStatus].badge
                  )}
                >
                  {translateStatus(selectedFarm.pinStatus)}
                </span>
                <h3 className="mt-2 text-base font-semibold text-slate-900">
                  {selectedFarm.name}
                </h3>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {selectedFarm.district} · {selectedFarm.latitude.toFixed(4)},{" "}
                  {selectedFarm.longitude.toFixed(4)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedFarmId(null)}
                aria-label={t("closeMenuAria")}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 space-y-5 p-6">
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 text-xs">
                <div>
                  <p className="text-slate-500">{t("cropLabel")}</p>
                  <p className="mt-0.5 font-medium text-slate-900">{selectedFarm.cropType}</p>
                </div>
                <div>
                  <p className="text-slate-500">{t("landAreaShort")}</p>
                  <p className="mt-0.5 font-medium text-slate-900">
                    {formatLandArea(selectedFarm.sizeHectares)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">{t("policyholderLabel")}</p>
                  <p className="mt-0.5 font-medium text-slate-900">{selectedFarm.user.name}</p>
                </div>
                <div>
                  <p className="text-slate-500">{t("mfsWalletLabel")}</p>
                  <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] font-medium text-slate-900">
                    <Smartphone className="h-3 w-3 shrink-0 text-emerald-700" aria-hidden="true" />
                    {getPayoutMethodMeta(selectedFarm.user.payoutMethod).label} ·{" "}
                    {maskBdMobileNumber(selectedFarm.user.mobileNumber)}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    {t("liveTelemetryHeading")}
                  </h4>
                  <button
                    type="button"
                    onClick={() => onSyncFarm(selectedFarm.id)}
                    disabled={syncingFarmId === selectedFarm.id}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm shadow-emerald-600/20 transition hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
                  >
                    <RefreshCw
                      className={cn("h-3 w-3 shrink-0", syncingFarmId === selectedFarm.id && "animate-spin")}
                      aria-hidden="true"
                    />
                    <span>{syncingFarmId === selectedFarm.id ? t("syncingShort") : t("refreshBtn")}</span>
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-slate-200/80 bg-white p-3">
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                      <CloudRain className="h-3.5 w-3.5 shrink-0 text-sky-600" aria-hidden="true" />
                      <span className="truncate">{t("rainShort")}</span>
                    </div>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {selectedFarm.weather ? `${selectedFarm.weather.rainMm} mm` : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-white p-3">
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                      <Thermometer className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                      <span className="truncate">{t("maxTempShort")}</span>
                    </div>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {selectedFarm.weather ? `${selectedFarm.weather.tempMaxC}°C` : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-white p-3">
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                      <Sun className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                      <span className="truncate">{t("dryDaysShort")}</span>
                    </div>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {selectedFarm.weather
                        ? `${selectedFarm.weather.droughtDays} ${t("unitDaysShort")}`
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  {t("tablePoliciesTitle", { count: selectedFarm.policies.length })}
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
                      className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-medium text-slate-700">
                          {policy.metricType}
                        </span>
                        <span className="text-xs font-semibold text-slate-900">
                          {formatCurrency(policy.coverageAmount)}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                        <span>
                          {t("observedLabel")}{" "}
                          <strong className="text-slate-900">
                            {policy.observedValue !== null
                              ? `${policy.observedValue}${meta.unit}`
                              : "—"}
                          </strong>
                        </span>
                        <span>
                          {t("modShort")} ≥ {policy.thresholdValue}
                          {meta.unit} · {t("sevShort")} ≥ {severeCutoff}
                          {meta.unit}
                        </span>
                      </div>

                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            policy.riskLevel === "BREACHED"
                              ? "bg-rose-600"
                              : policy.riskLevel === "AT_RISK"
                                ? "bg-amber-500"
                                : "bg-emerald-700"
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      {policy.status === "ACTIVE" && policy.riskLevel === "BREACHED" && (
                        <button
                          type="button"
                          onClick={() => onEvaluatePolicy(policy, false)}
                          disabled={evaluatingPolicyId === policy.id}
                          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-2 text-xs font-medium text-white shadow-sm shadow-emerald-600/20 transition hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
                        >
                          <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>
                            {evaluatingPolicyId === policy.id
                              ? t("executingSettlement")
                              : t("triggerParametricPayout")}
                          </span>
                        </button>
                      )}

                      {policy.status === "ACTIVE" &&
                        policy.riskLevel !== "BREACHED" &&
                        isAdmin && (
                          <button
                            type="button"
                            onClick={() => onEvaluatePolicy(policy, true)}
                            disabled={evaluatingPolicyId === policy.id}
                            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50"
                          >
                            {evaluatingPolicyId === policy.id
                              ? t("runningShort")
                              : t("simulateBreachAdmin")}
                          </button>
                        )}
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-slate-100 pt-4">
                <Link
                  href="/claims"
                  className="inline-flex w-full items-center justify-center whitespace-nowrap rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-xs transition hover:bg-slate-50"
                >
                  {t("openClaimLedgerArrow")}
                </Link>
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
