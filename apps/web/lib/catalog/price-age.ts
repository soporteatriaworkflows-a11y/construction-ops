/**
 * price-age.ts — Antigüedad de precio (heurística UI, NO "vencido" autoritativo).
 * Módulo PURO server-safe (SIN 'use client'): se usa tanto en el page server-side de
 * /catalog como en el explorer client-side. Tolerante a null/undefined/fecha inválida.
 *
 * P0 (V5.2.1.1): estos helpers vivían en catalog-explorer.tsx ('use client'); al
 * importarlos/llamarlos desde el Server Component (page.tsx) se convertían en una
 * referencia de cliente y reventaban el render de /catalog en runtime. Aquí quedan
 * en un módulo neutro para que el servidor pueda invocarlos de verdad.
 */

/** Umbral UI para marcar un precio como "antiguo / requiere revisión". */
export const PRICE_OLD_THRESHOLD_DAYS = 90;

/** Días desde `priceDate` (tolerante). `null` si no hay fecha o es inválida. */
export function priceAgeDays(priceDate: string | null | undefined, now: Date = new Date()): number | null {
  if (!priceDate) return null;
  const t = Date.parse(priceDate);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

/** ¿El precio supera el umbral de antigüedad? Tolerante a null/inválido. */
export function isOldPrice(priceDate: string | null | undefined): boolean {
  const d = priceAgeDays(priceDate);
  return d !== null && d >= PRICE_OLD_THRESHOLD_DAYS;
}
