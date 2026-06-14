/**
 * permissions.ts — Reglas PURAS de permisos de acceso (sin I/O).
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/OPERATIONAL_ACCESS_AND_SMTP_V1_CONTRACT.md §3`.
 *
 * El gating de gestión de usuarios se decide por `profiles.role` (no por el
 * `ViewerRole` agregado, que no distingue admin de otros internos). Estas
 * reglas son el espejo en TS de los guards SQL de las RPCs SECURITY DEFINER —
 * defensa en profundidad, NO la única barrera (el backstop es el SQL).
 */
import type { ProfileRole } from '@/server/auth/types';

/** Los 6 roles válidos (mismo dominio que profiles.role / el CHECK SQL). */
export const PROFILE_ROLES: readonly ProfileRole[] = [
  'admin',
  'gerencia',
  'presupuestos',
  'obra',
  'compras',
  'consulta',
] as const;

/** Roles que pueden gestionar accesos (ver/invitar/revocar/cambiar rol). */
export const MANAGEMENT_ROLES: readonly ProfileRole[] = ['admin', 'gerencia'] as const;

/** ¿Es un rol de gestión de accesos? */
export function canManageAccess(role: string | null | undefined): role is ProfileRole {
  return role === 'admin' || role === 'gerencia';
}

/** ¿`value` es un ProfileRole válido? */
export function isProfileRole(value: string | null | undefined): value is ProfileRole {
  return !!value && (PROFILE_ROLES as readonly string[]).includes(value);
}

/**
 * Roles que `actorRole` puede ASIGNAR (al invitar o al cambiar rol):
 *  - admin    → los 6 roles.
 *  - gerencia → todos MENOS admin (solo admin asigna admin).
 *  - otros    → ninguno.
 */
export function assignableRoles(actorRole: string | null | undefined): ProfileRole[] {
  if (actorRole === 'admin') return [...PROFILE_ROLES];
  if (actorRole === 'gerencia') return PROFILE_ROLES.filter((r) => r !== 'admin');
  return [];
}

/** ¿`actorRole` puede asignar `targetRole`? */
export function canAssignRole(
  actorRole: string | null | undefined,
  targetRole: string,
): boolean {
  return assignableRoles(actorRole).includes(targetRole as ProfileRole);
}

export interface RoleChangeDecision {
  ok: boolean;
  /** Código de rechazo (espejo de los errcodes SQL) cuando `ok=false`. */
  reason?:
    | 'insufficient_role'
    | 'cannot_change_self'
    | 'invalid_role'
    | 'cannot_manage_admin';
}

/**
 * Evalúa si `actor` puede cambiar el rol de un miembro. Espejo de
 * `public.change_member_role` (anti-escalamiento):
 *  - actor debe ser admin/gerencia;
 *  - nadie cambia su propio rol;
 *  - newRole debe ser válido;
 *  - gerencia no asigna admin ni modifica a un admin existente.
 */
export function evaluateRoleChange(params: {
  actorRole: string | null | undefined;
  actorIsTarget: boolean;
  targetCurrentRole: string;
  newRole: string;
}): RoleChangeDecision {
  const { actorRole, actorIsTarget, targetCurrentRole, newRole } = params;
  if (!canManageAccess(actorRole)) return { ok: false, reason: 'insufficient_role' };
  if (actorIsTarget) return { ok: false, reason: 'cannot_change_self' };
  if (!isProfileRole(newRole)) return { ok: false, reason: 'invalid_role' };
  if (actorRole === 'gerencia' && (newRole === 'admin' || targetCurrentRole === 'admin')) {
    return { ok: false, reason: 'cannot_manage_admin' };
  }
  return { ok: true };
}
