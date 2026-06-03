# QA Report — Construction Ops

Este documento es propiedad de **agent-qa**. Se actualiza al final de
cada ciclo de validación.

> Validación de **integración de Oleada 1** realizada por el orquestador en
> `integration/wave-1` (pre-merge). La validación QA integral formal es de
> Oleada 4 (`agent-qa`).

---

## Oleada 4A.3c — fix login online (merge a `main`) (2026-06-02)

> Merge `--no-ff` de `fix/wave4a3-online-login` (`834029c`) a `main` → merge `ad8f32b`,
> **sin conflictos** (8 archivos, +272/-12).

- **Causa raíz**: el cliente de navegador resolvía `NEXT_PUBLIC_*` de forma **indirecta**
  (`env.X` con `env = process.env`); Next/Turbopack solo inyecta en el bundle las
  referencias **literales** `process.env.NEXT_PUBLIC_*`, así que en el navegador quedaban
  `undefined` y `getPublicSupabaseEnv()` lanzaba **antes** de `signInWithPassword()`
  (error genérico, sin request a `/auth/v1/token`, sin log de Auth).
- **Fix**: `client.ts` pasa referencias literales inyectables; submit extraído a
  `server/auth/login-flow.ts` (`runPasswordLogin`, puro: 1 sola llamada a Supabase,
  error legible, redirección `next` sanitizada anti open-redirect). Diseño/copy intactos.
- **Post-merge `main` (`ad8f32b`)** ✅: typecheck 0, lint 0, **461 tests** (33 archivos),
  build (rutas auth + Proxy + `/api/exports`), gm:regression **22/22**, gm:import PASS,
  validate-agents **214/0/0**, `git diff --check` limpio.
- **DB remota intacta** (14/14 migraciones; sin push/pull/repair/SQL/seeds/usuarios);
  **Vercel intacto** (`APP_AUTH_MODE=demo` + `READ_MODEL_SOURCE=fixture`).
- **Activación online pendiente** (paso manual de la usuaria). Rollback = `demo`+`fixture`.
  Tag `wave-4a3-online-login-fix-v1`. **4B NO iniciada.**

---

## Oleada 4A.3b — bootstrap real del esquema remoto (2026-06-02)

> Merge de paridad PG17 a `main` (`139dd52`) + `supabase db push --linked` (una vez,
> sin seeds) sobre `construction-ops-prod`.

- **Post-merge `main`** ✅: `config.toml` `major_version = 17`; typecheck/lint 0,
  **452 tests**, build, gm:regression 22/22, gm:import PASS, validate-agents 214/0/0,
  `git diff --check` limpio. Tag `wave-4a3-pg17-bootstrap-ready-v1`.
- **Push real** `db push --linked` ✅: 14 migraciones aplicadas en orden (único aviso
  `NOTICE pgcrypto already exists`, benigno). "Finished supabase db push."
- **Post-push** `migration list --linked` ✅: **14/14 Local = Remote**, ninguna pendiente.
- **Seeds NO ejecutados** · **usuarios NO creados** · sin SQL/`migration repair` ·
  **Vercel intacto** (`demo`+`fixture`). Tag `wave-4a3-remote-schema-bootstrap-v1`.
- **Estado remoto**: esquema presente, **sin datos funcionales** (sin org/usuarios reales).

**Resultado microfase**: ✅ PASS. Esquema remoto listo; pendiente 4A.3c (org + admin + login online).

---

## Oleada 4A.3a — paridad local Postgres 17 + dry-run remoto (2026-06-02)

> Microfase de bootstrap remoto en `integration/wave-4a3-remote-bootstrap`. Solo
> alineación local + `db push --dry-run` (sin push real). Validación read-only.

- **Contexto**: remoto `construction-ops-prod` vinculado y **vacío** (0 migraciones).
  Mismatch resuelto en local: `config.toml` `major_version` 15 → **17** (paridad con
  remoto PG 17.6.1).
- **Revalidación local en PG17** ✅: `server_version 17.6`; `db reset` (14 migraciones
  + 4 seeds) limpio; **RLS runtime 47/47 PASS** (0 FAIL).
- **Validación general** ✅: typecheck/lint 0, **452 tests** PASS, build PASS, gm:regression
  **22/22**, gm:import PASS, validate-agents **214/0/0**, `git diff --check` limpio.
- **Dry-run** `db push --dry-run --linked` ✅: listó **14 migraciones** en orden,
  **sin seeds**, **sin** aplicar cambios; `migration list --linked` confirma remoto con
  **0 migraciones** aplicadas.
- **Sin** cambios remotos · **Vercel intacto** (`demo` + `fixture`). Commit `8a76a75`.

**Resultado microfase**: ✅ PASS. Listo para autorizar `db push` real en sesión posterior.

---

