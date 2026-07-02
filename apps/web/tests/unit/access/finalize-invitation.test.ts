/**
 * finalize-invitation.test.ts — comportamiento del cierre robusto de invitación.
 *
 * Verifica que un usuario Auth SIN profile pueda finalizar, que el token se hashee
 * (nunca viaje plano), que `already_member` cuente como éxito, que los errores del
 * RPC se sanitizen y que la persistencia del token sea segura fuera del navegador.
 * No toca red real: el cliente Supabase se simula.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PENDING_INVITE_TOKEN_KEY,
  clearPendingInviteToken,
  finalizeInviteAcceptance,
  readPendingInviteToken,
  sha256Hex,
  storePendingInviteToken,
} from '@/app/(auth)/invite/accept/finalize-invitation';

type RpcArgs = { p_token_hash: string; p_email: string; p_full_name: string | null };

function makeClient(opts: {
  user: { email?: string } | null;
  userError?: boolean;
  rpcError?: { message: string } | null;
}): { client: SupabaseClient; rpcCalls: RpcArgs[] } {
  const rpcCalls: RpcArgs[] = [];
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: opts.user },
        error: opts.userError ? { message: 'session error' } : null,
      }),
    },
    rpc: async (_fn: string, args: RpcArgs) => {
      rpcCalls.push(args);
      return { data: null, error: opts.rpcError ?? null };
    },
  } as unknown as SupabaseClient;
  return { client, rpcCalls };
}

afterEach(() => {
  // Limpia cualquier stub de window entre pruebas.
  delete (globalThis as { window?: unknown }).window;
});

describe('finalizeInviteAcceptance', () => {
  it('sin sesión (usuario Auth ausente) devuelve no_session sin llamar al RPC', async () => {
    const { client, rpcCalls } = makeClient({ user: null });
    const result = await finalizeInviteAcceptance(client, 'plain-token');
    expect(result).toEqual({
      ok: false,
      code: 'no_session',
      error: expect.stringContaining('sesión'),
    });
    expect(rpcCalls).toHaveLength(0);
  });

  it('usuario Auth SIN profile puede cerrar: deriva email y hashea el token', async () => {
    const { client, rpcCalls } = makeClient({ user: { email: 'Invitee@X.com' }, rpcError: null });
    const result = await finalizeInviteAcceptance(client, 'plain-token', '  Ana  ');

    expect(result).toEqual({ ok: true, alreadyMember: false });
    expect(rpcCalls).toHaveLength(1);
    const args = rpcCalls[0]!;
    // El email lo aporta el usuario Auth (el RPC lo compara en minúsculas).
    expect(args.p_email).toBe('Invitee@X.com');
    expect(args.p_full_name).toBe('Ana');
    // El token NUNCA viaja plano: sólo su hash SHA-256 (64 hex).
    expect(args.p_token_hash).toBe(await sha256Hex('plain-token'));
    expect(args.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(args.p_token_hash).not.toContain('plain-token');
  });

  it('normaliza nombre vacío a null', async () => {
    const { client, rpcCalls } = makeClient({ user: { email: 'a@b.com' } });
    await finalizeInviteAcceptance(client, 'tok', '   ');
    expect(rpcCalls[0]!.p_full_name).toBeNull();
  });

  it('trata already_member como éxito (la membresía ya existe)', async () => {
    const { client } = makeClient({
      user: { email: 'a@b.com' },
      rpcError: { message: 'already_member' },
    });
    const result = await finalizeInviteAcceptance(client, 'tok');
    expect(result).toEqual({ ok: true, alreadyMember: true });
  });

  it('sanitiza el error del RPC (no filtra token_hash ni detalles técnicos)', async () => {
    const { client } = makeClient({
      user: { email: 'a@b.com' },
      rpcError: { message: 'invitation_expired: token_hash=deadbeef' },
    });
    const result = await finalizeInviteAcceptance(client, 'tok');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('accept_failed');
      expect(result.error).toContain('ha expirado');
      expect(result.error).not.toContain('token_hash');
      expect(result.error).not.toContain('deadbeef');
    }
  });

  it('mapea email_mismatch a un mensaje claro', async () => {
    const { client } = makeClient({
      user: { email: 'a@b.com' },
      rpcError: { message: 'email_mismatch' },
    });
    const result = await finalizeInviteAcceptance(client, 'tok');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('no coincide');
  });
});

describe('persistencia del token pendiente', () => {
  it('es segura fuera del navegador (sin window): no lanza y lee null', () => {
    expect(() => storePendingInviteToken('tok')).not.toThrow();
    expect(readPendingInviteToken()).toBeNull();
    expect(() => clearPendingInviteToken()).not.toThrow();
  });

  it('round-trip store/read/clear con localStorage disponible', () => {
    const store = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    };

    storePendingInviteToken('secret-token');
    expect(store.get(PENDING_INVITE_TOKEN_KEY)).toBe('secret-token');
    expect(readPendingInviteToken()).toBe('secret-token');

    clearPendingInviteToken();
    expect(readPendingInviteToken()).toBeNull();
  });
});
