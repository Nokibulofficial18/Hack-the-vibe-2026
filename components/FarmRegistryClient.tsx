"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Compass,
  FilePlus2,
  Layers,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Sprout,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";
import { ListCardSkeleton } from "@/components/DashboardSkeletons";
import {
  BANGLADESH_DISTRICTS,
  validateFarmPayload,
  type BangladeshDistrictPreset,
} from "@/lib/domain";
import {
  acresToHectares,
  bighaToHectares,
  cn,
  hectaresToAcres,
  hectaresToBigha,
} from "@/lib/utils";

interface FarmRecord {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  cropType: string;
  sizeHectares: number;
  userId: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  policies: Array<{
    id: string;
    metricType: string;
    thresholdValue: number;
    coverageAmount: number;
    status: string;
  }>;
}

interface FarmerOption {
  id: string;
  name: string;
  email: string;
}

const BD_BOUNDS = {
  minLat: 20.5,
  maxLat: 26.8,
  minLon: 87.8,
  maxLon: 92.8,
};

function projectToBdMap(lat: number, lon: number): { x: number; y: number; inBounds: boolean } {
  const x = ((lon - BD_BOUNDS.minLon) / (BD_BOUNDS.maxLon - BD_BOUNDS.minLon)) * 320;
  const y = ((BD_BOUNDS.maxLat - lat) / (BD_BOUNDS.maxLat - BD_BOUNDS.minLat)) * 200;
  const inBounds = x >= 0 && x <= 320 && y >= 0 && y <= 200;
  return { x, y, inBounds };
}

