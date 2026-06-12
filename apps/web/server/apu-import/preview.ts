/**
 * preview.ts — Ensamblado del preview y del plan de importación (PURO).
 * ENTRE_PATIOS_APU_IMPORT_V1 + BOQ_APU_LINKING_V1, contrato §3–§8.
 *
 * El recálculo usa EXCLUSIVAMENTE el dominio (`modules/apu`, Decimal). Los
 * subtotales del Excel son evidencia: se comparan, jamás se adoptan.
 */
import type { DecimalString, Uuid } from '@/lib/utils/types';
import {
  calculateApuComponentCost,
  calculateApuUnitCostFull,
  type ApuComponentCostEntry,
} from '@/modules/apu/apu';
import { calculateLaborCost, type LaborRoleFactors } from '@/modules/apu/labor';
import { DomainDecimal, toDecimal, toDecimalString, ZERO } from '@/modules/apu/decimal';
import { canonicalizeUnit } from '@/server/pricing/units';
import type { ResourceIdentifier } from '@/server/catalog/import/price-list';
import type {
  AcceptedSuggestion,
  ApuImportActivityPreview,
  ApuImportComponentPreview,
  ApuImportPreview,
  ApuLaborRolePreview,
  BoqLinkStatus,
} from '@/lib/apu-import/types';
import {
  buildResourceMatchIndex,
  matchMaterialComponent,
  type MaterialMatchOutcome,
} from './matching';
import { differsFromEvidence } from './salary';
import type {
  ParsedApuActivity,
  ParsedApuSheet,
  RecognizedRole,
} from './parse-apu-sheet';
import { normalizeDescription, normalizeLabel } from './sheet-model';
import { ApuSuggestionRejectedError } from './errors';

/** Rol laboral existente en la organización (lectura RLS-bound). */
export interface ExistingLaborRole {
  id: Uuid;
  code: string;
  name: string;
  factors: LaborRoleFactors;
}

/** Ítem BOQ candidato de la versión objetivo (no archivado). */
export interface BoqCandidateItem {
  id: Uuid;
  code: string;
  description: string;
  unit: string;
  apuTemplateId: Uuid | null;
}

/** Resolución interna de un rol reconocido (§3.7). */
export interface LaborResolution {
  role: RecognizedRole;
  action: 'reuse' | 'create' | 'unavailable';
  laborRoleId: Uuid | null;
  /** Costo hora a usar como snapshot (hoja preferida; rol existente fallback). */
  hourly: DecimalString | null;
  factorsForCreate: LaborRoleFactors | null;
  existingRoleName?: string;
}

/** Componente expandido listo para la RPC (labor = una fila por rol). */
export interface ComponentBuildPlan {
  componentType: 'material' | 'labor' | 'equipment' | 'tool';
  resourceId: Uuid | null;
  laborRole: RecognizedRole | null;
  quantity: DecimalString;
  wastePct: DecimalString;
  unitPriceSource: 'resource' | 'labor_role' | 'manual';
  unitPriceSnapshot: DecimalString;
  sortOrder: number;
  notes: string | null;
  sourceRow: number;
  sourceOccurrenceIndex: number;
  rawCode: string | null;
  rawUnit: string | null;
}

/** Plan por actividad para la confirmación. */
export interface ActivityBuildPlan {
  key: string;
  persistedCode: string;
  action: 'create' | 'skip_existing' | 'omit';
  name: string;
  unit: string;
  defaultToolPct: DecimalString;
  sourceRow: number;
  sourceOccurrenceIndex: number;
  components: ComponentBuildPlan[];
  /** Vínculo BOQ exacto y único (si la versión objetivo fue evaluada). */
  linkBoqItemId: Uuid | null;
}

