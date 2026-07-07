/**
 * dxf-view-segmentation.test.ts — F8D-A: segmentación de vistas/detalles
 * independientes ANTES de asociar textos: dos detalles de viga contiguos no
 * se mezclan (zonas y marcadores quedan cada uno en su vista), las entidades
 * en la franja entre vistas se marcan ambiguas y la falta de separación clara
 * produce advertencia de confianza baja. Fixtures 100% sintéticos.
 */
import { describe, expect, it } from 'vitest';
import { parseDxfFile } from '@/lib/steel/dxf/dxf-parser';
import { extractDxfStructure } from '@/lib/steel/dxf/dxf-structural-extractor';
import { assembleBeamDetails } from '@/lib/steel/dxf/dxf-beam-detail-assembly';
import {
  entityViewAssignment,
  segmentDxfViews,
  viewForPoint,
} from '@/lib/steel/dxf/dxf-view-segmentation';

// ---------------------------------------------------------------------------
// Constructores sintéticos (mismos helpers que F8C)
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

/**
 * Dos detalles de viga CONTIGUOS (VC-EJE-3 en x≈100, VC-EJE-4 en x≈160) con
 * zonas, resúmenes y marcadores propios, más un rótulo lejano que INFLA la
 * diagonal del dibujo (así el radio de vecindad F8C cubriría ambos detalles y
 * los mezclaría sin segmentación).
 */
function twoBeamDetailsDxf(): string {
  return wrapDxf([
    // Detalle A — VC-EJE-3: zonas 10+20 = 30, resumen 2x30 (match).
    text('VC-EJE-3 (50x60)', 'VIGAS-TEXTO', 100, 50, 1),
    text('10 E#3@12', 'EstribosSeccVigas', 95, 52),
    text('20 E#3@12', 'EstribosSeccVigas', 105, 52),
    text('2x30E#318.4', 'EstribosSeccVigas', 100, 46, 1),
    text('6#6330', 'BARRAS', 98, 58, 1),
    text('6#6440', 'BARRAS', 98, 42, 1),
    circle(96, 57, 'BARRAS', 1),
    circle(99, 57, 'BARRAS', 1),
    circle(102, 57, 'BARRAS', 1),
    circle(97, 43, 'BARRAS', 1),
    circle(101, 43, 'BARRAS', 1),
    // Detalle B — VC-EJE-4: zonas 40+50 = 90, resumen 2x90 (match).
    text('VC-EJE-4 (50x60)', 'VIGAS-TEXTO', 160, 50, 1),
    text('40 E#3@12', 'EstribosSeccVigas', 155, 52),
    text('50 E#3@12', 'EstribosSeccVigas', 165, 52),
    text('2x90E#318.4', 'EstribosSeccVigas', 160, 46, 1),
    text('6#6550', 'BARRAS', 158, 58, 1),
    text('6#6660', 'BARRAS', 158, 42, 1),
    circle(156, 57, 'BARRAS', 1),
    circle(158, 57, 'BARRAS', 1),
    circle(160, 57, 'BARRAS', 1),
    circle(162, 57, 'BARRAS', 1),
    circle(156, 43, 'BARRAS', 1),
    circle(158, 43, 'BARRAS', 1),
    circle(160, 43, 'BARRAS', 1),
    circle(162, 43, 'BARRAS', 1),
    // Rótulo lejano: infla la diagonal (radio F8C ≈ 97 unidades cubre A y B).
    text('ING. RESPONSABLE: N.N.', 'ROTULO', 1200, -600),
    text('ESCALA 1:50', 'ROTULO', 1205, -600),
    text('CONTIENE: REFUERZO VIGAS', 'ROTULO', 1210, -598),
  ]);
}

function detailsOf(dxf: string) {
  const parse = parseDxfFile(dxf);
  if (!parse.ok) throw new Error('fixture inválido');
  const extraction = extractDxfStructure(parse);
  return { parse, extraction, details: assembleBeamDetails(parse, extraction) };
}

// ---------------------------------------------------------------------------
// Motor de segmentación
// ---------------------------------------------------------------------------

