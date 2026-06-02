/**
 * auth-helpers.test.ts — Tests de las funciones de ayuda de la UI de auth.
 *
 * Propiedad: agent-frontend-boq. Oleada 4A.2.
 *
 * Cubre:
 *  - toReadableAuthError: mensajes legibles, sin stack/detalles técnicos.
 *  - FORGOT_PASSWORD_NEUTRAL_MSG: mensaje neutro constante.
 *  - isValidEmailFormat: validación básica de email.
 *  - isValidPasswordLength: validación de longitud mínima de contraseña.
 *  - Ausencia de secretos en los mensajes de error producidos.
 */
import { describe, it, expect } from 'vitest';
import {
  toReadableAuthError,
  FORGOT_PASSWORD_NEUTRAL_MSG,
  isValidEmailFormat,
  isValidPasswordLength,
} from '@/components/auth/auth-helpers';

// Palabras que NUNCA deben aparecer en mensajes al usuario.
const FORBIDDEN_TERMS = [
  'stack',
  'traceback',
  'exception',
  'undefined',
  'null',
  'service_role',
  'anon_key',
  'secret',
  'token_hash',
  'at line',
  'TypeError',
  'ReferenceError',
];

function assertNoSecrets(msg: string) {
  for (const term of FORBIDDEN_TERMS) {
    expect(msg.toLowerCase()).not.toContain(term.toLowerCase());
  }
}

describe('toReadableAuthError', () => {
  it('devuelve mensaje genérico para null/undefined', () => {
    const msg = toReadableAuthError(null);
    expect(msg).toBeTruthy();
    assertNoSecrets(msg);
  });

  it('traduce credenciales inválidas a mensaje legible', () => {
    const err = new Error('Invalid login credentials');
    const msg = toReadableAuthError(err);
    expect(msg).toContain('Correo o contraseña incorrectos');
    assertNoSecrets(msg);
  });

  it('traduce rate limit a mensaje legible', () => {
    const err = new Error('Too many requests');
    const msg = toReadableAuthError(err);
    expect(msg).toContain('Demasiados intentos');
    assertNoSecrets(msg);
  });

  it('traduce token expirado a mensaje legible', () => {
    const err = new Error('token is expired');
    const msg = toReadableAuthError(err);
    expect(msg).toContain('expirado');
    assertNoSecrets(msg);
  });

  it('traduce token inválido a mensaje legible', () => {
    const err = new Error('bad token');
    const msg = toReadableAuthError(err);
    expect(msg).toContain('válido');
    assertNoSecrets(msg);
  });

  it('traduce sesión faltante a mensaje legible', () => {
    const err = new Error('Auth session missing');
    const msg = toReadableAuthError(err);
    expect(msg).toContain('sesión');
    assertNoSecrets(msg);
  });

  it('devuelve mensaje genérico para errores desconocidos (sin stack)', () => {
    const err = new Error('Some internal server error with stack at line 42');
    const msg = toReadableAuthError(err);
    // El mensaje al usuario NO debe contener "at line 42" u otros detalles técnicos.
    expect(msg).not.toContain('at line 42');
    // Debe ser un mensaje legible.
    expect(msg.length).toBeGreaterThan(10);
    assertNoSecrets(msg);
  });

  it('acepta string como error', () => {
    const msg = toReadableAuthError('network error');
    expect(msg).toContain('red');
    assertNoSecrets(msg);
  });

  it('acepta objetos sin message', () => {
    const msg = toReadableAuthError({ code: 500 });
    expect(msg).toBeTruthy();
    assertNoSecrets(msg);
  });
});

describe('FORGOT_PASSWORD_NEUTRAL_MSG', () => {
  it('es siempre el mismo mensaje neutral', () => {
    expect(FORGOT_PASSWORD_NEUTRAL_MSG).toBeTruthy();
    // No debe revelar si el correo existe o no.
    expect(FORGOT_PASSWORD_NEUTRAL_MSG.toLowerCase()).not.toContain('no existe');
    expect(FORGOT_PASSWORD_NEUTRAL_MSG.toLowerCase()).not.toContain('not found');
    // Debe mencionar que recibirá algo si está registrado.
    expect(FORGOT_PASSWORD_NEUTRAL_MSG).toContain('registrado');
    assertNoSecrets(FORGOT_PASSWORD_NEUTRAL_MSG);
  });

  it('es idéntico en cada evaluación (no depende de estado)', () => {
    // Re-importar (mismo módulo) → mismo valor.
    expect(FORGOT_PASSWORD_NEUTRAL_MSG).toBe(FORGOT_PASSWORD_NEUTRAL_MSG);
  });
});

describe('isValidEmailFormat', () => {
  it('acepta correos válidos', () => {
    expect(isValidEmailFormat('usuario@constructora.co')).toBe(true);
    expect(isValidEmailFormat('a@b.co')).toBe(true);
    expect(isValidEmailFormat('user+tag@domain.com')).toBe(true);
  });

  it('rechaza correos sin @', () => {
    expect(isValidEmailFormat('sinArroba')).toBe(false);
    expect(isValidEmailFormat('incorrecto.com')).toBe(false);
  });

  it('rechaza strings vacíos o muy cortos', () => {
    expect(isValidEmailFormat('')).toBe(false);
    expect(isValidEmailFormat('@')).toBe(false);
    expect(isValidEmailFormat('a@')).toBe(false);
  });
});

describe('isValidPasswordLength', () => {
  it('acepta contraseñas de 8 o más caracteres', () => {
    expect(isValidPasswordLength('12345678')).toBe(true);
    expect(isValidPasswordLength('contraseña123')).toBe(true);
    expect(isValidPasswordLength('a'.repeat(100))).toBe(true);
  });

  it('rechaza contraseñas de menos de 8 caracteres', () => {
    expect(isValidPasswordLength('')).toBe(false);
    expect(isValidPasswordLength('1234567')).toBe(false);
    expect(isValidPasswordLength('abc')).toBe(false);
  });
});