## Última auditoría

- **Fecha**: 2026-05-30
- **Tipo**: validación de integración de Oleada 1 (rama `integration/wave-1`).
- **Resultado global**: ✅ PASS para merge a `main` (con salvedades de runtime documentadas).

---

## Categorías de validación (integración Oleada 1)

| Categoría | Estado | Detalle |
|-----------|--------|---------|
| Regresión financiera (golden master) | ✅ PASS (empírico) | 9/9 valores §3.4 confirmados en celdas reales del Excel; `gm:regression` 22/22; `gm:import` todas PASS; ±0.01 COP. Sin ajustar fórmulas |
| Fixture fila-por-fila | ✅ PASS | 14 capítulos + 131 ítems reales; SIN ítem de balanceo; Σ=costos_directos ±2.05e-8 |
| Privacidad (fixture/Excel) | ✅ PASS | Excel ignorado y no commiteado; `findPrivateLeaks` 0 fugas; datos de contratante/contratista excluidos |
| RLS multitenant | ✅ PASS (runtime) | **Estático** 70 tests + **Runtime 21/21 PASS** contra Postgres local (Supabase Docker): aislamiento A/B, denegación cross-org (UPDATE 0 filas + INSERT WITH CHECK), usuario sin organización 0 filas, helper `app.current_org()` desde JWT, 20 tablas con RLS FORCE |
| Inmutabilidad de snapshots | ✅ PASS (runtime) | `apu_calculation_snapshots` UPDATE/DELETE 0 filas; `price_observations` DELETE 0 filas + trigger de precio inmutable; versiones `issued` UPDATE/DELETE bloqueado + INSERT de hijo bloqueado; control positivo `draft` editable. Verificado en runtime real |
| Idempotencia importador | ✅ PASS | `gm:build-fixture` reproduce el fixture byte-idéntico (salvo EOL) |
| Privacidad por rol (endpoints) | ⏳ Pendiente | Requiere pricing/exports (Oleada 2-3) |
| Exportaciones por perfil | ⏳ Pendiente | Requiere exports (Oleada 3) |
| Licencias | ✅ PASS | Todas permisivas (MIT/Apache/Unlicense/ISC); sin AGPL; sin ag-grid-enterprise |
| Archivos privados en Git | ✅ PASS | `.gitignore` cubre `private/`, `*.xlsx`, `.env*`; Excel no en staging |
| Configuración de agentes | ✅ PASS | `validate-claude-agents.ps1` PASS 214/0/0 |
| Build / lint / typecheck / test | ✅ PASS | typecheck 0, lint 0, **108 tests PASS**, build Next 16.2.6 (9 rutas + Proxy); dev smoke 8/8 rutas HTTP 200 |

---

## FAIL bloqueantes activos

Ninguno.

## Salvedades (no bloqueantes para merge)

- Coordenadas celda-a-celda de hojas auxiliares (APU/CANTIDADES) quedan como
  referencia tentativa; no afectan la regresión de los 9 totales.

## Deuda técnica (no bloqueante)

- **B-004 — Supabase Realtime unhealthy en Docker Desktop (Windows)**: el
  contenedor `realtime` queda `unhealthy` y aborta `supabase start` por defecto.
  NO afecta RLS (solo se requiere el contenedor `db`); se arrancó excluyendo
  servicios no esenciales y el RLS runtime pasó 21/21. Revisar antes de
  implementar funcionalidades Realtime o antes de producción. Ver
  `docs/OPEN_QUESTIONS.md#B-004`.
- **B-005 — Espejo DTO de planning duplicado en el dominio (Oleada 3B)** ✅
  **RESUELTO 2026-06-01** (Oleada 3C, `integration/wave-3c`): `types.ts` ahora
  re-exporta los DTOs/enums de planning desde la **fuente única**
  `apps/web/lib/contracts/read-model.ts` y conserva solo tipos de dominio puro;
  se eliminó el campo muerto `financialProgressPct` y el `ScheduleSummaryView`
  sin uso. Validación: typecheck/lint 0, 389 tests, build (`/planning`),
  gm 22/22 + 9/9, diff limpio; cero regresiones (1 archivo, 252→176 líneas).
  Ver `docs/OPEN_QUESTIONS.md#B-005`.

---

## Histórico

