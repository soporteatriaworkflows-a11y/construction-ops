/**
 * f8f2-lwpolyline-vertices.test.ts — F8F.2: DXF LWPOLYLINE Vertex Parser
 * Hardening.
 *
 * Bug de parser heredado: `dxf-parser.ts` solo conservaba el PRIMER vértice de
 * cada LWPOLYLINE ("los 10/20 extra no pisan el punto inicial"), así que un
 * contorno de viga dibujado como polilínea (lo usual en AutoCAD) anclaba la
 * vista en un único punto: el bbox quedaba truncado al vecindario del código.
 * F8F.1 (PR #73) rescató los textos a nivel ensamblador (territorio de
 * fila/columna) SIN corregir el parser; esta fase porta el fix profundo:
 *
 * - el parser acumula TODOS los vértices 10/20 (en orden) y el flag de cierre;
 * - la segmentación ancla polilíneas por los vértices de sus segmentos CORTOS
 *   (misma guarda que las LINE: bordes de lámina no cosen vistas);
 * - la asignación por retícula evalúa todos los puntos de anclaje de la
 *   entidad (prioridad assign > ambiguous > far).
 *
 * El comportamiento de F8F.1 (#73) queda intacto: mismos golden 4+4, mismo
 * dispatch 9 líneas, mismo diagnóstico de exclusiones. Fixtures SIEMPRE
 * sintéticos por código; jamás un DXF real.
 */
import { describe, expect, it } from 'vitest';
import { parseDxfFile } from '@/lib/steel/dxf/dxf-parser';
import { extractDxfStructure } from '@/lib/steel/dxf/dxf-structural-extractor';
import { segmentDxfViews, viewForBeamKey } from '@/lib/steel/dxf/dxf-view-segmentation';
import {
  assembleBeamDetails,
  buildBeamTakeoffDispatch,
  TEXTUAL_OCCURRENCE_QUANTITY_SOURCE,
  type BeamDetail,
} from '@/lib/steel/dxf/dxf-beam-detail-assembly';

// ---------------------------------------------------------------------------
// Constructores sintéticos (fixtures SIEMPRE por código, jamás DXF real)
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

/** Contorno real de viga: LWPOLYLINE con vértices (cerrada si closed). */
function lwpolyline(vertices: ReadonlyArray<readonly [number, number]>, layer: string, closed = true): string {
  const chunks = ['0', 'LWPOLYLINE', '8', layer, '90', String(vertices.length), '70', closed ? '1' : '0'];
  for (const [x, y] of vertices) {
    chunks.push('10', String(x), '20', String(y));
  }
  return chunks.join('\n');
}

function wrapDxf(chunks: string[]): string {
  return ['0', 'SECTION', '2', 'ENTITIES', ...chunks, '0', 'ENDSEC', '0', 'EOF'].join('\n');
}

/**
 * Fixture golden VC-EJE-3 tipo plano real: cada viga de cimentación es una
 * ELEVACIÓN larga (una por fila de la lámina) con contorno LWPOLYLINE
 * cerrado; los textos de la secuencia longitudinal van repartidos a lo largo
 * de la viga (tramos tras traslapos/cambios de tramo), lejos del código.
 */
