/**
 * external-structured-extraction.ts — Importador BYO-JSON de extracción
 * externa (F7.1, puro).
 *
 * Acepta JSON pegado manualmente desde una herramienta externa (Lift/Datalab,
 * Claude, GPT, Gemini…), lo valida contra el schema propio, lo normaliza y lo
 * COMPARA contra la detección interna F7. Sin red, sin API keys, sin subir
 * planos: la herramienta corre fuera; aquí solo entra su JSON.
 *
 * Reglas duras:
 * - method `external_json` en toda evidencia importada.
 * - NUNCA se auto-aprueba nada: el resultado es evidencia + comparación.
 * - Campos faltantes ⇒ issues visibles, jamás datos inventados.
 * - Cero cálculo ml/kg/costo (F1 única calculadora).
 */
import { extractElementMentions } from './drawing-element-registry';
import { normalizeDrawingText } from './drawing-spatial-model';
import type { ElementRecord } from './drawing-element-registry';
import type { StructuralDrawingAnalysis } from './structural-drawing-analysis';
import {
  STEEL_EXTRACTION_SCHEMA_VERSION,
  type ExternalElement,
  type ExternalStructuredExtraction,
} from './structured-extraction-schema';

// ---------------------------------------------------------------------------
// Validación / normalización
// ---------------------------------------------------------------------------

export interface ExternalImportIssue {
  severity: 'error' | 'warning';
  message: string;
  elementKey?: string;
}

/** Elemento externo normalizado con clave canónica F7 y método marcado. */
export interface NormalizedExternalElement extends ExternalElement {
  /** Clave canónica para comparar (misma normalización que el registro F7). */
  canonicalKey: string;
  method: 'external_json';
}

export interface ParsedExternalExtraction {
  schemaVersion: string;
  tool?: string;
  elements: readonly NormalizedExternalElement[];
  raw: ExternalStructuredExtraction;
  /** Advertencias no bloqueantes (campos faltantes, evidencia incompleta). */
  issues: readonly ExternalImportIssue[];
}

