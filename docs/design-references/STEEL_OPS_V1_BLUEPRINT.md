# STEEL OPS — Acero y Estructura Metálica (Blueprint V1)

**Fecha:** 2026-07-03 · **Owner:** Fable (Product Architect) · **Estado:**
BLUEPRINT — diseño completo previo a desarrollo. Sin código de producto.
**Regla madre:** nada toca `main` ni producción sin aprobación humana final.

---

## 0. Tesis del módulo

Steel Ops existe para **comprar tiempo operativo**: convertir uno o varios
días de trabajo manual (revisar PDFs/Excel del ingeniero estructural, sacar
cantidades, sumar pesos, calcular desperdicio, armar pedidos) en un flujo
asistido de horas o minutos, **siempre con revisión humana**, trazable de
punta a punta y conectado al presupuesto real (catálogo → APU → BOQ).

No es una tabla de varillas. Es un **sistema global de acero por proyecto**:
refuerzo, elementos de concreto reforzado y acero estructural/metalmecánica,
con catálogo dinámico, precios versionados por proveedor, optimización de
cortes, banco de sobrantes, pedidos y exportación robusta.

---

## 1. Nombre recomendado

- **Nombre de producto (UI):** **“Acero”** en la navegación (corto, como
  Proyectos/Cantidades), con título de módulo **“Acero y Estructura
  Metálica”**.
- **Nombre interno/técnico:** `steel` (módulo en `ACCESS_MODULES`, ruta
  `/steel`, prefijo de tablas `steel_*`, dominio `modules/steel`).
- **Codename de programa:** **STEEL_OPS** (fases `STEEL_OPS_V1A…`).

“Steel Ops” queda como codename; la UI en español es más clara para obra.

---

## 2. Alcance funcional completo (V-completa; se construye por fases §20)

1. **Takeoffs de acero por proyecto** con jerarquía real de obra
   (edificio/torre/piso/zona/frente) y por elemento estructural.
2. **Tres familias de primer nivel desde el día 1** (el modelo de datos NO
   se cierra a varillas):
   - `rebar` — acero de refuerzo: varillas corrugadas, estribos, flejes,
     ganchos, traslapos, longitudinal, superior/inferior, positivo/negativo,
     refuerzos adicionales/temperatura, mallas electrosoldadas, barras por
     detalle.
   - `concrete_element` — elementos que agrupan refuerzo: pilotes, caissons,
     zapatas (aisladas/corridas), vigas (cimentación/amarre/aéreas/cinta),
     columnas, pantallas, muros (estructurales/contención), placas, losas
     (macizas/aligeradas), escaleras, rampas, dinteles, pedestales, riostras,
     bordes/refuerzos especiales.
   - `structural_steel` — perfiles IPE/HEA/HEB/HEM/IPN/W/C/UPN, tubos
     (redondo/cuadrado/rectangular), platinas, ángulos, canales, láminas,
     placas base, pernos, anclajes, cartelas, conectores, soldaduras,
     tornillería, galvanizados/pintados, cerchas y estructuras metálicas.
3. **Ingesta multi-fuente**: plantilla interna, Excel arbitrario con mapeo
   asistido, carga manual línea a línea, PDF con texto, PDF escaneado (OCR,
   fase futura), tablas pegadas, descripciones estructurales.
4. **Interpretación asistida** de despieces (`5#5600`, `74E#3200`,
   `2X65E#3182`, `10#7205 @ 15CM`, `#4 L=0.62`, dobleces sumados, estribos
   @ separación) con **confidence score** y cola de revisión. Propone, nunca
   impone.
5. **Normalización y cálculo**: ml, kg, unidades comerciales, costo estimado.
6. **Desperdicio en 3 modos**: asumido (%), por corte (real contra longitudes
   comerciales), optimizado (reutilización de sobrantes).
7. **Optimización de cortes** (cutting stock 1D) por referencia compatible:
   varilla #N solo con #N; perfil solo con misma referencia/sección/material/
   tratamiento.
8. **Banco de sobrantes** con estados y ahorro estimado (ml/kg/COP).
9. **Pedidos** globales o parciales (por proyecto/torre/piso/actividad/
   elemento/proveedor/etapa), con RFQ, comparación de proveedores y
   aprobación humana.
10. **Precios por proveedor** versionados, con vigencia, estado y trazabilidad
    — **reutilizando el pipeline de pricing existente** (§14).
11. **Vinculación presupuestal**: recurso de catálogo ↔ APU ↔ ítem BOQ ↔
    capítulo.
12. **Modo obra** (fase posterior): entregas parciales, recibido, pendiente,
    sobrante físico.
13. **Alertas automáticas** (§10) y **dashboard** (§8) por todos los cortes
    de análisis.
14. **Exportación Excel** (18 hojas, con fórmulas) y **PDF ejecutivo** (§12).
15. **Trazabilidad total** por línea (§4, `steel_lines` + auditoría).
16. **Aprobación humana obligatoria** en cada frontera: interpretación →
    cantidades → pedido → precio → vinculación presupuestal → export final.

**Fuera de alcance V1 (explícito):** lectura de planos CAD/DWG, OCR de
escaneados (fase 9), interoperabilidad BIM, control de fabricación en taller,
inventario multi-obra compartido.

---

## 3. Alcance técnico

