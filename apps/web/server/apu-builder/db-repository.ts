/**
 * db-repository.ts — Acceso a datos del constructor manual de APU + BOQ-add.
 *
 * Reglas:
 *  - Cliente RLS-bound (`createClient()`). NUNCA service-role.
 *  - organization_id / created_by / actor SIEMPRE server-side (RLS los exige).
 *  - Las escrituras son ATÓMICAS vía RPC `create_manual_apu` / `add_apu_to_boq`
 *    (SECURITY INVOKER: la RLS aplica a cada INSERT).
 *  - El precio de material lo re-resuelve el RPC; el costo de M.O. lo calcula el
 *    dominio canónico (`calculateLaborCost`) aquí, server-side.
 */
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DecimalString, Uuid } from '@/lib/utils/types';
import type { AuthenticatedViewer } from '@/server/auth/types';
import { calculateLaborCost, type LaborRoleFactors } from '@/modules/apu/labor';
import type {
  ApuBuilderData,
  LaborRoleOption,
  MaterialOption,
} from '@/lib/apu-builder/types';

/** Payload de un componente para la RPC `create_manual_apu`. */
export interface ManualApuComponentPayload {
  componentType: 'material' | 'labor';
  resourceId?: Uuid;
  laborRoleId?: Uuid;
  quantity: DecimalString;
  wastePct: DecimalString;
  /** Solo M.O.: costo diario integral (dominio). Material lo resuelve el RPC. */
  unitPriceSnapshot?: DecimalString;
  notes?: string;
}

/** Payload completo de la RPC `create_manual_apu`. */
export interface ManualApuPayload {
  header: {
    code: string;
    name: string;
    unit: string;
    defaultToolPct: DecimalString;
    description?: string;
  };
  components: ManualApuComponentPayload[];
  idempotencyKey?: string;
}

interface ResourceRow {
  id: string;
  code: string;
  name: string;
  resource_type: string;
  unit: string;
}

interface ObservationRow {
  resource_id: string;
  observed_price: string;
  approved_at: string | null;
  created_at: string;
}

interface LaborRoleRow {
  id: string;
  code: string;
  name: string;
  base_salary: string;
  transport_subsidy: string;
  benefits_pct: string;
  social_security_pct: string;
  payroll_tax_pct: string;
  uniform_cost: string;
  uniform_period_months: string;
  working_days_month: string;
  working_hours_day: string;
}

export class DbApuBuilderRepository {
  private readonly clientFactory: () => Promise<SupabaseClient>;

  constructor(clientFactory: () => Promise<SupabaseClient> = createClient) {
    this.clientFactory = clientFactory;
  }

