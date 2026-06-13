/**
 * apu-export-fixtures.ts — Helpers de test para generadores de export APU.
 */
import type { EstimateExportPayload } from '@/lib/estimates/export-types';
import type {
  BudgetApuExportSelection,
  LinkedApuView,
} from '@/lib/estimates/apu-export-types';
import type { ApuComponentView } from '@/lib/contracts/read-model';

export function basePayload(
  overrides: Partial<EstimateExportPayload> = {},
): EstimateExportPayload {
  return {
    organizationName: 'Grupo ICONIC',
    project: { id: 'p', name: 'Entre Patios', city: 'Bogotá' },
    scope: { id: 's', name: 'Primer piso' },
    estimate: { id: 'e', code: 'EP-01', name: 'Cotización Entre Patios', status: 'active' },
    version: { number: 1, label: 'V01', status: 'draft' },
    generatedAt: '2026-06-13T00:00:00.000Z',
    counts: { chapters: 1, items: 2 },
    chapters: [
      {
        code: '1', name: 'Preliminares', sortOrder: 1, subtotal: '1000',
        sourceCode: null, sourceRow: null,
        items: [
          { code: '1.1', description: 'Localización', unit: 'm2', quantity: '10', unitPrice: '100', subtotal: '1000', sourceCode: null, sourceRow: null },
        ],
      },
    ],
    aiu: { administrationRate: '5', contingencyRate: '2', utilityRate: '5', utilityVatRate: '19' },
    financial: {
      directTotal: '1000', administrationAmount: '50', contingencyAmount: '20',
      utilityAmount: '50', utilityVatAmount: '9.5', indirectTotal: '129.5', grandTotal: '1129.5',
    } as EstimateExportPayload['financial'],
    ...overrides,
  };
}

function comp(over: Partial<ApuComponentView> = {}): ApuComponentView {
  return {
    id: over.id ?? 'c1', componentType: over.componentType ?? 'material',
    resourceCode: over.resourceCode ?? 'MAT-1', resourceName: over.resourceName ?? 'Cemento',
    quantity: over.quantity ?? '1.5', wastePct: over.wastePct ?? '0.05',
    unitPriceSnapshot: over.unitPriceSnapshot ?? '20000', totalComponentCost: over.totalComponentCost ?? '31500',
    sortOrder: over.sortOrder ?? 0, ...over,
  };
}

export function linkedApu(over: Partial<LinkedApuView> = {}): LinkedApuView {
  return {
    apuTemplateId: over.apuTemplateId ?? 'a1',
    code: over.code ?? 'APU-MAM-01',
    name: over.name ?? 'Mampostería en bloque',
    unit: over.unit ?? 'm²',
    unitCostTotal: over.unitCostTotal ?? '50000',
    unitCostMaterials: over.unitCostMaterials ?? '31500',
    unitCostLabor: over.unitCostLabor ?? '15000',
    unitCostEquipment: over.unitCostEquipment ?? '0',
    unitCostTools: over.unitCostTools ?? '3500',
    unitCostToolDerived: over.unitCostToolDerived ?? '3500',
    unitCostSubcontract: over.unitCostSubcontract ?? '0',
    unitCostOther: over.unitCostOther ?? '0',
    defaultToolPct: over.defaultToolPct ?? '0.2',
    componentCount: over.componentCount ?? (over.components?.length ?? 2),
    components: over.components ?? [
      comp({ id: 'c1', componentType: 'material', resourceName: 'Cemento', sortOrder: 0 }),
      comp({ id: 'c2', componentType: 'labor', resourceName: undefined, laborRoleName: 'Oficial', resourceCode: undefined, unitPriceSnapshot: '60000', totalComponentCost: '15000', sortOrder: 1 }),
    ],
    origin: over.origin ?? 'Importado',
    archived: over.archived ?? false,
    incomplete: over.incomplete ?? false,
    boqLinks: over.boqLinks ?? [
      { chapterCode: '5', chapterName: 'Mampostería', itemCode: '5.1', itemDescription: 'Muro en bloque' },
    ],
    primaryChapterCode: over.primaryChapterCode ?? '5',
    primaryChapterName: over.primaryChapterName ?? 'Mampostería',
  };
}

export function selection(over: Partial<BudgetApuExportSelection> = {}): BudgetApuExportSelection {
  const linkedApus = over.linkedApus ?? [linkedApu()];
  return {
    payload: over.payload ?? basePayload(),
    versionEmitted: over.versionEmitted ?? false,
    linkedApus,
    counts: over.counts ?? {
      boqItems: 2, linkedApu: linkedApus.length, unlinkedItems: 1,
      archivedIncluded: 0, archivedExcluded: 0, incomplete: 0,
    },
  };
}