- **Frontend:** Next.js 16 App Router, rutas bajo `app/(dashboard)/steel/*`.
  Server Components + Server Actions, patrón idéntico a quantities/APU.
  UI con shadcn/tailwind + DESIGN.md (tokens ICONIC); tablas virtualizadas
  para miles de líneas.
- **Dominio puro:** `apps/web/modules/steel/*` — parser, calculadora,
  optimizador y evaluador de alertas como **funciones puras sin I/O**
  (patrón cost-domain). Dinero como `DecimalString` (política Q9); pesos y
  longitudes con precisión decimal, `ROUND_HALF_UP` solo en presentación.
- **Server:** `apps/web/server/steel/*` — repositorios RLS-bound (cliente
  supabase server / withTenantDb), actions con `checkModuleAccess('steel')`.
- **DB:** tablas `steel_*` con `organization_id`, **RLS ENABLE+FORCE desde la
  migración 1**, políticas project-scoped-conscientes (compatibles con
  `consulta`/grants V5.6.4-V5.6.5: `app.is_client_role()` ya existe),
  escrituras sensibles vía RPC, auditoría append-only.
- **Archivos fuente:** bucket privado de Supabase Storage
  (`steel-sources/{org}/{project}/...`) + tabla de metadatos con hash;
  nunca en Git (regla 8/12 del proyecto).
- **Import Excel:** SheetJS/ExcelJS server-side con **preview obligatorio**
  antes de persistir (patrón `quantity_takeoff_import` + Homecenter Q14).
- **Export:** ExcelJS con fórmulas nativas; PDF con los generadores del
  pipeline de exports existente.
- **Flag:** módulo gateado por matriz (`ACCESS_MODULES.steel`) + env
  `STEEL_OPS_ENABLED` (§17). Deny-by-default nativo.
- **Sin dependencias nuevas pesadas en V1**; OCR/PDF-tables se evalúan como
  fase con aprobación de licencias (docs/LICENSING.md; nada AGPL).

---

## 4. Modelo conceptual de datos

### Principio rector: UNA sola fuente de verdad

- **Precios**: NO se crea un catálogo de precios paralelo. La fuente de
  verdad sigue siendo `resources` + `supplier_products` +
  `price_observations` (append-only, aprobación humana, historial, estados
  estimado/proveedor/aprobado). Steel Ops **extiende** el catálogo con
  especificación técnica y **consume/alimenta** ese pipeline. “Precio
  vencido” se materializa con `valid_until` en la capa steel (§14).
- **Jerarquía de obra**: se REUTILIZA `project_scopes` (ya soporta
  tower/floor/stage/package/unit anidados). Edificio/torre/piso = scopes;
  `zone` y `work_front` son atributos libres de línea. Cero tablas nuevas de
  jerarquía.
- **Snapshots inmutables**: un pedido aprobado y un takeoff bloqueado NO se
  recalculan (espejo de la regla de presupuestos emitidos).

### Entidades (tablas nuevas, todas con `organization_id` + RLS FORCE)

1. **`steel_specs`** — especificación técnica de un recurso de acero.
   1:1 opcional con `resources` (`resource_id` FK UNIQUE). Campos: familia
   (`rebar|mesh|profile|tube|plate|flat_bar|angle|channel|sheet|anchor|bolt|
   weld|accessory|other`), `steel_type` (grado/norma: p. ej. A615 G60,
   ASTM A36, A572), código interno, nombre comercial, referencia técnica,
   `bar_number` (2–18, para refuerzo), `profile_reference` (IPE 200, HEA…),
   `diameter_mm`, `section_dimensions` (jsonb: alto/ancho/espesor/calibre),
   `unit_weight_kg_m`, `unit_weight_kg_unit`, `commercial_lengths_m`
   (numeric[] — 6/9/12 m…), `purchase_unit`
   (`unit|ml|kg|ton|bundle|sheet|piece`), tratamiento
   (`none|galvanized|painted|anticorrosive|epoxy`), `is_active`, notas.
   Seed inicial: tabla estándar de varillas #2–#18 (kg/m normativos) +
   perfiles comunes. **Versionado**: cambios auditados en `steel_actions`;
   los pesos usados por un takeoff quedan snapshoteados en línea.
2. **`steel_takeoffs`** — cabecera por proyecto: nombre, descripción,
   `status` (`draft|in_review|approved|locked|archived`), configuración de
   desperdicio default (modo + %), `created_by`, fechas. Un proyecto puede
   tener N takeoffs (por etapa/entrega del ingeniero/versión de diseño).
3. **`steel_source_files`** — trazabilidad de fuente: takeoff_id, tipo
   (`internal_template|excel|pdf_text|pdf_scan|manual|paste`), nombre,
   `storage_path`, `sha256`, tamaño, `status`
   (`uploaded|parsing|parsed|partially_parsed|failed|reviewed`), páginas/
   hojas detectadas, resumen de parseo (jsonb), `processed_by`
   (`user|agent`), fechas.
4. **`steel_elements`** — elemento estructural: takeoff_id,
   `element_type` (enum amplio §2.2 + `other`), nombre (“Columna C-12”),
   `axis_location` (“Eje B-4”), `project_scope_id` (piso/torre) NULL,
   `zone`, `work_front`, `boq_item_id` NULL, `apu_template_id` NULL, notas.
