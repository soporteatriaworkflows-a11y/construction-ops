/**
 * parse.ts — Parser server-side del Excel de BOQ (formato Golden Master v1, 4C.1).
 *
 * Propiedad: agent-excel-mapper (integrado por el orquestador). Contrato:
 * `docs/EXCEL_IMPORT_CONTRACT.md §1,§3`.
 *
 * SOLO server-side (usa `xlsx`/SheetJS, `decimal.js`, `node:crypto`). SheetJS lee
 * los valores cacheados de las celdas; **NO evalúa fórmulas ni ejecuta macros**.
 *
 * Hoja canónica `COTIZACION 1 PISO`. El layout esperado es A=code, B=description,
 * C=unit, D=quantity, E=unit_price, F=subtotal, pero las columnas se mapean por
 * **encabezado** (no por posición): si faltan los encabezados obligatorios, se
 * bloquea (sin fallback por posición).
 *
 * Convención de filas (congelada v1):
 *  - CHAPTER: tiene `code` + `description` y `unit`/`quantity`/`unit_price` vacíos.
 *  - ITEM:    tiene `code` + `description` + `unit` y `quantity`/`unit_price` numéricos;
 *             pertenece al último capítulo leído.
 *  - Fila totalmente vacía: se ignora.
 *
 * `subtotal` SIEMPRE se recalcula server-side (`quantity × unit_price`, Decimal);
 * la columna F del Excel solo se compara para advertir (no se persiste).
 */
import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import * as XLSX from 'xlsx';
import type { DecimalString } from '@/lib/utils/types';
import { EXPECTED_SHEET, IMPORT_LIMITS, type ImportPreview, type ImportIssue } from '@/lib/import/types';

/** Payload normalizado que consume la RPC (server-only; no client-safe). */
export interface NormalizedChapter {
  code: string;
  name: string;
  sortOrder: number;
}
export interface NormalizedItem {
  chapterCode: string;
  code: string;
  description: string;
  unit: string;
  quantity: DecimalString;
  unitPrice: DecimalString;
  sortOrder: number;
}
export interface NormalizedImport {
  chapters: NormalizedChapter[];
  items: NormalizedItem[];
}

/** Resultado completo del parse (preview client-safe + payload server-only). */
export interface ParseResult {
  preview: ImportPreview;
  normalized: NormalizedImport;
}

/** Error de parsing/validación bloqueante (mensaje sanitizado, sin contenido privado). */
export class ExcelParseError extends Error {
  readonly code = 'excel_parse' as const;
  /** Hojas detectadas (para ayudar a corregir); nombres de hoja no son privados. */
  readonly detectedSheets?: string[];
  constructor(message: string, detectedSheets?: string[]) {
    super(message);
    this.name = 'ExcelParseError';
    this.detectedSheets = detectedSheets;
  }
}

const HEADER_SYNONYMS: Record<string, string[]> = {
  // `code` = columna ÍTEM (no la auxiliar CAP). La columna `CAP` NO tiene sinónimo
  // ⇒ queda sin mapear y se ignora (solo metadato visual).
  code: ['code', 'codigo', 'item', 'no', 'no.'],
  description: ['description', 'descripcion', 'actividad', 'concepto', 'detalle'],
  unit: ['unit', 'unidad', 'und', 'un'],
  quantity: ['quantity', 'cantidad', 'cant', 'cant.'],
  unitPrice: ['unit_price', 'unitprice', 'v/unitario', 'vr unitario', 'vr. unitario', 'valor unitario', 'precio unitario', 'punit'],
  // Incluye `VR. PARCIAL` (plantilla real) además de los sinónimos de total.
  subtotal: ['subtotal', 'sub_total', 'v/total', 'vr total', 'vr. total', 'valor total', 'total', 'vr parcial', 'vr. parcial', 'v/parcial', 'valor parcial', 'parcial'],
};
const REQUIRED_FIELDS = ['code', 'description', 'unit', 'quantity', 'unitPrice'] as const;

/**
 * Filas de cierre/sumario que NO son capítulos ni ítems. Se comparan contra la
 * DESCRIPCIÓN normalizada (sin tildes, minúsculas, prefijo). Tratamiento:
 *  - `SUBTOTAL ...`              → ignorar (sumario de capítulo).
 *  - `TOTAL COSTOS DIRECTOS`     → cierra la lectura del BOQ directo.
 *  - AIU / control de pagos / actas → ignorar (fuera de alcance 4C.2).
 */
