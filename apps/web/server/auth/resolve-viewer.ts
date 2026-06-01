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
import type { ViewerContext } from '@/lib/contracts/read-model';
import { getDemoViewer } from '@/server/read-model';
import { createClient } from '@/lib/supabase/server';
import { resolveAuthMode, type AppAuthMode } from '@/lib/supabase/env';
import { getSessionClaims } from './session';
import { mapProfileRoleToViewerRole } from './role-map';
import { AuthError } from './errors';
import type { AuthenticatedViewer } from './types';

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

  return {
    userId: session.userId,
    profileId: data.id as string,
    organizationId: data.organization_id as string,
    role,
    email: (data.email as string | undefined) ?? session.email,
  };
}

/** Proyecta un `AuthenticatedViewer` al `ViewerContext` del read-model. */
export function toViewerContext(v: AuthenticatedViewer): ViewerContext {
  return { organizationId: v.organizationId, role: v.role };
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
