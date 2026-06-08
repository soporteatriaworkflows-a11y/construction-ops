/**
 * item-actions.ts — Server Actions de creación/edición de ítems BOQ (4E.2A).
 *
 * Propiedad: agent-frontend-boq. Contrato: `docs/BOQ_MANUAL_EDITING_CONTRACT.md §7`.
 *
 * El navegador SOLO envía `estimateId`, `chapterId` (+ `itemId`/`targetChapterId`
 * en edición), `code`, `description`, `unit`, `quantity`, `unitPrice`. NUNCA
 * envía `subtotal`/`directTotal`/AIU/`grandTotal`: se derivan/recalculan
 * server-side y el trigger DB fuerza el invariant. Errores sanitizados.
 */
'use server';

import {
  getEstimatesWriteRepository,
  BoqValidationError,
  BoqWriteNotSupportedError,
  BoqVersionLockedError,
  BoqItemNotFoundError,
  ChapterNotFoundError,
  TargetChapterNotFoundError,
  EstimateNotFoundError,
} from '@/server/estimates';
import type { FinancialSummary } from '@/lib/estimates/aiu-types';
import type { BoqItemInput, BoqItemUpdateInput } from '@/lib/estimates/boq-edit-types';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { AuthError } from '@/server/auth/errors';
import { isCreationModeEnabled } from '../../../../../mode-guard';

export type ItemActionResult =
  | { ok: true; itemId: string; chapterId: string; subtotal: string; financial: FinancialSummary }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> };

const AUTH_MESSAGES: Record<string, string> = {
  no_session: 'No hay sesión activa. Por favor inicia sesión.',
  no_membership: 'No tienes membresía activa en ninguna organización.',
  invalid_role: 'Tu rol no permite realizar esta acción.',
  config: 'Error de configuración del servidor.',
};

function readBase(formData: FormData): BoqItemInput {
  return {
    code: (formData.get('code') as string | null) ?? '',
    description: (formData.get('description') as string | null) ?? '',
    unit: (formData.get('unit') as string | null) ?? '',
    quantity: (formData.get('quantity') as string | null) ?? '',
    unitPrice: (formData.get('unitPrice') as string | null) ?? '',
  };
}

function mapError(e: unknown): ItemActionResult {
  if (e instanceof BoqValidationError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of e.issues) fieldErrors[issue.field] = issue.message;
    return { ok: false, fieldErrors };
  }
  if (e instanceof TargetChapterNotFoundError) return { ok: false, fieldErrors: { targetChapterId: e.message } };
  if (e instanceof BoqVersionLockedError) return { ok: false, error: e.message };
  if (e instanceof BoqWriteNotSupportedError) return { ok: false, error: e.message };
  if (e instanceof BoqItemNotFoundError) return { ok: false, error: 'El ítem no existe o no es accesible.' };
  if (e instanceof ChapterNotFoundError) return { ok: false, error: 'El capítulo no existe o no es accesible.' };
  if (e instanceof EstimateNotFoundError) return { ok: false, error: 'El presupuesto no existe o no es accesible.' };
  return { ok: false, error: 'No se pudo guardar el ítem. Intenta de nuevo.' };
}

async function resolveOrError() {
  try {
    return { viewer: await resolveAuthenticatedViewer() };
  } catch (e) {
    return { error: e instanceof AuthError ? (AUTH_MESSAGES[e.reason] ?? 'Error de autenticación.') : 'Error al verificar la sesión.' };
  }
}

export async function createItemAction(formData: FormData): Promise<ItemActionResult> {
  if (!isCreationModeEnabled()) {
    return { ok: false, error: 'La edición del presupuesto requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db.' };
  }
  const estimateId = (formData.get('estimateId') as string | null)?.trim() ?? '';
  const chapterId = (formData.get('chapterId') as string | null)?.trim() ?? '';
  if (!estimateId || !chapterId) return { ok: false, error: 'Capítulo no especificado.' };

  const r = await resolveOrError();
  if (!r.viewer) return { ok: false, error: r.error };

  try {
    const res = await getEstimatesWriteRepository().createBoqItem(r.viewer, estimateId, chapterId, readBase(formData));
    return { ok: true, itemId: res.itemId, chapterId: res.chapterId, subtotal: res.subtotal, financial: res.financial };
  } catch (e) {
    return mapError(e);
  }
}

export async function updateItemAction(formData: FormData): Promise<ItemActionResult> {
  if (!isCreationModeEnabled()) {
    return { ok: false, error: 'La edición del presupuesto requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db.' };
  }
  const estimateId = (formData.get('estimateId') as string | null)?.trim() ?? '';
  const chapterId = (formData.get('chapterId') as string | null)?.trim() ?? '';
  const itemId = (formData.get('itemId') as string | null)?.trim() ?? '';
  if (!estimateId || !chapterId || !itemId) return { ok: false, error: 'Ítem no especificado.' };

  const r = await resolveOrError();
  if (!r.viewer) return { ok: false, error: r.error };

  const input: BoqItemUpdateInput = {
    ...readBase(formData),
    targetChapterId: ((formData.get('targetChapterId') as string | null) ?? '').trim() || null,
  };

  try {
    const res = await getEstimatesWriteRepository().updateBoqItem(r.viewer, estimateId, chapterId, itemId, input);
    return { ok: true, itemId: res.itemId, chapterId: res.chapterId, subtotal: res.subtotal, financial: res.financial };
  } catch (e) {
    return mapError(e);
  }
}
