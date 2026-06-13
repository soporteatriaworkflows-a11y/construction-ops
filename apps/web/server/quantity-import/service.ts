/**
 * service.ts — Servicio del importador de memorias de cantidades
 * (QUANTITY_TAKEOFF_IMPORT_V1, contrato §9). Propiedad: agent-orchestrator.
 *
 * Flujo de DOS pasos sin persistir el archivo (patrón importador APU 4B.2):
 *  - previewQuantityImport: parsea + matchea, NO escribe (digest SHA-256).
 *  - confirmQuantityImport: re-parsea, compara digest, re-matchea server-side
 *    y escribe UNA transacción atómica vía RPC (RLS-bound).
 *
 * Reglas:
 *  - organizationId / userId SIEMPRE server-side.
 *  - Solo roles management|internal; solo READ_MODEL_SOURCE=db.
 *  - boq_items NUNCA se modifica; el vínculo vive en quantity_takeoff_groups.
 *  - El importador JAMÁS toca APU, AIU, precios ni exports.
 */
import { parseReadModelSource } from '@/lib/supabase/env';
import { buildSanitizedCsv } from '@/lib/catalog-import/csv';
import type { Uuid } from '@/lib/utils/types';
import type {
  QuantityImportPreview,
  QuantityImportReportRow,
  QuantityImportResult,
  TakeoffLinkStatus,
  TakeoffLinkableVersion,
} from '@/lib/quantity-import/types';
import { InsufficientRoleError } from '@/server/pricing/errors';
import type { AuthenticatedViewer } from '@/server/auth/types';
import { assertQuantityImportFile, parseQuantityWorkbook } from './parse-workbook';
import { parseTakeoffSheet } from './parse-takeoff-sheet';
import { buildQuantityImportPreview } from './preview';
import {
  DbQuantityImportRepository,
  type QuantityBatchRpcPayload,
  type QuantityBatchRpcResult,
} from './db-repository';
import {
  QuantityImportDigestMismatchError,
  QuantityImportNotImportableError,
  QuantityImportNotSupportedError,
} from './errors';

const ALLOWED_ROLES = ['management', 'internal'] as const;

function checkRole(viewer: AuthenticatedViewer): void {
  if (!(ALLOWED_ROLES as readonly string[]).includes(viewer.role)) {
    throw new InsufficientRoleError('management|internal', viewer.role);
  }
}

function assertDbMode(): void {
  let source: string;
  try {
    source = parseReadModelSource(process.env.READ_MODEL_SOURCE);
  } catch {
    throw new QuantityImportNotSupportedError();
  }
  if (source !== 'db') throw new QuantityImportNotSupportedError();
}

export interface QuantityImportDeps {
  repository?: DbQuantityImportRepository;
}

function getRepo(deps?: QuantityImportDeps): DbQuantityImportRepository {
  return deps?.repository ?? new DbQuantityImportRepository();
}

/** Construye el preview completo (lecturas RLS-bound + ensamblado puro). */
async function buildFromFile(
  viewer: AuthenticatedViewer,
  file: File,
  linkVersionId: Uuid | null,
  repo: DbQuantityImportRepository,
): Promise<QuantityImportPreview> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const sheet = parseQuantityWorkbook(buffer, file.name);
  const parsed = parseTakeoffSheet(sheet.grid, sheet.lastRow);

  const boqCandidates = linkVersionId
    ? await repo.listBoqCandidates(viewer, linkVersionId)
    : null;

  return buildQuantityImportPreview({
    fileName: file.name,
    sheetName: sheet.sheetName,
    digest: sheet.digest,
    parsed,
    linkVersionId,
    boqCandidates,
  });
}

/** Paso A — preview sin escritura. */
export async function previewQuantityImport(
  viewer: AuthenticatedViewer,
  file: unknown,
  linkVersionId: Uuid | null,
  deps?: QuantityImportDeps,
): Promise<QuantityImportPreview> {
  checkRole(viewer);
  assertDbMode();
  assertQuantityImportFile(file);
  return buildFromFile(viewer, file, linkVersionId, getRepo(deps));
}

/** Versiones editables candidatas para el selector de vinculación BOQ. */
export async function listQuantityLinkableVersions(
  viewer: AuthenticatedViewer,
  deps?: QuantityImportDeps,
): Promise<TakeoffLinkableVersion[]> {
  checkRole(viewer);
  assertDbMode();
  return getRepo(deps).listLinkableVersions(viewer);
}

/** Opciones de confirmación (intención del cliente; todo se re-valida). */
export interface ConfirmQuantityImportOptions {
  linkVersionId: Uuid | null;
}

