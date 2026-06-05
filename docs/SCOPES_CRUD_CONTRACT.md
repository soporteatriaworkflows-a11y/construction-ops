# SCOPES_CRUD_CONTRACT — Vertical slice real de alcances (Oleada 4B.2)

Estado: **CONGELADO v1** (2026-06-04). Propiedad del contrato: `agent-orchestrator`.
Implementan: `agent-db-rls` (repo/RLS) y `agent-frontend-boq` (UI/action).

Mantiene la disciplina de 4B.1 (`docs/PROJECTS_CRUD_CONTRACT.md`): deny-by-default,
RLS, aislamiento por organización, todo ID/owner derivado o validado server-side,
sin fallback silencioso db→fixture, errores sanitizados.

## §1 — Alcance funcional

Permitido en 4B.2: **listar**, **crear** y **ver detalle básico** de alcances
(`project_scopes`) de un proyecto. NO: capítulos, BOQ, APU, presupuesto, edición,
borrado, duplicación, importador, Excel, planificación editable, exports.

## §2 — Esquema (reutilizado + migración aditiva)

Tabla `project_scopes` (migración `20260530090200_core_projects_scopes`) +
authorship `20260604120000_project_scopes_authorship` (aditiva, reversible):

| Columna           | Tipo         | Notas |
|-------------------|--------------|-------|
| id                | uuid PK      | `gen_random_uuid()` |
| project_id        | uuid NOT NULL| FK→projects, ON DELETE CASCADE |
| parent_scope_id   | uuid NULL    | FK self (no usado en 4B.2) |
| code              | text NOT NULL| único por proyecto (`project_scopes_project_code_uq`) |
| name              | text NOT NULL| |
| scope_type        | text NOT NULL| CHECK: floor/tower/stage/package/unit/modification/other |
| status            | text NOT NULL| default `active`; CHECK active/archived |
| **description**   | text NULL    | **NUEVA** (≤2000 validado en app) |
| **created_by**    | uuid NULL    | **NUEVA** FK→profiles, ON DELETE SET NULL |
| created_at        | timestamptz  | default `now()` |
| updated_at        | timestamptz  | default `now()`; trigger `set_updated_at` |

No hay `organization_id` en scopes: el aislamiento es **transitivo** vía
`projects.organization_id`.

## §3 — RLS (sin cambios; suficiente)

Migración `20260530091000` ya define, para `project_scopes`: `ENABLE`+`FORCE` y
policy `project_scopes_all` (FOR ALL) con `USING`/`WITH CHECK`:
`EXISTS (SELECT 1 FROM projects p WHERE p.id = project_scopes.project_id AND
p.organization_id = app.current_org())`. Cubre SELECT/INSERT/UPDATE/DELETE con
aislamiento cross-org. **No se añade ni modifica RLS en 4B.2.**

## §4 — Generación de `code`

`code` autogenerado server-side: slug del `name` (NFD→ASCII, `[a-z0-9-]`, ≤40,
sin guiones colgantes; fallback `alcance`) + anti-colisión `-2`,`-3`,… capturando
UNIQUE `23505` sobre `(project_id, code)`. Nunca se acepta `code` del navegador.

## §5 — Inputs permitidos y validación

Desde el navegador SOLO: `name` (obligatorio, 1..160), `scopeType` (obligatorio,
uno de los 7 valores; el formulario lo expone como **select**, inicial `floor`),
`description` (opcional, ≤2000). Validación pura en `validateCreateScopeInput`.

Derivados/validados server-side (jamás del navegador): `id`, `code`, `status`
(`active`), `created_by` (= `viewer.profileId`), `project_id` (del path; **validado**
contra la visibilidad RLS del viewer), timestamps.

## §6 — Capa de datos (`apps/web/server/scopes/`)

`ScopesWriteRepository` (selector por `READ_MODEL_SOURCE`, sin fallback silencioso):
- `insertScope(viewer, projectId, input)` → valida proyecto visible (RLS) → INSERT
  con `created_by`/`code`/`status` server-side. `db` = Supabase RLS-bound (sin
  service-role); `fixture` = solo lectura (`ScopeWriteNotSupportedError`).
- `listScopesByProject(viewer, projectId)` → scopes del proyecto (RLS ⇒ cross-org `[]`).
- `getScopeById(viewer, scopeId)` → detalle (RLS ⇒ cross-org/inexistente `ScopeNotFoundError`).

## §7 — UI y rutas (request-time)

- `/projects/[id]` → sección **Alcances**: lista + CTA "+ Nuevo alcance"
  (`Button asChild`+`Link`, habilitado solo en supabase+db) + empty state
  "Este proyecto todavía no tiene alcances registrados.".
- `/projects/[id]/scopes/new` → formulario (nombre, tipo select, descripción).
- `/projects/[id]/scopes/[scopeId]` → detalle básico + placeholder honesto
  "El presupuesto de este alcance estará disponible en la siguiente fase.".
- Todas dinámicas (layout `(dashboard)` `force-dynamic` + `resolveViewer()`).
  Server action `createScopeAction` conserva guard de modo + viewer real.

## §8 — Seguridad / errores

Deny-by-default; sin sesión/membresía ⇒ bloqueado; cross-org ⇒ `notFound()`/`[]`.
Errores de dominio (`ScopeValidationError`, `ScopeNotFoundError`,
`ScopeWriteNotSupportedError`, `ScopeCodeGenerationError`, `ProjectNotFoundError`)
sin SQL/stack. Fixture explícito solo en `READ_MODEL_SOURCE=fixture`.

## §9 — Fuera de alcance / siguiente

4B.3 = versión inicial de presupuesto por alcance. NO iniciar en 4B.2.
