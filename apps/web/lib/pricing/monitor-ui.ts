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
import type { MonitorTargetView, MonitorRunView, MonitorRunStatus } from '@/server/pricing/monitor';

/** Counters de una corrida (derivado de la vista; el tipo no está en el barrel). */
type MonitorRunCounters = NonNullable<MonitorRunView['counters']>;

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

/* ── V5.2.2c: lectura de corridas (runs). PURAS, sin backend ─────────────────── */

/** Etiqueta humana del estado de una corrida. */
export function getRunStatusLabel(status: MonitorRunStatus | string | null | undefined): string {
  switch (status) {
    case 'running':
      return 'En curso';
    case 'completed':
      return 'Completada';
    case 'partial':
      return 'Parcial';
    case 'failed':
      return 'Fallida';
    default:
      return 'Desconocido';
  }
}

/** Tono de la corrida (reutiliza MonitorTone: success/warn/danger/muted). */
export function getRunStatusTone(status: MonitorRunStatus | string | null | undefined): MonitorTone {
  switch (status) {
    case 'completed':
      return 'success';
    case 'partial':
      return 'warn';
    case 'failed':
      return 'danger';
    default:
      return 'muted'; // running / desconocido
  }
}

/** Duración derivada de una corrida (startedAt→finishedAt). Tolerante. */
export function formatRunDuration(
  startedAt: string | null | undefined,
  finishedAt: string | null | undefined,
  status?: MonitorRunStatus | string | null,
): string {
  const start = startedAt ? Date.parse(startedAt) : NaN;
  const end = finishedAt ? Date.parse(finishedAt) : NaN;
  if (!Number.isFinite(end)) return status === 'running' ? 'En curso' : 'Sin duración';
  if (!Number.isFinite(start)) return 'Sin duración';
  const secs = Math.max(0, Math.round((end - start) / 1000));
  if (secs < 60) return `Duró ${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return s === 0 ? `Duró ${m}m` : `Duró ${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `Duró ${h}h ${m % 60}m`;
}

/** Tiempo relativo del inicio de una corrida ("Hace 3 min/2 h", "Ayer", "Hace N días"). Tolerante. */
export function formatRunStartedRelative(startedAt: string | null | undefined, now: Date = new Date()): string {
  if (!startedAt) return 'Sin fecha';
  const t = Date.parse(startedAt);
  if (!Number.isFinite(t)) return 'Sin fecha';
  const mins = Math.max(0, Math.round((now.getTime() - t) / 60000));
  if (mins < 1) return 'Hace instantes';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Ayer';
  return `Hace ${days} días`;
}

export interface RunCounterChip {
  key: keyof MonitorRunCounters;
  label: string;
  value: number;
}

/** Counters de una corrida como chips etiquetados (omite ceros salvo "Revisados"). PURA y tolerante. */
export function summarizeRunCounters(counters: Partial<MonitorRunCounters> | null | undefined): RunCounterChip[] {
  const c = counters ?? {};
  const defs: { key: keyof MonitorRunCounters; label: string }[] = [
    { key: 'checked', label: 'Revisados' },
    { key: 'unchanged', label: 'Sin cambio' },
    { key: 'changed', label: 'Cambiados' },
    { key: 'pendingCreated', label: 'Pendientes' },
    { key: 'failed', label: 'Fallidos' },
  ];
  return defs
    .map((d) => ({ key: d.key, label: d.label, value: c[d.key] ?? 0 }))
    .filter((chip) => chip.key === 'checked' || chip.value > 0);
}

/** Primera corrida reciente con incidencia (failed/partial o con errorSummary). null si ninguna. */
export function getLatestProblemRun<T extends Pick<MonitorRunView, 'status' | 'errorSummary'>>(
  runs: readonly T[] | null | undefined,
): T | null {
  for (const r of runs ?? []) {
    if (r.status === 'failed' || r.status === 'partial' || (r.errorSummary ?? '') !== '') return r;
  }
  return null;
}

/* ── V5.4.1: countdown real de próxima revisión (dashboard). PURO, sin backend ── */

/**
 * Tiempo restante hasta `nextReviewAt`, en formato humano. PURO y tolerante:
 *  - null/undefined → "Sin revisión programada"
 *  - fecha inválida → "Sin revisión programada"
 *  - <= now → "Atrasada"
 *  - futuro → "en 18m" / "en 2h 14m" / "en 1d 3h"
 * Request-time/server-rendered: NO usa setInterval ni estado.
 */
export function formatTimeUntil(nextReviewAt: string | null | undefined, now: Date = new Date()): string {
  if (!nextReviewAt) return 'Sin revisión programada';
  const t = Date.parse(nextReviewAt);
  if (!Number.isFinite(t)) return 'Sin revisión programada';
  const diffMs = t - now.getTime();
  if (diffMs <= 0) return 'Atrasada';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `en ${Math.max(1, mins)}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    const m = mins % 60;
    return m === 0 ? `en ${hrs}h` : `en ${hrs}h ${m}m`;
  }
  const days = Math.floor(hrs / 24);
  const h = hrs % 24;
  return h === 0 ? `en ${days}d` : `en ${days}d ${h}h`;
}

/** Alias semántico para el countdown del dashboard (misma lógica pura que formatTimeUntil). */
export const formatCountdown = formatTimeUntil;
