/**
 * fixture-repository.ts — Implementación del `ReadModelPort` sobre el fixture
 * sanitizado del golden master (MODO DEMO/DEV).
 *
 * Propiedad: agent-db-rls. Contrato: `docs/READ_MODEL_CONTRACT.md §2.A`.
 *
 * - Lee ÚNICAMENTE `scripts/fixtures/entre-patios-first-floor.fixture.json`
 *   (sanitizado, sin Excel privado ni datos reales).
 * - Permite preview local inmediato sin DB.
 * - Reproduce los 9 valores §3.4 reales DERIVÁNDOLOS con cost-domain
 *   (`computeEstimate`), no copiando los totales precomputados.
 * - Aísla por `organizationId`: si el viewer no pertenece a la organización del
 *   fixture, devuelve vacío / lanza el error de dominio correspondiente.
 * - Aplica la proyección por rol antes de devolver el dashboard.
 *
 * Es claramente un repositorio de DEMO; NO consulta ninguna base de datos.
 */

import fixtureJson from '../../../../scripts/fixtures/entre-patios-first-floor.fixture.json';
import type {
  ApuDetail,
  ApuSummary,
  BoqItemView,
  CatalogResourceView,
  ChapterSummary,
  DashboardSummary,
  DependencyType,
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
} from '@/lib/contracts/read-model';
import {
  computeApuDetail,
  computeDashboard,
  computeEstimate,
  type EstimateComputation,
  type EstimateComputationInput,
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

/* ----------------------------------------------------------------------------
 * Tipado del fixture (subconjunto consumido por el read-model)
 * ------------------------------------------------------------------------- */

interface FixtureShape {
  organization: { id: Uuid; name: string };
  project: {
    id: Uuid;
    organizationId: Uuid;
    code: string;
    name: string;
    status: 'active' | 'archived' | 'closed';
    location?: string | null;
    createdAt: string;
  };
  projectScopes: {
    id: Uuid;
    projectId: Uuid;
    code: string;
    name: string;
    scopeType:
      | 'floor'
      | 'tower'
      | 'stage'
      | 'package'
      | 'unit'
      | 'modification'
      | 'other';
  }[];
  resources: {
    id: Uuid;
    organizationId: Uuid;
    code: string;
    name: string;
    resourceType:
      | 'material'
      | 'labor'
      | 'equipment'
      | 'tool'
      | 'subcontract'
      | 'other';
    unit: string;
  }[];
  laborRoles: { id: Uuid; organizationId: Uuid; code: string; name: string }[];
  apuTemplates: {
    id: Uuid;
    organizationId: Uuid;
    code: string;
    name: string;
    unit: string;
    version: number;
    defaultToolPct: string;
  }[];
  apuComponents: {
    id: Uuid;
    apuTemplateId: Uuid;
    resourceId?: Uuid | null;
    laborRoleId?: Uuid | null;
    componentType:
      | 'material'
      | 'labor'
      | 'equipment'
      | 'tool'
      | 'subcontract'
      | 'other';
    quantity: string;
    wastePct: string;
    unitPriceSnapshot: string;
    totalComponentCost: string;
    sortOrder: number;
  }[];
  estimate: { id: Uuid; projectScopeId: Uuid };
  estimateVersion: {
    id: Uuid;
    estimateId: Uuid;
    versionNumber: number;
    status:
      | 'draft'
      | 'review'
      | 'approved'
      | 'issued'
      | 'archived';
    createdAt: string;
    approvedAt?: string | null;
  };
  chapters: { id: Uuid; estimateVersionId: Uuid; code: string; name: string; sortOrder: number }[];
  boqItems: {
    id: Uuid;
    estimateVersionId: Uuid;
    chapterId: Uuid;
    code: string;
    descriptionSnapshot: string;
    unitSnapshot: string;
    quantitySnapshot: string;
    unitPriceSnapshot: string;
    subtotal: string;
    sortOrder: number;
  }[];
  indirectCostRules: {
    estimateVersionId: Uuid;
    code: string;
    name: string;
    percentage: string;
    baseType: 'direct_cost' | 'utility' | 'custom';
    sortOrder: number;
    visibleToClient: boolean;
  }[];
  quantityGroups: { id: Uuid; projectScopeId: Uuid; name: string }[];
  quantityLines: {
    id: Uuid;
    quantityGroupId: Uuid;
    description?: string | null;
    calculatedQuantity: string;
    sortOrder: number;
  }[];
  planning: {
    scheduleTasks: {
      id: Uuid;
      projectId: Uuid;
      projectScopeId?: Uuid | null;
      chapterId?: Uuid | null;
      parentTaskId?: Uuid | null;
      wbsCode: string;
      name: string;
      description?: string | null;
      plannedStart: string;
      plannedEnd: string;
      plannedDurationDays: string;
      progressPct: string;
      status: ScheduleTaskStatus;
      isMilestone: boolean;
      sortOrder: number;
      externalReference?: string | null;
    }[];
    taskDependencies: {
      id: Uuid;
      projectId: Uuid;
      predecessorTaskId: Uuid;
      successorTaskId: Uuid;
      dependencyType: DependencyType;
      lagDays: string;
    }[];
    progressEntries: {
      id: Uuid;
      projectId: Uuid;
      taskId: Uuid;
      recordedAt: string;
      physicalProgressPct: string;
      financialProgressPct?: string | null;
      notes?: string | null;
      createdBy?: Uuid | null;
    }[];
    resourceAssignments: {
      id: Uuid;
      projectId: Uuid;
      taskId: Uuid;
      resourceId?: Uuid | null;
      laborRoleId?: Uuid | null;
      quantity?: string | null;
      unit?: string | null;
      notes?: string | null;
    }[];
  };
  estimateTotals: { area_construida: string };
}

const fixture = fixtureJson as unknown as FixtureShape;

/* ----------------------------------------------------------------------------
 * Repositorio fixture
 * ------------------------------------------------------------------------- */

/**
 * `ReadModelPort` de DEMO basado en el fixture sanitizado. Marcado claramente
 * como modo demo/dev; no toca ninguna base de datos.
 */
export class FixtureReadModelRepository implements ReadModelPort {
  /** Identificador legible del modo activo (para logging). */
  readonly source = 'fixture' as const;

  /** Indica si el viewer comparte la organización del fixture. */
  private isViewerOrg(viewer: ViewerContext): boolean {
    return viewer.organizationId === fixture.organization.id;
  }

  private buildEstimateComputationInput(): EstimateComputationInput {
    return {
      estimateId: fixture.estimate.id,
      versionId: fixture.estimateVersion.id,
      versionNumber: fixture.estimateVersion.versionNumber,
      status: fixture.estimateVersion.status,
      chapters: fixture.chapters.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        sortOrder: c.sortOrder,
      })),
      items: fixture.boqItems.map((it) => ({
        id: it.id,
        chapterId: it.chapterId,
        code: it.code,
        descriptionSnapshot: it.descriptionSnapshot,
        unitSnapshot: it.unitSnapshot,
        quantitySnapshot: it.quantitySnapshot,
        unitPriceSnapshot: it.unitPriceSnapshot,
        subtotal: it.subtotal,
        sortOrder: it.sortOrder,
      })),
      indirectRules: fixture.indirectCostRules.map((r) => ({
        code: r.code,
        name: r.name,
        percentage: r.percentage,
        baseType: r.baseType,
        sortOrder: r.sortOrder,
        visibleToClient: r.visibleToClient,
      })),
      builtArea: fixture.estimateTotals.area_construida,
      lastUpdatedAt:
        fixture.estimateVersion.approvedAt ?? fixture.estimateVersion.createdAt,
    };
  }

  private computation(): EstimateComputation {
    return computeEstimate(this.buildEstimateComputationInput());
  }

  async listProjects(viewer: ViewerContext): Promise<ProjectListItem[]> {
    if (!this.isViewerOrg(viewer)) return [];
    const scopeCount = fixture.projectScopes.filter(
      (s) => s.projectId === fixture.project.id,
    ).length;
    const estimateCount = 1; // un presupuesto en el fixture (EST-P1).
    return [
      {
        id: fixture.project.id,
        name: fixture.project.name,
        status: fixture.project.status,
        location: fixture.project.location ?? null,
        createdAt: fixture.project.createdAt,
        scopeCount,
        estimateCount,
      },
    ];
  }

  async getProjectOverview(
    viewer: ViewerContext,
    projectId: Uuid,
  ): Promise<ProjectOverview> {
    if (!this.isViewerOrg(viewer) || projectId !== fixture.project.id) {
      throw new ProjectNotFoundError(projectId);
    }
    const [project] = await this.listProjects(viewer);
    const { summary } = this.computation();
    return {
      project: project!,
      scopes: fixture.projectScopes
        .filter((s) => s.projectId === projectId)
        .map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          scopeType: s.scopeType,
        })),
      currentEstimateVersion: summary,
      budgetSummary: summary,
    };
  }

  async listEstimates(
    viewer: ViewerContext,
    projectId?: Uuid,
  ): Promise<EstimateSummary[]> {
    if (!this.isViewerOrg(viewer)) return [];
    if (projectId !== undefined && projectId !== fixture.project.id) return [];
    return [this.computation().summary];
  }

  async getEstimateDetail(
    viewer: ViewerContext,
    estimateVersionId: Uuid,
  ): Promise<{ estimate: EstimateSummary; chapters: ChapterSummary[]; items: BoqItemView[] }> {
    if (!this.isViewerOrg(viewer) || estimateVersionId !== fixture.estimateVersion.id) {
      throw new EstimateVersionNotFoundError(estimateVersionId);
    }
    const { summary, chapters } = this.computation();
    const items: BoqItemView[] = [...fixture.boqItems]
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
    return { estimate: summary, chapters, items };
  }

  async listApus(viewer: ViewerContext): Promise<ApuSummary[]> {
    if (!this.isViewerOrg(viewer)) return [];
    return fixture.apuTemplates.map((tpl) => {
      const components = fixture.apuComponents.filter(
        (c) => c.apuTemplateId === tpl.id,
      );
      // Costo unitario COMPLETO (incluye herramienta menor derivada). Con
      // defaultToolPct=0 coincide exactamente con la suma de componentes.
      const detail = computeApuDetail(
        {
          id: tpl.id,
          code: tpl.code,
          name: tpl.name,
          unit: tpl.unit,
          version: tpl.version,
          defaultToolPct: tpl.defaultToolPct,
        },
        components,
      );
      return {
        id: tpl.id,
        code: tpl.code,
        name: tpl.name,
        unit: tpl.unit,
        unitCost: detail.unitCostTotal,
        componentCount: components.length,
        originType: (tpl as { originType?: string }).originType,
        archivedAt: (tpl as { archivedAt?: string | null }).archivedAt ?? null,
      };
    });
  }

  async getApuDetail(viewer: ViewerContext, apuTemplateId: Uuid): Promise<ApuDetail> {
    const tpl = fixture.apuTemplates.find((t) => t.id === apuTemplateId);
    if (!this.isViewerOrg(viewer) || !tpl) {
      throw new ApuNotFoundError(apuTemplateId);
    }
    const resourceById = new Map(fixture.resources.map((r) => [r.id, r]));
    const roleById = new Map(fixture.laborRoles.map((r) => [r.id, r]));
    const components = fixture.apuComponents
      .filter((c) => c.apuTemplateId === tpl.id)
      .map((c) => {
        const resource = c.resourceId ? resourceById.get(c.resourceId) : undefined;
        const role = c.laborRoleId ? roleById.get(c.laborRoleId) : undefined;
        return {
          id: c.id,
          componentType: c.componentType,
          resourceCode: resource?.code ?? null,
          resourceName: resource?.name ?? null,
          laborRoleCode: role?.code ?? null,
          laborRoleName: role?.name ?? null,
          quantity: c.quantity,
          wastePct: c.wastePct,
          unitPriceSnapshot: c.unitPriceSnapshot,
          totalComponentCost: c.totalComponentCost,
          sortOrder: c.sortOrder,
        };
      });
    const detail = computeApuDetail(
      {
        id: tpl.id,
        code: tpl.code,
        name: tpl.name,
        unit: tpl.unit,
        version: tpl.version,
        defaultToolPct: tpl.defaultToolPct,
      },
      components,
    );
    // READ_MODEL_ARCHIVED_AT: el fixture no porta archivado/origen ⇒ degrada a
    // activo/undefined sin inventar valor.
    detail.originType = (tpl as { originType?: string }).originType;
    detail.archivedAt = (tpl as { archivedAt?: string | null }).archivedAt ?? null;
    return projectApuDetailForRole(detail, viewer.role);
  }

  async listQuantities(
    viewer: ViewerContext,
    projectScopeId?: Uuid,
  ): Promise<QuantityGroupView[]> {
    if (!this.isViewerOrg(viewer)) return [];
    return fixture.quantityGroups
      .filter((g) => projectScopeId === undefined || g.projectScopeId === projectScopeId)
      .map((g) => ({
        id: g.id,
        name: g.name,
        lines: [...fixture.quantityLines]
          .filter((l) => l.quantityGroupId === g.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((l) => ({
            id: l.id,
            description: l.description ?? '',
            calculatedQuantity: l.calculatedQuantity,
          })),
      }));
  }

  async listCatalogResources(viewer: ViewerContext): Promise<CatalogResourceView[]> {
    if (!this.isViewerOrg(viewer)) return [];
    return fixture.resources.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      resourceType: r.resourceType,
      unit: r.unit,
      // budgetReferencePrice se omite: en el read-model los precios aprobados se
      // resuelven vía PricingReadPort (no se consultan tablas de pricing aquí).
    }));
  }

  async getDashboardSummary(
    viewer: ViewerContext,
    projectId: Uuid,
  ): Promise<DashboardSummary> {
    if (!this.isViewerOrg(viewer) || projectId !== fixture.project.id) {
      throw new ProjectNotFoundError(projectId);
    }
    const computation = this.computation();
    const input = this.buildEstimateComputationInput();
    // Métricas internas de ahorro/cobertura: el fixture demo no incluye compras
    // reales ni cobertura de pricing, por lo que se omiten (no se inventan).
    const full = computeDashboard(projectId, computation, {
      status: input.status,
      lastUpdatedAt: input.lastUpdatedAt,
    });
    return projectDashboardForRole(full, viewer.role);
  }

  /* --- Planificación (Oleada 3B — PLANNING_CONTRACT §3) --- */

  /** Tareas crudas del proyecto, mapeadas al espejo de `compute-planning`. */
  private rawTasks(projectId: Uuid): RawScheduleTask[] {
    return fixture.planning.scheduleTasks
      .filter((t) => t.projectId === projectId)
      .map((t) => ({
        id: t.id,
        parentTaskId: t.parentTaskId ?? null,
        wbsCode: t.wbsCode,
        name: t.name,
        plannedStart: t.plannedStart,
        plannedEnd: t.plannedEnd,
        plannedDurationDays: t.plannedDurationDays,
        progressPct: t.progressPct,
        status: t.status,
        isMilestone: t.isMilestone,
        sortOrder: t.sortOrder,
        externalReference: t.externalReference ?? null,
      }));
  }

  /** Dependencias crudas del proyecto. */
  private rawDependencies(projectId: Uuid): RawTaskDependency[] {
    return fixture.planning.taskDependencies
      .filter((d) => d.projectId === projectId)
      .map((d) => ({
        predecessorTaskId: d.predecessorTaskId,
        successorTaskId: d.successorTaskId,
        dependencyType: d.dependencyType,
        lagDays: d.lagDays,
      }));
  }

  async getSchedule(viewer: ViewerContext, projectId: Uuid): Promise<ScheduleSummary> {
    if (!this.isViewerOrg(viewer) || projectId !== fixture.project.id) {
      throw new ProjectNotFoundError(projectId);
    }
    const full = computeSchedule({
      projectId,
      tasks: this.rawTasks(projectId),
      dependencies: this.rawDependencies(projectId),
    });
    // Proyección por rol: `client` no recibe holguras/ruta crítica.
    return projectScheduleForRole(full, viewer.role);
  }

  async listProgressEntries(
    viewer: ViewerContext,
    projectId: Uuid,
    taskId?: Uuid,
  ): Promise<ProgressEntryView[]> {
    if (!this.isViewerOrg(viewer) || projectId !== fixture.project.id) {
      throw new ProjectNotFoundError(projectId);
    }
    const entries: ProgressEntryView[] = fixture.planning.progressEntries
      .filter((e) => e.projectId === projectId && (taskId === undefined || e.taskId === taskId))
      // Append-only: orden cronológico ascendente estable por recordedAt.
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
      .map((e) => ({
        id: e.id,
        taskId: e.taskId,
        recordedAt: e.recordedAt,
        physicalProgressPct: e.physicalProgressPct,
        // 🔒 financialProgressPct/notes se incluyen aquí; la proyección por rol
        // los OMITE para `client`. `createdBy` no se expone en el DTO.
        financialProgressPct: e.financialProgressPct ?? null,
        notes: e.notes ?? null,
      }));
    return projectProgressEntriesForRole(entries, viewer.role);
  }

  async listResourceAssignments(
    viewer: ViewerContext,
    projectId: Uuid,
    taskId?: Uuid,
  ): Promise<ResourceAssignmentView[]> {
    if (!this.isViewerOrg(viewer) || projectId !== fixture.project.id) {
      throw new ProjectNotFoundError(projectId);
    }
    const resourceName = new Map(fixture.resources.map((r) => [r.id, r.name]));
    const laborRoleName = new Map(fixture.laborRoles.map((r) => [r.id, r.name]));

    const assignments: ResourceAssignmentView[] = fixture.planning.resourceAssignments
      .filter((a) => a.projectId === projectId && (taskId === undefined || a.taskId === taskId))
      .map((a) => ({
        id: a.id,
        taskId: a.taskId,
        resourceName: a.resourceId ? resourceName.get(a.resourceId) ?? null : null,
        laborRoleName: a.laborRoleId ? laborRoleName.get(a.laborRoleId) ?? null : null,
        quantity: a.quantity ?? null,
        unit: a.unit ?? null,
        // 🔒 notas internas; la proyección por rol las OMITE para `client`.
        notes: a.notes ?? null,
      }));
    return projectResourceAssignmentsForRole(assignments, viewer.role);
  }
}
