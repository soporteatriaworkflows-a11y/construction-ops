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
} from '@/lib/contracts/read-model';

export type QuoteReadinessStatus = 'ready' | 'review' | 'blocked';
export type QuoteIssueSeverity = 'critical' | 'warning' | 'info';

export interface QuoteIssue {
  severity: QuoteIssueSeverity;
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
}

/**
 * Calcula el estado de readiness de una cotización a partir del read-model.
 * PURA. No bloquea export; solo clasifica.
 */
export function computeQuoteReadiness(input: QuoteReadinessInput): QuoteReadiness {
  const { estimate, chapters, items } = input;
  const status = input.status ?? estimate.status;

  const criticalIssues: QuoteIssue[] = [];
  const warnings: QuoteIssue[] = [];
  const info: QuoteIssue[] = [];

  // --- Críticos (datos disponibles en el read-model) ---
  if (chapters.length === 0) {
    criticalIssues.push({ severity: 'critical', code: 'no_chapters', message: 'El presupuesto no tiene capítulos' });
  }
  const emptyChapters = chapters.filter((c) => c.itemCount === 0);
  if (emptyChapters.length > 0) {
    criticalIssues.push({
      severity: 'critical', code: 'empty_chapter',
      message: `${emptyChapters.length} capítulo(s) sin ítems`, count: emptyChapters.length,
    });
  }
  const itemsWithoutQuantity = items.filter((i) => le0(i.quantity)).length;
  if (itemsWithoutQuantity > 0) {
    criticalIssues.push({
      severity: 'critical', code: 'item_no_quantity',
      message: `${itemsWithoutQuantity} ítem(s) sin cantidad`, count: itemsWithoutQuantity,
    });
  }
  const itemsWithoutPrice = items.filter((i) => le0(i.unitPrice)).length;
  if (itemsWithoutPrice > 0) {
    criticalIssues.push({
      severity: 'critical', code: 'item_no_price',
      message: `${itemsWithoutPrice} ítem(s) sin precio unitario`, count: itemsWithoutPrice,
    });
  }
  // AIU no configurado (solo crítico si la versión NO está finalizada y hay costo directo).
  const aiuZero = le0(estimate.administration) && le0(estimate.contingency) && le0(estimate.utility);
  const finalized = status === 'issued' || status === 'approved' || status === 'archived';
  if (aiuZero && !finalized && !le0(estimate.directCost)) {
    criticalIssues.push({ severity: 'critical', code: 'aiu_missing', message: 'AIU sin configurar' });
  }

  // --- Advertencias (las disponibles) ---
  if (chapters.length > 0 && items.length === 0) {
    warnings.push({ severity: 'warning', code: 'no_items', message: 'El presupuesto no tiene ítems' });
  }

  // --- Informativos (incl. lo que hoy NO expone el read-model) ---
  info.push({
    severity: 'info', code: 'apu_link_pending',
    message: 'Vínculo ítem↔APU y completitud de APU por ítem: pendiente de integración',
  });
  info.push({
    severity: 'info', code: 'export_client_unverified',
    message: 'Verifica el export para cliente (privacidad) antes de enviar',
  });

  const counts: QuoteReadinessCounts = {
    chapters: chapters.length,
    items: items.length,
    emptyChapters: emptyChapters.length,
    itemsWithoutQuantity,
    itemsWithoutPrice,
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
