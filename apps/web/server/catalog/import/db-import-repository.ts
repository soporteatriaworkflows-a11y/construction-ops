/**
 * db-import-repository.ts — Acceso a datos de la importación masiva
 * (CATALOG_BULK_ONBOARDING_V1). Propiedad: agent-pricing / agent-db-rls.
 *
 * Reglas:
 *  - Cliente RLS-bound (`createClient()`). NUNCA service-role.
 *  - organization_id = viewer.organizationId (server-side).
 *  - created_by = viewer.profileId (server-side).
 *  - Observaciones SIEMPRE `status='pending'` (la aprobación humana es aparte).
 *  - Carrera de unicidad (23505) ⇒ fila degradada a "skip", nunca error fatal.
 */
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthenticatedViewer } from '../types';
import type { ResourceIdentifier } from './price-list';
import type { NormalizedCatalogRow } from './preview';

const PAGE_SIZE = 1000;
const INSERT_CHUNK = 500;

interface ResourceIdentifierRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  external_sku: string | null;
  external_reference: string | null;
}

export interface BatchCreateResult {
  /** code → id de los recursos efectivamente creados. */
  createdByCode: Map<string, string>;
  /** Códigos degradados a skip por carrera de unicidad. */
  raceSkippedCodes: Set<string>;
}

/** Observación a insertar (ya validada y normalizada server-side). */
export interface ObservationInsert {
  resourceId: string;
  supplierId: string | null;
  observedPrice: string;
  discountPercent: string;
  currency: string;
  unit: string;
  sourceType: 'supplier_csv' | 'manual';
  sourceReference: string | null;
  observedAt: string;
  validUntil: string | null;
  notes: string | null;
  /** Lote de procedencia (PRICE_OBSERVATION_REVIEW_CENTER_V1); null = sin lote. */
  importBatchId: string | null;
}

/** Lote de importación a registrar (procedencia durable + digest persistido). */
export interface ObservationBatchInsert {
  sourceType: 'supplier_csv' | 'manual';
  sourceReference: string | null;
  digestSha256: string;
  label: string | null;
  totalRows: number;
  metadata: Record<string, unknown>;
}

export class DbCatalogImportRepository {
  readonly source = 'db' as const;

  private readonly clientFactory: () => Promise<SupabaseClient>;

  constructor(clientFactory: () => Promise<SupabaseClient> = createClient) {
    this.clientFactory = clientFactory;
  }

