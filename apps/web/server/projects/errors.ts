/**
 * errors.ts — Errores de dominio de la capa de escritura de proyectos (4B.1).
 *
 * Propiedad: agent-db-rls. Contrato: `docs/PROJECTS_CRUD_CONTRACT.md §6,§8`.
 *
 * Reutiliza `ProjectNotFoundError` del read-model (misma semántica: inexistente
 * o no visible para la organización del viewer). Añade errores específicos de
 * escritura. NINGUNO expone SQL/stack; la capa superior los sanitiza.
 */

// Reexport para que los consumidores tengan una sola superficie de errores.
export { ProjectNotFoundError } from '@/server/read-model/errors';

/** Campo y motivo de una violación de validación de `CreateProjectInput`. */
export interface ProjectValidationIssue {
  field: 'name' | 'city' | 'description' | 'initialStatus';
  message: string;
}

/** Entrada de creación inválida (campos obligatorios, longitudes, estado). */
export class ProjectValidationError extends Error {
  readonly code = 'project_validation' as const;
  readonly issues: ProjectValidationIssue[];

  constructor(issues: ProjectValidationIssue[], message?: string) {
    super(message ?? `project_validation: ${issues.map((i) => i.field).join(', ')}`);
    this.name = 'ProjectValidationError';
    this.issues = issues;
  }
}

/**
 * La creación se intentó en un modo donde la escritura no aplica
 * (`READ_MODEL_SOURCE=fixture`). El fixture es de solo lectura (golden master).
 */
export class ProjectWriteNotSupportedError extends Error {
  readonly code = 'project_write_not_supported' as const;

  constructor(message?: string) {
    super(
      message ??
        'project_write_not_supported: la creación de proyectos requiere ' +
          'READ_MODEL_SOURCE=db (el modo fixture es de solo lectura).',
    );
    this.name = 'ProjectWriteNotSupportedError';
  }
}

/**
 * No se pudo generar un `code` libre tras agotar los reintentos anti-colisión.
 * Situación excepcional (muchas colisiones del mismo slug en la misma org).
 */
export class ProjectCodeGenerationError extends Error {
  readonly code = 'project_code_generation' as const;

  constructor(message?: string) {
    super(
      message ??
        'project_code_generation: no se pudo generar un código único para el ' +
          'proyecto tras varios intentos.',
    );
    this.name = 'ProjectCodeGenerationError';
  }
}
