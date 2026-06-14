/**
 * service.ts — Servicio del Quantity Workspace + sync seguro a BOQ.
 *
 * Propiedad: agent-cost-domain. Orquesta dominio puro + repositorio RLS-bound.
 * Contrato: docs/QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1_CONTRACT.md §2-§4.
 */
import type { AuthenticatedViewer } from '@/server/auth/types';
import type { DecimalString, Uuid } from '@/lib/utils/types';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import { InsufficientRoleError } from '@/server/pricing/errors';
import {
  QuantityWorkspaceValidationError,
  QuantityWorkspaceWriteNotSupportedError,
} from './errors';
import {
  DbQuantityWorkspaceRepository,
  type WorkspaceGroupDraft,
  type WorkspaceLineDraft,
} from './db-repository';
import { computeQuantityLine } from './formula';
import { buildMixedWallLines, type MixedWallInput } from './templates';
import {
  buildBoqSyncPreview,
  summarizeSyncPreview,
  type SyncLineInput,
  type SyncPreviewSummary,
  type VersionStatus,
} from './sync';

const ALLOWED_ROLES = ['management', 'internal'] as const;

function checkRole(viewer: AuthenticatedViewer): void {
  if (!(ALLOWED_ROLES as readonly string[]).includes(viewer.role)) {
    throw new InsufficientRoleError('management|internal', viewer.role);
  }
}

/** Valida un draft de grupo. Lanza si algo es inválido (no persiste nada). */
function validateDraft(draft: WorkspaceGroupDraft): void {
  if (!draft.projectScopeId) throw new QuantityWorkspaceValidationError('Selecciona un alcance/piso');
  if (!draft.code.trim()) throw new QuantityWorkspaceValidationError('El código del grupo es obligatorio');
  if (!draft.name.trim()) throw new QuantityWorkspaceValidationError('El nombre del grupo es obligatorio');
  if (!draft.resultUnit.trim()) throw new QuantityWorkspaceValidationError('La unidad de resultado es obligatoria');
  if (draft.lines.length === 0) throw new QuantityWorkspaceValidationError('Agrega al menos una línea de cálculo');
  // Recalcula cada línea: el motor puro lanza QuantityFormulaError si es inválida.
  for (const l of draft.lines) {
    computeQuantityLine({
      formulaType: l.formulaType,
      length: l.length,
      width: l.width,
      height: l.height,
      thickness: l.thickness,
      count: l.count,
      partialHeight: l.partialHeight,
      openingDeduction: l.openingDeduction,
      wastePct: l.wastePct,
    });
  }
}

/** Crea un grupo de cantidades manual (validación + cálculo server-side). */
export async function createWorkspaceGroup(
  viewer: AuthenticatedViewer,
  draft: WorkspaceGroupDraft,
  repo: DbQuantityWorkspaceRepository = new DbQuantityWorkspaceRepository(),
): Promise<{ groupId: Uuid; totalNet: DecimalString; lineCount: number }> {
  checkRole(viewer);
  if (!isCreationModeEnabled()) throw new QuantityWorkspaceWriteNotSupportedError();
  validateDraft(draft);
  return repo.createGroup(viewer, draft);
}

/** Convierte inputs de muro mixto en líneas de draft (plantilla §3). */
export function mixedWallToLineDrafts(
  input: MixedWallInput,
  apuByKey?: Partial<Record<'substrate' | 'tile' | 'profile' | 'paint', Uuid>>,
): WorkspaceLineDraft[] {
  return buildMixedWallLines(input).map((p) => ({
    description: p.description,
    resultUnit: p.resultUnit,
    formulaType: p.formulaType,
    length: p.length ?? null,
    height: p.height ?? null,
    partialHeight: p.partialHeight ?? null,
    openingDeduction: p.openingDeduction ?? null,
    wastePct: p.wastePct ?? null,
    apuTemplateId: apuByKey?.[p.key] ?? null,
  }));
}

export interface SyncPreviewParams {
  versionId: Uuid;
  versionStatus: VersionStatus;
  chapterId: Uuid | null;
  lines: SyncLineInput[];
}

/**
 * Construye el preview de sync para un conjunto de líneas (read-only).
 * Carga snapshots de ítems BOQ vinculados para mostrar antes/después.
 */
export async function buildSyncPreview(
  viewer: AuthenticatedViewer,
  params: SyncPreviewParams,
  repo: DbQuantityWorkspaceRepository = new DbQuantityWorkspaceRepository(),
): Promise<SyncPreviewSummary> {
  checkRole(viewer);
  const linkedIds = params.lines
    .map((l) => l.boqItemId)
    .filter((x): x is Uuid => Boolean(x));
  const snapshots = await repo.boqItemSnapshots(viewer, linkedIds);
  const rows = params.lines.map((line) =>
    buildBoqSyncPreview(line, {
      versionStatus: params.versionStatus,
      chapterId: params.chapterId,
      existing: line.boqItemId
        ? snapshots.has(line.boqItemId)
          ? { quantitySnapshot: snapshots.get(line.boqItemId)! }
          : null
        : null,
    }),
  );
  return summarizeSyncPreview(rows, params.versionStatus);
}

export {
  DbQuantityWorkspaceRepository,
  type WorkspaceGroupDraft,
  type WorkspaceLineDraft,
};
