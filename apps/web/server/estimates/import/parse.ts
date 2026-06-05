/**
 * parse.ts — Parser server-side del Excel de BOQ + normalización reversible de
 * códigos (Oleada 4C.3). Propiedad: agent-excel-mapper.
 *
 * SOLO server-side (`xlsx`/SheetJS, `decimal.js`, `node:crypto`). SheetJS lee
 * valores cacheados; **NO evalúa fórmulas ni ejecuta macros**.
 *
 * Hoja `COTIZACION 1 PISO`, 7 columnas (CAP auxiliar ignorada; ÍTEM=code;
 * VR. PARCIAL=subtotal de comparación). Columnas por encabezado (sin fallback por
 * posición). Filas reales (`blankrows:true`). Reservadas: SUBTOTAL ignorado;
 * TOTAL COSTOS DIRECTOS cierra el BOQ; AIU/control de pagos ignorados.
 *
 * 4C.3 — el parser conserva `sourceCode`+`sourceRow` y PROPONE `canonicalCode`
 * (capítulos duplicados ⇒ siguiente entero libre; ítems ⇒ propaga prefijo del
 * capítulo canónico). NUNCA renumera en silencio: toda propuesta es visible. Las
 * ediciones de la usuaria llegan como `overrides` (clave `rowType:sourceRow`).
 * `code` final = canónico; el digest del preview es del payload ORIGINAL
 * (sourceCode/sourceRow) para integridad del archivo.
 */
import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import * as XLSX from 'xlsx';
import type { DecimalString } from '@/lib/utils/types';
import {
  EXPECTED_SHEET,
  IMPORT_LIMITS,
  MAX_CODE_LEN,
  type ImportPreview,
  type ImportIssue,
  type MappingOverride,
  type NumberingMapping,
} from '@/lib/import/types';

