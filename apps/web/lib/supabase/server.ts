/**
 * server.ts — Cliente Supabase para SERVER COMPONENTS / Server Actions (SSR).
 *
 * Propiedad: orquestador (runtime auth 4A.2). Contrato:
 * `docs/AUTH_RUNTIME_CONTRACT.md §7`.
 *
 * Cookies SSR mediante `getAll()` + `setAll()` (NUNCA get/set/remove antiguos).
 * En Server Components la escritura de cookies puede no estar permitida; el
 * `try/catch` lo neutraliza (el refresh real ocurre en el Proxy).
 */
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getPublicSupabaseEnv } from './env';

/**
 * Crea un cliente Supabase server-side ligado a las cookies de la request.
 * Usar en Server Components, Route Handlers y Server Actions.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getPublicSupabaseEnv();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component sin permiso de escritura de cookies: ignorar.
          // El Proxy se encarga de refrescar la sesión y propagar cookies.
        }
      },
    },
  });
}
