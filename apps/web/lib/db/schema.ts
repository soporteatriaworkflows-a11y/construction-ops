/**
 * Drizzle schema — Construction Ops.
 *
 * Propiedad: agent-db-rls.
 *
 * Implementa EXACTAMENTE el "Contrato congelado v1" de
 * `docs/DATABASE_SCHEMA.md` (20 entidades de Oleada 1). Los nombres de
 * tabla/columna son `snake_case` y mapean 1:1 a las interfaces
 * `PascalCase` / `camelCase` de `docs/API_CONTRACTS.md`.
 *
 * Reglas del contrato:
 * - PK: `id UUID DEFAULT gen_random_uuid()` en toda tabla.
 * - Dinero/cantidades/porcentajes: `NUMERIC(20,10)` (nunca float). En TS se
 *   serializan como `string` decimal (modo por defecto de Drizzle `numeric`).
 * - Fechas auditables: `TIMESTAMPTZ` (`created_at`/`updated_at` con trigger).
 * - Fechas de calendario: `DATE`.
 * - Enums modelados como TEXT + CHECK (no tipos ENUM nativos).
 * - FK siempre con ON DELETE explícito; índice en cada FK.
 *
 * Las migraciones SQL generadas por drizzle-kit cubren tablas, columnas, FK,
 * uniques e índices. Los triggers `updated_at`, los helpers de RLS y las
 * políticas RLS se mantienen en migraciones SQL dedicadas escritas a mano
 * (drizzle-kit no las genera). Ver `supabase/migrations/` y
 * `supabase/policies/`.
 */
import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ----------------------------------------------------------------------------
 * Helpers de columnas comunes
 * ------------------------------------------------------------------------- */

const pk = () => uuid("id").defaultRandom().primaryKey();

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/** Dinero / cantidad / porcentaje: NUMERIC(20,10), serializado como string. */
const money = (name: string) => numeric(name, { precision: 20, scale: 10 });

/* ----------------------------------------------------------------------------
 * CORE
 * ------------------------------------------------------------------------- */

export const organizations = pgTable(
  "organizations",
  {
    id: pk(),
    name: text("name").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("organizations_name_not_empty", sql`length(trim(${t.name})) > 0`)],
);

