/**
 * f8f1-golden-beam-sequence.test.ts — F8F.1: Golden Beam Sequence Extraction.
 *
 * Reproduce la pérdida real de producción para VC-EJE-3: una viga LARGA que es
 * la ÚNICA de su fila (una viga por renglón, contorno en LINEs largas). La
 * segmentación por bandas recorta la vista al vecindario del código y los
 * textos longitudinales intermedios/finales caen en clusters sueltos sin
 * código; antes del fix, el extractor solo detectaba la barra inicial de cada
 * banda y el resto DESAPARECÍA en silencio.
 *
 * Regla de aceptación F8F.1: este fixture DEBE producir 4 superiores +
 * 4 inferiores (secuencia completa por el eje dominante) y el dispatch con
 * estribo válido DEBE ser 9 líneas. Si el extractor vuelve a tomar solo
 * extremos, estas pruebas fallan.
 *
 * Diagnóstico de exclusión: todo texto longitudinal del DXF aparece en
 * superior/inferior/sin clasificar del detalle o queda registrado en
 * `longitudinalExclusions` con razón — jamás desaparece en silencio.
 *
 * Fixture SIEMPRE sintético generado por código; jamás un DXF real.
 */
import { describe, expect, it } from 'vitest';
import { parseDxfFile } from '@/lib/steel/dxf/dxf-parser';
import { extractDxfStructure } from '@/lib/steel/dxf/dxf-structural-extractor';
import {
  assembleBeamDetails,
  buildBeamTakeoffDispatch,
  type BeamDetail,
} from '@/lib/steel/dxf/dxf-beam-detail-assembly';

// ---------------------------------------------------------------------------
// Constructores sintéticos (fixtures SIEMPRE por código)
// ---------------------------------------------------------------------------

function text(value: string, layer: string, x: number, y: number, color?: number): string {
  const chunks = ['0', 'TEXT', '5', `T${x}${y}${value}`.replace(/\W/g, '').slice(0, 12), '8', layer];
  if (color !== undefined) chunks.push('62', String(color));
  chunks.push('10', String(x), '20', String(y), '1', value);
  return chunks.join('\n');
}

function circle(x: number, y: number, layer: string, color?: number, radius = 0.4): string {
  const chunks = ['0', 'CIRCLE', '8', layer];
  if (color !== undefined) chunks.push('62', String(color));
  chunks.push('10', String(x), '20', String(y), '40', String(radius));
  return chunks.join('\n');
}

function line(x1: number, y1: number, x2: number, y2: number, layer: string): string {
  return ['0', 'LINE', '8', layer, '10', String(x1), '20', String(y1), '11', String(x2), '21', String(y2)].join('\n');
}

function wrapDxf(chunks: string[]): string {
  return ['0', 'SECTION', '2', 'ENTITIES', ...chunks, '0', 'ENDSEC', '0', 'EOF'].join('\n');
}

interface GoldenOptions {
  summary?: string;
  /** Marcadores gráficos en el corte (apoyo; el contrato F8F no los exige). */
  withMarkers?: boolean;
  /** Texto longitudinal en la franja divisoria (banda ambigua). */
  withUnclassified?: boolean;
  /** Copia superpuesta idéntica de un texto (mismas coordenadas). */
  duplicateOverlap?: boolean;
  /** Omite el tramo intermedio 6#6900 (prueba de sensibilidad del golden). */
  omitIntermediateTop?: boolean;
}

/**
 * Golden fixture de producción — VC-EJE-3 larga, única en su fila:
 *
 *   superior: 6#6 33 L (x110) · 6#6840 (x200) · 6#6900 (x300) · 6#635 (x390)
 *   inferior: 6#6440 (x110) · 6#6840 (x200) · 6#6730 (x300) · 6#6400 (x390)
 *   estribos: 7 zonas (suman 141) + resumen 2x141E#318.4 junto al código
 *
 * El contorno son LINEs largas (excluidas del anclaje de clusters) y la
 * segunda fila (VC-EJE-5) crea la retícula de bandas: la vista segmentada de
 * VC-EJE-3 queda RECORTADA al vecindario del código y los tramos en
 * x=200/300/390 quedan en clusters sueltos — el escenario exacto del bug.
 */