export function FarmRegistryClient() {
  const { user, isAdmin, getAuthHeaders } = useAuth();
  const {
    t,
    translateStatus,
    translatePerson,
    translateDistrict,
    translateRiskProfile,
    translateCrop,
    translateFarmName,
    translateMetricShort,
    translateValidationError,
    formatNum,
    formatTaka,
    formatArea,
  } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();

  const [farms, setFarms] = useState<FarmRecord[]>([]);
  const [farmers, setFarmers] = useState<FarmerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedDistrictId, setSelectedDistrictId] = useState<string>("sunamganj");
  const [name, setName] = useState("");
  const [cropType, setCropType] = useState("Boro Rice");
  const [latitude, setLatitude] = useState("25.0658");
  const [longitude, setLongitude] = useState("91.3950");
  const [areaUnit, setAreaUnit] = useState<"BIGHA" | "ACRES">("BIGHA");
  const [areaValue, setAreaValue] = useState("6");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadFarms = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const [farmsRes, usersRes] = await Promise.all([
        fetch("/api/farms", { headers, cache: "no-store" }),
        fetch("/api/users", { headers, cache: "no-store" }),
      ]);

      if (farmsRes.ok) {
        const data = (await farmsRes.json()) as { farms: FarmRecord[] };
        setFarms(data.farms);
      }
      if (usersRes.ok) {
        const userData = (await usersRes.json()) as { farmers: FarmerOption[] };
        setFarmers(userData.farmers ?? []);
        if (userData.farmers?.length > 0) {
          setOwnerUserId((prev) => prev || userData.farmers[0].id);
        }
      }
    } catch {
      setFormError(t("farmLoadErr"));
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, t]);

  useEffect(() => {
    void loadFarms();
  }, [user.id, loadFarms]);

  const applyDistrictPreset = (district: BangladeshDistrictPreset) => {
    setSelectedDistrictId(district.id);
    setLatitude(district.latitude.toFixed(4));
    setLongitude(district.longitude.toFixed(4));
    setCropType(district.defaultCrop);
    if (!name.trim()) {
      setName(district.samplePlotName);
    }
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.latitude;
      delete next.longitude;
      delete next.cropType;
      return next;
    });
  };

  const handleMapPick = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const xRatio = (event.clientX - rect.left) / rect.width;
    const yRatio = (event.clientY - rect.top) / rect.height;
    const pickedLon = Number(
      (BD_BOUNDS.minLon + xRatio * (BD_BOUNDS.maxLon - BD_BOUNDS.minLon)).toFixed(4)
    );
    const pickedLat = Number(
      (BD_BOUNDS.maxLat - yRatio * (BD_BOUNDS.maxLat - BD_BOUNDS.minLat)).toFixed(4)
    );
    setSelectedDistrictId("custom");
    setLatitude(String(pickedLat));
    setLongitude(String(pickedLon));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.latitude;
      delete next.longitude;
      return next;
    });
  };

  const computedHectares = useMemo(() => {
    const num = Number(areaValue);
    if (Number.isNaN(num) || num <= 0) return 0;
    return areaUnit === "BIGHA" ? bighaToHectares(num) : acresToHectares(num);
  }, [areaUnit, areaValue]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const validation = validateFarmPayload({
      name,
      cropType,
      latitude,
      longitude,
      sizeHectares: computedHectares,
    });

    if (!validation.valid) {
      const translatedErrors: Record<string, string> = {};
      for (const [k, v] of Object.entries(validation.errors)) {
        translatedErrors[k] = translateValidationError(v);
      }
      setFieldErrors(translatedErrors);
      const firstError = Object.values(translatedErrors)[0];
      setFormError(t("farmFixErrors"));
      toast({
        variant: "error",
        title: t("farmInvalidToastTitle"),
        description: firstError,
      });
      return;
    }

    setFieldErrors({});
    setSubmitting(true);

    try {
      const response = await fetch("/api/farms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          name,
          cropType,
          latitude: Number(latitude),
          longitude: Number(longitude),
          sizeHectares: computedHectares,
          ...(isAdmin && ownerUserId ? { ownerUserId } : {}),
        }),
      });

      const data = (await response.json()) as {
        farm?: FarmRecord;
        error?: string;
        fieldErrors?: Record<string, string>;
      };

      if (!response.ok) {
        setFieldErrors(data.fieldErrors ?? {});
        const msg = data.error ?? t("farmRegFailedTitle");
        setFormError(msg);
        toast({ variant: "error", title: t("farmRegFailedTitle"), description: msg });
        return;
      }

      const msg = t("farmRegSuccessDesc", {
        name: translateFarmName(data.farm?.name ?? name),
        area: formatArea(computedHectares),
        lat: formatNum(latitude),
        lon: formatNum(longitude),
      });
      setSuccessMessage(msg);
      toast({ variant: "success", title: t("farmRegSuccessTitle"), description: msg });
      setName("");
      await loadFarms();
      router.refresh();
    } catch {
      const msg = t("farmNetErrDesc");
      setFormError(msg);
      toast({ variant: "error", title: t("networkErrorTitle"), description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFarm = async (farm: FarmRecord) => {
    const policyCount = farm.policies.length;
    const confirmed = window.confirm(
      t("farmDeleteConfirm", { name: translateFarmName(farm.name), count: policyCount })
    );
    if (!confirmed) return;

    setDeletingId(farm.id);
    setFormError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(`/api/farms/${farm.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        const msg = data.error ?? t("farmDeleteFailedTitle");
        setFormError(msg);
        toast({ variant: "error", title: t("farmDeleteFailedTitle"), description: msg });
        return;
      }
      const msg = t("farmDeleteSuccessDesc", {
        name: translateFarmName(farm.name),
        count: policyCount,
      });
      setSuccessMessage(msg);
      toast({ variant: "info", title: t("farmDeleteSuccessTitle"), description: msg });
      await loadFarms();
      router.refresh();
    } catch {
      const msg = t("farmDeleteFailedTitle");
      setFormError(msg);
      toast({ variant: "error", title: t("networkErrorTitle"), description: msg });
    } finally {
      setDeletingId(null);
    }
  };

  const filteredFarms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return farms;
    return farms.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.cropType.toLowerCase().includes(q) ||
        f.user.name.toLowerCase().includes(q)
    );
  }, [farms, searchQuery]);

  const summary = useMemo(() => {
    const totalHectares = farms.reduce((sum, f) => sum + f.sizeHectares, 0);
    const totalActiveCoverage = farms.reduce(
      (sum, f) =>
        sum + f.policies.filter((p) => p.status === "ACTIVE").reduce((s, p) => s + p.coverageAmount, 0),
      0
    );
    return {
      plotCount: farms.length,
      totalBigha: hectaresToBigha(totalHectares),
      totalAcres: hectaresToAcres(totalHectares),
      totalActiveCoverage,
    };
  }, [farms]);

  const parsedLat = Number(latitude);
  const parsedLon = Number(longitude);
  const pinProjection =
    !Number.isNaN(parsedLat) && !Number.isNaN(parsedLon)
      ? projectToBdMap(parsedLat, parsedLon)
      : { x: 160, y: 100, inBounds: false };

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
              {isAdmin ? t("farmsRoleAdmin") : t("farmsRoleFarmer", { name: translatePerson(user.name) })}
            </span>
          </span>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {t("farmsHeading")}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{t("farmsSubtitle")}</p>
        </div>

        <Link
          href="/policies"
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-medium text-white shadow-sm shadow-emerald-600/20 transition hover:from-emerald-700 hover:to-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/30"
        >
          <FilePlus2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{t("issuePolicyShort")}</span>
        </Link>
      </div>

      {/* KPI Row */}
      <section aria-label="Farm Registry KPIs" className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 border-t-2 border-t-sky-500/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              {t("kpiRegisteredPlots")}
            </p>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm shadow-sky-500/20">
              <MapPin className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-semibold tracking-tight text-slate-900">
              {formatNum(summary.plotCount)}
            </p>
            <p className="mt-1 text-xs text-slate-500">{t("kpiRegisteredPlotsSub")}</p>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 border-t-2 border-t-amber-500/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              {t("kpiTotalCultivated")}
            </p>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm shadow-amber-500/20">
              <Layers className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-semibold tracking-tight text-slate-900">
              {formatNum(summary.totalBigha.toFixed(1))} {t("unitBigha")}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {t("kpiTotalCultivatedSub", { acres: formatNum(summary.totalAcres.toFixed(2)) })}
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-slate-200/80 border-t-2 border-t-emerald-500/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              {t("kpiActivePlotCoverage")}
            </p>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-600/20">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-semibold tracking-tight text-slate-900">
              {formatTaka(summary.totalActiveCoverage)}
            </p>
            <p className="mt-1 text-xs text-slate-500">{t("kpiActivePlotCoverageSub")}</p>
          </div>
        </div>
      </section>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Registration Form */}
        <section
          aria-labelledby="register-farm-heading"
          className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs lg:col-span-5"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Plus className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 id="register-farm-heading" className="text-sm font-semibold text-slate-900">
              {t("registerNewFarmHeading")}
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

          <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
            {isAdmin && farmers.length > 0 && (
              <div>
                <label htmlFor="farm-owner" className="block text-xs font-medium text-slate-600">
                  {t("assignToFarmer")}
                </label>
                <select
                  id="farm-owner"
                  value={ownerUserId}
                  onChange={(e) => setOwnerUserId(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
                >
                  {farmers.map((f) => (
                    <option key={f.id} value={f.id}>
                      {translatePerson(f.name)} ({f.email})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="bd-district-select" className="block text-xs font-medium text-slate-600">
                {t("bdDistrictPreset")}
              </label>
              <select
                id="bd-district-select"
                value={selectedDistrictId}
                onChange={(e) => {
                  const chosen = BANGLADESH_DISTRICTS.find((d) => d.id === e.target.value);
                  if (chosen) applyDistrictPreset(chosen);
                }}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm font-medium text-slate-900 focus:border-emerald-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
              >
                {BANGLADESH_DISTRICTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {translateDistrict(d.name)} — {translateRiskProfile(d.riskProfile)} (
                    {translateCrop(d.defaultCrop)})
                  </option>
                ))}
                {selectedDistrictId === "custom" && (
                  <option value="custom">{t("customGpsOption")}</option>
                )}
              </select>
            </div>

            <div>
              <label htmlFor="farm-name" className="block text-xs font-medium text-slate-600">
                {t("farmPlotNameLabel")}
              </label>
              <input
                id="farm-name"
                type="text"
                placeholder={t("farmPlotNamePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={Boolean(fieldErrors.name)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
              />
              {fieldErrors.name && (
                <p role="alert" className="mt-1 text-xs font-medium text-rose-700">
                  {fieldErrors.name}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="crop-type" className="block text-xs font-medium text-slate-600">
                  {t("cropTypeLabel")}
                </label>
                <input
                  id="crop-type"
                  type="text"
                  placeholder={t("cropTypePlaceholder")}
                  value={cropType}
                  onChange={(e) => setCropType(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.cropType)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
                />
                {fieldErrors.cropType && (
                  <p role="alert" className="mt-1 text-xs font-medium text-rose-700">
                    {fieldErrors.cropType}
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="farm-area" className="block truncate text-xs font-medium text-slate-600">
                    {t("landAreaLabel", {
                      unit: areaUnit === "BIGHA" ? t("unitBigha") : t("unitAcres"),
                    })}
                  </label>
                  <div
                    role="group"
                    aria-label="Land area unit"
                    className="inline-flex shrink-0 rounded-md border border-slate-200 bg-slate-50 p-0.5 text-[10px] font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => setAreaUnit("BIGHA")}
                      aria-pressed={areaUnit === "BIGHA"}
                      className={cn(
                        "whitespace-nowrap rounded px-1.5 py-0.5 transition",
                        areaUnit === "BIGHA" ? "bg-emerald-700 text-white" : "text-slate-600"
                      )}
                    >
                      {t("unitBigha")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAreaUnit("ACRES")}
                      aria-pressed={areaUnit === "ACRES"}
                      className={cn(
                        "whitespace-nowrap rounded px-1.5 py-0.5 transition",
                        areaUnit === "ACRES" ? "bg-emerald-700 text-white" : "text-slate-600"
                      )}
                    >
                      {t("unitAcres")}
                    </button>
                  </div>
                </div>
                <input
                  id="farm-area"
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={areaValue}
                  onChange={(e) => setAreaValue(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.sizeHectares)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
                />
                {computedHectares > 0 && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    ≈ {formatNum(hectaresToBigha(computedHectares).toFixed(1))} {t("unitBigha")} ·{" "}
                    {formatNum(hectaresToAcres(computedHectares).toFixed(2))} {t("unitAcres")}
                  </p>
                )}
                {fieldErrors.sizeHectares && (
                  <p role="alert" className="mt-1 text-xs font-medium text-rose-700">
                    {fieldErrors.sizeHectares}
                  </p>
                )}
              </div>
            </div>

            {/* Interactive Bangladesh District Coordinate Picker */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                  <Compass className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
                  {t("gpsPickerTitle")}
                </span>
                <span className="text-[11px] text-slate-500">{t("gpsPickerHint")}</span>
              </div>

              <svg
                viewBox="0 0 320 200"
                onClick={handleMapPick}
                role="img"
                aria-label={t("gpsPickerTitle")}
                className="mt-2.5 h-36 w-full cursor-crosshair rounded-lg border border-slate-200/80 bg-white"
              >
                {[50, 100, 150].map((y) => (
                  <line key={y} x1="0" y1={y} x2="320" y2={y} stroke="#f1f5f9" strokeWidth="1" />
                ))}
                {[80, 160, 240].map((x) => (
                  <line key={x} x1={x} y1="0" x2={x} y2="200" stroke="#f1f5f9" strokeWidth="1" />
                ))}

                <path
                  d="M65,24 L118,18 L156,36 L220,44 L256,56 L246,84 L214,108 L224,148 L244,184 L222,188 L196,154 L160,158 L112,152 L74,144 L64,108 L46,72 Z"
                  fill="#ECFDF5"
                  stroke="#047857"
                  strokeWidth="1.2"
                  strokeOpacity="0.6"
                />

                {BANGLADESH_DISTRICTS.map((d) => {
                  const pt = projectToBdMap(d.latitude, d.longitude);
                  const isSelected = selectedDistrictId === d.id;
                  return (
                    <g key={d.id}>
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isSelected ? 4.5 : 3}
                        fill={isSelected ? "#047857" : "#64748b"}
                        stroke="#ffffff"
                        strokeWidth="1.2"
                      />
                      <text
                        x={pt.x + 6}
                        y={pt.y + 3}
                        fontSize="7.5"
                        fontWeight={isSelected ? "600" : "500"}
                        fill={isSelected ? "#047857" : "#475569"}
                      >
                        {translateDistrict(d.name.split(" ")[0])}
                      </text>
                    </g>
                  );
                })}

                {pinProjection.inBounds && (
                  <g>
                    <circle
                      cx={pinProjection.x}
                      cy={pinProjection.y}
                      r="9"
                      fill="#047857"
                      fillOpacity="0.16"
                    />
                    <circle
                      cx={pinProjection.x}
                      cy={pinProjection.y}
                      r="4"
                      fill="#047857"
                      stroke="#ffffff"
                      strokeWidth="1.4"
                    />
                  </g>
                )}
              </svg>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {BANGLADESH_DISTRICTS.map((district) => (
                  <button
                    key={district.id}
                    type="button"
                    onClick={() => applyDistrictPreset(district)}
                    className={cn(
                      "whitespace-nowrap rounded-md border px-2 py-1 text-[11px] font-medium transition",
                      selectedDistrictId === district.id
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                    )}
                  >
                    {translateDistrict(district.name)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="farm-lat" className="block text-xs font-medium text-slate-600">
                  {t("latitudeLabel")}
                </label>
                <input
                  id="farm-lat"
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  value={latitude}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLatitude(val);
                    setSelectedDistrictId("custom");
                    const n = Number(val);
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      if (val !== "" && (Number.isNaN(n) || n < -90 || n > 90)) {
                        next.latitude = t("latRangeError");
                      } else {
                        delete next.latitude;
                      }
                      return next;
                    });
                  }}
                  aria-invalid={Boolean(fieldErrors.latitude)}
                  aria-describedby={fieldErrors.latitude ? "farm-lat-error" : undefined}
                  className={cn(
                    "mt-1.5 w-full rounded-lg border px-3 py-2 font-mono text-sm text-slate-900 focus:outline-none focus:ring-2",
                    fieldErrors.latitude
                      ? "border-rose-300 bg-rose-50/40 focus:border-rose-500 focus:ring-rose-500/20"
                      : "border-slate-200 focus:border-emerald-700 focus:ring-emerald-700/15"
                  )}
                />
                {fieldErrors.latitude && (
                  <p id="farm-lat-error" role="alert" className="mt-1 text-xs font-medium text-rose-700">
                    {fieldErrors.latitude}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="farm-lon" className="block text-xs font-medium text-slate-600">
                  {t("longitudeLabel")}
                </label>
                <input
                  id="farm-lon"
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  value={longitude}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLongitude(val);
                    setSelectedDistrictId("custom");
                    const n = Number(val);
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      if (val !== "" && (Number.isNaN(n) || n < -180 || n > 180)) {
                        next.longitude = t("lonRangeError");
                      } else {
                        delete next.longitude;
                      }
                      return next;
                    });
                  }}
                  aria-invalid={Boolean(fieldErrors.longitude)}
                  aria-describedby={fieldErrors.longitude ? "farm-lon-error" : undefined}
                  className={cn(
                    "mt-1.5 w-full rounded-lg border px-3 py-2 font-mono text-sm text-slate-900 focus:outline-none focus:ring-2",
                    fieldErrors.longitude
                      ? "border-rose-300 bg-rose-50/40 focus:border-rose-500 focus:ring-rose-500/20"
                      : "border-slate-200 focus:border-emerald-700 focus:ring-emerald-700/15"
                  )}
                />
                {fieldErrors.longitude && (
                  <p id="farm-lon-error" role="alert" className="mt-1 text-xs font-medium text-rose-700">
                    {fieldErrors.longitude}
                  </p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-emerald-600/20 transition hover:from-emerald-700 hover:to-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{submitting ? t("registeringFarm") : t("registerFarmBtn")}</span>
            </button>
          </form>
        </section>

        {/* Registered Farms List */}
        <section aria-labelledby="registered-farms-heading" className="space-y-4 lg:col-span-7">
          <div className="rounded-xl border border-slate-200/80 bg-white shadow-xs">
            <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <h2 id="registered-farms-heading" className="text-sm font-semibold text-slate-900">
                  {t("registeredPlotsHeading")}
                </h2>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  {formatNum(filteredFarms.length)}
                </span>
              </div>
              <div className="relative w-full sm:w-64">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("searchFarmsPlaceholder")}
                  aria-label={t("searchFarmsPlaceholder")}
                  className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
                />
              </div>
            </div>

            {loading ? (
              <div className="p-5">
                <ListCardSkeleton rows={3} />
              </div>
            ) : filteredFarms.length === 0 ? (
              <div className="p-10 text-center">
                <MapPin className="mx-auto h-7 w-7 text-slate-300" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium text-slate-900">{t("noFarmsFoundTitle")}</p>
                <p className="mt-1 text-xs text-slate-500">{t("noFarmsFoundDesc")}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredFarms.map((farm) => {
                  const activePolicies = farm.policies.filter((p) => p.status === "ACTIVE");
                  const totalCoverage = activePolicies.reduce((s, p) => s + p.coverageAmount, 0);

                  return (
                    <article
                      key={farm.id}
                      className="px-5 py-4 transition hover:bg-slate-50/80"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-slate-900">
                              {translateFarmName(farm.name)}
                            </h3>
                            <span className="whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                              {translateCrop(farm.cropType)}
                            </span>
                            {isAdmin && (
                              <span className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                                {translatePerson(farm.user.name)}
                              </span>
                            )}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1 font-mono text-slate-600">
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                              {formatNum(farm.latitude.toFixed(4))},{" "}
                              {formatNum(farm.longitude.toFixed(4))}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="font-medium text-slate-700">
                              {formatArea(farm.sizeHectares)}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span>
                              {t("activePolicySummary", { count: activePolicies.length })} (
                              <span className="font-medium text-slate-800">
                                {formatTaka(totalCoverage)}
                              </span>
                              )
                            </span>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <Link
                            href={`/policies?farmId=${farm.id}`}
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            <FilePlus2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>{t("addPolicyBtn")}</span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDeleteFarm(farm)}
                            disabled={deletingId === farm.id}
                            aria-label={`${t("deleteBtn")} ${farm.name}`}
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>{t("deleteBtn")}</span>
                          </button>
                        </div>
                      </div>

                      {farm.policies.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {farm.policies.map((policy) => (
                            <span
                              key={policy.id}
                              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-700"
                            >
                              <span className="font-medium text-slate-800">
                                {translateMetricShort(policy.metricType)}
                              </span>
                              <span>≥ {formatNum(policy.thresholdValue)}</span>
                              <span className="text-slate-300">·</span>
                              <span className="font-medium text-slate-900">
                                {formatTaka(policy.coverageAmount)}
                              </span>
                              <span
                                className={cn(
                                  "font-medium",
                                  policy.status === "ACTIVE"
                                    ? "text-emerald-700"
                                    : policy.status === "CLAIMED"
                                      ? "text-amber-700"
                                      : "text-slate-500"
                                )}
                              >
                                ({translateStatus(policy.status)})
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
