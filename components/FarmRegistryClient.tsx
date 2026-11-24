"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Compass,
  FilePlus2,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Sprout,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
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
  formatCurrency,
  formatLandArea,
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

// Bounding box for Bangladesh SVG map picker
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
  const { toast } = useToast();
  const router = useRouter();

  const [farms, setFarms] = useState<FarmRecord[]>([]);
  const [farmers, setFarmers] = useState<FarmerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Form state (defaulted to Sunamganj Haor, Bangladesh)
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
      setFormError("Unable to load registered farms.");
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

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
      setFieldErrors(validation.errors);
      const firstError = Object.values(validation.errors)[0];
      setFormError("Please correct the highlighted coordinate or plot fields.");
      toast({
        variant: "error",
        title: "Invalid Farm Coordinates or Plot Details",
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
        const msg = data.error ?? "Failed to register farm plot.";
        setFormError(msg);
        toast({ variant: "error", title: "Registration Failed", description: msg });
        return;
      }

      const msg = `Registered "${data.farm?.name}" (${formatLandArea(computedHectares)}) at (${latitude}, ${longitude}).`;
      setSuccessMessage(msg);
      toast({ variant: "success", title: "Farm Plot Registered", description: msg });
      setName("");
      await loadFarms();
      router.refresh();
    } catch {
      const msg = "Network error while registering farm plot.";
      setFormError(msg);
      toast({ variant: "error", title: "Network Error", description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteFarm = async (farm: FarmRecord) => {
    const policyCount = farm.policies.length;
    const confirmed = window.confirm(
      `Delete "${farm.name}"? This will safely cascade and remove ${policyCount} linked ${policyCount === 1 ? "policy" : "policies"}.`
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
        const msg = data.error ?? "Failed to delete farm plot.";
        setFormError(msg);
        toast({ variant: "error", title: "Delete Failed", description: msg });
        return;
      }
      const msg = `Deleted "${farm.name}" and cleaned up ${policyCount} linked policy record(s).`;
      setSuccessMessage(msg);
      toast({ variant: "info", title: "Farm Plot Deleted", description: msg });
      await loadFarms();
      router.refresh();
    } catch {
      const msg = "Failed to delete farm plot.";
      setFormError(msg);
      toast({ variant: "error", title: "Network Error", description: msg });
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

  const parsedLat = Number(latitude);
  const parsedLon = Number(longitude);
  const pinProjection =
    !Number.isNaN(parsedLat) && !Number.isNaN(parsedLon)
      ? projectToBdMap(parsedLat, parsedLon)
      : { x: 160, y: 100, inBounds: false };

  return (
    <div className="space-y-6">
      {/* Header & Role Scope Indicator */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
            {isAdmin ? (
              <ShieldCheck className="h-3.5 w-3.5 text-indigo-700" aria-hidden="true" />
            ) : (
              <Sprout className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
            )}
            {isAdmin
              ? "Admin View · All Bangladesh Farmer Plots"
              : `Farmer View · Isolated to ${user.name}`}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            Farm Plot Registry (Bangladesh)
          </h1>
          <p className="mt-1 text-sm text-slate-700">
            Register smallholder plots across climate-vulnerable Bangladesh districts with GPS bounds (`-90°` to `90°` lat, `-180°` to `180°` lon) and land area in <strong>Bigha</strong> &amp; <strong>Acres</strong>.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-right">
            <p className="text-xs font-semibold text-slate-600">Visible Plots</p>
            <p className="text-xl font-bold text-slate-950">{farms.length}</p>
          </div>
          <Link
            href="/policies"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-800"
          >
            <FilePlus2 className="h-4 w-4" aria-hidden="true" />
            Issue Policy
          </Link>
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Registration Form */}
        <section
          aria-labelledby="register-farm-heading"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-5"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <Plus className="h-5 w-5 text-emerald-700" aria-hidden="true" />
            <h2 id="register-farm-heading" className="text-base font-bold text-slate-950">
              Register New Farm Plot
            </h2>
          </div>

          {formError && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-900"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" aria-hidden="true" />
              <span>{formError}</span>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
              <span>{successMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
            {isAdmin && farmers.length > 0 && (
              <div>
                <label htmlFor="farm-owner" className="block text-xs font-bold text-slate-800">
                  Assign to Farmer (Admin Override)
                </label>
                <select
                  id="farm-owner"
                  value={ownerUserId}
                  onChange={(e) => setOwnerUserId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                >
                  {farmers.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.email})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Bangladesh Climate-Vulnerable District Preset Selector */}
            <div>
              <label htmlFor="bd-district-select" className="block text-xs font-bold text-slate-800">
                Bangladesh Climate-Vulnerable District Preset
              </label>
              <select
                id="bd-district-select"
                value={selectedDistrictId}
                onChange={(e) => {
                  const chosen = BANGLADESH_DISTRICTS.find((d) => d.id === e.target.value);
                  if (chosen) applyDistrictPreset(chosen);
                }}
                className="mt-1 w-full rounded-lg border border-emerald-300 bg-emerald-50/40 px-3 py-2 text-sm font-medium text-slate-950 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              >
                {BANGLADESH_DISTRICTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} — {d.riskProfile} ({d.defaultCrop})
                  </option>
                ))}
                {selectedDistrictId === "custom" && (
                  <option value="custom">Custom GPS Coordinates</option>
                )}
              </select>
            </div>

            <div>
              <label htmlFor="farm-name" className="block text-xs font-bold text-slate-800">
                Farm Plot Name
              </label>
              <input
                id="farm-name"
                type="text"
                placeholder="e.g., Tahirpur Haor Boro Plot"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={Boolean(fieldErrors.name)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 placeholder:text-slate-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
              {fieldErrors.name && (
                <p role="alert" className="mt-1 text-xs font-semibold text-rose-700">
                  {fieldErrors.name}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="crop-type" className="block text-xs font-bold text-slate-800">
                  Crop / Aquaculture Type
                </label>
                <input
                  id="crop-type"
                  type="text"
                  placeholder="e.g., Boro Rice"
                  value={cropType}
                  onChange={(e) => setCropType(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.cropType)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 placeholder:text-slate-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                />
                {fieldErrors.cropType && (
                  <p role="alert" className="mt-1 text-xs font-semibold text-rose-700">
                    {fieldErrors.cropType}
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="farm-area" className="block text-xs font-bold text-slate-800">
                    Land Area ({areaUnit === "BIGHA" ? "Bigha" : "Acres"})
                  </label>
                  <div
                    role="group"
                    aria-label="Land area unit"
                    className="inline-flex rounded-md border border-slate-300 bg-slate-100 p-0.5 text-[10px] font-bold"
                  >
                    <button
                      type="button"
                      onClick={() => setAreaUnit("BIGHA")}
                      aria-pressed={areaUnit === "BIGHA"}
                      className={cn(
                        "rounded px-1.5 py-0.5 transition",
                        areaUnit === "BIGHA" ? "bg-emerald-700 text-white" : "text-slate-700"
                      )}
                    >
                      Bigha
                    </button>
                    <button
                      type="button"
                      onClick={() => setAreaUnit("ACRES")}
                      aria-pressed={areaUnit === "ACRES"}
                      className={cn(
                        "rounded px-1.5 py-0.5 transition",
                        areaUnit === "ACRES" ? "bg-emerald-700 text-white" : "text-slate-700"
                      )}
                    >
                      Acres
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
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                />
                {computedHectares > 0 && (
                  <p className="mt-1 text-[11px] font-medium text-emerald-800">
                    ≈ {hectaresToBigha(computedHectares).toFixed(1)} Bigha ·{" "}
                    {hectaresToAcres(computedHectares).toFixed(2)} Acres
                  </p>
                )}
                {fieldErrors.sizeHectares && (
                  <p role="alert" className="mt-1 text-xs font-semibold text-rose-700">
                    {fieldErrors.sizeHectares}
                  </p>
                )}
              </div>
            </div>

            {/* Interactive Bangladesh District Coordinate Picker */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <Compass className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                  Bangladesh GPS Coordinate Picker
                </span>
                <span className="text-[11px] font-medium text-slate-600">
                  Click map or choose district
                </span>
              </div>

              <svg
                viewBox="0 0 320 200"
                onClick={handleMapPick}
                role="img"
                aria-label="Bangladesh district latitude and longitude coordinate map"
                className="mt-2 h-36 w-full cursor-crosshair rounded-lg border border-slate-200 bg-sky-50"
              >
                {/* Lat/Lon Gridlines */}
                {[50, 100, 150].map((y) => (
                  <line key={y} x1="0" y1={y} x2="320" y2={y} stroke="#cbd5e1" strokeWidth="0.6" />
                ))}
                {[80, 160, 240].map((x) => (
                  <line key={x} x1={x} y1="0" x2={x} y2="200" stroke="#cbd5e1" strokeWidth="0.6" />
                ))}

                {/* Stylized Bangladesh landmass silhouette */}
                <path
                  d="M65,24 L118,18 L156,36 L220,44 L256,56 L246,84 L214,108 L224,148 L244,184 L222,188 L196,154 L160,158 L112,152 L74,144 L64,108 L46,72 Z"
                  fill="#d1fae5"
                  stroke="#34d399"
                  strokeWidth="1.2"
                />

                {/* Plot all 5 climate-vulnerable Bangladesh districts */}
                {BANGLADESH_DISTRICTS.map((d) => {
                  const pt = projectToBdMap(d.latitude, d.longitude);
                  const isSelected = selectedDistrictId === d.id;
                  return (
                    <g key={d.id}>
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isSelected ? 5 : 3}
                        fill={isSelected ? "#047857" : "#475569"}
                        stroke="#ffffff"
                        strokeWidth="1"
                      />
                      <text
                        x={pt.x + 6}
                        y={pt.y + 3}
                        fontSize="7.5"
                        fontWeight={isSelected ? "700" : "500"}
                        fill={isSelected ? "#064e3b" : "#334155"}
                      >
                        {d.name.split(" ")[0]}
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
                      fill="#059669"
                      fillOpacity="0.2"
                    />
                    <circle
                      cx={pinProjection.x}
                      cy={pinProjection.y}
                      r="4"
                      fill="#059669"
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
                      "rounded-md border px-2 py-1 text-[11px] font-semibold transition",
                      selectedDistrictId === district.id
                        ? "border-emerald-600 bg-emerald-700 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:border-emerald-400 hover:text-emerald-800"
                    )}
                  >
                    {district.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="farm-lat" className="block text-xs font-bold text-slate-800">
                  Latitude (-90 to 90)
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
                        next.latitude = "Latitude must be between -90 and 90 degrees.";
                      } else {
                        delete next.latitude;
                      }
                      return next;
                    });
                  }}
                  aria-invalid={Boolean(fieldErrors.latitude)}
                  aria-describedby={fieldErrors.latitude ? "farm-lat-error" : undefined}
                  className={cn(
                    "mt-1 w-full rounded-lg border px-3 py-2 font-mono text-sm text-slate-950 focus:outline-none focus:ring-2",
                    fieldErrors.latitude
                      ? "border-rose-500 bg-rose-50/40 focus:border-rose-600 focus:ring-rose-500/25"
                      : "border-slate-300 focus:border-emerald-600 focus:ring-emerald-600/20"
                  )}
                />
                {fieldErrors.latitude && (
                  <p id="farm-lat-error" role="alert" className="mt-1 text-xs font-semibold text-rose-700">
                    {fieldErrors.latitude}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="farm-lon" className="block text-xs font-bold text-slate-800">
                  Longitude (-180 to 180)
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
                        next.longitude = "Longitude must be between -180 and 180 degrees.";
                      } else {
                        delete next.longitude;
                      }
                      return next;
                    });
                  }}
                  aria-invalid={Boolean(fieldErrors.longitude)}
                  aria-describedby={fieldErrors.longitude ? "farm-lon-error" : undefined}
                  className={cn(
                    "mt-1 w-full rounded-lg border px-3 py-2 font-mono text-sm text-slate-950 focus:outline-none focus:ring-2",
                    fieldErrors.longitude
                      ? "border-rose-500 bg-rose-50/40 focus:border-rose-600 focus:ring-rose-500/25"
                      : "border-slate-300 focus:border-emerald-600 focus:ring-emerald-600/20"
                  )}
                />
                {fieldErrors.longitude && (
                  <p id="farm-lon-error" role="alert" className="mt-1 text-xs font-semibold text-rose-700">
                    {fieldErrors.longitude}
                  </p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <MapPin className="h-4 w-4" aria-hidden="true" />
              {submitting ? "Registering Farm Plot..." : "Register Farm Plot"}
            </button>
          </form>
        </section>

        {/* Registered Farms List */}
        <section aria-labelledby="registered-farms-heading" className="space-y-4 lg:col-span-7">
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
            <h2 id="registered-farms-heading" className="text-base font-bold text-slate-950">
              Registered Farm Plots ({filteredFarms.length})
            </h2>
            <div className="relative w-full sm:w-64">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search district, crop, farmer..."
                aria-label="Search registered farm plots"
                className="w-full rounded-lg border border-slate-300 py-1.5 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>
          </div>

          {loading ? (
            <ListCardSkeleton rows={3} />
          ) : filteredFarms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <MapPin className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-slate-800">No farm plots found</p>
              <p className="mt-1 text-xs text-slate-600">
                Select a Bangladesh district preset and register your first plot to begin climate monitoring.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredFarms.map((farm) => {
                const activePolicies = farm.policies.filter((p) => p.status === "ACTIVE");
                const totalCoverage = activePolicies.reduce((s, p) => s + p.coverageAmount, 0);

                return (
                  <article
                    key={farm.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-slate-950">{farm.name}</h3>
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200">
                            {farm.cropType}
                          </span>
                          {isAdmin && (
                            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-900 ring-1 ring-indigo-200">
                              Farmer: {farm.user.name}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600">
                          <span className="inline-flex items-center gap-1 font-mono">
                            <MapPin className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                            {farm.latitude.toFixed(4)}, {farm.longitude.toFixed(4)}
                          </span>
                          <span>·</span>
                          <span className="font-semibold text-slate-800">
                            {formatLandArea(farm.sizeHectares)}
                          </span>
                          <span>·</span>
                          <span>
                            {activePolicies.length} active{" "}
                            {activePolicies.length === 1 ? "policy" : "policies"} (
                            {formatCurrency(totalCoverage)})
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link
                          href={`/policies?farmId=${farm.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100"
                        >
                          <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Add Policy
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDeleteFarm(farm)}
                          disabled={deletingId === farm.id}
                          aria-label={`Delete farm ${farm.name}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Delete
                        </button>
                      </div>
                    </div>

                    {farm.policies.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                        {farm.policies.map((policy) => (
                          <span
                            key={policy.id}
                            className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-800"
                          >
                            <span className="font-mono font-bold">{policy.metricType}</span>
                            <span>≥ {policy.thresholdValue}</span>
                            <span className="text-slate-400">·</span>
                            <span>{formatCurrency(policy.coverageAmount)}</span>
                            <span
                              className={
                                policy.status === "ACTIVE"
                                  ? "font-bold text-emerald-800"
                                  : "font-bold text-indigo-800"
                              }
                            >
                              ({policy.status})
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
        </section>
      </div>
    </div>
  );
}
