# STEEL OPS F2 — Blueprint RLS multiempresa + Plan de pruebas

**Fecha:** 2026-07-03 · **Estado:** BLUEPRINT — F2 (sin SQL definitivo, sin
migraciones) · **Owners:** Agente 2 (RLS/Multiempresa) + Agente 7 (Test/QA)
· **Rama:** `feature/steel-ops-f2-data-blueprint` · **Alcance:** solo docs.

Este documento diseña la estrategia de seguridad a nivel de fila (RLS) para
las 15 tablas `steel_*` de la fase F2 y el plan de pruebas completo que
condiciona cualquier merge. **Nada de lo aquí escrito es SQL ejecutable**:
las pseudopolíticas describen predicados; la implementación real vivirá en
migraciones futuras detrás de la compuerta `STEEL_OPS_DB_APPLY_GATE`.

Documentos hermanos: `STEEL_OPS_F2_DATA_RLS_BLUEPRINT.md` (principal),
`STEEL_OPS_F2_SCHEMA_DRAFT.md` (modelo), `STEEL_OPS_F2_MIGRATION_SAFETY_PLAN.md`
(orden de migraciones y rollback). Base: `design-references/STEEL_OPS_V1_BLUEPRINT.md`
§4 (RLS) y §17 (flags).

---

## 1. Patrones existentes verificados en el repo (fuente de verdad)

Steel Ops F2 NO inventa infraestructura de seguridad: reutiliza los helpers
y patrones ya migrados y validados por el harness. Verificado en código:

| Patrón / helper | Dónde está definido | Uso en Steel F2 |
|---|---|---|
| `app.current_org()` | `supabase/migrations/20260530090000_extensions_and_helpers.sql:22` (redefinido JWT-based en `20260601090000_auth_identity_helpers.sql:138`) | predicado org-scoped de TODAS las políticas `steel_*` |
| `app.current_role()` | `20260530090000:38` / `20260601090000:154` | matriz de roles por operación |
| `app.current_org_user()` | `20260530091000_rls_policies.sql:38` / `20260601090000:170` | autoría (`created_by`, `approved_by`) |
| `app.is_client_role()` | `20260702100000_v5_6_5a_client_rls_full_chain.sql:46` | deny total a `consulta`/`client` en V1 |
| `app.has_project_grant(p_project_id)` | `20260702090100_rls_project_access_grants.sql:50` | reservado para una futura exposición a cliente (V1: no aplica porque consulta está denegada) |
| `app.estimate_version_locked(p_version_id)` | `20260530091000:25` | referencia de patrón para inmutabilidad de takeoffs `locked` y pedidos `approved` |
| ENABLE + FORCE ROW LEVEL SECURITY | 49 sentencias `FORCE` en 14 migraciones (p. ej. `20260618090000_apu_manual_builder.sql:67-68`) | obligatorio en las 15 tablas desde la migración 1 |
| Append-only (solo SELECT + INSERT, sin UPDATE/DELETE) | `apu_manual_actions` (`20260618090000:34-74`), `price_observations`, `resource_price_observations` | `steel_actions` |
| Idempotencia `UNIQUE (organization_id, idempotency_key)` parcial | `apu_manual_actions_org_idempotency_uq` (`20260618090000:59-61`) | `steel_actions` + RPCs de mutación crítica |
| Split SELECT/INSERT/UPDATE/DELETE, prohibido `FOR ALL` | lección V5.6.5A (`20260702100100` hizo split de 6 `FOR ALL` heredados) | ninguna política `steel_*` nace `FOR ALL` |
| Harness runtime | `scripts/rls-runtime/run.ts` — pre-flight actual: **43 tablas con RLS FORCE** (`run.ts:190`); secciones `[GR]` (línea 3186) y `[FC]` (línea 3403) | nueva sección `[ST]` |

---

## 2. Principios RLS de Steel Ops F2 (mandato Agente 2)

