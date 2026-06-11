/**
 * actions.ts — Server Actions del monitoreo automático de precios (Fase 4A).
 *
 * Propiedad: agent-pricing / agent-frontend-boq.
 * Contrato: docs/PRICE_MONITORING_AGENT_V1_CONTRACT.md §3.3, §6.
 *
 * Reglas:
 *  - organization_id y created_by SIEMPRE server-side (viewer resuelto aquí).
 *  - Mutaciones solo roles management|internal (guard + RLS real en DB).
 *  - Solo mode=db permite escritura (fixture = demo de solo lectura).
 *  - La corrida manual es 100% RLS-bound con el viewer (DbViewerMonitorStore)
 *    y tiene rate limit por ventana de idempotencia (org 5min / target 1min).
 *  - El monitor NUNCA aprueba: solo crea observaciones pending.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { AuthError } from '@/server/auth/errors';
import { parseReadModelSource } from '@/lib/supabase/env';
import { validatePublicUrl } from '@/server/pricing/validation/validate-url';
import { UrlValidationError } from '@/server/pricing/validation/types';
import {
  getMonitorRepository,
  getViewerMonitorStore,
  runManualMonitor,
  ManualRunThrottledError,
  MonitorValidationError,
  MonitorTargetNotFoundError,
  MonitorTargetDuplicateError,
} from '@/server/pricing/monitor';
import { InsufficientRoleError } from '@/server/pricing/errors';
import type { AuthenticatedViewer } from '@/server/auth/types';

export interface MonitorActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  targetId?: string;
  /** Resumen breve de la corrida manual (solo conteos, sin precios). */
  runSummary?: {
    checked: number;
    unchanged: number;
    changed: number;
    pendingCreated: number;
    failed: number;
  };
}

const MUTATION_ROLES = ['management', 'internal'] as const;

function isWriteModeEnabled(): boolean {
  try {
    return parseReadModelSource(process.env.READ_MODEL_SOURCE) === 'db';
  } catch {
    return false;
  }
}

function handleAuthError(e: unknown): MonitorActionResult {
  if (e instanceof AuthError) {
    const msgs: Record<string, string> = {
      no_session: 'No hay sesión activa.',
      no_membership: 'No tienes membresía activa.',
      invalid_role: 'Tu rol no permite esta acción.',
      config: 'Error de configuración.',
    };
    return { success: false, error: msgs[e.reason] ?? 'Error de autenticación.' };
  }
  return { success: false, error: 'Error al verificar la sesión.' };
}

async function resolveAuthorizedViewer(): Promise<
  { viewer: AuthenticatedViewer } | { failure: MonitorActionResult }
> {
  if (!isWriteModeEnabled()) {
    return { failure: { success: false, error: 'Monitoreo no disponible en modo demostración.' } };
  }
  let viewer: AuthenticatedViewer;
  try {
    viewer = await resolveAuthenticatedViewer();
  } catch (e) {
    return { failure: handleAuthError(e) };
  }
  if (!(MUTATION_ROLES as readonly string[]).includes(viewer.role)) {
    return {
      failure: { success: false, error: 'No tienes permiso para gestionar el monitoreo de precios.' },
    };
  }
  return { viewer };
}

function revalidateMonitorPaths(resourceId?: string | null): void {
  revalidatePath('/catalog/monitoring');
  revalidatePath('/dashboard');
  if (resourceId) revalidatePath(`/catalog/resources/${resourceId}/price-intelligence`);
}

/** Habilita «Monitorear esta fuente» (crea target explícito). */
export async function createMonitorTargetAction(
  _prevState: MonitorActionResult | null,
  formData: FormData,
): Promise<MonitorActionResult> {
  const auth = await resolveAuthorizedViewer();
  if ('failure' in auth) return auth.failure;

  const resourceId = (formData.get('resourceId') as string | null) ?? '';
  const sourceUrl = ((formData.get('sourceUrl') as string | null) ?? '').trim();
  const cadenceDays = Number((formData.get('cadenceDays') as string | null) ?? '7');
  const supplierId = ((formData.get('supplierId') as string | null) || null)?.trim() || null;

  // Validación SSRF profunda (DNS incluida) ANTES de persistir el target.
  try {
    await validatePublicUrl(sourceUrl);
  } catch (e) {
    if (e instanceof UrlValidationError) {
      return { success: false, fieldErrors: { sourceUrl: `URL no permitida: ${e.message}` } };
    }
    return { success: false, fieldErrors: { sourceUrl: 'No se pudo validar la URL.' } };
  }

  try {
    const repo = getMonitorRepository();
    const target = await repo.createTarget(auth.viewer, {
      resourceId,
      supplierId,
      sourceUrl,
      cadenceDays,
    });
    revalidateMonitorPaths(resourceId);
    return { success: true, targetId: target.id };
  } catch (e) {
    if (e instanceof MonitorValidationError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) fieldErrors[issue.field] = issue.message;
      return { success: false, fieldErrors };
    }
    if (e instanceof MonitorTargetDuplicateError) {
      return { success: false, error: 'Ya existe un monitoreo para este recurso y URL.' };
    }
    if (e instanceof InsufficientRoleError) {
      return { success: false, error: 'No tienes permiso para habilitar monitoreo.' };
    }
    return { success: false, error: 'No se pudo habilitar el monitoreo. Intenta de nuevo.' };
  }
}

