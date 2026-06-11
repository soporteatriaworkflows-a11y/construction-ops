# Price Monitoring Agent V1 + Unit Alias Normalization V1 — Contrato

**Versión:** 1.0 (CONGELADO)
**Fase:** 4A
**Rama:** feature/price-monitoring-agent-v1
**Base:** origin/main @ 9f6816f
**Fecha:** 2026-06-10
**Propiedad:** agent-orchestrator / agent-pricing
**Cambios:** solo vía `docs/INTEGRATION_REQUESTS.md`.

---

## 1. Naturaleza del agente

Es un **agente del sistema**, no conversacional:

- NO es un chat ni un asistente.
- NO usa IA generativa para decidir precios.
- Revisa periódicamente URLs públicas **explícitamente habilitadas** y crea
  observaciones `pending` únicamente cuando hay cambio o evidencia nueva.
- **Nunca aprueba automáticamente.** La aprobación humana de Fase 3A es la
  única vía de aprobación.
- **Nunca escribe** en BOQ, AIU, exports ni snapshots emitidos.

## 2. Flujo

```text
fuente habilitada (target explícito)
→ cron diario (Vercel Cron, 11:00 UTC ≈ 06:00 America/Bogota)
→ selección de fuentes vencidas (enabled ∧ next_check_at <= now)
→ fetch seguro (SSRF + DNS + redirects ≤5 + 3MB + timeout 10s heredados)
→ extracción (adapters existentes: JSON-LD, meta, Decorcerámica)
→ normalización (precio, moneda, unidad canónica)
→ comparación contra baseline aprobado
   ├─ sin cambio  → resultado unchanged (solo registra revisión)
   ├─ cambio      → observación pending + resultado pending_created + alerta
   ├─ sin baseline→ observación pending (propuesta inicial)
   └─ error       → resultado de fallo + consecutive_failures++
→ revisión humana (Fase 3A, sin cambios)
```

Prohibido: crawling, recorrido de categorías, login externo, evasión
anti-bot, headless browser.

## 3. Scheduler

### 3.1 Vercel Cron

- `apps/web/vercel.json`:
  ```json
  { "crons": [{ "path": "/api/cron/price-monitor", "schedule": "0 11 * * *" }] }
  ```
- 11:00 UTC ≈ 06:00 America/Bogota (Colombia no tiene DST).
- **Requirement de release (NO ejecutado en esta fase):** confirmar en el
  panel de Vercel que el Root Directory del proyecto es `apps/web`; si fuera
  la raíz del repositorio, `vercel.json` debe moverse a la raíz. El cron solo
  se registra en deployments de producción.

### 3.2 Endpoint cron

`GET /api/cron/price-monitor` (Route Handler, `maxDuration = 300`).

Protección obligatoria — `Authorization: Bearer ${CRON_SECRET}`:

| Condición | Respuesta |
|---|---|
| `CRON_SECRET` no configurado | `500 {"error":"cron_not_configured"}` (fallo seguro, sin detalles) |
| Header ausente o secreto incorrecto | `401 {"error":"unauthorized"}` |
| Secreto correcto | ejecuta la corrida `scheduled` |

- El secreto **nunca** se imprime en logs ni respuestas.
- Comparación en tiempo constante (`timingSafeEqual`).
- **`CRON_SECRET` NO se configura en remoto durante esta fase.** Queda como
  requirement de release: crear la variable en Vercel (Production) antes de
  habilitar el cron. Vercel envía automáticamente
  `Authorization: Bearer ${CRON_SECRET}` cuando la variable existe.

### 3.3 Ejecución manual

- Server Action autenticada (roles `management`/`internal` únicamente).
- Misma lógica de dominio que el cron (servicio compartido).
- Rate limit: máximo una corrida manual por organización cada 5 minutos
  (verificado contra `price_monitor_runs`).
- Auditoría: `trigger_type='manual'`, `initiated_by = profileId` del viewer.
- Variantes: corrida de toda la organización (centro de monitoreo) y
  revisión de un target individual («Revisar ahora»).

## 4. Modelo de datos (migración aditiva)

Tres tablas nuevas; **cero cambios destructivos**, **cero backfill**.

