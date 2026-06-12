/**
 * types.ts — DTOs compartidos del importador estructurado de la hoja APU
 * (ENTRE_PATIOS_APU_IMPORT_V1 + BOQ_APU_LINKING_V1).
 *
 * Contrato: docs/ENTRE_PATIOS_APU_IMPORT_V1_CONTRACT.md.
 * Solo tipos serializables UI ↔ server actions. Sin lógica financiera.
 */

import type { DecimalString, Uuid } from '@/lib/utils/types';

/** Límites congelados del archivo (contrato §2). */
export const APU_IMPORT_LIMITS = {
  maxFileBytes: 10 * 1024 * 1024,
} as const;

/** Extensiones admitidas: workbook multi-hoja (CSV no aplica — contrato §2). */
export const APU_IMPORT_EXTENSIONS = ['.xlsx', '.xls'] as const;

/** Resultado de matching de un componente material/equipment/tool (§4). */
export type ApuComponentMatch =
  | 'exact'
  | 'suggested'
  | 'unresolved'
  | 'ambiguous'
  | 'labor'
  | 'none';

/** Tipo de componente detectado en la hoja (§3.4). */
export type ApuParsedComponentType = 'material' | 'labor' | 'equipment' | 'tool';

/** Estado de una actividad en el preview (§8). */
export type ApuActivityStatus = 'ready' | 'needs_review' | 'error';

/** Estado de vinculación BOQ por actividad (§7). */
export type BoqLinkStatus =
  | 'linkable'
  | 'linked'
  | 'unresolved'
  | 'ambiguous'
  | 'skipped_existing'
  | 'not_evaluated';

/** Integrante de cuadrilla reconocido en una fila de M.O. (§3.6). */
export interface ApuCrewMemberView {
  role: 'oficial' | 'ayudante';
  count: number;
  laborRoleName?: string;
}

/** Componente parseado de una actividad (vista de preview). */
export interface ApuImportComponentPreview {
  /** Clave estable del componente dentro del preview: `${activityKey}:${sourceRow}`. */
  key: string;
  sourceRow: number;
  rawCode: string;
  description: string;
  componentType: ApuParsedComponentType;
  rawUnit: string;
  unitCanonical: string;
  quantity: DecimalString | null;
  wastePct: DecimalString;
  /** Precio unitario de referencia del Excel (caché; evidencia). */
  unitPrice: DecimalString | null;
  /** Subtotal del Excel (caché; evidencia de comparación, jamás fuente). */
  excelSubtotal: DecimalString | null;
  /** Subtotal recalculado server-side con Decimal. */
  recalculatedSubtotal: DecimalString | null;
  match: ApuComponentMatch;
  /** Recurso asociado (exact) o sugerido (suggested). */
  resourceId?: Uuid;
  resourceCode?: string;
  resourceName?: string;
  /** Precio baseline aprobado del recurso asociado/sugerido (comparación). */
  approvedBaselinePrice?: DecimalString | null;
  /** Cuadrilla reconocida (solo labor). */
  crew?: ApuCrewMemberView[];
  warnings: string[];
  errors: string[];
}

/** Actividad parseada (vista de preview). */
export interface ApuImportActivityPreview {
  /** Identidad interna estable del parseo: `${codigoVisible}#${occurrenceIndex}`. */
  key: string;
  visibleCode: string;
  occurrenceIndex: number;
  /** Código persistido (visible, o `visible#n` para ocurrencias ≥2). */
  persistedCode: string;
  description: string;
  rawUnit: string;
  unitCanonical: string;
  sourceRow: number;
  componentCount: number;
  /** Fracción [0,1] de herramienta menor derivada detectada (§3.5). */
  defaultToolPct: DecimalString;
  /** Costo total de la actividad según el Excel (evidencia). */
  excelTotal: DecimalString | null;
  /** Costo total recalculado server-side (fuente de verdad). */
  recalculatedTotal: DecimalString | null;
  /** recalculado − excel (null si falta evidencia). */
  costDelta: DecimalString | null;
  status: ApuActivityStatus;
  /** Qué hará la confirmación con esta actividad. */
  importAction: 'create' | 'skip_existing' | 'omit';
  exactCount: number;
  suggestedCount: number;
  unresolvedCount: number;
  ambiguousCount: number;
  boqLink: {
    status: BoqLinkStatus;
    boqItemId?: Uuid;
    boqItemCode?: string;
    boqItemDescription?: string;
    detail?: string;
  };
  warnings: string[];
  errors: string[];
  components: ApuImportComponentPreview[];
}

/** Resolución de un rol laboral del bloque salarial (§3.1, §3.7). */
export interface ApuLaborRolePreview {
  role: 'oficial' | 'ayudante';
  blockLabel: string;
  /** Costo hora del Excel (evidencia). */
  hourlyExcel: DecimalString | null;
  /** Costo hora recalculado con calculateLaborCost (fuente de verdad). */
  hourlyRecalculated: DecimalString | null;
  action: 'reuse' | 'create' | 'unavailable';
  existingRoleName?: string;
  warnings: string[];
}

/** Versión editable candidata para vinculación BOQ (selección explícita). */
export interface LinkableVersionOption {
  versionId: Uuid;
  label: string;
  status: string;
  itemCount: number;
  unlinkedCount: number;
}

/** Resumen agregado del preview (§8). */
export interface ApuImportPreviewTotals {
  activities: number;
  components: number;
  exactMatches: number;
  suggested: number;
  unresolved: number;
  ambiguous: number;
  warnings: number;
  criticalErrors: number;
  readyToImport: number;
  skippedExisting: number;
  omitted: number;
  linkable: number;
  notLinkable: number;
}

/** Preview completo (paso A — sin escritura). */
export interface ApuImportPreview {
  fileName: string;
  sheetName: string;
  digest: string;
  laborRoles: ApuLaborRolePreview[];
  totals: ApuImportPreviewTotals;
  activities: ApuImportActivityPreview[];
  /** Versión objetivo evaluada en este preview (si se pidió). */
  linkVersionId: Uuid | null;
  /** Errores de archivo/hoja que bloquean la confirmación. */
  blockingErrors: string[];
  importable: boolean;
}

/** Acepte explícito de una sugerencia (selección consciente; re-validado). */
export interface AcceptedSuggestion {
  componentKey: string;
  resourceId: Uuid;
}

/** Fila del reporte final por actividad. */
export interface ApuImportReportRow {
  activityKey: string;
  visibleCode: string;
  persistedCode: string;
  description: string;
  unit: string;
  importStatus: 'created' | 'skipped_existing' | 'omitted';
  componentsImported: number;
  componentsUnresolved: number;
  linkStatus: BoqLinkStatus;
  boqItemCode?: string;
  messages: string[];
}

/** Resultado de la confirmación (paso B). */
export interface ApuImportResult {
  duplicate: boolean;
  batchId: Uuid;
  importedActivities: number;
  importedComponents: number;
  skippedExisting: number;
  linkedBoqItems: number;
  unresolvedComponents: number;
  rows: ApuImportReportRow[];
  reportCsv: string;
}
