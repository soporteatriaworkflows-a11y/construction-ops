/**
 * version-types.ts — Tipos CLIENT-SAFE de emisión/clonación de versiones (4E.3A).
 *
 * Sin dependencias de servidor. Dinero como `DecimalString`. Contrato:
 * `docs/ESTIMATE_ISSUE_CLONE_CONTRACT.md`.
 */
import type { DecimalString, Uuid } from '@/lib/utils/types';
import type { EstimateVersionStatus } from '@/lib/contracts/read-model';

export type { EstimateVersionStatus } from '@/lib/contracts/read-model';

/** Resumen de una versión de presupuesto (para listado/selector y resultado de mutación). */
export interface EstimateVersionSummary {
  id: Uuid;
  versionNumber: number;
  status: EstimateVersionStatus;
  /** Es la versión activa (mayor `version_number`). */
  isActive: boolean;
  /** Editable = estado no bloqueado (draft/review). */
  editable: boolean;
  issuedAt: string | null;
  issuedBy: string | null;
  createdAt: string | null;
  /** Versión origen si fue clonada (4E.3A). */
  sourceVersionId: Uuid | null;
  /** Σ subtotales de ítems ACTIVOS de la versión (DecimalString). */
  directTotal: DecimalString;
  /** Total general (directo + AIU) de la versión (DecimalString). */
  grandTotal: DecimalString;
}
