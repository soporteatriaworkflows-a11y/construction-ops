/**
 * structured-extraction-schema.ts — Schema propio de extracción estructurada
 * de acero (F7.1, puro).
 *
 * Steel Ops todavía NO integra ninguna herramienta externa (sin APIs, sin
 * keys, sin subir planos). Este schema permite el flujo BYO-JSON: la usuaria
 * corre una herramienta externa (Lift/Datalab, Claude, GPT, Gemini, etc.)
 * por su cuenta, le pasa este schema, y pega el JSON resultante en Steel Ops
 * para COMPARARLO contra la detección interna F7 — sin casarse con nada.
 *
 * Reglas del puente:
 * - El JSON externo es EVIDENCIA con método `external_json`: jamás se
 *   auto-aprueba ni alimenta cálculo (F1 única calculadora).
 * - Campos faltantes ⇒ `unresolvedFields`, no datos inventados.
 * - Todo dato externo debe traer su `evidenceText` literal y fuente/página
 *   para ser confiable; sin eso, baja confianza.
 */

export const STEEL_EXTRACTION_SCHEMA_VERSION = 'steel-ext-1';

// ---------------------------------------------------------------------------
// Tipos TS del intercambio
// ---------------------------------------------------------------------------

export type ExternalElementType =
  | 'viga'
  | 'zapata'
  | 'pilote'
  | 'columna'
  | 'muro'
  | 'losa'
  | 'otro';

/** Evidencia de origen de cualquier dato externo. */
export interface ExternalSourceEvidence {
  sourceFileName?: string;
  pageNumber?: number;
  /** Texto LITERAL del plano que sustenta el dato. */
  evidenceText?: string;
  /** Confianza 0–1 declarada por la herramienta externa. */
  confidence?: number | string;
}

/** Una entrada de refuerzo (longitudinal o estribos/flejes). */
export interface ExternalReinforcementEntry extends ExternalSourceEvidence {
  /** Marca de barra tal como aparece ("#5", "Ø12", "E#3"). */
  barMark?: string;
  quantity?: number | string;
  /** Longitud con unidad explícita ("600 cm", "2.40 m"). */
  length?: string;
  /** Separación con unidad ("@15 cm"). */
  spacing?: string;
  repetitions?: number | string;
  role?: 'longitudinal' | 'estribo' | 'fleje' | 'gancho' | 'traslapo' | 'otro';
  unresolvedFields?: string[];
  warnings?: string[];
}

/** Elemento estructural extraído por la herramienta externa. */
export interface ExternalElement extends ExternalSourceEvidence {
  /** Código tal como aparece en el plano ("VC-2", "Z-01", "PILOTE Ø60"). */
  elementKey: string;
  elementType?: ExternalElementType;
  /** Contexto de ejes ("entre ejes A y B / 2-3") tal como lo dice el plano. */
  axisContext?: string;
  /** Sección "50x60" si aplica. */
  section?: string;
  /** Diámetro "Ø60" si aplica (pilotes). */
  diameter?: string;
  /** Cuántas instancias del elemento existen según tabla/planta. */
  quantity?: number | string;
  repetitions?: number | string;
  reinforcement?: ExternalReinforcementEntry[];
  stirrups?: ExternalReinforcementEntry[];
  /** Referencia del cuadro donde vive ("CUADRO DE ZAPATAS p.2"). */
  tableReference?: string;
  /** Referencia del detalle/corte ("DETALLE VC-01", "CORTE A-A"). */
  detailReference?: string;
  unresolvedFields?: string[];
  warnings?: string[];
}

export interface ExternalPage {
  sourceFileName?: string;
  pageNumber: number;
  pageType?: string;
  notes?: string;
}

export interface ExternalTable extends ExternalSourceEvidence {
  tableReference: string;
  headers?: string[];
  rows?: string[][];
}

export interface ExternalNomenclatureEntry extends ExternalSourceEvidence {
  symbol: string;
  meaning: string;
}

export interface ExternalFinding extends ExternalSourceEvidence {
  description: string;
  elementKey?: string;
  severity?: 'info' | 'warning' | 'critical';
}

/** Documento completo que Steel Ops acepta pegado/importado. */
export interface ExternalStructuredExtraction {
  schemaVersion: typeof STEEL_EXTRACTION_SCHEMA_VERSION;
  /** Herramienta que generó el JSON (texto libre: "lift", "claude", …). */
  tool?: string;
  planSet?: { name?: string; files?: string[] };
  pages?: ExternalPage[];
  elements: ExternalElement[];
  tables?: ExternalTable[];
  nomenclature?: ExternalNomenclatureEntry[];
  findings?: ExternalFinding[];
}

// ---------------------------------------------------------------------------
// JSON Schema (draft-07) — copiable para la herramienta externa
// ---------------------------------------------------------------------------

const SOURCE_EVIDENCE_PROPS = {
  sourceFileName: { type: 'string', description: 'Nombre del PDF/archivo fuente.' },
  pageNumber: { type: 'integer', minimum: 1, description: 'Página (1-based) de donde salió el dato.' },
  evidenceText: { type: 'string', description: 'Texto LITERAL del plano que sustenta el dato. Obligatorio para confiar en el dato.' },
  confidence: { type: 'number', minimum: 0, maximum: 1, description: 'Confianza 0-1 de la lectura.' },
} as const;

const REINFORCEMENT_SCHEMA = {
  type: 'object',
  properties: {
    ...SOURCE_EVIDENCE_PROPS,
    barMark: { type: 'string', description: 'Marca de barra tal como aparece: "#5", "Ø12", "E#3".' },
    quantity: { type: ['number', 'string'], description: 'Cantidad de barras/estribos. NO inventar: si no está, omitir y listar en unresolvedFields.' },
    length: { type: 'string', description: 'Longitud CON unidad explícita: "600 cm", "2.40 m".' },
    spacing: { type: 'string', description: 'Separación con unidad: "@15 cm".' },
    repetitions: { type: ['number', 'string'] },
    role: { enum: ['longitudinal', 'estribo', 'fleje', 'gancho', 'traslapo', 'otro'] },
    unresolvedFields: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' } },
  },
} as const;

