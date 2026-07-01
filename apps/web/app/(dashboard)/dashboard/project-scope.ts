/**
 * project-scope.ts â€” Alcance visible del dashboard (V5.4.2D).
 *
 * Puro y sin estado: valida un `projectId` de query contra los proyectos visibles
 * del viewer. Sin query vÃ¡lida, la vista es global de organizaciÃ³n y el primer
 * proyecto queda solo como destacado explÃ­cito, nunca como "total global".
 */
import type { ProjectListItem } from '@/lib/contracts/read-model';

export type DashboardProjectScope =
  | {
      mode: 'global';
      selectedProject: null;
      highlightedProject: ProjectListItem | null;
      invalidProjectId: string | null;
    }
  | {
      mode: 'project';
      selectedProject: ProjectListItem;
      highlightedProject: ProjectListItem;
      invalidProjectId: null;
    };

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export function projectIdFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): string | null {
  return firstParam(searchParams.projectId);
}

export function resolveDashboardProjectScope(
  projects: readonly ProjectListItem[],
  requestedProjectId: string | null,
): DashboardProjectScope {
  const highlightedProject = projects[0] ?? null;
  if (!requestedProjectId) {
    return { mode: 'global', selectedProject: null, highlightedProject, invalidProjectId: null };
  }

  const selectedProject = projects.find((project) => project.id === requestedProjectId) ?? null;
  if (!selectedProject) {
    return {
      mode: 'global',
      selectedProject: null,
      highlightedProject,
      invalidProjectId: requestedProjectId,
    };
  }

  return {
    mode: 'project',
    selectedProject,
    highlightedProject: selectedProject,
    invalidProjectId: null,
  };
}
