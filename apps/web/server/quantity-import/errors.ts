/**
 * errors.ts — Errores tipados del importador de memorias de cantidades
 * (QUANTITY_TAKEOFF_IMPORT_V1, contrato §10). Mensajes seguros para UI.
 */

export class QuantityImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuantityImportFileError';
  }
}

export class QuantityImportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuantityImportParseError';
  }
}

export class QuantitySheetNotFoundError extends Error {
  constructor() {
    super('El workbook no contiene la hoja "CANTIDADES 1 PISO".');
    this.name = 'QuantitySheetNotFoundError';
  }
}

export class QuantityImportDigestMismatchError extends Error {
  constructor() {
    super(
      'El archivo cambió desde la vista previa. Vuelve a analizar el workbook antes de confirmar.',
    );
    this.name = 'QuantityImportDigestMismatchError';
  }
}

export class QuantityImportNotImportableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuantityImportNotImportableError';
  }
}

export class QuantityImportNotSupportedError extends Error {
  constructor() {
    super('La importación de cantidades requiere modo base de datos (READ_MODEL_SOURCE=db).');
    this.name = 'QuantityImportNotSupportedError';
  }
}

export class QuantityLinkVersionInvalidError extends Error {
  constructor(
    message = 'La versión de presupuesto seleccionada no existe o no es editable.',
  ) {
    super(message);
    this.name = 'QuantityLinkVersionInvalidError';
  }
}
