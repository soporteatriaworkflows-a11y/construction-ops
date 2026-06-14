/**
 * token.ts — Generación y hash de tokens de invitación (sin dependencias).
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/OPERATIONAL_ACCESS_AND_SMTP_V1_CONTRACT.md §2,§7`.
 *
 * El TOKEN plano se entrega al invitado (enlace de aceptación); en la base de
 * datos solo se persiste su HASH SHA-256 (NUNCA el token plano). La verificación
 * compara hashes. No se reinventa criptografía: se usa `node:crypto`.
 */
import { createHash, randomBytes } from 'node:crypto';

export interface InvitationToken {
  /** Token plano (se envía por email / fallback dev). NUNCA se persiste. */
  token: string;
  /** SHA-256 hex del token. Es lo único que se guarda en la base. */
  tokenHash: string;
}

/** Calcula el hash SHA-256 (hex) de un token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Genera un token de invitación seguro (32 bytes, base64url) y su hash.
 * 32 bytes ⇒ ~256 bits de entropía: no adivinable ni enumerable.
 */
export function generateInvitationToken(): InvitationToken {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}
