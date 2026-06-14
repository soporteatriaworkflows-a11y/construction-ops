/**
 * sync.ts — Preview PURO de sincronización Cantidad → BOQ
 * (QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1 §4).
 *
 * Propiedad: agent-cost-domain. Dominio PURO, sin BD ni red.
 *
 * REGLAS DURAS:
 *   - El preview NO escribe nada (read-only). La escritura ocurre solo tras
 *     confirmación, vía RPC (`add_apu_to_boq` / `update_boq_item_quantity`).
 *   - Versiones emitidas (approved/issued/archived) ⇒ `blocked` (no editables).
 *   - Muestra antes / después / diferencia. NO toca precios ni APU.
 */
import { DomainDecimal, toDecimalString } from '@/modules/apu/decimal';
import type { DecimalString, Uuid } from '@/lib/utils/types';

export type VersionStatus = 'draft' | 'review' | 'approved' | 'issued' | 'archived';

/** Estados de versión que permiten escritura del BOQ. */
const EDITABLE_STATUSES: ReadonlySet<string> = new Set(['draft', 'review']);

export function isEditableVersion(status: VersionStatus): boolean {
  return EDITABLE_STATUSES.has(status);
}

export interface SyncLineInput {
  workspaceLineId: Uuid;
  description: string;
  /** cantidad neta que se enviaría al BOQ. */
  resultNet: DecimalString;
  resultUnit: string;
  /** APU vinculado a la línea (para crear ítem nuevo). */
  apuTemplateId: Uuid | null;
  /** ítem BOQ ya vinculado (para actualizar). */
  boqItemId: Uuid | null;
  /** ¿el APU tiene componentes? false ⇒ advertencia "incompleto". */
  apuHasComponents?: boolean;
}

export interface SyncTargetInput {
  versionStatus: VersionStatus;
  /** capítulo destino elegido para crear ítem nuevo. */
  chapterId: Uuid | null;
  /** snapshot del ítem BOQ existente cuando la línea ya está vinculada. */
  existing?: { quantitySnapshot: DecimalString } | null;
}

export type SyncAction = 'create' | 'update' | 'blocked';

export interface SyncPreviewRow {
  workspaceLineId: Uuid;
  action: SyncAction;
  description: string;
  apuTemplateId: Uuid | null;
  chapterId: Uuid | null;
  boqItemId: Uuid | null;
  quantityBefore: DecimalString;
  quantityAfter: DecimalString;
  difference: DecimalString;
  warnings: string[];
  /** true ⇒ la confirmación de ESTA línea queda deshabilitada. */
  blocked: boolean;
}

/**
 * Construye la fila de preview para UNA línea de workspace contra su destino.
 * Función pura — fuente de verdad de la seguridad del sync.
 */
export function buildBoqSyncPreview(
  line: SyncLineInput,
  target: SyncTargetInput,
): SyncPreviewRow {
  const warnings: string[] = [];
  const after = line.resultNet;

  const editable = isEditableVersion(target.versionStatus);
  if (!editable) {
    warnings.push('version_locked');
  }

  // ¿Actualizar ítem existente o crear nuevo?
  const isUpdate = line.boqItemId !== null;
  let action: SyncAction = isUpdate ? 'update' : 'create';
  let before: DecimalString = '0';
  let blocked = !editable;

  if (isUpdate) {
    if (target.existing) {
      before = target.existing.quantitySnapshot;
    } else {
      // El ítem vinculado ya no existe/visible ⇒ no se puede actualizar.
      warnings.push('linked_item_missing');
      blocked = true;
    }
  } else {
    if (!line.apuTemplateId) {
      warnings.push('no_apu');
      blocked = true;
    } else if (line.apuHasComponents === false) {
      warnings.push('apu_incomplete');
    }
    if (!target.chapterId) {
      warnings.push('no_chapter');
      blocked = true;
    }
  }

  if (blocked && !editable) {
    action = 'blocked';
  }

  const difference = toDecimalString(
    new DomainDecimal(after).minus(new DomainDecimal(before)),
  );

  return {
    workspaceLineId: line.workspaceLineId,
    action,
    description: line.description,
    apuTemplateId: line.apuTemplateId,
    chapterId: isUpdate ? null : target.chapterId,
    boqItemId: line.boqItemId,
    quantityBefore: before,
    quantityAfter: after,
    difference,
    warnings,
    blocked,
  };
}

/** Resumen de un preview multi-línea. */
export interface SyncPreviewSummary {
  rows: SyncPreviewRow[];
  total: number;
  creates: number;
  updates: number;
  blockedCount: number;
  /** true si TODA la operación está bloqueada (versión emitida). */
  versionLocked: boolean;
}

export function summarizeSyncPreview(
  rows: SyncPreviewRow[],
  versionStatus: VersionStatus,
): SyncPreviewSummary {
  return {
    rows,
    total: rows.length,
    creates: rows.filter((r) => r.action === 'create' && !r.blocked).length,
    updates: rows.filter((r) => r.action === 'update' && !r.blocked).length,
    blockedCount: rows.filter((r) => r.blocked).length,
    versionLocked: !isEditableVersion(versionStatus),
  };
}
