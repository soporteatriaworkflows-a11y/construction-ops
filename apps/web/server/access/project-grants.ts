/**
 * project-grants.ts — Gestión server-side de proyectos asignados a usuarios
 * `consulta` (V5.6.4 CLIENT_PROJECT_SCOPE).
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/design-references/V5_6_4_CLIENT_PROJECT_SCOPE.md §5,§8 (UI)`.
 *
 * Reglas:
 *  - Mutaciones EXCLUSIVAMENTE vía RPCs SECURITY DEFINER
 *    (`grant_project_access` / `revoke_project_access`): org/actor/rol
 *    server-side, solo admin/gerencia, destino solo rol `consulta`, auditadas.
 *    El check `canManageAccess` aquí es defensa en profundidad, no el guard real.
 *  - Lectura RLS-bound (la política de `project_access_grants` limita a la
 *    propia fila o a gestión admin/gerencia dentro de la organización).
 *  - Modo demo/fixture: solo visualización (sin grants persistidos).
 *  - NUNCA service_role.
 */
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Uuid } from '@/lib/contracts/read-model';
import { canManageAccess } from './permissions';
import { AccessError, mapRpcError } from './errors';
import type { AccessActor } from './types';

export interface ProjectGrantsDeps {
  clientFactory?: () => Promise<SupabaseClient>;
}

/** Fila de asignación usuario↔proyecto visible para gestión. */
export interface ProjectGrantRow {
  profileId: Uuid;
  projectId: Uuid;
  createdAt: string;
}

function resolveSource(): 'db' | 'fixture' {
  return process.env.READ_MODEL_SOURCE === 'db' ? 'db' : 'fixture';
}

/**
 * Lista las asignaciones de proyecto de la organización (para la UI de
 * `/settings/access`). La RLS limita el resultado a la organización del actor
 * y exige rol de gestión para ver filas de terceros. Fixture ⇒ [].
 */
export async function listProjectGrants(
  deps: ProjectGrantsDeps = {},
): Promise<ProjectGrantRow[]> {
  if (resolveSource() === 'fixture') return [];
  const supabase = await (deps.clientFactory ?? createClient)();
  const { data, error } = await supabase
    .from('project_access_grants')
    .select('profile_id, project_id, created_at');
  if (error || !data) return [];
  return data.map((row) => {
    const r = row as { profile_id: string; project_id: string; created_at: string };
    return { profileId: r.profile_id, projectId: r.project_id, createdAt: r.created_at };
  });
}

/** Asigna un proyecto a un usuario `consulta` (RPC auditada, idempotente). */
export async function grantProjectAccess(
  actor: AccessActor,
  targetUserId: Uuid,
  projectId: Uuid,
  deps: ProjectGrantsDeps = {},
): Promise<{ status: 'granted' | 'already_granted' }> {
  assertManager(actor);
  const supabase = await (deps.clientFactory ?? createClient)();
  const { data, error } = await supabase.rpc('grant_project_access', {
    p_target_user_id: targetUserId,
    p_project_id: projectId,
  });
  if (error) throw mapRpcError(error);
  const result = data as { status: 'granted' | 'already_granted' };
  return { status: result.status };
}

/** Retira un proyecto asignado (RPC auditada). */
export async function revokeProjectAccess(
  actor: AccessActor,
  targetUserId: Uuid,
  projectId: Uuid,
  deps: ProjectGrantsDeps = {},
): Promise<{ status: 'revoked' }> {
  assertManager(actor);
  const supabase = await (deps.clientFactory ?? createClient)();
  const { error } = await supabase.rpc('revoke_project_access', {
    p_target_user_id: targetUserId,
    p_project_id: projectId,
  });
  if (error) throw mapRpcError(error);
  return { status: 'revoked' };
}

function assertManager(actor: AccessActor): void {
  if (!canManageAccess(actor.profileRole)) {
    throw new AccessError('insufficient_role', 'No tienes permisos para gestionar accesos.');
  }
}
