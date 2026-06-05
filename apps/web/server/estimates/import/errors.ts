/**
 * errors.ts — Errores de dominio de la importación de Excel (4C.1).
 * Propiedad: agent-excel-mapper / agent-db-rls. Sin SQL/stack ni datos privados.
 */
export { ExcelParseError } from './parse';
export { EstimateNotFoundError } from '../errors';

/** Archivo inválido (extensión, tamaño, vacío). */
export class ImportFileError extends Error {
  readonly code = 'import_file' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ImportFileError';
  }
}

/** La versión activa ya tiene contenido (anti reimportación destructiva). */
export class ImportVersionNotEmptyError extends Error {
  readonly code = 'import_version_not_empty' as const;
  constructor(message?: string) {
    super(
      message ??
        'Esta versión ya contiene información. La reimportación estará disponible en una fase posterior.',
    );
    this.name = 'ImportVersionNotEmptyError';
  }
}

/** La versión no es editable (emitida/aprobada/archivada). */
export class ImportVersionLockedError extends Error {
  readonly code = 'import_version_locked' as const;
  constructor(message?: string) {
    super(message ?? 'La versión del presupuesto no admite cambios.');
    this.name = 'ImportVersionLockedError';
  }
}

/** El archivo cambió entre el preview y la confirmación (digest distinto). */
export class ImportDigestMismatchError extends Error {
  readonly code = 'import_digest_mismatch' as const;
  constructor(message?: string) {
    super(
      message ??
        'El archivo cambió respecto a la vista previa. Vuelve a analizarlo antes de confirmar.',
    );
    this.name = 'ImportDigestMismatchError';
  }
}

/** El preview contiene errores bloqueantes; no se puede confirmar. */
export class ImportHasErrorsError extends Error {
  readonly code = 'import_has_errors' as const;
  constructor(message?: string) {
    super(
      message ??
        'El archivo contiene errores que deben corregirse antes de importar. Revisa el detalle de la vista previa.',
    );
    this.name = 'ImportHasErrorsError';
  }
}

/** La importación no aplica en el modo actual (fixture). */
export class ImportNotSupportedError extends Error {
  readonly code = 'import_not_supported' as const;
  constructor(message?: string) {
    super(
      message ??
        'La importación requiere READ_MODEL_SOURCE=db (el modo demostración es de solo lectura).',
    );
    this.name = 'ImportNotSupportedError';
  }
}