5. **`steel_lines`** — **la tabla normalizada central** (una fila = una
   posición de despiece o partida de perfil):
   - Pertenencia: `organization_id`, `project_id`, `steel_takeoff_id`,
     `steel_element_id` NULL, `project_scope_id` NULL (piso/torre),
     `zone`, `work_front`.
   - Fuente: `source_file_id` NULL, `source_page`, `source_sheet`,
     `source_table_ref`, `original_description`, `parsed_description`
     (jsonb: interpretación estructurada), `parser_version`,
     `processed_by`, `processed_at`.
   - Clasificación: `steel_family`, `steel_type`, `steel_shape`
     (`straight|stirrup|hook|lap|mesh_panel|profile_piece|plate_piece|…`),
     `bar_number`, `profile_reference`, `diameter_mm`,
     `section_dimensions` jsonb, `treatment`.
   - Catálogo: `steel_spec_id` NULL, `catalog_resource_id` NULL.
   - Geometría/cantidades: `cut_length_m` (long. de pieza, con dobleces ya
     sumados), `bend_detail` jsonb (15+35+15…), `quantity_per_unit`,
     `repetitions`, `spacing_cm` NULL (@15cm), `spacing_span_m` NULL (luz a
     cubrir cuando la cantidad se deriva de separación), `total_ml`,
     `total_kg`, `commercial_length_m` (elegida), `commercial_units_required`.
   - Snapshots de cálculo: `unit_weight_kg_m_snapshot`,
     `unit_weight_kg_unit_snapshot`, `unit_price_snapshot` NULL,
     `estimated_cost` NULL, `currency`.
   - Desperdicio: `waste_mode` (`assumed|by_cut|optimized`),
     `assumed_waste_pct`, `estimated_waste_ml`, `optimized_waste_ml`.
   - Proveedor/pedido: `supplier_id` NULL, `supplier_price_ref` NULL
     (price_observation/quote), `order_line_id` NULL.
   - Presupuesto: `boq_item_id` NULL, `apu_template_id` NULL (heredan del
     elemento si NULL).
   - Control: `verification_status`
     (`unreviewed|auto_ok|needs_review|confirmed|edited|rejected`),
     `confidence_score` (0–1), `alerts_ack` jsonb, `notes`, `sort_order`,
     `created_by/updated_by`, timestamps.
6. **`steel_orders`** — pedido: proyecto, takeoff NULL (puede agregar de
   varios), nombre, alcance del filtro que lo generó (jsonb: pisos/torres/
   actividades/elementos/familias), `supplier_id` NULL (o multi vía líneas),
   `status` (`draft|rfq_sent|quoted|approved|ordered|partially_received|
   received|closed|cancelled`), totales snapshot (kg/ml/unidades/costo),
   `approved_by/approved_at`, notas. **Inmutable tras `approved`** (cambios
   = nuevo pedido o adenda auditada).
7. **`steel_order_lines`** — agregado comercial por
   spec+longitud+tratamiento: cantidades, kg, unidades comerciales, precio
   unitario snapshot, subtotal, proveedor, entregas (fase obra:
   `received_qty`, `received_at` por evento en tabla hija
   `steel_order_receipts`).
8. **`steel_supplier_quotes`** + **`steel_supplier_quote_lines`** — RFQ y
   respuesta por proveedor: vigencia (`valid_until`), moneda, condiciones,
   disponibilidad, estado (`requested|received|selected|discarded|expired`).
   Al seleccionar/aprobar una quote se puede **emitir** una
   `price_observation` al pipeline general (mismo flujo de aprobación
   humana existente) — así el catálogo global aprende del pedido.
9. **`steel_cut_plans`** + **`steel_cut_plan_bars`** — plan de corte por
   (spec, longitud comercial): cada `bar` = una pieza comercial con sus
   cortes asignados (jsonb ordenado con line_id + longitud), sobrante
   resultante, kerf aplicado, desperdicio final.
10. **`steel_offcuts`** — banco de sobrantes: spec, `bar_number`/referencia,
    longitud, kg, origen (cut_plan_bar/elemento/piso), destino sugerido/
    asignado (line/elemento/piso), `status`
    (`available|suggested|assigned|discarded|final_waste`), ahorro ml/kg/COP,
    `physical` boolean (teórico vs confirmado en obra).
11. **`steel_actions`** — auditoría append-only (patrón
    `apu_manual_actions`): acción tipada (import, parse, línea editada,
    takeoff aprobado, pedido creado/aprobado, quote registrada, precio
    emitido, corte optimizado, sobrante asignado…), actor, metadata jsonb,
    `idempotency_key`.
12. **Alertas:** NO son tabla. Se **computan en dominio puro** sobre los
    datos (siempre frescas, sin drift); solo los *acknowledgements*
    persisten (`steel_lines.alerts_ack` / `steel_takeoffs`). Excepción
    futura: alertas de precio vencido programadas (cron) si se necesita
    notificación push.

### RLS (diseño, se implementa en fase de modelo)

- Todas las `steel_*`: ENABLE+FORCE; SELECT org-scoped **y** project-scoped
  para rol cliente (`app.is_client_role()` ⇒ exige
  `app.has_project_grant(project_id)` — coherente con V5.6.4/V5.6.5A).
- Escrituras: roles internos autorizados (`admin|gerencia|presupuestos` +
  decisión sobre `obra|compras` §22); mutaciones críticas (aprobar takeoff,
  aprobar pedido, emitir precio) vía **RPC SECURITY DEFINER/INVOKER** con
  guards server-side, espejo de patrones existentes.
- `steel_actions`: append-only (sin UPDATE/DELETE).
- Harness `scripts/rls-runtime` gana sección `[ST]` con checks dedicados.

