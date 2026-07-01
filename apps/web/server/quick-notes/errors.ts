/**
 * errors.ts — Errores de dominio de Quick Notes (V5.4.2b).
 *
 * Errores tipados, con `code` estable. NUNCA transportan mensajes técnicos de
 * Postgres al usuario final; las server actions los mapean a mensajes curados.
 */

export interface QuickNoteFieldIssue {
  field: string;
  message: string;
}

/** Body inválido (vacío/whitespace o > máx). */
export class QuickNoteValidationError extends Error {
  readonly code = 'quick_note_validation' as const;
  readonly issues: QuickNoteFieldIssue[];
  constructor(issues: QuickNoteFieldIssue[]) {
    super('quick_note_validation: ' + issues.map((i) => `${i.field}: ${i.message}`).join('; '));
    this.name = 'QuickNoteValidationError';
    this.issues = issues;
  }
}

/** El viewer no tiene permiso (guard de app o RLS lo negó). */
export class QuickNoteInsufficientRoleError extends Error {
  readonly code = 'quick_note_insufficient_role' as const;
  constructor(action: string, role: string) {
    super(`quick_note_insufficient_role: ${action} no permitido para rol ${role}`);
    this.name = 'QuickNoteInsufficientRoleError';
  }
}

/** Nota no encontrada, o no visible/mutable para el viewer (RLS negó). */
export class QuickNoteNotFoundError extends Error {
  readonly code = 'quick_note_not_found' as const;
  readonly noteId: string;
  constructor(noteId: string) {
    super(`quick_note_not_found: ${noteId}`);
    this.name = 'QuickNoteNotFoundError';
    this.noteId = noteId;
  }
}

/** Escritura no soportada en modo fixture (demo de solo lectura). */
export class QuickNoteWriteNotSupportedError extends Error {
  readonly code = 'quick_note_write_not_supported' as const;
  constructor() {
    super('quick_note_write_not_supported: escritura solo disponible con READ_MODEL_SOURCE=db');
    this.name = 'QuickNoteWriteNotSupportedError';
  }
}
