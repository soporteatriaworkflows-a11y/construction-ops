/**
 * session.ts — Acceso a la sesión server-side (claims validados).
 *
 * Propiedad: orquestador (4A.2). Contrato: `docs/AUTH_RUNTIME_CONTRACT.md §7`.
 *
 * Usa `supabase.auth.getClaims()` (valida la firma del JWT) — NUNCA
 * `getSession()` como barrera. Devuelve el `userId` (sub) o `null`.
 */
import { createClient } from '@/lib/supabase/server';

export interface SessionClaims {
  userId: string;
  email?: string;
  claims: Record<string, unknown>;
}

/**
 * Resuelve los claims validados de la sesión actual (server-side).
 * Devuelve `null` si no hay sesión válida (deny-by-default).
 */
export async function getSessionClaims(): Promise<SessionClaims | null> {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data) return null;
    const claims =
      (data as { claims?: Record<string, unknown> }).claims ??
      (data as unknown as Record<string, unknown>);
    if (!claims || typeof claims !== 'object') return null;
    const sub = claims.sub;
    if (typeof sub !== 'string' || sub.length === 0) return null;
    const email = typeof claims.email === 'string' ? claims.email : undefined;
    return { userId: sub, email, claims };
  } catch {
    return null;
  }
}
