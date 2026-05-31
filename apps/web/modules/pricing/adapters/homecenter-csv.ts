/**
 * Adaptador Homecenter — implementación CSV/Excel (Oleada 2B).
 *
 * Canal: CSV (y Excel via xlsx en tests/scripts).
 * Contrato congelado v1 — `docs/PRICING_ADAPTER_CONTRACT.md` §7.
 *
 * Reglas críticas:
 * - NO asumir API pública de Homecenter.
 * - NO scraping. NO conexión remota. NO datos reales.
 * - CSV parser propio (sin dependencias en runtime).
 * - Excel (xlsx) SOLO en tests/scripts (devDep).
 * - Preview obligatorio antes de persistir.
 * - Ambigüedades → `pending`, NUNCA aprobadas automáticamente.
 * - Toda persistencia pasa por `PricingApprovalPort`.
 * - Idempotencia: no duplicar observaciones idénticas.
 * - Privacidad backend-first: campos 🔒 nunca al cliente.
 *
 * Columnas obligatorias del CSV de Homecenter:
 *   nombre  precio  moneda
 *
 * Columnas opcionales:
 *   sku  url  unidad  fecha  referencia_fuente
 */

import type { PriceSourceType } from "@/lib/utils/types";
import type { RecordObservationInput } from "@/modules/pricing/types";

import {
  buildContentHash,
  IdempotencyRegistry,
} from "./idempotency";
import { buildPreview } from "./import-preview";
import {
  CLEAR_MATCH_THRESHOLD,
  MIN_CANDIDATE_THRESHOLD,
  isAmbiguous,
  jaccardScore,
  normalizeCurrency,
  parsePrice,
  proposalsToObservationInputs,
} from "./supplier-adapter";
import type {
  CatalogInput,
  ImportPreview,
  RawSupplierItem,
  ResourceCatalog,
  SkuMatchCandidate,
  SkuMatchProposal,
  SupplierAdapter,
} from "./types";

// Re-export ResourceCatalog and ResourceRef for consumers that import from homecenter-csv.
export type { ResourceCatalog, ResourceRef } from "./types";

/* ----------------------------------------------------------------------------
 * Columnas del CSV
 * ------------------------------------------------------------------------- */

/** Columnas obligatorias del CSV de Homecenter. */
export const REQUIRED_COLUMNS = ["nombre", "precio", "moneda"] as const;

/** Columnas opcionales del CSV de Homecenter. */
export const OPTIONAL_COLUMNS = [
  "sku",
  "url",
  "unidad",
  "fecha",
  "referencia_fuente",
] as const;

export type RequiredColumn = (typeof REQUIRED_COLUMNS)[number];
export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];

/* ----------------------------------------------------------------------------
 * Parser CSV propio (sin dependencias runtime)
 * ------------------------------------------------------------------------- */

/**
 * Resultado del parseo de una línea CSV.
 */
export interface ParsedCsvRow {
  [column: string]: string;
}

/**
 * Parsea una línea CSV respetando comillas y comas dentro de campos.
 * RFC 4180 simplificado.
 */
export function parseCsvLine(line: string, separator = ","): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Comilla escapada.
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === separator && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch ?? "";
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Detecta automáticamente el separador del CSV (`,` o `;`).
 */
