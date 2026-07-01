# V5_4_2A_QUICK_NOTES_MIGRATION_RLS — Migración + RLS + tests (sin push remoto)

## Objetivo
Base segura para notas rápidas internas reales: tabla `quick_notes` + RLS (org-scoped, rol-gated, archive-only) +
tests estáticos de RLS/privacidad. **Solo DB versionada. NO se aplicó a Supabase remoto** (`db push` controlado/diferido).

## Tabla creada (`supabase/migrations/20260627090000_quick_notes.sql`)
`id` (uuid pk), `organization_id` (NOT NULL → organizations, CASCADE), `project_id` (→ projects, CASCADE, nullable),
`estimate_id` (→ estimates, CASCADE, nullable), `body` (text NOT NULL), `status` (default 'active'),
`created_by` (NOT NULL → profiles, RESTRICT), `created_at`/`updated_at`, `archived_at` (null), `archived_by` (→ profiles, SET NULL).
- Constraints: `status IN ('active','archived')`; `char_length(btrim(body)) BETWEEN 1 AND 1000`;
  `(status='archived') = (archived_at IS NOT NULL)` (consistencia de estado).
- Índice parcial `quick_notes_org_active_idx (organization_id, created_at DESC) WHERE status='active'`.
- Trigger `quick_notes_set_updated_at` → `app.set_updated_at()` (mismo del schema).

## FKs confirmadas (contra el schema real — no inventadas)
`organizations(id)` ✅, `projects(id)` ✅ (tiene `organization_id`), `estimates(id)` ✅ (org **indirecta** vía
`project_scopes→projects`), `profiles(id)` ✅ (= `app._auth_uid()`, auth uid). Helpers `app.current_org()`,
`app.current_role()`, `app._auth_uid()`, `app.set_updated_at()` ya existen.

## Policies (RLS ENABLE + FORCE; mirror de price_monitor_targets)
- **SELECT** `quick_notes_select_own_org`: `organization_id = app.current_org()`. Internos de la org (incl. `consulta`).
  `client` no es rol DB ⇒ no lee.
- **INSERT** `quick_notes_insert_authorized`: `org propia` + `created_by = (SELECT app._auth_uid())` +
  `app.current_role() IN ('admin','gerencia','presupuestos','obra','compras')` + (si `project_id` no-null, pertenece a la org).
  **`consulta` NO crea.**
- **UPDATE/archive** `quick_notes_update_authorized`: USING `org propia AND (creador OR role IN ('admin','gerencia'))`;
  WITH CHECK `org propia`. Sin edición libre por contrato; el repo/action de V5.4.2b limita a archive.
- **DELETE**: sin policy ⇒ **denegado** (FORCE RLS). Borrado lógico = archive.

## Roles permitidos por policy (reales)
- Ver: admin/gerencia/presupuestos/obra/compras/consulta (org-scoped). Cliente: NO.
- Crear: admin/gerencia/presupuestos/obra/compras. (consulta NO.)
- Archivar: creador o admin/gerencia.

## Privacidad
RLS org+rol como defensa principal; ninguna policy usa `true`, ni `TO anon`, ni SELECT público, ni el rol `client`.
La capa de app/read-model (V5.4.2b/c) añadirá guard para `ViewerRole === 'client'`.

## Tests (`apps/web/tests/regression/rls-quick-notes-static.test.ts`, 12/0)
Schema/FKs, constraints (status/body/archivado), índice parcial, trigger, ENABLE+FORCE, SELECT org-scoped, INSERT
(org+autoría+roles, sin consulta, project pertenece a org), UPDATE (creador/management + WITH CHECK), **DELETE denegado**,
privacidad (sin `client`/`true`/`anon`, toda policy ata a org), aditividad (sin DROP/DELETE/TRUNCATE, no toca price_monitor_targets, sin SECURITY DEFINER).

## Qué NO se implementó (fases siguientes)
- **V5.4.2b**: repository (`listQuickNotes`/`createQuickNote`/`archiveQuickNote`) + server actions
  (`createQuickNoteAction`/`archiveQuickNoteAction`) + fixture + guard de app para `client` + tests.
- **V5.4.2c**: UI real de `NotesCard` (lista activas, crear/archivar, viewer-gated).
- `estimate_id` cross-org check (join indirecto vía project_scopes) → cuando la UI use estimate_id.

