# Handoff Log

## 2026-06-02 — CIERRE Fix 4B.1: merge a `main` + migración remota correctiva (16/16)

### Estado
- `git merge --no-ff fix/wave4b1-membership-resolution` (`ab08b28`) → merge **`82c2fa7`**,
  **sin conflictos** (7 archivos, +186/-5). `main = origin/main = 82c2fa7`.
- Tags: **`wave-4b1-membership-fix-code-ready-v1`** (pre-migración) y
  **`wave-4b1-membership-fix-remote-ready-v1`** (post + docs).

### Validación post-merge (todo PASS en `main`)
- typecheck/lint 0, **505 tests**, build OK, gm:regression **22/22**, gm:import PASS,
  validate-agents **214/0/0**, `git diff --check` limpio.

### Migración remota correctiva (controlada)
- `db push --dry-run --linked` ⇒ **exactamente 1** pendiente
  (`20260602130000_fix_membership_app_grants_and_profiles_self_rls.sql`), **0 seeds**.
- `db push --linked` (SIN `--include-seed`) ⇒ "Applying migration … Finished".
- `migration list --linked` ⇒ **16/16 Local = Remote**, ninguna pendiente.
- **Seeds NO ejecutados** · **proyectos remotos NO creados** · sin SQL manual · sin
  `migration repair` · sin service-role.

### Estado remoto
- **16/16** (incluye grants `app` a `authenticated` + `profiles_self_select`). El esquema
  remoto ya no recursará ni fallará por permisos al resolver el viewer en modo `db`.

### Vercel (sin cambios — debe mantenerse)
- `APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=fixture`.

### Próximo paso manual (de la usuaria)
- Cambiar **solo** `READ_MODEL_SOURCE` `fixture`→`db` + redeploy + repetir el smoke de
  creación de proyecto. **Rollback**: `READ_MODEL_SOURCE=fixture` + redeploy.

### Restricciones
- Sin tocar Vercel/variables; sin `db pull`/`migration repair`; **4B.2/4C NO iniciadas.**

## 2026-06-02 — Fix 4B.1: error de membresía en modo `db` (grants `app` + recursión RLS profiles)

### Estado
- Rama **`fix/wave4b1-membership-resolution`** desde `main`@`939af74` (`main` intacta).
  Producción en rollback por la usuaria: `APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=fixture`.

### Diagnóstico (causa raíz DOBLE, demostrada localmente)
- **#1 Grants faltantes**: las migraciones nunca otorgaron a `authenticated` `USAGE`
  sobre el esquema `app` ni `EXECUTE` sobre sus funciones de identidad. El harness RLS
  lo concedía en **runtime** (`ensureGrants`), enmascarando el hueco. En Supabase remoto
  el esquema `app` no es accesible por defecto ⇒ la 1ª política que invoca
  `app.current_org()` falla con **"permission denied for schema app"**;
  `resolveAuthenticatedViewer()` (que lee `profiles` primero) lo reporta como
  **"El usuario no tiene membresía."**. Reproducido local con migraciones puras.
- **#2 Recursión RLS en `profiles`**: la política `profiles_select`
  (`organization_id = app.current_org()`) obliga a `current_org()` a leer `profiles`,
  re-evaluando la política. Con migrador SIN `BYPASSRLS` (postgres remoto), el lookup
  `SECURITY DEFINER` NO salta RLS ⇒ **recursión infinita** ("stack depth limit exceeded").
  Reproducido local emulando los helpers en `SECURITY INVOKER`.

### Fix (migración `20260602130000_fix_membership_app_grants_and_profiles_self_rls.sql`)
- `GRANT USAGE ON SCHEMA app` + `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app` a
  `authenticated` (+ default privileges para funciones futuras).
- Reemplaza `profiles_select` por `profiles_self_select USING (id = (SELECT app._auth_uid()))`
  — self-read sin `current_org()`, rompe la recursión, **más estricto** (no expone perfiles
  de terceros). Aislamiento por organización intacto; RLS sigue FORCE.
- Harness `scripts/rls-runtime/run.ts`: `ensureGrants` ya **no** concede `app`
  (solo `public`, que emula defaults de plataforma) ⇒ ahora valida los grants de la
  migración; +3 checks (self-read, deny terceros, anti-recursión emulando INVOKER).

### Validación (local)
- **RLS runtime 61/61** (58 + 3 nuevos). typecheck/lint 0, **505 tests**, build OK,
  gm:regression 22/22, gm:import PASS, validate-agents 214/0/0, `git diff --check` limpio.

### Restricciones
- Sin tocar Vercel/variables; sin escritura remota; sin `db push/pull`/`migration repair`;
  sin SQL remoto; sin service-role. **NO merge a `main`. 4B.2/4C NO iniciadas.**

### Próximo paso (pendiente de autorización)
- Revisar reporte → si OK: merge a `main` + `db push --dry-run`/`--linked` de la nueva
  migración al remoto, luego la usuaria reintenta `READ_MODEL_SOURCE=db` + smoke.

## 2026-06-02 — CIERRE Oleada 4B.1: merge a `main` + migración remota de proyectos

### Estado
- `git merge --no-ff integration/wave-4b1-real-projects` (`1f5f908`) → merge **`10ac567`**,
  **sin conflictos** (27 archivos, +2549/-26). `main = origin/main = 10ac567`.
- Tags: **`wave-4b1-projects-code-ready-v1`** (pre-migración) y
  **`wave-4b1-projects-remote-ready-v1`** (post-migración + docs).

### Validación post-merge (todo PASS en `main`)
- typecheck/lint 0, **505 tests**, build OK (`/projects` ƒ, `/projects/[id]` ƒ,
  `/projects/new`), gm:regression **22/22**, gm:import PASS, validate-agents **214/0/0**,
  `git diff --check` limpio. Migración `20260602120000_projects_authorship.sql` presente.

### Migración remota aplicada (controlada)
- `db push --dry-run --linked` ⇒ **exactamente 1** migración pendiente
  (`20260602120000_projects_authorship.sql`), **0 seeds**, sin diferencias inesperadas.
- `db push --linked` (SIN `--include-seed`) ⇒ "Applying migration … Finished".
- `migration list --linked` ⇒ **15/15 Local = Remote**, ninguna pendiente.
- **Seeds NO ejecutados** · **proyectos remotos NO creados** · sin SQL manual · sin
  `migration repair` · sin service-role.

### Estado remoto
- Esquema **15/15** (14 previas + `projects_authorship`: `description`+`created_by`).
  Org `GRUPO ICONIC` + 1 profile admin. **Sin proyectos reales aún.**

### Vercel (sin cambios — debe mantenerse)
- `APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=fixture`. El cambio a `db` es **acción
  manual pendiente de la usuaria**.

### Próximo paso manual (de la usuaria, fuera de este entorno)
- Cambiar **solo** `READ_MODEL_SOURCE` de `fixture` → `db` en Vercel, redeploy, y crear
  el **primer proyecto real** desde la interfaz (smoke remoto controlado).
- **Rollback**: volver a `READ_MODEL_SOURCE=fixture` + redeploy.

### Restricciones
- Sin tocar Vercel/variables; sin `db pull`/`migration repair`; **4B.2 / 4C NO iniciadas.**

## 2026-06-02 — Oleada 4B.1 (Fases 2–5): vertical slice real de proyectos (validado, NO mergeado)

### Estado
- Rama `integration/wave-4b1-real-projects` = **`2397323`** (publicada). `main` intacta
  en `cb988be`. Dos sub-merges `--no-ff`: DB/RLS (`d2d426a`) y UI (`2397323`).
- Backups: `backup/wave4b1-projects-db` (`3a403bd`), `backup/wave4b1-projects-ui`
  (`6f41fd4`) — pusheados.

### Entregables
- **Fase 2 (agent-db-rls)**: migración `20260602120000_projects_authorship.sql`
  (`description`+`created_by`); `apps/web/server/projects/` (`ProjectsWriteRepository`,
  validación + generación de `code`, selector); RLS runtime extendido. **Sin service-role.**
- **Fase 3 (agent-frontend-boq)**: server action `createProjectAction`, `mode-guard`,
  lista por `resolveViewer()`, formulario `/projects/new`, detalle `/projects/[id]`.
  (Fix de integración del orquestador: el test importaba `isCreationModeEnabled` desde
  `actions`; corregido a `./mode-guard`.)

### Validación (Fase 4, en la rama de integración)
- typecheck/lint 0, **505 tests**, build OK, gm 22/22, gm:import PASS, validador 214/0/0,
  `git diff --check` limpio. **RLS runtime 58/58** (PG17 local). Smoke HTTP demo+fixture:
  `/projects`, `/projects/new`, `/login` = 200; "+ Nuevo proyecto" deshabilitado en demo.
- Pendiente no bloqueante: smoke interactivo en navegador en modo `db` (login real →
  crear → detalle); validado a nivel DB/unit/build.

### Restricciones respetadas
- Sin tocar Vercel ni remoto; sin escritura remota; sin `db push/pull`; sin service-role;
  sin secretos. **NO merge a `main`. 4C NO iniciada.** Supabase local detenido al cierre.

### Próximo paso (requiere autorización)
- Revisión del reporte → si OK: merge a `main` + (en sesión aparte) smoke remoto mínimo
  controlado. Antes del smoke remoto, definir backup/rollback de datos reales.

## 2026-06-02 — Oleada 4B.1 (Fase 1): contrato congelado del vertical slice de proyectos

### Estado
- Rama **`integration/wave-4b1-real-projects`** desde `main`@`cb988be` (publicada).
  `main` intacta. Logout online confirmado por la usuaria; 4A.3 cerrada.
- Auditoría read-only previa: `migration list --linked` ⇒ **14/14 Local = Remote**.

### Diagnóstico del esquema previo (`projects`)
- RLS por organización ya existente (SELECT/INSERT/UPDATE/DELETE en `app.current_org()`).
- **Faltan** `created_by` y `description`; usa `location` (no `city`); `code` es
  `NOT NULL UNIQUE(org,code)` y no está en el input. `ReadModelPort` es **solo lectura**.

### Contrato congelado (Fase 1)
- `docs/PROJECTS_CRUD_CONTRACT.md` v1 + actualizaciones en `API_CONTRACTS.md`,
  `AGENT_REGISTRY.md` (ownership 4B.1), `DECISIONS.md`, `INTEGRATION_REQUESTS.md`.
- Plan: db-rls (migración `created_by`+`description`, repo de escritura, RLS runtime) →
  frontend-boq (server action + UI lista/detalle/formulario). Ejecución **secuencial**.

### Restricciones
- Sin tocar Vercel ni remoto productivo; sin `db push/pull` en remoto; creación solo en
  `supabase`+`db` local; sin service-role; sin secretos. **4C NO iniciada.**

### Próximo paso
- Fase 2: lanzar `agent-db-rls` (worktree aislado) desde la rama de integración.

## 2026-06-02 — CIERRE Oleada 4A.3: Supabase remoto + autenticación online validada

### Estado
- `main = origin/main = 32b7937`. Tag de cierre **`wave-4a3-online-auth-validated-v1`**.
- **Auditoría read-only remota**: `supabase migration list --linked` ⇒ **14/14 Local =
  Remote**, ninguna pendiente. PostgreSQL **17** remoto. Org inicial `GRUPO ICONIC`,
  **1** profile admin. **Seeds demo remotos: 0** (sin datos de presupuesto reales).