  /** Materiales + roles de M.O. para poblar el formulario (todo de la org, RLS). */
  async loadBuilderData(_viewer: AuthenticatedViewer): Promise<ApuBuilderData> {
    const supabase = await this.clientFactory();

    const [{ data: resources, error: rErr }, { data: obs, error: oErr }, { data: roles, error: lErr }] =
      await Promise.all([
        supabase
          .from('resources')
          .select('id, code, name, resource_type, unit')
          .order('code', { ascending: true }),
        supabase
          .from('resource_price_observations')
          .select('resource_id, observed_price, approved_at, created_at')
          .eq('status', 'approved'),
        supabase
          .from('labor_roles')
          .select(
            'id, code, name, base_salary, transport_subsidy, benefits_pct, social_security_pct, payroll_tax_pct, uniform_cost, uniform_period_months, working_days_month, working_hours_day',
          )
          .eq('active', true)
          .order('code', { ascending: true }),
      ]);

    if (rErr) throw new Error(`builder_resources_read_failed: ${rErr.code ?? 'unknown'}`);
    if (oErr) throw new Error(`builder_observations_read_failed: ${oErr.code ?? 'unknown'}`);
    if (lErr) throw new Error(`builder_labor_roles_read_failed: ${lErr.code ?? 'unknown'}`);

    // Último precio aprobado por recurso (approved_at desc, luego created_at desc).
    const latestPrice = new Map<string, ObservationRow>();
    for (const row of (obs ?? []) as ObservationRow[]) {
      const prev = latestPrice.get(row.resource_id);
      if (!prev || compareObservation(row, prev) > 0) {
        latestPrice.set(row.resource_id, row);
      }
    }

    const materials: MaterialOption[] = ((resources ?? []) as ResourceRow[]).map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      unit: r.unit,
      resourceType: r.resource_type as MaterialOption['resourceType'],
      approvedPrice: latestPrice.get(r.id)?.observed_price ?? null,
    }));

    const laborRoles: LaborRoleOption[] = ((roles ?? []) as LaborRoleRow[]).map((r) => {
      const factors: LaborRoleFactors = {
        baseSalary: r.base_salary,
        transportSubsidy: r.transport_subsidy,
        benefitsPct: r.benefits_pct,
        socialSecurityPct: r.social_security_pct,
        payrollTaxPct: r.payroll_tax_pct,
        uniformCost: r.uniform_cost,
        uniformPeriodMonths: r.uniform_period_months,
        workingDaysMonth: r.working_days_month,
        workingHoursDay: r.working_hours_day,
      };
      const cost = calculateLaborCost(factors);
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        dailyIntegralCost: cost.dailyIntegralCost,
        hourlyIntegralCost: cost.hourlyIntegralCost,
      };
    });

    return { materials, laborRoles };
  }

  /** Costo diario integral de un rol (server-side) para snapshot de M.O. */
  async getLaborDailyCost(_viewer: AuthenticatedViewer, laborRoleId: Uuid): Promise<DecimalString | null> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('labor_roles')
      .select(
        'base_salary, transport_subsidy, benefits_pct, social_security_pct, payroll_tax_pct, uniform_cost, uniform_period_months, working_days_month, working_hours_day',
      )
      .eq('id', laborRoleId)
      .eq('active', true)
      .maybeSingle();
    if (error) throw new Error(`builder_labor_role_read_failed: ${error.code ?? 'unknown'}`);
    if (!data) return null;
    const r = data as Omit<LaborRoleRow, 'id' | 'code' | 'name'>;
    return calculateLaborCost({
      baseSalary: r.base_salary,
      transportSubsidy: r.transport_subsidy,
      benefitsPct: r.benefits_pct,
      socialSecurityPct: r.social_security_pct,
      payrollTaxPct: r.payroll_tax_pct,
      uniformCost: r.uniform_cost,
      uniformPeriodMonths: r.uniform_period_months,
      workingDaysMonth: r.working_days_month,
      workingHoursDay: r.working_hours_day,
    }).dailyIntegralCost;
  }

  /** IDs de plantillas APU activas de la organización (RLS). */
  async listActiveApuIds(_viewer: AuthenticatedViewer): Promise<Set<Uuid>> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('apu_templates')
      .select('id')
      .eq('active', true);
    if (error) throw new Error(`builder_active_apus_read_failed: ${error.code ?? 'unknown'}`);
    return new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
  }

  /** Crea el APU manual atómicamente (RPC SECURITY INVOKER, RLS-bound). */
  async createManualApu(
    _viewer: AuthenticatedViewer,
    payload: ManualApuPayload,
  ): Promise<{ apuTemplateId: Uuid; code: string; componentCount: number }> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase.rpc('create_manual_apu', {
      p_header: payload.header,
      p_components: payload.components,
      p_idempotency_key: payload.idempotencyKey ?? null,
    });
    if (error) throw new Error(`create_manual_apu_failed: ${error.code ?? error.message}`);
    const r = data as { apuTemplateId: string; code: string; componentCount: number };
    return { apuTemplateId: r.apuTemplateId, code: r.code, componentCount: r.componentCount };
  }

  /** Agrega un APU existente al BOQ de una versión editable (RPC atómica). */
  async addApuToBoq(
    _viewer: AuthenticatedViewer,
    params: {
      estimateVersionId: Uuid;
      chapterId: Uuid;
      apuTemplateId: Uuid;
      quantity: DecimalString;
      idempotencyKey?: string;
    },
  ): Promise<{
    boqItemId: Uuid;
    unitPrice: DecimalString;
    subtotal: DecimalString;
    status: string;
  }> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase.rpc('add_apu_to_boq', {
      p_estimate_version_id: params.estimateVersionId,
      p_chapter_id: params.chapterId,
      p_apu_template_id: params.apuTemplateId,
      p_quantity: params.quantity,
      p_idempotency_key: params.idempotencyKey ?? null,
    });
    if (error) throw new Error(`add_apu_to_boq_failed: ${error.code ?? error.message}`);
    const r = data as { boqItemId: string; unitPrice: string; subtotal: string; status: string };
    return {
      boqItemId: r.boqItemId,
      unitPrice: r.unitPrice,
      subtotal: r.subtotal,
      status: r.status,
    };
  }
}

function compareObservation(a: ObservationRow, b: ObservationRow): number {
  const aKey = a.approved_at ?? '';
  const bKey = b.approved_at ?? '';
  if (aKey !== bKey) return aKey < bKey ? -1 : 1;
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}
