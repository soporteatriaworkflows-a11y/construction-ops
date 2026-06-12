/**
 * linking.test.ts — BOQ_APU_LINKING_V1 (mandato 4B.2, pruebas 37–42).
 * Solo relaciones inequívocas: exacta y única por descripción normalizada +
 * unidad canónica, dentro de la versión objetivo. Jamás reemplaza vínculos.
 */
import { describe, expect, it } from 'vitest';
import { parseApuSheet } from '@/server/apu-import/parse-apu-sheet';
import {
  buildApuImportPreview,
  type BoqCandidateItem,
} from '@/server/apu-import/preview';
import { buildApuReportCsv } from '@/server/apu-import/service';
import type { ApuImportReportRow } from '@/lib/apu-import/types';
import {
  standardActivityCells,
  syntheticSheet,
  type CellSpec,
} from './helpers';

const VERSION_ID = '00000000-0000-4000-8000-00000000dd01';

function boqItem(
  id: string,
  code: string,
  description: string,
  unit: string,
  apuTemplateId: string | null = null,
): BoqCandidateItem {
  return { id, code, description, unit, apuTemplateId };
}

function build(extra: CellSpec[] | undefined, candidates: BoqCandidateItem[]) {
  const { grid, lastRow } = syntheticSheet(extra);
  return buildApuImportPreview({
    fileName: 'x.xlsx',
    sheetName: 'APU',
    digest: 'd'.repeat(64),
    parsed: parseApuSheet(grid, lastRow),
    identifiers: [],
    existingLaborRoles: [],
    existingApuCodes: new Set(),
    baselinePrices: new Map(),
    linkVersionId: VERSION_ID,
    boqCandidates: candidates,
  });
}