| Fecha | Auditor | Resultado | Bloqueos |
|-------|---------|-----------|----------|
| 2026-05-29 | preparación inicial | estructura lista | PROJECT_MASTER vacío (B-001) |
| 2026-05-30 | orquestador (integración Oleada 1) | PASS pre-merge | RLS runtime pendiente (no bloqueante) |
| 2026-05-30 | orquestador (merge a main `58f4366`) | ✅ PASS post-merge | RLS runtime pendiente; Q8/Q9 abiertas |
| 2026-05-30 | orquestador (Oleada 1.5, rama `feature/wave-1.5-local-rls`) | 🟡 PARCIAL | Q8/Q9 RESUELTAS; offline PASS; **RLS runtime BLOQUEADO por corrupción del content store de Docker Desktop** |
| 2026-05-30 | orquestador (Oleada 1.5, RLS runtime real) | ✅ PASS | Docker reparado; **RLS runtime 21/21 PASS** contra Postgres local (Supabase Docker); B-003 RESUELTO |
| 2026-05-30 | orquestador (merge Oleada 1.5 a main `1ddc833`) | ✅ PASS post-merge | Ninguno bloqueante; B-004 (Realtime) como deuda técnica |
| 2026-05-30 | orquestador (integración Oleada 2A en `integration/wave-2a`) | ✅ PASS pre-merge | cost-domain + pricing integrados y unificados; **229 tests**; gm 22/22 + 9/9; sin merge a main |
| 2026-05-30 | orquestador (merge Oleada 2A a main `f0c7d23`) | ✅ PASS post-merge | **229 tests**; gm 22/22 + 9/9 diff=0; IVA por `base_type='utility'`; sin cambios de DB ⇒ RLS 21/21 vigente; tag `wave-2a-domain-pricing-v1` |
| 2026-05-30 | orquestador (integración Oleada 2B en `integration/wave-2b`) | ✅ PASS pre-merge | adaptador Homecenter integrado y reconciliado; **309 tests** (80 adapters); gm 22/22 + 9/9; persistencia solo vía `PricingApprovalPort` real; sin scraping; sin merge a main |
| 2026-05-30 | orquestador (merge Oleada 2B a main `47fcfb3`) | ✅ PASS post-merge | **309 tests** (80 adapters); gm 22/22 + 9/9; sin cambios de DB ⇒ RLS 21/21 vigente; sin scraping/API inventada; tag `wave-2b-homecenter-adapter-v1` |
| 2026-05-31 | orquestador (integración Oleada 3A en `integration/wave-3a`) | ✅ PASS pre-merge | read-model canónico cableado a la UI; **356 tests**; gm 22/22 + 9/9; dev smoke 8/8 HTTP 200 datos reales; sin merge a main |
| 2026-05-31 | orquestador (merge Oleada 3A a main `d1f0920`) | ✅ PASS post-merge | **356 tests**; gm 22/22 + 9/9; 1 `ReadModelPort`/`getReadModel`; sin dev-read-model/mocks activos; sin cambios de DB ⇒ RLS 21/21 vigente; tag `wave-3a-functional-read-model-ui-v1` |
| 2026-06-01 | orquestador (integración Oleada 3B en `integration/wave-3b` `595e5a5`) | ✅ PASS pre-merge | planning DB+RLS+read-model+dominio CPM+`/planning`+Gantt; **389 tests**; **RLS runtime 32/32** (24 tablas FORCE); gm 22/22 + 9/9; dev smoke **9/9 HTTP 200**; CPM server-side; sin merge a main |
| 2026-06-01 | orquestador (merge Oleada 3B a main `40118a5`) | ✅ PASS post-merge | sin conflictos; **389 tests**; build (`/planning`); gm 22/22 + 9/9; validador 214/0; **RLS runtime 32/32** (13 migraciones + 3 seeds, 24 tablas FORCE); dev smoke **9/9 HTTP 200** (sin fugas internas; rol management ve Holgura/Crítica); read-model canónico único; CPM solo en `modules/planning`; B-005 (espejo DTO interno, campo muerto) deuda no bloqueante; tag `wave-3b-planning-gantt-v1` |
| 2026-06-01 | orquestador (integración Oleada 3C exports `integration/wave-3c` `4b904db`) | ✅ PASS pre-merge | 5 formatos × 4 perfiles; whitelist server-side; **0 tablas crudas**, **0 recálculo** (Decimal Q9); **410 tests**; build (`/api/exports`); gm 22/22 + 9/9; smoke 6/6 HTTP 200 + negativos 400; privacidad por perfil; RLS 32/32 vigente; sin merge a main |
| 2026-06-01 | orquestador (reconciliación + merge Oleada 3C a main, Caso B squash) | ✅ PASS post-merge | `origin/main` divergió por PR squash (`b09158f`); rama `integration/wave-3c-main-reconciled` desde `origin/main` + merge `backup/wave3c-exports` (solo 15 archivos exports, sin conflictos/duplicación) → merge a `main`; **410 tests**; build (`/api/exports`); gm 22/22 + 9/9; validador 214/0; **smoke 6/6 HTTP 200** + negativos 400; privacidad por perfil; **RLS runtime 32/32 vigente** (sin cambios DB); tag `wave-3c-exports-v1` |
| 2026-06-01 | orquestador (integración Oleada 4A.1 auth/RLS `integration/wave-4a-auth-local` `adeafbe`) | ✅ PASS pre-merge | merge `--no-ff backup/wave4a-auth-db-local`, **sin conflictos** (4 archivos, +401); helpers de identidad real (`auth.uid()`→`profiles`) con compat demo, deny-by-default, SECURITY DEFINER (sin recursión); **reutiliza `profiles`/`organizations`** (0 tablas nuevas); 14 migraciones + 4 seeds; **RLS runtime 47/47** (32 previos + 15 auth: aislamiento real A/B, sin sesión/sin membresía→deny, cross-org bloqueado, rol admin vs obra, compat demo); typecheck/lint 0, **410 tests**, build, gm 22/22 + 9/9, validador 214/0; sin secretos/.env/privados; **sin merge a main** |
| 2026-06-02 | orquestador (integración 4A.2 UI auth `integration/wave-4a-auth-runtime` `5c60339`) | ✅ PASS pre-merge | merge `--no-ff backup/wave4a-auth-ui`, **sin conflictos** (11 archivos, +1106); runtime SSR + UI auth; **452 tests** (+29 auth-ui); build (Proxy + `(auth)/*` + `/api/exports`); gm 22/22 + 9/9; validador 214/0; **RLS runtime 47/47**; smoke local Supabase (login real, anti-escalamiento, logout, forgot/Mailpit); sin merge a main |
| 2026-06-02 | orquestador (merge Oleada 4A a main `de37d15`) | ✅ PASS post-merge | `--no-ff` sin conflictos (44 archivos, +3185/-133); DB/RLS + runtime SSR + UI auth; typecheck/lint 0, **452 tests**, build (Proxy + rutas auth + `/api/exports`), gm 22/22 + 9/9, validador 214/0/0; **RLS runtime 47/47** (14 migr + 4 seeds); **smoke demo 6/6 HTTP 200** (`/`→`/dashboard`, dashboard/projects/planning/login 200, `/api/exports` PDF); sin secretos/.env.local/privados; tag `wave-4a-auth-local-v1`; **Vercel demo+fixture**; remoto NO conectado; **Oleada 4A CERRADA** |

