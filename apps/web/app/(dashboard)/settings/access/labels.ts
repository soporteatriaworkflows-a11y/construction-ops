/**
 * labels.ts — Etiquetas en español para roles y estados (UI de accesos).
 *
 * Puro y sin dependencias server-only: importable por Client Components.
 */
import type { InvitationStatus } from '@/server/access';

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  gerencia: 'Gerencia',
  presupuestos: 'Presupuestos',
  compras: 'Compras',
  obra: 'Obra',
  // V5.6.6A: naming visible — el rol de DB sigue siendo `consulta`; la
  // etiqueta antepone "Cliente" para que el operador lo encuentre sin dudar.
  consulta: 'Cliente / consulta',
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export const INVITATION_STATUS_LABELS: Record<InvitationStatus, string> = {
  pending: 'Invitación pendiente',
  accepted: 'Aceptada',
  revoked: 'Revocada',
  expired: 'Invitación vencida',
};

export function invitationStatusLabel(status: InvitationStatus): string {
  return INVITATION_STATUS_LABELS[status] ?? status;
}

/** Clases de color del badge según estado efectivo de invitación. */
export function invitationStatusClasses(status: InvitationStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'accepted':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'revoked':
      return 'bg-gray-100 text-gray-600 border-gray-200';
    case 'expired':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}
