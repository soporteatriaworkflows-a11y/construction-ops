/**
 * Tipos públicos — espejo del contrato congelado v1 (docs/API_CONTRACTS.md).
 * NO modificar directamente; cambios solo vía docs/INTEGRATION_REQUESTS.md.
 * Propiedad: agent-frontend-boq (consumidor), agent-orchestrator (dueño del contrato).
 */

// ---------------------------------------------------------------------------
// Alias de tipos base
// ---------------------------------------------------------------------------

/** UUID serializado. */
export type Uuid = string;

/** Fecha/hora ISO 8601 con zona, p. ej. "2026-05-29T10:00:00-05:00". */
export type IsoDateTime = string;

/** Fecha de calendario ISO 8601, p. ej. "2026-05-29". */
export type IsoDate = string;

/**
 * Valor decimal serializado como string (dinero, cantidades, porcentajes).
 * NUNCA number. Ej. "336084479.9369073500". Se opera con Decimal.js.
 */
export type DecimalString = string;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type UserRole =
  | 'admin'
  | 'gerencia'
  | 'presupuestos'
  | 'obra'
  | 'compras'
  | 'consulta';

export type ProjectStatus = 'active' | 'archived' | 'closed';

export type ScopeType =
  | 'floor'
  | 'tower'
  | 'stage'
  | 'package'
  | 'unit'
  | 'modification'
  | 'other';

export type ScopeStatus = 'active' | 'archived';

export type ResourceType =
  | 'material'
  | 'labor'
  | 'equipment'
  | 'tool'
  | 'subcontract'
  | 'other';

export type SupplierType =
  | 'vendor'
  | 'distributor'
  | 'manufacturer'
  | 'subcontractor'
  | 'other';

export type SyncStatus = 'manual' | 'synced' | 'pending' | 'error';

export type PriceSourceType =
  | 'official_api'
  | 'official_feed'
  | 'supplier_csv'
  | 'manual'
  | 'public_web'
  | 'invoice'
  | 'quotation';

export type PricingRuleType =
  | 'preventive_variation'
  | 'negotiated_discount'
  | 'tax'
  | 'commercial_markup'
  | 'rounding'
  | 'manual_adjustment';

export type PricingRuleScopeType =
  | 'global'
  | 'project'
  | 'scope'
  | 'resource'
  | 'supplier_product';

export type ApuComponentType =
  | 'material'
  | 'labor'
  | 'equipment'
  | 'tool'
  | 'subcontract'
  | 'other';

export type UnitPriceSource =
  | 'resource'
  | 'labor_role'
  | 'manual'
  | 'supplier_product';

export type EstimateStatus = 'draft' | 'active' | 'archived';

export type EstimateVersionStatus =
  | 'draft'
  | 'review'
  | 'approved'
  | 'issued'
  | 'archived';

export type IndirectCostBaseType = 'direct_cost' | 'utility' | 'custom';

export type CalculationMode =
  | 'direct'
  | 'length'
  | 'area'
  | 'volume'
  | 'custom';

export type QuantityFormulaType =
  | 'direct'
  | 'length'
  | 'area'
  | 'volume'
  | 'custom';

// ---------------------------------------------------------------------------
// Interfaces congeladas v1
// ---------------------------------------------------------------------------

