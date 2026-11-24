import {
  getWeatherFromCache,
  isValidOpenMeteoPayload,
  saveWeatherToCache,
  type OpenMeteoPayload,
} from "./cache";
import { parseWeatherPayload, type ParsedWeatherReading } from "./domain";

export const WEATHER_TIMEOUT_MS = 3500;
export const WEATHER_MAX_RETRIES = 3;
export const WEATHER_CACHE_TTL_MINUTES = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_CALLS = 30;

export interface WeatherSimulateOptions {
  simulateTimeout?: boolean;
  simulateMalformedJson?: boolean;
  forceOffline?: boolean;
  /** Optional overrides primarily for testing; defaults strictly to 3500ms and 3 retries */
  timeoutMs?: number;
  maxRetries?: number;
}

export type AttemptStatus =
  | "SUCCESS"
  | "TIMEOUT"
  | "MALFORMED_JSON"
  | "HTTP_ERROR"
  | "NETWORK_ERROR"
  | "RATE_LIMITED"
  | "OFFLINE_FORCED";

export interface ResilienceAttemptLog {
  attempt: number;
  status: AttemptStatus;
  durationMs: number;
  backoffMs: number;
  message: string;
  timestamp: string;
}

export interface ResilientWeatherResult {
  data: OpenMeteoPayload;
  reading: ParsedWeatherReading;
  source: "LIVE_API" | "CACHE_FALLBACK";
  attempts: number;
  totalDurationMs: number;
  fetchedAt: string;
  cacheAgeMinutes: number | null;
  warningBanner: string | null;
  errorSummary: string | null;
  rateLimitRemaining: number;
  attemptLogs: ResilienceAttemptLog[];
}

// In-memory sliding window rate-limit guard to protect outbound Open-Meteo quota
const outboundTimestamps: number[] = [];

function checkRateLimit(): { allowed: boolean; remaining: number } {
  const now = Date.now();
  while (outboundTimestamps.length > 0 && now - outboundTimestamps[0] > RATE_LIMIT_WINDOW_MS) {
    outboundTimestamps.shift();
  }
  if (outboundTimestamps.length >= RATE_LIMIT_MAX_CALLS) {
    return { allowed: false, remaining: 0 };
  }
  outboundTimestamps.push(now);
  return {
    allowed: true,
    remaining: Math.max(0, RATE_LIMIT_MAX_CALLS - outboundTimestamps.length),
  };
}