export type ExternalParseResult =
  | { ok: true; extraction: ParsedExternalExtraction }
  | { ok: false; errors: readonly string[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asOptionalNumberish(value: unknown): number | string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return undefined;
}

/** Clave canónica compatible con el registro F7 (VC 2 / V.C.-2 ⇒ VC-2). */
export function canonicalExternalKey(elementKey: string): string {
  const viaRegistry = extractElementMentions(elementKey)[0]?.elementKey;
  if (viaRegistry) return viaRegistry;
  return normalizeDrawingText(elementKey).replace(/[.\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Valida y normaliza el JSON pegado. Errores de shape ⇒ `ok: false` con la
 * lista completa (no se importa nada a medias). Campos faltantes por elemento
 * ⇒ issues (se importa con advertencia visible, sin inventar).
 */
export function parseExternalExtractionJson(rawJson: string): ExternalParseResult {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    return {
      ok: false,
      errors: [`JSON invalido: ${error instanceof Error ? error.message.slice(0, 160) : 'no se pudo parsear'}.`],
    };
  }

  if (!isObject(parsed)) {
    return { ok: false, errors: ['El JSON debe ser un objeto (no un array ni un valor suelto).'] };
  }

  const schemaVersion = asOptionalString(parsed.schemaVersion);
  if (!schemaVersion) {
    errors.push(`Falta "schemaVersion" (se espera "${STEEL_EXTRACTION_SCHEMA_VERSION}").`);
  } else if (schemaVersion !== STEEL_EXTRACTION_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion "${schemaVersion}" no soportada (se espera "${STEEL_EXTRACTION_SCHEMA_VERSION}").`,
    );
  }

  if (!Array.isArray(parsed.elements)) {
    errors.push('Falta "elements" (array de elementos estructurales).');
  } else if (parsed.elements.length === 0) {
    errors.push('"elements" esta vacio: no hay nada que importar.');
  }

  if (errors.length > 0) return { ok: false, errors };

  const issues: ExternalImportIssue[] = [];
  const elements: NormalizedExternalElement[] = [];

  (parsed.elements as unknown[]).forEach((rawElement, index) => {
    if (!isObject(rawElement)) {
      issues.push({ severity: 'error', message: `elements[${index}] no es un objeto: se omite.` });
      return;
    }
    const elementKey = asOptionalString(rawElement.elementKey);
    if (!elementKey) {
      issues.push({ severity: 'error', message: `elements[${index}] no tiene "elementKey": se omite.` });
      return;
    }

    const pageNumber =
      typeof rawElement.pageNumber === 'number' && Number.isInteger(rawElement.pageNumber) && rawElement.pageNumber >= 1
        ? rawElement.pageNumber
        : undefined;
    const evidenceText = asOptionalString(rawElement.evidenceText);
    const element: NormalizedExternalElement = {
      elementKey,
      canonicalKey: canonicalExternalKey(elementKey),
      method: 'external_json',
      elementType: asOptionalString(rawElement.elementType) as NormalizedExternalElement['elementType'],
      axisContext: asOptionalString(rawElement.axisContext),
      section: asOptionalString(rawElement.section),
      diameter: asOptionalString(rawElement.diameter),
      quantity: asOptionalNumberish(rawElement.quantity),
      repetitions: asOptionalNumberish(rawElement.repetitions),
      reinforcement: Array.isArray(rawElement.reinforcement)
        ? (rawElement.reinforcement.filter(isObject) as NormalizedExternalElement['reinforcement'])
        : undefined,
      stirrups: Array.isArray(rawElement.stirrups)
        ? (rawElement.stirrups.filter(isObject) as NormalizedExternalElement['stirrups'])
        : undefined,
      tableReference: asOptionalString(rawElement.tableReference),
      detailReference: asOptionalString(rawElement.detailReference),
      sourceFileName: asOptionalString(rawElement.sourceFileName),
      pageNumber,
      evidenceText,
      confidence: asOptionalNumberish(rawElement.confidence),
      unresolvedFields: Array.isArray(rawElement.unresolvedFields)
        ? rawElement.unresolvedFields.filter((f): f is string => typeof f === 'string')
        : undefined,
      warnings: Array.isArray(rawElement.warnings)
        ? rawElement.warnings.filter((w): w is string => typeof w === 'string')
        : undefined,
    };

    // Hallazgos por campos faltantes: se importa con advertencia, sin inventar.
    if (!evidenceText) {
      issues.push({
        severity: 'warning',
        elementKey: element.canonicalKey,
        message: `${elementKey}: sin "evidenceText" (texto literal del plano) — evidencia externa de baja confianza.`,
      });
    }
    if (!element.sourceFileName || pageNumber === undefined) {
      issues.push({
        severity: 'warning',
        elementKey: element.canonicalKey,
        message: `${elementKey}: sin fuente/pagina completas — la trazabilidad queda incompleta.`,
      });
    }
    if (element.unresolvedFields && element.unresolvedFields.length > 0) {
      issues.push({
        severity: 'warning',
        elementKey: element.canonicalKey,
        message: `${elementKey}: la herramienta externa declaro campos sin resolver: ${element.unresolvedFields.join(', ')}.`,
      });
    }
    if (element.quantity === undefined && element.reinforcement === undefined && element.stirrups === undefined) {
      issues.push({
        severity: 'warning',
        elementKey: element.canonicalKey,
        message: `${elementKey}: sin cantidad ni refuerzo — solo sirve como mencion de existencia.`,
      });
    }

    elements.push(element);
  });

  if (elements.length === 0) {
    return { ok: false, errors: ['Ningun elemento del JSON fue importable (todos sin elementKey u objeto invalido).'] };
  }

  return {
    ok: true,
    extraction: {
      schemaVersion: schemaVersion!,
      tool: asOptionalString(parsed.tool),
      elements,
      raw: parsed as unknown as ExternalStructuredExtraction,
      issues,
    },
  };
}

// ---------------------------------------------------------------------------
// Comparación contra la detección interna F7
// ---------------------------------------------------------------------------

export type ExternalComparisonStatus = 'match' | 'external_only' | 'internal_only' | 'conflict';

export const EXTERNAL_COMPARISON_STATUS_LABEL: Record<ExternalComparisonStatus, string> = {
  match: 'Coincide',
  external_only: 'Solo externo (F7 no lo vio)',
  internal_only: 'Solo F7 (externo no lo vio)',
  conflict: 'Conflicto',
};

export interface ExternalComparisonEntry {
  elementKey: string;
  status: ExternalComparisonStatus;
  /** Detalles legibles del match/conflicto (sección, tipo, ejes…). */
  details: readonly string[];
  external?: NormalizedExternalElement;
  internal?: ElementRecord;
}

export interface ExternalComparisonResult {
  entries: readonly ExternalComparisonEntry[];
  summary: {
    match: number;
    externalOnly: number;
    internalOnly: number;
    conflicts: number;
  };
}

const KIND_BY_EXTERNAL_TYPE: Record<string, string> = {
  viga: 'viga',
  zapata: 'zapata',
  pilote: 'pilote',
  columna: 'columna',
  muro: 'muro',
  losa: 'losa',
};

/**
 * Compara elementos externos vs registro interno F7 por clave canónica.
 * Nada se fusiona ni se aprueba: es un tablero de coincidencias para decidir
 * si la herramienta externa aporta frente a F7 (criterio H del mandato).
 */
export function compareExternalWithInternal(
  extraction: Pick<ParsedExternalExtraction, 'elements'>,
  analysis: Pick<StructuralDrawingAnalysis, 'registry'>,
): ExternalComparisonResult {
  const internalByKey = new Map(analysis.registry.map((record) => [record.elementKey, record]));
  const externalByKey = new Map<string, NormalizedExternalElement>();
  for (const element of extraction.elements) {
    // Ante claves externas repetidas se conserva la primera (aviso implícito
    // en details si difieren atributos con la interna).
    if (!externalByKey.has(element.canonicalKey)) externalByKey.set(element.canonicalKey, element);
  }

  const entries: ExternalComparisonEntry[] = [];

  for (const [key, external] of externalByKey) {
    const internal = internalByKey.get(key);
    if (!internal) {
      entries.push({
        elementKey: key,
        status: 'external_only',
        details: [
          `La herramienta externa reporta "${external.elementKey}"${external.evidenceText ? ` con evidencia "${external.evidenceText}"` : ' SIN evidencia literal'}; F7 no lo detecto en las paginas analizadas.`,
        ],
        external,
      });
      continue;
    }

    const details: string[] = [];
    let conflict = false;

    const externalKind = external.elementType ? KIND_BY_EXTERNAL_TYPE[external.elementType] : undefined;
    if (externalKind && internal.kind && externalKind !== internal.kind) {
      conflict = true;
      details.push(`Tipo en conflicto: externo dice "${externalKind}", F7 detecto "${internal.kind}".`);
    }
    if (external.section && internal.sectionSpec && normalizeDrawingText(external.section) !== normalizeDrawingText(internal.sectionSpec)) {
      conflict = true;
      details.push(`Seccion en conflicto: externo "${external.section}" vs F7 "${internal.sectionSpec}".`);
    }
    if (external.section && !internal.sectionSpec) {
      details.push(`El externo aporta seccion "${external.section}" que F7 no habia visto (verificar contra el plano).`);
    }
    if (external.axisContext && internal.nearbyAxisLabels.length > 0) {
      details.push(`Ubicacion: externo "${external.axisContext}" vs ejes cercanos F7 [${internal.nearbyAxisLabels.join(', ')}].`);
    }
    if (external.quantity !== undefined) {
      details.push(`Cantidad externa declarada: ${external.quantity} (F7 no cuenta instancias automaticamente; verificar).`);
    }
    if (internal.suspectedTitleBlockOnly) {
      details.push('Ojo: para F7 este codigo parece rotulo/metadato del plano; el externo lo reporta como elemento.');
    }
    if (details.length === 0) details.push('Mismo elemento detectado por ambos caminos.');

    entries.push({
      elementKey: key,
      status: conflict ? 'conflict' : 'match',
      details,
      external,
      internal,
    });
  }

  for (const record of analysis.registry) {
    if (externalByKey.has(record.elementKey)) continue;
    // Los "elementos" que F7 ya marcó como probable rótulo no cuentan como
    // faltantes del externo: probablemente el externo hizo bien en omitirlos.
    if (record.suspectedTitleBlockOnly) continue;
    entries.push({
      elementKey: record.elementKey,
      status: 'internal_only',
      details: [
        `F7 detecto "${record.displayLabel}" (${record.sourceMentions.length} mencion(es)) y el JSON externo no lo trae.`,
      ],
      internal: record,
    });
  }

  entries.sort((a, b) => a.elementKey.localeCompare(b.elementKey));
  return {
    entries,
    summary: {
      match: entries.filter((e) => e.status === 'match').length,
      externalOnly: entries.filter((e) => e.status === 'external_only').length,
      internalOnly: entries.filter((e) => e.status === 'internal_only').length,
      conflicts: entries.filter((e) => e.status === 'conflict').length,
    },
  };
}