## Validación Oleada 1.5 (rama `feature/wave-1.5-local-rls`, 2026-05-30)

Objetivo: validar RLS **runtime** real contra PostgreSQL local (Supabase/Docker).

**Resuelto:**
- Q8 (base del descuento = `online_public_price`) y Q9 (redondeo `ROUND_HALF_UP`
  solo presentación) cerradas en DECISIONS/API_CONTRACTS/DATABASE_SCHEMA/OPEN_QUESTIONS.
- Supabase CLI `supabase ^2.102.0` (MIT) instalado como devDep raíz (sin global, sin remoto).
- Harness de pruebas RLS runtime creado: `scripts/rls-runtime/run.ts` (2 orgs,
  aislamiento, cross-org, sin-org, append-only, inmutabilidad de snapshots,
  versiones emitidas) — pendiente de ejecución real.

**Offline (todo PASS):** typecheck 0 · lint 0 · **108 tests** · build Next 16.2.6 ·
`gm:regression` 22/22 · `gm:import` PASS · `validate-claude-agents` 214/0/0 ·
`git diff --check` limpio. Excel ignorado; sin privados en staging.

**BLOQUEO (infraestructura, no código):** `supabase start` y `docker pull`
fallan con `write .../io.containerd.metadata.v1.bolt/meta.db: input/output error`.
El content store de containerd de Docker Desktop está corrupto (`docker system df`
no puede listar imágenes: blob faltante). Host con 1.5 TB libres ⇒ no es espacio.
**Requiere intervención del usuario**: reiniciar Docker Desktop y, si persiste,
*Troubleshoot → Clean / Purge data* (o reset a fábrica) para regenerar el store;
luego reintentar `supabase start` + `db reset` + `scripts/rls-runtime/run.ts`.
NO se conectó ninguna base remota. RLS runtime sigue **PENDIENTE** (solo estático).

## Validación RLS runtime REAL (rama `feature/wave-1.5-local-rls`, 2026-05-30)

Docker Desktop reparado por el usuario (content store regenerado). El orquestador
re-ejecutó el flujo completo contra el PostgreSQL local de Supabase (Docker).
**NO se conectó base remota; sin `supabase link`/`db push`.**

**Entorno:**
- `supabase start`: imágenes descargadas; **11 migraciones** aplicadas en orden.
  Servicios no esenciales excluidos (`-x realtime,studio,storage-api,imgproxy,
  edge-runtime,logflare,mailpit,vector`) por contenedor `realtime` *unhealthy*
  en Windows; el `db` (Postgres 15) es lo único requerido por el harness.
