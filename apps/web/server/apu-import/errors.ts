/**
 * errors.ts — Errores tipados del importador APU (ENTRE_PATIOS_APU_IMPORT_V1).
 * Mensajes seguros para mostrar a la usuaria; sin detalles internos.
 */

/** Archivo inválido (extensión, tamaño, vacío). */
export class ApuImportFileError extends Error {
  readonly kind = 'apu_import_file' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ApuImportFileError';
  }
}

/** Workbook ilegible o estructura no reconocida. */
export class ApuImportParseError extends Error {
  readonly kind = 'apu_import_parse' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ApuImportParseError';
  }
}

/** El workbook no contiene la hoja APU (contrato §2). */
export class ApuSheetNotFoundError extends Error {
  readonly kind = 'apu_sheet_not_found' as const;
  constructor() {
    super('El workbook no contiene una hoja llamada "APU".');
    this.name = 'ApuSheetNotFoundError';
  }
}

/** El archivo cambió entre preview y confirmación (digest distinto). */
export class ApuImportDigestMismatchError extends Error {
  readonly kind = 'apu_import_digest_mismatch' as const;
  constructor() {
    super('El archivo cambió desde la vista previa. Vuelve a analizarlo antes de confirmar.');
    this.name = 'ApuImportDigestMismatchError';
  }
}

/** El preview tiene errores críticos o nada importable. */
export class ApuImportNotImportableError extends Error {
  readonly kind = 'apu_import_not_importable' as const;
  constructor(message?: string) {
    super(message ?? 'La importación tiene errores críticos. Revisa la vista previa.');
    this.name = 'ApuImportNotImportableError';
  }
}

/** Importación solo disponible en modo base de datos real. */
export class ApuImportNotSupportedError extends Error {
  readonly kind = 'apu_import_not_supported' as const;
  constructor() {
    super('La importación de APU requiere READ_MODEL_SOURCE=db con sesión real.');
    this.name = 'ApuImportNotSupportedError';
  }
}

/** Acepte de sugerencia inválido (no coincide con la sugerencia re-derivada). */
export class ApuSuggestionRejectedError extends Error {
  readonly kind = 'apu_suggestion_rejected' as const;
  constructor(componentKey: string) {
    super(
      `El acepte de sugerencia para "${componentKey}" no coincide con la sugerencia del servidor y fue rechazado.`,
    );
    this.name = 'ApuSuggestionRejectedError';
  }
}

/** Versión BOQ objetivo inexistente o no editable. */
export class ApuLinkVersionInvalidError extends Error {
  readonly kind = 'apu_link_version_invalid' as const;
  constructor(message?: string) {
    super(message ?? 'La versión de presupuesto seleccionada no existe o no es editable.');
    this.name = 'ApuLinkVersionInvalidError';
  }
}
