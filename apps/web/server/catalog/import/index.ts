/**
 * index.ts — Servicio de importación masiva de catálogo y listas de precios
 * (CATALOG_BULK_ONBOARDING_V1, contrato §4–§6). Propiedad: agent-orchestrator.
 *
 * Flujo de DOS pasos sin persistir el archivo original (patrón 4C.1):
 *  - preview*: parsea + valida, NO escribe (digest SHA-256 de integridad).
 *  - confirm*: re-parsea, compara digest y escribe por lotes vía RLS.
 *
 * Reglas:
 *  - organizationId / created_by SIEMPRE server-side.
 *  - Solo roles management|internal; solo READ_MODEL_SOURCE=db.
 *  - Recursos existentes NUNCA se sobrescriben.
 *  - Observaciones SIEMPRE `pending`; jamás tocan BOQ/AIU/exports.
 */
import { parseReadModelSource } from '@/lib/supabase/env';
import { buildSanitizedCsv } from '@/lib/catalog-import/csv';
import {
  PRICE_LIST_FIELDS,
  type CatalogImportPreview,
  type CatalogImportResult,
  type CatalogImportRowReport,
  type ColumnAssignment,
  type PriceListPreview,
  type PriceListResult,
  type PriceListRowReport,
} from '@/lib/catalog-import/types';
import { InsufficientRoleError } from '@/server/pricing/errors';
import type { AuthenticatedViewer } from '../types';
import { assertCatalogImportFile, parseCatalogFile } from './parse-file';
import { resolveMapping } from './mapping';
import { buildCatalogImportPreview, type NormalizedCatalogRow } from './preview';
import { buildPriceListPreview } from './price-list';
import { DbCatalogImportRepository, type ObservationInsert } from './db-import-repository';
import {
  CatalogImportDigestMismatchError,
  CatalogImportNotImportableError,
  CatalogImportNotSupportedError,
  CatalogImportProviderNotFoundError,
} from './errors';

export {
  CatalogImportFileError,
  CatalogImportParseError,
  CatalogImportDigestMismatchError,
  CatalogImportNotImportableError,
  CatalogImportNotSupportedError,
  CatalogImportProviderNotFoundError,
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
    throw new CatalogImportNotSupportedError();
  }
  if (source !== 'db') throw new CatalogImportNotSupportedError();
}

interface ImportDeps {
  repository?: DbCatalogImportRepository;
}

function getRepo(deps?: ImportDeps): DbCatalogImportRepository {
  return deps?.repository ?? new DbCatalogImportRepository();
}

// ---------------------------------------------------------------------------
// A. Importación masiva de recursos
// ---------------------------------------------------------------------------

/** Paso A — preview sin escritura. */
export async function previewCatalogImport(
  viewer: AuthenticatedViewer,
  file: unknown,
  mappingInput: ColumnAssignment[] | null,
  deps?: ImportDeps,
): Promise<CatalogImportPreview> {
  checkRole(viewer);
  assertDbMode();
  assertCatalogImportFile(file);

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseCatalogFile(buffer, file.name);
  const mapping = resolveMapping(parsed.headers, mappingInput);

  const repo = getRepo(deps);
  const [identifiers, providers] = await Promise.all([
    repo.listResourceIdentifiers(viewer),
    repo.listActiveProviders(viewer),
  ]);
  const existingCodes = new Set(identifiers.map((r) => r.code));
  const providerNames = new Set(providers.map((p) => p.name.toLowerCase()));

  const { preview } = buildCatalogImportPreview(parsed, mapping, existingCodes, providerNames, file.name);
  return preview;
}

