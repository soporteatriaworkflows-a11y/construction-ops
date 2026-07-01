/**
 * action-result.ts — Forma del resultado de las server actions de Quick Notes y
 * mapeo PURO de errores de dominio → mensajes CURADOS (V5.4.2b).
 *
 * Regla: el usuario final NUNCA ve mensajes técnicos de Postgres/RLS. Estos mappers
 * son puros y testeables; las server actions (`'use server'`) solo pueden exportar
 * funciones async, por eso el mapeo vive aquí.
 */
import {
  QuickNoteInsufficientRoleError,
  QuickNoteNotFoundError,
  QuickNoteValidationError,
  QuickNoteWriteNotSupportedError,
} from './errors';

export interface QuickNoteActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  noteId?: string;
}

const GENERIC_CREATE = 'No se pudo guardar la nota. Intenta de nuevo.';
const GENERIC_ARCHIVE = 'No se pudo archivar la nota. Intenta de nuevo.';
const NOT_AUTHORIZED_CREATE = 'No tienes permiso para crear notas.';
const NOT_AUTHORIZED_ARCHIVE = 'No tienes permiso para archivar esta nota.';
const DEMO_UNAVAILABLE = 'Las notas no están disponibles en modo demostración.';

/** Mapea un error de creación a un resultado controlado (sin tecnicismos). */
export function toCreateErrorResult(e: unknown): QuickNoteActionResult {
  if (e instanceof QuickNoteValidationError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of e.issues) fieldErrors[issue.field] = issue.message;
    return { success: false, fieldErrors };
  }
  if (e instanceof QuickNoteInsufficientRoleError) {
    return { success: false, error: NOT_AUTHORIZED_CREATE };
  }
  if (e instanceof QuickNoteWriteNotSupportedError) {
    return { success: false, error: DEMO_UNAVAILABLE };
  }
  return { success: false, error: GENERIC_CREATE };
}

/** Mapea un error de archivado a un resultado controlado (sin tecnicismos). */
export function toArchiveErrorResult(e: unknown): QuickNoteActionResult {
  if (e instanceof QuickNoteNotFoundError) {
    return { success: false, error: 'La nota no existe o no puedes archivarla.' };
  }
  if (e instanceof QuickNoteInsufficientRoleError) {
    return { success: false, error: NOT_AUTHORIZED_ARCHIVE };
  }
  if (e instanceof QuickNoteWriteNotSupportedError) {
    return { success: false, error: DEMO_UNAVAILABLE };
  }
  return { success: false, error: GENERIC_ARCHIVE };
}
