import { describe, expect, it } from 'vitest';
import {
  projectIdFromSearchParams,
  resolveDashboardProjectScope,
} from '@/app/(dashboard)/dashboard/project-scope';
import type { ProjectListItem } from '@/lib/contracts/read-model';

function project(id: string, name = id): ProjectListItem {
  return {
    id,
    name,
    status: 'active',
    location: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    scopeCount: 1,
    estimateCount: 1,
  };
}

describe('dashboard project scope selector', () => {
  it('sin projectId usa vista global y deja un proyecto destacado explicito', () => {
    const scope = resolveDashboardProjectScope([project('entre-patios'), project('just-padel')], null);

    expect(scope.mode).toBe('global');
    expect(scope.selectedProject).toBeNull();
    expect(scope.highlightedProject?.id).toBe('entre-patios');
    expect(scope.invalidProjectId).toBeNull();
  });

  it('projectId visible activa vista scoped del proyecto solicitado', () => {
    const scope = resolveDashboardProjectScope([project('entre-patios'), project('just-padel')], 'just-padel');

    expect(scope.mode).toBe('project');
    if (scope.mode !== 'project') throw new Error('expected project scope');
    expect(scope.selectedProject.id).toBe('just-padel');
    expect(scope.highlightedProject.id).toBe('just-padel');
  });

  it('projectId invalido no crashea y cae a global con aviso', () => {
    const scope = resolveDashboardProjectScope([project('entre-patios')], 'hidden-project');

    expect(scope.mode).toBe('global');
    expect(scope.selectedProject).toBeNull();
    expect(scope.highlightedProject?.id).toBe('entre-patios');
    expect(scope.invalidProjectId).toBe('hidden-project');
  });

  it('extrae projectId desde searchParams de Next 16 y normaliza vacios/arrays', () => {
    expect(projectIdFromSearchParams({ projectId: 'just-padel' })).toBe('just-padel');
    expect(projectIdFromSearchParams({ projectId: ['entre-patios', 'ignored'] })).toBe('entre-patios');
    expect(projectIdFromSearchParams({ projectId: '   ' })).toBeNull();
    expect(projectIdFromSearchParams({})).toBeNull();
  });
});