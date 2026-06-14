/**
 * errors.ts — Errores del Quantity Workspace (QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1).
 */

/** Validación de entrada del workspace (grupo/líneas). */
export class QuantityWorkspaceValidationError extends Error {
  readonly code = 'quantity_workspace_validation' as const;
  constructor(message: string) {
    super(message);
    this.name = 'QuantityWorkspaceValidationError';
  }
}

/** Mutación no disponible en modo demo/fixture. */
export class QuantityWorkspaceWriteNotSupportedError extends Error {
  readonly code = 'write_not_supported' as const;
  constructor() {
    super('write_not_supported: el workspace de cantidades requiere modo Supabase + base de datos');
    this.name = 'QuantityWorkspaceWriteNotSupportedError';
  }
}

/** Guard de sincronización a BOQ (versión emitida, ítem ausente, etc.). */
export class BoqSyncGuardError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'BoqSyncGuardError';
  }
}
