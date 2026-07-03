# V5.6.4 — CLIENT_PROJECT_SCOPE (contrato de fase)

**Fecha:** 2026-07-02 · **Owner:** agent-orchestrator (Program Owner + Security
Architect) · **Estado:** contrato congelado; implementación por fases con
compuerta explícita antes de aplicar migraciones a Supabase Cloud.

Base verificada: `origin/main = a399a5c` (post V5.6.2, V5.6.2B, V5.6.3A, V5.7A).

---

## 1. Diagnóstico actual (verificado en el repo)

- `profiles`: 1 usuario → 1 organización, rol plano
  (`admin·gerencia·presupuestos·obra·compras·consulta`). **No existe ninguna
  tabla usuario↔proyecto reutilizable** (verificado: migraciones completas +
  `docs/DATABASE_SCHEMA.md`). Las invitaciones (`organization_invitations`)
  son org-level, no project-level.
- `consulta` → ViewerRole `client` (`role-map.ts`). V5.6.2 lo limita por
  **módulo** (`module-access.ts`) y V5.6.2B filtra superficies UX, pero dentro
  de los módulos permitidos ve **todos los proyectos de la organización**:
  `DrizzleReadModelRepository.listProjects` consulta
  `repo.projects(viewer.organizationId)` sin más filtro.
- El dashboard deriva su alcance de `listProjects` (`select-active-project.ts`,
  `project-scope.ts`) y ya tiene estado vacío para 0 proyectos. La paleta ⌘K y
  el resto de superficies consumen el mismo read-model.
- Exports (`/api/exports`): anti-escalada de perfil ya existe
  (`isSameOrLessPrivileged`), pero `export-service.ts` construye su propio
  `ViewerContext {organizationId, role: profile}` sin noción de proyecto.
- RLS actual: `projects_select` = `organization_id = app.current_org()`
  (org-scoped). La cadena hija (project_scopes → estimates →
  estimate_versions → chapters → boq_items → indirect_cost_rules →
  quantity_groups/lines) deriva por `EXISTS (... FROM projects ...)`, por lo
  que **hereda automáticamente** cualquier endurecimiento de
  `projects_select`. En cambio, las tablas de planning
  (`schedule_tasks`, `task_dependencies`, `progress_entries`,
  `resource_assignments`, `planning_schedules`) y las de cantidades nuevas
  (`quantity_workspace_*`, `quantity_takeoff_*`, `quantity_import_batches`)
  usan `organization_id` directo y **NO heredan** (quedan para V5.6.5).

## 2. Riesgo exacto de la RLS org-scoped (hallazgo de seguridad)

El navegador recibe `NEXT_PUBLIC_SUPABASE_URL` + publishable key
(`lib/supabase/client.ts`). Un usuario `consulta` con sesión válida puede
llamar a **PostgREST directamente** con su JWT. Con la RLS actual:

- `projects` y toda su cadena le devuelven **todos** los proyectos de la org.
- La proyección client-safe (campos 🔒) vive en el read-model de la app
  (`projectDashboardForRole`, `projectApuDetailForRole`, …), **no en la DB**:
  por PostgREST el `consulta` lee columnas 🔒 crudas (`client_reference`,
  descuentos, notas internas).
- Además, políticas de escritura org-scoped sin check de rol (p. ej.
  `projects_update`) permiten hoy a un `consulta` técnico **mutar** filas vía
  PostgREST. (Gap pre-existente; se cierra por fases, ver §10/§11.)

## 3. Por qué el app-layer NO basta para cliente externo real

El enforcement app-layer (fases C/D) corrige la experiencia y todos los
caminos servidos por la aplicación, pero no puede interceptar el camino
navegador→PostgREST. Conclusión operativa (regla de esta fase):

> **NO entregar cuentas `consulta` a clientes externos reales hasta aplicar y
> validar la migración RLS project-scoped (fase B, compuerta) y cerrar V5.6.5
> (tablas no-cascada + write-hardening).**

## 4. Modelo de datos: `project_access_grants`

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| organization_id | uuid NOT NULL | FK organizations ON DELETE CASCADE |
| profile_id | uuid NOT NULL | FK profiles ON DELETE CASCADE |
| project_id | uuid NOT NULL | FK projects ON DELETE CASCADE |
| granted_by | uuid NULL | FK profiles ON DELETE SET NULL; NULL = backfill/sistema |
| created_at | timestamptz NOT NULL | DEFAULT now() |

- UNIQUE `(profile_id, project_id)`; índices `(organization_id)`,
  `(profile_id)`, `(project_id)`.
- Coherencia org (profile y project de la MISMA org) validada en la RPC (no
  hay FK compuesta disponible sin reestructurar).
- Revocación = DELETE físico + evento en `access_audit_log` (la historia vive
  en la bitácora append-only, patrón invitaciones).
