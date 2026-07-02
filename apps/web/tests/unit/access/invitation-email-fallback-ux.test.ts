import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
function src(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('V5.6.3A invitation email fallback UX', () => {
  const actions = src('app/(dashboard)/settings/access/actions.ts');
  const notice = src('app/(dashboard)/settings/access/_components/invite-fallback-notice.tsx');
  const form = src('app/(dashboard)/settings/access/_components/invite-form.tsx');
  const table = src('app/(dashboard)/settings/access/_components/invitations-table.tsx');
  const service = src('server/access/service.ts');

  it('tipa sent/logged/failed y no dice enviado cuando el resultado es logged', () => {
    expect(actions).toContain("deliveryStatus?: 'sent' | 'logged' | 'failed'");
    expect(actions).toContain("const fallback = status !== 'sent'");
    expect(actions).toContain('El correo no se');
    expect(actions).toContain("inviteLink: fallback ? issued.acceptUrl : undefined");
    expect(actions).toContain("deliveryLabel: deliveryLabel(status)");
  });

  it('muestra link fallback y boton copiar solo cuando el backend devuelve inviteLink', () => {
    expect(form).toContain('state?.success && state.inviteLink');
    expect(table).toContain('resendState?.success && resendState.inviteLink');
    expect(notice).toContain('navigator.clipboard.writeText(inviteLink)');
    expect(notice).toContain('Copiar enlace');
  });

  it('el servicio no reconstruye links antiguos ni persiste token plano', () => {
    expect(service).toContain("p_token_hash: tokenHash");
    expect(service).not.toContain('token_hash=');
    expect(service).not.toMatch(/p_token\s*:/);
    expect(service).not.toMatch(/token\s*:\s*token[,}]/);
  });
});
