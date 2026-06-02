/**
 * /auth/callback — Route handler PKCE de Supabase.
 *
 * Propiedad: agent-frontend-boq. Oleada 4A.2.
 * Contrato: docs/AUTH_RUNTIME_CONTRACT.md §4-6, §7.
 *
 * Flujo:
 *  1. Supabase redirige aquí con `?code=<pkce-code>&next=<ruta>`.
 *  2. Intercambia el code por sesión (cookie SSR).
 *  3. Sanitiza el parámetro `next` (prevención de open redirect).
 *  4. Redirige a `next` (solo rutas internas) o a /dashboard.
 *  5. En error: redirige a /login con mensaje explícito.
 *
 * Seguridad:
 *  - `sanitizeNext` — solo rutas internas (no external, no open redirect).
 *  - El code se consume una sola vez (PKCE de Supabase).
 *  - Sin service_role ni secretos de servidor en este handler.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizeNext } from '@/server/auth/routes';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = request.nextUrl;
  const code = url.searchParams.get('code');
  const nextParam = url.searchParams.get('next');

  // Sanitiza el destino de redirección (prevención de open redirect).
  const redirectTo = sanitizeNext(nextParam, '/dashboard');

  // Sin code: no hay nada que intercambiar → login con error.
  if (!code) {
    const loginUrl = new URL('/login', url.origin);
    loginUrl.searchParams.set(
      'error',
      'Enlace de acceso inválido. Solicita uno nuevo.',
    );
    return NextResponse.redirect(loginUrl);
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      // Error de intercambio (code expirado, ya usado, inválido…)
      const loginUrl = new URL('/login', url.origin);
      loginUrl.searchParams.set(
        'error',
        'El enlace ha expirado o no es válido. Solicita uno nuevo.',
      );
      return NextResponse.redirect(loginUrl);
    }

    // Éxito → redirige a la ruta interna segura.
    return NextResponse.redirect(new URL(redirectTo, url.origin));
  } catch {
    // Error inesperado — sin detalles técnicos al usuario.
    const loginUrl = new URL('/login', url.origin);
    loginUrl.searchParams.set(
      'error',
      'Ocurrió un error al procesar el enlace. Intenta de nuevo.',
    );
    return NextResponse.redirect(loginUrl);
  }
}
