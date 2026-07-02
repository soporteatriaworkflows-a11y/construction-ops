/**
 * index.ts — Punto de entrada del dominio de acceso operativo.
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/OPERATIONAL_ACCESS_AND_SMTP_V1_CONTRACT.md`.
 */
export * from './types';
export * from './permissions';
export * from './module-access';
export * from './errors';
export { requireModuleAccess, checkModuleAccess, type ModuleAccessCheck } from './guard';
export { generateInvitationToken, hashToken } from './token';
export { resolveAccessActor } from './actor';
export {
  listMembers,
  listInvitations,
  countPendingInvitations,
  getOrganizationName,
  effectiveInvitationStatus,
} from './read-repository';
export {
  buildAppPublicUrl,
  createInvitation,
  resendInvitation,
  revokeInvitation,
  changeMemberRole,
  acceptInvitationWithSession,
  getInvitationEmailDeliveryHealth,
  type AccessServiceDeps,
} from './service';
