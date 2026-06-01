/**
 * index.ts — Barrel del runtime de autenticación (Oleada 4A.2).
 * Propiedad: orquestador. Contrato: `docs/AUTH_RUNTIME_CONTRACT.md`.
 */
export type { AuthenticatedViewer, ProfileRole } from './types';
export { AuthError, type AuthDenyReason } from './errors';
export {
  mapProfileRoleToViewerRole,
  isSameOrLessPrivileged,
  VIEWER_ROLE_PRIVILEGE,
} from './role-map';
export { getSessionClaims, type SessionClaims } from './session';
export {
  resolveAuthenticatedViewer,
  toViewerContext,
  resolveViewer,
} from './resolve-viewer';
export {
  PUBLIC_ROUTES,
  PROTECTED_ROUTES,
  isPublicRoute,
  isProtectedRoute,
  sanitizeNext,
} from './routes';
