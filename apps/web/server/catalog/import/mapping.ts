/**
 * mapping.ts — Mapeo de columnas y normalización de valores
 * (CATALOG_BULK_ONBOARDING_V1, contrato §3). Lógica pura, sin DB.
 *
 * El archivo NO necesita encabezados exactos: se propone un mapeo automático
 * por sinónimos (es/en) y la usuaria puede corregirlo columna por columna.
 */
import Decimal from 'decimal.js';
import type { CatalogImportField, ColumnAssignment, PriceListField } from '@/lib/catalog-import/types';
import { CATALOG_IMPORT_FIELDS, PRICE_LIST_FIELDS } from '@/lib/catalog-import/types';
import type { ResourceType } from '../types';

/** Normaliza un texto para comparación (sin tildes, minúsculas, espacios). */
export function normalizeHeader(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ');
}

const FIELD_SYNONYMS: Record<CatalogImportField | 'observedAt', string[]> = {
  code: ['code', 'codigo', 'cod', 'item', 'clave'],
  name: ['name', 'nombre', 'recurso', 'producto', 'material', 'articulo'],
  resourceType: ['resourcetype', 'resource type', 'tipo', 'tipo de recurso', 'tipo recurso', 'clase'],
  unit: ['unit', 'unidad', 'und', 'un', 'um', 'unidad de medida'],
  description: ['description', 'descripcion', 'detalle', 'observacion descripcion'],
  category: ['category', 'categoria', 'familia', 'grupo', 'capitulo'],
  brand: ['brand', 'marca', 'fabricante'],
  externalReference: ['externalreference', 'external reference', 'referencia', 'referencia externa', 'ref', 'ref externa', 'mpn'],
  externalSku: ['externalsku', 'external sku', 'sku', 'sku externo', 'sku proveedor', 'codigo proveedor'],
  defaultWastePct: ['defaultwastepct', 'default waste pct', 'desperdicio', 'desperdicio %', '% desperdicio', 'waste', 'merma'],
  providerName: ['providername', 'provider name', 'proveedor', 'supplier', 'nombre proveedor'],
  sourceUrl: ['sourceurl', 'source url', 'url', 'enlace', 'link', 'url de origen', 'pagina'],
  observedPrice: ['observedprice', 'observed price', 'precio', 'precio observado', 'precio publico', 'vr unitario', 'vr. unitario', 'valor unitario', 'precio unitario', 'price'],
  discountPercent: ['discountpercent', 'discount percent', 'descuento', 'descuento %', '% descuento', 'dcto', 'discount'],
  currency: ['currency', 'moneda', 'divisa'],
  observedAt: ['observedat', 'observed at', 'fecha', 'fecha observacion', 'fecha de observacion', 'fecha precio'],
  validUntil: ['validuntil', 'valid until', 'valido hasta', 'vigencia', 'vence', 'vencimiento', 'valido'],
  notes: ['notes', 'notas', 'nota', 'comentario', 'comentarios', 'observaciones'],
};

/**
 * Propone un mapeo automático: para cada campo del sistema, la primera
 * columna cuyo encabezado coincida con un sinónimo. Una columna se asigna
 * a lo sumo a un campo.
 */
export function suggestMapping(
  headers: string[],
  fields: ReadonlyArray<string> = CATALOG_IMPORT_FIELDS,
): ColumnAssignment[] {
  const normalized = headers.map(normalizeHeader);
  const usedColumns = new Set<number>();
  const result: ColumnAssignment[] = [];

  for (const field of fields) {
    const synonyms = FIELD_SYNONYMS[field as keyof typeof FIELD_SYNONYMS] ?? [];
    let columnIndex: number | null = null;
    for (let c = 0; c < normalized.length; c++) {
      if (usedColumns.has(c)) continue;
      if (normalized[c] !== '' && synonyms.includes(normalized[c]!)) {
        columnIndex = c;
        break;
      }
    }
    if (columnIndex !== null) usedColumns.add(columnIndex);
    result.push({ field, columnIndex });
  }
  return result;
}

/**
 * Valida y resuelve el mapeo enviado por la usuaria (intención mínima):
 * campos desconocidos se ignoran; índices fuera de rango se anulan;
 * una columna no puede asignarse a dos campos.
 */
