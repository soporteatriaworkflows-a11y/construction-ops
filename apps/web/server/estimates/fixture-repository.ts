/**
 * fixture-repository.ts — Implementación fixture/demo de `EstimatesWriteRepository`.
 *
 * Propiedad: agent-db-rls. Contrato: `docs/ESTIMATES_CRUD_CONTRACT.md §6`.
 *
 * - `insertEstimateWithInitialVersion`: NO aplica en fixture (solo lectura) ⇒
 *   `EstimateWriteNotSupportedError`.
 * - Lecturas: resuelven sobre el golden master (un presupuesto, su V01 y conteos
 *   reales). Cross-org / id desconocido ⇒ vacío / `EstimateNotFoundError`.
 */
import Decimal from 'decimal.js';
import fixtureJson from '../../../../scripts/fixtures/entre-patios-first-floor.fixture.json';
import type {
  AuthenticatedViewer,
  CreateEstimateInput,
  EstimateActiveVersionView,
  EstimateDetailView,
  EstimateListItem,
  EstimatesWriteRepository,
  EstimateVersionStatus,
  Uuid,
  ViewerContext,
} from './types';
import {
  AiuWriteNotSupportedError,
  ChapterNotFoundError,
  EstimateNotFoundError,
  EstimateWriteNotSupportedError,
} from './errors';
import type {
  BoqItemReviewView,
  ChapterDetailView,
  ChapterReviewItem,
} from '@/lib/estimates/review-types';
import type { AiuRatesInput, AiuRatesView, FinancialSummary } from '@/lib/estimates/aiu-types';
import { computeFinancialSummary, ZERO_FRACTIONS } from './aiu-calc';

interface FixtureChapter { id: Uuid; estimateVersionId: Uuid; code: string; name: string; sortOrder: number }
interface FixtureBoqItem {
  id: Uuid; chapterId: Uuid; code: string; descriptionSnapshot: string; unitSnapshot: string;
  quantitySnapshot: string; unitPriceSnapshot: string; subtotal: string; sortOrder: number;
}

interface FixtureShape {
  organization: { id: Uuid };
  project: { id: Uuid; name: string };
  projectScopes: { id: Uuid; name: string }[];
  estimate: {
    id: Uuid;
    projectScopeId: Uuid;
    code: string;
    name: string;
    status: 'draft' | 'active' | 'archived';
    createdAt: string;
  };
  estimateVersion: { id: Uuid; versionNumber: number; status: EstimateVersionStatus };
  chapters: FixtureChapter[];
  boqItems: FixtureBoqItem[];
  estimateTotals: { costos_directos: string };
}

const fixture = fixtureJson as unknown as FixtureShape;

function sameOrg(viewer: ViewerContext): boolean {
  return viewer.organizationId === fixture.organization.id;
}

function activeVersion(): EstimateActiveVersionView {
  return {
    id: fixture.estimateVersion.id,
    versionNumber: fixture.estimateVersion.versionNumber,
    status: fixture.estimateVersion.status,
    chapterCount: fixture.chapters.length,
    itemCount: fixture.boqItems.length,
    directTotal: fixture.estimateTotals.costos_directos,
  };
}

function toListItem(): EstimateListItem {
  const scope = fixture.projectScopes.find((s) => s.id === fixture.estimate.projectScopeId);
  return {
    id: fixture.estimate.id,
    code: fixture.estimate.code,
    name: fixture.estimate.name,
    status: fixture.estimate.status,
    createdAt: fixture.estimate.createdAt,
    projectScopeId: fixture.estimate.projectScopeId,
    scopeName: scope?.name ?? null,
    projectId: fixture.project.id,
    projectName: fixture.project.name,
  };
}

export class FixtureEstimatesWriteRepository implements EstimatesWriteRepository {
  readonly source = 'fixture' as const;

  async insertEstimateWithInitialVersion(
    _viewer: AuthenticatedViewer,
    _scopeId: Uuid,
    _input: CreateEstimateInput,
  ): Promise<EstimateDetailView> {
    throw new EstimateWriteNotSupportedError();
  }

  async listEstimatesByScope(
    viewer: ViewerContext,
    scopeId: Uuid,
  ): Promise<EstimateListItem[]> {
    if (!sameOrg(viewer) || scopeId !== fixture.estimate.projectScopeId) return [];
    return [toListItem()];
  }

