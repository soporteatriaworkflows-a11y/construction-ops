/**
 * read-repository.ts — Acceso de SÓLO LECTURA a la base vía Drizzle para el
 * read-model.
 *
 * Propiedad: agent-db-rls. Contrato: `docs/READ_MODEL_CONTRACT.md §1`.
 *
 * Todas las consultas se filtran EXPLÍCITAMENTE por `organizationId` además de
 * la barrera real de RLS en PostgreSQL (defensa en profundidad). El acceso es
 * estrictamente de lectura: este módulo NO ejecuta INSERT/UPDATE/DELETE.
 *
 * NO abre conexión al importarse: `getDb()` es perezoso y el selector
 * (`index.ts`) valida la configuración antes de instanciar el repositorio
 * Drizzle, de modo que nunca se conecta silenciosamente.
 */

import { and, eq, inArray, asc, isNull } from 'drizzle-orm';

import { db as defaultDb, schema } from '@/lib/db';
import type { Uuid } from '@/lib/contracts/read-model';

/** Subconjunto de Drizzle que necesita el read-model (facilita inyección/tests). */
export type ReadDb = typeof defaultDb;

/**
 * Repositorio Drizzle de lectura. Encapsula las consultas crudas necesarias
 * para construir los DTOs; la derivación financiera la hace `compute.ts` con
 * cost-domain.
 */
export class DrizzleReadRepository {
  private readonly db: ReadDb;

  constructor(db: ReadDb = defaultDb) {
    this.db = db;
  }