---

## 5. Entidades principales (resumen)

`steel_specs` (qué es el acero) · `steel_takeoffs` (el estudio) ·
`steel_source_files` (de dónde salió) · `steel_elements` (dónde va en la
estructura) · `steel_lines` (la verdad normalizada) · `steel_cut_plans`/
`steel_cut_plan_bars` (cómo se corta) · `steel_offcuts` (qué sobra y se
reusa) · `steel_orders`/`steel_order_lines`/`steel_order_receipts` (qué se
pide y recibe) · `steel_supplier_quotes(+lines)` (qué cotiza el proveedor) ·
`steel_actions` (quién hizo qué).

## 6. Relaciones con el resto de ICONIC OPS

| Con | Vía | Dirección |
|---|---|---|
| Proyectos | `project_id` + `project_scope_id` (torre/piso) | Steel vive DENTRO del proyecto; RLS multiempresa + grants cliente |
| Catálogo | `steel_specs.resource_id` ↔ `resources` (crear/actualizar recurso desde spec con aprobación) | bidireccional |
| Proveedores | `suppliers`, `supplier_products` | Steel consume; quotes pueden crear supplier_products faltantes (aprobado) |
| Precios | `price_observations` (append-only) + snapshot en líneas/pedidos | Steel consume precios aprobados y EMITE observaciones desde quotes |
| APU | `apu_template_id` en elemento/línea; el acero de un APU puede pre-poblar líneas; una spec puede sugerirse como componente material | bidireccional, siempre con aprobación |
| BOQ | `boq_item_id` en elemento/línea → totales de acero por actividad/capítulo; NUNCA modifica snapshots emitidos | Steel alimenta lectura/reportes; escritura al BOQ solo por los RPCs existentes |
| Exports | pipeline actual de generación + perfiles de privacidad | Steel añade formatos propios |
| Accesos | `ACCESS_MODULES.steel` + surface-visibility + guards | igual que todo módulo |

## 7. Flujos principales

**F1 Ingesta y revisión documental**
Proyecto → `/steel` → Nuevo takeoff → subir fuentes (plantilla/Excel/PDF) →
sistema parsea y clasifica → pantalla de revisión lado a lado (original vs
interpretación, con confidence) → usuario confirma/corrige/rechaza →
líneas quedan `confirmed`/`needs_review`.

**F2 Cantidades**
Normalización → cálculo ml/kg/unidades comerciales/costo estimado (precio
aprobado del catálogo si existe; si no, “sin precio” = alerta) → totales por
todos los cortes (piso/torre/elemento/actividad/familia/№).

**F3 Desperdicio y optimización**
Elegir modo por takeoff o por familia → asumido (%) / por corte (plan de
corte con longitudes comerciales + kerf) / optimizado (reutiliza sobrantes
compatibles) → banco de sobrantes → métricas de ahorro.

**F4 Pedido y proveedor**
Filtrar alcance (proyecto/torre/piso/actividad/elemento/familia) → generar
pedido borrador (agregado comercial) → RFQ a proveedor(es) → registrar
quotes (precio, vigencia, disponibilidad) → comparar → seleccionar →
**aprobación humana** → pedido aprobado (inmutable) → opcional: emitir
precio al catálogo (pipeline de aprobación existente).

**F5 Vinculación presupuestal**
Mapear elementos/líneas a actividad BOQ y APU → reportes acero vs
presupuesto → detectar acero sin actividad y actividades sin acero.

**F6 Export y respaldo**
Excel completo (18 hojas, fórmulas) / PDF ejecutivo / Excel de pedido para
proveedor (proyección SIN datos internos).

**F7 Obra (fase posterior)**
Entregas parciales por pedido → recibido vs pendiente → sobrantes físicos
confirmados en banco.

## 8. Pantallas (UIX — responsabilidad Fable)

1. **`/steel`** — hub del módulo con selector de proyecto persistente +
   dashboard (KPIs: total kg/ml/unidades/costo; por familia, №/perfil, piso,
   torre, elemento, actividad, proveedor; desperdicio asumido/real/
   optimizado; ahorro; alertas críticas; archivos pendientes; pedidos por
   estado; precios vencidos).
2. **`/steel/takeoffs`** + **`/steel/takeoffs/[id]`** — lista y workspace
   del takeoff: tabla normalizada virtualizada con filtros combinables
   (torre/piso/zona/frente/elemento/familia/№/proveedor/estado/alerta),
   edición inline, badges de confianza y alertas por línea, agrupación por
   elemento.
3. **`/steel/takeoffs/[id]/sources`** — documentos fuente: estado de parseo,
   revisión lado a lado (página PDF / hoja Excel original ↔ líneas
   propuestas), aceptar/corregir/rechazar por lote.
4. **`/steel/takeoffs/[id]/optimize`** — plan de corte (visual por barra
   comercial con segmentos) + banco de sobrantes + métricas de ahorro +
   parámetros (kerf, longitud mínima útil, longitudes comerciales activas).
5. **`/steel/orders`** + **`/steel/orders/[id]`** — pedidos: composición,
   comparador de quotes por proveedor (precio/kg, vigencia, disponibilidad),
   aprobación, export a proveedor, recepciones (fase obra).
6. **`/steel/catalog`** — catálogo de acero: specs (pesos, longitudes,
   referencias), precio vigente/estado/vencimiento por proveedor, historial
   (lee pipeline pricing), alta de spec nueva → propone recurso al catálogo
   general (aprobación).
