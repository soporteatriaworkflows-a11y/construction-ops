/**
 * index.ts — Fábricas y exports de Quick Notes (V5.4.2b).
 *
 * Repositorio por `READ_MODEL_SOURCE` (mismo patrón que monitor/price intelligence).
 * `getDashboardQuickNotes` es el punto de entrada de LECTURA del app-layer: aplica el
 * guard de privacidad ANTES de instanciar/llamar al repositorio (para viewer del
 * bucket client-safe ni siquiera se consulta la DB).
 */
import { parseReadModelSource } from '@/lib/supabase/env';
import { DbQuickNotesRepository } from './db-repository';
import { FixtureQuickNotesRepository } from './fixture-repository';
import { canViewQuickNotes } from './guard';
import { QUICK_NOTES_DASHBOARD_LIMIT } from './types';
import type { AuthenticatedViewer, QuickNoteView, QuickNotesRepository } from './types';

export type {
  QuickNoteView,
  QuickNoteStatus,
  QuickNotesRepository,
  CreateQuickNoteInput,
  ListQuickNotesOptions,
} from './types';
export { QUICK_NOTES_DASHBOARD_LIMIT, QUICK_NOTE_BODY_MAX, QUICK_NOTE_BODY_MIN } from './types';
export { canViewQuickNotes, canCreateQuickNotes, canAttemptArchiveQuickNote } from './guard';
export { validateQuickNoteBody, parseQuickNoteBody } from './validation';
export {
  QuickNoteValidationError,
  QuickNoteInsufficientRoleError,
  QuickNoteNotFoundError,
  QuickNoteWriteNotSupportedError,
} from './errors';
export type { QuickNoteActionResult } from './action-result';
export { toCreateErrorResult, toArchiveErrorResult } from './action-result';

/** Repositorio de Quick Notes según READ_MODEL_SOURCE. */
export function getQuickNotesRepository(): QuickNotesRepository {
  const source = parseReadModelSource(process.env.READ_MODEL_SOURCE);
  if (source === 'db') return new DbQuickNotesRepository();
  return new FixtureQuickNotesRepository();
}

/**
 * Lectura para el dashboard con guard de privacidad de app (2ª defensa).
 * Si el viewer es del bucket client-safe ⇒ `[]` **sin** llamar al repositorio/DB.
 */
export async function getDashboardQuickNotes(
  viewer: AuthenticatedViewer,
  limit: number = QUICK_NOTES_DASHBOARD_LIMIT,
): Promise<QuickNoteView[]> {
  if (!canViewQuickNotes(viewer.role)) return [];
  const repo = getQuickNotesRepository();
  return repo.listQuickNotes(viewer, { limit });
}
