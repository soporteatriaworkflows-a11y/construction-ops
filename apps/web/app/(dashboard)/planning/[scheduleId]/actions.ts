/**
 * actions.ts — Server Actions del detalle de cronograma (SCHEDULE_FROM_BOQ_V1, Fase 5).
 * Edición de tareas (avance/duración/cuadrilla), dependencias y archivado.
 * Permisos/RLS server-side; recálculo de fechas tras cambios estructurales.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import {
  updateScheduleTask,
  addScheduleDependency,
  archiveScheduleForViewer,
  SchedulePermissionError,
  ScheduleValidationError,
  ScheduleNotFoundError,
} from '@/server/planning';
import type { DependencyType } from '@/lib/contracts/read-model';

export interface ActionResult {
  ok?: boolean;
  error?: string;
}

function mapError(e: unknown): ActionResult {
  if (e instanceof SchedulePermissionError) return { error: 'No tienes permiso para esta acción.' };
  if (e instanceof ScheduleValidationError || e instanceof ScheduleNotFoundError) {
    return { error: (e as Error).message };
  }
  return { error: 'No se pudo completar la operación. Inténtalo de nuevo.' };
}

export async function updateTaskAction(
  scheduleId: string,
  taskId: string,
  patch: {
    durationDays?: number;
    progressPct?: number;
    status?: string;
    crewLabel?: string | null;
    crewSize?: number | null;
    responsible?: string | null;
  },
): Promise<ActionResult> {
  try {
    const viewer = await resolveAuthenticatedViewer();
    await updateScheduleTask(viewer, { scheduleId, taskId, ...patch });
    revalidatePath(`/planning/${scheduleId}`);
    return { ok: true };
  } catch (e) {
    return mapError(e);
  }
}

export async function addDependencyAction(
  scheduleId: string,
  predecessorTaskId: string,
  successorTaskId: string,
  dependencyType: DependencyType,
  lagDays: number,
): Promise<ActionResult> {
  try {
    const viewer = await resolveAuthenticatedViewer();
    await addScheduleDependency(viewer, {
      scheduleId,
      predecessorTaskId,
      successorTaskId,
      dependencyType,
      lagDays,
    });
    revalidatePath(`/planning/${scheduleId}`);
    return { ok: true };
  } catch (e) {
    return mapError(e);
  }
}

export async function archiveScheduleAction(scheduleId: string): Promise<ActionResult> {
  try {
    const viewer = await resolveAuthenticatedViewer();
    await archiveScheduleForViewer(viewer, scheduleId);
    revalidatePath(`/planning/${scheduleId}`);
    revalidatePath('/planning');
    return { ok: true };
  } catch (e) {
    return mapError(e);
  }
}
