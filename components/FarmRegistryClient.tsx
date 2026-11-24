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
import { validateFarmPayload } from "@/lib/domain";
import { formatCurrency } from "@/lib/utils";

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

const REGION_PRESETS = [
  { label: "Manila Valley, PH", lat: 14.5995, lon: 120.9842, crop: "Irrigated Rice" },
  { label: "Dhaka Delta, BD", lat: 23.8103, lon: 90.4125, crop: "Aman Paddy" },
  { label: "Wayanad Hills, IN", lat: 11.6854, lon: 76.132, crop: "Coffee & Spice" },
  { label: "Nairobi Highlands, KE", lat: -1.2921, lon: 36.8219, crop: "Maize & Tea" },
];

export function FarmRegistryClient() {
  const { user, isAdmin, getAuthHeaders } = useAuth();
  const router = useRouter();

  const [farms, setFarms] = useState<FarmRecord[]>([]);
  const [farmers, setFarmers] = useState<FarmerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [cropType, setCropType] = useState("");
  const [latitude, setLatitude] = useState("14.5995");
  const [longitude, setLongitude] = useState("120.9842");
  const [sizeHectares, setSizeHectares] = useState("3.5");
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

  const handleMapPick = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const xRatio = (event.clientX - rect.left) / rect.width;
    const yRatio = (event.clientY - rect.top) / rect.height;
    const pickedLon = Number(((xRatio * 360) - 180).toFixed(4));
    const pickedLat = Number((90 - (yRatio * 180)).toFixed(4));
    setLatitude(String(pickedLat));
    setLongitude(String(pickedLon));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.latitude;
      delete next.longitude;
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const validation = validateFarmPayload({
      name,
      cropType,
      latitude,
      longitude,
      sizeHectares,
    });

    if (!validation.valid) {
      setFieldErrors(validation.errors);
      setFormError("Please correct the highlighted coordinate or plot fields.");
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
          sizeHectares: Number(sizeHectares),
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
        setFormError(data.error ?? "Failed to register farm plot.");
        return;
      }

      setSuccessMessage(`Registered farm plot "${data.farm?.name}" at (${latitude}, ${longitude}).`);
      setName("");
      setCropType("");
      await loadFarms();
      router.refresh();
    } catch {
      setFormError("Network error while registering farm plot.");
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
        setFormError(data.error ?? "Failed to delete farm plot.");
        return;
      }
      setSuccessMessage(`Deleted "${farm.name}" and cleaned up ${policyCount} linked policy record(s).`);
      await loadFarms();
      router.refresh();
    } catch {
      setFormError("Failed to delete farm plot.");
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
  const hasValidPin =
    !Number.isNaN(parsedLat) &&
    !Number.isNaN(parsedLon) &&
    parsedLat >= -90 &&
    parsedLat <= 90 &&
    parsedLon >= -180 &&
    parsedLon <= 180;
  const pinX = hasValidPin ? ((parsedLon + 180) / 360) * 360 : 180;
  const pinY = hasValidPin ? ((90 - parsedLat) / 180) * 180 : 90;

  return (
    <div className="space-y-6">
      {/* Header & Role Scope Indicator */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {isAdmin ? (
              <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" aria-hidden="true" />
            ) : (
              <Sprout className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            )}
            {isAdmin ? "Admin View · All Farmer Plots" : `Farmer View · Isolated to ${user.name}`}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            Farm Plot Registry
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Register agricultural plots with verified GPS coordinates (`-90°` to `90°` lat, `-180°` to `180°` lon) for automated meteorological tracking.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-right">
            <p className="text-xs font-medium text-slate-500">Visible Plots</p>
            <p className="text-xl font-bold text-slate-900">{farms.length}</p>
          </div>
          <Link
            href="/policies"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
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
            <Plus className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            <h2 id="register-farm-heading" className="text-base font-semibold text-slate-900">
              Register New Farm Plot
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

          <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
            {isAdmin && farmers.length > 0 && (
              <div>
                <label
                  htmlFor="farm-owner"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Assign to Farmer (Admin Override)
                </label>
                <select
                  id="farm-owner"
                  value={ownerUserId}
                  onChange={(e) => setOwnerUserId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  {farmers.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.email})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="farm-name" className="block text-xs font-semibold text-slate-700">
                Farm Plot Name
              </label>
              <input
                id="farm-name"
                type="text"
                placeholder="e.g., Valley Green Rice Terrace"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={Boolean(fieldErrors.name)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              {fieldErrors.name && (
                <p className="mt-1 text-xs font-medium text-rose-600">{fieldErrors.name}</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="crop-type" className="block text-xs font-semibold text-slate-700">
                  Crop Type
                </label>
                <input
                  id="crop-type"
                  type="text"
                  placeholder="e.g., Irrigated Rice"
                  value={cropType}
                  onChange={(e) => setCropType(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.cropType)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                {fieldErrors.cropType && (
                  <p className="mt-1 text-xs font-medium text-rose-600">{fieldErrors.cropType}</p>
                )}
              </div>

              <div>
                <label htmlFor="size-hectares" className="block text-xs font-semibold text-slate-700">
                  Plot Size (Hectares)
                </label>
                <input
                  id="size-hectares"
                  type="number"
                  step="0.1"
                  value={sizeHectares}
                  onChange={(e) => setSizeHectares(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.sizeHectares)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                {fieldErrors.sizeHectares && (
                  <p className="mt-1 text-xs font-medium text-rose-600">{fieldErrors.sizeHectares}</p>
                )}
              </div>
            </div>

            {/* Interactive Coordinate Picker */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Compass className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  Interactive Coordinate Picker
                </span>
                <span className="text-[11px] text-slate-500">Click grid or type below</span>
              </div>

              <svg
                viewBox="0 0 360 180"
                onClick={handleMapPick}
                role="img"
                aria-label="Global latitude and longitude coordinate grid"
                className="mt-2 h-32 w-full cursor-crosshair rounded-lg border border-slate-200 bg-sky-50"
              >
                {/* Equator & Prime Meridian */}
                <line x1="0" y1="90" x2="360" y2="90" stroke="#94a3b8" strokeDasharray="3 3" strokeWidth="0.8" />
                <line x1="180" y1="0" x2="180" y2="180" stroke="#94a3b8" strokeDasharray="3 3" strokeWidth="0.8" />
                {/* Gridlines */}
                {[45, 135].map((y) => (
                  <line key={y} x1="0" y1={y} x2="360" y2={y} stroke="#cbd5e1" strokeWidth="0.5" />
                ))}
                {[60, 120, 240, 300].map((x) => (
                  <line key={x} x1={x} y1="0" x2={x} y2="180" stroke="#cbd5e1" strokeWidth="0.5" />
                ))}
                {/* Stylized land blocks for visual orientation */}
                <rect x="42" y="34" width="66" height="44" rx="10" fill="#d1fae5" stroke="#6ee7b7" strokeWidth="0.7" />
                <rect x="92" y="92" width="38" height="58" rx="10" fill="#d1fae5" stroke="#6ee7b7" strokeWidth="0.7" />
                <rect x="166" y="32" width="46" height="36" rx="8" fill="#d1fae5" stroke="#6ee7b7" strokeWidth="0.7" />
                <rect x="174" y="72" width="46" height="62" rx="12" fill="#d1fae5" stroke="#6ee7b7" strokeWidth="0.7" />
                <rect x="218" y="36" width="96" height="54" rx="12" fill="#d1fae5" stroke="#6ee7b7" strokeWidth="0.7" />
                <rect x="278" y="108" width="46" height="34" rx="10" fill="#d1fae5" stroke="#6ee7b7" strokeWidth="0.7" />

                {hasValidPin && (
                  <g>
                    <circle cx={pinX} cy={pinY} r="7" fill="#059669" fillOpacity="0.2" />
                    <circle cx={pinX} cy={pinY} r="3.5" fill="#059669" stroke="#ffffff" strokeWidth="1.2" />
                  </g>
                )}
              </svg>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {REGION_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setLatitude(String(preset.lat));
                      setLongitude(String(preset.lon));
                      if (!cropType) setCropType(preset.crop);
                      setFieldErrors({});
                    }}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="farm-lat" className="block text-xs font-semibold text-slate-700">
                  Latitude (-90 to 90)
                </label>
                <input
                  id="farm-lat"
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.latitude)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                {fieldErrors.latitude && (
                  <p className="mt-1 text-xs font-medium text-rose-600">{fieldErrors.latitude}</p>
                )}
              </div>

              <div>
                <label htmlFor="farm-lon" className="block text-xs font-semibold text-slate-700">
                  Longitude (-180 to 180)
                </label>
                <input
                  id="farm-lon"
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.longitude)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                {fieldErrors.longitude && (
                  <p className="mt-1 text-xs font-medium text-rose-600">{fieldErrors.longitude}</p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <MapPin className="h-4 w-4" aria-hidden="true" />
              {submitting ? "Registering Farm Plot..." : "Register Farm Plot"}
            </button>
          </form>
        </section>

        {/* Registered Farms List */}
        <section aria-labelledby="registered-farms-heading" className="space-y-4 lg:col-span-7">
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
            <h2 id="registered-farms-heading" className="text-base font-semibold text-slate-900">
              Registered Farm Plots ({filteredFarms.length})
            </h2>
            <div className="relative w-full sm:w-64">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search plot, crop, farmer..."
                aria-label="Search registered farm plots"
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-9 pr-3 text-xs text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              Loading farm plots for {user.name}...
            </div>
          ) : filteredFarms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <MapPin className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-slate-700">No farm plots found</p>
              <p className="mt-1 text-xs text-slate-500">
                Register your first plot using the form to start monitoring climate triggers.
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
                          <h3 className="text-base font-semibold text-slate-900">{farm.name}</h3>
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                            {farm.cropType}
                          </span>
                          {isAdmin && (
                            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                              Owner: {farm.user.name}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1 font-mono">
                            <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                            {farm.latitude.toFixed(4)}, {farm.longitude.toFixed(4)}
                          </span>
                          <span>{farm.sizeHectares} hectares</span>
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
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
                        >
                          <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Add Policy
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDeleteFarm(farm)}
                          disabled={deletingId === farm.id}
                          aria-label={`Delete farm ${farm.name}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
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
                            className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700"
                          >
                            <span className="font-mono font-semibold">{policy.metricType}</span>
                            <span>≥ {policy.thresholdValue}</span>
                            <span className="text-slate-400">·</span>
                            <span>{formatCurrency(policy.coverageAmount)}</span>
                            <span
                              className={
                                policy.status === "ACTIVE"
                                  ? "font-semibold text-emerald-700"
                                  : "font-semibold text-indigo-700"
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
