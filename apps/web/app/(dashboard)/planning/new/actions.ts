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
import { PlanningError, type GeneratorPreview } from '@/modules/planning';

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
  if (typeof startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;
  // El nombre NO es obligatorio para la vista previa (read-only). La creación lo
  // exige aparte (ver createScheduleAction) y el RPC lo revalida (invalid_name).

  const bool = (k: string, def: boolean) => {
    const v = formData.get(k);
    if (v === null) return def;
    return v === 'true' || v === 'on' || v === '1';
  };
  const minDurationRaw = Number(formData.get('minDurationDays'));
  const crewRaw = formData.get('defaultCrewSize');
  return {
    estimateVersionId: versionId,
    scheduleName: typeof name === 'string' ? name.trim() : '',
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
  // Error de dominio puro (fechas inválidas en el generador/recálculo).
  if (e instanceof PlanningError) {
    if (e.kind === 'invalid_dates') return 'La fecha de inicio no es válida.';
    return 'No se pudo calcular el cronograma por datos de fechas inconsistentes.';
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
  // Error interno NO esperado del read-model del preview: código seguro y trazable
  // (el detalle queda en el log server-side, sin secretos).
  return 'No se pudo calcular la vista previa. Código: SCHEDULE_PREVIEW_READMODEL_FAILED.';
}

export async function previewScheduleAction(
  _prev: PreviewActionResult | null,
  formData: FormData,
): Promise<PreviewActionResult> {
  const params = parseParams(formData);
  if (!params) return { ok: false, error: 'Completa proyecto, presupuesto y fecha de inicio.' };
  try {
    const viewer = await resolveAuthenticatedViewer();
    const preview = await previewScheduleFromBoq(viewer, params);
    // Versión sin ítems BOQ: causa distinta a "ítems presentes pero no programables".
    if (preview.stats.inputItemCount === 0) {
      return {
        ok: false,
        error:
          'La versión de presupuesto seleccionada no tiene ítems (BOQ). ' +
          'Agrega capítulos e ítems al presupuesto antes de generar un cronograma.',
      };
    }
    if (preview.stats.activityCount === 0) {
      return {
        ok: false,
        error:
          'El presupuesto tiene ítems pero ninguno es programable con las opciones actuales. ' +
          'Revisa que haya ítems con cantidad mayor a 0 o desactiva el filtro “Solo ítems con cantidad mayor a 0”.',
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
  if (!params) return { error: 'Completa proyecto, presupuesto y fecha de inicio.' };
  if (!params.scheduleName) return { error: 'Ingresa un nombre para el cronograma.' };

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
