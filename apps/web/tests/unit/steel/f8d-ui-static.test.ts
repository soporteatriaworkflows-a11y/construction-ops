/**
 * f8d-ui-static.test.ts — Guardas estáticas de la UI F8D:
 * B) listado de vigas compacto + panel "Ver detalle" con las 6 secciones;
 * C) decisión humana de estribos en el panel;
 * D) botón "Ver cálculo" en líneas calculadas;
 * E) editor de fuente del desperdicio en el plan de corte;
 * G) copy de PDF como capa complementaria (no obsoleto) en PDF y DXF intake.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const COMPONENTS_DIR = path.join(
  process.cwd(),
  'app',
  '(dashboard)',
  'steel',
  'takeoffs',
  '_components',
);

function componentSource(name: string): string {
  return readFileSync(path.join(COMPONENTS_DIR, name), 'utf8');
}

describe('F8D-B — listado compacto + panel Ver detalle', () => {
  const intake = componentSource('dxf-intake-section.tsx');
  const panel = componentSource('beam-detail-review-panel.tsx');

  it('la tabla del listado es compacta y abre el panel con "Ver detalle"', () => {
    expect(intake).toContain('Ver detalle');
    expect(intake).toContain('BeamDetailReviewPanel');
    expect(intake).toContain('compactBand');
    // La tabla ancha F8C (11 columnas con todo el texto) ya no existe.
    expect(intake).not.toContain('min-w-[980px]');
  });

  it('el panel trae las 6 secciones: resumen/superior/inferior/estribos/cálculo/evidencia', () => {
    expect(panel).toContain('1 · Resumen');
    expect(panel).toContain('2 · Refuerzo superior');
    expect(panel).toContain('3 · Refuerzo inferior');
    expect(panel).toContain('4 · Estribos / flejado');
    expect(panel).toContain('5 · Cálculo (fórmulas F1)');
    expect(panel).toContain('6 · Evidencia CAD');
  });

  it('el panel muestra subtotal por zonas, resumen declarado, diferencia, sugerido y estado', () => {
    expect(panel).toContain('Subtotal por zonas');
    expect(panel).toContain('Resumen declarado');
    expect(panel).toContain('Diferencia');
    expect(panel).toContain('Valor sugerido');
    expect(panel).toContain('STIRRUP_COMPARISON_STATUS_LABEL');
  });

  it('la decisión humana de estribos usa las 3 opciones del contrato', () => {
    expect(panel).toContain("'declared_summary'");
    expect(panel).toContain("'zone_total'");
    expect(panel).toContain("'mark_for_review'");
    expect(panel).toContain('STIRRUP_TAKEOFF_CHOICE_LABEL');
    expect(panel).toContain('Posible mezcla de detalles contiguos');
  });

  it('la evidencia del panel incluye archivo, capa, color, coordenadas y entidades', () => {
    expect(panel).toContain('Archivo');
    expect(panel).toContain('Capa');
    expect(panel).toContain('Color ACI');
    expect(panel).toContain('Coordenadas');
    expect(panel).toContain('handles');
  });
});

describe('F8D-D — Ver cálculo en líneas calculadas', () => {
  const table = componentSource('manual-lines-table.tsx');
  const panel = componentSource('beam-detail-review-panel.tsx');

  it('la tabla de líneas tiene botón "Ver cálculo" que expande la explicación', () => {
    expect(table).toContain('Ver cálculo');
    expect(table).toContain('explainSteelCalculation');
    expect(table).toContain('aria-expanded');
  });

  it('el beam detail también explica el cálculo con el helper puro', () => {
    expect(panel).toContain('explainSteelCalculation');
  });
});

describe('F8D-E — fuente del desperdicio en el plan de corte', () => {
  const cutPlan = componentSource('manual-cut-plan-section.tsx');
  const table = componentSource('manual-lines-table.tsx');

  it('el editor separa calculado por optimización vs factor manual', () => {
    expect(cutPlan).toContain('WasteModeEditor');
    expect(cutPlan).toContain('TAKEOFF_WASTE_MODE_LABEL');
    expect(cutPlan).toContain('validateManualWastePercentInput');
    expect(cutPlan).toContain('MAX_MANUAL_WASTE_PCT');
    expect(cutPlan).toContain('calculado por optimización');
  });

  it('la tabla de líneas declara la fuente del % de desperdicio', () => {
    expect(table).toContain('factor manual');
    expect(table).toContain('asumido por línea');
  });
});

describe('F8D-G — PDF como capa complementaria (no obsoleto)', () => {
  const dxfIntake = componentSource('dxf-intake-section.tsx');
  const pdfIntake = componentSource('manual-pdf-intake-section.tsx');

  it('el intake DXF explica DXF motor principal + PDF evidencia/fallback + comparación', () => {
    expect(dxfIntake).toContain('El PDF no queda obsoleto');
    expect(dxfIntake).toContain('motor principal');
    expect(dxfIntake).toContain('evidencia visual/contractual');
    expect(dxfIntake).toContain('comparación recomendada');
  });

  it('el intake PDF se declara capa complementaria vigente', () => {
    expect(pdfIntake).toContain('capa complementaria');
    expect(pdfIntake).toContain('fallback');
    expect(pdfIntake).toContain('comparación recomendada');
  });

  it('la comparación DXF ↔ PDF sigue cableada (no se eliminó nada del PDF)', () => {
    expect(dxfIntake).toContain('compareDxfWithPdfAnalysis');
    expect(dxfIntake).toContain('pdfAnalysis');
  });
});
