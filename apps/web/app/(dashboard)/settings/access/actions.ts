/**
 * actions.ts — Server Actions de gestión de accesos (OPERATIONAL_ACCESS_V1).
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/OPERATIONAL_ACCESS_AND_SMTP_V1_CONTRACT.md §3,§7`.
 *
 * Reglas de seguridad:
 *  - Actor resuelto server-side (`resolveAccessActor`). org/rol jamás del navegador.
 *  - Permiso verificado en el servidor (canManageAccess) ADEMÁS del backstop SQL.
 *  - Las mutaciones reales exigen APP_AUTH_MODE=supabase.
 *  - Errores sanitizados (sin SQL/stack). NUNCA se loguea el token.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { resolveAuthMode } from '@/lib/supabase/env';
import {
  resolveAccessActor,
  createInvitation,
  resendInvitation,
  revokeInvitation,
  changeMemberRole,
  canManageAccess,
  AccessError,
} from '@/server/access';
import { AuthError } from '@/server/auth/errors';

export interface AccessActionResult {
  success: boolean;
  error?: string;
  message?: string;
  /** Enlace de aceptación cuando no hay envío real de correo (fallback dev). */
  inviteLink?: string;
}

const DEMO_MSG =
  'La gestión de accesos requiere modo de operación real (APP_AUTH_MODE=supabase). ' +
  'En modo demostración solo se puede visualizar.';

/** Resuelve el actor con permisos de gestión, o devuelve un error de acción. */
async function requireManager(): Promise<
  | { ok: true; actor: Awaited<ReturnType<typeof resolveAccessActor>> }
  | { ok: false; result: AccessActionResult }
> {
  if (resolveAuthMode() !== 'supabase') {
    return { ok: false, result: { success: false, error: DEMO_MSG } };
  }
  try {
    const actor = await resolveAccessActor();
    if (!canManageAccess(actor.profileRole)) {
      return {
        ok: false,
        result: { success: false, error: 'No tienes permisos para gestionar accesos.' },
      };
    }
    return { ok: true, actor };
  } catch (e) {
    const msg =
      e instanceof AuthError
        ? 'No hay sesión válida. Inicia sesión e inténtalo de nuevo.'
        : 'No se pudo verificar tu sesión.';
    return { ok: false, result: { success: false, error: msg } };
  }
}

export async function inviteUserAction(
  _prev: AccessActionResult | null,
  formData: FormData,
): Promise<AccessActionResult> {
  const guard = await requireManager();
  if (!guard.ok) return guard.result;

  const email = String(formData.get('email') ?? '').trim();
  const role = String(formData.get('role') ?? '').trim();
  const fullName = String(formData.get('fullName') ?? '').trim() || null;
  const message = String(formData.get('message') ?? '').trim() || null;

  try {
    const issued = await createInvitation(guard.actor, { email, role, fullName, message });
    revalidatePath('/settings/access');
    return {
      success: true,
      message: `Invitación creada para ${issued.email}.`,
      inviteLink: issued.emailFallback ? issued.acceptUrl : undefined,
    };
  } catch (e) {
    return { success: false, error: toMessage(e) };
  }
}

export async function resendInvitationAction(
  _prev: AccessActionResult | null,
  formData: FormData,
): Promise<AccessActionResult> {
  const guard = await requireManager();
  if (!guard.ok) return guard.result;
  const invitationId = String(formData.get('invitationId') ?? '');

  try {
    const issued = await resendInvitation(guard.actor, invitationId);
    revalidatePath('/settings/access');
    return {
      success: true,
      message: `Invitación reenviada a ${issued.email}.`,
      inviteLink: issued.emailFallback ? issued.acceptUrl : undefined,
    };
  } catch (e) {
    return { success: false, error: toMessage(e) };
  }
}

export async function revokeInvitationAction(
  _prev: AccessActionResult | null,
  formData: FormData,
): Promise<AccessActionResult> {
  const guard = await requireManager();
  if (!guard.ok) return guard.result;
  const invitationId = String(formData.get('invitationId') ?? '');

  try {
    await revokeInvitation(guard.actor, invitationId);
    revalidatePath('/settings/access');
    return { success: true, message: 'Invitación revocada.' };
  } catch (e) {
    return { success: false, error: toMessage(e) };
  }
}

export async function changeRoleAction(
  _prev: AccessActionResult | null,
  formData: FormData,
): Promise<AccessActionResult> {
  const guard = await requireManager();
  if (!guard.ok) return guard.result;
  const targetUserId = String(formData.get('userId') ?? '');
  const newRole = String(formData.get('role') ?? '');

  try {
    await changeMemberRole(guard.actor, targetUserId, newRole);
    revalidatePath('/settings/access');
    return { success: true, message: 'Rol actualizado.' };
  } catch (e) {
    return { success: false, error: toMessage(e) };
  }
}

function toMessage(e: unknown): string {
  if (e instanceof AccessError) return e.message;
  return 'No se pudo completar la operación. Inténtalo de nuevo.';
}
