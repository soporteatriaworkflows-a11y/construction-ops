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
 * la URL de destino ni se registra. Se limpia en cuanto la invitación cierra o
 * ante cualquier error terminal, y expira por TTL (nunca queda indefinidamente).
 */
export const PENDING_INVITE_TOKEN_KEY = 'iconic.invite.pendingToken';

/**
 * TTL del token guardado (24 h). El token en `localStorage` solo es un puente
 * para sobrevivir al ida-y-vuelta de confirmación de correo; 24 h cubre al
 * usuario que confirma al día siguiente pero acota la persistencia (higiene:
 * nunca queda indefinidamente). La invitación real sigue expirando en el RPC.
 */
export const PENDING_INVITE_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Códigos de error del RPC `accept_invitation` que son TERMINALES: conservar el
 * token ya no tiene sentido (la invitación no se puede cerrar con él). Se limpia.
 * `no_session` y errores transitorios/desconocidos NO son terminales: se
 * conservan (acotados por el TTL) para permitir reintento cuando haya sesión.
 */
const TERMINAL_ACCEPT_CODES = [
  'invitation_invalid',
  'invitation_revoked',
  'invitation_used',
  'invitation_expired',
  'email_mismatch',
] as const;

/** ¿El mensaje del RPC corresponde a un error terminal de aceptación? */
export function isTerminalAcceptError(message: string | undefined): boolean {
  const raw = (message ?? '').toLowerCase();
  return TERMINAL_ACCEPT_CODES.some((code) => raw.includes(code));
}

/** SHA-256 hex con Web Crypto (equivalente a node:crypto sha256 hex). */
export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Guarda el token pendiente con marca de expiración (no-op fuera del navegador
 * o si falla storage). Solo el token de invitación — NUNCA password ni secretos.
 */
export function storePendingInviteToken(token: string): void {
  if (typeof window === 'undefined' || !token) return;
  try {
    const payload = JSON.stringify({ token, exp: Date.now() + PENDING_INVITE_TOKEN_TTL_MS });
    window.localStorage.setItem(PENDING_INVITE_TOKEN_KEY, payload);
  } catch {
    /* storage bloqueado (modo privado/cuota): degrada a la ruta por URL. */
  }
}

/**
 * Lee el token pendiente guardado (o `null`). Higiene: si está vencido por TTL,
 * malformado o vacío, se LIMPIA el storage y se devuelve `null` (nunca queda
 * un token expirado persistido).
 */
export function readPendingInviteToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PENDING_INVITE_TOKEN_KEY);
    if (!raw) return null;

    let parsed: { token?: unknown; exp?: unknown };
    try {
      parsed = JSON.parse(raw) as { token?: unknown; exp?: unknown };
    } catch {
      clearPendingInviteToken();
      return null;
    }

    const token = typeof parsed.token === 'string' ? parsed.token : '';
    const exp = typeof parsed.exp === 'number' ? parsed.exp : 0;
    if (!token || !exp || Date.now() > exp) {
      clearPendingInviteToken();
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

/** Limpia el token pendiente (tras cerrar la invitación o error terminal). */
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
  | { ok: false; error: string; code: 'no_session' | 'accept_failed'; terminal: boolean };

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
 *
 * Higiene del token (este es el único punto de cierre, así que centraliza la
 * limpieza): en ÉXITO y en ERROR TERMINAL se limpia el token persistido. En
 * `no_session` o errores transitorios/desconocidos se conserva (acotado por el
 * TTL) para permitir reintento.
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
    // Recuperable: sin sesión válida aún. Se conserva el token (TTL lo acota).
    return {
      ok: false,
      code: 'no_session',
      terminal: false,
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

  if (!error) {
    clearPendingInviteToken();
    return { ok: true, alreadyMember: false };
  }

  // Ya tiene profile: la membresía existe. No es un fallo del cierre.
  if ((error.message ?? '').toLowerCase().includes('already_member')) {
    clearPendingInviteToken();
    return { ok: true, alreadyMember: true };
  }

  const terminal = isTerminalAcceptError(error.message);
  if (terminal) clearPendingInviteToken();
  return { ok: false, code: 'accept_failed', terminal, error: mapAcceptError(error.message) };
}
