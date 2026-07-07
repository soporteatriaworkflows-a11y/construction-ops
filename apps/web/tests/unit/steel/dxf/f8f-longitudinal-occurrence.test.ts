/**
 * f8f-longitudinal-occurrence.test.ts — F8F: Longitudinal Occurrence Quantity
 * + Actionable Beam Review.
 *
 * A: contrato de cantidad corregido — cada texto longitudinal válido del DXF
 *    es UNA línea computable con cantidad 1 por aparición textual
 *    (`quantityMode: textual_occurrence`); los marcadores gráficos pasan a
 *    `markerEvidence`/`markerConfidence` (apoyo) y NO bloquean el dispatch.
 *    El primer dígito del texto (`6#6350`) JAMÁS es cantidad: el override
 *    estructurado (`manualQuantity`/`manualCutLengthM`) evita que F1 lo
 *    reinterprete.
 * B/C: panel accionable — decisiones por barra (asignar banda, aceptar sin
 *    clasificar, editar cantidad/longitud, marcar para revisión) que el
 *    dispatch respeta; estribos conservan la lógica F8D de comparación.
 * E: Excel — CANT = 1, DESCRIPCION = 6#6350, longitud 3.50 m, fórmulas
 *    intactas y evidencia con el modo de cantidad.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDxfFile } from '@/lib/steel/dxf/dxf-parser';
import { extractDxfStructure } from '@/lib/steel/dxf/dxf-structural-extractor';
import {
  assembleBeamDetails,
  buildBeamTakeoffDispatch,
  LONGITUDINAL_NO_MARKER_WARNING,
  TEXTUAL_OCCURRENCE_QUANTITY_SOURCE,
  type BeamDetail,
  type BeamLongitudinalDecisions,
} from '@/lib/steel/dxf/dxf-beam-detail-assembly';
import { computeManualLine, computeManualLines } from '@/lib/steel/manual-takeoff';
import { buildSteelManualExcelWorkbook } from '@/lib/steel/manual-excel-export';
import type { ManualLineRecord, ManualTakeoffRecord } from '@/lib/steel/manual-takeoff';

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

function wrapDxf(chunks: string[]): string {
  return ['0', 'SECTION', '2', 'ENTITIES', ...chunks, '0', 'ENDSEC', '0', 'EOF'].join('\n');
}

/**
 * Caso real de producción (VC-EJE-3): superior `6#6 35 L` y `6#6 33 L`;
 * SIN clasificar `6#6 40 L` y `6#6 44 L` (franja divisoria); estribos con
 * resumen que coincide con las zonas. SIN marcadores confiables por banda de
 * texto — exactamente el escenario que antes se congelaba.
 */
function vcEje3ProductionDxf(options: { summary?: string } = {}): string {
  const { summary = '2x30E#318.4' } = options;
  return wrapDxf([
    text('VC-EJE-3 (50x60)', 'VIGAS-TEXTO', 100, 50, 1),
    // Superior (y = 58).
    text('6#6 35 L', 'BARRAS', 92, 58, 1),
    text('6#6 33 L', 'BARRAS', 98, 58, 1),
    // Franja divisoria (y = 50): banda indecidible ⇒ sin clasificar.
    text('6#6 40 L', 'BARRAS', 104, 50, 1),
    text('6#6 44 L', 'BARRAS', 110, 50, 1),
    // Marcadores solo para fijar el divisor de banda (4 arriba / 4 abajo).
    circle(96, 57, 'BARRAS', 1),
    circle(99, 57, 'BARRAS', 1),
    circle(102, 57, 'BARRAS', 1),
    circle(105, 57, 'BARRAS', 1),
    circle(96, 43, 'BARRAS', 1),
    circle(99, 43, 'BARRAS', 1),
    circle(102, 43, 'BARRAS', 1),
    circle(105, 43, 'BARRAS', 1),
    // Estribos: zonas 10+20 = 30 vs resumen 2x30 ⇒ match.
    text(summary, 'EstribosSeccVigas', 100, 46, 1),
    text('10 E#3@12', 'EstribosSeccVigas', 90, 52),
    text('20 E#3@12', 'EstribosSeccVigas', 96, 52),
  ]);
}