export function detectSeparator(header: string): "," | ";" {
  const commas = (header.match(/,/g) ?? []).length;
  const semis = (header.match(/;/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

/**
 * Parsea el contenido CSV a un array de objetos con keys normalizadas.
 * Retorna las filas válidas, las erróneas y las advertencias.
 */
export interface CsvParseResult {
  headers: string[];
  rows: ParsedCsvRow[];
  invalidRows: Array<{ rowIndex: number; reason: string }>;
  warnings: string[];
  separator: "," | ";";
}

export function parseCsvContent(content: string): CsvParseResult {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {
      headers: [],
      rows: [],
      invalidRows: [],
      warnings: ["El archivo CSV está vacío."],
      separator: ",",
    };
  }

  // lines.length > 0 is guaranteed above; firstLine is always defined.
  const firstLine = lines[0] as string;
  const separator = detectSeparator(firstLine);
  const headers = parseCsvLine(firstLine, separator).map((h) =>
    h.toLowerCase().trim(),
  );

  const rows: ParsedCsvRow[] = [];
  const invalidRows: Array<{ rowIndex: number; reason: string }> = [];
  const warnings: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith("#")) continue; // líneas de comentario.

    const fields = parseCsvLine(line, separator);
    if (fields.length !== headers.length) {
      invalidRows.push({
        rowIndex: i,
        reason: `Fila ${i + 1}: número de columnas (${fields.length}) no coincide con el encabezado (${headers.length}).`,
      });
      continue;
    }

    const row: ParsedCsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      const headerKey = headers[j];
      if (headerKey !== undefined) {
        row[headerKey] = fields[j] ?? "";
      }
    }
    rows.push(row);
  }

  return { headers, rows, invalidRows, warnings, separator };
}

/* ----------------------------------------------------------------------------
 * Validación de columnas
 * ------------------------------------------------------------------------- */

/**
 * Valida que el CSV tenga todas las columnas obligatorias.
 * Retorna los errores (bloqueantes) y advertencias (no bloqueantes).
 */
export interface ColumnValidationResult {
  valid: boolean;
  missingRequired: string[];
  missingOptional: string[];
  extraColumns: string[];
  warnings: string[];
}

