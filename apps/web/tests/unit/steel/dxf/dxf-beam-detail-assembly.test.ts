/**
 * dxf-beam-detail-assembly.test.ts — F8C: cada corte de viga como UN elemento
 * compuesto — longitudinales superior/inferior con longitud compacta
 * normalizada, cantidad desde MARCADORES gráficos (shape-driven, jamás del
 * primer dígito del texto), zonas de estribos con subtotal vs resumen 2xN,
 * segmentos por simetría y evidencia completa. Fixtures 100% sintéticos.
 */
import { describe, expect, it } from 'vitest';
import { parseDxfFile } from '@/lib/steel/dxf/dxf-parser';
import { extractDxfStructure } from '@/lib/steel/dxf/dxf-structural-extractor';
import { buildCadQualityReport } from '@/lib/steel/dxf/dxf-quality-report';
import {
  assembleBeamDetails,
  beamDetailToManualLines,
  summarizeMarkersForQuality,
} from '@/lib/steel/dxf/dxf-beam-detail-assembly';
import { normalizeCompactLongitudinalNotation } from '@/lib/steel/dxf/compact-stirrup-notation';

// ---------------------------------------------------------------------------
// Constructores sintéticos
// ---------------------------------------------------------------------------

function text(value: string, layer: string, x: number, y: number, color?: number): string {
  const chunks = ['0', 'TEXT', '5', `T${x}${y}`.replace(/\W/g, ''), '8', layer];
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

function wrapDxf(chunks: string[]): string {
  return ['0', 'SECTION', '2', 'ENTITIES', ...chunks, '0', 'ENDSEC', '0', 'EOF'].join('\n');
}

interface FixtureOptions {
  summary?: string;
  withZones?: boolean;
  withCircles?: 'red' | 'black' | 'none';
  extraNoise?: boolean;
}

/** Detalle sintético de VC-EJE-3 con zonas, resumen, círculos y segmentos. */
function beamDetailDxf(options: FixtureOptions = {}): string {
  const { summary = '2x140E#318.4', withZones = true, withCircles = 'red', extraNoise = true } = options;
  const chunks = [
    text('VC-EJE-3 (50x60)', 'VIGAS-TEXTO', 100, 50, 1),
    // Longitudinales SUPERIORES (y = 58): compactos y normales.
    text('6#6 33 L', 'BARRAS', 92, 58, 1),
    text('6#6840', 'BARRAS', 98, 58, 1),
    text('6#6900', 'BARRAS', 104, 58, 1),
    text('6#635', 'BARRAS', 110, 58, 1),
    // Longitudinales INFERIORES (y = 42).
    text('6#6440', 'BARRAS', 92, 42, 1),
    text('6#6730', 'BARRAS', 104, 42, 1),
    // Resumen de estribos + segmentos gráficos del flejado.
    text(summary, 'EstribosSeccVigas', 100, 46, 1),
    text('50', 'CotasEstribSeccion', 94, 48),
    text('30', 'CotasEstribSeccion', 97, 48),
    text('12', 'CotasEstribSeccion', 100, 48),
  ];
  if (withZones) {
    // Zonas E#3@N a lo largo de la línea de flejado (y = 52), TODAS.
    chunks.push(
      text('27 E#3@12', 'EstribosSeccVigas', 90, 52),
      text('23 E#3@12', 'EstribosSeccVigas', 94, 52),
      text('35 E#3@12', 'EstribosSeccVigas', 98, 52),
      text('25 E#3@12', 'EstribosSeccVigas', 102, 52),
      text('7 E#3@25', 'EstribosSeccVigas', 106, 52),
      text('17 E#3@25', 'EstribosSeccVigas', 110, 52),
      text('7 E#3@25', 'EstribosSeccVigas', 114, 52),
    );
  }
  if (withCircles !== 'none') {
    const color = withCircles === 'red' ? 1 : 7;
    const layer = withCircles === 'red' ? 'BARRAS' : '0';
    // 4 círculos arriba (y = 57) y 4 abajo (y = 43) — sección del corte.
    chunks.push(
      circle(96, 57, layer, color),
      circle(99, 57, layer, color),
      circle(102, 57, layer, color),
      circle(105, 57, layer, color),
      circle(96, 43, layer, color),
      circle(99, 43, layer, color),
      circle(102, 43, layer, color),
      circle(105, 43, layer, color),
    );
  }
  if (extraNoise) {
    chunks.push(
      // Rótulo lejano + círculo del rótulo + círculo fuera del corte.
      text('ING. RESPONSABLE: N.N.', 'ROTULO', 300, -100),
      circle(300, -95, 'ROTULO', 1),
      circle(170, 50, 'BARRAS', 1),
    );
  }
  return wrapDxf(chunks);
}

function detailsOf(dxf: string) {
  const parse = parseDxfFile(dxf);
  if (!parse.ok) throw new Error('fixture inválido');
  const extraction = extractDxfStructure(parse);
  return { parse, extraction, details: assembleBeamDetails(parse, extraction) };
}

// ---------------------------------------------------------------------------
// C — Longitudinales compactos
// ---------------------------------------------------------------------------

describe('F8C — normalización de longitudinales compactos', () => {
  it('4. "6#6 33 L" ⇒ 6#6330', () => {
    const result = normalizeCompactLongitudinalNotation('6#6 33 L', { structuralContext: true });
    expect(result.applied).toBe(true);
    expect(result.normalizedText).toBe('6#6330');
    expect(result.interpretations[0]).toMatchObject({ barCode: 6, lengthCm: 330 });
  });

  it('5. "6#635" ⇒ 6#6350 con contexto; requiere revisión sin contexto', () => {
    const inContext = normalizeCompactLongitudinalNotation('6#635', { structuralContext: true });
    expect(inContext.normalizedText).toBe('6#6350');
    expect(inContext.interpretations[0]?.lengthCm).toBe(350);

    const noContext = normalizeCompactLongitudinalNotation('6#635', { structuralContext: false });
    expect(noContext.applied).toBe(false);
    expect(noContext.requiresReview).toBe(true);
  });

  it('tokens de 3+ dígitos no se tocan y valores absurdos no se normalizan', () => {
    const untouched = normalizeCompactLongitudinalNotation('6#6840 6#6900', { structuralContext: true });
    expect(untouched.applied).toBe(false);
    const absurd = normalizeCompactLongitudinalNotation('6#601', { structuralContext: true });
    expect(absurd.applied).toBe(false);
    expect(absurd.requiresReview).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B/C/F — Ensamblaje, bandas y marcadores
// ---------------------------------------------------------------------------

describe('F8C — Beam Detail Assembly', () => {
  const { details } = detailsOf(beamDetailDxf());
  const detail = details.find((d) => d.beamKey === 'VC-EJE-3');

  it('2. arma UN elemento compuesto por viga con ubicación y sección', () => {
    expect(details.length).toBe(1);
    expect(detail?.beamDetailId).toBe('bd-VC-EJE-3');
    expect(detail?.locationText).toBe('EJE 3');
    expect(detail?.sectionSpec).toBe('50x60');
    expect(detail?.sourceLayer).toBe('VIGAS-TEXTO');
  });

  it('3. separa longitudinales superiores e inferiores por banda', () => {
    const top = detail?.topLongitudinalBars.map((b) => b.description) ?? [];
    const bottom = detail?.bottomLongitudinalBars.map((b) => b.description) ?? [];
    expect(top).toContain('6#6330'); // "6#6 33 L" normalizado
    expect(top).toContain('6#6840');
    expect(top).toContain('6#6900');
    expect(top).toContain('6#6350'); // "6#635" normalizado
    expect(bottom).toContain('6#6440');
    expect(bottom).toContain('6#6730');
  });

  it('4b. "6#6 33 L" queda con cutLength 3.30 m y barCode 6', () => {
    const bar = detail?.topLongitudinalBars.find((b) => b.sourceText === '6#6 33 L');
    expect(bar?.description).toBe('6#6330');
    expect(bar?.barCode).toBe(6);
    expect(Number(bar?.cutLengthM)).toBeCloseTo(3.3, 6);
  });

  it('6. el primer dígito del texto JAMÁS es la cantidad', () => {
    for (const bar of [...(detail?.topLongitudinalBars ?? []), ...(detail?.bottomLongitudinalBars ?? [])]) {
      // La cantidad viene de los 4 marcadores, no del "6" del texto.
      expect(bar.quantityFromGraphic).not.toBe(6);
    }
  });

  it('7/8. 4 círculos arriba ⇒ quantity superior 4; 4 abajo ⇒ inferior 4', () => {
    expect(detail?.crossSectionMarkers.top).toBe(4);
    expect(detail?.crossSectionMarkers.bottom).toBe(4);
    expect(detail?.crossSectionMarkers.status).toBe('from_markers');
    const top = detail?.topLongitudinalBars[0];
    const bottom = detail?.bottomLongitudinalBars[0];
    expect(top?.quantityFromGraphic).toBe(4);
    expect(top?.quantityStatus).toBe('from_markers');
    expect(bottom?.quantityFromGraphic).toBe(4);
  });

  it('los círculos fuera del corte y los del rótulo NO cuentan', () => {
    // 8 círculos del corte; el del rótulo y el lejano quedan fuera.
    expect(detail?.crossSectionMarkers.byShape).toBe(8);
  });

  it('sin marcadores ⇒ cantidad requiere revisión (no se inventa)', () => {
    const { details: noMarkers } = detailsOf(beamDetailDxf({ withCircles: 'none' }));
    const d = noMarkers[0];
    expect(d?.crossSectionMarkers.status).toBe('unavailable');
    for (const bar of [...(d?.topLongitudinalBars ?? []), ...(d?.bottomLongitudinalBars ?? [])]) {
      expect(bar.quantityFromGraphic).toBeUndefined();
      expect(bar.quantityStatus).toBe('requires_review');
    }
  });

  it('círculos negros en capa genérica cuentan igual (shape-driven), con confianza menor', () => {
    const { details: black } = detailsOf(beamDetailDxf({ withCircles: 'black', extraNoise: false }));
    const d = black[0];
    expect(d?.crossSectionMarkers.top).toBe(4);
    expect(d?.crossSectionMarkers.bottom).toBe(4);
    expect(d?.crossSectionMarkers.byLayerColor).toBe(0);
    expect(d?.crossSectionMarkers.confidence).toBe('bajo');
    expect(d?.warnings.join(' ')).toContain('sin capa/color estructural');

    const { details: red } = detailsOf(beamDetailDxf({ withCircles: 'red', extraNoise: false }));
    expect(red[0]?.crossSectionMarkers.confidence).toBe('alto');
  });
});

// ---------------------------------------------------------------------------
// D — Zonas de estribos vs resumen 2xN
// ---------------------------------------------------------------------------

describe('F8C — zonas de estribos vs resumen', () => {
  it('9. agrupa TODAS las zonas E#3@N del detalle y suma subtotal', () => {
    const { details } = detailsOf(beamDetailDxf());
    const d = details[0];
    expect(d?.stirrupZones.length).toBe(7);
    // 27+23+35+25+7+17+7 = 141
    expect(d?.stirrupZonesTotal).toBe(141);
    // Ordenadas por X.
    expect(d?.stirrupZones[0]?.count).toBe(27);
    expect(d?.stirrupZones[6]?.count).toBe(7);
  });

  it('10. subtotal 141 vs resumen 2x140 ⇒ mismatch por 1 con mensaje del mandato', () => {
    const { details } = detailsOf(beamDetailDxf({ summary: '2x140E#318.4' }));
    const cmp = details[0]?.zoneComparison;
    expect(cmp?.status).toBe('zone_count_mismatch');
    expect(cmp?.zonesTotal).toBe(141);
    expect(cmp?.summaryCount).toBe(140);
    expect(cmp?.message).toContain('zonas del detalle sugieren 141 por repetición, pero el resumen indica 140');
    expect(cmp?.message).toContain('Diferencia: 1');
    expect(cmp?.message).toContain('Requiere revisión');
    expect(details[0]?.status).toBe('requires_review');
  });

  it('subtotal compatible (2x141) ⇒ match, sin mismatch', () => {
    const { details } = detailsOf(beamDetailDxf({ summary: '2x141E#318.4' }));
    const cmp = details[0]?.zoneComparison;
    expect(cmp?.status).toBe('match');
    expect(cmp?.message).toContain('confirmado');
  });

  it('resumen sin zonas suficientes ⇒ graphic_stirrup_zone_unverified', () => {
    const { details } = detailsOf(beamDetailDxf({ withZones: false }));
    const cmp = details[0]?.zoneComparison;
    expect(cmp?.status).toBe('graphic_stirrup_zone_unverified');
  });

  it('subtotal desproporcionado (vecindad mezclada) ⇒ unverified, no mismatch engañoso', () => {
    // Resumen 2x60 vs zonas que suman 141 (>2×): evidencia mezclada.
    const { details } = detailsOf(beamDetailDxf({ summary: '2x60E#318.4' }));
    const cmp = details[0]?.zoneComparison;
    expect(cmp?.status).toBe('graphic_stirrup_zone_unverified');
    expect(cmp?.message).toContain('mezclar zonas');
  });

  it('el resumen queda normalizado (2x140E#318.4 → 2x140E#3184, 184 cm)', () => {
    const { details } = detailsOf(beamDetailDxf());
    expect(details[0]?.stirrupSummary?.normalized).toBe('2x140E#3184');
    expect(details[0]?.stirrupSummary?.countPerGroup).toBe(140);
    expect(details[0]?.stirrupSummary?.lengthCm).toBe(184);
  });
});

// ---------------------------------------------------------------------------
// E — Segmentos gráficos (cableado al detalle)
// ---------------------------------------------------------------------------

describe('F8C — segmentos gráficos en el detalle', () => {
  it('11/12. 50/30/12 con simetría confirma los 184 cm del resumen', () => {
    const { details } = detailsOf(beamDetailDxf());
    expect(details[0]?.segmentCheck?.status).toBe('confirmed');
    expect(details[0]?.segmentCheck?.computedCm).toBe(184);
  });
});

// ---------------------------------------------------------------------------
// I — Evidencia + envío al takeoff
// ---------------------------------------------------------------------------

describe('F8C — beam detail → takeoff con evidencia completa', () => {
  const { details } = detailsOf(beamDetailDxf({ summary: '2x141E#318.4' }));
  const detail = details[0]!;
  const lines = beamDetailToManualLines(detail, 'vigas.dxf');

  it('15. la evidencia lleva beamDetailId, elemento, posición, capa y fragmentos', () => {
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.evidence?.readingMethod).toBe('dxf');
      expect(line.evidence?.sourceType).toBe('dxf');
      expect(line.evidence?.beamDetailId).toBe('bd-VC-EJE-3');
      expect(line.evidence?.elementKey).toBe('VC-EJE-3');
      expect(line.evidence?.locationText).toBe('EJE 3');
      expect(line.evidence?.position).toBeDefined();
      expect(line.evidence?.observation).toContain('Capa: VIGAS-TEXTO');
      expect(line.evidence?.originalFragment?.length).toBeGreaterThan(0);
    }
  });

  it('el resumen de estribos entra normalizado y los longitudinales con cantidad GRÁFICA', () => {
    expect(lines.some((l) => l.originalDescription === '2x141E#3184')).toBe(true);
    // 4 marcadores arriba ⇒ 4#6330 (NO 6#6330).
    expect(lines.some((l) => l.originalDescription === '4#6330')).toBe(true);
    expect(lines.some((l) => l.originalDescription.startsWith('6#6'))).toBe(false);
  });

  it('sin marcadores, los longitudinales NO se envían (requieren revisión)', () => {
    const { details: noMarkers } = detailsOf(beamDetailDxf({ withCircles: 'none', summary: '2x141E#318.4' }));
    const sent = beamDetailToManualLines(noMarkers[0]!, 'vigas.dxf');
    expect(sent.every((l) => l.evidence?.position === 'estribo')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Quality report — marcadores
// ---------------------------------------------------------------------------

describe('F8C — quality report con marcadores', () => {
  it('reporta marcadores por forma, por capa/color y ambiguos', () => {
    const { parse, extraction, details } = detailsOf(beamDetailDxf());
    const markers = summarizeMarkersForQuality(details);
    expect(markers.markersByShape).toBe(8);
    expect(markers.markersByLayerColor).toBe(8);
    expect(markers.markerConfidence).toBe('alto');

    const quality = buildCadQualityReport(parse, extraction, { markers });
    expect(quality.markersDetectedByShape).toBe(8);
    expect(quality.markersDetectedByLayerColor).toBe(8);
    expect(quality.ambiguousMarkers).toBe(0);
    expect(quality.markerConfidence).toBe('alto');
    expect(quality.notes.join(' ')).toContain('marcador(es) de varilla detectados por geometría');
  });
});
