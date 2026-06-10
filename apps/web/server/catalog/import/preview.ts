/**
 * preview.ts — Validación, deduplicación y preview de la importación masiva
 * de recursos (CATALOG_BULK_ONBOARDING_V1, contrato §4). Lógica PURA: sin DB.
 *
 * Reglas estrictas:
 *  - NO se sobrescriben recursos existentes: código existente ⇒ skip + reporte.
 *  - Duplicado dentro del archivo ⇒ primera ocurrencia válida, repeticiones skip.
 *  - Fila inválida ⇒ no se importa (reportada).
 *  - Precio válido ⇒ observación pending a crear; precio inválido ⇒ el recurso
 *    puede importarse, la observación se rechaza y se reporta.
 */
import Decimal from 'decimal.js';
import {
  CATALOG_IMPORT_LIMITS,
  CATALOG_REQUIRED_FIELDS,
  type CatalogImportPreview,
  type CatalogImportRowReport,
  type ColumnAssignment,
} from '@/lib/catalog-import/types';
import {
  isKnownUnit,
  makeFieldGetter,
  normalizeResourceType,
  parseCellDate,
  parsePositiveDecimal,
} from './mapping';
import type { ParsedCatalogSheet } from './parse-file';
import type { ResourceType } from '../types';

const CODE_PATTERN = /^[A-Za-z0-9._-]+$/;

/** Observación de precio pendiente asociada a una fila importable. */
export interface NormalizedRowObservation {
  observedPrice: string;
  discountPercent: string;
  currency: string;
  sourceUrl: string | null;
  validUntil: string | null;
  notes: string | null;
  providerName: string | null;
}

/** Fila normalizada lista para el batch (server-only). */
export interface NormalizedCatalogRow {
  row: number;
  code: string;
  name: string;
  resourceType: ResourceType;
  unit: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  externalReference: string | null;
  externalSku: string | null;
  defaultWastePct: string;
  observation: NormalizedRowObservation | null;
}

export interface CatalogPreviewBuild {
  preview: CatalogImportPreview;
  /** SOLO filas `new` (importables), en orden del archivo. */
  importableRows: NormalizedCatalogRow[];
  /** Reportes completos de TODAS las filas (para el resultado/CSV). */
  allReports: CatalogImportRowReport[];
}

/**
 * Construye el preview completo. `existingCodes` debe llegar del servidor
 * (consulta RLS-bound por organización), nunca del navegador.
 */
