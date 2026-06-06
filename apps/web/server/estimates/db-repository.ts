/**
 * db-repository.ts — Implementación DB de `EstimatesWriteRepository` (4B.3).
 *
 * Propiedad: agent-db-rls. Contrato: `docs/ESTIMATES_CRUD_CONTRACT.md §6`.
 *
 * Reglas NO negociables:
 *  - Cliente server RLS-bound (`@/lib/supabase/server`); NUNCA service-role.
 *  - La creación usa la RPC atómica `create_estimate_with_initial_version` que
 *    deriva `created_by` de la identidad autenticada (sin parámetro de autor) e
 *    inserta estimate + V01 en una transacción. RLS aplica (SECURITY INVOKER).
 *  - El alcance se valida (visible para el viewer) antes de crear; `code`
 *    autogenerado + anti-colisión 23505.
 *  - Lecturas: RLS limita a la org del viewer ⇒ ausencia ⇒ Not-Found de dominio.
 *  - Errores → tipos de dominio; nunca se propaga SQL/stack.
 */
import { createClient } from '@/lib/supabase/server';
import Decimal from 'decimal.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuthenticatedViewer,
  CreateEstimateInput,
  EstimateActiveVersionView,
  EstimateDetailView,
  EstimateListItem,
  EstimatesWriteRepository,
  Uuid,
  ViewerContext,
} from './types';
import {
  AiuVersionLockedError,
  ChapterNotFoundError,
  EstimateCodeGenerationError,
  EstimateNotFoundError,
  ScopeNotFoundError,
} from './errors';
import type {
  BoqItemReviewView,
  ChapterDetailView,
  ChapterReviewItem,
} from '@/lib/estimates/review-types';
import type { AiuRatesInput, AiuRatesView, FinancialSummary } from '@/lib/estimates/aiu-types';
import { AIU_KINDS } from '@/lib/estimates/aiu-types';
import type {
  EstimateExportChapter,
  EstimateExportPayload,
} from '@/lib/estimates/export-types';
import { versionLabel } from './export/version-label';
import {
  computeFinancialSummary,
  fractionToHuman,
  validateAiuRates,
  type AiuFractions,
} from './aiu-calc';

/** Mapa code (indirect_cost_rules) → llave de fracción AIU. */
const CODE_TO_FRACTION: Record<string, keyof AiuFractions> = {
  A: 'administration',
  I: 'contingency',
  U: 'utility',
  IVA: 'utilityVat',
};

const LOCKED_STATUSES = ['approved', 'issued', 'archived'];
import {
  buildEstimateCodeCandidate,
  CODE_MAX_ATTEMPTS,
  slugifyEstimateCode,
  validateCreateEstimateInput,
} from './validation';

const UNIQUE_VIOLATION = '23505';

interface EstimateRow {
  id: string;
  code: string;
  name: string;
  status: string;
  created_at: string;
  project_scope_id: string;
  description?: string | null;
  project_scopes?: {
    name: string | null;
    projects?: { id: string; name: string | null } | null;
  } | null;
}

function toListItem(row: EstimateRow): EstimateListItem {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status as EstimateListItem['status'],
    createdAt: row.created_at,
    projectScopeId: row.project_scope_id,
    scopeName: row.project_scopes?.name ?? null,
    projectId: row.project_scopes?.projects?.id ?? null,
    projectName: row.project_scopes?.projects?.name ?? null,
  };
}

const LIST_SELECT =
  'id, code, name, status, created_at, project_scope_id, project_scopes(name, projects(id, name))';
const DETAIL_SELECT = `${LIST_SELECT}, description`;

export class DbEstimatesWriteRepository implements EstimatesWriteRepository {
  readonly source = 'db' as const;

  private readonly clientFactory: () => Promise<SupabaseClient>;

  constructor(clientFactory: () => Promise<SupabaseClient> = createClient) {
    this.clientFactory = clientFactory;
  }

