/**
 * compare.ts — Comparacion PURA de dos versiones de presupuesto (4E.3B).
 *
 * Sin DB ni red. `Decimal` (sin float). Matching de items por
 * `chapterCode + itemCode + occurrenceIndex` (Opcion B aprobada): dentro de cada
 * version, los items con (chapterCode, code) repetido se ordenan por
 * `sort_order ASC, id ASC` y se les asigna un `occurrenceIndex` deterministico.
 * Capitulos por `code` (unico por version). READ-ONLY.
 */
import Decimal from 'decimal.js';
import type { DecimalString } from '@/lib/utils/types';
import type { FinancialSummary } from '@/lib/estimates/aiu-types';
import type {
  ChapterDiff,
  CompareVersionRef,
  DiffStatus,
  FinancialDelta,
  ItemDiff,
  VersionCompareFinancial,
  VersionCompareResult,
} from '@/lib/estimates/compare-types';

/** Capitulo (snapshot) para comparar. `subtotal` = activo (excluye archivados). */
export interface CompareChapterInput {
  code: string;
  name: string;
  archived: boolean;
  subtotal: DecimalString;
  sortOrder: number;
}

/** Item (snapshot) para comparar. Incluye archivados (con su flag). */
export interface CompareItemInput {
  id: string;
  chapterCode: string;
  code: string;
  description: string;
  unit: string;
  quantity: DecimalString;
  unitPrice: DecimalString;
  subtotal: DecimalString;
  archived: boolean;
  sortOrder: number;
}

/** Snapshot de una version para la comparacion. */
export interface VersionSnapshot {
  ref: CompareVersionRef;
  financial: FinancialSummary;
  chapters: CompareChapterInput[];
  items: CompareItemInput[];
}

/** Clave estructurada (sin separador) para evitar colisiones con codigos. */
function itemKey(chapterCode: string, code: string, occ: number): string {
  return JSON.stringify([chapterCode, code, occ]);
}
function groupKey(chapterCode: string, code: string): string {
  return JSON.stringify([chapterCode, code]);
}

function makeDelta(base: DecimalString, target: DecimalString): FinancialDelta {
  const b = new Decimal(base || '0');
  const t = new Decimal(target || '0');
  const delta = t.minus(b);
  const deltaPct = b.isZero()
    ? null
    : delta.div(b).times(100).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed();
  return { base: b.toFixed(), target: t.toFixed(), delta: delta.toFixed(), deltaPct };
}

interface IndexedItem { item: CompareItemInput; occ: number }

/** Indexa items por clave estructurada con occurrenceIndex deterministico. */
function indexItems(items: readonly CompareItemInput[]) {
  const groups = new Map<string, CompareItemInput[]>();
  for (const it of items) {
    const gk = groupKey(it.chapterCode, it.code);
    const arr = groups.get(gk);
    if (arr) arr.push(it);
    else groups.set(gk, [it]);
  }
  const byKey = new Map<string, IndexedItem>();
  const dupGroups = new Set<string>();
  for (const [gk, arr] of groups) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (arr.length > 1) dupGroups.add(gk);
    arr.forEach((it, i) => byKey.set(itemKey(it.chapterCode, it.code, i + 1), { item: it, occ: i + 1 }));
  }
  return { byKey, dupGroups };
}

function decEq(a: DecimalString, b: DecimalString): boolean {
  return new Decimal(a).equals(new Decimal(b));
}

function buildItemDiff(
  chapterCode: string,
  code: string,
  occ: number,
  base: CompareItemInput | null,
  target: CompareItemInput | null,
  duplicateCodeWarning: boolean,
): ItemDiff {
  let status: DiffStatus;
  if (!base) status = 'added';
  else if (!target) status = 'removed';
  else {
    const changed =
      base.description !== target.description ||
      base.unit !== target.unit ||
      !decEq(base.quantity, target.quantity) ||
      !decEq(base.unitPrice, target.unitPrice) ||
      !decEq(base.subtotal, target.subtotal) ||
      base.archived !== target.archived;
    status = changed ? 'changed' : 'unchanged';
  }
  const subtotalDelta = new Decimal(target?.subtotal ?? '0')
    .minus(new Decimal(base?.subtotal ?? '0'))
    .toFixed();
  const archivedChanged = base != null && target != null && base.archived !== target.archived;
  return {
    status,
    chapterCode,
    code,
    occurrenceIndex: occ,
    description: { base: base?.description ?? null, target: target?.description ?? null },
    unit: { base: base?.unit ?? null, target: target?.unit ?? null },
    quantity: { base: base?.quantity ?? null, target: target?.quantity ?? null },
    unitPrice: { base: base?.unitPrice ?? null, target: target?.unitPrice ?? null },
    subtotal: { base: base?.subtotal ?? null, target: target?.subtotal ?? null },
    subtotalDelta,
    archived: { base: base?.archived ?? null, target: target?.archived ?? null },
    archivedChanged,
    duplicateCodeWarning,
  };
}

