/**
 * chapter-actions.ts — Server Actions de creación/edición de capítulos (4E.2A).
 *
 * Propiedad: agent-frontend-boq. Contrato: `docs/BOQ_MANUAL_EDITING_CONTRACT.md §7`.
 *
 * El navegador SOLO envía `estimateId` (+ `chapterId` en edición), `code` y
 * `name`. Viewer/organización/versión activa/sort_order/origen se derivan
 * server-side. Errores sanitizados; nunca SQL/stack.
 */
'use server';

import {
  getEstimatesWriteRepository,
  BoqValidationError,
  BoqWriteNotSupportedError,
  BoqVersionLockedError,
  ChapterCodeDuplicateError,
  ChapterNotFoundError,
  EstimateNotFoundError,
} from '@/server/estimates';
import type { FinancialSummary } from '@/lib/estimates/aiu-types';
import type { ChapterInput } from '@/lib/estimates/boq-edit-types';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { AuthError } from '@/server/auth/errors';
import { isCreationModeEnabled } from '../../../../../mode-guard';

export type ChapterActionResult =
  | { ok: true; chapterId: string; financial: FinancialSummary }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> };

const AUTH_MESSAGES: Record<string, string> = {
  no_session: 'No hay sesión activa. Por favor inicia sesión.',
  no_membership: 'No tienes membresía activa en ninguna organización.',
  invalid_role: 'Tu rol no permite realizar esta acción.',
  config: 'Error de configuración del servidor.',
};

function readInput(formData: FormData): ChapterInput {
  return {
    code: (formData.get('code') as string | null) ?? '',
    name: (formData.get('name') as string | null) ?? '',
  };
}

function mapError(e: unknown): ChapterActionResult {
  if (e instanceof BoqValidationError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of e.issues) fieldErrors[issue.field] = issue.message;
    return { ok: false, fieldErrors };
  }
  if (e instanceof ChapterCodeDuplicateError) return { ok: false, fieldErrors: { code: e.message } };
  if (e instanceof BoqVersionLockedError) return { ok: false, error: e.message };
  if (e instanceof BoqWriteNotSupportedError) return { ok: false, error: e.message };
  if (e instanceof ChapterNotFoundError) return { ok: false, error: 'El capítulo no existe o no es accesible.' };
  if (e instanceof EstimateNotFoundError) return { ok: false, error: 'El presupuesto no existe o no es accesible.' };
  return { ok: false, error: 'No se pudo guardar el capítulo. Intenta de nuevo.' };
}

export async function createChapterAction(formData: FormData): Promise<ChapterActionResult> {
  if (!isCreationModeEnabled()) {
    return { ok: false, error: 'La edición del presupuesto requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db.' };
  }
  const estimateId = (formData.get('estimateId') as string | null)?.trim() ?? '';
  if (!estimateId) return { ok: false, error: 'Presupuesto no especificado.' };

  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    return { ok: false, error: e instanceof AuthError ? (AUTH_MESSAGES[e.reason] ?? 'Error de autenticación.') : 'Error al verificar la sesión.' };
  }

  try {
    const res = await getEstimatesWriteRepository().createEstimateChapter(viewer, estimateId, readInput(formData));
    return { ok: true, chapterId: res.chapterId, financial: res.financial };
  } catch (e) {
    return mapError(e);
  }
}

export async function updateChapterAction(formData: FormData): Promise<ChapterActionResult> {
  if (!isCreationModeEnabled()) {
    return { ok: false, error: 'La edición del presupuesto requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db.' };
  }
  const estimateId = (formData.get('estimateId') as string | null)?.trim() ?? '';
  const chapterId = (formData.get('chapterId') as string | null)?.trim() ?? '';
  if (!estimateId || !chapterId) return { ok: false, error: 'Capítulo no especificado.' };

  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    return { ok: false, error: e instanceof AuthError ? (AUTH_MESSAGES[e.reason] ?? 'Error de autenticación.') : 'Error al verificar la sesión.' };
  }

  try {
    const res = await getEstimatesWriteRepository().updateEstimateChapter(viewer, estimateId, chapterId, readInput(formData));
    return { ok: true, chapterId: res.chapterId, financial: res.financial };
  } catch (e) {
    return mapError(e);
  }
}
