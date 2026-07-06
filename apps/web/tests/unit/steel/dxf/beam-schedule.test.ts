/**
 * beam-schedule.test.ts — F8B P3: listado profesional por viga desde DXF
 * (agrupación por elemento, eje/ubicación, sección, refuerzo longitudinal,
 * estribos con normalización, segmentos, estados honestos) + envío de una
 * fila al takeoff con evidencia dxf. Fixtures 100% sintéticos.
 */
import { describe, expect, it } from 'vitest';
import { parseDxfFile } from '@/lib/steel/dxf/dxf-parser';
import { extractDxfStructure } from '@/lib/steel/dxf/dxf-structural-extractor';
import {
  beamScheduleRowToManualLines,
  buildBeamSchedule,
} from '@/lib/steel/dxf/beam-schedule';

function text(value: string, layer: string, x: number, y: number, color?: number): string {
  const chunks = ['0', 'TEXT', '8', layer];
  if (color !== undefined) chunks.push('62', String(color));
  chunks.push('10', String(x), '20', String(y), '1', value);
  return chunks.join('\n');
}

function wrapDxf(chunks: string[]): string {
  return ['0', 'SECTION', '2', 'ENTITIES', ...chunks, '0', 'ENDSEC', '0', 'EOF'].join('\n');
}

/** Detalle sintético de viga: VC-01 con eje, sección, longitudinal y estribo. */
const BEAM_DETAIL_DXF = wrapDxf([
  text('VC-01 (50x60)', 'VIGAS-TEXTO', 100, 100, 1),
  text('EJE 1B-A', 'TEXTOSEJES', 102, 96),
  text('6#655', 'BARRAS', 101, 92),
  text('E#3@12', 'EstribosSeccVigas', 103, 90),
  text('2x153E#318.4', 'EstribosSeccVigas', 103, 88),
  // Segmentos gráficos del flejado (media vuelta): 50 + 30 + 12.
  text('50', 'CotasEstribSeccion', 104, 86),
  text('30', 'CotasEstribSeccion', 105, 86),
  text('12', 'CotasEstribSeccion', 106, 86),
  // Otra viga con eje en el propio código, lejos de la primera.
  text('VC-EJE-1', 'VIGAS-TEXTO', 900, 900),
  // Rótulo (jamás contamina el listado).
  text('ING. RESPONSABLE: N.N.', 'ROTULO', 400, -200),
  text('CALLE 10 # 5-20', 'ROTULO', 400, -205),
]);

function schedule(dxf: string) {
  const parse = parseDxfFile(dxf);
  if (!parse.ok) throw new Error('fixture inválido');
  const extraction = extractDxfStructure(parse);
  return buildBeamSchedule(parse, extraction);
}

describe('F8B P3 — Beam Schedule Extraction', () => {
  const rows = schedule(BEAM_DETAIL_DXF);
  const vc01 = rows.find((r) => r.elementKey === 'VC-01');

  it('arma la fila profesional: VC-01 / EJE 1B-A / 50x60 / 6#655 / estribos / fuente DXF', () => {
    expect(vc01).toBeDefined();
    expect(vc01?.location).toBe('EJE 1B-A');
    expect(vc01?.sectionSpec).toBe('50x60');
    expect(vc01?.layer).toBe('VIGAS-TEXTO');
    expect(vc01?.confidence).toBeGreaterThan(0.9);
  });

  it('VC-01 + texto 6#655 cercano ⇒ longitudinalBars incluye 6#655', () => {
    expect(vc01?.longitudinalBars).toContain('6#655');
  });

  it('VC-01 + E#3@12 cercano ⇒ evidencia de estribo (con normalización decimal)', () => {
    const raws = vc01?.stirrups.map((s) => s.raw) ?? [];
    expect(raws).toContain('E#3@12');
    const compact = vc01?.stirrups.find((s) => s.raw === '2x153E#318.4');
    expect(compact?.normalized).toBe('2x153E#3184');
    expect(compact?.lengthCm).toBe(184);
    expect(compact?.warnings.join(' ')).toContain('18.4 → 184 cm');
  });

  it('los segmentos gráficos 50/30/12 confirman los 184 cm por simetría', () => {
    expect(vc01?.segmentCheck?.status).toBe('confirmed');
    expect(vc01?.segmentCheck?.computedCm).toBe(184);
    expect(vc01?.lengthObservation).toContain('confirmada por segmentos gráficos');
  });

  it('VC-EJE-1 conserva el eje como ubicación, no como elemento basura', () => {
    const vcEje = rows.find((r) => r.elementKey === 'VC-EJE-1');
    expect(vcEje).toBeDefined();
    expect(vcEje?.location).toBe('EJE 1');
  });

  it('los textos de rótulo no contaminan el listado', () => {
    for (const row of rows) {
      expect(row.sourceText).not.toMatch(/ING\.|CALLE/);
      expect(row.nearbyTexts.join(' ')).not.toMatch(/ING\.|CALLE/);
      expect(row.longitudinalBars.join(' ')).not.toMatch(/5-20/);
    }
  });

  it('sin ubicación ⇒ missing_location', () => {
    const isolated = schedule(
      wrapDxf([text('VC-07', 'VIGAS-TEXTO', 0, 0)]),
    );
    const row = isolated.find((r) => r.elementKey === 'VC-07');
    expect(row?.status).toBe('missing_location');
    expect(row?.statusReasons.join(' ')).toContain('No se encontró eje/ubicación');
  });

  it('varios textos cercanos ambiguos ⇒ requires_review', () => {
    const ambiguous = schedule(
      wrapDxf([
        text('VC-05 (50x60)', 'VIGAS-TEXTO', 0, 0),
        text('40x60', 'VIGAS-TEXTO', 1, -1),
        text('EJE 2', 'TEXTOSEJES', 1, 1),
      ]),
    );
    const row = ambiguous.find((r) => r.elementKey === 'VC-05');
    expect(row?.status).toBe('requires_review');
    expect(row?.statusReasons.join(' ')).toContain('Secciones distintas');
  });
});

describe('F8B P3 — fila seleccionada → takeoff con evidencia dxf', () => {
  const rows = schedule(BEAM_DETAIL_DXF);
  const vc01 = rows.find((r) => r.elementKey === 'VC-01')!;

  it('envía SOLO tokens interpretables por F1, con evidencia dxf y viga en la observación', () => {
    const lines = beamScheduleRowToManualLines(vc01, 'vigas.dxf');
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.evidence?.readingMethod).toBe('dxf');
      expect(line.evidence?.sourceType).toBe('dxf');
      expect(line.evidence?.sourceFileName).toBe('vigas.dxf');
      expect(line.evidence?.observation).toContain('Viga VC-01');
      expect(line.evidence?.observation).toContain('EJE 1B-A');
      expect(line.evidence?.observation).toContain('Capa: VIGAS-TEXTO');
    }
    // El estribo compacto normalizado entra parseable (306 estribos, 1.84 m).
    expect(lines.some((line) => line.originalDescription.includes('E#3184'))).toBe(true);
  });

  it('una fila sin tokens interpretables no agrega nada (jamás inventa)', () => {
    const empty = schedule(wrapDxf([text('VC-09', 'VIGAS-TEXTO', 0, 0)]));
    const row = empty.find((r) => r.elementKey === 'VC-09')!;
    expect(beamScheduleRowToManualLines(row, 'vigas.dxf')).toEqual([]);
  });
});
