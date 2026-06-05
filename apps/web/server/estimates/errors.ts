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
