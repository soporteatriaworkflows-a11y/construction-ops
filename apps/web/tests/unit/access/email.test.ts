/**
 * email.test.ts — Email transaccional (FASE 9: 18,19,20,21,22).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  renderInvitationEmail,
  renderPasswordResetEmail,
  renderAccessRevokedEmail,
  LogEmailProvider,
  SmtpEmailProvider,
  resolveEmailProvider,
  readSmtpConfigFromEnv,
  sendTransactionalEmail,
} from '@/server/email';

afterEach(() => vi.restoreAllMocks());

describe('plantillas (19,20)', () => {
  it('invitación: asunto y cuerpo con rol, organización y enlace', () => {
    const msg = renderInvitationEmail({
      to: 'persona@iconic.test',
      fullName: 'María Pérez',
      organizationName: 'Grupo ICONIC',
      role: 'presupuestos',
      acceptUrl: 'https://app.test/invite/accept?token=ABC',
      expiresAtLabel: '20 de junio',
    });
    expect(msg.kind).toBe('invitation');
    expect(msg.subject).toContain('Grupo ICONIC');
    expect(msg.html).toContain('Presupuestos');
    expect(msg.html).toContain('https://app.test/invite/accept?token=ABC');
    expect(msg.text).toContain('https://app.test/invite/accept?token=ABC');
  });

  it('invitación reenviada: kind y asunto de recordatorio', () => {
    const msg = renderInvitationEmail({
      to: 'p@iconic.test',
      organizationName: 'Grupo ICONIC',
      role: 'obra',
      acceptUrl: 'https://app.test/x',
      expiresAtLabel: 'x',
      resent: true,
    });
    expect(msg.kind).toBe('invitation_resent');
    expect(msg.subject.toLowerCase()).toContain('recordatorio');
  });

  it('recuperación: asunto y enlace de reset', () => {
    const msg = renderPasswordResetEmail({ to: 'p@iconic.test', resetUrl: '{{ .ConfirmationURL }}' });
    expect(msg.kind).toBe('password_reset');
    expect(msg.subject.toLowerCase()).toContain('contraseña');
    expect(msg.html).toContain('{{ .ConfirmationURL }}');
  });

  it('escapa HTML del nombre/mensaje (anti-inyección)', () => {
    const msg = renderInvitationEmail({
      to: 'p@iconic.test',
      fullName: '<script>alert(1)</script>',
      organizationName: 'Grupo ICONIC',
      role: 'obra',
      acceptUrl: 'https://app.test/x',
      expiresAtLabel: 'x',
      message: '<b>hola</b>',
    });
    expect(msg.html).not.toContain('<script>');
    expect(msg.html).toContain('&lt;script&gt;');
    expect(msg.html).toContain('&lt;b&gt;hola');
  });

  it('revocación: kind correcto', () => {
    const msg = renderAccessRevokedEmail({ to: 'p@iconic.test', organizationName: 'Grupo ICONIC' });
    expect(msg.kind).toBe('access_revoked');
  });
});

describe('LogEmailProvider (18,21: dev no envía real; sin secretos en logs)', () => {
  it('captura el mensaje y NO realiza envío real', async () => {
    const log = new LogEmailProvider();
    const res = await log.send({
      to: 'p@iconic.test',
      subject: 'Hola',
      html: '<a href="https://app.test/invite/accept?token=SECRET">x</a>',
      text: 'token https://app.test/invite/accept?token=SECRET',
      kind: 'invitation',
    });
    expect(res).toMatchObject({ delivered: true, provider: 'log' });
    expect(log.outbox).toHaveLength(1);
  });

  it('no loguea el token ni el cuerpo en consola (21)', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const log = new LogEmailProvider();
    await log.send({
      to: 'p@iconic.test',
      subject: 'Invitación',
      html: 'token=SUPERSECRETTOKEN',
      text: 'token=SUPERSECRETTOKEN',
      kind: 'invitation',
    });
    const logged = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).not.toContain('SUPERSECRETTOKEN');
    expect(logged).toContain('invitation');
  });
});

describe('SmtpEmailProvider (22: ausencia de dependencia → fallback)', () => {
  it('sin nodemailer instalado, no entrega y marca fallback', async () => {
    const smtp = new SmtpEmailProvider({
      host: 'smtp.test',
      port: 587,
      user: 'u',
      password: 'p',
      from: 'ICONIC <no-reply@iconic.test>',
      secure: false,
    });
    const res = await smtp.send({
      to: 'p@iconic.test',
      subject: 's',
      html: 'h',
      text: 't',
      kind: 'invitation',
    });
    // nodemailer no está instalado en el entorno de test ⇒ delivered:false.
    expect(res.delivered).toBe(false);
    expect(res.fallback).toBe(true);
    expect(res.provider).toBe('smtp');
  });
});

describe('resolveEmailProvider / readSmtpConfigFromEnv', () => {
  it('sin SMTP_* ⇒ Log', () => {
    expect(resolveEmailProvider({} as NodeJS.ProcessEnv).id).toBe('log');
  });
  it('EMAIL_PROVIDER=log fuerza Log aun con SMTP_*', () => {
    const env = {
      EMAIL_PROVIDER: 'log',
      SMTP_HOST: 'h', SMTP_PORT: '587', SMTP_USER: 'u', SMTP_PASSWORD: 'p', SMTP_FROM: 'f',
    } as unknown as NodeJS.ProcessEnv;
    expect(resolveEmailProvider(env).id).toBe('log');
  });
  it('SMTP_* completas ⇒ smtp', () => {
    const env = {
      SMTP_HOST: 'h', SMTP_PORT: '465', SMTP_USER: 'u', SMTP_PASSWORD: 'p', SMTP_FROM: 'f',
    } as unknown as NodeJS.ProcessEnv;
    expect(resolveEmailProvider(env).id).toBe('smtp');
    expect(readSmtpConfigFromEnv(env)?.secure).toBe(true); // 465 ⇒ secure
  });
  it('SMTP incompleto ⇒ null config', () => {
    expect(readSmtpConfigFromEnv({ SMTP_HOST: 'h' } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe('sendTransactionalEmail (fallback SMTP→Log)', () => {
  it('si SMTP no entrega, cae a Log sin romper el flujo', async () => {
    const env = {
      SMTP_HOST: 'h', SMTP_PORT: '587', SMTP_USER: 'u', SMTP_PASSWORD: 'p', SMTP_FROM: 'f',
    } as unknown as NodeJS.ProcessEnv;
    const res = await sendTransactionalEmail(
      { to: 'p@iconic.test', subject: 's', html: 'h', text: 't', kind: 'invitation' },
      env,
    );
    // SMTP falla (sin nodemailer) ⇒ fallback a log entregado.
    expect(res.delivered).toBe(true);
    expect(res.fallback).toBe(true);
  });
});
