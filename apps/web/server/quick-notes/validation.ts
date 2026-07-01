/**
 * validation.ts — Validación PURA del body de una nota (V5.4.2b).
 *
 * Espejo de los CHECK de la tabla: `char_length(btrim(body)) BETWEEN 1 AND 1000`.
 * El body se guarda ya "trimeado". La DB (CHECK + RLS) es la barrera real; esto
 * da errores controlados antes de tocar la red.
 */
import { QUICK_NOTE_BODY_MAX, QUICK_NOTE_BODY_MIN } from './types';
import { QuickNoteValidationError, type QuickNoteFieldIssue } from './errors';

export interface ValidatedBody {
  /** Body ya normalizado (trim) listo para persistir. */
  value: string;
}

/** Devuelve issues (vacío = OK). No lanza. */
export function validateQuickNoteBody(raw: string | null | undefined): QuickNoteFieldIssue[] {
  const issues: QuickNoteFieldIssue[] = [];
  const trimmed = (raw ?? '').trim();
  if (trimmed.length < QUICK_NOTE_BODY_MIN) {
    issues.push({ field: 'body', message: 'La nota no puede estar vacía.' });
  } else if (trimmed.length > QUICK_NOTE_BODY_MAX) {
    issues.push({ field: 'body', message: `La nota no puede superar ${QUICK_NOTE_BODY_MAX} caracteres.` });
  }
  return issues;
}

/** Valida y devuelve el body normalizado, o lanza `QuickNoteValidationError`. */
export function parseQuickNoteBody(raw: string | null | undefined): ValidatedBody {
  const issues = validateQuickNoteBody(raw);
  if (issues.length > 0) throw new QuickNoteValidationError(issues);
  return { value: (raw ?? '').trim() };
}
