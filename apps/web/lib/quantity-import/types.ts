/**
 * types.ts — DTOs compartidos del importador estructurado de memorias de
 * cantidades (QUANTITY_TAKEOFF_IMPORT_V1).
 *
 * Contrato: docs/QUANTITY_TAKEOFF_IMPORT_V1_CONTRACT.md.
 * Solo tipos serializables UI ↔ server actions. Sin lógica financiera.
 */

import type { DecimalString, Uuid } from '@/lib/utils/types';

/** Límites congelados del archivo (contrato §1; paridad importador APU). */
export const QUANTITY_IMPORT_LIMITS = {
  maxFileBytes: 10 * 1024 * 1024,
} as const;

/** Extensiones admitidas (contrato §1). */
export const QUANTITY_IMPORT_EXTENSIONS = ['.xlsx', '.xls'] as const;

/** Hoja admitida (contrato §1) — comparación normalizada. */
export const QUANTITY_IMPORT_SHEET = 'CANTIDADES 1 PISO';

/** Tipos de fórmula geométrica reconocidos (contrato §3; CHECK en DB). */
export const FORMULA_TYPES = [
  'direct',
  'count_only',
  'length_only',
  'width_only',
  'height_only',
  'length_count',
  'width_count',
  'height_count',
  'length_width',
  'length_height',
  'width_height',
  'length_width_count',
  'length_height_count',
  'width_height_count',
  'length_width_height',
  'length_width_height_count',
  'dims_sum_count',
  'custom',
] as const;

export type TakeoffFormulaType = (typeof FORMULA_TYPES)[number];

/** Estado de vinculación BOQ por grupo (contrato §6). */
export type TakeoffLinkStatus =
  | 'linked'
  | 'suggested'
  | 'unresolved'
  | 'ambiguous'
  | 'skipped_existing'
  | 'not_evaluated';

/** Códigos de advertencia congelados (contrato §10). */
export type TakeoffWarningCode =
  | 'unit_unknown'
  | 'custom_formula'
  | 'derived_dimension'
  | 'excel_mismatch'
  | 'group_total_mismatch'
  | 'missing_group_total'
  | 'line_unparseable'
  | 'skipped_no_lines'
  | 'zero_quantity'
  | 'duplicate_code';

export interface TakeoffWarning {
  code: TakeoffWarningCode;
  message: string;
  sourceRow?: number;
}

/** Línea de medición parseada (vista de preview). */
export interface TakeoffLinePreview {
  /** Clave estable dentro del preview: `${groupKey}:${sourceRow}`. */
  key: string;
  sourceRow: number;
  /** Etiqueta de elemento (columna D cuando no es unidad). */
  description: string | null;
  formulaType: TakeoffFormulaType;
  /** Texto de la fórmula de I (metadato; jamás se evalúa). */
  formulaText: string | null;
  length: DecimalString | null;
  width: DecimalString | null;
  height: DecimalString | null;
  count: DecimalString | null;
  /** Subtotal cacheado del Excel (evidencia, jamás fuente). */
  excelSubtotal: DecimalString | null;
  /** Subtotal recalculado server-side con Decimal (fuente de verdad). */
  subtotalCalculated: DecimalString;
  /** Línea de deducción («(-) MENOS» o restada en el total del grupo). */
  deduction: boolean;
  /** Valores/fórmulas originales D..I (provenance §11; se persisten). */
  rawValues: Record<string, unknown>;
  warnings: TakeoffWarning[];
}

/** Grupo de cantidades parseado (vista de preview). */
export interface TakeoffGroupPreview {
  /** Clave estable: `${itemCode|desc normalizada}#${occurrenceIndex}`. */
  key: string;
  sourceRow: number;
  occurrenceIndex: number;
  /** Código visible (columna A: P-01, MT-01, Subcontrato…). */
  visibleCode: string | null;
  /** Código de ítem (columna B: 1.01, 2.10…). */
  itemCode: string | null;
  description: string;
  /** Unidad canónica (null si D no era unidad reconocible). */
  unit: string | null;
  /** Unidad raw tal como aparece en la hoja. */
  rawUnit: string | null;
  /** Capítulo (número y nombre) al que pertenece en la hoja. */
  chapterLabel: string | null;
  lines: TakeoffLinePreview[];
  /** Total cacheado del Excel (evidencia). */
  excelTotal: DecimalString | null;
  /** Texto de la fórmula del total (metadato). */
  totalFormulaText: string | null;
  /** Total recalculado server-side (Σ líneas − deducciones). */
  totalCalculated: DecimalString;
  /** Vínculo BOQ propuesto (server-side, solo exactos). */
  linkStatus: TakeoffLinkStatus;
  boqItemId: Uuid | null;
  boqItemCode: string | null;
  boqItemDescription: string | null;
  warnings: TakeoffWarning[];
}

/** Grupo detectado pero NO importable (sin líneas de medición). */
export interface TakeoffSkippedGroup {
  sourceRow: number;
  visibleCode: string | null;
  itemCode: string | null;
  description: string;
  rawUnit: string | null;
  reason: 'skipped_no_lines';
}

/** Versión de presupuesto candidata para vinculación (selector). */
export interface TakeoffLinkableVersion {
  versionId: Uuid;
  label: string;
  status: string;
  itemCount: number;
}

/** Vista previa completa (paso A — sin escritura). */
export interface QuantityImportPreview {
  fileName: string;
  sheetName: string;
  /** SHA-256 hex del contenido de la hoja (integridad preview↔confirmación). */
  digest: string;
  linkVersionId: Uuid | null;
  groups: TakeoffGroupPreview[];
  skippedGroups: TakeoffSkippedGroup[];
  totals: {
    groups: number;
    lines: number;
    linked: number;
    suggested: number;
    unresolved: number;
    ambiguous: number;
    skippedExisting: number;
    notEvaluated: number;
    deductions: number;
    excelMismatches: number;
    warnings: number;
    skippedNoLines: number;
  };
  blockingErrors: string[];
  importable: boolean;
}

/** Fila del reporte final (CSV sanitizado). */
export interface QuantityImportReportRow {
  groupKey: string;
  visibleCode: string | null;
  itemCode: string | null;
  description: string;
  unit: string | null;
  lines: number;
  totalCalculated: DecimalString;
  excelTotal: DecimalString | null;
  importStatus: 'created' | 'omitted';
  linkStatus: TakeoffLinkStatus;
  boqItemCode: string | null;
  messages: string[];
}

/** Resultado de la confirmación (paso B). */
export interface QuantityImportResult {
  duplicate: boolean;
  batchId: Uuid;
  groupsCreated: number;
  linesCreated: number;
  linkedBoqItems: number;
  unresolvedGroups: number;
  rows: QuantityImportReportRow[];
  reportCsv: string;
}
