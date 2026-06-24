/**
 * actions.ts — Server Action de override de desperdicio APU (APU_SMART_DEFAULTS_V1B).
 *
 * Seguridad (defensa en profundidad; la RPC SECURITY DEFINER es el backstop):
 *  - Modo creación (APP_AUTH_MODE=supabase + READ_MODEL_SOURCE=db).
 *  - viewer server-side; rol management/internal.
 *  - SOLO actualiza waste_pct + trazabilidad vía RPC. NO toca quantity/precio/
 *    rendimiento/cuadrilla. La RPC bloquea APU archivado y re-valida permisos.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { AuthError } from '@/server/auth/errors';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import {
  updateApuComponentWasteOverride,
  WasteOverrideError,
} from '@/server/apu-overrides';

export type WasteOverrideActionResult =
  | { ok: true; wastePct: string; recommendedWastePct: string | null; overridden: boolean }
  | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function updateApuComponentWasteOverrideAction(
  _prev: WasteOverrideActionResult | null,
  formData: FormData,
): Promise<WasteOverrideActionResult> {
  if (!isCreationModeEnabled()) {
    return { ok: false, error: 'La edición requiere modo de operación real (datos reales).' };
  }
  try {
    const viewer = await resolveAuthenticatedViewer();
    if (!['management', 'internal'].includes(viewer.role)) {
      return { ok: false, error: 'Tu rol no permite ajustar el desperdicio.' };
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof AuthError ? 'No hay sesión válida. Inicia sesión de nuevo.' : 'No se pudo verificar tu sesión.',
    };
  }

  const componentId = String(formData.get('componentId') ?? '').trim();
  const wastePct = String(formData.get('wastePct') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim() || null;
  const apuId = String(formData.get('apuId') ?? '').trim();

  try {
    const result = await updateApuComponentWasteOverride({ componentId, wastePct, note });
    if (apuId && UUID_RE.test(apuId)) revalidatePath(`/apu/${apuId}`);
    return {
      ok: true,
      wastePct: result.wastePct,
      recommendedWastePct: result.recommendedWastePct,
      overridden: result.overridden,
    };
  } catch (e) {
    if (e instanceof WasteOverrideError) return { ok: false, error: e.message };
    return { ok: false, error: 'No se pudo guardar el ajuste. Inténtalo de nuevo.' };
  }
}
