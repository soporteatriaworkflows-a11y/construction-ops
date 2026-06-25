/**
 * quote-readiness.ts — Semáforo de "cotización lista para exportar"
 * (APU_QUOTE_READINESS_SEMAPHORE_V1). PURO, server-safe, sin DB, sin recalcular
 * finanzas. Consume el read-model existente (getEstimateDetail) y NO bloquea
 * export por sí mismo: solo clasifica pendientes por severidad.
 *
 * Honestidad de datos: lo que el read-model NO expone hoy (vínculo ítem↔APU,
 * completitud del APU por ítem, verificación de export cliente) se marca como
 * INFORMATIVO "pendiente de integración", NUNCA se inventa ni bloquea.
 */
import type {
  BoqItemView,
  ChapterSummary,
  DecimalString,
  EstimateSummary,
  EstimateVersionStatus,
  Uuid,
} from '@/lib/contracts/read-model';
import type { ApuLibraryItem } from '@/lib/apu-library/types';
import { computeApuCompleteness } from '@/lib/apu-library/completeness';

export type QuoteReadinessStatus = 'ready' | 'review' | 'blocked';
export type QuoteIssueSeverity = 'critical' | 'warning' | 'info';
/** Agrupación temática del pendiente (para la UI). */
export type QuoteIssueGroup = 'boq' | 'pricing' | 'apu' | 'aiu' | 'export';

export interface QuoteIssue {
  severity: QuoteIssueSeverity;
  group: QuoteIssueGroup;
  code: string;
  message: string;
  /** Conteo asociado (p. ej. nº de ítems sin precio), si aplica. */
  count?: number;
}

export interface QuoteReadinessCounts {
  chapters: number;
  items: number;
  emptyChapters: number;
  itemsWithoutQuantity: number;
  itemsWithoutPrice: number;
  /** Ítems con APU vinculado. */
  itemsWithApu: number;
  /** Ítems sin APU vinculado (informativo: no se sabe si lo requieren). */
  itemsWithoutApu: number;
  /** APU vinculados con issues críticos de biblioteca. */
  apusWithCriticalIssues: number;
  critical: number;
  warnings: number;
  info: number;
}

export interface QuoteReadiness {
  status: QuoteReadinessStatus;
  label: string;
  /** Indicativo 0–100 (NO financiero), para barra/tono. */
  score: number;
  criticalIssues: QuoteIssue[];
  warnings: QuoteIssue[];
  info: QuoteIssue[];
  counts: QuoteReadinessCounts;
}

export const READINESS_LABELS: Record<QuoteReadinessStatus, string> = {
  ready: 'Listo para exportar',
  review: 'Requiere revisión',
  blocked: 'Incompleto / bloqueado',
};

function le0(v: DecimalString | null | undefined): boolean {
  const n = Number(v ?? '0');
  return !Number.isFinite(n) || n <= 0;
}

export interface QuoteReadinessInput {
  estimate: EstimateSummary;
  chapters: readonly ChapterSummary[];
  items: readonly BoqItemView[];
  /** Estado de la versión (issued/approved/archived se consideran finalizados). */
  status?: EstimateVersionStatus;
  /**
   * APU_QUOTE_READINESS_INTEGRATION_V2: APU de la biblioteca por id (de `listApus`).
   * Si se provee, se evalúa la completitud del APU vinculado por ítem. Si se omite,
   * la integración APU se degrada a informativo (compat V1).
   */
  apusById?: Map<Uuid, ApuLibraryItem>;
}

/** Etiqueta corta de un grupo (≤3 ítems) para el mensaje agregado. */
function sampleCodes(codes: string[], max = 3): string {
  const shown = codes.slice(0, max).join(', ');
  return codes.length > max ? `${shown}…` : shown;
}

/**
 * Calcula el estado de readiness de una cotización a partir del read-model.
 * PURA. No bloquea export; solo clasifica.
 */
