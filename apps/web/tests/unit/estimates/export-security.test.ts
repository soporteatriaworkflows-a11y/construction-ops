/**
 * export-security.test.ts — Seguridad y privacidad del export (4E.1).
 *
 * - Guards del route handler (fuente): viewer requerido, validación de cadena,
 *   force-dynamic + runtime nodejs, sin service-role, sin fallback fixture.
 * - Privacidad estructural del PDF: no referencia `.id` (UUID), `sourceRow`,
 *   `source_code`/`source_row` ni descuentos/secretos.
 * - Excel: la trazabilidad vive sólo en la hoja secundaria.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '../../..');
const read = (rel: string) => readFileSync(resolve(webRoot, rel), 'utf8');

describe('Export — route handler (fuente)', () => {
  const src = read('app/api/estimates/export/route.ts');

  it('exige viewer (resolveViewer) y responde 401 sin sesión', () => {
    expect(src).toMatch(/resolveViewer\(\)/);
    expect(src).toMatch(/401/);
    expect(src).toMatch(/Sesión requerida/);
  });

  it('valida la cadena proyecto/alcance/presupuesto y 404 en discrepancia/cross-org', () => {
    expect(src).toMatch(/getEstimateById\(/);
    expect(src).toMatch(/projectScopeId !== scopeId/);
    expect(src).toMatch(/projectId/);
    expect(src).toMatch(/404/);
    expect(src).toMatch(/EstimateNotFoundError/);
  });

  it('es request-time (force-dynamic) y runtime nodejs; sin service-role', () => {
    expect(src).toMatch(/export const dynamic = 'force-dynamic'/);
    expect(src).toMatch(/export const runtime = 'nodejs'/);
    expect(src).not.toMatch(/service[_-]?role/i);
    expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE/);
  });

  it('respeta el selector sin forzar fixture en producción', () => {
    expect(src).not.toMatch(/READ_MODEL_SOURCE\s*:\s*'fixture'/);
  });
});

describe('Export — PDF privacidad estructural (fuente)', () => {
  const pdfSrc = read('server/estimates/export/pdf.ts');

  it('no referencia UUID (.id), source_row/sourceRow ni secretos', () => {
    expect(pdfSrc).not.toMatch(/\.id\b/);
    expect(pdfSrc).not.toMatch(/sourceRow/);
    expect(pdfSrc).not.toMatch(/source_row/);
    expect(pdfSrc).not.toMatch(/sourceCode/);
    expect(pdfSrc).not.toMatch(/descuent/i);
    expect(pdfSrc).not.toMatch(/service[_-]?role/i);
  });

  it('renderiza el total general y usa renderToBuffer en memoria', () => {
    expect(pdfSrc).toMatch(/TOTAL GENERAL/);
    expect(pdfSrc).toMatch(/renderToBuffer/);
  });
});

describe('Export — Excel trazabilidad secundaria (fuente)', () => {
  const xlsxSrc = read('server/estimates/export/xlsx.ts');

  it('source_code/source_row sólo se usan en la hoja TRAZABILIDAD', () => {
    // La trazabilidad (sourceCode/sourceRow) aparece tras declarar la hoja TRAZABILIDAD.
    const trazaIdx = xlsxSrc.indexOf("addWorksheet('TRAZABILIDAD')");
    const firstSourceIdx = xlsxSrc.search(/sourceCode|sourceRow/);
    expect(trazaIdx).toBeGreaterThan(0);
    expect(firstSourceIdx).toBeGreaterThan(trazaIdx);
  });
});

describe('Export — UI (fuente)', () => {
  const base = 'app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]';

  it('botones: loading, anti doble-click, error sanitizado, descarga directa', () => {
    const src = read(`${base}/export-buttons.tsx`);
    expect(src).toMatch(/^'use client';/m);
    expect(src).toMatch(/Exportar Excel/);
    expect(src).toMatch(/Exportar PDF/);
    expect(src).toMatch(/disabled=\{busy/);
    expect(src).toMatch(/if \(busy\) return/);
    expect(src).toMatch(/URL\.createObjectURL/);
    expect(src).toMatch(/El archivo se genera con los datos actuales de V01/);
  });

  it('detalle: sección Exportar presupuesto montada con ExportButtons', () => {
    const src = read(`${base}/page.tsx`);
    expect(src).toMatch(/Exportar presupuesto/);
    expect(src).toMatch(/<ExportButtons/);
    expect(src).toMatch(/Versión exportada/);
  });
});
