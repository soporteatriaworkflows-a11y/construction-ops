/**
 * types.ts — Tipos del dominio de acceso operativo.
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/OPERATIONAL_ACCESS_AND_SMTP_V1_CONTRACT.md §1-3`.
 */
import type { ProfileRole } from '@/server/auth/types';
import type { Uuid } from '@/lib/contracts/read-model';

/** Actor server-side de las operaciones de acceso (jamás desde el navegador). */
export interface AccessActor {
  userId: Uuid;
  organizationId: Uuid;
  profileRole: ProfileRole;
  email?: string;
}

/** Miembro activo de la organización (fila de profiles). */
export interface MemberView {
  userId: Uuid;
  fullName: string;
  email: string;
  role: ProfileRole;
  createdAt: string;
}

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

/** Invitación, proyectada para la UI (NUNCA incluye token ni su hash). */
export interface InvitationView {
  id: Uuid;
  email: string;
  fullName: string | null;
  role: ProfileRole;
  status: InvitationStatus;
  /** Estado efectivo: 'pending' vencida ⇒ se muestra como vencida. */
  effectiveStatus: InvitationStatus;
  invitedAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

export interface CreateInvitationInput {
  email: string;
  fullName?: string | null;
  role: string;
  message?: string | null;
}

/** Resultado de crear/reenviar invitación: incluye el enlace (con token plano). */
export interface InvitationIssued {
  invitationId: Uuid;
  email: string;
  role: ProfileRole;
  acceptUrl: string;
  expiresAt: string;
  /** true si el correo NO se entregó de verdad (dev/log o fallback). */
  emailFallback: boolean;
}
