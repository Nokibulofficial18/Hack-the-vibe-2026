import prisma from "./prisma";
import { parseWeatherPayload, type ParsedWeatherReading } from "./domain";

export interface OpenMeteoPayload {
  latitude?: number;
  longitude?: number;
  timezone?: string;
  daily: {
    time: string[];
    rain_sum: number[];
    temperature_2m_max: number[];
  };
}

export interface CachedWeatherEntry {
  id: string;
  latitude: number;
  longitude: number;
  data: OpenMeteoPayload;
  reading: ParsedWeatherReading;
  fetchedAt: Date;
  ageMinutes: number;
}

const COORD_TOLERANCE = 0.01;

export function isValidOpenMeteoPayload(payload: unknown): payload is OpenMeteoPayload {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  if (!record.daily || typeof record.daily !== "object") return false;

  const daily = record.daily as Record<string, unknown>;
  const hasTime = Array.isArray(daily.time) && daily.time.length > 0;
  const hasRain =
    Array.isArray(daily.rain_sum) &&
    daily.rain_sum.length > 0 &&
    daily.rain_sum.every((v) => typeof v === "number" && Number.isFinite(v));
  const hasTemp =
    Array.isArray(daily.temperature_2m_max) &&
    daily.temperature_2m_max.length > 0 &&
    daily.temperature_2m_max.every((v) => typeof v === "number" && Number.isFinite(v));

  return hasTime && hasRain && hasTemp;
}

export async function saveWeatherToCache(
  latitude: number,
  longitude: number,
  payload: OpenMeteoPayload
): Promise<{ id: string; fetchedAt: Date }> {
  const saved = await prisma.weatherCache.create({
    data: {
      latitude,
      longitude,
      weatherData: JSON.stringify(payload),
      fetchedAt: new Date(),
    },
    select: { id: true, fetchedAt: true },
  });

  return saved;
}

export async function getWeatherFromCache(
  latitude: number,
  longitude: number
): Promise<CachedWeatherEntry | null> {
  const candidates = await prisma.weatherCache.findMany({
    where: {
      latitude: { gte: latitude - COORD_TOLERANCE, lte: latitude + COORD_TOLERANCE },
      longitude: { gte: longitude - COORD_TOLERANCE, lte: longitude + COORD_TOLERANCE },
    },
    orderBy: { fetchedAt: "desc" },
    take: 5,
  });

  for (const row of candidates) {
    try {
      const parsed: unknown = JSON.parse(row.weatherData);
      if (!isValidOpenMeteoPayload(parsed)) continue;
      const reading = parseWeatherPayload(row.weatherData);
      if (!reading) continue;

      const ageMs = Math.max(0, Date.now() - row.fetchedAt.getTime());
      return {
        id: row.id,
        latitude: row.latitude,
        longitude: row.longitude,
        data: parsed,
        reading,
        fetchedAt: row.fetchedAt,
        ageMinutes: Math.round((ageMs / 60000) * 10) / 10,
      };
    } catch {
      // Skip any corrupted cache row and continue to next valid snapshot
    }
  }

  return null;
}