function goldenVcEje3Dxf(options: GoldenOptions = {}): string {
  const {
    summary = '2x141E#318.4',
    withMarkers = false,
    withUnclassified = false,
    duplicateOverlap = false,
    omitIntermediateTop = false,
  } = options;
  const chunks = [
    text('VC-EJE-3 (50x60)', 'VIGAS-TEXTO', 100, 50, 1),
    // Contorno real: LINEs largas de lado a lado (no cosen clusters).
    line(90, 56, 400, 56, 'VIGAS'),
    line(90, 44, 400, 44, 'VIGAS'),
    // Superior (y = 58), izquierda → derecha, tramos tras traslapos.
    text('6#6 33 L', 'BARRAS', 110, 58, 1),
    text('6#6840', 'BARRAS', 200, 58, 1),
    ...(omitIntermediateTop ? [] : [text('6#6900', 'BARRAS', 300, 58, 1)]),
    text('6#635', 'BARRAS', 390, 58, 1),
    // Inferior (y = 42).
    text('6#6440', 'BARRAS', 110, 42, 1),
    text('6#6840', 'BARRAS', 200, 42, 1),
    text('6#6730', 'BARRAS', 300, 42, 1),
    text('6#6400', 'BARRAS', 390, 42, 1),
    // Resumen + zonas de estribos (suman 141) junto al código.
    text(summary, 'EstribosSeccVigas', 100, 46, 1),
    text('27 E#3@12', 'EstribosSeccVigas', 90, 52),
    text('23 E#3@12', 'EstribosSeccVigas', 94, 52),
    text('35 E#3@12', 'EstribosSeccVigas', 98, 52),
    text('25 E#3@12', 'EstribosSeccVigas', 102, 52),
    text('7 E#3@25', 'EstribosSeccVigas', 106, 52),
    text('17 E#3@25', 'EstribosSeccVigas', 110, 52),
    text('7 E#3@25', 'EstribosSeccVigas', 114, 52),
    // Segunda fila de la retícula (los planos reales apilan filas en Y).
    text('VC-EJE-5 (50x60)', 'VIGAS-TEXTO', 100, -200, 1),
    text('6#6500', 'BARRAS', 110, -192, 1),
    text('6#6510', 'BARRAS', 110, -208, 1),
  ];
  if (withMarkers) {
    chunks.push(
      circle(96, 57, 'BARRAS', 1),
      circle(99, 57, 'BARRAS', 1),
      circle(102, 57, 'BARRAS', 1),
      circle(105, 57, 'BARRAS', 1),
      circle(96, 43, 'BARRAS', 1),
      circle(99, 43, 'BARRAS', 1),
      circle(102, 43, 'BARRAS', 1),
      circle(105, 43, 'BARRAS', 1),
    );
  }
  if (withUnclassified) {
    // Texto longitudinal EXACTAMENTE en la franja divisoria (y = 50), en un
    // tramo lejano: también debe rescatarse y quedar "sin clasificar".
    chunks.push(text('6#6555', 'BARRAS', 390, 50, 1));
  }
  if (duplicateOverlap) {
    // Copia superpuesta del MISMO texto en las MISMAS coordenadas.
    chunks.push(text('6#6840', 'BARRAS', 200, 58, 1));
  }
  return wrapDxf(chunks);
}

function detailsOf(dxf: string): BeamDetail[] {
  const parse = parseDxfFile(dxf);
  if (!parse.ok) throw new Error('fixture inválido');
  return assembleBeamDetails(parse, extractDxfStructure(parse));
}

function detailOf(dxf: string, beamKey = 'VC-EJE-3'): BeamDetail {
  const detail = detailsOf(dxf).find((d) => d.beamKey === beamKey);
  if (!detail) throw new Error(`no se armó el detalle de ${beamKey}`);
  return detail;
}

