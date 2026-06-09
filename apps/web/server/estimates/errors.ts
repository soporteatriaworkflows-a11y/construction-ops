/**
 * errors.ts — Errores de dominio de la capa de escritura de presupuestos (4B.3).
 *
 * Propiedad: agent-db-rls. Contrato: `docs/ESTIMATES_CRUD_CONTRACT.md §6,§8`.
 *
 * Reutiliza `ScopeNotFoundError` (alcance inexistente o cross-org). NINGUNO
 * expone SQL/stack.
 */

// Alcance padre inexistente o no visible para la organización del viewer.
export { ScopeNotFoundError } from '@/server/scopes/errors';

/** Campo y motivo de una violación de validación de `CreateEstimateInput`. */
export interface EstimateValidationIssue {
  field: 'name' | 'description';
  message: string;
}

/** Entrada de creación inválida (obligatorios, longitudes). */
export class EstimateValidationError extends Error {
  readonly code = 'estimate_validation' as const;
  readonly issues: EstimateValidationIssue[];

  constructor(issues: EstimateValidationIssue[], message?: string) {
    super(message ?? `estimate_validation: ${issues.map((i) => i.field).join(', ')}`);
    this.name = 'EstimateValidationError';
    this.issues = issues;
  }
}

/** Campo y motivo de una violación de validación de porcentajes AIU. */
export interface AiuValidationIssue {
  field: 'administrationRate' | 'contingencyRate' | 'utilityRate' | 'utilityVatRate';
  message: string;
}

/** Porcentajes AIU inválidos (rango/negativo/no numérico). */
export class AiuValidationError extends Error {
  readonly code = 'aiu_validation' as const;
  readonly issues: AiuValidationIssue[];
  constructor(issues: AiuValidationIssue[], message?: string) {
    super(message ?? `aiu_validation: ${issues.map((i) => i.field).join(', ')}`);
    this.name = 'AiuValidationError';
    this.issues = issues;
  }
}

/** La edición de AIU no aplica en el modo actual (fixture, solo lectura). */
export class AiuWriteNotSupportedError extends Error {
  readonly code = 'aiu_write_not_supported' as const;
  constructor(message?: string) {
    super(
      message ??
        'aiu_write_not_supported: la edición de AIU requiere READ_MODEL_SOURCE=db (el modo demostración es de solo lectura).',
    );
    this.name = 'AiuWriteNotSupportedError';
  }
}

/** La versión del presupuesto no admite edición de AIU (emitida/bloqueada). */
export class AiuVersionLockedError extends Error {
  readonly code = 'aiu_version_locked' as const;
  constructor(message?: string) {
    super(message ?? 'La versión del presupuesto no admite cambios de AIU.');
    this.name = 'AiuVersionLockedError';
  }
}

/** Capítulo inexistente o no visible para la organización del viewer. */
export class ChapterNotFoundError extends Error {
  readonly code = 'chapter_not_found' as const;

  constructor(chapterId: string, message?: string) {
    super(message ?? `chapter_not_found: ${chapterId}`);
    this.name = 'ChapterNotFoundError';
  }
}

/** Presupuesto inexistente o no visible para la organización del viewer. */
export class EstimateNotFoundError extends Error {
  readonly code = 'estimate_not_found' as const;

  constructor(estimateId: string, message?: string) {
    super(message ?? `estimate_not_found: ${estimateId}`);
    this.name = 'EstimateNotFoundError';
  }
}

/**
 * La creación se intentó en un modo donde la escritura no aplica
 * (`READ_MODEL_SOURCE=fixture`). El fixture es de solo lectura (golden master).
 */
export class EstimateWriteNotSupportedError extends Error {
  readonly code = 'estimate_write_not_supported' as const;

  constructor(message?: string) {
    super(
      message ??
        'estimate_write_not_supported: la creación de presupuestos requiere ' +
          'READ_MODEL_SOURCE=db (el modo fixture es de solo lectura).',
    );
    this.name = 'EstimateWriteNotSupportedError';
  }
}

/* --------------------------------------------------------------------------
 * Edición manual de BOQ (Oleada 4E.2A) — `docs/BOQ_MANUAL_EDITING_CONTRACT.md`.
 * ----------------------------------------------------------------------- */

/** Campo y motivo de una violación de validación de capítulo/ítem BOQ. */
export interface BoqValidationIssue {
  field: 'code' | 'name' | 'description' | 'unit' | 'quantity' | 'unitPrice' | 'targetChapterId';
  message: string;
}

