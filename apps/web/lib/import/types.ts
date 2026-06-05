/**
 * types.ts — Tipos CLIENT-SAFE del preview de importación de Excel (4C.1).
 *
 * Viven bajo `lib/` (sin dependencias de servidor) para que el componente de
 * preview los consuma sin arrastrar `xlsx`/`postgres` al bundle del navegador.
 * Dinero/cantidades viajan como `DecimalString` (string), NUNCA `number`.
 */
import type { DecimalString } from '@/lib/utils/types';

export type { DecimalString } from '@/lib/utils/types';

/** Tope de filas/longitudes documentado (ver EXCEL_IMPORT_CONTRACT §4). */
export const IMPORT_LIMITS = {
  /** Tamaño máximo del archivo (bytes). 3 MB; bodySizeLimit del action = 4 MB. */
  maxFileBytes: 3 * 1024 * 1024,
  maxChapters: 500,
  maxItems: 5000,
  maxCodeLen: 60,
  maxDescriptionLen: 500,
  maxUnitLen: 32,
  /** Tolerancia (COP) al comparar el subtotal del Excel con el recalculado. */
  subtotalToleranceCop: '0.01',
} as const;

/** Hoja canónica esperada (formato Golden Master v1). */
export const EXPECTED_SHEET = 'COTIZACION 1 PISO';

/** Fila de capítulo en el preview (sin ítems anidados; resumen). */
export interface ImportChapterPreview {
  code: string;
  name: string;
  itemCount: number;
  /** Σ subtotales recalculados de sus ítems. */
  subtotal: DecimalString;
}

/** Fila de ítem en el preview (primeras N para mostrar; recalculado server-side). */
export interface ImportItemPreview {
  chapterCode: string;
  code: string;
  description: string;
  unit: string;
  quantity: DecimalString;
  unitPrice: DecimalString;
  /** Subtotal RECALCULADO server-side (quantity × unitPrice). */
  subtotal: DecimalString;
}

/** Advertencia no bloqueante (p. ej. subtotal del Excel difiere del recalculado). */
export interface ImportWarning {
  code: 'subtotal_mismatch' | 'empty_row_skipped' | 'extra_sheet' | 'truncated_preview';
  message: string;
}

/**
 * Resultado del Paso A (preview). NO incluye el archivo ni fórmulas; es
 * client-safe. `digest` (SHA-256 del payload normalizado) ata el preview a la
 * confirmación: si el archivo cambia, el digest difiere y la confirmación se bloquea.
 */
export interface ImportPreview {
  fileName: string;
  sheet: string;
  chapterCount: number;
  itemCount: number;
  /** Total directo = Σ subtotales recalculados. */
  directTotal: DecimalString;
  chapters: ImportChapterPreview[];
  /** Muestra de ítems (limitada para la UI). */
  itemsSample: ImportItemPreview[];
  /** Si la muestra está truncada respecto al total. */
  itemsTruncated: boolean;
  warnings: ImportWarning[];
  /** SHA-256 (hex) del payload normalizado {chapters, items}. */
  digest: string;
}

/** Resultado del Paso B (confirmación). Conteos/total RECALCULADOS server-side. */
export interface ImportResult {
  chapterCount: number;
  itemCount: number;
  directTotal: DecimalString;
}

/** Estado de importación de la versión activa del presupuesto. */
export interface ImportStatus {
  versionId: string | null;
  versionNumber: number | null;
  status: string | null;
  chapterCount: number;
  itemCount: number;
  /** `true` si la versión ya tiene capítulos o ítems. */
  hasContent: boolean;
  /** `true` si la versión es importable (draft, vacía). */
  importable: boolean;
}