  async listVisibleEstimates(viewer: ViewerContext): Promise<EstimateListItem[]> {
    if (!sameOrg(viewer)) return [];
    return [toListItem()];
  }

  async getEstimateById(
    viewer: ViewerContext,
    estimateId: Uuid,
  ): Promise<EstimateDetailView> {
    if (!sameOrg(viewer) || estimateId !== fixture.estimate.id) {
      throw new EstimateNotFoundError(estimateId);
    }
    return { ...toListItem(), description: null, activeVersion: activeVersion() };
  }

  async getEstimateActiveVersion(
    viewer: ViewerContext,
    estimateId: Uuid,
  ): Promise<EstimateActiveVersionView | null> {
    if (!sameOrg(viewer) || estimateId !== fixture.estimate.id) return null;
    return activeVersion();
  }

  async listChaptersByEstimateVersion(
    viewer: ViewerContext,
    estimateId: Uuid,
  ): Promise<ChapterReviewItem[]> {
    if (!sameOrg(viewer) || estimateId !== fixture.estimate.id) return [];
    return fixture.chapters
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((ch) => {
        const items = fixture.boqItems.filter((it) => it.chapterId === ch.id);
        const subtotal = items
          .reduce((acc, it) => acc.plus(new Decimal(it.subtotal)), new Decimal(0))
          .toFixed();
        return {
          id: ch.id, code: ch.code, name: ch.name, sortOrder: ch.sortOrder,
          itemCount: items.length, subtotal, sourceCode: null, sourceRow: null,
        };
      });
  }

  async getChapterById(viewer: ViewerContext, chapterId: Uuid): Promise<ChapterDetailView> {
    const ch = fixture.chapters.find((c) => c.id === chapterId);
    if (!sameOrg(viewer) || !ch) throw new ChapterNotFoundError(chapterId);
    const items = fixture.boqItems.filter((it) => it.chapterId === ch.id);
    const subtotal = items
      .reduce((acc, it) => acc.plus(new Decimal(it.subtotal)), new Decimal(0))
      .toFixed();
    const scope = fixture.projectScopes.find((s) => s.id === fixture.estimate.projectScopeId);
    return {
      id: ch.id, code: ch.code, name: ch.name, sortOrder: ch.sortOrder,
      subtotal, itemCount: items.length, sourceCode: null, sourceRow: null,
      estimateId: fixture.estimate.id, estimateName: fixture.estimate.name,
      versionNumber: fixture.estimateVersion.versionNumber,
      scopeId: scope?.id ?? '', scopeName: scope?.name ?? null,
      projectId: fixture.project.id, projectName: fixture.project.name,
    };
  }

  async listItemsByChapter(viewer: ViewerContext, chapterId: Uuid): Promise<BoqItemReviewView[]> {
    const ch = fixture.chapters.find((c) => c.id === chapterId);
    if (!sameOrg(viewer) || !ch) return [];
    return fixture.boqItems
      .filter((it) => it.chapterId === chapterId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((it) => ({
        id: it.id, code: it.code, description: it.descriptionSnapshot, unit: it.unitSnapshot,
        quantity: it.quantitySnapshot, unitPrice: it.unitPriceSnapshot, subtotal: it.subtotal,
        sortOrder: it.sortOrder, sourceCode: null, sourceRow: null,
      }));
  }

  async getEstimateVersionAiu(viewer: ViewerContext, estimateId: Uuid): Promise<AiuRatesView> {
    if (!sameOrg(viewer) || estimateId !== fixture.estimate.id) {
      throw new EstimateNotFoundError(estimateId);
    }
    // Demo: el fixture no precarga AIU (vacío). Lectura solo demostrativa.
    return {
      administrationRate: '0', contingencyRate: '0', utilityRate: '0', utilityVatRate: '0',
      isEmpty: true, editable: false, updatedAt: null,
    };
  }

  async updateEstimateVersionAiu(): Promise<FinancialSummary> {
    // El fixture es de solo lectura.
    throw new AiuWriteNotSupportedError();
  }

  async calculateEstimateFinancialSummary(
    viewer: ViewerContext,
    estimateId: Uuid,
  ): Promise<FinancialSummary> {
    if (!sameOrg(viewer) || estimateId !== fixture.estimate.id) {
      throw new EstimateNotFoundError(estimateId);
    }
    // Sin AIU en el fixture ⇒ total general = costo directo.
    return computeFinancialSummary(fixture.estimateTotals.costos_directos, ZERO_FRACTIONS);
  }
}
