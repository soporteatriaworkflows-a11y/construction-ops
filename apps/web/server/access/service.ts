/**
 * service.ts - Casos de uso del acceso operativo (server-side).
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/OPERATIONAL_ACCESS_AND_SMTP_V1_CONTRACT.md §2-6`.
 *
 * Orquesta: validación de permisos (defensa en profundidad), generación del
 * token, llamada a la RPC SECURITY DEFINER (cliente RLS-bound, NUNCA
 * service-role), y envío del correo transaccional (Log en dev/test). El
 * `organizationId`, el actor y el rol se resuelven server-side.
 */
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Uuid } from '@/lib/contracts/read-model';
import type { ProfileRole } from '@/server/auth/types';
import {
  renderInvitationEmail,
  renderAccessRevokedEmail,
  sendTransactionalEmail,
  getEmailDeliveryHealth,
  type EmailDeliveryHealth,
  type EmailMessage,
  type EmailSendResult,
} from '@/server/email';
import { canAssignRole, canManageAccess, evaluateRoleChange } from './permissions';
import { generateInvitationToken } from './token';
import { AccessError, mapRpcError } from './errors';
import { getOrganizationName, listInvitations, listMembers } from './read-repository';
import type {
  AccessActor,
  CreateInvitationInput,
  InvitationIssued,
} from './types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AccessServiceDeps {
  clientFactory?: () => Promise<SupabaseClient>;
  sendEmail?: (message: EmailMessage) => Promise<EmailSendResult>;
  now?: () => Date;
}

/** Base pública de la app para construir enlaces de invitación. */
export function buildAppPublicUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.APP_PUBLIC_URL?.trim() ||
    env.NEXT_PUBLIC_APP_URL?.trim() ||
    'http://localhost:3000'
  ).replace(/\/+$/, '');
}

