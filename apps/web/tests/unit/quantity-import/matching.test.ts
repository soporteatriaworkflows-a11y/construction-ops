/**
 * matching.test.ts — Matching BOQ del importador de cantidades
 * (QUANTITY_TAKEOFF_IMPORT_V1, contrato §6). PURO; sin base de datos.
 */
import { describe, expect, it } from 'vitest';
import {
  buildBoqTakeoffIndex,
  matchTakeoffGroup,
  type BoqTakeoffCandidate,
} from '@/server/quantity-import/matching';
import { boqCandidates } from './helpers';

const index = () => buildBoqTakeoffIndex(boqCandidates());

describe('matchTakeoffGroup — solo exactos y no ambiguos (§6)', () => {
  it('vincula cuando código + descripción + unidad + ocurrencia coinciden', () => {
    const outcome = matchTakeoffGroup(index(), {
      itemCode: '1.01',
      description: 'Demolición de muros sintética',
      unit: 'm²', // M2 del BOQ ≡ m² (canonical)
      occurrenceIndex: 1,
    });
    expect(outcome.status).toBe('linked');
    expect(outcome.boqItemId).toBe('00000000-0000-4000-8000-0000000000c1');
  });

  it('descripción normalizada: acentos y espacios no rompen la exactitud', () => {
    const outcome = matchTakeoffGroup(index(), {
      itemCode: '1.01',
      description: '  DEMOLICION   de muros sintetica ',
      unit: 'm2',
      occurrenceIndex: 1,
    });
    expect(outcome.status).toBe('linked');
  });

  it('unidad no equivalente ⇒ suggested (jamás se vincula)', () => {
    const outcome = matchTakeoffGroup(index(), {
      itemCode: '2.02',
      description: 'Contrapiso sintético',
      unit: 'ml',
      occurrenceIndex: 1,
    });
    expect(outcome.status).toBe('suggested');
    expect(outcome.boqItemId).toBeNull();
  });

  it('grupo sin unidad confiable ⇒ máximo suggested (§2.1/§6.3)', () => {
    const outcome = matchTakeoffGroup(index(), {
      itemCode: '2.01',
      description: 'Excavación manual sintética',
      unit: null,
      occurrenceIndex: 1,
    });
    expect(outcome.status).toBe('suggested');
    expect(outcome.boqItemId).toBeNull();
  });

  it('solo descripción coincide (sin código) ⇒ suggested informativo', () => {
    const outcome = matchTakeoffGroup(index(), {
      itemCode: null,
      description: 'Contrapiso sintético',
      unit: 'm²',
      occurrenceIndex: 1,
    });
    expect(outcome.status).toBe('suggested');
  });

  it('sin candidato ⇒ unresolved', () => {
    const outcome = matchTakeoffGroup(index(), {
      itemCode: '7.07',
      description: 'Actividad inexistente',
      unit: 'm²',
      occurrenceIndex: 1,
    });
    expect(outcome.status).toBe('unresolved');
    expect(outcome.boqItemId).toBeNull();
  });

  it('códigos duplicados: pareo posicional por occurrence index (§6.4)', () => {
    const first = matchTakeoffGroup(index(), {
      itemCode: '9.01',
      description: 'Aseo sintético',
      unit: 'm²',
      occurrenceIndex: 1,
    });
    const second = matchTakeoffGroup(index(), {
      itemCode: '9.01',
      description: 'Aseo sintético',
      unit: 'm²',
      occurrenceIndex: 2,
    });
    expect(first.status).toBe('linked');
    expect(second.status).toBe('linked');
    expect(first.boqItemId).not.toBe(second.boqItemId);
  });

  it('ocurrencia sin pareja (3ª de 2 candidatos) ⇒ ambiguous', () => {
    const outcome = matchTakeoffGroup(index(), {
      itemCode: '9.01',
      description: 'Aseo sintético',
      unit: 'm²',
      occurrenceIndex: 3,
    });
    expect(outcome.status).toBe('ambiguous');
    expect(outcome.boqItemId).toBeNull();
  });

  it('ítem ya vinculado ⇒ skipped_existing (jamás se reemplaza)', () => {
    const candidates: BoqTakeoffCandidate[] = boqCandidates().map((c) =>
      c.code === '1.01' ? { ...c, alreadyLinked: true } : c,
    );
    const outcome = matchTakeoffGroup(buildBoqTakeoffIndex(candidates), {
      itemCode: '1.01',
      description: 'Demolición de muros sintética',
      unit: 'm²',
      occurrenceIndex: 1,
    });
    expect(outcome.status).toBe('skipped_existing');
    expect(outcome.boqItemId).toBeNull();
  });

  it('códigos numéricos equivalentes: 2.10 del BOQ ≡ 2.1 de la hoja', () => {
    const candidates: BoqTakeoffCandidate[] = [
      {
        id: '00000000-0000-4000-8000-0000000000d1',
        code: '2.10',
        description: 'Losa sintética',
        unit: 'm²',
        alreadyLinked: false,
      },
    ];
    const outcome = matchTakeoffGroup(buildBoqTakeoffIndex(candidates), {
      itemCode: '2.1',
      description: 'Losa sintética',
      unit: 'm2',
      occurrenceIndex: 1,
    });
    expect(outcome.status).toBe('linked');
  });
});