### 2.1 RLS FORCE desde la primera migración

- Las 15 tablas `steel_*` nacen con `ENABLE ROW LEVEL SECURITY` **y**
  `FORCE ROW LEVEL SECURITY` **en la misma migración que las crea** (no en
  una migración RLS posterior separable). Nunca existe una ventana en la
  que una tabla steel sea legible sin políticas.
- El pre-flight del harness sube de 43 a **58** tablas FORCE (43 + 15).
- Ninguna tabla `steel_*` concede permisos a `anon`; el rol de conexión es
  `authenticated` bajo claims JWT, igual que el resto del sistema.

### 2.2 Alcance por organización y por proyecto

- **Capa 1 (organización, obligatoria en todas):** toda fila lleva
  `organization_id NOT NULL` y todo predicado empieza por
  `organization_id = app.current_org()`. Fail-closed: sin claim de org, cero
  filas.
- **Capa 2 (proyecto, denormalizada):** las tablas ancladas a obra
  (`steel_takeoffs`, `steel_source_files`, `steel_elements`, `steel_lines`,
  `steel_line_alerts`, `steel_cut_plans`, `steel_cut_plan_items`,
  `steel_offcuts`, `steel_orders`, `steel_order_lines`,
  `steel_order_receipts`, `steel_apu_boq_links`) llevan `project_id`
  denormalizado y validado por trigger same-org (patrón
  `app.check_rpo_batch_same_org()`), de modo que una futura cascada
  project-scoped sea un predicado local sin JOIN de 4 saltos (lección
  V5.6.5A: las cadenas largas se cierran con `EXISTS` sobre la RLS de
  `projects`).
- **Cliente/consulta:** V1 es módulo interno. El predicado de TODAS las
  políticas `steel_*` incluye `NOT app.is_client_role()` tanto en SELECT
  como en escrituras. `app.has_project_grant()` queda documentado como el
  mecanismo a activar si algún día se expone una proyección a cliente; no
  se usa en V1.

### 2.3 Matriz de permisos por rol (DB-layer, V1)

Roles: `admin`, `gerencia`, `presupuestos`, `compras`, `obra`, `consulta`.
Convención: **R** = SELECT · **W** = INSERT/UPDATE por política ·
**RPC** = mutación solo vía función con guards (sin UPDATE directo) ·
**—** = denegado.

| Tabla | admin | gerencia | presupuestos | compras | obra | consulta |
|---|---|---|---|---|---|---|
| `steel_takeoffs` | R+W+RPC | R+W+RPC | R+W+RPC | R | R | — |
| `steel_source_files` | R+W | R+W | R+W | R | R | — |
| `steel_elements` | R+W | R+W | R+W | R | R | — |
| `steel_lines` | R+W | R+W | R+W | R | R | — |
| `steel_line_alerts` | R+W(ack) | R+W(ack) | R+W(ack) | R | R | — |
| `steel_cut_plans` | R+W | R+W | R+W | R | R | — |
| `steel_cut_plan_items` | R+W | R+W | R+W | R | R | — |
| `steel_offcuts` | R+W | R+W | R+W | R | R | — |
| `steel_orders` | R+RPC | R+RPC | R+RPC | R+RPC | R | — |
| `steel_order_lines` | R+RPC | R+RPC | R+RPC | R+RPC | R | — |
| `steel_order_receipts` | R+RPC | R+RPC | R | R+RPC | R (V1; W diferida a modo obra F8) | — |
| `steel_supplier_quotes` | R+W | R+W | R | R+W | — | — |
| `steel_quote_lines` | R+W | R+W | R | R+W | — | — |
| `steel_apu_boq_links` | R+RPC | R+RPC | R+RPC | R | R | — |
| `steel_actions` | R+I | R+I | R+I | R+I | R | — |

Notas de la matriz:

