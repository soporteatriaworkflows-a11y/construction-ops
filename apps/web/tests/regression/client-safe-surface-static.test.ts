import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '../../app');
const serverRoot = resolve(here, '../../server');
const readApp = (rel: string) => readFileSync(resolve(appRoot, rel), 'utf8');
const readServer = (rel: string) => readFileSync(resolve(serverRoot, rel), 'utf8');

describe('P1_CLIENT_SAFE_SURFACE static wiring', () => {
  it('consulta no ve el simulador comercial; admin/gerencia/presupuestos si', () => {
    const source = readApp('(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/workspace/page.tsx');
    expect(source).toContain("const canUseCommercialSimulator = ['admin', 'gerencia', 'presupuestos'].includes(viewer.profileRole ?? '')");
    expect(source).toContain('{canUseCommercialSimulator && (');
    expect(source).toContain('<CommercialSimulator estimateId={estimateId} baseTotal={financialSummary.grandTotal} />');
  });

  it('dashboard scoped no ofrece boton global todos los proyectos', () => {
    const source = readApp('(dashboard)/dashboard/page.tsx');
    expect(source).toContain('allowGlobal &&');
    expect(source).toContain('allowGlobal={!isScopedProfileRole(profileRole)}');
    expect(source).toContain("requestedProjectId ?? (isScopedDashboard ? (projects[0]?.id ?? null) : null)");
  });

  it('cronograma consulta conserva Gantt y oculta rendimientos/vinculos internos', () => {
    const page = readApp('(dashboard)/planning/[scheduleId]/page.tsx');
    const shell = readApp('(dashboard)/planning/[scheduleId]/schedule-detail-shell.tsx');
    const workspace = readApp('(dashboard)/planning/[scheduleId]/schedule-workspace.tsx');
    expect(page).toContain("const isClientSafe = viewerProfileRole === 'consulta'");
    expect(page).toContain('warningCount={isClientSafe ? 0 : noApu + noYield}');
    expect(page).toContain('clientSafe={isClientSafe}');
    expect(shell).toContain("{ id: 'gantt', label: 'Gantt', show: true }");
    expect(shell).toContain('clientSafe={clientSafe}');
    expect(workspace).toContain('{!clientSafe && (');
    expect(workspace).toContain('{!clientSafe && isActivity && (');
    expect(workspace).toContain('{!clientSafe && <ProductivityDot source={t.productivitySource} />}');
  });

  it('price intelligence muestra mensaje claro sin cambiar la matriz de permisos', () => {
    const page = readApp('(dashboard)/catalog/resources/[resourceId]/price-intelligence/page.tsx');
    const moduleAccess = readServer('access/module-access.ts');
    expect(page).toContain("checkModuleAccess('price-intelligence')");
    expect(page).not.toContain("requireModuleAccess('price-intelligence')");
    expect(page).toContain('Esta accion esta disponible para perfiles autorizados de analisis de precios');
    expect(moduleAccess).toContain("'price-intelligence': ['admin', 'gerencia', 'compras']");
    expect(moduleAccess).not.toContain("'price-intelligence': ['admin', 'gerencia', 'compras', 'consulta']");
  });
});
