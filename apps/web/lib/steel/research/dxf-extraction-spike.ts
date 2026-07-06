/**
 * dxf-extraction-spike.ts — Prototipo aislado de motor CAD/DXF (F8, spike).
 *
 * ⚠️ RESEARCH SPIKE (F8 — AEC Extraction Engine). NO cableado a UI, actions
 * ni exports de producción; nada del app principal lo importa. Objetivo:
 * demostrar con CERO dependencias nuevas que leer ENTIDADES CAD reales
 * (texto, capas, bloques, coordenadas) supera estructuralmente al pipeline
 * PDF/OCR: el DXF trae el texto exacto, la capa que dice QUÉ es cada cosa,
 * y las inserciones de bloque que permiten CONTAR instancias dibujadas.
 *
 * Alcance deliberadamente mínimo (spike, no producto):
 * - Parser de DXF ASCII (pares código-de-grupo/valor) para la sección
 *   ENTITIES: TEXT, MTEXT, INSERT y LWPOLYLINE. El formato DXF ASCII es
 *   público (Autodesk DXF Reference) y parsearlo no requiere librería.
 * - Fixture SINTÉTICO generado por código (jamás un plano real en el repo).
 * - Salida en schema steel-ext-2 con evidencia completa, método
 *   `dxf_entity`, needsReview=true siempre (jamás auto-aprobar).
 * - Demostración de la detección de discrepancias conteo gráfico vs texto.
 *
 * Producción real usaría `ezdxf` (Python, MIT) o el conversor ODA para
 * DWG→DXF — ver Parte B/C del doc F8. La licencia de este spike es la del
 * repo: es código propio, sin copiar nada de terceros.
 */
import { extractElementMentions, type ElementKind } from '../drawing-element-registry';
import {
  STEEL_EXT2_SCHEMA_VERSION,
  type Ext2Discrepancy,
  type Ext2Element,
  type Ext2GraphicCount,
  type Ext2TextCount,
  type SteelExt2Document,
} from '../structural-extraction-v2';

// ---------------------------------------------------------------------------
// Parser DXF ASCII mínimo
// ---------------------------------------------------------------------------

export interface DxfGroupPair {
  code: number;
  value: string;
}

/** Divide un DXF ASCII en pares (código de grupo, valor). */
export function parseDxfGroupPairs(dxfText: string): DxfGroupPair[] {
  const lines = dxfText.split(/\r?\n/);
  const pairs: DxfGroupPair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const codeLine = lines[i];
    const valueLine = lines[i + 1];
    if (codeLine === undefined || valueLine === undefined) continue;
    const code = Number.parseInt(codeLine.trim(), 10);
    if (Number.isNaN(code)) continue;
    pairs.push({ code, value: valueLine });
  }
  return pairs;
}

export interface DxfTextEntity {
  type: 'TEXT' | 'MTEXT';
  text: string;
  layer: string;
  x?: number;
  y?: number;
  height?: number;
}

export interface DxfInsertEntity {
  type: 'INSERT';
  blockName: string;
  layer: string;
  x?: number;
  y?: number;
}

export interface DxfPolylineEntity {
  type: 'LWPOLYLINE';
  layer: string;
  vertexCount: number;
}

export type DxfEntity = DxfTextEntity | DxfInsertEntity | DxfPolylineEntity;

export interface DxfParseResult {
  entities: DxfEntity[];
  layers: string[];
}

/** Limpia códigos de formato MTEXT básicos (\P = salto de línea, llaves). */
function cleanMtext(raw: string): string {
  return raw.replace(/\\P/g, '\n').replace(/[{}]/g, '').replace(/\\[A-Za-z][^;]*;/g, '');
}

/**
 * Extrae entidades de la sección ENTITIES de un DXF ASCII. Soporta el
 * subconjunto que el spike necesita: TEXT (1=texto, 8=capa, 10/20=x/y,
 * 40=alto), MTEXT (1 + continuaciones 3), INSERT (2=bloque) y LWPOLYLINE
 * (90=n.º de vértices). Todo lo demás se ignora sin fallar.
 */
