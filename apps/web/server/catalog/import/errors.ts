/**
 * errors.ts — Errores sanitizados de la importación masiva de catálogo
 * (CATALOG_BULK_ONBOARDING_V1). Sin stack/SQL/datos privados en mensajes.
 */

export class CatalogImportFileError extends Error {
  readonly code = 'catalog_import_file' as const;
  constructor(message: string) {
    super(message);
    this.name = 'CatalogImportFileError';
  }
}

export class CatalogImportParseError extends Error {
  readonly code = 'catalog_import_parse' as const;
  constructor(message: string) {
    super(message);
    this.name = 'CatalogImportParseError';
  }
}

export class CatalogImportDigestMismatchError extends Error {
  readonly code = 'catalog_import_digest' as const;
  constructor() {
    super('El archivo cambió desde la previsualización. Vuelve a previsualizar antes de confirmar.');
    this.name = 'CatalogImportDigestMismatchError';
  }
}

export class CatalogImportNotImportableError extends Error {
  readonly code = 'catalog_import_blocked' as const;
  constructor() {
    super('La importación tiene errores bloqueantes o no contiene filas importables.');
    this.name = 'CatalogImportNotImportableError';
  }
}

export class CatalogImportNotSupportedError extends Error {
  readonly code = 'catalog_import_not_supported' as const;
  constructor() {
    super('La importación requiere modo base de datos (no disponible en demostración).');
    this.name = 'CatalogImportNotSupportedError';
  }
}

export class CatalogImportProviderNotFoundError extends Error {
  readonly code = 'catalog_import_provider' as const;
  constructor() {
    super('El proveedor seleccionado no existe o no es visible para tu organización.');
    this.name = 'CatalogImportProviderNotFoundError';
  }
}
