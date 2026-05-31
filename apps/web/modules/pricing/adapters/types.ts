/**
 * Tipos del adaptador genérico de proveedor — agent-homecenter (Oleada 2B).
 *
 * Implementa EXACTAMENTE el contrato congelado v1:
 * `docs/PRICING_ADAPTER_CONTRACT.md`.
 *
 * Reglas:
 * - Todo valor monetario viaja como `DecimalString`, NUNCA `number`.
 * - Campos 🔒 INTERNOS nunca se serializan a rol cliente.
 * - `parseCatalog`/`mapToSupplierProducts`/`buildPreview` son de solo lectura.
 * - `toPriceObservations` solo procesa propuestas con `status='approved'`.
 * - Ningún adaptador escribe en DB; toda persistencia pasa por `PricingApprovalPort`.
 */

import type { DecimalString, IsoDateTime, Uuid } from "@/lib/utils/types";
import type { RecordObservationInput } from "@/modules/pricing/types";

// Re-exportar alias base para conveniencia de los consumidores del módulo.
export type { DecimalString, IsoDateTime, Uuid } from "@/lib/utils/types";
export type { RecordObservationInput } from "@/modules/pricing/types";

/* ----------------------------------------------------------------------------
 * CatalogInput
 * ------------------------------------------------------------------------- */

/**
 * Fuente de catálogo a importar. Sin rutas a archivos privados reales.
 * `content`: string para CSV; Uint8Array para Excel binario.
 */
export interface CatalogInput {
  /** Nombre del archivo (para trazabilidad y preview). */
  fileName: string;
  /** MIME type opcional (p. ej. 'text/csv', 'application/vnd.ms-excel'). */
  mimeType?: string;
  /** Contenido: string para CSV; Uint8Array para Excel. */
  content: string | Uint8Array;
}

/* ----------------------------------------------------------------------------
 * RawSupplierItem
 * ------------------------------------------------------------------------- */

/**
 * Ítem crudo normalizado proveniente del proveedor.
 * Todos los campos 🔒 INTERNOS nunca llegan al cliente.
 */
export interface RawSupplierItem {
  /** 🔒 SKU del proveedor (opcional). */
  sku?: string;
  /** Nombre / descripción del producto. */
  name: string;
  /** 🔒 Precio público observado (DecimalString). */
  onlinePublicPrice: DecimalString;
  /** Moneda ISO-4217, p. ej. 'COP'. */
  currency: string;
  /** 🔒 URL del producto (opcional). */
  url?: string;
  /** Unidad de medida (opcional). */
  unit?: string;
  /** Fecha/hora de observación (ISO 8601). */
  observedAt: IsoDateTime;
  /** 🔒 Referencia interna del archivo de origen (trazabilidad). */
  sourceReference?: string;
  /** Índice de fila de origen (0-based, para trazabilidad). */
  rawRowIndex: number;
}

/* ----------------------------------------------------------------------------
 * SkuMatchCandidate
 * ------------------------------------------------------------------------- */

/**
 * Candidato de mapeo SKU → recurso/producto interno.
 * Campos 🔒 INTERNOS: no se serializan a cliente.
 */
export interface SkuMatchCandidate {
  /** ID del recurso interno candidato. */
  resourceId: Uuid;
  /** 🔒 ID del producto de proveedor si ya existe. */
  supplierProductId?: Uuid;
  /** Score de relevancia 0..1. 🔒 */
  score: number;
  /** Explicación legible del match. */
  reason: string;
}

/* ----------------------------------------------------------------------------
 * SkuMatchProposal
 * ------------------------------------------------------------------------- */

/**
 * Propuesta de mapeo para un ítem crudo.
 * - `status='pending'`: ambiguo o sin candidato claro → requiere revisión humana.
 * - `status='approved'`: humano eligió candidato explícitamente.
 * - `status='rejected'`: humano rechazó el ítem.
 *
 * NUNCA se persiste una propuesta `pending` como aprobada automáticamente.
 */
export interface SkuMatchProposal {
  rawItem: RawSupplierItem;
  /** 🔒 Lista de candidatos ordenados por score. */
  candidates: SkuMatchCandidate[];
  /** 🔒 Candidato elegido por el humano (solo en `status='approved'`). */
  chosen?: SkuMatchCandidate;
  /** Estado de la propuesta. */
  status: "pending" | "approved" | "rejected";
  /** true si ambiguo o sin candidato claro → revisión humana obligatoria. */
  requiresManualReview: boolean;
  /** 🔒 Notas del revisor. */
  reviewNotes?: string;
}

