/**
 * /logout — Route handler de cierre de sesión.
 *
 * Propiedad: agent-frontend-boq. Oleada 4A.2.
 * Contrato: docs/AUTH_RUNTIME_CONTRACT.md §6 ("logout → /login").
 *
 * Flujo:
 *  GET /logout → signOut() → redirige a /login.
 *  POST /logout → idem (para uso desde forms o fetch).
 *
 * El cliente browser puede invocar supabase.auth.signOut() directamente.
 * Este handler limpia las cookies de sesión server-side y garantiza la
 * redirección segura sin importar el estado del cliente.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function handleLogout(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Si signOut falla (ej. sin sesión activa), igual redirigimos a login.
  }

  const loginUrl = new URL('/login', request.nextUrl.origin);
  return NextResponse.redirect(loginUrl);
}

export const GET = handleLogout;
export const POST = handleLogout;
