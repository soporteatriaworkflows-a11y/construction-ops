/**
 * scope-labels.ts — Etiquetas legibles de `scope_type` para la UI (4B.2).
 *
 * Propiedad: agent-frontend-boq. Mantiene los 7 valores del esquema
 * (`project_scopes_scope_type_valid`).
 */
import type { ScopeType } from '@/lib/scopes/scope-types';

export const SCOPE_TYPE_LABELS: Record<ScopeType, string> = {
  floor: 'Piso',
  tower: 'Torre',
  stage: 'Etapa',
  package: 'Paquete',
  unit: 'Unidad',
  modification: 'Modificación',
  other: 'Otro',
};
