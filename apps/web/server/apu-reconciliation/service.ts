/**
 * service.ts — Orquestación de la reconciliación APU
 * (APU_COMPONENT_RESOURCE_RECONCILIATION_V1).
 *
 * Compone lectura RLS-bound + dominio puro. Las sugerencias se re-derivan al
 * vuelo contra el catálogo actual; nunca se persisten ni se auto-aceptan.
 */
import type { AuthenticatedViewer } from '@/server/auth/types';
import type { ResourceIdentifier } from '@/server/catalog/import/price-list';
import { buildResourceMatchIndex } from '@/server/apu-import/matching';
import { unitsEquivalent } from '@/server/pricing/units';
import type { Uuid } from '@/lib/utils/types';
import type {
  ApuImportBatchInfo,
  BulkReconcilePair,
  BulkReconcileResult,
  ReconcileActionResult,
  ReconciliationRow,
  ReconciliationSummary,
  ResourceSearchResult,
} from '@/lib/apu-reconciliation/types';
import {
  buildReconciliationRow,
  isReconciliationTarget,
  summarizeReconciliation,
  type RawReconciliationComponent,
} from './domain';
import { DbApuReconciliationRepository } from './db-repository';
import { buildReconciliationCsv } from './csv';
import { ReconciliationBulkLimitError, ReconciliationInputError } from './errors';

export const BULK_MAX = 50;
const SEARCH_LIMIT = 20;

export interface ReconciliationDeps {
  repo?: DbApuReconciliationRepository;
}

export interface ReconciliationData {
  rows: ReconciliationRow[];
  summary: ReconciliationSummary;
  batches: ApuImportBatchInfo[];
}

function repoOf(deps?: ReconciliationDeps): DbApuReconciliationRepository {
  return deps?.repo ?? new DbApuReconciliationRepository();
}

/** Construye las filas de reconciliación (solo componentes objetivo, no M.O.). */
async function buildRows(
  viewer: AuthenticatedViewer,
  repo: DbApuReconciliationRepository,
  components: RawReconciliationComponent[],
): Promise<ReconciliationRow[]> {
  const targets = components.filter((c) =>
    isReconciliationTarget({ laborRoleId: c.laborRoleId, unitPriceSource: c.unitPriceSource }),
  );
  if (targets.length === 0) return [];

  const identifiers = await repo.listResourceIdentifiers(viewer);
  const index = buildResourceMatchIndex(identifiers);
  const resourceById = new Map<Uuid, ResourceIdentifier>(
    identifiers.map((r) => [r.id, r]),
  );
  const baselinePrices = await repo.getApprovedBaselinePrices(
    viewer,
    identifiers.map((r) => r.id),
  );

  return targets.map((c) =>
    buildReconciliationRow(c, index, baselinePrices, resourceById),
  );
}

/** Datos completos del centro de reconciliación (toda la organización). */
export async function getReconciliationData(
  viewer: AuthenticatedViewer,
  deps?: ReconciliationDeps,
): Promise<ReconciliationData> {
  const repo = repoOf(deps);
  const [components, batches] = await Promise.all([
    repo.listComponents(viewer),
    repo.listImportBatches(viewer),
  ]);
  const rows = await buildRows(viewer, repo, components);
  return { rows, summary: summarizeReconciliation(rows), batches };
}

/** Datos de reconciliación de una sola plantilla APU (para el detalle). */
export async function getTemplateReconciliation(
  viewer: AuthenticatedViewer,
  apuTemplateId: Uuid,
  deps?: ReconciliationDeps,
): Promise<ReconciliationData> {
  const repo = repoOf(deps);
  const components = await repo.listComponentsByTemplate(viewer, apuTemplateId);
  const rows = await buildRows(viewer, repo, components);
  return { rows, summary: summarizeReconciliation(rows), batches: [] };
}