7. **`/steel/links`** — vinculación APU/BOQ: matriz elemento/actividad,
   pendientes de vincular, totales cruzados.
8. **`/steel/settings`** — % desperdicio default, kerf, longitud mínima de
   sobrante útil, longitudes comerciales por familia, plantilla interna.
9. **Estados vacíos deliberados** en todo (proyecto sin takeoff, takeoff sin
   fuentes, sin precios, sin pedidos) — copy de guía, nunca pantalla rota.

Componentes compartidos reutilizados: OperationsHeader, FilterPills,
InlineCallout, EmptyState, tablas del workspace; tokens DESIGN.md.

## 9. Estados del sistema

- **Takeoff:** `draft → in_review → approved → locked` (+`archived`).
  `approved` = cantidades validadas; `locked` = snapshot inmutable (pedidos
  emitidos cuelgan de él).
- **Línea:** `unreviewed → auto_ok | needs_review → confirmed | edited |
  rejected`.
- **Fuente:** `uploaded → parsing → parsed | partially_parsed | failed →
  reviewed`.
- **Pedido:** `draft → rfq_sent → quoted → approved → ordered →
  partially_received → received → closed` (+`cancelled` solo desde estados
  no aprobados).
- **Quote:** `requested → received → selected | discarded | expired`.
- **Sobrante:** `available → suggested → assigned | discarded |
  final_waste`.
- **Precio (hereda pipeline):** `estimated | supplier | approved` + steel
  añade `expired` (por `valid_until`).

## 10. Alertas (computadas en dominio puro; severidad crítica/advertencia/info)

**Integridad de interpretación**
A1 longitud calculada ≠ descripción original · A2 cantidad ≠ repeticiones ·
A3 kg/ml no corresponde al №/perfil (tolerancia configurable) · A4 formato
de descripción sospechoso · A5 valores atípicos (z-score sobre el takeoff) ·
A16 planos/archivos cargados sin procesar · A17 detalles con confianza baja
pendientes de revisión.

**Estructura/presupuesto**
A7 elemento sin piso/scope · A8 elemento sin actividad BOQ · A18 líneas sin
vinculación a catálogo/APU/BOQ · A15 cantidades duplicadas (misma fuente/
página/descripción).

**Comercial**
A9 acero sin proveedor · A10 acero sin precio · A11 precio vencido ·
A12 proveedor sin disponibilidad.

**Corte/desperdicio**
A6 corte > longitud comercial disponible (crítica) · A13 desperdicio
excesivo (> umbral configurable) · A14 sobrantes reutilizables no asignados.

Cada alerta: código estable, mensaje accionable, severidad, línea/entidad,
y ack persistente con actor+fecha. El dashboard agrega por severidad.

## 11. Estrategia de importación (PDF/Excel) — human-in-the-loop SIEMPRE

**Principio:** el sistema propone, el humano confirma. Nada se persiste como
`confirmed` sin revisión; nada entra al presupuesto sin aprobación (espejo
de la decisión Q14/Homecenter).

- **V1 — Plantilla interna ICONIC** (Excel oficial versionado): mapeo 1:1,
  confianza alta, cero ambigüedad. Es el puente de adopción inmediato.
- **V1 — Excel arbitrario:** detector de encabezados + **asistente de mapeo
  de columnas** (usuario asigna columnas → campos; el mapeo se guarda por
  organización para reuso) → preview completo → import. Patrón ya probado en
  quantity takeoff import.
- **V1 — Carga manual y pegado de tablas:** editor de líneas con el parser
  de descripciones en vivo.
- **V1 — Parser de despieces (dominio puro, pieza clave):** gramática
  tolerante para la notación real de despiece colombiano:
  `[grupos X]? [cantidad] [E]? # [número] [longitud(cm|m)] [@ separación]?
  [L=…]? [dobleces a+b+c]?` — p. ej. `5#5600` → 5 varillas #5 de 600 cm
  (confianza media: ¿600 cm o 60 cm? el contexto de columna decide);
  `74E#3200` → 74 estribos #3 de 200 cm; `2X65E#3182` → 2 grupos × 65
  estribos #3 de 182 cm; `10#7205 @ 15CM` → barras #7 de 205 @15 cm sobre
  una luz (si hay luz, la cantidad se deriva; si no, `needs_review`);
  `doblez 15 + tramo 35 + doblez 15 = 65` → cut_length 0.65 con
  bend_detail. Cada parse produce interpretación estructurada + confianza +
  explicación legible (“leí: 74 estribos №3, largo 2.00 m”). **Las
  correcciones humanas se guardan como ejemplos por organización** para
  ajustar patrones (aprendizaje supervisado simple, sin caja negra).
- **V2 — PDF con capa de texto:** extracción de tablas → mismo pipeline de
  preview/mapeo. Librería a aprobar por licencia.
- **V3 — PDF escaneado (OCR):** diferido; evaluación de costo/licencia;
  siempre con revisión reforzada (todo `needs_review`).
- **Trazabilidad:** toda línea guarda archivo+página/hoja+tabla+descripción
  original+parser_version+actor+fecha; el archivo fuente queda en Storage
  con hash.

## 12. Estrategia de exportación

