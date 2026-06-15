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

export async function previewScheduleAction(
  _prev: PreviewActionResult | null,
  formData: FormData,
): Promise<PreviewActionResult> {
  const params = parseParams(formData);
  if (!params) return { ok: false, error: 'Completa proyecto, presupuesto, nombre y fecha de inicio.' };
  try {
    const viewer = await resolveAuthenticatedViewer();
    const preview = await previewScheduleFromBoq(viewer, params);
    return { ok: true, preview };
  } catch (e) {
    if (e instanceof SchedulePermissionError) return { ok: false, error: 'No tienes permiso para crear cronogramas.' };
    if (e instanceof ScheduleValidationError || e instanceof ScheduleNotFoundError) {
      return { ok: false, error: e.message };
    }
    return { ok: false, error: 'No se pudo calcular la vista previa. Revisa los datos.' };
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
    if (e instanceof SchedulePermissionError) return { error: 'No tienes permiso para crear cronogramas.' };
    if (e instanceof AuthError) {
      return {
        error:
          e.reason === 'no_session'
            ? 'Tu sesión expiró. Recarga la página e inicia sesión de nuevo.'
            : 'Sin membresía activa para crear cronogramas.',
      };
    }
    if (e instanceof ScheduleValidationError || e instanceof ScheduleNotFoundError) {
      return { error: e.message };
    }
    return { error: 'No se pudo crear el cronograma. Inténtalo de nuevo.' };
  }
  redirect(`/planning/${scheduleId}`);
}
