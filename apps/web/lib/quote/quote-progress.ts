/**
 * quote-progress.ts — Estado por paso del modo "Cotizar con asistente"
 * (QUOTING_ASSISTED_MODE_V1). PURO, server-safe, sin DB, sin recalcular finanzas.
 *
 * Deriva el estado de los 8 pasos a partir de datos YA calculados por el sistema:
 * el contexto (project/scope/version en la URL), los conteos de la versión activa
 * (de `getEstimateById`) y el semáforo existente (`computeQuoteReadiness`). NO
 * consulta tablas ni vuelve a calcular totales: solo clasifica y arma deep-links.
 */
import type { EstimateVersionStatus } from '@/lib/utils/types';
import type { QuoteReadiness } from '@/lib/estimates/quote-readiness';

export type QuoteStepStatus = 'done' | 'attention' | 'pending' | 'locked';

export type QuoteStepId =
  | 'project'
  | 'budget'
  | 'chapters'
  | 'apu'
  | 'quantities'
  | 'pricing'
  | 'readiness'
  | 'export';

export interface QuoteStep {
  id: QuoteStepId;
  label: string;
  status: QuoteStepStatus;
  description: string;
  primaryActionLabel: string;
  primaryHref: string;
  secondaryHref?: string;
  /** Resumen breve (conteos) si aplica. No financiero. */
  summary?: string;
}

export interface QuoteProgressContext {
  projectId?: string | null;
  scopeId?: string | null;
  versionId?: string | null;
}

/** Conteos de la versión activa (de getEstimateById.activeVersion). */
export interface QuoteEstimateInfo {
  status?: EstimateVersionStatus | null;
  chapterCount: number;
  itemCount: number;
}

export interface QuoteProgressInput {
  context: QuoteProgressContext;
  /** Versión activa, si existe. */
  estimate?: QuoteEstimateInfo | null;
  /** Semáforo ya calculado (reuso de computeQuoteReadiness). */
  readiness?: QuoteReadiness | null;
}

const FINALIZED: ReadonlySet<EstimateVersionStatus> = new Set(['approved', 'issued', 'archived']);

function isEditable(status?: EstimateVersionStatus | null): boolean {
  return status == null ? true : !FINALIZED.has(status);
}

/** Construye los deep-links del asistente desde el contexto. */
export function quoteHrefs(ctx: QuoteProgressContext) {
  const { projectId, scopeId, versionId } = ctx;
  const estimateBase =
    projectId && scopeId && versionId
      ? `/projects/${projectId}/scopes/${scopeId}/estimates/${versionId}`
      : null;
  const quoteCenter =
    projectId && scopeId && versionId ? `/quote/${projectId}/${scopeId}/${versionId}` : null;
  return {
    project: projectId ? `/projects/${projectId}` : '/quote/new',
    scope: projectId && scopeId ? `/projects/${projectId}/scopes/${scopeId}` : '/quote/new',
    estimate: estimateBase ?? '/quote/new',
    chapters: estimateBase ?? '/quote/new',
    chaptersNew: estimateBase ? `${estimateBase}/chapters/new` : '/quote/new',
    workspace: estimateBase ? `${estimateBase}/workspace` : '/quote/new',
    apuLibrary: '/apu?view=cards',
    quantities: '/quantities',
    quantitiesImport: '/quantities/import',
    pricing: '/catalog/prices/review',
    readiness: quoteCenter ? `${quoteCenter}#semaforo` : '/quote/new',
    export: estimateBase ?? '/quote/new',
  };
}

/**
 * Deriva el estado de los 8 pasos del asistente. PURA: no IO, no finanzas.
 * Sin versión seleccionada, los pasos 3–8 quedan `locked` (falta prerequisito).
 */
