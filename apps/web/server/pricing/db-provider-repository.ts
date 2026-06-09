/**
 * db-provider-repository.ts — Repositorio DB de proveedores (Fase 3A).
 *
 * Propiedad: agent-pricing.
 * Contrato: docs/PRICE_INTELLIGENCE_FOUNDATION_CONTRACT.md §4.
 *
 * Reglas:
 *  - Usa cliente RLS-bound (createClient()). NUNCA service-role.
 *  - organization_id = viewer.organizationId; created_by = viewer.profileId (server-side).
 *  - RLS garantiza aislamiento por org.
 */
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuthenticatedViewer,
  ProviderView,
  ProviderCreateInput,
  ProviderUpdateInput,
  ProviderRepository,
  Uuid,
} from './types';
import { ProviderNotFoundError } from './errors';
import { validateProviderCreateInput } from './validation';

const PROVIDER_COLUMNS =
  'id, name, supplier_type, website_url, default_discount_percent, notes, active, created_at, updated_at';

interface ProviderRow {
  id: string;
  name: string;
  supplier_type: string;
  website_url: string | null;
  default_discount_percent: string;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function toView(row: ProviderRow): ProviderView {
  return {
    id: row.id,
    name: row.name,
    supplierType: row.supplier_type as ProviderView['supplierType'],
    websiteUrl: row.website_url,
    defaultDiscountPercent: String(row.default_discount_percent),
    notes: row.notes,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class DbProviderRepository implements ProviderRepository {
  readonly source = 'db' as const;

  private readonly clientFactory: () => Promise<SupabaseClient>;

  constructor(clientFactory: () => Promise<SupabaseClient> = createClient) {
    this.clientFactory = clientFactory;
  }

  async listProviders(viewer: AuthenticatedViewer): Promise<ProviderView[]> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('suppliers')
      .select(PROVIDER_COLUMNS)
      .eq('organization_id', viewer.organizationId)
      .order('name');

    if (error) throw new Error(`provider_list_failed: ${error.code ?? 'unknown'}`);
    return (data as ProviderRow[]).map(toView);
  }

  async createProvider(
    viewer: AuthenticatedViewer,
    input: ProviderCreateInput,
  ): Promise<ProviderView> {
    const normalized = validateProviderCreateInput(input);
    const supabase = await this.clientFactory();

    const { data, error } = await supabase
      .from('suppliers')
      .insert({
        organization_id: viewer.organizationId,
        created_by: viewer.profileId,
        name: normalized.name,
        supplier_type: normalized.supplierType,
        website_url: normalized.websiteUrl ?? null,
        default_discount_percent: normalized.defaultDiscountPercent,
        notes: normalized.notes ?? null,
        active: true,
      })
      .select(PROVIDER_COLUMNS)
      .single();

    if (error) throw new Error(`provider_create_failed: ${error.code ?? 'unknown'}`);
    return toView(data as ProviderRow);
  }

  async updateProvider(
    viewer: AuthenticatedViewer,
    providerId: Uuid,
    input: ProviderUpdateInput,
  ): Promise<ProviderView> {
    const supabase = await this.clientFactory();

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.websiteUrl !== undefined) patch.website_url = input.websiteUrl;
    if (input.defaultDiscountPercent !== undefined) patch.default_discount_percent = input.defaultDiscountPercent;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.active !== undefined) patch.active = input.active;

    const { data, error } = await supabase
      .from('suppliers')
      .update(patch)
      .eq('id', providerId)
      .eq('organization_id', viewer.organizationId)
      .select(PROVIDER_COLUMNS)
      .maybeSingle();

    if (error) throw new Error(`provider_update_failed: ${error.code ?? 'unknown'}`);
    if (!data) throw new ProviderNotFoundError(providerId);
    return toView(data as ProviderRow);
  }

  async getProviderById(viewer: AuthenticatedViewer, providerId: Uuid): Promise<ProviderView> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('suppliers')
      .select(PROVIDER_COLUMNS)
      .eq('id', providerId)
      .eq('organization_id', viewer.organizationId)
      .maybeSingle();

    if (error) throw new Error(`provider_read_failed: ${error.code ?? 'unknown'}`);
    if (!data) throw new ProviderNotFoundError(providerId);
    return toView(data as ProviderRow);
  }
}