const GOLDEN_TOP = ['6#6330', '6#6840', '6#6900', '6#6350'] as const;
const GOLDEN_BOTTOM = ['6#6440', '6#6840', '6#6730', '6#6400'] as const;

// ---------------------------------------------------------------------------
// 1 — Golden: secuencia longitudinal COMPLETA (jamás solo extremos)
// ---------------------------------------------------------------------------

describe('F8F.1 — Golden VC-EJE-3: secuencia completa con vista recortada', () => {
  const detail = detailOf(goldenVcEje3Dxf());

  it('superior tiene EXACTAMENTE 4 items en secuencia izquierda→derecha', () => {
    expect(detail.topLongitudinalBars.length).toBe(4);
    expect(detail.topLongitudinalBars.map((b) => b.description)).toEqual([...GOLDEN_TOP]);
  });

  it('inferior tiene EXACTAMENTE 4 items en secuencia izquierda→derecha', () => {
    expect(detail.bottomLongitudinalBars.length).toBe(4);
    expect(detail.bottomLongitudinalBars.map((b) => b.description)).toEqual([...GOLDEN_BOTTOM]);
  });

  it('las variantes de notación normalizan: "6#6 33 L" ⇒ 6#6330 y "6#635" ⇒ 6#6350', () => {
    const first = detail.topLongitudinalBars[0];
    expect(first?.sourceText).toBe('6#6 33 L');
    expect(first?.description).toBe('6#6330');
    const last = detail.topLongitudinalBars[3];
    expect(last?.sourceText).toBe('6#635');
    expect(last?.description).toBe('6#6350');
    expect(Number(last?.cutLengthM)).toBeCloseTo(3.5, 6);
  });

  it('los tramos intermedios NO se pierden: quedan declarados como rescatados', () => {
    // 3 tramos superiores + 3 inferiores fuera del bbox recortado de la vista.
    expect(detail.rescuedLongitudinalTextCount).toBe(6);
    expect(detail.warnings.join(' ')).toContain('se recuperaron');
  });

  it('6#6840 arriba y 6#6840 abajo se conservan como DOS líneas distintas', () => {
    expect(detail.topLongitudinalBars.filter((b) => b.description === '6#6840').length).toBe(1);
    expect(detail.bottomLongitudinalBars.filter((b) => b.description === '6#6840').length).toBe(1);
  });

  it('contrato F8F intacto: cantidad 1 por aparición textual, sin depender de marcadores', () => {
    for (const bar of [...detail.topLongitudinalBars, ...detail.bottomLongitudinalBars]) {
      expect(bar.quantity).toBe(1);
      expect(bar.quantityMode).toBe('textual_occurrence');
      expect(bar.quantitySource).toBe('aparición textual DXF');
    }
  });

  it('sensibilidad del golden: si falta un tramo intermedio, el conteo lo detecta', () => {
    const mutated = detailOf(goldenVcEje3Dxf({ omitIntermediateTop: true }));
    expect(mutated.topLongitudinalBars.length).toBe(3);
    expect(mutated.topLongitudinalBars.map((b) => b.description)).not.toContain('6#6900');
    // El fixture completo NO puede pasar con 3: la regla de aceptación exige 4.
    expect(detail.topLongitudinalBars.length).toBe(4);
  });

  it('duplicados superpuestos (mismo token, misma posición) se deduplican con diagnóstico', () => {
    const dup = detailOf(goldenVcEje3Dxf({ duplicateOverlap: true }));
    expect(dup.topLongitudinalBars.length).toBe(4);
    expect(dup.bottomLongitudinalBars.length).toBe(4);
    expect(
      dup.longitudinalExclusions.some(
        (record) => record.reason === 'deduplicada' && record.sourceText === '6#6840',
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2 — Diagnóstico de exclusión: nada desaparece en silencio
// ---------------------------------------------------------------------------

describe('F8F.1 — diagnóstico de exclusión de textos longitudinales', () => {
  const details = detailsOf(goldenVcEje3Dxf());
  const beam3 = details.find((d) => d.beamKey === 'VC-EJE-3')!;
  const beam5 = details.find((d) => d.beamKey === 'VC-EJE-5')!;

  it('VC-EJE-3 no registra pérdidas reales; las barras de la otra viga quedan explicadas', () => {
    const lossReasons = ['fuera_de_vista', 'descartada_por_radio', 'descartada_por_bbox', 'no_parseable'];
    expect(beam3.longitudinalExclusions.filter((r) => lossReasons.includes(r.reason))).toEqual([]);
    for (const foreign of ['6#6500', '6#6510']) {
      const record = beam3.longitudinalExclusions.find((r) => r.sourceText === foreign);
      expect(record?.reason).toBe('asignada_a_otra_vista');
    }
  });

  it('para VC-EJE-5, los 8 textos de la viga 3 NO son barras propias y quedan contabilizados', () => {
    const beam5Texts = [
      ...beam5.topLongitudinalBars,
      ...beam5.bottomLongitudinalBars,
      ...beam5.unclassifiedLongitudinalBars,
    ].map((b) => b.description);
    for (const description of [...GOLDEN_TOP, ...GOLDEN_BOTTOM]) {
      expect(beam5Texts).not.toContain(description);
    }
    // Ningún texto desaparece: los 8 quedan contabilizados como de otra vista
    // (los cercanos al código, por asignación firme a la vista de la viga 3;
    // los tramos lejanos, re-etiquetados "leída en el detalle de VC-EJE-3").
    const beam3Sources = ['6#6 33 L', '6#6840', '6#6900', '6#635', '6#6440', '6#6730', '6#6400'];
    for (const sourceText of beam3Sources) {
      const records = beam5.longitudinalExclusions.filter((r) => r.sourceText === sourceText);
      expect(records.length).toBeGreaterThanOrEqual(1);
      expect(records.every((r) => r.reason === 'asignada_a_otra_vista')).toBe(true);
    }
    const relabeled = beam5.longitudinalExclusions.filter((r) => r.detail?.includes('VC-EJE-3'));
    expect(relabeled.length).toBeGreaterThanOrEqual(6);
  });

  it('todo texto longitudinal del DXF es visible o está excluido con razón (invariante)', () => {
    for (const detail of details) {
      const visible = new Set(
        [
          ...detail.topLongitudinalBars,
          ...detail.bottomLongitudinalBars,
          ...detail.unclassifiedLongitudinalBars,
        ].map((b) => b.sourceText),
      );
      const excluded = new Set(detail.longitudinalExclusions.map((r) => r.sourceText));
      for (const sourceText of ['6#6 33 L', '6#6840', '6#6900', '6#635', '6#6440', '6#6730', '6#6400', '6#6500', '6#6510']) {
        expect(visible.has(sourceText) || excluded.has(sourceText)).toBe(true);
      }
    }
  });

  it('texto ambiguo queda "sin clasificar" con acción, y registrado como banda_ambigua', () => {
    const detail = detailOf(goldenVcEje3Dxf({ withMarkers: true, withUnclassified: true }));
    expect(detail.topLongitudinalBars.length).toBe(4);
    expect(detail.bottomLongitudinalBars.length).toBe(4);
    expect(detail.unclassifiedLongitudinalBars.length).toBe(1);
    const bar = detail.unclassifiedLongitudinalBars[0];
    expect(bar?.description).toBe('6#6555');
    expect(bar?.position).toBe('sin_clasificar');
    expect(bar?.quantity).toBe(1);
    const record = detail.longitudinalExclusions.find((r) => r.sourceText === '6#6555');
    expect(record?.reason).toBe('banda_ambigua');
  });
});

// ---------------------------------------------------------------------------
// 3 — Dispatch: 4 + 4 + 1 = 9 líneas y acciones de banda
// ---------------------------------------------------------------------------

describe('F8F.1 — dispatch golden 9 líneas y acciones', () => {
  it('con estribo válido (match) el dispatch envía EXACTAMENTE 9 líneas: 4+4+1', () => {
    const dispatch = buildBeamTakeoffDispatch(detailOf(goldenVcEje3Dxf()), 'vigas.dxf');
    expect(dispatch.lines.length).toBe(9);
    expect(dispatch.topCount).toBe(4);
    expect(dispatch.bottomCount).toBe(4);
    expect(dispatch.stirrupIncluded).toBe(true);
    expect(dispatch.previewText).toBe('Se enviarán 9 línea(s): 4 superior, 4 inferior, 1 estribo.');
    expect(dispatch.lines.map((l) => l.originalDescription)).toEqual([
      ...GOLDEN_TOP,
      ...GOLDEN_BOTTOM,
      '2x141E#3184',
    ]);
    for (const line of dispatch.lines) {
      if (line.evidence?.position === 'estribo') continue;
      // Contrato F8F: cantidad 1 por aparición textual, jamás el primer dígito.
      expect(line.manualQuantity).toBe('1');
      expect(line.manualBarNumber).toBe(6);
      expect(line.manualCutLengthM).toBeDefined();
      expect(line.evidence?.quantityMode).toBe('textual_occurrence');
    }
  });

  it('el dispatch jamás envía solo el estribo: las 8 longitudinales entran', () => {
    const dispatch = buildBeamTakeoffDispatch(detailOf(goldenVcEje3Dxf()), 'vigas.dxf');
    const longitudinalLines = dispatch.lines.filter((l) => l.evidence?.position !== 'estribo');
    expect(longitudinalLines.length).toBe(8);
  });

  it('estribo en mismatch sin decisión: van las 8 longitudinales, nunca 0', () => {
    const dispatch = buildBeamTakeoffDispatch(
      detailOf(goldenVcEje3Dxf({ summary: '2x140E#318.4' })),
      'vigas.dxf',
    );
    expect(dispatch.lines.length).toBe(8);
    expect(dispatch.stirrupIncluded).toBe(false);
    expect(dispatch.stirrupBlockedReason).toContain('desfase');
  });

  it('acción "incluir como superior" sobre el texto ambiguo lo envía en la banda superior', () => {
    const detail = detailOf(goldenVcEje3Dxf({ withMarkers: true, withUnclassified: true }));
    const readingId = detail.unclassifiedLongitudinalBars[0]!.readingId;
    const dispatch = buildBeamTakeoffDispatch(detail, 'vigas.dxf', {
      decisions: { [readingId]: { assignPosition: 'superior' } },
    });
    expect(dispatch.lines.length).toBe(10);
    expect(dispatch.topCount).toBe(5);
    expect(dispatch.bottomCount).toBe(4);
    expect(dispatch.skippedBars.some((bar) => bar.description === '6#6555')).toBe(false);
  });

  it('acción "incluir como inferior" sobre el texto ambiguo lo envía en la banda inferior', () => {
    const detail = detailOf(goldenVcEje3Dxf({ withMarkers: true, withUnclassified: true }));
    const readingId = detail.unclassifiedLongitudinalBars[0]!.readingId;
    const dispatch = buildBeamTakeoffDispatch(detail, 'vigas.dxf', {
      decisions: { [readingId]: { assignPosition: 'inferior' } },
    });
    expect(dispatch.topCount).toBe(4);
    expect(dispatch.bottomCount).toBe(5);
  });

  it('sin decisión, el texto ambiguo NO entra pero queda visible en skippedBars', () => {
    const detail = detailOf(goldenVcEje3Dxf({ withMarkers: true, withUnclassified: true }));
    const dispatch = buildBeamTakeoffDispatch(detail, 'vigas.dxf');
    expect(dispatch.lines.length).toBe(9);
    expect(dispatch.skippedBars.some((bar) => bar.description === '6#6555')).toBe(true);
  });
});
