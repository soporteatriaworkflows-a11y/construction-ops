/**
 * role-map.ts — FUENTE ÚNICA del mapeo `profiles.role` → `ViewerRole`.
 *
 * Propiedad: orquestador (4A.2). Contrato: `docs/AUTH_RUNTIME_CONTRACT.md §3`.
 * Menor privilegio por defecto: rol desconocido ⇒ `null` (deny).
 */
import type { ViewerRole } from '@/lib/contracts/read-model';
import type { ProfileRole } from './types';

/** Mapeo congelado v1 (AUTH_RUNTIME_CONTRACT §3). */
const PROFILE_ROLE_TO_VIEWER: Record<ProfileRole, ViewerRole> = {
  admin: 'internal',
  presupuestos: 'internal',
  compras: 'internal',
  gerencia: 'management',
  obra: 'site',
  consulta: 'client',
};

/** Orden de privilegio (mayor → menor) para anti-escalamiento de exports. */
export const VIEWER_ROLE_PRIVILEGE: Record<ViewerRole, number> = {
  internal: 3,
  management: 2,
  site: 1,
  client: 0,
};

/**
 * Convierte un `profiles.role` (string libre de la DB) en `ViewerRole`.
 * Devuelve `null` si el rol es desconocido/ausente (deny-by-default).
 */
export function mapProfileRoleToViewerRole(
  profileRole: string | null | undefined,
): ViewerRole | null {
  if (!profileRole) return null;
  const key = profileRole.trim().toLowerCase() as ProfileRole;
  return PROFILE_ROLE_TO_VIEWER[key] ?? null;
}

/**
 * ¿`requested` es igual o MENOS privilegiado que `authenticated`?
 * Usado para impedir escalamiento de perfil en `/api/exports`.
 */
export function isSameOrLessPrivileged(
  requested: ViewerRole,
  authenticated: ViewerRole,
): boolean {
  return VIEWER_ROLE_PRIVILEGE[requested] <= VIEWER_ROLE_PRIVILEGE[authenticated];
}
