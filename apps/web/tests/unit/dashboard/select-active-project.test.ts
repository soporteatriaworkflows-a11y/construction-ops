/**
 * select-active-project.test.ts — Selección del proyecto activo del dashboard
 * sin UUID demo hardcodeado (endurecimiento 4B.1).
 *
 * Propiedad: agent-dashboard.
 *
 * Demuestra:
 *  1. Base/organización vacía ⇒ `selectActiveProjectId` devuelve `null`
 *     (la página muestra estado vacío y NO consulta `getDashboardSummary`,
 *     evitando `ProjectNotFoundError` durante el prerender).
 *  2. Con proyectos ⇒ selecciona un proyecto REAL visible (no un UUID demo fijo).
 *  3. Modo fixture sigue funcionando (proyecto del golden master).
 *  4. SIN fallback silencioso db→fixture en el read-model.
 */
import { describe, it, expect } from 'vitest';
import { selectActiveProjectId } from '@/app/(dashboard)/dashboard/select-active-project';
import { getReadModel, DEMO_ORGANIZATION_ID } from '@/server/read-model';
import { ReadModelSourceNotConfiguredError } from '@/server/read-model/errors';
import type { ProjectListItem, ViewerContext } from '@/lib/contracts/read-model';

const DEMO_PROJECT_ID = '00000000-0000-4000-8000-000000000010';

function projectItem(id: string): ProjectListItem {
  return {
    id,
    name: `Proyecto ${id}`,
    status: 'active',
    location: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    scopeCount: 0,
    estimateCount: 0,
  };
}

describe('selectActiveProjectId — función pura', () => {
  it('lista vacía ⇒ null (base productiva sin proyectos)', () => {
    expect(selectActiveProjectId([])).toBeNull();
  });

  it('con proyectos ⇒ id del primero (proyecto real, no UUID demo)', () => {
    const real = '11111111-2222-4333-8444-555555555555';
    expect(selectActiveProjectId([projectItem(real), projectItem('otro')])).toBe(real);
  });

  it('NO contiene ningún UUID demo hardcodeado en su salida', () => {
    const real = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const picked = selectActiveProjectId([projectItem(real)]);
    expect(picked).toBe(real);
    expect(picked).not.toBe(DEMO_PROJECT_ID);
  });
});

describe('Dashboard — comportamiento sobre read-model (modo fixture)', () => {
  const fixtureViewer: ViewerContext = {
    organizationId: DEMO_ORGANIZATION_ID,
    role: 'management',
  };

  it('organización con proyectos ⇒ selecciona proyecto real y NO lanza', async () => {
    const rm = getReadModel({ env: { READ_MODEL_SOURCE: 'fixture' } });
    const projects = await rm.listProjects(fixtureViewer);
    const projectId = selectActiveProjectId(projects);

    expect(projectId).not.toBeNull();
    // En fixture el proyecto real ES el del golden master (existe en la base demo).
    await expect(rm.getDashboardSummary(fixtureViewer, projectId!)).resolves.toBeDefined();
  });

  it('organización SIN proyectos ⇒ null ⇒ no se invoca getDashboardSummary', async () => {
    const rm = getReadModel({ env: { READ_MODEL_SOURCE: 'fixture' } });
    const emptyOrgViewer: ViewerContext = {
      organizationId: '99999999-0000-4000-8000-000000000999',
      role: 'management',
    };

    const projects = await rm.listProjects(emptyOrgViewer);
    expect(projects).toHaveLength(0);

    const projectId = selectActiveProjectId(projects);
    expect(projectId).toBeNull();
    // La página NO consulta getDashboardSummary cuando projectId es null; por eso
    // no se produce ProjectNotFoundError durante el render/prerender.
  });
});

describe('Dashboard — sin fallback silencioso db→fixture', () => {
  it('READ_MODEL_SOURCE=db sin DATABASE_URL ⇒ error explícito (no fixture)', () => {
    expect(() =>
      getReadModel({ env: { READ_MODEL_SOURCE: 'db' }, logger: { info: () => {} } }),
    ).toThrow(ReadModelSourceNotConfiguredError);
  });
});