/** Entrada inválida de capítulo o ítem (obligatorios, longitudes, numérico). */
export class BoqValidationError extends Error {
  readonly code = 'boq_validation' as const;
  readonly issues: BoqValidationIssue[];
  constructor(issues: BoqValidationIssue[], message?: string) {
    super(message ?? `boq_validation: ${issues.map((i) => i.field).join(', ')}`);
    this.name = 'BoqValidationError';
    this.issues = issues;
  }
}

/** La edición manual de BOQ no aplica en el modo actual (fixture, solo lectura). */
export class BoqWriteNotSupportedError extends Error {
  readonly code = 'boq_write_not_supported' as const;
  constructor(message?: string) {
    super(
      message ??
        'boq_write_not_supported: la edición manual del presupuesto requiere ' +
          'READ_MODEL_SOURCE=db (el modo demostración es de solo lectura).',
    );
    this.name = 'BoqWriteNotSupportedError';
  }
}

/** La versión del presupuesto no admite edición (emitida/bloqueada). */
export class BoqVersionLockedError extends Error {
  readonly code = 'boq_version_locked' as const;
  constructor(message?: string) {
    super(message ?? 'La versión del presupuesto no admite cambios (versión emitida).');
    this.name = 'BoqVersionLockedError';
  }
}

/** Código de capítulo duplicado dentro de la versión (unique violation). */
export class ChapterCodeDuplicateError extends Error {
  readonly code = 'chapter_code_duplicate' as const;
  constructor(message?: string) {
    super(message ?? 'Ya existe un capítulo con ese código en esta versión.');
    this.name = 'ChapterCodeDuplicateError';
  }
}

/** Ítem BOQ inexistente o no visible para la organización del viewer. */
export class BoqItemNotFoundError extends Error {
  readonly code = 'boq_item_not_found' as const;
  constructor(itemId: string, message?: string) {
    super(message ?? `boq_item_not_found: ${itemId}`);
    this.name = 'BoqItemNotFoundError';
  }
}

/** Una versión indicada para comparar no pertenece al estimate dado (4E.3B). */
export class VersionMismatchError extends Error {
  readonly code = 'version_mismatch' as const;
  constructor(message?: string) {
    super(message ?? 'Las versiones a comparar deben pertenecer al mismo presupuesto.');
    this.name = 'VersionMismatchError';
  }
}

/** Se intentó emitir una versión que no está en `draft` (4E.3A). */
export class VersionNotDraftError extends Error {
  readonly code = 'version_not_draft' as const;
  constructor(message?: string) {
    super(message ?? 'Solo una versión en borrador puede emitirse.');
    this.name = 'VersionNotDraftError';
  }
}

/** Se intentó clonar una versión que no está `issued` (4E.3A). */
export class VersionNotIssuedError extends Error {
  readonly code = 'version_not_issued' as const;
  constructor(message?: string) {
    super(message ?? 'Solo una versión emitida puede clonarse a una nueva versión.');
    this.name = 'VersionNotIssuedError';
  }
}

/** Se intentó archivar un nodo BOQ que ya está archivado (rechazo seguro). */
export class BoqAlreadyArchivedError extends Error {
  readonly code = 'boq_already_archived' as const;
  constructor(message?: string) {
    super(message ?? 'El elemento ya está archivado.');
    this.name = 'BoqAlreadyArchivedError';
  }
}

/** Se intentó restaurar un nodo BOQ que no está archivado (rechazo seguro). */
export class BoqNotArchivedError extends Error {
  readonly code = 'boq_not_archived' as const;
  constructor(message?: string) {
    super(message ?? 'El elemento no está archivado.');
    this.name = 'BoqNotArchivedError';
  }
}

/** Capítulo destino (para mover) inexistente o de otra versión/organización. */
export class TargetChapterNotFoundError extends Error {
  readonly code = 'target_chapter_not_found' as const;
  constructor(message?: string) {
    super(message ?? 'El capítulo de destino no existe o no pertenece a este presupuesto.');
    this.name = 'TargetChapterNotFoundError';
  }
}

/** No se pudo generar un `code` libre tras agotar los reintentos anti-colisión. */
export class EstimateCodeGenerationError extends Error {
  readonly code = 'estimate_code_generation' as const;

  constructor(message?: string) {
    super(
      message ??
        'estimate_code_generation: no se pudo generar un código único para el ' +
          'presupuesto tras varios intentos.',
    );
    this.name = 'EstimateCodeGenerationError';
  }
}