/** Paso B — confirmación batch server-side (re-parse + digest + RLS). */
export async function confirmCatalogImport(
  viewer: AuthenticatedViewer,
  file: unknown,
  mappingInput: ColumnAssignment[] | null,
  expectedDigest: string,
  deps?: ImportDeps,
): Promise<CatalogImportResult> {
  checkRole(viewer);
  assertDbMode();
  assertCatalogImportFile(file);

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseCatalogFile(buffer, file.name);
  if (!expectedDigest || parsed.digest !== expectedDigest) {
    throw new CatalogImportDigestMismatchError();
  }
  const mapping = resolveMapping(parsed.headers, mappingInput);

  const repo = getRepo(deps);
  const [identifiers, providers] = await Promise.all([
    repo.listResourceIdentifiers(viewer),
    repo.listActiveProviders(viewer),
  ]);
  const existingCodes = new Set(identifiers.map((r) => r.code));
  const providersByName = new Map(providers.map((p) => [p.name.toLowerCase(), p.id]));

  const { preview, importableRows, allReports } = buildCatalogImportPreview(
    parsed,
    mapping,
    existingCodes,
    new Set(providersByName.keys()),
    file.name,
  );
  if (!preview.importable) throw new CatalogImportNotImportableError();

  // ── Crear recursos nuevos (NUNCA sobrescribir) ─────────────────────────
  const { createdByCode, raceSkippedCodes } = await repo.createResourcesBatch(viewer, importableRows);

  const reportByRow = new Map(allReports.map((r) => [r.row, r]));
  for (const code of raceSkippedCodes) {
    const norm = importableRows.find((r) => r.code === code);
    const report = norm ? reportByRow.get(norm.row) : undefined;
    if (report) {
      report.status = 'skip_existing';
      report.priceStatus = 'none';
      report.messages.push('Otro proceso creó este código durante la importación. No se sobrescribe.');
    }
  }

  // ── Observaciones pending para los recursos creados ────────────────────
  const observations: ObservationInsert[] = [];
  const nowIso = new Date().toISOString();
  for (const rowNorm of importableRows) {
    if (!rowNorm.observation) continue;
    const resourceId = createdByCode.get(rowNorm.code);
    if (!resourceId) continue; // degradada a skip por carrera
    const obs = rowNorm.observation;
    const supplierId = obs.providerName
      ? (providersByName.get(obs.providerName.toLowerCase()) ?? null)
      : null;
    const noteParts: string[] = [];
    if (obs.notes) noteParts.push(obs.notes);
    if (obs.providerName && !supplierId) noteParts.push(`Proveedor (no asociado): ${obs.providerName}`);
    noteParts.push('Importación masiva de catálogo');
    observations.push({
      resourceId,
      supplierId,
      observedPrice: obs.observedPrice,
      discountPercent: obs.discountPercent,
      currency: obs.currency,
      unit: rowNorm.unit,
      sourceType: supplierId ? 'supplier_csv' : 'manual',
      sourceReference: obs.sourceUrl,
      observedAt: nowIso,
      validUntil: obs.validUntil,
      notes: noteParts.join(' | '),
    });
  }
  const observationsCreated = await repo.createObservationsBatch(viewer, observations);

  // ── Conteos finales + reporte CSV sanitizado ───────────────────────────
  let createdCount = 0;
  let skippedExistingCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;
  let observationsRejected = 0;
  for (const r of allReports) {
    if (r.status === 'new') createdCount++;
    else if (r.status === 'skip_existing') skippedExistingCount++;
    else if (r.status === 'duplicate_in_file') duplicateCount++;
    else invalidCount++;
    if (r.priceStatus === 'price_invalid') observationsRejected++;
  }

  return {
    createdCount,
    skippedExistingCount,
    duplicateCount,
    invalidCount,
    observationsCreated,
    observationsRejected,
    rows: allReports,
    reportCsv: buildCatalogReportCsv(allReports),
  };
}

const ROW_STATUS_LABELS: Record<CatalogImportRowReport['status'], string> = {
  new: 'Creado',
  skip_existing: 'Omitido (ya existe)',
  duplicate_in_file: 'Duplicado en el archivo',
  invalid: 'Inválido',
};

const PRICE_STATUS_LABELS: Record<CatalogImportRowReport['priceStatus'], string> = {
  none: '',
  pending_observation: 'Observación pendiente creada',
  price_invalid: 'Precio rechazado',
};

function buildCatalogReportCsv(rows: ReadonlyArray<CatalogImportRowReport>): string {
  return buildSanitizedCsv(
    ['Fila', 'Código', 'Nombre', 'Estado', 'Precio', 'Mensajes'],
    rows.map((r) => [
      r.row,
      r.code,
      r.name,
      ROW_STATUS_LABELS[r.status],
      PRICE_STATUS_LABELS[r.priceStatus],
      r.messages.join(' / '),
    ]),
  );
}

// ---------------------------------------------------------------------------
// B. Lista de precios de proveedor
// ---------------------------------------------------------------------------

