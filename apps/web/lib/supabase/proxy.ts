/**
 * proxy.ts (lib) — Cliente Supabase para el PROXY (Next 16) + refresh de sesión.
 *
 * Propiedad: orquestador (runtime auth 4A.2). Contrato:
 * `docs/AUTH_RUNTIME_CONTRACT.md §7`.
 *
 * Crea un `NextResponse` y un cliente que propaga cookies al request y al
 * response (patrón oficial `@supabase/ssr`). Valida la sesión con
 * `auth.getClaims()` (NUNCA `getSession()` como barrera). El llamador
 * (`apps/web/proxy.ts`) decide redirecciones a partir de los claims.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getPublicSupabaseEnv } from './env';

export interface ProxySupabase {
  /** Respuesta ACTUAL con las cookies refrescadas (getter; se actualiza tras getClaims). */
  getResponse: () => NextResponse;
  /** Claims del usuario autenticado, o `null` si no hay sesión válida. */
  getClaims: () => Promise<Record<string, unknown> | null>;
}

/**
 * Inicializa Supabase dentro del Proxy y refresca cookies de sesión.
 * El llamador debe invocar `getClaims()` antes de leer `getResponse()` para que
 * las cookies refrescadas queden propagadas.
 */
export function createProxyClient(request: NextRequest): ProxySupabase {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = getPublicSupabaseEnv();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Propaga al request (para esta ejecución) y al response (al navegador).
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const getClaims = async (): Promise<Record<string, unknown> | null> => {
    try {
      // getClaims valida la firma del JWT (barrera server-side correcta).
      const { data, error } = await supabase.auth.getClaims();
      if (error || !data) return null;
      // El shape puede ser { claims } o el objeto de claims directamente.
      const claims =
        (data as { claims?: Record<string, unknown> }).claims ??
        (data as unknown as Record<string, unknown>);
      return claims && typeof claims === 'object' ? claims : null;
    } catch {
      return null;
    }
  };

  return { getResponse: () => response, getClaims };
}
