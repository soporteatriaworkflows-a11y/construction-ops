/**
 * db-repository.ts — Acceso a datos del importador APU
 * (ENTRE_PATIOS_APU_IMPORT_V1). Propiedad: agent-orchestrator.
 *
 * Reglas:
 *  - Cliente RLS-bound (`createClient()`). NUNCA service-role.
 *  - organization_id / imported_by SIEMPRE server-side (RLS los exige).
 *  - La escritura del lote es ATÓMICA vía RPC `import_apu_batch`
 *    (SECURITY INVOKER: la RLS aplica a cada INSERT/UPDATE).
 *  - Carrera de unicidad en labor_roles (23505) ⇒ sufijo de código, nunca
 *    sobrescritura.
 */
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Uuid, DecimalString } from '@/lib/utils/types';
import type { AuthenticatedViewer } from '@/server/auth/types';
import type { LaborRoleFactors } from '@/modules/apu/labor';
import type { ResourceIdentifier } from '@/server/catalog/import/price-list';
import { DbCatalogImportRepository } from '@/server/catalog/import';
import type { LinkableVersionOption } from '@/lib/apu-import/types';
import type { BoqCandidateItem, ExistingLaborRole } from './preview';
import { ApuLinkVersionInvalidError } from './errors';

const PAGE_SIZE = 1000;
const IN_CHUNK = 200;
const EDITABLE_STATUSES = ['draft', 'review'] as const;

interface LaborRoleRow {
  id: string;
  code: string;
  name: string;
  base_salary: number | string;
  transport_subsidy: number | string;
  benefits_pct: number | string;
  social_security_pct: number | string;
  payroll_tax_pct: number | string;
  uniform_cost: number | string;
  uniform_period_months: number | string;
  working_days_month: number | string;
  working_hours_day: number | string;
}

/** Payload de la RPC import_apu_batch (contrato §6.3). */
export interface ApuBatchRpcPayload {
  batch: {
    digestSha256: string;
    sourceFilename: string;
    sourceSheet: string;
    totalActivities: number;
    totalComponents: number;
    unresolvedCount: number;
    warningCount: number;
    metadata: Record<string, unknown>;
  };
  templates: Array<{
    code: string;
    name: string;
    unit: string;
    description: string | null;
    defaultToolPct: DecimalString;
    sourceRow: number;
    sourceOccurrenceIndex: number;
    components: Array<{
      componentType: string;
      resourceId: Uuid | null;
      laborRoleId: Uuid | null;
      quantity: DecimalString;
      wastePct: DecimalString;
      unitPriceSource: string;
      unitPriceSnapshot: DecimalString;
      sortOrder: number;
      notes: string | null;
      sourceRow: number;
      sourceOccurrenceIndex: number;
      rawCode: string | null;
      rawUnit: string | null;
    }>;
  }>;
  versionId: Uuid | null;
  links: Array<{ templateCode: string; boqItemId: Uuid }>;
}

/** Resultado crudo de la RPC. */
export interface ApuBatchRpcResult {
  duplicate: boolean;
  batchId: Uuid;
  importedActivities: number;
  importedComponents: number;
  linkedBoqItems: number;
  skippedExisting: number;
  skippedCodes?: string[];
  templateIds?: Record<string, string>;
  linkedItems?: Array<{ templateCode: string; boqItemId: string }>;
}

export class DbApuImportRepository {
  readonly source = 'db' as const;

  private readonly clientFactory: () => Promise<SupabaseClient>;
  private readonly catalogRepo: DbCatalogImportRepository;

  constructor(clientFactory: () => Promise<SupabaseClient> = createClient) {
    this.clientFactory = clientFactory;
    this.catalogRepo = new DbCatalogImportRepository(clientFactory);
  }

  /** Identidades de recursos de la org (reusa el repositorio del catálogo). */
  async listResourceIdentifiers(viewer: AuthenticatedViewer): Promise<ResourceIdentifier[]> {
    return this.catalogRepo.listResourceIdentifiers(viewer);
  }

