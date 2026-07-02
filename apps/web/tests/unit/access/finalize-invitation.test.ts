/**
 * finalize-invitation.test.ts — comportamiento del cierre robusto de invitación
 * + HIGIENE DEL TOKEN (V5.6.1E token hygiene).
 *
 * Verifica que un usuario Auth SIN profile pueda finalizar, que el token se hashee
 * (nunca viaje plano), que `already_member` cuente como éxito, que los errores del
 * RPC se sanitizen, y que el token persistido se LIMPIE en éxito y en errores
 * terminales, se conserve solo en errores recuperables, y expire por TTL.
 * No toca red real: el cliente Supabase se simula.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PENDING_INVITE_TOKEN_KEY,
  PENDING_INVITE_TOKEN_TTL_MS,
  clearPendingInviteToken,
  finalizeInviteAcceptance,
  isTerminalAcceptError,
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

/** Instala un `window.localStorage` respaldado por Map (env de test = node). */
function installStorage(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  return store;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('finalizeInviteAcceptance', () => {
  it('sin sesión (usuario Auth ausente) devuelve no_session, no llama RPC y conserva el token', async () => {
    const store = installStorage();
    storePendingInviteToken('plain-token');
    const { client, rpcCalls } = makeClient({ user: null });

    const result = await finalizeInviteAcceptance(client, 'plain-token');

    expect(result).toEqual({
      ok: false,
      code: 'no_session',
      terminal: false,
      error: expect.stringContaining('sesión'),
    });
    expect(rpcCalls).toHaveLength(0);
    // Recuperable: el token se conserva para reintentar cuando haya sesión.
    expect(store.has(PENDING_INVITE_TOKEN_KEY)).toBe(true);
  });

  it('usuario Auth SIN profile puede cerrar: deriva email, hashea el token y LIMPIA el token', async () => {
    const store = installStorage();
    storePendingInviteToken('plain-token');
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
    // Higiene: éxito ⇒ token limpiado.
    expect(store.has(PENDING_INVITE_TOKEN_KEY)).toBe(false);
  });

  it('normaliza nombre vacío a null', async () => {
    const { client, rpcCalls } = makeClient({ user: { email: 'a@b.com' } });
    await finalizeInviteAcceptance(client, 'tok', '   ');
    expect(rpcCalls[0]!.p_full_name).toBeNull();
  });

  it('trata already_member como éxito (la membresía ya existe) y limpia el token', async () => {
    const store = installStorage();
    storePendingInviteToken('tok');
    const { client } = makeClient({
      user: { email: 'a@b.com' },
      rpcError: { message: 'already_member' },
    });

    const result = await finalizeInviteAcceptance(client, 'tok');

    expect(result).toEqual({ ok: true, alreadyMember: true });
    expect(store.has(PENDING_INVITE_TOKEN_KEY)).toBe(false);
  });

  it.each([
    ['invitation_expired', 'ha expirado'],
    ['invitation_used', 'ya fue utilizada'],
    ['email_mismatch', 'no coincide'],
    ['invitation_invalid', 'no es válida'],
    ['invitation_revoked', 'revocada'],
  ])('error terminal %s: devuelve terminal=true, sanitiza y LIMPIA el token', async (code, expected) => {
    const store = installStorage();
    storePendingInviteToken('tok');
    const { client } = makeClient({ user: { email: 'a@b.com' }, rpcError: { message: code } });

    const result = await finalizeInviteAcceptance(client, 'tok');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('accept_failed');
      expect(result.terminal).toBe(true);
      expect(result.error).toContain(expected);
    }
    // Higiene: error terminal ⇒ token limpiado.
    expect(store.has(PENDING_INVITE_TOKEN_KEY)).toBe(false);
  });

  it('error NO terminal (recuperable/desconocido): conserva el token y marca terminal=false', async () => {
    const store = installStorage();
    storePendingInviteToken('tok');
    const { client } = makeClient({
      user: { email: 'a@b.com' },
      rpcError: { message: 'temporary network hiccup' },
    });

    const result = await finalizeInviteAcceptance(client, 'tok');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.terminal).toBe(false);
    // Recuperable: se conserva (acotado por el TTL).
    expect(store.has(PENDING_INVITE_TOKEN_KEY)).toBe(true);
  });

  it('sanitiza el error del RPC (no filtra token_hash ni detalles técnicos)', async () => {
    const { client } = makeClient({
      user: { email: 'a@b.com' },
      rpcError: { message: 'invitation_expired: token_hash=deadbeef' },
    });
    const result = await finalizeInviteAcceptance(client, 'tok');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('ha expirado');
      expect(result.error).not.toContain('token_hash');
      expect(result.error).not.toContain('deadbeef');
    }
  });
});

describe('isTerminalAcceptError', () => {
  it('reconoce los códigos terminales y descarta los recuperables', () => {
    for (const code of ['invitation_invalid', 'invitation_revoked', 'invitation_used', 'invitation_expired', 'email_mismatch']) {
      expect(isTerminalAcceptError(code)).toBe(true);
    }
    expect(isTerminalAcceptError('no_session')).toBe(false);
    expect(isTerminalAcceptError('already_member')).toBe(false);
    expect(isTerminalAcceptError('network error')).toBe(false);
    expect(isTerminalAcceptError(undefined)).toBe(false);
  });
});

describe('persistencia + higiene del token pendiente', () => {
  it('es segura fuera del navegador (sin window): no lanza y lee null', () => {
    expect(() => storePendingInviteToken('tok')).not.toThrow();
    expect(readPendingInviteToken()).toBeNull();
    expect(() => clearPendingInviteToken()).not.toThrow();
  });

  it('round-trip store/read/clear con localStorage disponible', () => {
    const store = installStorage();

    storePendingInviteToken('secret-token');
    expect(readPendingInviteToken()).toBe('secret-token');
    // Sólo se guarda token + expiración; NUNCA password ni secretos.
    const payload = JSON.parse(store.get(PENDING_INVITE_TOKEN_KEY)!) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['exp', 'token']);
    expect(payload.token).toBe('secret-token');
    expect(typeof payload.exp).toBe('number');

    clearPendingInviteToken();
    expect(readPendingInviteToken()).toBeNull();
  });

  it('token con TTL vencido se ignora y se LIMPIA del storage', () => {
    const store = installStorage();
    // Escribe un payload ya expirado (exp en el pasado).
    store.set(
      PENDING_INVITE_TOKEN_KEY,
      JSON.stringify({ token: 'old-token', exp: Date.now() - 1000 }),
    );

    expect(readPendingInviteToken()).toBeNull();
    expect(store.has(PENDING_INVITE_TOKEN_KEY)).toBe(false);
  });

  it('el TTL guardado es ~24h en el futuro', () => {
    const store = installStorage();
    const before = Date.now();
    storePendingInviteToken('tok');
    const payload = JSON.parse(store.get(PENDING_INVITE_TOKEN_KEY)!) as { exp: number };
    expect(payload.exp).toBeGreaterThanOrEqual(before + PENDING_INVITE_TOKEN_TTL_MS - 50);
    expect(payload.exp).toBeLessThanOrEqual(Date.now() + PENDING_INVITE_TOKEN_TTL_MS + 50);
  });

  it('payload malformado (no JSON) se ignora y se LIMPIA', () => {
    const store = installStorage();
    store.set(PENDING_INVITE_TOKEN_KEY, 'not-json{{{');

    expect(readPendingInviteToken()).toBeNull();
    expect(store.has(PENDING_INVITE_TOKEN_KEY)).toBe(false);
  });
});
