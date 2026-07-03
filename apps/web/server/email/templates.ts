/**
 * templates.ts — Plantillas PURAS de email transaccional (español + ICONIC).
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/OPERATIONAL_ACCESS_AND_SMTP_V1_CONTRACT.md §5`.
 *
 * Cada función es PURA y testeable: recibe datos y devuelve `EmailMessage`
 * (`{ to, subject, html, text, kind }`). No accede a env, red ni secretos.
 * Los valores provistos por el usuario se escapan para HTML (anti-inyección).
 * NUNCA se incluye el token en texto plano fuera del enlace de aceptación.
 */
import type { EmailMessage } from './types';

/** Nombre visible del producto (branding ICONIC OPS). */
const PRODUCT_NAME = 'ICONIC OPS';
const BRAND_PRIMARY = '#005DD6';
const BRAND_INK = '#020148';

/** Etiquetas en español de los roles (mismo dominio que profiles.role). */
const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  gerencia: 'Gerencia',
  presupuestos: 'Presupuestos',
  compras: 'Compras',
  obra: 'Obra',
  // Paridad con settings/access/labels.ts (V5.6.6A).
  consulta: 'Cliente / consulta',
};

/** Etiqueta legible de un rol; cae al código si es desconocido. */
export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

/** Escapa texto para insertarlo de forma segura en HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Envoltorio HTML común (inline styles, email-safe). */
function wrap(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#F2F4F7;font-family:Arial,Helvetica,sans-serif;color:${BRAND_INK};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E2E8F0;">
<tr><td style="background:${BRAND_INK};padding:20px 28px;">
<span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:.5px;">${PRODUCT_NAME}</span>
</td></tr>
<tr><td style="padding:28px;">
<h1 style="margin:0 0 16px;font-size:20px;color:${BRAND_INK};">${escapeHtml(title)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #EEF2F6;color:#64748B;font-size:12px;">
Este es un correo automático de ${PRODUCT_NAME}. Si no esperabas este mensaje, puedes ignorarlo.
</td></tr>
</table></td></tr></table></body></html>`;
}

/** Botón HTML primario. */
function button(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:${BRAND_PRIMARY};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">${escapeHtml(label)}</a>`;
}

export interface InvitationEmailParams {
  to: string;
  fullName?: string | null;
  organizationName: string;
  role: string;
  acceptUrl: string;
  expiresAtLabel: string;
  message?: string | null;
  resent?: boolean;
}

/** Plantilla: invitación (o reenvío si `resent`). */
export function renderInvitationEmail(p: InvitationEmailParams): EmailMessage {
  const greeting = p.fullName ? `Hola ${escapeHtml(p.fullName)}` : 'Hola';
  const verb = p.resent ? 'te reenviamos' : 'te invitamos a unirte';
  const subject = p.resent
    ? `Recordatorio: invitación a ${p.organizationName} en ${PRODUCT_NAME}`
    : `Invitación a ${p.organizationName} en ${PRODUCT_NAME}`;

  const note = p.message
    ? `<p style="margin:0 0 16px;padding:12px 14px;background:#F8FAFC;border-left:3px solid ${BRAND_PRIMARY};color:#334155;font-size:14px;">${escapeHtml(p.message)}</p>`
    : '';

  const html = wrap(
    p.resent ? 'Invitación reenviada' : 'Te han invitado',
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;">${greeting}, ${verb} a
<strong>${escapeHtml(p.organizationName)}</strong> en ${PRODUCT_NAME} con el rol
<strong>${escapeHtml(roleLabel(p.role))}</strong>.</p>
${note}
<p style="margin:0 0 20px;font-size:15px;">Para activar tu acceso, define tu contraseña aquí:</p>
<p style="margin:0 0 20px;">${button(p.acceptUrl, 'Aceptar invitación')}</p>
<p style="margin:0;color:#64748B;font-size:13px;">El enlace vence el ${escapeHtml(p.expiresAtLabel)}. Por seguridad, no lo compartas.</p>`,
  );

  const text = `${p.fullName ? `Hola ${p.fullName}, ` : 'Hola, '}${verb} a ${p.organizationName} en ${PRODUCT_NAME} con el rol ${roleLabel(p.role)}.
${p.message ? `\nMensaje: ${p.message}\n` : ''}
Acepta tu invitación y define tu contraseña:
${p.acceptUrl}

El enlace vence el ${p.expiresAtLabel}. No lo compartas.`;

  return { to: p.to, subject, html, text, kind: p.resent ? 'invitation_resent' : 'invitation' };
}

export interface PasswordResetEmailParams {
  to: string;
  /** En Supabase Auth: usar el placeholder "{{ .ConfirmationURL }}". */
  resetUrl: string;
}

/**
 * Plantilla: recuperación de contraseña. Es la fuente de verdad del contenido
 * que se configura en el panel de Supabase Auth (usar `{{ .ConfirmationURL }}`
 * como `resetUrl`). Mantiene branding ICONIC y mensaje neutral.
 */
export function renderPasswordResetEmail(p: PasswordResetEmailParams): EmailMessage {
  const subject = `Recuperación de contraseña — ${PRODUCT_NAME}`;
  const html = wrap(
    'Recuperación de contraseña',
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;">Recibimos una solicitud para restablecer la contraseña de tu cuenta en ${PRODUCT_NAME}.</p>
<p style="margin:0 0 20px;">${button(p.resetUrl, 'Restablecer contraseña')}</p>
<p style="margin:0;color:#64748B;font-size:13px;">Si no solicitaste este cambio, ignora este correo; tu contraseña no se modificará.</p>`,
  );
  const text = `Recibimos una solicitud para restablecer tu contraseña en ${PRODUCT_NAME}.

Restablécela aquí:
${p.resetUrl}

Si no lo solicitaste, ignora este correo.`;
  return { to: p.to, subject, html, text, kind: 'password_reset' };
}

export interface AccessRevokedEmailParams {
  to: string;
  organizationName: string;
}

/** Plantilla: invitación revocada / acceso revocado (notificación). */
export function renderAccessRevokedEmail(p: AccessRevokedEmailParams): EmailMessage {
  const subject = `Acceso revocado — ${p.organizationName}`;
  const html = wrap(
    'Acceso revocado',
    `<p style="margin:0;font-size:15px;line-height:1.5;">Tu invitación o acceso a
<strong>${escapeHtml(p.organizationName)}</strong> en ${PRODUCT_NAME} fue revocado por un administrador.
Si crees que es un error, contacta a la administración de tu organización.</p>`,
  );
  const text = `Tu invitación o acceso a ${p.organizationName} en ${PRODUCT_NAME} fue revocado por un administrador. Si crees que es un error, contacta a la administración de tu organización.`;
  return { to: p.to, subject, html, text, kind: 'access_revoked' };
}
