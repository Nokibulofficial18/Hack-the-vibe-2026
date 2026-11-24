export type MetricType = "RAINFALL_MAX" | "TEMP_MAX" | "DROUGHT_DAYS";
export type PayoutMethodType = "BKASH" | "NAGAD" | "ROCKET";
export type SeverityTier = "NONE" | "MODERATE" | "SEVERE";

export interface PayoutMethodMeta {
  id: PayoutMethodType;
  label: string;
  txPrefix: string;
  tagline: string;
  badgeClass: string;
  headerBgClass: string;
}

export const PAYOUT_METHOD_META: Record<PayoutMethodType, PayoutMethodMeta> = {
  BKASH: {
    id: "BKASH",
    label: "bKash",
    txPrefix: "BKS",
    tagline: "bKash Instant Agri-Payout",
    badgeClass: "bg-rose-50 text-rose-700 border border-rose-200",
    headerBgClass: "bg-slate-900 text-white",
  },
  NAGAD: {
    id: "NAGAD",
    label: "Nagad",
    txPrefix: "NGD",
    tagline: "Nagad Instant Micro-Disbursement",
    badgeClass: "bg-amber-50 text-amber-700 border border-amber-200",
    headerBgClass: "bg-slate-900 text-white",
  },
  ROCKET: {
    id: "ROCKET",
    label: "Rocket",
    txPrefix: "RKT",
    tagline: "DBBL Rocket Mobile Banking",
    badgeClass: "bg-slate-100 text-slate-700 border border-slate-200",
    headerBgClass: "bg-slate-900 text-white",
  },
};

export const PAYOUT_METHOD_OPTIONS: PayoutMethodMeta[] = Object.values(PAYOUT_METHOD_META);

export function isValidPayoutMethod(value: unknown): value is PayoutMethodType {
  return value === "BKASH" || value === "NAGAD" || value === "ROCKET";
}

export function getPayoutMethodMeta(method?: string | null): PayoutMethodMeta {
  if (isValidPayoutMethod(method)) {
    return PAYOUT_METHOD_META[method];
  }
  return PAYOUT_METHOD_META.BKASH;
}

/**
 * Strict Bangladesh mobile number validation:
 * Must match +8801XXXXXXXXX where the 2nd digit after 01 is 3–9 (valid BD MNO prefixes).
 */
export const BD_PHONE_REGEX = /^\+8801[3-9]\d{8}$/;

export function validateBdMobileNumber(phone: unknown): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  if (typeof phone !== "string") {
    return {
      valid: false,
      normalized: "",
      error: "Mobile number is required in +8801XXXXXXXXX format.",
    };
  }
  const normalized = phone.replace(/[\s-]/g, "").trim();
  if (!BD_PHONE_REGEX.test(normalized)) {
    return {
      valid: false,
      normalized,
      error:
        "Invalid Bangladesh mobile number. Must follow +8801XXXXXXXXX (operator prefix 013–019, 14 characters).",
    };
  }
  return { valid: true, normalized };
}

/**
 * Masks a Bangladesh mobile number for digital receipts:
 * +8801712345678 -> +880 17XX-XXX678
 */
export function maskBdMobileNumber(phone?: string | null): string {
  if (!phone) return "+880 1XXX-XXX000";
  const cleaned = phone.replace(/[\s-]/g, "");
  if (cleaned.length < 14) return cleaned;
  return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 6)}XX-XXX${cleaned.slice(-3)}`;
}

/**
 * Generates a realistic bKash / Nagad / Rocket digital transaction reference ID.
 */
export function generateMfsTransactionId(method: PayoutMethodType): string {
  const prefix = PAYOUT_METHOD_META[method].txPrefix;
  const now = new Date();
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${prefix}${yy}${mm}${dd}${suffix}`;
}

export interface MetricDefinition {
  type: MetricType;
  label: string;
  shortLabel: string;
  unit: string;
  defaultThreshold: number;
  severeBaseline: number;
  description: string;
}

export interface BangladeshDistrictPreset {
  id: string;
  name: string;
  regionTag: string;
  latitude: number;
  longitude: number;
  riskProfile: string;
  defaultCrop: string;
  recommendedMetric: MetricType;
  samplePlotName: string;
}