/**
 * JSON Schema copiable. La herramienta externa debe devolver EXACTAMENTE un
 * objeto que valide contra esto — con evidencia literal y sin inventar.
 */
export const STEEL_EXTRACTION_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'SteelOpsStructuredExtraction',
  description:
    'Extraccion estructurada de acero desde planos estructurales (planta de cimentacion, vigas, pilotes). REGLA DURA: no inventar datos; campo ilegible o ausente => omitir y listarlo en unresolvedFields. Cada dato debe traer evidenceText literal, sourceFileName y pageNumber.',
  type: 'object',
  required: ['schemaVersion', 'elements'],
  properties: {
    schemaVersion: { const: STEEL_EXTRACTION_SCHEMA_VERSION },
    tool: { type: 'string', description: 'Nombre de la herramienta que genero el JSON.' },
    planSet: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        files: { type: 'array', items: { type: 'string' } },
      },
    },
    pages: {
      type: 'array',
      items: {
        type: 'object',
        required: ['pageNumber'],
        properties: {
          sourceFileName: { type: 'string' },
          pageNumber: { type: 'integer', minimum: 1 },
          pageType: {
            type: 'string',
            description: 'planta | despiece | detalle | tabla | notas | rotulado | otro',
          },
          notes: { type: 'string' },
        },
      },
    },
    elements: {
      type: 'array',
      description: 'Elementos estructurales REALES (no direcciones, no nombres de ingenieros, no rotulado).',
      items: {
        type: 'object',
        required: ['elementKey'],
        properties: {
          ...SOURCE_EVIDENCE_PROPS,
          elementKey: {
            type: 'string',
            description: 'Codigo tal como aparece: "VC-2", "Z-01", "P-03", "PILOTE Ø60". JAMAS direcciones (CALLE/CARRERA) ni responsables (ING./ARQ.).',
          },
          elementType: { enum: ['viga', 'zapata', 'pilote', 'columna', 'muro', 'losa', 'otro'] },
          axisContext: { type: 'string', description: 'Ubicacion por ejes tal como la dice el plano: "EJE 1 entre A y B".' },
          section: { type: 'string', description: 'Seccion "50x60" si aplica.' },
          diameter: { type: 'string', description: 'Diametro "Ø60" si aplica.' },
          quantity: { type: ['number', 'string'], description: 'Instancias del elemento segun tabla/planta. NO contar a ojo: si no es confiable, omitir.' },
          repetitions: { type: ['number', 'string'] },
          reinforcement: { type: 'array', items: REINFORCEMENT_SCHEMA },
          stirrups: { type: 'array', items: REINFORCEMENT_SCHEMA },
          tableReference: { type: 'string' },
          detailReference: { type: 'string' },
          unresolvedFields: { type: 'array', items: { type: 'string' } },
          warnings: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    tables: {
      type: 'array',
      items: {
        type: 'object',
        required: ['tableReference'],
        properties: {
          ...SOURCE_EVIDENCE_PROPS,
          tableReference: { type: 'string' },
          headers: { type: 'array', items: { type: 'string' } },
          rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
        },
      },
    },
    nomenclature: {
      type: 'array',
      description: 'SOLO simbolos definidos en la leyenda del plano. No asumir significados.',
      items: {
        type: 'object',
        required: ['symbol', 'meaning'],
        properties: {
          ...SOURCE_EVIDENCE_PROPS,
          symbol: { type: 'string' },
          meaning: { type: 'string' },
        },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['description'],
        properties: {
          ...SOURCE_EVIDENCE_PROPS,
          description: { type: 'string' },
          elementKey: { type: 'string' },
          severity: { enum: ['info', 'warning', 'critical'] },
        },
      },
    },
  },
} as const;

/**
 * Bloque copiable para la herramienta externa: instrucciones + schema.
 * Pensado para pegarse en Lift/Datalab, Claude, GPT, Gemini u otra
 * herramienta de extracción estructurada, SIN integrarla todavía.
 */
export function buildExternalExtractionPromptBlock(): string {
  return [
    'Extrae la informacion de acero estructural de los planos adjuntos (planta de cimentacion, vigas, pilotes) y devuelve UN SOLO JSON que valide contra el schema de abajo.',
    '',
    'Reglas obligatorias:',
    '1. NO inventes datos: si un campo no se lee con certeza, omitelo y agregalo a unresolvedFields.',
    '2. Cada elemento/dato debe traer evidenceText (texto literal del plano), sourceFileName y pageNumber.',
    '3. Los codigos de elemento son tecnicos (VC-2, Z-01, P-03, PILOTE Ø60): NUNCA direcciones (CALLE/CARRERA), nombres de ingenieros (ING./ARQ.) ni datos del rotulado.',
    '4. La seccion (50x60) va en "section", separada del codigo.',
    '5. Cantidades SOLO desde tablas o listados explicitos; el conteo grafico "a ojo" no es confiable: reportalo en warnings.',
    '6. La nomenclatura solo incluye simbolos DEFINIDOS en la leyenda del plano.',
    '7. Longitudes y separaciones siempre CON unidad ("600 cm", "@15 cm").',
    '',
    `Schema (${STEEL_EXTRACTION_SCHEMA_VERSION}):`,
    JSON.stringify(STEEL_EXTRACTION_JSON_SCHEMA, null, 2),
  ].join('\n');
}
