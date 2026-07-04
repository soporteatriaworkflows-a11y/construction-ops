/**
 * resolve-viewer.ts — Resolución del viewer según el modo de autenticación.
 *
 * Propiedad: orquestador (4A.2). Contrato: `docs/AUTH_RUNTIME_CONTRACT.md §3,§7`
 * + `docs/AUTH_CONTRACT.md §2`.
 *
 * Reglas:
 *  - `APP_AUTH_MODE=demo` ⇒ `getDemoViewer()` (fixture). NO sesión.
 *  - `APP_AUTH_MODE=supabase` ⇒ sesión válida → `profiles` (por `auth.uid()`)
 *    → `AuthenticatedViewer`. Deny-by-default sin sesión/membresía/rol.
 *  - Organización y rol SIEMPRE server-side; nunca desde el navegador.
 *  - Sin fallback silencioso entre modos.
 */
import type { ProjectGrants, ViewerContext } from '@/lib/contracts/read-model';
import { getDemoViewer } from '@/server/read-model';
import { createClient } from '@/lib/supabase/server';
import { resolveAuthMode, type AppAuthMode } from '@/lib/supabase/env';
import { getSessionClaims } from './session';
import { mapProfileRoleToViewerRole } from './role-map';
import { AuthError } from './errors';
import { isScopedProfileRole, type AuthenticatedViewer, type ProfileRole } from './types';

/**
 * Resuelve el `AuthenticatedViewer` real desde la sesión de Supabase y la fila
 * de `profiles` del usuario. Lanza `AuthError` (deny) si falta sesión,
 * membresía o el rol no mapea. NUNCA usa service_role ni acepta org del cliente.
 */
export async function resolveAuthenticatedViewer(): Promise<AuthenticatedViewer> {
  const session = await getSessionClaims();
  if (!session) {
    throw new AuthError('no_session', 'No hay sesión válida.');
  }

  const supabase = await createClient();
  // RLS permite al usuario leer su propia fila de profiles (id = auth.uid()).
  const { data, error } = await supabase
    .from('profiles')
    .select('id, organization_id, role, email')
    .eq('id', session.userId)
    .maybeSingle();

  if (error || !data) {
    throw new AuthError('no_membership', 'El usuario no tiene membresía.');
  }

  const role = mapProfileRoleToViewerRole(data.role as string | null);
  if (!role) {
    throw new AuthError('invalid_role', 'El rol del perfil no es válido.');
  }
  if (!data.organization_id) {
    throw new AuthError('no_membership', 'El perfil no tiene organización.');
  }

  // V5.6.4 + V5.6.6C (INTERNAL_PROJECT_GRANTS): los roles SCOPED (consulta,
  // obra, compras) quedan restringidos a sus proyectos asignados; sus grants
  // se leen RLS-bound (fila propia). Deny-by-default: ante cualquier error de
  // lectura el alcance es la lista vacía (0 proyectos), nunca fail-open.
  // admin/gerencia/presupuestos: allow-all (decisión aprobada V5.6.6C).
  const projectGrants: ProjectGrants = isScopedProfileRole(data.role as string)
    ? await resolveClientProjectGrants(supabase, data.id as string)
    : 'all';

  return {
    userId: session.userId,
    profileId: data.id as string,
    organizationId: data.organization_id as string,
    role,
    email: (data.email as string | undefined) ?? session.email,
    projectGrants,
    // V5.6.6B: rol de profiles para gates de superficie (budget-surface.ts).
    profileRole: data.role as ProfileRole,
  };
}

/**
 * Proyectos asignados (`project_access_grants`) del profile `client`. La RLS
 * de la tabla limita el SELECT a las filas propias. Fail-closed: error ⇒ [].
 */
async function resolveClientProjectGrants(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
): Promise<readonly string[]> {
  const { data, error } = await supabase
    .from('project_access_grants')
    .select('project_id')
    .eq('profile_id', profileId);
  if (error || !data) {
    console.warn(
      '[auth] lectura de project_access_grants falló; alcance client fail-closed (0 proyectos).',
    );
    return [];
  }
  return data
    .map((row) => (row as { project_id: string | null }).project_id)
    .filter((id): id is string => !!id);
}

/**
 * Proyecta un `AuthenticatedViewer` al `ViewerContext` del read-model.
 * Acarrea `profileId` (claim `sub` de las lecturas RLS-scoped: la política
 * project-scoped de `projects` lo necesita) y `projectGrants` (choke point
 * app-layer del read-model). Doble barrera coherente.
 */
export function toViewerContext(v: AuthenticatedViewer): ViewerContext {
  return {
    organizationId: v.organizationId,
    profileId: v.profileId,
    role: v.role,
    // Normalización fail-closed: un viewer `client` o de rol scoped
    // (obra/compras, V5.6.6C) sin grants resueltos ⇒ [].
    projectGrants:
      v.projectGrants ??
      (v.role === 'client' || isScopedProfileRole(v.profileRole) ? [] : 'all'),
    // V5.6.6B: acarrea el rol de profiles para gates de superficie.
    profileRole: v.profileRole,
  };
}

/**
 * Selector de viewer por modo. SIN fallback silencioso.
 *  - `demo`     → `getDemoViewer()` (fixture).
 *  - `supabase` → `resolveAuthenticatedViewer()` (sesión→profiles).
 *
 * @param mode - Modo activo (por defecto el de `APP_AUTH_MODE`).
 */
export async function resolveViewer(
  mode: AppAuthMode = resolveAuthMode(),
): Promise<ViewerContext> {
  if (mode === 'demo') {
    return getDemoViewer();
  }
  const authed = await resolveAuthenticatedViewer();
  return toViewerContext(authed);
}