describe('F8D-A — segmentDxfViews', () => {
  const parse = parseDxfFile(twoBeamDetailsDxf());
  if (!parse.ok) throw new Error('fixture inválido');
  const segmentation = segmentDxfViews(parse);

  it('separa los dos detalles contiguos y el rótulo en vistas independientes', () => {
    expect(segmentation.views.length).toBeGreaterThanOrEqual(3);
    const beamViews = segmentation.views.filter((view) => view.candidateBeamKeys.length > 0);
    expect(beamViews.length).toBe(2);
    expect(beamViews[0]?.candidateBeamKeys).toEqual(['VC-EJE-3']);
    expect(beamViews[1]?.candidateBeamKeys).toEqual(['VC-EJE-4']);
  });

  it('cada vista trae viewId, tipo, bbox, capas, colores y entidades', () => {
    const viewA = segmentation.views.find((view) => view.candidateBeamKeys.includes('VC-EJE-3'))!;
    expect(viewA.viewId).toMatch(/^view-\d+$/);
    expect(viewA.type).toBe('beam_detail');
    expect(viewA.bbox.minX).toBeLessThanOrEqual(95);
    expect(viewA.bbox.maxX).toBeGreaterThanOrEqual(105);
    expect(viewA.sourceLayers).toContain('EstribosSeccVigas');
    expect(viewA.sourceColors).toContain(1);
    expect(viewA.entityCount).toBeGreaterThanOrEqual(10);
    expect(viewA.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it('el rótulo se clasifica como title_block', () => {
    const titleView = segmentation.views.find((view) => view.sourceLayers.includes('ROTULO'));
    expect(titleView?.type).toBe('title_block');
  });

  it('viewForPoint resuelve la vista del ancla de cada viga', () => {
    const viewA = viewForPoint(segmentation, { x: 100, y: 50 });
    const viewB = viewForPoint(segmentation, { x: 160, y: 50 });
    expect(viewA?.candidateBeamKeys).toContain('VC-EJE-3');
    expect(viewB?.candidateBeamKeys).toContain('VC-EJE-4');
    expect(viewA?.viewId).not.toBe(viewB?.viewId);
  });

  it('las entidades de cada detalle quedan asignadas a SU vista (sin ambigüedad)', () => {
    const viewA = viewForPoint(segmentation, { x: 100, y: 50 })!;
    const zoneA = parse.entities.find(
      (entity) => entity.type === 'TEXT' && entity.rawText.includes('10 E#3@12'),
    )!;
    const zoneB = parse.entities.find(
      (entity) => entity.type === 'TEXT' && entity.rawText.includes('40 E#3@12'),
    )!;
    expect(entityViewAssignment(segmentation, zoneA)).toEqual({ viewId: viewA.viewId, ambiguous: false });
    const assignmentB = entityViewAssignment(segmentation, zoneB);
    expect(assignmentB.ambiguous).toBe(false);
    expect(assignmentB.viewId).not.toBe(viewA.viewId);
  });

  it('una entidad en la franja entre dos vistas queda ambigua', () => {
    // Dos grupos densos separados por un gap apenas mayor que el enlace, con
    // textos de borde dentro de la franja de ambigüedad (1.25 × enlace).
    const chunks: string[] = [];
    for (let x = 90; x <= 102; x += 3) chunks.push(text(`A${x}`, 'CAPA', x, 50));
    for (let x = 116; x <= 128; x += 3) chunks.push(text(`B${x}`, 'CAPA', x, 50));
    // Rótulo lejano: mantiene la diagonal realista (no restringe el enlace).
    chunks.push(text('ESCALA 1:50', 'ROTULO', 400, -200));
    const parsed = parseDxfFile(wrapDxf(chunks));
    if (!parsed.ok) throw new Error('fixture inválido');
    const seg = segmentDxfViews(parsed);
    expect(seg.views.length).toBe(3);
    const edgeA = parsed.entities.find((e) => e.type === 'TEXT' && e.rawText === 'A102')!;
    const innerA = parsed.entities.find((e) => e.type === 'TEXT' && e.rawText === 'A90')!;
    expect(entityViewAssignment(seg, edgeA).ambiguous).toBe(true);
    expect(entityViewAssignment(seg, innerA).ambiguous).toBe(false);
  });

  it('sin separación clara (dos códigos de viga en un solo bloque) ⇒ warning de confianza baja', () => {
    const chunks: string[] = [
      text('VC-EJE-1 (50x60)', 'VIGAS-TEXTO', 100, 50, 1),
      text('VC-EJE-2 (50x60)', 'VIGAS-TEXTO', 112, 50, 1),
    ];
    for (let x = 94; x <= 118; x += 3) chunks.push(text(`${x} E#3@12`, 'EstribosSeccVigas', x, 52));
    const parsed = parseDxfFile(wrapDxf(chunks));
    if (!parsed.ok) throw new Error('fixture inválido');
    const seg = segmentDxfViews(parsed);
    const merged = seg.views.find((view) => view.candidateBeamKeys.length > 1);
    expect(merged).toBeDefined();
    expect(merged!.confidence).toBeLessThan(0.6);
    expect(merged!.warnings.join(' ')).toContain('confianza de segmentación baja');
    expect(seg.confidence).toBe('bajo');
    expect(seg.warnings.join(' ')).toContain('Confianza de segmentación baja');
  });

  it('muy pocas entidades ancladas ⇒ sin vistas y advertencia honesta', () => {
    const parsed = parseDxfFile(wrapDxf([text('VC-1', 'VIGAS', 10, 10)]));
    if (!parsed.ok) throw new Error('fixture inválido');
    const seg = segmentDxfViews(parsed);
    expect(seg.views).toEqual([]);
    expect(seg.confidence).toBe('bajo');
    expect(seg.warnings.join(' ')).toContain('segmentar');
  });
});

// ---------------------------------------------------------------------------
// Integración con el Beam Detail Assembly (no mezclar detalles contiguos)
// ---------------------------------------------------------------------------

describe('F8D-A — assembly con segmentación: detalles contiguos NO se mezclan', () => {
  const { details } = detailsOf(twoBeamDetailsDxf());
  const detailA = details.find((d) => d.beamKey === 'VC-EJE-3');
  const detailB = details.find((d) => d.beamKey === 'VC-EJE-4');

  it('1. cada viga arma su propio detalle con su vista', () => {
    expect(detailA).toBeDefined();
    expect(detailB).toBeDefined();
    expect(detailA!.viewId).toBeDefined();
    expect(detailB!.viewId).toBeDefined();
    expect(detailA!.viewId).not.toBe(detailB!.viewId);
  });

  it('2. las zonas de estribos de la vista A no entran en la vista B (ni al revés)', () => {
    expect(detailA!.stirrupZones.map((zone) => zone.count)).toEqual([10, 20]);
    expect(detailA!.stirrupZonesTotal).toBe(30);
    expect(detailB!.stirrupZones.map((zone) => zone.count)).toEqual([40, 50]);
    expect(detailB!.stirrupZonesTotal).toBe(90);
    // Con las zonas correctas, cada resumen coincide (sin la mezcla, no hay
    // falsos "1808 vs 153").
    expect(detailA!.stirrupContract?.comparisonStatus).toBe('match');
    expect(detailB!.stirrupContract?.comparisonStatus).toBe('match');
  });

  it('3. los marcadores de sección de la vista A no cuentan en la vista B', () => {
    expect(detailA!.crossSectionMarkers.byShape).toBe(5);
    expect(detailA!.crossSectionMarkers.top).toBe(3);
    expect(detailA!.crossSectionMarkers.bottom).toBe(2);
    expect(detailB!.crossSectionMarkers.byShape).toBe(8);
    expect(detailB!.crossSectionMarkers.top).toBe(4);
    expect(detailB!.crossSectionMarkers.bottom).toBe(4);
  });

  it('4. los longitudinales de B no aparecen en A', () => {
    const allA = [...detailA!.topLongitudinalBars, ...detailA!.bottomLongitudinalBars].map((bar) => bar.description);
    expect(allA).toContain('6#6330');
    expect(allA).toContain('6#6440');
    expect(allA).not.toContain('6#6550');
    expect(allA).not.toContain('6#6660');
  });
});