/** TTL de invitación en horas (default 7 días). */
function inviteTtlHours(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number.parseInt(env.INVITE_TTL_HOURS ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 168;
}

function buildAcceptUrl(token: string): string {
  return `${buildAppPublicUrl()}/invite/accept?token=${encodeURIComponent(token)}`;
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  if (!local || !domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

function logInvitationEmailAttempt(params: {
  provider: EmailSendResult['provider'];
  result: EmailSendResult['status'];
  recipient: string;
  invitationId: string;
  messageId?: string;
  errorCode?: string;
}): void {
  const parts = [
    'event=invitation_email',
    `provider=${params.provider}`,
    `result=${params.result}`,
    `recipient_masked=${maskEmail(params.recipient)}`,
    `invitation_id=${params.invitationId}`,
  ];
  if (params.messageId) parts.push(`messageId=${params.messageId}`);
  if (params.errorCode) parts.push(`error_code=${params.errorCode}`);
  console.info(parts.join(' '));
}

function toIssuedEmailDelivery(sent: EmailSendResult): InvitationIssued['emailDelivery'] {
  return {
    status: sent.status,
    provider: sent.provider,
    messageId: sent.messageId,
    errorCode: sent.errorCode,
  };
}
function expiresLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-CO', {
      dateStyle: 'long',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

/**
 * Crea una invitación: valida permisos, genera token, llama a la RPC y envía el
 * correo (Log en dev). Devuelve el enlace de aceptación (fallback si no hay SMTP).
 */
export async function createInvitation(
  actor: AccessActor,
  input: CreateInvitationInput,
  deps: AccessServiceDeps = {},
): Promise<InvitationIssued> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new AccessError('invalid_email', 'El correo electrónico no es válido.');
  }
  if (!canAssignRole(actor.profileRole, input.role)) {
    throw new AccessError(
      input.role === 'admin' ? 'cannot_grant_admin' : 'insufficient_role',
      input.role === 'admin'
        ? 'Solo un administrador puede asignar el rol Administrador.'
        : 'No tienes permisos para asignar ese rol.',
    );
  }

  const { token, tokenHash } = generateInvitationToken();
  const supabase = await (deps.clientFactory ?? createClient)();
  const { data, error } = await supabase.rpc('create_invitation', {
    p_email: email,
    p_role: input.role,
    p_token_hash: tokenHash,
    p_full_name: input.fullName ?? null,
    p_message: input.message ?? null,
    p_ttl_hours: inviteTtlHours(),
  });
  if (error) throw mapRpcError(error);

  const result = data as { invitationId: string; expiresAt: string };
  const acceptUrl = buildAcceptUrl(token);
  const orgName = await getOrganizationName(actor.organizationId);

  const message = renderInvitationEmail({
    to: email,
    fullName: input.fullName,
    organizationName: orgName,
    role: input.role,
    acceptUrl,
    expiresAtLabel: expiresLabel(result.expiresAt),
    message: input.message,
  });
  const sent = await (deps.sendEmail ?? sendTransactionalEmail)(message);
  logInvitationEmailAttempt({
    provider: sent.provider,
    result: sent.status,
    recipient: email,
    invitationId: result.invitationId,
    messageId: sent.messageId,
    errorCode: sent.errorCode,
  });

  return {
    invitationId: result.invitationId,
    email,
    role: input.role as ProfileRole,
    acceptUrl,
    expiresAt: result.expiresAt,
    emailDelivery: toIssuedEmailDelivery(sent),
    emailFallback: sent.status !== 'sent',
  };
}

/** Reenvía una invitación pendiente: rota token y reenvía el correo. */
export async function resendInvitation(
  actor: AccessActor,
  invitationId: Uuid,
  deps: AccessServiceDeps = {},
): Promise<InvitationIssued> {
  const invitations = await listInvitations(actor.organizationId);
  const invitation = invitations.find((i) => i.id === invitationId);
  if (!invitation) {
    throw new AccessError('invitation_not_found', 'No se encontró la invitación.');
  }

  const { token, tokenHash } = generateInvitationToken();
  const supabase = await (deps.clientFactory ?? createClient)();
  const { data, error } = await supabase.rpc('resend_invitation', {
    p_invitation_id: invitationId,
    p_token_hash: tokenHash,
    p_ttl_hours: inviteTtlHours(),
  });
  if (error) throw mapRpcError(error);

  const result = data as { expiresAt: string };
  const acceptUrl = buildAcceptUrl(token);
  const orgName = await getOrganizationName(actor.organizationId);

  const message = renderInvitationEmail({
    to: invitation.email,
    fullName: invitation.fullName,
    organizationName: orgName,
    role: invitation.role,
    acceptUrl,
    expiresAtLabel: expiresLabel(result.expiresAt),
    resent: true,
  });
  const sent = await (deps.sendEmail ?? sendTransactionalEmail)(message);
  logInvitationEmailAttempt({
    provider: sent.provider,
    result: sent.status,
    recipient: invitation.email,
    invitationId,
    messageId: sent.messageId,
    errorCode: sent.errorCode,
  });

  return {
    invitationId,
    email: invitation.email,
    role: invitation.role,
    acceptUrl,
    expiresAt: result.expiresAt,
    emailDelivery: toIssuedEmailDelivery(sent),
    emailFallback: sent.status !== 'sent',
  };
}

export function getInvitationEmailDeliveryHealth(
  actor: AccessActor,
  env: NodeJS.ProcessEnv = process.env,
): EmailDeliveryHealth {
  if (!canManageAccess(actor.profileRole)) {
    throw new AccessError('insufficient_role', 'No tienes permisos para consultar el estado de correo.');
  }
  return getEmailDeliveryHealth(env);
}
/** Revoca una invitación pendiente (y notifica al invitado, best-effort). */
export async function revokeInvitation(
  actor: AccessActor,
  invitationId: Uuid,
  deps: AccessServiceDeps = {},
): Promise<{ invitationId: Uuid; status: 'revoked' }> {
  const invitations = await listInvitations(actor.organizationId);
  const invitation = invitations.find((i) => i.id === invitationId);

  const supabase = await (deps.clientFactory ?? createClient)();
  const { error } = await supabase.rpc('revoke_invitation', {
    p_invitation_id: invitationId,
  });
  if (error) throw mapRpcError(error);

  if (invitation) {
    const orgName = await getOrganizationName(actor.organizationId);
    const message = renderAccessRevokedEmail({
      to: invitation.email,
      organizationName: orgName,
    });
    // Best-effort: una falla de notificación no revierte la revocación.
    try {
      await (deps.sendEmail ?? sendTransactionalEmail)(message);
    } catch {
      /* noop */
    }
  }

  return { invitationId, status: 'revoked' };
}

/** Cambia el rol de otro miembro (anti-escalamiento). */
export async function changeMemberRole(
  actor: AccessActor,
  targetUserId: Uuid,
  newRole: string,
  deps: AccessServiceDeps = {},
): Promise<{ userId: Uuid; role: ProfileRole }> {
  const members = await listMembers(actor.organizationId);
  const target = members.find((m) => m.userId === targetUserId);
  const decision = evaluateRoleChange({
    actorRole: actor.profileRole,
    actorIsTarget: actor.userId === targetUserId,
    targetCurrentRole: target?.role ?? '',
    newRole,
  });
  if (!decision.ok) {
    throw new AccessError(decision.reason ?? 'access_failed', accessReason(decision.reason));
  }

  const supabase = await (deps.clientFactory ?? createClient)();
  const { data, error } = await supabase.rpc('change_member_role', {
    p_target_user_id: targetUserId,
    p_new_role: newRole,
  });
  if (error) throw mapRpcError(error);

  const result = data as { userId: string; role: string };
  return { userId: result.userId, role: result.role as ProfileRole };
}

/**
 * Acepta una invitación con la sesión del invitado (auth.uid presente). Llama a
 * la RPC `accept_invitation` con el cliente RLS-bound del invitado.
 */
export async function acceptInvitationWithSession(
  params: { tokenHash: string; email: string; fullName?: string | null },
  deps: AccessServiceDeps = {},
): Promise<{ organizationId: Uuid; role: ProfileRole }> {
  const supabase = await (deps.clientFactory ?? createClient)();
  const { data, error } = await supabase.rpc('accept_invitation', {
    p_token_hash: params.tokenHash,
    p_email: params.email,
    p_full_name: params.fullName ?? null,
  });
  if (error) throw mapRpcError(error);
  const result = data as { organizationId: string; role: string };
  return { organizationId: result.organizationId, role: result.role as ProfileRole };
}

function accessReason(reason: string | undefined): string {
  switch (reason) {
    case 'insufficient_role':
      return 'No tienes permisos para gestionar accesos.';
    case 'cannot_change_self':
      return 'No puedes cambiar tu propio rol.';
    case 'invalid_role':
      return 'El rol seleccionado no es válido.';
    case 'cannot_manage_admin':
      return 'No puedes modificar el rol de un administrador.';
    default:
      return 'No se pudo completar la operación.';
  }
}
