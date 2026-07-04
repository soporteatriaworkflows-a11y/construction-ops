/**
 * boq-add-actions.ts — Server Action: agregar una actividad APU al BOQ
 * (BOQ_ADD_FROM_APU_V1). Contrato §4.
 *
 * El navegador SOLO envía versión, capítulo, APU y cantidad. El costo unitario
 * (snapshot) lo calcula server-side la RPC `add_apu_to_boq`; nunca se acepta del
 * cliente. Solo versión EDITABLE; issued/approved/archived ⇒ bloqueado.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { canEditBudgetSurface } from '@/server/access/budget-surface';
import { addApuToBoq } from '@/server/apu-builder';
import { InsufficientRoleError } from '@/server/pricing/errors';
import {
  ApuBuilderValidationError,
  ApuBuilderWriteNotSupportedError,
} from '@/server/apu-builder';

export type AddApuToBoqActionResult =
  | { ok: true; message: string; subtotal: string }
  | { ok: false; error: string };

function s(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

export async function addApuToBoqAction(
  _prev: AddApuToBoqActionResult | null,
  formData: FormData,
): Promise<AddApuToBoqActionResult> {
  const estimateVersionId = s(formData, 'estimateVersionId');
  const chapterId = s(formData, 'chapterId');
  const apuTemplateId = s(formData, 'apuTemplateId');
  const quantity = s(formData, 'quantity');
  const idempotencyKey = s(formData, 'idempotencyKey') || undefined;
  const projectId = s(formData, 'projectId');
  const scopeId = s(formData, 'scopeId');
  const estimateId = s(formData, 'estimateId');

  try {
    const viewer = await resolveAuthenticatedViewer();
    // V5.6.6B: backstop de rol (compras/obra/consulta no agregan al BOQ).
    if (!canEditBudgetSurface(viewer.profileRole)) {
      return { ok: false, error: 'Tu rol no permite editar el presupuesto.' };
    }
    const result = await addApuToBoq(viewer, {
      estimateVersionId,
      chapterId,
      apuTemplateId,
      quantity,
      idempotencyKey,
    });

    if (projectId && scopeId && estimateId) {
      revalidatePath(
        `/projects/${projectId}/scopes/${scopeId}/estimates/${estimateId}/workspace`,
      );
    }
    return {
      ok: true,
      message: 'Actividad agregada al presupuesto.',
      subtotal: result.subtotal,
    };
  } catch (e) {
    if (e instanceof ApuBuilderValidationError) return { ok: false, error: e.message };
    if (e instanceof InsufficientRoleError) {
      return { ok: false, error: 'No tienes permiso para editar este presupuesto.' };
    }
    if (e instanceof ApuBuilderWriteNotSupportedError) {
      return { ok: false, error: 'Esta operación requiere modo Supabase + base de datos.' };
    }
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('version_locked')) {
      return { ok: false, error: 'La versión está emitida y no admite cambios.' };
    }
    if (msg.includes('chapter_not_in_version')) {
      return { ok: false, error: 'El capítulo no pertenece a esta versión.' };
    }
    if (msg.includes('apu_not_found')) {
      return { ok: false, error: 'El APU seleccionado no está disponible.' };
    }
    return { ok: false, error: 'No se pudo agregar la actividad. Inténtalo de nuevo.' };
  }
}
