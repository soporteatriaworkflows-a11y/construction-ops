# V5_4_2_REAL_QUICK_NOTES_PLANNING — Notas rápidas reales (backend + RLS)

> Solo diagnóstico, contrato técnico y plan. **Sin código, sin migración, sin Supabase/RLS, sin merge/tag/deploy.**
> Base: `origin/main = be289c3` (V5.4.1 `961b571`). Proyecto `construction-ops` (NO `-1rqh`).

## 1. Estado actual de notas
`components/shared/notes-card.tsx` es **UI SHELL estático**: `EXAMPLE_NOTES` hardcoded + botón "+" marcado
"próximamente" (afordancia honesta). Solo recibe `className`. Sin backend, sin persistencia, sin datos reales.

## 2. Qué existe hoy
- `NotesCard` presentacional en el dashboard (3 ejemplos fijos).
- Infra de auth/RLS madura reutilizable: `app.current_org()`, `app.current_role()`, `app._auth_uid()` (helpers SQL);
  patrón de policies probado en `20260612090100_rls_price_monitoring.sql` (SELECT org-scoped, INSERT con `created_by = app._auth_uid()`, UPDATE autorizado).
- Patrón de repository + server actions (`'use server'`) ya usado por monitor/review.

## 3. Qué NO existe
Tabla `quick_notes`, sus policies, repository, server actions, fixtures, ni UI conectada. Es backend nuevo real.

## 4. Riesgo de privacidad (alto — tratar como backend serio)
Las notas pueden contener negociación, proveedores, criterio financiero, decisiones internas. **No deben llegar a
clientes.** Doble defensa: (a) RLS org-scoped + rol; (b) gate en app/read-model para `ViewerRole === 'client'`.

## 5. Roles REALES encontrados (no inventados)
- **`profiles.role` (DB)** — CHECK IN `('admin','gerencia','presupuestos','obra','compras','consulta')`
  (`20260530090100_core_organizations_profiles.sql:31`). **No existe `client` como rol de DB.**
- **`ViewerRole` (presentación, `lib/contracts/read-model.ts:57`)** = `'client' | 'management' | 'site' | 'internal'`
  (mapeo server-side desde el perfil; `client` se excluye de campos 🔒). `AuthenticatedViewer.role` es `ViewerRole`.
- RLS debe keyear sobre `app.current_role()` (= ProfileRole). Como no hay perfiles `client`, el acceso de cliente se
  evita por org-scope + rol; aun así, el app-layer NO debe servir notas a un viewer mapeado a `client`.

## 6. ¿Debe hacerse V5.4.2? — Sí, con scope mínimo
Sí: convierte un shell estático en valor operativo real. Pero **es la primera fase del ciclo V5 que toca DB/RLS** →
scope mínimo, fases separadas y verificación de privacidad antes de cualquier `db push`.

## 7. Decisiones de producto (auditadas)
| # | Pregunta | Recomendación |
|---|---|---|
| 1 | scope (org/proyecto/presupuesto/mixto) | **Org-scoped** para MVP; `project_id`/`estimate_id` presentes pero **nullable** (forward-compat, sin usar en UI aún). |
| 2 | scope mínimo V5.4.2 | Notas **por organización**, listadas en el dashboard global. |
| 3 | ¿dashboard global o por proyecto? | **Global** (donde vive `NotesCard`). Por-proyecto = fase posterior. |
| 4 | ver notas | Miembros internos de la org (incluye `consulta`). `client` NO. |
| 5 | crear notas | Roles operativos: `admin`, `gerencia`, `presupuestos`, `compras`, `obra`. **`consulta` NO** (solo lectura). |
| 6 | archivar notas | **Creador** (`created_by = app._auth_uid()`) **o** management (`admin`/`gerencia`). |
| 7 | ¿clientes ven notas? | **NO** (hipótesis confirmada). |
| 8 | ¿editar o solo crear/archivar? | **Solo crear/archivar** para MVP (sin update de `body`). |
| 9 | ¿delete físico? | **NO** — solo archive (sin policy DELETE ⇒ denegado con RLS FORCE). |
| 10 | límite en dashboard | **5** notas activas más recientes. |

## 8. Contrato de tabla recomendado (`quick_notes`)
```sql
create table quick_notes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id      uuid null references projects(id) on delete cascade,
  estimate_id     uuid null references estimates(id) on delete cascade,
  body            text not null,
  status          text not null default 'active',
  created_by      uuid not null references profiles(id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz null,
  archived_by     uuid null references profiles(id) on delete set null,
  constraint quick_notes_status_chk check (status in ('active','archived')),
  constraint quick_notes_body_chk   check (char_length(btrim(body)) between 1 and 1000)
);
create index quick_notes_org_active_idx on quick_notes (organization_id, created_at desc) where status = 'active';
```
(Confirmar nombres reales de FKs `organizations(id)`/`projects(id)`/`estimates(id)` contra el schema en la fase de migración.)

## 9. RLS recomendado (mirror de price_monitor_targets; `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `FORCE`)
- **SELECT** `quick_notes_select_own_org`: `organization_id = app.current_org()`. (Internos de la org; clientes no tienen perfil/rol DB.)
- **INSERT** `quick_notes_insert_authorized`: `organization_id = app.current_org() AND created_by = (SELECT app._auth_uid())
  AND app.current_role() IN ('admin','gerencia','presupuestos','compras','obra')` (+ si `project_id`/`estimate_id` no-null, que pertenezcan a la org).
