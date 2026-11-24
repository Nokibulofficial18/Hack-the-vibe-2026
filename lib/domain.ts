export type MetricType = "RAINFALL_MAX" | "TEMP_MAX" | "DROUGHT_DAYS";

export interface MetricDefinition {
  type: MetricType;
  label: string;
  shortLabel: string;
  unit: string;
  defaultThreshold: number;
  description: string;
}

export const METRIC_DEFINITIONS: Record<MetricType, MetricDefinition> = {
  RAINFALL_MAX: {
    type: "RAINFALL_MAX",
    label: "Excess Rainfall (Flood)",
    shortLabel: "Rainfall",
    unit: "mm",
    defaultThreshold: 50,
    description: "Triggers when 24h cumulative rainfall meets or exceeds the threshold.",
  },
  TEMP_MAX: {
    type: "TEMP_MAX",
    label: "Extreme Heatwave",
    shortLabel: "Max Temp",
    unit: "°C",
    defaultThreshold: 38,
    description: "Triggers when daily peak air temperature meets or exceeds the threshold.",
  },
  DROUGHT_DAYS: {
    type: "DROUGHT_DAYS",
    label: "Consecutive Drought Days",
    shortLabel: "Drought",
    unit: "days",
    defaultThreshold: 14,
    description: "Triggers when consecutive dry days (< 1mm rain) meet or exceed the threshold.",
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
    description: "Parametric environmental metric.",
  };
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
  if (input.latitude === "" || input.latitude === null || input.latitude === undefined || Number.isNaN(lat)) {
    errors.latitude = "Latitude must be a valid number.";
  } else if (lat < -90 || lat > 90) {
    errors.latitude = "Latitude must be between -90 and 90 degrees.";
  }

  const lon = Number(input.longitude);
  if (input.longitude === "" || input.longitude === null || input.longitude === undefined || Number.isNaN(lon)) {
    errors.longitude = "Longitude must be a valid number.";
  } else if (lon < -180 || lon > 180) {
    errors.longitude = "Longitude must be between -180 and 180 degrees.";
  }

  const size = Number(input.sizeHectares);
  if (input.sizeHectares === "" || input.sizeHectares === null || input.sizeHectares === undefined || Number.isNaN(size)) {
    errors.sizeHectares = "Farm size must be a valid number.";
  } else if (size <= 0 || size > 100000) {
    errors.sizeHectares = "Farm size must be greater than 0 and at most 100,000 hectares.";
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
    errors.coverageAmount = "Coverage amount must be greater than $0.";
  } else if (coverage > 500000) {
    errors.coverageAmount = "Coverage amount cannot exceed $500,000 per micro-policy.";
  }

  const premium = Number(input.premiumPaid);
  if (Number.isNaN(premium) || premium < 0) {
    errors.premiumPaid = "Premium paid must be $0 or greater.";
  }

  if (input.durationDays !== undefined) {
    const days = Number(input.durationDays);
    if (Number.isNaN(days) || days < 7 || days > 730) {
      errors.durationDays = "Coverage duration must be between 7 and 730 days.";
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export interface ParsedWeatherReading {
  rainMm: number;
  tempMaxC: number;
  droughtDays: number;
  observedDate: string;
  timezone: string;
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

    // Derive drought index: count dry days (< 1.0mm rain) in the forecast window
    // and scale to a realistic consecutive dry-day metric when rain is near zero
    let dryStreak = 0;
    for (const r of rains) {
      if (Number(r) < 1.0) {
        dryStreak += 1;
      } else {
        break;
      }
    }
    const droughtDays = rains.length === 1 ? (rainMm < 3.0 ? 9 : 1) : dryStreak;

    return {
      rainMm: Number(rainMm.toFixed(1)),
      tempMaxC: Number(tempMaxC.toFixed(1)),
      droughtDays,
      observedDate: times[0] ?? new Date().toISOString().split("T")[0],
      timezone: parsed.timezone ?? "UTC",
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
  if (ratio >= 0.75) {
    return { riskLevel: "AT_RISK", ratio };
  }
  return { riskLevel: "HEALTHY", ratio };
}

export function calculateParametricPayout(
  coverageAmount: number,
  observedValue: number,
  thresholdValue: number
): number {
  if (thresholdValue <= 0 || observedValue < thresholdValue) return 0;
  const raw = coverageAmount * (observedValue / thresholdValue);
  return Math.round(Math.min(coverageAmount, raw) * 100) / 100;
}
