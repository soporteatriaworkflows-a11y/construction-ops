/**
 * actor.ts — Resolución server-side del actor de acceso.
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/OPERATIONAL_ACCESS_AND_SMTP_V1_CONTRACT.md §3,§7`.
 *
 * - Modo `supabase`: sesión válida → fila propia de `profiles` (self-select RLS)
 *   → `AccessActor` con el `profiles.role` REAL. Deny-by-default sin sesión.
 * - Modo `demo`: actor sintético (admin) sobre la org demo, SOLO para navegar la
 *   UI con datos fixture; las mutaciones reales requieren modo supabase.
 *
 * organizationId y profileRole SIEMPRE server-side; jamás desde el navegador.
 */
import { createClient } from '@/lib/supabase/server';
import { resolveAuthMode } from '@/lib/supabase/env';
import { getDemoViewer } from '@/server/read-model';
import { getSessionClaims } from '@/server/auth/session';
import { AuthError } from '@/server/auth/errors';
import { isProfileRole } from './permissions';
import type { AccessActor } from './types';

/**
 * Resuelve el `AccessActor` real. Lanza `AuthError` si no hay sesión, membresía
 * o el rol no es válido.
 */
export async function resolveAccessActor(): Promise<AccessActor> {
  if (resolveAuthMode() === 'demo') {
    const demo = getDemoViewer();
    return {
      userId: '00000000-0000-0000-0000-0000000000b1',
      organizationId: demo.organizationId,
      profileRole: 'admin',
      email: 'demo@iconic.test',
    };
  }

  const session = await getSessionClaims();
  if (!session) {
    throw new AuthError('no_session', 'No hay sesión válida.');
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, organization_id, role, email')
    .eq('id', session.userId)
    .maybeSingle();

  if (error || !data) {
    throw new AuthError('no_membership', 'El usuario no tiene membresía.');
  }
  if (!data.organization_id) {
    throw new AuthError('no_membership', 'El perfil no tiene organización.');
  }
  const role = data.role as string | null;
  if (!isProfileRole(role)) {
    throw new AuthError('invalid_role', 'El rol del perfil no es válido.');
  }

  return {
    userId: data.id as string,
    organizationId: data.organization_id as string,
    profileRole: role,
    email: (data.email as string | undefined) ?? session.email,
  };
}
