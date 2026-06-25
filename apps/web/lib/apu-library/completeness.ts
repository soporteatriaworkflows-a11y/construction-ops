/**
 * completeness.ts — Estado de completitud de un APU para la biblioteca
 * (APU_LIBRARY_REUSABLE_ACTIVITIES_UX_V1). PURA, sin DB, sin recalcular finanzas.
 *
 * Esto es estado VISUAL de biblioteca (¿la actividad está lista para reutilizar?),
 * NO un semáforo de "cotización completa" ni un gate de export.
 */
import type { ApuLibraryItem } from './types';

export type ApuCompletenessState = 'ready' | 'review' | 'incomplete' | 'archived';
export type ApuIssueSeverity = 'critical' | 'warning' | 'info';

export interface ApuIssue {
  severity: ApuIssueSeverity;
  code: string;
  message: string;
}

export interface ApuCompleteness {
  state: ApuCompletenessState;
  label: string;
  issues: ApuIssue[];
}

export const COMPLETENESS_LABELS: Record<ApuCompletenessState, string> = {
  ready: 'Listo para usar',
  review: 'Requiere revisión',
  incomplete: 'Incompleto',
  archived: 'Archivado',
};

function isZeroOrLess(value: string | null | undefined): boolean {
  const n = Number(value ?? '0');
  return !Number.isFinite(n) || n <= 0;
}

/**
 * Calcula el estado de completitud + issues por severidad de un APU. PURA.
 *
 * Reglas:
 *  - `archived`    ⇒ APU archivado (no editable).
 *  - `incomplete`  ⇒ hay issues `critical` (sin componentes / precio 0 / material
 *    sin precio / recursos sin resolver).
 *  - `review`      ⇒ solo issues `warning` (sin categoría / sugerencias / ambiguos).
 *  - `ready`       ⇒ sin critical ni warning.
 *
 * @param item - Fila de biblioteca (con typeCounts/materialsWithoutPrice/category).
 */
export function computeApuCompleteness(item: ApuLibraryItem): ApuCompleteness {
  if (item.archivedAt != null) {
    return { state: 'archived', label: COMPLETENESS_LABELS.archived, issues: [] };
  }

  const issues: ApuIssue[] = [];
  const rs = item.resourceStatus;

  // critical
  if (item.componentCount === 0) {
    issues.push({ severity: 'critical', code: 'no_components', message: 'Sin componentes' });
  }
  if (isZeroOrLess(item.unitCost)) {
    issues.push({ severity: 'critical', code: 'zero_unit_cost', message: 'Precio unitario en 0' });
  }
  if ((item.materialsWithoutPrice ?? 0) > 0) {
    issues.push({
      severity: 'critical',
      code: 'materials_without_price',
      message: `${item.materialsWithoutPrice} material(es) sin precio`,
    });
  }
  if (rs.unresolved > 0) {
    issues.push({
      severity: 'critical',
      code: 'unresolved_resources',
      message: `${rs.unresolved} recurso(s) sin resolver`,
    });
  }

  // warning
  if ((item.category ?? 'Sin categoría') === 'Sin categoría') {
    issues.push({ severity: 'warning', code: 'no_category', message: 'Sin categoría' });
  }
  if (rs.ambiguous > 0) {
    issues.push({ severity: 'warning', code: 'ambiguous_resources', message: `${rs.ambiguous} recurso(s) ambiguo(s)` });
  }
  if (rs.suggested > 0) {
    issues.push({ severity: 'warning', code: 'suggested_resources', message: `${rs.suggested} sugerencia(s) por confirmar` });
  }

  // info
  if (!item.boqLinked) {
    issues.push({ severity: 'info', code: 'no_boq_link', message: 'Sin vínculo BOQ' });
  }

  const hasCritical = issues.some((i) => i.severity === 'critical');
  const hasWarning = issues.some((i) => i.severity === 'warning');
  const state: ApuCompletenessState = hasCritical ? 'incomplete' : hasWarning ? 'review' : 'ready';
  return { state, label: COMPLETENESS_LABELS[state], issues };
}

/**
 * Badges de capacidades editables presentes según los tipos de componente del APU.
 * No edita nada; solo informa qué controles existen para esta actividad. PURA.
 */
export function editableCapabilities(item: ApuLibraryItem): string[] {
  const tc = item.typeCounts;
  const badges: string[] = [];
  if (!tc) return badges;
  if (tc.material > 0) {
    badges.push('Consumo editable');
    badges.push('Desperdicio editable');
  }
  if (tc.labor > 0) badges.push('Rendimiento editable');
  return badges;
}