/** Pausa o reanuda un target (enabled). Nunca borra. */
export async function toggleMonitorTargetAction(
  _prevState: MonitorActionResult | null,
  formData: FormData,
): Promise<MonitorActionResult> {
  const auth = await resolveAuthorizedViewer();
  if ('failure' in auth) return auth.failure;

  const targetId = (formData.get('targetId') as string | null) ?? '';
  const enabled = (formData.get('enabled') as string | null) === 'true';
  const resourceId = (formData.get('resourceId') as string | null) || null;
  if (!targetId) return { success: false, error: 'ID de monitoreo faltante.' };

  try {
    const repo = getMonitorRepository();
    const target = await repo.setTargetEnabled(auth.viewer, targetId, enabled);
    revalidateMonitorPaths(resourceId);
    return { success: true, targetId: target.id };
  } catch (e) {
    if (e instanceof MonitorTargetNotFoundError) {
      return { success: false, error: 'Monitoreo no encontrado.' };
    }
    if (e instanceof InsufficientRoleError) {
      return { success: false, error: 'No tienes permiso para modificar el monitoreo.' };
    }
    return { success: false, error: 'No se pudo actualizar el monitoreo.' };
  }
}

/** Cambia la frecuencia (1/7/15/30 días). */
export async function updateMonitorCadenceAction(
  _prevState: MonitorActionResult | null,
  formData: FormData,
): Promise<MonitorActionResult> {
  const auth = await resolveAuthorizedViewer();
  if ('failure' in auth) return auth.failure;

  const targetId = (formData.get('targetId') as string | null) ?? '';
  const cadenceDays = Number((formData.get('cadenceDays') as string | null) ?? '');
  const resourceId = (formData.get('resourceId') as string | null) || null;
  if (!targetId) return { success: false, error: 'ID de monitoreo faltante.' };

  try {
    const repo = getMonitorRepository();
    const target = await repo.updateTargetCadence(auth.viewer, targetId, cadenceDays);
    revalidateMonitorPaths(resourceId);
    return { success: true, targetId: target.id };
  } catch (e) {
    if (e instanceof MonitorValidationError) {
      return { success: false, fieldErrors: { cadenceDays: 'La frecuencia debe ser 1, 7, 15 o 30 días.' } };
    }
    if (e instanceof MonitorTargetNotFoundError) {
      return { success: false, error: 'Monitoreo no encontrado.' };
    }
    if (e instanceof InsufficientRoleError) {
      return { success: false, error: 'No tienes permiso para modificar el monitoreo.' };
    }
    return { success: false, error: 'No se pudo actualizar la frecuencia.' };
  }
}

/**
 * Corrida manual: org-wide (sin targetId) o «Revisar ahora» de un target.
 * RLS-bound con el viewer real; auditada (initiated_by); rate-limited.
 */
export async function runMonitorNowAction(
  _prevState: MonitorActionResult | null,
  formData: FormData,
): Promise<MonitorActionResult> {
  const auth = await resolveAuthorizedViewer();
  if ('failure' in auth) return auth.failure;

  const targetId = ((formData.get('targetId') as string | null) || null)?.trim() || null;
  const resourceId = (formData.get('resourceId') as string | null) || null;

  try {
    const store = getViewerMonitorStore(auth.viewer);
    const summary = await runManualMonitor(store, {
      organizationId: auth.viewer.organizationId,
      initiatedBy: auth.viewer.profileId,
      ...(targetId ? { targetId } : {}),
    });
    revalidateMonitorPaths(resourceId);
    return { success: true, runSummary: summary.counters };
  } catch (e) {
    if (e instanceof ManualRunThrottledError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: 'No se pudo ejecutar la revisión. Intenta de nuevo.' };
  }
}
