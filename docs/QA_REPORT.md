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

- **RLS runtime**: validado solo estáticamente (texto SQL). Ejecutar contra
  Supabase/Postgres local en un entorno con Docker antes de producción.
- Coordenadas celda-a-celda de hojas auxiliares (APU/CANTIDADES) quedan como
  referencia tentativa; no afectan la regresión de los 9 totales.

---

## Histórico

| Fecha | Auditor | Resultado | Bloqueos |
|-------|---------|-----------|----------|
| 2026-05-29 | preparación inicial | estructura lista | PROJECT_MASTER vacío (B-001) |
| 2026-05-30 | orquestador (integración Oleada 1) | PASS pre-merge | RLS runtime pendiente (no bloqueante) |
| 2026-05-30 | orquestador (merge a main `58f4366`) | ✅ PASS post-merge | RLS runtime pendiente; Q8/Q9 abiertas |
| 2026-05-30 | orquestador (Oleada 1.5, rama `feature/wave-1.5-local-rls`) | 🟡 PARCIAL | Q8/Q9 RESUELTAS; offline PASS; **RLS runtime BLOQUEADO por corrupción del content store de Docker Desktop** |
| 2026-05-30 | orquestador (Oleada 1.5, RLS runtime real) | ✅ PASS | Docker reparado; **RLS runtime 21/21 PASS** contra Postgres local (Supabase Docker); B-003 RESUELTO |

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