export function computeQuoteReadiness(input: QuoteReadinessInput): QuoteReadiness {
  const { estimate, chapters, items, apusById } = input;
  const status = input.status ?? estimate.status;

  const criticalIssues: QuoteIssue[] = [];
  const warnings: QuoteIssue[] = [];
  const info: QuoteIssue[] = [];

  // --- BOQ / cantidades ---
  if (chapters.length === 0) {
    criticalIssues.push({ severity: 'critical', group: 'boq', code: 'no_chapters', message: 'El presupuesto no tiene capítulos' });
  }
  const emptyChapters = chapters.filter((c) => c.itemCount === 0);
  if (emptyChapters.length > 0) {
    criticalIssues.push({
      severity: 'critical', group: 'boq', code: 'empty_chapter',
      message: `${emptyChapters.length} capítulo(s) sin ítems`, count: emptyChapters.length,
    });
  }
  const itemsWithoutQuantity = items.filter((i) => le0(i.quantity)).length;
  if (itemsWithoutQuantity > 0) {
    criticalIssues.push({
      severity: 'critical', group: 'boq', code: 'item_no_quantity',
      message: `${itemsWithoutQuantity} ítem(s) sin cantidad`, count: itemsWithoutQuantity,
    });
  }
  if (chapters.length > 0 && items.length === 0) {
    warnings.push({ severity: 'warning', group: 'boq', code: 'no_items', message: 'El presupuesto no tiene ítems' });
  }

  // --- Precios ---
  const itemsWithoutPrice = items.filter((i) => le0(i.unitPrice)).length;
  if (itemsWithoutPrice > 0) {
    criticalIssues.push({
      severity: 'critical', group: 'pricing', code: 'item_no_price',
      message: `${itemsWithoutPrice} ítem(s) sin precio unitario`, count: itemsWithoutPrice,
    });
  }

  // --- AIU ---
  const aiuZero = le0(estimate.administration) && le0(estimate.contingency) && le0(estimate.utility);
  const finalized = status === 'issued' || status === 'approved' || status === 'archived';
  if (aiuZero && !finalized && !le0(estimate.directCost)) {
    criticalIssues.push({ severity: 'critical', group: 'aiu', code: 'aiu_missing', message: 'AIU sin configurar' });
  }

  // --- APU (integración V2) ---
  let itemsWithApu = 0;
  let itemsWithoutApu = 0;
  let apusWithCriticalIssues = 0;
  if (apusById) {
    // Agrupar ítems por APU vinculado (para resumir por APU, no por ítem).
    const itemsByApu = new Map<Uuid, string[]>();
    for (const it of items) {
      if (it.apuTemplateId) {
        itemsWithApu += 1;
        const arr = itemsByApu.get(it.apuTemplateId) ?? [];
        arr.push(it.code);
        itemsByApu.set(it.apuTemplateId, arr);
      } else {
        itemsWithoutApu += 1;
      }
    }
    for (const [apuId, codes] of itemsByApu) {
      const apu = apusById.get(apuId);
      if (!apu) {
        info.push({ severity: 'info', group: 'apu', code: 'apu_not_found', message: `APU vinculado fuera de alcance (ítems ${sampleCodes(codes)})` });
        continue;
      }
      const comp = computeApuCompleteness(apu);
      const ref = `${apu.name} · ítems ${sampleCodes(codes)}`;
      if (comp.state === 'archived') {
        apusWithCriticalIssues += 1;
        criticalIssues.push({ severity: 'critical', group: 'apu', code: 'apu_archived', message: `APU vinculado archivado: ${ref}`, count: codes.length });
      } else {
        const apuCriticals = comp.issues.filter((i) => i.severity === 'critical');
        if (apuCriticals.length > 0) {
          apusWithCriticalIssues += 1;
          const first = apuCriticals[0];
          criticalIssues.push({
            severity: 'critical', group: 'apu', code: `apu_${first?.code ?? 'incomplete'}`,
            message: `APU incompleto: ${ref} (${first?.message ?? 'pendiente'})`, count: codes.length,
          });
        } else if (comp.state === 'review') {
          warnings.push({ severity: 'warning', group: 'apu', code: 'apu_review', message: `APU vinculado requiere revisión: ${ref}`, count: codes.length });
        }
      }
    }
    if (itemsWithoutApu > 0) {
      info.push({
        severity: 'info', group: 'apu', code: 'items_without_apu',
        message: `${itemsWithoutApu} ítem(s) sin APU vinculado (verifica si requieren análisis)`, count: itemsWithoutApu,
      });
    }
    // Override por componente (heredado/manual) por ítem: requiere detalle APU; pendiente.
    info.push({ severity: 'info', group: 'apu', code: 'apu_override_detail_pending', message: 'Detalle de overrides (consumo/desperdicio/rendimiento) por ítem: pendiente de integración' });
  } else {
    itemsWithoutApu = items.length;
    info.push({ severity: 'info', group: 'apu', code: 'apu_link_pending', message: 'Vínculo ítem↔APU y completitud de APU: pendiente de integración' });
  }

  // --- Export ---
  info.push({ severity: 'info', group: 'export', code: 'export_client_unverified', message: 'Verifica el export para cliente (privacidad) antes de enviar' });

  const counts: QuoteReadinessCounts = {
    chapters: chapters.length,
    items: items.length,
    emptyChapters: emptyChapters.length,
    itemsWithoutQuantity,
    itemsWithoutPrice,
    itemsWithApu,
    itemsWithoutApu,
    apusWithCriticalIssues,
    critical: criticalIssues.length,
    warnings: warnings.length,
    info: info.length,
  };

  const statusOut: QuoteReadinessStatus =
    criticalIssues.length > 0 ? 'blocked' : warnings.length > 0 ? 'review' : 'ready';

  // Score indicativo (no financiero): penaliza críticos y advertencias.
  const score = Math.max(0, Math.min(100, 100 - criticalIssues.length * 20 - warnings.length * 8));

  return { status: statusOut, label: READINESS_LABELS[statusOut], score, criticalIssues, warnings, info, counts };
}

/** Mensaje corto para la alerta junto al export, según el estado. PURA. */
export function readinessExportMessage(status: QuoteReadinessStatus): string {
  switch (status) {
    case 'ready':
      return 'Cotización lista para exportar.';
    case 'review':
      return 'Puedes exportar, pero hay advertencias.';
    case 'blocked':
      return 'Hay pendientes críticos. Revisa antes de exportar.';
  }
}
