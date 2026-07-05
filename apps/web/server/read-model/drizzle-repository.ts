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
  ApuDetail,
  ApuSummary,
  BoqItemView,
  CatalogResourceView,
  ChapterSummary,
  DashboardSummary,
  EstimateSummary,
  ProgressEntryView,
  ProjectListItem,
  ProjectOverview,
  QuantityGroupView,
  ReadModelPort,
  ResourceAssignmentView,
  ScheduleSummary,
  ScheduleTaskStatus,
  Uuid,
  ViewerContext,
  WorkspaceGroupView,
} from '@/lib/contracts/read-model';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DrizzleReadRepository, type ReadDb } from '@/server/repositories/read-repository';
import { withTenantDb, buildRlsClaims } from '@/lib/db/rls';
import {
  computeApuDetail,
  computeDashboard,
  computeEstimate,
  summarizeApuComponents,
  type EstimateComputation,
  type EstimateComputationInput,
  type RawApuComponent,
  type RawBoqItem,
  type RawChapter,
  type RawIndirectRule,
} from './compute';
import {
  computeSchedule,
  type RawScheduleTask,
  type RawTaskDependency,
} from './compute-planning';
import {
  projectApuDetailForRole,
  projectDashboardForRole,
  projectProgressEntriesForRole,
  projectResourceAssignmentsForRole,
  projectScheduleForRole,
} from './types';
import {
  ApuNotFoundError,
  EstimateVersionNotFoundError,
  ProjectNotFoundError,
} from './errors';
import {
  resolveCatalogPriceStatus,
  projectPriceStatusForRole,
  type PriceObservationRow,
} from '@/server/catalog/price-status';
import { filterGrantedProjects, isProjectGranted } from './project-grants';

/** Normaliza un valor de fecha/hora de Drizzle a ISO string. */
function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

/** Estado de la versión tal cual viene del esquema. */
type VersionStatus = EstimateSummary['status'];

/**
 * `ReadModelPort` sobre Drizzle. Inyecta un `DrizzleReadRepository` (por defecto
 * el real); en tests puede inyectarse uno sobre un Drizzle simulado.
 */
export class DrizzleReadModelRepository implements ReadModelPort {
  /** Identificador legible del modo activo (para logging). */
  readonly source = 'db' as const;

  /**
   * Repo inyectado (solo en pruebas unitarias, con un `DrizzleReadRepository`
   * de mocks y sin DB). Si está presente, `read()` lo usa directamente sin abrir
   * transacción RLS (las pruebas de RLS reales viven en
   * `scripts/rls-runtime/read-model-isolation.ts` contra la DB local).
   */
  private readonly injectedRepo?: DrizzleReadRepository;

  /**
   * Contexto request-scoped (P1-A / H-01): dentro de `read()` contiene un
   * `DrizzleReadRepository` ligado a una conexión RLS-scoped (rol `authenticated`
   * + claims transaccionales). `AsyncLocalStorage` evita estado global y
   * contaminación entre solicitudes del pool.
   */
  private readonly als = new AsyncLocalStorage<DrizzleReadRepository>();

  constructor(repo?: DrizzleReadRepository) {
    this.injectedRepo = repo;
  }

  /** Repo efectivo: el RLS-scoped del `read()` actual; en test el inyectado. */
  private get repo(): DrizzleReadRepository {
    return this.als.getStore() ?? this.injectedRepo ?? new DrizzleReadRepository();
  }

  /**
   * Ejecuta `fn` con RLS aplicada (P1-A / H-01): en producción abre una
   * transacción READ ONLY request-scoped con `SET LOCAL ROLE authenticated` +
   * claims derivados server-side del `viewer`, expone un repo RLS-scoped vía
   * `AsyncLocalStorage` (consumido por `this.repo` y los helpers) y lo limpia al
   * terminar. Si hay un repo inyectado (pruebas), lo usa sin transacción/DB. Los
   * filtros explícitos por `organizationId` se conservan como segunda barrera.
   */
  private read<T>(viewer: ViewerContext, fn: () => Promise<T>): Promise<T> {
    if (this.injectedRepo) {
      return this.als.run(this.injectedRepo, fn);
    }
    const claims = buildRlsClaims({
      organizationId: viewer.organizationId,
      profileId: viewer.profileId,
      role: viewer.role,
    });
    return withTenantDb(claims, (scopedDb) =>
      // La transacción RLS-scoped expone el mismo interfaz de consulta que `db`
      // (select/from/where); el cast es seguro en runtime.
      this.als.run(new DrizzleReadRepository(scopedDb as unknown as ReadDb), fn),
    );
  }

