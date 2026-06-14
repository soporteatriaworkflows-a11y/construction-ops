/**
 * token.test.ts — Generación/hash de tokens (FASE 9: 13 — no se guarda plano).
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { generateInvitationToken, hashToken } from '@/server/access/token';

describe('generateInvitationToken', () => {
  it('genera token plano + hash; el hash NO es el token (13)', () => {
    const { token, tokenHash } = generateInvitationToken();
    expect(token.length).toBeGreaterThanOrEqual(40); // 32 bytes base64url
    expect(tokenHash).not.toEqual(token);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });

  it('el hash es SHA-256(token) determinista', () => {
    const { token, tokenHash } = generateInvitationToken();
    const expected = createHash('sha256').update(token, 'utf8').digest('hex');
    expect(tokenHash).toEqual(expected);
    expect(hashToken(token)).toEqual(expected);
  });

  it('tokens distintos en cada llamada (no enumerable)', () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    expect(a.token).not.toEqual(b.token);
    expect(a.tokenHash).not.toEqual(b.tokenHash);
  });
});
