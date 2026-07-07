/**
 * stirrup-summary-contract.test.ts — F8D-C: contrato de resumen de estribos.
 * match envía el resumen; mismatch bloquea el envío automático y exige
 * decisión humana (resumen del plano / suma por zonas / revisión); ambiguous
 * (posible mezcla de vistas) no envía ni con elección.
 */
import { describe, expect, it } from 'vitest';
import {
  buildStirrupSummaryContract,
  POSSIBLE_VIEW_MIXING_MESSAGE,
  resolveStirrupTakeoffChoice,
  type StirrupContractZoneInput,
} from '@/lib/steel/dxf/stirrup-summary-contract';
import {
  assembleBeamDetails,
  beamDetailToManualLines,
  stirrupChoiceToManualLine,
} from '@/lib/steel/dxf/dxf-beam-detail-assembly';
import { parseDxfFile } from '@/lib/steel/dxf/dxf-parser';
import { extractDxfStructure } from '@/lib/steel/dxf/dxf-structural-extractor';

function zone(count: number, x: number): StirrupContractZoneInput {
  return { count, barCode: 3, spacingCm: 12, sourceText: `${count} E#3@12`, x };
}

/** Resumen tipo "2x{count}E#3184". */
function summary(countPerGroup: number) {
  return {
    raw: `2x${countPerGroup}E#318.4`,
    normalized: `2x${countPerGroup}E#3184`,
    groups: 2,
    countPerGroup,
    barCode: 3,
    lengthCm: 184,
  };
}

// Ejemplo del mandato: zonas 27+23+7+17+35+25+7 = 141.
const MANDATE_ZONES = [zone(27, 1), zone(23, 2), zone(7, 3), zone(17, 4), zone(35, 5), zone(25, 6), zone(7, 7)];

describe('F8D-C — buildStirrupSummaryContract', () => {
  it('zonas que suman lo declarado ⇒ match con línea sugerida', () => {
    const contract = buildStirrupSummaryContract({ summary: summary(141), zones: MANDATE_ZONES })!;
    expect(contract.comparisonStatus).toBe('match');
    expect(contract.zoneTotalPerRepetition).toBe(141);
    expect(contract.declaredPerRepetition).toBe(141);
    expect(contract.difference).toBe(0);
    expect(contract.suggestedPerRepetition).toBe(141);
    expect(contract.suggestedTakeoffLine).toBe('2x141E#3184');
  });

  it('desfase razonable ⇒ mismatch SIN línea sugerida (decisión humana)', () => {
    const contract = buildStirrupSummaryContract({ summary: summary(153), zones: MANDATE_ZONES })!;
    expect(contract.comparisonStatus).toBe('mismatch');
    expect(contract.difference).toBe(12);
    expect(contract.suggestedTakeoffLine).toBeUndefined();
    expect(contract.message).toContain('Requiere decisión humana');
  });

  it('subtotal desproporcionado ⇒ ambiguous con mensaje de mezcla de vistas', () => {
    const contract = buildStirrupSummaryContract({
      summary: summary(153),
      zones: [...MANDATE_ZONES, ...MANDATE_ZONES, ...MANDATE_ZONES], // 423 ≫ 2×153
    })!;
    expect(contract.comparisonStatus).toBe('ambiguous');
    expect(contract.possibleViewMixing).toBe(true);
    expect(contract.message).toContain(POSSIBLE_VIEW_MIXING_MESSAGE);
  });

  it('resumen sin zonas suficientes ⇒ unverified (no automático)', () => {
    const contract = buildStirrupSummaryContract({ summary: summary(240), zones: [] })!;
    expect(contract.comparisonStatus).toBe('unverified');
    expect(contract.suggestedTakeoffLine).toBeUndefined();
    expect(contract.suggestedPerRepetition).toBe(240);
  });

  it('zonas sin resumen ⇒ unverified sin línea armable', () => {
    const contract = buildStirrupSummaryContract({ zones: MANDATE_ZONES })!;
    expect(contract.comparisonStatus).toBe('unverified');
    expect(contract.declaredSummary).toBeUndefined();
    const resolved = resolveStirrupTakeoffChoice(contract, 'zone_total');
    expect(resolved.ok).toBe(false);
  });

  it('zonas ambiguas excluidas quedan reportadas en el contrato', () => {
    const contract = buildStirrupSummaryContract({
      summary: summary(141),
      zones: MANDATE_ZONES,
      ambiguousZoneCount: 2,
    })!;
    expect(contract.ambiguousZoneCount).toBe(2);
    expect(contract.message).toContain('2 zona(s) entre dos vistas');
  });
});

