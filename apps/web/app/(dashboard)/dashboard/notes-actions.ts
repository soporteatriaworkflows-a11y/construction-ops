/**
 * notes-actions.ts — Server Actions de Quick Notes del dashboard (V5.4.2b).
 *
 * Reglas:
 *  - organization_id y created_by SIEMPRE server-side (viewer resuelto aquí).
 *  - Crear: roles internos autorizados (guard app + RLS real). `consulta`/`client` no.
 *  - Archivar: creador o admin/gerencia (RLS lo impone; app guard deny client).
 *  - Solo `READ_MODEL_SOURCE=db` escribe (fixture = demo de solo lectura).
 *  - NUNCA se exponen mensajes técnicos de Postgres/RLS (mappers curados).
 *
 * La UI real de NotesCard (consumo de estas actions) llega en V5.4.2c.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { AuthError } from '@/server/auth/errors';
import { parseReadModelSource } from '@/lib/supabase/env';
import {
  getQuickNotesRepository,
  canCreateQuickNotes,
  canAttemptArchiveQuickNote,
  toCreateErrorResult,
  toArchiveErrorResult,
  type QuickNoteActionResult,
} from '@/server/quick-notes';
import type { AuthenticatedViewer } from '@/server/auth/types';

function isDbMode(): boolean {
  try {
    return parseReadModelSource(process.env.READ_MODEL_SOURCE) === 'db';
  } catch {
    return false;
  }
}

function handleAuthError(e: unknown): QuickNoteActionResult {
  if (e instanceof AuthError) {
    const msgs: Record<string, string> = {
      no_session: 'No hay sesión activa.',
      no_membership: 'No tienes membresía activa.',
      invalid_role: 'Tu rol no permite esta acción.',
      config: 'Error de configuración.',
    };
    return { success: false, error: msgs[e.reason] ?? 'Error de autenticación.' };
  }
  return { success: false, error: 'Error al verificar la sesión.' };
}

async function resolveViewerOrFailure(): Promise<
  { viewer: AuthenticatedViewer } | { failure: QuickNoteActionResult }
> {
  if (!isDbMode()) {
    return { failure: { success: false, error: 'Las notas no están disponibles en modo demostración.' } };
  }
  try {
    return { viewer: await resolveAuthenticatedViewer() };
  } catch (e) {
    return { failure: handleAuthError(e) };
  }
}

/** Crea una nota rápida. Roles operativos internos; `consulta`/`client` no. */
export async function createQuickNoteAction(
  _prevState: QuickNoteActionResult | null,
  formData: FormData,
): Promise<QuickNoteActionResult> {
  const auth = await resolveViewerOrFailure();
  if ('failure' in auth) return auth.failure;
  if (!canCreateQuickNotes(auth.viewer.role)) {
    return { success: false, error: 'No tienes permiso para crear notas.' };
  }

  const body = (formData.get('body') as string | null) ?? '';
  const projectId = ((formData.get('projectId') as string | null) || null)?.trim() || null;
  const estimateId = ((formData.get('estimateId') as string | null) || null)?.trim() || null;

  try {
    const repo = getQuickNotesRepository();
    const note = await repo.createQuickNote(auth.viewer, { body, projectId, estimateId });
    revalidatePath('/dashboard');
    return { success: true, noteId: note.id };
  } catch (e) {
    return toCreateErrorResult(e);
  }
}

/** Archiva una nota (active → archived). Creador o admin/gerencia (RLS lo exige). */
export async function archiveQuickNoteAction(
  _prevState: QuickNoteActionResult | null,
  formData: FormData,
): Promise<QuickNoteActionResult> {
  const auth = await resolveViewerOrFailure();
  if ('failure' in auth) return auth.failure;
  if (!canAttemptArchiveQuickNote(auth.viewer.role)) {
    return { success: false, error: 'No tienes permiso para archivar esta nota.' };
  }

  const noteId = ((formData.get('noteId') as string | null) ?? '').trim();
  if (!noteId) return { success: false, error: 'Falta el identificador de la nota.' };

  try {
    const repo = getQuickNotesRepository();
    await repo.archiveQuickNote(auth.viewer, noteId);
    revalidatePath('/dashboard');
    return { success: true, noteId };
  } catch (e) {
    return toArchiveErrorResult(e);
  }
}
