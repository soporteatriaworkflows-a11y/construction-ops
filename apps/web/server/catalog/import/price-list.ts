/**
 * price-list.ts — Matching y preview de la importación de lista de precios de
 * proveedor (CATALOG_BULK_ONBOARDING_V1, contrato §6). Lógica PURA: sin DB.
 *
 * Matching V1 (primera coincidencia gana):
 *  1. externalSku exacto   → resources.external_sku
 *  2. externalReference    → resources.external_reference
 *  3. code exacto          → resources.code
 *  4. sin match            → "Sin asociar" (no se crea recurso ni observación)
 *
 * Coincidencia ambigua (≥2 recursos con el mismo identificador) ⇒ fila
 * "Sin asociar" con motivo explícito: NUNCA se resuelve en silencio.
 *
 * Cada precio importado crea una observación `pending`. Nunca `approved`.
 * Nunca modifica BOQ, AIU ni exports.
 */
import Decimal from 'decimal.js';
import {
  CATALOG_IMPORT_LIMITS,
  PRICE_LIST_FIELDS,
  type ColumnAssignment,
  type PriceListPreview,
  type PriceListRowReport,
} from '@/lib/catalog-import/types';
import { makeFieldGetter, parseCellDate, parsePositiveDecimal } from './mapping';
import type { ParsedCatalogSheet } from './parse-file';

/** Identidad mínima de un recurso existente para matching (server-side). */
export interface ResourceIdentifier {
  id: string;
  code: string;
  name: string;
  unit: string;
  externalSku: string | null;
  externalReference: string | null;
}

/** Observación normalizada lista para insertar (server-only). */
export interface NormalizedPriceListRow {
  row: number;
  resourceId: string;
  resourceCode: string;
  resourceUnit: string;
  observedPrice: string;
  discountPercent: string;
  currency: string;
  unit: string;
  sourceUrl: string | null;
  observedAt: string | null;
  validUntil: string | null;
  notes: string | null;
}

export interface PriceListPreviewBuild {
  preview: PriceListPreview;
  matchedRows: NormalizedPriceListRow[];
  allReports: PriceListRowReport[];
}

interface MatchIndex {
  bySku: Map<string, ResourceIdentifier[]>;
  byReference: Map<string, ResourceIdentifier[]>;
  byCode: Map<string, ResourceIdentifier[]>;
}

function buildMatchIndex(resources: ReadonlyArray<ResourceIdentifier>): MatchIndex {
  const bySku = new Map<string, ResourceIdentifier[]>();
  const byReference = new Map<string, ResourceIdentifier[]>();
  const byCode = new Map<string, ResourceIdentifier[]>();
  const push = (m: Map<string, ResourceIdentifier[]>, k: string, r: ResourceIdentifier) => {
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  };
  for (const r of resources) {
    if (r.externalSku) push(bySku, r.externalSku, r);
    if (r.externalReference) push(byReference, r.externalReference, r);
    push(byCode, r.code, r);
  }
  return { bySku, byReference, byCode };
}