function getRateLimitRemaining(): number {
  const now = Date.now();
  while (outboundTimestamps.length > 0 && now - outboundTimestamps[0] > RATE_LIMIT_WINDOW_MS) {
    outboundTimestamps.shift();
  }
  return Math.max(0, RATE_LIMIT_MAX_CALLS - outboundTimestamps.length);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeExponentialBackoffMs(attempt: number): number {
  const baseMs = Math.pow(2, attempt) * 100; // 200ms after attempt 1, 400ms after attempt 2
  const jitterMs = Math.floor(Math.random() * 65);
  return baseMs + jitterMs;
}

/**
 * Simulates an unresponsive upstream socket that respects AbortController cancellation,
 * ensuring the exact 3.5-second AbortController timeout path is genuinely exercised.
 */
function waitForAbortSignal(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const onAbort = () => {
      const abortError = new Error("API_TIMEOUT_3500MS");
      abortError.name = "AbortError";
      reject(abortError);
    };

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function buildFallbackWarning(lastStatus: AttemptStatus, cacheAgeMinutes: number): string {
  const ageLabel =
    cacheAgeMinutes < 1 ? "under 1 min old" : `${cacheAgeMinutes.toFixed(1)} min old`;

  switch (lastStatus) {
    case "TIMEOUT":
      return `External API timed out. Displaying cached weather snapshot (${ageLabel}).`;
    case "MALFORMED_JSON":
      return `External API returned malformed JSON payload. Dirty data rejected; displaying cached weather snapshot (${ageLabel}).`;
    case "OFFLINE_FORCED":
      return `Offline cache mode active. Displaying verified cached weather snapshot (${ageLabel}).`;
    case "RATE_LIMITED":
      return `Outbound weather API rate limit reached. Displaying cached weather snapshot (${ageLabel}).`;
    default:
      return `External weather service unreachable after retries. Displaying cached weather snapshot (${ageLabel}).`;
  }
}

/**
 * Advanced Challenge A06: Resilient External Weather Fetch Pipeline
 *
 * 1. Strict 3.5-second timeout via AbortController.
 * 2. Exponential backoff retry loop with jitter (up to 3 attempts).
 * 3. Strict payload validation rejecting malformed/dirty JSON before cache writes.
 * 4. Automatic fallback to Prisma WeatherCache table if all retries fail.
 */
export async function fetchWeatherWithResilience(
  latitude: number,
  longitude: number,
  simulateOptions: WeatherSimulateOptions = {}
): Promise<ResilientWeatherResult> {
  const startedAt = Date.now();
  const timeoutMs = simulateOptions.timeoutMs ?? WEATHER_TIMEOUT_MS;
  const maxRetries = Math.max(1, Math.min(5, simulateOptions.maxRetries ?? WEATHER_MAX_RETRIES));
  const attemptLogs: ResilienceAttemptLog[] = [];

  // Option: Force Offline / Cache Mode (skips external network call)
  if (simulateOptions.forceOffline) {
    attemptLogs.push({
      attempt: 1,
      status: "OFFLINE_FORCED",
      durationMs: 0,
      backoffMs: 0,
      message: "Force Offline / Cache Mode enabled — bypassed external Open-Meteo API.",
      timestamp: new Date().toISOString(),
    });

    const cached = await getWeatherFromCache(latitude, longitude);
    if (!cached) {
      throw new Error("OFFLINE_MODE_AND_CACHE_EMPTY");
    }

    return {
      data: cached.data,
      reading: cached.reading,
      source: "CACHE_FALLBACK",
      attempts: 1,
      totalDurationMs: Date.now() - startedAt,
      fetchedAt: cached.fetchedAt.toISOString(),
      cacheAgeMinutes: cached.ageMinutes,
      warningBanner: buildFallbackWarning("OFFLINE_FORCED", cached.ageMinutes),
      errorSummary: "OFFLINE_FORCED",
      rateLimitRemaining: getRateLimitRemaining(),
      attemptLogs,
    };
  }

  let lastStatus: AttemptStatus = "NETWORK_ERROR";
  let lastErrorMessage = "Unknown upstream failure";

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const attemptStart = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Outbound Rate-Limiting Guard
      const rateCheck = checkRateLimit();
      if (!rateCheck.allowed) {
        clearTimeout(timeoutId);
        lastStatus = "RATE_LIMITED";
        lastErrorMessage = `Rate limit exceeded (${RATE_LIMIT_MAX_CALLS} requests / 60s window).`;
        attemptLogs.push({
          attempt,
          status: "RATE_LIMITED",
          durationMs: Date.now() - attemptStart,
          backoffMs: 0,
          message: lastErrorMessage,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      // Fault Injection 1: Simulate API Timeout (genuinely waits for the 3.5s AbortController)
      if (simulateOptions.simulateTimeout) {
        await waitForAbortSignal(controller.signal);
      }

      // Fault Injection 2: Simulate Malformed / Corrupted JSON Response
      if (simulateOptions.simulateMalformedJson) {
        const corruptedRawText = "{ invalid: true }";
        let parsedCorrupted: unknown;
        try {
          parsedCorrupted = JSON.parse(corruptedRawText);
        } catch {
          throw new Error("MALFORMED_JSON_SYNTAX: Unexpected token in Open-Meteo response");
        }
        if (!isValidOpenMeteoPayload(parsedCorrupted)) {
          throw new Error(
            "MALFORMED_JSON_SCHEMA: Payload missing daily.rain_sum or daily.temperature_2m_max"
          );
        }
      }

      // Live Open-Meteo Forecast Request
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=rain_sum,temperature_2m_max&timezone=auto&forecast_days=7`;
      const response = await fetch(url, {
        signal: controller.signal,
        cache: "no-store",
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP_ERROR_${response.status}`);
      }

      const rawText = await response.text();
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawText);
      } catch {
        throw new Error("MALFORMED_JSON_SYNTAX: Failed to parse Open-Meteo JSON response");
      }

      if (!isValidOpenMeteoPayload(parsedJson)) {
        throw new Error(
          "MALFORMED_JSON_SCHEMA: Upstream payload failed meteorological schema validation"
        );
      }

      const reading = parseWeatherPayload(JSON.stringify(parsedJson));
      if (!reading) {
        throw new Error("MALFORMED_JSON_SCHEMA: Unable to extract daily weather metrics");
      }

      // Persist verified payload to WeatherCache table
      const saved = await saveWeatherToCache(latitude, longitude, parsedJson);
      const durationMs = Date.now() - attemptStart;

      attemptLogs.push({
        attempt,
        status: "SUCCESS",
        durationMs,
        backoffMs: 0,
        message: `HTTP 200 OK from Open-Meteo (${reading.rainMm}mm rain, ${reading.tempMaxC}°C max). Cache updated.`,
        timestamp: new Date().toISOString(),
      });

      return {
        data: parsedJson,
        reading,
        source: "LIVE_API",
        attempts: attempt,
        totalDurationMs: Date.now() - startedAt,
        fetchedAt: saved.fetchedAt.toISOString(),
        cacheAgeMinutes: 0,
        warningBanner: null,
        errorSummary: null,
        rateLimitRemaining: rateCheck.remaining,
        attemptLogs,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - attemptStart;
      const errMsg = error instanceof Error ? error.message : String(error);
      const isAbort =
        (error instanceof Error && error.name === "AbortError") ||
        errMsg.includes("API_TIMEOUT") ||
        errMsg.includes("aborted");

      if (isAbort) {
        lastStatus = "TIMEOUT";
        lastErrorMessage = `Request aborted after ${timeoutMs}ms strict AbortController timeout window.`;
      } else if (errMsg.startsWith("MALFORMED_JSON")) {
        lastStatus = "MALFORMED_JSON";
        lastErrorMessage = errMsg;
      } else if (errMsg.startsWith("HTTP_ERROR_")) {
        lastStatus = "HTTP_ERROR";
        lastErrorMessage = `Open-Meteo returned ${errMsg}.`;
      } else {
        lastStatus = "NETWORK_ERROR";
        lastErrorMessage = `Network failure: ${errMsg}`;
      }

      const willRetry = attempt < maxRetries;
      const backoffMs = willRetry ? computeExponentialBackoffMs(attempt) : 0;

      attemptLogs.push({
        attempt,
        status: lastStatus,
        durationMs,
        backoffMs,
        message: willRetry
          ? `${lastErrorMessage} Retrying after ${backoffMs}ms exponential backoff...`
          : `${lastErrorMessage} Max retries (${maxRetries}) exhausted — activating WeatherCache fallback.`,
        timestamp: new Date().toISOString(),
      });

      if (willRetry) {
        await sleep(backoffMs);
      }
    }
  }

  // Fallback to WeatherCache table on final failure
  const cached = await getWeatherFromCache(latitude, longitude);
  if (cached) {
    return {
      data: cached.data,
      reading: cached.reading,
      source: "CACHE_FALLBACK",
      attempts: attemptLogs.length,
      totalDurationMs: Date.now() - startedAt,
      fetchedAt: cached.fetchedAt.toISOString(),
      cacheAgeMinutes: cached.ageMinutes,
      warningBanner: buildFallbackWarning(lastStatus, cached.ageMinutes),
      errorSummary: lastErrorMessage,
      rateLimitRemaining: getRateLimitRemaining(),
      attemptLogs,
    };
  }

  throw new Error(`API_AND_CACHE_FAILED: ${lastErrorMessage}`);
}
