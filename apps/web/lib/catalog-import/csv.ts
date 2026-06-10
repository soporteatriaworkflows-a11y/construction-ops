/**
 * csv.ts — Construcción de CSV descargable SANITIZADO
 * (CATALOG_BULK_ONBOARDING_V1, contrato §5). Lógica pura, sin dependencias.
 *
 * Regla de seguridad: toda celda cuyo primer carácter sea `=`, `+`, `-`, `@`,
 * TAB o CR se prefija con `'` para neutralizar CSV formula injection al abrir
 * el reporte en Excel/Sheets. Aplica a TODOS los reportes descargables.
 */

const DANGEROUS_PREFIX = /^[=+\-@\t\r]/;

/** Neutraliza fórmulas y escapa comillas/separadores según RFC 4180. */
export function sanitizeCsvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (DANGEROUS_PREFIX.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n\r;]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Construye un CSV completo (encabezado + filas) con todas las celdas sanitizadas. */
export function buildSanitizedCsv(
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): string {
  const lines: string[] = [];
  lines.push(headers.map(sanitizeCsvCell).join(','));
  for (const row of rows) {
    lines.push(row.map(sanitizeCsvCell).join(','));
  }
  return lines.join('\r\n');
}