### 4.1 `price_monitor_targets`

| Columna | Tipo | Nota |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL FK organizations | tenant |
| resource_id | uuid NOT NULL FK resources | |
| supplier_id | uuid NULL FK suppliers | |
| source_url | text NOT NULL | URL pública (http/https) |
| cadence_days | int NOT NULL | CHECK IN (1,7,15,30) |
| enabled | boolean NOT NULL DEFAULT true | |
| last_checked_at | timestamptz NULL | |
| next_check_at | timestamptz NOT NULL DEFAULT now() | vencida si <= now |
| last_success_at | timestamptz NULL | |
| consecutive_failures | int NOT NULL DEFAULT 0 | nunca deshabilita solo |
| baseline_observation_id | uuid NULL FK resource_price_observations | última baseline usada (traza) |
| created_by | uuid NOT NULL FK profiles | server-side |
| created_at / updated_at | timestamptz | |

- `UNIQUE (organization_id, resource_id, source_url)`.
- Índice parcial de vencimiento: `(next_check_at) WHERE enabled`.

### 4.2 `price_monitor_runs` (tenant-scoped)

Decisión: las corridas son **por organización** (una invocación del cron
crea una run por cada org con targets vencidos). Mantiene RLS uniforme y
contadores significativos por tenant.

| Columna | Tipo | Nota |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL FK | |
| trigger_type | text CHECK IN ('scheduled','manual') | |
| status | text CHECK IN ('running','completed','partial','failed') | |
| started_at / finished_at | timestamptz | |
| counters | jsonb NOT NULL DEFAULT '{}' | {checked, unchanged, changed, pendingCreated, failed} |
| initiated_by | uuid NULL FK profiles | NULL en scheduled |
| idempotency_key | text NOT NULL | `scheduled:<YYYY-MM-DD>` o `manual:<uuid>` |
| error_summary | text NULL | |

- `UNIQUE (organization_id, idempotency_key)` ⇒ doble invocación del cron en
  la misma ventana diaria = no-op para esa org.

### 4.3 `price_monitor_results`

| Columna | Tipo | Nota |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL FK | desnormalizado para RLS directa |
| run_id | uuid NOT NULL FK price_monitor_runs | |
| target_id | uuid NOT NULL FK price_monitor_targets | |
| status | text CHECK | ver §5.3 |
| detected_price | numeric(20,10) NULL | |
| currency | text NULL | |
| unit | text NULL | unidad RAW detectada (sin normalizar) |
| warnings | jsonb NOT NULL DEFAULT '[]' | |
| observation_id | uuid NULL FK resource_price_observations | |
| checked_at | timestamptz NOT NULL | |

### 4.4 RLS

