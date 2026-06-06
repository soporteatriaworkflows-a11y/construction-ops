/**
 * filename.ts — Nombre de archivo legible y sanitizado para el export (4E.1).
 *
 * Contrato: `docs/BUDGET_EXPORT_CONTRACT.md §6`. PURO, sin dependencias de
 * servidor. Resultado: `<PROYECTO>_<ALCANCE>_<PRESUPUESTO>_<VERSION>.<ext>`,
 * sólo `[A-Z0-9_]`, sin separadores de ruta ni `..`.
 */
import type { EstimateExportFormat, EstimateExportPayload } from '@/lib/estimates/export-types';
import { EXPORT_EXTENSION } from '@/lib/estimates/export-types';

const MAX_SEGMENT = 48;

/** Normaliza un segmento a `[A-Z0-9_]` en mayúsculas, sin diacríticos. */
export function sanitizeSegment(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quitar diacríticos
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_') // todo lo no alfanumérico → _
    .replace(/_+/g, '_') // colapsar
    .replace(/^_|_$/g, '') // bordes
    .slice(0, MAX_SEGMENT);
}

/**
 * Construye el nombre de archivo sanitizado del export. Une proyecto, alcance,
 * presupuesto y etiqueta de versión; descarta segmentos vacíos; nunca produce
 * separadores de ruta ni `..`.
 */
export function buildEstimateExportFileName(
  payload: EstimateExportPayload,
  format: EstimateExportFormat,
): string {
  const segments = [
    payload.project.name,
    payload.scope.name ?? '',
    payload.estimate.name,
    payload.version.label,
  ]
    .map(sanitizeSegment)
    .filter((s) => s.length > 0);

  const base = segments.join('_') || 'PRESUPUESTO';
  return `${base}.${EXPORT_EXTENSION[format]}`;
}