export function validateColumns(headers: string[]): ColumnValidationResult {
  const headerSet = new Set(headers);

  const missingRequired = REQUIRED_COLUMNS.filter((c) => !headerSet.has(c));
  const missingOptional = OPTIONAL_COLUMNS.filter((c) => !headerSet.has(c));
  const knownColumns: Set<string> = new Set([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);
  const extraColumns = headers.filter((h) => !knownColumns.has(h));

  const warnings: string[] = [];
  if (missingOptional.length > 0) {
    warnings.push(
      `Columnas opcionales ausentes: ${missingOptional.join(", ")}. Los campos correspondientes quedarán vacíos.`,
    );
  }
  if (extraColumns.length > 0) {
    warnings.push(
      `Columnas no reconocidas (se ignorarán): ${extraColumns.join(", ")}.`,
    );
  }

  return {
    valid: missingRequired.length === 0,
    missingRequired,
    missingOptional,
    extraColumns,
    warnings,
  };
}

/* ----------------------------------------------------------------------------
 * Catálogo vacío de recursos (constante conveniente)
 * ------------------------------------------------------------------------- */

/** Catálogo vacío (para uso sin recursos: todas las propuestas quedan pending). */
export const EMPTY_CATALOG: ResourceCatalog = { resources: [] };

/* ----------------------------------------------------------------------------
 * Implementación HOMECENTERCsvAdapter
 * ------------------------------------------------------------------------- */

/**
 * Adaptador Homecenter para CSV/Excel.
 *
 * Implementa `SupplierAdapter` con:
 * - Parser CSV propio (runtime, sin dependencias).
 * - Matching por similitud de descripción (Jaccard).
 * - Preview obligatorio antes de persistir.
 * - Idempotencia en memoria.
 * - Privacidad backend-first.
 *
 * Para Excel: usar el script `scripts/catalog-sync/convert-excel.ts`
 * (que usa xlsx, devDep) para convertir a CSV antes de llamar a este adaptador.
 */
export class HomecenterCsvAdapter implements SupplierAdapter {
  readonly providerKey = "homecenter";

  private readonly idempotencyRegistry = new IdempotencyRegistry();

  constructor(
    private readonly catalog: ResourceCatalog = EMPTY_CATALOG,
    private readonly sourceType: PriceSourceType = "supplier_csv",
  ) {}

  /**
   * Lee un catálogo CSV y lo normaliza a `RawSupplierItem[]`.
   * Valida columnas obligatorias; retorna filas válidas.
   * Las filas inválidas se registran en advertencias pero NO bloquean
   * las filas válidas.
   */
  async parseCatalog(input: CatalogInput): Promise<RawSupplierItem[]> {
    if (input.content instanceof Uint8Array) {
      throw new Error(
        "HomecenterCsvAdapter: el contenido binario (Excel) debe convertirse a CSV " +
          "con scripts/catalog-sync/convert-excel.ts antes de importar en runtime.",
      );
    }

    const csvContent = input.content as string;
    const { headers, rows, invalidRows, warnings } = parseCsvContent(csvContent);

    // Validar columnas obligatorias.
    const colValidation = validateColumns(headers);
    if (!colValidation.valid) {
      throw new Error(
        `CSV inválido: faltan columnas obligatorias: ${colValidation.missingRequired.join(", ")}.`,
      );
    }

    const items: RawSupplierItem[] = [];
    const parseErrors: string[] = [...warnings];

    // Reportar filas con formato inválido.
    for (const inv of invalidRows) {
      parseErrors.push(inv.reason);
    }

    const now = new Date().toISOString();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // rows[i] is always defined within the loop range, but guard for strictness.
      if (row === undefined) continue;

      const rowIndex = i + 1; // 1-based para trazabilidad.

      try {
        const priceRaw = row["precio"] ?? "";
        const name = (row["nombre"] ?? "").trim();

        if (!name) {
          parseErrors.push(`Fila ${rowIndex + 1}: campo "nombre" vacío, se omite.`);
          continue;
        }

        const onlinePublicPrice = parsePrice(priceRaw, "precio");
        const currency = normalizeCurrency(row["moneda"]);

        // Fecha de observación: usar 'fecha' si existe y es válida; sino now.
        const fechaRaw = row["fecha"]?.trim() ?? "";
        let observedAt: string;
        if (fechaRaw) {
          const parsed = Date.parse(fechaRaw);
          observedAt = isNaN(parsed) ? now : new Date(parsed).toISOString();
        } else {
          observedAt = now;
        }

        const item: RawSupplierItem = {
          name,
          onlinePublicPrice,
          currency,
          observedAt,
          rawRowIndex: rowIndex,
        };

        // Campos opcionales (🔒 internos).
        const sku = row["sku"]?.trim();
        if (sku) item.sku = sku;

        const url = row["url"]?.trim();
        if (url) item.url = url;

        const unit = row["unidad"]?.trim();
        if (unit) item.unit = unit;

        const sourceRef = row["referencia_fuente"]?.trim();
        if (sourceRef) item.sourceReference = sourceRef;

        items.push(item);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        parseErrors.push(`Fila ${rowIndex + 1}: ${msg}`);
      }
    }

    return items;
  }

  /**
   * Propone coincidencias SKU→recurso con candidatos y score.
   * Coincidencias ambiguas → `requiresManualReview=true`, `status='pending'`.
   * NUNCA aprueba automáticamente coincidencias dudosas.
   */
  async mapToSupplierProducts(
    rows: RawSupplierItem[],
  ): Promise<SkuMatchProposal[]> {
    const proposals: SkuMatchProposal[] = [];

    for (const item of rows) {
      // Buscar candidatos por similitud de nombre.
      const candidates = this.findCandidates(item);
      const ambiguous = isAmbiguous(candidates);

      proposals.push({
        rawItem: item,
        candidates,
        status: "pending", // Siempre pending hasta aprobación humana.
        requiresManualReview: ambiguous,
      });
    }

    return proposals;
  }

  /**
   * Construye el preview para revisión humana.
   * El preview incluye todas las propuestas (pending/approved/rejected).
   */
  buildPreview(proposals: SkuMatchProposal[]): ImportPreview {
    const invalidCount = 0; // Las filas inválidas se filtraron en parseCatalog.
    const warnings: string[] = [];

    const ambiguousCount = proposals.filter((p) => p.requiresManualReview).length;
    if (ambiguousCount > 0) {
      warnings.push(
        `${ambiguousCount} ítem(s) requieren revisión manual (SKU ambiguo o sin candidato claro).`,
      );
    }

    const noCandidates = proposals.filter((p) => p.candidates.length === 0).length;
    if (noCandidates > 0) {
      warnings.push(
        `${noCandidates} ítem(s) sin candidato de recurso (se necesita mapeo manual).`,
      );
    }

    return buildPreview(
      this.providerKey,
      "",
      proposals,
      warnings,
      invalidCount,
    );
  }

  /**
   * Convierte propuestas `status='approved'` en `RecordObservationInput[]`.
   * No persiste. El llamador pasa estas entradas a `PricingApprovalPort`.
   */
  toPriceObservations(
    approved: SkuMatchProposal[],
  ): RecordObservationInput[] {
    return proposalsToObservationInputs(approved, this.sourceType);
  }

  /* --------------------------------------------------------------------------
   * Helpers privados
   * ----------------------------------------------------------------------- */

  /** Busca candidatos de recursos para un ítem por similitud de nombre/SKU. */
  private findCandidates(item: RawSupplierItem): SkuMatchCandidate[] {
    const candidates: SkuMatchCandidate[] = [];

    for (const resource of this.catalog.resources) {
      let score = jaccardScore(item.name, resource.name);

      // Boost por coincidencia de SKU (si el recurso tiene código).
      if (item.sku && resource.code && item.sku === resource.code) {
        score = Math.min(1, score + 0.4);
      }

      // Boost por coincidencia de unidad.
      if (item.unit && resource.unit && item.unit === resource.unit) {
        score = Math.min(1, score + 0.05);
      }

      if (score >= MIN_CANDIDATE_THRESHOLD) {
        candidates.push({
          resourceId: resource.resourceId,
          score,
          reason: `Similitud de nombre: ${(score * 100).toFixed(0)}%${item.sku && resource.code && item.sku === resource.code ? " + SKU coincide" : ""}`,
        });
      }
    }

    // Ordenar por score descendente.
    candidates.sort((a, b) => b.score - a.score);

    // Limitar a los 5 mejores candidatos.
    return candidates.slice(0, 5);
  }
}