export interface Organization {
  id: Uuid;
  name: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Profile {
  id: Uuid;
  organizationId: Uuid;
  fullName: string;
  /** @internal no mostrar en vistas cliente */
  email: string;
  /** @internal no mostrar en vistas cliente */
  role: UserRole;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Project {
  id: Uuid;
  organizationId: Uuid;
  /** cliente-safe */
  code: string;
  /** cliente-safe */
  name: string;
  status: ProjectStatus;
  /** @internal */
  clientReference?: string | null;
  location?: string | null;
  startDate?: IsoDate | null;
  estimatedEndDate?: IsoDate | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ProjectScope {
  id: Uuid;
  projectId: Uuid;
  parentScopeId?: Uuid | null;
  /** cliente-safe */
  code: string;
  /** cliente-safe */
  name: string;
  scopeType: ScopeType;
  status: ScopeStatus;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Resource {
  id: Uuid;
  organizationId: Uuid;
  code: string;
  name: string;
  resourceType: ResourceType;
  unit: string;
  defaultWastePct: DecimalString;
  active: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Supplier {
  id: Uuid;
  organizationId: Uuid;
  /** @internal context-dependent */
  name: string;
  supplierType: SupplierType;
  /** @internal */
  contactData?: Record<string, unknown> | null;
  active: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface SupplierProduct {
  id: Uuid;
  supplierId: Uuid;
  resourceId: Uuid;
  /** @internal */
  supplierSku?: string | null;
  supplierProductName?: string | null;
  /** @internal */
  productUrl?: string | null;
  /** @internal */
  locationReference?: string | null;
  currency: string;
  active: boolean;
  manualOverride: boolean;
  lastCheckedAt?: IsoDateTime | null;
  syncStatus: SyncStatus;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface PriceObservation {
  id: Uuid;
  supplierProductId: Uuid;
  /** @internal */
  observedPrice: DecimalString;
  stockStatus?: string | null;
  sourceType: PriceSourceType;
  sourceReference?: string | null;
  observedAt: IsoDateTime;
  approved: boolean;
  approvedBy?: Uuid | null;
  /** @internal */
  notes?: string | null;
  createdAt: IsoDateTime;
}

export interface PricingRule {
  id: Uuid;
  organizationId: Uuid;
  name: string;
  ruleType: PricingRuleType;
  /** @internal when ruleType='negotiated_discount' */
  percentage?: DecimalString | null;
  scopeType: PricingRuleScopeType;
  scopeReferenceId?: Uuid | null;
  active: boolean;
  effectiveFrom?: IsoDateTime | null;
  effectiveTo?: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface LaborRole {
  id: Uuid;
  organizationId: Uuid;
  code: string;
  name: string;
  /** @internal */
  baseSalary: DecimalString;
  /** @internal */
  transportSubsidy: DecimalString;
  /** @internal */
  benefitsPct: DecimalString;
  /** @internal */
  socialSecurityPct: DecimalString;
  /** @internal */
  payrollTaxPct: DecimalString;
  /** @internal */
  uniformCost: DecimalString;
  uniformPeriodMonths: DecimalString;
  workingDaysMonth: DecimalString;
  workingHoursDay: DecimalString;
  active: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ApuTemplate {
  id: Uuid;
  organizationId: Uuid;
  code: string;
  name: string;
  unit: string;
  chapterTemplateId?: Uuid | null;
  description?: string | null;
  active: boolean;
  version: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ApuComponent {
  id: Uuid;
  apuTemplateId: Uuid;
  resourceId?: Uuid | null;
  componentType: ApuComponentType;
  quantity: DecimalString;
  wastePct: DecimalString;
  unitPriceSource: UnitPriceSource;
  unitPriceSnapshot: DecimalString;
  totalComponentCost: DecimalString;
  sortOrder: number;
  notes?: string | null;
}

export interface ApuCalculationSnapshot {
  id: Uuid;
  apuTemplateId: Uuid;
  estimateVersionId: Uuid;
  calculatedUnitCost: DecimalString;
  componentsJson: ApuComponent[];
  createdAt: IsoDateTime;
}

export interface Estimate {
  id: Uuid;
  projectScopeId: Uuid;
  code: string;
  name: string;
  status: EstimateStatus;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface EstimateVersion {
  id: Uuid;
  estimateId: Uuid;
  versionNumber: number;
  status: EstimateVersionStatus;
  createdBy?: Uuid | null;
  createdAt: IsoDateTime;
  approvedAt?: IsoDateTime | null;
  notes?: string | null;
}

export interface Chapter {
  id: Uuid;
  estimateVersionId: Uuid;
  /** cliente-safe */
  code: string;
  /** cliente-safe */
  name: string;
  sortOrder: number;
}

export interface BoqItem {
  id: Uuid;
  estimateVersionId: Uuid;
  chapterId: Uuid;
  apuTemplateId?: Uuid | null;
  quantityGroupId?: Uuid | null;
  /** cliente-safe */
  code: string;
  /** cliente-safe */
  descriptionSnapshot: string;
  /** cliente-safe */
  unitSnapshot: string;
  /** cliente-safe */
  quantitySnapshot: DecimalString;
  /** cliente-safe — precio presupuestado */
  unitPriceSnapshot: DecimalString;
  /** cliente-safe — = quantitySnapshot x unitPriceSnapshot */
  subtotal: DecimalString;
  sortOrder: number;
  notes?: string | null;
}

export interface IndirectCostRule {
  id: Uuid;
  estimateVersionId: Uuid;
  /** cliente-safe */
  code: string;
  /** cliente-safe */
  name: string;
  /** cliente-safe if visibleToClient; @internal otherwise */
  percentage: DecimalString;
  baseType: IndirectCostBaseType;
  sortOrder: number;
  visibleToClient: boolean;
}

export interface QuantityGroup {
  id: Uuid;
  projectScopeId: Uuid;
  code: string;
  name: string;
  unit: string;
  calculationMode: CalculationMode;
  createdAt: IsoDateTime;
}

export interface QuantityLine {
  id: Uuid;
  quantityGroupId: Uuid;
  description?: string | null;
  length?: DecimalString | null;
  width?: DecimalString | null;
  height?: DecimalString | null;
  multiplier: DecimalString;
  directQuantity?: DecimalString | null;
  formulaType: QuantityFormulaType;
  /** resultado calculado por dominio — NO recalcular en frontend */
  calculatedQuantity: DecimalString;
  notes?: string | null;
  sortOrder: number;
}
