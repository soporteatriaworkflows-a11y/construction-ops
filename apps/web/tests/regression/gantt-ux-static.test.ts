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
    // P2C1: la caja de scroll es el propio .gantt-container (container_height
    // numérico); el wrapper ya no scrollea y la leyenda queda fuera, debajo.
    expect(source).toContain('container_height: containerHeight');
    expect(source).toContain('ganttContainerHeight(tasks.length)');
    expect(source).not.toContain('max-h-[65vh] overflow-auto');
    expect(source.indexOf('frappe-gantt-container')).toBeLessThan(source.indexOf('<GanttLegend />'));
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

  it('P2B2: seleccion de barra por data-id y panel lateral en la pestania Gantt', () => {
    const shell = read('app/(dashboard)/planning/[scheduleId]/schedule-detail-shell.tsx');
    expect(shell).toContain(".closest?.('.bar-wrapper')");
    expect(shell).toContain("getAttribute('data-id')");
    expect(shell).toContain('onClick={handleGanttClick}');
    expect(shell).toContain('lg:grid-cols-[minmax(0,1fr)_320px]');
    expect(shell).toContain('emptyTitle="Selecciona una actividad del Gantt"');
    // Panel del Gantt SIN edicion en P2B2: no se pasa onRequestEdit en esa pestania.
    const ganttPanelBlock = shell.slice(shell.indexOf("tab === 'gantt'"), shell.indexOf("tab === 'trace'"));
    expect(ganttPanelBlock).toContain('TaskDetailPanel');
    expect(ganttPanelBlock).not.toContain('onRequestEdit');
  });

  it('P2B2: TaskDetailPanel extraido conserva los gates client-safe', () => {
    const panel = read('app/(dashboard)/planning/[scheduleId]/task-detail-panel.tsx');
    expect(panel).toContain('{!clientSafe && (task.crewLabel || task.crewSize) && (');
    expect(panel).toContain('{!clientSafe && isActivity && (task.quantitySnapshot || task.unitSnapshot) && (');
    expect(panel).toContain("{!clientSafe && task.productivitySource === 'manual' && (");
    expect(panel).toContain("{!clientSafe && task.productivitySource === 'unknown' && (");
    const workspace = read('app/(dashboard)/planning/[scheduleId]/schedule-workspace.tsx');
    expect(workspace).toContain("import { TaskDetailPanel } from './task-detail-panel'");
  });

  it('P2B3: edicion de duracion en panel Gantt gateada por el permiso estructural existente', () => {
    const page = read('app/(dashboard)/planning/[scheduleId]/page.tsx');
    // El gate viene de canManage (admin/gerencia/presupuestos) y excluye archivados:
    // consulta, obra y compras NUNCA reciben canEditDuration=true.
    expect(page).toContain("canEditDuration={canManage && schedule.status !== 'archived'}");
    const shell = read('app/(dashboard)/planning/[scheduleId]/schedule-detail-shell.tsx');
    expect(shell).toContain('canEditDuration = false');
    expect(shell).toContain("{canEditDuration && ganttSelected && ganttSelected.taskType !== 'chapter' && !ganttSelected.isMilestone && (");
    const form = read('app/(dashboard)/planning/[scheduleId]/gantt-duration-form.tsx');
    // Reusa la action existente (sin action nueva, sin permisos nuevos).
    expect(form).toContain('updateTaskAction(scheduleId, task.id, { durationDays: parsed })');
    expect(form).toContain('min={1}');
    expect(form).toContain('parsed >= 1');
    expect(form).toContain('Editar duración');
    expect(form).toContain('Duración en días');
    expect(form).toContain('Guardar duración');
    // Sin heuristicas de duracion en P2B3 (eso es P2B4).
    expect(form).not.toContain('duration-criteria');
  });

  it('P2C1: viewport del Gantt sin scroll anidado y leyenda fuera del area scrolleable', () => {
    const shell = read('app/(dashboard)/planning/[scheduleId]/schedule-detail-shell.tsx');
    const ganttBlock = shell.slice(shell.indexOf("tab === 'gantt'"), shell.indexOf("tab === 'trace'"));
    expect(ganttBlock).not.toContain('max-h-[70vh]');
    expect(ganttBlock).not.toContain('overflow-auto');
    expect(ganttBlock).toContain('onClick={handleGanttClick}');
    const helper = read('modules/planning/gantt-zoom.ts');
    expect(helper).toContain('export function ganttContainerHeight');
    expect(helper).toContain('GANTT_VIEWPORT_MIN_HEIGHT = 240');
    expect(helper).toContain('GANTT_VIEWPORT_MAX_HEIGHT = 560');
  });

  it('P2C1: header con contexto Proyecto/Alcance/Presupuesto y fallbacks amables', () => {
    const page = read('app/(dashboard)/planning/[scheduleId]/page.tsx');
    expect(page).toContain('getScheduleContextForViewer(schedule.estimateVersionId)');
    expect(page).toContain("{context?.projectName ?? 'Proyecto'}");
    expect(page).toContain("Alcance: {context?.scopeName ?? 'Alcance no definido'}");
    expect(page).toContain('Ver proyecto');
    expect(page).toContain('Ver presupuesto');
    // El link a presupuesto solo aparece con la cadena completa resuelta.
    expect(page).toContain('{context?.estimateId && context.scopeId && context.projectId && (');
    // Solo nombres/navegacion: el contexto NO consulta montos.
    const repo = read('server/planning/repository.ts');
    expect(repo).toContain('getScheduleContext(estimateVersionId: Uuid)');
    // El select del contexto trae SOLO ids/nombres/estado — sin montos.
    expect(repo).toContain(
      "'id, version_number, status, estimates(id, name, project_scope_id, project_scopes(id, name, project_id, projects(id, name)))'",
    );
    const service = read('server/planning/service.ts');
    expect(service).toContain('export async function getScheduleContextForViewer');
    expect(service).toContain('return null;');
  });

  it('P2C4a: advertencias de duracion gateadas client-safe en el panel', () => {
    const panel = read('app/(dashboard)/planning/[scheduleId]/task-detail-panel.tsx');
    expect(panel).toContain('classifyActivityDurationCategory(task.name, task.chapterName)');
    // La advertencia SOLO se muestra a roles internos (mismo patron P1).
    expect(panel).toContain('{!clientSafe && durationWarning && (');
    // Solo actividades: capitulos e hitos no reciben criterio.
    expect(panel).toContain('isActivity && !task.isMilestone');
  });

  it('P2C4a: indicador global interno con copy aprobado; consulta no lo ve', () => {
    const page = read('app/(dashboard)/planning/[scheduleId]/page.tsx');
    expect(page).toContain('buildScheduleDurationReport(workspaceTasks)');
    expect(page).toContain("{!isClientSafe && (durationReport.outOfRangeCount > 0 || schedule.status === 'draft') && (");
    expect(page).toContain('Este cronograma dura {durationReport.totalDays}');
    expect(page).toContain('Revisar antes de publicar.');
    expect(page).toContain('Cronograma en borrador con datos estimados.');
    const criteria = read('modules/planning/duration-criteria.ts');
    expect(criteria).toContain('Duración inusualmente alta');
    expect(criteria).toContain('Duración inusualmente baja');
    // Modulo puro: sin DOM ni servidor.
    expect(criteria).not.toContain('document.');
    expect(criteria).not.toContain("'use server'");
    // El generador NO cambia en P2C4a (el fallback por categoria es P2C4b).
    const generator = read('modules/planning/generator.ts');
    expect(generator).not.toContain('duration-criteria');
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
    expect(workspace).toContain('{!clientSafe && <ProductivityDot source={t.productivitySource} />}');
    const panel = read('app/(dashboard)/planning/[scheduleId]/task-detail-panel.tsx');
    expect(panel).toContain('{!clientSafe && isActivity && (');
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
