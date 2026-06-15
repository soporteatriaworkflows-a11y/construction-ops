/**
 * visual-metrics.ts — Helpers PUROS de presentación del dashboard
 * (DASHBOARD_VISUAL_DEEP_V1). NO calcula finanzas: solo deriva proporciones
 * (anchos de barra 0..100) a partir de valores YA calculados por cost-domain,
 * para micro-gráficos. Sin DB, sin React.
 */

/** Convierte a número finito ≥ 0; inválido → 0. */
function num(v: string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Proporción visual costo directo / indirecto sobre el total (para una barra de
 * composición). Devuelve porcentajes enteros que suman ~100 (o 0/0 si no hay total).
 */
export function costSplitPct(
  directCost: string | null | undefined,
  totalBudget: string | null | undefined,
): { directPct: number; indirectPct: number } {
  const d = num(directCost);
  const t = num(totalBudget);
  if (t <= 0) return { directPct: 0, indirectPct: 0 };
  const directPct = Math.min(100, Math.max(0, Math.round((d / t) * 100)));
  return { directPct, indirectPct: 100 - directPct };
}

/** Cuenta de pendientes/alertas no nulos > 0 (para resúmenes de "qué requiere acción"). */
export function countActionable(values: Array<number | null | undefined>): number {
  return values.reduce<number>((acc, v) => acc + (typeof v === 'number' && v > 0 ? 1 : 0), 0);
}