Las tres tablas: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`.

- SELECT: miembros de la organización (`organization_id = app.current_org()`).
- `price_monitor_targets` INSERT/UPDATE: roles
  `admin, gerencia, presupuestos, compras` (perfil raw; espejo de
  ViewerRole `management|internal` en aplicación) + `created_by = auth.uid()`
  en INSERT + columnas de identidad inmutables en UPDATE.
- `price_monitor_runs` / `price_monitor_results` INSERT/UPDATE: mismos roles
  (cubre la corrida manual RLS-bound); DELETE sin política ⇒ denegado.
- DELETE: **sin política en las tres tablas** (pausar = `enabled=false`).

### 4.5 Camino de escritura del cron (sistema)

El cron no tiene sesión de usuario. Diseño:

1. **Lectura global de targets vencidos** y escritura de
   runs/results/timestamps: conexión administrativa (`DATABASE_URL`,
   postgres.js) — el caso «proceso administrativo controlado» previsto en
   `apps/web/lib/db/index.ts`. Endpoint protegido por `CRON_SECRET`; los
   valores de organización provienen siempre de las filas de targets,
   nunca de input externo.
2. **Creación de observaciones pending**: SIEMPRE RLS-bound. Transacción
   con `SET LOCAL ROLE authenticated` + claims transaccionales
   (`sub = target.created_by`, `organization_id = target.organization_id`),
   mismo mecanismo que `withTenantRls` (P1-A). La observación nace con
   `created_by = ` el usuario que habilitó el monitoreo (trazable) y
   `notes` marca origen automático. Si el perfil ya no tiene rol autorizado,
   el INSERT falla por RLS y se registra como fallo del target (no se
   degrada la seguridad).

La corrida **manual** es 100 % RLS-bound con el viewer real (sin conexión
administrativa).

## 5. Reglas del monitor

### 5.1 Target explícito

Una fuente solo se monitorea si: tiene URL pública válida (mismo validador
SSRF de Fase 3B en el momento de crear el target), un usuario
`management|internal` activó «Monitorear esta fuente» y `cadence_days`
∈ {1,7,15,30}. **No se monitorean URLs históricas automáticamente.**

### 5.2 Batch del cron

- Procesa solo `enabled = true ∧ next_check_at <= now()`.
- Máximo **25 targets por ejecución** (orden `next_check_at ASC`); el resto
  queda para la siguiente corrida.
- Concurrencia por dominio = 1 (agrupación por hostname); ejecución global
  secuencial conservadora (peor caso 25×10s < maxDuration 300s).
- Timeout, SSRF, DNS y redirects heredados sin cambios. Sin crawling.

### 5.3 Estados de resultado

| Estado | Significado |
|---|---|
| `unchanged` | precio igual al baseline (moneda y unidad canónicas equivalentes) |
| `changed` | cambio detectado pero ya existe una pending idéntica (se reutiliza; no se duplica) |
| `pending_created` | cambio o ausencia de baseline ⇒ se creó observación pending |
| `unreachable` | DNS/red/timeout |
| `blocked` | HTTP 401/403/429 u otra señal de bloqueo (no se evade) |
| `parse_failed` | página accesible pero sin precio extraíble |
| `invalid_response` | content-type/ tamaño/ redirect inválidos |

### 5.4 Comparación

- Baseline = observación `approved` más reciente del recurso, prefiriendo la
  de la misma fuente (`source_reference = source_url`); si no hay de la misma
  fuente, la última approved del recurso. `baseline_observation_id` registra
  la baseline usada.
- Moneda normalizada (uppercase ISO-4217; default COP). Monedas distintas ⇒
  no comparable ⇒ pending con warning `currency_mismatch`.
- Unidad comparada por **canonical unit** (§7). Unidades canónicas distintas
  ⇒ pending con warning (evidencia nueva); equivalentes (m2 vs m²) ⇒ sin
  warning falso.
- Precio igual (comparación Decimal exacta) ⇒ `unchanged`; actualizar
  `last_checked_at`, `last_success_at`, `next_check_at = now + cadence`.
- Precio distinto ⇒ crear pending (sin duplicar idéntica: misma fuente +
  mismo precio + misma moneda ya `pending` ⇒ `changed` reutilizando la
  existente) + alerta visible.
- Sin baseline ⇒ crear pending (propuesta) — nunca approved automático.

### 5.5 Fallos

- `consecutive_failures++`, resultado persistido con warning/causa.
- Retry conservador: `next_check_at = now + max(1 día, cadence_days)`.
- **Nunca** se deshabilita el target silenciosamente; ≥3 fallos consecutivos
  ⇒ alerta visible en centro de monitoreo y dashboard.

### 5.6 Locks e idempotencia

- **Lock global de corrida:** `pg_try_advisory_lock` con clave constante del
  monitor; si no se adquiere ⇒ respuesta `skipped: already_running` (sin
  procesar). Liberación garantizada en finally.
- **Idempotencia:** `UNIQUE (organization_id, idempotency_key)`;
  cron usa `scheduled:<fecha UTC>` ⇒ segunda invocación del día = no-op por
  org. Las observaciones no se duplican además por la dedup de pending §5.4.
- **Recovery:** una run `running` con `started_at` > 30 min se marca
  `failed` (`error_summary='stale_run_recovered'`) al inicio de la
  siguiente corrida; sus targets se reprocesan según `next_check_at`.

## 6. UI

### 6.1 Price Intelligence del recurso

Sección «Monitoreo automático»: toggle «Monitorear esta fuente» por URL,
frecuencia (1/7/15/30 días), estado, última/próxima revisión, fallos
consecutivos, botón «Revisar ahora» (roles autorizados), historial breve de
resultados.

### 6.2 Centro de monitoreo — `/catalog/monitoring`

Resumen (activas, pausadas, vencidas, cambios detectados, errores, última
ejecución) + botón «Ejecutar revisión ahora» + tabla (recurso, proveedor,
URL, frecuencia, última, próxima, estado, acciones).

### 6.3 Dashboard

KPIs: fuentes monitoreadas, cambios de precio pendientes, fuentes con
error, fuentes vencidas. Acceso rápido «Monitoreo de precios».

### 6.4 Roles

- `management` / `internal`: habilitar, pausar, cambiar cadencia, revisar
  ahora.
- `site` / `client`: lectura donde aplique; **cero mutaciones** (guards
  server-side en todas las actions + RLS en DB).
- Modo fixture: lectura demo, mutaciones bloqueadas
  (`READ_MODEL_SOURCE=db` requerido, patrón existente).

## 7. UNIT_ALIAS_NORMALIZATION_V1

Módulo único de aliases canónicos (`apps/web/server/pricing/units.ts`):

| Canonical | Aliases (case-insensitive, espacios/acentos tolerados) |
|---|---|
| `m²` | m2, M2, m², metro cuadrado, metros cuadrados |
| `und` | und, unidad, unidades |
| `día` | dia, día, jornada |

Reglas:

- `canonicalizeUnit(raw)` conserva el valor raw; la observación guarda la
  unidad original (raw) — **sin backfill, sin reescritura de datos**.
- Toda comparación de unidades (monitor §5.4 y warning de
  `server/catalog/import/price-list.ts`) usa la unidad canónica.
- Warning **solo** si las unidades canónicas difieren realmente; m2 vs m²
  deja de producir warning falso.
- Unidades fuera de la tabla: comparación normalizada (trim +
  case-insensitive) sin inventar equivalencias.

## 8. Notificaciones (base interna, sin SMTP)

- Alertas visibles en dashboard y centro de monitoreo (derivadas de
  results/targets; sin tabla outbox en V1 — los resultados son el registro
  auditable de eventos).
- Contador de cambios pendientes.
- **Deuda registrada:** `PRICE_MONITORING_EMAIL_NOTIFICATIONS_V1`, a
  resolver junto con `OPERATIONAL_ACCESS_LAYER_V1` + SMTP.

## 9. Seguridad (checklist vinculante)

1. `CRON_SECRET` jamás impreso. 2. Endpoint cron protegido (500/401/200).
3. Role checks server-side. 4. `organizationId` server-side.
5. `userId` server-side. 6. RLS FORCE en tablas nuevas.
7. SSRF intacto. 8. DNS validation intacta. 9. Redirects máx 5 intactos.
10. Sin crawling. 11. Sin category traversal. 12. Sin headless browser.
13. Sin evasión anti-bot. 14. Sin auto-approve. 15. Sin escrituras BOQ.
16. Sin escrituras AIU. 17. Sin escrituras exports. 18. Batch acotado (25).
19. Locks. 20. Idempotencia.

## 10. Fuera de alcance V1

- SMTP / email (deuda §8). - Aprobación automática. - Aplicación de precios
a BOQ. - Crawling/category traversal. - Headless browser. - Configuración de
`CRON_SECRET` remoto. - Deploy. - db push remoto. - n8n.

## 11. Deudas registradas

- `PRICE_MONITORING_EMAIL_NOTIFICATIONS_V1` (con OPERATIONAL_ACCESS_LAYER_V1 + SMTP).
- `OPERATIONAL_ACCESS_LAYER_V1` (no iniciada).
- `ASSISTED_BUDGET_AGENT_V1` (no iniciada).

## 12. Requirements de release (manuales, fuera de esta fase)

1. Crear `CRON_SECRET` (valor aleatorio ≥32 bytes) en Vercel → Production.
2. Confirmar Root Directory del proyecto Vercel (`apps/web` asumido); mover
   `vercel.json` si difiere.
3. `supabase db push` de las migraciones de monitoreo (gate dry-run estricto).
4. Verificar registro del cron en el panel (Settings → Cron Jobs) tras el
   primer deploy de producción.
