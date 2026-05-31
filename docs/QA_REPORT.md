# QA Report — Construction Ops

Este documento es propiedad de **agent-qa**. Se actualiza al final de
cada ciclo de validación.

> Validación de **integración de Oleada 1** realizada por el orquestador en
> `integration/wave-1` (pre-merge). La validación QA integral formal es de
> Oleada 4 (`agent-qa`).

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
