/**
 * drawing-element-registry.test.ts — Registro de elementos F7 con
 * nomenclatura ampliada y alias conservadores.
 */
import { describe, expect, it } from 'vitest';
import {
  buildElementRegistry,
  extractElementMentions,
  type ElementSourceMention,
} from '@/lib/steel/drawing-element-registry';

function mention(partial: Partial<ElementSourceMention> & { elementKey: string; rawLabel: string }): ElementSourceMention {
  return {
    sourceFileName: 'plano.pdf',
    pageNumber: 1,
    lineText: partial.rawLabel,
    method: 'native_text',
    ...partial,
  };
}

describe('extractElementMentions (nomenclatura ampliada F7)', () => {
  it('reconoce VC-EJE-1 y VC EJE 1 bajo la misma clave canonica', () => {
    const dashed = extractElementMentions('VIGA VC-EJE-1 REFUERZO 5#5600');
    const spaced = extractElementMentions('VC EJE 1 seccion 50x60');
    expect(dashed[0]?.elementKey).toBe('VC-EJE-1');
    expect(spaced[0]?.elementKey).toBe('VC-EJE-1');
  });

  it('reconoce VIGA CIM 1, ZAPATA Z1, COLUMNA C-02, PILOTE P-03 y PILOTE Ø60', () => {
    expect(extractElementMentions('VIGA CIM 1')[0]?.elementKey).toBe('VIGA-CIM-1');
    expect(extractElementMentions('ZAPATA Z1')[0]?.elementKey).toBe('Z-1');
    expect(extractElementMentions('COLUMNA C-02')[0]?.elementKey).toBe('C-02');
    expect(extractElementMentions('PILOTE P-03 74E#3200')[0]?.elementKey).toBe('P-03');
    expect(extractElementMentions('PILOTE Ø60')[0]?.elementKey).toBe('PILOTE-Ø60');
    expect(extractElementMentions('pilote ø 60')[0]?.elementKey).toBe('PILOTE-Ø60');
  });

  it('clasifica el tipo desde la palabra o el prefijo', () => {
    expect(extractElementMentions('ZAPATA Z1')[0]?.kind).toBe('zapata');
    expect(extractElementMentions('VC-01 5#5600')[0]?.kind).toBe('viga');
    expect(extractElementMentions('PILOTE Ø60')[0]?.kind).toBe('pilote');
  });

  it('NO trata ejes puros como elementos (EJE A / EJES 1)', () => {
    expect(extractElementMentions('EJE A')).toHaveLength(0);
    expect(extractElementMentions('EJES 1 A 5')).toHaveLength(0);
  });

  it('codigo pegado sin palabra de elemento es ambiguo y NO se registra (Z1 suelto)', () => {
    expect(extractElementMentions('Z1')).toHaveLength(0);
    expect(extractElementMentions('ver detalle Z1 en plano')).toHaveLength(0);
  });
});

describe('buildElementRegistry (alias conservadores y estados honestos)', () => {
  it('VC-1 y VC-01 NO se fusionan: quedan como claves similares avisadas', () => {
    const registry = buildElementRegistry({
      mentions: [
        mention({ elementKey: 'VC-1', rawLabel: 'VC-1', regionType: 'plan_grid' }),
        mention({ elementKey: 'VC-01', rawLabel: 'VC-01', regionType: 'reinforcement_callout' }),
      ],
    });
    expect(registry).toHaveLength(2);
    const vc01 = registry.find((r) => r.elementKey === 'VC-01')!;
    expect(vc01.similarElementKeys).toContain('VC-1');
    const vc1 = registry.find((r) => r.elementKey === 'VC-1')!;
    expect(vc1.similarElementKeys).toContain('VC-01');
  });

  it('variantes tipograficas del mismo codigo quedan como aliases de un solo registro', () => {
    const registry = buildElementRegistry({
      mentions: [
        mention({ elementKey: 'VC-EJE-1', rawLabel: 'VC-EJE-1', regionType: 'plan_grid' }),
        mention({ elementKey: 'VC-EJE-1', rawLabel: 'VC EJE 1', regionType: 'detail', pageNumber: 2 }),
      ],
    });
    expect(registry).toHaveLength(1);
    expect(registry[0]!.aliases).toEqual(expect.arrayContaining(['VC-EJE-1', 'VC EJE 1']));
    expect(registry[0]!.sourceMentions).toHaveLength(2);
  });

  it('falta_refuerzo cuando solo hay mencion en planta; falta_ubicacion cuando solo hay despiece', () => {
    const registry = buildElementRegistry({
      mentions: [
        mention({ elementKey: 'Z-01', rawLabel: 'Z-01', regionType: 'plan_grid' }),
        mention({ elementKey: 'VC-02', rawLabel: 'VC-02', regionType: 'reinforcement_callout' }),
      ],
    });
    const z = registry.find((r) => r.elementKey === 'Z-01')!;
    expect(z.reviewStatus).toBe('falta_refuerzo');
    expect(z.missingEvidence.some((m) => m.includes('Refuerzo'))).toBe(true);

    const vc = registry.find((r) => r.elementKey === 'VC-02')!;
    expect(vc.reviewStatus).toBe('falta_ubicacion');
    expect(vc.missingEvidence.some((m) => m.includes('Ubicacion'))).toBe(true);
  });

  it('completo cuando hay ubicacion (grilla) y refuerzo (candidato F6)', () => {
    const registry = buildElementRegistry({
      mentions: [mention({ elementKey: 'VC-03', rawLabel: 'VC-03', regionType: 'plan_grid' })],
      keysWithSteelCandidates: new Set(['VC-03']),
      keysWithGridLocation: new Set(['VC-03']),
    });
    expect(registry[0]!.reviewStatus).toBe('completo');
    expect(registry[0]!.missingEvidence).toHaveLength(0);
    // La aprobacion sigue siendo humana: el estado lo dice.
    expect(registry[0]!.reviewStatusReason).toContain('humana');
  });

  it('conflicto declarado aguas arriba gana sobre cualquier otro estado', () => {
    const registry = buildElementRegistry({
      mentions: [mention({ elementKey: 'P-01', rawLabel: 'PILOTE P-01', regionType: 'plan_grid' })],
      keysWithSteelCandidates: new Set(['P-01']),
      keysWithGridLocation: new Set(['P-01']),
      conflictsByKey: new Map([['P-01', ['Lectura en conflicto nativo/OCR.']]]),
    });
    expect(registry[0]!.reviewStatus).toBe('conflicto');
    expect(registry[0]!.conflicts).toHaveLength(1);
  });

  it('evidencia 100% OCR ⇒ requiere_revision', () => {
    const registry = buildElementRegistry({
      mentions: [mention({ elementKey: 'C-02', rawLabel: 'COLUMNA C-02', regionType: 'plan_grid', method: 'ocr' })],
      keysWithSteelCandidates: new Set(['C-02']),
      keysWithGridLocation: new Set(['C-02']),
    });
    expect(registry[0]!.reviewStatus).toBe('requiere_revision');
    expect(registry[0]!.reviewStatusReason).toContain('OCR');
  });
});
