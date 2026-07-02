/**
 * actions.ts — Server Actions del Centro de Revisión de Precios
 * (PRICE_OBSERVATION_REVIEW_CENTER_V1 + BULK_APPROVAL_BY_IMPORT_BATCH_V1).
 *
 * Reglas:
 *  - organization_id SIEMPRE derivado server-side (resolveAuthenticatedViewer);
 *    JAMÁS se acepta organizationId del navegador.
 *  - Solo APP_AUTH_MODE=supabase + READ_MODEL_SOURCE=db permiten escribir.
 *  - Solo roles management|internal (RLS en DB exige admin/gerencia).
 *  - Selección explícita + idempotency_key + confirmación previa en el modal.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { AuthError } from '@/server/auth/errors';
import { checkModuleAccess } from '@/server/access';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import { InsufficientRoleError, PriceIntelligenceWriteNotSupportedError } from '@/server/pricing';
import {
  bulkApproveObservations,
  bulkRejectObservations,
  BulkSelectionInvalidError,
  BulkSelectionTooLargeError,
  BulkRejectionReasonRequiredError,
  MAX_BULK_ROWS,
} from '@/server/pricing/review';
import type { BulkReviewResult } from '@/server/pricing/review';

export type BulkReviewActionResult =
  | { ok: true; result: BulkReviewResult }
  | { ok: false; error: string };

const SELECTION_LIMIT_BYTES = 64 * 1024;

function parseObservationIds(raw: FormDataEntryValue | null): string[] | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > SELECTION_LIMIT_BYTES) {
    return null;
  }
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    return data.filter((x): x is string => typeof x === 'string');
  } catch {
    return null;
  }
}

function authMessage(e: AuthError): string {
  const messages: Record<string, string> = {
    no_session: 'No hay sesión activa. Por favor inicia sesión.',
    no_membership: 'No tienes membresía activa en ninguna organización.',
    invalid_role: 'Tu rol no permite realizar esta acción.',
    config: 'Error de configuración del servidor.',
  };
  return messages[e.reason] ?? 'Error de autenticación.';
}

function sanitizeError(e: unknown): string {
  if (e instanceof BulkSelectionTooLargeError) {
    return `La selección supera el máximo de ${MAX_BULK_ROWS} filas por acción. Divide la revisión en varias confirmaciones.`;
  }
  if (e instanceof BulkSelectionInvalidError) {
    return e.issues.join(' ');
  }
  if (e instanceof BulkRejectionReasonRequiredError) {
    return 'El motivo de rechazo es obligatorio.';
  }
  if (e instanceof InsufficientRoleError) {
    return 'Tu rol no permite aprobar ni rechazar observaciones en bloque.';
  }
  if (e instanceof PriceIntelligenceWriteNotSupportedError) {
    return 'Acción no disponible en modo demostración.';
  }
  return 'No se pudo completar la acción. Intenta de nuevo.';
}

async function runBulkAction(
  actionType: 'approve' | 'reject',
  formData: FormData,
): Promise<BulkReviewActionResult> {
  if (!isCreationModeEnabled()) {
    return { ok: false, error: 'La revisión masiva requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db.' };
  }
  // V5.6.2: guard de módulo `operational-review` (decisión admin/gerencia) por
  // profiles.role — defensa en profundidad app-layer; RLS es el backstop real.
  const gate = await checkModuleAccess('operational-review');
  if (!gate.ok) {
    return { ok: false, error: 'Tu rol no permite aprobar ni rechazar observaciones en bloque.' };
  }

  const observationIds = parseObservationIds(formData.get('observationIds'));
  if (!observationIds || observationIds.length === 0) {
    return { ok: false, error: 'Selecciona al menos una observación pendiente.' };
  }
  const idempotencyKey = (formData.get('idempotencyKey') as string | null)?.trim() ?? '';
  if (!idempotencyKey) {
    return { ok: false, error: 'Falta la clave de idempotencia. Recarga la página e intenta de nuevo.' };
  }

  let viewer: Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    return { ok: false, error: e instanceof AuthError ? authMessage(e) : 'Error al verificar la sesión.' };
  }

  try {
    const input = {
      observationIds,
      idempotencyKey,
      rejectionReason: (formData.get('rejectionReason') as string | null) ?? undefined,
    };
    const result =
      actionType === 'approve'
        ? await bulkApproveObservations(viewer, input)
        : await bulkRejectObservations(viewer, input);
    revalidatePath('/catalog/prices/review');
    revalidatePath('/dashboard');
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: sanitizeError(e) };
  }
}

export async function bulkApproveAction(formData: FormData): Promise<BulkReviewActionResult> {
  return runBulkAction('approve', formData);
}

export async function bulkRejectAction(formData: FormData): Promise<BulkReviewActionResult> {
  return runBulkAction('reject', formData);
}
