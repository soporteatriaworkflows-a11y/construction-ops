/**
 * workspace-route-config.test.ts — Guardas de la oleada OPERATIONAL BUDGET UX V1.
 *
 * Verifica por fuente que el BOQ Workspace, la edición rápida, el simulador
 * comercial y el dashboard operativo respetan los invariantes:
 *  - cálculo financiero SOLO server-side (subtotal nunca viaja del navegador);
 *  - issued inmutable; RLS como barrera (notFound en cross-org);
 *  - simulador read-only (sin persistencia, disclaimer, base server-derived);
 *  - desglose por capítulo (sin breakdown por tipo de costo inventado).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const base = resolve(
  here,
  '../../../app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]',
);
const read = (rel: string) => readFileSync(resolve(base, rel), 'utf8');
const readApp = (rel: string) =>
  readFileSync(resolve(here, '../../../app/(dashboard)', rel), 'utf8');

describe('BOQ Workspace — página servidor (A/C/D)', () => {
  const source = read('workspace/page.tsx');

  it('viewer real + repositorio existente + notFound (RLS barrera real)', () => {
    expect(source).toMatch(/await\s+resolveViewer\(\)/);
    expect(source).toMatch(/getEstimatesWriteRepository\(\)/);
    expect(source).toMatch(/notFound\(\)/);
    expect(source).toMatch(/estimate\.projectScopeId\s*!==\s*scopeId/);
  });

  it('carga capítulos+ítems con includeArchived (el filtro es visual)', () => {
    expect(source).toMatch(/listChaptersByEstimateVersion\([\s\S]*includeArchived:\s*true/);
    expect(source).toMatch(/listItemsByChapter\([\s\S]*includeArchived:\s*true/);
  });

  it('resumen financiero y desglose son server-derived', () => {
    expect(source).toMatch(/calculateEstimateFinancialSummary\(/);
    expect(source).toMatch(/computeChapterBreakdown\(/);
  });

  it('gate de edición: modo creación + versión editable (issued inmutable)', () => {
    expect(source).toMatch(/isCreationModeEnabled\(\)/);
    expect(source).toMatch(/isVersionEditable\(active\.status\)/);
    expect(source).toMatch(/canEdit\s*&&\s*versionEditable/);
  });

  it('desglose por capítulo y deuda COST_TYPE_BREAKDOWN_FOUNDATION declarada', () => {
    expect(source).toMatch(/Desglose por capítulos/);
    expect(source).toMatch(/COST_TYPE_BREAKDOWN_FOUNDATION/);
  });

  it('el simulador recibe el total técnico server-derived (grandTotal)', () => {
    expect(source).toMatch(/CommercialSimulator[\s\S]*baseTotal=\{financialSummary\.grandTotal\}/);
  });
});

describe('BOQ Workspace — cliente denso con edición rápida (A/B)', () => {
  const source = read('workspace/boq-workspace.tsx');

  it('reutiliza updateItemAction (4E.2A); sin nueva superficie de mutación', () => {
    expect(source).toMatch(/import \{ updateItemAction[\s\S]*\} from '\.\.\/item-actions'/);
  });

  it('NUNCA envía subtotal/totales: solo campos permitidos', () => {
    expect(source).not.toMatch(/fd\.set\(\s*'subtotal'/);
    expect(source).not.toMatch(/fd\.set\(\s*'directTotal'/);
    expect(source).not.toMatch(/fd\.set\(\s*'grandTotal'/);
    for (const field of ['code', 'description', 'unit', 'quantity', 'unitPrice']) {
      expect(source).toContain(`fd.set('${field}'`);
    }
  });

  it('fila y resumen se actualizan con la RESPUESTA del servidor + refresh', () => {
    expect(source).toMatch(/res\.subtotal/);
    expect(source).toMatch(/setSummary\(res\.financial\)/);
    expect(source).toMatch(/router\.refresh\(\)/);
  });

  it('feedback visual: guardando / guardado / error', () => {
    expect(source).toMatch(/Guardando…/);
    expect(source).toMatch(/Guardado/);
    expect(source).toMatch(/kind:\s*'error'/);
  });

  it('sticky header + búsqueda + filtros + total siempre visible', () => {
    expect(source).toMatch(/sticky top-0/); // thead
    expect(source).toMatch(/sticky top-14/); // toolbar
    expect(source).toMatch(/Buscar por código o descripción/);
    expect(source).toMatch(/WORKSPACE_FILTER_LABELS/);
    expect(source).toMatch(/Total general/);
  });

  it('issued bloqueado: banner de inmutabilidad y edición condicionada', () => {
    expect(source).toMatch(/versionLocked/);
    expect(source).toMatch(/inmutable/i);
    expect(source).toMatch(/canMutate/);
  });

  it('sin drag-and-drop ni reorder (fuera de alcance)', () => {
    expect(source).not.toMatch(/draggable|onDragStart|reorder/i);
  });
});

describe('Simulador comercial — acción servidor (E)', () => {
  const source = read('workspace/simulator-actions.ts');

  it('base técnico SIEMPRE server-derived; jamás del navegador', () => {
    expect(source).toMatch(/calculateEstimateFinancialSummary\(/);
    expect(source).toMatch(/summary\.grandTotal/);
    expect(source).not.toMatch(/formData\.get\(\s*'baseTotal'/);
  });

  it('read-only: no escribe BOQ/AIU/versiones (sin métodos de mutación)', () => {
    expect(source).not.toMatch(/updateBoqItem|createBoqItem|updateEstimateVersionAiu|issueEstimateVersion|insert|upsert|\.update\(/);
  });

  it('valida con el dominio puro y mapea errores por campo', () => {
    expect(source).toMatch(/simulateCommercialPrice\(/);
    expect(source).toMatch(/CommercialSimulationValidationError/);
  });
});

describe('Simulador comercial — panel cliente (E/F)', () => {
  const source = read('workspace/commercial-simulator.tsx');

  it('muestra el disclaimer obligatorio', () => {
    expect(source).toMatch(/COMMERCIAL_SIMULATION_DISCLAIMER/);
  });

  it('diferenciado visualmente del presupuesto técnico', () => {
    expect(source).toMatch(/no modifica el presupuesto técnico/);
    expect(source).toMatch(/border-dashed/);
  });

  it('vista previa comercial completa (F): líneas requeridas', () => {
    for (const label of [
      'Total técnico',
      'Subtotal comercial',
      'Descuento',
      'Subtotal con descuento',
      'Impuesto adicional',
      'Precio final simulado',
      'Precio objetivo',
      'Diferencia frente al objetivo',
    ]) {
      expect(source).toContain(label);
    }
  });

  it('estados frente al objetivo: dentro / por encima / por debajo', () => {
    expect(source).toMatch(/Dentro del objetivo/);
    expect(source).toMatch(/Por encima del objetivo/);
    expect(source).toMatch(/Por debajo del objetivo/);
  });

  it('sin persistencia en esta oleada (decisión registrada)', () => {
    expect(source).toMatch(/Sin persistencia/i);
    expect(source).not.toMatch(/localStorage|sessionStorage|\.insert\(|\.upsert\(|\.update\(/);
  });
});

describe('Dashboard operativo (G)', () => {
  const source = readApp('dashboard/page.tsx');

  it('KPIs operativos: proyectos, presupuestos activos, versiones emitidas', () => {
    expect(source).toMatch(/Proyectos/);
    expect(source).toMatch(/Presupuestos activos/);
    expect(source).toMatch(/Versiones emitidas/);
    expect(source).toMatch(/countIssuedEstimateVersions\(/);
  });

  it('🔒 precios por revisar SOLO para roles autorizados', () => {
    // REVIEW_CENTER_V1: el KPI va enlazado al centro de revisión, siempre
    // detrás del guard de roles autorizados.
    expect(source).toMatch(
      /isAuthorizedForSavings\s*&&\s*\(\s*<Link[\s\S]{0,400}?<KpiCard[\s\S]*?Precios por revisar/,
    );
    expect(source).toMatch(/countPendingResourcePriceObservations\(/);
  });

  it('accesos rápidos: proyectos, catálogo, proveedores, inteligencia de precios', () => {
    expect(source).toMatch(/QuickLink href="\/projects"/);
    expect(source).toMatch(/QuickLink href="\/catalog"/);
    expect(source).toMatch(/QuickLink href="\/catalog\/providers"/);
    expect(source).toMatch(/Inteligencia de precios/);
  });

  it('los conteos son tolerantes a fallo (no rompen la página)', () => {
    expect(source).toMatch(/activeEstimateCount\s*=\s*null/);
    expect(source).toMatch(/pendingPriceCount\s*=\s*null/);
  });
});

describe('Acceso al workspace desde el detalle del presupuesto', () => {
  const source = read('page.tsx');
  it('CTA "Abrir workspace" presente cuando hay contenido', () => {
    expect(source).toMatch(/Abrir workspace/);
    expect(source).toMatch(/\/workspace/);
  });
});