/** Ítems BOQ vinculados a una plantilla APU (pestaña Vínculo BOQ). */
export async function getApuBoqLinks(
  viewer: AuthenticatedViewer,
  apuTemplateId: Uuid,
  deps?: ReconciliationDeps,
) {
  return repoOf(deps).listApuBoqLinks(viewer, apuTemplateId);
}

/** Lotes de importación APU (origen/trazabilidad). */
export async function getImportBatches(
  viewer: AuthenticatedViewer,
  deps?: ReconciliationDeps,
): Promise<ApuImportBatchInfo[]> {
  return repoOf(deps).listImportBatches(viewer);
}

/** Búsqueda manual de recursos (inline, máx 20). RLS-bound. */
export async function searchResources(
  viewer: AuthenticatedViewer,
  query: string,
  rawUnit: string | null,
  deps?: ReconciliationDeps,
): Promise<ResourceSearchResult[]> {
  const repo = repoOf(deps);
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const identifiers = await repo.listResourceIdentifiers(viewer);
  const matched = identifiers
    .filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        (r.externalReference ?? '').toLowerCase().includes(q) ||
        (r.externalSku ?? '').toLowerCase().includes(q),
    )
    // Recursos cuya unidad coincide primero (mejor candidato).
    .sort((a, b) => {
      if (!rawUnit) return a.name.localeCompare(b.name);
      const aMatch = unitsEquivalent(a.unit, rawUnit) ? 0 : 1;
      const bMatch = unitsEquivalent(b.unit, rawUnit) ? 0 : 1;
      return aMatch - bMatch || a.name.localeCompare(b.name);
    })
    .slice(0, SEARCH_LIMIT);

  const baselinePrices = await repo.getApprovedBaselinePrices(
    viewer,
    matched.map((r) => r.id),
  );
  return matched.map((r) => ({
    resourceId: r.id,
    code: r.code,
    name: r.name,
    unit: r.unit,
    resourceType: '',
    approvedBaselinePrice: baselinePrices.get(r.id) ?? null,
  }));
}

/** Asocia/confirma un componente individual (RPC RLS-bound). */
export async function reconcileComponent(
  _viewer: AuthenticatedViewer,
  componentId: Uuid,
  resourceId: Uuid,
  keepSnapshot: boolean,
  idempotencyKey: string | null,
  deps?: ReconciliationDeps,
): Promise<ReconcileActionResult> {
  if (!componentId || !resourceId) throw new ReconciliationInputError();
  return repoOf(deps).reconcileComponent(componentId, resourceId, keepSnapshot, idempotencyKey);
}

/** Asociación masiva (selección explícita, máx 50). */
export async function reconcileBulk(
  _viewer: AuthenticatedViewer,
  pairs: ReadonlyArray<BulkReconcilePair>,
  keepSnapshot: boolean,
  idempotencyKey: string | null,
  deps?: ReconciliationDeps,
): Promise<BulkReconcileResult> {
  if (pairs.length === 0) throw new ReconciliationInputError('Selección vacía.');
  if (pairs.length > BULK_MAX) throw new ReconciliationBulkLimitError();
  return repoOf(deps).reconcileBulk(pairs, keepSnapshot, idempotencyKey);
}

/** Rechazar / dejar pendiente / limpiar (RPC RLS-bound). */
export async function updateReconciliation(
  _viewer: AuthenticatedViewer,
  componentId: Uuid,
  action: 'reject' | 'leave_pending' | 'clear',
  idempotencyKey: string | null,
  deps?: ReconciliationDeps,
): Promise<{ componentId: Uuid; action: string; newState: string }> {
  if (!componentId) throw new ReconciliationInputError();
  return repoOf(deps).updateReconciliation(componentId, action, idempotencyKey);
}

/** CSV sanitizado de las filas de reconciliación. */
export function reconciliationCsv(rows: ReadonlyArray<ReconciliationRow>): string {
  return buildReconciliationCsv(rows);
}
