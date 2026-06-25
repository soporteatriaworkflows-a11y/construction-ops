/**
 * quote-companion-actions.ts — Estado del companion panel de cotización
 * (QUOTING_ASSISTED_COMPANION_PANEL_V1B). 'use server', READ-ONLY.
 *
 * Reusa exactamente la carga del centro de cotización (getEstimateById +
 * getEstimateDetail + listApus → computeQuoteReadiness → deriveQuoteProgress) y
 * devuelve un payload serializable. NO muta nada, NO recalcula finanzas, NO carga
 * los conteos pesados de export (N+1 conocido).
 */
'use server';

import { resolveViewer } from '@/server/auth/resolve-viewer';
import { getEstimatesWriteRepository, EstimateNotFoundError } from '@/server/estimates';
import { getReadModel } from '@/server/read-model';
import {
  computeQuoteReadiness,
  type QuoteReadinessStatus,
} from '@/lib/estimates/quote-readiness';
import { buildApuLibraryItemMap } from '@/lib/apu-library/from-summary';
import {
  deriveQuoteProgress,
  summarizeQuoteProgress,
  nextQuoteAction,
  type QuoteStep,
} from '@/lib/quote/quote-progress';

export interface QuoteCompanionNext {
  id: string;
  label: string;
  primaryActionLabel: string;
  primaryHref: string;
}

export interface QuoteCompanionPayload {
  context: { projectId: string; scopeId: string; versionId: string };
  estimateName: string;
  estimateCode: string;
  centerHref: string;
  steps: QuoteStep[];
  summary: { done: number; total: number; attention: number; pct: number };
  readiness:
    | { status: QuoteReadinessStatus; label: string; critical: number; warnings: number; info: number }
    | null;
  next: QuoteCompanionNext | null;
}

export type QuoteCompanionState =
  | { ok: true; payload: QuoteCompanionPayload }
  | { ok: false; error: string };

export async function getQuoteCompanionState(
  projectId: string,
  scopeId: string,
  versionId: string,
): Promise<QuoteCompanionState> {
  if (!projectId || !scopeId || !versionId) {
    return { ok: false, error: 'Contexto de cotización incompleto.' };
  }

  let viewer: Awaited<ReturnType<typeof resolveViewer>>;
  try {
    viewer = await resolveViewer();
  } catch {
    return { ok: false, error: 'Sesión no válida.' };
  }

  let estimate: Awaited<
    ReturnType<ReturnType<typeof getEstimatesWriteRepository>['getEstimateById']>
  >;
  try {
    estimate = await getEstimatesWriteRepository().getEstimateById(viewer, versionId);
  } catch (e) {
    if (e instanceof EstimateNotFoundError) return { ok: false, error: 'Cotización no encontrada.' };
    return { ok: false, error: 'No se pudo cargar la cotización.' };
  }
  // El presupuesto debe pertenecer al alcance/proyecto del contexto.
  if (estimate.projectScopeId !== scopeId) {
    return { ok: false, error: 'La cotización no corresponde a este alcance.' };
  }

  const active = estimate.activeVersion;

  // Semáforo: MISMA carga que el centro (sin recalcular finanzas).
  let readinessFull: ReturnType<typeof computeQuoteReadiness> | null = null;
  if (active) {
    try {
      const [detail, apus] = await Promise.all([
        getReadModel().getEstimateDetail(viewer, versionId),
        getReadModel().listApus(viewer).catch(() => []),
      ]);
      readinessFull = computeQuoteReadiness({
        estimate: detail.estimate,
        chapters: detail.chapters,
        items: detail.items,
        apusById: buildApuLibraryItemMap(apus),
      });
    } catch {
      readinessFull = null;
    }
  }

  const steps = deriveQuoteProgress({
    context: { projectId, scopeId, versionId },
    estimate: active
      ? { status: active.status, chapterCount: active.chapterCount, itemCount: active.itemCount }
      : null,
    readiness: readinessFull,
  });
  const summary = summarizeQuoteProgress(steps);
  const na = nextQuoteAction(steps);

  return {
    ok: true,
    payload: {
      context: { projectId, scopeId, versionId },
      estimateName: estimate.name,
      estimateCode: estimate.code,
      centerHref: `/quote/${projectId}/${scopeId}/${versionId}`,
      steps,
      summary,
      readiness: readinessFull
        ? {
            status: readinessFull.status,
            label: readinessFull.label,
            critical: readinessFull.criticalIssues.length,
            warnings: readinessFull.warnings.length,
            info: readinessFull.info.length,
          }
        : null,
      next: na
        ? {
            id: na.id,
            label: na.label,
            primaryActionLabel: na.primaryActionLabel,
            primaryHref: na.primaryHref,
          }
        : null,
    },
  };
}