  /**
   * CHOKE POINT V5.6.4 (CLIENT_PROJECT_SCOPE): proyectos visibles para el
   * viewer. Para `client`, intersecta con `viewer.projectGrants`
   * (deny-by-default); el resto de roles conserva el alcance por organización.
   * TODO acceso a `repo.projects(...)` debe pasar por aquí.
   */
  private async visibleProjects(
    viewer: ViewerContext,
  ): Promise<Awaited<ReturnType<DrizzleReadRepository['projects']>>> {
    const projects = await this.repo.projects(viewer.organizationId);
    return [...filterGrantedProjects(viewer, projects)];
  }

  /**
   * CHOKE POINT V5.6.4: proyecto por id dentro del alcance del viewer.
   * Anti-fuga de existencia: fuera del alcance ⇒ `null`, EXACTAMENTE igual que
   * un id inexistente o de otra organización (el caller lanza el mismo
   * not-found). TODO acceso a `repo.projectById(...)` debe pasar por aquí.
   */
  private async visibleProjectById(
    viewer: ViewerContext,
    projectId: Uuid,
  ): Promise<Awaited<ReturnType<DrizzleReadRepository['projectById']>>> {
    if (!isProjectGranted(viewer, projectId)) return null;
    return this.repo.projectById(viewer.organizationId, projectId);
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
    const chapters = await this.repo.chaptersByVersion(versionId);
    const items = await this.repo.boqItemsByVersion(versionId);
    const rules = await this.repo.indirectRulesByVersion(versionId);

    const rawChapters: RawChapter[] = chapters.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      sortOrder: c.sortOrder,
    }));
    // 4E.2B: `chaptersByVersion`/`boqItemsByVersion` ya excluyen nodos archivados,
    // pero un ítem ACTIVO cuyo capítulo está ARCHIVADO debe excluirse también de
    // los totales (su capítulo ya no está en `rawChapters`).
    const activeChapterIds = new Set(rawChapters.map((c) => c.id));
    const rawItems: RawBoqItem[] = items
      .filter((it) => activeChapterIds.has(it.chapterId))
      .map((it) => ({
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
    return this.read(viewer, async () => {
    const projects = await this.visibleProjects(viewer);
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
    });
  }

  async getProjectOverview(
    viewer: ViewerContext,
    projectId: Uuid,
  ): Promise<ProjectOverview> {
    return this.read(viewer, async () => {
    const project = await this.visibleProjectById(viewer, projectId);
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
    });
  }

  async listEstimates(
    viewer: ViewerContext,
    projectId?: Uuid,
  ): Promise<EstimateSummary[]> {
    return this.read(viewer, async () => {
    const projects = projectId
      ? [await this.visibleProjectById(viewer, projectId)].filter(
          (p): p is NonNullable<typeof p> => p !== null,
        )
      : await this.visibleProjects(viewer);
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
    });
  }

  async getEstimateDetail(
    viewer: ViewerContext,
    estimateVersionId: Uuid,
  ): Promise<{ estimate: EstimateSummary; chapters: ChapterSummary[]; items: BoqItemView[] }> {
    return this.read(viewer, async () => {
    const version = await this.repo.versionById(estimateVersionId);
    if (!version) throw new EstimateVersionNotFoundError(estimateVersionId);

    // Verificar pertenencia a la organización del viewer vía la cadena
    // estimate → scope → project.organizationId.
    const estimate = await this.repo.estimateById(version.estimateId);
    if (!estimate) throw new EstimateVersionNotFoundError(estimateVersionId);
    const scope = await this.repo.scopeById(estimate.projectScopeId);
    if (!scope) throw new EstimateVersionNotFoundError(estimateVersionId);
    // V5.6.4: la cadena versión→estimate→scope→proyecto converge aquí; un
    // proyecto fuera del alcance del viewer produce el MISMO not-found que un
    // id inexistente (anti-fuga de existencia).
    const project = await this.visibleProjectById(viewer, scope.projectId);
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

    // 4E.2B: solo ítems activos de capítulos activos (consistente con totales).
    const activeChapterIds = new Set(computation.chapters.map((c) => c.id));
    const items: BoqItemView[] = (await this.repo.boqItemsByVersion(version.id))
      .filter((it) => activeChapterIds.has(it.chapterId))
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
        apuTemplateId: it.apuTemplateId ?? null,
      }));

    return { estimate: computation.summary, chapters: computation.chapters, items };
    });
  }

  async listApus(viewer: ViewerContext): Promise<ApuSummary[]> {
    return this.read(viewer, async () => {
    const templates = await this.repo.apuTemplates(viewer.organizationId);
    if (templates.length === 0) return [];
    const components = await this.repo.apuComponentsByTemplates(templates.map((t) => t.id));
    const byTemplate = new Map<Uuid, RawApuComponent[]>();
    for (const c of components) {
      const bucket = byTemplate.get(c.apuTemplateId) ?? [];
      bucket.push({
        id: c.id,
        componentType: c.componentType as RawApuComponent['componentType'],
        quantity: c.quantity,
        wastePct: c.wastePct,
        recommendedWastePct: c.recommendedWastePct,
        wastePctSource: c.wastePctSource,
        wastePctNote: c.wastePctNote,
        unitPriceSnapshot: c.unitPriceSnapshot,
        totalComponentCost: c.totalComponentCost,
        sortOrder: c.sortOrder,
      });
      byTemplate.set(c.apuTemplateId, bucket);
    }
    return templates.map((t) => {
      const rows = byTemplate.get(t.id) ?? [];
      // Costo unitario COMPLETO (incluye herramienta menor derivada). Con
      // default_tool_pct=0 coincide exactamente con la suma de componentes.
      const detail = computeApuDetail(
        {
          id: t.id,
          code: t.code,
          name: t.name,
          unit: t.unit,
          version: t.version,
          defaultToolPct: t.defaultToolPct,
        },
        rows,
      );
      const summary = summarizeApuComponents(rows);
      return {
        id: t.id,
        code: t.code,
        name: t.name,
        unit: t.unit,
        unitCost: detail.unitCostTotal,
        componentCount: rows.length,
        // READ_MODEL_ARCHIVED_AT: el read-model expone origen + archivado por
        // plantilla (consumido por la biblioteca APU y la selección de export).
        originType: (t as { originType?: string }).originType,
        archivedAt: (t as { archivedAt?: Date | string | null }).archivedAt
          ? new Date((t as { archivedAt: Date | string }).archivedAt).toISOString()
          : null,
        typeCounts: summary.typeCounts,
        materialsWithoutPrice: summary.materialsWithoutPrice,
      };
    });
    });
  }

  async getApuDetail(viewer: ViewerContext, apuTemplateId: Uuid): Promise<ApuDetail> {
    return this.read(viewer, async () => {
    // Pertenencia: la plantilla debe ser de la organización del viewer (RLS es
    // la barrera real; el filtro explícito es la segunda barrera).
    const templates = await this.repo.apuTemplates(viewer.organizationId);
    const template = templates.find((t) => t.id === apuTemplateId);
    if (!template) throw new ApuNotFoundError(apuTemplateId);

    const components = await this.repo.apuComponentsByTemplates([template.id]);
    const resourceIds = components
      .map((c) => c.resourceId)
      .filter((id): id is Uuid => id !== null);
    const laborRoleIds = components
      .map((c) => c.laborRoleId)
      .filter((id): id is Uuid => id !== null);
    const resources = await this.repo.resourcesByIds(resourceIds);
    const roles = await this.repo.laborRolesByIds(laborRoleIds);
    const resourceById = new Map(resources.map((r) => [r.id, r]));
    const roleById = new Map(roles.map((r) => [r.id, r]));

    const rows: RawApuComponent[] = components.map((c) => {
      const resource = c.resourceId ? resourceById.get(c.resourceId) : undefined;
      const role = c.laborRoleId ? roleById.get(c.laborRoleId) : undefined;
      return {
        id: c.id,
        componentType: c.componentType as RawApuComponent['componentType'],
        resourceCode: resource?.code ?? null,
        resourceName: resource?.name ?? null,
        laborRoleCode: role?.code ?? null,
        laborRoleName: role?.name ?? null,
        quantity: c.quantity,
        wastePct: c.wastePct,
        recommendedWastePct: c.recommendedWastePct,
        wastePctSource: c.wastePctSource,
        wastePctNote: c.wastePctNote,
        recommendedLaborQuantity: c.recommendedLaborQuantity,
        recommendedProductivity: c.recommendedProductivity,
        appliedProductivity: c.appliedProductivity,
        productivityUnit: c.productivityUnit,
        recommendedCrewSize: c.recommendedCrewSize,
        appliedCrewSize: c.appliedCrewSize,
        productivitySource: c.productivitySource,
        productivityNote: c.productivityNote,
        recommendedMaterialQuantity: c.recommendedMaterialQuantity,
        materialQuantitySource: c.materialQuantitySource,
        materialQuantityNote: c.materialQuantityNote,
        unitPriceSnapshot: c.unitPriceSnapshot,
        totalComponentCost: c.totalComponentCost,
        sortOrder: c.sortOrder,
      };
    });

    const detail = computeApuDetail(
      {
        id: template.id,
        code: template.code,
        name: template.name,
        unit: template.unit,
        version: template.version,
        defaultToolPct: template.defaultToolPct,
      },
      rows,
    );
    // READ_MODEL_ARCHIVED_AT: propaga origen + archivado a la ficha del APU.
    detail.originType = (template as { originType?: string }).originType;
    detail.archivedAt = (template as { archivedAt?: Date | string | null }).archivedAt
      ? new Date((template as { archivedAt: Date | string }).archivedAt).toISOString()
      : null;
    return projectApuDetailForRole(detail, viewer.role);
    });
  }

  async listQuantities(
    viewer: ViewerContext,
    projectScopeId?: Uuid,
  ): Promise<QuantityGroupView[]> {
    return this.read(viewer, async () => {
    // Restringir a alcances de la organización del viewer.
    const projects = await this.visibleProjects(viewer);
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
    });
  }

  async listWorkspaceGroups(
    viewer: ViewerContext,
    projectScopeId?: Uuid,
  ): Promise<WorkspaceGroupView[]> {
    return this.read(viewer, async () => {
    const projects = await this.visibleProjects(viewer);
    const scopes = await this.repo.scopesByProjects(projects.map((p) => p.id));
    const allowedScopeIds = new Set(scopes.map((s) => s.id));
    const scopeIds = projectScopeId
      ? allowedScopeIds.has(projectScopeId)
        ? [projectScopeId]
        : []
      : [...allowedScopeIds];
    if (scopeIds.length === 0) return [];

    const groups = await this.repo.workspaceGroupsByScopes(scopeIds);
    const lines = await this.repo.workspaceLinesByGroups(groups.map((g) => g.id));
    const linesByGroup = new Map<Uuid, typeof lines>();
    for (const l of lines) {
      const bucket = linesByGroup.get(l.groupId) ?? [];
      bucket.push(l);
      linesByGroup.set(l.groupId, bucket);
    }
    return groups.map((g) => ({
      id: g.id,
      code: g.code,
      name: g.name,
      floor: g.floor ?? null,
      module: g.module ?? null,
      space: g.space ?? null,
      element: g.element ?? null,
      resultUnit: g.resultUnit,
      templateKind: g.templateKind,
      totalNet: String(g.totalNet),
      lines: (linesByGroup.get(g.id) ?? [])
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((l) => ({
          id: l.id,
          description: l.description ?? '',
          formulaType: l.formulaType,
          resultUnit: l.resultUnit ?? g.resultUnit,
          resultGross: String(l.resultGross),
          resultNet: String(l.resultNet),
          apuTemplateId: l.apuTemplateId ?? null,
          boqItemId: l.boqItemId ?? null,
        })),
    }));
    });
  }

  async listCatalogResources(viewer: ViewerContext): Promise<CatalogResourceView[]> {
    return this.read(viewer, async () => {
    const resources = await this.repo.resources(viewer.organizationId);
    const observations = await this.repo.resourcePriceObservationsByOrg(viewer.organizationId);

    // Agrupa observaciones por recurso (estado resuelto en dominio puro).
    const obsByResource = new Map<Uuid, PriceObservationRow[]>();
    for (const o of observations) {
      const bucket = obsByResource.get(o.resourceId) ?? [];
      bucket.push({
        status: o.status as PriceObservationRow['status'],
        observedPrice: String(o.observedPrice),
        supplierName: o.supplierName ?? null,
        effectiveAt: toIso(o.approvedAt ?? o.observedAt),
      });
      obsByResource.set(o.resourceId, bucket);
    }

    return resources.map((r) => {
      const status = projectPriceStatusForRole(
        resolveCatalogPriceStatus(obsByResource.get(r.id) ?? []),
        viewer.role,
      );
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        resourceType: r.resourceType as CatalogResourceView['resourceType'],
        unit: r.unit,
        // budgetReferencePrice (cliente-safe) = precio aprobado, si existe.
        budgetReferencePrice: status.approvedPrice,
        priceStatus: status.priceStatus,
        approvedPrice: status.approvedPrice,
        pendingPrice: status.pendingPrice,
        supplierName: status.supplierName,
        priceDate: status.priceDate,
      };
    });
    });
  }

  async getDashboardSummary(
    viewer: ViewerContext,
    projectId: Uuid,
  ): Promise<DashboardSummary> {
    return this.read(viewer, async () => {
    const project = await this.visibleProjectById(viewer, projectId);
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
    });
  }

  /* --- Planificación (Oleada 3B — PLANNING_CONTRACT §3) --- */

  async getSchedule(viewer: ViewerContext, projectId: Uuid): Promise<ScheduleSummary> {
    return this.read(viewer, async () => {
    // El proyecto debe pertenecer a la organización del viewer (defensa en
    // profundidad además de RLS, que es la barrera real en runtime).
    const project = await this.visibleProjectById(viewer, projectId);
    if (!project) throw new ProjectNotFoundError(projectId);

    const [taskRows, depRows] = await Promise.all([
      this.repo.scheduleTasksByProject(viewer.organizationId, projectId),
      this.repo.taskDependenciesByProject(viewer.organizationId, projectId),
    ]);

    const tasks: RawScheduleTask[] = taskRows.map((t) => ({
      id: t.id,
      parentTaskId: t.parentTaskId ?? null,
      wbsCode: t.wbsCode,
      name: t.name,
      plannedStart: t.plannedStart,
      plannedEnd: t.plannedEnd,
      plannedDurationDays: t.plannedDurationDays,
      progressPct: t.progressPct,
      status: t.status as ScheduleTaskStatus,
      isMilestone: t.isMilestone,
      sortOrder: t.sortOrder,
      externalReference: t.externalReference ?? null,
    }));
    const dependencies: RawTaskDependency[] = depRows.map((d) => ({
      predecessorTaskId: d.predecessorTaskId,
      successorTaskId: d.successorTaskId,
      dependencyType: d.dependencyType as RawTaskDependency['dependencyType'],
      lagDays: d.lagDays,
    }));

    const full = computeSchedule({ projectId, tasks, dependencies });
    return projectScheduleForRole(full, viewer.role);
    });
  }

  async listProgressEntries(
    viewer: ViewerContext,
    projectId: Uuid,
    taskId?: Uuid,
  ): Promise<ProgressEntryView[]> {
    return this.read(viewer, async () => {
    const project = await this.visibleProjectById(viewer, projectId);
    if (!project) throw new ProjectNotFoundError(projectId);

    const rows = await this.repo.progressEntriesByProject(
      viewer.organizationId,
      projectId,
      taskId,
    );
    const entries: ProgressEntryView[] = rows.map((e) => ({
      id: e.id,
      taskId: e.taskId,
      recordedAt: toIso(e.recordedAt),
      physicalProgressPct: e.physicalProgressPct,
      // 🔒 financialProgressPct/notes — proyectados por rol abajo. `createdBy`
      // no se expone en el DTO.
      financialProgressPct: e.financialProgressPct ?? null,
      notes: e.notes ?? null,
    }));
    return projectProgressEntriesForRole(entries, viewer.role);
    });
  }

  async listResourceAssignments(
    viewer: ViewerContext,
    projectId: Uuid,
    taskId?: Uuid,
  ): Promise<ResourceAssignmentView[]> {
    return this.read(viewer, async () => {
    const project = await this.visibleProjectById(viewer, projectId);
    if (!project) throw new ProjectNotFoundError(projectId);

    const rows = await this.repo.resourceAssignmentsByProject(
      viewer.organizationId,
      projectId,
      taskId,
    );

    const resourceIds = rows
      .map((r) => r.resourceId)
      .filter((id): id is Uuid => id !== null);
    const laborRoleIds = rows
      .map((r) => r.laborRoleId)
      .filter((id): id is Uuid => id !== null);
    const [resources, laborRoles] = await Promise.all([
      this.repo.resourcesByIds(resourceIds),
      this.repo.laborRolesByIds(laborRoleIds),
    ]);
    const resourceName = new Map(resources.map((r) => [r.id, r.name]));
    const laborRoleName = new Map(laborRoles.map((r) => [r.id, r.name]));

    const assignments: ResourceAssignmentView[] = rows.map((a) => ({
      id: a.id,
      taskId: a.taskId,
      resourceName: a.resourceId ? resourceName.get(a.resourceId) ?? null : null,
      laborRoleName: a.laborRoleId ? laborRoleName.get(a.laborRoleId) ?? null : null,
      quantity: a.quantity ?? null,
      unit: a.unit ?? null,
      // 🔒 notas internas — proyectadas por rol abajo.
      notes: a.notes ?? null,
    }));
    return projectResourceAssignmentsForRole(assignments, viewer.role);
    });
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