- `supabase db reset`: re-aplicó **11 migraciones + 2 seeds** sin errores.
- Fix de integración: `[db.seed]` en `config.toml` (los seeds no se cargaban por
  defecto) + seed `0001` ahora crea filas `auth.users` antes de `profiles`
  (FK `profiles_id_auth_users_fk` activo en el stack Supabase real).

**Harness `scripts/rls-runtime/run.ts` → 21 PASS / 0 FAIL:**

| # | Verificación runtime | Resultado |
|---|----------------------|-----------|
| Pre | seed org A / proyecto A aplicados; **20 tablas con RLS FORCE** | ✅ |
| 1 | helper `app.current_org()` = `organization_id` del JWT | ✅ |
| 2 | A ve su proyecto y **NO** ve el de B | ✅ |
| 3 | B ve su proyecto y **NO** ve el de A | ✅ |
| 4 | A no puede UPDATE proyecto de B (0 filas) | ✅ |
| 4b | A no puede INSERT en org B (WITH CHECK lanza error) | ✅ |
| 5 | usuario **sin organización** no ve proyectos (0 filas) | ✅ |
| 6 | `price_observations` **append-only** (DELETE 0 filas) + fila persiste + precio inmutable (trigger) | ✅ |
| 7 | `apu_calculation_snapshots` **inmutable** (INSERT ok; UPDATE/DELETE 0 filas) | ✅ |
| 8 | `estimate_versions` **emitida** (`issued`) bloquea UPDATE/DELETE + INSERT de hijo (capítulo) | ✅ |
| 9 | control positivo: en `draft` SÍ se edita dentro de la org (1 fila) | ✅ |

**Validaciones de proyecto (todas PASS):** typecheck 0 · lint 0 · **108 tests** ·
build Next 16.2.6 (9 rutas + Proxy) · `gm:regression` **22/22** · `gm:import`
PASS (privacidad 0 fugas) · `validate-claude-agents` **214/0/0** ·
`git diff --check` limpio (solo avisos LF→CRLF). Sin privados en staging; sin
`.env` trackeado; sin `package-lock.json`; sin `ag-grid-enterprise`; sin AGPL.

**Conclusión:** B-003 RESUELTO. RLS multitenant e inmutabilidad de snapshots
validados **empíricamente**. **Recomendación: APROBAR merge de
`feature/wave-1.5-local-rls` → `main`** (queda a decisión del usuario; este ciclo
NO hace merge). Habilita el inicio de Oleada 2 (cost-domain / pricing / homecenter).

## Validación post-merge (main, 2026-05-30)

Merge `--no-ff` `integration/wave-1` → `main` (commit `58f4366`). Resultados:
typecheck 0 · lint 0 · **test 108 PASS** · build Next 16.2.6 OK · `gm:regression`
**22/22** (9/9 golden master ±0.01 COP) · `gm:import` todas PASS ·
`validate-claude-agents` **214/0/0** · `git diff --check` limpio. Privacidad:
Excel ignorado y no versionado, 0 nombres de cliente en tracked, fixture
sanitizado sin ítem de balanceo. Sin `ag-grid-enterprise`, sin AGPL, sin `.env`
trackeado, sin `package-lock.json`. **Salvedad**: RLS solo estático (runtime
pendiente contra Supabase/Postgres local).

## Validación post-merge Oleada 1.5 (main, 2026-05-30)

Merge `--no-ff` `feature/wave-1.5-local-rls` → `main` (merge commit `1ddc833`),
sin conflictos. Validación post-merge en `main`:
typecheck 0 · lint 0 · **test 108 PASS** · build Next 16.2.6 (9 rutas + Proxy) ·
`gm:regression` **22/22** · `gm:import` **9/9 PASS** (regresión §3.4 diff=0;
cadena recálculo ±1.9e-8; privacidad 0 fugas) · `validate-claude-agents`
**214/0/0** · `git diff --check` limpio · árbol limpio. **Privacidad**: Excel
ignorado (`git check-ignore` confirma `private/`); sin `.env` trackeado; sin
`package-lock.json`; solo `ag-grid-community`/`ag-grid-react` (MIT), `enterprise`
únicamente en comentarios de prohibición; sin AGPL. **RLS runtime 21/21**
(validado en la rama; ver sección anterior). **Deuda técnica**: B-004 (Realtime
unhealthy en Windows), no bloqueante. **Oleada 1.5 CERRADA**; Q8/Q9 RESUELTAS.

## Validación integración Oleada 2A (rama `integration/wave-2a`, 2026-05-30)

Integración secuencial de los entregables de Oleada 2A en `integration/wave-2a`
(cherry-picks `6694d88` cost-domain + `1e8a869` pricing), unificación del
contrato de precios y resolución de la base del IVA. **Sin merge a `main`.**