export function resolveMapping(
  headers: string[],
  input: ColumnAssignment[] | null | undefined,
  fields: ReadonlyArray<string> = CATALOG_IMPORT_FIELDS,
): ColumnAssignment[] {
  if (!input || input.length === 0) return suggestMapping(headers, fields);

  const byField = new Map<string, number | null>();
  const usedColumns = new Set<number>();
  for (const a of input) {
    if (!fields.includes(a.field)) continue;
    if (byField.has(a.field)) continue;
    let idx: number | null = null;
    if (
      typeof a.columnIndex === 'number' &&
      Number.isInteger(a.columnIndex) &&
      a.columnIndex >= 0 &&
      a.columnIndex < headers.length &&
      !usedColumns.has(a.columnIndex)
    ) {
      idx = a.columnIndex;
      usedColumns.add(idx);
    }
    byField.set(a.field, idx);
  }
  return fields.map((field) => ({ field, columnIndex: byField.get(field) ?? null }));
}

/** Acceso por campo a una fila ya parseada según el mapeo resuelto. */
export function makeFieldGetter(
  mapping: ColumnAssignment[],
): (row: string[], field: CatalogImportField | PriceListField | 'observedAt') => string {
  const index = new Map<string, number>();
  for (const a of mapping) {
    if (a.columnIndex !== null) index.set(a.field, a.columnIndex);
  }
  return (row, field) => {
    const c = index.get(field);
    if (c === undefined) return '';
    return (row[c] ?? '').trim();
  };
}

// ---------------------------------------------------------------------------
// Normalización de valores
// ---------------------------------------------------------------------------

const RESOURCE_TYPE_SYNONYMS: Record<string, ResourceType> = {
  material: 'material',
  materiales: 'material',
  insumo: 'material',
  labor: 'labor',
  'mano de obra': 'labor',
  mo: 'labor',
  cuadrilla: 'labor',
  equipment: 'equipment',
  equipo: 'equipment',
  equipos: 'equipment',
  maquinaria: 'equipment',
  tool: 'tool',
  herramienta: 'tool',
  herramientas: 'tool',
  subcontract: 'subcontract',
  subcontrato: 'subcontract',
  subcontratos: 'subcontract',
  subcontratacion: 'subcontract',
  other: 'other',
  otro: 'other',
  otros: 'other',
};

/** Normaliza el tipo de recurso aceptando sinónimos es/en. `null` si inválido. */
export function normalizeResourceType(raw: string): ResourceType | null {
  const n = normalizeHeader(raw);
  return RESOURCE_TYPE_SYNONYMS[n] ?? null;
}

const KNOWN_UNITS = new Set([
  'm', 'ml', 'm2', 'm3', 'cm', 'mm', 'km',
  'und', 'un', 'u', 'unidad', 'par', 'jgo', 'juego', 'caja', 'rollo', 'bulto', 'saco', 'lamina',
  'kg', 'g', 'ton', 'lb', 'gal', 'l', 'lt', 'litro',
  'hr', 'h', 'hora', 'dia', 'jornal', 'mes', 'semana',
  'viaje', 'vj', 'global', 'gl', 'glb', 'punto', 'pto',
]);

/** `true` si la unidad es reconocida (m², M3, Und… se normalizan). */
export function isKnownUnit(raw: string): boolean {
  const n = normalizeHeader(raw).replace('²', '2').replace('³', '3').replace(/\s/g, '');
  return KNOWN_UNITS.has(n);
}

/**
 * Parsea un valor monetario/porcentual con separadores locales a string
 * decimal canónico. `null` si no es numérico o es negativo.
 */
export function parsePositiveDecimal(raw: string): string | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d.,\-]/g, '').trim();
  if (!s) return null;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    s = s.lastIndexOf('.') > s.lastIndexOf(',') ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    const parts = s.split(',');
    s = parts.length === 2 && (parts[1] ?? '').length <= 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (hasDot) {
    const parts = s.split('.');
    if (parts.length > 2 || (parts.length === 2 && (parts[1] ?? '').length === 3)) {
      s = s.replace(/\./g, '');
    }
  }
  try {
    const d = new Decimal(s);
    if (d.isNaN() || !d.isFinite() || d.isNegative()) return null;
    return d.toString();
  } catch {
    return null;
  }
}

/**
 * Parsea una fecha de celda: ISO/`yyyy-mm-dd`/`dd/mm/yyyy` o serial Excel.
 * `null` si no es interpretable (no bloquea: se reporta como advertencia).
 */
export function parseCellDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // Serial Excel plausible (1990–2100 aprox.)
  if (/^\d{4,6}(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial > 30000 && serial < 80000) {
      const ms = Math.round((serial - 25569) * 86400 * 1000);
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    return null;
  }
  // dd/mm/yyyy
  const dm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (dm) {
    const d = new Date(Date.UTC(Number(dm[3]), Number(dm[2]) - 1, Number(dm[1])));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
