/**
 * drizzle-repository.ts — Implementación del `ReadModelPort` sobre PostgreSQL
 * (Supabase local) vía Drizzle.
 *
 * Propiedad: agent-db-rls. Contrato: `docs/READ_MODEL_CONTRACT.md §2.B`.
 *
 * - Usa las tablas existentes vía `DrizzleReadRepository` (sólo lectura).
 * - Respeta `organizationId`/RLS: las consultas filtran explícitamente por la
 *   organización del viewer y, en runtime, RLS es la barrera real.
 * - NO conecta una base remota; preparado para Postgres local. El selector
 *   (`index.ts`) valida la configuración antes de instanciarlo, por lo que NO
 *   se activa silenciosamente sin config.
 * - Los totales financieros se derivan con cost-domain (`computeEstimate`),
 *   nunca se reimplementan fórmulas aquí.
 * - Aplica la proyección por rol antes de devolver el dashboard.
 */

import type {
  ApuSummary,
  BoqItemView,
  CatalogResourceView,
  ChapterSummary,
  DashboardSummary,
  EstimateSummary,
  ProjectListItem,
  ProjectOverview,
  QuantityGroupView,
  ReadModelPort,
  Uuid,
  ViewerContext,
} from '@/lib/contracts/read-model';
import { DrizzleReadRepository } from '@/server/repositories/read-repository';
import {
  computeApuUnitCost,
  computeDashboard,
  computeEstimate,
  type EstimateComputation,
  type EstimateComputationInput,
  type RawBoqItem,
  type RawChapter,
  type RawIndirectRule,
} from './compute';
import { projectDashboardForRole } from './types';
import { EstimateVersionNotFoundError, ProjectNotFoundError } from './errors';

/** Estado de la versión tal cual viene del esquema. */
type VersionStatus = EstimateSummary['status'];

/**
 * `ReadModelPort` sobre Drizzle. Inyecta un `DrizzleReadRepository` (por defecto
 * el real); en tests puede inyectarse uno sobre un Drizzle simulado.
 */
export class DrizzleReadModelRepository implements ReadModelPort {
  /** Identificador legible del modo activo (para logging). */
  readonly source = 'db' as const;

  private readonly repo: DrizzleReadRepository;

  constructor(repo: DrizzleReadRepository = new DrizzleReadRepository()) {
    this.repo = repo;
  }

