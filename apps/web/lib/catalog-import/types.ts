/**
 * types.ts — Tipos CLIENT-SAFE de la importación masiva de catálogo
 * (CATALOG_BULK_ONBOARDING_V1). Propiedad: agent-frontend-boq / agent-pricing.
 *
 * Viven bajo `lib/` (sin dependencias de servidor) para que los componentes
 * del wizard los consuman sin arrastrar `xlsx`/`postgres` al bundle del
 * navegador. Dinero/porcentajes viajan como string decimal, NUNCA `number`.
 */

/** Límites V1 (contrato §2). Server-side; el navegador nunca decide. */
export const CATALOG_IMPORT_LIMITS = {
  /** Tamaño máximo del archivo (bytes). 10 MB; bodySizeLimit transporte = 12 MB. */
  maxFileBytes: 10 * 1024 * 1024,
  /** Máximo de filas de datos por archivo (después del encabezado). */
  maxRows: 5000,
  maxCodeLen: 40,
  maxNameLen: 160,
  maxUnitLen: 20,
  maxTextLen: 500,
  /** Muestra de filas enviada al preview de la UI. */
  previewSampleRows: 100,
} as const;

/** Extensiones aceptadas (contrato §2). */
export const CATALOG_IMPORT_EXTENSIONS = ['.xlsx', '.xls', '.csv'] as const;

/** Campos del sistema mapeables — importación de recursos (contrato §3). */
export const CATALOG_IMPORT_FIELDS = [
  'code',
  'name',
  'resourceType',
  'unit',
  'description',
  'category',
  'brand',
  'externalReference',
  'externalSku',
  'defaultWastePct',
  'providerName',
  'sourceUrl',
  'observedPrice',
  'discountPercent',
  'currency',
  'validUntil',
  'notes',
] as const;
export type CatalogImportField = (typeof CATALOG_IMPORT_FIELDS)[number];

/** Campos obligatorios para importar recursos. */
export const CATALOG_REQUIRED_FIELDS = ['code', 'name', 'resourceType', 'unit'] as const;

/** Campos del sistema mapeables — lista de precios de proveedor (contrato §6). */
export const PRICE_LIST_FIELDS = [
  'externalReference',
  'externalSku',
  'code',
  'description',
  'unit',
  'observedPrice',
  'discountPercent',
  'currency',
  'sourceUrl',
  'observedAt',
  'validUntil',
  'notes',
] as const;
export type PriceListField = (typeof PRICE_LIST_FIELDS)[number];

/** Etiquetas legibles para la UI del mapeo. */
export const FIELD_LABELS: Record<string, string> = {
  code: 'Código',
  name: 'Nombre',
  resourceType: 'Tipo de recurso',
  unit: 'Unidad',
  description: 'Descripción',
  category: 'Categoría',
  brand: 'Marca',
  externalReference: 'Referencia externa',
  externalSku: 'SKU externo',
  defaultWastePct: 'Desperdicio %',
  providerName: 'Proveedor',
  sourceUrl: 'URL de origen',
  observedPrice: 'Precio observado',
  discountPercent: 'Descuento %',
  currency: 'Moneda',
  observedAt: 'Fecha de observación',
  validUntil: 'Válido hasta',
  notes: 'Notas',
};

/**
 * Asignación de UNA columna del archivo a UN campo del sistema.
 * `columnIndex` es 0-based sobre la fila de encabezados detectada.
 */
export interface ColumnAssignment {
  field: string;
  columnIndex: number | null;
}

/** Estado por fila tras validación/deduplicación (recursos). */
export type CatalogRowStatus = 'new' | 'skip_existing' | 'duplicate_in_file' | 'invalid';

/** Estado del precio asociado a la fila. */
export type RowPriceStatus = 'none' | 'pending_observation' | 'price_invalid';

/** Reporte client-safe de una fila del archivo (sin volcar la fila completa). */
export interface CatalogImportRowReport {
  /** Fila REAL del archivo (1-based, incluye encabezado). */
  row: number;
  code: string | null;
  name: string | null;
  status: CatalogRowStatus;
  priceStatus: RowPriceStatus;
  messages: string[];
}

/** Resultado del Paso A (preview de recursos). Sin escritura. */
export interface CatalogImportPreview {
  fileName: string;
  sheet: string;
  headers: string[];
  /** Mapeo propuesto/aplicado (columna → campo). */
  mapping: ColumnAssignment[];
  totalRows: number;
  newCount: number;
  existingCount: number;
  duplicateCount: number;
  invalidCount: number;
  /** Filas vacías omitidas. */
  omittedCount: number;
  pendingObservationCount: number;
  priceInvalidCount: number;
  /** Muestra de filas (limitada para la UI). */
  rows: CatalogImportRowReport[];
  rowsTruncated: boolean;
  /** Errores BLOQUEANTES globales (mapeo incompleto, archivo sin datos…). */
  errors: string[];
  warnings: string[];
  /** `true` si hay ≥1 recurso nuevo creíble y ningún error global. */
  importable: boolean;
  /** SHA-256 (hex) del contenido parseado — integridad preview↔confirmación. */
  digest: string;
}

/** Resultado del Paso B (confirmación batch). Conteos server-side. */
export interface CatalogImportResult {
  createdCount: number;
  skippedExistingCount: number;
  duplicateCount: number;
  invalidCount: number;
  observationsCreated: number;
  observationsRejected: number;
  rows: CatalogImportRowReport[];
  /** CSV sanitizado (formula-injection-safe) para descarga. */
  reportCsv: string;
}

// ---------------------------------------------------------------------------
// Lista de precios de proveedor
// ---------------------------------------------------------------------------

export type PriceListMatchType = 'sku' | 'reference' | 'code' | 'none' | 'ambiguous';
export type PriceListRowStatus = 'matched' | 'unmatched' | 'invalid';

export interface PriceListRowReport {
  row: number;
  /** Identificador presente en el archivo (SKU/ref/código), client-safe. */
  identifier: string | null;
  matchType: PriceListMatchType;
  resourceCode: string | null;
  resourceName: string | null;
  status: PriceListRowStatus;
  messages: string[];
}

export interface PriceListPreview {
  fileName: string;
  sheet: string;
  providerId: string;
  providerName: string;
  headers: string[];
  mapping: ColumnAssignment[];
  totalRows: number;
  matchedCount: number;
  unmatchedCount: number;
  invalidCount: number;
  omittedCount: number;
  rows: PriceListRowReport[];
  rowsTruncated: boolean;
  errors: string[];
  warnings: string[];
  importable: boolean;
  digest: string;
}

export interface PriceListResult {
  observationsCreated: number;
  unmatchedCount: number;
  invalidCount: number;
  rows: PriceListRowReport[];
  /** CSV sanitizado con las filas sin asociar (para revisión humana). */
  reportCsv: string;
}