- **Semántica**: los grants solo tienen efecto para usuarios cuyo rol mapea a
  ViewerRole `client` (`consulta` hoy; heredable por el futuro rol `cliente`
  con un solo cambio en `role-map.ts`). Roles internos = acceso a todos los
  proyectos de su org (sin filas en esta tabla).
- **Deny-by-default**: `consulta` sin filas ⇒ 0 proyectos.

## 5. RPCs requeridas (SECURITY DEFINER, espejo de OPERATIONAL_ACCESS_LAYER_V1)

- `grant_project_access(p_target_user_id uuid, p_project_id uuid)`
  Guards: sesión (`app._auth_uid()`), membresía, actor `admin|gerencia`;
  target existe y es de la MISMA org; **target con rol `consulta`**
  (`grants_only_for_consulta` si no); proyecto existe y es de la misma org.
  Idempotente: si ya existe devuelve `already_granted` (sin duplicar audit).
- `revoke_project_access(p_target_user_id uuid, p_project_id uuid)`
  Mismos guards de gestión; si no existe la fila ⇒ `grant_not_found`.
- Escrituras a la tabla **exclusivamente** vía RPC (sin políticas de
  INSERT/UPDATE/DELETE directas). `REVOKE ... FROM PUBLIC, anon` +
  `GRANT EXECUTE TO authenticated`.
- Listados para la UI: por SELECT RLS-bound (read-repository de access), como
  miembros/invitaciones.

## 6. Auditoría

`access_audit_log.action` amplía su CHECK con `project_grant_created` y
`project_grant_revoked` (DROP CONSTRAINT + ADD CONSTRAINT, aditivo en efecto).
Metadata: `{projectId, grantId, backfill?}`; `target_user_id` = beneficiario.
El backfill escribe UNA fila de audit por grant con `backfill: true` y
`actor_user_id NULL` (sistema).

## 7. Anti-fuga de existencia

- Proyecto no asignado responde **exactamente igual** que proyecto
  inexistente: `ProjectNotFoundError` (read-model) → not-found/pantalla de
  error actual. La cadena derivada (versión→estimate→scope→project) ya
  converge en `projectById` y hereda el mismo error
  (`EstimateVersionNotFoundError` en su rama).
- **Prohibido** cualquier mensaje "no tienes permiso a este proyecto": eso
  confirma existencia. El banner `?denied=` es SOLO para módulos.
- En exports, el comportamiento para no-asignado es idéntico al de un id
  inexistente hoy (error genérico), sin mensaje nuevo.

## 8. Backfill propuesto (una sola vez, dentro de la migración)

`INSERT INTO project_access_grants (organization_id, profile_id, project_id)
SELECT p.organization_id, p.id, pr.id FROM profiles p JOIN projects pr ON
pr.organization_id = p.organization_id WHERE p.role = 'consulta'
ON CONFLICT DO NOTHING` + filas de audit `backfill: true`.

- Preserva a los `consulta` internos existentes (no pierden visibilidad).
- Los `consulta` creados DESPUÉS nacen con 0 grants (deny-by-default).
- Proyectos creados después del backfill NO se auto-asignan (correcto para
  clientes; se comunica en `/settings/access`).
- El backfill NO se repite en código de aplicación jamás (nunca fail-open).

## 9. Rutas / read-model / exports afectados (enforcement app-layer)

Un solo choke point + acarreo del contexto:

1. `ViewerContext.projectGrants?: readonly Uuid[]` (contrato read-model).
   Semántica: **solo** se interpreta para `role === 'client'`; `undefined` o
   `[]` ⇒ 0 proyectos (fail-closed). Roles no-client ⇒ sin restricción.
2. `resolveAuthenticatedViewer()` resuelve grants server-side (1 query por
   request, solo para `client`) y `toViewerContext` acarrea
   `profileId` + `projectGrants`. El `profileId` además hace que el claim
   `sub` viaje a `withTenantDb` ⇒ la RLS project-scoped (fase B) aplica
   también en las lecturas de la app (doble barrera coherente).
3. `DrizzleReadModelRepository`: helpers privados `visibleProjects(viewer)` /
   `visibleProjectById(viewer, id)` que aplican el filtro por grants; TODOS
   los usos de `repo.projects(...)` / `repo.projectById(...)` migran a estos
   helpers (listProjects, getProjectOverview, listEstimates,
   getEstimateDetail, listQuantities, listWorkspaceGroups,
   getDashboardSummary, getSchedule, listProgressEntries,
   listResourceAssignments). `FixtureReadModelRepository` espeja el filtro
   (paridad de contrato para tests).
4. Exports: `ExportRequest.projectGrants` (nuevo, opcional) se fija en
   `/api/exports` desde el viewer AUTENTICADO (no del perfil solicitado) y
   `export-service` lo copia al `ViewerContext`. Un interno exportando con
   perfil client NO queda restringido; un `consulta` sí.