**Excel (ExcelJS, fórmulas nativas — los totales del Excel se recalculan
solos al ajustar cantidades en revisión):** hojas
`00_RESUMEN_GENERAL · 01_CANTIDADES_NORMALIZADAS · 02_POR_PROYECTO ·
03_POR_TORRE · 04_POR_PISO · 05_POR_ELEMENTO · 06_POR_ACTIVIDAD_BOQ ·
07_ACERO_REFUERZO · 08_PERFILES_METALICOS · 09_PEDIDO_PROVEEDOR ·
10_PLAN_DE_CORTE · 11_BANCO_DE_SOBRANTES · 12_ALERTAS · 13_CATALOGO_ACERO ·
14_PRECIOS_PROVEEDOR · 15_VINCULACION_APU_BOQ · 16_CONFIGURACION ·
17_AUDITORIA`. `01` es la base con tablas estructuradas; `02–08` con
`SUMIFS` sobre `01`; `00` referencia a las demás.

**Perfiles de privacidad (obligatorio):** export **proveedor** = solo
`09_PEDIDO_PROVEEDOR` (+specs técnicas), SIN precios internos, SIN otros
proveedores, SIN descuentos (regla no negociable 4). Export **interno** =
completo. Export **respaldo técnico** = cantidades+fuentes+auditoría.

**PDF ejecutivo:** portada con costo total, kg, desperdicio (3 modos),
ahorro optimización, alertas críticas, estado de pedidos y de revisión;
gráfica por familia y por piso. Marca de agua “BORRADOR” hasta aprobación
del takeoff.

## 13. Estrategia de optimización de cortes y sobrantes

- **Problema:** cutting stock 1D por grupo de compatibilidad =
  (familia, `bar_number` o `profile_reference`+sección, `steel_type`,
  tratamiento). Un sobrante #3 SOLO sirve a #3; un IPE 200 solo a IPE 200
  del mismo grado/tratamiento.
- **V1 — heurística FFD/BFD** (first/best-fit decreasing): ordenar cortes
  desc., asignar a barra abierta con menor sobrante viable, si no abrir
  barra nueva eligiendo la longitud comercial que minimice sobrante;
  parámetros: kerf por corte (mm), longitud mínima de sobrante útil,
  longitudes comerciales activas por spec. Determinista, explicable,
  testeable — captura ~90 % del valor.
- **Banco de sobrantes:** los sobrantes ≥ mínimo útil entran `available`;
  el optimizador primero consume banco compatible (`suggested` →
  confirmación humana → `assigned`), luego barras nuevas. Cruce entre
  elementos y pisos del mismo proyecto; en fase obra, `physical=true`
  distingue sobrante confirmado en patio.
- **Métricas:** desperdicio teórico (asumido) vs por corte vs optimizado;
  ahorro en ml/kg/COP por grupo y total. El plan de corte es exportable
  (hoja 10) y legible por el oficial de figuración.
- **Futuro:** ILP/column generation exacto como mejora opcional; nunca
  bloquea V1.

## 14. Estrategia de precios variables por proveedor

- **Fuente de verdad:** pipeline existente (`supplier_products` +
  `price_observations` append-only + aprobación humana + price monitoring).
  Steel NO lo duplica: **lo consume** (precio aprobado vigente por recurso)
  y **lo alimenta** (quote seleccionada → emite observación con
  sourceType=steel_quote, trazable al pedido).
- **Steel añade:** `valid_until` (vigencia) en quotes y derivado `expired`;
  precio por kg / por ml / por unidad comercial calculados desde la spec
  (conversión con `unit_weight`); comparador multi-proveedor por pedido
  (precio, vigencia, disponibilidad, condiciones); moneda por quote.
- **Snapshots:** al costear un takeoff o aprobar un pedido, el precio queda
  **snapshoteado en la línea/pedido** (fecha+referencia). Cambios de mercado
  posteriores generan alerta (“precio vigente difiere del snapshot”), nunca
  recálculo silencioso.
- **Historial:** ya lo da price_observations; la UI de `/steel/catalog` lo
  muestra filtrado a specs de acero.

## 15. Estrategia de agentes (Fable/Codex) — autonomía controlada

| Agente | Rol | Puede sin aprobación | Requiere aprobación |
|---|---|---|---|
| **Fable Product Architect** | Este blueprint, contratos, fases, riesgos, coordinación e integración | investigación, docs, contratos, planes | cambios de alcance, decisiones de negocio |
| **Fable UIX** | TODO lo visual: pantallas §8, navegación, estados, dashboard, flujos de revisión/pedido | bocetos, componentes flag-gated no conectados, ramas UI | UI final publicada, cambios a componentes compartidos |
| **Fable QA/Workflow** | Probar como coordinadora de obra: subir archivo → alertas → cantidades → desperdicio → pedido → proveedor → export | fixtures, escenarios, reportes de fricción | declarar fase “lista” |
| **Codex Data Model** | Tablas §4, migraciones, RLS, harness `[ST]` | propuestas, migraciones EN RAMA, harness local | aplicar a Cloud (gate), tocar tablas existentes |
| **Codex Calculation Engine** | Parser, ml/kg/unidades, desperdicio, FFD, banco de sobrantes — dominio puro | todo en `modules/steel` con tests | cambiar fórmulas ya aprobadas |
| **Codex Import/Export** | Lectura Excel, plantilla, export 18 hojas + PDF, compatibilidad archivos reales | prototipos, generadores, fixtures sanitizados | dependencias nuevas (licencias), OCR |
| **Codex Integration** | Conexión catálogo/APU/BOQ/proveedores/exports/permisos | adaptadores EN RAMA leyendo contratos | CUALQUIER cambio de comportamiento de módulos existentes |
| **Codex Test/Safety** | Tests, regresión, RLS, checklist pre-merge, no-afectación | añadir tests, correr suites, bloquear PRs | — (su “no” es vinculante hasta revisión humana) |

