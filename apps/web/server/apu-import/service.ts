/**
 * service.ts — Servicio del importador APU (ENTRE_PATIOS_APU_IMPORT_V1 +
 * BOQ_APU_LINKING_V1, contrato §6–§8). Propiedad: agent-orchestrator.
 *
 * Flujo de DOS pasos sin persistir el archivo (patrón catálogo 4C.1):
 *  - previewApuImport: parsea + matchea, NO escribe (digest SHA-256).
 *  - confirmApuImport: re-parsea, compara digest, re-valida aceptes y escribe
 *    UNA transacción atómica vía RPC `import_apu_batch` (RLS-bound).
 *
 * Reglas:
 *  - organizationId / userId SIEMPRE server-side.
 *  - Solo roles management|internal; solo READ_MODEL_SOURCE=db.
 *  - Plantillas/recursos/roles existentes NUNCA se sobrescriben.
 *  - El importador JAMÁS aprueba precios ni toca BOQ qty/AIU/exports.
 */
import { parseReadModelSource } from '@/lib/supabase/env';
import { buildSanitizedCsv } from '@/lib/catalog-import/csv';
import type { Uuid } from '@/lib/utils/types';
import type {
  AcceptedSuggestion,
  ApuImportPreview,
  ApuImportReportRow,
  ApuImportResult,
  BoqLinkStatus,
  LinkableVersionOption,
} from '@/lib/apu-import/types';
import { InsufficientRoleError } from '@/server/pricing/errors';
import type { AuthenticatedViewer } from '@/server/auth/types';
import { assertApuImportFile, parseApuWorkbook } from './parse-workbook';
import { parseApuSheet, type RecognizedRole } from './parse-apu-sheet';
import {
  buildApuImportPreview,
  type ApuPreviewBuild,
  type BoqCandidateItem,
} from './preview';
import {
  DbApuImportRepository,
  type ApuBatchRpcPayload,
  type ApuBatchRpcResult,
} from './db-repository';
import {
  ApuImportDigestMismatchError,
  ApuImportNotImportableError,
  ApuImportNotSupportedError,
} from './errors';

const ALLOWED_ROLES = ['management', 'internal'] as const;
const ROLE_CODE_BASE: Record<RecognizedRole, string> = {
  oficial: 'S-OFICIAL',
  ayudante: 'S-AYUDANTE',
};
const ROLE_NAME: Record<RecognizedRole, string> = {
  oficial: 'Oficial',
  ayudante: 'Ayudante',
};

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
    throw new ApuImportNotSupportedError();
  }
  if (source !== 'db') throw new ApuImportNotSupportedError();
}

export interface ApuImportDeps {
  repository?: DbApuImportRepository;
}

function getRepo(deps?: ApuImportDeps): DbApuImportRepository {
  return deps?.repository ?? new DbApuImportRepository();
}

/** Construye el preview completo (lecturas RLS-bound + ensamblado puro). */
async function buildFromFile(
  viewer: AuthenticatedViewer,
  file: File,
  linkVersionId: Uuid | null,
  repo: DbApuImportRepository,
  acceptedSuggestions: ReadonlyArray<AcceptedSuggestion> | undefined,
  strict: boolean,
): Promise<ApuPreviewBuild> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const sheet = parseApuWorkbook(buffer, file.name);
  const parsed = parseApuSheet(sheet.grid, sheet.lastRow);

  const [identifiers, laborRoles, existingApuCodes] = await Promise.all([
    repo.listResourceIdentifiers(viewer),
    repo.listLaborRoles(viewer),
    repo.listExistingApuCodes(viewer),
  ]);
  const boqCandidates: BoqCandidateItem[] | null = linkVersionId
    ? await repo.listBoqCandidates(viewer, linkVersionId)
    : null;

  // Pase 1 (sin baselines) para descubrir los recursos asociados/sugeridos.
  const first = buildApuImportPreview({
    fileName: file.name,
    sheetName: sheet.sheetName,
    digest: sheet.digest,
    parsed,
    identifiers,
    existingLaborRoles: laborRoles,
    existingApuCodes,
    baselinePrices: new Map(),
    linkVersionId,
    boqCandidates,
    acceptedSuggestions,
    strictAcceptedSuggestions: strict,
  });

  const resourceIds = new Set<Uuid>();
  for (const activity of first.preview.activities) {
    for (const component of activity.components) {
      if (component.resourceId) resourceIds.add(component.resourceId);
    }
  }
  if (resourceIds.size === 0) return first;

  const baselinePrices = await repo.getApprovedBaselinePrices(viewer, [...resourceIds]);
  if (baselinePrices.size === 0) return first;

  return buildApuImportPreview({
    fileName: file.name,
    sheetName: sheet.sheetName,
    digest: sheet.digest,
    parsed,
    identifiers,
    existingLaborRoles: laborRoles,
    existingApuCodes,
    baselinePrices,
    linkVersionId,
    boqCandidates,
    acceptedSuggestions,
    strictAcceptedSuggestions: strict,
  });
}

