/**
 * port.ts — Re-exporta el contrato del read-model desde la FUENTE ÚNICA DE
 * CÓDIGO `@/lib/contracts/read-model`.
 *
 * Propiedad: agent-db-rls (IMPLEMENTA el puerto). La UI consume estos DTOs; no
 * existe ninguna otra definición de `ReadModelPort` / DTOs fuera del contrato.
 */

export type {
  ViewerRole,
  ViewerContext,
  ProjectListItem,
  ProjectOverview,
  EstimateSummary,
  ChapterSummary,
  BoqItemView,
  ApuSummary,
  QuantityLineView,
  QuantityGroupView,
  CatalogResourceView,
  ChapterDistributionSlice,
  DashboardSummary,
  ProgressSummary,
  ReadModelPort,
} from '@/lib/contracts/read-model';
