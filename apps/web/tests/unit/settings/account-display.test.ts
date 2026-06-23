/**
 * account-display.test.ts — Helper server-safe de iniciales
 * (HOTFIX_SETTINGS_ROUTE_ERROR_V1). Misma lógica que account-menu, pero en un
 * módulo SIN 'use client' (invocable desde Server Components sin lanzar).
 */
import { describe, it, expect } from 'vitest';
import { initialsFromEmail } from '@/app/(dashboard)/settings/_lib/account-display';

describe('account-display — initialsFromEmail (server-safe)', () => {
  it('email con punto/guion → 2 iniciales en mayúscula', () => {
    expect(initialsFromEmail('juan.perez@x.com')).toBe('JP');
    expect(initialsFromEmail('publicidad@iconicconstructora.com')).toBe('PU');
  });

  it('local sin separadores → 2 primeras letras', () => {
    expect(initialsFromEmail('demo@iconic.test')).toBe('DE');
  });

  it('respaldo "U" para null/undefined/vacío', () => {
    expect(initialsFromEmail(null)).toBe('U');
    expect(initialsFromEmail(undefined)).toBe('U');
    expect(initialsFromEmail('')).toBe('U');
  });
});
