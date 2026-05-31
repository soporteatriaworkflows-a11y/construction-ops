/**
 * TEMP integración 3A: reemplazar por @/server/read-model cuando db-rls
 * entregue la implementación real.
 *
 * Accesor de desarrollo que lee el fixture sanitizado del golden master y
 * devuelve un ReadModelPort. Solo se usa cuando READ_MODEL_SOURCE=fixture
 * (valor por defecto en dev). En producción, el orquestador reemplazará
 * esta importación por @/server/read-model.
 *
 * NO realiza cálculos financieros. Los valores llegan pre-calculados en el
 * fixture (como DecimalString).
 *
 * Propiedad: agent-frontend-boq (accesor TEMP).
 */

import type {
  ReadModelPort,
  ProjectListItem,
  ProjectOverview,
  EstimateSummary,
  ChapterSummary,
  BoqItemView,
  ApuSummary,
  QuantityGroupView,
  CatalogResourceView,
} from '@/lib/contracts/read-model';

// ---------------------------------------------------------------------------
// Tipos locales del fixture (suficientes para el accesor)
// ---------------------------------------------------------------------------

interface FixtureShape {
  project: {
    id: string;
    code: string;
    name: string;
    status: string;
    location?: string | null;
    startDate?: string | null;
    estimatedEndDate?: string | null;
  };
  projectScopes: {
    id: string;
    projectId: string;
    parentScopeId?: string | null;
    code: string;
    name: string;
    scopeType: string;
    status: string;
  }[];
  resources: {
    id: string;
    code: string;
    name: string;
    resourceType: string;
    unit: string;
    defaultWastePct: string;
    active: boolean;
  }[];
  apuTemplates: {
    id: string;
    code: string;
    name: string;
    unit: string;
  }[];
  apuComponents: {
    id: string;
    apuTemplateId: string;
    componentType: string;
    quantity: string;
    wastePct: string;
    unitPriceSource: string;
    unitPriceSnapshot: string;
    totalComponentCost: string;
    sortOrder: number;
  }[];
  estimate: {
    id: string;
    projectScopeId: string;
    code: string;
    name: string;
    status: string;
  };
  estimateVersion: {
    id: string;
    estimateId: string;
    versionNumber: number;
    status: string;
    notes?: string | null;
    approvedAt?: string | null;
  };
  chapters: {
    id: string;
    estimateVersionId: string;
    code: string;
    name: string;
    sortOrder: number;
  }[];
  boqItems: {
    id: string;
    estimateVersionId: string;
    chapterId: string;
    code: string;
    descriptionSnapshot: string;
    unitSnapshot: string;
    quantitySnapshot: string;
    unitPriceSnapshot: string;
    subtotal: string;
    sortOrder: number;
    notes?: string | null;
  }[];
  indirectCostRules: {
    id: string;
    code: string;
    name: string;
    percentage: string;
    baseType: string;
    sortOrder: number;
    visibleToClient: boolean;
  }[];
  quantityGroups: {
    id: string;
    projectScopeId: string;
    code: string;
    name: string;
    unit: string;
    calculationMode: string;
  }[];
  quantityLines: {
    id: string;
    quantityGroupId: string;
    description?: string | null;
    length?: string | null;
    width?: string | null;
    height?: string | null;
    multiplier: string;
    directQuantity?: string | null;
    formulaType: string;
    calculatedQuantity: string;
    notes?: string | null;
    sortOrder: number;
  }[];
  estimateTotals: {
    costos_directos: string;
    administracion: string;
    imprevistos: string;
    utilidad: string;
    iva_sobre_utilidad: string;
    costos_indirectos: string;
    total_costo: string;
    area_construida: string;
    valor_m2: string;
  };
}

// ---------------------------------------------------------------------------
// Importar fixture sanitizado (sin datos privados)
// resolveJsonModule habilitado en tsconfig raíz.
// ---------------------------------------------------------------------------

import fixtureJson from '../../../../scripts/fixtures/entre-patios-first-floor.fixture.json';
// Cast al tipo local; el fixture cumple la forma FixtureShape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fixture = fixtureJson as unknown as FixtureShape;

// ---------------------------------------------------------------------------
// Helper: suma de subtotales de ítems de un capítulo
// ---------------------------------------------------------------------------

function chapterSubtotal(chapterId: string): string {
  const items = fixture.boqItems.filter((i) => i.chapterId === chapterId);
  if (items.length === 0) return '0';
  // Sum as strings without Decimal.js — solo para presentación del accesor.
  // NUNCA reutilizar este patrón en código de dominio financiero.
  const sum = items.reduce((acc, i) => acc + parseFloat(i.subtotal), 0);
  return sum.toFixed(10);
}

