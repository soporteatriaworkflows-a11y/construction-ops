# ESTIMATES_CRUD_CONTRACT — Presupuesto inicial real por alcance (Oleada 4B.3)

Estado: **CONGELADO v1** (2026-06-04). Propiedad: `agent-orchestrator`.
Implementan: `agent-db-rls` (migración/repo) y `agent-frontend-boq` (UI/action).

Mantiene la disciplina de 4B.1/4B.2: deny-by-default, RLS, aislamiento por
organización, IDs/owner derivados o validados server-side, sin fallback
silencioso db→fixture, errores sanitizados.

## §1 — Alcance funcional

Permitido: **listar** presupuestos por alcance, **crear** un presupuesto real con
su **versión inicial V01** (atómico), **ver detalle básico** (versión activa, 0
capítulos, 0 ítems), e **integrar `/estimates`** como listado de presupuestos
visibles. NO: subir/leer Excel, mapear, importar capítulos/BOQ, editar ítems,
duplicar, borrar, aprobación avanzada, exports, APU editable.

## §2 — Esquema (reutilizado + migración aditiva)

`estimates` (mig. `20260530090700`) + authorship `20260604130000`:

| Columna          | Tipo          | Notas |
|------------------|---------------|-------|
| id               | uuid PK       | |
| project_scope_id | uuid NOT NULL | FK→project_scopes, CASCADE |
| code             | text NOT NULL | único por scope |
| name             | text NOT NULL | |
| status           | text NOT NULL | CHECK draft/active/archived; creado `active` |
| **description**  | text NULL     | **NUEVA** (≤2000 validado en app) |
| **created_by**   | uuid NULL     | **NUEVA** FK→profiles, ON DELETE SET NULL |
| created_at/updated_at | timestamptz | |

`estimate_versions` (sin cambios): `version_number` (≥1, único por estimate),
`status` (draft/review/approved/issued/archived), `created_by` (ya existía),
`approved_at`, `notes`. **V01** = `version_number=1, status='draft'`.
**Versión activa = mayor `version_number`** (no hay `active_version_id`).

## §3 — RLS (sin cambios; suficiente)

`estimates_all` (FOR ALL, org vía scope→project) y `estimate_versions_*`
(select/insert/update/delete con org + inmutabilidad de versiones emitidas) ya
cubren el aislamiento. **No se añade ni modifica RLS en 4B.3.**

## §4 — Creación ATÓMICA y segura

RPC `public.create_estimate_with_initial_version(p_scope_id, p_code, p_name,
p_description)` — **`SECURITY INVOKER`** (RLS aplica), **sin `p_created_by`**: el
autor se deriva internamente de `app._auth_uid()` (= `auth.uid()` ⇒ `profiles.id`).
Inserta estimate (`status='active'`, `created_by` derivado) + V01 (`draft`,
mismo autor) en una transacción; si cualquiera falla, todo revierte.
Deny-by-default explícito (sin sesión/membresía ⇒ excepción). Hardening:
`SET search_path = public`, referencias calificadas, `REVOKE ALL FROM PUBLIC` +
`REVOKE ALL FROM anon`, `GRANT EXECUTE TO authenticated` (NO `anon`). `code`
autogenerado (slug + anti-colisión 23505, reintento app).

## §5 — Inputs y validación

Desde el navegador SOLO: `name` (1..160), `description` (opcional, ≤2000).
Derivados/validados server-side: `id`, `code`, `status` (`active`), `created_by`
(RPC), `project_scope_id` (del path, **validado** por visibilidad RLS), V01,
timestamps, `projectId` (derivado del estimate creado para el redirect).

## §6 — Capa de datos (`apps/web/server/estimates/`)

`EstimatesWriteRepository` (selector por `READ_MODEL_SOURCE`, sin fallback):
- `insertEstimateWithInitialVersion(viewer, scopeId, input)` → valida scope visible
  → RPC atómica → detalle. `db` RLS-bound (sin service-role); `fixture` solo lectura.
- `listEstimatesByScope(viewer, scopeId)` / `listVisibleEstimates(viewer)` (RLS).
- `getEstimateById(viewer, estimateId)` (cross-org ⇒ `EstimateNotFoundError`).
- `getEstimateActiveVersion(viewer, estimateId)` → mayor `version_number` + conteos
  de capítulos/ítems (0/0 en V01).

## §7 — UI y rutas (request-time)

- `/projects/[id]/scopes/[scopeId]` → sección **Presupuestos**: lista + CTA
  "+ Nuevo presupuesto" (`Button asChild`+`Link`, habilitado solo supabase+db) +
  empty state "Este alcance todavía no tiene presupuestos registrados.".
- `/projects/[id]/scopes/[scopeId]/estimates/new` → formulario (nombre, descripción).
- `/projects/[id]/scopes/[scopeId]/estimates/[estimateId]` → detalle: estado,
  proyecto/alcance, **versión activa V01**, 0 capítulos, 0 ítems, y placeholder
  honesto "La importación del Excel estará disponible en la siguiente fase.".
- `/estimates` → listado real de presupuestos visibles (empty state honesto en
  `db`; demo explícito en `fixture`). Todas dinámicas (layout `force-dynamic` +
  `resolveViewer`). La server action conserva su guard de modo + viewer real.

## §8 — Seguridad / errores

Deny-by-default; cross-org ⇒ `notFound()`/`[]`. Errores de dominio
(`EstimateValidationError`, `EstimateNotFoundError`, `EstimateWriteNotSupportedError`,
`EstimateCodeGenerationError`, `ScopeNotFoundError`) sin SQL/stack. Fixture solo en
`READ_MODEL_SOURCE=fixture`. Verificado en RLS runtime: autor derivado, atomicidad
(code dup revierte), cross-org bloqueado, anon sin EXECUTE.

## §9 — Fuera de alcance / siguiente

4C = importación real de Excel (capítulos/BOQ). NO iniciar en 4B.3.