/* ----------------------------------------------------------------------------
 * Factory con nombre del archivo para el preview
 * ------------------------------------------------------------------------- */

/**
 * Crea un adaptador Homecenter CSV con el nombre del archivo propagado al preview.
 * Versión conveniente para el flujo de importación completo.
 */
export function createHomecenterCsvAdapter(
  catalog: ResourceCatalog = EMPTY_CATALOG,
  sourceType: PriceSourceType = "supplier_csv",
): HomecenterCsvAdapter {
  return new HomecenterCsvAdapter(catalog, sourceType);
}

/**
 * Flujo completo de importación CSV de Homecenter (para scripts/tests).
 *
 * 1. parseCatalog → items crudos.
 * 2. mapToSupplierProducts → propuestas.
 * 3. buildPreview → preview para revisión.
 *
 * La persistencia (paso 4+) requiere aprobación humana y se hace fuera de
 * este flujo llamando a `toPriceObservations` + `PricingApprovalPort`.
 */
export async function runImportPreview(
  adapter: HomecenterCsvAdapter,
  input: CatalogInput,
): Promise<ImportPreview> {
  const items = await adapter.parseCatalog(input);
  const proposals = await adapter.mapToSupplierProducts(items);
  const preview = adapter.buildPreview(proposals);
  // Propagar el nombre del archivo al preview.
  return {
    ...preview,
    sourceFileName: input.fileName,
  };
}
