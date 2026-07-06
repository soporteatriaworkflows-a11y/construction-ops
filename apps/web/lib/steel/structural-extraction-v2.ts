/**
 * steel-ext-2-schema.ts — Schema PROFESIONAL de extracción estructural (F8, spike).
 *
 * ⚠️ RESEARCH SPIKE (F8 — AEC Extraction Engine). Este módulo vive en
 * `lib/steel/research/` y NO está cableado a ninguna pantalla, action ni
 * export de producción. Nada del app principal lo importa. Es el contrato
 * candidato para la siguiente generación de motores de extracción
 * (CAD/DXF/IFC, JSON externo, visión opt-in) evaluados en
 * `docs/STEEL_OPS_F8_AEC_EXTRACTION_ENGINE_SPIKE.md`.
 *
 * Diferencias vs `steel-ext-1` (F7.1, producción):
 * - Modela el PLANO COMO DOCUMENTO AEC: proyecto → plan set → documentos →
 *   páginas → elementos → refuerzo → tablas → ejes, no solo "elementos".
 * - Separa CONTEO GRÁFICO (instancias dibujadas/bloques CAD) de CONTEO
 *   TEXTUAL (tablas/listados) y modela la DISCREPANCIA como entidad de
 *   primera clase (19 zapatas dibujadas vs 16 listadas; 35+150+35=220 vs
 *   texto del estribo distinto).
 * - Refuerzo desglosado: barras longitudinales, estribos, ganchos, traslapos.
 * - Todo dato lleva evidencia OBLIGATORIA: fuente, página, región, bbox si
 *   existe, método, confianza, texto literal, needsReview y warnings.
 *
 * Reglas duras heredadas de F7.1 (no negociables):
 * - Jamás auto-aprobar: todo entra como evidencia con `needsReview`.
 * - Jamás inventar: campo ausente ⇒ `unresolvedFields`/`unresolvedNomenclature`.
 * - Cero cálculo ml/kg/costo aquí (F1 sigue siendo la única calculadora).
 */

export const STEEL_EXT2_SCHEMA_VERSION = 'steel-ext-2';

// ---------------------------------------------------------------------------
// Evidencia obligatoria por dato
// ---------------------------------------------------------------------------

/** Método por el que se obtuvo el dato. */
export type Ext2Method =
  | 'native_text' // texto seleccionable del PDF
  | 'ocr' // OCR client-side
  | 'external_json' // JSON pegado desde herramienta externa
  | 'dxf_entity' // entidad CAD real leída de un DXF
  | 'ifc_entity' // entidad leída de un modelo IFC
  | 'vision_api' // modelo multimodal opt-in
  | 'manual'; // capturado por la usuaria

export interface Ext2BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Evidencia que TODO dato del documento debe portar. `region` es texto libre
 * pero canónico: tipo de región F7 (planta/despiece/tabla/rotulado/…) o, en
 * CAD, el layer de origen ("layer:CIMENTACION-VIGAS").
 */
export interface Ext2Evidence {
  sourceFileName: string;
  /** 1-based. En CAD sin paginación usar 1. */
  pageNumber: number;
  region?: string;
  bbox?: Ext2BBox;
  method: Ext2Method;
  /** 0–1. Texto CAD nativo ≈ 0.95+; OCR degrada; visión declara la suya. */
  confidence: number;
  /** Texto LITERAL del plano/entidad que sustenta el dato. */
  evidenceText: string;
  /** Siempre true al importar: la aprobación es humana y vive fuera. */
  needsReview: boolean;
  warnings?: string[];
}

// ---------------------------------------------------------------------------
// Documento, páginas y contexto
// ---------------------------------------------------------------------------

export interface Ext2SourceDocument {
  fileName: string;
  /** 'pdf' | 'dxf' | 'ifc' | 'image' | 'other' */
  format: string;
  pageCount?: number;
  /** Capas CAD presentes, si aplica. */
  layers?: string[];
  discipline?: string;
}

export interface Ext2Page {
  sourceFileName: string;
  pageNumber: number;
  /** planta | despiece | detalle | tabla | notas | rotulado | otro */
  pageType?: string;
  title?: string;
  scaleText?: string;
  notes?: string;
}

export interface Ext2AxisContext extends Ext2Evidence {
  /** Etiqueta del eje tal como aparece ("EJE 1", "A"). */
  axisLabel: string;
  orientation?: 'horizontal' | 'vertical' | 'otro';
  /** Coordenada de la línea de eje si el origen la trae (CAD). */
  position?: { x?: number; y?: number };
}