**Unificación del contrato:**
- Fuente única de código `apps/web/lib/contracts/pricing-read.ts`. **Una sola**
  `interface PricingReadPort` / `ApprovedPriceContext` (verificado por grep).
  cost-domain re-exporta vía `modules/apu/pricing-port.ts`; pricing vía
  `modules/pricing/types.ts`. Sin dependencias circulares (el contrato solo
  importa `@/lib/utils/types`). cost-domain pasó su puerto a **async** + clases
  de error `ApprovedPriceNotFoundError`/`AmbiguousApprovedPriceError`.

**Base del IVA:**
- Eliminado el flag `contributesToUtilityBase` (sin código activo). Regla
  canónica: `base_type='utility'` aplica sobre el monto de la última línea
  `direct_cost` previa (Utilidad). IVA = Utilidad × 0.19, **diff=0** en gm:import.

**Resultados (todo PASS):** typecheck 0 · lint 0 · **229 tests** (cost-domain +
pricing + base) · build Next 16.2.6 (9 rutas + Proxy) · `gm:regression` **22/22**
· `gm:import` **9/9** (±0.01 COP, diff=0) · `validate-claude-agents` **214/0/0**
· `git diff --check` limpio.

**Privacidad:** proyección `ClientSafePrice` sin campos 🔒 (privacy.test.ts);
`INTERNAL_PRICE_FIELDS` cubre descuentos/ahorros/precio público/proveedor
interno; `price_observations` append-only y snapshots inmutables (tests de
pricing + cost-domain). Excel ignorado; sin `.env`/`package-lock`; sin
`ag-grid-enterprise` en dominio; sin AGPL; sin datos privados.

**RLS runtime:** la integración NO modificó `supabase/migrations|policies|seeds`
ni `apps/web/lib/db/schema.ts` ⇒ la validación **RLS runtime 21/21** de Oleada
1.5 continúa vigente (no se relevantó Docker). **B-004** (Realtime) sigue como
deuda técnica no bloqueante.

**Recomendación:** ✅ **APROBAR merge `integration/wave-2a` → `main`** (queda a
decisión del usuario; este ciclo NO hace merge). Antes de Oleada 2B: congelar
`docs/PRICING_ADAPTER_CONTRACT.md`.

## Validación integración Oleada 2B (rama `integration/wave-2b`, 2026-05-30)

Integración del adaptador Homecenter (cherry-pick `1a8f6fa` desde
`backup/wave2-homecenter`) + reconciliación contra el contrato congelado.
**Sin merge a `main`.**

**Reconciliación:**
- Tipos del adaptador alineados 1:1 con `PRICING_ADAPTER_CONTRACT`
  (`SupplierAdapter`, `RawSupplierItem`, `SkuMatchCandidate/Proposal`,
  `ImportPreview`, `ImportResult`); `RecordObservationInput` importado del módulo
  real `@/modules/pricing/types`.
- **Consumo del `PricingApprovalPort` real**: `MinimalApprovalPort` confirmado
  como subconjunto estructural (no lógica paralela). Añadido
  `tests/unit/pricing-adapters/port-reconciliation.test.ts` (type-level +
  runtime con `PricingApprovalService` real, append-only e idempotencia).
- `ResourceCatalog`/`ResourceRef` avalados como auxiliares de matching.

**Resultados (todo PASS):** typecheck 0 · lint 0 · **309 tests** (incl. **80 de
adapters**: CSV/Excel válido, columna faltante, precio inválido, moneda, SKU
opcional/ambiguo, matching con candidatos+score, fallback manual, preview sin
persistencia, aprobación, rechazo, duplicado, idempotencia, auditoría,
privacidad, reconciliación de puerto) · build Next 16.2.6 · `gm:regression`
**22/22** · `gm:import` **9/9** · `validate-claude-agents` **214/0/0** ·
`git diff --check` limpio.

**Privacidad/seguridad:** persistencia exclusivamente vía `PricingApprovalPort`
(el adaptador no escribe en DB); `price_observations` append-only; preview no
persiste; ambiguos `pending`; sin tocar snapshots emitidos. Campos 🔒
(SKU/URL/`sourceReference`/proveedor/precio público/candidatos/score/aprobador/
motivos) no se exponen a cliente. **Sin scraping** (sin `fetch`/`axios`/
`puppeteer`/`cheerio`), **sin API Homecenter inventada** (solo CSV/Excel local;
"homecenter" únicamente como `providerKey`/ejemplo CLI). Excel ignorado; sin
`.env`/`package-lock`; sin `ag-grid-enterprise`; sin AGPL.

**RLS runtime:** la integración NO modificó `supabase/migrations|policies|seeds`
ni `apps/web/lib/db/schema.ts` ⇒ **RLS runtime 21/21** de Oleada 1.5 vigente.
**B-004** (Realtime) sigue como deuda técnica no bloqueante.

