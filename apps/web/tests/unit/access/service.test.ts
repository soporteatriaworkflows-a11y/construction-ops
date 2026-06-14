/**
 * service.test.ts — Casos de uso de acceso con dependencias inyectadas
 * (FASE 9: 4,6,7,8,11,12,13,19,20). No toca base ni red.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createInvitation,
  revokeInvitation,
  changeMemberRole,
  acceptInvitationWithSession,
  AccessError,
} from '@/server/access';
import { hashToken } from '@/server/access/token';
import type { AccessActor } from '@/server/access';
import type { EmailMessage, EmailSendResult } from '@/server/email';

const ADMIN: AccessActor = {
  userId: '00000000-0000-0000-0000-0000000000b1',
  organizationId: '00000000-0000-0000-0000-0000000000a1',
  profileRole: 'admin',
  email: 'admin@iconic.test',
};
const GERENCIA: AccessActor = { ...ADMIN, userId: 'g1', profileRole: 'gerencia' };

function fakeClient(rpcImpl: (name: string, args: Record<string, unknown>) => { data?: unknown; error?: unknown }) {
  return {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => rpcImpl(name, args)),
  } as unknown as Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>;
}

function emailCapture() {
  const sent: EmailMessage[] = [];
  const sendEmail = async (m: EmailMessage): Promise<EmailSendResult> => {
    sent.push(m);
    return { delivered: true, provider: 'log' };
  };
  return { sent, sendEmail };
}

describe('createInvitation (4,13,19)', () => {
  it('crea invitación, hashea el token y renderiza el correo', async () => {
    let captured: Record<string, unknown> = {};
    const client = fakeClient((name, args) => {
      captured = args;
      expect(name).toBe('create_invitation');
      return { data: { invitationId: 'inv-1', expiresAt: '2026-06-21T09:00:00.000Z' } };
    });
    const { sent, sendEmail } = emailCapture();

    const issued = await createInvitation(
      ADMIN,
      { email: 'Nuevo@Iconic.test', role: 'presupuestos', fullName: 'Nuevo' },
      { clientFactory: async () => client, sendEmail },
    );

    expect(issued.invitationId).toBe('inv-1');
    expect(issued.email).toBe('nuevo@iconic.test'); // normalizado
    // 13: a la RPC va el HASH, no el token plano.
    expect(captured.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
    const token = new URL(issued.acceptUrl).searchParams.get('token')!;
    expect(captured.p_token_hash).toBe(hashToken(token));
    expect(captured.p_email).toBe('nuevo@iconic.test');
    // 19: correo de invitación renderizado.
    expect(sent).toHaveLength(1);
    expect(sent[0]?.kind).toBe('invitation');
    expect(issued.emailFallback).toBe(true); // provider log ⇒ fallback
  });

  it('6: rechaza rol inválido antes de tocar la RPC', async () => {
    const client = fakeClient(() => ({ data: {} }));
    await expect(
      createInvitation(ADMIN, { email: 'x@iconic.test', role: 'root' }, { clientFactory: async () => client }),
    ).rejects.toBeInstanceOf(AccessError);
    expect((client.rpc as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('gerencia NO puede invitar admin (anti-escalamiento)', async () => {
    const client = fakeClient(() => ({ data: {} }));
    await expect(
      createInvitation(GERENCIA, { email: 'jefe@iconic.test', role: 'admin' }, { clientFactory: async () => client }),
    ).rejects.toMatchObject({ code: 'cannot_grant_admin' });
    expect((client.rpc as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('rechaza email inválido', async () => {
    const client = fakeClient(() => ({ data: {} }));
    await expect(
      createInvitation(ADMIN, { email: 'no-es-email', role: 'obra' }, { clientFactory: async () => client }),
    ).rejects.toMatchObject({ code: 'invalid_email' });
  });

  it('mapea errores de la RPC a mensajes en español (29)', async () => {
    const client = fakeClient(() => ({ error: { message: 'already_invited' } }));
    await expect(
      createInvitation(ADMIN, { email: 'dup@iconic.test', role: 'obra' }, { clientFactory: async () => client }),
    ).rejects.toMatchObject({ code: 'already_invited' });
  });
});

describe('revokeInvitation (8)', () => {
  it('revoca una invitación existente (fixture)', async () => {
    const client = fakeClient((name) => {
      expect(name).toBe('revoke_invitation');
      return { data: { status: 'revoked' } };
    });
    const res = await revokeInvitation(
      ADMIN,
      '00000000-0000-0000-0000-0000000000e1',
      { clientFactory: async () => client, sendEmail: async () => ({ delivered: true, provider: 'log' }) },
    );
    expect(res.status).toBe('revoked');
  });
});

describe('changeMemberRole (7)', () => {
  it('rechaza cambiar el propio rol sin llamar RPC', async () => {
    const client = fakeClient(() => ({ data: {} }));
    await expect(
      changeMemberRole(ADMIN, ADMIN.userId, 'gerencia', { clientFactory: async () => client }),
    ).rejects.toMatchObject({ code: 'cannot_change_self' });
    expect((client.rpc as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('admin cambia rol de otro miembro (fixture b3)', async () => {
    const client = fakeClient((name) => {
      expect(name).toBe('change_member_role');
      return { data: { userId: '00000000-0000-0000-0000-0000000000b3', role: 'compras' } };
    });
    const res = await changeMemberRole(
      ADMIN,
      '00000000-0000-0000-0000-0000000000b3',
      'compras',
      { clientFactory: async () => client },
    );
    expect(res.role).toBe('compras');
  });
});

describe('acceptInvitationWithSession (11,12)', () => {
  it('llama accept_invitation y devuelve org/rol', async () => {
    const client = fakeClient((name, args) => {
      expect(name).toBe('accept_invitation');
      expect(args.p_token_hash).toBeDefined();
      return { data: { organizationId: '00000000-0000-0000-0000-0000000000a1', role: 'obra' } };
    });
    const res = await acceptInvitationWithSession(
      { tokenHash: 'abc', email: 'invitee@iconic.test' },
      { clientFactory: async () => client },
    );
    expect(res).toEqual({ organizationId: '00000000-0000-0000-0000-0000000000a1', role: 'obra' });
  });

  it('mapea invitación vencida', async () => {
    const client = fakeClient(() => ({ error: { message: 'invitation_expired' } }));
    await expect(
      acceptInvitationWithSession({ tokenHash: 'abc', email: 'x@iconic.test' }, { clientFactory: async () => client }),
    ).rejects.toMatchObject({ code: 'invitation_expired' });
  });
});
