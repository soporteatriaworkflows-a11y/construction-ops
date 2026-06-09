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
  BoqItemNotFoundError,
  BoqWriteNotSupportedError,
  ChapterNotFoundError,
  EstimateNotFoundError,
  EstimateWriteNotSupportedError,
} from './errors';
import type {
  BoqItemArchiveResult,
  BoqItemMutationResult,
  ChapterMutationResult,
  EditableBoqItemView,
  EditableChapterView,
  ReviewReadOptions,
} from '@/lib/estimates/boq-edit-types';
import type { EstimateVersionSummary } from '@/lib/estimates/version-types';
import type {
  BoqItemReviewView,
  ChapterDetailView,
  ChapterReviewItem,
} from '@/lib/estimates/review-types';
import type { AiuRatesInput, AiuRatesView, FinancialSummary } from '@/lib/estimates/aiu-types';
import type {
  EstimateExportChapter,
  EstimateExportPayload,
} from '@/lib/estimates/export-types';
import { computeFinancialSummary, ZERO_FRACTIONS } from './aiu-calc';
import { versionLabel } from './export/version-label';

interface FixtureChapter { id: Uuid; estimateVersionId: Uuid; code: string; name: string; sortOrder: number }
interface FixtureBoqItem {
  id: Uuid; chapterId: Uuid; code: string; descriptionSnapshot: string; unitSnapshot: string;
  quantitySnapshot: string; unitPriceSnapshot: string; subtotal: string; sortOrder: number;
}

