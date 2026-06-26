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
  BoqAlreadyArchivedError,
  BoqItemNotFoundError,
  BoqNotArchivedError,
  BoqVersionLockedError,
  ChapterCodeDuplicateError,
  ChapterNotFoundError,
  EstimateCodeGenerationError,
  EstimateNotFoundError,
  ScopeNotFoundError,
  TargetChapterNotFoundError,
  VersionMismatchError,
  VersionNotDraftError,
  VersionNotIssuedError,
} from './errors';
import type { EstimateVersionSummary } from '@/lib/estimates/version-types';
import type { VersionCompareResult } from '@/lib/estimates/compare-types';
import {
  computeVersionComparison,
  type CompareItemInput,
  type VersionSnapshot,
} from './compare';
import {
  validateChapterInput,
  validateBoqItemInput,
  validateBoqItemUpdate,
  deriveSubtotal,
} from './boq-validation';
import type {
  BoqItemArchiveResult,
  BoqItemMutationResult,
  ChapterInput,
  ChapterMutationResult,
  EditableBoqItemView,
  EditableChapterView,
  BoqItemInput,
  BoqItemUpdateInput,
  ReviewReadOptions,
} from '@/lib/estimates/boq-edit-types';
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
    const rollup = await this.versionRollup(supabase, version.id);
    return {
      id: version.id,
      versionNumber: version.version_number,
      status: version.status as EstimateActiveVersionView['status'],
      chapterCount: rollup.chapterCount,
      itemCount: rollup.itemCount,
      directTotal: rollup.directTotal,
    };
  }

  /**
   * Rollup ACTIVO de una versión (4E.2B): conteos + directTotal excluyendo
   * capítulos archivados (y TODOS sus ítems) e ítems archivados individualmente.
   */
  private async versionRollup(
    supabase: SupabaseClient,
    versionId: string,
  ): Promise<{ chapterCount: number; itemCount: number; directTotal: string }> {
    const { data: chRows, error } = await supabase
      .from('chapters')
      .select('id, archived_at, boq_items(subtotal, archived_at)')
      .eq('estimate_version_id', versionId);
    if (error) throw new Error(`estimate_version_rollup_failed: ${error.code ?? 'unknown'}`);

    let chapterCount = 0;
    let itemCount = 0;
    let directTotal = new Decimal(0);
    for (const row of chRows ?? []) {
      const r = row as {
        archived_at: string | null;
        boq_items: { subtotal: string; archived_at: string | null }[] | null;
      };
      if (r.archived_at) continue;
      chapterCount += 1;
      for (const it of r.boq_items ?? []) {
        if (it.archived_at) continue;
        itemCount += 1;
        directTotal = directTotal.plus(new Decimal(it.subtotal));
      }
    }
    return { chapterCount, itemCount, directTotal: directTotal.toFixed() };
  }

  async listChaptersByEstimateVersion(
    viewer: ViewerContext,
    estimateId: Uuid,
    options?: ReviewReadOptions,
  ): Promise<ChapterReviewItem[]> {
    const active = await this.getEstimateActiveVersion(viewer, estimateId);
    if (!active) return [];
    const supabase = await this.clientFactory();
    return this.listChaptersForVersion(supabase, active.id, options?.includeArchived ?? false);
  }

  /** Lista capítulos de una versión concreta (activos por defecto). */
  private async listChaptersForVersion(
    supabase: SupabaseClient,
    versionId: string,
    includeArchived: boolean,
  ): Promise<ChapterReviewItem[]> {
    const { data, error } = await supabase
      .from('chapters')
      .select('id, code, name, sort_order, source_code, source_row, archived_at, boq_items(subtotal, archived_at)')
      .eq('estimate_version_id', versionId)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`chapter_list_failed: ${error.code ?? 'unknown'}`);

    return (data ?? [])
      .map((row) => {
        const r = row as unknown as {
          id: string; code: string; name: string; sort_order: number;
          source_code: string | null; source_row: number | null; archived_at: string | null;
          boq_items: { subtotal: string; archived_at: string | null }[] | null;
        };
        // Subtotal/conteo solo de ítems ACTIVOS (archivados no participan).
        const activeItems = (r.boq_items ?? []).filter((it) => !it.archived_at);
        const subtotal = activeItems
          .reduce((acc, it) => acc.plus(new Decimal(it.subtotal)), new Decimal(0))
          .toFixed();
        return {
          id: r.id, code: r.code, name: r.name, sortOrder: r.sort_order,
          itemCount: activeItems.length, subtotal,
          sourceCode: r.source_code ?? null, sourceRow: r.source_row ?? null,
          archived: !!r.archived_at,
        };
      })
      .filter((ch) => includeArchived || !ch.archived);
  }

  async getChapterById(viewer: ViewerContext, chapterId: Uuid): Promise<ChapterDetailView> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('chapters')
      .select(
        'id, code, name, sort_order, source_code, source_row, archived_at, boq_items(subtotal, archived_at), ' +
          'estimate_versions(version_number, estimates(id, name, project_scopes(id, name, projects(id, name))))',
      )
      .eq('id', chapterId)
      .maybeSingle();
    if (error) throw new Error(`chapter_read_failed: ${error.code ?? 'unknown'}`);
    if (!data) throw new ChapterNotFoundError(chapterId);

    const r = data as unknown as {
      id: string; code: string; name: string; sort_order: number;
      source_code: string | null; source_row: number | null; archived_at: string | null;
      boq_items: { subtotal: string; archived_at: string | null }[] | null;
      estimate_versions: {
        version_number: number;
        estimates: {
          id: string; name: string;
          project_scopes: { id: string; name: string | null; projects: { id: string; name: string | null } | null } | null;
        } | null;
      } | null;
    };
    const activeItems = (r.boq_items ?? []).filter((it) => !it.archived_at);
    const subtotal = activeItems.reduce((acc, it) => acc.plus(new Decimal(it.subtotal)), new Decimal(0)).toFixed();
    const ev = r.estimate_versions;
    const est = ev?.estimates;
    const scope = est?.project_scopes;
    const project = scope?.projects;
    return {
      id: r.id, code: r.code, name: r.name, sortOrder: r.sort_order,
      subtotal, itemCount: activeItems.length,
      sourceCode: r.source_code ?? null, sourceRow: r.source_row ?? null,
      archived: !!r.archived_at,
      estimateId: est?.id ?? '', estimateName: est?.name ?? '',
      versionNumber: ev?.version_number ?? 0,
      scopeId: scope?.id ?? '', scopeName: scope?.name ?? null,
      projectId: project?.id ?? '', projectName: project?.name ?? null,
    };
  }

  async listItemsByChapter(
    _viewer: ViewerContext,
    chapterId: Uuid,
    options?: ReviewReadOptions,
  ): Promise<BoqItemReviewView[]> {
    const includeArchived = options?.includeArchived ?? false;
    const supabase = await this.clientFactory();
    let query = supabase
      .from('boq_items')
      .select('id, code, description_snapshot, unit_snapshot, quantity_snapshot, unit_price_snapshot, subtotal, sort_order, source_code, source_row, archived_at, apu_template_id')
      .eq('chapter_id', chapterId);
    if (!includeArchived) query = query.is('archived_at', null);
    const { data, error } = await query.order('sort_order', { ascending: true });
    if (error) throw new Error(`item_list_failed: ${error.code ?? 'unknown'}`);
    return (data ?? []).map((row) => {
      const r = row as unknown as {
        id: string; code: string; description_snapshot: string; unit_snapshot: string;
        quantity_snapshot: string; unit_price_snapshot: string; subtotal: string; sort_order: number;
        source_code: string | null; source_row: number | null; archived_at: string | null;
        apu_template_id: string | null;
      };
      return {
        id: r.id, code: r.code, description: r.description_snapshot, unit: r.unit_snapshot,
        quantity: r.quantity_snapshot, unitPrice: r.unit_price_snapshot, subtotal: r.subtotal,
        sortOrder: r.sort_order, sourceCode: r.source_code ?? null, sourceRow: r.source_row ?? null,
        archived: !!r.archived_at,
        apuTemplateId: r.apu_template_id ?? null,
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
    versionId?: Uuid,
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

    // Versión objetivo: explícita (snapshot histórico) o la activa.
    let targetId: string;
    let targetNumber: number;
    let targetStatus: string;
    if (versionId) {
      const { data: vRow, error: vErr } = await supabase
        .from('estimate_versions')
        .select('id, version_number, status, estimate_id')
        .eq('id', versionId)
        .maybeSingle();
      if (vErr) throw new Error(`estimate_version_read_failed: ${vErr.code ?? 'unknown'}`);
      const v = vRow as { id: string; version_number: number; status: string; estimate_id: string } | null;
      if (!v || v.estimate_id !== estimateId) throw new EstimateNotFoundError(estimateId);
      targetId = v.id; targetNumber = v.version_number; targetStatus = v.status;
    } else {
      const active = await this.getEstimateActiveVersion(viewer, estimateId);
      if (!active) throw new EstimateNotFoundError(estimateId);
      targetId = active.id; targetNumber = active.versionNumber; targetStatus = active.status;
    }

    // Capítulos + ítems (ordenados, activos) + AIU + resumen de la versión objetivo.
    const reviewChapters = await this.listChaptersForVersion(supabase, targetId, false);
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

    // AIU + resumen financiero de la versión objetivo (snapshot por versión).
    const { fractions } = await this.readAiuFractions(supabase, targetId);
    const rollup = await this.versionRollup(supabase, targetId);
    const financial = computeFinancialSummary(rollup.directTotal, fractions);
    const aiu = {
      administrationRate: fractionToHuman(fractions.administration),
      contingencyRate: fractionToHuman(fractions.contingency),
      utilityRate: fractionToHuman(fractions.utility),
      utilityVatRate: fractionToHuman(fractions.utilityVat),
    };

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
        number: targetNumber,
        label: versionLabel(targetNumber),
        status: targetStatus as EstimateExportPayload['version']['status'],
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

  async getVersionApuTemplateLinks(
    viewer: ViewerContext,
    estimateId: Uuid,
    versionId?: Uuid,
  ): Promise<import('@/lib/estimates/apu-export-types').VersionApuLinkRow[]> {
    const supabase = await this.clientFactory();

    // Versión objetivo: explícita (snapshot histórico) o la activa. Misma
    // semántica que getEstimateExportPayload; cross-org ⇒ NotFound vía RLS.
    let targetId: string;
    if (versionId) {
      const { data: vRow, error: vErr } = await supabase
        .from('estimate_versions')
        .select('id, estimate_id')
        .eq('id', versionId)
        .maybeSingle();
      if (vErr) throw new Error(`estimate_version_read_failed: ${vErr.code ?? 'unknown'}`);
      const v = vRow as { id: string; estimate_id: string } | null;
      if (!v || v.estimate_id !== estimateId) throw new EstimateNotFoundError(estimateId);
      targetId = v.id;
    } else {
      const active = await this.getEstimateActiveVersion(viewer, estimateId);
      if (!active) throw new EstimateNotFoundError(estimateId);
      targetId = active.id;
    }

    // Capítulos ACTIVOS de la versión (orden BOQ).
    const { data: chData, error: chErr } = await supabase
      .from('chapters')
      .select('id, code, name, sort_order, archived_at')
      .eq('estimate_version_id', targetId)
      .order('sort_order', { ascending: true });
    if (chErr) throw new Error(`chapter_list_failed: ${chErr.code ?? 'unknown'}`);
    const chapters = (chData ?? []) as Array<{
      id: string; code: string; name: string; sort_order: number; archived_at: string | null;
    }>;
    const chapterById = new Map(chapters.filter((c) => !c.archived_at).map((c) => [c.id, c]));

    // Ítems BOQ ACTIVOS con su plantilla APU (orden por ítem).
    const { data: itData, error: itErr } = await supabase
      .from('boq_items')
      .select('chapter_id, code, description_snapshot, sort_order, apu_template_id, archived_at')
      .eq('estimate_version_id', targetId)
      .order('sort_order', { ascending: true });
    if (itErr) throw new Error(`item_list_failed: ${itErr.code ?? 'unknown'}`);
    const items = (itData ?? []) as Array<{
      chapter_id: string; code: string; description_snapshot: string;
      sort_order: number; apu_template_id: string | null; archived_at: string | null;
    }>;

    const rows: import('@/lib/estimates/apu-export-types').VersionApuLinkRow[] = [];
    for (const it of items) {
      if (it.archived_at) continue; // ítem archivado fuera de la vista activa
      const ch = chapterById.get(it.chapter_id);
      if (!ch) continue; // capítulo archivado/inexistente ⇒ ítem excluido
      rows.push({
        chapterCode: ch.code,
        chapterName: ch.name,
        chapterSortOrder: ch.sort_order,
        itemCode: it.code,
        itemDescription: it.description_snapshot,
        itemSortOrder: it.sort_order,
        apuTemplateId: it.apu_template_id,
      });
    }
    // Orden BOQ determinístico: capítulo, luego ítem.
    rows.sort((a, b) =>
      a.chapterSortOrder - b.chapterSortOrder || a.itemSortOrder - b.itemSortOrder,
    );
    return rows;
  }

  /* ----------------------------------------------------------------------
   * Edición manual de BOQ (Oleada 4E.2A).
   * Versión activa + editabilidad derivadas server-side; subtotal forzado por
   * el trigger DB-level + recálculo en cliente (defensa en profundidad).
   * -------------------------------------------------------------------- */

  /** Versión activa editable (lanza si no existe o está bloqueada). */
  private async assertEditableActiveVersion(
    viewer: ViewerContext,
    estimateId: Uuid,
  ): Promise<EstimateActiveVersionView> {
    const active = await this.getEstimateActiveVersion(viewer, estimateId);
    if (!active) throw new EstimateNotFoundError(estimateId);
    if (LOCKED_STATUSES.includes(active.status)) throw new BoqVersionLockedError();
    return active;
  }

  /** Siguiente sort_order (append) para capítulos de una versión. */
  private async nextChapterSortOrder(supabase: SupabaseClient, versionId: string): Promise<number> {
    const { data, error } = await supabase
      .from('chapters')
      .select('sort_order')
      .eq('estimate_version_id', versionId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`chapter_sort_failed: ${error.code ?? 'unknown'}`);
    return (data ? (data as { sort_order: number }).sort_order : -1) + 1;
  }

  /** Siguiente sort_order (append) para ítems de un capítulo. */
  private async nextItemSortOrder(supabase: SupabaseClient, chapterId: string): Promise<number> {
    const { data, error } = await supabase
      .from('boq_items')
      .select('sort_order')
      .eq('chapter_id', chapterId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`item_sort_failed: ${error.code ?? 'unknown'}`);
    return (data ? (data as { sort_order: number }).sort_order : -1) + 1;
  }

  /** Verifica que el capítulo pertenezca a la versión (RLS ⇒ org). */
  private async assertChapterInVersion(
    supabase: SupabaseClient,
    chapterId: Uuid,
    versionId: string,
  ): Promise<void> {
    const { data, error } = await supabase
      .from('chapters')
      .select('id, estimate_version_id')
      .eq('id', chapterId)
      .maybeSingle();
    if (error) throw new Error(`chapter_read_failed: ${error.code ?? 'unknown'}`);
    if (!data || (data as { estimate_version_id: string }).estimate_version_id !== versionId) {
      throw new ChapterNotFoundError(chapterId);
    }
  }

  async createEstimateChapter(
    viewer: AuthenticatedViewer,
    estimateId: Uuid,
    input: ChapterInput,
  ): Promise<ChapterMutationResult> {
    const normalized = validateChapterInput(input);
    const active = await this.assertEditableActiveVersion(viewer, estimateId);
    const supabase = await this.clientFactory();
    const sortOrder = await this.nextChapterSortOrder(supabase, active.id);
    const { data, error } = await supabase
      .from('chapters')
      .insert({
        estimate_version_id: active.id,
        code: normalized.code,
        name: normalized.name,
        sort_order: sortOrder,
      })
      .select('id')
      .single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new ChapterCodeDuplicateError();
      throw new Error(`chapter_create_failed: ${error.code ?? 'unknown'}`);
    }
    const financial = await this.calculateEstimateFinancialSummary(viewer, estimateId);
    return { chapterId: (data as { id: string }).id, financial };
  }

  async updateEstimateChapter(
    viewer: AuthenticatedViewer,
    estimateId: Uuid,
    chapterId: Uuid,
    input: ChapterInput,
  ): Promise<ChapterMutationResult> {
    const normalized = validateChapterInput(input);
    const active = await this.assertEditableActiveVersion(viewer, estimateId);
    const supabase = await this.clientFactory();
    await this.assertChapterInVersion(supabase, chapterId, active.id);
    // NO se tocan source_code/source_row (trazabilidad de origen intacta).
    const { error } = await supabase
      .from('chapters')
      .update({ code: normalized.code, name: normalized.name })
      .eq('id', chapterId);
    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new ChapterCodeDuplicateError();
      throw new Error(`chapter_update_failed: ${error.code ?? 'unknown'}`);
    }
    const financial = await this.calculateEstimateFinancialSummary(viewer, estimateId);
    return { chapterId, financial };
  }

  async getEditableEstimateChapter(
    viewer: ViewerContext,
    estimateId: Uuid,
    chapterId: Uuid,
  ): Promise<EditableChapterView> {
    const active = await this.getEstimateActiveVersion(viewer, estimateId);
    if (!active) throw new EstimateNotFoundError(estimateId);
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('chapters')
      .select('id, code, name, source_code, source_row, estimate_version_id')
      .eq('id', chapterId)
      .maybeSingle();
    if (error) throw new Error(`chapter_read_failed: ${error.code ?? 'unknown'}`);
    const r = data as
      | { id: string; code: string; name: string; source_code: string | null; source_row: number | null; estimate_version_id: string }
      | null;
    if (!r || r.estimate_version_id !== active.id) throw new ChapterNotFoundError(chapterId);
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      sourceCode: r.source_code ?? null,
      sourceRow: r.source_row ?? null,
      isManual: r.source_code === null && r.source_row === null,
      editable: !LOCKED_STATUSES.includes(active.status),
      estimateId,
      versionNumber: active.versionNumber,
    };
  }

  async createBoqItem(
    viewer: AuthenticatedViewer,
    estimateId: Uuid,
    chapterId: Uuid,
    input: BoqItemInput,
  ): Promise<BoqItemMutationResult> {
    const normalized = validateBoqItemInput(input);
    const active = await this.assertEditableActiveVersion(viewer, estimateId);
    const supabase = await this.clientFactory();
    await this.assertChapterInVersion(supabase, chapterId, active.id);
    const sortOrder = await this.nextItemSortOrder(supabase, chapterId);
    const subtotal = deriveSubtotal(normalized.quantity, normalized.unitPrice);
    const { data, error } = await supabase
      .from('boq_items')
      .insert({
        estimate_version_id: active.id,
        chapter_id: chapterId,
        code: normalized.code,
        description_snapshot: normalized.description,
        unit_snapshot: normalized.unit,
        quantity_snapshot: normalized.quantity,
        unit_price_snapshot: normalized.unitPrice,
        subtotal, // el trigger DB lo re-fuerza; aquí va el valor derivado.
        sort_order: sortOrder,
      })
      .select('id, subtotal')
      .single();
    if (error) throw new Error(`item_create_failed: ${error.code ?? 'unknown'}`);
    const financial = await this.calculateEstimateFinancialSummary(viewer, estimateId);
    const row = data as { id: string; subtotal: string };
    return { itemId: row.id, chapterId, subtotal: row.subtotal, financial };
  }

  async updateBoqItem(
    viewer: AuthenticatedViewer,
    estimateId: Uuid,
    chapterId: Uuid,
    itemId: Uuid,
    input: BoqItemUpdateInput,
  ): Promise<BoqItemMutationResult> {
    const normalized = validateBoqItemUpdate(input);
    const active = await this.assertEditableActiveVersion(viewer, estimateId);
    const supabase = await this.clientFactory();

    const { data: itemRow, error: itemErr } = await supabase
      .from('boq_items')
      .select('id, chapter_id, estimate_version_id')
      .eq('id', itemId)
      .maybeSingle();
    if (itemErr) throw new Error(`item_read_failed: ${itemErr.code ?? 'unknown'}`);
    const it = itemRow as { id: string; chapter_id: string; estimate_version_id: string } | null;
    if (!it || it.estimate_version_id !== active.id || it.chapter_id !== chapterId) {
      throw new BoqItemNotFoundError(itemId);
    }

    const update: Record<string, unknown> = {
      code: normalized.code,
      description_snapshot: normalized.description,
      unit_snapshot: normalized.unit,
      quantity_snapshot: normalized.quantity,
      unit_price_snapshot: normalized.unitPrice,
      subtotal: deriveSubtotal(normalized.quantity, normalized.unitPrice),
    };

    let finalChapterId: Uuid = chapterId;
    if (normalized.targetChapterId && normalized.targetChapterId !== chapterId) {
      const { data: tgt, error: tgtErr } = await supabase
        .from('chapters')
        .select('id, estimate_version_id')
        .eq('id', normalized.targetChapterId)
        .maybeSingle();
      if (tgtErr) throw new Error(`chapter_read_failed: ${tgtErr.code ?? 'unknown'}`);
      if (!tgt || (tgt as { estimate_version_id: string }).estimate_version_id !== active.id) {
        throw new TargetChapterNotFoundError();
      }
      update.chapter_id = normalized.targetChapterId;
      update.sort_order = await this.nextItemSortOrder(supabase, normalized.targetChapterId);
      finalChapterId = normalized.targetChapterId;
    }

    const { data, error } = await supabase
      .from('boq_items')
      .update(update)
      .eq('id', itemId)
      .select('subtotal')
      .single();
    if (error) throw new Error(`item_update_failed: ${error.code ?? 'unknown'}`);
    const financial = await this.calculateEstimateFinancialSummary(viewer, estimateId);
    return { itemId, chapterId: finalChapterId, subtotal: (data as { subtotal: string }).subtotal, financial };
  }

  async getEditableBoqItem(
    viewer: ViewerContext,
    estimateId: Uuid,
    chapterId: Uuid,
    itemId: Uuid,
  ): Promise<EditableBoqItemView> {
    const active = await this.getEstimateActiveVersion(viewer, estimateId);
    if (!active) throw new EstimateNotFoundError(estimateId);
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('boq_items')
      .select(
        'id, chapter_id, code, description_snapshot, unit_snapshot, quantity_snapshot, ' +
          'unit_price_snapshot, subtotal, source_code, source_row, estimate_version_id, chapters(code)',
      )
      .eq('id', itemId)
      .maybeSingle();
    if (error) throw new Error(`item_read_failed: ${error.code ?? 'unknown'}`);
    const r = data as
      | {
          id: string; chapter_id: string; code: string; description_snapshot: string;
          unit_snapshot: string; quantity_snapshot: string; unit_price_snapshot: string;
          subtotal: string; source_code: string | null; source_row: number | null;
          estimate_version_id: string; chapters: { code: string } | null;
        }
      | null;
    if (!r || r.estimate_version_id !== active.id || r.chapter_id !== chapterId) {
      throw new BoqItemNotFoundError(itemId);
    }

    const { data: chs, error: chErr } = await supabase
      .from('chapters')
      .select('id, code, name')
      .eq('estimate_version_id', active.id)
      .order('sort_order', { ascending: true });
    if (chErr) throw new Error(`chapter_list_failed: ${chErr.code ?? 'unknown'}`);
    const availableChapters = (chs ?? []).map((c) => {
      const cc = c as { id: string; code: string; name: string };
      return { id: cc.id, code: cc.code, name: cc.name };
    });

    return {
      id: r.id,
      chapterId: r.chapter_id,
      chapterCode: r.chapters?.code ?? '',
      code: r.code,
      description: r.description_snapshot,
      unit: r.unit_snapshot,
      quantity: r.quantity_snapshot,
      unitPrice: r.unit_price_snapshot,
      subtotal: r.subtotal,
      sourceCode: r.source_code ?? null,
      sourceRow: r.source_row ?? null,
      isManual: r.source_code === null && r.source_row === null,
      editable: !LOCKED_STATUSES.includes(active.status),
      versionNumber: active.versionNumber,
      availableChapters,
    };
  }

  /* ----------------------------------------------------------------------
   * Archive / restore no destructivo (Oleada 4E.2B).
   * `archived_by` = identidad autenticada (server-side). Versión emitida ⇒
   * `assertEditableActiveVersion` lanza `BoqVersionLockedError`. RLS bloquea
   * cross-org y versiones emitidas también a nivel DB.
   * -------------------------------------------------------------------- */

  async archiveEstimateChapter(
    viewer: AuthenticatedViewer,
    estimateId: Uuid,
    chapterId: Uuid,
  ): Promise<ChapterMutationResult> {
    const active = await this.assertEditableActiveVersion(viewer, estimateId);
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('chapters')
      .select('id, estimate_version_id, archived_at')
      .eq('id', chapterId)
      .maybeSingle();
    if (error) throw new Error(`chapter_read_failed: ${error.code ?? 'unknown'}`);
    const r = data as { id: string; estimate_version_id: string; archived_at: string | null } | null;
    if (!r || r.estimate_version_id !== active.id) throw new ChapterNotFoundError(chapterId);
    if (r.archived_at) throw new BoqAlreadyArchivedError();
    const { error: upErr } = await supabase
      .from('chapters')
      .update({ archived_at: new Date().toISOString(), archived_by: viewer.userId })
      .eq('id', chapterId);
    if (upErr) throw new Error(`chapter_archive_failed: ${upErr.code ?? 'unknown'}`);
    const financial = await this.calculateEstimateFinancialSummary(viewer, estimateId);
    return { chapterId, financial };
  }

  async restoreEstimateChapter(
    viewer: AuthenticatedViewer,
    estimateId: Uuid,
    chapterId: Uuid,
  ): Promise<ChapterMutationResult> {
    const active = await this.assertEditableActiveVersion(viewer, estimateId);
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('chapters')
      .select('id, estimate_version_id, archived_at')
      .eq('id', chapterId)
      .maybeSingle();
    if (error) throw new Error(`chapter_read_failed: ${error.code ?? 'unknown'}`);
    const r = data as { id: string; estimate_version_id: string; archived_at: string | null } | null;
    if (!r || r.estimate_version_id !== active.id) throw new ChapterNotFoundError(chapterId);
    if (!r.archived_at) throw new BoqNotArchivedError();
    const { error: upErr } = await supabase
      .from('chapters')
      .update({ archived_at: null, archived_by: null })
      .eq('id', chapterId);
    if (upErr) throw new Error(`chapter_restore_failed: ${upErr.code ?? 'unknown'}`);
    const financial = await this.calculateEstimateFinancialSummary(viewer, estimateId);
    return { chapterId, financial };
  }

  async archiveBoqItem(
    viewer: AuthenticatedViewer,
    estimateId: Uuid,
    itemId: Uuid,
  ): Promise<BoqItemArchiveResult> {
    const active = await this.assertEditableActiveVersion(viewer, estimateId);
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('boq_items')
      .select('id, estimate_version_id, archived_at')
      .eq('id', itemId)
      .maybeSingle();
    if (error) throw new Error(`item_read_failed: ${error.code ?? 'unknown'}`);
    const r = data as { id: string; estimate_version_id: string; archived_at: string | null } | null;
    if (!r || r.estimate_version_id !== active.id) throw new BoqItemNotFoundError(itemId);
    if (r.archived_at) throw new BoqAlreadyArchivedError();
    const { error: upErr } = await supabase
      .from('boq_items')
      .update({ archived_at: new Date().toISOString(), archived_by: viewer.userId })
      .eq('id', itemId);
    if (upErr) throw new Error(`item_archive_failed: ${upErr.code ?? 'unknown'}`);
    const financial = await this.calculateEstimateFinancialSummary(viewer, estimateId);
    return { itemId, financial };
  }

  async restoreBoqItem(
    viewer: AuthenticatedViewer,
    estimateId: Uuid,
    itemId: Uuid,
  ): Promise<BoqItemArchiveResult> {
    const active = await this.assertEditableActiveVersion(viewer, estimateId);
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('boq_items')
      .select('id, estimate_version_id, archived_at')
      .eq('id', itemId)
      .maybeSingle();
    if (error) throw new Error(`item_read_failed: ${error.code ?? 'unknown'}`);
    const r = data as { id: string; estimate_version_id: string; archived_at: string | null } | null;
    if (!r || r.estimate_version_id !== active.id) throw new BoqItemNotFoundError(itemId);
    if (!r.archived_at) throw new BoqNotArchivedError();
    const { error: upErr } = await supabase
      .from('boq_items')
      .update({ archived_at: null, archived_by: null })
      .eq('id', itemId);
    if (upErr) throw new Error(`item_restore_failed: ${upErr.code ?? 'unknown'}`);
    const financial = await this.calculateEstimateFinancialSummary(viewer, estimateId);
    return { itemId, financial };
  }

  /* ----------------------------------------------------------------------
   * Emisión / clonación de versiones (Oleada 4E.3A).
   * -------------------------------------------------------------------- */

  /** Resumen financiero (directo + total) de una versión concreta. */
  private async versionSummaryRow(
    supabase: SupabaseClient,
    row: {
      id: string; version_number: number; status: string; issued_at: string | null;
      issued_by: string | null; created_at: string | null; source_version_id: string | null;
    },
    isActive: boolean,
  ): Promise<EstimateVersionSummary> {
    const rollup = await this.versionRollup(supabase, row.id);
    const { fractions } = await this.readAiuFractions(supabase, row.id);
    const financial = computeFinancialSummary(rollup.directTotal, fractions);
    return {
      id: row.id,
      versionNumber: row.version_number,
      status: row.status as EstimateVersionSummary['status'],
      isActive,
      editable: !LOCKED_STATUSES.includes(row.status),
      issuedAt: row.issued_at,
      issuedBy: row.issued_by,
      createdAt: row.created_at,
      sourceVersionId: row.source_version_id,
      directTotal: rollup.directTotal,
      grandTotal: financial.grandTotal,
    };
  }

  async countIssuedEstimateVersions(viewer: ViewerContext): Promise<number> {
    void viewer; // RLS limita las versiones visibles a la org del viewer.
    const supabase = await this.clientFactory();
    const { count, error } = await supabase
      .from('estimate_versions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'issued');
    if (error) throw new Error(`estimate_versions_count_failed: ${error.code ?? 'unknown'}`);
    return count ?? 0;
  }

  async listEstimateVersions(
    viewer: ViewerContext,
    estimateId: Uuid,
  ): Promise<EstimateVersionSummary[]> {
    void viewer;
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('estimate_versions')
      .select('id, version_number, status, issued_at, issued_by, created_at, source_version_id')
      .eq('estimate_id', estimateId)
      .order('version_number', { ascending: true });
    if (error) throw new Error(`estimate_versions_list_failed: ${error.code ?? 'unknown'}`);
    const rows = (data ?? []) as {
      id: string; version_number: number; status: string; issued_at: string | null;
      issued_by: string | null; created_at: string | null; source_version_id: string | null;
    }[];
    const maxNum = rows.reduce((m, r) => Math.max(m, r.version_number), 0);
    return Promise.all(rows.map((r) => this.versionSummaryRow(supabase, r, r.version_number === maxNum)));
  }

  async issueEstimateVersion(
    viewer: AuthenticatedViewer,
    estimateId: Uuid,
  ): Promise<EstimateVersionSummary> {
    const active = await this.getEstimateActiveVersion(viewer, estimateId);
    if (!active) throw new EstimateNotFoundError(estimateId);
    if (active.status !== 'draft') throw new VersionNotDraftError();
    const supabase = await this.clientFactory();
    const { error } = await supabase
      .from('estimate_versions')
      .update({ status: 'issued', issued_at: new Date().toISOString(), issued_by: viewer.userId })
      .eq('id', active.id);
    if (error) throw new Error(`estimate_version_issue_failed: ${error.code ?? 'unknown'}`);
    const { data, error: readErr } = await supabase
      .from('estimate_versions')
      .select('id, version_number, status, issued_at, issued_by, created_at, source_version_id')
      .eq('id', active.id)
      .single();
    if (readErr) throw new Error(`estimate_version_read_failed: ${readErr.code ?? 'unknown'}`);
    return this.versionSummaryRow(supabase, data as Parameters<typeof this.versionSummaryRow>[1], true);
  }

  async cloneIssuedEstimateVersion(
    viewer: AuthenticatedViewer,
    estimateId: Uuid,
  ): Promise<EstimateVersionSummary> {
    void viewer;
    const active = await this.getEstimateActiveVersion(viewer, estimateId);
    if (!active) throw new EstimateNotFoundError(estimateId);
    if (active.status !== 'issued') throw new VersionNotIssuedError();
    const supabase = await this.clientFactory();
    const { data, error } = await supabase.rpc('clone_issued_estimate_version', {
      p_version_id: active.id,
    });
    if (error) {
      if (typeof error.message === 'string' && error.message.includes('version_not_issued')) {
        throw new VersionNotIssuedError();
      }
      throw new Error(`estimate_version_clone_failed: ${error.code ?? 'unknown'}`);
    }
    const newId = (Array.isArray(data) ? data[0] : data) as string;
    const { data: row, error: readErr } = await supabase
      .from('estimate_versions')
      .select('id, version_number, status, issued_at, issued_by, created_at, source_version_id')
      .eq('id', newId)
      .single();
    if (readErr) throw new Error(`estimate_version_read_failed: ${readErr.code ?? 'unknown'}`);
    return this.versionSummaryRow(supabase, row as Parameters<typeof this.versionSummaryRow>[1], true);
  }

  /* ----------------------------------------------------------------------
   * Comparación de versiones (Oleada 4E.3B, READ-ONLY).
   * -------------------------------------------------------------------- */

  /** Snapshot de una versión (capítulos + ítems incl. archivados + financiero). */
  private async buildCompareSnapshot(
    viewer: ViewerContext,
    supabase: SupabaseClient,
    estimateId: Uuid,
    versionId: Uuid,
  ): Promise<VersionSnapshot> {
    const { data, error } = await supabase
      .from('estimate_versions')
      .select('id, version_number, status, estimate_id')
      .eq('id', versionId)
      .maybeSingle();
    if (error) throw new Error(`estimate_version_read_failed: ${error.code ?? 'unknown'}`);
    const v = data as { id: string; version_number: number; status: string; estimate_id: string } | null;
    if (!v) throw new EstimateNotFoundError(estimateId);
    if (v.estimate_id !== estimateId) throw new VersionMismatchError();

    const chapters = await this.listChaptersForVersion(supabase, versionId, true);
    const items: CompareItemInput[] = [];
    for (const ch of chapters) {
      const its = await this.listItemsByChapter(viewer, ch.id, { includeArchived: true });
      for (const it of its) {
        items.push({
          id: it.id,
          chapterCode: ch.code,
          code: it.code,
          description: it.description,
          unit: it.unit,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          subtotal: it.subtotal,
          archived: it.archived,
          sortOrder: it.sortOrder,
        });
      }
    }
    const rollup = await this.versionRollup(supabase, versionId);
    const { fractions } = await this.readAiuFractions(supabase, versionId);
    const financial = computeFinancialSummary(rollup.directTotal, fractions);
    return {
      ref: { id: v.id, versionNumber: v.version_number, status: v.status as VersionSnapshot['ref']['status'] },
      financial,
      chapters: chapters.map((c) => ({
        code: c.code,
        name: c.name,
        archived: c.archived,
        subtotal: c.subtotal,
        sortOrder: c.sortOrder,
      })),
      items,
    };
  }

  async compareEstimateVersions(
    viewer: ViewerContext,
    estimateId: Uuid,
    baseVersionId: Uuid,
    targetVersionId: Uuid,
  ): Promise<VersionCompareResult> {
    const supabase = await this.clientFactory();
    // Defensa: ambas versiones del mismo estimate (RLS ⇒ cross-org Not-Found).
    const base = await this.buildCompareSnapshot(viewer, supabase, estimateId, baseVersionId);
    const target = await this.buildCompareSnapshot(viewer, supabase, estimateId, targetVersionId);
    return computeVersionComparison(estimateId, base, target);
  }
}
