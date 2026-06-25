/**
 * routes.ts — Clasificación de rutas y sanitización de redirecciones.
 *
 * Propiedad: orquestador (4A.2). Contrato: `docs/AUTH_RUNTIME_CONTRACT.md §4-6`.
 * Funciones PURAS y testeables (sin dependencias de Next).
 */

/** Rutas públicas (AUTH_RUNTIME_CONTRACT §4). */
export const PUBLIC_ROUTES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  // Aceptación de invitación: el invitado puede no tener sesión todavía
  // (define su contraseña aquí). NUNCA expone datos protegidos por sí sola.
  '/invite',
] as const;

/** Rutas protegidas (AUTH_RUNTIME_CONTRACT §5). */
export const PROTECTED_ROUTES = [
  '/dashboard',
  '/quote',
  '/projects',
  '/estimates',
  '/apu',
  '/catalog',
  '/quantities',
  '/planning',
  '/settings',
  '/api/exports',
] as const;

/** ¿`pathname` es (o cuelga de) una ruta pública? */
export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + '/'),
  );
}

/** ¿`pathname` es (o cuelga de) una ruta protegida? */
export function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + '/'),
  );
}

/** ¿Contiene algún carácter de control (code point < 0x20)? */
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) < 0x20) return true;
  }
  return false;
}

/**
 * Sanitiza el parámetro `next` para impedir **open redirects**.
 * Solo se permiten rutas internas absolutas: empiezan con un único `/`,
 * NO con `//` ni `/\`, y no contienen esquema/host ni caracteres de control.
 * Cualquier otro valor (incl. `http://`, `https://`, `javascript:`,
 * protocol-relative o backslashes) ⇒ se devuelve `fallback`.
 */
export function sanitizeNext(
  next: string | null | undefined,
  fallback = '/dashboard',
): string {
  if (!next) return fallback;
  if (!next.startsWith('/')) return fallback;
  if (next.startsWith('//') || next.startsWith('/\\')) return fallback;
  if (hasControlChar(next)) return fallback;
  // Sin esquema embebido tras la barra inicial (defensa extra).
  if (/^\/[^/]*:/.test(next)) return fallback;
  return next;
}
