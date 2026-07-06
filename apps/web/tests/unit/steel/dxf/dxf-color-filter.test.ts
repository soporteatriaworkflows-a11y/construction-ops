/**
 * dxf-color-filter.test.ts — F8B P4: color ACI/true color como señal (no
 * verdad absoluta) y filtro manual por capa/color que solo cambia lo visible.
 */
import { describe, expect, it } from 'vitest';
import { isRedEntity } from '@/lib/steel/dxf/dxf-entities';
import { parseDxfFile } from '@/lib/steel/dxf/dxf-parser';
import { extractDxfStructure } from '@/lib/steel/dxf/dxf-structural-extractor';
import { filterDxfEntities, matchesDxfFilter } from '@/lib/steel/dxf/dxf-entity-filter';

function text(value: string, layer: string, x: number, y: number, color?: number): string {
  const chunks = ['0', 'TEXT', '8', layer];
  if (color !== undefined) chunks.push('62', String(color));
  chunks.push('10', String(x), '20', String(y), '1', value);
  return chunks.join('\n');
}

function wrapDxf(chunks: string[]): string {
  return ['0', 'SECTION', '2', 'ENTITIES', ...chunks, '0', 'ENDSEC', '0', 'EOF'].join('\n');
}

const DXF = wrapDxf([
  text('VC-01 (50x60)', '0', 0, 0, 1), // rojo en capa genérica
  text('VC-02 (40x60)', '0', 100, 0, 7), // blanco en capa genérica
  text('Z-01', 'ZAPATAS-TEXTO', 200, 0),
  text('NOTAS GENERALES', 'ROTULO', 300, 0),
]);

function parsed() {
  const parse = parseDxfFile(DXF);
  if (!parse.ok) throw new Error('fixture inválido');
  return parse;
}

describe('F8B P4 — color como señal', () => {
  it('el parser captura colorIndex (62) y lo expone en el candidato', () => {
    const parse = parsed();
    const vc01 = parse.entities.find((e) => e.type === 'TEXT' && e.rawText.includes('VC-01'));
    expect(vc01?.colorIndex).toBe(1);
    expect(isRedEntity({ colorIndex: 1 })).toBe(true);
    expect(isRedEntity({ colorIndex: 7 })).toBe(false);
    expect(isRedEntity({ trueColor: 0xff0000 })).toBe(true);
  });

  it('entidad roja estructural GANA evidencia frente a la misma señal sin rojo', () => {
    const extraction = extractDxfStructure(parsed());
    const red = extraction.elements.find((el) => el.elementKey === 'VC-01');
    const plain = extraction.elements.find((el) => el.elementKey === 'VC-02');
    expect(red?.redSignal).toBe(true);
    expect(plain?.redSignal).toBeUndefined();
    expect(red!.confidence).toBeGreaterThan(plain!.confidence);
  });

  it('el color no estructural NO borra el elemento (sigue detectado)', () => {
    const extraction = extractDxfStructure(parsed());
    expect(extraction.elements.some((el) => el.elementKey === 'VC-02')).toBe(true);
  });
});

describe('F8B P4 — filtro manual por capa/color', () => {
  const parse = parsed();

  it('modo "all" muestra todo; el array original queda intacto', () => {
    const filtered = filterDxfEntities(parse.entities, { mode: 'all' });
    expect(filtered.length).toBe(parse.entities.length);
  });

  it('excluir rótulo oculta la capa ROTULO sin destruir datos', () => {
    const filtered = filterDxfEntities(parse.entities, { mode: 'all', includeTitleBlock: false });
    expect(filtered.some((e) => e.layer === 'ROTULO')).toBe(false);
    // Los datos originales siguen completos: volver a "all" recupera todo.
    expect(parse.entities.some((e) => e.layer === 'ROTULO')).toBe(true);
  });

  it('modo "solo capas estructurales" deja únicamente capas semánticas', () => {
    const filtered = filterDxfEntities(parse.entities, { mode: 'structural_layers' });
    expect(filtered.every((e) => e.layer === 'ZAPATAS-TEXTO')).toBe(true);
    expect(filtered.length).toBe(1);
  });

  it('modo custom filtra por capa y/o color seleccionados', () => {
    const byColor = filterDxfEntities(parse.entities, { mode: 'custom', colorIndexes: [1] });
    expect(byColor.length).toBe(1);
    expect(byColor[0]?.type === 'TEXT' && byColor[0].rawText).toContain('VC-01');

    const byLayer = filterDxfEntities(parse.entities, { mode: 'custom', layers: ['ZAPATAS-TEXTO'] });
    expect(byLayer.length).toBe(1);
    expect(byLayer[0]?.layer).toBe('ZAPATAS-TEXTO');
  });

  it('matchesDxfFilter opera igual sobre candidatos (capa/color)', () => {
    expect(matchesDxfFilter({ layer: '0', colorIndex: 1 }, { mode: 'custom', colorIndexes: [1] })).toBe(true);
    expect(matchesDxfFilter({ layer: '0', colorIndex: 7 }, { mode: 'custom', colorIndexes: [1] })).toBe(false);
    // Sin restricción de color, la capa decide; el dato nunca se destruye.
    expect(matchesDxfFilter({ layer: 'VIGAS' }, { mode: 'structural_layers' })).toBe(true);
  });
});
