/**
 * read-repository.test.ts — Listado y estado efectivo (FASE 9: 1,9,27).
 * En tests READ_MODEL_SOURCE != 'db' ⇒ fixtures (sin base de datos).
 */
import { describe, expect, it } from 'vitest';
import {
  effectiveInvitationStatus,
  listMembers,
  listInvitations,
  countPendingInvitations,
} from '@/server/access/read-repository';

const ORG = '00000000-0000-0000-0000-0000000000a1';

describe('effectiveInvitationStatus (9: vencida)', () => {
  const now = new Date('2026-06-14T00:00:00.000Z');
  it('pending vencida ⇒ expired', () => {
    expect(effectiveInvitationStatus('pending', '2026-06-13T00:00:00.000Z', now)).toBe('expired');
  });
  it('pending vigente ⇒ pending', () => {
    expect(effectiveInvitationStatus('pending', '2026-06-20T00:00:00.000Z', now)).toBe('pending');
  });
  it('accepted/revoked no se reinterpretan', () => {
    expect(effectiveInvitationStatus('accepted', '2026-06-13T00:00:00.000Z', now)).toBe('accepted');
    expect(effectiveInvitationStatus('revoked', '2026-06-13T00:00:00.000Z', now)).toBe('revoked');
  });
});

describe('listado por fixture (1: admin lista su organización)', () => {
  it('lista miembros de la organización', async () => {
    const members = await listMembers(ORG);
    expect(members.length).toBeGreaterThanOrEqual(1);
    expect(members.every((m) => typeof m.email === 'string')).toBe(true);
    expect(members.some((m) => m.role === 'admin')).toBe(true);
  });

  it('lista invitaciones y cuenta pendientes (27)', async () => {
    const invitations = await listInvitations(ORG);
    expect(invitations.length).toBeGreaterThanOrEqual(1);
    // La fixture NO expone token ni token_hash.
    expect(Object.keys(invitations[0] ?? {})).not.toContain('tokenHash');
    const pending = await countPendingInvitations(ORG);
    expect(pending).toBeGreaterThanOrEqual(1);
  });
});
