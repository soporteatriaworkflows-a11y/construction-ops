/**
 * filename.ts — Generación de nombres de archivo sanitizados.
 *
 * Propiedad: agent-exports.
 *
 * REGLAS:
 *  - Sin PII ni datos sensibles en el nombre.
 *  - Sin rutas de directorio.
 *  - Sin caracteres peligrosos (/, \, .., :, *, ?, ", <, >, |).
 *  - Patrón: `<tipo>_<proyecto-slug>_<YYYYMMDD>.<ext>`.
 */

import type { ExportFormat } from './types';
import { FORMAT_EXTENSION } from './types';

const SAFE_CHARS_REGEX = /[^a-z0-9\-_]/g;
const MAX_SLUG_LENGTH = 40;

/**
 * Convierte un string a slug URL-safe (sin chars especiales, sin PII).
 */
export function toSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // quitar diacríticos
    .replace(/\s+/g, '-')              // espacios → guión
    .replace(SAFE_CHARS_REGEX, '')     // quitar resto
    .replace(/-+/g, '-')              // colapsar guiones
    .replace(/^-|-$/g, '')            // quitar guiones extremos
    .substring(0, MAX_SLUG_LENGTH)    // truncar
    || 'proyecto';                     // fallback si queda vacío
}

/**
 * Formatea una fecha ISO como YYYYMMDD.
 */
export function formatDateCompact(isoDate: string): string {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) {
    return new Date().toISOString().substring(0, 10).replace(/-/g, '');
  }
  return d.toISOString().substring(0, 10).replace(/-/g, '');
}

/**
 * Genera un nombre de archivo sanitizado para la exportación.
 *
 * @param format - Formato de exportación.
 * @param projectName - Nombre del proyecto (se convertirá a slug).
 * @param date - Fecha de generación (ISO 8601).
 * @returns Nombre de archivo sin ruta, sin datos sensibles.
 */
export function buildFileName(
  format: ExportFormat,
  projectName: string,
  date: string,
): string {
  const typePrefix: Record<ExportFormat, string> = {
    'xlsx-client':    'presupuesto_cliente',
    'xlsx-internal':  'presupuesto_interno',
    'pdf-client':     'presupuesto_cliente',
    'pdf-management': 'resumen_gerencial',
    'csv-schedule':   'cronograma',
  };

  const prefix = typePrefix[format];
  const slug = toSlug(projectName);
  const dateStr = formatDateCompact(date);
  const ext = FORMAT_EXTENSION[format];

  return `${prefix}_${slug}_${dateStr}.${ext}`;
}