**Contrato de reporte obligatorio de cada agente** (en PR y HANDOFF): qué
entendió · qué propone · archivos tocados · riesgos · decisiones que
necesita · qué ejecutó sin aprobación · qué requiere aprobación · tests que
pasó. Cruces entre agentes van por `docs/INTEGRATION_REQUESTS.md`; los
contratos congelados viven en `docs/design-references/STEEL_OPS_*.md`.

**Reglas duras (heredadas de tu instrucción):** los agentes NUNCA hacen sin
aprobación humana: merge a main, deploy, migraciones a Cloud, cambios
destructivos, activar el módulo a usuarios reales, borrar tablas/datos,
cambiar RLS existente, cambiar comportamiento de APU/BOQ/catálogo/export
actual, publicar UI final.

## 16. Estrategia de ramas / worktrees

Patrón probado del repo (worktrees aislados + PRs pequeños + gates):

| Rama (worktree propio) | Contenido | Agente |
|---|---|---|
| `feature/steel-ops-v1a-blueprint` | este documento + contrato | Fable PA |
| `feature/steel-ops-v1b-domain` | `modules/steel`: parser + calculadora + alertas + FFD, 100 % puro + tests masivos | Codex Calc |
| `feature/steel-ops-v1c-data-model` | migraciones `steel_*` + RLS + harness `[ST]` (**gated, sin db push**) | Codex Data |
| `feature/steel-ops-v1d-ui-shell` | rutas `/steel` flag-gated + navegación oculta + dashboard esqueleto + carga manual | Fable UIX |
| `feature/steel-ops-v1e-import-excel` | plantilla interna + mapeo Excel + preview | Codex I/E |
| `feature/steel-ops-v1f-orders-pricing` | pedidos + quotes + puente price_observations | Codex Integration |
| `feature/steel-ops-v1g-optimize` | plan de corte + banco sobrantes (UI Fable + motor Codex) | ambos |
| `feature/steel-ops-v1h-exports` | Excel 18 hojas + PDF ejecutivo | Codex I/E |
| `feature/steel-ops-v1i-links-apu-boq` | vinculación presupuestal | Codex Integration |

Reglas: cada rama nace de `origin/main` fresco (lección V5.6.2B: diff
contra origin/main); PR ≤ ~1 500 líneas netas; QA completa antes de cada
merge (typecheck/lint/suite/gm 22/22/build/diff-check); migraciones SIEMPRE
detrás de compuerta explícita tipo `STEEL_OPS_DB_APPLY_GATE`; secuencia de
release = mergear modelo (sin efecto) → gate DB → mergear app (flag OFF) →
activar flag por rol → validación → GA.

## 17. Feature flags

Doble candado, ambos server-side (la superficie nunca es el control):

1. **Env flag `STEEL_OPS_ENABLED`** (default ausente=off): si off, las rutas
   `/steel` devuelven not-found y el módulo no existe para nadie — permite
   mergear UI a main sin exponerla.
2. **Matriz `ACCESS_MODULES.steel`**: rollout por rol —
   fase interna: `['admin','gerencia']` → +`presupuestos` → +`compras`
   (pedidos) → +`obra` (modo obra) → `consulta` NUNCA en V1 (módulo
   interno; si un día se expone, respeta project grants por diseño).
3. Guards: `requireModuleAccess('steel')` en páginas,
   `checkModuleAccess('steel')` en actions; ⌘K/rail/dashboard heredan por
   surface-visibility.

## 18. Riesgos técnicos