const RESERVED = {
  subtotalChapter: ['subtotal capitulo', 'subtotal', 'sub total capitulo', 'subtotal cap'],
  endOfDirect: ['total costos directos', 'total costo directo', 'total directo'],
  afterDirect: [
    'administracion',
    'imprevistos',
    'utilidad',
    'utilidades',
    'iva sobre utilidad',
    'iva',
    'costos indirectos',
    'total costo',
    'total costos',
    'control de pagos',
    'anticipo',
    'actas',
    'acta',
    'liquidacion',
  ],
};

function startsWithAny(value: string, prefixes: string[]): boolean {
  return prefixes.some((p) => value === p || value.startsWith(p + ' ') || value.startsWith(p));
}

function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function matchHeader(cell: unknown): string | null {
  const v = norm(cell).replace(/\.$/, '');
  for (const [field, syns] of Object.entries(HEADER_SYNONYMS)) {
    if (syns.some((s) => s.replace(/\.$/, '') === v)) return field;
  }
  return null;
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === '';
}

function toDecimalString(v: unknown): string | null {
  if (isBlank(v)) return null;
  const raw = String(v).trim().replace(/\s/g, '');
  // Acepta coma o punto decimal; separador de miles con coma o punto se descarta
  // solo si es inequívoco. Para v1 se exige punto decimal o entero; coma → punto.
  const normalized = raw.replace(/,/g, '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return normalized;
}

/**
 * Parsea un workbook `.xlsx` (buffer) al payload normalizado + preview.
 * @throws ExcelParseError ante hoja/encabezados ausentes o filas inválidas.
 */
export function parseBoqWorkbook(buffer: Buffer, fileName: string): ParseResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellFormula: false, cellHTML: false });
  } catch {
    throw new ExcelParseError('El archivo no es un .xlsx válido o está dañado.');
  }

  const sheetName = wb.SheetNames.find((n) => norm(n) === norm(EXPECTED_SHEET));
  if (!sheetName) {
    throw new ExcelParseError(
      `No se encontró la hoja requerida "${EXPECTED_SHEET}".`,
      wb.SheetNames.map((n) => n.trim()),
    );
  }

  const worksheet = wb.Sheets[sheetName];
  if (!worksheet) {
    throw new ExcelParseError(`No se pudo leer la hoja "${EXPECTED_SHEET}".`);
  }
  // `blankrows: true` PRESERVA las filas vacías ⇒ el índice del array mapea 1:1 a la
  // fila REAL de Excel (índice i → fila i+1). Imprescindible para reportar la fila
  // visible correcta (antes se descartaban blancos y el número se desfasaba).
  const rows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: true,
    blankrows: true,
    defval: null,
  });

  // Localiza la fila de encabezados (primeras 25 filas) y mapea columnas por nombre.
  let headerRowIdx = -1;
  let colMap: Record<string, number> = {};
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const map: Record<string, number> = {};
    rows[i]!.forEach((cell, c) => {
      const f = matchHeader(cell);
      if (f && map[f] === undefined) map[f] = c;
    });
    if (REQUIRED_FIELDS.every((f) => map[f] !== undefined)) {
      headerRowIdx = i;
      colMap = map;
      break;
    }
  }
  if (headerRowIdx === -1) {
    throw new ExcelParseError(
      'No se reconocieron los encabezados obligatorios (code, description, unit, quantity, unit_price).',
    );
  }

  const get = (row: unknown[], field: string): unknown =>
    colMap[field] === undefined ? null : row[colMap[field]!];

  const warnings: ImportIssue[] = [];
  const errors: ImportIssue[] = [];
  const chapters: NormalizedChapter[] = [];
  const items: NormalizedItem[] = [];
  const itemSubtotals: string[] = [];
  const chapterCodes = new Set<string>();
  const itemCodes = new Set<string>();
  let currentChapter: string | null = null;
  let emptySkipped = 0;
  let afterDirectIgnored = 0;
  let stopped = false;
  const tol = new Decimal(IMPORT_LIMITS.subtotalToleranceCop);
  const safeDesc = (d: string) => (d.length > 80 ? `${d.slice(0, 80)}…` : d);

  // Recorre TODA la hoja (sin detenerse en el primer problema) usando la fila REAL.
  for (let r = headerRowIdx + 1; r < rows.length && !stopped; r++) {
    const excelRow = r + 1; // índice 0-based → fila real de Excel (header alineado)
    const row = rows[r] ?? [];
    const code = isBlank(get(row, 'code')) ? '' : String(get(row, 'code')).trim();
    const description = isBlank(get(row, 'description')) ? '' : String(get(row, 'description')).trim();
    const unit = isBlank(get(row, 'unit')) ? '' : String(get(row, 'unit')).trim();
    const qRaw = get(row, 'quantity');
    const pRaw = get(row, 'unitPrice');
    const descNorm = norm(description);

    // Fila completamente vacía → ignorar.
    if (!code && !description && !unit && isBlank(qRaw) && isBlank(pRaw)) {
      emptySkipped++;
      continue;
    }

    // Palabras reservadas (por descripción), independientes de las demás columnas.
    if (startsWithAny(descNorm, RESERVED.endOfDirect)) {
      stopped = true; // cierra el BOQ directo; lo de abajo (AIU, etc.) se ignora.
      break;
    }
    if (startsWithAny(descNorm, RESERVED.subtotalChapter)) {
      // Sumario de capítulo: ignorar. Opcional: comparar contra el recalculado.
      const fRaw = toDecimalString(get(row, 'subtotal'));
      if (fRaw !== null && currentChapter) {
        const recomputed = items.reduce(
          (acc, it, idx) =>
            it.chapterCode === currentChapter ? acc.plus(new Decimal(itemSubtotals[idx]!)) : acc,
          new Decimal(0),
        );
        if (new Decimal(fRaw).minus(recomputed).abs().greaterThan(tol)) {
          warnings.push({
            row: excelRow,
            kind: 'subtotal_mismatch',
            code: currentChapter,
            message: `El "SUBTOTAL CAPITULO" del Excel difiere del recalculado (se usa el recalculado).`,
          });
        }
      }
      continue;
    }
    if (startsWithAny(descNorm, RESERVED.afterDirect)) {
      afterDirectIgnored++;
      continue;
    }

    const looksItem = !isBlank(qRaw) || !isBlank(pRaw) || unit !== '';

    if (!looksItem) {
      // CHAPTER row
      if (!code) {
        errors.push({ row: excelRow, kind: 'chapter_no_code', description: safeDesc(description), message: 'Capítulo sin código en la columna ÍTEM.' });
        continue;
      }
      if (!description) {
        errors.push({ row: excelRow, kind: 'chapter_no_name', code, message: 'Capítulo sin nombre/descripción.' });
        continue;
      }
      if (code.length > IMPORT_LIMITS.maxCodeLen) {
        errors.push({ row: excelRow, kind: 'too_long', code, message: 'Código de capítulo demasiado largo.' });
        continue;
      }
      if (chapterCodes.has(code)) {
        // Duplicado: la BD exige code único por versión ⇒ BLOQUEANTE (no se normaliza).
        errors.push({ row: excelRow, kind: 'duplicate_chapter', code, description: safeDesc(description), message: `Código de capítulo duplicado "${code}". Corrige el Excel (los códigos de capítulo deben ser únicos).` });
        continue;
      }
      chapterCodes.add(code);
      chapters.push({ code, name: description.slice(0, IMPORT_LIMITS.maxDescriptionLen), sortOrder: chapters.length });
      currentChapter = code;
      if (chapters.length > IMPORT_LIMITS.maxChapters) {
        errors.push({ row: excelRow, kind: 'too_long', message: `Demasiados capítulos (máx ${IMPORT_LIMITS.maxChapters}).` });
        stopped = true;
      }
    } else {
      // ITEM row
      if (!currentChapter) {
        errors.push({ row: excelRow, kind: 'item_no_chapter', code: code || undefined, description: safeDesc(description), message: 'Ítem sin un capítulo previo.' });
        continue;
      }
      if (!code || !description || !unit) {
        errors.push({ row: excelRow, kind: 'item_missing_field', code: code || undefined, description: safeDesc(description), message: 'Ítem sin código, descripción o unidad.' });
        continue;
      }
      const qStr = toDecimalString(qRaw);
      const pStr = toDecimalString(pRaw);
      if (qStr === null || pStr === null) {
        errors.push({ row: excelRow, kind: 'item_non_numeric', code, message: 'Cantidad o precio unitario no numérico.' });
        continue;
      }
      const q = new Decimal(qStr);
      const p = new Decimal(pStr);
      if (q.isNegative() || p.isNegative()) {
        errors.push({ row: excelRow, kind: 'negative_value', code, message: 'Cantidad o precio negativo.' });
        continue;
      }
      if (code.length > IMPORT_LIMITS.maxCodeLen || unit.length > IMPORT_LIMITS.maxUnitLen) {
        errors.push({ row: excelRow, kind: 'too_long', code, message: 'Código o unidad demasiado largo.' });
        continue;
      }
      // Duplicado de ítem: la BD NO lo restringe ⇒ ADVERTENCIA (no se normaliza).
      if (itemCodes.has(code)) {
        warnings.push({ row: excelRow, kind: 'duplicate_item', code, description: safeDesc(description), message: `Código de ítem repetido "${code}" (se importará igual; revisa la numeración).` });
      }
      itemCodes.add(code);

      const subtotal = q.times(p);
      const fRaw = toDecimalString(get(row, 'subtotal'));
      if (fRaw !== null && new Decimal(fRaw).minus(subtotal).abs().greaterThan(tol)) {
        warnings.push({ row: excelRow, kind: 'subtotal_mismatch', code, message: 'El subtotal informado en el Excel difiere del recalculado (se usa el recalculado).' });
      }
      items.push({
        chapterCode: currentChapter,
        code,
        description: description.slice(0, IMPORT_LIMITS.maxDescriptionLen),
        unit,
        quantity: q.toFixed(),
        unitPrice: p.toFixed(),
        sortOrder: items.length,
      });
      itemSubtotals.push(subtotal.toFixed());
      if (items.length > IMPORT_LIMITS.maxItems) {
        errors.push({ row: excelRow, kind: 'too_long', message: `Demasiados ítems (máx ${IMPORT_LIMITS.maxItems}).` });
        stopped = true;
      }
    }
  }

  if (emptySkipped > 0) {
    warnings.push({ row: null, kind: 'empty_rows_skipped', message: `${emptySkipped} fila(s) vacía(s) ignorada(s).` });
  }
  if (afterDirectIgnored > 0) {
    warnings.push({ row: null, kind: 'aiu_ignored', message: `${afterDirectIgnored} fila(s) de AIU/control de pagos ignorada(s) (fuera de alcance).` });
  }
  if (chapters.length === 0 || items.length === 0) {
    errors.push({ row: null, kind: 'no_data', message: 'El archivo no contiene capítulos ni ítems reconocibles.' });
  }

  // Totales y resumen por capítulo (recalculados).
  let directTotal = new Decimal(0);
  const chapterSubtotals = new Map<string, { items: number; sub: InstanceType<typeof Decimal> }>();
  for (const ch of chapters) chapterSubtotals.set(ch.code, { items: 0, sub: new Decimal(0) });
  items.forEach((it, idx) => {
    const sub = new Decimal(itemSubtotals[idx]!);
    directTotal = directTotal.plus(sub);
    const agg = chapterSubtotals.get(it.chapterCode);
    if (agg) {
      agg.items += 1;
      agg.sub = agg.sub.plus(sub);
    }
  });

  const SAMPLE = 50;
  if (items.length > SAMPLE) {
    warnings.push({ row: null, kind: 'truncated_preview', message: `Mostrando ${SAMPLE} de ${items.length} ítems.` });
  }

  const preview: ImportPreview = {
    fileName,
    sheet: sheetName.trim(),
    chapterCount: chapters.length,
    itemCount: items.length,
    directTotal: directTotal.toFixed(),
    chapters: chapters.map((ch) => {
      const agg = chapterSubtotals.get(ch.code)!;
      return { code: ch.code, name: ch.name, itemCount: agg.items, subtotal: agg.sub.toFixed() };
    }),
    itemsSample: items.slice(0, SAMPLE).map((it, idx) => ({
      chapterCode: it.chapterCode,
      code: it.code,
      description: it.description,
      unit: it.unit,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      subtotal: itemSubtotals[idx]!,
    })),
    itemsTruncated: items.length > SAMPLE,
    errors,
    warnings,
    importable: errors.length === 0,
    digest: '',
  };

  // Payload normalizado para la RPC (subtotal lo recalcula la RPC).
  const normalized: NormalizedImport = {
    chapters,
    items: items.map((it) => ({
      chapterCode: it.chapterCode,
      code: it.code,
      description: it.description,
      unit: it.unit,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      sortOrder: it.sortOrder,
    })),
  };

  preview.digest = digestNormalized(normalized);
  return { preview, normalized };
}

/** SHA-256 (hex) del payload normalizado con orden de claves estable. */
export function digestNormalized(n: NormalizedImport): string {
  const canonical = JSON.stringify({
    chapters: n.chapters.map((c) => [c.code, c.name, c.sortOrder]),
    items: n.items.map((i) => [i.chapterCode, i.code, i.description, i.unit, i.quantity, i.unitPrice, i.sortOrder]),
  });
  return createHash('sha256').update(canonical).digest('hex');
}