/** Compara dos snapshots de version (READ-ONLY). PURA. */
export function computeVersionComparison(
  estimateId: string,
  base: VersionSnapshot,
  target: VersionSnapshot,
): VersionCompareResult {
  const bf = base.financial;
  const tf = target.financial;
  const financial: VersionCompareFinancial = {
    directTotal: makeDelta(bf.directTotal, tf.directTotal),
    administration: makeDelta(bf.administrationAmount, tf.administrationAmount),
    contingency: makeDelta(bf.contingencyAmount, tf.contingencyAmount),
    utility: makeDelta(bf.utilityAmount, tf.utilityAmount),
    utilityVat: makeDelta(bf.utilityVatAmount, tf.utilityVatAmount),
    indirectTotal: makeDelta(bf.indirectTotal, tf.indirectTotal),
    grandTotal: makeDelta(bf.grandTotal, tf.grandTotal),
  };

  const baseIdx = indexItems(base.items);
  const targetIdx = indexItems(target.items);

  const keys = new Set<string>([...baseIdx.byKey.keys(), ...targetIdx.byKey.keys()]);
  const itemsByChapter = new Map<string, { diff: ItemDiff; order: number }[]>();
  for (const key of keys) {
    const [chapterCode, code, occ] = JSON.parse(key) as [string, string, number];
    const gk = groupKey(chapterCode, code);
    const b = baseIdx.byKey.get(key) ?? null;
    const t = targetIdx.byKey.get(key) ?? null;
    const dupWarn = baseIdx.dupGroups.has(gk) || targetIdx.dupGroups.has(gk);
    const diff = buildItemDiff(chapterCode, code, occ, b?.item ?? null, t?.item ?? null, dupWarn);
    const baseOrder = t ? t.item.sortOrder : 1e9 + (b ? b.item.sortOrder : 0);
    const list = itemsByChapter.get(chapterCode) ?? itemsByChapter.set(chapterCode, []).get(chapterCode)!;
    list.push({ diff, order: baseOrder * 1000 + occ });
  }

  const baseCh = new Map(base.chapters.map((c) => [c.code, c]));
  const targetCh = new Map(target.chapters.map((c) => [c.code, c]));
  const chapterCodes = new Set<string>([...baseCh.keys(), ...targetCh.keys()]);

  const chapters: { diff: ChapterDiff; order: number }[] = [];
  for (const code of chapterCodes) {
    const b = baseCh.get(code) ?? null;
    const t = targetCh.get(code) ?? null;
    const items = (itemsByChapter.get(code) ?? [])
      .sort((x, y) => x.order - y.order)
      .map((x) => x.diff);

    let status: DiffStatus;
    if (!b) status = 'added';
    else if (!t) status = 'removed';
    else {
      const changed =
        b.name !== t.name ||
        !decEq(b.subtotal, t.subtotal) ||
        b.archived !== t.archived ||
        items.some((i) => i.status !== 'unchanged');
      status = changed ? 'changed' : 'unchanged';
    }
    const subBase = b?.subtotal ?? '0';
    const subTarget = t?.subtotal ?? '0';
    const diff: ChapterDiff = {
      status,
      code,
      name: { base: b?.name ?? null, target: t?.name ?? null },
      subtotal: { base: new Decimal(subBase).toFixed(), target: new Decimal(subTarget).toFixed() },
      subtotalDelta: new Decimal(subTarget).minus(new Decimal(subBase)).toFixed(),
      archived: { base: b?.archived ?? null, target: t?.archived ?? null },
      archivedChanged: b != null && t != null && b.archived !== t.archived,
      items,
    };
    chapters.push({ diff, order: t ? t.sortOrder : 1e9 + (b ? b.sortOrder : 0) });
  }

  return {
    estimateId,
    base: base.ref,
    target: target.ref,
    financial,
    chapters: chapters.sort((a, b2) => a.order - b2.order).map((c) => c.diff),
    duplicateCodeWarning: baseIdx.dupGroups.size > 0 || targetIdx.dupGroups.size > 0,
  };
}
