/**
 * login-flow.ts — Lógica PURA del submit de inicio de sesión con contraseña.
 *
 * Propiedad: orquestador (4A.3c). Contrato: `docs/AUTH_RUNTIME_CONTRACT.md §4-7`.
 *
 * Sin dependencias de Next ni de React: recibe el cliente de auth y el `next`
 * crudo, y decide el resultado (éxito + redirección segura | error legible).
 * Esto permite verificar el cableado submit → signInWithPassword sin DOM y
 * blinda contra regresiones (navegación accidental, open redirect, errores
 * silenciosos). La UI sigue siendo propiedad de agent-frontend-boq.
 */
import { sanitizeNext } from './routes';
import { toReadableAuthError } from '@/components/auth/auth-helpers';

/** Superficie mínima del cliente de auth que necesita el login. */
export interface PasswordSignIn {
  signInWithPassword(credentials: {
    email: string;
    password: string;
  }): Promise<{ error: unknown }>;
}

/** Resultado del flujo de login (decisión pura, sin efectos). */
export interface LoginFlowResult {
  /** `true` solo si Supabase autenticó sin error. */
  ok: boolean;
  /** Ruta interna sanitizada a la que redirigir tras éxito (null si error). */
  redirectTo: string | null;
  /** Mensaje legible en español, sanitizado (null si éxito). */
  error: string | null;
}

/**
 * Ejecuta el login con contraseña y decide la redirección segura.
 *
 * - Llama EXACTAMENTE una vez a `auth.signInWithPassword` con email recortado.
 * - Si Supabase devuelve error, lo traduce a mensaje legible (sin stack) y NO
 *   redirige.
 * - Si el cliente lanza (p. ej. config faltante / red), lo captura y traduce.
 * - En éxito, redirige al `next` interno sanitizado (anti open redirect),
 *   con fallback `/dashboard`.
 */
export async function runPasswordLogin(
  auth: PasswordSignIn,
  email: string,
  password: string,
  nextParam: string | null | undefined,
): Promise<LoginFlowResult> {
  try {
    const { error } = await auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      return { ok: false, redirectTo: null, error: toReadableAuthError(error) };
    }

    return {
      ok: true,
      redirectTo: sanitizeNext(nextParam ?? null, '/dashboard'),
      error: null,
    };
  } catch (err) {
    return { ok: false, redirectTo: null, error: toReadableAuthError(err) };
  }
}
