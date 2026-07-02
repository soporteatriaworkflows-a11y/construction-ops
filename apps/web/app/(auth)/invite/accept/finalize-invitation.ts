/**
 * finalize-invitation.ts — Cierre ROBUSTO de la aceptación de invitación.
 *
 * Propiedad: agent-orchestrator (runtime auth). Contrato:
 * `docs/OPERATIONAL_ACCESS_AND_SMTP_V1_CONTRACT.md §4`.
 *
 * Motivación (V5.6.1E): el patch anterior (V5.6.1D) solo finalizaba la
 * invitación si el invitado regresaba a `/invite/accept?token=…` CON el token
 * original en la URL después de confirmar el correo. En producción ese
 * ida-y-vuelta no entrega el token de forma confiable (allow-list de redirect /
 * Site URL de Supabase / escáneres de enlaces de correo / el usuario inicia
 * sesión en vez de reabrir el enlace). Resultado: el usuario Auth queda
 * autenticado SIN `profiles` → "El usuario no tiene membresía.".
 *
 * Este módulo elimina esa dependencia frágil:
 *  - persiste el token en el navegador del invitado (su propio secreto, NUNCA
 *    en la URL ni en logs) para sobrevivir al ida-y-vuelta de confirmación;
 *  - expone `finalizeInviteAcceptance`, un cierre idempotente que deriva el
 *    email del usuario Auth (evita mismatch por casing/alias) y usa el RPC
 *    `accept_invitation` como ÚNICA autoridad (no escribe `profiles` directo).
 *
 * Reusado por el formulario de aceptación y por la recuperación de membresía.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { mapAcceptError } from './invite-accept-flow';

/**
 * Clave de almacenamiento del token pendiente en el navegador del invitado.
 * Es su propio secreto de invitación, en su propio dispositivo: nunca viaja en
 * la URL de destino ni se registra. Se limpia en cuanto la invitación cierra.
 */
export const PENDING_INVITE_TOKEN_KEY = 'iconic.invite.pendingToken';

/** SHA-256 hex con Web Crypto (equivalente a node:crypto sha256 hex). */
export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Guarda el token pendiente (no-op fuera del navegador o si falla storage). */
export function storePendingInviteToken(token: string): void {
  if (typeof window === 'undefined' || !token) return;
  try {
    window.localStorage.setItem(PENDING_INVITE_TOKEN_KEY, token);
  } catch {
    /* storage bloqueado (modo privado/cuota): degrada a la ruta por URL. */
  }
}

/** Lee el token pendiente guardado (o `null`). */
export function readPendingInviteToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const token = window.localStorage.getItem(PENDING_INVITE_TOKEN_KEY);
    return token && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/** Limpia el token pendiente (tras cerrar la invitación con éxito). */
export function clearPendingInviteToken(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
  } catch {
    /* no-op */
  }
}

export type FinalizeResult =
  | { ok: true; alreadyMember: boolean }
  | { ok: false; error: string; code: 'no_session' | 'accept_failed' };

/**
 * Finaliza la aceptación con la sesión activa del invitado.
 *
 * Reglas:
 *  - Requiere un usuario Auth (sesión). NO exige `profiles` (un usuario Auth sin
 *    membresía DEBE poder finalizar): por eso usa `auth.getUser()`, no el viewer.
 *  - Deriva el email del usuario Auth y lo pasa al RPC — el RPC compara contra
 *    el email de la invitación en minúsculas, evitando mismatch por casing.
 *  - El RPC `accept_invitation` es la ÚNICA autoridad: crea el `profiles` y marca
 *    la invitación. Aquí NUNCA se escribe `profiles` ni se usa service_role.
 *  - `already_member` se trata como éxito: ya existe membresía.
 */
export async function finalizeInviteAcceptance(
  supabase: SupabaseClient,
  token: string,
  fullName?: string | null,
): Promise<FinalizeResult> {
  // Sesión = usuario Auth. NO depende de que exista profile/membresía.
  const { data, error: userError } = await supabase.auth.getUser();
  const user = data?.user ?? null;
  if (userError || !user) {
    return {
      ok: false,
      code: 'no_session',
      error: 'No se pudo verificar tu sesión. Inicia sesión e intenta de nuevo.',
    };
  }

  const email = (user.email ?? '').trim();
  const tokenHash = await sha256Hex(token);
  const { error } = await supabase.rpc('accept_invitation', {
    p_token_hash: tokenHash,
    p_email: email,
    p_full_name: fullName && fullName.trim() ? fullName.trim() : null,
  });

  if (!error) return { ok: true, alreadyMember: false };

  // Ya tiene profile: la membresía existe. No es un fallo del cierre.
  if ((error.message ?? '').toLowerCase().includes('already_member')) {
    return { ok: true, alreadyMember: true };
  }

  return { ok: false, code: 'accept_failed', error: mapAcceptError(error.message) };
}
