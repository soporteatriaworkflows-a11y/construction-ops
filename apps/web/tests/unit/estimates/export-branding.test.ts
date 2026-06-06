/**
 * export-branding.test.ts — Branding oficial GRUPO ICONIC en exports (4E.1C).
 *
 * Verifica assets oficiales, paleta exacta de la guía, ausencia de dorado,
 * embebido sin fs, y que el branding NO rompe contenido ni totales.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
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
  ICONIC_EXPORT_PALETTE,
  getLogoDataUri,
  hasOfficialLogos,
} from '@/server/estimates/export';
import { DEMO_ORGANIZATION_ID } from '@/server/read-model';
import type { ViewerContext } from '@/lib/contracts/read-model';

const reader: ViewerContext = { organizationId: DEMO_ORGANIZATION_ID, role: 'management' };
const DEMO_ESTIMATE_ID = '00000000-0000-4000-8000-0000000000b0';
const fixtureOpts = { env: { READ_MODEL_SOURCE: 'fixture' as const } };
const payload = () => getEstimateExportPayload(reader, DEMO_ESTIMATE_ID, fixtureOpts);

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '../../..');
const repoRoot = resolve(webRoot, '../..');
const readWeb = (rel: string) => readFileSync(resolve(webRoot, rel), 'utf8');

const FULL_PNG = resolve(repoRoot, 'apps/web/public/branding/iconic/grupo-iconic-logo-full.png');
const SYMBOL_PNG = resolve(repoRoot, 'apps/web/public/branding/iconic/grupo-iconic-logo-symbol.png');

describe('Branding — assets oficiales', () => {
  it('los dos PNG oficiales existen y son razonables (< 2 MB)', () => {
    expect(existsSync(FULL_PNG)).toBe(true);
    expect(existsSync(SYMBOL_PNG)).toBe(true);
    expect(statSync(FULL_PNG).size).toBeGreaterThan(0);
    expect(statSync(SYMBOL_PNG).size).toBeGreaterThan(0);
    expect(statSync(FULL_PNG).size).toBeLessThan(2 * 1024 * 1024);
    expect(statSync(SYMBOL_PNG).size).toBeLessThan(2 * 1024 * 1024);
    // Firma PNG.
    expect(readFileSync(FULL_PNG).subarray(0, 4).toString('hex')).toBe('89504e47');
  });

  it('la guía visual está en docs/branding y NO en public (no expuesta)', () => {
    expect(existsSync(resolve(repoRoot, 'docs/branding/ICONIC_EXPORTS_VISUAL_GUIDE.pdf'))).toBe(true);
    expect(existsSync(resolve(repoRoot, 'apps/web/public/branding/ICONIC_EXPORTS_VISUAL_GUIDE.pdf'))).toBe(false);
  });
});

describe('Branding — embebido (data URI, sin fs runtime)', () => {
  it('el script genera ambos data URI base64 no vacíos', () => {
    const full = getLogoDataUri('full');
    const symbol = getLogoDataUri('symbol');
    expect(full).toMatch(/^data:image\/png;base64,/);
    expect(symbol).toMatch(/^data:image\/png;base64,/);
    expect((full ?? '').length).toBeGreaterThan(1000);
    expect((symbol ?? '').length).toBeGreaterThan(1000);
    expect(hasOfficialLogos()).toBe(true);
  });

  it('branding.ts NO usa fs/path en runtime', () => {
    const src = readWeb('server/estimates/export/branding.ts');
    expect(src).not.toMatch(/from 'node:fs'|require\('node:fs'\)|readFileSync/);
    expect(src).not.toMatch(/from 'node:path'/);
  });
});

describe('Branding — paleta oficial y ausencia de dorado', () => {
  it('ICONIC_EXPORT_PALETTE coincide exactamente con la guía', () => {
    expect(ICONIC_EXPORT_PALETTE).toEqual({
      primaryBlue: '#005DD6',
      cyanAccent: '#00B8FF',
      deepNavy: '#020148',
      graphite: '#1B1F3E',
      softBlueGray: '#C7DCED',
      lightGray: '#F2F4F7',
      white: '#FFFFFF',
    });
    expect(BRAND_HEX.primary).toBe('#005DD6');
    expect(BRAND_HEX.accent).toBe('#00B8FF');
    expect(BRAND_HEX.deepNavy).toBe('#020148');
    expect(BRAND_ARGB.primary).toBe('FF005DD6');
    expect(BRAND_ARGB.accent).toBe('FF00B8FF');
  });

  it('no aparece el dorado anterior (#C8A24B) en branding/pdf/xlsx', () => {
    for (const rel of [
      'server/estimates/export/branding.ts',
      'server/estimates/export/pdf.ts',
      'server/estimates/export/xlsx.ts',
    ]) {
      const src = readWeb(rel).toUpperCase();
      expect(src).not.toContain('C8A24B');
    }
    expect(BRAND.name).toBe('GRUPO ICONIC');
  });
});

describe('Branding — Excel embebe logo y no rompe contenido', () => {
  it('mantiene 3 hojas, total general, creator de marca y embebe imagen', async () => {
    const p = await payload();
    const buf = await generateEstimateExcel(p);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf.buffer as ArrayBuffer);
    expect(wb.creator).toBe(BRAND.name);
    expect(wb.worksheets.map((w) => w.name)).toEqual(expect.arrayContaining(['RESUMEN', 'PRESUPUESTO', 'TRAZABILIDAD']));
    // Logo oficial embebido en el libro.
    expect(wb.model.media?.length ?? 0).toBeGreaterThan(0);

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

describe('Branding — PDF embebe logo y sigue válido', () => {
  it('sigue siendo %PDF, con contenido y referencia al logo oficial', async () => {
    const p = await payload();
    const buf = await generateEstimatePdf(p);
    const head = String.fromCharCode(...Array.from(buf.slice(0, 5)));
    expect(head.startsWith('%PDF')).toBe(true);
    // Con logos embebidos el PDF incrusta imágenes ⇒ peso notablemente mayor.
    expect(buf.byteLength).toBeGreaterThan(20000);

    const src = readWeb('server/estimates/export/pdf.ts');
    expect(src).toMatch(/getLogoDataUri\('full'\)/);
    expect(src).toMatch(/getLogoDataUri\('symbol'\)/);
    expect(src).toMatch(/Image/);
    // Sin filtración de identificadores internos pese al rediseño.
    expect(src).not.toMatch(/\.id\b/);
    expect(src).not.toMatch(/source_row|sourceRow|sourceCode/);
  });
});

describe('Branding — script de embed', () => {
  it('existe el script reproducible y el módulo generado expone los data URI', () => {
    expect(existsSync(resolve(repoRoot, 'scripts/branding/embed-iconic-assets.mjs'))).toBe(true);
    const gen = readWeb('server/estimates/export/logo-asset.ts');
    expect(gen).toMatch(/NO EDITAR A MANO/);
    expect(gen).toMatch(/ICONIC_LOGO_FULL_DATA_URI/);
    expect(gen).toMatch(/ICONIC_LOGO_SYMBOL_DATA_URI/);
  });
});