describe('boq-apu linking (37–42)', () => {
  // (37) exacto y único vincula.
  it('37. coincidencia exacta y única (descripción normalizada + unidad canónica) ⇒ linkable', () => {
    const { preview, plans } = build(undefined, [
      // 'm²' equivale a la unidad 'M2' de la hoja (canónica); diacríticos y
      // espacios extra no impiden el match exacto normalizado.
      boqItem('00000000-0000-4000-8000-00000000dd11', '1.01', 'DEMOLICIÓN  de muro sintetico', 'm²'),
      boqItem('00000000-0000-4000-8000-00000000dd12', '1.02', 'Otro ítem distinto', 'Ml'),
    ]);
    const activity = preview.activities[0]!;
    expect(activity.boqLink.status).toBe('linkable');
    expect(activity.boqLink.boqItemId).toBe('00000000-0000-4000-8000-00000000dd11');
    expect(activity.boqLink.boqItemCode).toBe('1.01');
    expect(plans[0]!.linkBoqItemId).toBe('00000000-0000-4000-8000-00000000dd11');
    expect(preview.totals.linkable).toBe(1);
  });

  // (38) código repetido usa ocurrencia.
  it('38. códigos visibles repetidos: cada ocurrencia vincula por SU descripción', () => {
    const { preview, plans } = build(
      [...standardActivityCells(40, { code: 'P-01', description: 'Segunda actividad distinta' })],
      [
        boqItem('00000000-0000-4000-8000-00000000dd11', '1.01', 'Demolición de muro sintético', 'M2'),
        boqItem('00000000-0000-4000-8000-00000000dd13', '1.03', 'Segunda actividad distinta', 'M2'),
      ],
    );
    expect(preview.activities[0]!.persistedCode).toBe('P-01');
    expect(preview.activities[1]!.persistedCode).toBe('P-01#2');
    expect(preview.activities[0]!.boqLink.boqItemId).toBe(
      '00000000-0000-4000-8000-00000000dd11',
    );
    expect(preview.activities[1]!.boqLink.boqItemId).toBe(
      '00000000-0000-4000-8000-00000000dd13',
    );
    expect(plans.map((p) => p.linkBoqItemId)).toEqual([
      '00000000-0000-4000-8000-00000000dd11',
      '00000000-0000-4000-8000-00000000dd13',
    ]);
  });

  // (39) ambiguo no vincula.
  it('39. dos ítems BOQ con la misma clave ⇒ ambiguous, no se vincula', () => {
    const { preview, plans } = build(undefined, [
      boqItem('00000000-0000-4000-8000-00000000dd11', '1.01', 'Demolición de muro sintético', 'M2'),
      boqItem('00000000-0000-4000-8000-00000000dd14', '7.01', 'Demolición de muro sintético', 'm2'),
    ]);
    expect(preview.activities[0]!.boqLink.status).toBe('ambiguous');
    expect(plans[0]!.linkBoqItemId).toBeNull();
  });

  it('39b. dos ACTIVIDADES de la hoja con la misma clave ⇒ ambiguous, no se vincula', () => {
    const { preview, plans } = build(
      // Misma descripción y unidad que la actividad estándar (código distinto).
      [...standardActivityCells(40, { code: 'P-09' })],
      [boqItem('00000000-0000-4000-8000-00000000dd11', '1.01', 'Demolición de muro sintético', 'M2')],
    );
    expect(preview.activities[0]!.boqLink.status).toBe('ambiguous');
    expect(preview.activities[1]!.boqLink.status).toBe('ambiguous');
    expect(plans.every((p) => p.linkBoqItemId === null)).toBe(true);
  });

  // (40) unresolved no vincula.
  it('40. sin ítem coincidente ⇒ unresolved, no se vincula', () => {
    const { preview, plans } = build(undefined, [
      boqItem('00000000-0000-4000-8000-00000000dd12', '1.02', 'Ítem que no coincide', 'Ml'),
    ]);
    expect(preview.activities[0]!.boqLink.status).toBe('unresolved');
    expect(plans[0]!.linkBoqItemId).toBeNull();
    expect(preview.totals.notLinkable).toBe(1);
  });

  // (41) existente no reemplazado silenciosamente.
  it('41. ítem con apu_template_id existente ⇒ skipped_existing (no se reemplaza)', () => {
    const { preview, plans } = build(undefined, [
      boqItem(
        '00000000-0000-4000-8000-00000000dd11',
        '1.01',
        'Demolición de muro sintético',
        'M2',
        '00000000-0000-4000-8000-00000000ee01',
      ),
    ]);
    const link = preview.activities[0]!.boqLink;
    expect(link.status).toBe('skipped_existing');
    expect(link.detail).toContain('no se reemplaza');
    expect(plans[0]!.linkBoqItemId).toBeNull();
  });

  it('sin versión objetivo ⇒ linking no evaluado', () => {
    const { grid, lastRow } = syntheticSheet();
    const { preview } = buildApuImportPreview({
      fileName: 'x.xlsx',
      sheetName: 'APU',
      digest: 'd'.repeat(64),
      parsed: parseApuSheet(grid, lastRow),
      identifiers: [],
      existingLaborRoles: [],
      existingApuCodes: new Set(),
      baselinePrices: new Map(),
      linkVersionId: null,
      boqCandidates: null,
    });
    expect(preview.activities[0]!.boqLink.status).toBe('not_evaluated');
    expect(preview.totals.linkable).toBe(0);
  });

  // (42) reporte auditable.
  it('42. el reporte CSV es auditable y sanitizado (estado de vínculo por actividad)', () => {
    const rows: ApuImportReportRow[] = [
      {
        activityKey: 'P-01#1',
        visibleCode: 'P-01',
        persistedCode: 'P-01',
        description: 'Demolición de muro sintético',
        unit: 'M2',
        importStatus: 'created',
        componentsImported: 2,
        componentsUnresolved: 0,
        linkStatus: 'linked',
        boqItemCode: '1.01',
        messages: [],
      },
      {
        activityKey: 'P-02#1',
        visibleCode: 'P-02',
        persistedCode: 'P-02',
        // Intento de inyección de fórmula: el CSV debe sanitizarlo.
        description: '=SUM(A1:A9)',
        unit: 'Ml',
        importStatus: 'omitted',
        componentsImported: 0,
        componentsUnresolved: 1,
        linkStatus: 'ambiguous',
        messages: ['2 ítems coinciden'],
      },
    ];
    const csv = buildApuReportCsv(rows);
    expect(csv).toContain('Vinculada al presupuesto');
    expect(csv).toContain('1.01');
    expect(csv).toContain('Ambigua (no se vincula)');
    // Sanitización anti fórmulas ejecutables (prefijo de escape).
    expect(csv).not.toMatch(/(^|,)"?=SUM/m);
  });
});
