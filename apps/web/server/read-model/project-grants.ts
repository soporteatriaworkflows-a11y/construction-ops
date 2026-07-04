/**
 * project-grants.ts — Resolución PURA del alcance de proyectos del viewer
 * (V5.6.4 CLIENT_PROJECT_SCOPE).
 *
 * Propiedad: agent-orchestrator. Contrato:
 * `docs/design-references/V5_6_4_CLIENT_PROJECT_SCOPE.md §9`.
 *
 * Reglas:
 *  - Solo el ViewerRole `client` queda restringido por grants; el resto de
 *    roles conserva el alcance por organización (RLS sigue siendo la barrera
 *    real de aislamiento entre organizaciones).
 *  - Deny-by-default (fail-closed): un viewer `client` SIN `projectGrants`
 *    (undefined) o con lista vacía NO ve ningún proyecto. Ningún camino de la
 *    aplicación debe "abrir" el alcance por omisión.
 *  - `'all'` existe para dos casos legítimos: roles internos exportando con
 *    proyección client (anti-escalada ya garantiza que es MENOS privilegio) y
 *    el modo demo/fixture (sin concepto de grants).
 *  - Anti-fuga de existencia: los consumidores tratan un proyecto fuera del
 *    alcance EXACTAMENTE igual que uno inexistente (`ProjectNotFoundError`),
 *    nunca con un error de permisos.
 */
import type { Uuid, ViewerContext } from '@/lib/contracts/read-model';

/** Alcance efectivo: sin restricción o el conjunto de proyectos permitidos. */
export type GrantedProjects = 'all' | ReadonlySet<Uuid>;

/**
 * Resuelve el alcance de proyectos del `viewer`. PURA (sin I/O).
 *
 * V5.6.6C (INTERNAL_PROJECT_GRANTS): el alcance ya no depende del ViewerRole
 * sino de los grants resueltos server-side — los roles internos SCOPED
 * (obra/compras) llegan con una LISTA de proyectos igual que `client`, y los
 * allow-all (admin/gerencia/presupuestos) llegan con `'all'`.
 *  - `projectGrants` lista ⇒ ese conjunto exacto (cualquier rol).
 *  - `projectGrants` 'all' ⇒ sin restricción.
 *  - `projectGrants` ausente ⇒ fail-closed SOLO para `client` (paridad
 *    V5.6.4); para el resto conserva 'all' (literales demo internos).
 */
export function resolveGrantedProjects(viewer: ViewerContext): GrantedProjects {
  if (viewer.projectGrants === 'all') return 'all';
  if (viewer.projectGrants !== undefined) return new Set(viewer.projectGrants);
  return viewer.role === 'client' ? new Set<Uuid>() : 'all';
}

/** ¿El `projectId` está dentro del alcance del `viewer`? */
export function isProjectGranted(viewer: ViewerContext, projectId: Uuid): boolean {
  const granted = resolveGrantedProjects(viewer);
  return granted === 'all' || granted.has(projectId);
}

/**
 * Filtra una lista de entidades con `id` de proyecto según el alcance del
 * viewer. Con `'all'` devuelve la misma referencia (sin costo).
 */
export function filterGrantedProjects<T extends { id: Uuid }>(
  viewer: ViewerContext,
  projects: readonly T[],
): readonly T[] {
  const granted = resolveGrantedProjects(viewer);
  if (granted === 'all') return projects;
  return projects.filter((p) => granted.has(p.id));
}