**Recomendación:** ✅ **APROBAR merge `integration/wave-2b` → `main`** (queda a
decisión del usuario; este ciclo NO hace merge).

## Validación integración Oleada 3A (rama `integration/wave-3a`, 2026-05-31)

Integración de la visibilidad funcional: read-model canónico cableado a las
pantallas (cherry-picks `9e69449` db-rls + `8ab0d9c` frontend + `0bab01d`
dashboard). **Sin merge a `main`.**

**Reconciliación:**
- Fuente única `apps/web/lib/contracts/read-model.ts` (conflicto add/add resuelto
  con el canónico de db-rls); **1** `interface ReadModelPort` (verificado).
- Accesores TEMP `dev-read-model.ts` eliminados; las 5 páginas de presupuesto y el
  dashboard consumen `getReadModel()` de `@/server/read-model` con `getDemoViewer()`
  (helper demo; en `db` el viewer vendrá de la sesión y RLS filtra).
- Páginas adaptadas a los DTOs canónicos. Test redundante del frontend eliminado;
  test del dashboard repointado al read-model canónico.

**Resultados (todo PASS):** typecheck 0 · lint 0 · **356 tests** · build Next
16.2.6 (rutas estáticas + dinámicas) · `gm:regression` **22/22** · `gm:import`
**9/9** (±0.01 COP) · `validate-claude-agents` **214/0/0** · `git diff --check`
limpio.

**Dev smoke local (`READ_MODEL_SOURCE=fixture`):** 8/8 rutas **HTTP 200** con
datos reales del golden master:

| Ruta | HTTP | Nota |
|------|------|------|
| `/` | 200 | landing |
| `/login` | 200 | — |
| `/projects` | 200 | proyecto real (alcances/conteos) |
| `/estimates` | 200 | BOQ + AIU/IVA reales ("Entre Patios") |
| `/apu` | 200 | plantillas APU reales |
| `/quantities` | 200 | grupos/líneas reales |
| `/catalog` | 200 | recursos (precio referencia cliente-safe) |
| `/dashboard` | 200 | KPIs reales (Total presupuesto $372.247…) + Recharts |

**Privacidad:** los DTOs cliente-safe no exponen `onlinePublicPrice`/
`negotiatedDiscount`/`sourceReference`/SKU; `DashboardSummary.{projectedSaving,
realizedSaving,pricingCoverage}` son role-gated (omitidos para `client`).
**Cero cálculo financiero en React** (dinero `DecimalString` ya calculado).
Excel ignorado; sin `.env`/`package-lock`; sin `ag-grid-enterprise`; sin AGPL.

**RLS runtime:** la integración NO modificó `supabase/migrations|policies|seeds`
ni `apps/web/lib/db/schema.ts` ⇒ **RLS runtime 21/21** de Oleada 1.5 vigente.
**B-004** (Realtime) deuda técnica no bloqueante.

**Recomendación:** ✅ **APROBAR merge `integration/wave-3a` → `main`** (queda a
decisión del usuario; este ciclo NO hace merge).

## Validación integración Oleada 3B (rama `integration/wave-3b`, 2026-06-01)

Integración formal de la planificación: merge `--no-ff` de
`continuation/wave3b-planning-ui` (db `560b2cc` + ui `41abbe2` combinados) →
merge commit **`595e5a5`**. Sin conflictos. **Sin merge a `main`.**

**Reconciliación:** read-model canónico único (`apps/web/lib/contracts/read-model.ts`);
`/planning` consume `getReadModel().getSchedule(getDemoViewer(), projectId)` real
(0 accesores TEMP); `view-model` consume el `ScheduleSummary` canónico del
read-model; CPM/ruta crítica/holguras **solo en `apps/web/modules/planning/`**
(0 en React); frappe-gantt con import dinámico client-side + CSS vendorizado
(su `exports` v1.2.2 no expone `dist/*.css`); nav `/planning`.

**Resultados (todo PASS):** typecheck 0 · lint 0 · **389 tests** · build Next
16.2.6 (rutas `/planning` + previas) · `gm:regression` **22/22** · `gm:import`
**9/9** · `validate-claude-agents` **214/0/0** · `git diff --check` limpio.

**RLS runtime real (Docker local): 32/32 PASS** — `db reset` aplicó **13
migraciones + 3 seeds** sin errores; **24 tablas con RLS FORCE**; 21 previos + 11
planning (aislamiento org A/B en las 4 tablas, usuario sin org sin acceso,
`progress_entries` append-only UPDATE/DELETE denegados, INSERT autorizado, WITH
CHECK cross-org en tarea/dependencia). Sin remoto.