### Smoke online real (confirmado MANUALMENTE por la usuaria en producción)
- Producción: `https://construction-ops-psi.vercel.app`.
- Vercel activo: `APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=fixture`;
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` /
  `NEXT_PUBLIC_APP_URL` configuradas.
- Flujo validado: `/login` visible → credenciales válidas del admin → sesión creada →
  redirect `/dashboard` → dashboard fixture sanitizado visible. **`/logout` =
  comprobación final manual pendiente** de la usuaria (eliminar sesión → redirect
  `/login` → nuevo login funcional).
- Seguridad confirmada: sin secret/service-role en frontend; sin datos reales de
  presupuesto expuestos; **`READ_MODEL_SOURCE=db` NO activado** (sigue `fixture`).

### Cierre técnico 4A.3 (resumen de la microfase completa)
- 4A.3: link controlado read-only; 4A.3a: paridad PG17 + `db push --dry-run`;
  4A.3b: merge PG17 a `main` + `db push --linked` (14/14, sin seeds/usuarios);
  4A.3c: creación manual de org/admin + fix de inlining `NEXT_PUBLIC_*` (merge `ad8f32b`)
  + smoke online real. **Oleada 4A.3 CERRADA.**

### Restricciones respetadas
- Sin tocar Vercel ni variables; sin `db push/pull/repair`; sin SQL/seeds/usuarios
  remotos; sin service-role; sin deploy manual; sin force-push/reset/rebase; sin borrar
  ramas/tags/backups. **Oleada 4B NO iniciada.**

### Rollback disponible
- Volver a `APP_AUTH_MODE=demo` + `READ_MODEL_SOURCE=fixture` + redeploy.

### Próximo paso (propuesto, NO iniciado)
- **Oleada 4B — creación real de proyectos desde la UI** con `READ_MODEL_SOURCE=db`
  (contrato → repo DB → server action → UI → tests → smoke local → smoke remoto).
  Requiere autorización explícita.

## 2026-06-02 — Oleada 4A.3c: merge del fix de login online a `main` + tag

### Estado
- `git merge --no-ff fix/wave4a3-online-login` (`834029c`) → merge **`ad8f32b`**,
  **sin conflictos** (8 archivos, +272/-12). `main` ahora = `ad8f32b`.
  Tag **`wave-4a3-online-login-fix-v1`**.

### Validación post-merge (todo PASS en `main`)
- typecheck 0, lint 0, **461 tests** (33 archivos), build (rutas auth + Proxy +
  `/api/exports`), gm:regression **22/22**, gm:import PASS, validate-agents **214/0/0**,
  `git diff --check` limpio. Sin secretos/privados/`.env.local` staged.
- Auditoría de archivos en `main`: `client.ts` usa referencias **literales**
  `process.env.NEXT_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY` (+ fallback `ANON_KEY`);
  `login/page.tsx` delega en `runPasswordLogin` (copy/layout intactos); sin cambios en
  DB/migraciones/seeds/Proxy/exports/dashboard/fixture/Vercel.

### Restricciones respetadas
- DB remota intacta (14/14 migraciones; sin push/pull/repair/SQL/seeds/usuarios;
  sin service-role). **Vercel intacto** (`APP_AUTH_MODE=demo` + `READ_MODEL_SOURCE=fixture`).
  Sin deploy manual; sin force-push/reset/rebase destructivo; sin borrar ramas/tags/backups.
  **Oleada 4B NO iniciada.**

### Próximo paso (manual, de la usuaria — fuera de este entorno)
- Activar `APP_AUTH_MODE=supabase` en Vercel (manteniendo `READ_MODEL_SOURCE=fixture`),
  redeploy y probar login online real con el admin de `GRUPO ICONIC`.
- Rollback inmediato disponible: volver a `APP_AUTH_MODE=demo` + `READ_MODEL_SOURCE=fixture`.

## 2026-06-02 — Oleada 4A.3c (fix): cablear el login online a Supabase (inlining NEXT_PUBLIC)

### Estado
- Rama de fix **`fix/wave4a3-online-login`** desde `main`@`1ce654e` (`main` intacta).
  Vercel sigue en `APP_AUTH_MODE=demo` + `READ_MODEL_SOURCE=fixture` (restaurado por
  la usuaria); **no se tocó Vercel, ni variables remotas, ni la DB remota**.

### Diagnóstico (causa raíz)
- En modo `supabase`, el submit de `/login` mostraba el error genérico, **sin** request
  a `/auth/v1/token` y **sin** intento en los Auth logs ⇒ `signInWithPassword()` nunca
  se ejecutaba. Causa: `createClient()` (navegador) llamaba `getPublicSupabaseEnv()`
  **sin argumentos**; esa función lee `env.NEXT_PUBLIC_*` de forma **indirecta**
  (`env = process.env` por defecto). Next solo inyecta en el bundle del navegador las
  referencias **literales** `process.env.NEXT_PUBLIC_*`; el acceso indirecto queda
  `undefined` ⇒ `AuthConfigError` lanzado, capturado en el `catch` de `handleSubmit`
  ⇒ mensaje genérico. (Las navegaciones a `/forgot-password` eran el `<Link>` legítimo,
  no un submit accidental.)

### Cambios (solo archivos del orquestador + 1 de frontend-boq, sin rediseño)
- `apps/web/lib/supabase/client.ts`: pasa un objeto con referencias **literales**
  `process.env.NEXT_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY/ANON_KEY` a
  `getPublicSupabaseEnv()` ⇒ Next las inyecta en el navegador. (fix raíz)
- `apps/web/server/auth/login-flow.ts` (**nuevo**, orquestador): `runPasswordLogin`
  puro y testeable (1 sola llamada a `signInWithPassword`, error legible, redirección
  `next` sanitizada anti open-redirect, sin redirigir en error).
- `apps/web/app/(auth)/login/page.tsx` (frontend-boq): `handleSubmit` delega en
  `runPasswordLogin`. Diseño/copy/layout **idénticos**.
- Tests: `tests/unit/auth/login-flow.test.ts` (**nuevo**, 6 casos) +
  `tests/unit/auth/auth-runtime.test.ts` (3 casos de env: prioridad PUBLISHABLE,
  fallback ANON, resolución sin args desde `process.env`).

### Validación (todo PASS)
- typecheck 0, lint 0, **461 tests** (33 archivos, +9), build OK (rutas auth + Proxy +
  `/api/exports`), gm:regression **22/22**, gm:import PASS, validate-agents **214/0/0**,
  `git diff --check` limpio. Sin secretos, sin privados, sin `.env.local` staged.

### Restricciones respetadas
- Sin tocar Vercel/variables remotas; sin `db push/pull/repair`; sin SQL/seeds/usuarios
  remotos; sin service-role; sin secretos; sin force-push/reset; **4B NO iniciada**.

### Próximo paso (pendiente de autorización)
- Autorizar merge de `fix/wave4a3-online-login` a `main` y luego, en sesión aparte,
  cambiar Vercel a `APP_AUTH_MODE=supabase` para validar login online real (4A.3c).

## 2026-06-02 — Oleada 4A.3b: merge PG17 a `main` + bootstrap real del esquema remoto

### Estado
- **Merge de paridad PG17 a `main`**: `git merge --no-ff integration/wave-4a3-remote-bootstrap`
  → merge commit **`139dd52`**, sin conflictos (4 archivos: `config.toml` + 3 docs).
  `main = origin/main = 139dd52`. Tag **`wave-4a3-pg17-bootstrap-ready-v1`** (pre-bootstrap).
- **Bootstrap real del esquema remoto**: `supabase db push --linked` (una sola vez,
  **sin `--include-seed`**) sobre `construction-ops-prod` (ref `jab…pdii`). Aplicó las
  **14 migraciones** en orden; "Finished supabase db push." Único aviso: `NOTICE`
  `pgcrypto already exists` (benigno). El prompt `[Y/n]` se auto-confirmó en entorno no-TTY.

### Validación
- **Post-merge local** (`main`): `config.toml` `major_version = 17`; typecheck/lint 0,
  **452 tests**, build (rutas auth + `/api/exports` + Proxy), gm:regression 22/22,
  gm:import PASS, validate-agents 214/0/0, `git diff --check` limpio.
- **Pre-flight remoto**: 14 pendientes, Remote en blanco, orden correcto.
- **Post-push**: `migration list --linked` ⇒ **14/14 Local = Remote**, ninguna pendiente.
  Git tree limpio (solo memoria del orquestador).

### Restricciones respetadas
- **Seeds NO ejecutados** (sin `--include-seed`); **usuarios NO creados**; sin SQL/Table
  Editor; sin `db pull`/`migration repair`; sin Database Password en comando/logs/docs;
  sin `--password`/`SUPABASE_DB_PASSWORD`; **Vercel intacto** (`APP_AUTH_MODE=demo` +
  `READ_MODEL_SOURCE=fixture`). Sin force-push/reset/rebase. **4B NO iniciada.**

### Rollback / estado funcional
- Remoto: **esquema presente (14 migraciones), SIN datos funcionales** (sin org/usuarios reales).
- Mantener Vercel en `demo` + `fixture` hasta crear admin/login online (4A.3c).
- Si fallara un bootstrap futuro antes de datos reales: evaluar corrección puntual o
  **recrear proyecto remoto vacío**; **NO** usar `migration repair` automáticamente.

### Próximo paso (pendiente de autorización)
- **Oleada 4A.3c**: crear organización + usuario admin inicial seguro y conectar login
  online manteniendo `READ_MODEL_SOURCE=fixture`.

## 2026-06-02 — Oleada 4A.3 + 4A.3a: vínculo remoto controlado + paridad PG17 + dry-run

### Estado
- **4A.3 (read-only)**: Supabase CLI **2.102.0** autenticada por la usuaria (TTY)
  y `supabase link --project-ref jabddbccmhrxztfzpdii` → `Finished supabase link.`
  Proyecto remoto `construction-ops-prod` (org `oxexzrzkzksgwjaihnjf`, West US Oregon).
  Auditoría read-only: **remoto vacío** (`migration list --linked`: 14 locales con
  columna Remote en blanco); `supabase/.temp/` ignorado (`.gitignore:24`).
  Detectado mismatch: remoto **PG 17.6.1** vs `config.toml` `major_version = 15`.
- **4A.3a (esta sesión)** sobre rama **`integration/wave-4a3-remote-bootstrap`**
  (desde `main` `d3617c3`; `main` intacta): paridad local a PG17, revalidación
  local completa y **`db push --dry-run --linked`** (sin push real).

### Cambios
- `supabase/config.toml`: `major_version` **15 → 17** (local, reversible).
- Docs: `DECISIONS.md` (4A.3 + 4A.3a), `HANDOFF_LOG.md`, `QA_REPORT.md`.

### Restricciones respetadas
- Sin `db push` real, sin `--include-seed`, sin `db pull`/`migration repair`,
  sin SQL/seeds/usuarios remotos, sin tocar Vercel ni variables de entorno,
  sin secretos, sin Database Password en comandos/logs/docs. Vercel permanece
  `APP_AUTH_MODE=demo` + `READ_MODEL_SOURCE=fixture`. **4B NO iniciada.**

### Resultados (PASS)
- **PG17 local**: volumen PG15 incompatible → `supabase stop --no-backup` (descarte
  local) + `supabase start` ⇒ `server_version 17.6`. `db reset`: 14 migraciones +
  4 seeds limpios. **RLS runtime 47/47** (org A/B aisladas, sin sesión/sin membresía
  bloqueados, cross-org bloqueado, compat demo). Stack detenido al cierre.
- **Validación general**: typecheck/lint 0, **452 tests** (32 archivos), build
  (rutas auth + `/api/exports` + Proxy), gm:regression **22/22**, gm:import PASS,
  validate-agents **214/0/0**, `git diff --check` limpio.
- **Commit paridad**: `8a76a75` `chore(supabase): align local postgres major
  version with remote pg17` (4 archivos: config.toml + 3 docs); rama pusheada.
- **`db push --dry-run --linked`**: lista exactamente **14 migraciones** en orden
  cronológico, **sin seeds**, sin aplicar. `migration list --linked` post-dry-run:
  **remoto sigue con 0 migraciones** (columna Remote en blanco).
- **Sin push real**, sin SQL/seeds/usuarios remotos, **Vercel intacto**.

### Próximo paso
- Pendiente de autorización explícita: **push real** `supabase db push --linked`
  (sin `--include-seed`) en sesión posterior, con backup/rollback definido.

## 2026-06-02 — Cierre Oleada 4A: merge a `main` + tag

### Estado
- **Merge Oleada 4A a `main`**: `git merge --no-ff integration/wave-4a-auth-runtime`
  (`cc61eec`) → merge **`de37d15`**, **sin conflictos** (44 archivos, +3185/-133).
- Incluye: DB/RLS 4A.1 (migración `auth_identity_helpers` + seed `0004`,
  identidad `auth.uid()`→`profiles`, single-org v1, sin tablas nuevas);
  runtime SSR (`@supabase/ssr`, `getAll/setAll`, Proxy Next 16 con `getClaims()`
  sin `getSession()`, viewer real, role-map, anti open-redirect); UI auth
  (`(auth)/*` + `components/auth/*` + fix Suspense `/login`); guard `/api/exports`.

### Validación post-merge (PASS en `main`)
- typecheck/lint 0 · **452 tests** · build (Proxy + rutas auth + `/api/exports`)
  · gm 22/22 · gm:import 9/9 · validador 214/0/0 · diff limpio.
- **RLS runtime 47/47** (14 migraciones + 4 seeds limpios; Supabase local Docker;
  detenido al cierre). **Smoke demo 6/6 HTTP 200** (`/`→`/dashboard`,
  dashboard/projects/planning/login, `/api/exports` PDF; sin 500).
- Sin secretos; `.env.local` ignorado; sin privados; Excel real ignorado.

### Tag y push
- Tag anotado **`wave-4a-auth-local-v1`** ("Wave 4A validated: Supabase Auth SSR
  proxy UI and local RLS identity"). `git push origin main` + push del tag.
- Commit docs `docs: record wave 4a auth merge validation`.

### Configuración de producción (Vercel) — sin cambios desde el repo
- **Vercel debe permanecer `APP_AUTH_MODE=demo` + `READ_MODEL_SOURCE=fixture`**
  (configurado manualmente por la usuaria). Supabase remoto **NO conectado**;
  sin `link`/`db push`/deploy. Demo pública sanitizada preservada.

### Próximo paso (sin lanzar)
- **Oleada 4A.3 — Supabase remoto controlado + login online** (microfase manual
  de la usuaria: crear proyecto remoto, aplicar migraciones, vars Vercel
  `APP_AUTH_MODE=supabase` manteniendo `READ_MODEL_SOURCE=fixture`, verificar
  login online; luego evaluar `READ_MODEL_SOURCE=db`; rollback a demo+fixture).
- **Oleada 4B NO iniciada.** B-004 (Realtime Windows) deuda no bloqueante.

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-02 — Oleada 4A.2: integración UI auth + smoke local end-to-end

### Estado
- **UI auth integrada** en `integration/wave-4a-auth-runtime`:
  `git merge --no-ff backup/wave4a-auth-ui` (`c9063ad`) → merge **`5c60339`**,
  **sin conflictos** (11 archivos, +1106; HANDOFF_LOG 3-way → versión runtime).
- Auditoría de runtime SSR + UI conforme a `AUTH_RUNTIME_CONTRACT`: browser
  client publishable-only; server client `getAll/setAll`; Proxy Next 16 con
  `getClaims()` (no `getSession()`), deny-by-default y `sanitizeNext`; viewer
  real sesión→`profiles` (org/rol server-side, mapeo único); `/api/exports`
  con anti-escalamiento `isSameOrLessPrivileged`.

### Validación post-merge (PASS)
- typecheck/lint 0 · **452 tests** (+29 auth-ui) · build (Proxy + `(auth)/*` +
  `/api/exports`) · gm 22/22 · gm:import 9/9 · validador 214/0/0 · diff limpio.
- Excel ignorado; sin `.env`/`.env.local`/lock/privados/secretos.

### Smoke local (Supabase local Docker, sin remoto)
- `supabase start -x realtime,studio,storage-api,imgproxy,edge-runtime,logflare,
  vector` + `db reset` (**14 migr + 4 seeds**) + **RLS runtime 47/47**.
- `.env.local` (ignorado): `APP_AUTH_MODE=supabase`, `READ_MODEL_SOURCE=fixture`,
  URL/publishable local. Usuarios seed con contraseña **efímera local** (no en repo).
- 13 pasos PASS: `/login` 200; deny sin sesión (`/login?next=…`); credenciales
  inválidas→error legible; login admin→sesión; `/dashboard` auth 200; `/login`
  auth→`/dashboard`; `/api/exports` sin sesión bloqueado; **escalamiento
  client→internal/management 403**, propio 200; export 200 (PDF); logout→cookie
  borrada; forgot→recover 200 + **Mailpit**; callback sin code→`/login?error`;
  **demo** `/dashboard` 200 sin Supabase.
- `supabase stop` al cierre; helper temporal `_smoke-login.mjs` eliminado.

### Decisiones / próximo paso
- Documentado en DECISIONS (4 filas 4A.2), QA_REPORT (sección 4A.2),
  INTEGRATION_REQUESTS (frontend-boq ✅), AUTH_RUNTIME_CONTRACT §11.
- Commit docs `docs: record wave 4a2 auth runtime ui integration and local smoke`
  + push `origin integration/wave-4a-auth-runtime`. **NO** merge a `main`.
- **Recomendado:** aprobar merge acumulado Oleada 4A → `main` (decisión usuario).
  No iniciar Oleada 4B. Supabase remoto no conectado; Vercel intacto (demo fixture).

### Agentes activos al cierre
- Ninguno.

---

## 2026-05-29 — Sesión inicial
- Estado: repositorio creado, estructura de carpetas inicializada
- Decisión tomada: Drizzle ORM
- Próximo paso: push inicial a GitHub, luego Oleada 1 de agentes
- Bloqueos activos: ninguno
- Agentes activos: ninguno aún

## 2026-05-29 — Preparación documental y normalización de agentes

### Estado inicial encontrado
- `.claude/agents/` ya contenía 6 agentes completos: orchestrator,
  db-rls, excel-mapper, cost-domain, pricing, homecenter.
- Carpeta `agents/` (en raíz) tenía 11 placeholders de 2 bytes con
  nombres en mayúsculas (sin contenido útil).
- `docs/PROJECT_MASTER.md` estaba vacío (1 carácter en blanco).
- `CLAUDE.md` no existía.
- `docs/AGENT_REGISTRY.md` no existía.
- `docs/API_CONTRACTS.md`, `DATABASE_SCHEMA.md`, `EXCEL_MAPPING.md`,
  `QA_REPORT.md` estaban vacíos.
- `.gitignore` incompleto (sin `private/`, `.env.*`, `!.env.example`,
  `.claude/worktrees/`, logs, `Thumbs.db`).
- `scripts/validate-claude-agents.ps1` no existía.

### Archivos movidos
- Ninguno. Los 11 archivos en `agents/` eran placeholders vacíos sin
  información a preservar.

### Archivos creados
- `CLAUDE.md` (raíz) — punto de entrada para Claude Code.
- `.claude/agents/agent-frontend-boq.md`
- `.claude/agents/agent-dashboard.md`
- `.claude/agents/agent-planning.md`
- `.claude/agents/agent-exports.md`
- `.claude/agents/agent-qa.md`
- `docs/AGENT_REGISTRY.md` — matriz maestra de agentes.
- `scripts/validate-claude-agents.ps1` — validador automático.

### Archivos completados
- `docs/PROJECT_MASTER.md` — placeholder explícito que apunta al
  BLOCKER B-001 (no se inventó contenido).
- `docs/OPEN_QUESTIONS.md` — agregado BLOCKER B-001 + 7 preguntas
  nuevas (descuento sobre referencia, redondeo, aprobación SKU, etc.).
- `docs/API_CONTRACTS.md` — convenciones generales y contratos
  por módulo pendientes de detalle.
- `docs/DATABASE_SCHEMA.md` — entidades planificadas y reglas RLS.
- `docs/EXCEL_MAPPING.md` — hojas a documentar y valores de regresión.
- `docs/QA_REPORT.md` — matriz de categorías pendientes.
- `.gitignore` — agregadas reglas para `private/`, `.env.*`,
  `!.env.example`, `.claude/worktrees/`, `*.log`, `.DS_Store`,
  `Thumbs.db`.

### Archivos eliminados
- Carpeta `agents/` completa (11 placeholders vacíos de 2 bytes c/u).

### Resultado del script de validación
```
PASS : 214
WARN : 0
FAIL : 0
Resultado global: PASS (exit code 0)
```

### Warnings
- Ninguno en la validación automática.

### Blockers activos
- **B-001**: `docs/PROJECT_MASTER.md` está vacío. El usuario debe pegar
  manualmente el documento maestro completo (versión Antigravity)
  antes de iniciar la Oleada 1. Ver `docs/OPEN_QUESTIONS.md#B-001`.

### Estado de configuración de agentes
- 11/11 agentes presentes en `.claude/agents/` con frontmatter YAML
  válido.
- 10/10 agentes especializados con `isolation: worktree`.
- `agent-orchestrator` sin `isolation` (correcto).
- Ningún agente con `permissionMode: bypassPermissions`.
- Ningún agente recomienda `ag-grid-enterprise` (sólo aparece en
  secciones de prohibición).

### Siguiente paso recomendado
1. **Usuario**: pegar manualmente el documento maestro completo en
   `docs/PROJECT_MASTER.md` para cerrar B-001.
2. Revisar `docs/AGENT_REGISTRY.md` y validar oleadas/ownership.
3. Inicializar Git, crear el primer commit con la estructura
   preparada.
4. Activar `agent-orchestrator` para iniciar Oleada 1
   (db-rls + excel-mapper + frontend-boq con mocks).

### Agentes activos al cierre
- Ninguno. Sólo preparación documental.

## 2026-05-29 — Cierre del blocker B-001 (PROJECT_MASTER cargado)

### Acción del usuario
- El usuario reemplazó manualmente `docs/PROJECT_MASTER.md` con el
  documento maestro completo del proyecto Construction Ops.

### Verificación
- Tamaño: 2 230 líneas / 43 086 bytes.
- Cabecera leída: título `CONSTRUCTION OPS — DOCUMENTO MAESTRO DEL
  PROYECTO`, versión 1.0, fecha 2026-05-29, proyecto piloto
  `ENTRE PATIOS — Primer piso`.
- Pie leído: termina en sección `24. Nota final` con la triple meta
  (trasladar Excel, herramienta diaria, producto comercial).
- Resultado: NO es placeholder. Contiene visión, dominio, glosario,
  arquitectura, fórmulas, política de privacidad, librerías
  aprobadas y nota final.

### Blockers
- B-001 marcado como RESUELTO en `docs/OPEN_QUESTIONS.md`.
- Sin blockers activos al momento del cierre.

### Resultado del script de validación
```
PASS : 214
WARN : 0
FAIL : 0
Resultado global: PASS (exit code 0)
```

### Estado del repositorio
- Listo para el primer commit.
- Listo para iniciar la Oleada 1 (db-rls + excel-mapper + frontend-boq
  con mocks) cuando el usuario lo solicite.

### Siguiente paso recomendado
1. Inicializar Git e ingresar el primer commit con la estructura
   preparada.
2. Activar `agent-orchestrator` para coordinar la Oleada 1.

### Agentes activos al cierre
- Ninguno. Preparación completa, esperando autorización para Oleada 1.

## 2026-05-29 — Auditoría de arranque pre-Oleada 1 (orchestrator)

### Documentos leídos y verificados
- CLAUDE.md, PROJECT_MASTER.md (43 086 bytes, 2 230 líneas, NO placeholder),
  HANDOFF_LOG, DECISIONS, OPEN_QUESTIONS, AGENT_REGISTRY, API_CONTRACTS,
  DATABASE_SCHEMA, EXCEL_MAPPING, INTEGRATION_REQUESTS, LICENSING.

### Verificaciones técnicas
- `git status`: árbol limpio en `main`, sincronizado con `origin/main`.
- `git log`: 1 commit `463d6a3` (bootstrap).
- Excel real presente en `private/COT.ENTRE PATIOS 1 PISO (1).xlsx` (323 KB).
- `private/` correctamente ignorado (`git check-ignore` confirma) y
  NO trackeado por Git. `.gitignore` cubre `private/`, `*.xlsx`, `*.xls`,
  `.env*` con excepción `!.env.example`.
- 11/11 subagentes presentes en `.claude/agents/`.
- `scripts/validate-claude-agents.ps1`: **PASS 214 / WARN 0 / FAIL 0**,
  exit code 0.
- B-001 confirmado RESUELTO (PROJECT_MASTER cargado).

### Hallazgo crítico
- **B-002 (nuevo, ACTIVO)**: toolchain del monorepo NO inicializado.
  Falta `package.json` y todas las configs. Los `.tsx` son stubs de
  1 línea. Bloquea checklist de merge. Resoluble por orchestrator como
  Paso 0 de Oleada 1 (requiere autorización para instalar dependencias).

### Conclusión sobre decisiones
- Ninguna decisión abierta bloquea el INICIO de la Oleada 1. La política
  de redondeo (Q2/Q9) y la base de descuento (Q8) deben resolverse antes
  de la **Oleada 2** (cost-domain / pricing), no antes.

### Estado y siguiente paso
- Plan de Oleada 1 entregado al usuario para revisión y aprobación.
- NO se lanzaron subagentes. NO se instalaron dependencias. NO se escribió
  funcionalidad. Esperando aprobación del plan.

### Agentes activos al cierre
- Ninguno.

## 2026-05-29 — Paso 0: scaffolding del monorepo pnpm (orchestrator)

### Autorización
- Usuario aprobó el plan de Oleada 1 y la resolución de B-002 vía Paso 0.
- Gestor: pnpm (Corepack), pnpm 11, lockfile `pnpm-lock.yaml`, sin npm/yarn.

### Versiones detectadas
- node v24.13.0 · npm 11.6.2 · corepack 0.34.5 · pnpm 11.5.0.
- `corepack enable pnpm` falló por EPERM (shim en `C:\Program Files\nodejs`
  requiere admin). Workaround NO global de Node: `corepack prepare
  pnpm@latest-11 --activate` (instala 11.5.0) + `corepack enable
  --install-directory <npm global del usuario> pnpm` para exponer el shim
  `pnpm` en PATH del usuario. No se cambió la versión de Node.

### Archivos creados
- Raíz: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`,
  `drizzle.config.ts` (esqueleto, sin credenciales), `pnpm-lock.yaml`,
  `supabase/config.toml`.
- `apps/web/`: `package.json`, `tsconfig.json`, `next.config.mjs`,
  `postcss.config.js`, `tailwind.config.ts`, `.eslintrc.json`,
  `vitest.config.ts`, `next-env.d.ts`, `app/page.tsx`, `middleware.ts`,
  `tests/unit/smoke.test.ts`.

### Archivos modificados
- `apps/web/app/layout.tsx` (layout raíz funcional, orchestrator-owned).
- `apps/web/app/globals.css` (directivas Tailwind).
- 8 placeholders válidos de route-groups (auth/dashboard) — propiedad de
  agent-frontend-boq, marcados como placeholders de Paso 0.
- `.env.example` (+DATABASE_URL placeholder), `.gitignore`
  (+`*.tsbuildinfo`, `next-env.d.ts`), `README.md`, `docs/DECISIONS.md`,
  `docs/LICENSING.md`, `docs/OPEN_QUESTIONS.md`.

### Dependencias instaladas
- prod: next ^14.2.15, react/-dom ^18.3.1, zod ^3.23.8, drizzle-orm ^0.33.0.
- dev: typescript ^5.5.4, @types/node ^20, @types/react/-dom ^18,
  tailwindcss ^3.4.13, postcss ^8.4.47, autoprefixer ^10.4.20,
  eslint ^8.57.1, eslint-config-next ^14.2.15, vitest ^2.1.1.
- Builds aprobados (`onlyBuiltDependencies`): esbuild, unrs-resolver.
- `drizzle-kit` diferido (lo solicitará agent-db-rls).

### Validaciones (todas PASAN)
- typecheck exit 0 · lint sin errores · test 1 passed · build 8 rutas OK.
- validate-claude-agents.ps1 → PASS 214 / WARN 0 / FAIL 0.
- git status: sin archivos privados; `pnpm-lock.yaml` presente; sin
  `package-lock.json`.

### B-002
- RESUELTO. Checklist de merge ejecutable.

### Siguiente paso
- Pendiente: COMMIT del scaffolding (no realizado, según instrucción).
- Listo para lanzar Oleada 1 (db-rls ∥ excel-mapper ∥ frontend-boq) tras
  congelar el contrato de entidades (Sección 6 PROJECT_MASTER) en
  DATABASE_SCHEMA/API_CONTRACTS.

### Agentes activos al cierre
- Ninguno.

## 2026-05-29 — Revisión preventiva: pnpm allowBuilds + upgrade Next 16 (orchestrator)

### 1) Configuración pnpm 11
- Verificado empíricamente en el dist de pnpm 11.5.0: `allowBuilds` es la
  clave vigente (91 ocurrencias) frente a `onlyBuiltDependencies` (2,
  legacy). El usuario tenía razón; mi suposición previa era incorrecta.
- `pnpm-workspace.yaml` ahora usa solo `allowBuilds` (mapa `pkg: bool`),
  sin claves legacy ni placeholders inválidos:
  `esbuild: true`, `sharp: true`, `unrs-resolver: true`.

### 2) Upgrade Next.js 14 → 16 (estable, no canary)
- Versiones consultadas (`pnpm view`): next 16.2.6, react 19.2.6,
  react-dom 19.2.6, eslint-config-next 16.2.6, @types/react 19.2.15,
  @types/react-dom 19.2.3, eslint 9.39.4 (se descartó 10.4.1),
  typescript 5.9.3 (se descartó 6.0.3). Canary 16.3.0 descartado.
- Migración Next 16 aplicada (confirmada contra `node_modules/next/dist/docs`):
  - `middleware.ts` → **`proxy.ts`** (función `proxy`); `middleware.ts`
    eliminado. El build reporta `ƒ Proxy (Middleware)`.
  - `next lint` eliminado en 16 → **ESLint 9 flat config**
    (`apps/web/eslint.config.mjs` consumiendo el array de
    `eslint-config-next`); `.eslintrc.json` eliminado; script `eslint .`.
  - Build con Turbopack.

### 3) Documentación
- Creado `AGENTS.md` (regla: consultar doc versionada en
  `node_modules/next/dist/docs/`). Añadido `@AGENTS.md` en `CLAUDE.md`
  sin borrar reglas existentes.
- Actualizadas menciones de Next 14 → 16 en README, DECISIONS, LICENSING
  y `.claude/agents/agent-frontend-boq.md`.
- DECISIONS y LICENSING reflejan el nuevo stack y `allowBuilds`.

### Validaciones (todas PASAN, stack Next 16)
- `pnpm install` limpio (sin ERR_PNPM_IGNORED_BUILDS tras rebuild de
  esbuild/sharp/unrs-resolver).
- typecheck exit 0 · lint exit 0 (eslint flat) · test 1 passed ·
  build OK (8 rutas + Proxy, Next 16.2.6 Turbopack).
- validate-claude-agents.ps1 → PASS 214 / WARN 0 / FAIL 0.
- Sin `package-lock.json`; sin ag-grid-enterprise; sin AGPL; `private/`
  ignorado; Excel real no aparece en git status.

### Estado
- Repositorio listo para commit del Paso 0. Commit NO realizado (según
  instrucción). Sin push. Sin subagentes.

### Agentes activos al cierre
- Ninguno.

## 2026-05-29 — Paso 0 commit/push + congelamiento de contrato v1 (orchestrator)

### Commit del Paso 0
- Commit `9bb4a397633a3513d7a0d50d8b592c4e32fff510` (`9bb4a39`):
  "chore: scaffold pnpm monorepo toolchain". Push OK
  `463d6a3..9bb4a39 main -> main`. Auditoría de `.claude/agent-memory/`
  limpia (sin secretos/datos privados).

### Congelamiento de contrato de entidades v1
- `docs/DATABASE_SCHEMA.md` → **Contrato congelado v1**: 20 entidades de
  Oleada 1 documentadas a fondo (tabla, propósito, columnas, tipos,
  nullability, PK UUID, FK, ON DELETE, organization_id/RLS, índices,
  integridad, enums, inmutabilidad, snapshots, campos 🔒, dudas). 7
  entidades marcadas **Provisional v0 — no congelada**.
- `docs/API_CONTRACTS.md` → **Contrato congelado v1**: 20 interfaces TS
  públicas (Organization … QuantityLine), alias base (`Uuid`,
  `IsoDateTime`, `IsoDate`, `DecimalString`), todos los enums, matriz de
  privacidad cliente-safe vs interno, ownership de tipos y reglas de cambio.
- `docs/AGENT_REGISTRY.md` → sección de ownership del contrato: db-rls
  implementa el esquema exacto; excel-mapper y frontend-boq respetan
  nombres/tipos canónicos; sin renombres unilaterales; cambios solo vía
  INTEGRATION_REQUESTS.

### Estrategia ratificada
- DB `snake_case` ↔ TS `camelCase`; tipos `PascalCase`.
- Dinero: `NUMERIC(20,10)` (DB) ↔ `string` decimal (API) ↔ Decimal.js (cálculo).
  El frontend NO calcula totales financieros.
- Snapshots/versiones emitidas inmutables (RLS bloquea UPDATE/DELETE).
- Privacidad backend-first (campos 🔒 no se serializan a rol cliente).
- Alcance Oleada 1 = solo entidades congeladas v1.

### Decisiones que siguen ABIERTAS (no cerradas)
- **Q9** política de redondeo COP → bloquea Oleada 2 (cost-domain).
- **Q8** base del descuento (público vs referencia) → bloquea Oleada 2 (pricing).
- Ninguna afecta el esquema congelado v1.

### Validaciones
- typecheck/lint/test/build OK; validate-claude-agents.ps1 PASS 214/0/0.
- Cambios solo en docs (.md); sin código/migraciones.

### Estado
- Contrato v1 redactado. Pendiente tu revisión. Commit/push NO realizados.
- Tras tu aprobación, listo para lanzar Oleada 1.

### Agentes activos al cierre
- Ninguno.

## 2026-05-29 — Preparación operativa de Oleada 1 (orchestrator)

### .worktreeinclude (temporal)
- Creado `.worktreeinclude` en raíz con **solo** la ruta exacta
  `private/COT.ENTRE PATIOS 1 PISO (1).xlsx`. Permite que los worktrees
  aislados reciban el golden master (Git no copia archivos ignorados).
- **TEMPORAL Oleada 1**: revisar/retirar después de que
  `agent-excel-mapper` genere el fixture sanitizado, para no depender del
  Excel privado en worktrees.
- Verificado: Excel sigue ignorado (`.gitignore:2 private/`),
  `.worktreeinclude` es versionable, Excel NO en staging.

### Commit del contrato v1
- Commit `cadd8c7ce903f51700cf35161fd8ab406b2f065a` (`cadd8c7`):
  "docs: freeze wave 1 entity contracts". Push OK
  `9bb4a39..cadd8c7 main -> main`. Excel NO staged.

### Dependencias de Oleada 1 (pnpm)
- **Raíz** devDependencies: `drizzle-kit ^0.31.10` (MIT) + script
  `db:generate`. Vive en raíz porque `drizzle.config.ts` está en raíz.
- **apps/web** dependencies: `postgres ^3.4.9` (Unlicense),
  `decimal.js ^10.6.0` (MIT), `ag-grid-community`/`ag-grid-react ^35.3.0`
  (MIT, Community, soporta React 19), `clsx ^2.1.1`,
  `tailwind-merge ^3.6.0`, `class-variance-authority ^0.7.1` (Apache-2.0),
  `lucide-react ^1.17.0` (ISC), `@radix-ui/react-slot ^1.2.4` (MIT).
- **apps/web** devDependencies: `xlsx ^0.18.5` (Apache-2.0).
- **Diferidas** (no instaladas): recharts, frappe-gantt, exceljs,
  @react-pdf/renderer (Oleada 3, vía INTEGRATION_REQUESTS).
- Todas las licencias permisivas; **sin AGPL**; sin `ag-grid-enterprise`.
- Build scripts aprobados ahora incluyen las variantes de `esbuild` que
  trae drizzle-kit (cubiertas por `allowBuilds: esbuild: true`).

### Validaciones (todas PASAN)
- install limpio · typecheck 0 · lint 0 · test 1 passed · build OK
  (Next 16.2.6 Turbopack, `ƒ Proxy`). validate-claude-agents PASS 214/0/0.
- Excel ignorado; sin privados en staging; sin .env trackeado; sin
  package-lock.json; sin ag-grid-enterprise; 11/11 agentes.

## 2026-05-30 — Oleada 1: mapeo del golden master (agent-excel-mapper)

### Alcance trabajado
- Worktree aislado `agent-ad8fb1044998f390d`. Excel privado presente y
  legible en `private/COT.ENTRE PATIOS 1 PISO (1).xlsx` (323 KB, vía
  `.worktreeinclude`). NO se commiteó ni se modificó el Excel.

### Hojas analizadas (10/10)
- RESUMEN, COTIZACION FULL, APU, COTIZACION 1 PISO, ACTA DE MODIFICACION 01,
  RESUMEN 1 PISO, CANTIDADES 1 PISO, CANTIDADES, LISTADO MATERIALES,
  CANT COMPLETO. Documentadas en `docs/EXCEL_MAPPING.md` (propósito, rango,
  columnas, inputs vs derivadas, fórmulas clave, refs cruzadas, sanitización)
  y mapeadas a entidades del contrato congelado v1.

### Archivos creados (todos dentro del alcance de excel-mapper)
- `scripts/golden-master/dump-workbook.mjs` — volcado estructural del Excel.
- `scripts/golden-master/expected-values.ts` — 9 valores de regresión §3.4.
- `scripts/golden-master/recompute-first-floor.ts` — recálculo puro AIU/IVA.
- `scripts/golden-master/first-floor.regression.test.ts` — test Vitest.
- `scripts/golden-master/vitest.config.ts` — config local aislada.
- `scripts/excel-import/import.ts` — importador idempotente.
- `scripts/excel-import/sheet-map.ts` — mapa declarativo Excel→entidades v1.
- `scripts/excel-import/sanitize.ts` — sanitización + alias deterministas.
- `scripts/fixtures/entre-patios-first-floor.fixture.json` — fixture SANITIZADO
  (contrato v1, dinero como string, sin datos privados).
- `scripts/fixtures/entre-patios-first-floor.schema-notes.md` — notas del fixture.
- `scripts/README.md` — cómo ejecutar dump/regresión/importador.

### Archivos modificados
- `docs/EXCEL_MAPPING.md` — completado (10 hojas + mapeo + regresión).
- `docs/INTEGRATION_REQUESTS.md` — solicitudes (ejecución Bash, scripts pnpm).

### Regresión financiera (estado)
- VERIFICADA ANALÍTICAMENTE dentro de tolerancia (±0.01 COP / ±0.001 m²): la
  cadena Admin=D×0.035, Imprev=D×0.025, Util=D×0.04, IVA=Util×0.19,
  Indirectos=ΣAIU+IVA, Total=D+Indirectos, valor_m2=Total/área reproduce los
  9 valores de §3.4 desde la base. NO se ejecutó Vitest (ver bloqueo).
- NO se ajustaron fórmulas ni tasas para forzar coincidencia.

### Bloqueo activo
- **Ejecución denegada**: la herramienta Bash rechazó ejecutar `node`,
  `pnpm exec vitest` y el dump del Excel (solo pasó `node --version`). En
  consecuencia NO se pudo: (a) confirmar coordenadas celda a celda con
  `dump-workbook.mjs`, (b) correr la suite de regresión, (c) ejecutar el
  importador. Registrado en `docs/INTEGRATION_REQUESTS.md`. Las coordenadas
  exactas quedan como `TODO_VERIFY` en `sheet-map.ts` y EXCEL_MAPPING §8.

### Privacidad
- Fixture sanitizado (cliente/proveedores → alias; NIT/tel/dir eliminados).
  `import.ts` incluye `findPrivateLeaks` como verificación final.
- `.gitignore` cubre `private/`, `*.xlsx`, `*.xls` (verificado).

### Siguiente paso recomendado
- Orquestador (o sesión con Bash): ejecutar `scripts/README.md` para
  confirmar PASS empírico de regresión e importador, y poblar el detalle real
  fila a fila con el dump. Luego habilitar Oleada 2 (cost-domain consume el
  fixture y la regresión como oráculo).

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Oleada 1 Fase 1: validación empírica del Excel Mapper (orchestrator)

### Contexto
- Trabajo sobre `backup/wave1-excel-mapper` (respaldo `c9fe850`), en el checkout
  principal (con node_modules). Excel real presente e ignorado (`.gitignore:2`).

### Toolchain añadido (orchestrator owns package.json)
- `tsx ^4.22.3` (devDep raíz, MIT) + scripts raíz `gm:dump`, `gm:build-fixture`,
  `gm:regression`, `gm:import`.

### Validación empírica (todo PASA)
- `gm:dump`: 10 hojas confirmadas con ref/fórmulas/inputs.
- Localización por celda: los 9 valores §3.4 confirmados en celdas reales de
  `RESUMEN 1 PISO` (E27..E35) + `CANTIDADES 1 PISO!I187` (área). Cacheados
  coinciden con §3.4 a precisión completa. Coordenadas documentadas en
  EXCEL_MAPPING §10. TODO_VERIFY de los 9 → resueltos con evidencia.
- `gm:build-fixture`: fixture **v2.0.0 fila por fila** desde el Excel real:
  14 capítulos + **131 ítems BOQ** reales, **SIN ítem de balanceo**.
  Σ ítems = costos_directos ±2.05e-8 COP.
- `gm:regression` (Vitest): **22/22 PASS** (9 fixture vs §3.4 + 9 cadena
  recalculada + 3 BOQ fila-por-fila sin balanceo + 1 presencia).
- `gm:import`: regresión 9/9, recálculo 9/9, **privacidad OK**, idempotencia.

### Fix de privacidad
- `findPrivateLeaks` (sanitize.ts) reescrito: escanea solo texto libre,
  excluye UUID/DecimalString/fecha/moneda. Antes daba falsos positivos
  (NIT/teléfono) sobre ceros de UUID y montos. Fixture verificado: 0 fugas.

### Validaciones de proyecto
- typecheck 0 · lint 0 · test 1 passed · build OK (Next 16.2.6) ·
  validate-claude-agents PASS 214/0.
- Excel ignorado; sin privados en staging; los 9 valores **pasan
  empíricamente**. No se ajustó ninguna fórmula.

### Estado
- Fase 1 COMPLETA. Listo para commit adicional sobre `backup/wave1-excel-mapper`
  y luego crear `integration/wave-1` (Fase 2).

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Integración Oleada 1 en integration/wave-1 (orchestrator)

### Fase 0 — respaldos
- `backup/wave1-db-rls` (00283d0), `backup/wave1-frontend-boq` (b7f0de8),
  `backup/wave1-excel-mapper` (c9fe850→c9e4f3a) creadas y en origin.

### Fases 2-5 — integración secuencial (cherry-picks en integration/wave-1)
- Rama creada desde `origin/main` (7e45691), pusheada. `main` intacto.
- **DB+RLS** (00283d0): cherry-pick limpio. Fix integración: `drizzle-orm`
  0.33→0.45 (schema usa API array) + regex tests RLS acotados por política.
  RLS = **estática PASS (70 tests)**; **runtime PENDIENTE** (Supabase/Docker).
  NO se conectó base remota.
- **Excel Mapper** (c9fe850 + c9e4f3a): cherry-pick limpio; gm:regression 22/22,
  gm:import PASS; fixture idéntico al regenerar (idempotente).
- **Frontend BOQ** (b7f0de8): cherry-pick limpio (layout/proxy intactos). Fix
  integración: tipos AG Grid v35 (`boq-grid.tsx`) + orden `@import` en
  `globals.css`. Dev smoke: 8/8 rutas HTTP 200.

### Fase 6 — `.worktreeinclude` eliminado (temporal); `private/` sigue ignorado.

### Fase 7 — validación integral (integration/wave-1)
- typecheck 0 · lint 0 · **108 tests PASS** · build Next 16.2.6 (9 rutas + Proxy)
  · validate-claude-agents PASS 214/0/0.
- Sin ag-grid-enterprise, sin AGPL, sin `.env` trackeado, sin `package-lock.json`;
  Excel ignorado y no en staging; fixture sin balanceo; sin TODO_VERIFY crítico.
- INTEGRATION_REQUESTS: 3 solicitudes del excel-mapper RESUELTAS.
- QA_REPORT actualizado (PASS pre-merge; salvedad RLS runtime).

### Estado
- `integration/wave-1` lista para commit final + push. **NO merge a main**
  (a la espera de aprobación del usuario).

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Merge de Oleada 1 a main (orchestrator)

### Merge
- Usuario aprobó el merge. `git merge --no-ff integration/wave-1` →
  **merge commit `58f4366222d86cec492748dc84eabd1123e7c8db`** (`58f4366`).
  Sin conflictos. `main` adelantó 8 commits sobre `7e45691`.

### Validación post-merge (todo PASA)
- typecheck 0 · lint 0 · **test 108 PASS** · build Next 16.2.6 (9 rutas + Proxy).
- `gm:regression` **22/22** (9/9 golden master ±0.01 COP) · `gm:import` todas PASS.
- `validate-claude-agents.ps1` **PASS 214/0/0** · `git diff --check` limpio.

### Privacidad y limpieza (verificado en main)
- Excel ignorado (`.gitignore:2 private/`) y NO versionado; 0 nombres de cliente
  en archivos versionados (leak-check por hash); fixture sanitizado fila-por-fila
  **sin ítem de balanceo**; sin `TODO_VERIFY` críticos.
- Sin `ag-grid-enterprise`, sin AGPL, sin `.env` trackeado, sin `package-lock.json`.
- `.worktreeinclude` eliminado; fixture sanitizado presente.

### Estado del frontend
- Build prerenderiza 9 rutas; dev smoke previo 8/8 HTTP 200. AG Grid Community.

### Ramas y tag
- **Conservados**: `backup/wave1-db-rls`, `backup/wave1-frontend-boq`,
  `backup/wave1-excel-mapper`, `integration/wave-1`.
- Tag anotado: `wave-1-foundation-v1`.

### Pendientes antes de Oleada 2
- **RLS runtime** contra Supabase/Postgres local (Docker) — solo estático hasta ahora.
- **Q8** (base del descuento) y **Q9** (redondeo COP) deben cerrarse.

### Agentes activos al cierre
- Ninguno. Oleada 2 NO iniciada (a la espera de autorización).

## 2026-05-30 — Oleada 1.5: cierre Q8/Q9 + intento RLS runtime local (orchestrator)

### Rama
- Toda la Oleada 1.5 se ejecuta FUERA de `main`, en `feature/wave-1.5-local-rls`
  (creada desde `main` `d9ca10b`, pusheada a origin). `main` permanece intacto.

### Fase 1-2 — Q8 y Q9 CERRADAS
- **Q8** (base del descuento) = **`online_public_price`**. Fórmulas canónicas:
  `budget_reference_price = online_public_price × (1 + preventive_variation_pct)`;
  `expected_purchase_price = online_public_price × (1 − negotiated_discount_pct)`;
  `projected_saving = budget_reference_price − expected_purchase_price`;
  `realized_saving = budget_reference_price − actual_purchase_price`. Excepciones
  configurables por proveedor/producto. Descuento/ahorro/margen son 🔒 internos
  (nunca a cliente; privacidad backend-first).
- **Q9** (redondeo COP): cálculo interno raw (`Decimal.js` + `NUMERIC(20,10)` +
  serialización `string`, sin float JS, sin redondear intermedios, snapshots con
  precisión completa); presentación `ROUND_HALF_UP` (UI/PDF cliente 0 dec; Excel
  técnico 2 dec; regresión/auditoría raw). El redondeo visual NO muta snapshots.
- Documentadas en DECISIONS, API_CONTRACTS, DATABASE_SCHEMA y OPEN_QUESTIONS.

### Fase 3 — Entorno e instalación
- Docker 29.5.2 operativo (`docker info` Server OK; `hello-world` OK). Node v24.13.0,
  pnpm 11.5.0 (Corepack). Supabase CLI NO estaba instalado.
- Instalado **`supabase ^2.102.0`** (MIT) como devDep raíz (`corepack pnpm
  --workspace-root add -D supabase`). Sin global, sin remoto. `supabase --version`
  → 2.102.0. Registrado en LICENSING y DECISIONS.

### Fase 4-5 — RLS runtime: BLOQUEADO por Docker (B-003)
- Auditados `config.toml`, 11 migraciones, 2 seeds, README de policies (compatibles
  con CLI local). El seed solo crea 1 organización ⇒ el harness crea una org B.
- Creado harness **`scripts/rls-runtime/run.ts`**: conecta al Postgres local
  (`postgres` pkg), `SET LOCAL ROLE authenticated` + claims JWT vía
  `set_config('request.jwt.claims', ...)`, transacciones con ROLLBACK. Cubre:
  helper `app.current_org()`, aislamiento A/B, denegación cross-org (UPDATE 0 filas +
  INSERT WITH CHECK), usuario sin organización, `price_observations` append-only
  (+ trigger de inmutabilidad), `apu_calculation_snapshots` inmutable, versiones
  emitidas bloqueadas (+ hijos) y control positivo en `draft`.
- **BLOQUEO**: `supabase start` y `docker pull` fallan con
  `io.containerd.metadata.v1.bolt/meta.db: input/output error` (content store de
  Docker Desktop corrupto; `docker system df` no lista imágenes). Host con 1.5 TB
  libres ⇒ no es espacio. Ver **B-003** en OPEN_QUESTIONS. NO se ejecutó la suite
  RLS runtime; NO se declara PASS. NO se conectó base remota.

### Fase 6 — Validación offline (todo PASS)
- typecheck 0 · lint 0 · **108 tests** · build Next 16.2.6 (8 rutas + Proxy) ·
  `gm:regression` 22/22 · `gm:import` PASS (privacidad 0 fugas) ·
  `validate-claude-agents` 214/0/0 · `git diff --check` limpio.
- `.gitignore`: añadido `supabase/.temp/` y `supabase/.branches/`. Excel ignorado;
  sin privados en staging; sin `.env` trackeado; sin `package-lock.json`.

### Estado / próximo paso
- Commit de deliverables en la rama (NO merge a `main`). Falta SOLO la ejecución
  real de RLS runtime, bloqueada por B-003 (infra/Docker). Tras reparar Docker
  Desktop: `supabase start` → `db reset` → ejecutar el harness → si PASS, decidir
  merge a `main` y habilitar Oleada 2.
- **NO se recomienda merge a `main` todavía** (RLS runtime sin ejecutar).

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Oleada 1.5: RLS runtime REAL ejecutado, B-003 RESUELTO (orchestrator)

### Contexto
- Docker Desktop reparado por el usuario (content store regenerado; validado:
  `docker info`/`system df`/`pull alpine`/`run alpine` OK). Sesión sobre la rama
  existente `feature/wave-1.5-local-rls` (sin rama nueva, sin merge a `main`, sin
  remoto, sin `supabase link`/`db push`, sin Oleada 2).

### Entorno Supabase local
- `corepack pnpm install`: up to date (pnpm 11.5.0).
- `supabase start`: imágenes descargadas OK (Docker reparado); **11 migraciones**
  aplicadas en orden. El contenedor `realtime` quedó *unhealthy* en Windows ⇒ se
  arrancó excluyendo servicios no esenciales (`-x realtime,studio,storage-api,
  imgproxy,edge-runtime,logflare,mailpit,vector`); el harness solo necesita `db`.
- `supabase db reset`: re-aplicó **11 migraciones + 2 seeds** sin errores.

### Fixes de integración (necesarios para que corriera el runtime)
- **`supabase/config.toml`** (orchestrator-owned): añadido `[db.seed]` con
  `sql_paths` explícito a `seeds/0001` y `seeds/0002` (no se cargaban por defecto;
  `supabase db reset` avisaba `no files matched supabase/seed.sql`).
- **`supabase/seeds/0001_demo_org_and_profiles.sql`** (db-rls-owned, fix de
  integración): el seed insertaba `profiles` sin filas previas en `auth.users`.
  En el stack Supabase local el esquema `auth` existe ⇒ la migración `0001`
  activa el FK `profiles_id_auth_users_fk` y `db reset` fallaba (SQLSTATE 23503).
  Añadido bloque `DO $$ … INSERT auth.users … $$` guardado por la presencia del
  esquema `auth` (espejo de la condición de la migración; sigue funcionando en
  Postgres puro). Solo `id`+columnas mínimas, sin credenciales. **Registrado en
  INTEGRATION_REQUESTS para aval de agent-db-rls.**
- **`scripts/rls-runtime/run.ts`** (orchestrator-owned): `setupOrgB` ahora crea
  la fila `auth.users` del admin B antes de su `profile` (mismo guard de `auth`).

### RLS runtime — RESULTADO: 21 PASS / 0 FAIL (Postgres real)
- Pre-flight: seeds org/proyecto A; **20 tablas con RLS FORCE**.
- Helper `app.current_org()` lee `organization_id` del JWT; aislamiento A/B
  (A no ve B, B no ve A); A no UPDATE/INSERT en org B (0 filas / WITH CHECK);
  usuario sin organización 0 filas; `price_observations` append-only + precio
  inmutable (trigger); `apu_calculation_snapshots` inmutable; `estimate_versions`
  emitida bloquea UPDATE/DELETE + hijos; control positivo `draft` editable.

### Validaciones generales (todas PASS)
- typecheck 0 · lint 0 · **108 tests** · build Next 16.2.6 (9 rutas + Proxy) ·
  `gm:regression` **22/22** (golden master ±0.01 COP) · `gm:import` PASS
  (privacidad 0 fugas) · `validate-claude-agents` **214/0/0** · `git diff --check`
  limpio (solo avisos LF→CRLF). Sin privados en staging; sin `.env` trackeado;
  sin `package-lock.json`; sin `ag-grid-enterprise`; sin AGPL.

### Estado / próximo paso
- **B-003 RESUELTO**. Q8/Q9 ya cerradas. Commit `test: complete local supabase
  rls runtime validation` en la rama; push solo a
  `origin feature/wave-1.5-local-rls`. Supabase local detenido (`supabase stop`).
- **Recomendación: APROBAR merge `feature/wave-1.5-local-rls` → `main`** (no
  ejecutado en este ciclo; queda a decisión del usuario). Tras el merge, habilitar
  **Oleada 2** (cost-domain ∥ pricing ∥ homecenter).

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Merge de Oleada 1.5 a main + cierre (orchestrator)

### Merge
- Usuario aprobó el merge. Preflight: `main = origin/main = d9ca10b` (árbol
  limpio); `origin/feature/wave-1.5-local-rls` final = `febfeb8`; 3 backups y tag
  `wave-1-foundation-v1` conservados; Excel ignorado; sin `.env` trackeado; sin
  `package-lock.json`; solo `ag-grid-community/react` (MIT).
- `git merge --no-ff feature/wave-1.5-local-rls` → **merge commit
  `1ddc833d733c51e556445ccee96bdab8843efcd1`** (`1ddc833`). **Sin conflictos.**
  16 archivos, +784/-13. `main` adelantó 2 commits de contenido + merge.

### Validación post-merge (todo PASA en main)
- `pnpm install` up to date · typecheck 0 · lint 0 · **108 tests** · build Next
  16.2.6 (9 rutas + Proxy) · `gm:regression` **22/22** · `gm:import` **9/9**
  (regresión §3.4 diff=0; privacidad 0 fugas) · `validate-claude-agents`
  **214/0/0** · `git diff --check` limpio · árbol limpio.
- Privacidad: `git check-ignore` confirma `private/` ignorado; sin `.env`
  trackeado; sin `package-lock.json`; `ag-grid-enterprise` solo en comentarios de
  prohibición; sin AGPL.

### Deuda técnica registrada
- **B-004 — Supabase Realtime unhealthy en Docker Desktop (Windows)**: no
  bloqueante; no afectó RLS (solo se requiere el contenedor `db`); RLS runtime
  21/21. Revisar antes de funcionalidades Realtime o producción. Documentado en
  OPEN_QUESTIONS y QA_REPORT. NO se intentó resolver.

### Commit documental
- `docs: record wave 1.5 runtime validation and realtime caveat` (B-004 +
  validación post-merge en OPEN_QUESTIONS, QA_REPORT, HANDOFF_LOG).

### Estado de cierre
- **Oleada 1.5 CERRADA.** B-003 RESUELTO; Q8/Q9 RESUELTAS; RLS runtime 21/21.
- Push a `origin main` + tag anotado `wave-1.5-rls-runtime-validated-v1`.
- Ramas `feature/wave-1.5-local-rls`, backups e `integration/wave-1`
  conservadas; tag `wave-1-foundation-v1` conservado.
- **Oleada 2 NO lanzada** (plan preparado; espera autorización del usuario).
  Secuencia recomendada: 2A `agent-cost-domain` ∥ `agent-pricing`; congelar
  `docs/PRICING_ADAPTER_CONTRACT.md`; luego 2B `agent-homecenter`.

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Oleada 2A: rama de integración + congelar contrato de precios (orchestrator)

### Fase 0 — rama de integración
- Preflight: `main = origin/main = 974ea99` (árbol limpio); tags
  `wave-1-foundation-v1` y `wave-1.5-rls-runtime-validated-v1` conservados;
  3 backups conservados; Excel ignorado; sin `.env`/`package-lock`; solo
  `ag-grid-community/react` (MIT).
- Creada y publicada **`integration/wave-2a`** desde `main`. `main` intacta.

### Fase 1 — contrato de lectura de precios CONGELADO v1
- Creado **`docs/PRICING_READ_CONTRACT.md`** (orchestrator-owned, congelado v1;
  cambios solo vía INTEGRATION_REQUESTS). Define:
  - tipos base (reusa `Uuid`/`IsoDateTime`/`DecimalString`/`PriceSourceType`/
    `PricingRuleType`/`SyncStatus` de API_CONTRACTS);
  - `ApprovedPriceContext` (snapshot aprobado; dinero/porcentajes `DecimalString`;
    fórmulas Q8 base `onlinePublicPrice`; campos 🔒 marcados);
  - `PricingReadPort` (`getApprovedPrice` → único contexto | `no_approved_price`
    | `ambiguous_price`); determinista, solo lectura;
  - `PricingApprovalPort` (escritura interna exclusiva de pricing: observación,
    aprobación humana, override trazable, append-only, no muta snapshots);
  - privacidad backend-first + proyección `ClientSafePrice` (sin campos 🔒).
- **Frontera**: cost-domain consume el puerto/DTO; NO consulta tablas de pricing
  ni recalcula descuentos/ahorros; usa `budgetReferencePrice` como
  `unit_price_snapshot`.
- Actualizados: `API_CONTRACTS.md` (§5 + ownership de puertos),
  `AGENT_REGISTRY.md` (dependencia 2A + criterios cost/pricing), `DECISIONS.md`
  (4 filas: merge 1.5, B-004, rama 2A, contrato de precios), este HANDOFF_LOG.

### Próximo paso
- Commit `docs: freeze wave 2a pricing read contract` + push a
  `origin integration/wave-2a`. Luego lanzar en paralelo (worktrees aislados)
  `agent-cost-domain` y `agent-pricing`. NO `agent-homecenter`. NO merge.

### Agentes activos al cierre de esta microfase
- Ninguno (aún). A continuación se lanzan cost-domain ∥ pricing.

## 2026-05-30 — Oleada 2A: agentes ejecutados y entregables preservados (orchestrator)

### Lanzamiento
- Contrato congelado commit `02ca9c3` en `integration/wave-2a`. Lanzados en
  paralelo en worktrees aislados: **agent-cost-domain** y **agent-pricing**.
- **Nota**: ambos worktrees se derivaron de `main`@`974ea99` (antes de
  `02ca9c3`), por lo que NO vieron `docs/PRICING_READ_CONTRACT.md`. Cada uno
  implementó `PricingReadPort` desde la spec de la tarea + Q8 de API_CONTRACTS.
  Reconciliación de tipos registrada en INTEGRATION_REQUESTS (pendiente 2A).

### agent-cost-domain — entregable
- Motor financiero puro en `apps/web/modules/apu|boq|estimates/` + 8 archivos de
  test en `apps/web/tests/unit/cost-domain/` + memoria de agente. Mano de obra,
  APU (vía `PricingReadPort`), BOQ, AIU/IVA configurables, total, valor/m²,
  snapshots inmutables, clonación. `decimal.js`/`DecimalString` (Q9).
- Validado: **typecheck 0 · lint 0 · 178/178 tests · gm:regression 22/22**;
  9 valores §3.4 ±0.01 COP desde el fixture (sin ajustar fórmulas).
- **`git commit` denegado en su entorno**; el orquestador commiteó →
  **`3783aca`**. Preservado en `backup/wave2-cost-domain` (pusheada).

### agent-pricing — entregable
- Capas de precio en `apps/web/modules/pricing/` (sin `adapters/`) y
  `apps/web/modules/suppliers/` + 8 archivos de test en
  `apps/web/tests/unit/pricing/`. Proveedores, `supplier_products`,
  `price_observations` append-only, reglas con precedencia, variación preventiva,
  descuento interno, precios/ahorros (Q8), override trazable, aprobación humana,
  `PricingReadPort`/`PricingApprovalPort`, proyección `ClientSafePrice`
  (privacidad backend-first).
- Validado por el orquestador en su worktree: **typecheck 0 · lint 0 ·
  155/155 tests** (108 previos + 47 de pricing).
- **`git commit` denegado en su entorno**; el orquestador commiteó →
  **`7897926`**. Preservado en `backup/wave2-pricing` (pusheada).

### Higiene (ambos worktrees)
- Sin archivos privados, `.env`, Excel, AGPL ni `ag-grid-enterprise`. Sin solape
  de archivos entre agentes. `adapters/` y `scripts/catalog-sync/` intactos
  (reservados a homecenter, Oleada 2B).

### Estado / próximo paso
- **NO integrado aún** a `integration/wave-2a`; **NO merge a `main`**;
  **`agent-homecenter` NO lanzado**. Backups y `feature/wave-1.5-local-rls`,
  backups de wave-1, tags: todo conservado.
- Pendientes registrados en INTEGRATION_REQUESTS: (1) reconciliar tipos del
  puerto de precios a una sola fuente; (2) confirmar base del IVA vía
  `base_type='utility'` del esquema vs flag de dominio.
- Antes de Oleada 2B: congelar `docs/PRICING_ADAPTER_CONTRACT.md`.

### Agentes activos al cierre
- Ninguno (cost-domain y pricing finalizaron).

## 2026-05-30 — Oleada 2A: integración secuencial cost-domain + pricing (orchestrator)

### Rama e integración
- Sobre `integration/wave-2a`. Cherry-picks aplicados: **`6694d88`** (cost-domain,
  desde backup `3783aca`) y **`1e8a869`** (pricing, desde backup `7897926`).
  Ambos limpios, sin conflictos. `main` intacta.

### Unificación del contrato de precios (Fase 3)
- Creada **FUENTE ÚNICA DE CÓDIGO** `apps/web/lib/contracts/pricing-read.ts`
  (refleja el contrato congelado: forma async + `PricingReadResult` union +
  `ApprovedPriceContext` completo + clases de error `ApprovedPriceNotFoundError`/
  `AmbiguousApprovedPriceError` + helper `throwOnPricingError` + `ClientSafePrice`
  + `INTERNAL_PRICE_FIELDS`).
- `apps/web/modules/apu/pricing-port.ts` ahora re-exporta el contrato (cost-domain
  consume); `apps/web/modules/pricing/types.ts` re-exporta el contrato y conserva
  sólo el `PricingApprovalPort` (write-side de pricing). **Una sola**
  `interface PricingReadPort`/`ApprovedPriceContext` (verificado por grep).
- cost-domain pasó `resolveUnitPriceSnapshot`/`calculateApuComponentWithPort` a
  **async** y convierte `!ok`→clases de error. `_fakes.ts` y `apu.test.ts`
  adaptados (async + `rejects.toBeInstanceOf`). Sin dependencias circulares
  (el contrato sólo importa `@/lib/utils/types`).
- Ajuste menor documentado: `PricingReadQuery.estimateVersionId?` (opcional) para
  congelar precio por versión (cost-domain). Reflejado en PRICING_READ_CONTRACT
  y API_CONTRACTS.

### Base del IVA (Fase 4)
- Eliminado el flag `contributesToUtilityBase`. Regla canónica (solo `base_type`
  + `sortOrder`): una regla `base_type='utility'` se aplica sobre el monto de la
  última línea `direct_cost` previa (la Utilidad). Reproduce el golden master
  (IVA = Utilidad × 0.19, gm:import diff=0). Sin cambios al seed/fixture (U sigue
  `direct_cost`). Tests añadidos: base directa, base utility, orden de cálculo,
  error si no hay `direct_cost` previa.

### Validación integral (Fase 5 — todo PASS)
- typecheck 0 · lint 0 · **229 tests** (108 base + cost-domain + pricing) · build
  Next 16.2.6 (9 rutas + Proxy) · `gm:regression` **22/22** · `gm:import` **9/9**
  (±0.01 COP, diff=0) · `validate-claude-agents` **214/0/0** · `git diff --check`
  limpio. Sin privados/`.env`/`package-lock`; sin `ag-grid-enterprise` en dominio;
  sin AGPL. Proyección `ClientSafePrice` sin campos 🔒 (privacy.test.ts).

### RLS runtime (Fase 6)
- La integración NO modificó `supabase/migrations|policies|seeds` ni
  `apps/web/lib/db/schema.ts` ⇒ **RLS runtime 21/21** de Oleada 1.5 sigue vigente
  (no se relevantó Docker). **B-004** (Realtime) sigue como deuda técnica.

### Estado / próximo paso
- Commit `chore: integrate and validate wave 2a cost domain and pricing` +
  push a `origin integration/wave-2a`. **NO merge a `main`** (a la espera de
  aprobación del usuario). **`agent-homecenter` NO lanzado.**
- Recomendación: **APROBAR merge `integration/wave-2a` → `main`**. Antes de
  Oleada 2B: congelar `docs/PRICING_ADAPTER_CONTRACT.md`.

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Merge de Oleada 2A a main (orchestrator)

### Merge
- Usuario aprobó el merge. Preflight: `main = origin/main = 974ea99` (árbol
  limpio); integración final `31c3102`; backups wave1 (3) + wave2 (2) y tags
  conservados; Excel ignorado; sin `.env`/`package-lock`; solo ag-grid-community.
- `git merge --no-ff integration/wave-2a` → **merge commit
  `f0c7d235beb7d16ce514566594df2becd869cf06`** (`f0c7d23`). **Sin conflictos.**

### Validación post-merge (todo PASA en main)
- typecheck 0 · lint 0 · **test 229** · build Next 16.2.6 (9 rutas + Proxy) ·
  `gm:regression` **22/22** · `gm:import` **9/9** (±0.01 COP, **IVA diff=0**) ·
  `validate-claude-agents` **214/0/0** · `git diff --check` limpio.
- Estructura: **1** `interface PricingReadPort` y **1** `ApprovedPriceContext`
  (en `apps/web/lib/contracts/pricing-read.ts`); sin `contributesToUtilityBase`;
  IVA por `base_type='utility'`; `ClientSafePrice` sin campos 🔒.

### RLS runtime (Paso 4)
- El merge NO modificó `supabase/migrations|policies|seeds` ni
  `apps/web/lib/db/schema.ts` (verificado `git diff 974ea99..HEAD`) ⇒ **RLS
  runtime 21/21** de Oleada 1.5 sigue vigente. No se relevantó Docker.
- **B-004** (Realtime unhealthy en Windows) sigue como deuda técnica no bloqueante.

### Privacidad
- `INTERNAL_PRICE_FIELDS` cubre público/descuento/esperado/real/ahorros/
  `sourceReference`/proveedor interno; proyección `ClientSafePrice` sin 🔒
  (privacy.test.ts). Excel ignorado y no versionado; sin `.env`/`package-lock`;
  sin `ag-grid-enterprise` en dominio; sin AGPL; sin datos privados.

### Ramas y tag
- **Conservados**: backups wave1 (db-rls/excel-mapper/frontend-boq), wave2
  (cost-domain/pricing), `integration/wave-2a`, `feature/wave-1.5-local-rls`.
- Tag anotado: **`wave-2a-domain-pricing-v1`** sobre el merge.

### Estado / próximo paso
- **Oleada 2A CERRADA y en `main`.** `agent-homecenter` NO lanzado; Oleada 2B
  NO iniciada. Antes de 2B: congelar `docs/PRICING_ADAPTER_CONTRACT.md`
  (decisiones recomendadas Q11 aprobación humana + Q14 canal Homecenter).

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Oleada 2B: microfase documental (orchestrator)

### Rama
- Creada y publicada `integration/wave-2b` desde `main` (`75394f1`). `main` intacta.

### Q11 y Q14 CERRADAS
- **Q11** (aprobación humana): MVP **simple** por usuario interno autorizado;
  auditoría obligatoria; preview antes de persistir; SKU ambiguos `pending`; sin
  tocar snapshots emitidos; `price_observations` append-only; doble aprobación =
  soporte futuro configurable. Cerrada en DECISIONS/OPEN_QUESTIONS.
- **Q14** (canal Homecenter): MVP **adaptador genérico + CSV/Excel** con preview
  y aprobación humana; SKU/URL opcionales; matching con candidatos+score;
  fallback manual; sin API pública asumida; sin scraping; interfaz sustituible.
  Cerrada en DECISIONS/OPEN_QUESTIONS.

### Contrato del adaptador CONGELADO v1
- Creado **`docs/PRICING_ADAPTER_CONTRACT.md`** (orchestrator-owned, congelado;
  cambios solo vía INTEGRATION_REQUESTS): frontera del módulo, interfaz
  `SupplierAdapter` (`parseCatalog`/`mapToSupplierProducts`/`buildPreview`/
  `toPriceObservations`), tipos `RawSupplierItem`/`SkuMatchCandidate`/
  `SkuMatchProposal`/`ImportPreview`/`ImportResult`, idempotencia, aprobación
  humana (Q11) y privacidad backend-first (Q14).
- Actualizados `API_CONTRACTS.md` (§6) y `AGENT_REGISTRY.md` (ownership 2B).

### Próximo paso
- Commit `docs: freeze wave 2b pricing adapter contract` + push a
  `origin integration/wave-2b`. Luego lanzar **únicamente** `agent-homecenter`
  en worktree aislado. NO integrar. NO merge.

### Agentes activos al cierre de esta microfase
- Ninguno (aún). A continuación se lanza agent-homecenter.

## 2026-05-30 — Oleada 2B: agent-homecenter ejecutado y preservado (orchestrator)

### Lanzamiento
- Lanzado `agent-homecenter` en worktree aislado (derivado de `main`@`75394f1`,
  por lo que NO vio `docs/PRICING_ADAPTER_CONTRACT.md`; implementó desde la spec
  de la tarea). Reconciliación contra el contrato registrada en
  INTEGRATION_REQUESTS (pendiente 2B).

### Entregable
- Adaptador genérico en `apps/web/modules/pricing/adapters/` (`types`,
  `supplier-adapter`, `import-preview`, `idempotency`, `homecenter-csv`, `index`)
  + tests en `apps/web/tests/unit/pricing-adapters/` (csv-parser, fixtures,
  homecenter-adapter; **77 tests**) + `scripts/catalog-sync/` (README,
  `convert-excel.ts` [xlsx devDep, import dinámico], `preview-import.ts`,
  `sample-catalog.csv` sanitizado). Sin cambios a `package.json`.
- `SupplierAdapter` (parseCatalog/mapToSupplierProducts/buildPreview/
  toPriceObservations); idempotencia; preview sin persistencia; matching SKU con
  candidatos+score; persistencia SOLO vía `PricingApprovalPort` tras aprobación
  humana simple (Q11); `price_observations` append-only; ambiguos `pending`;
  privacidad backend-first. **Sin scraping, sin API pública, sin red.**

### Incidencias y resolución (orchestrator)
- El agente dejó **typecheck rojo (43 errores)** (strict-null + `string|undefined`
  + export `ResourceCatalog` faltante); su corrida se truncó. Tests (runtime) y
  lint sí pasaban.
- Un reintento generó un **segundo worktree** (no se continuó el original vía
  SendMessage) que dejó adapters+tests en **typecheck 0** pero sin
  `scripts/catalog-sync/`. El orquestador **consolidó**: copió
  `scripts/catalog-sync/` + memoria del worktree original al worktree verde.
- Revalidación en el worktree consolidado: **typecheck 0 · lint 0 · 306 tests ·
  build OK**; sin privados/Excel/`.env`/scraping/red/enterprise/AGPL.
- `git commit` denegado a los subagentes ⇒ el orquestador commiteó `ccc1f0b` y
  preservó en **`backup/wave2-homecenter`** (pusheada).

### Estado / próximo paso
- **NO integrado** a `integration/wave-2b` ni a `main`. `main` intacta
  (`75394f1`). Backups y tags conservados.
- Antes de integrar 2B: reconciliar tipos del adaptador contra
  `PRICING_ADAPTER_CONTRACT` (ver INTEGRATION_REQUESTS). Otros worktrees de 2B
  pueden limpiarse (sin commits de valor).

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Integración Oleada 2B en integration/wave-2b (orchestrator)

### Integración
- Cherry-pick `1a8f6fa` (adaptador Homecenter, desde backup `ccc1f0b`). Limpio,
  sin conflictos. `main` intacta.

### Reconciliación (Fases 2-3)
- Tipos del adaptador alineados 1:1 con `PRICING_ADAPTER_CONTRACT`
  (`SupplierAdapter`, `RawSupplierItem`, `SkuMatchCandidate/Proposal`,
  `ImportPreview`, `ImportResult`); `RecordObservationInput` importado del módulo
  real `@/modules/pricing/types`.
- **`MinimalApprovalPort` = subconjunto estructural de `PricingApprovalPort`**
  (no lógica paralela). Añadido `tests/unit/pricing-adapters/port-reconciliation.test.ts`:
  aserción type-level (`(p: PricingApprovalPort) => MinimalApprovalPort`) +
  runtime con `PricingApprovalService` real (`InMemoryPricingRepository`),
  comprobando persistencia vía el puerto, append-only e idempotencia.
- `ResourceCatalog`/`ResourceRef` avalados como auxiliares de matching.

### Validación integral (Fase 5 — todo PASS)
- typecheck 0 · lint 0 · **309 tests** (incl. **80 de adapters**) · build Next
  16.2.6 · `gm:regression` **22/22** · `gm:import` **9/9** ·
  `validate-claude-agents` **214/0/0** · `git diff --check` limpio.
- Persistencia solo vía `PricingApprovalPort`; preview no persiste; ambiguos
  `pending`; snapshots emitidos intactos. **Sin scraping** (sin fetch/axios/
  puppeteer/cheerio), **sin API Homecenter inventada** (CSV/Excel local).
  Privacidad backend-first (campos 🔒 no a cliente). Sin privados/`.env`/
  `package-lock`/`ag-grid-enterprise`/AGPL.

### RLS runtime (Fase 6)
- Sin cambios en `supabase/migrations|policies|seeds` ni `apps/web/lib/db/schema.ts`
  ⇒ **RLS runtime 21/21** de Oleada 1.5 vigente. B-004 (Realtime) deuda técnica.

### Limpieza de worktrees (Fase 8)
- Eliminados worktrees temporales obsoletos de subagentes (ver lista en el commit
  de cierre). Conservados: `backup/wave2-homecenter` (`ccc1f0b`), demás backups,
  tags y ramas de integración.

### Estado / próximo paso
- Commit `chore: integrate and validate wave 2b homecenter adapter` + push a
  `origin integration/wave-2b`. **NO merge a `main`** (espera aprobación).
- Recomendación: **APROBAR merge `integration/wave-2b` → `main`**.

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Merge de Oleada 2B a main (orchestrator)

### Merge
- Usuario aprobó el merge. Preflight: `main = origin/main = 75394f1` (árbol
  limpio); integración final `1931aac`; 6 backups (wave1×3 + wave2×3) y 3 tags
  conservados; Excel ignorado; sin `.env`/`package-lock`; solo ag-grid-community.
- `git merge --no-ff integration/wave-2b` → **merge commit
  `47fcfb36b15a0a15cd700a4886cf13555d0198bd`** (`47fcfb3`). **Sin conflictos.**

### Validación post-merge (todo PASA en main)
- typecheck 0 · lint 0 · **test 309** (incl. **80 de adapters**) · build Next
  16.2.6 (9 rutas + Proxy) · `gm:regression` **22/22** · `gm:import` **9/9**
  (±0.01 COP) · `validate-claude-agents` **214/0/0** · `git diff --check` limpio.
- Adaptador: persistencia SOLO vía `PricingApprovalPort` real (verificado: los
  `adapters/` no escriben en DB); preview no persiste; ambiguos `pending`;
  idempotencia; auditoría Q11; snapshots emitidos intactos. **Sin scraping**
  (sin fetch/axios/puppeteer/cheerio/URLs); **sin API Homecenter inventada**
  (CSV/Excel local). Privacidad backend-first (campos 🔒 no a cliente).

### RLS runtime (Paso 4)
- El merge NO modificó `supabase/migrations|policies|seeds` ni
  `apps/web/lib/db/schema.ts` (verificado `git diff 75394f1..HEAD`) ⇒ **RLS
  runtime 21/21** de Oleada 1.5 sigue vigente. No se relevantó Docker.
- **B-004** (Realtime unhealthy en Windows) sigue como deuda técnica no bloqueante.

### Ramas y tag
- **Conservados**: backups wave1 (db-rls/excel-mapper/frontend-boq), wave2
  (cost-domain/pricing/homecenter), `integration/wave-2b`, ramas de integración
  previas, `feature/wave-1.5-local-rls`.
- Tag anotado: **`wave-2b-homecenter-adapter-v1`** sobre el merge.

### Estado / próximo paso
- **Oleada 2B CERRADA y en `main`.** Oleada 3 NO iniciada (solo diagnóstico de
  arquitectura propuesto). Antes de paralelizar Oleada 3: congelar los contratos
  documentales propuestos (planning, dashboard read-model, export profiles).

### Agentes activos al cierre
- Ninguno.

## 2026-05-31 — Oleada 3A: microfase documental + Recharts (orchestrator)

### Rama
- Creada y publicada `integration/wave-3a` desde `main` (`30b1053`). `main` intacta.

### Read-model CONGELADO v1
- Creado **`docs/READ_MODEL_CONTRACT.md`** (orchestrator-owned; cambios solo vía
  INTEGRATION_REQUESTS): ubicación canónica (`apps/web/server/read-model`,
  `apps/web/server/repositories`, `apps/web/lib/contracts/read-model.ts`); dos
  fuentes explícitas (`FixtureReadModelRepository`/`DrizzleReadModelRepository`)
  con selector `READ_MODEL_SOURCE=fixture|db` sin fallback silencioso;
  `ViewerRole`/`ViewerContext`; clasificación cliente-safe vs 🔒; DTOs canónicos
  (`ProjectListItem`, `ProjectOverview`, `EstimateSummary`, `ChapterSummary`,
  `BoqItemView`, `ApuSummary`, `QuantityGroupView`, `CatalogResourceView`,
  `DashboardSummary`); `ReadModelPort` (8 funciones). La UI consume DTOs; cero
  cálculo financiero en React; cost-domain/pricing solo server-side.
- Actualizados `API_CONTRACTS.md` (§7), `AGENT_REGISTRY.md` (ownership 3A:
  db-rls = server/read-model; frontend-boq = páginas presupuesto; dashboard =
  /dashboard + modules/dashboard), `DECISIONS.md`, `LICENSING.md`,
  `INTEGRATION_REQUESTS.md`.

### Dependencia
- **`recharts` ^3.8.1 (MIT)** instalado en `apps/web` (`corepack pnpm --filter
  web add recharts`). NO se instalaron frappe-gantt/exceljs/@react-pdf/renderer.

### Próximo paso
- Validar (typecheck/lint/test/build/validador) + commit documental + push a
  `origin integration/wave-3a`. Luego lanzar en paralelo agent-db-rls ∥
  agent-frontend-boq ∥ agent-dashboard. NO planning, NO exports, NO merge.

### Agentes activos al cierre de esta microfase
- Ninguno (aún).

## 2026-05-31 — Oleada 3A: subagentes ejecutados (interrumpidos) y preservados (orchestrator)

### Lanzamiento
- Lanzados en paralelo (worktrees aislados desde `main`@`30b1053`): agent-db-rls
  (read-model), agent-frontend-boq (páginas presupuesto), agent-dashboard (KPIs).
- Los tres se **interrumpieron por límite de sesión** (~54-62 acciones c/u), con
  trabajo casi completo **sin commitear** y errores triviales remanentes de
  `tsc`/build (los worktrees derivan de main, sin el contrato ni recharts; el
  contrato fue embebido en los prompts y dashboard instaló el recharts aprobado).

### Entregables preservados (verdes tras fixes mínimos del orquestador)
- **agent-db-rls** → `backup/wave3-db-read-model` (`7478ceb`): `lib/contracts/
  read-model.ts` (DTOs+port), `server/read-model/{types,errors,port,compute,
  fixture-repository,drizzle-repository,index}`, `server/repositories/`,
  selector `READ_MODEL_SOURCE` sin fallback, proyección por rol, 2 tests.
  Validado: typecheck 0, lint 0, **329 tests**, build OK. Fix: `env:Partial<ProcessEnv>`.
- **agent-dashboard** → `backup/wave3-dashboard` (`79d9fd3`): `/dashboard` +
  `modules/dashboard/*` (KPIs, Recharts barras+pie, ahorros solo rol autorizado)
  + accesor TEMP de dev. Validado: typecheck 0, lint 0, **336 tests**, build OK.
  recharts ^3.8.1. Fixes: import estático del fixture (Turbopack) + typing legend.
- **agent-frontend-boq** → `backup/wave3-frontend-boq` (`28d8bfe`): páginas
  `/projects /estimates /apu /quantities /catalog` cableadas (sin mocks) +
  `components/budget/*` + accesor TEMP. Validado: typecheck 0, lint 0, **338
  tests**, build OK. Fixes: ruta fixture + anotaciones de tipo + cast de status.

### Reconciliación pendiente (integración 3A)
- Triple `read-model.ts` → unificar a la canónica de db-rls. Rewire de accesores
  TEMP de la UI a `@/server/read-model` (`getReadModel()`). Alinear DTOs
  divergentes del frontend (`scopeNames/code/status:string`) a los canónicos.
  Registrado en INTEGRATION_REQUESTS.

### Estado / próximo paso
- **NO integrado** a `integration/wave-3a` ni a `main`. `main` intacta. Backups
  3A (3) + previos y tags conservados. Worktrees obsoletos por limpiar.
- Recomendación: ciclo de integración 3A (cherry-pick db-rls → frontend →
  dashboard, reconciliar, validar) antes de pedir merge a `main`.

### Agentes activos al cierre
- Ninguno.

## 2026-05-31 — Integración Oleada 3A: web funcional con read-model (orchestrator)

### Integración
- Cherry-picks: `9e69449` (db-rls read-model) + `8ab0d9c` (frontend) + `0bab01d`
  (dashboard). Conflicto add/add en `read-model.ts` resuelto con el canónico de
  db-rls (`--ours`). `main` intacta.

### Reconciliación (Fases 2-4)
- **Fuente única**: `apps/web/lib/contracts/read-model.ts` (db-rls); duplicados de
  frontend/dashboard eliminados. **1** `interface ReadModelPort`.
- **Accesores TEMP eliminados** (`components/budget/dev-read-model.ts`,
  `modules/dashboard/dev-read-model.ts`). Nuevo helper
  `apps/web/server/read-model/viewer.ts` (`getDemoViewer()`, demo/dev). Las 5
  páginas de presupuesto y el dashboard consumen `getReadModel()` de
  `@/server/read-model` con el viewer demo.
- **DTOs adaptados** al canónico: `ProjectListItem{scopeCount,createdAt,
  estimateCount}` (sin `code`/`scopeNames`); `EstimateSummary.versionId`/
  `status:EstimateVersionStatus` (sin `id`/`approvedAt`/`notes`);
  `QuantityGroupView{id,name,lines}` (sin `unit`/`calculationMode`).
- Test redundante del frontend eliminado; test del dashboard repointado al
  read-model canónico (precompute en `beforeAll`).

### Validación integral (Fase 5 — todo PASS)
- typecheck 0 · lint 0 · **356 tests** · build Next 16.2.6 (estáticas + dinámicas)
  · `gm:regression` **22/22** · `gm:import` **9/9** · `validate-claude-agents`
  **214/0/0** · `git diff --check` limpio.
- Privacidad: DTOs sin campos internos de pricing; ahorros del dashboard
  role-gated; cero cálculo financiero en React.

### RLS (Fase 6)
- Sin cambios en `supabase/*` ni `apps/web/lib/db/schema.ts` ⇒ **RLS runtime
  21/21** vigente. B-004 (Realtime) deuda técnica.

### Dev smoke (Fase 7)
- `READ_MODEL_SOURCE=fixture` + `pnpm --filter web dev`. **8/8 rutas HTTP 200**
  con datos reales del golden master (`/dashboard` "Total presupuesto $372.247…"
  + Recharts; `/estimates` "Entre Patios" + AIU/IVA). Sin 500. Servidor detenido
  tras el smoke (incl. limpieza de un dev server obsoleto previo en :3000).

### Estado / próximo paso
- Commit `chore: integrate and validate wave 3a functional read model ui` +
  push a `origin integration/wave-3a`. **NO merge a `main`** (espera aprobación).
- Recomendación: **APROBAR merge `integration/wave-3a` → `main`**.

### Agentes activos al cierre
- Ninguno.

## 2026-05-31 — Merge de Oleada 3A a main (orchestrator)

### Merge
- Usuario aprobó el merge. Preflight: `main = origin/main = 30b1053` (árbol
  limpio); integración final `971b3ad`; 9 backups y 4 tags conservados; Excel
  ignorado; sin `.env`/`package-lock`; solo ag-grid-community.
- `git merge --no-ff integration/wave-3a` → **merge commit
  `d1f0920d0423f981fa5d285d493120fc44873849`** (`d1f0920`). **Sin conflictos.**

### Validación post-merge (todo PASA en main)
- typecheck 0 · lint 0 · **test 356** · build Next 16.2.6 (estáticas + dinámicas)
  · `gm:regression` **22/22** · `gm:import` **9/9** (±0.01 COP) ·
  `validate-claude-agents` **214/0/0** · `git diff --check` limpio.
- Estructura: **1** `interface ReadModelPort` y **1** `getReadModel()` (en
  `apps/web/server/read-model/index.ts`); fuente única
  `apps/web/lib/contracts/read-model.ts`; selector `READ_MODEL_SOURCE=fixture|db`;
  **sin** `dev-read-model.ts`; **sin** imports activos de `@/lib/utils/mocks` en
  rutas cableadas. Dashboard + páginas cableadas; Recharts.

### RLS (Paso 4)
- El merge NO modificó `supabase/migrations|policies|seeds` ni
  `apps/web/lib/db/schema.ts` (verificado `git diff 30b1053..HEAD`) ⇒ **RLS
  runtime 21/21** de Oleada 1.5 vigente. **B-004** (Realtime) deuda técnica.

### Privacidad
- DTOs cliente-safe sin campos internos de pricing; ahorros del dashboard
  role-gated (omitidos para `client`). **Cero cálculo financiero en React**
  (dinero `DecimalString`). `getDemoViewer()` es **solo demo/dev**: en modo `db`
  el viewer vendrá de la **sesión/auth real** (prerrequisito futuro) y RLS es la
  barrera real.

### Ramas y tag
- **Conservados**: 9 backups (wave1×3, wave2×3, wave3×3), `integration/wave-3a`,
  ramas de integración previas, `feature/wave-1.5-local-rls`.
- Tag anotado: **`wave-3a-functional-read-model-ui-v1`** sobre el merge.

### Estado / próximo paso
- **Oleada 3A CERRADA y en `main`.** Web local funcional con datos reales del
  fixture. Oleada 3B/3C NO iniciadas. Antes de 3B: congelar
  `docs/PLANNING_CONTRACT.md` + esquema de planning (db-rls) e instalar
  `frappe-gantt`.

### Agentes activos al cierre
- Ninguno.

## 2026-05-31 — Oleada 3B: microfase documental + frappe-gantt (orchestrator)

### Rama
- Creada y publicada `integration/wave-3b` desde `main` (`352825f`). `main` intacta.

### PLANNING_CONTRACT CONGELADO v1
- Creado **`docs/PLANNING_CONTRACT.md`** (orchestrator-owned; cambios solo vía
  INTEGRATION_REQUESTS): entidades PostgreSQL (`schedule_tasks`,
  `task_dependencies`, `progress_entries` append-only, `resource_assignments`)
  con RLS; dominio puro `apps/web/modules/planning/` (CPM/ruta crítica/holguras/
  ciclos, `DecimalString`); extensión del read-model (`ScheduleTaskView`,
  `DependencyView`, `MilestoneView`, `ProgressEntryView`, `ResourceAssignmentView`,
  `ScheduleSummary`, `CriticalPathSummary`; `ReadModelPort.getSchedule/
  listProgressEntries/listResourceAssignments`); privacidad por rol
  (holguras/ruta crítica/avance financiero/`external_reference`/responsables 🔒);
  campos reservados para export MS Project (no en 3B).
- Actualizados: `DATABASE_SCHEMA.md` (entidades planning), `API_CONTRACTS.md` (§8),
  `READ_MODEL_CONTRACT.md` (§8 extensión), `AGENT_REGISTRY.md` (ownership 3B),
  `DECISIONS.md`, `LICENSING.md`, `INTEGRATION_REQUESTS.md`.

### Dependencia
- **`frappe-gantt` ^1.2.2 (MIT, sin peers)** instalado en `apps/web`. Import
  dinámico client-side (DOM/SVG). NO se instalaron exceljs/@react-pdf/renderer.

### Próximo paso
- Validar + commit documental + push a `origin integration/wave-3b`. Luego lanzar
  en paralelo agent-db-rls (esquema/RLS/read-model planning) ∥ agent-planning
  (dominio/Gantt). NO exports, NO merge.

### Agentes activos al cierre de esta microfase
- Ninguno (aún).

## 2026-05-31 — Oleada 3B: subagentes interrumpidos (WIP preservado) (orchestrator)

### Lanzamiento
- Lanzados en paralelo (worktrees desde `main`@`352825f`): agent-db-rls
  (esquema/RLS/read-model planning) ∥ agent-planning (dominio/Gantt).
- **Ambos interrumpidos por límite de sesión** (~49-54 acciones), con trabajo
  **materialmente incompleto** y sin commitear.

### Estado de los entregables (PARCIAL)
- **agent-db-rls** → `backup/wave3b-db-planning` (`89bfab7`, **WIP typecheck rojo**):
  migración `20260531100000_planning_schedule.sql` (4 tablas) +
  `20260531100100_rls_policies_planning.sql`, `schema.ts` (Drizzle planning),
  `read-model.ts` (DTOs/métodos), `server/read-model/{types,compute-planning}.ts`,
  datos de cronograma en el fixture. **PENDIENTE**: implementar
  `getSchedule/listProgressEntries/listResourceAssignments` en
  `FixtureReadModelRepository` y `DrizzleReadModelRepository` (4 errores
  "incorrectly implements ReadModelPort"); seed de planning; RLS runtime 21/21 +
  pruebas de planning.
- **agent-planning** → `backup/wave3b-planning-ui` (`6f4dab9`, **typecheck verde,
  incompleto**): `modules/planning/{cpm,graph,date,decimal,types}.ts` (dominio
  puro CPM/holguras/ciclos). frappe-gantt instalado. **PENDIENTE**: página
  `/planning`, componente Gantt, accesor dev de cronograma, tests de dominio.

### Higiene (ambos)
- Sin privados/Excel/`.env`. Sin solape de archivos entre agentes.

### Estado / próximo paso
- **NO integrado** a `integration/wave-3b` ni a `main`. `main` intacta
  (`352825f`). Backups (11) y tags conservados. Worktrees por limpiar.
- **Acción requerida**: reanudar ambos agentes (sesión reseteada ~15:50) para
  completar los puntos pendientes; luego ciclo de integración 3B. Registrado en
  INTEGRATION_REQUESTS.

### Agentes activos al cierre
- Ninguno (ambos finalizaron por límite, incompletos).

## 2026-05-31 — Oleada 3B: continuación db-rls COMPLETADA (orchestrator)

### Estrategia
- Continuación **secuencial** (no paralela) para reducir consumo. Rama
  `continuation/wave3b-db-planning` desde `backup/wave3b-db-planning` (`89bfab7`).
- `agent-db-rls` recuperó el WIP con `git merge --ff-only 89bfab7` (los worktrees
  parten de `main`; `89bfab7` desciende de `main` ⇒ ff sin redo) y completó.

### Completado (db-rls)
- `getSchedule/listProgressEntries/listResourceAssignments` en
  `FixtureReadModelRepository` y `DrizzleReadModelRepository` (proyección por rol:
  `client` sin holguras/ruta crítica/`financialProgressPct`/`external_reference`/
  `createdBy`/notas).
- `supabase/seeds/0003_demo_planning.sql` (cronograma demo sanitizado) +
  `config.toml`. Tests `planning-fixture.test.ts` + `planning-drizzle.test.ts`.
- Harness `scripts/rls-runtime/run.ts`: +11 pruebas de planning.

### Validación
- typecheck 0 · lint 0 · **378 tests** · build OK · gm:regression 22/22 ·
  gm:import 9/9.
- **RLS runtime real (Docker local): 32/32 PASS** (21 previos + **11 planning**:
  aislamiento A/B en las 4 tablas, sin-org, `progress_entries` append-only,
  WITH CHECK cross-org en tareas/dependencias; **24 tablas con RLS FORCE**).
  `db reset` aplicó 13 migraciones + 3 seeds sin errores. Sin remoto.

### Preservación
- `backup/wave3b-db-planning-complete` (`560b2cc`, pusheada);
  `continuation/wave3b-db-planning` adelantada a `560b2cc`. WIP original
  `89bfab7` y `main` intactos. 12 backups.

### Estado / próximo paso
- **db-rls 3B COMPLETO y validado.** Falta `agent-planning` (UI/Gantt): reanudar
  secuencialmente desde `backup/wave3b-planning-ui` (`6f4dab9`). Luego integración
  3B. NO integrado; NO merge.

### Agentes activos al cierre
- Ninguno.

## 2026-06-01 — Oleada 3B: continuación planning-ui COMPLETADA (orchestrator)

### Estrategia
- Continuación **secuencial**. Rama `continuation/wave3b-planning-ui` = WIP
  planning (`6f4dab9`) **combinado con el read-model db completo (`560b2cc`)**
  (sin overlap de archivos) → `2793bbf`, para cablear la UI al `getSchedule()`
  real sin accesor TEMP. `agent-planning` recuperó la base con
  `git merge --ff-only 2793bbf`.

### Completado
- **agent-planning**: dominio (`modules/planning/{gantt-mapping,view-model,index}`)
  + componentes (`GanttChart` frappe-gantt dinámico, `ScheduleTable`,
  `PlanningSummary`, `ScheduleStatusBadge`).
- **orchestrator (completar interrumpido)**: página
  `apps/web/app/(dashboard)/planning/page.tsx` cableada a
  `getReadModel().getSchedule(getDemoViewer(), projectId)`; tests
  `tests/unit/planning/planning-domain.test.ts` (CPM/ciclo/holgura/hito/
  dependencias FS-SS-FF-SF/privacidad por rol); enlace nav `/planning` en el
  layout; reconciliación `view-model` → `ScheduleSummary` canónico de
  `@/lib/contracts/read-model`; CSS de frappe-gantt **vendorizado** (su `exports`
  v1.2.2 no expone `dist/*.css`); `ganttRef any→unknown`.

### Validación
- typecheck 0 · lint 0 · **389 tests** · build Next 16.2.6 (ruta `/planning`) ·
  gm:regression 22/22 · gm:import 9/9.
- **Dev smoke `/planning` HTTP 200** (74 KB) con "Cronograma de obra", "Diagrama
  de Gantt", tareas, hitos, avance reales del fixture sanitizado; sin 500; rutas
  previas siguen 200. Servidor detenido tras el smoke.
- Privacidad: ruta crítica/holguras solo rol autorizado (no `client`); cero
  cálculo monetario/CPM en React (CPM en `modules/planning`).

### Preservación
- `backup/wave3b-planning-ui-complete` (`41abbe2`, pusheada); continuation
  adelantada a `41abbe2`. WIP originales (`6f4dab9`, `89bfab7`) y `db-complete`
  (`560b2cc`) intactos. `main` intacta. 13 backups.

### Estado / próximo paso
- **3B COMPLETO** (db `560b2cc` + ui `41abbe2`), combinado y validado end-to-end
  en `continuation/wave3b-planning-ui` (`41abbe2`). Listo para el **ciclo de
  integración 3B** hacia `integration/wave-3b` (incluye RLS runtime 32/32 ya
  validado por db). NO integrado; NO merge.

### Agentes activos al cierre
- Ninguno.

## 2026-06-01 — Integración formal Oleada 3B en integration/wave-3b (orchestrator)

### Merge
- `git merge --no-ff continuation/wave3b-planning-ui` (= db `560b2cc` + ui
  `41abbe2` combinados) → **merge commit `595e5a5`**. **Sin conflictos.** Los
  docs de 3b (PLANNING_CONTRACT, etc.) se conservaron (la continuation parte de
  main y no los borra).

### Reconciliación
- Read-model canónico único `apps/web/lib/contracts/read-model.ts`; `/planning`
  consume `getReadModel().getSchedule(getDemoViewer(), projectId)` real (0
  accesores TEMP). CPM/ruta crítica/holguras **solo en `modules/planning`**
  (verificado: 0 en `app/`+`components/`). frappe-gantt dinámico client-side +
  CSS vendorizado; nav `/planning`. Las dos `ScheduleSummary` (dominio vs
  read-model) son capas distintas por contrato; la UI consume la canónica.

### Validación (todo PASS)
- typecheck 0 · lint 0 · **389 tests** · build Next 16.2.6 (rutas `/planning` +
  previas) · `gm:regression` 22/22 · `gm:import` 9/9 · `validate-claude-agents`
  214/0/0 · `git diff --check` limpio.
- **RLS runtime real 32/32** (Docker local): `db reset` aplicó **13 migraciones +
  3 seeds**; **24 tablas con RLS FORCE**; 21 previos + 11 planning. Sin remoto.
- **Dev smoke 9/9 rutas HTTP 200** (incl. `/planning` con Cronograma + Gantt +
  tareas/hitos/avance reales). Servidor detenido tras el smoke.
- Privacidad backend-first (holguras/ruta crítica/financiero/`external_reference`/
  responsables role-gated); cero cálculo monetario/CPM en React; MS Project
  reservado (sin export en 3B). B-004 (Realtime) deuda técnica no bloqueante.

### Estado / próximo paso
- Commit doc `chore: integrate and validate wave 3b planning gantt` + push a
  `origin integration/wave-3b`. **NO merge a `main`** (espera aprobación).
- Recomendación: **APROBAR merge `integration/wave-3b` → `main`**.

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-01 — Merge de Oleada 3B a `main` (aprobado) + tag estable

### Estado
- **Merge aprobado por el usuario.** `git merge --no-ff integration/wave-3b`
  sobre `main` (base `352825f`) → merge commit **`40118a5`**, **sin conflictos**
  (44 archivos, +5221/-11). Squash/rebase/force-push NO usados.
- Tag anotado **`wave-3b-planning-gantt-v1`** sobre el HEAD documental.

### Validación post-merge (todo PASS)
- typecheck 0 · lint 0 · **389 tests** (27 archivos) · build Next 16.2.6
  (rutas incl. `/planning`) · `gm:regression` 22/22 · `gm:import` 9/9 (±0.01 COP)
  · `validate-claude-agents` 214/0/0 · `git diff --check` limpio.
- **RLS runtime real 32/32** (Docker local): `db reset` aplicó **13 migraciones +
  3 seeds**; **24 tablas con RLS FORCE** (aislamiento A/B, sin-org, cross-org
  WITH CHECK, `progress_entries` append-only). Supabase detenido. Sin remoto.
- **Dev smoke 9/9 rutas HTTP 200** (`READ_MODEL_SOURCE=fixture`): `/`, `/login`,
  `/projects`, `/estimates`, `/apu`, `/quantities`, `/catalog`, `/dashboard`,
  `/planning`. `/planning` renderiza "Cronograma de obra", resumen, **Tareas**,
  **Hitos**, **Diagrama de Gantt** (frappe-gantt); rol `management` ve columnas
  **Holgura** + **Crítica**; sin fugas (`external_reference`/descuento/margen=0);
  sin 500. Servidor detenido tras el smoke.

### Reconciliación / deuda registrada
- Read-model **canónico único** en `apps/web/lib/contracts/read-model.ts`
  (`ReadModelPort` + `ScheduleSummary` + DTOs); `/planning` consume
  `getReadModel().getSchedule(getDemoViewer(), projectId)` (0 accesores TEMP de
  planning). CPM/ruta crítica/holguras **solo en `modules/planning`** (0 en
  `app/`+`components/`). frappe-gantt dinámico client-side + CSS vendorizado; nav
  `/planning`.
- **B-005 (deuda no bloqueante)**: el módulo de dominio `modules/planning/types.ts`
  conserva un **espejo interno** de los DTOs de read-model (`ScheduleTaskView`,
  `DependencyView`, `MilestoneView`, `CriticalPathSummary`) consumido por
  `view-model.ts`/`gantt-mapping.ts`. Es estructuralmente compatible; el único
  campo divergente (`financialProgressPct` en la `ScheduleTaskView` del dominio)
  está **sin uso** (código muerto). El read-model canónico (puerto + DTOs que la
  página/repositorios consumen) es fuente única. Plegar el espejo al contrato se
  difiere a limpieza de 3C (colisión de nombre `ScheduleSummary` dominio vs
  read-model exige aliasing; no se refactoriza sobre un merge ya validado).

### Estado / próximo paso
- `git push origin main` + `git push origin wave-3b-planning-gantt-v1`.
- **Oleada 3B CERRADA.** `integration/wave-3b` conservada temporalmente; backups
  y continuations conservados. Próximo: **Oleada 3C (exports)** — propuesta
  documental entregada; NO lanzada (sin agentes, sin rama, sin deps).
- `getDemoViewer()` solo demo/dev; auth real/sesión = prerrequisito del modo `db`.
  B-004 (Realtime en Windows) deuda técnica no bloqueante.

---

## 2026-06-01 — Oleada 3C (exports): apertura + B-005 resuelto (Fases 0–1)

### Estado
- **Oleada 3C aprobada (secuencial).** Rama `integration/wave-3c` creada desde
  `main` (`82f9e86`) y publicada (`-u origin`). `main` intacta.
- **B-005 RESUELTO** (Fase 1): `apps/web/modules/planning/types.ts` ahora
  re-exporta los DTOs/enums de planning (`ScheduleTaskView`, `DependencyView`,
  `MilestoneView`, `ProgressEntryView`, `ResourceAssignmentView`,
  `CriticalPathSummary`, `ScheduleTaskStatus`, `DependencyType`) desde la fuente
  única `apps/web/lib/contracts/read-model.ts` y conserva solo tipos de dominio
  puro. Eliminados el campo muerto `financialProgressPct` y `ScheduleSummaryView`
  sin uso. Superficie pública de `@/modules/planning` estable (re-exports vía
  `index`). Sin tocar CPM/holguras/proyección/DB/migraciones/seeds/RLS.
- Validación post-refactor (PASS): typecheck/lint 0, **389 tests**, build
  (`/planning`), gm 22/22 + 9/9, `git diff --check` limpio. 1 archivo
  (`types.ts`, 252→176 líneas). Commit `refactor(planning): fold duplicated DTO
  mirrors into canonical read model`.

### Próximo paso (esta sesión)
- Fase 2: congelar `docs/EXPORT_PROFILES_CONTRACT.md` (v1) + actualizar contratos.
- Fase 3: solicitar/instalar `exceljs` + `@react-pdf/renderer` (licencias).
- Fase 4: ownership `agent-exports` en AGENT_REGISTRY.
- Fase 5: commit documental + push.
- Fase 6: lanzar **solo** `agent-exports` (worktree aislado). Fase 7: preservar
  en `backup/wave3c-exports`. **NO** integrar ni merge a `main`.

### Agentes activos al cierre
- Ninguno (aún no se lanza `agent-exports`).

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-01 — Cierre Oleada 3C: reconciliación (Caso B) y merge a `main`

> Nota: esta entrada vive en `integration/wave-3c-main-reconciled` → `main`. El
> detalle de la implementación y la integración previa quedó en
> `integration/wave-3c` (`7124f0f`, conservada). Aquí se documenta el cierre.

### Divergencia y estrategia
- El PR de GitHub "Integration/wave 3c (#1)" se fusionó como **SQUASH** ⇒
  `origin/main = b09158f` (padre único `82f9e86`); `2621d3b` **no** quedó como
  ancestro. `origin/main` ya contenía **materialmente** B-005 +
  `EXPORT_PROFILES_CONTRACT` + deps (idénticos), faltando solo el **código de
  exports**. `git diff origin/main..integration/wave-3c` = 15 archivos exports
  (A) + 4 docs (M): delta aditivo y acotado.
- **Caso B aplicado**: rama `integration/wave-3c-main-reconciled` desde
  `origin/main` + `git merge --no-ff backup/wave3c-exports` → **solo 15 archivos
  de exports** (+2200), **sin conflictos** y **sin duplicar** B-005/contrato/deps
  (git auto-resolvió el contenido idéntico). Sin force-push / rebase / reset.
- Verificado: `diff origin/main..reconciled` = solo exports; `types.ts` 176
  líneas (B-005 una vez); deps una vez; contrato presente.

### Validación post-reconciliación (PASS)
- typecheck/lint 0 · **410 tests** · build (`/api/exports`) · gm 22/22 ·
  gm:import 9/9 · validador 214/0/0 · diff/status limpios · Excel ignorado.
- **RLS runtime**: sin cambios en `supabase/`/`schema.ts` ⇒ **32/32 (3B) vigente**
  (no se levantó Docker).
- **Smoke 6/6 HTTP 200** (proyecto `…010`): content-type/disposition/bytes ok;
  PDF `%PDF`, XLSX `PK`, CSV; cliente sin `external_reference`, internal con
  columna. Negativos (mismatch/sin projectId/`mpp`) → **400**. Servidor detenido.

### Cierre
- Merge `--no-ff` de `integration/wave-3c-main-reconciled` → `main`; push `main`;
  tag **`wave-3c-exports-v1`**. **Oleada 3C CERRADA.**
- Conservados: `integration/wave-3c` (`7124f0f`),
  `integration/wave-3c-main-reconciled`, `backup/wave3c-exports`, y todos los
  backups/continuations/tags.

### Deudas no bloqueantes
- Auth real/sesión pendiente (prerrequisito modo `db`); `getDemoViewer` solo demo.
- `external_reference` vacío en CSV hasta extensión contractual del DTO.
- **B-004** (Realtime Windows) deuda técnica.
- **Botones UI de descarga** aún no existen (solo endpoint `/api/exports`).

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-01 — Oleada 4A.1 (auth/RLS local): apertura + contrato + deps (Fases 0–5)

### Estado
- **Oleada 4A.1 aprobada (secuencial).** Rama `integration/wave-4a-auth-local`
  desde `main` (`a6981f0`), publicada. `main` intacta.
- **Auditoría (Fase 1)**: `profiles` (id=auth.users.id, `organization_id` NOT
  NULL = membresía single-org, `role` admin/gerencia/presupuestos/obra/compras/
  consulta) y `organizations` ya existen. `app.current_org()`/`current_role()`
  leen claims JWT custom (`organization_id`/`user_role`); **0** políticas usan
  `auth.uid()`. `proxy.ts` = stub pass-through. Todo es **demo** (sin protección
  real). Conclusión: **reutilizar `profiles`** (no duplicar), añadir resolución
  por `auth.uid()`→`profiles` con compat demo.
- **AUTH_CONTRACT v1 congelado** (`docs/AUTH_CONTRACT.md`): modos
  `APP_AUTH_MODE`×`READ_MODEL_SOURCE` sin fallback; `AuthenticatedViewer`
  server-side; mapeo `profiles.role`→`ViewerRole`; matriz ruta×rol;
  deny-by-default. Punteros en API_CONTRACTS/DATABASE_SCHEMA/READ_MODEL_CONTRACT;
  ownership 4A.1 de `agent-db-rls` en AGENT_REGISTRY; placeholders en
  `.env.example` (`APP_AUTH_MODE`, `NEXT_PUBLIC_SUPABASE_*`; **sin** valores
  reales; `service_role` no en frontend).
- **Deps instaladas**: `@supabase/supabase-js` **2.106.2** (MIT) +
  `@supabase/ssr` **0.10.3** (MIT); peer cumplida; sin AGPL/enterprise.

### Próximo paso (esta sesión)
- Fase 5: validar base documental + commit doc + push.
- Fase 6: lanzar **solo** `agent-db-rls` (worktree aislado). Fase 7: RLS runtime
  local (previo 32/32 + nuevos tests auth). Fase 9: preservar en
  `backup/wave4a-auth-db-local`. **NO** integrar ni merge a `main`. **NO** UI/
  proxy/remoto.

### Agentes activos al cierre
- Ninguno (aún no se lanza `agent-db-rls`).

---

## 2026-06-01 — Oleada 4A.1: agent-db-rls completado y preservado (Fases 6–9)

### Estado
- **`agent-db-rls` lanzado** en worktree aislado (desde `f637d67`). Se
  interrumpió por límite de sesión tras implementar migración + seed + tests
  auth, **sin commitear**. **Continuación por el orquestador**: recuperado el WIP
  del worktree, validado a verde.
- **Preservado en `backup/wave4a-auth-db-local` (`58de9c3`, pusheado)**.
  Parent = `f637d67`. **NO integrado** a `integration/wave-4a-auth-local` ni
  `main`.

### Entregable (4 archivos, +401)
- `supabase/migrations/20260601090000_auth_identity_helpers.sql`: helpers
  `app.current_org()`/`current_role()`/`current_org_user()` que resuelven
  identidad real (`auth.uid()`→`profiles`) con **COALESCE** a claims demo
  (compat). `_jwt_claims()` neutraliza claims ausentes/malformados;
  `_auth_uid()` prefiere `auth.uid()` y cae a `sub`; `_profile_org/_role`
  **SECURITY DEFINER** (evita recursión RLS, solo la fila propia). **Deny-by-
  default** (NULL ⇒ sin filas). GRANT EXECUTE a `authenticated`.
- `supabase/seeds/0004_auth_org_b_and_no_membership.sql`: org B + roles
  variados (cubre los 4 ViewerRole) + **usuario sin membresía**; sanitizado,
  idempotente, patrón `auth.users` condicional.
- `scripts/rls-runtime/run.ts` (+15 tests auth) y `supabase/config.toml`
  (registro seed 0004).
- **Reutiliza `profiles` single-org** — sin tablas nuevas (regla de no-duplicación).

### Validación (PASS)
- **RLS runtime 47/47** (Docker local): 14 migraciones + 4 seeds; **32 previos**
  (compat) + **15 auth**: `current_org/role` desde profiles sin claim;
  aislamiento real A/B; sin sesión→`NULL`→deny; sin membresía→`NULL`→deny;
  cross-org INSERT/UPDATE bloqueado; rol admin puede INSERT profile, rol obra no
  (WITH CHECK); prioridad del claim demo. Supabase detenido. Sin remoto.
- typecheck/lint 0 · **410 tests** (incl. regresión RLS estática) · build OK ·
  gm 22/22 · gm:import 9/9 · validador 214/0 · diff/status limpios · **sin
  secretos/.env/privados**.

### Próximo paso
- A la espera de aprobación para **integrar `backup/wave4a-auth-db-local` →
  `integration/wave-4a-auth-local`** (merge + revalidación) y luego diagnóstico
  de **4A.2** (browser/server client, sesión SSR, `proxy.ts`, viewer real,
  login/logout/reset). **NO** integrado aún.

### Agentes activos al cierre
- Ninguno (`agent-db-rls` finalizó; entregable preservado, no integrado).

---

## 2026-06-01 — Integración formal Oleada 4A.1 (auth/RLS DB) en integration/wave-4a-auth-local

### Estado
- **Integración aprobada.** `git merge --no-ff backup/wave4a-auth-db-local`
  (`58de9c3`) sobre `integration/wave-4a-auth-local` (`8adfbca`) → merge
  **`adeafbe`**, **sin conflictos** (4 archivos, +401). `main` intacta
  (`a6981f0`). Remoto no conectado.

### Auditoría de la implementación integrada
- **14 migraciones, 4 seeds**. La migración `20260601090000_auth_identity_helpers.sql`
  tiene **0 `CREATE TABLE`** ⇒ **reutiliza `profiles`/`organizations`** (single-org
  v1, sin tablas nuevas de usuarios/membresía/org/roles).
- Helpers canónicos: `_jwt_claims`, `_auth_uid`, `_profile_org`, `_profile_role`,
  `current_org`, `current_role`, `current_org_user`. Regla de identidad:
  **prefiere `auth.uid()`**, fallback controlado a claim `sub` (compat
  demo/Postgres puro), **NULL → deny-by-default**. Org/rol desde
  `profiles.organization_id`/`profiles.role` por `auth.uid()`; nunca org del
  navegador. `SECURITY DEFINER` + `search_path` fijo solo en `_profile_org/_role`
  (evita recursión RLS, lee solo la fila propia). `GRANT EXECUTE` mínimos.

### Validación (PASS)
- **RLS runtime 47/47** (Docker local): 14 migraciones + 4 seeds; **32 previos**
  (compat) + **15 auth** (aislamiento real A/B, sin sesión→deny, sin
  membresía→deny, cross-org INSERT/UPDATE bloqueado, rol admin vs obra, prioridad
  claim demo). Supabase detenido. Sin remoto.
- typecheck/lint 0 · **410 tests** · build OK · gm 22/22 · gm:import 9/9 ·
  validador 214/0 · diff/status limpios · **sin secretos/.env/privados**.

### Pendiente (4A.2)
- Clientes browser/server Supabase, sesión SSR por cookies, refresh en
  `proxy.ts`, viewer real (sustituir `getDemoViewer` en modo `supabase`),
  protección de rutas, UI login/logout/forgot/reset/callback. `READ_MODEL_SOURCE`
  permanece `fixture`. B-004 (Realtime Windows) deuda técnica.

### Estado / próximo paso
- Commit doc `docs: record wave 4a1 auth db rls integration validation` + push
  `origin integration/wave-4a-auth-local`. **NO** merge a `main`.

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-01 — Oleada 4A.2 (runtime SSR): contrato + implementación (Fases 0–4)

### Estado
- Rama `integration/wave-4a-auth-runtime` desde 4A.1 (`7c2f729`), publicada.
  `main` intacta (`a6981f0`).
- **AUTH_RUNTIME_CONTRACT v1 congelado** (`docs/AUTH_RUNTIME_CONTRACT.md`).
  Role-map fuente única en `server/auth/role-map.ts` (**admin→internal**;
  refina AUTH_CONTRACT). Punteros en API_CONTRACTS/READ_MODEL_CONTRACT; ownership
  4A.2 en AGENT_REGISTRY.
- **Runtime SSR implementado por el orquestador** (antes de la UI):
  `lib/supabase/{env,client,server,proxy}.ts` (`@supabase/ssr`, cookies
  `getAll`/`setAll`); `server/auth/{types,errors,role-map,session,resolve-viewer,
  routes,index}.ts`; `apps/web/proxy.ts` (Next 16: refresh + `getClaims()` guard,
  **no** `getSession()`; demo passthrough; redirecciones seguras; anti
  open-redirect); `app/page.tsx` (→`/dashboard`); guard de `/api/exports` (modo
  supabase: viewer autenticado + anti-escalamiento de perfil ≤ ViewerRole).

### Validación (PASS)
- typecheck/lint 0 · **423 tests** (410 + **13 auth**) · build OK (`/api/exports`
  + Proxy) · gm 22/22 · gm:import 9/9 · validador 214/0 · diff limpio · sin secretos.

### Próximo paso (esta sesión)
- Fase 4: commit `feat(auth): ...` + push. Fase 5: lanzar **solo**
  `agent-frontend-boq` (UI `(auth)/`). Fase 7: preservar en `backup/wave4a-auth-ui`.
  **NO** integrar UI; **NO** merge a `main`; **NO** remoto/Vercel.

### Agentes activos al cierre
- Ninguno (aún no se lanza `agent-frontend-boq`).

---

## 2026-06-02 — Oleada 4A.2: recuperación tras apagado + preservación UI

### Estado
- Auditoría de recuperación tras apagado inesperado. **Escenario D**:
  `agent-frontend-boq` ya había sido lanzado (worktree
  `.claude/worktrees/agent-acc61fa6aec4fac2d`, base `0149655`) y dejó el
  entregable de UI auth **completo pero sin commitear** (WIP del worktree).
- Runtime SSR 4A.2 (`19246a5`) confirmado **íntegro** en
  `integration/wave-4a-auth-runtime` (local = `origin`). `main` intacta
  (`a6981f0`). Sin stash, sin conflictos.
- **UI recuperada y preservada** (no se relanzó el agente):
  `(auth)/login` (mock→supabase real), `(auth)/forgot-password`,
  `(auth)/reset-password`, `(auth)/logout`, `(auth)/auth/callback` (PKCE +
  anti open-redirect vía `sanitizeNext`), `components/auth/*`
  (AuthCard, FormError, FormSuccess, helpers) y tests `tests/unit/auth-ui/*`.

### Validación del entregado recuperado (PASS)
- typecheck 0 · lint 0 · **452 tests PASS** (423 previos + 29 auth-ui).
- **Build de producción**: 1er intento FALLÓ (`/login` usaba `useSearchParams()`
  sin Suspense — CSR bailout Next 16). Aplicado fix mínimo (extraer `LoginForm`
  + `<Suspense>`). 2º intento **build OK** (16/16 rutas; Proxy presente;
  `READ_MODEL_SOURCE=fixture`).
- Sin secretos, sin `.env.local` trackeado, sin privados/Excel real.

### Acciones
- Commit UI en rama del worktree: `90f571c`
  `feat(frontend-boq): wave 4a.2 auth UI (login/forgot/reset/logout/callback)`.
- Fix de build: `c9063ad`
  `fix(frontend-boq): wrap login useSearchParams in Suspense (Next 16 build)`.
- Preservado en `backup/wave4a-auth-ui` (`c9063ad`), publicado a `origin`.
- **NO** se integró la UI al runtime. **NO** merge a `main`. **NO** remoto
  Supabase. **NO** Vercel (`READ_MODEL_SOURCE=fixture` sin cambios).

### Próximo paso
- Integrar `backup/wave4a-auth-ui` → `integration/wave-4a-auth-runtime` (checklist
  de merge: typecheck/lint/test/build/gm/validador) en sesión dedicada. Luego
  evaluar reconciliación 4A → `main`. No iniciar Oleada 4B.

### Agentes activos al cierre
- Ninguno.