export const profiles = pgTable(
  "profiles",
  {
    // PK = auth.users.id; sin defaultRandom porque proviene de Supabase Auth.
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("profiles_organization_id_idx").on(t.organizationId),
    uniqueIndex("profiles_org_email_uq").on(t.organizationId, t.email),
    check(
      "profiles_role_valid",
      sql`${t.role} IN ('admin','gerencia','presupuestos','obra','compras','consulta')`,
    ),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: pk(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    clientReference: text("client_reference"),
    location: text("location"),
    startDate: date("start_date"),
    estimatedEndDate: date("estimated_end_date"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("projects_organization_id_idx").on(t.organizationId),
    uniqueIndex("projects_org_code_uq").on(t.organizationId, t.code),
    check("projects_status_valid", sql`${t.status} IN ('active','archived','closed')`),
  ],
);

export const projectScopes = pgTable(
  "project_scopes",
  {
    id: pk(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentScopeId: uuid("parent_scope_id").references(
      (): AnyPgColumn => projectScopes.id,
      { onDelete: "set null" },
    ),
    code: text("code").notNull(),
    name: text("name").notNull(),
    scopeType: text("scope_type").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("project_scopes_project_id_idx").on(t.projectId),
    index("project_scopes_parent_scope_id_idx").on(t.parentScopeId),
    uniqueIndex("project_scopes_project_code_uq").on(t.projectId, t.code),
    check(
      "project_scopes_scope_type_valid",
      sql`${t.scopeType} IN ('floor','tower','stage','package','unit','modification','other')`,
    ),
    check("project_scopes_status_valid", sql`${t.status} IN ('active','archived')`),
  ],
);

/* ----------------------------------------------------------------------------
 * CATÁLOGO Y PROVEEDORES
 * ------------------------------------------------------------------------- */

export const resources = pgTable(
  "resources",
  {
    id: pk(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    resourceType: text("resource_type").notNull(),
    unit: text("unit").notNull(),
    defaultWastePct: money("default_waste_pct").notNull().default("0"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("resources_organization_id_idx").on(t.organizationId),
    uniqueIndex("resources_org_code_uq").on(t.organizationId, t.code),
    index("resources_org_type_idx").on(t.organizationId, t.resourceType),
    check(
      "resources_resource_type_valid",
      sql`${t.resourceType} IN ('material','labor','equipment','tool','subcontract','other')`,
    ),
    check("resources_default_waste_pct_nonneg", sql`${t.defaultWastePct} >= 0`),
  ],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: pk(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    supplierType: text("supplier_type").notNull().default("vendor"),
    contactData: jsonb("contact_data"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("suppliers_organization_id_idx").on(t.organizationId),
    index("suppliers_org_name_idx").on(t.organizationId, t.name),
    check(
      "suppliers_supplier_type_valid",
      sql`${t.supplierType} IN ('vendor','distributor','manufacturer','subcontractor','other')`,
    ),
  ],
);

export const supplierProducts = pgTable(
  "supplier_products",
  {
    id: pk(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "restrict" }),
    supplierSku: text("supplier_sku"),
    supplierProductName: text("supplier_product_name"),
    productUrl: text("product_url"),
    locationReference: text("location_reference"),
    currency: text("currency").notNull().default("COP"),
    active: boolean("active").notNull().default(true),
    manualOverride: boolean("manual_override").notNull().default(false),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    syncStatus: text("sync_status").notNull().default("manual"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("supplier_products_supplier_id_idx").on(t.supplierId),
    index("supplier_products_resource_id_idx").on(t.resourceId),
    uniqueIndex("supplier_products_supplier_resource_sku_uq").on(
      t.supplierId,
      t.resourceId,
      t.supplierSku,
    ),
    check("supplier_products_currency_iso", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check(
      "supplier_products_sync_status_valid",
      sql`${t.syncStatus} IN ('manual','synced','pending','error')`,
    ),
  ],
);

export const priceObservations = pgTable(
  "price_observations",
  {
    id: pk(),
    supplierProductId: uuid("supplier_product_id")
      .notNull()
      .references(() => supplierProducts.id, { onDelete: "cascade" }),
    observedPrice: money("observed_price").notNull(),
    stockStatus: text("stock_status"),
    sourceType: text("source_type").notNull(),
    sourceReference: text("source_reference"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    approved: boolean("approved").notNull().default(false),
    approvedBy: uuid("approved_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("price_observations_product_observed_idx").on(
      t.supplierProductId,
      t.observedAt.desc(),
    ),
    index("price_observations_source_type_idx").on(t.sourceType),
    check("price_observations_price_nonneg", sql`${t.observedPrice} >= 0`),
    check(
      "price_observations_source_type_valid",
      sql`${t.sourceType} IN ('official_api','official_feed','supplier_csv','manual','public_web','invoice','quotation')`,
    ),
  ],
);

export const pricingRules = pgTable(
  "pricing_rules",
  {
    id: pk(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ruleType: text("rule_type").notNull(),
    percentage: money("percentage"),
    scopeType: text("scope_type").notNull().default("global"),
    scopeReferenceId: uuid("scope_reference_id"),
    active: boolean("active").notNull().default(true),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("pricing_rules_org_rule_type_idx").on(t.organizationId, t.ruleType),
    index("pricing_rules_org_active_idx").on(t.organizationId, t.active),
    check(
      "pricing_rules_rule_type_valid",
      sql`${t.ruleType} IN ('preventive_variation','negotiated_discount','tax','commercial_markup','rounding','manual_adjustment')`,
    ),
    check(
      "pricing_rules_scope_type_valid",
      sql`${t.scopeType} IN ('global','project','scope','resource','supplier_product')`,
    ),
    check(
      "pricing_rules_effective_range_valid",
      sql`${t.effectiveTo} IS NULL OR ${t.effectiveFrom} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`,
    ),
  ],
);

export const laborRoles = pgTable(
  "labor_roles",
  {
    id: pk(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    baseSalary: money("base_salary").notNull(),
    transportSubsidy: money("transport_subsidy").notNull().default("0"),
    benefitsPct: money("benefits_pct").notNull().default("0"),
    socialSecurityPct: money("social_security_pct").notNull().default("0"),
    payrollTaxPct: money("payroll_tax_pct").notNull().default("0"),
    uniformCost: money("uniform_cost").notNull().default("0"),
    uniformPeriodMonths: money("uniform_period_months").notNull().default("12"),
    workingDaysMonth: money("working_days_month").notNull(),
    workingHoursDay: money("working_hours_day").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("labor_roles_org_code_uq").on(t.organizationId, t.code),
    check(
      "labor_roles_pcts_nonneg",
      sql`${t.benefitsPct} >= 0 AND ${t.socialSecurityPct} >= 0 AND ${t.payrollTaxPct} >= 0 AND ${t.transportSubsidy} >= 0 AND ${t.uniformCost} >= 0`,
    ),
    check("labor_roles_working_days_pos", sql`${t.workingDaysMonth} > 0`),
    check("labor_roles_working_hours_pos", sql`${t.workingHoursDay} > 0`),
  ],
);

/* ----------------------------------------------------------------------------
 * APU Y PRESUPUESTO
 * ------------------------------------------------------------------------- */

export const apuTemplates = pgTable(
  "apu_templates",
  {
    id: pk(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    chapterTemplateId: uuid("chapter_template_id"),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("apu_templates_organization_id_idx").on(t.organizationId),
    uniqueIndex("apu_templates_org_code_version_uq").on(
      t.organizationId,
      t.code,
      t.version,
    ),
    check("apu_templates_version_min", sql`${t.version} >= 1`),
  ],
);

export const apuComponents = pgTable(
  "apu_components",
  {
    id: pk(),
    apuTemplateId: uuid("apu_template_id")
      .notNull()
      .references(() => apuTemplates.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id").references(() => resources.id, {
      onDelete: "restrict",
    }),
    componentType: text("component_type").notNull(),
    quantity: money("quantity").notNull(),
    wastePct: money("waste_pct").notNull().default("0"),
    unitPriceSource: text("unit_price_source").notNull(),
    unitPriceSnapshot: money("unit_price_snapshot").notNull(),
    totalComponentCost: money("total_component_cost").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    notes: text("notes"),
  },
  (t) => [
    index("apu_components_template_sort_idx").on(t.apuTemplateId, t.sortOrder),
    index("apu_components_resource_id_idx").on(t.resourceId),
    check(
      "apu_components_component_type_valid",
      sql`${t.componentType} IN ('material','labor','equipment','tool','subcontract','other')`,
    ),
    check(
      "apu_components_unit_price_source_valid",
      sql`${t.unitPriceSource} IN ('resource','labor_role','manual','supplier_product')`,
    ),
    check(
      "apu_components_nonneg",
      sql`${t.quantity} >= 0 AND ${t.wastePct} >= 0 AND ${t.unitPriceSnapshot} >= 0`,
    ),
  ],
);

export const estimates = pgTable(
  "estimates",
  {
    id: pk(),
    projectScopeId: uuid("project_scope_id")
      .notNull()
      .references(() => projectScopes.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("estimates_project_scope_id_idx").on(t.projectScopeId),
    uniqueIndex("estimates_scope_code_uq").on(t.projectScopeId, t.code),
    check("estimates_status_valid", sql`${t.status} IN ('draft','active','archived')`),
  ],
);

export const estimateVersions = pgTable(
  "estimate_versions",
  {
    id: pk(),
    estimateId: uuid("estimate_id")
      .notNull()
      .references(() => estimates.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    status: text("status").notNull().default("draft"),
    createdBy: uuid("created_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    notes: text("notes"),
  },
  (t) => [
    uniqueIndex("estimate_versions_estimate_number_uq").on(
      t.estimateId,
      t.versionNumber,
    ),
    index("estimate_versions_status_idx").on(t.status),
    check(
      "estimate_versions_status_valid",
      sql`${t.status} IN ('draft','review','approved','issued','archived')`,
    ),
    check("estimate_versions_number_min", sql`${t.versionNumber} >= 1`),
  ],
);

export const apuCalculationSnapshots = pgTable(
  "apu_calculation_snapshots",
  {
    id: pk(),
    apuTemplateId: uuid("apu_template_id")
      .notNull()
      .references(() => apuTemplates.id, { onDelete: "restrict" }),
    estimateVersionId: uuid("estimate_version_id")
      .notNull()
      .references(() => estimateVersions.id, { onDelete: "cascade" }),
    calculatedUnitCost: money("calculated_unit_cost").notNull(),
    componentsJson: jsonb("components_json").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("apu_calc_snapshots_template_version_uq").on(
      t.apuTemplateId,
      t.estimateVersionId,
    ),
    check("apu_calc_snapshots_unit_cost_nonneg", sql`${t.calculatedUnitCost} >= 0`),
  ],
);

export const chapters = pgTable(
  "chapters",
  {
    id: pk(),
    estimateVersionId: uuid("estimate_version_id")
      .notNull()
      .references(() => estimateVersions.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("chapters_version_sort_idx").on(t.estimateVersionId, t.sortOrder),
    uniqueIndex("chapters_version_code_uq").on(t.estimateVersionId, t.code),
  ],
);

export const boqItems = pgTable(
  "boq_items",
  {
    id: pk(),
    estimateVersionId: uuid("estimate_version_id")
      .notNull()
      .references(() => estimateVersions.id, { onDelete: "cascade" }),
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    apuTemplateId: uuid("apu_template_id").references(() => apuTemplates.id, {
      onDelete: "set null",
    }),
    // FK a quantity_groups declarada en el config de tabla (foreignKey) por
    // ser referencia hacia adelante (quantityGroups se define más abajo).
    quantityGroupId: uuid("quantity_group_id"),
    code: text("code").notNull(),
    descriptionSnapshot: text("description_snapshot").notNull(),
    unitSnapshot: text("unit_snapshot").notNull(),
    quantitySnapshot: money("quantity_snapshot").notNull(),
    unitPriceSnapshot: money("unit_price_snapshot").notNull(),
    subtotal: money("subtotal").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    notes: text("notes"),
  },
  (t) => [
    index("boq_items_version_idx").on(t.estimateVersionId),
    index("boq_items_chapter_sort_idx").on(t.chapterId, t.sortOrder),
    index("boq_items_apu_template_idx").on(t.apuTemplateId),
    index("boq_items_quantity_group_idx").on(t.quantityGroupId),
    foreignKey({
      name: "boq_items_quantity_group_id_fk",
      columns: [t.quantityGroupId],
      foreignColumns: [quantityGroups.id],
    }).onDelete("set null"),
    check(
      "boq_items_nonneg",
      sql`${t.quantitySnapshot} >= 0 AND ${t.unitPriceSnapshot} >= 0 AND ${t.subtotal} >= 0`,
    ),
  ],
);

export const indirectCostRules = pgTable(
  "indirect_cost_rules",
  {
    id: pk(),
    estimateVersionId: uuid("estimate_version_id")
      .notNull()
      .references(() => estimateVersions.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    percentage: money("percentage").notNull(),
    baseType: text("base_type").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    visibleToClient: boolean("visible_to_client").notNull().default(true),
  },
  (t) => [
    index("indirect_cost_rules_version_sort_idx").on(
      t.estimateVersionId,
      t.sortOrder,
    ),
    uniqueIndex("indirect_cost_rules_version_code_uq").on(
      t.estimateVersionId,
      t.code,
    ),
    check("indirect_cost_rules_pct_nonneg", sql`${t.percentage} >= 0`),
    check(
      "indirect_cost_rules_base_type_valid",
      sql`${t.baseType} IN ('direct_cost','utility','custom')`,
    ),
  ],
);

/* ----------------------------------------------------------------------------
 * CANTIDADES
 * ------------------------------------------------------------------------- */

export const quantityGroups = pgTable(
  "quantity_groups",
  {
    id: pk(),
    projectScopeId: uuid("project_scope_id")
      .notNull()
      .references(() => projectScopes.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    calculationMode: text("calculation_mode").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("quantity_groups_project_scope_id_idx").on(t.projectScopeId),
    uniqueIndex("quantity_groups_scope_code_uq").on(t.projectScopeId, t.code),
    check(
      "quantity_groups_calculation_mode_valid",
      sql`${t.calculationMode} IN ('direct','length','area','volume','custom')`,
    ),
  ],
);

export const quantityLines = pgTable(
  "quantity_lines",
  {
    id: pk(),
    quantityGroupId: uuid("quantity_group_id")
      .notNull()
      .references(() => quantityGroups.id, { onDelete: "cascade" }),
    description: text("description"),
    length: money("length"),
    width: money("width"),
    height: money("height"),
    multiplier: money("multiplier").notNull().default("1"),
    directQuantity: money("direct_quantity"),
    formulaType: text("formula_type").notNull(),
    calculatedQuantity: money("calculated_quantity").notNull(),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("quantity_lines_group_sort_idx").on(t.quantityGroupId, t.sortOrder),
    check(
      "quantity_lines_formula_type_valid",
      sql`${t.formulaType} IN ('direct','length','area','volume','custom')`,
    ),
    check("quantity_lines_multiplier_nonneg", sql`${t.multiplier} >= 0`),
  ],
);

/* ----------------------------------------------------------------------------
 * Tipos inferidos (select / insert) — espejo de las interfaces públicas.
 * ------------------------------------------------------------------------- */

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectScope = typeof projectScopes.$inferSelect;
export type NewProjectScope = typeof projectScopes.$inferInsert;
export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;
export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;
export type SupplierProduct = typeof supplierProducts.$inferSelect;
export type NewSupplierProduct = typeof supplierProducts.$inferInsert;
export type PriceObservation = typeof priceObservations.$inferSelect;
export type NewPriceObservation = typeof priceObservations.$inferInsert;
export type PricingRule = typeof pricingRules.$inferSelect;
export type NewPricingRule = typeof pricingRules.$inferInsert;
export type LaborRole = typeof laborRoles.$inferSelect;
export type NewLaborRole = typeof laborRoles.$inferInsert;
export type ApuTemplate = typeof apuTemplates.$inferSelect;
export type NewApuTemplate = typeof apuTemplates.$inferInsert;
export type ApuComponent = typeof apuComponents.$inferSelect;
export type NewApuComponent = typeof apuComponents.$inferInsert;
export type ApuCalculationSnapshot = typeof apuCalculationSnapshots.$inferSelect;
export type NewApuCalculationSnapshot = typeof apuCalculationSnapshots.$inferInsert;
export type Estimate = typeof estimates.$inferSelect;
export type NewEstimate = typeof estimates.$inferInsert;
export type EstimateVersion = typeof estimateVersions.$inferSelect;
export type NewEstimateVersion = typeof estimateVersions.$inferInsert;
export type Chapter = typeof chapters.$inferSelect;
export type NewChapter = typeof chapters.$inferInsert;
export type BoqItem = typeof boqItems.$inferSelect;
export type NewBoqItem = typeof boqItems.$inferInsert;
export type IndirectCostRule = typeof indirectCostRules.$inferSelect;
export type NewIndirectCostRule = typeof indirectCostRules.$inferInsert;
export type QuantityGroup = typeof quantityGroups.$inferSelect;
export type NewQuantityGroup = typeof quantityGroups.$inferInsert;
export type QuantityLine = typeof quantityLines.$inferSelect;
export type NewQuantityLine = typeof quantityLines.$inferInsert;
