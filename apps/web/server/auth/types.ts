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