export const BANGLADESH_DISTRICTS: readonly BangladeshDistrictPreset[] = [
  {
    id: "sunamganj",
    name: "Sunamganj (Haor)",
    regionTag: "Sylhet Haor Basin",
    latitude: 25.0658,
    longitude: 91.395,
    riskProfile: "Flash Flood risk",
    defaultCrop: "Boro Rice",
    recommendedMetric: "RAINFALL_MAX",
    samplePlotName: "Tahirpur Haor Boro Plot",
  },
  {
    id: "satkhira",
    name: "Satkhira (Coastal)",
    regionTag: "Southwest Coastal Belt",
    latitude: 22.7185,
    longitude: 89.0705,
    riskProfile: "Cyclone & Heavy Rainfall risk",
    defaultCrop: "Aman Paddy / Shrimp Aquaculture",
    recommendedMetric: "RAINFALL_MAX",
    samplePlotName: "Shyamnagar Coastal Gher & Paddy",
  },
  {
    id: "rajshahi",
    name: "Rajshahi (Barind Tract)",
    regionTag: "Northwest Barind Tract",
    latitude: 24.3745,
    longitude: 88.6042,
    riskProfile: "Drought & Extreme Heat risk",
    defaultCrop: "Mango / Wheat",
    recommendedMetric: "TEMP_MAX",
    samplePlotName: "Godagari Barind Mango & Wheat",
  },
  {
    id: "kurigram",
    name: "Kurigram (Riverine)",
    regionTag: "Brahmaputra Riverine Char",
    latitude: 25.8054,
    longitude: 89.6362,
    riskProfile: "Monsoon Flood risk",
    defaultCrop: "Jute / Aman Paddy",
    recommendedMetric: "RAINFALL_MAX",
    samplePlotName: "Chilmari Riverine Char Farm",
  },
  {
    id: "bogura",
    name: "Bogura",
    regionTag: "North Bengal Alluvial Plain",
    latitude: 24.8465,
    longitude: 89.3773,
    riskProfile: "Irregular Rainfall risk",
    defaultCrop: "Potato / Rice",
    recommendedMetric: "RAINFALL_MAX",
    samplePlotName: "Sherpur Alluvial Potato Field",
  },
] as const;

export const METRIC_DEFINITIONS: Record<MetricType, MetricDefinition> = {
  RAINFALL_MAX: {
    type: "RAINFALL_MAX",
    label: "Excess Rainfall / Flash Flood",
    shortLabel: "Rainfall",
    unit: "mm",
    defaultThreshold: 50,
    severeBaseline: 100,
    description:
      "Moderate breach (threshold to 99mm): 50% payout · Severe breach (≥ 100mm): 100% payout.",
  },
  TEMP_MAX: {
    type: "TEMP_MAX",
    label: "Extreme Heatwave",
    shortLabel: "Max Temp",
    unit: "°C",
    defaultThreshold: 38,
    severeBaseline: 42,
    description:
      "Moderate breach (threshold to 41.9°C): 50% payout · Severe breach (≥ 42°C): 100% payout.",
  },
  DROUGHT_DAYS: {
    type: "DROUGHT_DAYS",
    label: "Consecutive Drought Days",
    shortLabel: "Drought",
    unit: "days",
    defaultThreshold: 14,
    severeBaseline: 21,
    description:
      "Moderate breach (threshold to 20 days): 50% payout · Severe breach (≥ 21 days): 100% payout.",
  },
};

export const METRIC_OPTIONS: MetricDefinition[] = Object.values(METRIC_DEFINITIONS);

export function isValidMetricType(value: string): value is MetricType {
  return value === "RAINFALL_MAX" || value === "TEMP_MAX" || value === "DROUGHT_DAYS";
}

export function getMetricMeta(metricType: string): MetricDefinition {
  if (isValidMetricType(metricType)) {
    return METRIC_DEFINITIONS[metricType];
  }
  return {
    type: "RAINFALL_MAX",
    label: metricType,
    shortLabel: metricType,
    unit: "",
    defaultThreshold: 50,
    severeBaseline: 100,
    description: "Parametric environmental metric.",
  };
}

/**
 * Resolves the Severe Breach cutoff (100% payout tier) for a given metric & policy threshold:
 * - RAINFALL_MAX: 100mm (or 1.5x threshold if policy threshold >= 100mm)
 * - TEMP_MAX: 42°C (or threshold + 4°C if policy threshold >= 42°C)
 * - DROUGHT_DAYS: 21 dry days (or 1.5x threshold if policy threshold >= 21 days)
 */
export function getSevereThresholdCutoff(metricType: string, thresholdValue: number): number {
  switch (metricType) {
    case "RAINFALL_MAX":
      return thresholdValue < 100 ? 100 : Math.round(thresholdValue * 1.5);
    case "TEMP_MAX":
      return thresholdValue < 42 ? 42 : Number((thresholdValue + 4).toFixed(1));
    case "DROUGHT_DAYS":
      return thresholdValue < 21 ? 21 : Math.round(thresholdValue * 1.5);
    default:
      return Math.round(thresholdValue * 1.5);
  }
}

export interface TieredPayoutEvaluation {
  tier: SeverityTier;
  payoutPercentage: 0 | 50 | 100;
  payoutAmount: number;
  severeCutoff: number;
  tierLabel: string;
}