export function buildPriceListPreview(
  parsed: ParsedCatalogSheet,
  mapping: ColumnAssignment[],
  resources: ReadonlyArray<ResourceIdentifier>,
  provider: { id: string; name: string },
  fileName: string,
): PriceListPreviewBuild {
  const get = makeFieldGetter(mapping);
  const errors: string[] = [];
  const warnings: string[] = [];

  const mapped = new Set(mapping.filter((a) => a.columnIndex !== null).map((a) => a.field));
  if (!mapped.has('observedPrice')) {
    errors.push('Falta asignar una columna al campo obligatorio "observedPrice".');
  }
  if (!mapped.has('externalSku') && !mapped.has('externalReference') && !mapped.has('code')) {
    errors.push(
      'Asigna al menos una columna identificadora: SKU externo, referencia externa o código.',
    );
  }

  const index = buildMatchIndex(resources);
  const reports: PriceListRowReport[] = [];
  const matchedRows: NormalizedPriceListRow[] = [];

  let matchedCount = 0;
  let unmatchedCount = 0;
  let invalidCount = 0;

  if (errors.length === 0) {
    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i]!;
      const rowNumber = parsed.rowNumbers[i]!;
      const messages: string[] = [];

      const sku = get(row, 'externalSku');
      const reference = get(row, 'externalReference');
      const code = get(row, 'code');
      const identifier = sku || reference || code || null;

      // ── Matching en orden estricto ───────────────────────────────────────
      let matchType: PriceListRowReport['matchType'] = 'none';
      let candidates: ResourceIdentifier[] = [];
      if (sku && index.bySku.has(sku)) {
        matchType = 'sku';
        candidates = index.bySku.get(sku)!;
      } else if (reference && index.byReference.has(reference)) {
        matchType = 'reference';
        candidates = index.byReference.get(reference)!;
      } else if (code && index.byCode.has(code)) {
        matchType = 'code';
        candidates = index.byCode.get(code)!;
      }

      if (candidates.length > 1) {
        matchType = 'ambiguous';
        messages.push(
          `Coincidencia ambigua: ${candidates.length} recursos comparten el identificador. Requiere revisión humana.`,
        );
      }

      const resource = candidates.length === 1 ? candidates[0]! : null;

      // ── Validación del precio ───────────────────────────────────────────
      const rawPrice = get(row, 'observedPrice');
      const observedPrice = rawPrice ? parsePositiveDecimal(rawPrice) : null;
      const priceIssues: string[] = [];
      if (!observedPrice) {
        priceIssues.push(rawPrice ? `Precio inválido: "${rawPrice.slice(0, 30)}".` : 'Precio vacío.');
      }

      const rawDiscount = get(row, 'discountPercent');
      let discountPercent = '0';
      if (rawDiscount) {
        const d = parsePositiveDecimal(rawDiscount);
        if (!d || new Decimal(d).gt(100)) {
          priceIssues.push(`Descuento inválido (0–100): "${rawDiscount.slice(0, 30)}".`);
        } else {
          discountPercent = d;
        }
      }

      let currency = (get(row, 'currency') || 'COP').toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) {
        priceIssues.push(`Moneda inválida: "${get(row, 'currency').slice(0, 10)}".`);
        currency = 'COP';
      }

      // ── Clasificación de la fila ────────────────────────────────────────
      let status: PriceListRowReport['status'];
      if (priceIssues.length > 0) {
        status = 'invalid';
        invalidCount++;
        messages.push(...priceIssues);
      } else if (!resource) {
        status = 'unmatched';
        unmatchedCount++;
        if (matchType !== 'ambiguous') {
          messages.push('Sin asociar: ningún recurso coincide. No se crea recurso automáticamente.');
        }
      } else {
        status = 'matched';
        matchedCount++;

        const rawObservedAt = get(row, 'observedAt');
        const observedAt = rawObservedAt ? parseCellDate(rawObservedAt) : null;
        if (rawObservedAt && !observedAt) {
          messages.push(`Fecha de observación no interpretable: "${rawObservedAt.slice(0, 20)}" (se usa la fecha actual).`);
        }
        const rawValidUntil = get(row, 'validUntil');
        const validUntil = rawValidUntil ? parseCellDate(rawValidUntil) : null;
        if (rawValidUntil && !validUntil) {
          messages.push(`Fecha "válido hasta" no interpretable: "${rawValidUntil.slice(0, 20)}" (se omite).`);
        }

        const fileUnit = get(row, 'unit');
        if (fileUnit && fileUnit.toLowerCase() !== resource.unit.toLowerCase()) {
          messages.push(
            `Unidad del archivo ("${fileUnit}") difiere de la del recurso ("${resource.unit}"). Se conserva la del archivo en la observación.`,
          );
        }

        matchedRows.push({
          row: rowNumber,
          resourceId: resource.id,
          resourceCode: resource.code,
          resourceUnit: resource.unit,
          observedPrice: observedPrice!,
          discountPercent,
          currency,
          unit: (fileUnit || resource.unit).slice(0, CATALOG_IMPORT_LIMITS.maxUnitLen),
          sourceUrl: get(row, 'sourceUrl') || null,
          observedAt,
          validUntil,
          notes: get(row, 'notes') || null,
        });
      }

      reports.push({
        row: rowNumber,
        identifier,
        matchType,
        resourceCode: resource?.code ?? null,
        resourceName: resource?.name ?? null,
        status,
        messages,
      });
    }
  }

  if (parsed.rows.length === 0) errors.push('El archivo no contiene filas de datos.');
  if (parsed.omittedEmptyRows > 0) {
    warnings.push(`${parsed.omittedEmptyRows} fila(s) vacía(s) omitida(s).`);
  }

  const sample = reports.slice(0, CATALOG_IMPORT_LIMITS.previewSampleRows);
  const preview: PriceListPreview = {
    fileName,
    sheet: parsed.sheetName,
    providerId: provider.id,
    providerName: provider.name,
    headers: parsed.headers,
    mapping,
    totalRows: parsed.rows.length,
    matchedCount,
    unmatchedCount,
    invalidCount,
    omittedCount: parsed.omittedEmptyRows,
    rows: sample,
    rowsTruncated: reports.length > sample.length,
    errors,
    warnings,
    importable: errors.length === 0 && matchedCount > 0,
    digest: parsed.digest,
  };

  return { preview, matchedRows, allReports: reports };
}

export { PRICE_LIST_FIELDS };