export function parseDxfEntities(dxfText: string): DxfParseResult {
  const pairs = parseDxfGroupPairs(dxfText);
  const entities: DxfEntity[] = [];
  const layers = new Set<string>();

  let inEntities = false;
  let current: Record<string, string> | null = null;
  let currentType = '';
  let mtextParts: string[] = [];

  const flush = () => {
    if (!current) return;
    const layer = current['8'] ?? '0';
    if (layer) layers.add(layer);
    const x = current['10'] !== undefined ? Number.parseFloat(current['10']) : undefined;
    const y = current['20'] !== undefined ? Number.parseFloat(current['20']) : undefined;
    if (currentType === 'TEXT' && current['1'] !== undefined) {
      entities.push({
        type: 'TEXT',
        text: current['1'],
        layer,
        x,
        y,
        height: current['40'] !== undefined ? Number.parseFloat(current['40']) : undefined,
      });
    } else if (currentType === 'MTEXT') {
      const raw = [...mtextParts, current['1'] ?? ''].join('');
      if (raw.length > 0) {
        entities.push({ type: 'MTEXT', text: cleanMtext(raw), layer, x, y });
      }
    } else if (currentType === 'INSERT' && current['2'] !== undefined) {
      entities.push({ type: 'INSERT', blockName: current['2'], layer, x, y });
    } else if (currentType === 'LWPOLYLINE') {
      entities.push({
        type: 'LWPOLYLINE',
        layer,
        vertexCount: current['90'] !== undefined ? Number.parseInt(current['90'], 10) : 0,
      });
    }
    current = null;
    currentType = '';
    mtextParts = [];
  };

  for (const pair of pairs) {
    if (pair.code === 2 && !inEntities && pair.value === 'ENTITIES') {
      inEntities = true;
      continue;
    }
    if (!inEntities) continue;
    if (pair.code === 0) {
      flush();
      if (pair.value === 'ENDSEC') {
        inEntities = false;
        continue;
      }
      currentType = pair.value;
      current = {};
      continue;
    }
    if (!current) continue;
    if (currentType === 'MTEXT' && pair.code === 3) {
      mtextParts.push(pair.value);
      continue;
    }
    if (pair.code === 2 && currentType === 'INSERT') {
      current['2'] = pair.value;
      continue;
    }
    current[String(pair.code)] = pair.value;
  }
  flush();

  return { entities, layers: [...layers].sort() };
}

// ---------------------------------------------------------------------------
// Fixture sintético (generado por código — jamás planos reales)
// ---------------------------------------------------------------------------

function textEntity(text: string, layer: string, x: number, y: number, height = 2.5): string {
  return ['0', 'TEXT', '8', layer, '10', String(x), '20', String(y), '40', String(height), '1', text].join('\n');
}

function insertEntity(blockName: string, layer: string, x: number, y: number): string {
  return ['0', 'INSERT', '8', layer, '2', blockName, '10', String(x), '20', String(y)].join('\n');
}

function mtextEntity(text: string, layer: string, x: number, y: number): string {
  return ['0', 'MTEXT', '8', layer, '10', String(x), '20', String(y), '1', text].join('\n');
}

/**
 * DXF sintético de una planta de cimentación mínima, con el patrón de
 * discrepancia real reportado por la usuaria: el cuadro dice 4 zapatas
 * Z-01 pero solo hay 3 inserciones de bloque dibujadas.
 */
