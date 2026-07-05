/**
 * gantt-ux-static.test.ts — Wiring estático de P2_GANTT_UX_FIT_TO_WINDOW.
 *
 * Verifica por fuente (patrón de client-safe-surface-static):
 *  1. el Gantt expone controles de zoom (acercar/alejar/restablecer) y la
 *     opción "Ajustar a ventana", con el selector de escala Día/Semana/Mes;
 *  2. el cálculo de zoom vive en el helper puro del dominio planning;
 *  3. nada de lo ocultado por P1 al rol consulta se re-expone (gates
 *     client-safe intactos en planning y matrices de permisos sin tocar).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '../..');
const read = (rel: string) => readFileSync(resolve(webRoot, rel), 'utf8');

describe('P2_GANTT_UX static wiring', () => {
  it('gantt-chart expone zoom, restablecer y ajustar a ventana', () => {
    const source = read('components/planning/gantt-chart.tsx');
    expect(source).toContain('aria-label="Alejar"');
    expect(source).toContain('aria-label="Acercar"');
    expect(source).toContain('Restablecer');
    expect(source).toContain('Ajustar a ventana');
    expect(source).toContain("useState<number | 'fit'>('fit')");
    expect(source).toContain('aria-label="Zoom del Gantt"');
  });

  it('gantt-chart conserva el selector de escala Día/Semana/Mes', () => {
    const source = read('components/planning/gantt-chart.tsx');
    expect(source).toContain("const VIEW_MODES = ['Day', 'Week', 'Month'] as const");
    expect(source).toContain("Day: 'Día'");
    expect(source).toContain("Week: 'Semana'");
    expect(source).toContain("Month: 'Mes'");
    expect(source).toContain('aria-label="Escala de tiempo"');
  });

  it('el ancho de columna sale del helper puro y el contenedor limita alto/scroll', () => {
    const source = read('components/planning/gantt-chart.tsx');
    expect(source).toContain('ganttColumnWidth(');
    expect(source).toContain('ganttFitZoom(');
    expect(source).toContain('column_width: columnWidth');
    expect(source).toContain('max-h-[65vh] overflow-auto');
    const helper = read('modules/planning/gantt-zoom.ts');
    expect(helper).not.toContain('document.');
    expect(helper).not.toContain('window.');
  });

  it('P2B1: la barra usa etiqueta corta y el nombre completo viaja en fullName', () => {
    const mapping = read('modules/planning/gantt-mapping.ts');
    expect(mapping).toContain('name: shortGanttLabel(task)');
    expect(mapping).toContain('fullName: fullGanttLabel(task)');
    const chart = read('components/planning/gantt-chart.tsx');
    expect(chart).toContain('fullName');
    const css = read('components/planning/gantt-chart.css');
    expect(css).toContain('.gantt .bar-wrapper .bar-label.big');
  });

  it('P2B1: zoom minimo por escala y escala inicial por rango', () => {
    const helper = read('modules/planning/gantt-zoom.ts');
    expect(helper).toContain('GANTT_ZOOM_MIN_BY_MODE');
    expect(helper).toContain('Day: 0.5');
    expect(helper).toContain('Week: 0.35');
    expect(helper).toContain('Month: 0.35');
    expect(helper).toContain('export function pickDefaultViewMode');
    const chart = read('components/planning/gantt-chart.tsx');
    expect(chart).toContain('pickDefaultViewMode(ganttRangeDays(tasks))');
    expect(chart).toContain('GANTT_ZOOM_MIN_BY_MODE[viewMode]');
  });

  it('P1 client-safe no se revierte: gates de consulta en planning intactos', () => {
    const page = read('app/(dashboard)/planning/[scheduleId]/page.tsx');
    const shell = read('app/(dashboard)/planning/[scheduleId]/schedule-detail-shell.tsx');
    const workspace = read('app/(dashboard)/planning/[scheduleId]/schedule-workspace.tsx');
    expect(page).toContain("const isClientSafe = viewerProfileRole === 'consulta'");
    expect(page).toContain('warningCount={isClientSafe ? 0 : noApu + noYield}');
    expect(page).toContain('clientSafe={isClientSafe}');
    expect(shell).toContain("{ id: 'gantt', label: 'Gantt', show: true }");
    expect(shell).toContain('clientSafe={clientSafe}');
    expect(workspace).toContain('{!clientSafe && isActivity && (');
    expect(workspace).toContain('{!clientSafe && <ProductivityDot source={t.productivitySource} />}');
  });

  it('P1 client-safe no se revierte: simulador comercial sigue gateado', () => {
    const source = read(
      'app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/workspace/page.tsx',
    );
    expect(source).toContain(
      "const canUseCommercialSimulator = ['admin', 'gerencia', 'presupuestos'].includes(viewer.profileRole ?? '')",
    );
    expect(source).toContain('{canUseCommercialSimulator && (');
    expect(source).not.toContain('LayoutGrid');
  });

  it('matrices de permisos y role-map no cambian en esta fase', () => {
    const moduleAccess = read('server/access/module-access.ts');
    expect(moduleAccess).toContain("'price-intelligence': ['admin', 'gerencia', 'compras']");
    const roleMap = read('server/auth/role-map.ts');
    expect(roleMap.length).toBeGreaterThan(0);
    const types = read('server/auth/types.ts');
    expect(types).toContain("'consulta',");
  });
});