- **`consulta` no ve Steel Ops V1** (regla dura): deny total de SELECT y
  escrituras en las 15 tablas. No es "sin política que la incluya": es
  exclusión explícita `NOT app.is_client_role()` + rol fuera de la lista,
  para que el deny sobreviva a refactors de políticas.
- **`obra` es solo-lectura en V1.** La escritura de recepciones
  (`steel_order_receipts`) se habilitará con el modo obra (F8) mediante
  decisión explícita (blueprint V1, decisión abierta D1); registrarla en
  `DECISIONS.md` cuando ocurra.
- **`compras` no edita cantidades** (`steel_lines`, takeoffs): puede leer
  todo lo necesario para pedir, y escribir únicamente el circuito comercial
  (pedidos, quotes, recepciones) — siempre pasando por RPC en los
  estados críticos.
- **`steel_supplier_quotes`/`steel_quote_lines` contienen precio sensible**:
  `obra` no las lee (paridad con la política de privacidad de descuentos).
- **`steel_actions`**: `R+I` = SELECT org-scoped + INSERT append-only;
  nadie tiene UPDATE/DELETE (ver §2.5).

La matriz app-layer (`ACCESS_MODULES.steel` + `requireModuleAccess`) es un
espejo más restrictivo de esta tabla y nunca la sustituye: la barrera real
es la DB.

### 2.4 Separación de lecturas y escrituras

- Cada tabla define políticas separadas `<tabla>_select`, `<tabla>_insert`,
  `<tabla>_update` y (donde aplique) `<tabla>_delete`. **Prohibido
  `FOR ALL`** (deuda que V5.6.5A tuvo que pagar con split retroactivo).
- Todo `INSERT`/`UPDATE` lleva `WITH CHECK` que revalida org, rol y — donde
  hay FK a proyecto/takeoff — que el padre pertenece a la misma org
  (patrón `WITH CHECK` cruzado de `20260622090100_rls_schedule_from_boq`).
- `DELETE` físico solo existe donde el modelo lo permite (borradores:
  líneas/elementos/planes de corte en takeoff `draft`). Takeoffs, pedidos,
  quotes, recepciones y auditoría **no se borran**: se archivan o cancelan
  por estado.
- Pseudopolítica de referencia (blueprint, NO ejecutable):

```text
steel_lines_select : USING organization_id = app.current_org()
                     AND NOT app.is_client_role()
steel_lines_update : USING  <select> AND app.current_role() IN
                     ('admin','gerencia','presupuestos')
                     AND takeoff_no_bloqueado(steel_takeoff_id)
                     WITH CHECK <mismo predicado>
```

### 2.5 Auditoría append-only y mutaciones críticas vía RPC

- **`steel_actions`** replica el patrón `apu_manual_actions`: políticas
  SOLO de SELECT (org-scoped, roles internos) e INSERT (roles escritores);
  sin política de UPDATE ni DELETE ⇒ denegados bajo FORCE. Índice único
  parcial `(organization_id, idempotency_key) WHERE idempotency_key IS NOT
  NULL`; replay de la misma clave devuelve el resultado registrado.
- **Mutaciones críticas SOLO vía RPC** (SECURITY INVOKER, guards de rol +
  estado + org, escritura de `steel_actions` en la misma transacción,
  idempotencia por clave): aprobar/bloquear takeoff, aprobar pedido,
  registrar recepción, seleccionar quote, emitir `price_observation` al
  pipeline general, importar lote de líneas, aplicar plan de corte.
- **Inmutabilidad por estado** (espejo de `app.estimate_version_locked`):
  helper de blueprint `steel_takeoff_locked(takeoff_id)` y
  `steel_order_approved(order_id)` en los predicados de UPDATE de las
  tablas hijas: takeoff `locked` ⇒ líneas/elementos/planes congelados;
  pedido `approved+` ⇒ pedido y líneas congelados (cambios = adenda nueva
  auditada, nunca UPDATE).