  /** Construye la entrada de cómputo de una versión a partir de filas Drizzle. */
  private async loadComputationInput(
    versionId: Uuid,
    estimateId: Uuid,
    versionNumber: number,
    status: VersionStatus,
    lastUpdatedAt: string,
    builtArea: string | null,
  ): Promise<EstimateComputationInput> {
    const [chapters, items, rules] = await Promise.all([
      this.repo.chaptersByVersion(versionId),
      this.repo.boqItemsByVersion(versionId),
      this.repo.indirectRulesByVersion(versionId),
    ]);

    const rawChapters: RawChapter[] = chapters.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      sortOrder: c.sortOrder,
    }));
    const rawItems: RawBoqItem[] = items.map((it) => ({
      id: it.id,
      chapterId: it.chapterId,
      code: it.code,
      descriptionSnapshot: it.descriptionSnapshot,
      unitSnapshot: it.unitSnapshot,
      quantitySnapshot: it.quantitySnapshot,
      unitPriceSnapshot: it.unitPriceSnapshot,
      subtotal: it.subtotal,
      sortOrder: it.sortOrder,
    }));
    const rawRules: RawIndirectRule[] = rules.map((r) => ({
      code: r.code,
      name: r.name,
      percentage: r.percentage,
      baseType: r.baseType as RawIndirectRule['baseType'],
      sortOrder: r.sortOrder,
      visibleToClient: r.visibleToClient,
    }));

    return {
      estimateId,
      versionId,
      versionNumber,
      status,
      chapters: rawChapters,
      items: rawItems,
      indirectRules: rawRules,
      builtArea,
      lastUpdatedAt,
    };
  }

  /**
   * Resuelve la versión vigente de un proyecto: el mayor `versionNumber` entre
   * todas las versiones de los presupuestos de los alcances del proyecto.
   * Devuelve `null` si el proyecto no tiene presupuestos/versiones.
   */
  private async resolveCurrentVersionInput(
    organizationId: Uuid,
    projectId: Uuid,
  ): Promise<EstimateComputationInput | null> {
    const scopes = await this.repo.scopesByProject(projectId);
    const estimates = await this.repo.estimatesByScopes(scopes.map((s) => s.id));
    const versions = await this.repo.versionsByEstimates(estimates.map((e) => e.id));
    if (versions.length === 0) return null;

    // El proyecto ya fue validado por organización en el caller; aquí sólo se
    // resuelve la versión vigente (mayor versionNumber).
    void organizationId;
    void projectId;
    const current = [...versions].sort((a, b) => b.versionNumber - a.versionNumber)[0]!;
    const builtArea = null; // el área vive en cantidades/snapshot; no en el esquema base.
    return this.loadComputationInput(
      current.id,
      current.estimateId,
      current.versionNumber,
      current.status as VersionStatus,
      (current.approvedAt ?? current.createdAt ?? new Date()).toString(),
      builtArea,
    );
  }

  async listProjects(viewer: ViewerContext): Promise<ProjectListItem[]> {
    const projects = await this.repo.projects(viewer.organizationId);
    if (projects.length === 0) return [];

    const projectIds = projects.map((p) => p.id);
    const scopes = await this.repo.scopesByProjects(projectIds);
    const scopeCount = new Map<Uuid, number>();
    const scopeIdsByProject = new Map<Uuid, Uuid[]>();
    for (const s of scopes) {
      scopeCount.set(s.projectId, (scopeCount.get(s.projectId) ?? 0) + 1);
      const bucket = scopeIdsByProject.get(s.projectId) ?? [];
      bucket.push(s.id);
      scopeIdsByProject.set(s.projectId, bucket);
    }

    const allScopeIds = scopes.map((s) => s.id);
    const estimates = await this.repo.estimatesByScopes(allScopeIds);
    const estimateCount = new Map<Uuid, number>();
    for (const e of estimates) {
      // Contar por proyecto vía el alcance.
      const projId = scopes.find((s) => s.id === e.projectScopeId)?.projectId;
      if (projId) estimateCount.set(projId, (estimateCount.get(projId) ?? 0) + 1);
    }

    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status as ProjectListItem['status'],
      location: p.location ?? null,
      createdAt: (p.createdAt ?? new Date()).toString(),
      scopeCount: scopeCount.get(p.id) ?? 0,
      estimateCount: estimateCount.get(p.id) ?? 0,
    }));
  }

  async getProjectOverview(
    viewer: ViewerContext,
    projectId: Uuid,
  ): Promise<ProjectOverview> {
    const project = await this.repo.projectById(viewer.organizationId, projectId);
    if (!project) throw new ProjectNotFoundError(projectId);

    const scopes = await this.repo.scopesByProject(projectId);
    const estimates = await this.repo.estimatesByScopes(scopes.map((s) => s.id));
    const projectListItem: ProjectListItem = {
      id: project.id,
      name: project.name,
      status: project.status as ProjectListItem['status'],
      location: project.location ?? null,
      createdAt: (project.createdAt ?? new Date()).toString(),
      scopeCount: scopes.length,
      estimateCount: estimates.length,
    };

    const input = await this.resolveCurrentVersionInput(viewer.organizationId, projectId);
    const summary = input ? computeEstimate(input).summary : emptySummary();

    return {
      project: projectListItem,
      scopes: scopes.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        scopeType: s.scopeType as ProjectOverview['scopes'][number]['scopeType'],
      })),
      ...(input ? { currentEstimateVersion: summary } : {}),
      budgetSummary: summary,
    };
  }

  async listEstimates(
    viewer: ViewerContext,
    projectId?: Uuid,
  ): Promise<EstimateSummary[]> {
    const projects = projectId
      ? [await this.repo.projectById(viewer.organizationId, projectId)].filter(
          (p): p is NonNullable<typeof p> => p !== null,
        )
      : await this.repo.projects(viewer.organizationId);
    if (projects.length === 0) return [];

    const scopes = await this.repo.scopesByProjects(projects.map((p) => p.id));
    const estimates = await this.repo.estimatesByScopes(scopes.map((s) => s.id));
    const versions = await this.repo.versionsByEstimates(estimates.map((e) => e.id));

    const summaries: EstimateSummary[] = [];
    for (const v of versions) {
      const input = await this.loadComputationInput(
        v.id,
        v.estimateId,
        v.versionNumber,
        v.status as VersionStatus,
        (v.approvedAt ?? v.createdAt ?? new Date()).toString(),
        null,
      );
      summaries.push(computeEstimate(input).summary);
    }
    return summaries;
  }

  async getEstimateDetail(
    viewer: ViewerContext,
    estimateVersionId: Uuid,
  ): Promise<{ estimate: EstimateSummary; chapters: ChapterSummary[]; items: BoqItemView[] }> {
    const version = await this.repo.versionById(estimateVersionId);
    if (!version) throw new EstimateVersionNotFoundError(estimateVersionId);

    // Verificar pertenencia a la organización del viewer vía la cadena
    // estimate → scope → project.organizationId.
    const estimate = await this.repo.estimateById(version.estimateId);
    if (!estimate) throw new EstimateVersionNotFoundError(estimateVersionId);
    const scope = await this.repo.scopeById(estimate.projectScopeId);
    if (!scope) throw new EstimateVersionNotFoundError(estimateVersionId);
    const project = await this.repo.projectById(viewer.organizationId, scope.projectId);
    if (!project) throw new EstimateVersionNotFoundError(estimateVersionId);

    const input = await this.loadComputationInput(
      version.id,
      version.estimateId,
      version.versionNumber,
      version.status as VersionStatus,
      (version.approvedAt ?? version.createdAt ?? new Date()).toString(),
      null,
    );
    const computation: EstimateComputation = computeEstimate(input);

    const items: BoqItemView[] = (await this.repo.boqItemsByVersion(version.id))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((it) => ({
        id: it.id,
        chapterId: it.chapterId,
        code: it.code,
        description: it.descriptionSnapshot,
        unit: it.unitSnapshot,
        quantity: it.quantitySnapshot,
        unitPrice: it.unitPriceSnapshot,
        subtotal: it.subtotal,
      }));

    return { estimate: computation.summary, chapters: computation.chapters, items };
  }

  async listApus(viewer: ViewerContext): Promise<ApuSummary[]> {
    const templates = await this.repo.apuTemplates(viewer.organizationId);
    if (templates.length === 0) return [];
    const components = await this.repo.apuComponentsByTemplates(templates.map((t) => t.id));
    const byTemplate = new Map<Uuid, string[]>();
    for (const c of components) {
      const bucket = byTemplate.get(c.apuTemplateId) ?? [];
      bucket.push(c.totalComponentCost);
      byTemplate.set(c.apuTemplateId, bucket);
    }
    return templates.map((t) => {
      const costs = byTemplate.get(t.id) ?? [];
      return {
        id: t.id,
        code: t.code,
        name: t.name,
        unit: t.unit,
        unitCost: computeApuUnitCost(costs),
        componentCount: costs.length,
      };
    });
  }

  async listQuantities(
    viewer: ViewerContext,
    projectScopeId?: Uuid,
  ): Promise<QuantityGroupView[]> {
    // Restringir a alcances de la organización del viewer.
    const projects = await this.repo.projects(viewer.organizationId);
    const scopes = await this.repo.scopesByProjects(projects.map((p) => p.id));
    const allowedScopeIds = new Set(scopes.map((s) => s.id));
    const scopeIds = projectScopeId
      ? allowedScopeIds.has(projectScopeId)
        ? [projectScopeId]
        : []
      : [...allowedScopeIds];
    if (scopeIds.length === 0) return [];

    const groups = await this.repo.quantityGroupsByScopes(scopeIds);
    const lines = await this.repo.quantityLinesByGroups(groups.map((g) => g.id));
    const linesByGroup = new Map<Uuid, typeof lines>();
    for (const l of lines) {
      const bucket = linesByGroup.get(l.quantityGroupId) ?? [];
      bucket.push(l);
      linesByGroup.set(l.quantityGroupId, bucket);
    }
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      lines: (linesByGroup.get(g.id) ?? [])
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((l) => ({
          id: l.id,
          description: l.description ?? '',
          calculatedQuantity: l.calculatedQuantity,
        })),
    }));
  }

  async listCatalogResources(viewer: ViewerContext): Promise<CatalogResourceView[]> {
    const resources = await this.repo.resources(viewer.organizationId);
    return resources.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      resourceType: r.resourceType as CatalogResourceView['resourceType'],
      unit: r.unit,
      // budgetReferencePrice se resuelve vía PricingReadPort, no aquí.
    }));
  }

  async getDashboardSummary(
    viewer: ViewerContext,
    projectId: Uuid,
  ): Promise<DashboardSummary> {
    const project = await this.repo.projectById(viewer.organizationId, projectId);
    if (!project) throw new ProjectNotFoundError(projectId);

    const input = await this.resolveCurrentVersionInput(viewer.organizationId, projectId);
    if (!input) {
      // Proyecto sin versión: dashboard vacío pero válido.
      const empty = emptySummary();
      const full = computeDashboard(
        projectId,
        { summary: empty, chapters: [], chapterDistribution: [] },
        { status: empty.status, lastUpdatedAt: (project.updatedAt ?? new Date()).toString() },
      );
      return projectDashboardForRole(full, viewer.role);
    }
    const computation = computeEstimate(input);
    const full = computeDashboard(projectId, computation, {
      status: input.status,
      lastUpdatedAt: input.lastUpdatedAt,
    });
    return projectDashboardForRole(full, viewer.role);
  }
}

/** Resumen vacío para proyectos sin versión vigente. */
function emptySummary(): EstimateSummary {
  return {
    estimateId: '',
    versionId: '',
    versionNumber: 0,
    status: 'draft',
    directCost: '0',
    administration: '0',
    contingency: '0',
    utility: '0',
    taxOnUtility: '0',
    grandTotal: '0',
  };
}
