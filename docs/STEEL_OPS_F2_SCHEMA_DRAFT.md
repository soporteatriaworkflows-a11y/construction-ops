# STEEL OPS — F2 Schema Draft (Modelo de datos)

**Fecha:** 2026-07-03 · **Fase:** F2 (Data/RLS/DB) · **Estado:**
BLUEPRINT — F2. **Sin código, sin migraciones.** Este documento es un
borrador de diseño: ningún bloque es DDL ejecutable ni debe copiarse a
`supabase/migrations/` sin contrato congelado + gate explícito.

**Agentes autores:** Agente 1 (Data Model Architect) + Agente 5
(Import/Source File Agent) de la oleada F2.
**Documento padre:** `docs/STEEL_OPS_F2_DATA_RLS_BLUEPRINT.md`.
**Referencia previa:** `docs/design-references/STEEL_OPS_V1_BLUEPRINT.md` §4.
**Esquema base verificado:** `docs/DATABASE_SCHEMA.md` (contrato congelado
v1 + extensiones hasta V5.6.5A; FORCE count actual = 43).

---

## 0. Principios rectores (no negociables)

1. **Una sola fuente de verdad de precios.** Steel NO crea catálogo ni
   histórico de precios paralelo. Las fuentes vivas siguen siendo:
   - `resources` (recurso maestro por organización),
   - `suppliers` + `supplier_products` (oferta por proveedor),
   - `price_observations` (histórico append-only por `supplier_product_id`,
     contrato v1) y `resource_price_observations` (pipeline vivo de
     inteligencia de precios por recurso: nace `pending`, aprobación humana,
     review center, monitoring, `import_batch_id`).
   Steel **consume** el precio aprobado vigente y **emite** observaciones
   nuevas (desde quotes) hacia ese pipeline; jamás lo duplica. Los campos
   `*_snapshot` en tablas `steel_*` son fotos de trazabilidad, no fuente.
2. **Una sola jerarquía de obra.** Se REUTILIZA `project_scopes`
   (`scope_type IN ('floor','tower','stage','package','unit','modification',
   'other')`, jerarquía por `parent_scope_id`). Torre/piso/etapa = scopes
   existentes; `zone`/`work_front` son atributos de texto libre en la línea.
   Cero tablas nuevas de jerarquía.
3. **Steel extiende, no reemplaza.** Vínculos hacia `apu_templates`,
   `boq_items`, `estimate_versions`, `resources` son FKs opcionales +
   tabla de vínculos con aprobación (`steel_apu_boq_links`). Steel NUNCA
   muta `boq_items` ni snapshots de versiones emitidas (espejo de
   `quantity_takeoff_groups.boq_item_id`: el vínculo vive en Steel).
4. **Snapshots inmutables.** Takeoff `locked` y pedido `approved` congelan
   cantidades/precios (patrón `estimate_versions` emitidas). Cambios ⇒
   nueva versión/adenda, nunca recálculo silencioso.
5. **Convenciones del esquema base** (se heredan tal cual):
   `id UUID PK DEFAULT gen_random_uuid()`; dinero/cantidades
   `NUMERIC(20,10)`; enums como `TEXT + CHECK`; `TIMESTAMPTZ` auditables
   con trigger `updated_at`; FK siempre con `ON DELETE` explícito e índice;
   RLS ENABLE+FORCE en toda tabla nueva; triggers same-org en FKs
   cross-tabla (patrón `rpo_batch_same_org` /
   `apu_components_labor_role_same_org`).
6. **Auditoría y escrituras críticas** siguen el patrón probado:
   tabla append-only con `UNIQUE (organization_id, idempotency_key)`
   parcial (patrón `apu_manual_actions` / `price_observation_bulk_actions`)
   y RPCs `SECURITY INVOKER` para mutaciones sensibles.

### 0.1 Nota sobre `steel_specs` (entidad de soporte, heredada de V1)

El blueprint V1 §4 define `steel_specs` (especificación técnica 1:1
opcional con `resources`: familia, `bar_number`, `profile_reference`,
`unit_weight_kg_m`, `commercial_lengths_m`, tratamiento…). El mandato F2
no la lista entre las 15 entidades, pero varias líneas de este borrador la
referencian (`steel_spec_id`). **Recomendación:** mantener `steel_specs`
como 16.ª tabla de la fase de modelo (es la que evita inventar pesos por
línea y ancla la compatibilidad de cortes). Queda como pregunta abierta
P-01 (§6) confirmar si entra en la migración 1 de F2 o en una migración
inmediatamente posterior. En este documento se asume que existe.

---

## 1. Entidades F2 (15 tablas del mandato)

