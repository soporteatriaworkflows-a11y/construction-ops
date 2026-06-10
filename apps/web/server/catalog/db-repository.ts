/**
 * db-repository.ts — Repositorio DB para catalogo de recursos (Bootstrap CTAs).
 * Propiedad: agent-frontend-boq.
 *
 * Reglas:
 *  - Usa cliente RLS-bound (createClient()). NUNCA service-role.
 *  - organization_id = viewer.organizationId (server-side).
 *  - created_by = viewer.profileId (server-side).
 *  - RLS garantiza aislamiento por organizacion.
 */
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { validateResourceCreateInput } from './validation';
import type { AuthenticatedViewer, ResourceCreateInput, ResourceView } from './types';

const RESOURCE_COLUMNS =
  'id, organization_id, code, name, resource_type, unit, active, created_at';

interface ResourceRow {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  resource_type: string;
  unit: string;
  active: boolean;
  created_at: string;
}

function toView(row: ResourceRow): ResourceView {
  return {
    id: row.id,
    organizationId: row.organization_id,
    code: row.code,
    name: row.name,
    resourceType: row.resource_type as ResourceView['resourceType'],
    unit: row.unit,
    active: row.active,
    createdAt: row.created_at,
  };
}

export class DbCatalogRepository {
  readonly source = 'db' as const;

  private readonly clientFactory: () => Promise<SupabaseClient>;

  constructor(clientFactory: () => Promise<SupabaseClient> = createClient) {
    this.clientFactory = clientFactory;
  }

  async createResource(
    viewer: AuthenticatedViewer,
    input: ResourceCreateInput,
  ): Promise<ResourceView> {
    const normalized = validateResourceCreateInput(input);
    const supabase = await this.clientFactory();

    const { data, error } = await supabase
      .from('resources')
      .insert({
        organization_id: viewer.organizationId,
        code: normalized.code,
        name: normalized.name,
        resource_type: normalized.resourceType,
        unit: normalized.unit,
        default_waste_pct: 0,
        active: true,
      })
      .select(RESOURCE_COLUMNS)
      .single();

    if (error) throw new Error(`resource_create_failed: ${error.code ?? 'unknown'}`);
    return toView(data as ResourceRow);
  }
}
