/**
 * f8e-longitudinal-sequence.test.ts — F8E: secuencia longitudinal COMPLETA
 * por vista + Takeoff Dispatch Contract.
 *
 * A/B: dentro de cada vista se recolectan TODOS los textos de barras
 * longitudinales (traslapos/cambios de tramo incluidos), ordenados por el eje
 * dominante y clasificados por banda; lo ambiguo queda `sin_clasificar`
 * visible, jamás descartado ni perdido.
 * C: "Enviar al takeoff" manda cada barra superior/inferior computable + UNA
 * línea de estribos según el contrato (match / decisión humana / bloqueado).
 * E: fixture sintético de VC-EJE-3 (siempre por código, jamás DXF real).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDxfFile } from '@/lib/steel/dxf/dxf-parser';
import { extractDxfStructure } from '@/lib/steel/dxf/dxf-structural-extractor';
import {
  assembleBeamDetails,
  buildBeamTakeoffDispatch,
  type BeamDetail,
} from '@/lib/steel/dxf/dxf-beam-detail-assembly';
import { normalizeCompactLongitudinalNotation } from '@/lib/steel/dxf/compact-stirrup-notation';

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

interface VcEje3Options {
  summary?: string;
  withMarkers?: boolean;
  withUnclassified?: boolean;
  duplicateOverlap?: boolean;
  variantTokens?: boolean;
}

/**
 * Fixture E del mandato — VC-EJE-3 completo:
 * superior 6#6 33 L / 6#6840 / 6#6900 / 6#635 (izq→der),
 * inferior 6#6440 / 6#6840 / 6#6730 / 6#6400,
 * 7 zonas de estribos + resumen, 4 marcadores arriba y 4 abajo.
 */
function vcEje3Dxf(options: VcEje3Options = {}): string {
  const {
    summary = '2x141E#318.4',
    withMarkers = true,
    withUnclassified = false,
    duplicateOverlap = false,
    variantTokens = false,
  } = options;
  const chunks = [
    text('VC-EJE-3 (50x60)', 'VIGAS-TEXTO', 100, 50, 1),
    // Superior (y = 58), izquierda → derecha.
    text(variantTokens ? '6 # 6 330' : '6#6 33 L', 'BARRAS', 92, 58, 1),
    text(variantTokens ? '6#6 L=840' : '6#6840', 'BARRAS', 98, 58, 1),
    text('6#6900', 'BARRAS', 104, 58, 1),
    text('6#635', 'BARRAS', 110, 58, 1),
    // Inferior (y = 42), izquierda → derecha.
    text('6#6440', 'BARRAS', 92, 42, 1),
    text('6#6840', 'BARRAS', 98, 42, 1),
    text('6#6730', 'BARRAS', 104, 42, 1),
    text('6#6400', 'BARRAS', 110, 42, 1),
    // Resumen + zonas (suman 141) + segmentos del flejado.
    text(summary, 'EstribosSeccVigas', 100, 46, 1),
    text('27 E#3@12', 'EstribosSeccVigas', 90, 52),
    text('23 E#3@12', 'EstribosSeccVigas', 94, 52),
    text('35 E#3@12', 'EstribosSeccVigas', 98, 52),
    text('25 E#3@12', 'EstribosSeccVigas', 102, 52),
    text('7 E#3@25', 'EstribosSeccVigas', 106, 52),
    text('17 E#3@25', 'EstribosSeccVigas', 110, 52),
    text('7 E#3@25', 'EstribosSeccVigas', 114, 52),
    text('50', 'CotasEstribSeccion', 94, 48),
    text('30', 'CotasEstribSeccion', 97, 48),
    text('12', 'CotasEstribSeccion', 100, 48),
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
    // Texto longitudinal EXACTAMENTE en la franja divisoria (y = 50).
    chunks.push(text('6#6555', 'BARRAS', 116, 50, 1));
  }
  if (duplicateOverlap) {
    // Copia superpuesta del MISMO texto en las MISMAS coordenadas.
    chunks.push(text('6#6840', 'BARRAS', 98, 58, 1));
  }
  return wrapDxf(chunks);
}

/**
 * Dos detalles CONTIGUOS en la misma fila (VC-EJE-3 y VC-EJE-4) + segunda
 * fila para la retícula: reproduce la pérdida de producción — el tramo
 * intermedio (6#6900 en x=300) y el tramo pegado a la frontera del detalle
 * vecino (6#6350 en x=392, a 8 unidades del código VC-EJE-4) NO deben
 * perderse del detalle de VC-EJE-3.
 */
