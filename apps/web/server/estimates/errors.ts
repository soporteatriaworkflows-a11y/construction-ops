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
