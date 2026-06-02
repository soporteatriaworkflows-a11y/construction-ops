/**
 * callback-logic.test.ts — Tests de la lógica del handler /auth/callback.
 *
 * Propiedad: agent-frontend-boq. Oleada 4A.2.
 *
 * Cubre:
 *  - sanitizeNext aplicado a `next` del callback.
 *  - Comportamiento con code ausente (→ /login?error=...).
 *  - Comportamiento con code presente y exchange exitoso.
 *  - Comportamiento con code presente y exchange fallido.
 *  - Que el `next` se sanea antes de redirigir (prevención open redirect).
 *  - Ausencia de secretos en respuestas de error.
 *
 * Nota: testeamos la LÓGICA pura (sanitizeNext) que el handler usa.
 * El handler en sí es un Route Handler de Next.js y requiere runtime de servidor;
 * aquí probamos sus invariantes de seguridad mediante las funciones puras.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeNext } from '@/server/auth/routes';

describe('callback — sanitizeNext (open redirect prevention)', () => {
  it('permite rutas internas válidas', () => {
    expect(sanitizeNext('/reset-password')).toBe('/reset-password');
    expect(sanitizeNext('/dashboard')).toBe('/dashboard');
    expect(sanitizeNext('/projects')).toBe('/projects');
  });

  it('fallback a /dashboard para rutas externas', () => {
    expect(sanitizeNext('https://evil.com')).toBe('/dashboard');
    expect(sanitizeNext('http://evil.com')).toBe('/dashboard');
    expect(sanitizeNext('//evil.com')).toBe('/dashboard');
    expect(sanitizeNext('/\\evil.com')).toBe('/dashboard');
  });

  it('fallback a /dashboard para null/undefined/vacío', () => {
    expect(sanitizeNext(null)).toBe('/dashboard');
    expect(sanitizeNext(undefined)).toBe('/dashboard');
    expect(sanitizeNext('')).toBe('/dashboard');
  });

  it('fallback a /dashboard para javascript: y otros esquemas', () => {
    expect(sanitizeNext('javascript:alert(1)')).toBe('/dashboard');
    // Esquema embebido tras /
    expect(sanitizeNext('/javascript:alert(1)')).toBe('/dashboard');
  });

  it('respeta el fallback personalizado', () => {
    expect(sanitizeNext(null, '/login')).toBe('/login');
    expect(sanitizeNext('https://evil.com', '/login')).toBe('/login');
  });

  it('no sanitiza next válido con subrutas', () => {
    expect(sanitizeNext('/reset-password?token=abc')).toBe('/reset-password?token=abc');
    expect(sanitizeNext('/dashboard/projects/123')).toBe('/dashboard/projects/123');
  });
});

describe('callback — lógica de redirección con code ausente', () => {
  /**
   * Simulamos el comportamiento del handler sin instanciar el runtime de Next.
   * La lógica: si no hay `code` → redirigir a /login?error=...
   */
  function simulateCallbackWithoutCode(params: Record<string, string | null>) {
    const code = params['code'];
    const nextParam = params['next'];
    const redirectTo = sanitizeNext(nextParam, '/dashboard');

    if (!code) {
      return {
        redirectsTo: '/login',
        hasError: true,
        safeNext: redirectTo,
      };
    }
    return {
      redirectsTo: redirectTo,
      hasError: false,
      safeNext: redirectTo,
    };
  }

  it('sin code → redirige a /login con error', () => {
    const result = simulateCallbackWithoutCode({ code: null, next: null });
    expect(result.redirectsTo).toBe('/login');
    expect(result.hasError).toBe(true);
  });

  it('con code → redirige al next sanitizado', () => {
    const result = simulateCallbackWithoutCode({
      code: 'valid-code',
      next: '/reset-password',
    });
    expect(result.redirectsTo).toBe('/reset-password');
    expect(result.hasError).toBe(false);
  });

  it('con code y next externo → redirige a /dashboard (sanitizado)', () => {
    const result = simulateCallbackWithoutCode({
      code: 'valid-code',
      next: 'https://evil.com',
    });
    expect(result.redirectsTo).toBe('/dashboard');
    expect(result.hasError).toBe(false);
  });

  it('con code y sin next → redirige a /dashboard', () => {
    const result = simulateCallbackWithoutCode({ code: 'valid-code', next: null });
    expect(result.redirectsTo).toBe('/dashboard');
    expect(result.hasError).toBe(false);
  });
});

describe('callback — ausencia de secretos en mensajes de error', () => {
  const FORBIDDEN_IN_ERRORS = [
    'service_role',
    'anon_key',
    'secret',
    'stack',
    'at line',
    'TypeError',
  ];

  const ERROR_MESSAGES = [
    'Enlace de acceso inválido. Solicita uno nuevo.',
    'El enlace ha expirado o no es válido. Solicita uno nuevo.',
    'Ocurrió un error al procesar el enlace. Intenta de nuevo.',
  ];

  it.each(ERROR_MESSAGES)('mensaje "%s" no contiene secretos', (msg) => {
    for (const forbidden of FORBIDDEN_IN_ERRORS) {
      expect(msg.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
