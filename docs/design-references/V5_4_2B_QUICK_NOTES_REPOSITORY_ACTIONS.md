# V5_4_2B_QUICK_NOTES_REPOSITORY_ACTIONS — Repository + Server Actions + Guard (sin UI grande)

## Objetivo
Conectar la lógica interna de Quick Notes a la app consumiendo la tabla `quick_notes` (creada y verificada en V5.4.2a,
RLS 31/31 en Cloud): **repository + server actions + validaciones + guard de privacidad de app + tests**. **Sin migraciones,
sin tocar Cloud/RLS, sin UI grande, sin rediseñar `NotesCard`** (eso es V5.4.2c).

## Módulo `apps/web/server/quick-notes/`
| Archivo | Rol |
|---------|-----|
| `types.ts` | `QuickNoteView`, `CreateQuickNoteInput`, `ListQuickNotesOptions`, `QuickNotesRepository`, constantes (`QUICK_NOTES_DASHBOARD_LIMIT=5`, body 1..1000). |
| `errors.ts` | Errores tipados: `QuickNoteValidationError`, `QuickNoteInsufficientRoleError`, `QuickNoteNotFoundError`, `QuickNoteWriteNotSupportedError`. |
| `validation.ts` | `validateQuickNoteBody` (issues) / `parseQuickNoteBody` (trim + 1..1000, lanza). Puro. |
| `guard.ts` | `canViewQuickNotes` / `canCreateQuickNotes` / `canAttemptArchiveQuickNote` (por `ViewerRole`). Puro. |
| `db-repository.ts` | `DbQuickNotesRepository` (Supabase SSR, RLS-bound). list/create/archive. |
| `fixture-repository.ts` | `FixtureQuickNotesRepository` (demo solo lectura; escritura = write-not-supported). |
| `action-result.ts` | `QuickNoteActionResult` + mappers PUROS de error → mensaje curado (sin tecnicismos). |
| `index.ts` | Factory `getQuickNotesRepository()` por `READ_MODEL_SOURCE`; `getDashboardQuickNotes(viewer)` (guard antes de DB). |

Server actions: `apps/web/app/(dashboard)/dashboard/notes-actions.ts` (`'use server'`): `createQuickNoteAction`, `archiveQuickNoteAction`.

## Repository (reglas)
- `listQuickNotes(viewer, { projectId?, estimateId?, limit=5 })`: solo `status='active'`, `organization_id = viewer.organizationId`,
  `created_at DESC`, límite (5 por defecto). `project_id`/`estimate_id` nullable soportados como filtro opcional.
- `createQuickNote(viewer, input)`: `organization_id`/`created_by` server-side (del viewer); body validado + trimeado; `project_id`/`estimate_id` nullable.
- `archiveQuickNote(viewer, noteId)`: **archive-only** — muta SOLO `status`/`archived_at`/`archived_by`. **Nunca** `body` ni identidad/scope
  (no existe operación de edición de body). 0 filas (RLS negó / no existe / ya archivada) ⇒ `QuickNoteNotFoundError`.
- No expone archivadas por defecto; no hay borrado físico.

## Roles y privacidad (decisión V5.4.2b)
Mapeo congelado `profiles.role → ViewerRole`: admin/presupuestos/compras→`internal`, gerencia→`management`, obra→`site`,
**`consulta`→`client`** (único origen de `client`; no hay login de cliente externo).

**Decisión (privacy-first):** las notas son INTERNAS ⇒ **`ViewerRole === 'client'` NO ve, NO crea, NO archiva** en el app-layer.
Alinea con la redacción ya existente para `client` (no ve ruta crítica ni financieros). RLS a nivel DB permitiría a `consulta` leer,
pero el app-layer no sirve notas al bucket client-safe. **Sin tocar el AUTH_CONTRACT** (no se añade ProfileRole al viewer).

- **Ver:** internal/management/site. `client`(=consulta): no.
- **Crear:** internal/management/site (= admin/gerencia/presupuestos/obra/compras). `client`(=consulta): no. RLS lo exige además.
- **Archivar:** app guard deny `client`; la regla fina **creador o admin/gerencia** la impone **RLS** (`created_by = auth.uid() OR current_role IN (admin,gerencia)`); intento no autorizado ⇒ 0 filas ⇒ error controlado.

## Doble defensa (privacidad = riesgo #1)
1. **RLS (primera defensa, la REAL)** — org-scoped + rol-gated + archive-only, verificada en Cloud (31/31).
2. **App guard (segunda defensa)** — `guard.ts` + `getDashboardQuickNotes` no llaman al repositorio/DB para `client`; el repo
   además re-aplica el guard (list⇒`[]`, create/archive⇒`InsufficientRole`) como defensa en profundidad.

## Errores controlados (sin tecnicismos)
Las server actions devuelven `QuickNoteActionResult` con mensajes CURADOS. `action-result.ts` mapea:
validación→`fieldErrors`; rol/RLS(42501)→"No tienes permiso…"; not-found/RLS→"La nota no existe o no puedes archivarla";
demo→"no disponible en modo demostración"; desconocido→genérico. **Nunca** se filtra `42501`/`row-level security`/`quick_notes`/SQLSTATE.

## Tests (`apps/web/tests/unit/quick-notes/`, 28/0)
- **validation-guard**: body vacío/whitespace/null/>1000 falla; válido pasa; trim; guard por ViewerRole (client no; internal/management/site sí).
- **repository**: list (org-scoped, status active, order DESC, límite 5); client⇒`[]` sin DB; create (created_by/org server-side, trim, roles internos); consulta/client no crea (guard antes de DB); body vacío/>1000⇒ValidationError; RLS 42501⇒InsufficientRole; archive muta solo status/archived_at/archived_by (**nunca body/identity**); 0 filas⇒NotFound; client no archiva; **el repo no expone métodos de edición** (solo list/create/archive); fixture (demo lectura, client⇒[], escritura⇒write-not-supported).
- **action-result**: mappers no filtran tecnicismos; validación→fieldErrors; rol/not-found→mensaje curado.

## Integración mínima
`NotesCard` **NO** se tocó (sigue como shell estático). La capa backend queda lista para que **V5.4.2c** la consuma
(`getDashboardQuickNotes` + `createQuickNoteAction`/`archiveQuickNoteAction`).

## QA
typecheck 0 · lint 0 · suite 2231/0 (42 skip) · build 0 · gm 22/22 · quick-notes 28/0 · diff-check limpio.

## Fuera de alcance (respetado)
Sin migraciones · sin db push · sin Supabase Cloud · sin RLS · sin Vercel envs · sin password reset · sin `-1rqh` · sin UI grande ·
sin rediseño de `NotesCard` · sin tag · sin deploy. **Sin merge sin aprobación.**
