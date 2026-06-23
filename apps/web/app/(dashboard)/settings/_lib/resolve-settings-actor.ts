/**
 * resolve-settings-actor.ts — Resolución read-only del actor para las páginas de
 * Configuración (SETTINGS_PROFILE_ACCOUNT_V1).
 *
 * SOLO lectura: envuelve el resolver server-side EXISTENTE (`resolveAccessActor`)
 * y degrada a anónimo (deny-by-default) si falla. No añade consultas ni escribe.
 * Centraliza el patrón que ya usaban el layout y el hub para no duplicarlo.
 */
import { resolveAccessActor, canManageAccess } from '@/server/access';

export interface SettingsActor {
  email: string | null;
  role: string | null;
  canManageAccess: boolean;
}

export async function resolveSettingsActor(): Promise<SettingsActor> {
  try {
    const actor = await resolveAccessActor();
    return {
      email: actor.email ?? null,
      role: actor.profileRole ?? null,
      canManageAccess: canManageAccess(actor.profileRole),
    };
  } catch {
    return { email: null, role: null, canManageAccess: false };
  }
}