  /** Roles laborales activos de la organización (factores para recalcular). */
  async listLaborRoles(viewer: AuthenticatedViewer): Promise<ExistingLaborRole[]> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('labor_roles')
      .select(
        'id, code, name, base_salary, transport_subsidy, benefits_pct, social_security_pct, payroll_tax_pct, uniform_cost, uniform_period_months, working_days_month, working_hours_day',
      )
      .eq('organization_id', viewer.organizationId)
      .eq('active', true)
      .order('code', { ascending: true });
    if (error) throw new Error(`labor_roles_list_failed: ${error.code ?? 'unknown'}`);
    return ((data ?? []) as LaborRoleRow[]).map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      factors: {
        baseSalary: String(r.base_salary),
        transportSubsidy: String(r.transport_subsidy),
        benefitsPct: String(r.benefits_pct),
        socialSecurityPct: String(r.social_security_pct),
        payrollTaxPct: String(r.payroll_tax_pct),
        uniformCost: String(r.uniform_cost),
        uniformPeriodMonths: String(r.uniform_period_months),
        workingDaysMonth: String(r.working_days_month),
        workingHoursDay: String(r.working_hours_day),
      } satisfies LaborRoleFactors,
    }));
  }

  /** Códigos de plantillas APU existentes (org, version=1) — anti sobrescritura. */
  async listExistingApuCodes(viewer: AuthenticatedViewer): Promise<Set<string>> {
    const supabase = await this.clientFactory();
    const codes = new Set<string>();
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('apu_templates')
        .select('code')
        .eq('organization_id', viewer.organizationId)
        .eq('version', 1)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`apu_codes_list_failed: ${error.code ?? 'unknown'}`);
      const rows = (data ?? []) as Array<{ code: string }>;
      for (const r of rows) codes.add(r.code);
      if (rows.length < PAGE_SIZE) break;
    }
    return codes;
  }

  /**
   * Último precio baseline APROBADO por recurso (comparación en preview;
   * NUNCA se aprueba/modifica nada desde el importador).
   */
  async getApprovedBaselinePrices(
    viewer: AuthenticatedViewer,
    resourceIds: ReadonlyArray<Uuid>,
  ): Promise<Map<Uuid, DecimalString>> {
    const result = new Map<Uuid, DecimalString>();
    if (resourceIds.length === 0) return result;
    const supabase = await this.clientFactory();
    for (let i = 0; i < resourceIds.length; i += IN_CHUNK) {
      const chunk = resourceIds.slice(i, i + IN_CHUNK);
      const { data, error } = await supabase
        .from('resource_price_observations')
        .select('resource_id, observed_price, approved_at, created_at')
        .eq('organization_id', viewer.organizationId)
        .eq('status', 'approved')
        .in('resource_id', chunk)
        .order('approved_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw new Error(`baseline_prices_failed: ${error.code ?? 'unknown'}`);
      for (const row of (data ?? []) as Array<{
        resource_id: string;
        observed_price: number | string;
      }>) {
        if (!result.has(row.resource_id)) {
          result.set(row.resource_id, String(row.observed_price));
        }
      }
    }
    return result;
  }

  /** Versiones EDITABLES (draft|review) candidatas para vinculación BOQ. */
  async listLinkableVersions(viewer: AuthenticatedViewer): Promise<LinkableVersionOption[]> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('estimate_versions')
      .select('id, status, version_number, estimates(code, name)')
      .in('status', [...EDITABLE_STATUSES])
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(`linkable_versions_failed: ${error.code ?? 'unknown'}`);

    const options: LinkableVersionOption[] = [];
    for (const row of (data ?? []) as Array<{
      id: string;
      status: string;
      version_number: number;
      estimates: { code: string; name: string } | { code: string; name: string }[] | null;
    }>) {
      const estimate = Array.isArray(row.estimates) ? row.estimates[0] : row.estimates;
      const { count: itemCount, error: countError } = await supabase
        .from('boq_items')
        .select('id', { count: 'exact', head: true })
        .eq('estimate_version_id', row.id)
        .is('archived_at', null);
      if (countError) throw new Error(`linkable_versions_failed: ${countError.code ?? 'unknown'}`);
      const { count: unlinkedCount, error: unlinkedError } = await supabase
        .from('boq_items')
        .select('id', { count: 'exact', head: true })
        .eq('estimate_version_id', row.id)
        .is('archived_at', null)
        .is('apu_template_id', null);
      if (unlinkedError) {
        throw new Error(`linkable_versions_failed: ${unlinkedError.code ?? 'unknown'}`);
      }
      options.push({
        versionId: row.id,
        label: `${estimate?.name ?? 'Presupuesto'} — V${String(row.version_number).padStart(2, '0')}`,
        status: row.status,
        itemCount: itemCount ?? 0,
        unlinkedCount: unlinkedCount ?? 0,
      });
    }
    return options;
  }

  /**
   * Ítems BOQ candidatos de la versión objetivo (no archivados). Valida que la
   * versión exista (visible por RLS) y sea EDITABLE.
   */
  async listBoqCandidates(
    viewer: AuthenticatedViewer,
    versionId: Uuid,
  ): Promise<BoqCandidateItem[]> {
    const supabase = await this.clientFactory();
    const { data: version, error: versionError } = await supabase
      .from('estimate_versions')
      .select('id, status')
      .eq('id', versionId)
      .maybeSingle();
    if (versionError) throw new Error(`link_version_failed: ${versionError.code ?? 'unknown'}`);
    if (!version) throw new ApuLinkVersionInvalidError();
    if (!(EDITABLE_STATUSES as readonly string[]).includes((version as { status: string }).status)) {
      throw new ApuLinkVersionInvalidError(
        'La versión seleccionada está emitida/aprobada/archivada; el vínculo APU solo aplica a versiones editables.',
      );
    }

    const items: BoqCandidateItem[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('boq_items')
        .select('id, code, description_snapshot, unit_snapshot, apu_template_id')
        .eq('estimate_version_id', versionId)
        .is('archived_at', null)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`boq_candidates_failed: ${error.code ?? 'unknown'}`);
      const rows = (data ?? []) as Array<{
        id: string;
        code: string;
        description_snapshot: string;
        unit_snapshot: string;
        apu_template_id: string | null;
      }>;
      for (const r of rows) {
        items.push({
          id: r.id,
          code: r.code,
          description: r.description_snapshot,
          unit: r.unit_snapshot,
          apuTemplateId: r.apu_template_id,
        });
      }
      if (rows.length < PAGE_SIZE) break;
    }
    return items;
  }

  /**
   * Crea los roles laborales faltantes (Oficial/Ayudante) con factores
   * derivados de la hoja. Colisión de código (23505) ⇒ sufijo `-2`…`-5`;
   * JAMÁS update de roles existentes.
   */
  async createLaborRole(
    viewer: AuthenticatedViewer,
    input: { codeBase: string; name: string; factors: LaborRoleFactors },
  ): Promise<Uuid> {
    const supabase = await this.clientFactory();
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = attempt === 0 ? input.codeBase : `${input.codeBase}-${attempt + 1}`;
      const { data, error } = await supabase
        .from('labor_roles')
        .insert({
          organization_id: viewer.organizationId,
          code,
          name: input.name,
          base_salary: input.factors.baseSalary,
          transport_subsidy: input.factors.transportSubsidy,
          benefits_pct: input.factors.benefitsPct,
          social_security_pct: input.factors.socialSecurityPct,
          payroll_tax_pct: input.factors.payrollTaxPct,
          uniform_cost: input.factors.uniformCost,
          uniform_period_months: input.factors.uniformPeriodMonths,
          working_days_month: input.factors.workingDaysMonth,
          working_hours_day: input.factors.workingHoursDay,
          active: true,
        })
        .select('id')
        .single();
      if (!error && data) return (data as { id: string }).id;
      if (error && error.code !== '23505') {
        throw new Error(`labor_role_create_failed: ${error.code ?? 'unknown'}`);
      }
    }
    throw new Error('labor_role_create_failed: code_collision');
  }

  /** Ejecuta la RPC atómica de importación (RLS-bound, SECURITY INVOKER). */
  async importBatch(
    _viewer: AuthenticatedViewer,
    payload: ApuBatchRpcPayload,
  ): Promise<ApuBatchRpcResult> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase.rpc('import_apu_batch', {
      p_batch: payload.batch,
      p_templates: payload.templates,
      p_version_id: payload.versionId,
      p_links: payload.links,
    });
    if (error) throw new Error(`apu_import_rpc_failed: ${error.code ?? error.message}`);
    return data as ApuBatchRpcResult;
  }
}
