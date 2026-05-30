/**
 * sanitize.ts — Sanitización de datos privados del golden master.
 *
 * Propiedad de agent-excel-mapper. Garantiza que NINGÚN dato personal o
 * comercial sensible (nombre de cliente, NIT/RUT, dirección, teléfono,
 * email, nombre de proveedor real) salga hacia un fixture versionable.
 *
 * Estrategia: lista de patrones + mapeo determinista a alias estables. El
 * mapeo es idempotente: el mismo valor real produce siempre el mismo alias.
 */

import crypto from 'node:crypto';

/** Patrones que delatan datos privados (defensa en profundidad). */
const PRIVATE_PATTERNS: { name: string; re: RegExp }[] = [
  // NIT colombiano: 9 dígitos + DV (con o sin puntos/guion).
  { name: 'nit', re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d\b/ },
  // Teléfono CO: celular 10 dígitos o fijo con indicativo.
  { name: 'phone', re: /\b(?:\+?57[\s-]?)?(?:3\d{9}|\d{7,10})\b/ },
  // Email.
  { name: 'email', re: /[\w.+-]+@[\w-]+\.[\w.-]+/i },
  // URL (puede contener referencia interna de proveedor).
  { name: 'url', re: /https?:\/\/\S+/i },
];

/**
 * Mapa determinista valor-real → alias. Se siembra con nombres conocidos del
 * dominio (PROJECT_MASTER §3.3.D menciona proveedores). Cualquier valor no
 * sembrado se hashea a un alias estable.
 */
const SEEDED_ALIASES: Record<string, string> = {
  // Proveedores reales mencionados → alias genéricos.
  homecenter: 'Proveedor Retail Demo',
  hb: 'Proveedor Materiales Demo A',
  melendez: 'Proveedor Materiales Demo B',
  'meléndez': 'Proveedor Materiales Demo B',
  delta: 'Proveedor Materiales Demo C',
  'imperplak sas': 'Proveedor Impermeabilizantes Demo',
  'imperplak': 'Proveedor Impermeabilizantes Demo',
};

const aliasCache = new Map<string, string>();

/** Normaliza una clave para el mapeo (minúsculas, sin acentos extra de espacios). */
function normKey(s: string): string {
  return s.trim().toLowerCase();
}

/** Alias determinista para un nombre propio (proveedor, persona, etc.). */
export function aliasFor(realName: string, prefix = 'Entidad Demo'): string {
  const key = normKey(realName);
  if (SEEDED_ALIASES[key]) return SEEDED_ALIASES[key];
  if (aliasCache.has(key)) return aliasCache.get(key)!;
  const h = crypto.createHash('sha256').update(key).digest('hex').slice(0, 6).toUpperCase();
  const alias = `${prefix} ${h}`;
  aliasCache.set(key, alias);
  return alias;
}

/** Reemplaza patrones privados dentro de un texto libre por marcadores. */
export function scrubText(text: string | null | undefined): string | null {
  if (text == null) return null;
  let out = String(text);
  for (const { name, re } of PRIVATE_PATTERNS) {
    out = out.replace(new RegExp(re, 'gi'), `[${name.toUpperCase()}_REDACTED]`);
  }
  return out;
}

/** ¿Es un valor estructural (no texto libre) donde NO viven datos privados? */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECIMAL_RE = /^-?\d+(\.\d+)?$/; // DecimalString / number serializado
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?([.+-]\S*)?)?$/;
const CURRENCY_RE = /^[A-Z]{3}$/; // ISO-4217 (COP, USD…)

function isStructuralString(s: string): boolean {
  const t = s.trim();
  return (
    UUID_RE.test(t) || DECIMAL_RE.test(t) || ISO_DATE_RE.test(t) || CURRENCY_RE.test(t)
  );
}

/** Recolecta solo los strings de TEXTO LIBRE de un objeto (recursivo). */
function collectFreeText(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    if (!isStructuralString(value)) out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectFreeText(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectFreeText(v, out);
  }
}

/**
 * Verifica que un objeto NO contenga datos privados según los patrones.
 * Escanea ÚNICAMENTE strings de texto libre (nombres, descripciones, notas):
 * los UUID, montos DecimalString, fechas ISO y códigos de moneda son valores
 * estructurales y se excluyen para evitar falsos positivos (p. ej. un monto
 * "76691.00299..." o un UUID con ceros NO es un NIT ni un teléfono).
 * Devuelve la lista de hallazgos (vacía = limpio). Verificación final del
 * importador antes de aceptar el fixture.
 */
export function findPrivateLeaks(value: unknown): { pattern: string; sample: string }[] {
  const texts: string[] = [];
  collectFreeText(value, texts);
  const leaks: { pattern: string; sample: string }[] = [];
  for (const { name, re } of PRIVATE_PATTERNS) {
    for (const text of texts) {
      const m = text.match(new RegExp(re, 'i'));
      if (m) {
        leaks.push({ pattern: name, sample: m[0].slice(0, 40) });
        break;
      }
    }
  }
  return leaks;
}

/** UUID v5-like determinista a partir de un namespace + clave estable. */
export function deterministicUuid(namespace: string, key: string): string {
  const h = crypto.createHash('sha1').update(`${namespace}:${key}`).digest('hex');
  // Formatea como UUID y fija versión 5 + variante.
  const b = h.slice(0, 32).split('');
  b[12] = '5';
  b[16] = ((parseInt(b[16], 16) & 0x3) | 0x8).toString(16);
  const s = b.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}
