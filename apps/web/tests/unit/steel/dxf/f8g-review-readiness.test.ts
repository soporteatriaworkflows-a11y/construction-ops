/**
 * f8g-review-readiness.test.ts — F8G: guardas focales de "review readiness"
 * previas a la revisión del ingeniero estructural/operativo.
 *
 * NO cambia ningún contrato: consolida protecciones ADITIVAS sobre el
 * comportamiento validado de F8F que aún no tenían aserción directa:
 *
 * 1. `readingId` es ÚNICO dentro del detalle y ESTABLE entre parses del
 *    mismo DXF (las decisiones de la usuaria se indexan por readingId; si
 *    cambiara entre renders/parses, las decisiones caerían en otra barra).
 * 2. `manualBarNumber` funciona como override standalone cuando F1 no puede
 *    inferir el número de varilla desde el texto.
 * 3. El trío de overrides estructurados (manualQuantity + manualCutLengthM +
 *    manualBarNumber) produce exactamente la aritmética esperada en F1.
 * 4. Toda línea longitudinal del dispatch lleva trazabilidad completa
 *    (`quantityMode` + `quantitySource` en la evidencia).
 * 5. Estribo en `mismatch` SÍ entra cuando la usuaria eligió explícitamente
 *    "usar resumen del plano" (la decisión humana desbloquea, jamás el
 *    sistema solo).
 */
import { describe, expect, it } from 'vitest';
import { parseDxfFile } from '@/lib/steel/dxf/dxf-parser';
import { extractDxfStructure } from '@/lib/steel/dxf/dxf-structural-extractor';
import {
  assembleBeamDetails,
  buildBeamTakeoffDispatch,
  TEXTUAL_OCCURRENCE_QUANTITY_SOURCE,
  type BeamDetail,
} from '@/lib/steel/dxf/dxf-beam-detail-assembly';
import { computeManualLine } from '@/lib/steel/manual-takeoff';

// ---------------------------------------------------------------------------
// Fixtures sintéticos (SIEMPRE por código, jamás DXF real)
// ---------------------------------------------------------------------------

function text(value: string, layer: string, x: number, y: number, color?: number): string {
  const chunks = ['0', 'TEXT', '5', `T${x}${y}${value}`.replace(/\W/g, '').slice(0, 12), '8', layer];
  if (color !== undefined) chunks.push('62', String(color));
  chunks.push('10', String(x), '20', String(y), '1', value);
  return chunks.join('\n');
}

function wrapDxf(chunks: string[]): string {
  return ['0', 'SECTION', '2', 'ENTITIES', ...chunks, '0', 'ENDSEC', '0', 'EOF'].join('\n');
}

/** Viga 2 sup + 2 inf (bandas por salto en Y) + estribos con resumen configurable. */
function beamDxf(summary = '2x30E#318.4'): string {
  return wrapDxf([
    text('VC-EJE-9 (50x60)', 'VIGAS-TEXTO', 100, 50, 1),
    text('6#6350', 'BARRAS', 92, 58, 1),
    text('6#6330', 'BARRAS', 98, 58, 1),
    text('6#6400', 'BARRAS', 92, 42, 1),
    text('6#6440', 'BARRAS', 98, 42, 1),
    text(summary, 'EstribosSeccVigas', 100, 46, 1),
    text('10 E#3@12', 'EstribosSeccVigas', 90, 52),
    text('20 E#3@12', 'EstribosSeccVigas', 96, 52),
  ]);
}

function detailOf(dxf: string, beamKey: string): BeamDetail {
  const parse = parseDxfFile(dxf);
  if (!parse.ok) throw new Error('fixture inválido');
  const detail = assembleBeamDetails(parse, extractDxfStructure(parse)).find((d) => d.beamKey === beamKey);
  if (!detail) throw new Error(`no se armó el detalle de ${beamKey}`);
  return detail;
}

function allLongitudinalReadings(detail: BeamDetail) {
  return [
    ...detail.topLongitudinalBars,
    ...detail.bottomLongitudinalBars,
    ...detail.unclassifiedLongitudinalBars,
  ];
}

// ---------------------------------------------------------------------------
// 1 — readingId único y estable (ancla de las decisiones de la usuaria)
// ---------------------------------------------------------------------------

