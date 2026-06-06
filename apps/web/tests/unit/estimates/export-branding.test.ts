/**
 * export-branding.test.ts — Branding visual de exports ICONIC (4E.1B).
 *
 * Verifica que el branding (paleta + logo opcional) NO rompe la generación ni el
 * contenido, que el fallback sin logo funciona, y que la paleta es consistente.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import ExcelJS from 'exceljs';
import {
  getEstimateExportPayload,
  generateEstimateExcel,
  generateEstimatePdf,
  BRAND,
  BRAND_HEX,
  BRAND_ARGB,
  loadBrandLogo,
  __resetBrandLogoCache,
} from '@/server/estimates/export';
import { DEMO_ORGANIZATION_ID } from '@/server/read-model';
import type { ViewerContext } from '@/lib/contracts/read-model';

const reader: ViewerContext = { organizationId: DEMO_ORGANIZATION_ID, role: 'management' };
const DEMO_ESTIMATE_ID = '00000000-0000-4000-8000-0000000000b0';
const fixtureOpts = { env: { READ_MODEL_SOURCE: 'fixture' as const } };
const payload = () => getEstimateExportPayload(reader, DEMO_ESTIMATE_ID, fixtureOpts);

describe('Branding — paleta e identidad', () => {
  it('BRAND_HEX y BRAND_ARGB son consistentes (argb = FF + hex sin #)', () => {
    const keys = Object.keys(BRAND_HEX) as (keyof typeof BRAND_HEX)[];
    expect(keys.length).toBeGreaterThanOrEqual(8);
    for (const k of keys) {
      const hex = BRAND_HEX[k].replace('#', '').toUpperCase();
      expect(BRAND_ARGB[k]).toBe(`FF${hex}`);
    }
    expect(BRAND.name).toBe('ICONIC');
    expect(BRAND.monogram).toBeTruthy();
  });

  it('loadBrandLogo() no lanza y devuelve null cuando el asset no existe', () => {
    __resetBrandLogoCache();
    const logo = loadBrandLogo();
    // El PNG oficial aún no está en el repo ⇒ fallback a monograma.
    expect(logo).toBeNull();
  });
});

describe('Branding — Excel no rompe contenido', () => {
  it('mantiene 3 hojas, total general y creator de marca', async () => {
    const p = await payload();
    const buf = await generateEstimateExcel(p);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf.buffer as ArrayBuffer);
    expect(wb.creator).toBe(BRAND.name);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toEqual(expect.arrayContaining(['RESUMEN', 'PRESUPUESTO', 'TRAZABILIDAD']));

    const resumen = wb.getWorksheet('RESUMEN')!;
    let total: number | null = null;
    resumen.eachRow((row) => {
      const a = row.getCell(1).value;
      if (typeof a === 'string' && a.toUpperCase().includes('TOTAL GENERAL')) total = Number(row.getCell(3).value);
    });
    expect(total).not.toBeNull();
    expect(Math.abs((total as unknown as number) - Number(p.financial.grandTotal))).toBeLessThan(1);
  });
});

describe('Branding — PDF no rompe contenido', () => {
  it('sigue siendo %PDF y con contenido', async () => {
    const p = await payload();
    const buf = await generateEstimatePdf(p);
    const head = String.fromCharCode(...Array.from(buf.slice(0, 5)));
    expect(head.startsWith('%PDF')).toBe(true);
    expect(buf.byteLength).toBeGreaterThan(1500);
  });
});

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '../../..');
const read = (rel: string) => readFileSync(resolve(webRoot, rel), 'utf8');

describe('Branding — fuente (logo opcional + paleta)', () => {
  it('pdf.ts usa logo con fallback a monograma y paleta de marca', () => {
    const src = read('server/estimates/export/pdf.ts');
    expect(src).toMatch(/loadBrandLogo\(\)/);
    expect(src).toMatch(/BRAND\.monogram/);
    expect(src).toMatch(/Image/);
    expect(src).toMatch(/BRAND_HEX/);
    // No filtra identificadores internos pese al rediseño.
    expect(src).not.toMatch(/\.id\b/);
    expect(src).not.toMatch(/source_row|sourceRow|sourceCode/);
  });

  it('xlsx.ts inserta banda de marca + logo opcional', () => {
    const src = read('server/estimates/export/xlsx.ts');
    expect(src).toMatch(/brandHeader\(/);
    expect(src).toMatch(/loadBrandLogo\(\)/);
    expect(src).toMatch(/BRAND_ARGB/);
  });

  it('existe el mecanismo de logo embebido (base64, serverless-safe) con placeholder vacío', () => {
    const src = read('server/estimates/export/logo-asset.ts');
    expect(src).toMatch(/ICONIC_LOGO_BASE64/);
    expect(src).toMatch(/export const ICONIC_LOGO_BASE64 = ''/);
    const brandingSrc = read('server/estimates/export/branding.ts');
    expect(brandingSrc).toMatch(/ICONIC_LOGO_BASE64/);
    expect(brandingSrc).toMatch(/public.*branding.*iconic-logo\.png|iconic-logo\.png/);
  });
});
