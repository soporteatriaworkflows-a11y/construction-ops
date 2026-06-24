/**
 * apu-productivity-display.test.ts — Capa de presentación read-only de
 * rendimiento/cuadrilla (APU_PRODUCTIVITY_CREW_OVERRIDES_V1A). Solo helpers
 * puros; sin DB, sin cálculo financiero, sin edición.
 */
import { describe, it, expect } from 'vitest';
import {
  isLaborComponent,
  resolveLaborProductivityDisplay,
  formattedQuantityLabel,
  PRODUCTIVITY_MICROCOPY,
  type LaborProductivityDisplay,
} from '@/app/(dashboard)/apu/_lib/apu-productivity-display';

describe('isLaborComponent', () => {
  it('detecta componente de mano de obra', () => {
    expect(isLaborComponent('labor')).toBe(true);
  });
  it('no clasifica otros tipos como mano de obra', () => {
    for (const t of ['material', 'equipment', 'tool', 'subcontract', 'other'] as const) {
      expect(isLaborComponent(t)).toBe(false);
    }
  });
});

describe('resolveLaborProductivityDisplay — material NO muestra rendimiento', () => {
  it('material → not_applicable, applies=false, sin textos', () => {
    const d = resolveLaborProductivityDisplay({ componentType: 'material', quantity: '5' });
    expect(d.applies).toBe(false);
    expect(d.status).toBe('not_applicable');
    expect(d.chipLabel).toBeNull();
    expect(d.description).toBeNull();
    expect(d.futureNote).toBeNull();
    expect(d.quantityLabel).toBeNull();
  });
});

describe('resolveLaborProductivityDisplay — labor legacy', () => {
  it('labor con cantidad > 0 → "Rendimiento heredado" (inherited)', () => {
    const d = resolveLaborProductivityDisplay({
      componentType: 'labor',
      quantity: '0.4',
      quantityText: '0.4000',
    });
    expect(d.applies).toBe(true);
    expect(d.status).toBe('inherited');
    expect(d.chipLabel).toBe(PRODUCTIVITY_MICROCOPY.chipInherited);
    expect(d.chipLabel).toBe('Rendimiento heredado');
    expect(d.description).toBe(PRODUCTIVITY_MICROCOPY.description);
    expect(d.futureNote).toBe(PRODUCTIVITY_MICROCOPY.futureNote);
    expect(d.quantityLabel).toBe('Cantidad consolidada: 0.4000 persona·día / unidad');
  });

  it('labor con cantidad 0 → "Mano de obra consolidada" (unavailable)', () => {
    const d = resolveLaborProductivityDisplay({ componentType: 'labor', quantity: '0' });
    expect(d.applies).toBe(true);
    expect(d.status).toBe('unavailable');
    expect(d.chipLabel).toBe(PRODUCTIVITY_MICROCOPY.chipConsolidated);
    expect(d.quantityLabel).toBeNull();
  });

  it('labor con cantidad inválida → unavailable (nunca lanza)', () => {
    const d = resolveLaborProductivityDisplay({ componentType: 'labor', quantity: 'abc' });
    expect(d.status).toBe('unavailable');
    expect(d.applies).toBe(true);
  });
});

describe('honestidad y no-edición', () => {
  it('formattedQuantityLabel no afirma rendimiento ni cuadrilla concretos', () => {
    const label = formattedQuantityLabel('1.2000');
    expect(label).toContain('Cantidad consolidada');
    expect(label).toContain('persona·día');
    expect(label).not.toMatch(/cuadrilla de \d/i);
  });

  it('el display NO expone ninguna afordancia editable', () => {
    const d: LaborProductivityDisplay = resolveLaborProductivityDisplay({
      componentType: 'labor',
      quantity: '0.4',
    });
    // Solo claves descriptivas; ninguna acción/edición/recomendado-editable.
    expect(Object.keys(d).sort()).toEqual(
      ['applies', 'chipLabel', 'description', 'futureNote', 'quantityLabel', 'status'].sort(),
    );
    for (const k of Object.keys(d)) {
      expect(k).not.toMatch(/edit|save|action|onChange|mutate|recommendedEditable/i);
    }
  });

  it('no recalcula ni transforma la cantidad (passthrough en el label)', () => {
    const d = resolveLaborProductivityDisplay({
      componentType: 'labor',
      quantity: '3.5',
      quantityText: '3.5000',
    });
    // El número del label es exactamente el texto recibido (no se recalcula).
    expect(d.quantityLabel).toContain('3.5000');
  });
});
