/**
 * dxf-parser.ts — Lector de DXF ASCII en el navegador (F8A, puro).
 *
 * Lee la sección ENTITIES de un DXF ASCII (pares código-de-grupo/valor,
 * formato público de Autodesk) sin dependencias: TEXT, MTEXT, INSERT,
 * LINE/LWPOLYLINE y DIMENSION, con capa, handle, coordenadas y rotación.
 * El archivo JAMÁS sale del navegador (mismo principio que pdfjs/tesseract).
 *
 * Honestidad ante lo no soportado: DXF binario, vacío o ilegible devuelve
 * un error AMABLE (`ok: false` + mensaje accionable), nunca un crash.
 */
import { normalizeDrawingText } from '../drawing-spatial-model';
import {
  computeDxfEntityStats,
  type DxfEntity,
  type DxfEntityStats,
} from './dxf-entities';

export const DXF_NOT_ASCII_MESSAGE =
  'Este DXF no parece ASCII o no es legible por el lector actual. Exporta nuevamente como DXF ASCII desde AutoCAD (SAVEAS → DXF) o convierte el DWG con ODA File Converter.';

export const DXF_NO_ENTITIES_MESSAGE =
  'El DXF se leyó pero no trae sección ENTITIES con contenido. Verifica que el export incluya el dibujo (no solo plantillas/bloques).';

export interface DxfParseSuccess {
  ok: true;
  entities: readonly DxfEntity[];
  /** Capas presentes en ENTITIES, ordenadas. */
  layers: readonly string[];
  /** Entidades por capa (para evaluar organización del dibujo). */
  entitiesPerLayer: ReadonlyMap<string, number>;
  stats: DxfEntityStats;
}

export interface DxfParseFailure {
  ok: false;
  message: string;
}

export type DxfParseResult = DxfParseSuccess | DxfParseFailure;

// ---------------------------------------------------------------------------
// Pares código/valor
// ---------------------------------------------------------------------------

interface GroupPair {
  code: number;
  value: string;
}

function parseGroupPairs(content: string): GroupPair[] {
  const lines = content.split(/\r?\n/);
  const pairs: GroupPair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const codeLine = lines[i];
    const valueLine = lines[i + 1];
    if (codeLine === undefined || valueLine === undefined) continue;
    const code = Number.parseInt(codeLine.trim(), 10);
    if (Number.isNaN(code)) continue;
    pairs.push({ code, value: valueLine.trim() });
  }
  return pairs;
}

/**
 * Decodifica texto DXF: códigos AutoCAD (%%c = Ø, %%d = °, %%p = ±),
 * saltos MTEXT (\P) y códigos de formato inline básicos.
 */
export function decodeDxfText(raw: string): string {
  return raw
    .replace(/%%[cC]/g, 'Ø')
    .replace(/%%[dD]/g, '°')
    .replace(/%%[pP]/g, '±')
    .replace(/\\P/g, '\n')
    .replace(/\\[A-Za-z][^;\\]*;/g, '')
    .replace(/[{}]/g, '');
}

// ---------------------------------------------------------------------------
// Parser principal
// ---------------------------------------------------------------------------

/** Señales de contenido binario/no-DXF: bytes de control o marca binaria. */
function looksBinaryOrUnreadable(content: string): boolean {
  if (content.length === 0) return true;
  if (content.startsWith('AutoCAD Binary DXF')) return true;
  // Bytes de control (fuera de \t\r\n) en la muestra inicial ⇒ binario.
  const sample = content.slice(0, 4096);
  let controlChars = 0;
  for (const ch of sample) {
    const code = ch.charCodeAt(0);
    if (code === 0) return true;
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) controlChars += 1;
  }
  return controlChars > 8;
}

const SUPPORTED_TYPES = new Set(['TEXT', 'MTEXT', 'INSERT', 'LINE', 'LWPOLYLINE', 'DIMENSION', 'CIRCLE']);

/**
 * Parsea un DXF ASCII. Solo procesa la sección ENTITIES (los bloques
 * definidos en BLOCKS no son instancias dibujadas; las inserciones INSERT
 * sí). Entidades no soportadas se ignoran sin fallar.
 */
