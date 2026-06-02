/**
 * types.ts — Tipos del runtime de autenticación (Oleada 4A.2).
 *
 * Propiedad: orquestador. Contrato: `docs/AUTH_RUNTIME_CONTRACT.md` +
 * `docs/AUTH_CONTRACT.md §2`.
 */
import type { Uuid, ViewerRole } from '@/lib/contracts/read-model';

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
}
