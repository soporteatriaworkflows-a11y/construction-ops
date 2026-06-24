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
import {
  updateApuComponentLaborProductivityOverride,
  resetApuComponentLaborProductivityOverride,
  ProductivityOverrideError,
} from '@/server/apu-productivity-overrides';
import {
  updateApuComponentMaterialConsumptionOverride,
  resetApuComponentMaterialConsumptionOverride,
  MaterialConsumptionError,
} from '@/server/apu-material-overrides';

export type WasteOverrideActionResult =
  | { ok: true; wastePct: string; recommendedWastePct: string | null; overridden: boolean }
  | { ok: false; error: string };

export type ProductivityOverrideActionResult =
  | {
      ok: true;
      quantity: string;
      recommendedLaborQuantity: string | null;
      appliedProductivity: string | null;
      productivityUnit: string | null;
      appliedCrewSize: string | null;
    }
  | { ok: false; error: string };

export type MaterialConsumptionActionResult =
  | { ok: true; quantity: string; recommendedMaterialQuantity: string | null; overridden: boolean }
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

/** Gating común V1C: db-mode real + viewer autenticado + rol management/internal. */
async function ensureProductivityEditAllowed(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isCreationModeEnabled()) {
    return { ok: false, error: 'La edición requiere modo de operación real (datos reales).' };
  }
  try {
    const viewer = await resolveAuthenticatedViewer();
    if (!['management', 'internal'].includes(viewer.role)) {
      return { ok: false, error: 'Tu rol no permite ajustar el rendimiento.' };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof AuthError ? 'No hay sesión válida. Inicia sesión de nuevo.' : 'No se pudo verificar tu sesión.',
    };
  }
}

export async function updateApuComponentLaborProductivityOverrideAction(
  _prev: ProductivityOverrideActionResult | null,
  formData: FormData,
): Promise<ProductivityOverrideActionResult> {
  const gate = await ensureProductivityEditAllowed();
  if (!gate.ok) return { ok: false, error: gate.error };

  const componentId = String(formData.get('componentId') ?? '').trim();
  const productivityUnit = String(formData.get('productivityUnit') ?? '').trim();
  const productivity = String(formData.get('productivity') ?? '').trim();
  const crewSizeRaw = String(formData.get('crewSize') ?? '').trim();
  const crewSize = crewSizeRaw === '' ? null : crewSizeRaw;
  const note = String(formData.get('note') ?? '').trim() || null;
  const apuId = String(formData.get('apuId') ?? '').trim();

  try {
    const result = await updateApuComponentLaborProductivityOverride({
      componentId,
      productivityUnit,
      productivity,
      crewSize,
      note,
    });
    if (apuId && UUID_RE.test(apuId)) revalidatePath(`/apu/${apuId}`);
    return {
      ok: true,
      quantity: result.quantity,
      recommendedLaborQuantity: result.recommendedLaborQuantity,
      appliedProductivity: result.appliedProductivity,
      productivityUnit: result.productivityUnit,
      appliedCrewSize: result.appliedCrewSize,
    };
  } catch (e) {
    if (e instanceof ProductivityOverrideError) return { ok: false, error: e.message };
    return { ok: false, error: 'No se pudo guardar el ajuste. Inténtalo de nuevo.' };
  }
}

export async function resetApuComponentLaborProductivityOverrideAction(
  _prev: ProductivityOverrideActionResult | null,
  formData: FormData,
): Promise<ProductivityOverrideActionResult> {
  const gate = await ensureProductivityEditAllowed();
  if (!gate.ok) return { ok: false, error: gate.error };

  const componentId = String(formData.get('componentId') ?? '').trim();
  const apuId = String(formData.get('apuId') ?? '').trim();

  try {
    const result = await resetApuComponentLaborProductivityOverride(componentId);
    if (apuId && UUID_RE.test(apuId)) revalidatePath(`/apu/${apuId}`);
    return {
      ok: true,
      quantity: result.quantity,
      recommendedLaborQuantity: null,
      appliedProductivity: null,
      productivityUnit: null,
      appliedCrewSize: null,
    };
  } catch (e) {
    if (e instanceof ProductivityOverrideError) return { ok: false, error: e.message };
    return { ok: false, error: 'No se pudo restaurar el valor. Inténtalo de nuevo.' };
  }
}

/** Gating común material: db-mode real + viewer autenticado + rol management/internal. */
async function ensureMaterialEditAllowed(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isCreationModeEnabled()) {
    return { ok: false, error: 'La edición requiere modo de operación real (datos reales).' };
  }
  try {
    const viewer = await resolveAuthenticatedViewer();
    if (!['management', 'internal'].includes(viewer.role)) {
      return { ok: false, error: 'Tu rol no permite ajustar el consumo.' };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof AuthError ? 'No hay sesión válida. Inicia sesión de nuevo.' : 'No se pudo verificar tu sesión.',
    };
  }
}

export async function updateApuComponentMaterialConsumptionOverrideAction(
  _prev: MaterialConsumptionActionResult | null,
  formData: FormData,
): Promise<MaterialConsumptionActionResult> {
  const gate = await ensureMaterialEditAllowed();
  if (!gate.ok) return { ok: false, error: gate.error };

  const componentId = String(formData.get('componentId') ?? '').trim();
  const quantity = String(formData.get('quantity') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim() || null;
  const apuId = String(formData.get('apuId') ?? '').trim();

  try {
    const result = await updateApuComponentMaterialConsumptionOverride({ componentId, quantity, note });
    if (apuId && UUID_RE.test(apuId)) revalidatePath(`/apu/${apuId}`);
    return {
      ok: true,
      quantity: result.quantity,
      recommendedMaterialQuantity: result.recommendedMaterialQuantity,
      overridden: result.overridden,
    };
  } catch (e) {
    if (e instanceof MaterialConsumptionError) return { ok: false, error: e.message };
    return { ok: false, error: 'No se pudo guardar el ajuste. Inténtalo de nuevo.' };
  }
}

export async function resetApuComponentMaterialConsumptionOverrideAction(
  _prev: MaterialConsumptionActionResult | null,
  formData: FormData,
): Promise<MaterialConsumptionActionResult> {
  const gate = await ensureMaterialEditAllowed();
  if (!gate.ok) return { ok: false, error: gate.error };

  const componentId = String(formData.get('componentId') ?? '').trim();
  const apuId = String(formData.get('apuId') ?? '').trim();

  try {
    const result = await resetApuComponentMaterialConsumptionOverride(componentId);
    if (apuId && UUID_RE.test(apuId)) revalidatePath(`/apu/${apuId}`);
    return { ok: true, quantity: result.quantity, recommendedMaterialQuantity: null, overridden: false };
  } catch (e) {
    if (e instanceof MaterialConsumptionError) return { ok: false, error: e.message };
    return { ok: false, error: 'No se pudo restaurar el valor. Inténtalo de nuevo.' };
  }
}
