/**
 * drawing-nomenclature.test.ts — Leyenda/nomenclatura del plano F7.
 *
 * Casos obligatorios del mandato:
 * - "Q" usada sin leyenda ⇒ no resuelta (definición manual, no se asume).
 * - "Q" definida en la leyenda ⇒ resuelta con evidencia literal.
 */
import { describe, expect, it } from 'vitest';
import { spatialPageFromPlainText } from '@/lib/steel/drawing-spatial-model';
import { classifyPageRegions } from '@/lib/steel/drawing-page-regions';
import {
  collectUsedSymbols,
  detectLegendEntries,
  resolveNomenclature,
} from '@/lib/steel/drawing-nomenclature';

function linesOf(text: string, pageNumber = 1) {
  return spatialPageFromPlainText(text, { pageNumber, sourceFileName: 'plano.pdf' }).lines;
}

describe('detectLegendEntries', () => {
  it('detecta definiciones "SIMBOLO = significado" con evidencia literal', () => {
    const lines = linesOf(['NOMENCLATURA', 'Q = ACERO CORRUGADO FY 4200', 'SON : SEGUN OTROS NIVELES'].join('\n'));
    const entries = detectLegendEntries({ lines });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ symbol: 'Q', meaning: 'ACERO CORRUGADO FY 4200' });
    expect(entries[0]!.lineText).toContain('Q = ACERO CORRUGADO');
    expect(entries[1]).toMatchObject({ symbol: 'SON' });
  });

  it('marca fromLegendRegion cuando la definicion vive en una region de leyenda', () => {
    const page = spatialPageFromPlainText(['NOMENCLATURA', 'Q = ACERO CORRUGADO FY 4200'].join('\n'), {
      pageNumber: 1,
    });
    const regions = classifyPageRegions(page).regions;
    const entries = detectLegendEntries({ lines: page.lines, regions });
    expect(entries[0]!.fromLegendRegion).toBe(true);
  });

  it('un llamado de acero NO es una definicion ("E#3 @ 15" no define E)', () => {
    const entries = detectLegendEntries({ lines: linesOf('E = #3 @ 15') });
    expect(entries).toHaveLength(0);
  });
});

describe('resolveNomenclature (casos obligatorios 3 y 4)', () => {
  it('Q usada SIN leyenda ⇒ unresolved con razon y ocurrencias', () => {
    const lines = linesOf('VC-01 3Q#4 L=2.40');
    const report = resolveNomenclature({ lines });
    expect(report.unresolvedSymbols).toContain('Q');
    const q = report.resolutions.find((r) => r.symbol === 'Q');
    expect(q?.kind).toBe('unresolved');
    if (q?.kind === 'unresolved') {
      expect(q.reason).toContain('no fue encontrada en la leyenda');
      expect(q.occurrences.length).toBeGreaterThan(0);
    }
  });

  it('Q definida en la leyenda ⇒ resuelta con evidencia, sin warning', () => {
    const lines = linesOf(['NOMENCLATURA', 'Q = ACERO CORRUGADO FY 4200', 'VC-01 3Q#4 L=2.40'].join('\n'));
    const report = resolveNomenclature({ lines });
    expect(report.unresolvedSymbols).not.toContain('Q');
    const q = report.resolutions.find((r) => r.symbol === 'Q');
    expect(q?.kind).toBe('resolved');
    if (q?.kind === 'resolved') {
      expect(q.meaning).toBe('ACERO CORRUGADO FY 4200');
      expect(q.evidence.lineText).toContain('Q = ACERO CORRUGADO');
    }
  });

  it('E se resuelve como convencion F1 (estribo), no como desconocida', () => {
    const report = resolveNomenclature({ lines: linesOf('74E#3200 @15') });
    const e = report.resolutions.find((r) => r.symbol === 'E');
    expect(e?.kind).toBe('builtin');
    expect(report.unresolvedSymbols).not.toContain('E');
  });

  it('CANT. y SON usados sin leyenda ⇒ no resueltos', () => {
    const report = resolveNomenclature({
      lines: linesOf(['CUADRO DE ZAPATAS', 'ELEMENTO CANT. LONG.', 'Z-01 SON 4 UND'].join('\n')),
    });
    expect(report.unresolvedSymbols).toEqual(expect.arrayContaining(['CANT', 'SON']));
  });

  it('la leyenda puede vivir en OTRA pagina/plano del plan set', () => {
    const legendLines = linesOf(['NOMENCLATURA', 'Q = ACERO CORRUGADO FY 4200'].join('\n'), 1);
    const usageLines = linesOf('VC-01 3Q#4', 5);
    const report = resolveNomenclature({ lines: [...legendLines, ...usageLines] });
    const q = report.resolutions.find((r) => r.symbol === 'Q');
    expect(q?.kind).toBe('resolved');
  });

  it('collectUsedSymbols reporta ocurrencias con pagina y linea', () => {
    const occurrences = collectUsedSymbols(linesOf('Z-01 2Q#5 CANT. 4', 7));
    const symbols = occurrences.map((o) => o.symbol);
    expect(symbols).toEqual(expect.arrayContaining(['Q', 'CANT']));
    expect(occurrences[0]!.pageNumber).toBe(7);
  });
});