export function deriveQuoteProgress(input: QuoteProgressInput): QuoteStep[] {
  const { context, estimate, readiness } = input;
  const h = quoteHrefs(context);

  const hasProject = !!context.projectId;
  const hasScope = !!context.scopeId;
  const hasVersion = !!context.versionId;
  const ctxComplete = hasProject && hasScope && hasVersion;

  const c = readiness?.counts;
  const itemCount = estimate?.itemCount ?? c?.items ?? 0;
  const chapterCount = estimate?.chapterCount ?? c?.chapters ?? 0;
  const editable = isEditable(estimate?.status);

  const steps: QuoteStep[] = [];

  // 1. Proyecto
  steps.push({
    id: 'project',
    label: 'Proyecto',
    status: hasProject ? 'done' : 'pending',
    description: hasProject ? 'Proyecto seleccionado.' : 'Selecciona o crea un proyecto.',
    primaryActionLabel: hasProject ? 'Abrir proyecto' : 'Elegir proyecto',
    primaryHref: h.project,
  });

  // 2. Presupuesto editable
  steps.push({
    id: 'budget',
    label: 'Presupuesto editable',
    status: !hasProject
      ? 'locked'
      : !hasVersion
        ? 'pending'
        : editable
          ? 'done'
          : 'attention',
    description: !hasProject
      ? 'Primero selecciona un proyecto.'
      : !hasVersion
        ? 'Selecciona el alcance y una versión editable.'
        : editable
          ? 'Versión editable activa.'
          : 'La versión está finalizada (no editable). Clónala para seguir cotizando.',
    primaryActionLabel: hasVersion ? 'Abrir presupuesto' : 'Elegir versión',
    primaryHref: h.estimate,
  });

  // 3. Capítulos
  const emptyChapters = c?.emptyChapters ?? 0;
  steps.push({
    id: 'chapters',
    label: 'Capítulos',
    status: !ctxComplete
      ? 'locked'
      : chapterCount === 0
        ? 'attention'
        : emptyChapters > 0
          ? 'attention'
          : 'done',
    description: !ctxComplete
      ? 'Disponible al elegir un presupuesto.'
      : chapterCount === 0
        ? 'Aún no hay capítulos. Agrega la estructura del presupuesto.'
        : emptyChapters > 0
          ? `${emptyChapters} capítulo(s) sin ítems.`
          : 'Estructura de capítulos lista.',
    primaryActionLabel: chapterCount === 0 ? 'Agregar capítulo' : 'Revisar capítulos',
    primaryHref: chapterCount === 0 ? h.chaptersNew : h.chapters,
    summary: ctxComplete ? `${chapterCount} capítulo(s)` : undefined,
  });

  // 4. Asociar APU
  const itemsWithApu = c?.itemsWithApu ?? 0;
  const apusCritical = c?.apusWithCriticalIssues ?? 0;
  steps.push({
    id: 'apu',
    label: 'Asociar APU',
    status: !ctxComplete
      ? 'locked'
      : apusCritical > 0
        ? 'attention'
        : itemCount === 0
          ? 'pending'
          : itemsWithApu > 0
            ? 'done'
            : 'pending',
    description: !ctxComplete
      ? 'Disponible al elegir un presupuesto.'
      : apusCritical > 0
        ? `${apusCritical} APU vinculado(s) con pendientes críticos.`
        : itemsWithApu > 0
          ? `${itemsWithApu} ítem(s) con APU vinculado.`
          : 'Vincula actividades APU a los ítems del BOQ.',
    primaryActionLabel: 'Abrir workspace',
    primaryHref: h.workspace,
    secondaryHref: h.apuLibrary,
    summary: ctxComplete && itemCount > 0 ? `${itemsWithApu}/${itemCount} con APU` : undefined,
  });

  // 5. Cantidades
  const itemsNoQty = c?.itemsWithoutQuantity ?? 0;
  steps.push({
    id: 'quantities',
    label: 'Cantidades',
    status: !ctxComplete
      ? 'locked'
      : itemsNoQty > 0
        ? 'attention'
        : itemCount === 0
          ? 'pending'
          : 'done',
    description: !ctxComplete
      ? 'Disponible al elegir un presupuesto.'
      : itemsNoQty > 0
        ? `${itemsNoQty} ítem(s) sin cantidad.`
        : itemCount === 0
          ? 'Ingresa o importa cantidades de obra.'
          : 'Cantidades completas.',
    primaryActionLabel: 'Ir a cantidades',
    primaryHref: h.quantities,
    secondaryHref: h.quantitiesImport,
    summary: ctxComplete && itemsNoQty > 0 ? `${itemsNoQty} sin cantidad` : undefined,
  });

  // 6. Precios
  const itemsNoPrice = c?.itemsWithoutPrice ?? 0;
  steps.push({
    id: 'pricing',
    label: 'Precios',
    status: !ctxComplete
      ? 'locked'
      : itemsNoPrice > 0
        ? 'attention'
        : itemCount === 0
          ? 'pending'
          : 'done',
    description: !ctxComplete
      ? 'Disponible al elegir un presupuesto.'
      : itemsNoPrice > 0
        ? `${itemsNoPrice} ítem(s) sin precio unitario.`
        : 'Precios unitarios completos.',
    primaryActionLabel: 'Revisar precios',
    primaryHref: h.pricing,
    summary: ctxComplete && itemsNoPrice > 0 ? `${itemsNoPrice} sin precio` : undefined,
  });

  // 7. Semáforo
  steps.push({
    id: 'readiness',
    label: 'Semáforo',
    status: !ctxComplete
      ? 'locked'
      : !readiness
        ? 'pending'
        : readiness.status === 'ready'
          ? 'done'
          : 'attention',
    description: !ctxComplete
      ? 'Disponible al elegir un presupuesto.'
      : !readiness
        ? 'Aún no hay datos para evaluar.'
        : readiness.status === 'ready'
          ? 'Cotización lista para exportar.'
          : readiness.status === 'review'
            ? 'Puedes exportar, pero hay advertencias.'
            : 'Hay pendientes críticos. Revísalos antes de exportar.',
    primaryActionLabel: 'Ver semáforo',
    primaryHref: h.readiness,
    summary: readiness ? `${readiness.criticalIssues.length} críticos · ${readiness.warnings.length} avisos` : undefined,
  });

  // 8. Exportar
  steps.push({
    id: 'export',
    label: 'Exportar',
    status: !ctxComplete
      ? 'locked'
      : !readiness
        ? 'pending'
        : readiness.status === 'blocked'
          ? 'attention'
          : 'done',
    description: !ctxComplete
      ? 'Disponible al elegir un presupuesto.'
      : !readiness
        ? 'Disponible cuando haya contenido para exportar.'
        : readiness.status === 'blocked'
          ? 'Resuelve los pendientes críticos antes de exportar.'
          : 'Exporta por rol (gerencia, presupuestador, obra, cliente).',
    primaryActionLabel: 'Ir a exportar',
    primaryHref: h.export,
  });

  return steps;
}

/**
 * Próxima acción recomendada: el primer paso `attention` (prioritario) y, si no
 * hay, el primer `pending`. Ignora `locked` y `done`. `null` si no hay nada que
 * hacer (todo done o todo locked). PURO.
 */
export function nextQuoteAction(steps: readonly QuoteStep[]): QuoteStep | null {
  return (
    steps.find((s) => s.status === 'attention') ??
    steps.find((s) => s.status === 'pending') ??
    null
  );
}

/** Resumen agregado del progreso (para barra/encabezado). PURO. */
export function summarizeQuoteProgress(steps: readonly QuoteStep[]): {
  done: number;
  total: number;
  attention: number;
  pct: number;
} {
  const total = steps.length;
  const done = steps.filter((s) => s.status === 'done').length;
  const attention = steps.filter((s) => s.status === 'attention').length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, attention, pct };
}