function twoViewRowDxf(): string {
  const chunks = [
    text('VC-EJE-3 (50x60)', 'VIGAS-TEXTO', 100, 50, 1),
    text('VC-EJE-4 (50x60)', 'VIGAS-TEXTO', 400, 50, 1),
    // Contorno de la viga 3 en tramos cortos (extiende la vista hasta x≈395).
    line(95, 56, 195, 56, 'VIGAS'),
    line(195, 56, 295, 56, 'VIGAS'),
    line(295, 56, 395, 56, 'VIGAS'),
    line(95, 44, 195, 44, 'VIGAS'),
    line(195, 44, 295, 44, 'VIGAS'),
    line(295, 44, 395, 44, 'VIGAS'),
    // Superior viga 3: secuencia con traslapos/cambios de tramo.
    text('6#6330', 'BARRAS', 110, 58, 1),
    text('6#6840', 'BARRAS', 200, 58, 1),
    text('6#6900', 'BARRAS', 300, 58, 1),
    text('6#6350', 'BARRAS', 392, 58, 1),
    // Inferior viga 3.
    text('6#6440', 'BARRAS', 110, 42, 1),
    text('6#6840', 'BARRAS', 200, 42, 1),
    text('6#6730', 'BARRAS', 300, 42, 1),
    text('6#6400', 'BARRAS', 360, 42, 1),
    // Marcadores viga 3 (4 arriba, 4 abajo).
    circle(96, 57, 'BARRAS', 1),
    circle(99, 57, 'BARRAS', 1),
    circle(102, 57, 'BARRAS', 1),
    circle(105, 57, 'BARRAS', 1),
    circle(96, 43, 'BARRAS', 1),
    circle(99, 43, 'BARRAS', 1),
    circle(102, 43, 'BARRAS', 1),
    circle(105, 43, 'BARRAS', 1),
    // Resumen + zonas viga 3.
    text('2x141E#318.4', 'EstribosSeccVigas', 100, 46, 1),
    text('27 E#3@12', 'EstribosSeccVigas', 90, 52),
    text('23 E#3@12', 'EstribosSeccVigas', 94, 52),
    text('35 E#3@12', 'EstribosSeccVigas', 98, 52),
    text('25 E#3@12', 'EstribosSeccVigas', 102, 52),
    text('7 E#3@25', 'EstribosSeccVigas', 106, 52),
    text('17 E#3@25', 'EstribosSeccVigas', 110, 52),
    text('7 E#3@25', 'EstribosSeccVigas', 114, 52),
    // Viga 4: contenido propio (a la derecha de su código).
    text('6#6500', 'BARRAS', 410, 58, 1),
    circle(406, 57, 'BARRAS', 1),
    circle(409, 57, 'BARRAS', 1),
    // Segunda fila de la retícula (los planos reales apilan filas en Y).
    text('VC-EJE-5 (50x60)', 'VIGAS-TEXTO', 100, -200, 1),
    text('50x60', 'VIGAS-TEXTO', 105, -196),
    text('VC-EJE-6 (50x60)', 'VIGAS-TEXTO', 400, -200, 1),
    text('50x60', 'VIGAS-TEXTO', 405, -196),
  ];
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

// ---------------------------------------------------------------------------
// A/E — Secuencia longitudinal completa en el fixture VC-EJE-3
// ---------------------------------------------------------------------------

describe('F8E-A/E — VC-EJE-3: secuencia longitudinal completa', () => {
  const detail = detailOf(vcEje3Dxf());

  it('superior tiene los 4 items en secuencia izquierda→derecha', () => {
    expect(detail.topLongitudinalBars.map((b) => b.description)).toEqual([
      '6#6330',
      '6#6840',
      '6#6900',
      '6#6350',
    ]);
  });

  it('inferior tiene los 4 items en secuencia izquierda→derecha', () => {
    expect(detail.bottomLongitudinalBars.map((b) => b.description)).toEqual([
      '6#6440',
      '6#6840',
      '6#6730',
      '6#6400',
    ]);
  });

  it('"6#6 33 L" normaliza a 6#6330 y "6#635" a 6#6350 (con contexto)', () => {
    const first = detail.topLongitudinalBars[0];
    expect(first?.sourceText).toBe('6#6 33 L');
    expect(first?.description).toBe('6#6330');
    const last = detail.topLongitudinalBars[3];
    expect(last?.sourceText).toBe('6#635');
    expect(last?.description).toBe('6#6350');
    expect(Number(last?.cutLengthM)).toBeCloseTo(3.5, 6);
  });

  it('6#6840 arriba y 6#6840 abajo se conservan como DOS líneas distintas', () => {
    const top = detail.topLongitudinalBars.filter((b) => b.description === '6#6840');
    const bottom = detail.bottomLongitudinalBars.filter((b) => b.description === '6#6840');
    expect(top.length).toBe(1);
    expect(bottom.length).toBe(1);
    expect(top[0]?.position).toBe('superior');
    expect(bottom[0]?.position).toBe('inferior');
  });

  it('4 marcadores arriba/abajo ⇒ cantidad gráfica 4 en cada banda', () => {
    for (const bar of detail.topLongitudinalBars) {
      expect(bar.quantityFromGraphic).toBe(4);
      expect(bar.quantityStatus).toBe('from_markers');
    }
    for (const bar of detail.bottomLongitudinalBars) {
      expect(bar.quantityFromGraphic).toBe(4);
    }
  });

  it('texto superpuesto idéntico (misma posición) se deduplica; nada más', () => {
    const dup = detailOf(vcEje3Dxf({ duplicateOverlap: true }));
    expect(dup.topLongitudinalBars.filter((b) => b.description === '6#6840').length).toBe(1);
    expect(dup.topLongitudinalBars.length).toBe(4);
    expect(dup.bottomLongitudinalBars.length).toBe(4);
  });

  it('variantes con espacios y L=: "6 # 6 330" y "6#6 L=840" se leen', () => {
    const variant = detailOf(vcEje3Dxf({ variantTokens: true }));
    const descriptions = variant.topLongitudinalBars.map((b) => b.description);
    expect(descriptions).toEqual(['6#6330', '6#6840', '6#6900', '6#6350']);
  });

  it('normalización L= directa: "6#6 L=330" ⇒ 330 cm; "6#6 L=33" ⇒ 330 cm', () => {
    const direct = normalizeCompactLongitudinalNotation('6#6 L=330', { structuralContext: true });
    expect(direct.applied).toBe(true);
    expect(direct.interpretations[0]?.lengthCm).toBe(330);
    const compact = normalizeCompactLongitudinalNotation('6#6 L=33', { structuralContext: true });
    expect(compact.interpretations[0]?.lengthCm).toBe(330);
  });
});

// ---------------------------------------------------------------------------
// B — Clasificación por banda con zona ambigua explícita
// ---------------------------------------------------------------------------

describe('F8E-B — banda superior/inferior y sin_clasificar', () => {
  it('texto en la franja divisoria queda sin_clasificar, visible y con warning', () => {
    const detail = detailOf(vcEje3Dxf({ withUnclassified: true }));
    // Las bandas claras NO pierden items por culpa del ambiguo.
    expect(detail.topLongitudinalBars.length).toBe(4);
    expect(detail.bottomLongitudinalBars.length).toBe(4);
    expect(detail.unclassifiedLongitudinalBars.length).toBe(1);
    const ambiguousBar = detail.unclassifiedLongitudinalBars[0];
    expect(ambiguousBar?.description).toBe('6#6555');
    expect(ambiguousBar?.position).toBe('sin_clasificar');
    expect(ambiguousBar?.quantityStatus).toBe('requires_review');
    expect(detail.warnings.join(' ')).toContain('Sin clasificar / revisar');
    expect(detail.status).toBe('requires_review');
  });

  it('sin separación de bandas detectable, nada se clasifica a ciegas', () => {
    // Solo textos a la MISMA altura y sin marcadores: banda indecidible.
    const dxf = wrapDxf([
      text('VC-EJE-9 (50x60)', 'VIGAS-TEXTO', 100, 50, 1),
      text('6#6330', 'BARRAS', 92, 58, 1),
      text('6#6840', 'BARRAS', 98, 58, 1),
      text('6#6900', 'BARRAS', 104, 58, 1),
    ]);
    const detail = detailOf(dxf, 'VC-EJE-9');
    expect(detail.topLongitudinalBars.length).toBe(0);
    expect(detail.bottomLongitudinalBars.length).toBe(0);
    expect(detail.unclassifiedLongitudinalBars.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// A — Textos intermedios entre vistas contiguas NO se pierden
// ---------------------------------------------------------------------------

describe('F8E-A — tramos intermedios con vistas contiguas', () => {
  const details = detailsOf(twoViewRowDxf());
  const detail = details.find((d) => d.beamKey === 'VC-EJE-3')!;

  it('la secuencia superior conserva el tramo intermedio y el pegado a la frontera', () => {
    expect(detail.topLongitudinalBars.map((b) => b.description)).toEqual([
      '6#6330',
      '6#6840',
      '6#6900',
      '6#6350',
    ]);
  });

  it('la secuencia inferior queda completa (4 items)', () => {
    expect(detail.bottomLongitudinalBars.map((b) => b.description)).toEqual([
      '6#6440',
      '6#6840',
      '6#6730',
      '6#6400',
    ]);
  });

  it('los textos recuperados de la franja ambigua quedan declarados', () => {
    expect(detail.rescuedLongitudinalTextCount).toBeGreaterThanOrEqual(1);
    expect(detail.warnings.join(' ')).toContain('se recuperaron');
  });

  it('el detalle vecino NO absorbe los textos de la viga 3', () => {
    const neighbor = details.find((d) => d.beamKey === 'VC-EJE-4')!;
    const neighborTexts = [
      ...neighbor.topLongitudinalBars,
      ...neighbor.bottomLongitudinalBars,
      ...neighbor.unclassifiedLongitudinalBars,
    ].map((b) => b.description);
    expect(neighborTexts).not.toContain('6#6350');
    expect(neighborTexts).not.toContain('6#6400');
  });
});

// ---------------------------------------------------------------------------
// C — Takeoff Dispatch Contract
// ---------------------------------------------------------------------------

describe('F8E-C — Takeoff Dispatch Contract', () => {
  it('4 superior + 4 inferior + estribo match ⇒ 9 líneas (jamás solo estribos)', () => {
    const dispatch = buildBeamTakeoffDispatch(detailOf(vcEje3Dxf()), 'vigas.dxf');
    expect(dispatch.lines.length).toBe(9);
    expect(dispatch.topCount).toBe(4);
    expect(dispatch.bottomCount).toBe(4);
    expect(dispatch.stirrupIncluded).toBe(true);
    expect(dispatch.previewText).toBe('Se enviarán 9 línea(s): 4 superior, 4 inferior, 1 estribo.');
    const descriptions = dispatch.lines.map((l) => l.originalDescription);
    // Cantidad gráfica 4, jamás el 6 del texto.
    expect(descriptions).toEqual([
      '4#6330',
      '4#6840',
      '4#6900',
      '4#6350',
      '4#6440',
      '4#6840',
      '4#6730',
      '4#6400',
      '2x141E#3184',
    ]);
  });

  it('mismatch SIN decisión ⇒ solo longitudinales + estribo bloqueado con motivo', () => {
    const dispatch = buildBeamTakeoffDispatch(detailOf(vcEje3Dxf({ summary: '2x140E#318.4' })), 'vigas.dxf');
    expect(dispatch.lines.length).toBe(8);
    expect(dispatch.stirrupIncluded).toBe(false);
    expect(dispatch.stirrupBlockedReason).toContain('desfase');
    expect(dispatch.lines.every((l) => l.evidence?.position !== 'estribo')).toBe(true);
  });

  it('mismatch con "usar resumen del plano" ⇒ incluye el resumen declarado', () => {
    const dispatch = buildBeamTakeoffDispatch(detailOf(vcEje3Dxf({ summary: '2x140E#318.4' })), 'vigas.dxf', {
      stirrupChoice: 'declared_summary',
    });
    expect(dispatch.lines.length).toBe(9);
    expect(dispatch.lines.map((l) => l.originalDescription)).toContain('2x140E#3184');
  });

  it('mismatch con "usar cálculo por zonas" ⇒ incluye el estribo por zonas', () => {
    const dispatch = buildBeamTakeoffDispatch(detailOf(vcEje3Dxf({ summary: '2x140E#318.4' })), 'vigas.dxf', {
      stirrupChoice: 'zone_total',
    });
    expect(dispatch.lines.length).toBe(9);
    expect(dispatch.lines.map((l) => l.originalDescription)).toContain('2x141E#3184');
  });

  it('mark_for_review ⇒ el estribo NO entra ni con las 8 longitudinales listas', () => {
    const dispatch = buildBeamTakeoffDispatch(detailOf(vcEje3Dxf({ summary: '2x140E#318.4' })), 'vigas.dxf', {
      stirrupChoice: 'mark_for_review',
    });
    expect(dispatch.lines.length).toBe(8);
    expect(dispatch.stirrupBlockedReason).toContain('revisión');
  });

  it('estribo ambiguous ⇒ bloqueado incluso con elección explícita', () => {
    // Resumen 2x60 vs zonas 141 (>2×) ⇒ ambiguous.
    const detail = detailOf(vcEje3Dxf({ summary: '2x60E#318.4' }));
    expect(detail.stirrupContract?.comparisonStatus).toBe('ambiguous');
    const dispatch = buildBeamTakeoffDispatch(detail, 'vigas.dxf', { stirrupChoice: 'declared_summary' });
    expect(dispatch.lines.length).toBe(8);
    expect(dispatch.stirrupIncluded).toBe(false);
    expect(dispatch.stirrupBlockedReason).toBeDefined();
  });

  it('sin marcadores ⇒ barras NO entran (requiere definir cantidad) y se explica', () => {
    const dispatch = buildBeamTakeoffDispatch(detailOf(vcEje3Dxf({ withMarkers: false })), 'vigas.dxf');
    // Solo el estribo (match) es computable ⇒ 1 línea y explicación visible.
    expect(dispatch.lines.length).toBe(1);
    expect(dispatch.stirrupIncluded).toBe(true);
    expect(dispatch.skippedBars.length).toBe(8);
    expect(dispatch.skippedBars.every((bar) => bar.reason.includes('Requiere definir cantidad'))).toBe(true);
    expect(dispatch.explanations.join(' ')).toContain('NO se envían');
  });

  it('al takeoff SOLO entran líneas computables: cantidad + longitud + varilla', () => {
    const dispatch = buildBeamTakeoffDispatch(detailOf(vcEje3Dxf()), 'vigas.dxf');
    for (const line of dispatch.lines) {
      // Descripción computable por F1: N#B{cm} o resumen 2xNE#B{cm}.
      expect(line.originalDescription).toMatch(/^\d+#\d\d{2,4}$|^\d+x\d+E#\d\d{2,4}$/);
      expect(line.originalDescription).not.toContain('?');
    }
  });

  it('la evidencia de cada línea lleva posición, beamDetailId y fragmento original', () => {
    const dispatch = buildBeamTakeoffDispatch(detailOf(vcEje3Dxf()), 'vigas.dxf');
    for (const line of dispatch.lines) {
      expect(line.evidence?.beamDetailId).toBe('bd-VC-EJE-3');
      expect(line.evidence?.elementKey).toBe('VC-EJE-3');
      expect(['superior', 'inferior', 'estribo']).toContain(line.evidence?.position ?? '');
      expect(line.evidence?.readingMethod).toBe('dxf');
      expect(line.evidence?.originalFragment?.length).toBeGreaterThan(0);
    }
    const positions = dispatch.lines.map((l) => l.evidence?.position);
    expect(positions.filter((p) => p === 'superior').length).toBe(4);
    expect(positions.filter((p) => p === 'inferior').length).toBe(4);
    expect(positions.filter((p) => p === 'estribo').length).toBe(1);
  });

  it('los sin_clasificar jamás entran al envío: quedan en skippedBars', () => {
    const dispatch = buildBeamTakeoffDispatch(detailOf(vcEje3Dxf({ withUnclassified: true })), 'vigas.dxf');
    expect(dispatch.lines.length).toBe(9);
    expect(dispatch.skippedBars.some((bar) => bar.description === '6#6555')).toBe(true);
    expect(dispatch.lines.some((l) => l.originalDescription.includes('6555'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D — Guardas estáticas de la UI
// ---------------------------------------------------------------------------

describe('F8E-D — UI del panel y del listado', () => {
  const componentsDir = path.join(process.cwd(), 'app', '(dashboard)', 'steel', 'takeoffs', '_components');
  const panel = readFileSync(path.join(componentsDir, 'beam-detail-review-panel.tsx'), 'utf8');
  const intake = readFileSync(path.join(componentsDir, 'dxf-intake-section.tsx'), 'utf8');

  it('el panel muestra conteos y la sección "Sin clasificar / revisar"', () => {
    expect(panel).toContain('items');
    expect(panel).toContain('Sin clasificar / revisar');
    expect(panel).toContain('unclassifiedLongitudinalBars');
    expect(panel).toContain('resumen +');
  });

  it('el envío del panel usa el dispatch con preview y explicaciones', () => {
    expect(panel).toContain('buildBeamTakeoffDispatch');
    expect(panel).toContain('previewText');
    expect(panel).toContain('explanations');
    expect(panel).toContain('skippedBars');
    // La decisión de estribos fija el envío, no envía por sí sola.
    expect(panel).not.toContain('onAddLines([line])');
  });

  it('el listado envía por dispatch (nunca solo estribos silenciosamente)', () => {
    expect(intake).toContain('buildBeamTakeoffDispatch');
    expect(intake).toContain('previewText');
  });
});