/**
 * M04 Tiered Parametric Payout Engine (Bangladesh Micro-Insurance Rules):
 * - Below threshold: 0% payout (NONE)
 * - Moderate Breach (threshold <= observed < severeCutoff): 50% of coverage
 *   e.g. Rainfall 50mm–99mm, Temp 38°C–41.9°C, Drought 14–20 days
 * - Severe Breach (observed >= severeCutoff): 100% of coverage
 *   e.g. Rainfall >= 100mm, Temp >= 42°C, Drought >= 21 days
 */
export function evaluateTieredPayout(
  metricType: string,
  coverageAmount: number,
  observedValue: number,
  thresholdValue: number
): TieredPayoutEvaluation {
  const severeCutoff = getSevereThresholdCutoff(metricType, thresholdValue);

  if (thresholdValue <= 0 || observedValue < thresholdValue) {
    return {
      tier: "NONE",
      payoutPercentage: 0,
      payoutAmount: 0,
      severeCutoff,
      tierLabel: "No Breach (0%)",
    };
  }

  if (observedValue >= severeCutoff) {
    return {
      tier: "SEVERE",
      payoutPercentage: 100,
      payoutAmount: Math.round(coverageAmount * 100) / 100,
      severeCutoff,
      tierLabel: "Severe Breach (100%)",
    };
  }

  return {
    tier: "MODERATE",
    payoutPercentage: 50,
    payoutAmount: Math.round(coverageAmount * 0.5 * 100) / 100,
    severeCutoff,
    tierLabel: "Moderate Breach (50%)",
  };
}