  /** Identidades de TODOS los recursos de la organización (paginado). */
  async listResourceIdentifiers(viewer: AuthenticatedViewer): Promise<ResourceIdentifier[]> {
    const supabase = await this.clientFactory();
    const all: ResourceIdentifier[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('resources')
        .select('id, code, name, unit, external_sku, external_reference')
        .eq('organization_id', viewer.organizationId)
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`resource_identifiers_failed: ${error.code ?? 'unknown'}`);
      const rows = (data ?? []) as ResourceIdentifierRow[];
      for (const r of rows) {
        all.push({
          id: r.id,
          code: r.code,
          name: r.name,
          unit: r.unit,
          externalSku: r.external_sku,
          externalReference: r.external_reference,
        });
      }
      if (rows.length < PAGE_SIZE) break;
    }
    return all;
  }

  /** Proveedores activos (id + nombre) para matching por nombre y selección. */
  async listActiveProviders(viewer: AuthenticatedViewer): Promise<Array<{ id: string; name: string }>> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('organization_id', viewer.organizationId)
      .eq('active', true)
      .order('name', { ascending: true });
    if (error) throw new Error(`providers_list_failed: ${error.code ?? 'unknown'}`);
    return (data ?? []) as Array<{ id: string; name: string }>;
  }

  /** Proveedor por id (RLS limita a la organización). `null` si no visible. */
  async getProviderById(
    viewer: AuthenticatedViewer,
    providerId: string,
  ): Promise<{ id: string; name: string } | null> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('organization_id', viewer.organizationId)
      .eq('id', providerId)
      .maybeSingle();
    if (error) throw new Error(`provider_get_failed: ${error.code ?? 'unknown'}`);
    return (data ?? null) as { id: string; name: string } | null;
  }

  /**
   * Crea recursos por lotes. Pre-condición: los códigos ya fueron filtrados
   * contra existentes; si otra importación concurrente insertó alguno (23505),
   * el chunk se reintenta fila a fila y el código en conflicto queda como skip.
   */
  async createResourcesBatch(
    viewer: AuthenticatedViewer,
    rows: ReadonlyArray<NormalizedCatalogRow>,
  ): Promise<BatchCreateResult> {
    const supabase = await this.clientFactory();
    const createdByCode = new Map<string, string>();
    const raceSkippedCodes = new Set<string>();

    const toInsert = (r: NormalizedCatalogRow) => ({
      organization_id: viewer.organizationId,
      code: r.code,
      name: r.name,
      resource_type: r.resourceType,
      unit: r.unit,
      default_waste_pct: r.defaultWastePct,
      active: true,
      description: r.description,
      category: r.category,
      brand: r.brand,
      external_reference: r.externalReference,
      external_sku: r.externalSku,
    });

    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK);
      const { data, error } = await supabase
        .from('resources')
        .insert(chunk.map(toInsert))
        .select('id, code');

      if (!error) {
        for (const row of (data ?? []) as Array<{ id: string; code: string }>) {
          createdByCode.set(row.code, row.id);
        }
        continue;
      }

      if (error.code !== '23505') {
        throw new Error(`resource_batch_failed: ${error.code ?? 'unknown'}`);
      }

      // Carrera: reintento fila a fila, degradando conflictos a skip.
      for (const r of chunk) {
        const { data: one, error: oneError } = await supabase
          .from('resources')
          .insert(toInsert(r))
          .select('id, code')
          .single();
        if (!oneError && one) {
          createdByCode.set((one as { code: string }).code, (one as { id: string }).id);
        } else if (oneError?.code === '23505') {
          raceSkippedCodes.add(r.code);
        } else {
          throw new Error(`resource_row_failed: ${oneError?.code ?? 'unknown'}`);
        }
      }
    }

    return { createdByCode, raceSkippedCodes };
  }

  /**
   * Registra el lote de importación (procedencia + digest SHA-256 persistido).
   * imported_by = viewer.profileId (server-side); RLS exige misma org y rol.
   */
  async createObservationBatch(
    viewer: AuthenticatedViewer,
    input: ObservationBatchInsert,
  ): Promise<string> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('price_observation_batches')
      .insert({
        organization_id: viewer.organizationId,
        source_type: input.sourceType,
        source_reference: input.sourceReference,
        digest_sha256: input.digestSha256,
        label: input.label,
        imported_by: viewer.profileId,
        total_rows: input.totalRows,
        metadata: input.metadata,
      })
      .select('id')
      .single();
    if (error) throw new Error(`observation_batch_create_failed: ${error.code ?? 'unknown'}`);
    return (data as { id: string }).id;
  }

  /** Inserta observaciones `pending` por lotes. El trigger DB calcula el neto. */
  async createObservationsBatch(
    viewer: AuthenticatedViewer,
    observations: ReadonlyArray<ObservationInsert>,
  ): Promise<number> {
    if (observations.length === 0) return 0;
    const supabase = await this.clientFactory();
    let created = 0;

    for (let i = 0; i < observations.length; i += INSERT_CHUNK) {
      const chunk = observations.slice(i, i + INSERT_CHUNK);
      const { data, error } = await supabase
        .from('resource_price_observations')
        .insert(
          chunk.map((o) => ({
            organization_id: viewer.organizationId,
            resource_id: o.resourceId,
            supplier_id: o.supplierId,
            observed_price: o.observedPrice,
            discount_percent: o.discountPercent,
            // El trigger BEFORE INSERT recalcula este valor SIEMPRE (invariante DB).
            suggested_net_price: 0,
            unit: o.unit,
            currency: o.currency,
            source_type: o.sourceType,
            source_reference: o.sourceReference,
            observed_at: o.observedAt,
            valid_until: o.validUntil,
            status: 'pending',
            notes: o.notes,
            created_by: viewer.profileId,
            import_batch_id: o.importBatchId,
          })),
        )
        .select('id');
      if (error) throw new Error(`observation_batch_failed: ${error.code ?? 'unknown'}`);
      created += (data ?? []).length;
    }
    return created;
  }
}
