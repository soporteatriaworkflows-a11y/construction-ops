/**
 * export-payload.test.ts — Payload + generadores Excel/PDF del presupuesto (4E.1).
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { getEstimatesWriteRepository, EstimateNotFoundError } from '@/server/estimates';
import {
  getEstimateExportPayload,
  generateEstimateExcel,
  generateEstimatePdf,
  buildEstimateExportFileName,
  sanitizeSegment,
} from '@/server/estimates/export';
import { DEMO_ORGANIZATION_ID } from '@/server/read-model';
import type { ViewerContext } from '@/lib/contracts/read-model';

const reader: ViewerContext = { organizationId: DEMO_ORGANIZATION_ID, role: 'management' };
const otherOrg: ViewerContext = { organizationId: '00000000-0000-4000-8000-0000000000ff', role: 'management' };
const DEMO_ESTIMATE_ID = '00000000-0000-4000-8000-0000000000b0';
const fixtureOpts = { env: { READ_MODEL_SOURCE: 'fixture' as const } };

const payload = () => getEstimateExportPayload(reader, DEMO_ESTIMATE_ID, fixtureOpts);

describe('Export — payload (fixture)', () => {
  it('arma proyecto, alcance, presupuesto, V01, capítulos, ítems, totales y AIU', async () => {
    const p = await payload();
    expect(p.project.name).toMatch(/Entre Patios/i);
    expect(p.project.city).toBeTruthy();
    expect(p.scope.name).toBeTruthy();
    expect(p.estimate.id).toBe(DEMO_ESTIMATE_ID);
    expect(p.version.label).toBe('V01');
    expect(p.counts.chapters).toBe(14);
    expect(p.counts.items).toBe(131);
    expect(p.chapters.length).toBe(14);
    expect(p.chapters[0]!.items.length).toBeGreaterThan(0);
    // Total directo del golden master (sin AIU en fixture ⇒ total general = directo).
    expect(Math.abs(Number(p.financial.directTotal) - 336084479.93690735)).toBeLessThan(1);
    expect(p.financial.grandTotal).toBe(p.financial.directTotal);
    expect(p.aiu).toHaveProperty('administrationRate');
  });

  it('cross-org ⇒ EstimateNotFoundError', async () => {
    await expect(getEstimateExportPayload(otherOrg, DEMO_ESTIMATE_ID, fixtureOpts)).rejects.toBeInstanceOf(
      EstimateNotFoundError,
    );
  });

  it('repositorio fixture expone getEstimateExportPayload', () => {
    const repo = getEstimatesWriteRepository(fixtureOpts);
    expect(typeof repo.getEstimateExportPayload).toBe('function');
  });
});

describe('Export — Excel', () => {
  it('genera un .xlsx válido con hojas RESUMEN, PRESUPUESTO y TRAZABILIDAD', async () => {
    const p = await payload();
    const buf = await generateEstimateExcel(p);
    expect(buf.byteLength).toBeGreaterThan(0);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf.buffer as ArrayBuffer);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toContain('RESUMEN');
    expect(names).toContain('PRESUPUESTO');
    expect(names).toContain('TRAZABILIDAD');

    // RESUMEN incluye TOTAL GENERAL con el valor del resumen financiero.
    const resumen = wb.getWorksheet('RESUMEN')!;
    let totalCell: number | null = null;
    resumen.eachRow((row) => {
      if (String(row.getCell(1).value ?? '').toUpperCase().includes('TOTAL GENERAL')) {
        totalCell = Number(row.getCell(3).value);
      }
    });
    expect(totalCell).not.toBeNull();
    expect(Math.abs((totalCell as unknown as number) - Number(p.financial.grandTotal))).toBeLessThan(1);

    // PRESUPUESTO contiene códigos canónicos de ítem (col C).
    const presupuesto = wb.getWorksheet('PRESUPUESTO')!;
    const codes: string[] = [];
    presupuesto.eachRow((row) => {
      const c = row.getCell(3).value;
      if (c && typeof c === 'string') codes.push(c);
    });
    expect(codes).toContain(p.chapters[0]!.items[0]!.code);

    // TRAZABILIDAD secundaria: cabecera con "Código canónico" y "Código original".
    const traza = wb.getWorksheet('TRAZABILIDAD')!;
    const header = traza.getRow(1).values as unknown[];
    const headerText = header.map((v) => String(v ?? '')).join('|');
    expect(headerText).toMatch(/Código canónico/);
    expect(headerText).toMatch(/Código original/);
  });
});

describe('Export — PDF', () => {
  it('genera un %PDF en memoria', async () => {
    const p = await payload();
    const buf = await generateEstimatePdf(p);
    const head = String.fromCharCode(...Array.from(buf.slice(0, 5)));
    expect(head.startsWith('%PDF')).toBe(true);
    expect(buf.byteLength).toBeGreaterThan(1000);
  });
});

describe('Export — filename', () => {
  it('produce un nombre legible y sanitizado con la extensión correcta', async () => {
    const p = await payload();
    const xlsx = buildEstimateExportFileName(p, 'xlsx');
    const pdf = buildEstimateExportFileName(p, 'pdf');
    expect(xlsx).toMatch(/\.xlsx$/);
    expect(pdf).toMatch(/\.pdf$/);
    expect(xlsx).toMatch(/^[A-Z0-9_]+\.xlsx$/);
    expect(xlsx).toContain('V01');
  });

  it('sanitizeSegment evita path traversal y caracteres peligrosos', () => {
    expect(sanitizeSegment('../../etc/passwd')).not.toMatch(/[./\\]/);
    expect(sanitizeSegment('A: B/C\\D*?"<>|')).toMatch(/^[A-Z0-9_]*$/);
    expect(sanitizeSegment('Ñoño Áéí')).toBe('NONO_AEI');
    expect(sanitizeSegment('   ')).toBe('');
  });
});
