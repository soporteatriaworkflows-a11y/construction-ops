/**
 * monitor-ui.ts — Helpers PUROS de presentación para el panel de monitoreo de precios
 * (V5.2.2a). Módulo NEUTRO server-safe (SIN 'use client'): importable por el Server
 * Component `/catalog/monitoring/page.tsx` y por futuros componentes client de filtros
 * (V5.2.2b). No muta, no toca DB/actions/cron; solo deriva estado y etiquetas legibles.
 *
 * Regla P0 (V5.2.1.1): los helpers compartidos server/client viven aquí, nunca en
 * módulos `'use client'`. El `import type` es solo de tipos (se borra en runtime) → no
 * crea acoplamiento server/client.
 */
import type { MonitorTargetView } from '@/server/pricing/monitor';

export type MonitorTargetStatusKey = 'paused' | 'error' | 'overdue' | 'healthy';
export type MonitorTone = 'success' | 'warn' | 'danger' | 'muted';

export interface MonitorTargetStatus {
  key: MonitorTargetStatusKey;
  label: string;
  tone: MonitorTone;
}

/**
 * Estado operativo de un target a partir de campos reales existentes. Orden de
 * prioridad: pausado → con error → atrasado → saludable. PURO.
 */
export function getMonitorTargetStatus(
  t: Pick<MonitorTargetView, 'enabled' | 'hasFailureAlert' | 'isOverdue' | 'consecutiveFailures'>,
): MonitorTargetStatus {
  if (!t.enabled) return { key: 'paused', label: 'Pausada', tone: 'muted' };
  if (t.hasFailureAlert || t.consecutiveFailures > 0) {
    return { key: 'error', label: `Requiere atención (${t.consecutiveFailures} fallo${t.consecutiveFailures === 1 ? '' : 's'})`, tone: 'danger' };
  }
  if (t.isOverdue) return { key: 'overdue', label: 'Atrasada', tone: 'warn' };
  return { key: 'healthy', label: 'Saludable', tone: 'success' };
}

/** Días calendario entre `iso` y `now` (negativo = futuro). null si fecha ausente/ inválida. */
export function relativeDays(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const startOfDay = (ms: number) => Math.floor(ms / 86_400_000);
  return startOfDay(now.getTime()) - startOfDay(t);
}

/** Etiqueta humana de la ÚLTIMA revisión (pasado). Fallback legible si no hay dato. */
export function formatLastChecked(iso: string | null | undefined, now: Date = new Date()): string {
  const d = relativeDays(iso, now);
  if (d === null) return 'Sin revisión registrada';
  if (d <= 0) return 'Hoy';
  if (d === 1) return 'Ayer';
  return `Hace ${d} días`;
}

/** Etiqueta humana de la PRÓXIMA revisión (futuro). Fallback legible si no hay dato. */
export function formatNextCheck(iso: string | null | undefined, now: Date = new Date()): string {
  const d = relativeDays(iso, now);
  if (d === null) return 'Sin próxima revisión';
  if (d > 0) return 'Pendiente (atrasada)'; // next_check_at en el pasado ⇒ ya tocaba
  if (d === 0) return 'Hoy';
  if (d === -1) return 'Mañana';
  return `En ${Math.abs(d)} días`;
}

/* ── V5.2.2b: filtros por estado (server-side, sin backend) ─────────────────── */

/** Estados de filtro válidos (1:1 con las keys de estado + 'all'). */
export type MonitorFilterStatus = 'all' | MonitorTargetStatusKey;

const FILTER_VALUES: readonly MonitorFilterStatus[] = ['all', 'healthy', 'overdue', 'error', 'paused'];

/** Normaliza un searchParam (string | string[] | undefined) a un filtro válido; fallback 'all'. */
export function parseMonitorStatus(raw: string | string[] | null | undefined): MonitorFilterStatus {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (FILTER_VALUES as readonly string[]).includes(v ?? '') ? (v as MonitorFilterStatus) : 'all';
}

/** Etiquetas humanas de cada filtro (para pills/empty states). */
export const MONITOR_FILTER_LABELS: Record<MonitorFilterStatus, string> = {
  all: 'Todos',
  healthy: 'Saludables',
  overdue: 'Atrasados',
  error: 'Con error',
  paused: 'Pausados',
};

type FilterableTarget = Parameters<typeof getMonitorTargetStatus>[0];

/** Filtra targets por estado. PURA y tolerante (status inválido ⇒ todos). */
export function filterTargetsByStatus<T extends FilterableTarget>(targets: readonly T[], status: MonitorFilterStatus): T[] {
  const list = targets ?? [];
  if (status === 'all') return [...list];
  return list.filter((t) => getMonitorTargetStatus(t).key === status);
}

/** Conteo por estado (+ total) para mostrar en las pills. PURA y tolerante. */
export function getMonitorStatusCounts(targets: readonly FilterableTarget[]): Record<MonitorFilterStatus, number> {
  const counts: Record<MonitorFilterStatus, number> = { all: 0, healthy: 0, overdue: 0, error: 0, paused: 0 };
  for (const t of targets ?? []) {
    counts.all += 1;
    counts[getMonitorTargetStatus(t).key] += 1;
  }
  return counts;
}
