/**
 * proxy.ts — Proxy de Next.js 16 (reemplaza `middleware`).
 *
 * Propiedad: orquestador (runtime auth 4A.2). Contrato:
 * `docs/AUTH_RUNTIME_CONTRACT.md §6-7`.
 *
 * Modo `demo` (por defecto): pass-through (la demo fixture no requiere sesión).
 * Modo `supabase`: refresca la sesión (cookies) y aplica guard de rutas con
 * `auth.getClaims()` (NUNCA `getSession()`), con redirecciones seguras y
 * deny-by-default. Evita open redirects al construir `?next=`.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { resolveAuthMode } from '@/lib/supabase/env';
import { createProxyClient } from '@/lib/supabase/proxy';
import { isProtectedRoute, sanitizeNext } from '@/server/auth/routes';

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const mode = resolveAuthMode();

  // Modo demo: no se exige sesión (fixture sanitizado). Pass-through.
  if (mode === 'demo') {
    return NextResponse.next();
  }

  // Modo supabase: refresca sesión y obtiene claims validados.
  const { getResponse, getClaims } = createProxyClient(request);
  const claims = await getClaims();
  const response = getResponse(); // cookies refrescadas tras getClaims()

  const { pathname, search } = request.nextUrl;
  const isAuthed = claims !== null;

  // Ruta protegida sin sesión → /login?next=<ruta-sanitizada>
  if (isProtectedRoute(pathname) && !isAuthed) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    const safeNext = sanitizeNext(pathname + search, '/dashboard');
    url.searchParams.set('next', safeNext);
    return copyCookies(NextResponse.redirect(url), response);
  }

  // /login (u otras públicas de auth) con sesión → /dashboard
  if (isAuthed && (pathname === '/login' || pathname === '/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return copyCookies(NextResponse.redirect(url), response);
  }

  // Raíz sin sesión → /login
  if (!isAuthed && pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return copyCookies(NextResponse.redirect(url), response);
  }

  return response;
}

/** Copia las cookies refrescadas a una respuesta de redirección. */
function copyCookies(target: NextResponse, source: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  return target;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
