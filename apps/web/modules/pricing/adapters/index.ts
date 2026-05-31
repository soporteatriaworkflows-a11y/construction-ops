/**
 * Barrel del módulo de adaptadores de proveedor — agent-homecenter (Oleada 2B).
 *
 * Exporta la interfaz genérica `SupplierAdapter`, todos los tipos del contrato
 * congelado v1 (`docs/PRICING_ADAPTER_CONTRACT.md`) y la implementación
 * Homecenter CSV.
 *
 * El subpaquete `adapters/` es propiedad exclusiva de agent-homecenter.
 * El módulo `pricing/` raíz no reexporta este barrel.
 *
 * Diseño para n8n (futura integración supervisada):
 * - Los adaptadores implementan `SupplierAdapter` y son sustituibles.
 * - `buildPreview` + aprobación humana = punto de integración para webhooks n8n.
 * - `toPriceObservations` genera los inputs listos para `PricingApprovalPort`.
 * - El registro de observaciones + aprobación = triggers n8n futuros.
 * - Rate limiting: configurable en el adaptador; no hardcodeado.
 */

// Tipos del contrato congelado v1.
export type {
  CatalogInput,
  ImportPreview,
  ImportResult,
  RawSupplierItem,
  ResourceCatalog,
  ResourceRef,
  SkuMatchCandidate,
  SkuMatchProposal,
  SupplierAdapter,
} from "./types";

// Re-exportar RecordObservationInput para conveniencia (viene de pricing).
export type { RecordObservationInput } from "./types";

// Idempotencia.
export {
  buildContentHash,
  hashRowContent,
  IdempotencyRegistry,
  serializeIdempotencyKey,
} from "./idempotency";
export type { IdempotencyKey } from "./idempotency";

// Preview.
export { buildPreview, summarizePreview } from "./import-preview";
export type { PreviewSummary } from "./import-preview";

// Utilidades base.
export {
  applyApprovedProposals,
  CLEAR_MATCH_THRESHOLD,
  isAmbiguous,
  isValidPrice,
  jaccardScore,
  MIN_CANDIDATE_THRESHOLD,
  normalizeCurrency,
  parsePrice,
  proposalsToObservationInputs,
  SUPPORTED_CURRENCIES,
  tokenize,
} from "./supplier-adapter";
export type { ImportApprovalAudit, MinimalApprovalPort } from "./supplier-adapter";

// Implementación Homecenter CSV.
export {
  createHomecenterCsvAdapter,
  detectSeparator,
  EMPTY_CATALOG,
  HomecenterCsvAdapter,
  OPTIONAL_COLUMNS,
  parseCsvContent,
  parseCsvLine,
  REQUIRED_COLUMNS,
  runImportPreview,
  validateColumns,
} from "./homecenter-csv";
export type {
  CsvParseResult,
  OptionalColumn,
  ParsedCsvRow,
  RequiredColumn,
} from "./homecenter-csv";
