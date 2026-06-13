/**
 * csv.ts — Reporte CSV sanitizado de reconciliación (sin fórmulas ejecutables).
 * Perfil management/internal: incluye recurso sugerido y estado. NO incluye
 * descuentos internos ni datos sensibles de cliente.
 */
import { buildSanitizedCsv } from '@/lib/catalog-import/csv';
import type {
  ReconciliationRow,
  ReconciliationState,
} from '@/lib/apu-reconciliation/types';

const STATE_LABELS: Record<ReconciliationState, string> = {
  exact_match: 'Coincidencia exacta',
  suggested: 'Sugerido',
  ambiguous: 'Ambiguo',
  unresolved: 'Sin resolver',
  associated: 'Asociado',
  intentionally_unresolved: 'Sin asociar (consciente)',
};

/** CSV de reconciliación para management/internal. */
export function buildReconciliationCsv(
  rows: ReadonlyArray<ReconciliationRow>,
): string {
  return buildSanitizedCsv(
    [
      'APU',
      'Actividad',
      'Componente (raw)',
      'Código raw',
      'Tipo',
      'Unidad',
      'Estado',
      'Recurso asociado',
      'Sugerencia',
      'Razón',
      'Confianza',
    ],
    rows.map((r) => [
      r.apuCode,
      r.apuName,
      r.description,
      r.rawCode ?? '',
      r.componentType,
      r.rawUnit ?? '',
      STATE_LABELS[r.state],
      r.associatedResourceCode
        ? `${r.associatedResourceCode} — ${r.associatedResourceName ?? ''}`
        : '',
      r.primaryCandidate
        ? `${r.primaryCandidate.code} — ${r.primaryCandidate.name}`
        : '',
      r.matchReason,
      r.state === 'exact_match'
        ? 'Alta'
        : r.state === 'suggested'
          ? 'Media'
          : '',
    ]),
  );
}