/** Entrada del ensamblador (datos ya leídos por el repositorio). */
export interface BuildPreviewInput {
  fileName: string;
  sheetName: string;
  digest: string;
  parsed: ParsedApuSheet;
  identifiers: ReadonlyArray<ResourceIdentifier>;
  existingLaborRoles: ReadonlyArray<ExistingLaborRole>;
  /** Códigos de apu_templates existentes en la org (version=1). */
  existingApuCodes: ReadonlySet<string>;
  /** Precio baseline aprobado por recurso (comparación; jamás se modifica). */
  baselinePrices: ReadonlyMap<Uuid, DecimalString>;
  linkVersionId: Uuid | null;
  boqCandidates: ReadonlyArray<BoqCandidateItem> | null;
  /** Aceptes explícitos de sugerencias (confirmación; re-validados aquí). */
  acceptedSuggestions?: ReadonlyArray<AcceptedSuggestion>;
  /** En confirmación, un acepte inválido lanza error; en preview se ignora. */
  strictAcceptedSuggestions?: boolean;
}

/** Resultado del ensamblado: preview (UI) + plan (confirmación). */
export interface ApuPreviewBuild {
  preview: ApuImportPreview;
  laborResolutions: Map<RecognizedRole, LaborResolution>;
  plans: ActivityBuildPlan[];
}

const ROLE_WORDS: Record<RecognizedRole, string> = {
  oficial: 'oficial',
  ayudante: 'ayudante',
};

function matchExistingRole(
  roles: ReadonlyArray<ExistingLaborRole>,
  role: RecognizedRole,
): ExistingLaborRole | null {
  const word = ROLE_WORDS[role];
  const matches = roles.filter((r) => {
    const tokens = normalizeDescription(r.name).split(' ');
    return tokens.includes(word) || tokens.includes(`${word}s`) || tokens.includes(`${word}es`);
  });
  return matches[0] ?? null;
}

/** Resuelve los roles reconocidos combinando hoja + roles existentes (§3.7). */
export function resolveLaborRoles(
  parsed: ParsedApuSheet,
  existingRoles: ReadonlyArray<ExistingLaborRole>,
): { resolutions: Map<RecognizedRole, LaborResolution>; previews: ApuLaborRolePreview[] } {
  const resolutions = new Map<RecognizedRole, LaborResolution>();
  const previews: ApuLaborRolePreview[] = [];

  const neededRoles = new Set<RecognizedRole>();
  for (const activity of parsed.activities) {
    for (const component of activity.components) {
      for (const member of component.crew ?? []) neededRoles.add(member.role);
    }
  }
  for (const block of parsed.salaryRoles) {
    if (block.role) neededRoles.add(block.role);
  }

  for (const role of [...neededRoles].sort()) {
    const block = parsed.salaryRoles.find((b) => b.role === role) ?? null;
    const existing = matchExistingRole(existingRoles, role);
    const warnings: string[] = [...(block?.derived.warnings ?? [])];

    const sheetHourly = block?.derived.hourlyRecalculated ?? null;
    const existingHourly = existing
      ? calculateLaborCost(existing.factors).hourlyIntegralCost
      : null;
    const hourly = sheetHourly ?? existingHourly;

    let action: LaborResolution['action'];
    if (existing) {
      action = 'reuse';
      if (sheetHourly && existingHourly && differsFromEvidence(sheetHourly, existingHourly)) {
        warnings.push(
          `El rol existente "${existing.name}" tiene un costo hora distinto al derivado de la hoja; el snapshot usa el valor de la hoja.`,
        );
      }
      if (!sheetHourly) {
        warnings.push(
          'Sin bloque salarial en la hoja para este rol; se usa el costo hora del rol existente.',
        );
      }
    } else if (block?.derived.factors) {
      action = 'create';
    } else {
      action = 'unavailable';
      warnings.push(
        `No hay bloque salarial en la hoja ni rol existente para "${role}"; las actividades que lo requieren no se importan.`,
      );
    }

    resolutions.set(role, {
      role,
      action,
      laborRoleId: existing?.id ?? null,
      hourly,
      factorsForCreate: action === 'create' ? (block?.derived.factors ?? null) : null,
      existingRoleName: existing?.name,
    });

    previews.push({
      role,
      blockLabel: block?.blockLabel ?? '(sin bloque en la hoja)',
      hourlyExcel: block?.derived.hourlyExcel ?? null,
      hourlyRecalculated: hourly,
      action,
      existingRoleName: existing?.name,
      warnings,
    });
  }

  return { resolutions, previews };
}