/** Payload normalizado que consume la RPC (server-only; `code` = canónico). */
export interface NormalizedChapter {
  code: string;
  name: string;
  sortOrder: number;
  sourceCode: string;
  sourceRow: number;
}
export interface NormalizedItem {
  chapterCode: string;
  code: string;
  description: string;
  unit: string;
  quantity: DecimalString;
  unitPrice: DecimalString;
  sortOrder: number;
  sourceCode: string;
  sourceRow: number;
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

/** Error de parsing/validación bloqueante (mensaje sanitizado, sin datos privados). */
export class ExcelParseError extends Error {
  readonly code = 'excel_parse' as const;
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
  subtotal: ['subtotal', 'sub_total', 'v/total', 'vr total', 'vr. total', 'valor total', 'total', 'vr parcial', 'vr. parcial', 'v/parcial', 'valor parcial', 'parcial'],
};
const REQUIRED_FIELDS = ['code', 'description', 'unit', 'quantity', 'unitPrice'] as const;

const RESERVED = {
  subtotalChapter: ['subtotal capitulo', 'subtotal', 'sub total capitulo', 'subtotal cap'],
  endOfDirect: ['total costos directos', 'total costo directo', 'total directo'],
  afterDirect: [
    'administracion', 'imprevistos', 'utilidad', 'utilidades', 'iva sobre utilidad',
    'iva', 'costos indirectos', 'total costo', 'total costos', 'control de pagos',
    'anticipo', 'actas', 'acta', 'liquidacion',
  ],
};

function startsWithAny(value: string, prefixes: string[]): boolean {
  return prefixes.some((p) => value === p || value.startsWith(p + ' ') || value.startsWith(p));
}
function norm(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
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
  const normalized = raw.replace(/,/g, '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return normalized;
}
const safeDesc = (d: string) => (d.length > 80 ? `${d.slice(0, 80)}…` : d);

/** Fila base leída del Excel (antes de proponer códigos canónicos). */
interface BaseChapter { sourceCode: string; name: string; sourceRow: number }
interface BaseItem {
  chapterSourceRow: number; // ancla al capítulo (clave estable)
  sourceCode: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  subtotal: string;
  sourceRow: number;
}

/**
 * Parsea un workbook `.xlsx` y propone normalización de códigos. `overrides`
 * (intención de la usuaria por `rowType:sourceRow`) ajusta los códigos canónicos.
 */
export function parseBoqWorkbook(
  buffer: Buffer,
  fileName: string,
  overrides: MappingOverride[] = [],
): ParseResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellFormula: false, cellHTML: false });
  } catch {
    throw new ExcelParseError('El archivo no es un .xlsx válido o está dañado.');
  }

  const sheetName = wb.SheetNames.find((n) => norm(n) === norm(EXPECTED_SHEET));
  if (!sheetName) {
    throw new ExcelParseError(`No se encontró la hoja requerida "${EXPECTED_SHEET}".`, wb.SheetNames.map((n) => n.trim()));
  }
  const worksheet = wb.Sheets[sheetName];
  if (!worksheet) throw new ExcelParseError(`No se pudo leer la hoja "${EXPECTED_SHEET}".`);

  const rows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, blankrows: true, defval: null });

  let headerRowIdx = -1;
  let colMap: Record<string, number> = {};
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const map: Record<string, number> = {};
    rows[i]!.forEach((cell, c) => {
      const f = matchHeader(cell);
      if (f && map[f] === undefined) map[f] = c;
    });
    if (REQUIRED_FIELDS.every((f) => map[f] !== undefined)) { headerRowIdx = i; colMap = map; break; }
  }
  if (headerRowIdx === -1) {
    throw new ExcelParseError('No se reconocieron los encabezados obligatorios (code, description, unit, quantity, unit_price).');
  }
  const get = (row: unknown[], field: string): unknown => (colMap[field] === undefined ? null : row[colMap[field]!]);

  // ── Paso 1: leer filas base (sourceCode/sourceRow), aplicar reservadas ──────
  const warnings: ImportIssue[] = [];
  const errors: ImportIssue[] = [];
  const baseChapters: BaseChapter[] = [];
  const baseItems: BaseItem[] = [];
  let currentChapterRow: number | null = null;
  let emptySkipped = 0;
  let stopped = false;
  const tol = new Decimal(IMPORT_LIMITS.subtotalToleranceCop);

  for (let r = headerRowIdx + 1; r < rows.length && !stopped; r++) {
    const excelRow = r + 1;
    const row = rows[r] ?? [];
    const code = isBlank(get(row, 'code')) ? '' : String(get(row, 'code')).trim();
    const description = isBlank(get(row, 'description')) ? '' : String(get(row, 'description')).trim();
    const unit = isBlank(get(row, 'unit')) ? '' : String(get(row, 'unit')).trim();
    const qRaw = get(row, 'quantity');
    const pRaw = get(row, 'unitPrice');
    const descNorm = norm(description);

    if (!code && !description && !unit && isBlank(qRaw) && isBlank(pRaw)) { emptySkipped++; continue; }
    if (startsWithAny(descNorm, RESERVED.endOfDirect)) { stopped = true; break; }
    if (startsWithAny(descNorm, RESERVED.subtotalChapter)) { continue; }
    if (startsWithAny(descNorm, RESERVED.afterDirect)) { continue; }

    const looksItem = !isBlank(qRaw) || !isBlank(pRaw) || unit !== '';

    if (!looksItem) {
      if (!code) { errors.push({ row: excelRow, kind: 'chapter_no_code', description: safeDesc(description), message: 'Capítulo sin código en la columna ÍTEM.' }); continue; }
      if (!description) { errors.push({ row: excelRow, kind: 'chapter_no_name', code, message: 'Capítulo sin nombre/descripción.' }); continue; }
      if (code.length > MAX_CODE_LEN) { errors.push({ row: excelRow, kind: 'too_long', code, message: 'Código de capítulo demasiado largo.' }); continue; }
      baseChapters.push({ sourceCode: code, name: description.slice(0, IMPORT_LIMITS.maxDescriptionLen), sourceRow: excelRow });
      currentChapterRow = excelRow;
      if (baseChapters.length > IMPORT_LIMITS.maxChapters) { errors.push({ row: excelRow, kind: 'too_long', message: `Demasiados capítulos (máx ${IMPORT_LIMITS.maxChapters}).` }); stopped = true; }
    } else {
      if (currentChapterRow === null) { errors.push({ row: excelRow, kind: 'item_no_chapter', code: code || undefined, description: safeDesc(description), message: 'Ítem sin un capítulo previo.' }); continue; }
      if (!code || !description || !unit) { errors.push({ row: excelRow, kind: 'item_missing_field', code: code || undefined, description: safeDesc(description), message: 'Ítem sin código, descripción o unidad.' }); continue; }
      const qStr = toDecimalString(qRaw);
      const pStr = toDecimalString(pRaw);
      if (qStr === null || pStr === null) { errors.push({ row: excelRow, kind: 'item_non_numeric', code, message: 'Cantidad o precio unitario no numérico.' }); continue; }
      const q = new Decimal(qStr);
      const p = new Decimal(pStr);
      if (q.isNegative() || p.isNegative()) { errors.push({ row: excelRow, kind: 'negative_value', code, message: 'Cantidad o precio negativo.' }); continue; }
      if (code.length > MAX_CODE_LEN || unit.length > IMPORT_LIMITS.maxUnitLen) { errors.push({ row: excelRow, kind: 'too_long', code, message: 'Código o unidad demasiado largo.' }); continue; }
      const subtotal = q.times(p);
      const fRaw = toDecimalString(get(row, 'subtotal'));
      if (fRaw !== null && new Decimal(fRaw).minus(subtotal).abs().greaterThan(tol)) {
        warnings.push({ row: excelRow, kind: 'subtotal_mismatch', code, description: `Excel ${fRaw} vs calc ${subtotal.toFixed()}`, message: 'El subtotal informado difiere del recalculado (se usa el recalculado).' });
      }
      baseItems.push({ chapterSourceRow: currentChapterRow, sourceCode: code, description: description.slice(0, IMPORT_LIMITS.maxDescriptionLen), unit, quantity: q.toFixed(), unitPrice: p.toFixed(), subtotal: subtotal.toFixed(), sourceRow: excelRow });
      if (baseItems.length > IMPORT_LIMITS.maxItems) { errors.push({ row: excelRow, kind: 'too_long', message: `Demasiados ítems (máx ${IMPORT_LIMITS.maxItems}).` }); stopped = true; }
    }
  }

  if (emptySkipped > 0) warnings.push({ row: null, kind: 'empty_rows_skipped', message: `${emptySkipped} fila(s) vacía(s) ignorada(s).` });
  if (baseChapters.length === 0 || baseItems.length === 0) errors.push({ row: null, kind: 'no_data', message: 'El archivo no contiene capítulos ni ítems reconocibles.' });

  // ── Paso 2: digest del payload ORIGINAL (integridad del archivo) ────────────
  const originalDigest = digestOriginal(baseChapters, baseItems);

  // ── Paso 3: proponer códigos canónicos (algoritmo genérico) + overrides ─────
  const ov = new Map<string, string>();
  for (const o of overrides) {
    if (o && (o.rowType === 'chapter' || o.rowType === 'item') && Number.isInteger(o.sourceRow) && typeof o.canonicalCode === 'string') {
      ov.set(`${o.rowType}:${o.sourceRow}`, o.canonicalCode.trim());
    }
  }

  const mappings: NumberingMapping[] = [];
  const chapterCanonByRow = new Map<number, string>(); // sourceRow → canonical
  const usedChapterCanon = new Set<string>();
  let maxNum = 0;
  for (const ch of baseChapters) if (/^\d+$/.test(ch.sourceCode)) maxNum = Math.max(maxNum, parseInt(ch.sourceCode, 10));

  for (const ch of baseChapters) {
    const overrideCode = ov.get(`chapter:${ch.sourceRow}`);
    let canonical = ch.sourceCode;
    let reason = '';
    let manual = false;
    const isDup = usedChapterCanon.has(ch.sourceCode);

    if (overrideCode) {
      canonical = overrideCode;
      reason = 'Código canónico definido por la usuaria.';
    } else if (isDup) {
      if (/^\d+$/.test(ch.sourceCode)) {
        let cand: string;
        do { maxNum += 1; cand = String(maxNum); } while (usedChapterCanon.has(cand));
        canonical = cand;
        reason = `Capítulo duplicado (${ch.sourceCode}): renumerado a ${cand}.`;
      } else {
        canonical = ch.sourceCode;
        manual = true;
        reason = 'Código de capítulo duplicado no numérico: requiere corrección manual.';
      }
    }

    if (canonical.length > MAX_CODE_LEN) { errors.push({ row: ch.sourceRow, kind: 'too_long', code: canonical, message: 'Código canónico de capítulo demasiado largo.' }); }
    if (usedChapterCanon.has(canonical)) { errors.push({ row: ch.sourceRow, kind: 'duplicate_chapter', code: canonical, description: safeDesc(ch.name), message: `Código de capítulo canónico duplicado "${canonical}". Asigna uno único.` }); manual = true; }
    usedChapterCanon.add(canonical);
    chapterCanonByRow.set(ch.sourceRow, canonical);
    if (manual || canonical !== ch.sourceCode) {
      mappings.push({ rowType: 'chapter', sourceRow: ch.sourceRow, sourceCode: ch.sourceCode, canonicalCode: canonical, description: safeDesc(ch.name), reason: reason || 'Revisar código de capítulo.', requiresManualReview: manual });
    }
  }

  const itemCodesSeen = new Set<string>();
  const finalItems: NormalizedItem[] = [];
  for (const it of baseItems) {
    const chapterCanon = chapterCanonByRow.get(it.chapterSourceRow)!;
    const overrideCode = ov.get(`item:${it.sourceRow}`);
    let canonical = it.sourceCode;
    let reason = '';
    let manual = false;
    const m = /^(\d+)\.(.+)$/.exec(it.sourceCode); // prefijo numérico + sufijo

    if (overrideCode) {
      canonical = overrideCode;
      reason = 'Código de ítem definido por la usuaria.';
    } else if (m) {
      const prefix = m[1]!;
      const suffix = m[2]!;
      if (prefix !== chapterCanon) {
        canonical = `${chapterCanon}.${suffix}`;
        reason = `Prefijo ajustado al capítulo canónico (${prefix}→${chapterCanon}).`;
      }
    } else if (chapterCanon !== /* chapter source */ chapterSourceCodeOf(baseChapters, it.chapterSourceRow)) {
      // El capítulo se renumeró pero el ítem no tiene patrón seguro: revisión manual.
      manual = true;
      reason = 'Código de ítem sin patrón seguro bajo un capítulo renumerado: corrige manualmente.';
    }

    if (canonical.length > MAX_CODE_LEN) { errors.push({ row: it.sourceRow, kind: 'too_long', code: canonical, message: 'Código canónico de ítem demasiado largo.' }); }
    if (itemCodesSeen.has(canonical)) {
      warnings.push({ row: it.sourceRow, kind: 'duplicate_item', code: canonical, description: safeDesc(it.description), message: `Código de ítem repetido "${canonical}" (se importará igual; revisa la numeración).` });
    }
    itemCodesSeen.add(canonical);

    if (manual || canonical !== it.sourceCode) {
      mappings.push({ rowType: 'item', sourceRow: it.sourceRow, sourceCode: it.sourceCode, canonicalCode: canonical, description: safeDesc(it.description), reason: reason || 'Revisar código de ítem.', requiresManualReview: manual });
    }
    finalItems.push({ chapterCode: chapterCanon, code: canonical, description: it.description, unit: it.unit, quantity: it.quantity, unitPrice: it.unitPrice, sortOrder: finalItems.length, sourceCode: it.sourceCode, sourceRow: it.sourceRow });
    if (manual) errors.push({ row: it.sourceRow, kind: 'item_missing_field', code: it.sourceCode, message: 'Ítem requiere corrección manual de código.' });
  }

  // ── Paso 4: capítulos canónicos finales + totales por capítulo ──────────────
  const finalChapters: NormalizedChapter[] = baseChapters.map((ch, idx) => ({ code: chapterCanonByRow.get(ch.sourceRow)!, name: ch.name, sortOrder: idx, sourceCode: ch.sourceCode, sourceRow: ch.sourceRow }));

  let directTotal = new Decimal(0);
  const chAgg = new Map<string, { items: number; sub: InstanceType<typeof Decimal> }>();
  for (const ch of finalChapters) chAgg.set(ch.code, { items: 0, sub: new Decimal(0) });
  const itemSub = new Map<number, string>(); // sourceRow → subtotal recomputado
  for (const bi of baseItems) itemSub.set(bi.sourceRow, bi.subtotal);
  for (const it of finalItems) {
    const sub = new Decimal(itemSub.get(it.sourceRow)!);
    directTotal = directTotal.plus(sub);
    const agg = chAgg.get(it.chapterCode);
    if (agg) { agg.items += 1; agg.sub = agg.sub.plus(sub); }
  }

  const pendingManual = mappings.some((mm) => mm.requiresManualReview);
  const SAMPLE = 50;
  if (finalItems.length > SAMPLE) warnings.push({ row: null, kind: 'truncated_preview', message: `Mostrando ${SAMPLE} de ${finalItems.length} ítems.` });

  const preview: ImportPreview = {
    fileName,
    sheet: sheetName.trim(),
    chapterCount: finalChapters.length,
    itemCount: finalItems.length,
    directTotal: directTotal.toFixed(),
    chapters: finalChapters.map((ch) => { const a = chAgg.get(ch.code)!; return { code: ch.code, name: ch.name, itemCount: a.items, subtotal: a.sub.toFixed() }; }),
    itemsSample: finalItems.slice(0, SAMPLE).map((it) => ({ chapterCode: it.chapterCode, code: it.code, description: it.description, unit: it.unit, quantity: it.quantity, unitPrice: it.unitPrice, subtotal: itemSub.get(it.sourceRow)! })),
    itemsTruncated: finalItems.length > SAMPLE,
    errors,
    warnings,
    mappings,
    importable: errors.length === 0 && !pendingManual,
    digest: originalDigest,
  };

  const normalized: NormalizedImport = { chapters: finalChapters, items: finalItems };
  return { preview, normalized };
}

function chapterSourceCodeOf(chs: BaseChapter[], sourceRow: number): string {
  return chs.find((c) => c.sourceRow === sourceRow)?.sourceCode ?? '';
}

/** SHA-256 (hex) del payload ORIGINAL (sourceCode/sourceRow) — integridad del archivo. */
function digestOriginal(chs: BaseChapter[], its: BaseItem[]): string {
  const canonical = JSON.stringify({
    chapters: chs.map((c) => [c.sourceCode, c.name, c.sourceRow]),
    items: its.map((i) => [i.chapterSourceRow, i.sourceCode, i.description, i.unit, i.quantity, i.unitPrice, i.sourceRow]),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** Digest del payload FINAL normalizado (registro; no de integridad de archivo). */
export function digestNormalized(n: NormalizedImport): string {
  const canonical = JSON.stringify({
    chapters: n.chapters.map((c) => [c.code, c.name, c.sortOrder, c.sourceCode, c.sourceRow]),
    items: n.items.map((i) => [i.chapterCode, i.code, i.description, i.unit, i.quantity, i.unitPrice, i.sortOrder, i.sourceCode, i.sourceRow]),
  });
  return createHash('sha256').update(canonical).digest('hex');
}