  /** Proyectos de la organización (filtrado explícito + RLS). */
  async projects(organizationId: Uuid) {
    return this.db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.organizationId, organizationId));
  }

  /** Un proyecto por id, restringido a la organización. */
  async projectById(organizationId: Uuid, projectId: Uuid) {
    const rows = await this.db
      .select()
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, projectId),
          eq(schema.projects.organizationId, organizationId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /** Alcances de un proyecto. */
  async scopesByProject(projectId: Uuid) {
    return this.db
      .select()
      .from(schema.projectScopes)
      .where(eq(schema.projectScopes.projectId, projectId));
  }

  /** Un alcance por id. */
  async scopeById(scopeId: Uuid) {
    const rows = await this.db
      .select()
      .from(schema.projectScopes)
      .where(eq(schema.projectScopes.id, scopeId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Alcances de varios proyectos (para contar por proyecto). */
  async scopesByProjects(projectIds: readonly Uuid[]) {
    if (projectIds.length === 0) return [];
    return this.db
      .select()
      .from(schema.projectScopes)
      .where(inArray(schema.projectScopes.projectId, [...projectIds]));
  }

  /** Presupuestos (estimates) de un conjunto de alcances. */
  async estimatesByScopes(scopeIds: readonly Uuid[]) {
    if (scopeIds.length === 0) return [];
    return this.db
      .select()
      .from(schema.estimates)
      .where(inArray(schema.estimates.projectScopeId, [...scopeIds]));
  }

  /** Versiones de un conjunto de presupuestos. */
  async versionsByEstimates(estimateIds: readonly Uuid[]) {
    if (estimateIds.length === 0) return [];
    return this.db
      .select()
      .from(schema.estimateVersions)
      .where(inArray(schema.estimateVersions.estimateId, [...estimateIds]));
  }

  /** Una versión por id (sin filtro de organización: se valida vía JOIN/caller). */
  async versionById(versionId: Uuid) {
    const rows = await this.db
      .select()
      .from(schema.estimateVersions)
      .where(eq(schema.estimateVersions.id, versionId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Estimate por id. */
  async estimateById(estimateId: Uuid) {
    const rows = await this.db
      .select()
      .from(schema.estimates)
      .where(eq(schema.estimates.id, estimateId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Capítulos ACTIVOS de una versión (4E.2B: excluye archivados). */
  async chaptersByVersion(versionId: Uuid) {
    return this.db
      .select()
      .from(schema.chapters)
      .where(
        and(
          eq(schema.chapters.estimateVersionId, versionId),
          isNull(schema.chapters.archivedAt),
        ),
      );
  }

  /** Ítems BOQ ACTIVOS de una versión (4E.2B: excluye archivados). */
  async boqItemsByVersion(versionId: Uuid) {
    return this.db
      .select()
      .from(schema.boqItems)
      .where(
        and(
          eq(schema.boqItems.estimateVersionId, versionId),
          isNull(schema.boqItems.archivedAt),
        ),
      );
  }

  /** Reglas de costo indirecto de una versión. */
  async indirectRulesByVersion(versionId: Uuid) {
    return this.db
      .select()
      .from(schema.indirectCostRules)
      .where(eq(schema.indirectCostRules.estimateVersionId, versionId));
  }

  /** Plantillas APU de la organización. */
  async apuTemplates(organizationId: Uuid) {
    return this.db
      .select()
      .from(schema.apuTemplates)
      .where(eq(schema.apuTemplates.organizationId, organizationId));
  }

  /** Componentes de un conjunto de plantillas APU. */
  async apuComponentsByTemplates(templateIds: readonly Uuid[]) {
    if (templateIds.length === 0) return [];
    return this.db
      .select()
      .from(schema.apuComponents)
      .where(inArray(schema.apuComponents.apuTemplateId, [...templateIds]));
  }

  /** Recursos de catálogo de la organización. */
  async resources(organizationId: Uuid) {
    return this.db
      .select()
      .from(schema.resources)
      .where(eq(schema.resources.organizationId, organizationId));
  }

  /**
   * Observaciones de precio (resource_price_observations) de la organización,
   * con el nombre del proveedor. Para la visibilidad de precios del catálogo
   * (CATALOG_PRICE_VISIBILITY_V1). Solo lectura; el estado se resuelve en el
   * dominio puro `server/catalog/price-status`.
   */
  async resourcePriceObservationsByOrg(organizationId: Uuid) {
    return this.db
      .select({
        resourceId: schema.resourcePriceObservations.resourceId,
        observedPrice: schema.resourcePriceObservations.observedPrice,
        status: schema.resourcePriceObservations.status,
        observedAt: schema.resourcePriceObservations.observedAt,
        approvedAt: schema.resourcePriceObservations.approvedAt,
        supplierName: schema.suppliers.name,
      })
      .from(schema.resourcePriceObservations)
      .leftJoin(
        schema.suppliers,
        eq(schema.resourcePriceObservations.supplierId, schema.suppliers.id),
      )
      .where(eq(schema.resourcePriceObservations.organizationId, organizationId));
  }

  /** Grupos del workspace de cantidades por alcances (creación manual). */
  async workspaceGroupsByScopes(scopeIds: readonly Uuid[]) {
    if (scopeIds.length === 0) return [];
    return this.db
      .select()
      .from(schema.quantityWorkspaceGroups)
      .where(inArray(schema.quantityWorkspaceGroups.projectScopeId, [...scopeIds]));
  }

  /** Líneas del workspace de cantidades por grupos. */
  async workspaceLinesByGroups(groupIds: readonly Uuid[]) {
    if (groupIds.length === 0) return [];
    return this.db
      .select()
      .from(schema.quantityWorkspaceLines)
      .where(inArray(schema.quantityWorkspaceLines.groupId, [...groupIds]));
  }

  /** Grupos de cantidades de un conjunto de alcances. */
  async quantityGroupsByScopes(scopeIds: readonly Uuid[]) {
    if (scopeIds.length === 0) return [];
    return this.db
      .select()
      .from(schema.quantityGroups)
      .where(inArray(schema.quantityGroups.projectScopeId, [...scopeIds]));
  }

  /** Líneas de cantidad de un conjunto de grupos. */
  async quantityLinesByGroups(groupIds: readonly Uuid[]) {
    if (groupIds.length === 0) return [];
    return this.db
      .select()
      .from(schema.quantityLines)
      .where(inArray(schema.quantityLines.quantityGroupId, [...groupIds]));
  }

  /* --- Planificación (Oleada 3B — PLANNING_CONTRACT §3) ---
   *
   * Todas filtran por `organizationId` (defensa en profundidad) además de RLS.
   * Sólo lectura; el ensamblado de DTOs lo hace `compute-planning`.
   */

  /** Tareas del cronograma de un proyecto (orden por `sortOrder`). */
  async scheduleTasksByProject(organizationId: Uuid, projectId: Uuid) {
    return this.db
      .select()
      .from(schema.scheduleTasks)
      .where(
        and(
          eq(schema.scheduleTasks.organizationId, organizationId),
          eq(schema.scheduleTasks.projectId, projectId),
        ),
      )
      .orderBy(asc(schema.scheduleTasks.sortOrder));
  }

  /** Dependencias entre tareas de un proyecto. */
  async taskDependenciesByProject(organizationId: Uuid, projectId: Uuid) {
    return this.db
      .select()
      .from(schema.taskDependencies)
      .where(
        and(
          eq(schema.taskDependencies.organizationId, organizationId),
          eq(schema.taskDependencies.projectId, projectId),
        ),
      );
  }

  /**
   * Entradas de avance físico de un proyecto (append-only), opcionalmente
   * filtradas por tarea. Orden cronológico ascendente por `recordedAt`.
   */
  async progressEntriesByProject(
    organizationId: Uuid,
    projectId: Uuid,
    taskId?: Uuid,
  ) {
    const conditions = [
      eq(schema.progressEntries.organizationId, organizationId),
      eq(schema.progressEntries.projectId, projectId),
    ];
    if (taskId !== undefined) {
      conditions.push(eq(schema.progressEntries.taskId, taskId));
    }
    return this.db
      .select()
      .from(schema.progressEntries)
      .where(and(...conditions))
      .orderBy(asc(schema.progressEntries.recordedAt));
  }

  /**
   * Asignaciones de recursos de un proyecto, opcionalmente filtradas por tarea.
   */
  async resourceAssignmentsByProject(
    organizationId: Uuid,
    projectId: Uuid,
    taskId?: Uuid,
  ) {
    const conditions = [
      eq(schema.resourceAssignments.organizationId, organizationId),
      eq(schema.resourceAssignments.projectId, projectId),
    ];
    if (taskId !== undefined) {
      conditions.push(eq(schema.resourceAssignments.taskId, taskId));
    }
    return this.db
      .select()
      .from(schema.resourceAssignments)
      .where(and(...conditions));
  }

  /** Recursos por ids (para resolver nombres en asignaciones). */
  async resourcesByIds(ids: readonly Uuid[]) {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(schema.resources)
      .where(inArray(schema.resources.id, [...ids]));
  }

  /** Roles de mano de obra por ids (para resolver nombres en asignaciones). */
  async laborRolesByIds(ids: readonly Uuid[]) {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(schema.laborRoles)
      .where(inArray(schema.laborRoles.id, [...ids]));
  }
}