### 2.6 Pruebas RLS mínimas — sección nueva `[ST]` del harness

Extensión de `scripts/rls-runtime/run.ts` (patrón de las secciones `[GR]`
y `[FC]`): **26 checks** propuestos.

| # | Check `[ST]` |
|---|---|
| ST-01 | Pre-flight: 58 tablas con RLS FORCE (43 + 15 `steel_*`) |
| ST-02 | Las 15 tablas tienen políticas split (0 políticas `FOR ALL` en `steel_*`) |
| ST-03 | Org B lee 0 filas de `steel_takeoffs`/`steel_lines`/`steel_orders` sembradas en org A |
| ST-04 | INSERT cross-org denegado (`organization_id` ajeno en `steel_takeoffs`) |
| ST-05 | Cascada: `steel_lines` y `steel_order_lines` de org A invisibles vía PostgREST para usuario org B |
| ST-06 | Anti fail-open `consulta`: SELECT = 0 filas en **las 15** tablas (loop) |
| ST-07 | Paridad claim `client`: mismo deny total que `consulta` |
| ST-08 | `consulta`: INSERT/UPDATE/DELETE denegados en tablas representativas (takeoffs, lines, orders, actions) |
| ST-09 | `obra`: SELECT permitido en `steel_takeoffs`/`steel_lines`; INSERT/UPDATE denegados |
| ST-10 | `obra`: SELECT denegado (0 filas) en `steel_supplier_quotes`/`steel_quote_lines` |
| ST-11 | `compras`: UPDATE directo de `steel_lines` denegado |
| ST-12 | `compras`: circuito comercial permitido vía RPC (crear pedido borrador) |
| ST-13 | `presupuestos`: escritura de takeoff/líneas permitida; aprobación de pedido según decisión de matriz |
| ST-14 | `steel_actions`: INSERT ok con rol escritor; UPDATE denegado; DELETE denegado |
| ST-15 | `steel_actions`: replay de `idempotency_key` no duplica fila (índice único parcial) |
| ST-16 | RPC aprobar takeoff: rol no autorizado ⇒ error tipado; autorizado ⇒ estado + fila de auditoría |
| ST-17 | Takeoff `locked`: UPDATE de `steel_lines`/`steel_elements` denegado; control positivo en `draft` |
| ST-18 | Pedido `approved`: UPDATE de `steel_orders`/`steel_order_lines` denegado; control positivo en `draft` |
| ST-19 | `cancelled` solo alcanzable desde estados no aprobados (guard de transición del RPC) |
| ST-20 | Recepción sobre pedido no aprobado ⇒ rechazada por RPC |
| ST-21 | Trigger same-org: FK a `project_id`/`supplier_id` de otra org ⇒ rechazo |
| ST-22 | `steel_apu_boq_links`: crear vínculo NO muta `boq_items` (snapshot BOQ intacto tras el RPC) |
| ST-23 | Emisión de precio desde quote crea `price_observation` `pending` (nunca `approved`) |
| ST-24 | Snapshot de precio en línea/pedido no cambia cuando llega una observación aprobada nueva |
| ST-25 | Usuario sin organización: 0 filas y escrituras denegadas en `steel_*` |
| ST-26 | Regresión: los checks previos del harness (secciones 1–[FC]) siguen en verde con las tablas steel presentes |

Criterio: `[ST]` corre dentro del harness completo tras
`supabase db reset --local`; **0 FAIL** es condición de merge de la fase de
modelo (cuando exista; en F2-docs no se implementa nada).

---

## 3. Plan de pruebas F2 (mandato Agente 7)

Herramientas estándar del repo: **vitest** (suite `pnpm test`), **harness
RLS** (`scripts/rls-runtime/run.ts` contra Postgres local), **db reset
local** (`supabase db reset --local`), regresión financiera
(`gm:regression`). Ninguna prueba toca Supabase Cloud.

