/**
 * select-active-project.ts — Selección del proyecto activo del dashboard (4B.1).
 *
 * Propiedad: agent-dashboard.
 *
 * Función PURA, sin estado ni efectos. Reemplaza el antiguo `DEMO_PROJECT_ID`
 * hardcodeado del dashboard: el proyecto a resumir se deriva de la lista REAL de
 * proyectos visibles para el viewer (filtrada por organización vía read-model /
 * RLS). Si la organización no tiene proyectos (p. ej. base productiva vacía),
 * devuelve `null` y la página muestra estado vacío en lugar de consultar un UUID
 * demo inexistente (que provocaba `ProjectNotFoundError` durante el prerender).
 *
 * Reglas:
 *  - NO contiene ningún UUID demo ni fallback a datos del fixture.
 *  - El orden lo define el read-model (`listProjects`); aquí solo se toma el
 *    primero como proyecto activo del resumen gerencial del primer slice.
 */
import type { ProjectListItem } from '@/lib/contracts/read-model';

/**
 * Devuelve el id del proyecto activo (el primero de la lista visible) o `null`
 * si la organización no tiene proyectos.
 *
 * @param projects - Proyectos visibles para el viewer (ya filtrados por org).
 * @returns Id del proyecto activo o `null` si la lista está vacía.
 */
export function selectActiveProjectId(
  projects: ReadonlyArray<Pick<ProjectListItem, 'id'>>,
): string | null {
  return projects[0]?.id ?? null;
}
