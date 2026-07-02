export const CONFIRM_EMAIL_RETURN_MESSAGE =
  'Tu correo fue creado, pero falta finalizar la invitación. Después de confirmar el correo, vuelve a abrir el enlace de invitación original para activar tu acceso.';

export const AUTO_ACCEPT_MESSAGE = 'Encontramos tu cuenta. Finalizando invitación...';

export const ACCESS_ACTIVATED_MESSAGE = 'Acceso activado. Redirigiendo...';

const ACCEPT_ERRORS: Record<string, string> = {
  invitation_invalid: 'La invitación no es válida.',
  invitation_revoked: 'Esta invitación fue revocada.',
  invitation_used: 'Esta invitación ya fue utilizada.',
  invitation_expired: 'Esta invitación ha expirado. Solicita una nueva.',
  email_mismatch: 'El correo de tu cuenta no coincide con el de la invitación.',
  already_member: 'Ya eres miembro de una organización.',
  no_session: 'No se pudo iniciar tu sesión. Intenta de nuevo.',
};

export function mapAcceptError(message: string | undefined): string {
  const raw = (message ?? '').toLowerCase();
  for (const [key, msg] of Object.entries(ACCEPT_ERRORS)) {
    if (raw.includes(key)) return msg;
  }
  return 'No se pudo aceptar la invitación. Intenta de nuevo.';
}

export function isAlreadyRegisteredMessage(message: string | undefined): boolean {
  return (message ?? '').toLowerCase().includes('already');
}

export function buildInviteConfirmationRedirect(origin: string, token: string): string {
  const safeOrigin = origin.replace(/\/+$/, '');
  const next = `/invite/accept?token=${encodeURIComponent(token)}`;
  return `${safeOrigin}/auth/callback?next=${encodeURIComponent(next)}`;
}
