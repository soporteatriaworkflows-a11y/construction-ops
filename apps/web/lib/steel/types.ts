/**
 * types.ts — Tipos de vista (mock/UI) para el preview de Steel Ops.
 *
 * Estos tipos son de PRESENTACIÓN, no el contrato de dominio (`@/modules/steel`)
 * ni el futuro modelo de datos (`docs/design-references/STEEL_OPS_V1_BLUEPRINT.md`
 * §4). Se nombran con sufijo `View`/`Mock` a propósito para que nadie los
 * confunda con la fuente de verdad real. Campos alineados en nombre/forma a las
 * entidades del blueprint donde es razonable, para minimizar reescritura futura.
 */
import type { DecimalString } from '@/lib/utils/types';
import type { SteelFamily, SteelOffcutStatus, SteelVerificationStatus } from '@/modules/steel';

export type SteelTakeoffStatusView = 'draft' | 'in_review' | 'approved' | 'locked';

export interface SteelTakeoffView {
  id: string;
  name: string;
  projectName: string;
  scopeLabel: string;
  status: SteelTakeoffStatusView;
  lineCount: number;
  createdAt: string;
}

export interface SteelElementView {
  id: string;
  takeoffId: string;
  elementType:
    | 'zapata'
    | 'viga_cimentacion'
    | 'columna'
    | 'pilote'
    | 'losa'
    | 'escalera'
    | 'perfil_ipe'
    | 'tubo_estructural'
    | 'platina'
    | 'malla_electrosoldada';
  label: string;
  axisLocation: string;
}

/** Descripción cruda de despiece (entrada al parser real de F1). */
export interface SteelRawDescriptionView {
  id: string;
  elementId: string;
  originalDescription: string;
  sourceLabel: string;
}

/** Línea de perfil/estructura metálica: no pasa por el parser (solo rebar en F1). */
export interface SteelProfileLineView {
  id: string;
  elementId: string;
  originalDescription: string;
  profileReference: string;
  cutLengthM: DecimalString;
  quantityPerUnit: DecimalString;
  repetitions: DecimalString;
  unitWeightKgM: DecimalString;
  assumedWastePct: DecimalString;
}

export interface SteelSpecView {
  id: string;
  family: SteelFamily;
  label: string;
  reference: string;
  unit: string;
  supplierName: string;
  priceStatus: 'vigente' | 'vencido' | 'sin_precio';
  priceCop?: DecimalString;
  validUntil?: string;
}

export interface SteelOffcutView {
  id: string;
  specLabel: string;
  lengthM: DecimalString;
  status: SteelOffcutStatus;
  estimatedSavingsCop?: DecimalString;
  fromDomain: boolean;
}

export type SteelOrderStatusView = 'draft' | 'quoted' | 'approved' | 'purchased' | 'received';

export interface SteelOrderLineView {
  id: string;
  familyLabel: string;
  commercialLengthM: DecimalString;
  commercialUnits: DecimalString;
  supplierName: string;
  unitPriceCop: DecimalString;
  validUntil: string;
}

export interface SteelOrderView {
  id: string;
  name: string;
  status: SteelOrderStatusView;
  lines: readonly SteelOrderLineView[];
  totalEstimatedCop: DecimalString;
}

export type SteelBoqLinkStatusView = 'no_vinculado' | 'sugerido' | 'vinculado';

export interface SteelBoqLinkView {
  id: string;
  elementLabel: string;
  suggestedBoqActivity: string;
  suggestedCatalogResource: string;
  status: SteelBoqLinkStatusView;
}

export interface SteelReviewItemView {
  id: string;
  elementLabel: string;
  originalDescription: string;
  interpretation: string;
  confidenceScore: DecimalString;
  needsReview: boolean;
  explanation: string;
}

export interface SteelSettingsView {
  commercialLengthsM: readonly string[];
  kerfRebarM: string;
  kerfProfilesM: string;
  minimumUsefulOffcutRebarM: string;
  minimumUsefulOffcutProfilesM: string;
  wasteWarningPctRebar: string;
  wasteCriticalPctRebar: string;
  wasteWarningPctProfiles: string;
  wasteCriticalPctProfiles: string;
  defaultSupplierName: string;
}

export type SteelLineVerification = SteelVerificationStatus;

/**
 * Fila de workspace ya calculada vía el dominio real de F1
 * (`calculateSteelLine` + `evaluateSteelLineAlerts`) a partir de una
 * descripción/línea mock. Ver `domain-bridge.ts`.
 */
export interface SteelWorkspaceLineView {
  id: string;
  elementId: string;
  elementLabel: string;
  family: SteelFamily;
  originalDescription: string;
  interpretation: string;
  barNumberOrProfile: string;
  cutLengthM: DecimalString;
  totalPieces: DecimalString;
  totalMl: DecimalString;
  totalKg: DecimalString;
  commercialUnitsRequired?: DecimalString;
  verificationStatus: SteelVerificationStatus;
  confidenceScore: DecimalString;
  wasteSeverity: 'ok' | 'warning' | 'critical';
  wastePct: DecimalString;
  alerts: readonly SteelLineAlertView[];
  fromParser: boolean;
}

export interface SteelLineAlertView {
  code: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
}