/** Paso A — preview de lista de precios (sin escritura). */
export async function previewProviderPriceList(
  viewer: AuthenticatedViewer,
  providerId: string,
  file: unknown,
  mappingInput: ColumnAssignment[] | null,
  deps?: ImportDeps,
): Promise<PriceListPreview> {
  checkRole(viewer);
  assertDbMode();
  assertCatalogImportFile(file);

  const repo = getRepo(deps);
  const provider = await repo.getProviderById(viewer, providerId);
  if (!provider) throw new CatalogImportProviderNotFoundError();

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseCatalogFile(buffer, file.name);
  const mapping = resolveMapping(parsed.headers, mappingInput, PRICE_LIST_FIELDS);
  const identifiers = await repo.listResourceIdentifiers(viewer);

  const { preview } = buildPriceListPreview(parsed, mapping, identifiers, provider, file.name);
  return preview;
}

/** Paso B — confirma la lista: crea SOLO observaciones `pending` del proveedor. */
export async function confirmProviderPriceList(
  viewer: AuthenticatedViewer,
  providerId: string,
  file: unknown,
  mappingInput: ColumnAssignment[] | null,
  expectedDigest: string,
  deps?: ImportDeps,
): Promise<PriceListResult> {
  checkRole(viewer);
  assertDbMode();
  assertCatalogImportFile(file);

  const repo = getRepo(deps);
  const provider = await repo.getProviderById(viewer, providerId);
  if (!provider) throw new CatalogImportProviderNotFoundError();

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseCatalogFile(buffer, file.name);
  if (!expectedDigest || parsed.digest !== expectedDigest) {
    throw new CatalogImportDigestMismatchError();
  }
  const mapping = resolveMapping(parsed.headers, mappingInput, PRICE_LIST_FIELDS);
  const identifiers = await repo.listResourceIdentifiers(viewer);

  const { preview, matchedRows, allReports } = buildPriceListPreview(
    parsed,
    mapping,
    identifiers,
    provider,
    file.name,
  );
  if (!preview.importable) throw new CatalogImportNotImportableError();

  const nowIso = new Date().toISOString();
  const observations: ObservationInsert[] = matchedRows.map((m) => ({
    resourceId: m.resourceId,
    supplierId: provider.id,
    observedPrice: m.observedPrice,
    discountPercent: m.discountPercent,
    currency: m.currency,
    unit: m.unit,
    sourceType: 'supplier_csv',
    sourceReference: m.sourceUrl,
    observedAt: m.observedAt ?? nowIso,
    validUntil: m.validUntil,
    notes: m.notes
      ? `${m.notes} | Lista de precios: ${provider.name}`
      : `Lista de precios: ${provider.name}`,
  }));
  const observationsCreated = await repo.createObservationsBatch(viewer, observations);

  return {
    observationsCreated,
    unmatchedCount: preview.unmatchedCount,
    invalidCount: preview.invalidCount,
    rows: allReports,
    reportCsv: buildPriceListReportCsv(allReports),
  };
}

const MATCH_LABELS: Record<PriceListRowReport['matchType'], string> = {
  sku: 'SKU externo',
  reference: 'Referencia externa',
  code: 'Código',
  none: 'Sin asociar',
  ambiguous: 'Ambiguo',
};

const PL_STATUS_LABELS: Record<PriceListRowReport['status'], string> = {
  matched: 'Observación pendiente creada',
  unmatched: 'Sin asociar',
  invalid: 'Inválido',
};

function buildPriceListReportCsv(rows: ReadonlyArray<PriceListRowReport>): string {
  return buildSanitizedCsv(
    ['Fila', 'Identificador', 'Coincidencia', 'Recurso', 'Estado', 'Mensajes'],
    rows.map((r) => [
      r.row,
      r.identifier,
      MATCH_LABELS[r.matchType],
      r.resourceCode ? `${r.resourceCode} ${r.resourceName ?? ''}`.trim() : '',
      PL_STATUS_LABELS[r.status],
      r.messages.join(' / '),
    ]),
  );
}

export type { NormalizedCatalogRow };
export { parseCatalogFile, assertCatalogImportFile } from './parse-file';
export { resolveMapping, suggestMapping } from './mapping';
export { buildCatalogImportPreview } from './preview';
export { buildPriceListPreview } from './price-list';
export { DbCatalogImportRepository } from './db-import-repository';
