/**
 * invite-accept-flow.test.ts — invariantes del cierre de membresía por invitación.
 * No toca red ni base de datos. Verifica la corrección V5.6.1E: el cierre ya NO
 * depende de que el token vuelva por la URL tras confirmar el correo.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUTO_ACCEPT_MESSAGE,
  CONFIRM_EMAIL_RETURN_MESSAGE,
  buildInviteConfirmationRedirect,
  isAlreadyRegisteredMessage,
  mapAcceptError,
} from '@/app/(auth)/invite/accept/invite-accept-flow';
import { sanitizeNext } from '@/server/auth/routes';

const ROOT = process.cwd();
const ACCEPT_FORM = join(ROOT, 'app/(auth)/invite/accept/_components/accept-form.tsx');
const ACCEPT_PAGE = join(ROOT, 'app/(auth)/invite/accept/page.tsx');
const CALLBACK_ROUTE = join(ROOT, 'app/(auth)/auth/callback/route.ts');
const FINALIZE = join(ROOT, 'app/(auth)/invite/accept/finalize-invitation.ts');
const RECOVERY = join(ROOT, 'components/auth/invite-membership-recovery.tsx');
const DASHBOARD_PAGE = join(ROOT, 'app/(dashboard)/dashboard/page.tsx');

describe('invite accept membership flow', () => {
  it('redirige la confirmación de email de vuelta al link de invitación', () => {
    const redirect = buildInviteConfirmationRedirect('https://construction-ops-psi.vercel.app/', 'tok/en+123');
    const url = new URL(redirect);

    expect(url.origin).toBe('https://construction-ops-psi.vercel.app');
    expect(url.pathname).toBe('/auth/callback');
    expect(url.searchParams.get('next')).toBe('/invite/accept?token=tok%2Fen%2B123');
    expect(sanitizeNext(url.searchParams.get('next'))).toBe('/invite/accept?token=tok%2Fen%2B123');
  });

  it('muestra copy claro cuando Supabase requiere confirmar correo', () => {
    expect(CONFIRM_EMAIL_RETURN_MESSAGE).toContain('falta finalizar la invitación');
    expect(CONFIRM_EMAIL_RETURN_MESSAGE).toContain('vuelve a abrir el enlace de invitación original');
  });

  it('muestra copy claro al detectar sesión sin profile y finalizar invitación', () => {
    expect(AUTO_ACCEPT_MESSAGE).toBe('Encontramos tu cuenta. Finalizando invitación...');
  });

  it('mapea estados inválido, expirado y usado sin filtrar detalles técnicos', () => {
    expect(mapAcceptError('invitation_invalid')).toContain('no es válida');
    expect(mapAcceptError('invitation_expired')).toContain('ha expirado');
    expect(mapAcceptError('invitation_used')).toContain('ya fue utilizada');
    expect(mapAcceptError('token_hash SECRET')).not.toContain('token_hash');
  });

  it('detecta cuenta existente para hacer signIn + finalizar invitación', () => {
    expect(isAlreadyRegisteredMessage('User already registered')).toBe(true);
    expect(isAlreadyRegisteredMessage('invalid password')).toBe(false);
  });

  it('el formulario persiste el token y finaliza vía helper, nunca escribe profiles', () => {
    const source = readFileSync(ACCEPT_FORM, 'utf8');

    // El cierre ya NO depende del token en la URL: se persiste antes del signUp.
    expect(source).toContain('storePendingInviteToken(token)');
    expect(source).toContain('finalizeInviteAcceptance(');
    // Sigue creando cuenta / iniciando sesión y guiando la confirmación de correo.
    expect(source).toContain('emailRedirectTo');
    expect(source).toContain('buildInviteConfirmationRedirect(window.location.origin, token)');
    expect(source).toContain('signInWithPassword');
    expect(source).toContain('autoAccept');
    // Nunca escribe profiles ni expone el token plano.
    expect(source).not.toContain(".from('profiles')");
    expect(source).not.toContain('.from("profiles")');
    expect(source).not.toContain('token_hash SECRET');
  });

  it('el helper de cierre usa el RPC como autoridad y no escribe profiles', () => {
    const source = readFileSync(FINALIZE, 'utf8');

    expect(source).toContain("supabase.rpc('accept_invitation'");
    // Deriva el usuario Auth SIN exigir profile (un Auth user sin membresía debe poder cerrar).
    expect(source).toContain('supabase.auth.getUser()');
    // El token se hashea (SHA-256); el token plano nunca va al RPC ni a la URL.
    expect(source).toContain('sha256Hex(token)');
    expect(source).toContain('p_token_hash');
    expect(source).not.toContain(".from('profiles')");
    expect(source).not.toContain('.from("profiles")');
  });

  it('la página pública usa sesión SSR solo para auto-finalizar invitación pendiente', () => {
    const source = readFileSync(ACCEPT_PAGE, 'utf8');

    // Usa claims de sesión directamente — NO el viewer (que exigiría profile).
    expect(source).toContain('getSessionClaims');
    expect(source).not.toContain('resolveViewer');
    expect(source).not.toContain('resolveAuthenticatedViewer');
    expect(source).toContain("result.status === 'pending'");
    expect(source).toContain('autoAccept={hasSession}');
    expect(source).toContain('peek_invitation');
  });

  it('el callback sigue sanitizando next y no ejecuta aceptación ni writes de membresía', () => {
    const source = readFileSync(CALLBACK_ROUTE, 'utf8');

    expect(source).toContain('sanitizeNext');
    expect(source).toContain('exchangeCodeForSession');
    expect(source).not.toContain('accept_invitation');
    expect(source).not.toContain(".from('profiles')");
    expect(source).not.toContain('.from("profiles")');
  });

  it('la recuperación de membresía finaliza y sólo navega al panel tras cierre confirmado', () => {
    const source = readFileSync(RECOVERY, 'utf8');

    expect(source).toContain('readPendingInviteToken()');
    expect(source).toContain('finalizeInviteAcceptance(');
    // Sólo recarga a /dashboard dentro del camino de éxito (result.ok).
    const okIdx = source.indexOf('result.ok');
    const assignIdx = source.indexOf("window.location.assign('/dashboard')");
    expect(okIdx).toBeGreaterThan(-1);
    expect(assignIdx).toBeGreaterThan(okIdx);
    expect(source).not.toContain(".from('profiles')");
  });

  it('el dashboard enruta no_membership a la recuperación (no callejón sin salida)', () => {
    const source = readFileSync(DASHBOARD_PAGE, 'utf8');

    expect(source).toContain("e.reason === 'no_membership'");
    expect(source).toContain('<InviteMembershipRecovery />');
  });
});
