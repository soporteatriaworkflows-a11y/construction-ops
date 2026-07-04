/**
 * types.ts — Tipos del runtime de autenticación (Oleada 4A.2).
 *
 * Propiedad: orquestador. Contrato: `docs/AUTH_RUNTIME_CONTRACT.md` +
 * `docs/AUTH_CONTRACT.md §2`.
 */
import type { ProjectGrants, Uuid, ViewerRole } from '@/lib/contracts/read-model';

/** Rol interno de `profiles` (DB). */
export type ProfileRole =
  | 'admin'
  | 'gerencia'
  | 'presupuestos'
  | 'obra'
  | 'compras'
  | 'consulta';

/**
 * V5.6.6C (INTERNAL_PROJECT_GRANTS): roles cuyo alcance de proyectos se
 * limita a `project_access_grants` (deny-by-default sin asignación explícita;
 * backfill de continuidad para usuarios existentes en la migración).
 * admin/gerencia/presupuestos son allow-all por decisión aprobada.
 */
export const SCOPED_PROFILE_ROLES: readonly ProfileRole[] = [
  'consulta',
  'obra',
  'compras',
];

export function isScopedProfileRole(
  profileRole: string | null | undefined,
): boolean {
  if (!profileRole) return false;
  return (SCOPED_PROFILE_ROLES as readonly string[]).includes(profileRole);
}

/**
 * Viewer real, resuelto SOLO server-side desde la sesión válida y `profiles`.
 * Espejo de `AuthenticatedViewer` del AUTH_CONTRACT.
 */
export interface AuthenticatedViewer {
  userId: Uuid;
  profileId: Uuid;
  organizationId: Uuid;
  role: ViewerRole;
  email?: string;
  /**
   * Alcance de proyectos (V5.6.4 CLIENT_PROJECT_SCOPE): `'all'` para roles no
   * restringidos; lista de proyectos asignados (`project_access_grants`) para
   * `client`. Resuelto SIEMPRE server-side por `resolveAuthenticatedViewer`.
   * Opcional SOLO para los literales demo existentes (roles internos):
   * `undefined` + rol `client` se normaliza a `[]` (deny-by-default) en
   * `toViewerContext` y en los route handlers de exports.
   */
  projectGrants?: ProjectGrants;
  /**
   * V5.6.6B: rol de `profiles` (DB) para gates de SUPERFICIE por acción
   * (p. ej. compras no edita presupuesto/AIU aunque su ViewerRole sea
   * `internal`). Opcional por los literales demo existentes; deny-by-default
   * en los helpers de `server/access/budget-surface.ts`.
   */
  profileRole?: ProfileRole;
}
