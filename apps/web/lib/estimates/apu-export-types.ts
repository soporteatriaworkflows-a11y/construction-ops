/**
 * apu-export-types.ts — Tipos CLIENT-SAFE de la exportación de APU vinculados y
 * del paquete presupuesto+anexo APU (APU_EXPORTS_V1 + BUDGET_EXPORT_WITH_APU_ANNEX_V1).
 *
 * Sin dependencias de servidor (los consumen la UI, el route handler, el dominio
 * de selección y los generadores). Dinero/cantidades/porcentajes como
 * `DecimalString` (string), NUNCA `number`.
 * Contrato: `docs/APU_EXPORTS_AND_BUDGET_APU_ANNEX_V1_CONTRACT.md`.
 */
import type { DecimalString, Uuid } from '@/lib/utils/types';
import type { ApuComponentView } from '@/lib/contracts/read-model';
import type { EstimateExportPayload } from './export-types';

/** Documentos NUEVOS de export (el presupuesto base usa `kind='budget'`). */
export type ApuExportKind = 'apu' | 'package';
/** Todos los `kind` de la ruta de export (incluye el presupuesto base). */
export type ExportKind = 'budget' | ApuExportKind;

/**
 * Fila cruda BOQ → APU de la versión objetivo (un ítem BOQ activo). El
 * `apuTemplateId` es `null` cuando el ítem no tiene APU vinculado. Client-safe:
 * sólo códigos/descripciones presupuestales, nunca secretos.
 */
export interface VersionApuLinkRow {
  chapterCode: string;
  chapterName: string;
  chapterSortOrder: number;
  itemCode: string;
  itemDescription: string;
  itemSortOrder: number;
  apuTemplateId: Uuid | null;
}

/** Un vínculo BOQ → APU (un ítem BOQ que referencia la plantilla). */
export interface ApuBoqLink {
  chapterCode: string;
  chapterName: string;
  itemCode: string;
  itemDescription: string;
}

/** Ficha de un APU vinculado, lista para presentación (Excel/PDF). */
export interface LinkedApuView {
  apuTemplateId: Uuid;
  code: string;
  name: string;
  unit: string;
  unitCostTotal: DecimalString;
  unitCostMaterials: DecimalString;
  unitCostLabor: DecimalString;
  unitCostEquipment: DecimalString;
  unitCostTools: DecimalString;
  unitCostToolDerived: DecimalString;
  unitCostSubcontract: DecimalString;
  unitCostOther: DecimalString;
  defaultToolPct: DecimalString;
  componentCount: number;
  components: ApuComponentView[];
  /** Etiqueta de origen ('Manual' | 'Importado' | origin_type crudo). */
  origin: string;
  /** `true` si `archived_at IS NOT NULL`. */
  archived: boolean;
  /** `true` si costo unitario en cero (sin precio aprobado / sin componentes). */
  incomplete: boolean;
  /** Ítems BOQ que referencian este APU, en orden BOQ. */
  boqLinks: ApuBoqLink[];
  /** Capítulo de la primera aparición (para el índice). */
  primaryChapterCode: string;
  primaryChapterName: string;
}

/** Conteos de la selección (para UI y portada). */
export interface ApuExportCounts {
  boqItems: number;
  linkedApu: number;
  unlinkedItems: number;
  archivedIncluded: number;
  archivedExcluded: number;
  incomplete: number;
}

/**
 * Selección completa, server-derived, para generar el anexo APU y el paquete.
 * Reutiliza el `EstimateExportPayload` del presupuesto (snapshots BOQ) y añade
 * los APU vinculados resueltos (cálculo actual del APU, read-model).
 */
export interface BudgetApuExportSelection {
  payload: EstimateExportPayload;
  /** `true` si la versión objetivo está en familia emitida (issued/approved/archived). */
  versionEmitted: boolean;
  linkedApus: LinkedApuView[];
  counts: ApuExportCounts;
}