/** Variante SIN marcadores: bandas por salto en Y, cantidad textual igual. */
function noMarkersDxf(): string {
  return wrapDxf([
    text('VC-EJE-8 (50x60)', 'VIGAS-TEXTO', 100, 50, 1),
    text('6#6350', 'BARRAS', 92, 58, 1),
    text('6#6330', 'BARRAS', 98, 58, 1),
    text('6#6400', 'BARRAS', 92, 42, 1),
    text('6#6440', 'BARRAS', 98, 42, 1),
  ]);
}

function detailOf(dxf: string, beamKey: string): BeamDetail {
  const parse = parseDxfFile(dxf);
  if (!parse.ok) throw new Error('fixture inválido');
  const detail = assembleBeamDetails(parse, extractDxfStructure(parse)).find((d) => d.beamKey === beamKey);
  if (!detail) throw new Error(`no se armó el detalle de ${beamKey}`);
  return detail;
}

// ---------------------------------------------------------------------------
// A — Contrato de cantidad por aparición textual
// ---------------------------------------------------------------------------

describe('F8F-A — cantidad 1 por aparición textual DXF', () => {
  const detail = detailOf(vcEje3ProductionDxf(), 'VC-EJE-3');

  it('"6#6 35 L" ⇒ 6#6350: quantity 1, bar #6, longitud 3.50 m', () => {
    const bar = detail.topLongitudinalBars.find((b) => b.sourceText === '6#6 35 L');
    expect(bar?.description).toBe('6#6350');
    expect(bar?.quantity).toBe(1);
    expect(bar?.barCode).toBe(6);
    expect(Number(bar?.cutLengthM)).toBeCloseTo(3.5, 6);
    expect(bar?.quantityMode).toBe('textual_occurrence');
    expect(bar?.quantitySource).toBe(TEXTUAL_OCCURRENCE_QUANTITY_SOURCE);
  });

  it('"6#6 33 L" ⇒ 6#6330: quantity 1, bar #6, longitud 3.30 m', () => {
    const bar = detail.topLongitudinalBars.find((b) => b.sourceText === '6#6 33 L');
    expect(bar?.description).toBe('6#6330');
    expect(bar?.quantity).toBe(1);
    expect(bar?.barCode).toBe(6);
    expect(Number(bar?.cutLengthM)).toBeCloseTo(3.3, 6);
  });

  it('el primer 6 del texto JAMÁS se usa como cantidad', () => {
    for (const bar of [
      ...detail.topLongitudinalBars,
      ...detail.bottomLongitudinalBars,
      ...detail.unclassifiedLongitudinalBars,
    ]) {
      expect(bar.quantity).toBe(1);
      expect(bar.quantity).not.toBe(6);
    }
  });

  it('línea sin marcador confiable sigue computable, con advertencia editable NO bloqueante', () => {
    const noMarkers = detailOf(noMarkersDxf(), 'VC-EJE-8');
    expect(noMarkers.topLongitudinalBars.length).toBe(2);
    expect(noMarkers.bottomLongitudinalBars.length).toBe(2);
    for (const bar of [...noMarkers.topLongitudinalBars, ...noMarkers.bottomLongitudinalBars]) {
      expect(bar.quantity).toBe(1);
      expect(bar.quantityMode).toBe('textual_occurrence');
      expect(bar.markerEvidence).toBeUndefined();
      expect(bar.warnings).toContain(LONGITUDINAL_NO_MARKER_WARNING);
    }
    // La falta de marcadores no congela el detalle.
    expect(noMarkers.statusReasons.join(' ')).not.toContain('conteo gráfico');
  });

  it('F1 con override estructurado: "6#6350" + manualQuantity 1 ⇒ 1 pieza de 3.50 m (no 6)', () => {
    const computed = computeManualLine({
      id: 'l1',
      originalDescription: '6#6350',
      assumedWastePct: '5',
      manualBarNumber: 6,
      manualQuantity: '1',
      manualCutLengthM: '3.5',
    });
    expect(computed.totalPieces).toBe('1');
    expect(computed.barNumber).toBe(6);
    expect(Number(computed.calculated.cutLengthM)).toBeCloseTo(3.5, 6);
    expect(Number(computed.calculated.totalMl)).toBeCloseTo(3.5, 6);
    expect(computed.parsed.explanation).toContain('Campos estructurados aplicados');
  });

  it('sin override, F1 sí leería 6 unidades — el dispatch SIEMPRE manda el override', () => {
    const withoutOverride = computeManualLine({ id: 'l2', originalDescription: '6#6350', assumedWastePct: '5' });
    expect(withoutOverride.totalPieces).toBe('6'); // el riesgo que F8F neutraliza
    const dispatch = buildBeamTakeoffDispatch(detailOf(vcEje3ProductionDxf(), 'VC-EJE-3'), 'vigas.dxf');
    for (const line of dispatch.lines) {
      if (line.evidence?.position === 'estribo') continue;
      expect(line.manualQuantity).toBe('1');
      expect(line.manualCutLengthM).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// B/C — Decisiones por barra + dispatch corregido
// ---------------------------------------------------------------------------

describe('F8F-B/C — panel accionable y dispatch con decisiones', () => {
  it('caso real: 2 superior + 2 sin clasificar asignadas a inferior + estribo ⇒ 5 líneas', () => {
    const detail = detailOf(vcEje3ProductionDxf(), 'VC-EJE-3');
    expect(detail.topLongitudinalBars.length).toBe(2);
    expect(detail.unclassifiedLongitudinalBars.length).toBe(2);
    const decisions: BeamLongitudinalDecisions = Object.fromEntries(
      detail.unclassifiedLongitudinalBars.map((bar) => [bar.readingId, { assignPosition: 'inferior' as const }]),
    );
    const dispatch = buildBeamTakeoffDispatch(detail, 'vigas.dxf', { decisions });
    expect(dispatch.lines.length).toBe(5);
    expect(dispatch.topCount).toBe(2);
    expect(dispatch.bottomCount).toBe(2);
    expect(dispatch.stirrupIncluded).toBe(true);
    expect(dispatch.previewText).toBe('Se enviarán 5 línea(s): 2 superior, 2 inferior, 1 estribo.');
    const assigned = dispatch.lines.filter((l) => l.evidence?.position === 'inferior');
    expect(assigned.map((l) => l.originalDescription).sort()).toEqual(['6#6400', '6#6440']);
    expect(assigned.every((l) => l.evidence?.observation?.includes('asignada por la usuaria'))).toBe(true);
  });

  it('sin decisión, las sin clasificar quedan fuera con motivo accionable (no congeladas)', () => {
    const detail = detailOf(vcEje3ProductionDxf(), 'VC-EJE-3');
    const dispatch = buildBeamTakeoffDispatch(detail, 'vigas.dxf');
    expect(dispatch.lines.length).toBe(3); // 2 superior + estribo
    expect(dispatch.skippedBars.length).toBe(2);
    expect(dispatch.skippedBars.every((bar) => bar.reason.includes('asígnala a superior/inferior'))).toBe(true);
    expect(dispatch.skippedBars.every((bar) => !bar.reason.includes('conteo gráfico'))).toBe(true);
  });

  it('barra sin clasificar se puede asignar a superior', () => {
    const detail = detailOf(vcEje3ProductionDxf(), 'VC-EJE-3');
    const first = detail.unclassifiedLongitudinalBars[0]!;
    const dispatch = buildBeamTakeoffDispatch(detail, 'vigas.dxf', {
      decisions: { [first.readingId]: { assignPosition: 'superior' } },
    });
    expect(dispatch.topCount).toBe(3);
    expect(dispatch.lines.filter((l) => l.evidence?.position === 'superior').length).toBe(3);
  });

  it('aceptar como sin clasificar: entra como línea propia y el preview lo declara', () => {
    const detail = detailOf(vcEje3ProductionDxf(), 'VC-EJE-3');
    const decisions: BeamLongitudinalDecisions = Object.fromEntries(
      detail.unclassifiedLongitudinalBars.map((bar) => [bar.readingId, { acceptUnclassified: true }]),
    );
    const dispatch = buildBeamTakeoffDispatch(detail, 'vigas.dxf', { decisions });
    expect(dispatch.lines.length).toBe(5);
    expect(dispatch.unclassifiedCount).toBe(2);
    expect(dispatch.previewText).toBe('Se enviarán 5 línea(s): 2 superior, 0 inferior, 2 sin clasificar, 1 estribo.');
    expect(dispatch.lines.filter((l) => l.evidence?.position === 'sin_clasificar').length).toBe(2);
  });

  it('editar cantidad ⇒ quantityMode manual; marcar para revisión ⇒ no se envía', () => {
    const detail = detailOf(vcEje3ProductionDxf(), 'VC-EJE-3');
    const [first, second] = detail.topLongitudinalBars;
    const dispatch = buildBeamTakeoffDispatch(detail, 'vigas.dxf', {
      decisions: {
        [first!.readingId]: { quantity: 3, cutLengthM: '3.6' },
        [second!.readingId]: { markForReview: true },
      },
    });
    const edited = dispatch.lines.find((l) => l.originalDescription === first!.description);
    expect(edited?.manualQuantity).toBe('3');
    expect(edited?.manualCutLengthM).toBe('3.6');
    expect(edited?.evidence?.quantityMode).toBe('manual');
    expect(edited?.evidence?.quantitySource).toBe('editada por la usuaria');
    expect(dispatch.skippedBars.some((bar) => bar.reason.includes('Marcada para revisión'))).toBe(true);
    expect(dispatch.lines.some((l) => l.originalDescription === second!.description)).toBe(false);
  });

  it('4 superior + 4 inferior + 1 estribo ⇒ Se enviarán 9 líneas', () => {
    const dxf = wrapDxf([
      text('VC-EJE-2 (50x60)', 'VIGAS-TEXTO', 100, 50, 1),
      text('6#6350', 'BARRAS', 92, 58, 1),
      text('6#6330', 'BARRAS', 98, 58, 1),
      text('6#6900', 'BARRAS', 104, 58, 1),
      text('6#6840', 'BARRAS', 110, 58, 1),
      text('6#6400', 'BARRAS', 92, 42, 1),
      text('6#6440', 'BARRAS', 98, 42, 1),
      text('6#6730', 'BARRAS', 104, 42, 1),
      text('6#6840', 'BARRAS', 110, 42, 1),
      text('2x30E#318.4', 'EstribosSeccVigas', 100, 46, 1),
      text('10 E#3@12', 'EstribosSeccVigas', 90, 52),
      text('20 E#3@12', 'EstribosSeccVigas', 96, 52),
    ]);
    const dispatch = buildBeamTakeoffDispatch(detailOf(dxf, 'VC-EJE-2'), 'vigas.dxf');
    expect(dispatch.lines.length).toBe(9);
    expect(dispatch.previewText).toBe('Se enviarán 9 línea(s): 4 superior, 4 inferior, 1 estribo.');
  });

  it('estribo mismatch sin decisión ⇒ envía longitudinales y bloquea SOLO el estribo', () => {
    const detail = detailOf(vcEje3ProductionDxf({ summary: '2x29E#318.4' }), 'VC-EJE-3');
    expect(detail.stirrupContract?.comparisonStatus).toBe('mismatch');
    const dispatch = buildBeamTakeoffDispatch(detail, 'vigas.dxf');
    expect(dispatch.stirrupIncluded).toBe(false);
    expect(dispatch.stirrupBlockedReason).toContain('desfase');
    // Las longitudinales computables SÍ entran (2 superior).
    expect(dispatch.topCount).toBe(2);
    expect(dispatch.lines.length).toBe(2);
  });

  it('estribo ambiguous jamás entra, ni con elección explícita', () => {
    const detail = detailOf(vcEje3ProductionDxf({ summary: '2x9E#318.4' }), 'VC-EJE-3');
    expect(detail.stirrupContract?.comparisonStatus).toBe('ambiguous');
    const dispatch = buildBeamTakeoffDispatch(detail, 'vigas.dxf', { stirrupChoice: 'declared_summary' });
    expect(dispatch.stirrupIncluded).toBe(false);
    expect(dispatch.stirrupBlockedReason).toBeDefined();
    expect(dispatch.topCount).toBe(2); // longitudinales intactas
  });
});

// ---------------------------------------------------------------------------
// E — Excel: CANT = 1, descripción del plano, fórmulas y evidencia
// ---------------------------------------------------------------------------

describe('F8F-E — Excel con cantidad por aparición textual', () => {
  function takeoffWith(lines: ManualLineRecord[]): ManualTakeoffRecord {
    return {
      id: 'mtk-f8f',
      name: 'Takeoff F8F',
      projectName: 'Demo',
      scopeLabel: 'Vigas de cimentación',
      status: 'draft',
      createdAt: '2026-07-06',
      lines,
    };
  }

  it('workbook: CANT = 1 para 6#6350 (no 6), longitud 3.50, fórmulas intactas y evidencia con modo', () => {
    const detail = detailOf(vcEje3ProductionDxf(), 'VC-EJE-3');
    const dispatch = buildBeamTakeoffDispatch(detail, 'vigas.dxf');
    const records: ManualLineRecord[] = dispatch.lines.map((line, index) => ({ id: `l${index + 1}`, ...line }));
    const wb = buildSteelManualExcelWorkbook({
      takeoff: takeoffWith(records),
      lines: computeManualLines(records),
      generatedAt: new Date('2026-07-06T12:00:00.000Z'),
    });

    const cantidades = wb.getWorksheet('01_CANTIDADES')!;
    // Fila 2 = primera longitudinal ("6#6 35 L" → 6#6350).
    expect(cantidades.getCell('D2').value).toBe('6#6350');
    expect(cantidades.getCell('F2').value).toBe(6); // código varilla
    expect(cantidades.getCell('I2').value).toBe(3.5); // longitud corte m
    expect(cantidades.getCell('J2').value).toBe(1); // CANT = 1, jamás 6
    expect(cantidades.getCell('K2').value).toBe(1); // SON = 1
    expect(cantidades.getCell('N2').value).toMatchObject({ formula: 'I2*J2*K2', result: 3.5 });
    expect(cantidades.getCell('O2').value).toMatchObject({ formula: 'N2*G2' });

    const evidencias = wb.getWorksheet('EVIDENCIAS')!;
    expect(evidencias.getCell('L1').value).toBe('modo cantidad');
    expect(evidencias.getCell('L2').value).toBe('cantidad por aparición textual DXF');
    expect(String(evidencias.getCell('J2').value)).toContain('aparición textual DXF');
  });

  it('ninguna línea longitudinal del dispatch entra con cantidad indefinida', () => {
    const detail = detailOf(noMarkersDxf(), 'VC-EJE-8');
    const dispatch = buildBeamTakeoffDispatch(detail, 'vigas.dxf');
    expect(dispatch.lines.length).toBe(4);
    const records: ManualLineRecord[] = dispatch.lines.map((line, index) => ({ id: `l${index + 1}`, ...line }));
    for (const computed of computeManualLines(records)) {
      expect(computed.totalPieces).toBe('1');
      expect(Number(computed.calculated.totalMl)).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// D/F — Guardas estáticas de la UI y copy
// ---------------------------------------------------------------------------

describe('F8F-D/F — panel accionable y copy corregido', () => {
  const componentsDir = path.join(process.cwd(), 'app', '(dashboard)', 'steel', 'takeoffs', '_components');
  const panel = readFileSync(path.join(componentsDir, 'beam-detail-review-panel.tsx'), 'utf8');
  const intake = readFileSync(path.join(componentsDir, 'dxf-intake-section.tsx'), 'utf8');

  it('el panel tiene las acciones por barra del mandato', () => {
    expect(panel).toContain('Aceptar línea');
    expect(panel).toContain('Marcar para revisión');
    expect(panel).toContain('Asignar a superior');
    expect(panel).toContain('Asignar a inferior');
    expect(panel).toContain('Aceptar sin clasificar');
    expect(panel).toContain('Mantener sin clasificar');
    expect(panel).toContain('Editar cantidad');
    expect(panel).toContain('Editar longitud');
  });

  it('el panel muestra la fuente de cantidad y los marcadores como apoyo', () => {
    expect(panel).toContain('por aparición textual DXF');
    expect(panel).toContain('no confiables / no disponibles');
    expect(panel).toContain('computable, pendiente de aprobación');
    expect(panel).toContain('markerEvidence');
  });

  it('el envío del panel pasa las decisiones al dispatch (nada se congela por marcadores)', () => {
    expect(panel).toContain('decisions');
    expect(panel).toContain('buildBeamTakeoffDispatch');
    expect(panel).not.toContain('cantidad por conteo gráfico');
    expect(panel).not.toContain('Requiere definir cantidad');
  });

  it('el copy del intake declara la regla de cantidad textual', () => {
    expect(intake).toContain('cantidad 1 por aparición textual DXF');
    expect(intake).toContain('evidencia de apoyo');
    expect(intake).not.toContain('cantidad por conteo gráfico');
  });
});
