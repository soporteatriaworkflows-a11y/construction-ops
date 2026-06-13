/**
 * errors.ts — Errores de dominio de la reconciliación APU.
 */
export class ReconciliationInputError extends Error {
  constructor(message = 'Entrada de reconciliación inválida.') {
    super(message);
    this.name = 'ReconciliationInputError';
  }
}

export class ReconciliationBulkLimitError extends Error {
  constructor(message = 'La asociación masiva admite un máximo de 50 componentes por operación.') {
    super(message);
    this.name = 'ReconciliationBulkLimitError';
  }
}
