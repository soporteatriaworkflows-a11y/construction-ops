/**
 * domain.ts — Lógica PURA de reconciliación componente↔recurso
 * (APU_COMPONENT_RESOURCE_RECONCILIATION_V1, contrato §5 y §7).
 *
 * Reutiliza el motor de matching congelado del importador (matching.ts). NO
 * accede a la base de datos, NO modifica precios, NO inventa recursos. Las
 * sugerencias son DINÁMICAS (se re-derivan contra el catálogo actual) y nunca
 * se auto-aceptan.
 */
import type { ResourceIdentifier } from '@/server/catalog/import/price-list';
import {
  type ResourceMatchIndex,
  matchMaterialComponent,
} from '@/server/apu-import/matching';
import type { DecimalString, Uuid } from '@/lib/utils/types';
import type {
  ReconciliationCandidate,
  ReconciliationRow,
  ReconciliationState,
  ReconciliationSummary,
} from '@/lib/apu-reconciliation/types';

/** Fila cruda de apu_components + su plantilla (lectura RLS-bound). */
export interface RawReconciliationComponent {
  componentId: Uuid;
  apuTemplateId: Uuid;
  apuCode: string;
  apuName: string;
  componentType: string;
  resourceId: Uuid | null;
  laborRoleId: Uuid | null;
  unitPriceSource: string;
  reconciliationState: string;
  rawCode: string | null;
  rawUnit: string | null;
  notes: string | null;
  quantity: DecimalString;
  wastePct: DecimalString;
  unitPriceSnapshot: DecimalString;
  totalComponentCost: DecimalString;
  importBatchId: Uuid | null;
}

const UNASSOCIATED_NOTE_RE = /Sin asociar al catálogo:\s*"([^"]*)"/u;

/**
 * Extrae la descripción del insumo embebida en `notes`
 * (`Sin asociar al catálogo: "<desc>"`). Fallback: el propio `rawCode` o ''.
 */
export function parseDescriptionFromNotes(
  notes: string | null,
  rawCode: string | null,
): string {
  if (notes) {
    const m = UNASSOCIATED_NOTE_RE.exec(notes);
    if (m && m[1] && m[1].trim() !== '') return m[1].trim();
  }
  return (rawCode ?? '').trim();
}

/** ¿El componente es objetivo de reconciliación (material/equipo/herramienta, no M.O.)? */
export function isReconciliationTarget(c: {
  laborRoleId: Uuid | null;
  unitPriceSource: string;
}): boolean {
  return c.laborRoleId === null && c.unitPriceSource !== 'labor_role';
}

function toCandidate(
  resource: ResourceIdentifier,
  via: ReconciliationCandidate['via'],
  unitMismatch: boolean,
  baselinePrices: ReadonlyMap<Uuid, DecimalString>,
): ReconciliationCandidate {
  return {
    resourceId: resource.id,
    code: resource.code,
    name: resource.name,
    unit: resource.unit,
    via,
    unitMismatch,
    approvedBaselinePrice: baselinePrices.get(resource.id) ?? null,
  };
}

/**
 * Construye la fila de reconciliación de un componente, derivando su estado
 * dinámico. Las asociaciones existentes se preservan; el estado persistente
 * `intentionally_unresolved` gana sobre el matching dinámico.
 */
export function buildReconciliationRow(
  c: RawReconciliationComponent,
  index: ResourceMatchIndex,
  baselinePrices: ReadonlyMap<Uuid, DecimalString>,
  resourceById: ReadonlyMap<Uuid, ResourceIdentifier>,
): ReconciliationRow {
  const description = parseDescriptionFromNotes(c.notes, c.rawCode);

  const base = {
    componentId: c.componentId,
    apuTemplateId: c.apuTemplateId,
    apuCode: c.apuCode,
    apuName: c.apuName,
    componentType: c.componentType as ReconciliationRow['componentType'],
    rawCode: c.rawCode,
    rawUnit: c.rawUnit,
    description,
    quantity: c.quantity,
    wastePct: c.wastePct,
    unitPriceSnapshot: c.unitPriceSnapshot,
    totalComponentCost: c.totalComponentCost,
    importBatchId: c.importBatchId,
  };

  // Asociado: recurso ya vinculado (preservar). Gana sobre el re-matching.
  if (c.resourceId !== null) {
    const resource = resourceById.get(c.resourceId);
    return {
      ...base,
      state: 'associated',
      associatedResourceId: c.resourceId,
      associatedResourceCode: resource?.code ?? null,
      associatedResourceName: resource?.name ?? null,
      primaryCandidate: null,
      candidates: [],
      matchReason: 'Asociado al catálogo',
    };
  }

  // Pendiente sin recurso: re-matching dinámico.
  const outcome = matchMaterialComponent(index, {
    rawCode: c.rawCode ?? '',
    description,
    rawUnit: c.rawUnit ?? '',
  });

  let state: ReconciliationState;
  let primaryCandidate: ReconciliationCandidate | null = null;
  let candidates: ReconciliationCandidate[] = [];
  let matchReason: string;

  switch (outcome.kind) {
    case 'exact':
      state = 'exact_match';
      primaryCandidate = toCandidate(outcome.resource, outcome.via, false, baselinePrices);
      matchReason = `Coincidencia exacta por ${outcome.via}`;
      break;
    case 'suggested':
      state = 'suggested';
      primaryCandidate = toCandidate(outcome.resource, 'name', outcome.unitMismatch, baselinePrices);
      matchReason = outcome.unitMismatch
        ? 'Sugerido por nombre (unidad difiere)'
        : 'Sugerido por nombre';
      break;
    case 'ambiguous':
      state = 'ambiguous';
      candidates = outcome.candidates.map((r) =>
        toCandidate(r, 'name', false, baselinePrices),
      );
      matchReason = `Ambiguo: ${outcome.candidates.length} candidatos`;
      break;
    default:
      state = 'unresolved';
      matchReason = 'Sin coincidencia en el catálogo';
      break;
  }

  // Estado persistente: el usuario decidió dejarlo sin catálogo conscientemente.
  if (c.reconciliationState === 'intentionally_unresolved') {
    state = 'intentionally_unresolved';
    matchReason = 'Dejado sin asociar conscientemente';
  }

  return {
    ...base,
    state,
    associatedResourceId: null,
    associatedResourceCode: null,
    associatedResourceName: null,
    primaryCandidate,
    candidates,
    matchReason,
  };
}

/** Agrega el resumen del universo de reconciliación. */
export function summarizeReconciliation(
  rows: ReadonlyArray<ReconciliationRow>,
): ReconciliationSummary {
  const summary: ReconciliationSummary = {
    totalComponents: rows.length,
    associated: 0,
    exactPending: 0,
    suggested: 0,
    ambiguous: 0,
    unresolved: 0,
    intentionallyUnresolved: 0,
  };
  for (const r of rows) {
    switch (r.state) {
      case 'associated':
        summary.associated += 1;
        break;
      case 'exact_match':
        summary.exactPending += 1;
        break;
      case 'suggested':
        summary.suggested += 1;
        break;
      case 'ambiguous':
        summary.ambiguous += 1;
        break;
      case 'unresolved':
        summary.unresolved += 1;
        break;
      case 'intentionally_unresolved':
        summary.intentionallyUnresolved += 1;
        break;
    }
  }
  return summary;
}