/* ----------------------------------------------------------------------------
 * ImportPreview
 * ------------------------------------------------------------------------- */

/**
 * Resumen del preview de importación. Se genera ANTES de persistir.
 * El humano revisa y aprueba/rechaza antes de llamar a `toPriceObservations`.
 */
export interface ImportPreview {
  /** Clave del proveedor (p. ej. 'homecenter'). */
  providerKey: string;
  /** Nombre del archivo fuente. */
  sourceFileName: string;
  /** Total de filas leídas. */
  totalRows: number;
  /** Filas con datos válidos. */
  validRows: number;
  /** Filas con errores de validación. */
  invalidRows: number;
  /** Filas con SKU ambiguo o sin candidato claro. */
  ambiguousRows: number;
  /** Filas ya aprobadas por el humano. */
  approvedRows: number;
  /** Todas las propuestas (para revisión individual). */
  proposals: SkuMatchProposal[];
  /** Advertencias no bloqueantes. */
  warnings: string[];
}

/* ----------------------------------------------------------------------------
 * ImportResult
 * ------------------------------------------------------------------------- */

/**
 * Resultado de la importación tras la aprobación humana.
 * `recorded`: observaciones persistidas vía `PricingApprovalPort`.
 * `duplicates`: observaciones ignoradas por idempotencia.
 */
export interface ImportResult {
  /** Observaciones registradas exitosamente. */
  recorded: number;
  /** Ítems omitidos (sin candidato aprobado o pendientes). */
  skipped: number;
  /** Ítems rechazados explícitamente. */
  rejected: number;
  /** Observaciones ignoradas por idempotencia (ya existían). */
  duplicates: number;
  /** Errores de registro (mensajes). */
  errors: string[];
}

/* ----------------------------------------------------------------------------
 * ResourceRef / ResourceCatalog
 * ------------------------------------------------------------------------- */

/** Referencia a un recurso interno para matching de SKU. */
export interface ResourceRef {
  resourceId: string;
  name: string;
  code?: string;
  unit?: string;
}

/**
 * Catálogo de recursos disponibles para matching.
 * En producción se provee desde la DB; en tests, se inyecta.
 */
export interface ResourceCatalog {
  resources: ResourceRef[];
}

/* ----------------------------------------------------------------------------
 * SupplierAdapter
 * ------------------------------------------------------------------------- */

/**
 * Interfaz genérica de adaptador de proveedor.
 * Contrato congelado v1 — `docs/PRICING_ADAPTER_CONTRACT.md` §2.
 *
 * Reglas:
 * 1. Ningún método escribe en DB; toda persistencia pasa por `PricingApprovalPort`.
 * 2. `parseCatalog`/`mapToSupplierProducts`/`buildPreview` son de solo lectura.
 * 3. `toPriceObservations` solo procesa propuestas con `status='approved'`.
 * 4. La idempotencia se resuelve ANTES de llamar a `recordObservation`.
 * 5. Ambigüedades quedan visibles en el preview, nunca aprobadas automáticamente.
 */
export interface SupplierAdapter {
  /** Clave estable del proveedor, p. ej. 'homecenter'. */
  readonly providerKey: string;

  /**
   * Lee un catálogo crudo (CSV/Excel) y lo normaliza a filas.
   * No persiste. Valida columnas obligatorias y reporta errores.
   */
  parseCatalog(input: CatalogInput): Promise<RawSupplierItem[]>;

  /**
   * Propone coincidencias SKU→recurso/producto con candidatos y score.
   * No persiste. Coincidencias ambiguas → `requiresManualReview=true`.
   */
  mapToSupplierProducts(rows: RawSupplierItem[]): Promise<SkuMatchProposal[]>;

  /**
   * Construye el preview (resumen + conflictos + propuestas). No persiste.
   * El humano revisa ANTES de persistir.
   */
  buildPreview(proposals: SkuMatchProposal[]): ImportPreview;

  /**
   * Convierte SÓLO las propuestas `status='approved'` en entradas
   * append-only para `PricingApprovalPort.recordObservation`.
   * No persiste por sí mismo.
   */
  toPriceObservations(approved: SkuMatchProposal[]): RecordObservationInput[];
}
