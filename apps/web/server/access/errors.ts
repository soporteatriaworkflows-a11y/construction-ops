/**
 * errors.ts — Errores de dominio del acceso operativo + mapeo a español.
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/OPERATIONAL_ACCESS_AND_SMTP_V1_CONTRACT.md §3-4`.
 *
 * Traduce los errcodes/mensajes de las RPCs SQL a mensajes legibles en español.
 * NUNCA propaga SQL/stack hacia la UI ni revela detalles sensibles.
 */
export class AccessError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AccessError';
    this.code = code;
  }
}

/** Mensajes en español por código de error de las RPCs. */
const MESSAGES: Record<string, string> = {
  no_session: 'No hay sesión válida. Inicia sesión e inténtalo de nuevo.',
  no_membership: 'Tu usuario no pertenece a ninguna organización.',
  insufficient_role: 'No tienes permisos para gestionar accesos.',
  invalid_email: 'El correo electrónico no es válido.',
  invalid_role: 'El rol seleccionado no es válido.',
  cannot_grant_admin: 'Solo un administrador puede asignar el rol Administrador.',
  cannot_manage_admin: 'No puedes modificar el rol de un administrador.',
  cannot_change_self: 'No puedes cambiar tu propio rol.',
  invalid_token: 'El enlace de invitación no es válido.',
  already_member: 'Esa persona ya es miembro de la organización.',
  already_invited: 'Ya existe una invitación pendiente para ese correo.',
  invitation_not_found: 'No se encontró la invitación.',
  invitation_not_pending: 'La invitación ya no está pendiente.',
  invitation_not_resendable: 'Esta invitación no se puede reenviar.',
  member_not_found: 'No se encontró el miembro en tu organización.',
  invitation_invalid: 'La invitación no es válida.',
  invitation_revoked: 'Esta invitación fue revocada.',
  invitation_used: 'Esta invitación ya fue utilizada.',
  invitation_expired: 'Esta invitación ha expirado. Solicita una nueva.',
  email_mismatch: 'El correo de tu cuenta no coincide con el de la invitación.',
  // V5.6.4 — grants de proyecto (grant/revoke_project_access):
  grants_only_for_consulta:
    'Solo los usuarios con rol Consulta usan proyectos asignados; los roles internos ya ven todos los proyectos.',
  grant_not_found: 'Ese usuario no tiene asignado ese proyecto.',
  project_not_found: 'No se encontró el proyecto en tu organización.',
};

/** Extrae un código de error conocido del mensaje de error de Postgres/Supabase. */
export function mapRpcError(error: { message?: string; code?: string } | null): AccessError {
  const raw = (error?.message ?? '').toLowerCase();
  for (const [key, message] of Object.entries(MESSAGES)) {
    if (raw.includes(key)) {
      return new AccessError(key, message);
    }
  }
  return new AccessError(
    'access_failed',
    'No se pudo completar la operación. Inténtalo de nuevo.',
  );
}

/** Mensaje legible para un código de error (o genérico). */
export function accessMessage(code: string): string {
  return MESSAGES[code] ?? 'No se pudo completar la operación.';
}