5. Matriz V5.6.2 — **único cambio aprobado**: retirar `consulta` del módulo
   `apu` (decisión de negocio 2026-07-02). La biblioteca APU es org-wide (no
   scopeable por proyecto) y expone el recetario completo. `⌘K`, rail y
   dashboard heredan por `canAccessModule`.
6. Dashboard/projects: heredan el filtro vía `listProjects`; copy del estado
   vacío consciente de rol (consulta: "Aún no tienes proyectos asignados…",
   sin CTA de crear).

## 10. Fases

| Fase | Contenido | Estado/gate |
|---|---|---|
| **A** | Este contrato + OPEN_QUESTIONS + HANDOFF | rama, PR |
| **B** | Migraciones: tabla + RPCs + audit + RLS de la tabla + patch `projects_select` project-scoped para consulta/client + backfill + sección nueva del harness `scripts/rls-runtime/run.ts` | **NO se aplica a Supabase Cloud sin compuerta explícita del usuario** |
| **C** | Enforcement app-layer (§9) + tests anti fail-open | rama; **merge/deploy SOLO después de aplicar B en Cloud** (si se despliega antes, consulta queda fail-closed en 0 proyectos: seguro pero disruptivo) |
| **D** | UI `/settings/access`: columna "Proyectos" en filas consulta + diálogo asignar/revocar + empty states | junto a C |
| **E** | QA: typecheck/lint/suite/gm 22/22/build; harness RLS local si Docker disponible; validación manual por usuario (admin, presupuestos, consulta 0/1/N grants, URL directa no asignada); smoke prod | previo a cierre |
| **V5.6.5** (siguiente) | RLS: tablas no-cascada (planning, quantity_workspace/takeoff) + write-hardening para consulta + verificación PostgREST en Cloud | **obligatoria antes de cuentas de cliente reales** |

## 11. Qué NO hacer

- NO aplicar migraciones a Supabase Cloud sin compuerta explícita.
- NO service_role; NO db push directo; NO tocar Vercel envs / DATABASE_URL /
  SMTP / producción manual.
- NO mensajes "sin permiso" a nivel de entidad (fuga de existencia).
- NO auto-grants en código de aplicación (solo backfill de migración).
- NO crear rol `cliente`/`contratista` todavía; NO mezclar contratistas,
  financiero, Omni, avance de obra ni V5.7B.
- NO tocar snapshots, motor financiero, `role-map.ts` (más allá de nada) ni
  la matriz V5.6.2 salvo la línea `apu` aprobada.
- NO confiar en sidebar/⌘K como control (superficie ≠ seguridad).
- NO entregar cuentas `consulta` a clientes externos reales hasta cerrar la
  RLS project-scoped aplicada + V5.6.5.

## 12. Criterios de aceptación

1. `consulta` con 0 grants: dashboard y `/projects` con empty state amable;
   0 proyectos en cualquier listado; ⌘K sin proyectos; exports imposibles.
2. `consulta` con 1 grant: ve SOLO ese proyecto (dashboard, projects,
   estimates, quantities, planning, exports).
3. `consulta` con N grants: ve exactamente esos N.
4. URL directa (proyecto/estimate/versión/cronograma no asignado): not-found
   idéntico al de un id inexistente. Sin mensaje de permisos.
5. `consulta` NO ve el módulo APU (ruta redirige, superficie oculta).
6. Roles internos (admin/gerencia/presupuestos/compras/obra): **cero
   cambios** de comportamiento (suite + gm:regression 22/22 lo prueban).
7. Grants gestionables solo por admin/gerencia desde `/settings/access`,
   solo hacia usuarios `consulta`, con audit por evento.
8. Tests anti fail-open: recorren el contrato del read-model con viewer
   client y verifican el filtro en TODOS los métodos que derivan proyecto.
9. Harness RLS: sección nueva con checks de grants (consulta ve granted, no
   ve non-granted, cascada a scopes/estimates/boq, internos sin cambio,
   escrituras directas a la tabla denegadas).
10. `pnpm typecheck` 0, `lint` 0, suite completa verde, `gm:regression`
    22/22, build 0.

## 13. Plan de implementación de la siguiente fase (para el implementador)

Orden exacto: B (migraciones en rama, sin aplicar) → C (contrato + viewer +
read-model + exports + matriz apu + tests) → D (UI) → E (QA + PR + secuencia
de merge). Secuencia de release: merge PR modelo (sin efecto runtime) →
**compuerta: aplicar migraciones a Cloud + verificar harness/queries** →
merge PR enforcement/UI → smoke prod → validación manual E. Riesgos y
mitigaciones en §10; detalles de RPC en §5; semántica de grants en §4/§9.
