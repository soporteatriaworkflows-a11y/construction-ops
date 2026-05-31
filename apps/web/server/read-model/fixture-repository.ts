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
import {
  computeApuUnitCost,
  computeDashboard,
  computeEstimate,
  type EstimateComputation,
  type EstimateComputationInput,
} from './compute';
import { projectDashboardForRole } from './types';
import {
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
  apuTemplates: {
    id: Uuid;
    organizationId: Uuid;
    code: string;
    name: string;
    unit: string;
  }[];
  apuComponents: { apuTemplateId: Uuid; totalComponentCost: string }[];
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
      return {
        id: tpl.id,
        code: tpl.code,
        name: tpl.name,
        unit: tpl.unit,
        unitCost: computeApuUnitCost(components.map((c) => c.totalComponentCost)),
        componentCount: components.length,
      };
    });
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
}
