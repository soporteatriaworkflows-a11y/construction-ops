/**
 * Construcción del preview de importación — agent-homecenter (Oleada 2B).
 *
 * `buildPreview` recibe las propuestas de mapeo SKU y genera un resumen
 * completo para revisión humana ANTES de persistir.
 *
 * Contrato congelado v1 — `docs/PRICING_ADAPTER_CONTRACT.md` §2.
 *
 * Reglas:
 * - No persiste nada.
 * - El humano aprueba/rechaza ANTES de llamar a `toPriceObservations`.
 * - Ambigüedades (`requiresManualReview=true`) quedan `pending`.
 * - El preview es la fuente de verdad para `totalRows`/`validRows`/
 *   `invalidRows`/`ambiguousRows`/`approvedRows`.
 */

import type { ImportPreview, SkuMatchProposal } from "./types";

/**
 * Construye un `ImportPreview` a partir de propuestas de mapeo.
 *
 * @param providerKey - Clave del proveedor (p. ej. 'homecenter').
 * @param sourceFileName - Nombre del archivo fuente.
 * @param proposals - Propuestas de mapeo (pueden estar `pending`/`approved`/`rejected`).
 * @param warnings - Advertencias no bloqueantes (columnas faltantes opcionales, etc.).
 * @param invalidCount - Número de filas rechazadas en la etapa de parseo (inválidas).
 */
export function buildPreview(
  providerKey: string,
  sourceFileName: string,
  proposals: SkuMatchProposal[],
  warnings: string[] = [],
  invalidCount = 0,
): ImportPreview {
  const validRows = proposals.length;
  const ambiguousRows = proposals.filter((p) => p.requiresManualReview).length;
  const approvedRows = proposals.filter((p) => p.status === "approved").length;

  return {
    providerKey,
    sourceFileName,
    totalRows: validRows + invalidCount,
    validRows,
    invalidRows: invalidCount,
    ambiguousRows,
    approvedRows,
    proposals,
    warnings: [...warnings],
  };
}

/**
 * Calcula estadísticas de resumen del preview (para UI).
 */
export interface PreviewSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  pendingRows: number;
  approvedRows: number;
  rejectedRows: number;
  ambiguousRows: number;
  readyToImport: boolean;
}

/**
 * Extrae un resumen legible del preview.
 * `readyToImport=true` cuando hay al menos un ítem aprobado y ninguno pendiente.
 */
export function summarizePreview(preview: ImportPreview): PreviewSummary {
  const pendingRows = preview.proposals.filter(
    (p) => p.status === "pending",
  ).length;
  const approvedRows = preview.proposals.filter(
    (p) => p.status === "approved",
  ).length;
  const rejectedRows = preview.proposals.filter(
    (p) => p.status === "rejected",
  ).length;

  return {
    totalRows: preview.totalRows,
    validRows: preview.validRows,
    invalidRows: preview.invalidRows,
    pendingRows,
    approvedRows,
    rejectedRows,
    ambiguousRows: preview.ambiguousRows,
    readyToImport: approvedRows > 0 && pendingRows === 0,
  };
}