### 3.1 Tests de schema

- **Objetivo:** la estructura creada por las migraciones coincide con el
  draft (`STEEL_OPS_F2_SCHEMA_DRAFT.md`) y es estable.
- **Casos mínimos:** existencia de las 15 tablas; columnas
  `organization_id`/`project_id` NOT NULL donde aplica; FKs con la acción
  ON DELETE documentada; CHECKs de estados (enums de takeoff/pedido/quote/
  sobrante); defaults (`status='draft'`, timestamps); índices únicos
  (idempotencia, `UNIQUE` de dedupe); tipos `NUMERIC` para kg/ml/dinero
  (política Q9, nunca float).
- **Herramienta:** harness (queries a `information_schema`/`pg_catalog`
  post-reset) + tests estáticos vitest sobre el mirror drizzle.
- **Criterio de salida:** db reset limpio aplica todas las migraciones +
  seeds sin errores; checks de estructura en verde.

### 3.2 Tests RLS

- Sección `[ST]` completa (§2.6). Herramienta: harness. Criterio: 0 FAIL
  y FORCE count exacto (58).

### 3.3 Tests de permisos por rol

- **Objetivo:** paridad app-layer ↔ DB-layer; la superficie nunca es el
  control.
- **Casos mínimos:** `ACCESS_MODULES.steel` excluye `consulta`;
  `requireModuleAccess('steel')` redirige denegados; server actions
  rechazan roles fuera de matriz aunque el guard de página se salte
  (llamada directa); flag `STEEL_OPS_ENABLED` off ⇒ not-found para todos;
  DB-layer cubierto por ST-06..ST-13.
- **Herramienta:** vitest (unit + route/static tests, patrón
  `module-access`/`surface-visibility`) + harness.
- **Criterio:** anti fail-open probado para cada rol de la matriz.

### 3.4 Tests de fixtures

- **Objetivo:** datos steel de prueba realistas y **sanitizados** (regla 8
  y 12 de CLAUDE.md: sin Excel reales, sin clientes, sin precios
  contractuales reales).
- **Casos mínimos:** fixture de takeoff con líneas de las 3 familias
  (rebar/concrete_element/structural_steel); pesos kg/m normativos del seed
  de specs; validación de que ningún fixture contiene nombres de cliente ni
  archivos privados (scan estático); el fixture-repository espejo devuelve
  la misma forma que el read-model drizzle.
- **Herramienta:** vitest + script de scan (patrón golden master).
- **Criterio:** fixtures deterministas, reproducibles y sin datos privados.

### 3.5 Tests de integración con project_id / project_scopes

- **Objetivo:** Steel reusa la jerarquía existente, no la duplica.
- **Casos mínimos:** una línea/elemento referencia `project_scope_id`
  existente (torre/piso) y el read-model agrega por scope; scope de otra
  org rechazado (trigger same-org); borrar/archivar lógica de proyecto no
  deja filas steel huérfanas visibles; agregados por piso/torre coinciden
  con la suma de líneas (Decimal, sin float).
- **Herramienta:** harness (DB) + vitest (read-model con fixture).
- **Criterio:** cero tablas nuevas de jerarquía; agregación correcta.

### 3.6 Tests de NO regresión (APU/BOQ/catálogo)

- **Objetivo:** demostrar que F2 no toca nada existente.
- **Casos mínimos:** `gm:regression` **22/22** intacto; suite completa
  previa en verde sin modificar tests existentes; checks del harness
  secciones 1–[FC] intactos (ST-26); `git diff` de la fase de modelo no
  toca `app/(dashboard)`, `modules/` existentes ni migraciones previas;
  ninguna FK entrante desde tablas existentes hacia `steel_*` (rollback
  barato, checklist §23 del blueprint V1).
- **Herramienta:** gm:regression + suite completa + harness + revisión de
  diff en PR.