| Riesgo | Mitigación |
|---|---|
| Ambigüedad del parser (5#5600 ⇒ ¿600 o 60 cm?) | confidence + needs_review + contexto de columna + correcciones aprendidas por org; NUNCA auto-confirmar bajo umbral |
| Variabilidad de PDFs de ingenieros | plantilla interna como camino feliz; PDF por fases; escaneado diferido |
| Doble fuente de verdad de precios | decisión §14: reuso del pipeline; prohibido crear tabla de precios paralela |
| Volumen (torres = decenas de miles de líneas) | agregados en SQL, paginación/virtualización, cálculos por lote, índices por takeoff/scope/spec |
| Optimización NP-hard | FFD determinista V1; exacto opcional futuro |
| RLS/consulta | FORCE + is_client_role + has_project_grant desde migración 1 + harness `[ST]` |
| Colisión con módulo Cantidades (V5.7) | contrato de límites: Cantidades = volúmenes/áreas de obra; Steel = acero; enlaces, no solapamiento |
| Excel gigantes en export | streaming ExcelJS + límite de tamaño (patrón EXPORT_SIZE_LIMIT) |
| Licencias de librerías PDF/OCR | aprobación previa vía docs/LICENSING.md; nada AGPL |

## 19. Riesgos de negocio

- **Confianza:** un kg mal calculado = pedido malo = plata. Por eso: doble
  aprobación implícita (línea confirmada + pedido aprobado), trazabilidad a
  la fuente, alertas de coherencia peso/№, y export marcado BORRADOR hasta
  aprobar.
- **Sobre-promesa:** V1 NO lee planos CAD ni escaneados; comunicarlo en la
  UI (“fuentes soportadas hoy”). La expectativa se gestiona por fases.
- **Adopción:** si el flujo es más lento que el Excel de siempre, muere. La
  plantilla interna + carga rápida manual + export idéntico o mejor al
  actual son el puente.
- **Responsabilidad del pedido:** el pedido al proveedor lo aprueba SIEMPRE
  un humano con nombre y fecha (auditado).
- **Sensibilidad comercial:** precios/descuentos por proveedor son internos
  🔒 — jamás en el export de proveedor ni visibles a roles no autorizados.
- **Justificación de inversión:** el dashboard debe medir el valor (horas
  ahorradas ≈ líneas procesadas automáticamente confirmadas sin edición,
  kg de desperdicio evitado, ahorro COP por optimización y negociación).

## 20. Fases de desarrollo

| Fase | Contenido | Valor entregado |
|---|---|---|
| **F0** | Blueprint + contrato congelado (este doc) | alineación |
| **F1** | Dominio puro: parser despieces + calculadora ml/kg/unidades + desperdicio asumido + evaluador de alertas + FFD básico. Solo `modules/steel` + tests (tabla de casos reales) | motor confiable, cero riesgo |
| **F2** | Modelo de datos + RLS + harness `[ST]` (EN RAMA, gate para Cloud) + seed de specs estándar (#2–#18, perfiles comunes) | base persistente |
| **F3** | UI shell flag-gated: `/steel`, takeoff, carga manual + plantilla interna Excel + revisión + cantidades + dashboard mínimo | primer flujo E2E usable interno |
| **F4** | Desperdicio por corte + optimización + banco de sobrantes (motor F1 + UI) | ahorro medible |
| **F5** | Pedidos + quotes + comparador + puente a price_observations | conexión comercial |
| **F6** | Vinculación APU/BOQ + export Excel 18 hojas + PDF ejecutivo | conexión presupuestal + entregables |
| **F7** | Excel arbitrario con mapeo asistido + PDF con texto | menos digitación |
| **F8** | Modo obra: entregas/recibidos/sobrante físico | control de obra |
| **F9** | OCR escaneados / exploración planos (evaluación aparte) | futuro |

Cada fase: PR(s) propios, QA completa, reporte de agente, y NO avanza a la
siguiente sin tu visto bueno.

## 21. Qué se puede hacer primero sin romper nada

1. **F0 (hoy):** este blueprint en rama docs-only + PR.
2. **F1:** dominio puro — parser + cálculos + tests. No toca DB, ni UI, ni
   rutas, ni módulos existentes. Riesgo cero, valor máximo (es el corazón).
3. **Plantilla interna Excel** (archivo de especificación + fixture
   sanitizado con datos del proyecto real para test de regresión, patrón
   golden master — SIN subir Excel reales al repo).
4. F2 en rama (migraciones gated) y F3 flag-off también son inofensivos
   para producción, en ese orden.

## 22. Qué necesita aprobación humana (tuya)

- Merge de CUALQUIER PR a main · aplicar migraciones a Cloud (gate) ·
  activar `STEEL_OPS_ENABLED` y cada ampliación de la matriz de roles ·
  UI final de cada pantalla · fórmulas/pesos normativos del seed ·
  % de desperdicio y umbrales default · decisión `obra`/`compras` en matriz ·
  emitir precios al catálogo general · aprobar takeoffs/pedidos (operativo) ·
  dependencias nuevas (licencias) · cualquier cambio que roce APU/BOQ/
  catálogo/export existentes · paso a cada fase siguiente.

## 23. Checklist antes de pasar a producción (por release)

- [ ] typecheck 0 · lint 0 · suite completa verde · build 0
- [ ] `gm:regression` 22/22 intacto (finanzas NO tocadas)
- [ ] Harness RLS completo + sección `[ST]` en verde local
- [ ] Migraciones aplicadas a Cloud SOLO tras gate explícito + post-verify
      (schema dump: tablas/FORCE/policies/RPCs)
- [ ] Flag OFF por defecto; activación por rol documentada
- [ ] `git diff --check` + scan mojibake + sin archivos privados/Excel reales
- [ ] Tests anti fail-open de acceso (consulta/roles) para rutas `/steel`
- [ ] Export proveedor verificado SIN datos internos 🔒
- [ ] Prueba E2E con documento real del proyecto piloto (ENTRE PATIOS u
      obra activa) validada por usuaria
- [ ] HANDOFF_LOG + DECISIONS + DATABASE_SCHEMA actualizados
- [ ] Plan de rollback: flag off (instantáneo) + módulo aislado (tablas
      steel_* sin FK entrantes desde módulos existentes)
- [ ] Smoke prod sin sesión + validación manual autenticada

---

## Decisiones abiertas para la usuaria (antes de F2)

- D1: ¿`compras` y `obra` entran a la matriz `steel` desde F3 o después?
- D2: ¿La plantilla interna parte del formato de despiece que ya usan sus
  ingenieros? (necesito 1–2 archivos reales de ejemplo, sanitizables).
- D3: Longitudes comerciales default por región/proveedor (¿6/9/12 m?) y
  kerf default.
- D4: ¿El pedido aprobado genera notificación/correo al proveedor (SMTP) o
  solo export manual en V1? (recomendación: export manual V1).
- D5: Umbral default de “desperdicio excesivo” (propuesta: >8 % refuerzo,
  >12 % perfiles, configurable).
