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

## Cómo proceder a V5.4.2b
Tras aprobar/mergear esta migración y aplicarla de forma controlada (db push manual + harness RLS runtime), implementar
repository + server actions + guard de privacidad de app, en rama separada.
