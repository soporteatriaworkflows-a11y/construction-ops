/**
 * errors.ts — Errores del runtime de autenticación (deny-by-default).
 * Propiedad: orquestador (4A.2). Mensajes legibles, SIN stack ni detalle técnico.
 */

/** Motivo por el que no se pudo resolver un viewer autenticado. */
export type AuthDenyReason =
  | 'no_session'
  | 'no_membership'
  | 'invalid_role'
  | 'config';

/** Error de autenticación/autorización; deny-by-default. */
export class AuthError extends Error {
  readonly reason: AuthDenyReason;
  constructor(reason: AuthDenyReason, message: string) {
    super(message);
    this.name = 'AuthError';
    this.reason = reason;
  }
}