  /** Verifica (RLS-bound) que el alcance sea visible para el viewer. */
  private async assertScopeVisible(supabase: SupabaseClient, scopeId: Uuid): Promise<void> {
    const { data, error } = await supabase
      .from('project_scopes')
      .select('id')
      .eq('id', scopeId)
      .maybeSingle();
    if (error) {
      throw new Error(`estimate_scope_read_failed: ${error.code ?? 'unknown'}`);
    }
    if (!data) {
      throw new ScopeNotFoundError(scopeId);
    }
  }

  async insertEstimateWithInitialVersion(
    _viewer: AuthenticatedViewer,
    scopeId: Uuid,
    input: CreateEstimateInput,
  ): Promise<EstimateDetailView> {
    const normalized = validateCreateEstimateInput(input);
    const supabase = await this.clientFactory();

    await this.assertScopeVisible(supabase, scopeId);

    const base = slugifyEstimateCode(normalized.name);
    let estimateId: string | null = null;

    for (let attempt = 0; attempt < CODE_MAX_ATTEMPTS; attempt++) {
      const code = buildEstimateCodeCandidate(base, attempt);
      // RPC atómica: estimate (status 'active') + V01 (draft). created_by derivado
      // server-side por la función (no se envía desde el cliente).
      const { data, error } = await supabase.rpc('create_estimate_with_initial_version', {
        p_scope_id: scopeId,
        p_code: code,
        p_name: normalized.name,
        p_description: normalized.description,
      });

      if (!error && data) {
        const row = (Array.isArray(data) ? data[0] : data) as { id: string };
        estimateId = row.id;
        break;
      }
      if (error && error.code === UNIQUE_VIOLATION) {
        continue;
      }
      if (error) {
        throw new Error(`estimate_create_failed: ${error.code ?? 'unknown'}`);
      }
    }

    if (!estimateId) {
      throw new EstimateCodeGenerationError();
    }
    return this.getEstimateById(_viewer, estimateId);
  }

