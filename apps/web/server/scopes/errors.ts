/**
 * errors.ts — Errores de dominio de la capa de escritura de alcances (4B.2).
 *
 * Propiedad: agent-db-rls. Contrato: `docs/SCOPES_CRUD_CONTRACT.md §6,§8`.
 *
 * Reutiliza `ProjectNotFoundError` (proyecto inexistente o cross-org al crear/
 * listar). Añade errores específicos de alcances. NINGUNO expone SQL/stack.
 */

// Proyecto padre inexistente o no visible para la organización del viewer.
export { ProjectNotFoundError } from '@/server/read-model/errors';

/** Campo y motivo de una violación de validación de `CreateScopeInput`. */
export interface ScopeValidationIssue {
  field: 'name' | 'scopeType' | 'description';
  message: string;
}

/** Entrada de creación inválida (obligatorios, longitudes, tipo de alcance). */
export class ScopeValidationError extends Error {
  readonly code = 'scope_validation' as const;
  readonly issues: ScopeValidationIssue[];

  constructor(issues: ScopeValidationIssue[], message?: string) {
    super(message ?? `scope_validation: ${issues.map((i) => i.field).join(', ')}`);
    this.name = 'ScopeValidationError';
    this.issues = issues;
  }
}

/** Alcance inexistente o no visible para la organización del viewer. */
export class ScopeNotFoundError extends Error {
  readonly code = 'scope_not_found' as const;

  constructor(scopeId: string, message?: string) {
    super(message ?? `scope_not_found: ${scopeId}`);
    this.name = 'ScopeNotFoundError';
  }
}

/**
 * La creación se intentó en un modo donde la escritura no aplica
 * (`READ_MODEL_SOURCE=fixture`). El fixture es de solo lectura (golden master).
 */
export class ScopeWriteNotSupportedError extends Error {
  readonly code = 'scope_write_not_supported' as const;

  constructor(message?: string) {
    super(
      message ??
        'scope_write_not_supported: la creación de alcances requiere ' +
          'READ_MODEL_SOURCE=db (el modo fixture es de solo lectura).',
    );
    this.name = 'ScopeWriteNotSupportedError';
  }
}

/** No se pudo generar un `code` libre tras agotar los reintentos anti-colisión. */
export class ScopeCodeGenerationError extends Error {
  readonly code = 'scope_code_generation' as const;

  constructor(message?: string) {
    super(
      message ??
        'scope_code_generation: no se pudo generar un código único para el ' +
          'alcance tras varios intentos.',
    );
    this.name = 'ScopeCodeGenerationError';
  }
}