describe('F8G-1 — readingId único y estable', () => {
  it('cada barra longitudinal tiene readingId no vacío y único dentro del detalle', () => {
    const detail = detailOf(beamDxf(), 'VC-EJE-9');
    const ids = allLongitudinalReadings(detail).map((bar) => bar.readingId);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('el mismo DXF parseado dos veces produce los MISMOS readingId por barra', () => {
    const first = detailOf(beamDxf(), 'VC-EJE-9');
    const second = detailOf(beamDxf(), 'VC-EJE-9');
    const byText = (detail: BeamDetail) =>
      allLongitudinalReadings(detail)
        .map((bar) => `${bar.sourceText}=${bar.readingId}`)
        .sort();
    expect(byText(second)).toEqual(byText(first));
  });
});

// ---------------------------------------------------------------------------
// 2/3 — Overrides estructurados en F1 (manualBarNumber standalone + trío)
// ---------------------------------------------------------------------------

describe('F8G-2/3 — overrides estructurados en computeManualLine', () => {
  it('manualBarNumber asigna la varilla cuando F1 no la infiere del texto', () => {
    const computed = computeManualLine({
      id: 'g1',
      originalDescription: '15 + 35 + 15',
      assumedWastePct: '5',
      manualBarNumber: 5,
    });
    expect(computed.barNumber).toBe(5);
  });

  it('trío manualQuantity + manualCutLengthM + manualBarNumber ⇒ aritmética F1 exacta', () => {
    const computed = computeManualLine({
      id: 'g2',
      originalDescription: '6#6350',
      assumedWastePct: '5',
      manualBarNumber: 6,
      manualQuantity: '4',
      manualCutLengthM: '3.5',
    });
    expect(computed.barNumber).toBe(6);
    expect(computed.totalPieces).toBe('4');
    expect(Number(computed.calculated.cutLengthM)).toBeCloseTo(3.5, 6);
    // ML total = longitud × cantidad × repeticiones(=1 con override).
    expect(Number(computed.calculated.totalMl)).toBeCloseTo(14, 6);
  });

  it('manualQuantity fija repeticiones en 1 (jamás multiplica de nuevo)', () => {
    const computed = computeManualLine({
      id: 'g3',
      originalDescription: '6#6350',
      assumedWastePct: '5',
      manualQuantity: '1',
      manualCutLengthM: '3.5',
    });
    expect(Number(computed.calculated.totalMl)).toBeCloseTo(3.5, 6);
    expect(computed.parsed.explanation).toContain('Campos estructurados aplicados');
  });
});

// ---------------------------------------------------------------------------
// 4 — Trazabilidad completa en cada línea del dispatch
// ---------------------------------------------------------------------------

describe('F8G-4 — trazabilidad de cantidad en el dispatch', () => {
  it('toda línea longitudinal lleva quantityMode y quantitySource en la evidencia', () => {
    const dispatch = buildBeamTakeoffDispatch(detailOf(beamDxf(), 'VC-EJE-9'), 'vigas.dxf');
    const longitudinals = dispatch.lines.filter((line) => line.evidence?.position !== 'estribo');
    expect(longitudinals.length).toBe(4);
    for (const line of longitudinals) {
      expect(line.evidence?.quantityMode).toBe('textual_occurrence');
      expect(line.evidence?.quantitySource).toBe(TEXTUAL_OCCURRENCE_QUANTITY_SOURCE);
      expect(line.evidence?.originalFragment).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 5 — Mismatch de estribo + decisión humana explícita ⇒ el estribo SÍ entra
// ---------------------------------------------------------------------------

describe('F8G-5 — decisión humana desbloquea el estribo en mismatch', () => {
  it('mismatch + "usar resumen del plano" ⇒ estribo incluido, longitudinales intactas', () => {
    const detail = detailOf(beamDxf('2x29E#318.4'), 'VC-EJE-9');
    expect(detail.stirrupContract?.comparisonStatus).toBe('mismatch');
    const dispatch = buildBeamTakeoffDispatch(detail, 'vigas.dxf', { stirrupChoice: 'declared_summary' });
    expect(dispatch.stirrupIncluded).toBe(true);
    expect(dispatch.stirrupBlockedReason).toBeUndefined();
    expect(dispatch.lines.length).toBe(5); // 2 sup + 2 inf + 1 estribo
  });

  it('mismatch + "usar cálculo por zonas" también entra, con nota de decisión', () => {
    const detail = detailOf(beamDxf('2x29E#318.4'), 'VC-EJE-9');
    const dispatch = buildBeamTakeoffDispatch(detail, 'vigas.dxf', { stirrupChoice: 'zone_total' });
    expect(dispatch.stirrupIncluded).toBe(true);
    const stirrup = dispatch.lines.find((line) => line.evidence?.position === 'estribo');
    expect(stirrup).toBeDefined();
  });

  it('mismatch + "marcar para revisión" ⇒ estribo fuera con motivo declarado', () => {
    const detail = detailOf(beamDxf('2x29E#318.4'), 'VC-EJE-9');
    const dispatch = buildBeamTakeoffDispatch(detail, 'vigas.dxf', { stirrupChoice: 'mark_for_review' });
    expect(dispatch.stirrupIncluded).toBe(false);
    expect(dispatch.stirrupBlockedReason).toContain('revisión');
  });
});