/** Código persistido: visible si es único en la hoja; `visible#n` si se repite. */
export function persistedCodeFor(activity: ParsedApuActivity, codeTotal: number): string {
  if (codeTotal <= 1 || activity.occurrenceIndex === 1) return activity.visibleCode;
  return `${activity.visibleCode}#${activity.occurrenceIndex}`;
}

function linkKeyOf(description: string, unit: string): string {
  return `${normalizeDescription(description)}|${canonicalizeUnit(unit).canonical}`;
}

/** Ensambla preview + plan de importación + decisiones de linking (§7, §8). */
export function buildApuImportPreview(input: BuildPreviewInput): ApuPreviewBuild {
  const { parsed } = input;
  const index = buildResourceMatchIndex(input.identifiers);
  const { resolutions, previews: laborPreviews } = resolveLaborRoles(
    parsed,
    input.existingLaborRoles,
  );
  const accepted = new Map<string, Uuid>(
    (input.acceptedSuggestions ?? []).map((a) => [a.componentKey, a.resourceId]),
  );

  // Conteo total por código visible (para persistedCode y occurrence).
  const codeTotals = new Map<string, number>();
  for (const activity of parsed.activities) {
    const key = normalizeLabel(activity.visibleCode);
    codeTotals.set(key, (codeTotals.get(key) ?? 0) + 1);
  }

  // Claves de linking duplicadas ENTRE actividades ⇒ ambiguous (§7).
  const activityLinkKeyCount = new Map<string, number>();
  for (const activity of parsed.activities) {
    const key = linkKeyOf(activity.description, activity.rawUnit);
    activityLinkKeyCount.set(key, (activityLinkKeyCount.get(key) ?? 0) + 1);
  }

  const candidatesByKey = new Map<string, BoqCandidateItem[]>();
  if (input.boqCandidates) {
    for (const item of input.boqCandidates) {
      const key = linkKeyOf(item.description, item.unit);
      const list = candidatesByKey.get(key);
      if (list) list.push(item);
      else candidatesByKey.set(key, [item]);
    }
  }

  const activities: ApuImportActivityPreview[] = [];
  const plans: ActivityBuildPlan[] = [];
  const totals = {
    activities: parsed.activities.length,
    components: 0,
    exactMatches: 0,
    suggested: 0,
    unresolved: 0,
    ambiguous: 0,
    warnings: parsed.warnings.length,
    criticalErrors: parsed.errors.length,
    readyToImport: 0,
    skippedExisting: 0,
    omitted: 0,
    linkable: 0,
    notLinkable: 0,
  };

  for (const activity of parsed.activities) {
    const key = `${activity.visibleCode}#${activity.occurrenceIndex}`;
    const persistedCode = persistedCodeFor(
      activity,
      codeTotals.get(normalizeLabel(activity.visibleCode)) ?? 1,
    );
    const activityWarnings = [...activity.warnings];
    const activityErrors = [...activity.errors];

    const componentPreviews: ApuImportComponentPreview[] = [];
    const planComponents: ComponentBuildPlan[] = [];
    const costEntries: ApuComponentCostEntry[] = [];
    let exactCount = 0;
    let suggestedCount = 0;
    let unresolvedCount = 0;
    let ambiguousCount = 0;
    let sortOrder = 0;

    for (const component of activity.components) {
      totals.components += 1;
      const componentKey = `${key}:${component.sourceRow}`;
      const compWarnings = [...component.warnings];
      const compErrors = [...component.errors];
      const unitCanonical = canonicalizeUnit(component.rawUnit).canonical;

      let match: ApuImportComponentPreview['match'] = 'none';
      let resource: ResourceIdentifier | undefined;
      let recalculated: DecimalString | null = null;

      if (component.kind === 'labor') {
        match = 'labor';
        const crew = component.crew ?? [];
        let crewHourly = new DomainDecimal(0);
        let crewAvailable = crew.length > 0;
        for (const member of crew) {
          const resolution = resolutions.get(member.role);
          if (!resolution || resolution.action === 'unavailable' || !resolution.hourly) {
            crewAvailable = false;
            continue;
          }
          crewHourly = crewHourly.plus(
            new DomainDecimal(member.count).times(toDecimal(resolution.hourly)),
          );
        }
        if (!crewAvailable) {
          if (!component.crewUnrecognized) {
            compErrors.push(
              `Fila ${component.sourceRow}: no hay rol salarial disponible para la cuadrilla.`,
            );
          }
        } else if (component.quantity !== null) {
          recalculated = toDecimalString(toDecimal(component.quantity).times(crewHourly));
          costEntries.push({ componentType: 'labor', totalComponentCost: recalculated });
          if (
            component.excelSubtotal !== null &&
            differsFromEvidence(recalculated, component.excelSubtotal)
          ) {
            compWarnings.push(
              `Fila ${component.sourceRow}: la M.O. recalculada (${recalculated}) difiere del Excel (${component.excelSubtotal}).`,
            );
          }
          // Plan: una fila por rol (encoding congelado §3.6).
          for (const member of crew) {
            const resolution = resolutions.get(member.role);
            if (!resolution?.hourly) continue;
            planComponents.push({
              componentType: 'labor',
              resourceId: null,
              laborRole: member.role,
              quantity: toDecimalString(
                toDecimal(component.quantity).times(new DomainDecimal(member.count)),
              ),
              wastePct: ZERO,
              unitPriceSource: 'labor_role',
              unitPriceSnapshot: resolution.hourly,
              sortOrder: sortOrder++,
              notes: `Cuadrilla: ${component.description}`,
              sourceRow: component.sourceRow,
              sourceOccurrenceIndex: activity.occurrenceIndex,
              rawCode: component.rawCode || null,
              rawUnit: component.rawUnit || null,
            });
          }
        }
      } else {
        // material / equipment / tool explícita.
        const outcome: MaterialMatchOutcome = matchMaterialComponent(index, {
          rawCode: component.rawCode,
          description: component.description,
          rawUnit: component.rawUnit,
        });

        let resourceForPlan: Uuid | null = null;
        if (outcome.kind === 'exact') {
          match = 'exact';
          resource = outcome.resource;
          resourceForPlan = outcome.resource.id;
          exactCount += 1;
          totals.exactMatches += 1;
        } else if (outcome.kind === 'suggested') {
          match = 'suggested';
          resource = outcome.resource;
          suggestedCount += 1;
          totals.suggested += 1;
          if (outcome.unitMismatch) {
            compWarnings.push(
              `Fila ${component.sourceRow}: la unidad del recurso sugerido (${outcome.resource.unit}) difiere de la hoja (${component.rawUnit || 'vacía'}).`,
            );
          }
          const acceptedId = accepted.get(componentKey);
          if (acceptedId !== undefined) {
            if (acceptedId === outcome.resource.id) {
              resourceForPlan = acceptedId;
              compWarnings.push('Sugerencia aceptada explícitamente por la usuaria.');
            } else if (input.strictAcceptedSuggestions) {
              throw new ApuSuggestionRejectedError(componentKey);
            }
          }
        } else if (outcome.kind === 'ambiguous') {
          match = 'ambiguous';
          ambiguousCount += 1;
          totals.ambiguous += 1;
          compWarnings.push(
            `Fila ${component.sourceRow}: ${outcome.candidates.length} recursos coinciden; no se asocia automáticamente.`,
          );
          if (input.strictAcceptedSuggestions && accepted.has(componentKey)) {
            throw new ApuSuggestionRejectedError(componentKey);
          }
        } else {
          match = 'unresolved';
          unresolvedCount += 1;
          totals.unresolved += 1;
          if (input.strictAcceptedSuggestions && accepted.has(componentKey)) {
            throw new ApuSuggestionRejectedError(componentKey);
          }
        }

        if (component.quantity !== null && component.unitPrice !== null) {
          recalculated = calculateApuComponentCost({
            componentType: component.kind,
            quantity: component.quantity,
            wastePct: component.wastePct,
            unitPriceSnapshot: component.unitPrice,
          });
          costEntries.push({
            componentType: component.kind,
            totalComponentCost: recalculated,
          });
          if (
            component.excelSubtotal !== null &&
            differsFromEvidence(recalculated, component.excelSubtotal)
          ) {
            compWarnings.push(
              `Fila ${component.sourceRow}: el subtotal recalculado (${recalculated}) difiere del Excel (${component.excelSubtotal}).`,
            );
          }
          planComponents.push({
            componentType: component.kind,
            resourceId: resourceForPlan,
            laborRole: null,
            quantity: component.quantity,
            wastePct: component.wastePct,
            unitPriceSource: resourceForPlan ? 'resource' : 'manual',
            unitPriceSnapshot: component.unitPrice,
            sortOrder: sortOrder++,
            notes:
              resourceForPlan === null
                ? `Sin asociar al catálogo: "${component.description}"`
                : match === 'suggested'
                  ? 'Asociado por sugerencia aceptada explícitamente.'
                  : null,
            sourceRow: component.sourceRow,
            sourceOccurrenceIndex: activity.occurrenceIndex,
            rawCode: component.rawCode || null,
            rawUnit: component.rawUnit || null,
          });
        }
      }

      const baseline =
        resource !== undefined ? (input.baselinePrices.get(resource.id) ?? null) : null;
      if (
        baseline !== null &&
        component.unitPrice !== null &&
        differsFromEvidence(component.unitPrice, baseline)
      ) {
        compWarnings.push(
          `Fila ${component.sourceRow}: el precio de la hoja (${component.unitPrice}) difiere del baseline aprobado (${baseline}).`,
        );
      }

      componentPreviews.push({
        key: componentKey,
        sourceRow: component.sourceRow,
        rawCode: component.rawCode,
        description: component.description,
        componentType: component.kind,
        rawUnit: component.rawUnit,
        unitCanonical,
        quantity: component.quantity,
        wastePct: component.wastePct,
        unitPrice: component.unitPrice,
        excelSubtotal: component.excelSubtotal,
        recalculatedSubtotal: recalculated,
        match,
        resourceId: resource?.id,
        resourceCode: resource?.code,
        resourceName: resource?.name,
        approvedBaselinePrice: baseline,
        crew: component.crew?.map((m) => ({
          role: m.role,
          count: m.count,
          laborRoleName: resolutions.get(m.role)?.existingRoleName,
        })),
        warnings: compWarnings,
        errors: compErrors,
      });

      activityWarnings.push(...compWarnings);
      activityErrors.push(...compErrors.filter((e) => !activityErrors.includes(e)));
    }

    // Total recalculado (incluye herramienta derivada §3.5).
    let recalculatedTotal: DecimalString | null = null;
    let costDelta: DecimalString | null = null;
    if (activityErrors.length === 0) {
      recalculatedTotal = calculateApuUnitCostFull(costEntries, activity.defaultToolPct).total;
      if (activity.excelTotal !== null) {
        costDelta = toDecimalString(
          toDecimal(recalculatedTotal).minus(toDecimal(activity.excelTotal)),
        );
        if (differsFromEvidence(recalculatedTotal, activity.excelTotal)) {
          activityWarnings.push(
            `Costo recalculado (${recalculatedTotal}) difiere del Excel (${activity.excelTotal}).`,
          );
        }
      }
    }

    const hasReview = suggestedCount + unresolvedCount + ambiguousCount > 0;
    const status: ApuImportActivityPreview['status'] =
      activityErrors.length > 0 ? 'error' : hasReview ? 'needs_review' : 'ready';
    const exists = input.existingApuCodes.has(persistedCode);
    const importAction: ApuImportActivityPreview['importAction'] =
      status === 'error' ? 'omit' : exists ? 'skip_existing' : 'create';

    if (importAction === 'create') totals.readyToImport += 1;
    else if (importAction === 'skip_existing') {
      totals.skippedExisting += 1;
      activityWarnings.push(
        `Ya existe una plantilla APU con el código "${persistedCode}"; no se sobrescribe.`,
      );
    } else totals.omitted += 1;

    // Linking BOQ (§7) — solo si hay versión objetivo evaluada.
    let boqLink: ApuImportActivityPreview['boqLink'] = { status: 'not_evaluated' };
    let linkBoqItemId: Uuid | null = null;
    if (input.boqCandidates !== null && importAction !== 'omit') {
      const linkKey = linkKeyOf(activity.description, activity.rawUnit);
      const sheetDuplicates = activityLinkKeyCount.get(linkKey) ?? 0;
      const candidates = candidatesByKey.get(linkKey) ?? [];
      const single = candidates.length === 1 ? candidates[0] : undefined;
      if (sheetDuplicates > 1) {
        boqLink = {
          status: 'ambiguous',
          detail:
            'Varias actividades de la hoja comparten descripción y unidad; no se vincula automáticamente.',
        };
      } else if (candidates.length === 0) {
        boqLink = { status: 'unresolved' };
      } else if (candidates.length > 1 || !single) {
        boqLink = {
          status: 'ambiguous',
          detail: `${candidates.length} ítems del presupuesto coinciden; no se vincula automáticamente.`,
        };
      } else if (single.apuTemplateId !== null) {
        boqLink = {
          status: 'skipped_existing',
          boqItemId: single.id,
          boqItemCode: single.code,
          boqItemDescription: single.description,
          detail: 'El ítem ya tiene un APU vinculado; no se reemplaza.',
        };
      } else {
        boqLink = {
          status: 'linkable',
          boqItemId: single.id,
          boqItemCode: single.code,
          boqItemDescription: single.description,
        };
        linkBoqItemId = single.id;
      }
    }
    if (boqLink.status === 'linkable') totals.linkable += 1;
    else if (input.boqCandidates !== null && importAction !== 'omit') totals.notLinkable += 1;

    totals.warnings += activityWarnings.length;

    activities.push({
      key,
      visibleCode: activity.visibleCode,
      occurrenceIndex: activity.occurrenceIndex,
      persistedCode,
      description: activity.description,
      rawUnit: activity.rawUnit,
      unitCanonical: canonicalizeUnit(activity.rawUnit).canonical,
      sourceRow: activity.sourceRow,
      componentCount: activity.components.length,
      defaultToolPct: activity.defaultToolPct,
      excelTotal: activity.excelTotal,
      recalculatedTotal,
      costDelta,
      status,
      importAction,
      exactCount,
      suggestedCount,
      unresolvedCount,
      ambiguousCount,
      boqLink,
      warnings: activityWarnings,
      errors: activityErrors,
      components: componentPreviews,
    });

    plans.push({
      key,
      persistedCode,
      action: importAction,
      name: activity.description,
      unit: activity.rawUnit,
      defaultToolPct: activity.defaultToolPct,
      sourceRow: activity.sourceRow,
      sourceOccurrenceIndex: activity.occurrenceIndex,
      components: importAction === 'create' ? planComponents : [],
      linkBoqItemId,
    });
  }

  const blockingErrors = [...parsed.errors];
  const importable =
    blockingErrors.length === 0 &&
    (totals.readyToImport > 0 || totals.skippedExisting > 0);

  const preview: ApuImportPreview = {
    fileName: input.fileName,
    sheetName: input.sheetName,
    digest: input.digest,
    laborRoles: laborPreviews,
    totals,
    activities,
    linkVersionId: input.linkVersionId,
    blockingErrors,
    importable,
  };

  return { preview, laborResolutions: resolutions, plans };
}