// ---------------------------------------------------------------------------
// Implementación del puerto (modo fixture)
// ---------------------------------------------------------------------------

const devReadModel: ReadModelPort = {
  async listProjects(): Promise<ProjectListItem[]> {
    const p = fixture.project;
    const rootScopes = fixture.projectScopes
      .filter((s) => !s.parentScopeId)
      .map((s) => s.name);

    return [
      {
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status as ProjectListItem['status'],
        location: p.location ?? null,
        startDate: p.startDate ?? null,
        estimatedEndDate: p.estimatedEndDate ?? null,
        scopeNames: rootScopes,
      },
    ];
  },

  async getProjectOverview(projectId: string): Promise<ProjectOverview | null> {
    const p = fixture.project;
    if (p.id !== projectId) return null;

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      status: p.status as ProjectOverview['status'],
      location: p.location ?? null,
      startDate: p.startDate ?? null,
      estimatedEndDate: p.estimatedEndDate ?? null,
      scopes: fixture.projectScopes.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        scopeType: s.scopeType,
        parentScopeId: s.parentScopeId ?? null,
      })),
    };
  },

  async listEstimates(projectScopeId: string): Promise<EstimateSummary[]> {
    const est = fixture.estimate;
    if (est.projectScopeId !== projectScopeId) return [];

    const ver = fixture.estimateVersion;
    const totals = fixture.estimateTotals;

    const summary: EstimateSummary = {
      id: ver.id,
      estimateId: ver.estimateId,
      versionNumber: ver.versionNumber,
      status: ver.status,
      notes: ver.notes ?? null,
      approvedAt: ver.approvedAt ?? null,
      directCost: totals.costos_directos,
      administration: totals.administracion,
      contingency: totals.imprevistos,
      utility: totals.utilidad,
      taxOnUtility: totals.iva_sobre_utilidad,
      grandTotal: totals.total_costo,
      totalArea: totals.area_construida,
      costPerSquareMeter: totals.valor_m2,
    };

    return [summary];
  },

  async getEstimateDetail(
    estimateVersionId: string
  ): Promise<{ chapters: ChapterSummary[]; items: BoqItemView[] } | null> {
    const ver = fixture.estimateVersion;
    if (ver.id !== estimateVersionId) return null;

    const chapters: ChapterSummary[] = fixture.chapters
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => {
        const chItems = fixture.boqItems.filter((i) => i.chapterId === c.id);
        return {
          id: c.id,
          code: c.code,
          name: c.name,
          subtotal: chapterSubtotal(c.id),
          itemCount: chItems.length,
        };
      });

    const items: BoqItemView[] = fixture.boqItems
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => ({
        id: i.id,
        chapterId: i.chapterId,
        code: i.code,
        description: i.descriptionSnapshot,
        unit: i.unitSnapshot,
        quantity: i.quantitySnapshot,
        unitPrice: i.unitPriceSnapshot,
        subtotal: i.subtotal,
      }));

    return { chapters, items };
  },

  async listApus(): Promise<ApuSummary[]> {
    return fixture.apuTemplates.map((t) => {
      const components = fixture.apuComponents.filter(
        (c) => c.apuTemplateId === t.id
      );
      // unitCost = suma de totalComponentCost de sus componentes (ya calculado en fixture)
      const unitCost = components
        .reduce((acc, c) => acc + parseFloat(c.totalComponentCost), 0)
        .toFixed(10);

      return {
        id: t.id,
        code: t.code,
        name: t.name,
        unit: t.unit,
        unitCost,
        componentCount: components.length,
      };
    });
  },

  async listQuantities(projectScopeId: string): Promise<QuantityGroupView[]> {
    const groups = fixture.quantityGroups.filter(
      (g) => g.projectScopeId === projectScopeId
    );

    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      unit: g.unit,
      calculationMode: g.calculationMode,
      lines: fixture.quantityLines
        .filter((l) => l.quantityGroupId === g.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((l) => ({
          id: l.id,
          description: l.description ?? null,
          calculatedQuantity: l.calculatedQuantity,
        })),
    }));
  },

  async listCatalogResources(): Promise<CatalogResourceView[]> {
    // budgetReferencePrice no está en el fixture de recursos (es interno 🔒).
    // Mostramos solo los campos cliente-safe.
    return fixture.resources.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      resourceType: r.resourceType,
      unit: r.unit,
      budgetReferencePrice: null,
    }));
  },
};

/**
 * Obtiene el read-model para uso en Server Components.
 * TEMP: siempre devuelve el accesor de fixture hasta que db-rls entregue @/server/read-model.
 */
export function getReadModel(): ReadModelPort {
  return devReadModel;
}