export function buildSyntheticFoundationDxf(): string {
  const parts: string[] = ['0', 'SECTION', '2', 'ENTITIES'].join('\n').split('\n');
  const chunks = [
    // Ejes
    textEntity('EJE 1', 'EJES', 0, 100),
    textEntity('EJE A', 'EJES', -10, 0),
    // Vigas de cimentación: etiqueta + sección en capa propia
    textEntity('VC-2 (50x60)', 'CIM-VIGAS-TEXTO', 40, 52),
    mtextEntity('VIGA DE CIMENTACION VC-2\\P4#5 L=6.00\\PE#3@15', 'CIM-VIGAS-TEXTO', 40, 48),
    // Zapatas dibujadas: 3 inserciones del bloque tipo
    insertEntity('ZAPATA_TIPO_1', 'ZAPATAS', 0, 0),
    insertEntity('ZAPATA_TIPO_1', 'ZAPATAS', 50, 0),
    insertEntity('ZAPATA_TIPO_1', 'ZAPATAS', 100, 0),
    textEntity('Z-01', 'ZAPATAS-TEXTO', 2, 3),
    textEntity('Z-01', 'ZAPATAS-TEXTO', 52, 3),
    textEntity('Z-01', 'ZAPATAS-TEXTO', 102, 3),
    // Pilote
    insertEntity('PILOTE_D60', 'PILOTES', 25, -20),
    textEntity('P-03 Ø60', 'PILOTES-TEXTO', 27, -18),
    // Cuadro de zapatas (texto de tabla): declara CANT 4 ⇒ discrepancia
    textEntity('CUADRO DE ZAPATAS', 'TABLAS', 200, 100),
    textEntity('Z-01 | 1.20x1.20 | CANT: 4', 'TABLAS', 200, 95),
    // Rótulo (ruido que el motor NO debe volver elemento)
    textEntity('ING. RESPONSABLE: N.N. — CALLE 10 # 5-20', 'ROTULO', 300, -50),
  ];
  parts.push(...chunks);
  parts.push('0', 'ENDSEC', '0', 'EOF');
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Candidatos estructurales desde entidades DXF
// ---------------------------------------------------------------------------

const KIND_TO_EXT2: Record<ElementKind, Ext2Element['elementType']> = {
  viga: 'beam',
  zapata: 'footing',
  pilote: 'pile',
  columna: 'column',
  muro: 'wall',
  losa: 'slab',
  otro: 'other',
};

/** Capas cuyo texto es rotulado/administrativo, no elementos. */
const NOISE_LAYER_PATTERN = /ROTUL|TITLE|CARATULA|MEMBRETE/i;

export interface DxfElementCandidate {
  elementKey: string;
  elementType: Ext2Element['elementType'];
  layer: string;
  x?: number;
  y?: number;
  evidenceText: string;
  section?: string;
  diameter?: string;
}

/**
 * Detecta candidatos de elemento en textos DXF reutilizando el registro F7
 * (mismas nomenclaturas VC-2 / Z-01 / P-03 / PILOTE Ø60). El texto de capas
 * de rótulo se descarta como ruido — en CAD la capa lo dice explícitamente,
 * sin heurística de posición como en PDF.
 */
export function extractDxfElementCandidates(entities: DxfEntity[]): DxfElementCandidate[] {
  const out: DxfElementCandidate[] = [];
  for (const entity of entities) {
    if (entity.type !== 'TEXT' && entity.type !== 'MTEXT') continue;
    if (NOISE_LAYER_PATTERN.test(entity.layer)) continue;
    for (const line of entity.text.split('\n')) {
      for (const mention of extractElementMentions(line)) {
        const section = /\((\d+\s*[xX]\s*\d+)\)/.exec(line)?.[1];
        const diameter = /Ø\s*(\d+)/.exec(line)?.[0];
        out.push({
          elementKey: mention.elementKey,
          elementType: KIND_TO_EXT2[mention.kind ?? 'otro'],
          layer: entity.layer,
          x: entity.x,
          y: entity.y,
          evidenceText: line.trim(),
          section: section?.replace(/\s+/g, ''),
          diameter,
        });
      }
    }
  }
  return out;
}

/** Cuenta inserciones de bloque por nombre (conteo GRÁFICO real). */
export function countBlockInserts(entities: DxfEntity[]): Map<string, DxfInsertEntity[]> {
  const byBlock = new Map<string, DxfInsertEntity[]>();
  for (const entity of entities) {
    if (entity.type !== 'INSERT') continue;
    const list = byBlock.get(entity.blockName) ?? [];
    list.push(entity);
    byBlock.set(entity.blockName, list);
  }
  return byBlock;
}

/** Extrae conteos declarados en texto tipo "Z-01 … CANT: 4". */
export function extractTextCounts(entities: DxfEntity[]): Array<{ elementKey: string; count: number; evidenceText: string; layer: string }> {
  const out: Array<{ elementKey: string; count: number; evidenceText: string; layer: string }> = [];
  for (const entity of entities) {
    if (entity.type !== 'TEXT' && entity.type !== 'MTEXT') continue;
    const m = /CANT\.?\s*:?\s*(\d+)/i.exec(entity.text);
    if (!m) continue;
    const mention = extractElementMentions(entity.text)[0];
    if (!mention) continue;
    out.push({
      elementKey: mention.elementKey,
      count: Number.parseInt(m[1] ?? '0', 10),
      evidenceText: entity.text.trim(),
      layer: entity.layer,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// DXF → steel-ext-2
// ---------------------------------------------------------------------------

/** Confianza de texto CAD nativo: exacto por construcción, pero el mapeo texto→elemento sigue siendo heurístico. */
const DXF_TEXT_CONFIDENCE = 0.95;

interface BlockKeyLink {
  /** Nombre de bloque CAD ("ZAPATA_TIPO_1"). */
  blockName: string;
  /** Código de elemento al que corresponde ("Z-01"). */
  elementKey: string;
}

/**
 * Asocia bloques a códigos por cercanía textual mínima del spike: el texto
 * de código más cercano a cada inserción (misma "familia" de capa). En
 * producción esta asociación sería configurable/supervisada.
 */
export function linkBlocksToKeys(entities: DxfEntity[]): BlockKeyLink[] {
  const inserts = countBlockInserts(entities);
  const texts = entities.filter((e): e is DxfTextEntity => e.type === 'TEXT' || e.type === 'MTEXT');
  const links: BlockKeyLink[] = [];
  for (const [blockName, instances] of inserts) {
    let best: { key: string; dist: number } | undefined;
    for (const instance of instances) {
      if (instance.x === undefined || instance.y === undefined) continue;
      for (const text of texts) {
        if (text.x === undefined || text.y === undefined) continue;
        const mention = extractElementMentions(text.text)[0];
        if (!mention) continue;
        const dist = Math.hypot(text.x - instance.x, text.y - instance.y);
        if (!best || dist < best.dist) best = { key: mention.elementKey, dist };
      }
    }
    if (best) links.push({ blockName, elementKey: best.key });
  }
  return links;
}

/**
 * Convierte el resultado del parser DXF a un documento steel-ext-2 con
 * evidencia completa, conteos gráfico/texto separados y discrepancias
 * detectadas. Jamás aprueba nada: todo sale con needsReview=true.
 */
export function dxfToSteelExt2(dxfText: string, sourceFileName: string): SteelExt2Document {
  const { entities, layers } = parseDxfEntities(dxfText);
  const candidates = extractDxfElementCandidates(entities);
  const blockLinks = linkBlocksToKeys(entities);
  const inserts = countBlockInserts(entities);
  const textCounts = extractTextCounts(entities);

  const evidenceBase = {
    sourceFileName,
    pageNumber: 1,
    method: 'dxf_entity' as const,
    confidence: DXF_TEXT_CONFIDENCE,
    needsReview: true,
  };

  // Elementos únicos por clave canónica, con sus instancias dibujadas.
  const byKey = new Map<string, Ext2Element>();
  for (const c of candidates) {
    const existing = byKey.get(c.elementKey);
    if (existing) {
      if (!existing.section && c.section) existing.section = c.section;
      if (!existing.diameter && c.diameter) existing.diameter = c.diameter;
      continue;
    }
    byKey.set(c.elementKey, {
      ...evidenceBase,
      elementKey: c.elementKey,
      elementType: c.elementType,
      region: `layer:${c.layer}`,
      evidenceText: c.evidenceText,
      section: c.section,
      diameter: c.diameter,
      instances: [],
    });
  }
  for (const link of blockLinks) {
    const el = byKey.get(link.elementKey);
    if (!el) continue;
    for (const instance of inserts.get(link.blockName) ?? []) {
      el.instances?.push({
        x: instance.x ?? 0,
        y: instance.y ?? 0,
        blockName: link.blockName,
        layer: instance.layer,
      });
    }
  }

  const graphicCounts: Ext2GraphicCount[] = blockLinks.map((link) => ({
    ...evidenceBase,
    elementKey: link.elementKey,
    count: inserts.get(link.blockName)?.length ?? 0,
    basis: `INSERT block ${link.blockName}`,
    region: `layer:${inserts.get(link.blockName)?.[0]?.layer ?? '0'}`,
    evidenceText: `${inserts.get(link.blockName)?.length ?? 0} inserciones de ${link.blockName}`,
  }));

  const textCountDocs: Ext2TextCount[] = textCounts.map((tc) => ({
    ...evidenceBase,
    elementKey: tc.elementKey,
    count: tc.count,
    basis: 'texto de cuadro/listado',
    region: `layer:${tc.layer}`,
    evidenceText: tc.evidenceText,
  }));

  // Discrepancias: conteo gráfico vs conteo textual por elemento.
  const discrepancies: Ext2Discrepancy[] = [];
  for (const tc of textCountDocs) {
    const gc = graphicCounts.find((g) => g.elementKey === tc.elementKey);
    if (!gc || gc.count === tc.count) continue;
    discrepancies.push({
      ...evidenceBase,
      kind: 'graphic_vs_text_count',
      elementKey: tc.elementKey,
      description: `${tc.elementKey}: ${gc.count} instancias dibujadas vs ${tc.count} declaradas en cuadro`,
      expected: String(tc.count),
      found: String(gc.count),
      severity: 'critical',
      region: tc.region,
      evidenceText: `${gc.evidenceText} / ${tc.evidenceText}`,
    });
  }

  return {
    schemaVersion: STEEL_EXT2_SCHEMA_VERSION,
    tool: 'dxf-spike',
    sourceDocuments: [{ fileName: sourceFileName, format: 'dxf', layers }],
    elements: [...byKey.values()],
    graphicCounts,
    textCounts: textCountDocs,
    discrepancies,
  };
}
