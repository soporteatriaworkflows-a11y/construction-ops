/**
 * access-routes.test.ts — Protección de rutas (FASE 9: 23,24,30).
 */
import { describe, expect, it } from 'vitest';
import {
  isProtectedRoute,
  isPublicRoute,
  PROTECTED_ROUTES,
  PUBLIC_ROUTES,
} from '@/server/auth/routes';

describe('rutas de acceso', () => {
  it('/settings y /settings/access están protegidas (23/24)', () => {
    expect(isProtectedRoute('/settings')).toBe(true);
    expect(isProtectedRoute('/settings/access')).toBe(true);
    expect(PROTECTED_ROUTES).toContain('/settings');
  });

  it('/invite/accept es pública (el invitado puede no tener sesión)', () => {
    expect(isPublicRoute('/invite/accept')).toBe(true);
    expect(isProtectedRoute('/invite/accept')).toBe(false);
    expect(PUBLIC_ROUTES).toContain('/invite');
  });

  it('30: las rutas existentes siguen clasificadas igual', () => {
    expect(isProtectedRoute('/dashboard')).toBe(true);
    expect(isProtectedRoute('/projects')).toBe(true);
    expect(isPublicRoute('/login')).toBe(true);
    expect(isPublicRoute('/reset-password')).toBe(true);
  });

  it('31: el asistente de cotización /quote está protegido (incluye subrutas)', () => {
    expect(PROTECTED_ROUTES).toContain('/quote');
    expect(isProtectedRoute('/quote')).toBe(true);
    expect(isProtectedRoute('/quote/new')).toBe(true);
    expect(isProtectedRoute('/quote/p1/s1/v1')).toBe(true);
  });
});
