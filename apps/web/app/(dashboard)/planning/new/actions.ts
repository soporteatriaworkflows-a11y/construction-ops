/**
 * actions.ts — Server Actions de /planning/new (SCHEDULE_FROM_BOQ_V1).
 *
 * `previewScheduleAction` es READ-ONLY (no escribe). `createScheduleAction`
 * persiste vía RPC atómica. org/actor/permisos SIEMPRE server-side.
 */
'use server';

import { redirect } from 'next/navigation';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { AuthError } from '@/server/auth';
import {
  previewScheduleFromBoq,
  createScheduleFromBoq,
  SchedulePermissionError,
  ScheduleValidationError,
  ScheduleNotFoundError,
  type SchedulePreviewParams,
} from '@/server/planning';
import type { GeneratorPreview } from '@/modules/planning';

export type PreviewActionResult =
  | { ok: true; preview: GeneratorPreview }
  | { ok: false; error: string };

export interface CreateActionResult {
  error?: string;
}

function parseParams(formData: FormData): SchedulePreviewParams | null {
  const versionId = formData.get('estimateVersionId');
  const name = formData.get('scheduleName');
  const startDate = formData.get('startDate');
  if (typeof versionId !== 'string' || !versionId) return null;
  if (typeof name !== 'string' || !name.trim()) return null;
  if (typeof startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;

  const bool = (k: string, def: boolean) => {
    const v = formData.get(k);
    if (v === null) return def;
    return v === 'true' || v === 'on' || v === '1';
  };
  const minDurationRaw = Number(formData.get('minDurationDays'));
  const crewRaw = formData.get('defaultCrewSize');
  return {
    estimateVersionId: versionId,
    scheduleName: name.trim(),
    startDate,
    includeChapters: bool('includeChapters', true),
    onlyPositiveQuantity: bool('onlyPositiveQuantity', true),
    includeItemsWithoutApu: bool('includeItemsWithoutApu', true),
    createChapterMilestones: bool('createChapterMilestones', false),
    minDurationDays: Number.isFinite(minDurationRaw) && minDurationRaw >= 1 ? Math.floor(minDurationRaw) : 1,
    defaultCrewSize: typeof crewRaw === 'string' && crewRaw.trim() !== '' ? crewRaw.trim() : '1',
  };
}

/** Convierte cualquier error en un mensaje de usuario seguro con trazabilidad. */
function toSafeErrorMessage(e: unknown, context: 'preview' | 'create'): string {
  if (e instanceof SchedulePermissionError) {
    return 'No tienes permiso para crear cronogramas en esta organización.';
  }
  if (e instanceof AuthError) {
    return e.reason === 'no_session'
      ? 'Tu sesión expiró. Vuelve a iniciar sesión.'
      : 'Sin membresía activa para crear cronogramas.';
  }
  if (e instanceof ScheduleNotFoundError) {
    return 'El presupuesto seleccionado no existe o no pertenece al proyecto seleccionado.';
  }
  if (e instanceof ScheduleValidationError) {
    return e.message;
  }
  // Errores genéricos de repositorio (planning_*_read_failed) o RPC no reconocido.
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.startsWith('planning_version_read_failed')) {
    return 'No se pudo leer la versión del presupuesto. Verifica que el presupuesto exista y tengas acceso.';
  }
  if (msg.startsWith('planning_chapters_read_failed') || msg.startsWith('planning_boq_read_failed')) {
    return 'No se pudo leer el contenido del presupuesto. Verifica tu conexión o contacta al administrador.';
  }
  if (msg.startsWith('planning_apu_components_read_failed')) {
    return 'No se pudo leer el rendimiento APU del presupuesto. Verifica tu conexión o contacta al administrador.';
  }
  if (msg.startsWith('planning_')) {
    const code = msg.split(':')[1]?.trim() ?? 'unknown';
    return `No se pudieron leer los datos del presupuesto (${code}).`;
  }
  if (context === 'create') {
    return 'No se pudo crear el cronograma. Código: SCHEDULE_CREATE_VALIDATION.';
  }
  return 'No se pudo calcular la vista previa. Revisa los datos e inténtalo de nuevo.';
}

export async function previewScheduleAction(
  _prev: PreviewActionResult | null,
  formData: FormData,
): Promise<PreviewActionResult> {
  const params = parseParams(formData);
  if (!params) return { ok: false, error: 'Completa proyecto, presupuesto, nombre y fecha de inicio.' };
  try {
    const viewer = await resolveAuthenticatedViewer();
    const preview = await previewScheduleFromBoq(viewer, params);
    if (preview.stats.activityCount === 0) {
      return {
        ok: false,
        error:
          'No se encontraron actividades válidas para generar el cronograma. ' +
          'Revisa que el presupuesto tenga ítems con cantidad mayor a 0 o desactiva el filtro de cantidad.',
      };
    }
    return { ok: true, preview };
  } catch (e) {
    console.error('[planning] previewScheduleAction error', {
      estimateVersionId: params.estimateVersionId,
      errorName: e instanceof Error ? e.name : typeof e,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: toSafeErrorMessage(e, 'preview') };
  }
}

export async function createScheduleAction(
  _prev: CreateActionResult | null,
  formData: FormData,
): Promise<CreateActionResult> {
  const params = parseParams(formData);
  if (!params) return { error: 'Completa proyecto, presupuesto, nombre y fecha de inicio.' };

  let scheduleId: string;
  try {
    const viewer = await resolveAuthenticatedViewer();
    scheduleId = await createScheduleFromBoq(viewer, params);
  } catch (e) {
    console.error('[planning] createScheduleAction error', {
      estimateVersionId: params.estimateVersionId,
      errorName: e instanceof Error ? e.name : typeof e,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return { error: toSafeErrorMessage(e, 'create') };
  }
  redirect(`/planning/${scheduleId}`);
}
