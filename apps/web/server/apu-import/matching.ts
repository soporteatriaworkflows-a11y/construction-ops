/**
 * matching.ts — Matching de componentes contra el catálogo (PURO).
 * ENTRE_PATIOS_APU_IMPORT_V1, contrato §4.
 *
 * Orden congelado: code exacto → external_reference exacta → external_sku
 * exacto → descripción normalizada SOLO COMO SUGERENCIA (jamás
 * autoconfirmación). ≥2 candidatos en cualquier nivel ⇒ ambiguous.
 * Solo `exact` se asocia automáticamente.
 */
import { unitsEquivalent } from '@/server/pricing/units';
import type { ResourceIdentifier } from '@/server/catalog/import/price-list';
import { normalizeDescription } from './sheet-model';

export type MaterialMatchOutcome =
  | { kind: 'exact'; resource: ResourceIdentifier; via: 'code' | 'reference' | 'sku' }
  | { kind: 'suggested'; resource: ResourceIdentifier; unitMismatch: boolean }
  | { kind: 'ambiguous'; candidates: ResourceIdentifier[] }
  | { kind: 'unresolved' };

/** Índices precalculados sobre los identificadores del catálogo de la org. */
export interface ResourceMatchIndex {
  byCode: Map<string, ResourceIdentifier[]>;
  byReference: Map<string, ResourceIdentifier[]>;
  bySku: Map<string, ResourceIdentifier[]>;
  byName: Map<string, ResourceIdentifier[]>;
}

function normalizeIdentifier(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function push(map: Map<string, ResourceIdentifier[]>, key: string, r: ResourceIdentifier): void {
  if (key === '') return;
  const list = map.get(key);
  if (list) list.push(r);
  else map.set(key, [r]);
}

/** Construye los índices de matching (una vez por preview/confirmación). */
export function buildResourceMatchIndex(
  identifiers: ReadonlyArray<ResourceIdentifier>,
): ResourceMatchIndex {
  const index: ResourceMatchIndex = {
    byCode: new Map(),
    byReference: new Map(),
    bySku: new Map(),
    byName: new Map(),
  };
  for (const r of identifiers) {
    push(index.byCode, normalizeIdentifier(r.code), r);
    push(index.byReference, normalizeIdentifier(r.externalReference), r);
    push(index.bySku, normalizeIdentifier(r.externalSku), r);
    push(index.byName, normalizeDescription(r.name), r);
  }
  return index;
}

/**
 * Matching de un componente material/equipment/tool (§4). La hoja APU no trae
 * códigos de catálogo: `rawCode` solo aplica si coincide EXACTAMENTE con un
 * code de recurso. La descripción es SUGERENCIA, nunca autoconfirmación.
 */
export function matchMaterialComponent(
  index: ResourceMatchIndex,
  input: { rawCode: string; description: string; rawUnit: string },
): MaterialMatchOutcome {
  const codeKey = normalizeIdentifier(input.rawCode);

  // 1) code exacto (identificador real del catálogo).
  if (codeKey !== '') {
    const byCode = index.byCode.get(codeKey) ?? [];
    const codeOnly = byCode[0];
    if (byCode.length === 1 && codeOnly) {
      return { kind: 'exact', resource: codeOnly, via: 'code' };
    }
    if (byCode.length > 1) return { kind: 'ambiguous', candidates: byCode };

    // 2) referencia externa exacta. 3) SKU externo exacto.
    const byRef = index.byReference.get(codeKey) ?? [];
    const refOnly = byRef[0];
    if (byRef.length === 1 && refOnly) {
      return { kind: 'exact', resource: refOnly, via: 'reference' };
    }
    if (byRef.length > 1) return { kind: 'ambiguous', candidates: byRef };

    const bySku = index.bySku.get(codeKey) ?? [];
    const skuOnly = bySku[0];
    if (bySku.length === 1 && skuOnly) {
      return { kind: 'exact', resource: skuOnly, via: 'sku' };
    }
    if (bySku.length > 1) return { kind: 'ambiguous', candidates: bySku };
  }

  // 4) descripción normalizada ⇒ SOLO sugerencia (requiere acepte explícito).
  const nameKey = normalizeDescription(input.description);
  if (nameKey === '') return { kind: 'unresolved' };
  const byName = index.byName.get(nameKey) ?? [];
  const nameOnly = byName[0];
  if (byName.length === 1 && nameOnly) {
    const unitMismatch = !unitsEquivalent(nameOnly.unit, input.rawUnit);
    return { kind: 'suggested', resource: nameOnly, unitMismatch };
  }
  if (byName.length > 1) {
    // Desempate por unidad equivalente: si EXACTAMENTE uno coincide en unidad,
    // sigue siendo SUGERENCIA (nunca exact); si no, ambiguous.
    const unitMatches = byName.filter((r) => unitsEquivalent(r.unit, input.rawUnit));
    const unitOnly = unitMatches[0];
    if (unitMatches.length === 1 && unitOnly) {
      return { kind: 'suggested', resource: unitOnly, unitMismatch: false };
    }
    return { kind: 'ambiguous', candidates: byName };
  }
  return { kind: 'unresolved' };
}
