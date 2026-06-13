/**
 * actions.ts — Server Actions de la reconciliación APU
 * (APU_COMPONENT_RESOURCE_RECONCILIATION_V1, contrato §8).
 *
 * Seguridad:
 *  - Modo supabase+db obligatorio (isCreationModeEnabled).
 *  - viewer server-side; rol management/internal (la RPC re-valida el rol en DB).
 *  - organization_id / actor SIEMPRE server-side (RLS + RPC).
 *  - Idempotencia: la clave la aporta el cliente (estable entre reintentos); si
 *    falta, se genera una (sin idempotencia entre reintentos pero seguro).
 *  - Errores sanitizados.
 */
'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { AuthError } from '@/server/auth/errors';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import {
  reconcileComponent,
  reconcileBulk,
  updateReconciliation,
  searchResources,
  ReconciliationInputError,
  ReconciliationBulkLimitError,
} from '@/server/apu-reconciliation';
import type {
  BulkReconcilePair,
  BulkReconcileResult,
  ReconcileActionResult,
  ResourceSearchResult,
} from '@/lib/apu-reconciliation/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Viewer = Awaited<ReturnType<typeof resolveAuthenticatedViewer>>;

function authMessage(e: AuthError): string {
  const messages: Record<string, string> = {
    no_session: 'No hay sesión activa. Por favor inicia sesión.',
    no_membership: 'No tienes membresía activa en ninguna organización.',
    invalid_role: 'Tu rol no permite realizar esta acción.',
    config: 'Error de configuración del servidor.',
  };
  return messages[e.reason] ?? 'Error de autenticación.';
}

function canMutate(viewer: Viewer): boolean {
  return ['management', 'internal'].includes(viewer.role);
}

function sanitize(e: unknown): string {
  if (e instanceof ReconciliationInputError || e instanceof ReconciliationBulkLimitError) {
    return e.message;
  }
  if (e instanceof Error && /insufficient_role|42501/.test(e.message)) {
    return 'Tu rol no permite reconciliar recursos.';
  }
  return 'No se pudo completar la reconciliación. Intenta de nuevo.';
}

function uuidOrNull(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return UUID_RE.test(v) ? v : null;
}

function idempotencyKey(raw: FormDataEntryValue | null): string {
  if (typeof raw === 'string' && raw.trim() !== '') return raw.trim().slice(0, 128);
  return randomUUID();
}

async function guard(): Promise<{ viewer: Viewer } | { error: string }> {
  if (!isCreationModeEnabled()) {
    return { error: 'La reconciliación requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db.' };
  }
  try {
    const viewer = await resolveAuthenticatedViewer();
    if (!canMutate(viewer)) return { error: 'Tu rol no permite reconciliar recursos.' };
    return { viewer };
  } catch (e) {
    return { error: e instanceof AuthError ? authMessage(e) : 'Error al verificar la sesión.' };
  }
}

export type ReconcileActionResponse =
  | { ok: true; result: ReconcileActionResult }
  | { ok: false; error: string };

export type BulkActionResponse =
  | { ok: true; result: BulkReconcileResult }
  | { ok: false; error: string };

export type UpdateActionResponse =
  | { ok: true; newState: string }
  | { ok: false; error: string };

export type SearchActionResponse =
  | { ok: true; results: ResourceSearchResult[] }
  | { ok: false; error: string };

/** Asociar / confirmar sugerencia (individual). */
export async function reconcileComponentAction(
  formData: FormData,
): Promise<ReconcileActionResponse> {
  const g = await guard();
  if ('error' in g) return { ok: false, error: g.error };
  const componentId = uuidOrNull(formData.get('componentId'));
  const resourceId = uuidOrNull(formData.get('resourceId'));
  if (!componentId || !resourceId) {
    return { ok: false, error: 'Componente o recurso inválido.' };
  }
  const keepSnapshot = formData.get('keepSnapshot') !== 'false';
  try {
    const result = await reconcileComponent(
      g.viewer,
      componentId,
      resourceId,
      keepSnapshot,
      idempotencyKey(formData.get('idempotencyKey')),
    );
    revalidatePath('/apu/reconciliation');
    revalidatePath('/apu');
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: sanitize(e) };
  }
}

/** Asociación masiva seleccionada (preview + modal en la UI). */
export async function reconcileBulkAction(
  formData: FormData,
): Promise<BulkActionResponse> {
  const g = await guard();
  if ('error' in g) return { ok: false, error: g.error };
  const pairs = parsePairs(formData.get('pairs'));
  if (pairs.length === 0) return { ok: false, error: 'Selección vacía.' };
  const keepSnapshot = formData.get('keepSnapshot') !== 'false';
  try {
    const result = await reconcileBulk(
      g.viewer,
      pairs,
      keepSnapshot,
      idempotencyKey(formData.get('idempotencyKey')),
    );
    revalidatePath('/apu/reconciliation');
    revalidatePath('/apu');
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: sanitize(e) };
  }
}

/** Rechazar sugerencia / dejar pendiente / limpiar asociación. */
export async function updateReconciliationAction(
  formData: FormData,
): Promise<UpdateActionResponse> {
  const g = await guard();
  if ('error' in g) return { ok: false, error: g.error };
  const componentId = uuidOrNull(formData.get('componentId'));
  const action = formData.get('action');
  if (!componentId || (action !== 'reject' && action !== 'leave_pending' && action !== 'clear')) {
    return { ok: false, error: 'Acción inválida.' };
  }
  try {
    const res = await updateReconciliation(
      g.viewer,
      componentId,
      action,
      idempotencyKey(formData.get('idempotencyKey')),
    );
    revalidatePath('/apu/reconciliation');
    revalidatePath('/apu');
    return { ok: true, newState: res.newState };
  } catch (e) {
    return { ok: false, error: sanitize(e) };
  }
}

/** Búsqueda manual de recurso (inline, máx 20). */
export async function searchResourcesAction(
  formData: FormData,
): Promise<SearchActionResponse> {
  const g = await guard();
  if ('error' in g) return { ok: false, error: g.error };
  const query = typeof formData.get('query') === 'string' ? (formData.get('query') as string) : '';
  const rawUnit = typeof formData.get('rawUnit') === 'string' ? (formData.get('rawUnit') as string) : null;
  try {
    const results = await searchResources(g.viewer, query, rawUnit);
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: sanitize(e) };
  }
}

const PAIR_LIMIT = 50;

function parsePairs(raw: FormDataEntryValue | null): BulkReconcilePair[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: BulkReconcilePair[] = [];
  for (const entry of data.slice(0, PAIR_LIMIT)) {
    if (
      entry &&
      typeof entry === 'object' &&
      UUID_RE.test((entry as { componentId?: unknown }).componentId as string) &&
      UUID_RE.test((entry as { resourceId?: unknown }).resourceId as string)
    ) {
      out.push({
        componentId: (entry as { componentId: string }).componentId,
        resourceId: (entry as { resourceId: string }).resourceId,
      });
    }
  }
  return out;
}