/** Paso A — preview sin escritura. */
export async function previewApuImport(
  viewer: AuthenticatedViewer,
  file: unknown,
  linkVersionId: Uuid | null,
  deps?: ApuImportDeps,
): Promise<ApuImportPreview> {
  checkRole(viewer);
  assertDbMode();
  assertApuImportFile(file);
  const repo = getRepo(deps);
  const build = await buildFromFile(viewer, file, linkVersionId, repo, undefined, false);
  return build.preview;
}

/** Versiones editables candidatas para el selector de vinculación BOQ. */
export async function listApuLinkableVersions(
  viewer: AuthenticatedViewer,
  deps?: ApuImportDeps,
): Promise<LinkableVersionOption[]> {
  checkRole(viewer);
  assertDbMode();
  return getRepo(deps).listLinkableVersions(viewer);
}

/** Opciones de confirmación (intención del cliente; todo se re-valida). */
export interface ConfirmApuImportOptions {
  linkVersionId: Uuid | null;
  acceptedSuggestions: AcceptedSuggestion[];
}

/** Paso B — confirmación atómica server-side (re-parse + digest + RPC). */
export async function confirmApuImport(
  viewer: AuthenticatedViewer,
  file: unknown,
  expectedDigest: string,
  options: ConfirmApuImportOptions,
  deps?: ApuImportDeps,
): Promise<ApuImportResult> {
  checkRole(viewer);
  assertDbMode();
  assertApuImportFile(file);
  const repo = getRepo(deps);

  const build = await buildFromFile(
    viewer,
    file,
    options.linkVersionId,
    repo,
    options.acceptedSuggestions,
    true,
  );
  const { preview, laborResolutions, plans } = build;

  if (!expectedDigest || preview.digest !== expectedDigest) {
    throw new ApuImportDigestMismatchError();
  }
  if (!preview.importable) {
    throw new ApuImportNotImportableError(
      preview.blockingErrors[0] ??
        'No hay actividades importables. Revisa los errores en la vista previa.',
    );
  }

  // Roles laborales: reuso de existentes; creación de faltantes derivados de
  // la hoja (JAMÁS update). Solo los roles realmente usados por planes create.
  const neededRoles = new Set<RecognizedRole>();
  for (const plan of plans) {
    if (plan.action !== 'create') continue;
    for (const component of plan.components) {
      if (component.laborRole) neededRoles.add(component.laborRole);
    }
  }
  const roleIds = new Map<RecognizedRole, Uuid>();
  for (const role of neededRoles) {
    const resolution = laborResolutions.get(role);
    if (!resolution) continue;
    if (resolution.laborRoleId) {
      roleIds.set(role, resolution.laborRoleId);
    } else if (resolution.action === 'create' && resolution.factorsForCreate) {
      const id = await repo.createLaborRole(viewer, {
        codeBase: ROLE_CODE_BASE[role],
        name: ROLE_NAME[role],
        factors: resolution.factorsForCreate,
      });
      roleIds.set(role, id);
    }
  }

  // Payload de la RPC: actividades create + skip (la RPC re-verifica skips
  // bajo transacción); links solo exactos no ambiguos decididos server-side.
  const payload: ApuBatchRpcPayload = {
    batch: {
      digestSha256: preview.digest,
      sourceFilename: preview.fileName,
      sourceSheet: preview.sheetName,
      totalActivities: preview.totals.activities,
      totalComponents: preview.totals.components,
      unresolvedCount: preview.totals.unresolved + preview.totals.ambiguous,
      warningCount: preview.totals.warnings,
      metadata: {
        kind: 'entre_patios_apu_import_v1',
        omittedActivities: preview.totals.omitted,
        suggestedAccepted: options.acceptedSuggestions.length,
        linkVersionId: options.linkVersionId,
      },
    },
    templates: plans
      .filter((p) => p.action !== 'omit')
      .map((p) => ({
        code: p.persistedCode,
        name: p.name,
        unit: p.unit,
        description: null,
        defaultToolPct: p.defaultToolPct,
        sourceRow: p.sourceRow,
        sourceOccurrenceIndex: p.sourceOccurrenceIndex,
        components: p.components.map((c) => ({
          componentType: c.componentType,
          resourceId: c.resourceId,
          laborRoleId: c.laborRole ? (roleIds.get(c.laborRole) ?? null) : null,
          quantity: c.quantity,
          wastePct: c.wastePct,
          unitPriceSource: c.unitPriceSource,
          unitPriceSnapshot: c.unitPriceSnapshot,
          sortOrder: c.sortOrder,
          notes: c.notes,
          sourceRow: c.sourceRow,
          sourceOccurrenceIndex: c.sourceOccurrenceIndex,
          rawCode: c.rawCode,
          rawUnit: c.rawUnit,
        })),
      })),
    versionId: options.linkVersionId,
    links: plans
      .filter((p) => p.action !== 'omit' && p.linkBoqItemId !== null)
      .map((p) => ({ templateCode: p.persistedCode, boqItemId: p.linkBoqItemId as Uuid })),
  };

  // Invariante de dominio (4B.1 §4): flujos nuevos no crean componentes labor
  // sin labor_role_id resuelto.
  for (const template of payload.templates) {
    for (const component of template.components) {
      if (component.unitPriceSource === 'labor_role' && !component.laborRoleId) {
        throw new ApuImportNotImportableError(
          `No se pudo resolver el rol salarial de un componente de mano de obra (${template.code}).`,
        );
      }
    }
  }

  const rpcResult = await repo.importBatch(viewer, payload);
  return buildResult(preview, rpcResult);
}