  async listEstimatesByScope(
    _viewer: ViewerContext,
    scopeId: Uuid,
  ): Promise<EstimateListItem[]> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('estimates')
      .select(LIST_SELECT)
      .eq('project_scope_id', scopeId)
      .order('created_at', { ascending: true });
    if (error) {
      throw new Error(`estimate_list_failed: ${error.code ?? 'unknown'}`);
    }
    return (data ?? []).map((r) => toListItem(r as unknown as EstimateRow));
  }

  async listVisibleEstimates(_viewer: ViewerContext): Promise<EstimateListItem[]> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('estimates')
      .select(LIST_SELECT)
      .order('created_at', { ascending: false });
    if (error) {
      throw new Error(`estimate_list_failed: ${error.code ?? 'unknown'}`);
    }
    return (data ?? []).map((r) => toListItem(r as unknown as EstimateRow));
  }

  async getEstimateById(
    viewer: ViewerContext,
    estimateId: Uuid,
  ): Promise<EstimateDetailView> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('estimates')
      .select(DETAIL_SELECT)
      .eq('id', estimateId)
      .maybeSingle();
    if (error) {
      throw new Error(`estimate_read_failed: ${error.code ?? 'unknown'}`);
    }
    if (!data) {
      throw new EstimateNotFoundError(estimateId);
    }
    const row = data as unknown as EstimateRow;
    const activeVersion = await this.getEstimateActiveVersion(viewer, estimateId);
    return {
      ...toListItem(row),
      description: row.description ?? null,
      activeVersion,
    };
  }

  async getEstimateActiveVersion(
    _viewer: ViewerContext,
    estimateId: Uuid,
  ): Promise<EstimateActiveVersionView | null> {
    const supabase = await this.clientFactory();
    // Versión vigente = mayor version_number.
    const { data, error } = await supabase
      .from('estimate_versions')
      .select('id, version_number, status')
      .eq('estimate_id', estimateId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(`estimate_version_read_failed: ${error.code ?? 'unknown'}`);
    }
    if (!data) return null;

    const version = data as { id: string; version_number: number; status: string };
    const [{ count: chapterCount }, { count: itemCount }, subsRes] = await Promise.all([
      supabase
        .from('chapters')
        .select('id', { count: 'exact', head: true })
        .eq('estimate_version_id', version.id),
      supabase
        .from('boq_items')
        .select('id', { count: 'exact', head: true })
        .eq('estimate_version_id', version.id),
      supabase
        .from('boq_items')
        .select('subtotal')
        .eq('estimate_version_id', version.id),
    ]);

    const subs = (subsRes.data ?? []) as { subtotal: string }[];
    const directTotal = subs
      .reduce((acc, r) => acc.plus(new Decimal(r.subtotal)), new Decimal(0))
      .toFixed();

    return {
      id: version.id,
      versionNumber: version.version_number,
      status: version.status as EstimateActiveVersionView['status'],
      chapterCount: chapterCount ?? 0,
      itemCount: itemCount ?? 0,
      directTotal,
    };
  }

  async listChaptersByEstimateVersion(
    viewer: ViewerContext,
    estimateId: Uuid,
  ): Promise<ChapterReviewItem[]> {
    const active = await this.getEstimateActiveVersion(viewer, estimateId);
    if (!active) return [];
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('chapters')
      .select('id, code, name, sort_order, source_code, source_row, boq_items(subtotal)')
      .eq('estimate_version_id', active.id)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`chapter_list_failed: ${error.code ?? 'unknown'}`);

    return (data ?? []).map((row) => {
      const r = row as unknown as {
        id: string; code: string; name: string; sort_order: number;
        source_code: string | null; source_row: number | null;
        boq_items: { subtotal: string }[] | null;
      };
      const items = r.boq_items ?? [];
      const subtotal = items.reduce((acc, it) => acc.plus(new Decimal(it.subtotal)), new Decimal(0)).toFixed();
      return {
        id: r.id, code: r.code, name: r.name, sortOrder: r.sort_order,
        itemCount: items.length, subtotal,
        sourceCode: r.source_code ?? null, sourceRow: r.source_row ?? null,
      };
    });
  }

  async getChapterById(viewer: ViewerContext, chapterId: Uuid): Promise<ChapterDetailView> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('chapters')
      .select(
        'id, code, name, sort_order, source_code, source_row, boq_items(subtotal), ' +
          'estimate_versions(version_number, estimates(id, name, project_scopes(id, name, projects(id, name))))',
      )
      .eq('id', chapterId)
      .maybeSingle();
    if (error) throw new Error(`chapter_read_failed: ${error.code ?? 'unknown'}`);
    if (!data) throw new ChapterNotFoundError(chapterId);

    const r = data as unknown as {
      id: string; code: string; name: string; sort_order: number;
      source_code: string | null; source_row: number | null;
      boq_items: { subtotal: string }[] | null;
      estimate_versions: {
        version_number: number;
        estimates: {
          id: string; name: string;
          project_scopes: { id: string; name: string | null; projects: { id: string; name: string | null } | null } | null;
        } | null;
      } | null;
    };
    const items = r.boq_items ?? [];
    const subtotal = items.reduce((acc, it) => acc.plus(new Decimal(it.subtotal)), new Decimal(0)).toFixed();
    const ev = r.estimate_versions;
    const est = ev?.estimates;
    const scope = est?.project_scopes;
    const project = scope?.projects;
    return {
      id: r.id, code: r.code, name: r.name, sortOrder: r.sort_order,
      subtotal, itemCount: items.length,
      sourceCode: r.source_code ?? null, sourceRow: r.source_row ?? null,
      estimateId: est?.id ?? '', estimateName: est?.name ?? '',
      versionNumber: ev?.version_number ?? 0,
      scopeId: scope?.id ?? '', scopeName: scope?.name ?? null,
      projectId: project?.id ?? '', projectName: project?.name ?? null,
    };
  }

  async listItemsByChapter(_viewer: ViewerContext, chapterId: Uuid): Promise<BoqItemReviewView[]> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('boq_items')
      .select('id, code, description_snapshot, unit_snapshot, quantity_snapshot, unit_price_snapshot, subtotal, sort_order, source_code, source_row')
      .eq('chapter_id', chapterId)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`item_list_failed: ${error.code ?? 'unknown'}`);
    return (data ?? []).map((row) => {
      const r = row as unknown as {
        id: string; code: string; description_snapshot: string; unit_snapshot: string;
        quantity_snapshot: string; unit_price_snapshot: string; subtotal: string; sort_order: number;
        source_code: string | null; source_row: number | null;
      };
      return {
        id: r.id, code: r.code, description: r.description_snapshot, unit: r.unit_snapshot,
        quantity: r.quantity_snapshot, unitPrice: r.unit_price_snapshot, subtotal: r.subtotal,
        sortOrder: r.sort_order, sourceCode: r.source_code ?? null, sourceRow: r.source_row ?? null,
      };
    });
  }

  /** Lee las fracciones AIU (por code) de una versión; ceros si no hay reglas. */
  private async readAiuFractions(supabase: SupabaseClient, versionId: string): Promise<{ fractions: AiuFractions; isEmpty: boolean }> {
    const { data, error } = await supabase
      .from('indirect_cost_rules')
      .select('code, percentage')
      .eq('estimate_version_id', versionId);
    if (error) throw new Error(`aiu_read_failed: ${error.code ?? 'unknown'}`);
    const byCode = new Map((data ?? []).map((r) => [(r as { code: string }).code, String((r as { percentage: string }).percentage)]));
    const get = (code: string) => byCode.get(code) ?? null;
    const isEmpty = AIU_KINDS.every((k) => byCode.get(k.code) === undefined);
    return {
      isEmpty,
      fractions: {
        administration: get('A') ?? '0',
        contingency: get('I') ?? '0',
        utility: get('U') ?? '0',
        utilityVat: get('IVA') ?? '0',
      },
    };
  }

  async getEstimateVersionAiu(viewer: ViewerContext, estimateId: Uuid): Promise<AiuRatesView> {
    const active = await this.getEstimateActiveVersion(viewer, estimateId);
    if (!active) throw new EstimateNotFoundError(estimateId);
    const supabase = await this.clientFactory();
    const { fractions, isEmpty } = await this.readAiuFractions(supabase, active.id);
    return {
      administrationRate: fractionToHuman(fractions.administration),
      contingencyRate: fractionToHuman(fractions.contingency),
      utilityRate: fractionToHuman(fractions.utility),
      utilityVatRate: fractionToHuman(fractions.utilityVat),
      isEmpty,
      editable: !LOCKED_STATUSES.includes(active.status),
      updatedAt: null,
    };
  }

  async updateEstimateVersionAiu(
    viewer: AuthenticatedViewer,
    estimateId: Uuid,
    input: AiuRatesInput,
  ): Promise<FinancialSummary> {
    const active = await this.getEstimateActiveVersion(viewer, estimateId);
    if (!active) throw new EstimateNotFoundError(estimateId);
    if (LOCKED_STATUSES.includes(active.status)) throw new AiuVersionLockedError();

    const fractions = validateAiuRates(input); // valida rango + convierte a fracción
    const supabase = await this.clientFactory();

    // Upsert ATÓMICO de las 4 filas (un statement PostgREST). RLS WITH CHECK aplica.
    const rows = AIU_KINDS.map((k) => ({
      estimate_version_id: active.id,
      code: k.code,
      name: k.name,
      base_type: k.baseType,
      percentage: fractions[CODE_TO_FRACTION[k.code]!],
      sort_order: k.sortOrder,
      visible_to_client: true,
    }));
    const { error } = await supabase
      .from('indirect_cost_rules')
      .upsert(rows, { onConflict: 'estimate_version_id,code' });
    if (error) throw new Error(`aiu_save_failed: ${error.code ?? 'unknown'}`);

    return computeFinancialSummary(active.directTotal, fractions);
  }

  async calculateEstimateFinancialSummary(
    viewer: ViewerContext,
    estimateId: Uuid,
  ): Promise<FinancialSummary> {
    const active = await this.getEstimateActiveVersion(viewer, estimateId);
    if (!active) throw new EstimateNotFoundError(estimateId);
    const supabase = await this.clientFactory();
    const { fractions } = await this.readAiuFractions(supabase, active.id);
    return computeFinancialSummary(active.directTotal, fractions);
  }

  async getEstimateExportPayload(
    viewer: ViewerContext,
    estimateId: Uuid,
  ): Promise<EstimateExportPayload> {
    const supabase = await this.clientFactory();

    // Lectura extendida (RLS-bound) con organización + ciudad (location).
    const { data, error } = await supabase
      .from('estimates')
      .select(
        'id, code, name, status, project_scope_id, ' +
          'project_scopes(id, name, projects(id, name, location, organizations(name)))',
      )
      .eq('id', estimateId)
      .maybeSingle();
    if (error) throw new Error(`estimate_export_read_failed: ${error.code ?? 'unknown'}`);
    if (!data) throw new EstimateNotFoundError(estimateId);

    const r = data as unknown as {
      id: string; code: string; name: string; status: string; project_scope_id: string;
      project_scopes: {
        id: string; name: string | null;
        projects: {
          id: string; name: string | null; location: string | null;
          organizations: { name: string | null } | null;
        } | null;
      } | null;
    };

    const active = await this.getEstimateActiveVersion(viewer, estimateId);
    if (!active) throw new EstimateNotFoundError(estimateId);

    // Capítulos + ítems (ordenados) + AIU + resumen financiero.
    const reviewChapters = await this.listChaptersByEstimateVersion(viewer, estimateId);
    const chapters: EstimateExportChapter[] = [];
    let itemCount = 0;
    for (const ch of reviewChapters) {
      const items = await this.listItemsByChapter(viewer, ch.id);
      itemCount += items.length;
      chapters.push({
        code: ch.code,
        name: ch.name,
        sortOrder: ch.sortOrder,
        subtotal: ch.subtotal,
        sourceCode: ch.sourceCode,
        sourceRow: ch.sourceRow,
        items: items.map((it) => ({
          code: it.code,
          description: it.description,
          unit: it.unit,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          subtotal: it.subtotal,
          sourceCode: it.sourceCode,
          sourceRow: it.sourceRow,
        })),
      });
    }

    const [aiu, financial] = await Promise.all([
      this.getEstimateVersionAiu(viewer, estimateId),
      this.calculateEstimateFinancialSummary(viewer, estimateId),
    ]);

    const scope = r.project_scopes;
    const project = scope?.projects;
    return {
      organizationName: project?.organizations?.name ?? '—',
      project: { id: project?.id ?? '', name: project?.name ?? '—', city: project?.location ?? null },
      scope: { id: scope?.id ?? r.project_scope_id, name: scope?.name ?? null },
      estimate: {
        id: r.id, code: r.code, name: r.name,
        status: r.status as EstimateExportPayload['estimate']['status'],
      },
      version: {
        number: active.versionNumber,
        label: versionLabel(active.versionNumber),
        status: active.status as EstimateExportPayload['version']['status'],
      },
      generatedAt: new Date().toISOString(),
      counts: { chapters: reviewChapters.length, items: itemCount },
      chapters,
      aiu: {
        administrationRate: aiu.administrationRate,
        contingencyRate: aiu.contingencyRate,
        utilityRate: aiu.utilityRate,
        utilityVatRate: aiu.utilityVatRate,
      },
      financial,
    };
  }
}