/** Paso B — confirmación atómica server-side (re-parse + digest + RPC). */
export async function confirmQuantityImport(
  viewer: AuthenticatedViewer,
  file: unknown,
  expectedDigest: string,
  options: ConfirmQuantityImportOptions,
  deps?: QuantityImportDeps,
): Promise<QuantityImportResult> {
  checkRole(viewer);
  assertDbMode();
  assertQuantityImportFile(file);
  const repo = getRepo(deps);

  const preview = await buildFromFile(viewer, file, options.linkVersionId, repo);

  if (!expectedDigest || preview.digest !== expectedDigest) {
    throw new QuantityImportDigestMismatchError();
  }
  if (!preview.importable) {
    throw new QuantityImportNotImportableError(
      preview.blockingErrors[0] ??
        'No hay grupos importables. Revisa los errores en la vista previa.',
    );
  }

  const payload: QuantityBatchRpcPayload = {
    batch: {
      digestSha256: preview.digest,
      sourceFilename: preview.fileName,
      sourceSheet: preview.sheetName,
      unresolvedCount:
        preview.totals.unresolved + preview.totals.ambiguous + preview.totals.suggested,
      warningCount: preview.totals.warnings,
      metadata: {
        kind: 'quantity_takeoff_import_v1',
        linkVersionId: options.linkVersionId,
        skippedNoLines: preview.totals.skippedNoLines,
        deductions: preview.totals.deductions,
        excelMismatches: preview.totals.excelMismatches,
      },
    },
    groups: preview.groups.map((group) => ({
      visibleCode: group.visibleCode,
      itemCode: group.itemCode,
      description: group.description,
      unit: group.unit,
      sourceRow: group.sourceRow,
      occurrenceIndex: group.occurrenceIndex,
      totalCalculated: group.totalCalculated,
      // Solo exactos no ambiguos decididos server-side; la RPC re-verifica
      // bajo transacción (versión, no archivado, sin takeoff previo).
      boqItemId: group.linkStatus === 'linked' ? group.boqItemId : null,
      metadata: {
        rawUnit: group.rawUnit,
        chapter: group.chapterLabel,
        excelTotal: group.excelTotal,
        totalFormula: group.totalFormulaText,
        linkStatus: group.linkStatus,
        boqItemCode: group.boqItemCode,
        warnings: group.warnings,
      },
      lines: group.lines.map((line, idx) => ({
        description: line.description,
        formulaType: line.formulaType,
        length: line.length,
        width: line.width,
        height: line.height,
        count: line.count,
        rawValues: {
          ...line.rawValues,
          deduction: line.deduction,
          excelSubtotal: line.excelSubtotal,
          formula: line.formulaText,
          warnings: line.warnings,
        },
        sourceRow: line.sourceRow,
        subtotalCalculated: line.subtotalCalculated,
        sortOrder: idx,
      })),
    })),
    versionId: options.linkVersionId,
  };

  const rpcResult = await repo.importBatch(viewer, payload);
  return buildResult(preview, rpcResult);
}

function buildResult(
  preview: QuantityImportPreview,
  rpc: QuantityBatchRpcResult,
): QuantityImportResult {
  const linkedRows = new Set(
    (rpc.linkedItems ?? []).map((l) => Number(l.groupSourceRow)),
  );

  const rows: QuantityImportReportRow[] = preview.groups.map((group) => {
    let linkStatus: TakeoffLinkStatus = group.linkStatus;
    if (!rpc.duplicate && group.linkStatus === 'linked' && !linkedRows.has(group.sourceRow)) {
      // Decidido vinculable pero la RPC no lo aplicó (carrera/guard) ⇒ skip.
      linkStatus = 'skipped_existing';
    }
    if (rpc.duplicate) linkStatus = 'not_evaluated';

    const messages: string[] = [];
    if (rpc.duplicate) {
      messages.push('Este workbook ya fue importado antes (mismo contenido); no se repite.');
    }
    for (const warning of group.warnings) messages.push(warning.message);

    return {
      groupKey: group.key,
      visibleCode: group.visibleCode,
      itemCode: group.itemCode,
      description: group.description,
      unit: group.unit,
      lines: group.lines.length,
      totalCalculated: group.totalCalculated,
      excelTotal: group.excelTotal,
      importStatus: rpc.duplicate ? 'omitted' : 'created',
      linkStatus,
      boqItemCode: group.boqItemCode,
      messages,
    };
  });

  return {
    duplicate: rpc.duplicate,
    batchId: rpc.batchId,
    groupsCreated: rpc.groupsCreated,
    linesCreated: rpc.linesCreated,
    linkedBoqItems: rpc.linkedBoqItems,
    unresolvedGroups:
      preview.totals.unresolved + preview.totals.ambiguous + preview.totals.suggested,
    rows,
    reportCsv: buildQuantityReportCsv(rows),
  };
}

const LINK_STATUS_LABELS: Record<TakeoffLinkStatus, string> = {
  linked: 'Vinculado al presupuesto',
  suggested: 'Sugerencia (no se vincula)',
  unresolved: 'Sin ítem coincidente',
  ambiguous: 'Ambiguo (no se vincula)',
  skipped_existing: 'Ítem ya vinculado (no se reemplaza)',
  not_evaluated: 'Sin evaluar',
};

/** Reporte CSV sanitizado (sin fórmulas ejecutables; ver lib/catalog-import). */
export function buildQuantityReportCsv(
  rows: ReadonlyArray<QuantityImportReportRow>,
): string {
  return buildSanitizedCsv(
    [
      'Código visible',
      'Ítem',
      'Ocurrencia',
      'Descripción',
      'Unidad',
      'Líneas',
      'Total calculado',
      'Total Excel',
      'Importación',
      'Vínculo BOQ',
      'Ítem BOQ',
      'Mensajes',
    ],
    rows.map((r) => [
      r.visibleCode ?? '',
      r.itemCode ?? '',
      r.groupKey.split('#')[1] ?? '1',
      r.description,
      r.unit ?? '',
      r.lines,
      r.totalCalculated,
      r.excelTotal ?? '',
      r.importStatus === 'created' ? 'Creado' : 'Omitido (duplicado)',
      LINK_STATUS_LABELS[r.linkStatus],
      r.boqItemCode ?? '',
      r.messages.join(' / '),
    ]),
  );
}
