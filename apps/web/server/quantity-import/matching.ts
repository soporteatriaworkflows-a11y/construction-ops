/**
 * matching.ts — Matching de grupos de cantidades contra ítems BOQ (PURO).
 * QUANTITY_TAKEOFF_IMPORT_V1, contrato §6.
 *
 * Vínculo exacto (`linked`) SOLO cuando coinciden TODAS las condiciones:
 * código de ítem + descripción normalizada + unidad canonical equivalente +
 * pareo unívoco por occurrence index + ítem sin takeoff previo. La
 * descripción sola es SUGERENCIA informativa (jamás se vincula en V1).
 * Nunca se reemplaza un vínculo existente (`skipped_existing`).
 */
import { unitsEquivalent } from '@/server/pricing/units';
import type { Uuid } from '@/lib/utils/types';
import type { TakeoffLinkStatus } from '@/lib/quantity-import/types';
import { normalizeDescription } from '../apu-import/sheet-model';
import { normalizeItemCode } from './parse-takeoff-sheet';

/** Ítem BOQ candidato (orden estable por sort_order, id). */
export interface BoqTakeoffCandidate {
  id: Uuid;
  code: string;
  description: string;
  unit: string;
  /** Ya tiene un quantity_takeoff_group vinculado (de cualquier batch). */
  alreadyLinked: boolean;
}

export interface TakeoffMatchOutcome {
  status: TakeoffLinkStatus;
  boqItemId: Uuid | null;
  boqItemCode: string | null;
  boqItemDescription: string | null;
}

/** Índices precalculados sobre los candidatos de la versión objetivo. */
export interface BoqTakeoffMatchIndex {
  /** code normalizado + descripción normalizada → candidatos en orden estable. */
  byExactKey: Map<string, BoqTakeoffCandidate[]>;
  /** descripción normalizada → candidatos (solo sugerencias). */
  byDescription: Map<string, BoqTakeoffCandidate[]>;
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  if (key === '' || key === '|') return;
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Construye los índices de matching (una vez por preview/confirmación). */
export function buildBoqTakeoffIndex(
  candidates: ReadonlyArray<BoqTakeoffCandidate>,
): BoqTakeoffMatchIndex {
  const index: BoqTakeoffMatchIndex = {
    byExactKey: new Map(),
    byDescription: new Map(),
  };
  for (const candidate of candidates) {
    const codeKey = normalizeItemCode(candidate.code);
    const descKey = normalizeDescription(candidate.description);
    push(index.byExactKey, `${codeKey}|${descKey}`, candidate);
    push(index.byDescription, descKey, candidate);
  }
  return index;
}

export interface TakeoffMatchInput {
  itemCode: string | null;
  description: string;
  /** Unidad canonical del grupo (null ⇒ máximo `suggested`, contrato §6.3). */
  unit: string | null;
  occurrenceIndex: number;
}

/** Matching de un grupo (§6). `not_evaluated` lo decide el caller sin versión. */
export function matchTakeoffGroup(
  index: BoqTakeoffMatchIndex,
  input: TakeoffMatchInput,
): TakeoffMatchOutcome {
  const descKey = normalizeDescription(input.description);
  const codeKey = normalizeItemCode(input.itemCode);

  // Nivel exacto: requiere código + descripción + unidad + pareo unívoco.
  if (codeKey !== '' && descKey !== '') {
    const exactPool = index.byExactKey.get(`${codeKey}|${descKey}`) ?? [];
    if (exactPool.length > 0) {
      if (input.unit === null) {
        // Sin unidad confiable ⇒ jamás exacto (§2.1/§6.3). Las sugerencias
        // NUNCA portan boqItemId: solo se vincula lo exacto.
        const first = exactPool[0]!;
        return {
          status: 'suggested',
          boqItemId: null,
          boqItemCode: first.code,
          boqItemDescription: first.description,
        };
      }
      const unitPool = exactPool.filter((c) => unitsEquivalent(c.unit, input.unit));
      if (unitPool.length > 0) {
        // Pareo posicional por occurrence index (n-ésimo ↔ n-ésimo).
        const candidate = unitPool[input.occurrenceIndex - 1];
        if (!candidate) {
          return {
            status: 'ambiguous',
            boqItemId: null,
            boqItemCode: unitPool[0]!.code,
            boqItemDescription: unitPool[0]!.description,
          };
        }
        if (candidate.alreadyLinked) {
          return {
            status: 'skipped_existing',
            boqItemId: null,
            boqItemCode: candidate.code,
            boqItemDescription: candidate.description,
          };
        }
        return {
          status: 'linked',
          boqItemId: candidate.id,
          boqItemCode: candidate.code,
          boqItemDescription: candidate.description,
        };
      }
      // Código+descripción coinciden pero la unidad no ⇒ sugerencia (sin id).
      const first = exactPool[0]!;
      return {
        status: 'suggested',
        boqItemId: null,
        boqItemCode: first.code,
        boqItemDescription: first.description,
      };
    }
  }

  // Nivel sugerencia: descripción normalizada (informativo, no se vincula).
  if (descKey !== '') {
    const byDesc = index.byDescription.get(descKey) ?? [];
    const first = byDesc[0];
    if (first) {
      return {
        status: 'suggested',
        boqItemId: null,
        boqItemCode: first.code,
        boqItemDescription: first.description,
      };
    }
  }

  return { status: 'unresolved', boqItemId: null, boqItemCode: null, boqItemDescription: null };
}
