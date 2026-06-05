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
import { EXPECTED_SHEET, IMPORT_LIMITS, type ImportPreview, type ImportWarning } from '@/lib/import/types';

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
  code: ['code', 'codigo', 'item', 'no', 'no.'],
  description: ['description', 'descripcion', 'actividad', 'concepto', 'detalle'],
  unit: ['unit', 'unidad', 'und', 'un'],
  quantity: ['quantity', 'cantidad', 'cant', 'cant.'],
  unitPrice: ['unit_price', 'unitprice', 'v/unitario', 'vr unitario', 'vr. unitario', 'valor unitario', 'precio unitario', 'punit'],
  subtotal: ['subtotal', 'sub_total', 'v/total', 'vr total', 'vr. total', 'valor total', 'total'],
};
const REQUIRED_FIELDS = ['code', 'description', 'unit', 'quantity', 'unitPrice'] as const;

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
  const rows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: true,
    blankrows: false,
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

  const warnings: ImportWarning[] = [];
  const chapters: NormalizedChapter[] = [];
  const items: NormalizedItem[] = [];
  const chapterCodes = new Set<string>();
  let currentChapter: string | null = null;
  let emptySkipped = 0;
  const tol = new Decimal(IMPORT_LIMITS.subtotalToleranceCop);

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const code = isBlank(get(row, 'code')) ? '' : String(get(row, 'code')).trim();
    const description = isBlank(get(row, 'description')) ? '' : String(get(row, 'description')).trim();
    const unit = isBlank(get(row, 'unit')) ? '' : String(get(row, 'unit')).trim();
    const qRaw = get(row, 'quantity');
    const pRaw = get(row, 'unitPrice');

    const allEmpty = !code && !description && !unit && isBlank(qRaw) && isBlank(pRaw);
    if (allEmpty) {
      emptySkipped++;
      continue;
    }

    const looksItem = !isBlank(qRaw) || !isBlank(pRaw) || unit !== '';

    if (!looksItem) {
      // CHAPTER row
      if (!code || !description) {
        throw new ExcelParseError(`Fila ${r + 1}: capítulo sin código o nombre.`);
      }
      if (code.length > IMPORT_LIMITS.maxCodeLen) {
        throw new ExcelParseError(`Fila ${r + 1}: código de capítulo demasiado largo.`);
      }
      if (chapterCodes.has(code)) {
        throw new ExcelParseError(`Fila ${r + 1}: código de capítulo duplicado "${code}".`);
      }
      chapterCodes.add(code);
      chapters.push({ code, name: description.slice(0, IMPORT_LIMITS.maxDescriptionLen), sortOrder: chapters.length });
      currentChapter = code;
      if (chapters.length > IMPORT_LIMITS.maxChapters) {
        throw new ExcelParseError(`Demasiados capítulos (máx ${IMPORT_LIMITS.maxChapters}).`);
      }
    } else {
      // ITEM row
      if (!currentChapter) {
        throw new ExcelParseError(`Fila ${r + 1}: ítem sin un capítulo previo.`);
      }
      if (!code || !description || !unit) {
        throw new ExcelParseError(`Fila ${r + 1}: ítem sin código, descripción o unidad.`);
      }
      const qStr = toDecimalString(qRaw);
      const pStr = toDecimalString(pRaw);
      if (qStr === null || pStr === null) {
        throw new ExcelParseError(`Fila ${r + 1}: cantidad o precio unitario no numérico.`);
      }
      const q = new Decimal(qStr);
      const p = new Decimal(pStr);
      if (q.isNegative() || p.isNegative()) {
        throw new ExcelParseError(`Fila ${r + 1}: cantidad o precio negativo.`);
      }
      if (code.length > IMPORT_LIMITS.maxCodeLen || unit.length > IMPORT_LIMITS.maxUnitLen) {
        throw new ExcelParseError(`Fila ${r + 1}: código o unidad demasiado largo.`);
      }
      const subtotal = q.times(p);
      // Compara con el subtotal informado (columna F) si existe → advertencia.
      const fRaw = toDecimalString(get(row, 'subtotal'));
      if (fRaw !== null && new Decimal(fRaw).minus(subtotal).abs().greaterThan(tol)) {
        warnings.push({
          code: 'subtotal_mismatch',
          message: `Fila ${r + 1}: el subtotal del Excel difiere del recalculado (se usa el recalculado).`,
        });
      }
      items.push({
        chapterCode: currentChapter,
        code,
        description: description.slice(0, IMPORT_LIMITS.maxDescriptionLen),
        unit,
        quantity: q.toFixed(),
        unitPrice: p.toFixed(),
        subtotal: subtotal.toFixed(),
        sortOrder: items.length,
      } as NormalizedItem & { subtotal: DecimalString });
      if (items.length > IMPORT_LIMITS.maxItems) {
        throw new ExcelParseError(`Demasiados ítems (máx ${IMPORT_LIMITS.maxItems}).`);
      }
    }
  }

  if (chapters.length === 0 || items.length === 0) {
    throw new ExcelParseError('El archivo no contiene capítulos ni ítems reconocibles.');
  }
  if (emptySkipped > 0) {
    warnings.push({ code: 'empty_row_skipped', message: `${emptySkipped} fila(s) vacía(s) ignorada(s).` });
  }

  // Totales y resumen por capítulo (recalculados).
  let directTotal = new Decimal(0);
  const chapterSubtotals = new Map<string, { items: number; sub: InstanceType<typeof Decimal> }>();
  for (const ch of chapters) chapterSubtotals.set(ch.code, { items: 0, sub: new Decimal(0) });
  for (const it of items) {
    const sub = new Decimal((it as NormalizedItem & { subtotal: string }).subtotal);
    directTotal = directTotal.plus(sub);
    const agg = chapterSubtotals.get(it.chapterCode)!;
    agg.items += 1;
    agg.sub = agg.sub.plus(sub);
  }

  const SAMPLE = 50;
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
    itemsSample: items.slice(0, SAMPLE).map((it) => ({
      chapterCode: it.chapterCode,
      code: it.code,
      description: it.description,
      unit: it.unit,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      subtotal: (it as NormalizedItem & { subtotal: string }).subtotal,
    })),
    itemsTruncated: items.length > SAMPLE,
    warnings,
    digest: '',
  };
  if (preview.itemsTruncated) {
    warnings.push({ code: 'truncated_preview', message: `Mostrando ${SAMPLE} de ${items.length} ítems.` });
  }

  // Payload normalizado para la RPC (sin subtotal: lo recalcula la RPC también).
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