**Dev smoke (`READ_MODEL_SOURCE=fixture`): 9/9 rutas HTTP 200** — `/`, `/login`,
`/projects`, `/estimates`, `/apu`, `/quantities`, `/catalog`, `/dashboard`,
`/planning`. `/planning` muestra "Cronograma de obra", resumen, tareas, hitos,
dependencias, % avance y **Diagrama de Gantt** con datos reales del fixture
sanitizado; sin 500.

**Privacidad:** ruta crítica/holguras/avance financiero/`external_reference`/
responsables/recursos internos son role-gated (omitidos para `client`). Cero
cálculo monetario/CPM en React. Compatibilidad MS Project reservada (sin export
en 3B). Excel ignorado; sin `.env`/`package-lock`; sin `ag-grid-enterprise`; sin
AGPL. **B-004** (Realtime) deuda técnica no bloqueante.

**Recomendación:** ✅ **APROBAR merge `integration/wave-3b` → `main`** (queda a
decisión del usuario; este ciclo NO hace merge).

---

## Validación de integración — Oleada 4A.2 (auth runtime + UI) — 2026-06-02

> Validación de integración por el orquestador en
> `integration/wave-4a-auth-runtime` (pre-merge). QA integral formal = Oleada 4.

**Merge:** `git merge --no-ff backup/wave4a-auth-ui` → `5c60339`, **sin
conflictos** (11 archivos, +1106). Runtime SSR (`19246a5`) + UI auth integrados.

**Auditoría de implementación (contrato `AUTH_RUNTIME_CONTRACT`):**
- Browser client `createBrowserClient` solo con clave **publishable** (0 secretos).
- Server client `createServerClient` con cookies SSR `getAll()`/`setAll()` (sin
  adaptadores legacy `get/set/remove`).
- Proxy Next 16 (`proxy.ts`): refresh + **`getClaims()`** como guard (NUNCA
  `getSession()`); rutas públicas/protegidas; deny-by-default; `sanitizeNext`
  (anti open-redirect: `//`, `/\`, esquemas, control chars).
- Viewer real: sesión→`profiles` por `auth.uid()`; `organizationId`/rol
  server-side; mapeo único `role-map.ts`; deny sin sesión/membresía/rol; **org
  y rol nunca desde el navegador**.
- `/api/exports`: modo supabase exige viewer; **anti-escalamiento** vía
  `isSameOrLessPrivileged` (perfil ≤ ViewerRole).

**Resultados (todo PASS):** typecheck 0 · lint 0 · **452 tests** (+29 auth-ui) ·
build Next 16.2.6 (Proxy + `(auth)/*` + `/api/exports`) · `gm:regression`
**22/22** · `gm:import` **9/9** · `validate-claude-agents` **214/0/0** ·
`git diff --check` limpio.

**Smoke local (Supabase local Docker, sin remoto):**
- `supabase start` (sin realtime/studio/storage/imgproxy/edge/logflare/vector) +
  `db reset` (**14 migraciones + 4 seeds** limpios) + **RLS runtime 47/47**.
- 1) `/login` 200. 2) `/dashboard` sin sesión → `/login?next=/dashboard`.
  3) credenciales inválidas → "Invalid login credentials" (mapeado a mensaje
  legible, sin stack). 4) login admin → sesión + cookies SSR. 5) `/dashboard`
  auth → 200. 6) `/login` auth → `/dashboard`. 7) `/api/exports` sin sesión →
  bloqueado por Proxy (307 `/login`). 8) escalamiento client→internal **403**,
  client→management **403**, client→client **200**. 9) export autorizado **200**
  (PDF `%PDF`, `Content-Disposition: attachment`, `X-Export-Profile: client`).
  10) logout → cookie `Max-Age=0` + `/login`. 11) forgot → `recover` 200 +
  **Mailpit** "Reset Your Password". 12) `/reset-password` 200, callback sin code
  → `/login?error`. 13) **demo** (`APP_AUTH_MODE=demo`) → `/dashboard` 200 sin
  Supabase, `/api/exports` 200.

**Privacidad/seguridad:** sin `service_role` en frontend; `.env.local` **ignorado**
(no trackeado); contraseñas de prueba **efímeras locales** (no en repo/docs);
Excel privado ignorado; sin `.env`/lock/privados; sin AGPL/enterprise.

**Deudas no bloqueantes:** B-004 (Realtime en Docker/Windows). Nota: `/api/exports`
sin sesión responde **307→/login** (Proxy lo intercepta antes del handler `401`);
deny equivalente — el 401 del handler aplica si se invoca fuera del matcher.

**Recomendación:** ✅ **APROBAR merge acumulado de Oleada 4A
(`integration/wave-4a-auth-runtime`) → `main`** (queda a decisión del usuario;
este ciclo NO hace merge). Sin remoto; Vercel en demo fixture intacto.
