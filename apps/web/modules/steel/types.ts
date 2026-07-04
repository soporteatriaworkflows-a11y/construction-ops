import type { DecimalString } from '@/lib/utils/types';

export type SteelFamily = 'rebar' | 'structural_steel' | 'mesh' | 'accessory' | 'other';
export type SteelShape = 'straight' | 'stirrup' | 'hook' | 'lap' | 'mesh_panel' | 'profile_piece' | 'plate_piece' | 'other';
export type SteelTreatment = 'none' | 'galvanized' | 'painted' | 'anticorrosive' | 'epoxy';
export type SteelPurchaseUnit = 'unit' | 'ml' | 'kg' | 'ton' | 'bundle' | 'sheet' | 'piece';
export type SteelWasteMode = 'assumed' | 'by_cut' | 'optimized';
export type SteelOffcutStatus = 'available' | 'suggested' | 'assigned' | 'discarded' | 'final_waste';
export type SteelVerificationStatus = 'unreviewed' | 'auto_ok' | 'needs_review' | 'confirmed' | 'edited' | 'rejected';
export type SteelAlertSeverity = 'critical' | 'warning' | 'info';

export interface SteelSpec {
  id: string;
  family: SteelFamily;
  name: string;
  commercialName: string;
  technicalReference: string;
  barNumber?: number;
  profileReference?: string;
  diameterMm?: DecimalString;
  unitWeightKgM?: DecimalString;
  unitWeightKgUnit?: DecimalString;
  commercialLengthsM: readonly DecimalString[];
  purchaseUnit: SteelPurchaseUnit;
  treatment: SteelTreatment;
  isDefaultReference: boolean;
  notes: string;
}

export interface SteelParseOptions {
  defaultUnit?: 'cm' | 'm';
}

export interface SteelParsedDescription {
  originalDescription: string;
  steelFamily: SteelFamily;
  steelShape: SteelShape;
  barNumber?: number;
  quantityPerUnit: DecimalString;
  repetitions: DecimalString;
  cutLengthM?: DecimalString;
  lengthSource?: 'encoded_cm' | 'explicit_m' | 'explicit_cm' | 'segmented_length' | 'unknown';
  bendSegmentsM?: readonly DecimalString[];
  spacingCm?: DecimalString;
  confidenceScore: DecimalString;
  needsReview: boolean;
  explanation: string;
}

export interface SteelLineInput {
  id: string;
  originalDescription: string;
  steelFamily: SteelFamily;
  steelShape: SteelShape;
  barNumber?: number;
  profileReference?: string;
  treatment?: SteelTreatment;
  cutLengthM?: DecimalString;
  quantityPerUnit: DecimalString;
  repetitions: DecimalString;
  spacingCm?: DecimalString;
  spacingSpanM?: DecimalString;
  unitWeightKgMSnapshot?: DecimalString;
  unitPriceSnapshot?: DecimalString;
  currency?: string;
  wasteMode?: SteelWasteMode;
  assumedWastePct?: DecimalString;
  commercialLengthM?: DecimalString;
  steelSpecId?: string;
  catalogResourceId?: string;
  supplierId?: string;
  verificationStatus?: SteelVerificationStatus;
  confidenceScore?: DecimalString;
}

export interface SteelCalculatedLine extends SteelLineInput {
  totalMl: DecimalString;
  totalKg: DecimalString;
  commercialUnitsRequired?: DecimalString;
  estimatedCost?: DecimalString;
  estimatedWasteMl?: DecimalString;
}

export interface SteelWasteThreshold {
  warningPct: DecimalString;
  criticalPct: DecimalString;
}

export interface SteelWasteThresholds {
  rebar: SteelWasteThreshold;
  structuralSteel: SteelWasteThreshold;
}

export interface SteelAlert {
  code: 'A1' | 'A3' | 'A4' | 'A6' | 'A9' | 'A10' | 'A13' | 'A17' | 'A18';
  severity: SteelAlertSeverity;
  message: string;
  entityId: string;
}

export interface SteelCutInput {
  id: string;
  lengthM: DecimalString;
  quantity: DecimalString;
  steelSpecId: string;
  steelFamily: SteelFamily;
  barNumber?: number;
  profileReference?: string;
  treatment: SteelTreatment;
}

export interface SteelOffcut {
  id: string;
  steelSpecId: string;
  lengthM: DecimalString;
  status: SteelOffcutStatus;
  sourceCutPlanBarId?: string;
  assignedToCutId?: string;
}

export interface SteelCutAssignment {
  cutId: string;
  lengthM: DecimalString;
  reason: string;
}

export interface SteelCutPlanBar {
  id: string;
  steelSpecId: string;
  commercialLengthM: DecimalString;
  assignments: readonly SteelCutAssignment[];
  remainingLengthM: DecimalString;
  offcutStatus: SteelOffcutStatus;
}

export interface SteelCutPlan {
  bars: readonly SteelCutPlanBar[];
  offcuts: readonly SteelOffcut[];
  rejectedCuts: readonly { cutId: string; reason: string }[];
  totalWasteM: DecimalString;
}

export interface SteelCutOptimizerOptions {
  commercialLengthsM: readonly DecimalString[];
  kerfM?: DecimalString;
  minimumUsefulOffcutM?: DecimalString;
}