Convención de columnas comunes (no se repite en cada tabla):
`id UUID PK` · `created_at/updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
(+ trigger) · `created_by UUID NULL FK profiles ON DELETE SET NULL`.
Todas las tablas llevan `organization_id UUID NOT NULL FK organizations
ON DELETE CASCADE` **directo** (aunque sea derivable), para políticas RLS
sin JOIN y paridad con las tablas steel de mayor volumen.

### 1.1 `steel_takeoffs`

- **Propósito:** cabecera del estudio de acero de un proyecto (una entrega
  del ingeniero, una etapa o una versión de diseño). Contenedor de
  elementos, líneas, fuentes y planes de corte.
- **Campos principales:**

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| organization_id | UUID | NOT NULL | FK organizations |
| project_id | UUID | NOT NULL | FK projects |
| project_scope_id | UUID | NULL | FK project_scopes (alcance default) |
| code | TEXT | NOT NULL | único por proyecto |
| name | TEXT | NOT NULL | |
| description | TEXT | NULL | |
| status | TEXT | NOT NULL | CHECK; DEFAULT 'draft' |
| default_waste_mode | TEXT | NOT NULL | CHECK; DEFAULT 'assumed' |
| default_waste_pct | NUMERIC(20,10) | NOT NULL | DEFAULT 0; fracción 0≤x<1 |
| totals_snapshot | JSONB | NULL | kg/ml/unidades/costo al aprobar/lock |
| approved_by / approved_at | UUID/TIMESTAMPTZ | NULL | actor y fecha |
| locked_at | TIMESTAMPTZ | NULL | CHECK coherente con status |
| archived_at | TIMESTAMPTZ | NULL | soft-archive (patrón apu_templates) |

- **Relaciones:** `project_id → projects` (CASCADE);
  `project_scope_id → project_scopes` (SET NULL);
  `approved_by/created_by → profiles` (SET NULL).
- **Índices:** `(organization_id)`; `(project_id, status)`;
  UNIQUE `(project_id, code)`; parcial `(project_id) WHERE archived_at IS
  NULL`.
- **Constraints:** `status IN ('draft','in_review','approved','locked',
  'archived')`; `default_waste_mode IN ('assumed','by_cut','optimized')`;
  `default_waste_pct >= 0 AND default_waste_pct < 1`;
  `(status='locked') = (locked_at IS NOT NULL)`;
  `(status='archived') = (archived_at IS NOT NULL)`.
- **Estados:** `draft → in_review → approved → locked` (+`archived` desde
  cualquier estado no-locked). `approved` = cantidades validadas; `locked`
  = snapshot inmutable (los pedidos aprobados cuelgan de él). Transiciones
  vía RPC con guard de rol; RLS bloquea UPDATE/DELETE de takeoff `locked`
  y de todos sus hijos (espejo de `estimate_versions` emitidas).
- **Auditoría:** toda transición de estado registra fila en
  `steel_actions`.
- **Relación con existentes:** N takeoffs por `projects`; el alcance
  default apunta a `project_scopes`; la vinculación presupuestal se modela
  en `steel_apu_boq_links` (§1.14), no aquí.

### 1.2 `steel_source_files`

- **Propósito:** trazabilidad y auditoría de cada archivo fuente del
  takeoff (Excel, PDF con texto, PDF escaneado futuro, plantilla interna,
  pegado manual). Metadatos en DB; el binario vive en Storage privado
  (§4), **nunca en Git**.
- **Campos principales:**

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| organization_id | UUID | NOT NULL | FK organizations |
| steel_takeoff_id | UUID | NOT NULL | FK steel_takeoffs |
| source_kind | TEXT | NOT NULL | CHECK (tipos §4.1) |
| original_filename | TEXT | NULL | NULL en `manual`/`paste` |
| storage_path | TEXT | NULL | bucket privado; NULL si no hay binario |
| sha256 | TEXT | NULL | CHECK hex(64); NOT NULL si hay binario |
| size_bytes | BIGINT | NULL | CHECK > 0 |
| mime_type | TEXT | NULL | |
| status | TEXT | NOT NULL | CHECK; DEFAULT 'uploaded' |
| pages_detected / sheets_detected | INTEGER/TEXT[] | NULL | según tipo |
| parse_summary | JSONB | NULL | conteos, warnings, parser_version |
| processed_by | TEXT | NULL | CHECK ('user','agent') |
| processed_at | TIMESTAMPTZ | NULL | |
| uploaded_by | UUID | NOT NULL | FK profiles (RESTRICT) |

- **Relaciones:** `steel_takeoff_id → steel_takeoffs` (CASCADE);
  `uploaded_by → profiles` (RESTRICT, patrón `imported_by` de los batches).
- **Índices:** `(steel_takeoff_id, status)`; UNIQUE parcial
  `(steel_takeoff_id, sha256) WHERE sha256 IS NOT NULL` (idempotencia: el
  mismo archivo no se ingesta dos veces al mismo takeoff; re-subir a otro
  takeoff sí es válido).
- **Constraints:** `source_kind IN ('internal_template','excel',
  'pdf_text','pdf_scan','manual','paste')`; `status IN ('uploaded',
  'parsing','parsed','partially_parsed','failed','reviewed')`;
  `(storage_path IS NULL) = (sha256 IS NULL)`.
- **Estados:** `uploaded → parsing → parsed | partially_parsed | failed →
  reviewed`. `reviewed` requiere que ninguna línea hija quede
  `needs_review` sin resolver (validación de dominio, no CHECK).
- **Auditoría:** upload, parse y cierre de revisión → `steel_actions`.
  La fila es **inmutable en sus metadatos de origen** (filename, hash,
  path); solo `status`, `parse_summary`, `processed_*` mutan.
- **Relación con existentes:** patrón directo de
  `apu_import_batches`/`quantity_import_batches` (digest + imported_by +
  metadata), extendido con storage y ciclo de parseo.

### 1.3 `steel_elements`

- **Propósito:** elemento estructural que agrupa líneas (columna C-12,
  zapata Z-3, cercha CE-1). Da el corte de análisis "por elemento" y
  hereda ubicación/vínculo presupuestal a sus líneas.
- **Campos principales:**

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| organization_id | UUID | NOT NULL | FK organizations |
| steel_takeoff_id | UUID | NOT NULL | FK steel_takeoffs |
| element_type | TEXT | NOT NULL | CHECK (catálogo V1 §2.2 + 'other') |
| name | TEXT | NOT NULL | "Columna C-12" |
| axis_location | TEXT | NULL | "Eje B-4" |
| project_scope_id | UUID | NULL | FK project_scopes (piso/torre) |
| zone / work_front | TEXT | NULL | atributos libres |
| notes | TEXT | NULL | |
| sort_order | INTEGER | NOT NULL | DEFAULT 0 |

- **Relaciones:** `steel_takeoff_id → steel_takeoffs` (CASCADE);
  `project_scope_id → project_scopes` (SET NULL) + trigger same-org
  (el scope debe pertenecer al mismo `project_id` del takeoff).
- **Índices:** `(steel_takeoff_id, sort_order)`; `(project_scope_id)`;
  `(steel_takeoff_id, element_type)`.
- **Constraints:** `element_type` CHECK sobre el catálogo cerrado
  (pilote, caisson, zapata_aislada, zapata_corrida, viga_cimentacion,
  viga_amarre, viga_aerea, viga_cinta, columna, pantalla,
  muro_estructural, muro_contencion, placa, losa_maciza, losa_aligerada,
  escalera, rampa, dintel, pedestal, riostra, borde_refuerzo, cercha,
  estructura_metalica, other — lista definitiva a congelar en contrato).
- **Estados:** sin máquina propia; hereda el bloqueo del takeoff.
- **Auditoría:** creación/edición masiva relevante → `steel_actions`.
- **Desviación vs V1:** V1 ponía `boq_item_id`/`apu_template_id` NULL
  directamente en el elemento. En F2 esos vínculos se mueven a
  `steel_apu_boq_links` (§1.14) para tener UNA sola verdad del vínculo
  con estados y aprobación. Ver §5-D3.

### 1.4 `steel_lines`

- **Propósito:** **tabla normalizada central**. Una fila = una posición de
  despiece (refuerzo) o una partida de perfil (metalmecánica), con fuente,
  interpretación, clasificación, geometría, cálculo y control de revisión.
- **Campos principales (agrupados):**

| Grupo | Columnas (tipo — null) |
|---|---|
| Pertenencia | `organization_id` (UUID — NOT NULL), `project_id` (UUID — NOT NULL), `steel_takeoff_id` (UUID — NOT NULL), `steel_element_id` (UUID — NULL), `project_scope_id` (UUID — NULL), `zone`/`work_front` (TEXT — NULL) |
| Fuente (§4) | `source_file_id` (UUID — NULL), `source_page` (INTEGER — NULL), `source_sheet` (TEXT — NULL), `source_table_ref` (TEXT — NULL), `source_row` (INTEGER — NULL), `original_description` (TEXT — NULL), `parsed_description` (JSONB — NULL), `parser_version` (TEXT — NULL), `processed_by` (TEXT — NULL, CHECK user/agent), `processed_at` (TIMESTAMPTZ — NULL) |
| Clasificación | `steel_family` (TEXT — NOT NULL, CHECK), `steel_type` (TEXT — NULL, grado/norma), `steel_shape` (TEXT — NULL, CHECK), `bar_number` (INTEGER — NULL, CHECK 2..18), `profile_reference` (TEXT — NULL), `diameter_mm` (NUMERIC — NULL), `section_dimensions` (JSONB — NULL), `treatment` (TEXT — NOT NULL, CHECK, DEFAULT 'none') |
| Catálogo | `steel_spec_id` (UUID — NULL, FK steel_specs SET NULL), `catalog_resource_id` (UUID — NULL, FK resources SET NULL) |
| Geometría | `cut_length_m` (NUMERIC(20,10) — NULL), `bend_detail` (JSONB — NULL), `quantity_per_unit` (NUMERIC — NOT NULL DEFAULT 1), `repetitions` (NUMERIC — NOT NULL DEFAULT 1), `spacing_cm` (NUMERIC — NULL), `spacing_span_m` (NUMERIC — NULL), `total_ml` (NUMERIC(20,10) — NULL), `total_kg` (NUMERIC(20,10) — NULL), `commercial_length_m` (NUMERIC — NULL), `commercial_units_required` (NUMERIC — NULL) |
| Snapshots | `unit_weight_kg_m_snapshot` (NUMERIC — NULL), `unit_weight_kg_unit_snapshot` (NUMERIC — NULL), `unit_price_snapshot` (NUMERIC(20,10) — NULL, 🔒), `price_source_ref` (JSONB — NULL: tabla+id+observed_at de la observación usada), `estimated_cost` (NUMERIC(20,10) — NULL, 🔒), `currency` (TEXT — NOT NULL DEFAULT 'COP') |
| Desperdicio | `waste_mode` (TEXT — NOT NULL, CHECK, DEFAULT hereda takeoff), `assumed_waste_pct` (NUMERIC — NULL), `estimated_waste_ml` / `optimized_waste_ml` (NUMERIC — NULL) |
| Comercial | `supplier_id` (UUID — NULL, FK suppliers SET NULL), `order_line_id` (UUID — NULL, FK steel_order_lines SET NULL) |
| Control | `verification_status` (TEXT — NOT NULL, CHECK, DEFAULT 'unreviewed'), `confidence_score` (NUMERIC(5,4) — NULL, CHECK 0..1), `needs_review` (BOOLEAN — NOT NULL, generada/derivada de status), `notes` (TEXT — NULL), `sort_order` (INTEGER — NOT NULL DEFAULT 0), `updated_by` (UUID — NULL) |

- **Relaciones:** takeoff (CASCADE); element (SET NULL); source_file
  (SET NULL — la línea sobrevive si se purga el archivo, la procedencia
  textual queda); spec/resource/supplier (SET NULL); order_line
  (SET NULL). Triggers same-org para `catalog_resource_id`, `supplier_id`
  y `project_scope_id` (mismo proyecto).
- **Índices:** `(steel_takeoff_id, sort_order)`; `(steel_element_id)`;
  `(project_scope_id)`; `(steel_takeoff_id, steel_family, bar_number)`;
  `(steel_takeoff_id, verification_status)`; `(source_file_id)`;
  `(catalog_resource_id)`; `(order_line_id)`. Es la tabla de mayor volumen
  (decenas de miles de filas por torre): los agregados del dashboard se
  resuelven en SQL sobre estos índices.
- **Constraints:** `steel_family IN ('rebar','mesh','profile','tube',
  'plate','flat_bar','angle','channel','sheet','anchor','bolt','weld',
  'accessory','other')`; `steel_shape IN ('straight','stirrup','hook',
  'lap','mesh_panel','profile_piece','plate_piece','other')`;
  `treatment IN ('none','galvanized','painted','anticorrosive','epoxy')`;
  `verification_status IN ('unreviewed','auto_ok','needs_review',
  'confirmed','edited','rejected')`; cantidades y longitudes `>= 0`;
  `confidence_score BETWEEN 0 AND 1`.
- **Estados (línea):** `unreviewed → auto_ok | needs_review → confirmed |
  edited | rejected`. `edited` conserva `parsed_description` original +
  la corrección humana (§4.4). Con takeoff `locked`, RLS bloquea todo
  UPDATE/DELETE.
- **Auditoría:** ediciones humanas (cambio de interpretación, cantidad,
  clasificación) → `steel_actions` con diff en metadata.
- **Relación con existentes:** `catalog_resource_id → resources` es el
  puente al catálogo maestro; `unit_price_snapshot` se copia SOLO de una
  observación **aprobada** del pipeline (`resource_price_observations`
  vía re-resolución server-side, patrón `create_manual_apu`), con
  `price_source_ref` como cita. Sin precio aprobado ⇒ snapshot NULL +
  alerta A10 (§1.5). La fuente viva del precio nunca es esta tabla.
- **Desviación vs V1:** se retiran `boq_item_id`/`apu_template_id`
  directos (→ `steel_apu_boq_links`, §5-D3) y `alerts_ack` JSONB
  (→ `steel_line_alerts`, §5-D1).

### 1.5 `steel_line_alerts`

- **Propósito:** materialización persistente de las alertas por línea
  (códigos A1–A18 del blueprint V1 §10) con acknowledgement auditable.
- **Campos principales:**

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| organization_id | UUID | NOT NULL | FK organizations |
| steel_takeoff_id | UUID | NOT NULL | FK steel_takeoffs (denormal.) |
| steel_line_id | UUID | NOT NULL | FK steel_lines |
| alert_code | TEXT | NOT NULL | CHECK catálogo estable A1..A18 |
| severity | TEXT | NOT NULL | CHECK ('critical','warning','info') |
| message | TEXT | NOT NULL | accionable, generado por dominio |
| detail | JSONB | NULL | valores que dispararon la alerta |
| status | TEXT | NOT NULL | CHECK; DEFAULT 'open' |
| computed_at | TIMESTAMPTZ | NOT NULL | corrida que la (re)generó |
| evaluator_version | TEXT | NOT NULL | versión del evaluador de dominio |
| acknowledged_by / acknowledged_at | UUID/TIMESTAMPTZ | NULL | ack |
| resolved_at | TIMESTAMPTZ | NULL | cuando el recomputo la cierra |

- **Relaciones:** `steel_line_id → steel_lines` (CASCADE);
  `steel_takeoff_id → steel_takeoffs` (CASCADE);
  `acknowledged_by → profiles` (SET NULL).
- **Índices:** `(steel_takeoff_id, status, severity)`;
  `(steel_line_id, alert_code)`; UNIQUE parcial
  `(steel_line_id, alert_code) WHERE status IN ('open','acknowledged')`
  (una alerta viva por código y línea; el histórico resuelto se conserva).
- **Constraints:** `status IN ('open','acknowledged','resolved','stale')`;
  `(status='acknowledged') = (acknowledged_at IS NOT NULL)` (ack exige
  actor).
- **Estados:** `open → acknowledged` (humano) · `open|acknowledged →
  resolved` (el recomputo verifica que la condición desapareció) ·
  `→ stale` (la línea cambió después de computada; pendiente de recorrida).
- **Auditoría:** el ack ES el registro (actor+fecha); creación/resolución
  masiva por corrida se registra una vez en `steel_actions`
  (`recompute_alerts`).
- **⚠️ Desviación vs V1 (§5-D1):** V1 decía "las alertas NO son tabla, se
  computan en dominio puro; solo persisten los acks en JSONB". El mandato
  F2 exige entidad persistida. **Diseño de reconciliación:** el evaluador
  de dominio puro sigue siendo la ÚNICA fuente de la lógica (sin drift:
  la tabla nunca se edita a mano); `steel_line_alerts` es una
  **proyección materializada** que un recomputo controlado (RPC/job)
  sobreescribe de forma idempotente. Ventajas que justifican la tabla:
  ack auditable por fila (no JSONB), dashboard agregable en SQL a escala
  de decenas de miles de líneas, y base para notificaciones programadas
  (precio vencido). El campo `evaluator_version` + estado `stale`
  protegen contra alertas obsoletas.

### 1.6 `steel_cut_plans`

- **Propósito:** cabecera de un plan de corte del takeoff para un grupo de
  compatibilidad (familia + `bar_number` o `profile_reference`+sección +
  `steel_type` + tratamiento) con sus parámetros y métricas.
- **Campos principales:**

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| organization_id | UUID | NOT NULL | FK organizations |
| steel_takeoff_id | UUID | NOT NULL | FK steel_takeoffs |
| steel_spec_id | UUID | NULL | FK steel_specs (grupo compatib.) |
| compatibility_key | TEXT | NOT NULL | clave derivada del grupo |
| status | TEXT | NOT NULL | CHECK; DEFAULT 'draft' |
| kerf_mm | NUMERIC(20,10) | NOT NULL | DEFAULT parámetro org |
| min_useful_offcut_m | NUMERIC(20,10) | NOT NULL | |
| commercial_lengths_m | NUMERIC[] | NOT NULL | activas para el plan |
| algorithm | TEXT | NOT NULL | CHECK ('ffd','bfd'); versión en metadata |
| metrics | JSONB | NULL | desperdicio teórico/real/optimizado, ahorro |
| computed_at | TIMESTAMPTZ | NULL | |

- **Relaciones:** takeoff (CASCADE); spec (SET NULL).
- **Índices:** `(steel_takeoff_id, status)`; UNIQUE
  `(steel_takeoff_id, compatibility_key)` — un plan vigente por grupo.
- **Constraints:** `status IN ('draft','computed','approved','stale',
  'discarded')`; `kerf_mm >= 0`; `min_useful_offcut_m >= 0`.
- **Estados:** `draft → computed → approved` · `computed → stale` (las
  líneas del grupo cambiaron) · `→ discarded`. `approved` congela el plan
  (los offcuts asignados dependen de él).
- **Auditoría:** cómputo y aprobación → `steel_actions`.
- **Relación con existentes:** ninguna FK fuera de steel; consume
  longitudes comerciales de `steel_specs.commercial_lengths_m` como
  default.

### 1.7 `steel_cut_plan_items`

- **Propósito:** detalle normalizado del plan: **una fila = un corte
  asignado** a una barra/pieza comercial del plan. La "barra" es el grupo
  `(cut_plan_id, bar_sequence)`; el sobrante de cada barra se materializa
  en `steel_offcuts`.
- **Campos principales:**

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| organization_id | UUID | NOT NULL | FK organizations |
| steel_cut_plan_id | UUID | NOT NULL | FK steel_cut_plans |
| bar_sequence | INTEGER | NOT NULL | nº de barra comercial en el plan |
| bar_source | TEXT | NOT NULL | CHECK ('new_bar','offcut') |
| source_offcut_id | UUID | NULL | FK steel_offcuts (si bar_source=offcut) |
| bar_commercial_length_m | NUMERIC(20,10) | NOT NULL | de la barra |
| cut_sequence | INTEGER | NOT NULL | orden del corte en la barra |
| steel_line_id | UUID | NOT NULL | FK steel_lines (a quién sirve) |
| cut_length_m | NUMERIC(20,10) | NOT NULL | CHECK > 0 |
| kerf_applied_mm | NUMERIC(20,10) | NOT NULL | |

- **Relaciones:** cut_plan (CASCADE); line (RESTRICT — no borrar líneas
  con plan aprobado; el recomputo elimina items primero);
  source_offcut (SET NULL).
- **Índices:** `(steel_cut_plan_id, bar_sequence, cut_sequence)` UNIQUE;
  `(steel_line_id)`; `(source_offcut_id)`.
- **Constraints:** invariante por barra (dominio + verificación en RPC):
  `Σ(cut_length) + Σ(kerf) + sobrante = bar_commercial_length`;
  `(bar_source='offcut') = (source_offcut_id IS NOT NULL)`.
- **Estados:** hereda del plan (sin máquina propia).
- **Auditoría:** el plan entero se regenera atómicamente vía RPC
  (delete+insert bajo transacción) y se registra una acción.
- **⚠️ Desviación vs V1 (§5-D2):** V1 proponía `steel_cut_plan_bars`
  (una fila por barra, cortes en JSONB ordenado). El mandato F2 pide
  `steel_cut_plan_items`. **Diseño adoptado:** normalizar a nivel corte
  (más consultable: "¿en qué barra quedó la línea X?", validación
  relacional del invariante, FK real a `steel_lines`) y derivar la barra
  por agrupación. No se crea tabla de barras separada; si la UI de
  visualización lo pidiera, es una vista, no una tabla.

### 1.8 `steel_offcuts`

- **Propósito:** banco de sobrantes reutilizables por proyecto: qué sobró,
  de dónde, dónde se sugiere/asigna usarlo y cuánto ahorra.
- **Campos principales:**

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| organization_id | UUID | NOT NULL | FK organizations |
| project_id | UUID | NOT NULL | FK projects (banco por proyecto) |
| steel_takeoff_id | UUID | NULL | FK takeoff de origen |
| steel_spec_id | UUID | NULL | FK steel_specs (compatibilidad) |
| compatibility_key | TEXT | NOT NULL | espejo del plan |
| bar_number / profile_reference | INTEGER/TEXT | NULL | redundancia útil |
| length_m | NUMERIC(20,10) | NOT NULL | CHECK > 0 |
| weight_kg | NUMERIC(20,10) | NULL | |
| origin_cut_plan_item_ref | JSONB | NULL | plan/bar_sequence de origen |
| origin_scope_id | UUID | NULL | FK project_scopes (piso origen) |
| status | TEXT | NOT NULL | CHECK; DEFAULT 'available' |
| assigned_line_id | UUID | NULL | FK steel_lines (destino) |
| assigned_by / assigned_at | UUID/TIMESTAMPTZ | NULL | aprobación humana |
| saving_ml / saving_kg / saving_cop | NUMERIC(20,10) | NULL | 🔒 COP |
| physical | BOOLEAN | NOT NULL | DEFAULT false (teórico vs patio) |

- **Relaciones:** project (CASCADE); takeoff/spec/scope/line (SET NULL);
  assigned_by → profiles (SET NULL).
- **Índices:** `(project_id, compatibility_key, status)`;
  `(assigned_line_id)`; `(steel_takeoff_id)`.
- **Constraints:** `status IN ('available','suggested','assigned',
  'discarded','final_waste')`; `(status='assigned') = (assigned_line_id
  IS NOT NULL AND assigned_at IS NOT NULL)`.
- **Estados:** `available → suggested` (optimizador) `→ assigned`
  (confirmación humana) · `available|suggested → discarded | final_waste`.
  La sugerencia NUNCA asigna sola (espejo Q14: aprobación humana).
- **Auditoría:** asignación/descartes → `steel_actions`.
- **Relación con existentes:** cruce entre pisos vía `origin_scope_id`
  (`project_scopes`); en fase obra `physical=true` distingue sobrante
  confirmado en patio.

### 1.9 `steel_orders`

- **Propósito:** pedido de acero (global o parcial por filtro de alcance)
  con ciclo RFQ → aprobación → recepción. Inmutable tras `approved`.
- **Campos principales:**

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| organization_id | UUID | NOT NULL | FK organizations |
| project_id | UUID | NOT NULL | FK projects |
| steel_takeoff_id | UUID | NULL | FK (puede agregar de varios) |
| code | TEXT | NOT NULL | único por proyecto |
| name | TEXT | NOT NULL | |
| scope_filter | JSONB | NULL | filtro que lo generó (pisos/familias…) |
| supplier_id | UUID | NULL | FK suppliers (multi-prov. vía líneas) |
| status | TEXT | NOT NULL | CHECK; DEFAULT 'draft' |
| totals_snapshot | JSONB | NULL | kg/ml/unidades/costo al aprobar 🔒 |
| currency | TEXT | NOT NULL | DEFAULT 'COP' |
| approved_by / approved_at | UUID/TIMESTAMPTZ | NULL | |
| cancelled_reason | TEXT | NULL | obligatoria si cancelled |
| notes | TEXT | NULL | |

- **Relaciones:** project (CASCADE); takeoff (SET NULL); supplier
  (SET NULL); approved_by (SET NULL). Trigger same-org en supplier.
- **Índices:** `(project_id, status)`; UNIQUE `(project_id, code)`;
  `(supplier_id)`.
- **Constraints:** `status IN ('draft','rfq_sent','quoted','approved',
  'ordered','partially_received','received','closed','cancelled')`;
  `(status='approved' OR status IN ('ordered','partially_received',
  'received','closed')) → approved_by/approved_at NOT NULL`;
  `cancelled` solo alcanzable desde estados pre-approved (guard en RPC;
  CHECK no puede validar transición).
- **Estados:** `draft → rfq_sent → quoted → approved → ordered →
  partially_received → received → closed`; `cancelled` solo desde
  `draft|rfq_sent|quoted`. Tras `approved`, RLS bloquea UPDATE/DELETE del
  pedido y sus líneas (cambios = nuevo pedido o adenda auditada).
- **Auditoría:** cada transición → `steel_actions` (aprobación con actor
  explícito; patrón aprobación simple Q11 + auditoría obligatoria).
- **Relación con existentes:** proveedor = `suppliers`; el pedido NO
  escribe en `purchase_records`/`purchase_items` (provisionales v0,
  Oleada 4 compras) — puente futuro documentado en el blueprint padre.

### 1.10 `steel_order_lines`

- **Propósito:** línea comercial agregada del pedido, por
  spec + longitud comercial + tratamiento (lo que el proveedor cotiza y
  factura).
- **Campos principales:**

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| organization_id | UUID | NOT NULL | FK organizations |
| steel_order_id | UUID | NOT NULL | FK steel_orders |
| steel_spec_id | UUID | NULL | FK steel_specs |
| catalog_resource_id | UUID | NULL | FK resources |
| supplier_id | UUID | NULL | FK suppliers (si multi-proveedor) |
| supplier_product_id | UUID | NULL | FK supplier_products |
| description | TEXT | NOT NULL | denominación comercial |
| commercial_length_m | NUMERIC(20,10) | NULL | |
| quantity_units | NUMERIC(20,10) | NOT NULL | CHECK >= 0 |
| total_ml / total_kg | NUMERIC(20,10) | NULL | |
| purchase_unit | TEXT | NOT NULL | CHECK (unit/ml/kg/ton/bundle/…) |
| unit_price_snapshot | NUMERIC(20,10) | NULL | 🔒 congelado al aprobar |
| price_source_ref | JSONB | NULL | quote/observación citada |
| subtotal | NUMERIC(20,10) | NULL | 🔒 recalculado server-side |
| received_qty_total | NUMERIC(20,10) | NOT NULL | DEFAULT 0 (agregado) |
| sort_order | INTEGER | NOT NULL | DEFAULT 0 |

- **Relaciones:** order (CASCADE); spec/resource/supplier/
  supplier_product (SET NULL) + triggers same-org.
- **Índices:** `(steel_order_id, sort_order)`; `(catalog_resource_id)`;
  `(supplier_product_id)`.
- **Constraints:** `subtotal = round(quantity × unit_price, 10)` forzado
  por trigger server-side (patrón `boq_items_recompute_subtotal`);
  `received_qty_total <= quantity_units` (tolerancia de sobre-entrega a
  decidir, P-06).
- **Estados:** hereda del pedido; tras `approved` la línea es inmutable
  salvo `received_qty_total` (actualizada SOLO por el RPC de recepción).
- **Auditoría:** vía pedido + recepciones.
- **Relación con existentes:** `supplier_product_id → supplier_products`
  ancla la oferta concreta; `catalog_resource_id → resources` permite el
  cruce pedido↔presupuesto (vía `steel_apu_boq_links`) y pedido↔compras
  futuras.

### 1.11 `steel_order_receipts`

- **Propósito:** evento de recepción parcial/total de una línea de pedido
  en obra (fase obra del ciclo). Append-only.
- **Campos principales:**

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| organization_id | UUID | NOT NULL | FK organizations |
| steel_order_line_id | UUID | NOT NULL | FK steel_order_lines |
| received_qty | NUMERIC(20,10) | NOT NULL | CHECK > 0 |
| received_unit | TEXT | NOT NULL | espejo de purchase_unit |
| received_at | TIMESTAMPTZ | NOT NULL | DEFAULT now() |
| received_by | UUID | NOT NULL | FK profiles (RESTRICT) |
| condition | TEXT | NOT NULL | CHECK; DEFAULT 'ok' |
| remission_reference | TEXT | NULL | nº remisión/guía |
| photos_ref | JSONB | NULL | referencias a Storage privado |
| notes | TEXT | NULL | |

- **Relaciones:** order_line (CASCADE); received_by (RESTRICT).
- **Índices:** `(steel_order_line_id, received_at DESC)`.
- **Constraints:** `condition IN ('ok','partial_damage','rejected')`.
- **Estados:** ninguno propio; el RPC de recepción actualiza
  `received_qty_total` de la línea y deriva el estado del pedido
  (`partially_received`/`received`) server-side.
- **Auditoría:** la fila ES el registro; **append-only** (RLS sin
  UPDATE/DELETE, patrón `progress_entries`).
- **Relación con existentes:** ninguna FK externa adicional; conecta el
  ciclo con el futuro módulo de compras reales (v0) sin escribirlo.

### 1.12 `steel_supplier_quotes`

- **Propósito:** RFQ enviada y cotización recibida de UN proveedor para un
  pedido: vigencia, condiciones y estado de selección.
- **Campos principales:**

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| organization_id | UUID | NOT NULL | FK organizations |
| steel_order_id | UUID | NOT NULL | FK steel_orders |
| supplier_id | UUID | NOT NULL | FK suppliers |
| status | TEXT | NOT NULL | CHECK; DEFAULT 'requested' |
| requested_at | TIMESTAMPTZ | NOT NULL | DEFAULT now() |
| received_at | TIMESTAMPTZ | NULL | |
| valid_until | DATE | NULL | vigencia → derivado `expired` |
| currency | TEXT | NOT NULL | DEFAULT 'COP' |
| payment_terms / delivery_terms | TEXT | NULL | 🔒 condiciones |
| availability_notes | TEXT | NULL | |
| quote_reference | TEXT | NULL | nº cotización del proveedor |
| source_file_ref | JSONB | NULL | PDF/Excel de la quote en Storage |
| selected_by / selected_at | UUID/TIMESTAMPTZ | NULL | aprobación |

- **Relaciones:** order (CASCADE); supplier (RESTRICT — no borrar
  proveedor con quotes); selected_by (SET NULL). Trigger same-org.
- **Índices:** `(steel_order_id, status)`; UNIQUE
  `(steel_order_id, supplier_id)` (una quote viva por proveedor y pedido;
  re-cotizar = nueva fila con la anterior `discarded` — a confirmar P-07).
- **Constraints:** `status IN ('requested','received','selected',
  'discarded','expired')`; `(status='selected') = (selected_by IS NOT
  NULL)`; `received_at` obligatorio para `received|selected`.
- **Estados:** `requested → received → selected | discarded | expired`
  (`expired` derivable por `valid_until < today`, materializado por job o
  evaluado en lectura — decisión P-08).
- **Auditoría:** registro/selección → `steel_actions`.
- **Relación con existentes (CLAVE):** al seleccionar una quote, un RPC
  dedicado puede **emitir** una observación al pipeline vivo de precios
  (`resource_price_observations`, nace `pending`, jamás auto-aprobada —
  invariante 3A intacto) con referencia a la quote en su metadata. El
  catálogo global "aprende" del pedido SOLO tras la aprobación humana del
  review center existente.

### 1.13 `steel_quote_lines`

- **Propósito:** precio cotizado por el proveedor para cada línea del
  pedido (base del comparador multi-proveedor).
- **Campos principales:**

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| organization_id | UUID | NOT NULL | FK organizations |
| steel_supplier_quote_id | UUID | NOT NULL | FK steel_supplier_quotes |
| steel_order_line_id | UUID | NOT NULL | FK steel_order_lines |
| unit_price | NUMERIC(20,10) | NOT NULL | 🔒 CHECK >= 0 |
| price_unit | TEXT | NOT NULL | CHECK ('unit','ml','kg','ton',…) |
| available | BOOLEAN | NOT NULL | DEFAULT true |
| lead_time_days | NUMERIC(10,2) | NULL | |
| minimum_order | TEXT | NULL | condición de mínimo |
| notes | TEXT | NULL | |

- **Relaciones:** quote (CASCADE); order_line (CASCADE) + trigger de
  coherencia: la order_line debe pertenecer al MISMO pedido que la quote.
- **Índices:** UNIQUE `(steel_supplier_quote_id, steel_order_line_id)`;
  `(steel_order_line_id)` (comparador: precios por línea).
- **Constraints:** `unit_price >= 0`; conversión kg/ml/unidad se hace en
  dominio con `steel_specs.unit_weight_*` (nunca se persiste convertido
  sin cita de la base).
- **Estados:** hereda de la quote.
- **Auditoría:** vía quote.
- **Relación con existentes:** los precios cotizados son 🔒 INTERNOS
  (regla no negociable 4: jamás en exports de cliente/proveedor ajeno).

### 1.14 `steel_apu_boq_links`

- **Propósito:** vínculo con flujo de aprobación entre el mundo steel
  (línea/elemento/takeoff/pedido) y el mundo presupuestal
  (`resources`, `apu_templates`, `boq_items`). UNA tabla, una sola verdad
  del estado del vínculo. **Steel NUNCA escribe en `boq_items`.**
- **Campos principales:**

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| organization_id | UUID | NOT NULL | FK organizations |
| source_kind | TEXT | NOT NULL | CHECK ('line','element','takeoff','order') |
| steel_line_id | UUID | NULL | FK steel_lines (CASCADE) |
| steel_element_id | UUID | NULL | FK steel_elements (CASCADE) |
| steel_takeoff_id | UUID | NULL | FK steel_takeoffs (CASCADE) |
| steel_order_id | UUID | NULL | FK steel_orders (CASCADE) |
| target_kind | TEXT | NOT NULL | CHECK ('resource','apu_template','boq_item','estimate_version') |
| resource_id | UUID | NULL | FK resources (SET NULL) |
| apu_template_id | UUID | NULL | FK apu_templates (SET NULL) |
| boq_item_id | UUID | NULL | FK boq_items (SET NULL) |
| estimate_version_id | UUID | NULL | FK estimate_versions (SET NULL) |
| status | TEXT | NOT NULL | CHECK; DEFAULT 'suggested' |
| suggested_by | TEXT | NULL | CHECK ('agent','user') |
| match_confidence | NUMERIC(5,4) | NULL | CHECK 0..1 (si sugerido) |
| approved_by / approved_at | UUID/TIMESTAMPTZ | NULL | aprobación humana |
| rejected_reason | TEXT | NULL | |

- **Relaciones:** exactamente UN FK de origen no nulo según `source_kind`
  y UN FK de destino no nulo según `target_kind` (CHECKs de exclusión).
  Triggers same-org sobre todos los FKs cruzados.
- **Índices:** parciales por cada FK; UNIQUE parcial
  `(steel_line_id, target_kind) WHERE status IN ('suggested','linked',
  'approved')` (un vínculo vivo por línea y tipo de destino; ídem para
  element/takeoff/order).
- **Constraints:** `status IN ('unlinked','suggested','linked',
  'approved','rejected')`; `(status='approved') = (approved_by IS NOT
  NULL)`; sugerencias (`suggested_by='agent'`) exigen `match_confidence`.
- **Estados (mandato Agente 4):** `unlinked → suggested → linked →
  approved` (+`rejected`). `suggested` = propuesta de matching (nunca
  auto-aprobada, espejo del matching APU import: exactos ≠ sugerencias);
  `linked` = confirmado por usuario para reportes; `approved` = validado
  para usos que alimentan decisiones presupuestales. **Ninguna transición
  modifica el BOQ real**: consumir el vínculo para crear/actualizar ítems
  BOQ pasa por los RPCs existentes (`add_apu_to_boq`,
  `update_boq_item_quantity`) con su propia aprobación y guards de
  versión editable.
- **Auditoría:** toda transición → `steel_actions`.
- **⚠️ Desviación vs V1 (§5-D3):** V1 ponía `boq_item_id`/
  `apu_template_id` como columnas en element/línea. F2 los centraliza
  aquí para (a) estados y aprobación por vínculo, (b) evitar doble verdad
  columna-vs-tabla, (c) paridad con la lección de
  `quantity_takeoff_groups` (el vínculo vive en la tabla del módulo
  nuevo, jamás en `boq_items`).

### 1.15 `steel_actions`

- **Propósito:** auditoría append-only + idempotencia de TODA mutación
  relevante del módulo (patrón `apu_manual_actions` /
  `price_observation_bulk_actions`).
- **Campos principales:**

| Columna | Tipo | Null | Notas |
|---|---|---|---|
| organization_id | UUID | NOT NULL | FK organizations |
| action_type | TEXT | NOT NULL | CHECK (catálogo cerrado, ampliable por migración) |
| steel_takeoff_id | UUID | NULL | FK SET NULL |
| steel_line_id | UUID | NULL | FK SET NULL |
| steel_order_id | UUID | NULL | FK SET NULL |
| subject_ref | JSONB | NULL | refs adicionales (quote, plan, offcut…) |
| initiated_by | UUID | NOT NULL | FK profiles (RESTRICT) |
| idempotency_key | TEXT | NULL | |
| metadata | JSONB | NULL | diff/conteos/parámetros |
| created_at | TIMESTAMPTZ | NOT NULL | DEFAULT now() |

- **Catálogo inicial de `action_type`:** `source_uploaded`,
  `source_parsed`, `source_reviewed`, `lines_imported`, `line_edited`,
  `line_confirmed`, `line_rejected`, `takeoff_status_changed`,
  `recompute_alerts`, `alert_acknowledged`, `cut_plan_computed`,
  `cut_plan_approved`, `offcut_assigned`, `order_created`,
  `order_status_changed`, `order_approved`, `quote_registered`,
  `quote_selected`, `price_observation_emitted`, `receipt_registered`,
  `link_suggested`, `link_approved`, `link_rejected`.
- **Relaciones:** FKs SET NULL (la auditoría sobrevive al borrado del
  sujeto); `initiated_by` RESTRICT.
- **Índices:** `(organization_id, created_at DESC)`; parciales por
  takeoff/order; UNIQUE parcial `(organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL`.
- **Constraints:** CHECK de `action_type`; sin UPDATE/DELETE por RLS ⇒
  **append-only inmutable**.
- **Estados:** n/a. **Auditoría:** esta tabla ES la auditoría.
- **Relación con existentes:** `initiated_by → profiles`; ninguna otra.

---

## 2. Diagrama de relaciones (texto)

```text
organizations
└── projects ──────────────┬────────────────────────────────────────┐
    ├── project_scopes ◄───┼── steel_elements.project_scope_id      │
    │   (torre/piso/etapa) │   steel_lines.project_scope_id         │
    │                      │   steel_offcuts.origin_scope_id        │
    │                      │                                        │
    └── steel_takeoffs ────┤                                        │
        ├── steel_source_files (storage privado + sha256)           │
        ├── steel_elements                                          │
        │   └── steel_lines (N por elemento; elemento opcional)     │
        ├── steel_lines ── steel_line_alerts (proyección + ack)     │
        │   ├── steel_spec_id ──► steel_specs ──► resources (1:1 op)│
        │   ├── catalog_resource_id ──► resources                   │
        │   ├── unit_price_snapshot ◄─(cita)─ resource_price_       │
        │   │                                  observations (viva)  │
        │   └── order_line_id ──► steel_order_lines                 │
        ├── steel_cut_plans                                         │
        │   └── steel_cut_plan_items ──► steel_lines                │
        │       └── (sobrante) ──► steel_offcuts ──► steel_lines    │
        │                                        (assigned_line_id) │
        └── steel_orders ◄──────────────────────────────────────────┘
            ├── steel_order_lines ──► supplier_products / resources
            │   └── steel_order_receipts (append-only, fase obra)
            └── steel_supplier_quotes ──► suppliers
                └── steel_quote_lines ──► steel_order_lines
                    └─(selección)─► emite resource_price_observations
                                    (pending; aprobación humana 3A)

steel_apu_boq_links (tabla puente con estados):
  origen:  steel_lines | steel_elements | steel_takeoffs | steel_orders
  destino: resources | apu_templates | boq_items | estimate_versions
  (Steel NUNCA escribe boq_items; consumo vía RPCs existentes)

steel_actions: auditoría append-only de todo lo anterior.
```

---

## 3. Relación con el pipeline de precios existente (detalle)

| Necesidad steel | Fuente/mecanismo existente | Qué añade steel |
|---|---|---|
| Precio aprobado vigente de un recurso | `resource_price_observations` (status aprobado; re-resolución EN SQL, patrón `create_manual_apu`) | snapshot + `price_source_ref` en línea/pedido |
| Histórico por proveedor-producto | `supplier_products` + `price_observations` (v1, append-only) | lectura filtrada a specs de acero |
| Precio nuevo desde cotización | pipeline 3A: observación nace `pending` → review center → aprobación humana | RPC "emitir desde quote" con metadata trazable al pedido |
| Vigencia/vencimiento | no existe en el pipeline | `steel_supplier_quotes.valid_until` + derivado `expired` + alerta A11 |
| Comparador multi-proveedor | — | `steel_quote_lines` por pedido |
| Descuentos/ahorros | reglas `pricing_rules` + fórmulas Q8 (dominio) | nada nuevo; steel solo cita resultados 🔒 |

**Prohibido explícitamente:** tabla de precios steel paralela; UPDATE a
observaciones; auto-aprobación; escribir precios en `resources`.

---

## 4. Agente 5 — Archivos fuente: almacenamiento, auditoría y revisión

### 4.1 Tipos de fuente soportados

| `source_kind` | Fase | Binario en Storage | Notas |
|---|---|---|---|
| `internal_template` | F3 | sí | Excel plantilla ICONIC, mapeo 1:1 |
| `excel` | F3/F7 | sí | arbitrario, con asistente de mapeo |
| `pdf_text` | F7 | sí | extracción de tablas (licencia a aprobar) |
| `pdf_scan` | F9 (futuro) | sí | OCR; TODO `needs_review` reforzado |
| `manual` | F3 | no | captura línea a línea |
| `paste` | F3 | no | tabla pegada; se guarda el texto crudo en `parse_summary.raw_paste` |

### 4.2 Almacenamiento privado (fuera de Git)

- Bucket **privado** de Supabase Storage:
  `steel-sources/{organization_id}/{project_id}/{takeoff_id}/{uuid}-
  {filename-sanitizado}`.
- Acceso SOLO por URL firmada de corta duración generada server-side tras
  check de rol + org (nunca URL pública, nunca el path en exports).
- **`sha256`** calculado server-side al subir: (a) integridad, (b)
  idempotencia por takeoff (UNIQUE parcial §1.2), (c) evidencia de que el
  archivo revisado es el archivo cargado.
- **Regla dura (CLAUDE.md reglas 8/12):** ningún archivo fuente, real o de
  cliente, entra a Git. Fixtures de test = sanitizados y sintéticos.
  El `.gitignore` ya excluye `private/`, `*.xlsx`, `*.xls`; los PDFs de
  ingenieros quedan cubiertos por vivir SOLO en Storage.
- Retención/purga: borrar un archivo NO borra las líneas (FK SET NULL);
  la procedencia textual (`original_description`, página/hoja) permanece.
  Política de retención concreta = P-09.

### 4.3 Procedencia por línea (dónde nació cada dato)

Cada `steel_lines` conserva: `source_file_id` + `source_page` (PDF) /
`source_sheet` (Excel) + `source_table_ref` (tabla/área dentro de la
página) + `source_row` + **`original_description` literal** (jamás se
sobreescribe) + `parsed_description` JSONB (interpretación estructurada:
cantidad, estribos/grupos, №, longitud, separación, dobleces, unidades
detectadas, explicación legible) + `parser_version` + `processed_by`
(`user|agent`) + `processed_at`. Espejo del principio de
`quantity_takeoff_lines.raw_values`: **lo crudo es evidencia, lo
interpretado es propuesta.**

### 4.4 Confianza y revisión humana (human-in-the-loop SIEMPRE)

1. El parser produce `confidence_score` (0–1) + explicación por línea.
2. Umbrales (configurables por org; defaults P-10): score ≥ umbral alto ⇒
   `auto_ok` (revisable igualmente); bajo el umbral ⇒ `needs_review`;
   fallo de parse ⇒ línea con `original_description` sola y
   `needs_review`.
3. **Nada se persiste como `confirmed` sin acción humana explícita.**
4. Corrección humana: la edición pasa la línea a `edited`, conserva
   `parsed_description` original en el historial (`steel_actions.metadata`
   con diff) y guarda el par (original → corrección) como ejemplo POR
   ORGANIZACIÓN para ajustar patrones del parser (aprendizaje supervisado
   simple, sin caja negra — V1 §11). Dónde persisten los ejemplos
   (metadata de org vs tabla dedicada) = P-11.
5. El archivo pasa a `reviewed` solo cuando no quedan líneas
   `needs_review` sin resolver; el takeoff no puede pasar a `approved`
   con fuentes sin revisar (alerta A16/A17 + guard en RPC).

### 4.5 Auditoría del ciclo de ingesta

`steel_actions`: `source_uploaded` (hash, tamaño, tipo) →
`source_parsed` (parser_version, conteos, warnings) → `line_edited`/
`line_confirmed`/`line_rejected` (por lote con IDs en metadata) →
`source_reviewed`. Con esto la pregunta "¿de dónde salió este kg?" tiene
respuesta completa: archivo (hash) → página/hoja/fila → texto original →
interpretación → quién confirmó/corrigió y cuándo.

---

## 5. Desviaciones respecto al blueprint V1 (§4) y reconciliación

| # | Tema | V1 decía | Mandato F2 pide | Diseño F2 y reconciliación |
|---|---|---|---|---|
| D1 | Alertas | NO tabla; computadas en dominio, acks en JSONB | entidad `steel_line_alerts` | Tabla como **proyección materializada** del evaluador puro (única fuente de lógica); recomputo idempotente; `evaluator_version` + estado `stale` anti-drift; ack por fila auditable. Actualizar V1 §4.12 al congelar contrato. |
| D2 | Plan de corte | `steel_cut_plan_bars` (fila=barra, cortes JSONB) | `steel_cut_plan_items` | Normalizado a nivel **corte** (fila=corte, barra=grupo `bar_sequence`): FK real a líneas, invariante verificable, mejores consultas. La "vista por barra" es una vista/agregación, no tabla. |
| D3 | Vínculo APU/BOQ | columnas `boq_item_id`/`apu_template_id` en element/línea | tabla `steel_apu_boq_links` | Tabla única con estados `unlinked→suggested→linked→approved` y aprobación humana; se **retiran** las columnas directas de element/línea para evitar doble verdad. Reportes usan JOIN al vínculo `approved`. |
| D4 | Quotes | `steel_supplier_quotes(+lines)` en una entidad compuesta | dos entidades explícitas | Sin conflicto real: F2 las separa formalmente (`steel_quote_lines` con FK a order_line + UNIQUE por par). |
| D5 | Recepciones | mencionada como "tabla hija" | entidad `steel_order_receipts` explícita | Formalizada append-only; `received_qty_total` en la línea SOLO vía RPC. |
| D6 | `steel_specs` | entidad núcleo | no listada en el mandato | Se mantiene como entidad de soporte (§0.1); P-01 decide su migración. |

---

## 6. Preguntas abiertas para la usuaria (antes de congelar contrato F2)

- **P-01:** ¿`steel_specs` entra en la migración 1 de F2 (recomendado:
  sí, con seed #2–#18 y perfiles comunes) o en migración aparte?
- **P-02:** Catálogo definitivo de `element_type` (lista §1.3) — ¿algún
  elemento propio de sus obras falta o sobra?
- **P-03:** ¿`obra` y `compras` escriben en steel desde F3? (espejo D1 del
  blueprint V1; afecta las políticas RLS del blueprint padre).
- **P-04:** Longitudes comerciales default (¿6/9/12 m?) y `kerf_mm`
  default por organización (V1 D3).
- **P-05:** Umbral de "desperdicio excesivo" para alerta A13 (V1 D5
  propone >8 % refuerzo, >12 % perfiles).
- **P-06:** ¿Se permite sobre-entrega en recepciones
  (`received_qty_total > quantity_units`) con tolerancia, o se bloquea?
- **P-07:** Re-cotización: ¿nueva fila de quote con la anterior
  `discarded` (recomendado, historial completo) o UPDATE de la vigente?
- **P-08:** `expired` de quotes: ¿materializado por job programado o
  derivado en lectura? (recomendado: derivado en lectura + alerta A11).
- **P-09:** Política de retención/purga de archivos fuente en Storage
  (¿indefinida por proyecto activo?).
- **P-10:** Umbrales default de `confidence_score` para `auto_ok` /
  `needs_review` (propuesta inicial: ≥0.95 / <0.80, banda media revisable).
- **P-11:** Ejemplos de corrección del parser por organización: ¿tabla
  dedicada (`steel_parser_examples`) o metadata? (recomendado: decidir en
  F3 con datos reales; F2 no la crea).

---

## 7. Resumen de conteos para el plan de migraciones (informativo)

- Tablas nuevas del mandato: **15** (+1 de soporte `steel_specs` si P-01
  = sí) ⇒ FORCE count 43 → **58/59**.
- Todas con `organization_id` directo + RLS ENABLE+FORCE (blueprint RLS en
  el documento padre y `docs/STEEL_OPS_F2_RLS_TEST_PLAN.md`).
- Append-only estrictas: `steel_actions`, `steel_order_receipts`.
- Inmutables por estado: `steel_takeoffs (locked)`, `steel_orders
  (approved+)` y sus hijas; `steel_source_files` (metadatos de origen).
- RPCs previstas (nombres indicativos, NO firmas finales):
  transición de takeoff, import de líneas (preview→confirm, patrón
  `import_quantity_takeoff_batch`), recomputo de alertas, cómputo/aprobación
  de plan de corte, asignación de offcut, creación/transición/aprobación de
  pedido, registro/selección de quote, emisión de observación de precio,
  registro de recepción, sugerencia/aprobación de vínculo APU/BOQ.

> **Recordatorio final:** este documento NO autoriza migraciones. El orden,
> gates y rollback viven en `docs/STEEL_OPS_F2_MIGRATION_SAFETY_PLAN.md`;
> las pruebas RLS en `docs/STEEL_OPS_F2_RLS_TEST_PLAN.md`.
