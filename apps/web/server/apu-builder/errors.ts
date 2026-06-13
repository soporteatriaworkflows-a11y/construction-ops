/**
 * errors.ts — Errores del constructor manual de APU y del BOQ-add.
 * Contrato: docs/APU_MANUAL_BUILDER_AND_BOQ_ADD_V1_CONTRACT.md.
 */

/** Validación de entrada del builder (encabezado/componentes). */
export class ApuBuilderValidationError extends Error {
  readonly code = 'apu_builder_validation' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ApuBuilderValidationError';
  }
}

/** Material sin precio aprobado vigente (no se inventa precio). */
export class ResourceWithoutApprovedPriceError extends Error {
  readonly code = 'resource_no_approved_price' as const;
  constructor(resourceId: string) {
    super(`resource_no_approved_price: el recurso ${resourceId} no tiene precio aprobado vigente`);
    this.name = 'ResourceWithoutApprovedPriceError';
  }
}

/** Mutación no disponible en modo demo/fixture. */
export class ApuBuilderWriteNotSupportedError extends Error {
  readonly code = 'write_not_supported' as const;
  constructor() {
    super('write_not_supported: la creación de APU requiere modo Supabase + base de datos');
    this.name = 'ApuBuilderWriteNotSupportedError';
  }
}

/** Versión de presupuesto no editable (emitida) o ítem ambiguo en BOQ-add. */
export class BoqAddGuardError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'BoqAddGuardError';
  }
}

/** APU no puede ser archivado (tipo incorrecto, ya archivado, o tiene BOQ vinculado). */
export class ApuArchiveError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ApuArchiveError';
  }
}