export function parseDxfFile(content: string): DxfParseResult {
  if (looksBinaryOrUnreadable(content)) {
    return { ok: false, message: DXF_NOT_ASCII_MESSAGE };
  }

  const pairs = parseGroupPairs(content);
  if (pairs.length === 0) {
    return { ok: false, message: DXF_NOT_ASCII_MESSAGE };
  }

  const entities: DxfEntity[] = [];
  const entitiesPerLayer = new Map<string, number>();

  let currentSection = '';
  let expectingSectionName = false;
  let currentType = '';
  let fields: Record<string, string> | null = null;
  let mtextParts: string[] = [];

  const num = (value: string | undefined): number | undefined => {
    if (value === undefined) return undefined;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const flush = () => {
    if (!fields || !SUPPORTED_TYPES.has(currentType)) {
      fields = null;
      currentType = '';
      mtextParts = [];
      return;
    }
    const layer = fields['8'] ?? '0';
    const handle = fields['5'];
    const colorIndex = fields['62'] !== undefined ? Number.parseInt(fields['62'], 10) : undefined;
    const trueColor = fields['420'] !== undefined ? Number.parseInt(fields['420'], 10) : undefined;
    const base = {
      layer,
      handle,
      colorIndex: Number.isFinite(colorIndex) ? colorIndex : undefined,
      trueColor: Number.isFinite(trueColor) ? trueColor : undefined,
    };
    const x = num(fields['10']);
    const y = num(fields['20']);
    const z = num(fields['30']);
    const rotation = num(fields['50']);

    let entity: DxfEntity | null = null;
    if (currentType === 'TEXT' && fields['1'] !== undefined) {
      const rawText = decodeDxfText(fields['1']);
      entity = {
        ...base,
        type: 'TEXT',
        rawText,
        normalizedText: normalizeDrawingText(rawText),
        x,
        y,
        z,
        rotation,
        height: num(fields['40']),
      };
    } else if (currentType === 'MTEXT') {
      const raw = decodeDxfText([...mtextParts, fields['1'] ?? ''].join(''));
      if (raw.trim().length > 0) {
        entity = {
          ...base,
          type: 'MTEXT',
          rawText: raw,
          normalizedText: normalizeDrawingText(raw),
          x,
          y,
          z,
          rotation,
          height: num(fields['40']),
        };
      }
    } else if (currentType === 'INSERT' && fields['2'] !== undefined) {
      entity = { ...base, type: 'INSERT', blockName: fields['2'], x, y, z, rotation };
    } else if (currentType === 'LINE') {
      entity = { ...base, type: 'LINE', vertexCount: 2, x, y, x2: num(fields['11']), y2: num(fields['21']) };
    } else if (currentType === 'LWPOLYLINE') {
      entity = { ...base, type: 'LWPOLYLINE', vertexCount: num(fields['90']) ?? 0, x, y };
    } else if (currentType === 'DIMENSION') {
      const override = fields['1'] !== undefined ? decodeDxfText(fields['1']) : undefined;
      entity = {
        ...base,
        type: 'DIMENSION',
        overrideText: override && override !== '<>' ? override : undefined,
        measurement: num(fields['42']),
      };
    } else if (currentType === 'CIRCLE') {
      entity = { ...base, type: 'CIRCLE', x, y, radius: num(fields['40']) };
    }

    if (entity) {
      entities.push(entity);
      entitiesPerLayer.set(entity.layer, (entitiesPerLayer.get(entity.layer) ?? 0) + 1);
    }
    fields = null;
    currentType = '';
    mtextParts = [];
  };

  for (const pair of pairs) {
    if (pair.code === 0) {
      flush();
      if (pair.value === 'SECTION') {
        expectingSectionName = true;
        currentSection = '';
        continue;
      }
      if (pair.value === 'ENDSEC') {
        currentSection = '';
        continue;
      }
      if (currentSection === 'ENTITIES') {
        currentType = pair.value;
        fields = {};
      }
      continue;
    }
    if (expectingSectionName && pair.code === 2) {
      currentSection = pair.value;
      expectingSectionName = false;
      continue;
    }
    if (!fields) continue;
    if (currentType === 'MTEXT' && pair.code === 3) {
      mtextParts.push(pair.value);
      continue;
    }
    // Primer valor gana para códigos repetidos (10/20 de vértices extra de
    // LWPOLYLINE no pisan el punto inicial).
    if (fields[String(pair.code)] === undefined) {
      fields[String(pair.code)] = pair.value;
    }
  }
  flush();

  if (entities.length === 0) {
    return { ok: false, message: DXF_NO_ENTITIES_MESSAGE };
  }

  return {
    ok: true,
    entities,
    layers: [...entitiesPerLayer.keys()].sort(),
    entitiesPerLayer,
    stats: computeDxfEntityStats(entities),
  };
}