// ---------------------------------------------------------------------------
// Refuerzo
// ---------------------------------------------------------------------------

export interface Ext2ReinforcementEntry extends Ext2Evidence {
  /** Marca de barra literal: "#5", "Ø12", "E#3". */
  barMark?: string;
  quantity?: number;
  /** Longitud CON unidad explícita ("600 cm", "6.00 m"). */
  length?: string;
  /** Separación con unidad ("@15 cm"). */
  spacing?: string;
  repetitions?: number;
  unresolvedFields?: string[];
}

export interface Ext2Reinforcement {
  longitudinalBars?: Ext2ReinforcementEntry[];
  stirrups?: Ext2ReinforcementEntry[];
  hooks?: Ext2ReinforcementEntry[];
  laps?: Ext2ReinforcementEntry[];
}

// ---------------------------------------------------------------------------
// Elementos estructurales
// ---------------------------------------------------------------------------

export type Ext2ElementType =
  | 'beam' // viga / viga de cimentación / riostra
  | 'footing' // zapata / cimiento
  | 'pile' // pilote / caisson
  | 'column' // columna / pedestal
  | 'wall'
  | 'slab'
  | 'other';

export interface Ext2Element extends Ext2Evidence {
  /** Código literal del plano: "VC-2", "Z-01", "P-03". */
  elementKey: string;
  elementType: Ext2ElementType;
  /** Ubicación por ejes tal como la dice el plano ("EJE 1 entre A y B"). */
  axisContext?: string;
  section?: string;
  diameter?: string;
  /** Cantidad declarada por tabla/listado (NO conteo a ojo). */
  quantity?: number;
  reinforcement?: Ext2Reinforcement;
  tableReference?: string;
  detailReference?: string;
  /** Coordenadas de instancias dibujadas (CAD) — sustenta graphicCounts. */
  instances?: Array<{ x: number; y: number; blockName?: string; layer?: string }>;
  unresolvedFields?: string[];
}

// ---------------------------------------------------------------------------
// Tablas, conteos y discrepancias
// ---------------------------------------------------------------------------

export interface Ext2TableRow extends Ext2Evidence {
  /** Referencia del cuadro ("CUADRO DE ZAPATAS p.2"). */
  tableReference: string;
  rowIndex?: number;
  cells: string[];
  /** Código de elemento al que aplica la fila, si se reconoce. */
  elementKey?: string;
}

/** Conteo derivado de instancias DIBUJADAS (bloques CAD, símbolos). */
export interface Ext2GraphicCount extends Ext2Evidence {
  elementKey: string;
  count: number;
  /** De dónde salen las instancias ("INSERT block ZAPATA_TIPO_1"). */
  basis: string;
}

/** Conteo declarado en TEXTO (tabla, listado, nota). */
export interface Ext2TextCount extends Ext2Evidence {
  elementKey: string;
  count: number;
  basis: string;
}

export type Ext2DiscrepancyKind =
  | 'graphic_vs_text_count' // 19 dibujadas vs 16 listadas
  | 'dimension_sum_mismatch' // 35+150+35=220 vs longitud declarada distinta
  | 'cross_document_conflict' // refuerzo en un plano, ubicación en otro, chocan
  | 'symbol_without_legend' // símbolo Q sin leyenda
  | 'other';