## Validación
- typecheck 0 · lint 0 · tests rls-quick-notes-static 12/0 · suite verde · build 0 · gm 22/22 · diff-check limpio.
- ⚠️ **NO se ejecutó `supabase db push`** ni se tocó Supabase Cloud / credenciales remotas. La verificación runtime real
  (cross-org/rol/DELETE en DB) se hará con el harness RLS del proyecto **antes del release** (post-aprobación).

## Hardening pre-merge (cierre de los 2 riesgos del runtime)
Tras la validación runtime (que confirmó dos riesgos), se endureció la migración **antes del merge**:

### 1. Archive-only a nivel DB (trigger BEFORE UPDATE)
`app.quick_notes_enforce_archive_only()` (SECURITY INVOKER) + trigger `quick_notes_archive_only` (corre **antes** que
`set_updated_at` por orden alfabético). Rechaza:
- tocar una nota ya `archived` (`quick_notes_immutable_when_archived`);
- cualquier UPDATE cuyo `NEW.status` no sea `archived` (`quick_notes_update_archive_only`) → no hay "edición libre";
- cambiar `id/organization_id/project_id/estimate_id/body/created_by/created_at` (`quick_notes_only_archive_fields_mutable`);
- archivar sin `archived_at`/`archived_by` (`quick_notes_archive_requires_archived_at_by`).
Resultado: la **única** mutación posible es `active → archived` fijando los campos de archivado. **`body` ya NO es editable
a nivel DB** (cerrado el riesgo 1). El repo/action de V5.4.2b queda como segunda defensa, ya no como única.

### 2. estimate_id cross-org (Opción A — validación DB)
Helper STABLE `app.estimate_in_org(p_estimate_id)` (espejo de `app.estimate_version_in_org`): join
`estimates→project_scopes→projects` con `p.organization_id = app.current_org()`. La policy INSERT ahora exige:
- `estimate_id IS NULL OR app.estimate_in_org(estimate_id)` (estimate de otra org / inexistente ⇒ denegado);
- consistencia: si vienen `project_id` y `estimate_id`, el estimate debe colgar de ese `project_id`.
Cerrado el riesgo 2: **no queda cross-org latente** (verificado runtime: estimate misma org permitido; estimate fuera de la org denegado).

### Validación runtime del hardening (local Supabase :54322, db reset)
**35/0 PASS**: regresión (SELECT roles/cross-org/anon, INSERT roles/consulta/body/created_by/org, DELETE denegado) +
archive-only (editar body denegado creador/gerencia; mutar created_by/organization_id/created_at denegado; UPDATE sin
archivar denegado; archive sin archived_at/by denegado; desarchivar denegado; modificar nota archivada denegado) +
estimate (misma org permitido; fuera de la org denegado). **NO db push remoto / NO Supabase Cloud.**
Tests estáticos `rls-quick-notes-static.test.ts`: **15/0** (incluye guardas del trigger + estimate gate + sin SECURITY DEFINER).

## Cloud runtime RLS patch — project/estimate consistency
_(2026-06-30 · patch aditivo `20260627093000_quick_notes_project_estimate_policy_patch.sql`)_

### Qué falló
El harness RLS **vivo contra Supabase Cloud** (`construction-ops-prod`, ref `jabddbccmhrxztfzpdii`; transacciones con ROLLBACK,
sin persistir datos) pasó **30/31**. Único FAIL: **una nota con `project_id` y un `estimate_id` de la MISMA organización pero de
proyectos distintos fue ACEPTada** al INSERT, cuando debía rechazarse. La validación runtime local previa (35/0) no cubría este
caso (ambos IDs presentes + inconsistentes), por eso pasó desapercibido.

### Causa raíz — column shadowing
La sub-cláusula de consistencia de `quick_notes_insert_authorized` estaba escrita con `project_id` **sin calificar**:
```sql
... WHERE e.id = estimate_id AND ps.project_id = project_id   -- project_id se resuelve a ps.project_id (interno)
```
Como `project_scopes` tiene su **propia** columna `project_id`, dentro del `EXISTS` el nombre desnudo se ligaba a `ps.project_id`
(tabla interna), no a `quick_notes.project_id` (la NEW-row). El predicado degeneraba en `ps.project_id = ps.project_id`
(tautología) ⇒ el guard era un **no-op**. Reproducido en Cloud: forma sin calificar ⇒ `TRUE` (incorrecto); forma calificada
`ps.project_id = quick_notes.project_id` ⇒ `FALSE` (correcto).