- **Criterio:** cualquier regresión = STOP (regla 15 del PROJECT_MASTER).

### 3.7 Tests de auditoría

- **Objetivo:** `steel_actions` es evidencia confiable.
- **Casos mínimos:** cada RPC crítica escribe exactamente una fila de
  acción con actor/tipo/metadata; append-only (ST-14); idempotencia
  (ST-15) con replay que devuelve el resultado original sin efecto doble;
  la metadata no contiene secretos ni datos de otra org.
- **Herramienta:** harness + vitest de servicios.
- **Criterio:** 100 % de mutaciones críticas auditadas.

### 3.8 Tests de snapshots de precios

- **Objetivo:** trazabilidad sin doble fuente de verdad (§14 blueprint V1).
- **Casos mínimos:** costear un takeoff congela `unit_price_snapshot` con
  referencia a la observación aprobada usada; una observación aprobada
  posterior NO altera el snapshot (ST-24) y sí dispara la alerta de
  divergencia en dominio puro; quote seleccionada emite observación
  `pending` con `source_type` steel y trazabilidad al pedido (ST-23),
  jamás auto-aprobada; ninguna tabla steel almacena "precio vigente"
  propio (solo snapshots + referencias).
- **Herramienta:** vitest (dominio puro + servicios) + harness.
- **Criterio:** el pipeline `resources`/`supplier_products`/
  `price_observations` sigue siendo la única fuente viva.

### 3.9 Tests de pedidos

- **Objetivo:** el circuito comercial es seguro y auditable.
- **Casos mínimos:** transiciones válidas del estado
  (`draft→rfq_sent→quoted→approved→ordered→partially_received→received→
  closed`; `cancelled` solo pre-aprobación — ST-19); aprobación exige rol
  autorizado + registra `approved_by/approved_at` + acción; pedido
  aprobado inmutable (ST-18); totales del pedido = suma Decimal de líneas;
  recepción parcial acumula sin exceder lo pedido y solo sobre pedidos
  aprobados (ST-20); export de pedido a proveedor no incluye precios
  internos de otros proveedores (cuando exista export, F6).
- **Herramienta:** vitest (dominio de transiciones puro) + harness (RPC).
- **Criterio:** máquina de estados sin transiciones huérfanas; 0 caminos
  de mutación fuera de RPC.

### 3.10 Criterio de salida global antes de cualquier merge de F2-modelo

```text
[ ] typecheck 0 · lint 0 · build 0
[ ] suite vitest completa en verde (sin tests previos modificados)
[ ] gm:regression 22/22
[ ] supabase db reset --local limpio (migraciones + seeds)
[ ] harness RLS completo 0 FAIL, incluida sección [ST] (26 checks)
[ ] FORCE count exacto (58) verificado
[ ] git diff --check limpio; sin archivos privados/Excel reales
[ ] revisión humana del PR; sin db push a Cloud (STEEL_OPS_DB_APPLY_GATE)
```

---

## 4. Riesgos específicos de esta capa (resumen)

| Riesgo | Mitigación en este plan |
|---|---|
| Ventana sin RLS entre crear tabla y crear políticas | FORCE en la misma migración que el CREATE TABLE (§2.1) |
| `FOR ALL` que luego hay que partir (deuda V5.6.5A) | prohibido desde el diseño (§2.4, ST-02) |
| Deny de `consulta` implícito que un refactor rompe | exclusión explícita `NOT app.is_client_role()` + ST-06/07 anti fail-open |
| Mutación de pedidos/takeoffs aprobados | helpers de estado en predicados + RPC-only + ST-17/18 |
| Auditoría editable | append-only sin UPDATE/DELETE + ST-14 |
| Precio paralelo en steel | §3.8: solo snapshots + referencias; pipeline existente es la fuente |
| Drift del conteo FORCE del harness | ST-01 fija 58 y falla ante cualquier tabla nueva sin registrar |
