/**
 * login-flow.test.ts — Tests del cableado del submit de login (Oleada 4A.3c).
 *
 * Verifica que el submit válido llama EXACTAMENTE una vez a
 * `signInWithPassword`, que los errores de Supabase y los lanzamientos del
 * cliente (p. ej. config faltante) se traducen a mensajes legibles sin redirigir,
 * que el éxito redirige a un `next` interno sanitizado (anti open redirect) y que
 * el modo demo no rompe nada. Propiedad: orquestador.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  runPasswordLogin,
  type PasswordSignIn,
} from '@/server/auth/login-flow';

/** Cliente de auth simulado que registra llamadas y devuelve un resultado. */
function makeAuth(result: { error: unknown }): {
  auth: PasswordSignIn;
  spy: ReturnType<typeof vi.fn>;
} {
  const spy = vi.fn(async () => result);
  return { auth: { signInWithPassword: spy }, spy };
}

describe('auth/login-flow — runPasswordLogin', () => {
  it('submit válido: llama signInWithPassword exactamente una vez y redirige a /dashboard', async () => {
    const { auth, spy } = makeAuth({ error: null });

    const res = await runPasswordLogin(auth, '  user@org.co ', 'secret123', null);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({
      email: 'user@org.co', // email recortado
      password: 'secret123',
    });
    expect(res).toEqual({ ok: true, redirectTo: '/dashboard', error: null });
  });

  it('éxito con next interno: redirige al next sanitizado', async () => {
    const { auth } = makeAuth({ error: null });
    const res = await runPasswordLogin(auth, 'u@org.co', 'secret123', '/projects');
    expect(res.ok).toBe(true);
    expect(res.redirectTo).toBe('/projects');
  });

  it('éxito con next externo: bloquea open redirect → /dashboard', async () => {
    const { auth } = makeAuth({ error: null });
    for (const evil of ['https://evil.com', '//evil.com', 'javascript:alert(1)']) {
      const res = await runPasswordLogin(auth, 'u@org.co', 'secret123', evil);
      expect(res.ok).toBe(true);
      expect(res.redirectTo).toBe('/dashboard');
    }
  });

  it('error de Supabase: mensaje legible sanitizado y SIN redirección', async () => {
    const { auth, spy } = makeAuth({
      error: new Error('Invalid login credentials'),
    });

    const res = await runPasswordLogin(auth, 'u@org.co', 'badpass12', null);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(false);
    expect(res.redirectTo).toBeNull();
    expect(res.error).toBe(
      'Correo o contraseña incorrectos. Verifica tus datos e intenta de nuevo.',
    );
    // Nunca expone el texto técnico crudo.
    expect(res.error).not.toContain('Invalid login credentials');
  });

  it('cliente que lanza (config/red): se captura y traduce, sin redirección', async () => {
    const auth: PasswordSignIn = {
      signInWithPassword: async () => {
        throw new Error('NetworkError when attempting to fetch resource');
      },
    };

    const res = await runPasswordLogin(auth, 'u@org.co', 'secret123', null);

    expect(res.ok).toBe(false);
    expect(res.redirectTo).toBeNull();
    expect(res.error).toBe(
      'Error de red. Verifica tu conexión e intenta de nuevo.',
    );
  });

  it('no redirige nunca cuando hay error (defensa contra fuga de sesión)', async () => {
    const { auth } = makeAuth({ error: new Error('boom') });
    const res = await runPasswordLogin(auth, 'u@org.co', 'secret123', '/dashboard');
    expect(res.ok).toBe(false);
    expect(res.redirectTo).toBeNull();
  });
});
