import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats currency in Bangladeshi Taka (৳ / BDT) using standard Bangladesh
 * South Asian grouping (e.g., ৳15,000, ৳2,50,000, ৳25,00,000).
 */
export function formatCurrency(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const isWhole = Math.abs(safe - Math.round(safe)) < 0.005;
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(safe);
  return `৳${formatted}`;
}

/**
 * Standard Bangladesh land area conversion constants:
 * 1 Standard Bigha = 33 decimals ≈ 0.3306 Acres ≈ 0.13378 Hectares
 * 1 Acre = 100 decimals ≈ 3.025 Bigha ≈ 0.404686 Hectares
 * 1 Hectare ≈ 2.47105 Acres ≈ 7.47493 Bigha
 */
export const BIGHA_PER_HECTARE = 7.47493;
export const ACRES_PER_HECTARE = 2.47105;
export const BIGHA_PER_ACRE = 3.025;

export function hectaresToBigha(hectares: number): number {
  return Math.round(hectares * BIGHA_PER_HECTARE * 100) / 100;
}

export function hectaresToAcres(hectares: number): number {
  return Math.round(hectares * ACRES_PER_HECTARE * 100) / 100;
}

export function bighaToHectares(bigha: number): number {
  return Math.round((bigha / BIGHA_PER_HECTARE) * 10000) / 10000;
}

export function acresToHectares(acres: number): number {
  return Math.round((acres / ACRES_PER_HECTARE) * 10000) / 10000;
}

export function formatLandArea(sizeHectares: number): string {
  const bigha = hectaresToBigha(sizeHectares);
  const acres = hectaresToAcres(sizeHectares);
  return `${bigha.toFixed(1)} Bigha (${acres.toFixed(2)} Acres)`;
}