interface FixtureShape {
  organization: { id: Uuid; name?: string };
  project: { id: Uuid; name: string; location?: string | null };
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
    _options?: ReviewReadOptions,
  ): Promise<ChapterReviewItem[]> {
    if (!sameOrg(viewer) || estimateId !== fixture.estimate.id) return [];
    // El fixture (demo) no tiene nodos archivados: todo es activo.
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
          archived: false,
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
      archived: false,
      estimateId: fixture.estimate.id, estimateName: fixture.estimate.name,
      versionNumber: fixture.estimateVersion.versionNumber,
      scopeId: scope?.id ?? '', scopeName: scope?.name ?? null,
      projectId: fixture.project.id, projectName: fixture.project.name,
    };
  }

  async listItemsByChapter(
    viewer: ViewerContext,
    chapterId: Uuid,
    _options?: ReviewReadOptions,
  ): Promise<BoqItemReviewView[]> {
    const ch = fixture.chapters.find((c) => c.id === chapterId);
    if (!sameOrg(viewer) || !ch) return [];
    return fixture.boqItems
      .filter((it) => it.chapterId === chapterId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((it) => ({
        id: it.id, code: it.code, description: it.descriptionSnapshot, unit: it.unitSnapshot,
        quantity: it.quantitySnapshot, unitPrice: it.unitPriceSnapshot, subtotal: it.subtotal,
        sortOrder: it.sortOrder, sourceCode: null, sourceRow: null, archived: false,
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

  async getEstimateExportPayload(
    viewer: ViewerContext,
    estimateId: Uuid,
    _versionId?: Uuid,
  ): Promise<EstimateExportPayload> {
    if (!sameOrg(viewer) || estimateId !== fixture.estimate.id) {
      throw new EstimateNotFoundError(estimateId);
    }
    const reviewChapters = await this.listChaptersByEstimateVersion(viewer, estimateId);
    const chapters: EstimateExportChapter[] = [];
    let itemCount = 0;
    for (const ch of reviewChapters) {
      const items = await this.listItemsByChapter(viewer, ch.id);
      itemCount += items.length;
      chapters.push({
        code: ch.code, name: ch.name, sortOrder: ch.sortOrder, subtotal: ch.subtotal,
        sourceCode: ch.sourceCode, sourceRow: ch.sourceRow,
        items: items.map((it) => ({
          code: it.code, description: it.description, unit: it.unit,
          quantity: it.quantity, unitPrice: it.unitPrice, subtotal: it.subtotal,
          sourceCode: it.sourceCode, sourceRow: it.sourceRow,
        })),
      });
    }
    const [aiu, financial] = await Promise.all([
      this.getEstimateVersionAiu(viewer, estimateId),
      this.calculateEstimateFinancialSummary(viewer, estimateId),
    ]);
    const scope = fixture.projectScopes.find((s) => s.id === fixture.estimate.projectScopeId);
    const v = fixture.estimateVersion;
    return {
      organizationName: fixture.organization.name ?? '—',
      project: { id: fixture.project.id, name: fixture.project.name, city: fixture.project.location ?? null },
      scope: { id: scope?.id ?? fixture.estimate.projectScopeId, name: scope?.name ?? null },
      estimate: {
        id: fixture.estimate.id, code: fixture.estimate.code, name: fixture.estimate.name,
        status: fixture.estimate.status,
      },
      version: { number: v.versionNumber, label: versionLabel(v.versionNumber), status: v.status },
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

  /* --- Edición manual de BOQ (4E.2A): escritura bloqueada (solo lectura). --- */

  async createEstimateChapter(): Promise<ChapterMutationResult> {
    throw new BoqWriteNotSupportedError();
  }

  async updateEstimateChapter(): Promise<ChapterMutationResult> {
    throw new BoqWriteNotSupportedError();
  }

  async getEditableEstimateChapter(
    viewer: ViewerContext,
    estimateId: Uuid,
    chapterId: Uuid,
  ): Promise<EditableChapterView> {
    const ch = fixture.chapters.find((c) => c.id === chapterId);
    if (!sameOrg(viewer) || estimateId !== fixture.estimate.id || !ch) {
      throw new ChapterNotFoundError(chapterId);
    }
    return {
      id: ch.id,
      code: ch.code,
      name: ch.name,
      sourceCode: null,
      sourceRow: null,
      isManual: true,
      editable: false, // demo/fixture: solo lectura.
      estimateId,
      versionNumber: fixture.estimateVersion.versionNumber,
    };
  }

  async createBoqItem(): Promise<BoqItemMutationResult> {
    throw new BoqWriteNotSupportedError();
  }

  async updateBoqItem(): Promise<BoqItemMutationResult> {
    throw new BoqWriteNotSupportedError();
  }

  async getEditableBoqItem(
    viewer: ViewerContext,
    estimateId: Uuid,
    chapterId: Uuid,
    itemId: Uuid,
  ): Promise<EditableBoqItemView> {
    const it = fixture.boqItems.find((i) => i.id === itemId);
    if (!sameOrg(viewer) || estimateId !== fixture.estimate.id || !it || it.chapterId !== chapterId) {
      throw new BoqItemNotFoundError(itemId);
    }
    const ch = fixture.chapters.find((c) => c.id === chapterId);
    const availableChapters = fixture.chapters
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({ id: c.id, code: c.code, name: c.name }));
    return {
      id: it.id,
      chapterId: it.chapterId,
      chapterCode: ch?.code ?? '',
      code: it.code,
      description: it.descriptionSnapshot,
      unit: it.unitSnapshot,
      quantity: it.quantitySnapshot,
      unitPrice: it.unitPriceSnapshot,
      subtotal: it.subtotal,
      sourceCode: null,
      sourceRow: null,
      isManual: true,
      editable: false, // demo/fixture: solo lectura.
      versionNumber: fixture.estimateVersion.versionNumber,
      availableChapters,
    };
  }

  /* --- Archive/restore (4E.2B): escritura bloqueada (solo lectura). --- */
  async archiveEstimateChapter(): Promise<ChapterMutationResult> {
    throw new BoqWriteNotSupportedError();
  }
  async restoreEstimateChapter(): Promise<ChapterMutationResult> {
    throw new BoqWriteNotSupportedError();
  }
  async archiveBoqItem(): Promise<BoqItemArchiveResult> {
    throw new BoqWriteNotSupportedError();
  }
  async restoreBoqItem(): Promise<BoqItemArchiveResult> {
    throw new BoqWriteNotSupportedError();
  }

  /* --- Emisión / clonación (4E.3A): escritura bloqueada en demo. --- */
  async issueEstimateVersion(): Promise<EstimateVersionSummary> {
    throw new BoqWriteNotSupportedError();
  }
  async cloneIssuedEstimateVersion(): Promise<EstimateVersionSummary> {
    throw new BoqWriteNotSupportedError();
  }
  async listEstimateVersions(
    viewer: ViewerContext,
    estimateId: Uuid,
  ): Promise<EstimateVersionSummary[]> {
    if (!sameOrg(viewer) || estimateId !== fixture.estimate.id) return [];
    const v = fixture.estimateVersion;
    return [
      {
        id: v.id,
        versionNumber: v.versionNumber,
        status: v.status,
        isActive: true,
        editable: !['approved', 'issued', 'archived'].includes(v.status),
        issuedAt: null,
        issuedBy: null,
        createdAt: fixture.estimate.createdAt,
        sourceVersionId: null,
        directTotal: fixture.estimateTotals.costos_directos,
        grandTotal: fixture.estimateTotals.costos_directos,
      },
    ];
  }
}
