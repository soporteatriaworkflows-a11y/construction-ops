/**
 * boq-add.ts — Agregar una actividad APU existente al BOQ de un presupuesto
 * editable (BOQ_ADD_FROM_APU_V1).
 *
 * Contrato: docs/APU_MANUAL_BUILDER_AND_BOQ_ADD_V1_CONTRACT.md §4.
 *
 *  - Solo versión EDITABLE; issued/approved/archived ⇒ bloqueado (RPC + RLS).
 *  - organizationId / actor server-side; rol management|internal.
 *  - El costo unitario es un SNAPSHOT inicial calculado server-side dentro del
 *    RPC (no se confía del navegador). Cambios futuros del APU no mutan ítems.
 *  - Idempotente + auditado (apu_manual_actions).
 */
import type { AuthenticatedViewer } from '@/server/auth/types';
import type { DecimalString, Uuid } from '@/lib/utils/types';
import { getReadModel } from '@/server/read-model';
import { toViewerContext } from '@/server/auth/resolve-viewer';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import { InsufficientRoleError } from '@/server/pricing/errors';
import { ApuBuilderValidationError, ApuBuilderWriteNotSupportedError } from './errors';
import { DbApuBuilderRepository } from './db-repository';
import { toDecimal } from '@/modules/apu/decimal';

const ALLOWED_ROLES = ['management', 'internal'] as const;

function checkRole(viewer: AuthenticatedViewer): void {
  if (!(ALLOWED_ROLES as readonly string[]).includes(viewer.role)) {
    throw new InsufficientRoleError('management|internal', viewer.role);
  }
}

/** Opción de APU activa para el selector de BOQ-add. */
export interface ApuAddOption {
  id: Uuid;
  code: string;
  name: string;
  unit: string;
  unitCost: DecimalString;
  componentCount: number;
}

/** Lista las plantillas APU ACTIVAS de la organización con su costo unitario. */
export async function listApusForBoqAdd(
  viewer: AuthenticatedViewer,
  repo: DbApuBuilderRepository = new DbApuBuilderRepository(),
): Promise<ApuAddOption[]> {
  const [apus, activeIds] = await Promise.all([
    getReadModel().listApus(toViewerContext(viewer)),
    repo.listActiveApuIds(viewer),
  ]);
  return apus
    .filter((a) => activeIds.has(a.id))
    .map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      unit: a.unit,
      unitCost: a.unitCost,
      componentCount: a.componentCount,
    }));
}

export interface AddApuToBoqResult {
  boqItemId: Uuid;
  unitPrice: DecimalString;
  subtotal: DecimalString;
  status: string;
}

/** Agrega un APU al BOQ de una versión editable (RPC atómica server-side). */
export async function addApuToBoq(
  viewer: AuthenticatedViewer,
  params: {
    estimateVersionId: Uuid;
    chapterId: Uuid;
    apuTemplateId: Uuid;
    quantity: DecimalString;
    idempotencyKey?: string;
  },
  repo: DbApuBuilderRepository = new DbApuBuilderRepository(),
): Promise<AddApuToBoqResult> {
  checkRole(viewer);
  if (!isCreationModeEnabled()) throw new ApuBuilderWriteNotSupportedError();

  if (!params.estimateVersionId) throw new ApuBuilderValidationError('Falta la versión del presupuesto');
  if (!params.chapterId) throw new ApuBuilderValidationError('Selecciona un capítulo');
  if (!params.apuTemplateId) throw new ApuBuilderValidationError('Selecciona un APU');

  let qty;
  try {
    qty = toDecimal(params.quantity);
  } catch {
    throw new ApuBuilderValidationError('Cantidad inválida');
  }
  if (qty.isNaN() || qty.isNegative()) {
    throw new ApuBuilderValidationError('La cantidad debe ser un número no negativo');
  }

  return repo.addApuToBoq(viewer, {
    estimateVersionId: params.estimateVersionId,
    chapterId: params.chapterId,
    apuTemplateId: params.apuTemplateId,
    quantity: qty.toFixed(),
    idempotencyKey: params.idempotencyKey,
  });
}