describe('F8D-C — resolveStirrupTakeoffChoice', () => {
  const mismatch = buildStirrupSummaryContract({ summary: summary(153), zones: MANDATE_ZONES })!;

  it('la usuaria puede elegir el resumen del plano', () => {
    const resolved = resolveStirrupTakeoffChoice(mismatch, 'declared_summary');
    expect(resolved).toMatchObject({ ok: true, description: '2x153E#3184' });
  });

  it('la usuaria puede elegir la suma por zonas', () => {
    const resolved = resolveStirrupTakeoffChoice(mismatch, 'zone_total');
    expect(resolved).toMatchObject({ ok: true, description: '2x141E#3184' });
  });

  it('marcar para revisión NUNCA produce línea', () => {
    const resolved = resolveStirrupTakeoffChoice(mismatch, 'mark_for_review');
    expect(resolved.ok).toBe(false);
  });

  it('ambiguous no envía ni con elección explícita', () => {
    const ambiguous = buildStirrupSummaryContract({
      summary: summary(60),
      zones: MANDATE_ZONES, // 141 > 2×60 ⇒ ambiguous
    })!;
    expect(ambiguous.comparisonStatus).toBe('ambiguous');
    expect(resolveStirrupTakeoffChoice(ambiguous, 'declared_summary').ok).toBe(false);
    expect(resolveStirrupTakeoffChoice(ambiguous, 'zone_total').ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Reglas de envío al takeoff (vía beam detail)
// ---------------------------------------------------------------------------

function text(value: string, layer: string, x: number, y: number, color?: number): string {
  const chunks = ['0', 'TEXT', '5', `T${x}${y}`.replace(/\W/g, ''), '8', layer];
  if (color !== undefined) chunks.push('62', String(color));
  chunks.push('10', String(x), '20', String(y), '1', value);
  return chunks.join('\n');
}

function wrapDxf(chunks: string[]): string {
  return ['0', 'SECTION', '2', 'ENTITIES', ...chunks, '0', 'ENDSEC', '0', 'EOF'].join('\n');
}

function beamDetailWith(summaryToken: string) {
  const dxf = wrapDxf([
    text('VC-EJE-3 (50x60)', 'VIGAS-TEXTO', 100, 50, 1),
    text('10 E#3@12', 'EstribosSeccVigas', 95, 52),
    text('20 E#3@12', 'EstribosSeccVigas', 105, 52),
    text(summaryToken, 'EstribosSeccVigas', 100, 46, 1),
    text('ING. RESPONSABLE: N.N.', 'ROTULO', 400, -200),
  ]);
  const parse = parseDxfFile(dxf);
  if (!parse.ok) throw new Error('fixture inválido');
  const details = assembleBeamDetails(parse, extractDxfStructure(parse));
  const detail = details.find((d) => d.beamKey === 'VC-EJE-3');
  if (!detail) throw new Error('detalle no encontrado');
  return detail;
}

describe('F8D-C — envío al takeoff según el contrato', () => {
  it('match ⇒ el resumen entra por defecto (una línea, no las zonas)', () => {
    const detail = beamDetailWith('2x30E#318.4'); // zonas 10+20 = 30 ⇒ match
    expect(detail.stirrupContract?.comparisonStatus).toBe('match');
    const lines = beamDetailToManualLines(detail, 'vigas.dxf');
    const stirrupLines = lines.filter((line) => line.evidence?.position === 'estribo');
    expect(stirrupLines.length).toBe(1);
    expect(stirrupLines[0]?.originalDescription).toBe('2x30E#3184');
  });

  it('mismatch ⇒ bloquea el envío automático del estribo', () => {
    const detail = beamDetailWith('2x36E#318.4'); // zonas 30 vs 36 ⇒ mismatch
    expect(detail.stirrupContract?.comparisonStatus).toBe('mismatch');
    const lines = beamDetailToManualLines(detail, 'vigas.dxf');
    expect(lines.some((line) => line.evidence?.position === 'estribo')).toBe(false);
  });

  it('mismatch + elección "resumen del plano" ⇒ envía el resumen declarado', () => {
    const detail = beamDetailWith('2x36E#318.4');
    const line = stirrupChoiceToManualLine(detail, 'vigas.dxf', { stirrupChoice: 'declared_summary' });
    expect(line?.originalDescription).toBe('2x36E#3184');
    expect(line?.evidence?.observation).toContain('elegido por la usuaria');
  });

  it('mismatch + elección "suma por zonas" ⇒ envía el cálculo por zonas', () => {
    const detail = beamDetailWith('2x36E#318.4');
    const line = stirrupChoiceToManualLine(detail, 'vigas.dxf', { stirrupChoice: 'zone_total' });
    expect(line?.originalDescription).toBe('2x30E#3184');
  });

  it('ambiguous ⇒ no envía, ni por defecto ni con elección', () => {
    const detail = beamDetailWith('2x9E#318.4'); // zonas 30 ≫ 2×9 ⇒ ambiguous
    expect(detail.stirrupContract?.comparisonStatus).toBe('ambiguous');
    expect(beamDetailToManualLines(detail, 'vigas.dxf').some((l) => l.evidence?.position === 'estribo')).toBe(false);
    expect(stirrupChoiceToManualLine(detail, 'vigas.dxf', { stirrupChoice: 'declared_summary' })).toBeNull();
    expect(stirrupChoiceToManualLine(detail, 'vigas.dxf', { stirrupChoice: 'zone_total' })).toBeNull();
  });
});
