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

## Cómo proceder a V5.4.2b
Tras aprobar/mergear esta migración y aplicarla de forma controlada (db push manual + harness RLS runtime), implementar
repository + server actions + guard de privacidad de app, en rama separada.
