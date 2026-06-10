/**
 * errors.ts — Errores de dominio del modulo de catalogo de recursos (Bootstrap CTAs).
 * Propiedad: agent-frontend-boq.
 */

export class ResourceValidationError extends Error {
  readonly code = 'resource_validation' as const;
  readonly issues: Array<{ field: string; message: string }>;

  constructor(issues: Array<{ field: string; message: string }>) {
    super(
      'resource_validation: ' +
        issues.map((i) => `${i.field}: ${i.message}`).join('; '),
    );
    this.name = 'ResourceValidationError';
    this.issues = issues;
  }
}

export class ResourceWriteNotSupportedError extends Error {
  readonly code = 'write_not_supported' as const;

  constructor() {
    super(
      'write_not_supported: resource creation only available with READ_MODEL_SOURCE=db',
    );
    this.name = 'ResourceWriteNotSupportedError';
  }
}
