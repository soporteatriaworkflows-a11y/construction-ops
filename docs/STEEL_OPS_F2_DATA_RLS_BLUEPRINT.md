# STEEL OPS — F2 Data / RLS / DB Blueprint

**Fecha:** 2026-07-03 · **Estado:** BLUEPRINT — F2 (propuesta técnica).
**Alcance:** SOLO documentación. Sin código ejecutable, sin migraciones
reales, sin Supabase, sin db push, sin RLS real, sin .env, sin Vercel, sin
deploy, sin producción, sin tocar UIX ni `app/(dashboard)/steel` ni
`modules/steel` ni APU/BOQ/catálogo existentes.
**Rama:** `feature/steel-ops-f2-data-blueprint` (independiente de
`feature/steel-ops-uix-heavy-wave` / PR #38 — no se toca).
**Documento padre:** `docs/design-references/STEEL_OPS_V1_BLUEPRINT.md`
(este blueprint desarrolla su fase **F2 — Modelo de datos + RLS + harness**,
§20 del V1).

---

## 0. Cómo leer este paquete de documentos

| Documento | Contenido | Agentes responsables |
|---|---|---|
| `STEEL_OPS_F2_DATA_RLS_BLUEPRINT.md` (este) | Visión consolidada, principios, integración con precios/proveedores (Agente 3) y con APU/BOQ (Agente 4), desviaciones vs V1, decisiones abiertas | Agente 0 (orquestador) + 3 + 4 |
| `STEEL_OPS_F2_SCHEMA_DRAFT.md` | Modelo de datos completo: 15 entidades con campos, FKs, índices, constraints, estados y auditoría + estrategia de archivos fuente | Agente 1 (Data Model) + Agente 5 (Import/Source) |
| `STEEL_OPS_F2_RLS_TEST_PLAN.md` | Estrategia RLS multiempresa (FORCE, roles, lecturas/escrituras separadas) + plan de pruebas F2 completo (harness `[ST]`, QA) | Agente 2 (RLS) + Agente 7 (Test/QA) |
| `STEEL_OPS_F2_MIGRATION_SAFETY_PLAN.md` | Orden de migraciones, gates, rollback, feature flags + registro de riesgos con mitigaciones | Agente 6 (Migration Safety) + Agente 8 (Risk) |

Nada de este paquete es ejecutable. Todo pseudo-DDL o pseudopolítica está
marcado como borrador. La implementación real ocurrirá en una oleada
posterior, EN RAMA, detrás de `STEEL_OPS_DB_APPLY_GATE`, y jamás llegará a
producción sin aprobación humana explícita.

---

## 1. Oleada multiagente F2 (registro de ejecución)

Oleada docs-only ejecutada con subagentes reales en paralelo, coordinados
por el orquestador (Agente 0). Responsabilidades separadas y archivos
propios por agente (cero colisión de archivos):

| Agente | Rol | Entregable |
|---|---|---|
| 0 | Orquestador: rama, repo, alcance docs-only, commit, PR (sin merge) | este documento + PR |
| 1 | Data Model Architect | `STEEL_OPS_F2_SCHEMA_DRAFT.md` §entidades |
| 2 | RLS / Multiempresa | `STEEL_OPS_F2_RLS_TEST_PLAN.md` §RLS |
| 3 | Price / Supplier Integration | §4 de este documento |
| 4 | APU / BOQ Integration | §5 de este documento |
| 5 | Import / Source File | `STEEL_OPS_F2_SCHEMA_DRAFT.md` §fuentes |
| 6 | Migration Safety | `STEEL_OPS_F2_MIGRATION_SAFETY_PLAN.md` §migraciones |
| 7 | Test / QA | `STEEL_OPS_F2_RLS_TEST_PLAN.md` §pruebas |
| 8 | Risk | `STEEL_OPS_F2_MIGRATION_SAFETY_PLAN.md` §riesgos |

---

## 2. Principios rectores (no negociables)

1. **Una sola fuente de verdad de precios.** Steel NO crea catálogo ni
   tabla de precios paralela. La fuente viva sigue siendo `resources` +
   `suppliers` + `supplier_products` + `price_observations` (histórico por
   producto de proveedor) + `resource_price_observations` (pipeline
   operativo de Price Intelligence: `pending/approved/rejected`, review
   center, monitoring). Steel **consume** precios aprobados y **alimenta**
   ese pipeline con observaciones `pending` desde quotes — nunca aprueba.
2. **Una sola jerarquía de obra.** Se reutiliza `project_scopes`
   (torre/piso/etapa/paquete anidados). Cero tablas nuevas de jerarquía;
   `zone`/`work_front` son atributos libres de línea.
3. **Steel extiende, no duplica.** FKs hacia `projects`, `project_scopes`,
   `resources`, `suppliers`, `apu_templates`, `boq_items`,
   `estimate_versions`. Ninguna FK entrante desde tablas existentes hacia
   `steel_*` en F2 (módulo droppable en rollback extremo).
4. **Snapshots para trazabilidad, fuente viva en el catálogo.** Al costear
   un takeoff o aprobar un pedido, el precio queda snapshoteado en la
   línea/pedido con referencia y fecha. El drift posterior genera alerta,
   nunca recálculo silencioso. Espejo de la regla de presupuestos emitidos.
5. **RLS ENABLE+FORCE desde la migración 1** en toda tabla `steel_*`, con
   lecturas y escrituras separadas (sin `FOR ALL`, lección V5.6.5A) y
   `consulta` sin acceso a Steel Ops V1.
6. **Aprobación humana en cada frontera:** interpretación → cantidades →
   vinculación presupuestal → pedido → precio → export.
7. **Auditoría append-only** (`steel_actions`, patrón `apu_manual_actions`
   con `UNIQUE (organization_id, idempotency_key)`).
8. **Sin archivos privados en Git**: los archivos fuente del ingeniero
   viven en Storage privado con hash; en el repo solo fixtures sanitizados.

---

## 3. Modelo de datos — resumen ejecutivo

Detalle completo en `docs/STEEL_OPS_F2_SCHEMA_DRAFT.md`. Las 15 entidades
F2, todas con `organization_id` + `project_id` (directo o derivado) + RLS
FORCE:

```text
steel_takeoffs          cabecera del estudio de acero por proyecto
steel_source_files      archivos fuente (Excel/PDF) con hash y estado de parseo
steel_elements          elemento estructural (columna, viga, zapata…) con scope
steel_lines             tabla normalizada central (una fila = una posición)
steel_line_alerts       alertas materializadas por línea + acknowledgements
steel_cut_plans         plan de corte por grupo de compatibilidad
steel_cut_plan_items    cortes normalizados por barra comercial (fila = corte)
steel_offcuts           banco de sobrantes con estados y ahorro
steel_orders            pedido (inmutable tras approved)
steel_order_lines       agregado comercial por spec+longitud+tratamiento
steel_order_receipts    recepciones parciales (fase obra)
steel_supplier_quotes   RFQ/cotización por proveedor con vigencia
steel_quote_lines       líneas de cotización (precio por kg/ml/unidad)
steel_apu_boq_links     vínculos steel ↔ recurso/APU/BOQ/presupuesto con estados
steel_actions           auditoría append-only con idempotency_key
```

Cadena de pertenencia: `organizations → projects → steel_takeoffs →
steel_elements → steel_lines`, con `project_scopes` para torre/piso y
`steel_source_files` como procedencia documental de cada línea.

---

## 4. AGENTE 3 — Integración con precios y proveedores

### 4.1 Qué existe hoy (verificado en `docs/DATABASE_SCHEMA.md`)

| Pieza existente | Rol | Regla vigente |
|---|---|---|
| `resources` | recurso maestro por org (`UNIQUE (organization_id, code)`; `external_reference`/`external_sku` para matching) | única identidad de material |
| `suppliers` / `supplier_products` | oferta de un recurso por proveedor (SKU/URL 🔒) | multi-proveedor por recurso |
| `price_observations` | histórico append-only por `supplier_product_id` (`source_type` CHECK de 7 valores, incluye `quotation`) | RLS bloquea UPDATE/DELETE salvo aprobación |
| `resource_price_observations` | pipeline operativo por `resource_id`: estados `pending/approved/rejected`, review center, aprobación masiva por lote, `import_batch_id` | importar/monitorear NUNCA aprueba |
| `price_monitor_targets/runs/results` | monitoreo automático con idempotencia | el monitor nunca aprueba |
| `pricing_rules` | variación preventiva, descuento negociado (🔒), impuestos | fórmulas Q8 canónicas |

### 4.2 Reglas de integración F2

1. **Steel no crea catálogo paralelo.** Una spec de acero se materializa
   como extensión técnica 1:1 opcional de `resources`
   (`steel_specs.resource_id` FK UNIQUE, según V1 §4). Crear una spec sin
   recurso es posible en borrador; promoverla a recurso del catálogo
   general pasa por el flujo de creación/aprobación existente del catálogo,
   nunca automático.
2. **Precio de costeo = última observación APROBADA del recurso**, misma
   regla que `create_manual_apu` (re-resuelta server-side, jamás confiada
   al cliente). Sin precio aprobado ⇒ la línea queda "sin precio" y genera
   alerta A10; no se inventa precio.
3. **Quotes alimentan el pipeline, no lo puentean.** Al seleccionar/aprobar
   una `steel_supplier_quote`, Steel puede **emitir** una observación al
   pipeline general con estado `pending` y aprobación humana en el review
   center existente. Para no alterar tablas existentes en F2, se reutiliza
   el `source_type='quotation'` ya presente en el CHECK, con
   `source_reference` apuntando a la quote line (`steel_quote_lines.id`) y
   metadata de trazabilidad. **No se modifica el CHECK existente** (hacerlo
   sería migración sobre tabla viva → fuera de alcance F2; queda como
   decisión abierta D-F2-3 si se prefiere un valor `steel_quote` dedicado).
4. **Vigencia y "precio vencido" viven en Steel, no en el catálogo.**
   `steel_supplier_quotes.valid_until` es dato de la cotización; `expired`
   es SIEMPRE derivado en lectura (`valid_until < now()`), nunca columna de
   estado almacenada (regla del proyecto: no persistir estado derivado,
   mismo criterio que `isStale` de 3A).
5. **Capas de precio por línea/pedido:**
   - `estimated` — costeo con precio aprobado del catálogo (snapshot).
   - `supplier` — precio ofertado en quote (vigencia + disponibilidad +
     moneda + condiciones).
   - `approved` — precio del pedido aprobado (snapshot inmutable, con
     `approved_by/approved_at`).
   Conversiones kg ↔ ml ↔ unidad comercial se derivan del peso unitario
   snapshoteado en la línea (`unit_weight_kg_m_snapshot`), nunca de la
   spec viva (que puede cambiar).
6. **Historial**: lo da el pipeline existente; la UI futura de catálogo
   steel solo lo filtra a recursos de acero. F2 no crea tabla de historial.
7. **Pedidos y compras reales:** `steel_orders` es pedido operativo del
   módulo; cuando exista el módulo de compras (`purchase_records/items`,
   provisional v0), la conciliación pedido↔factura se hará por FK desde
   compras hacia `steel_orders` (dirección compras→steel, no al revés),
   preservando la regla de cero FKs entrantes hasta que compras se congele.
8. **Privacidad 🔒:** precios de proveedor, descuentos y comparadores son
   internos. El export de pedido a proveedor incluye SOLO el pedido propio
   (cantidades + specs), sin precios internos, sin otros proveedores, sin
   descuentos (regla no negociable 4 y V1 §12).

### 4.3 Anti-drift

El snapshot de precio en línea/pedido guarda: valor, moneda, referencia a
la observación/quote origen (`price_ref_kind` + `price_ref_id`), y fecha.
El dominio compara snapshot vs precio aprobado vigente y emite alerta A11
("precio vigente difiere del snapshot" / "precio vencido") — nunca
recalcula un takeoff `locked` ni un pedido `approved`.

---

## 5. AGENTE 4 — Integración con APU y BOQ

### 5.1 Qué existe hoy (verificado)

- `apu_templates` / `apu_components` (con procedencia de importación),
  `apu_calculation_snapshots` — fuente única de cálculo en `modules/apu`.
- `boq_items` con `apu_template_id` y snapshots congelados
  (`quantity_snapshot`, `unit_price_snapshot`, `subtotal`).
- `estimate_versions` con estados `draft/review/approved/issued/archived`;
  emitidas = inmutables (regla global 2 y 3).
- Escrituras al BOQ SOLO por RPCs existentes con guards
  (`add_apu_to_boq`, `update_boq_item_quantity` — issued guard, snapshot
  server-side, auditoría).

### 5.2 Modelo de vínculo: `steel_apu_boq_links`

El V1 (§4) proponía columnas FK directas (`boq_item_id`/`apu_template_id`
en elemento/línea). El mandato F2 exige una tabla explícita de vínculos con
estados; se adopta la tabla (desviación documentada en §7) porque aporta lo
que las columnas no pueden: estado del vínculo, actor, evidencia y
sugerencias sin contaminar la fila operativa.

Tipos de vínculo (detalle de campos en `STEEL_OPS_F2_SCHEMA_DRAFT.md`):

| Vínculo | De → A | Uso |
|---|---|---|
| línea → recurso | `steel_lines` → `resources` | identidad de catálogo del acero |
| línea/elemento → actividad | `steel_lines`/`steel_elements` → `boq_items` | acero por actividad/capítulo |
| línea/elemento → APU | → `apu_templates` | el acero que un APU presupone |
| takeoff → presupuesto | `steel_takeoffs` → `estimate_versions` | comparar acero real vs presupuestado |
| pedido → presupuesto | `steel_orders` → `estimate_versions` | pedido contra qué versión se justifica |
| precio proveedor → recurso | `steel_quote_lines` → `resources` | puente §4.2.3 al pipeline de precios |

### 5.3 Estados del vínculo (mandato F2)

```text
no_vinculado   (ausencia de fila, o fila rechazada)
sugerido       propuesto por matching/parser, con confidence y evidencia
vinculado      confirmado por un humano (actor + fecha)
aprobado       validado a nivel takeoff/pedido por rol autorizado
```

Reglas de transición: solo humanos pasan de `sugerido` a `vinculado`
(espejo del matching congelado de APU import: exactos automáticos solo
como sugerencia fuerte; la descripción sola JAMÁS vincula). `aprobado`
requiere rol autorizado y queda auditado en `steel_actions`. Rechazar deja
rastro (fila con estado terminal), no borra.

### 5.4 Regla dura: el BOQ real NUNCA se modifica automáticamente

- Los vínculos son **lectura y reporte**: totales de acero por actividad,
  actividades sin acero, acero sin actividad (alertas A8/A18).
- Si el usuario decide llevar algo al presupuesto (crear ítem desde APU,
  actualizar cantidad), eso ocurre por los **RPCs existentes** con su
  aprobación humana y guards de versión emitida — Steel no añade ningún
  camino de escritura nuevo al BOQ en F2.
- Versiones `issued/approved/archived` jamás se recalculan; un vínculo a
  una versión emitida es solo trazabilidad histórica.
- Dirección de las FKs: siempre desde `steel_*` hacia APU/BOQ (nullable,
  `ON DELETE SET NULL`); cero columnas nuevas en tablas existentes en F2.

---

## 6. Resúmenes de los documentos de detalle

### 6.1 RLS / multiempresa (`STEEL_OPS_F2_RLS_TEST_PLAN.md`)

- ENABLE+FORCE desde la migración 1 en las 15 tablas.
- Org-scoped vía `app.current_org()`; project-scoped consciente de grants
  (`app.is_client_role()` / `app.has_project_grant()`) aunque `consulta`
  NO ve Steel V1 (deny total de SELECT — fail-closed si algún día se
  expone).
- Matriz por rol (admin, gerencia, presupuestos, compras, obra, consulta)
  con lecturas y escrituras en políticas separadas; mutaciones críticas
  (aprobar takeoff/pedido, emitir precio) solo vía RPC con guards.
- `steel_actions` y `steel_line_alerts` (historial) append-only.
- Harness `scripts/rls-runtime` gana sección `[ST]` con checks de
  aislamiento cross-org, deny de consulta, append-only, inmutabilidad de
  pedidos aprobados y nuevo FORCE count esperado.

### 6.2 Archivos fuente e importación (`STEEL_OPS_F2_SCHEMA_DRAFT.md` §fuentes)

- Excel / PDF con texto / PDF escaneado (futuro) en bucket privado
  `steel-sources/{org}/{project}/…` + `sha256` + tamaño + estado de parseo.
- Toda línea conserva: archivo, página/hoja, tabla fuente, descripción
  original, interpretación estructurada (`parsed_description`),
  `parser_version`, `confidence_score`, `needs_review` y la corrección
  humana como evento auditado.
- Regla absoluta: ningún archivo real del ingeniero entra a Git; fixtures
  sanitizados para tests.

### 6.3 Migraciones seguras (`STEEL_OPS_F2_MIGRATION_SAFETY_PLAN.md`)

1. M1 tablas base vacías (aditiva pura, cero efecto runtime) →
2. M2 RLS FORCE + políticas →
3. M3 seeds revisables (specs #2–#18, perfiles; aprobados por la usuaria)
   →
4. M4 integración controlada (RPCs, puente a observaciones).
   Gate explícito `STEEL_OPS_DB_APPLY_GATE` (patrón V5_6_4/V5_6_5A), dry-run
   con lista exacta, solo aditivas, post-verify por schema dump, local
   primero (`db reset` + harness), rollback = flag off + módulo droppable.
   Doble candado: env `STEEL_OPS_ENABLED` + matriz `ACCESS_MODULES.steel`.

### 6.4 QA (`STEEL_OPS_F2_RLS_TEST_PLAN.md` §pruebas)

Tests de schema, RLS, permisos, fixtures, integración con `project_id`,
NO-regresión (suite completa + `gm:regression` 22/22 + APU/BOQ/catálogo
intactos), auditoría, snapshots de precios y pedidos. Criterio de salida
antes de cualquier merge.

---

## 7. Desviaciones respecto al blueprint V1 (documentadas)

| Tema | V1 decía | F2 propone | Justificación |
|---|---|---|---|
| Alertas | NO tabla; computadas en dominio, solo acks persistidos (`alerts_ack` jsonb) | `steel_line_alerts` materializada + acks | mandato F2 explícito; permite historial auditable, ack por fila con actor/fecha y notificaciones futuras (cron). La evaluación sigue siendo del dominio puro; la tabla es una materialización re-generable, nunca fuente de verdad. Reconciliación: mantener el evaluador puro como única lógica; la tabla solo persiste instancias + acks |
| Plan de corte | `steel_cut_plan_bars` (barra con cortes en JSONB) | `steel_cut_plan_items` normalizada (fila = corte; la barra es el grupo `bar_sequence`) | renombre del mandato F2 + normalización: consultable en SQL, trazable corte↔línea sin parsear JSONB |
| Vínculos APU/BOQ | columnas FK en elemento/línea | tabla `steel_apu_boq_links` con estados; se retiran las FK directas de líneas/elementos | mandato F2; aporta estado/actor/evidencia/sugerencias (§5.2) y evita doble verdad. Reintroducir FKs como caché de lectura solo si el volumen lo exige — decisión D-F2-2 |
| `steel_specs` | entidad central del V1 | NO está en la lista F2 de 15 entidades | F2 no la elimina: sigue siendo necesaria (pesos normativos, longitudes comerciales). Queda referenciada por `steel_lines`/`steel_quote_lines` y su congelamiento formal se hace en el schema draft como entidad de soporte — decisión D-F2-1 |

## 8. Decisiones abiertas para la usuaria (antes de implementar F2)

- **D-F2-1**: confirmar que `steel_specs` (extensión técnica 1:1 de
  `resources`) entra al congelamiento F2 como entidad de soporte n.º 16,
  o si sus campos se absorben en `steel_lines` (no recomendado: duplicaría
  pesos normativos por fila).
- **D-F2-2**: ¿mantener columnas FK de conveniencia (`boq_item_id`,
  `apu_template_id`) en línea/elemento como caché del vínculo confirmado,
  o navegar siempre por `steel_apu_boq_links`? Recomendación: solo la
  tabla en F2; añadir caché únicamente si el volumen lo exige (medible).
- **D-F2-3**: ¿reutilizar `source_type='quotation'` para observaciones
  emitidas desde quotes (cero cambios a tablas existentes) o ampliar el
  CHECK con `steel_quote` en una migración posterior aprobada?
  Recomendación: `quotation` en F2.
- **D-F2-4**: matriz de roles — ¿`compras` y `obra` escriben desde la
  primera activación o entran por fases (V1 D1)? El RLS plan propone la
  matriz completa; la activación es del rollout, no del esquema.
- Persisten D2–D5 del V1 (plantilla interna real, longitudes comerciales y
  kerf default, notificación de pedido, umbral de desperdicio).

## 9. Confirmación de alcance (Agente 0)

- ✅ Solo se crean/modifican archivos bajo `docs/`.
- ✅ Sin migraciones, sin SQL ejecutable, sin Supabase/db push, sin RLS
  real, sin .env, sin Vercel, sin deploy, sin producción.
- ✅ Sin tocar `app/(dashboard)/steel`, `modules/steel`, APU/BOQ/catálogo,
  ni la rama `feature/steel-ops-uix-heavy-wave` (PR #38).
- Siguiente compuerta: revisión humana del paquete F2 → congelar contrato
  → oleada de implementación EN RAMA (migraciones gated, sin efecto en
  producción) según `STEEL_OPS_F2_MIGRATION_SAFETY_PLAN.md`.
