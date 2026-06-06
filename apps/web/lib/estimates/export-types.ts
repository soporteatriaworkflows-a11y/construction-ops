/**
 * export-types.ts — Tipos CLIENT-SAFE de exportación del presupuesto (4E.1).
 *
 * Sin dependencias de servidor (los consumen la UI, el route handler y los
 * generadores). Dinero/cantidades/porcentajes como `DecimalString` (string),
 * NUNCA `number`. Contrato: `docs/BUDGET_EXPORT_CONTRACT.md`.
 */
import type { DecimalString, IsoDateTime, Uuid } from '@/lib/utils/types';
import type { AiuRatesInput, FinancialSummary } from './aiu-types';

export type { DecimalString } from '@/lib/utils/types';

/** Estado del presupuesto (espejo client-safe de `estimates.status`). */
export type EstimateExportEstimateStatus = 'draft' | 'active' | 'archived';
/** Estado de la versión (espejo client-safe de `estimate_versions.status`). */
export type EstimateExportVersionStatus =
  | 'draft'
  | 'review'
  | 'approved'
  | 'issued'
  | 'archived';

/** Formatos de exportación soportados. */
export type EstimateExportFormat = 'xlsx' | 'pdf';

/** MIME por formato. */
export const EXPORT_MIME: Record<EstimateExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

/** Extensión por formato. */
export const EXPORT_EXTENSION: Record<EstimateExportFormat, string> = {
  xlsx: 'xlsx',
  pdf: 'pdf',
};

/** Límite de tamaño razonable del archivo generado (≈15 MB). */
export const EXPORT_MAX_BYTES = 15 * 1024 * 1024;

/** Ítem BOQ proyectado para exportación. */
export interface EstimateExportItem {
  code: string;
  description: string;
  unit: string;
  quantity: DecimalString;
  unitPrice: DecimalString;
  subtotal: DecimalString;
  /** Trazabilidad (sólo hoja secundaria Excel; nunca en el PDF). */
  sourceCode: string | null;
  sourceRow: number | null;
}

/** Capítulo proyectado para exportación (con sus ítems). */
export interface EstimateExportChapter {
  code: string;
  name: string;
  sortOrder: number;
  subtotal: DecimalString;
  items: EstimateExportItem[];
  sourceCode: string | null;
  sourceRow: number | null;
}

/**
 * Payload completo, server-derived, para generar Excel y PDF. Sólo contiene
 * datos de presentación; NO incluye secretos ni identidades de sesión.
 */
export interface EstimateExportPayload {
  organizationName: string;
  project: { id: Uuid; name: string; city: string | null };
  scope: { id: Uuid; name: string | null };
  estimate: { id: Uuid; code: string; name: string; status: EstimateExportEstimateStatus };
  version: { number: number; label: string; status: EstimateExportVersionStatus };
  generatedAt: IsoDateTime;
  counts: { chapters: number; items: number };
  chapters: EstimateExportChapter[];
  /** Porcentajes AIU en formato humano (`"3.5"` = 3.5 %). */
  aiu: AiuRatesInput;
  /** Resumen financiero recalculado server-side (4D.2). */
  financial: FinancialSummary;
}

/** Resultado de una generación de archivo (en memoria). */
export interface EstimateExportResult {
  buffer: Uint8Array;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  generatedAt: IsoDateTime;
}