function buildResult(preview: ApuImportPreview, rpc: ApuBatchRpcResult): ApuImportResult {
  const skippedCodes = new Set(rpc.skippedCodes ?? []);
  const linkedByCode = new Map(
    (rpc.linkedItems ?? []).map((l) => [l.templateCode, l.boqItemId]),
  );

  const rows: ApuImportReportRow[] = preview.activities.map((activity) => {
    let importStatus: ApuImportReportRow['importStatus'];
    if (rpc.duplicate || activity.importAction === 'omit') {
      importStatus = 'omitted';
    } else if (skippedCodes.has(activity.persistedCode) || activity.importAction === 'skip_existing') {
      importStatus = 'skipped_existing';
    } else {
      importStatus = 'created';
    }

    let linkStatus: BoqLinkStatus = activity.boqLink.status;
    if (!rpc.duplicate && linkedByCode.has(activity.persistedCode)) {
      linkStatus = 'linked';
    } else if (linkStatus === 'linkable') {
      // Decidido vinculable pero la RPC no lo aplicó (carrera/guard) ⇒ skip.
      linkStatus = rpc.duplicate ? 'not_evaluated' : 'skipped_existing';
    }

    const messages: string[] = [];
    if (rpc.duplicate) {
      messages.push('Este workbook ya fue importado antes (mismo contenido); no se repite.');
    }
    if (activity.errors.length > 0) messages.push(...activity.errors);
    if (activity.unresolvedCount + activity.ambiguousCount > 0) {
      messages.push(
        `${activity.unresolvedCount + activity.ambiguousCount} componente(s) quedaron sin asociar al catálogo.`,
      );
    }

    return {
      activityKey: activity.key,
      visibleCode: activity.visibleCode,
      persistedCode: activity.persistedCode,
      description: activity.description,
      unit: activity.rawUnit,
      importStatus,
      componentsImported: importStatus === 'created' ? activity.componentCount : 0,
      componentsUnresolved: activity.unresolvedCount + activity.ambiguousCount,
      linkStatus,
      boqItemCode: activity.boqLink.boqItemCode,
      messages,
    };
  });

  return {
    duplicate: rpc.duplicate,
    batchId: rpc.batchId,
    importedActivities: rpc.importedActivities,
    importedComponents: rpc.importedComponents,
    skippedExisting: rpc.skippedExisting,
    linkedBoqItems: rpc.linkedBoqItems,
    unresolvedComponents: preview.totals.unresolved + preview.totals.ambiguous,
    rows,
    reportCsv: buildApuReportCsv(rows),
  };
}

const IMPORT_STATUS_LABELS: Record<ApuImportReportRow['importStatus'], string> = {
  created: 'Creada',
  skipped_existing: 'Omitida (ya existe)',
  omitted: 'Omitida (errores)',
};

const LINK_STATUS_LABELS: Record<BoqLinkStatus, string> = {
  linked: 'Vinculada al presupuesto',
  linkable: 'Vinculable',
  unresolved: 'Sin ítem coincidente',
  ambiguous: 'Ambigua (no se vincula)',
  skipped_existing: 'Ítem ya vinculado (no se reemplaza)',
  not_evaluated: 'Sin evaluar',
};

/** Reporte CSV sanitizado (sin fórmulas ejecutables; ver lib/catalog-import). */
export function buildApuReportCsv(rows: ReadonlyArray<ApuImportReportRow>): string {
  return buildSanitizedCsv(
    [
      'Código',
      'Ocurrencia',
      'Código guardado',
      'Descripción',
      'Unidad',
      'Importación',
      'Componentes importados',
      'Componentes sin asociar',
      'Vínculo BOQ',
      'Ítem BOQ',
      'Mensajes',
    ],
    rows.map((r) => [
      r.visibleCode,
      r.activityKey.split('#')[1] ?? '1',
      r.persistedCode,
      r.description,
      r.unit,
      IMPORT_STATUS_LABELS[r.importStatus],
      r.componentsImported,
      r.componentsUnresolved,
      LINK_STATUS_LABELS[r.linkStatus],
      r.boqItemCode ?? '',
      r.messages.join(' / '),
    ]),
  );
}
