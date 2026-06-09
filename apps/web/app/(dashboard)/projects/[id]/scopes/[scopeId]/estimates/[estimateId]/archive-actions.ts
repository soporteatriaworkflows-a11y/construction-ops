/**
 * archive-actions.ts — Server Actions de archive/restore de BOQ (4E.2B).
 *
 * Propiedad: agent-frontend-boq. Contrato: `docs/BOQ_DELETE_ARCHIVE_CONTRACT.md`.
 *
 * El navegador solo envía ids de ruta (estimateId + chapterId/itemId). Viewer,
 * organización, versión activa y `archived_by` se derivan server-side. Errores
 * sanitizados. Requiere modo supabase+db (en demo/fixture la escritura va bloqueada).
 */
'use server';

import {
  getEstimatesWriteRepository,
  BoqWriteNotSupportedError,
  BoqVersionLockedError,
  BoqAlreadyArchivedError,
  BoqNotArchivedError,
  BoqItemNotFoundError,
  ChapterNotFoundError,
  EstimateNotFoundError,
} from '@/server/estimates';
import type { FinancialSummary } from '@/lib/estimates/aiu-types';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { AuthError } from '@/server/auth/errors';
import { isCreationModeEnabled } from '../../../../../mode-guard';

export type ArchiveActionResult =
  | { ok: true; financial: FinancialSummary }
  | { ok: false; error: string };

const AUTH_MESSAGES: Record<string, string> = {
  no_session: 'No hay sesión activa. Por favor inicia sesión.',
  no_membership: 'No tienes membresía activa en ninguna organización.',
  invalid_role: 'Tu rol no permite realizar esta acción.',
  config: 'Error de configuración del servidor.',
};

function mapError(e: unknown): ArchiveActionResult {
  if (e instanceof BoqVersionLockedError) return { ok: false, error: e.message };
  if (e instanceof BoqWriteNotSupportedError) return { ok: false, error: e.message };
  if (e instanceof BoqAlreadyArchivedError) return { ok: false, error: e.message };
  if (e instanceof BoqNotArchivedError) return { ok: false, error: e.message };
  if (e instanceof BoqItemNotFoundError) return { ok: false, error: 'El ítem no existe o no es accesible.' };
  if (e instanceof ChapterNotFoundError) return { ok: false, error: 'El capítulo no existe o no es accesible.' };
  if (e instanceof EstimateNotFoundError) return { ok: false, error: 'El presupuesto no existe o no es accesible.' };
  return { ok: false, error: 'No se pudo completar la operación. Intenta de nuevo.' };
}

async function run(
  formData: FormData,
  op: (
    repo: ReturnType<typeof getEstimatesWriteRepository>,
    viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>,
    estimateId: string,
    targetId: string,
  ) => Promise<{ financial: FinancialSummary }>,
): Promise<ArchiveActionResult> {
  if (!isCreationModeEnabled()) {
    return { ok: false, error: 'La edición del presupuesto requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db.' };
  }
  const estimateId = (formData.get('estimateId') as string | null)?.trim() ?? '';
  const targetId = (formData.get('targetId') as string | null)?.trim() ?? '';
  if (!estimateId || !targetId) return { ok: false, error: 'Operación no especificada.' };

  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    return { ok: false, error: e instanceof AuthError ? (AUTH_MESSAGES[e.reason] ?? 'Error de autenticación.') : 'Error al verificar la sesión.' };
  }

  try {
    const res = await op(getEstimatesWriteRepository(), viewer, estimateId, targetId);
    return { ok: true, financial: res.financial };
  } catch (e) {
    return mapError(e);
  }
}

export async function archiveChapterAction(formData: FormData): Promise<ArchiveActionResult> {
  return run(formData, (repo, viewer, estimateId, id) => repo.archiveEstimateChapter(viewer, estimateId, id));
}
export async function restoreChapterAction(formData: FormData): Promise<ArchiveActionResult> {
  return run(formData, (repo, viewer, estimateId, id) => repo.restoreEstimateChapter(viewer, estimateId, id));
}
export async function archiveItemAction(formData: FormData): Promise<ArchiveActionResult> {
  return run(formData, (repo, viewer, estimateId, id) => repo.archiveBoqItem(viewer, estimateId, id));
}
export async function restoreItemAction(formData: FormData): Promise<ArchiveActionResult> {
  return run(formData, (repo, viewer, estimateId, id) => repo.restoreBoqItem(viewer, estimateId, id));
}