- **UPDATE/archive** `quick_notes_update_authorized`: USING `organization_id = app.current_org() AND (created_by = (SELECT app._auth_uid())
  OR app.current_role() IN ('admin','gerencia'))`; WITH CHECK `organization_id = app.current_org()`.
- **DELETE**: sin policy → **denegado** (FORCE RLS). Archivar (status='archived' + archived_at/by) vía UPDATE.

## 10. Server actions recomendadas (`'use server'`)
- `createQuickNoteAction(input: { body; projectId?; estimateId? })` — valida body (1..1000, trim), gating de rol server-side, revalida dashboard.
- `archiveQuickNoteAction(noteId)` — set status='archived' + archived_at/by; gating creador/management.
- (Sin `updateQuickNote` en MVP.) Toda escritura pasa por RLS (defensa real) + gating de app (UX).

## 11. Repository recomendado
- `listQuickNotes(viewer, { projectId?, estimateId?, limit = 5 })` → solo `active`, org-scoped, order `created_at desc`.
- `createQuickNote(viewer, input)` → inserta `created_by = viewer.profileId`.
- `archiveQuickNote(viewer, noteId)`.
- Fixture repo determinista (demo) sin persistencia real.
- **App-layer guard de privacidad**: si `viewer.role === 'client'`, `listQuickNotes` devuelve `[]` y las acciones se rechazan (además de RLS).

## 12. UI recomendada para `NotesCard`
- Server Component que recibe `notes: QuickNoteView[]` + `canCreate: boolean` (derivado del rol server-side).
- Lista las notas activas reales (máx 5) con su fecha; vacío → empty state honesto ("Sin notas").
- Afordancia de **crear** (form server-action) solo si `canCreate`; botón **archivar** por nota solo si creador/management.
- **NO** renderizar para viewer `client`. Mantener estilo V4.2 (SurfaceCard) y dark/light. Si se usa interactividad,
  el form/botón van en componente client AISLADO; helpers puros en módulo neutro (regla P0). Server Component no importa de `'use client'`.

## 13. Tests obligatorios
- **RLS estáticos** (estilo de los tests RLS existentes): SELECT solo misma org; INSERT exige rol autorizado + `created_by` propio;
  UPDATE solo creador/management; **DELETE denegado**; cross-org denegado. (Checks de DB se difieren a `db push`, como otras migraciones.)
- **Privacidad**: viewer `client` → repo devuelve `[]` y acciones rechazadas; `consulta` puede ver, NO crear.
- **Repository/actions**: create valida body (vacío/1001 chars → error); archive cambia status; list solo activas + límite.
- **UI/guard**: NotesCard no se renderiza para `client`; sin `02h…`-style hardcode; Server Component no importa de `'use client'`.
- **Fixture** determinista.

## 14. Plan de implementación por fases (recomendado: NO una sola PR gigante)
- **V5.4.2a — Migración + RLS + tests de RLS/privacidad** (solo DB). Ejecutar con **`agent-db-rls`** en worktree aislado.
  Checks de DB diferidos a `db push` (patrón del repo). Verificación de privacidad ANTES de avanzar.
- **V5.4.2b — Repository + server actions + fixture + tests** (consume la tabla ya creada).
- **V5.4.2c — UI `NotesCard` real** (lista + crear/archivar, viewer-gated, client excluido).
- Combinar b+c es aceptable si quedan pequeños; **a SIEMPRE separado** (DB/RLS debe aterrizar y verificarse primero).

## 15. Riesgos
- **Privacidad** (el mayor): fuga de notas internas a clientes → mitigado por RLS org/rol + guard de app + tests.
- **Migración/RLS**: primera DB del ciclo; requiere `agent-db-rls`, doble verificación y `db push` controlado (no automático).
- **Nombres de FK/columnas**: confirmar contra el schema real en la fase de migración (no asumir).
- **Server/client (P0)**: el form de crear es interactivo → componente client aislado, nunca helpers client en el Server Component.

## 16. Prompt sugerido para implementación (V5.4.2a primero)
```text
ICONIC_OPS_V5_4_2A_QUICK_NOTES_MIGRATION_RLS

Objetivo: crear tabla quick_notes + RLS (org-scoped, rol-gated, archive-only) + tests RLS/privacidad. Solo DB.
Base: main = be289c3. Repo construction-ops. NO -1rqh. Rama: feature/v5-4-2a-quick-notes-migration-rls.
Ejecutar con agent-db-rls (worktree aislado). NO db push automático; checks de DB diferidos.

Alcance:
- Migración quick_notes (ver contrato del doc): columnas, constraints (status, body 1..1000), índice org+active, FKs reales (confirmar nombres).
- RLS ENABLE + FORCE; policies: select_own_org; insert_authorized (org + created_by=app._auth_uid() + role IN
  admin/gerencia/presupuestos/compras/obra); update_authorized (creador o admin/gerencia); SIN delete (denegado).
- Tests estáticos de RLS/privacidad (mirror de los existentes): misma-org, rol, ownership, cross-org denegado, delete denegado.

NO: repository/actions/UI (van en b/c), Supabase remoto sin autorización de push, RLS de otras tablas, Auth/envs,
cron/price-monitor/Price Intelligence, BOQ/APU/exports/snapshots/unit_price_snapshot, -1rqh.

QA: typecheck/lint/tests/build/gm. Doc + HANDOFF. PR sin merge; validación de RLS antes de avanzar a b.
```

## 17. Confirmación
NO se implementó código, NO migración, NO Supabase/RLS, NO merge/tag/producción. Solo diagnóstico + contrato + plan
en rama docs `feature/v5-4-2-real-quick-notes-planning`. Roles citados = reales del schema (no inventados).