### Por qué NO era fuga cross-org
El aislamiento multi-tenant **nunca** dependió de esta cláusula. `organization_id = app.current_org()`, `created_by`, el rol
y `app.estimate_in_org()` siguen firmes (en el harness: cross-org SELECT/INSERT, estimate cross-org y project cross-org **todos
denegados**). El defecto era de **integridad INTRA-org**: dentro de una misma organización se podía ligar un `project_id` y un
`estimate_id` que pertenecen a proyectos distintos. No expone datos de otra organización.

### Por qué sí se corrige antes de V5.4.2b
`estimate_id`/`project_id` son columnas *forward-compat*: la UI aún no las cablea en V5.4.2a. **V5.4.2b es justo la fase que
empieza a usarlas** (repository/server actions). Corregir ahora evita que la inconsistencia entre a producción cuando la UI
comience a enviar ambos IDs.

### Cómo se corrigió
Migración **aditiva** (no edita `20260627090000_quick_notes.sql`, ya aplicada/mergeada): `DROP POLICY IF EXISTS` + `CREATE POLICY`
recreando **solo** la policy INSERT, calificando **todas** las referencias a la NEW-row dentro de subconsultas con
`quick_notes.<col>` (elimina la clase entera de shadowing, no solo la línea afectada). Contrato de negocio **sin cambios**:
mismos roles/autoría/org; `consulta` sigue sin crear; `project_id`/`estimate_id` cross-org siguen denegados; **`project_id` NULL +
`estimate_id` NOT NULL de la org sigue PERMITIDO** (nota ligada solo a estimate; el estimate ya implica su proyecto) — decisión
preservada y documentada, no bloqueada.

### Qué tests lo validan
- **Estático** `apps/web/tests/regression/rls-quick-notes-policy-patch-static.test.ts` (11/0): recrea solo INSERT (DROP+CREATE);
  usa `ps.project_id = quick_notes.project_id`; **NO** queda `ps.project_id = project_id` ni `= project_id` desnudo; gates de
  project/estimate calificados; sin policy abierta (`true`/`TO anon`); sin DELETE; aditivo (único `DROP` = la policy que recrea).
- **Estático base** `rls-quick-notes-static.test.ts` ajustado: documenta el shadowing de la migración base y verifica la presencia
  estructural del `EXISTS` de consistencia (sin aseverar la equidad defectuosa).
- **Runtime** `supabase/tests/quick_notes_rls_runtime.mjs` (out-of-band, contra base MIGRADA vía `DATABASE_URL`, ROLLBACK):
  consistente PASS · inconsistente FAIL(42501) · estimate cross-org FAIL · project cross-org FAIL · estimate NULL PASS ·
  project NULL + estimate in-org PASS · + regresión (consulta/anon/cross-org/archive-only/DELETE).

### Estado / aplicación
- Regresión local: typecheck 0 · lint 0 · suite 2203/0 (42 skip) · build 0 · gm 22/22 · estáticos quick_notes 26/0.
- La corrección del predicado fue verificada en Cloud durante el diagnóstico (calificado ⇒ deniega el caso inconsistente).

### Cierre V5.4.2a — 31/31 en Cloud ✅ (2026-06-30 / 07-01)
- **Patch aplicado a Cloud** (`construction-ops-prod`, `db push --linked`, EXIT 0; única migración pendiente = `20260627093000`).
- **Policy activa validada** (deparse real de `pg_policies`): la consistencia usa `ps.project_id = quick_notes.project_id`
  (calificado); sin patrón ambiguo. Shadowing corregido y vivo en Cloud.
- **Harness RLS vivo Cloud: 31/31 PASS** (tx con ROLLBACK, 0 filas residuales). El bloque **project/estimate inconsistente**
  ahora **DENEGADO** (`ok=false code=42501`); estimate same-org permitido; estimate/project cross-org denegado; archive-only, DELETE
  denegado, anon/cross-org sin acceso — todo verde. Smoke prod sano (login/dashboard/catalog/apu 200; export 400; sin errores DB).
- **V5.4.2a CERRADO al 100%.** `.cloud-db-url` eliminado (no tracked/staged); sin secrets expuestos; sin tag/deploy.

## Cómo proceder a V5.4.2b
Implementado en `feature/v5-4-2b-quick-notes-repository-actions`: repository (`listQuickNotes`/`createQuickNote`/`archiveQuickNote`)
+ server actions (`createQuickNoteAction`/`archiveQuickNoteAction`) + guard de privacidad de app + tests. La UI real de `NotesCard`
queda para **V5.4.2c**. Ver `docs/design-references/V5_4_2B_QUICK_NOTES_REPOSITORY_ACTIONS.md`.
