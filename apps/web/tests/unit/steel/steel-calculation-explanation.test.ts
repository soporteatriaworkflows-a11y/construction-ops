/**
 * steel-calculation-explanation.test.ts — F8D-D: "Ver cálculo" explica cada
 * línea con texto original, interpretación, cantidad, longitud de corte,
 * fórmulas ML/KG/varillas y la FUENTE del desperdicio. Solo presenta valores
 * que ya produjo F1 — jamás recalcula por su cuenta.
 */
import { describe, expect, it } from 'vitest';
import { computeManualLine, type ManualLineRecord } from '@/lib/steel/manual-takeoff';
import { explainSteelCalculation } from '@/lib/steel/steel-calculation-explanation';

function record(description: string, overrides: Partial<ManualLineRecord> = {}): ManualLineRecord {
  return {
    id: 'line-1',
    originalDescription: description,
    assumedWastePct: '5',
    ...overrides,
  };
}

describe('F8D-D — explainSteelCalculation', () => {
  it('explica el resumen de estribos 2x153E#3184', () => {
    const line = computeManualLine(record('2x153E#3184'));
    const explanation = explainSteelCalculation(line);

    expect(explanation.originalDescription).toBe('2x153E#3184');
    expect(explanation.interpretation.length).toBeGreaterThan(0);
    // 153 × 2 = 306 piezas.
    expect(explanation.quantityText).toContain('153');
    expect(explanation.quantityText).toContain('306');
    // Longitud 1.84 m (formato es-CO: coma decimal).
    expect(explanation.cutLengthText).toContain('1,84');
    expect(explanation.mlFormula).toContain('ML total = piezas totales × longitud de corte');
    expect(explanation.mlFormula).toContain('306');
    expect(explanation.kgFormula).toContain('kg/ml');
    expect(explanation.kgFormula).toContain('#3');
    expect(explanation.wasteText).toContain('Desperdicio');
  });

  it('explica el longitudinal 6#6330 con fórmulas reemplazadas', () => {
    const line = computeManualLine(record('6#6330'));
    const explanation = explainSteelCalculation(line);

    expect(explanation.quantityText).toContain('6');
    expect(explanation.cutLengthText).toContain('3,3');
    expect(explanation.mlFormula).toContain('=');
    expect(explanation.kgFormula).toContain('#6');
    expect(explanation.commercialFormula).toContain('Varillas comerciales');
  });

  it('desperdicio calculado ⇒ la fuente cita al optimizador', () => {
    const line = computeManualLine(record('6#6330'));
    const explanation = explainSteelCalculation(line, { wasteSource: 'calculated' });
    expect(explanation.wasteText).toContain('calculado por optimización');
    expect(explanation.wasteText).toContain('plan de corte');
  });

  it('desperdicio manual ⇒ la fuente cita el factor editable con su %', () => {
    const line = computeManualLine(record('6#6330'), { manualWastePct: '8' });
    const explanation = explainSteelCalculation(line, { wasteSource: 'manual', manualWastePct: '8' });
    expect(explanation.wasteText).toContain('factor manual');
    expect(explanation.wasteText).toContain('8');
  });

  it('desperdicio asumido por línea ⇒ lo dice y aclara que el real es del plan', () => {
    const line = computeManualLine(record('6#6330'));
    expect(line.wasteSource).toBe('assumed');
    const explanation = explainSteelCalculation(line);
    expect(explanation.wasteText).toContain('asumido por línea');
    expect(explanation.wasteText).toContain('plan de corte');
  });

  it('incluye la evidencia (fuente DXF, elemento, posición) cuando existe', () => {
    const line = computeManualLine(
      record('2x153E#3184', {
        evidence: {
          sourceFileName: 'vigas.dxf',
          readingMethod: 'dxf',
          position: 'estribo',
          elementKey: 'VC-EJE-3',
          locationText: 'EJE 3',
          observation: 'Capa: EstribosSeccVigas',
        },
      }),
    );
    const explanation = explainSteelCalculation(line);
    expect(explanation.sourceText).toContain('vigas.dxf');
    expect(explanation.sourceText).toContain('VC-EJE-3');
    expect(explanation.sourceText).toContain('estribo');
    expect(explanation.sourceText).toContain('EstribosSeccVigas');
  });

  it('línea sin longitud interpretable ⇒ advertencia honesta, sin inventar', () => {
    const line = computeManualLine(record('texto sin notación'));
    const explanation = explainSteelCalculation(line);
    expect(explanation.cutLengthText).toContain('Sin longitud');
    expect(explanation.warnings.join(' ')).toContain('longitud de corte');
  });
});
