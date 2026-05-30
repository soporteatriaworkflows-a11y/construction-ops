import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Proxy mínimo seguro (Paso 0 / orchestrator).
 *
 * Next.js 16 deprecó la convención `middleware` y la renombró a `proxy`
 * (archivo `proxy.ts` al mismo nivel que `app/`). Esta función pasa todas
 * las solicitudes sin alterar la respuesta. NO contiene lógica de
 * autenticación, autorización ni RLS todavía: se añadirá cuando el flujo
 * de auth y agent-db-rls estén disponibles (Oleada 1+).
 *
 * El matcher excluye assets estáticos y rutas internas de Next.
 */
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