function goldenBeamRowsDxf(options: { summary?: string; withSheetBorder?: boolean } = {}): string {
  const { summary = '2x141E#318.4', withSheetBorder = false } = options;
  const chunks = [
    // ---- Fila 1: VC-EJE-3 (elevación completa x≈95..795) ------------------
    text('VC-EJE-3 (50x60)', 'VIGAS-TEXTO', 100, 50, 1),
    lwpolyline(
      [
        [95, 56],
        [795, 56],
        [795, 44],
        [95, 44],
      ],
      'VIGAS',
    ),
    // Superior (y = 58), izquierda → derecha, repartidos por tramos.
    text('6#6 33 L', 'BARRAS', 110, 58, 1),
    text('6#6840', 'BARRAS', 300, 58, 1),
    text('6#6900', 'BARRAS', 550, 58, 1),
    text('6#6350', 'BARRAS', 780, 58, 1),
    // Inferior (y = 42).
    text('6#6440', 'BARRAS', 110, 42, 1),
    text('6#6840', 'BARRAS', 300, 42, 1),
    text('6#6730', 'BARRAS', 550, 42, 1),
    text('6#6400', 'BARRAS', 740, 42, 1),
    // Marcadores del corte (4 arriba / 4 abajo) cerca del código.
    circle(96, 57, 'BARRAS', 1),
    circle(99, 57, 'BARRAS', 1),
    circle(102, 57, 'BARRAS', 1),
    circle(105, 57, 'BARRAS', 1),
    circle(96, 43, 'BARRAS', 1),
    circle(99, 43, 'BARRAS', 1),
    circle(102, 43, 'BARRAS', 1),
    circle(105, 43, 'BARRAS', 1),
    // Resumen + zonas (suman 141).
    text(summary, 'EstribosSeccVigas', 100, 46, 1),
    text('27 E#3@12', 'EstribosSeccVigas', 96, 52),
    text('23 E#3@12', 'EstribosSeccVigas', 100, 52),
    text('35 E#3@12', 'EstribosSeccVigas', 104, 52),
    text('25 E#3@12', 'EstribosSeccVigas', 108, 52),
    text('7 E#3@25', 'EstribosSeccVigas', 112, 52),
    text('17 E#3@25', 'EstribosSeccVigas', 116, 52),
    text('7 E#3@25', 'EstribosSeccVigas', 120, 52),
    // ---- Fila 2: VC-EJE-4 (contenido propio, no debe contaminarse) --------
    text('VC-EJE-4 (50x60)', 'VIGAS-TEXTO', 100, -200, 1),
    lwpolyline(
      [
        [95, -194],
        [795, -194],
        [795, -206],
        [95, -206],
      ],
      'VIGAS',
    ),
    text('6#6500', 'BARRAS', 110, -192, 1),
    circle(106, -193, 'BARRAS', 1),
    circle(106, -203, 'BARRAS', 1),
  ];
  if (withSheetBorder) {
    // Borde de lámina: rectángulo gigante que rodea TODO. Sus segmentos son
    // larguísimos y no deben coser vistas ni anclar nada.
    chunks.push(
      lwpolyline(
        [
          [0, -300],
          [900, -300],
          [900, 150],
          [0, 150],
        ],
        'MARGEN',
      ),
    );
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
// A — Parser: LWPOLYLINE conserva TODOS sus vértices
// ---------------------------------------------------------------------------

describe('F8F.2-A — parser: vértices completos de LWPOLYLINE', () => {
  it('conserva los 4 vértices en orden, el flag de cierre y x/y = primer vértice', () => {
    const parse = parseDxfFile(
      wrapDxf([
        lwpolyline(
          [
            [95, 56],
            [795, 56],
            [795, 44],
            [95, 44],
          ],
          'VIGAS',
        ),
      ]),
    );
    expect(parse.ok).toBe(true);
    if (!parse.ok) return;
    const poly = parse.entities.find((e) => e.type === 'LWPOLYLINE');
    expect(poly?.type).toBe('LWPOLYLINE');
    if (poly?.type !== 'LWPOLYLINE') return;
    expect(poly.vertices).toEqual([
      { x: 95, y: 56 },
      { x: 795, y: 56 },
      { x: 795, y: 44 },
      { x: 95, y: 44 },
    ]);
    expect(poly.closed).toBe(true);
    expect(poly.vertexCount).toBe(4);
    // Compatibilidad: el punto principal sigue siendo el primer vértice.
    expect(poly.x).toBe(95);
    expect(poly.y).toBe(56);
  });

  it('polilínea abierta: closed=false y vértices íntegros', () => {
    const parse = parseDxfFile(
      wrapDxf([
        lwpolyline(
          [
            [0, 0],
            [10, 0],
            [10, 5],
          ],
          'VIGAS',
          false,
        ),
      ]),
    );
    expect(parse.ok).toBe(true);
    if (!parse.ok) return;
    const poly = parse.entities.find((e) => e.type === 'LWPOLYLINE');
    if (poly?.type !== 'LWPOLYLINE') throw new Error('sin LWPOLYLINE');
    expect(poly.vertices?.length).toBe(3);
    expect(poly.closed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// B — Segmentación: el bbox de la vista usa los vértices, no solo el primero
// ---------------------------------------------------------------------------

describe('F8F.2-B — segmentación: bbox de vista cose el contorno completo', () => {
  it('la vista de VC-EJE-3 abarca la elevación completa (no solo el vecindario del código)', () => {
    const parse = parseDxfFile(goldenBeamRowsDxf());
    if (!parse.ok) throw new Error('fixture inválido');
    const view = viewForBeamKey(segmentDxfViews(parse), 'VC-EJE-3');
    expect(view).toBeDefined();
    // Con el bug (solo primer vértice) el bbox quedaba truncado cerca de
    // x≈120; con los vértices completos debe cubrir el contorno hasta x=795.
    expect(view!.bbox.maxX).toBeGreaterThanOrEqual(795);
    expect(view!.bbox.minX).toBeLessThanOrEqual(95);
  });

  it('el borde de lámina (LWPOLYLINE gigante) no cose vistas: las dos filas siguen separadas', () => {
    const parse = parseDxfFile(goldenBeamRowsDxf({ withSheetBorder: true }));
    if (!parse.ok) throw new Error('fixture inválido');
    const segmentation = segmentDxfViews(parse);
    const beam3 = viewForBeamKey(segmentation, 'VC-EJE-3');
    const beam4 = viewForBeamKey(segmentation, 'VC-EJE-4');
    expect(beam3).toBeDefined();
    expect(beam4).toBeDefined();
    expect(beam3!.viewId).not.toBe(beam4!.viewId);
  });
});

// ---------------------------------------------------------------------------
// C — Golden 4+4 con contorno LWPOLYLINE (regla de aceptación F8F.1 intacta)
// ---------------------------------------------------------------------------

describe('F8F.2-C — golden VC-EJE-3 con contorno LWPOLYLINE', () => {
  const detail = detailOf(goldenBeamRowsDxf());

  it('superior completa los 4 tramos en secuencia izquierda→derecha', () => {
    expect(detail.topLongitudinalBars.map((b) => b.description)).toEqual([...GOLDEN_TOP]);
  });

  it('inferior completa los 4 tramos en secuencia izquierda→derecha', () => {
    expect(detail.bottomLongitudinalBars.map((b) => b.description)).toEqual([...GOLDEN_BOTTOM]);
  });

  it('readingId estable entre parses y único dentro del detalle', () => {
    const again = detailOf(goldenBeamRowsDxf());
    const ids = (d: BeamDetail) =>
      [...d.topLongitudinalBars, ...d.bottomLongitudinalBars, ...d.unclassifiedLongitudinalBars].map(
        (b) => b.readingId,
      );
    const first = ids(detail);
    expect(ids(again)).toEqual(first);
    expect(new Set(first).size).toBe(first.length);
  });

  it('la viga vecina NO absorbe barras de VC-EJE-3 y conserva las suyas', () => {
    const neighbor = detailOf(goldenBeamRowsDxf(), 'VC-EJE-4');
    expect(neighbor.topLongitudinalBars.map((b) => b.description)).toEqual(['6#6500']);
    const all = [
      ...neighbor.topLongitudinalBars,
      ...neighbor.bottomLongitudinalBars,
      ...neighbor.unclassifiedLongitudinalBars,
    ];
    for (const description of [...GOLDEN_TOP, ...GOLDEN_BOTTOM]) {
      expect(all.some((b) => b.description === description)).toBe(false);
    }
  });

  it('con borde de lámina, la secuencia 4+4 y la separación de vistas se mantienen', () => {
    const details = detailsOf(goldenBeamRowsDxf({ withSheetBorder: true }));
    const beam3 = details.find((d) => d.beamKey === 'VC-EJE-3');
    const beam4 = details.find((d) => d.beamKey === 'VC-EJE-4');
    expect(beam3?.topLongitudinalBars.length).toBe(4);
    expect(beam3?.bottomLongitudinalBars.length).toBe(4);
    expect(beam4?.topLongitudinalBars.map((b) => b.description)).toEqual(['6#6500']);
  });

  it('nada desaparece en silencio: cada texto es visible o queda excluido con razón', () => {
    for (const d of detailsOf(goldenBeamRowsDxf())) {
      const visible = new Set(
        [...d.topLongitudinalBars, ...d.bottomLongitudinalBars, ...d.unclassifiedLongitudinalBars].map(
          (b) => b.sourceText,
        ),
      );
      const excluded = new Set(d.longitudinalExclusions.map((r) => r.sourceText));
      for (const sourceText of ['6#6 33 L', '6#6840', '6#6900', '6#6350', '6#6440', '6#6730', '6#6400', '6#6500']) {
        expect(visible.has(sourceText) || excluded.has(sourceText)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// D — Contrato F8F y dispatch sin regresión
// ---------------------------------------------------------------------------

describe('F8F.2-D — contrato F8F y dispatch 4+4+1', () => {
  it('cantidad 1 por aparición textual DXF en las 8 barras (quantityMode/quantitySource intactos)', () => {
    const detail = detailOf(goldenBeamRowsDxf());
    for (const bar of [...detail.topLongitudinalBars, ...detail.bottomLongitudinalBars]) {
      expect(bar.quantity).toBe(1);
      expect(bar.quantityMode).toBe('textual_occurrence');
      expect(bar.quantitySource).toBe(TEXTUAL_OCCURRENCE_QUANTITY_SOURCE);
    }
  });

  it('con estribo válido (match) el dispatch envía EXACTAMENTE 9 líneas: 4+4+1', () => {
    const dispatch = buildBeamTakeoffDispatch(detailOf(goldenBeamRowsDxf()), 'vigas.dxf');
    expect(dispatch.lines.length).toBe(9);
    expect(dispatch.topCount).toBe(4);
    expect(dispatch.bottomCount).toBe(4);
    expect(dispatch.stirrupIncluded).toBe(true);
    expect(dispatch.previewText).toBe('Se enviarán 9 línea(s): 4 superior, 4 inferior, 1 estribo.');
  });

  it('cada línea longitudinal lleva overrides estructurados: manualQuantity=1, manualCutLengthM y manualBarNumber', () => {
    const dispatch = buildBeamTakeoffDispatch(detailOf(goldenBeamRowsDxf()), 'vigas.dxf');
    const longitudinal = dispatch.lines.filter((line) => line.evidence?.position !== 'estribo');
    expect(longitudinal.length).toBe(8);
    for (const line of longitudinal) {
      // Contrato F8F: cantidad 1 por aparición textual, jamás el primer dígito.
      expect(line.manualQuantity).toBe('1');
      expect(Number(line.manualCutLengthM)).toBeGreaterThan(0);
      expect(line.manualBarNumber).toBe(6);
      expect(line.evidence?.quantityMode).toBe('textual_occurrence');
      expect(line.evidence?.quantitySource).toBe(TEXTUAL_OCCURRENCE_QUANTITY_SOURCE);
    }
  });

  it('mismatch de estribo bloquea SOLO el estribo: las 8 longitudinales entran', () => {
    const detail = detailOf(goldenBeamRowsDxf({ summary: '2x140E#318.4' }));
    const dispatch = buildBeamTakeoffDispatch(detail, 'vigas.dxf');
    expect(dispatch.stirrupIncluded).toBe(false);
    expect(dispatch.stirrupBlockedReason).toContain('desfase');
    expect(dispatch.topCount).toBe(4);
    expect(dispatch.bottomCount).toBe(4);
    expect(dispatch.lines.length).toBe(8);
  });
});
