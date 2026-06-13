/**
 * preview.ts — Ensamblado PURO del preview del importador de cantidades
 * (QUANTITY_TAKEOFF_IMPORT_V1, contrato §9). Combina parser + matching;
 * sin I/O. El servicio inyecta los candidatos BOQ leídos bajo RLS.
 */
import type { Uuid } from '@/lib/utils/types';
import type {
  QuantityImportPreview,
  TakeoffGroupPreview,
  TakeoffLinePreview,
} from '@/lib/quantity-import/types';
import { normalizeDescription } from '../apu-import/sheet-model';
import type { ParsedTakeoffSheet } from './parse-takeoff-sheet';
import { normalizeItemCode } from './parse-takeoff-sheet';
import {
  buildBoqTakeoffIndex,
  matchTakeoffGroup,
  type BoqTakeoffCandidate,
} from './matching';

export interface QuantityPreviewInput {
  fileName: string;
  sheetName: string;
  digest: string;
  parsed: ParsedTakeoffSheet;
  linkVersionId: Uuid | null;
  /** Candidatos BOQ de la versión objetivo (null ⇒ sin vinculación). */
  boqCandidates: BoqTakeoffCandidate[] | null;
}

/** Construye el preview completo (grupos, vínculos, totales, importabilidad). */
export function buildQuantityImportPreview(input: QuantityPreviewInput): QuantityImportPreview {
  const { parsed } = input;
  const index =
    input.linkVersionId && input.boqCandidates
      ? buildBoqTakeoffIndex(input.boqCandidates)
      : null;

  // Los ítems vinculados en ESTE preview tampoco pueden repetirse entre
  // grupos (el pareo por occurrence ya lo evita por clave; esto cubre claves
  // distintas que apunten al mismo ítem por datos anómalos).
  const claimed = new Set<Uuid>();

  const groups: TakeoffGroupPreview[] = parsed.groups.map((group) => {
    const key = `${normalizeItemCode(group.itemCode)}|${normalizeDescription(group.description)}#${group.occurrenceIndex}`;

    const lines: TakeoffLinePreview[] = group.lines.map((line) => ({
      key: `${key}:${line.sourceRow}`,
      sourceRow: line.sourceRow,
      description: line.description,
      formulaType: line.formulaType,
      formulaText: line.formulaText,
      length: line.length,
      width: line.width,
      height: line.height,
      count: line.count,
      excelSubtotal: line.excelSubtotal,
      subtotalCalculated: line.subtotalCalculated,
      deduction: line.deduction,
      rawValues: line.rawValues,
      warnings: line.warnings,
    }));

    let linkStatus: TakeoffGroupPreview['linkStatus'] = 'not_evaluated';
    let boqItemId: Uuid | null = null;
    let boqItemCode: string | null = null;
    let boqItemDescription: string | null = null;

    if (index) {
      const outcome = matchTakeoffGroup(index, {
        itemCode: group.itemCode,
        description: group.description,
        unit: group.unit,
        occurrenceIndex: group.occurrenceIndex,
      });
      linkStatus = outcome.status;
      boqItemCode = outcome.boqItemCode;
      boqItemDescription = outcome.boqItemDescription;
      if (outcome.status === 'linked' && outcome.boqItemId) {
        if (claimed.has(outcome.boqItemId)) {
          linkStatus = 'ambiguous';
        } else {
          claimed.add(outcome.boqItemId);
          boqItemId = outcome.boqItemId;
        }
      }
    }

    return {
      key,
      sourceRow: group.sourceRow,
      occurrenceIndex: group.occurrenceIndex,
      visibleCode: group.visibleCode,
      itemCode: group.itemCode,
      description: group.description,
      unit: group.unit,
      rawUnit: group.rawUnit,
      chapterLabel: group.chapterLabel,
      lines,
      excelTotal: group.excelTotal,
      totalFormulaText: group.totalFormulaText,
      totalCalculated: group.totalCalculated,
      linkStatus,
      boqItemId,
      boqItemCode,
      boqItemDescription,
      warnings: group.warnings,
    };
  });

  const count = (status: TakeoffGroupPreview['linkStatus']): number =>
    groups.filter((g) => g.linkStatus === status).length;

  const lineCount = groups.reduce((acc, g) => acc + g.lines.length, 0);
  const deductions = groups.reduce(
    (acc, g) => acc + g.lines.filter((l) => l.deduction).length,
    0,
  );
  const excelMismatches = groups.reduce(
    (acc, g) =>
      acc +
      g.warnings.filter((w) => w.code === 'group_total_mismatch').length +
      g.lines.reduce(
        (a, l) => a + l.warnings.filter((w) => w.code === 'excel_mismatch').length,
        0,
      ),
    0,
  );
  const warningCount =
    groups.reduce(
      (acc, g) => acc + g.warnings.length + g.lines.reduce((a, l) => a + l.warnings.length, 0),
      0,
    ) + input.parsed.skippedGroups.length;

  const blockingErrors = [...parsed.errors];
  if (groups.length === 0 && blockingErrors.length === 0) {
    blockingErrors.push('La hoja no contiene grupos con líneas de medición importables.');
  }

  return {
    fileName: input.fileName,
    sheetName: input.sheetName,
    digest: input.digest,
    linkVersionId: input.linkVersionId,
    groups,
    skippedGroups: parsed.skippedGroups,
    totals: {
      groups: groups.length,
      lines: lineCount,
      linked: count('linked'),
      suggested: count('suggested'),
      unresolved: count('unresolved'),
      ambiguous: count('ambiguous'),
      skippedExisting: count('skipped_existing'),
      notEvaluated: count('not_evaluated'),
      deductions,
      excelMismatches,
      warnings: warningCount,
      skippedNoLines: parsed.skippedGroups.length,
    },
    blockingErrors,
    importable: blockingErrors.length === 0 && groups.length > 0,
  };
}