export interface Ext2Discrepancy extends Ext2Evidence {
  kind: Ext2DiscrepancyKind;
  elementKey?: string;
  description: string;
  expected?: string;
  found?: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface Ext2UnresolvedNomenclature extends Ext2Evidence {
  symbol: string;
  /** Por qué quedó sin resolver ("sin leyenda en el plan set"). */
  reason: string;
}

// ---------------------------------------------------------------------------
// Documento completo
// ---------------------------------------------------------------------------

export interface SteelExt2Document {
  schemaVersion: typeof STEEL_EXT2_SCHEMA_VERSION;
  /** Motor/herramienta que generó el documento ("dxf-spike", "lift", …). */
  tool?: string;
  project?: { name?: string; reference?: string };
  planSet?: { name?: string; files?: string[] };
  sourceDocuments: Ext2SourceDocument[];
  pages?: Ext2Page[];
  elements: Ext2Element[];
  tableRows?: Ext2TableRow[];
  axisContext?: Ext2AxisContext[];
  graphicCounts?: Ext2GraphicCount[];
  textCounts?: Ext2TextCount[];
  discrepancies?: Ext2Discrepancy[];
  unresolvedNomenclature?: Ext2UnresolvedNomenclature[];
  /** Evidencia suelta que no cupo en otra entidad pero debe conservarse. */
  sourceEvidence?: Ext2Evidence[];
}

// ---------------------------------------------------------------------------
// JSON Schema (draft-07) — copiable a motores externos
// ---------------------------------------------------------------------------

const EVIDENCE_PROPS = {
  sourceFileName: { type: 'string' },
  pageNumber: { type: 'integer', minimum: 1 },
  region: { type: 'string' },
  bbox: {
    type: 'object',
    properties: {
      x: { type: 'number' },
      y: { type: 'number' },
      width: { type: 'number' },
      height: { type: 'number' },
    },
  },
  method: {
    enum: ['native_text', 'ocr', 'external_json', 'dxf_entity', 'ifc_entity', 'vision_api', 'manual'],
  },
  confidence: { type: 'number', minimum: 0, maximum: 1 },
  evidenceText: { type: 'string' },
  needsReview: { type: 'boolean' },
  warnings: { type: 'array', items: { type: 'string' } },
} as const;

const EVIDENCE_REQUIRED = [
  'sourceFileName',
  'pageNumber',
  'method',
  'confidence',
  'evidenceText',
  'needsReview',
] as const;

const REINFORCEMENT_ENTRY_SCHEMA = {
  type: 'object',
  required: [...EVIDENCE_REQUIRED],
  properties: {
    ...EVIDENCE_PROPS,
    barMark: { type: 'string' },
    quantity: { type: 'number' },
    length: { type: 'string', description: 'Longitud CON unidad ("600 cm").' },
    spacing: { type: 'string', description: 'Separación con unidad ("@15 cm").' },
    repetitions: { type: 'number' },
    unresolvedFields: { type: 'array', items: { type: 'string' } },
  },
} as const;

/**
 * JSON Schema copiable. Regla dura para cualquier motor (externo o interno):
 * no inventar; dato ilegible ⇒ omitir + unresolvedFields; todo dato con
 * evidencia literal completa y needsReview=true.
 */
export const STEEL_EXT2_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'SteelOpsStructuralExtractionV2',
  type: 'object',
  required: ['schemaVersion', 'sourceDocuments', 'elements'],
  properties: {
    schemaVersion: { const: STEEL_EXT2_SCHEMA_VERSION },
    tool: { type: 'string' },
    project: {
      type: 'object',
      properties: { name: { type: 'string' }, reference: { type: 'string' } },
    },
    planSet: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        files: { type: 'array', items: { type: 'string' } },
      },
    },
    sourceDocuments: {
      type: 'array',
      items: {
        type: 'object',
        required: ['fileName', 'format'],
        properties: {
          fileName: { type: 'string' },
          format: { type: 'string' },
          pageCount: { type: 'integer' },
          layers: { type: 'array', items: { type: 'string' } },
          discipline: { type: 'string' },
        },
      },
    },
    pages: {
      type: 'array',
      items: {
        type: 'object',
        required: ['sourceFileName', 'pageNumber'],
        properties: {
          sourceFileName: { type: 'string' },
          pageNumber: { type: 'integer', minimum: 1 },
          pageType: { type: 'string' },
          title: { type: 'string' },
          scaleText: { type: 'string' },
          notes: { type: 'string' },
        },
      },
    },
    elements: {
      type: 'array',
      items: {
        type: 'object',
        required: ['elementKey', 'elementType', ...EVIDENCE_REQUIRED],
        properties: {
          ...EVIDENCE_PROPS,
          elementKey: { type: 'string' },
          elementType: { enum: ['beam', 'footing', 'pile', 'column', 'wall', 'slab', 'other'] },
          axisContext: { type: 'string' },
          section: { type: 'string' },
          diameter: { type: 'string' },
          quantity: { type: 'number' },
          reinforcement: {
            type: 'object',
            properties: {
              longitudinalBars: { type: 'array', items: REINFORCEMENT_ENTRY_SCHEMA },
              stirrups: { type: 'array', items: REINFORCEMENT_ENTRY_SCHEMA },
              hooks: { type: 'array', items: REINFORCEMENT_ENTRY_SCHEMA },
              laps: { type: 'array', items: REINFORCEMENT_ENTRY_SCHEMA },
            },
          },
          tableReference: { type: 'string' },
          detailReference: { type: 'string' },
          instances: {
            type: 'array',
            items: {
              type: 'object',
              required: ['x', 'y'],
              properties: {
                x: { type: 'number' },
                y: { type: 'number' },
                blockName: { type: 'string' },
                layer: { type: 'string' },
              },
            },
          },
          unresolvedFields: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    tableRows: {
      type: 'array',
      items: {
        type: 'object',
        required: ['tableReference', 'cells', ...EVIDENCE_REQUIRED],
        properties: {
          ...EVIDENCE_PROPS,
          tableReference: { type: 'string' },
          rowIndex: { type: 'integer' },
          cells: { type: 'array', items: { type: 'string' } },
          elementKey: { type: 'string' },
        },
      },
    },
    axisContext: {
      type: 'array',
      items: {
        type: 'object',
        required: ['axisLabel', ...EVIDENCE_REQUIRED],
        properties: {
          ...EVIDENCE_PROPS,
          axisLabel: { type: 'string' },
          orientation: { enum: ['horizontal', 'vertical', 'otro'] },
          position: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' } },
          },
        },
      },
    },
    graphicCounts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['elementKey', 'count', 'basis', ...EVIDENCE_REQUIRED],
        properties: {
          ...EVIDENCE_PROPS,
          elementKey: { type: 'string' },
          count: { type: 'integer', minimum: 0 },
          basis: { type: 'string' },
        },
      },
    },
    textCounts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['elementKey', 'count', 'basis', ...EVIDENCE_REQUIRED],
        properties: {
          ...EVIDENCE_PROPS,
          elementKey: { type: 'string' },
          count: { type: 'integer', minimum: 0 },
          basis: { type: 'string' },
        },
      },
    },
    discrepancies: {
      type: 'array',
      items: {
        type: 'object',
        required: ['kind', 'description', 'severity', ...EVIDENCE_REQUIRED],
        properties: {
          ...EVIDENCE_PROPS,
          kind: {
            enum: [
              'graphic_vs_text_count',
              'dimension_sum_mismatch',
              'cross_document_conflict',
              'symbol_without_legend',
              'other',
            ],
          },
          elementKey: { type: 'string' },
          description: { type: 'string' },
          expected: { type: 'string' },
          found: { type: 'string' },
          severity: { enum: ['info', 'warning', 'critical'] },
        },
      },
    },
    unresolvedNomenclature: {
      type: 'array',
      items: {
        type: 'object',
        required: ['symbol', 'reason', ...EVIDENCE_REQUIRED],
        properties: {
          ...EVIDENCE_PROPS,
          symbol: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
    sourceEvidence: {
      type: 'array',
      items: {
        type: 'object',
        required: [...EVIDENCE_REQUIRED],
        properties: { ...EVIDENCE_PROPS },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Validación estructural mínima (sin dependencias)
// ---------------------------------------------------------------------------

/**
 * Verifica los invariantes NO negociables de un documento steel-ext-2 sin
 * traer un validador JSON Schema como dependencia: versión, documentos
 * fuente, y que cada elemento porte su evidencia completa. Devuelve la lista
 * de violaciones (vacía = ok).
 */
export function validateSteelExt2Invariants(doc: SteelExt2Document): string[] {
  const issues: string[] = [];
  if (doc.schemaVersion !== STEEL_EXT2_SCHEMA_VERSION) {
    issues.push(`schemaVersion debe ser "${STEEL_EXT2_SCHEMA_VERSION}"`);
  }
  if (!Array.isArray(doc.sourceDocuments) || doc.sourceDocuments.length === 0) {
    issues.push('sourceDocuments no puede estar vacío');
  }
  const checkEvidence = (label: string, ev: Ext2Evidence) => {
    if (!ev.sourceFileName) issues.push(`${label}: falta sourceFileName`);
    if (!Number.isInteger(ev.pageNumber) || ev.pageNumber < 1) issues.push(`${label}: pageNumber inválido`);
    if (!ev.evidenceText) issues.push(`${label}: falta evidenceText`);
    if (typeof ev.confidence !== 'number' || ev.confidence < 0 || ev.confidence > 1) {
      issues.push(`${label}: confidence fuera de 0–1`);
    }
    if (ev.needsReview !== true) issues.push(`${label}: needsReview debe ser true al importar (jamás auto-aprobar)`);
  };
  for (const el of doc.elements ?? []) checkEvidence(`elemento ${el.elementKey}`, el);
  for (const d of doc.discrepancies ?? []) checkEvidence(`discrepancia ${d.kind}`, d);
  for (const g of doc.graphicCounts ?? []) checkEvidence(`graphicCount ${g.elementKey}`, g);
  for (const t of doc.textCounts ?? []) checkEvidence(`textCount ${t.elementKey}`, t);
  return issues;
}