export function calculateParametricPayout(
  coverageAmount: number,
  observedValue: number,
  thresholdValue: number,
  metricType: string = "RAINFALL_MAX"
): number {
  return evaluateTieredPayout(metricType, coverageAmount, observedValue, thresholdValue)
    .payoutAmount;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function validateFarmPayload(input: {
  name?: unknown;
  cropType?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  sizeHectares?: unknown;
}): ValidationResult {
  const errors: Record<string, string> = {};

  if (typeof input.name !== "string" || input.name.trim().length < 2) {
    errors.name = "Farm name must be at least 2 characters.";
  }
  if (typeof input.cropType !== "string" || input.cropType.trim().length < 2) {
    errors.cropType = "Crop type must be at least 2 characters.";
  }

  const lat = Number(input.latitude);
  if (
    input.latitude === "" ||
    input.latitude === null ||
    input.latitude === undefined ||
    Number.isNaN(lat)
  ) {
    errors.latitude = "Latitude must be a valid number.";
  } else if (lat < -90 || lat > 90) {
    errors.latitude = "Latitude must be between -90 and 90 degrees.";
  }

  const lon = Number(input.longitude);
  if (
    input.longitude === "" ||
    input.longitude === null ||
    input.longitude === undefined ||
    Number.isNaN(lon)
  ) {
    errors.longitude = "Longitude must be a valid number.";
  } else if (lon < -180 || lon > 180) {
    errors.longitude = "Longitude must be between -180 and 180 degrees.";
  }

  const size = Number(input.sizeHectares);
  if (
    input.sizeHectares === "" ||
    input.sizeHectares === null ||
    input.sizeHectares === undefined ||
    Number.isNaN(size)
  ) {
    errors.sizeHectares = "Land area must be a valid number.";
  } else if (size <= 0 || size > 100000) {
    errors.sizeHectares = "Land area must be greater than 0.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validatePolicyPayload(input: {
  farmId?: unknown;
  metricType?: unknown;
  thresholdValue?: unknown;
  coverageAmount?: unknown;
  premiumPaid?: unknown;
  durationDays?: unknown;
}): ValidationResult {
  const errors: Record<string, string> = {};

  if (typeof input.farmId !== "string" || input.farmId.trim().length === 0) {
    errors.farmId = "Please select a farm plot.";
  }
  if (typeof input.metricType !== "string" || !isValidMetricType(input.metricType)) {
    errors.metricType = "Metric type must be RAINFALL_MAX, TEMP_MAX, or DROUGHT_DAYS.";
  }

  const threshold = Number(input.thresholdValue);
  if (Number.isNaN(threshold) || threshold <= 0) {
    errors.thresholdValue = "Threshold value must be greater than 0.";
  }

  const coverage = Number(input.coverageAmount);
  if (Number.isNaN(coverage) || coverage <= 0) {
    errors.coverageAmount = "Coverage amount must be greater than ৳0.";
  } else if (coverage > 5000000) {
    errors.coverageAmount = "Coverage amount cannot exceed ৳50,00,000 per micro-policy.";
  }

  const premium = Number(input.premiumPaid);
  if (Number.isNaN(premium) || premium < 0) {
    errors.premiumPaid = "Premium paid must be ৳0 or greater.";
  }

  if (input.durationDays !== undefined) {
    const days = Number(input.durationDays);
    if (Number.isNaN(days) || days < 7 || days > 730) {
      errors.durationDays = "Coverage duration must be between 7 and 730 days.";
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export interface DailyWeatherPoint {
  date: string;
  dayLabel: string;
  rainMm: number;
  tempMaxC: number;
}

export interface ParsedWeatherReading {
  rainMm: number;
  tempMaxC: number;
  droughtDays: number;
  observedDate: string;
  timezone: string;
  forecast7d: DailyWeatherPoint[];
}

function formatDayLabel(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function extractBangladeshDistrict(farmName: string, lat: number, lon: number): string {
  const lower = farmName.toLowerCase();
  for (const preset of BANGLADESH_DISTRICTS) {
    const shortName = preset.name.split(" ")[0].toLowerCase();
    if (lower.includes(shortName)) {
      return preset.name.split(" ")[0];
    }
  }
  // Fallback to nearest preset district by coordinate distance
  let nearest = BANGLADESH_DISTRICTS[0];
  let bestDist = Infinity;
  for (const preset of BANGLADESH_DISTRICTS) {
    const d = Math.hypot(preset.latitude - lat, preset.longitude - lon);
    if (d < bestDist) {
      bestDist = d;
      nearest = preset;
    }
  }
  return bestDist < 1.5 ? nearest.name.split(" ")[0] : "Other BD";
}

export function parseWeatherPayload(rawJson: string): ParsedWeatherReading | null {
  try {
    const parsed = JSON.parse(rawJson) as {
      timezone?: string;
      daily?: {
        time?: string[];
        rain_sum?: number[];
        temperature_2m_max?: number[];
      };
    };

    const times = parsed.daily?.time ?? [];
    const rains = parsed.daily?.rain_sum ?? [];
    const temps = parsed.daily?.temperature_2m_max ?? [];

    if (rains.length === 0 && temps.length === 0) {
      return null;
    }

    const rainMm = Number(rains[0] ?? 0);
    const tempMaxC = Number(temps[0] ?? 0);

    let dryStreak = 0;
    for (const r of rains) {
      if (Number(r) < 1.0) {
        dryStreak += 1;
      } else {
        break;
      }
    }
    const droughtDays = rains.length === 1 ? (rainMm < 3.0 ? 10 : 1) : dryStreak;

    const len = Math.max(times.length, rains.length, temps.length);
    const forecast7d: DailyWeatherPoint[] = [];
    for (let i = 0; i < Math.min(7, len); i++) {
      const dateStr =
        times[i] ??
        new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      forecast7d.push({
        date: dateStr,
        dayLabel: formatDayLabel(dateStr),
        rainMm: Number(Number(rains[i] ?? 0).toFixed(1)),
        tempMaxC: Number(Number(temps[i] ?? 0).toFixed(1)),
      });
    }

    return {
      rainMm: Number(rainMm.toFixed(1)),
      tempMaxC: Number(tempMaxC.toFixed(1)),
      droughtDays,
      observedDate: times[0] ?? new Date().toISOString().split("T")[0],
      timezone: parsed.timezone ?? "Asia/Dhaka",
      forecast7d,
    };
  } catch {
    return null;
  }
}

export function getObservedMetricValue(
  metricType: string,
  reading: ParsedWeatherReading | null
): number | null {
  if (!reading) return null;
  switch (metricType) {
    case "RAINFALL_MAX":
      return reading.rainMm;
    case "TEMP_MAX":
      return reading.tempMaxC;
    case "DROUGHT_DAYS":
      return reading.droughtDays;
    default:
      return reading.rainMm;
  }
}

export type RiskLevel = "HEALTHY" | "AT_RISK" | "BREACHED" | "CLAIMED" | "UNKNOWN";

/**
 * Policy risk bands:
 * - BREACHED (Red): observed >= threshold (ratio >= 1.0)
 * - AT_RISK / Warning (Amber): within 15% of threshold (0.85 <= ratio < 1.0)
 * - HEALTHY / Safe (Green): ratio < 0.85
 */
export function evaluatePolicyRisk(
  policyStatus: string,
  thresholdValue: number,
  observedValue: number | null
): { riskLevel: RiskLevel; ratio: number } {
  if (policyStatus === "CLAIMED") {
    return { riskLevel: "CLAIMED", ratio: 1 };
  }
  if (observedValue === null || thresholdValue <= 0) {
    return { riskLevel: "UNKNOWN", ratio: 0 };
  }
  const ratio = observedValue / thresholdValue;
  if (ratio >= 1) {
    return { riskLevel: "BREACHED", ratio };
  }
  if (ratio >= 0.85) {
    return { riskLevel: "AT_RISK", ratio };
  }
  return { riskLevel: "HEALTHY", ratio };
}