export function buildCatalogImportPreview(
  parsed: ParsedCatalogSheet,
  mapping: ColumnAssignment[],
  existingCodes: ReadonlySet<string>,
  knownProviderNames: ReadonlySet<string>,
  fileName: string,
): CatalogPreviewBuild {
  const get = makeFieldGetter(mapping);
  const errors: string[] = [];
  const warnings: string[] = [];

  // Mapeo obligatorio completo
  const mapped = new Set(
    mapping.filter((a) => a.columnIndex !== null).map((a) => a.field),
  );
  for (const required of CATALOG_REQUIRED_FIELDS) {
    if (!mapped.has(required)) {
      errors.push(
        `Falta asignar una columna al campo obligatorio "${required}". Ajusta el mapeo.`,
      );
    }
  }

  const reports: CatalogImportRowReport[] = [];
  const importableRows: NormalizedCatalogRow[] = [];
  const seenCodes = new Set<string>();
  const seenExternal = new Set<string>();

  let newCount = 0;
  let existingCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;
  let pendingObservationCount = 0;
  let priceInvalidCount = 0;

  const hasPriceColumn = mapped.has('observedPrice');

  if (errors.length === 0) {
    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i]!;
      const rowNumber = parsed.rowNumbers[i]!;
      const messages: string[] = [];

      const code = get(row, 'code');
      const name = get(row, 'name');
      const rawType = get(row, 'resourceType');
      const unit = get(row, 'unit');

      let status: CatalogImportRowReport['status'] = 'new';
      let priceStatus: CatalogImportRowReport['priceStatus'] = 'none';

      // ── Validaciones bloqueantes de la fila ─────────────────────────────
      if (!code) {
        status = 'invalid';
        messages.push('Código vacío.');
      } else if (code.length > CATALOG_IMPORT_LIMITS.maxCodeLen) {
        status = 'invalid';
        messages.push(`Código demasiado largo (máx ${CATALOG_IMPORT_LIMITS.maxCodeLen}).`);
      } else if (!CODE_PATTERN.test(code)) {
        status = 'invalid';
        messages.push('Código inválido: solo letras, números, puntos, guiones y guiones bajos.');
      }

      if (!name) {
        status = 'invalid';
        messages.push('Nombre vacío.');
      } else if (name.length > CATALOG_IMPORT_LIMITS.maxNameLen) {
        status = 'invalid';
        messages.push(`Nombre demasiado largo (máx ${CATALOG_IMPORT_LIMITS.maxNameLen}).`);
      }

      const resourceType = normalizeResourceType(rawType);
      if (!resourceType) {
        status = 'invalid';
        messages.push(
          rawType
            ? `Tipo de recurso no reconocido: "${rawType.slice(0, 40)}".`
            : 'Tipo de recurso vacío.',
        );
      }

      if (!unit) {
        status = 'invalid';
        messages.push('Unidad vacía.');
      } else if (unit.length > CATALOG_IMPORT_LIMITS.maxUnitLen) {
        status = 'invalid';
        messages.push(`Unidad demasiado larga (máx ${CATALOG_IMPORT_LIMITS.maxUnitLen}).`);
      } else if (!isKnownUnit(unit)) {
        messages.push(`Unidad no reconocida: "${unit}". Revisa antes de confirmar.`);
      }

      // ── Deduplicación (solo si la fila es estructuralmente válida) ──────
      if (status !== 'invalid' && code) {
        if (seenCodes.has(code)) {
          status = 'duplicate_in_file';
          messages.push(`Código repetido dentro del archivo: "${code}". Solo se importa la primera ocurrencia.`);
        } else if (existingCodes.has(code)) {
          status = 'skip_existing';
          messages.push('El código ya existe en la organización. No se sobrescribe.');
        }
        seenCodes.add(code);
      }

      // Referencias externas repetidas (advertencia, no bloquea)
      const externalSku = get(row, 'externalSku') || null;
      const externalReference = get(row, 'externalReference') || null;
      for (const [label, value] of [['SKU externo', externalSku], ['referencia externa', externalReference]] as const) {
        if (value) {
          const key = `${label}:${value}`;
          if (seenExternal.has(key)) {
            messages.push(`${label} repetida dentro del archivo: "${value}".`);
          }
          seenExternal.add(key);
        }
      }

      // ── Precio asociado (solo evaluable en filas que se importarán) ─────
      let observation: NormalizedRowObservation | null = null;
      const rawPrice = hasPriceColumn ? get(row, 'observedPrice') : '';
      if (status === 'new' && rawPrice) {
        const priceIssues: string[] = [];
        const observedPrice = parsePositiveDecimal(rawPrice);
        if (!observedPrice) priceIssues.push(`Precio inválido: "${rawPrice.slice(0, 30)}".`);

        const rawDiscount = get(row, 'discountPercent');
        let discountPercent = '0';
        if (rawDiscount) {
          const d = parsePositiveDecimal(rawDiscount);
          if (!d || new Decimal(d).gt(100)) {
            priceIssues.push(`Descuento inválido (debe estar entre 0 y 100): "${rawDiscount.slice(0, 30)}".`);
          } else {
            discountPercent = d;
          }
        }

        let currency = (get(row, 'currency') || 'COP').toUpperCase();
        if (!/^[A-Z]{3}$/.test(currency)) {
          priceIssues.push(`Moneda inválida (ISO-4217 de 3 letras): "${get(row, 'currency').slice(0, 10)}".`);
          currency = 'COP';
        }

        if (priceIssues.length > 0) {
          priceStatus = 'price_invalid';
          messages.push(...priceIssues, 'El recurso se importa; la observación de precio se rechaza.');
        } else {
          const rawValidUntil = get(row, 'validUntil');
          const validUntil = rawValidUntil ? parseCellDate(rawValidUntil) : null;
          if (rawValidUntil && !validUntil) {
            messages.push(`Fecha "válido hasta" no interpretable: "${rawValidUntil.slice(0, 20)}" (se omite).`);
          }
          const providerName = get(row, 'providerName') || null;
          if (providerName && !knownProviderNames.has(providerName.toLowerCase())) {
            messages.push(`Proveedor "${providerName}" no existe: la observación se crea sin proveedor asociado.`);
          }
          observation = {
            observedPrice: observedPrice!,
            discountPercent,
            currency,
            sourceUrl: get(row, 'sourceUrl') || null,
            validUntil,
            notes: get(row, 'notes') || null,
            providerName,
          };
          priceStatus = 'pending_observation';
        }
      }

      // ── Conteos + normalización final ────────────────────────────────────
      switch (status) {
        case 'new':
          newCount++;
          if (priceStatus === 'pending_observation') pendingObservationCount++;
          if (priceStatus === 'price_invalid') priceInvalidCount++;
          importableRows.push({
            row: rowNumber,
            code,
            name: name.slice(0, CATALOG_IMPORT_LIMITS.maxNameLen),
            resourceType: resourceType!,
            unit,
            description: (get(row, 'description') || null)?.slice(0, CATALOG_IMPORT_LIMITS.maxTextLen) ?? null,
            category: (get(row, 'category') || null)?.slice(0, 120) ?? null,
            brand: (get(row, 'brand') || null)?.slice(0, 120) ?? null,
            externalReference: externalReference?.slice(0, 120) ?? null,
            externalSku: externalSku?.slice(0, 120) ?? null,
            defaultWastePct: normalizeWastePct(get(row, 'defaultWastePct'), messages),
            observation,
          });
          break;
        case 'skip_existing':
          existingCount++;
          break;
        case 'duplicate_in_file':
          duplicateCount++;
          break;
        case 'invalid':
          invalidCount++;
          if (rawPrice) priceStatus = 'none';
          break;
      }

      reports.push({
        row: rowNumber,
        code: code || null,
        name: name || null,
        status,
        priceStatus,
        messages,
      });
    }
  }

  if (parsed.rows.length === 0) {
    errors.push('El archivo no contiene filas de datos.');
  }
  if (parsed.omittedEmptyRows > 0) {
    warnings.push(`${parsed.omittedEmptyRows} fila(s) vacía(s) omitida(s).`);
  }

  const sample = reports.slice(0, CATALOG_IMPORT_LIMITS.previewSampleRows);
  const preview: CatalogImportPreview = {
    fileName,
    sheet: parsed.sheetName,
    headers: parsed.headers,
    mapping,
    totalRows: parsed.rows.length,
    newCount,
    existingCount,
    duplicateCount,
    invalidCount,
    omittedCount: parsed.omittedEmptyRows,
    pendingObservationCount,
    priceInvalidCount,
    rows: sample,
    rowsTruncated: reports.length > sample.length,
    errors,
    warnings,
    importable: errors.length === 0 && newCount > 0,
    digest: parsed.digest,
  };

  return { preview, importableRows, allReports: reports };
}

function normalizeWastePct(raw: string, messages: string[]): string {
  if (!raw) return '0';
  const d = parsePositiveDecimal(raw);
  if (d === null) {
    messages.push(`Desperdicio % inválido: "${raw.slice(0, 20)}" (se usa 0).`);
    return '0';
  }
  return d;
}
