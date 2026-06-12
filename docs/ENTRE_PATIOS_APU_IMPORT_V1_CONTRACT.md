# ENTRE_PATIOS_APU_IMPORT_V1 + BOQ_APU_LINKING_V1 — Contrato Congelado (FASE 4B.2)

**Rama:** `feature/entre-patios-apu-import-v1`
**Base autorizada:** `origin/main = bfc254b`
**Fecha:** 2026-06-11
**Estado:** CONGELADO — aprobado por agent-orchestrator
**Predecesor:** `docs/APU_COST_MODEL_FOUNDATION_V1_CONTRACT.md` (FASE 4B.1)

---

## 1. Alcance

Importador estructurado y supervisado de la hoja **APU** del workbook real
Entre Patios (`COT.ENTRE PATIOS 1 PISO (1).xlsx`, golden master, NO
versionado), con preview, confirmación idempotente, creación de plantillas
APU trazables y vinculación inequívoca con BOQ.

```
APU → Importar APU → workbook → detectar hoja APU → parsear salarios
→ parsear actividades → parsear componentes → mapear recursos
→ mapear roles laborales → herramienta menor derivada → preview
→ advertencias/excepciones → confirmar → batch + templates + components
→ vincular BOQ exacto y no ambiguo → reporte final + CSV
```

Invariantes absolutos:

- NO sobrescribir templates/recursos/roles existentes silenciosamente.
- NO inventar asociaciones; ambiguos y sin-resolver JAMÁS se vinculan solos.
- NO aprobar precios automáticamente (no toca `resource_price_observations`).
- NO alterar `quantity_snapshot`/`unit_price_snapshot`/`subtotal` de BOQ.
- NO alterar AIU, exports históricos ni versiones emitidas.
- Los subtotales del Excel son EVIDENCIA de comparación; el subtotal
  definitivo lo calcula el dominio (`modules/apu`, Decimal, server-side).

## 2. Formatos admitidos y detección de hoja

- Extensiones: `.xlsx`, `.xls` (workbook multi-hoja; CSV NO aplica: la hoja
  APU requiere identificación por nombre). Tamaño ≤ 10 MB. Archivo vacío ⇒
  rechazo.
- Lectura SOLO server-side con SheetJS (`xlsx`), `cellFormula: true` para
  leer el TEXTO de las fórmulas como metadato estructural (detección de
  herramienta derivada). **Nunca se evalúan fórmulas ni se ejecutan macros**;
  los valores numéricos/textuales provienen del caché del workbook (`v`).
  Ninguna fórmula se persiste en la base de datos.
- Detección de hoja: nombre normalizado (trim + case-insensitive) igual a
  `APU`. Sin hoja APU ⇒ error crítico `apu_sheet_not_found`.
- Digest SHA-256 del contenido parseado de la hoja (celdas relevantes +
  filas), estable entre preview y confirmación.

## 3. Gramática congelada de la hoja APU

### 3.1 Bloques salariales (antes del header de actividades)

Un bloque salarial inicia en una fila cuyo `A` empieza con `S-` y NO tiene
filas de detalle previas pendientes, con `B` = nombre del grupo (p. ej.
`AYUDANTES`, `OFICIAL`). El rol se reconoce por `B` (case/diacríticos
insensitive): contiene `AYUDANTE` ⇒ `ayudante`; contiene `OFICIAL` ⇒
`oficial`. (`A` puede traer typos, p. ej. `S-OIFIAL`; NO se usa para
reconocer.) Bloque no reconocido ⇒ reportado, NO importado, NO inventado.

Filas del bloque (por descripción normalizada en `B`):

| Fila | Extrae |
|---|---|
| `Salario minimo…` | `smlv = F` (caché), `factor = D` (caché) |
| `Subsidio de transporte` | `transporte = F` |
| `Prestaciones legales` | `prestPct = E` |
| `Seguridad social` | `ssPct = E` |
| `Parafiscales` | `parafPct = E` |
| `Dotacion…` | `dotacion = F`, `dotacionMeses = round(1 / D)` |
| `COSTO SALARIO` (DIA) | `diasMes = D` |
| `COSTO SALARIO INTEGRAL HORA` | `horasDia = D`, `horaExcel = F` (evidencia) |

Derivación a `LaborRoleFactors` (fuente única `calculateLaborCost`):

```
baseSalary          = smlv × factor
benefitsPct         = prestPct / factor
socialSecurityPct   = ssPct / factor
payrollTaxPct       = parafPct / factor
transportSubsidy    = transporte
uniformCost         = dotacion ; uniformPeriodMonths = dotacionMeses
workingDaysMonth    = diasMes  ; workingHoursDay     = horasDia
```

Esta derivación reproduce EXACTAMENTE el bloque del Excel (las fracciones
del Excel se aplican sobre el SMLV; el dominio las aplica sobre el base, por
eso se dividen por `factor`). `hourlyIntegralCost` recalculado se compara
contra `horaExcel` — diferencia > 0.01 COP ⇒ advertencia (no bloquea).
Verificado contra el workbook real: Ayudante 16.016,814 ; Oficial
20.807,439 ; cuadrilla 2A+1O = 52.841,0671.

### 3.2 Header de actividades

Fila con `A=ID`, `B=DESCRIPCION`, `C=UND` (normalizados). Las actividades
empiezan después. Sin header ⇒ error crítico `apu_header_not_found`.

### 3.3 Bloque de actividad

- **Inicio:** fila con `A` (código visible) y `C` (unidad raw) no vacíos y
  `B` no vacío, fuera de un bloque abierto. `D..G` del header de actividad
  se ignoran (el bloque `1.114` trae strings `Dias/Cant/...` — tolerado).
- **Descripción:** valor CACHEADO de `B` (las fórmulas
  `='COTIZACION FULL'!Cn` se resuelven por caché; jamás se evalúan).
  Descripción vacía ⇒ actividad en error.
- **Fin:** fila con `B` normalizado = `TOTAL COSTO ACTIVIDAD`; su `G`
  cacheado = costo total Excel (EVIDENCIA).
- **Códigos visibles repetibles:** `code` NO es identificador único. Cada
  actividad recibe `occurrenceIndex` (1-based por código visible normalizado,
  en orden de fila). Identidad interna estable del parseo:
  `{codigoVisible}#{occurrenceIndex}` (p. ej. `MAM-01#3`).
- Celdas extra (p. ej. `H` en fila 453) se ignoran con advertencia.

### 3.4 Filas de componentes

Toda fila entre inicio y fin con `B` no vacío. Se preserva SIEMPRE:
`sourceRow` (fila real 1-based), `rawCode` (= `A` crudo), `rawUnit` (= `C`
crudo), descripción cacheada, `D` (cantidad/rendimiento), `E` (desperdicio,
vacío ⇒ 0), `F` (precio unitario de referencia), `G` (subtotal Excel,
evidencia).

Clasificación por `A` normalizado + descripción:

| Regla | Tipo |
|---|---|
| `A` empieza con `M.O` | `labor` |
| `A` = `Herramienta` y `F` cumple patrón derivado (§3.5) | herramienta DERIVADA (sin fila) |
| `A` = `Herramienta` sin patrón derivado | `tool` explícita |
| Descripción empieza con `Alquiler` | `equipment` (reportado) |
| Resto (`Insumo`, `Insumos`, códigos como `P04-01`, `1.114-01`) | `material` |

`D`/`F` no numéricos ⇒ componente inválido ⇒ actividad `error` (no
importable). `E` no numérico ⇒ 0 + advertencia.

### 3.5 Herramienta menor derivada

Patrón congelado: fila `Herramienta` con `D=1`, `E∈{0,vacío}` y fórmula de
`F` que matchea `=G<fila>*<pct>%` (o `G<fila>*0.35` equivalente) donde
`<fila>` es una fila `labor` DEL MISMO bloque. Entonces:

- `default_tool_pct = pct/100` del template (fracción [0,1]).
- NO se crea fila `apu_components` (semántica congelada de 4B.1 §6).
- El % varía por actividad en el workbook real (20/25/30/35%) ⇒ se congela
  POR TEMPLATE, nunca global.
- Dos o más filas derivadas en un bloque, o referencia a fila no-labor ⇒ la
  fila se conserva como `tool` explícita + advertencia (no se duplica ni se
  suma doble).

### 3.6 Mano de obra (cuadrillas)

Descripción laboral reconocida: patrón `(\d+)\s*(Ayudantes?|Oficial(es)?)`
(case/diacríticos-insensitive), p. ej. `Mano de obra 2 Ayudantes + 1
Oficial`, `Mano de obra 2 Ayudantes`. `D` = horas-cuadrilla (HC).

Encoding congelado (4B.1 §5, una fila por rol):

```
por cada rol r de la cuadrilla:
  quantity            = D × count(r)         (horas del rol)
  unit_price_snapshot = hourlyIntegralCost(r)   ← calculateLaborCost (sheet)
  waste_pct           = 0
  unit_price_source   = 'labor_role'
  labor_role_id       = rol resuelto (OBLIGATORIO en flujos nuevos)
```

Σ filas labor del bloque se compara contra `G` Excel de la fila M.O ⇒
advertencia si |Δ| > 0.01. Descripción laboral NO reconocida ⇒ componente
`unresolved_labor` ⇒ actividad `needs_review`, NO importable (no se inventa
rol, no se importa una actividad con costo incompleto).

### 3.7 Resolución de roles laborales en confirmación

1. Buscar `labor_roles` de la org cuyo `name` normalizado sea exactamente
   `oficial` / `ayudante` (o contenga la palabra como token único
   reconocido). Existente ⇒ REUSAR `labor_role_id` (sin modificar factores).
   Si su `hourlyIntegralCost` difiere del derivado de la hoja ⇒ advertencia
   informativa (el snapshot SIEMPRE es el derivado de la hoja — evidencia).
2. No existe ⇒ CREAR rol con factores derivados §3.1
   (code `S-OFICIAL` / `S-AYUDANTE`; colisión de code ⇒ sufijo `-2`, `-3`…).
3. Nunca UPDATE de roles existentes. Nunca roles distintos de los
   reconocidos.

## 4. Matching de materiales (y equipment/tool explícitos)

Identificadores org-wide de `resources` (id, code, name, unit,
external_sku, external_reference). Orden congelado (trim +
case-insensitive):

1. `code` exacto — pero la hoja APU NO trae códigos de catálogo: solo aplica
   si `rawCode` del componente coincide exactamente con un code de recurso.
2. `external_reference` exacta (si el componente trae referencia).
3. `external_sku` exacto.
4. Descripción normalizada (lower + colapso espacios + sin diacríticos) +
   unidad equivalente (`unitsEquivalent`) ⇒ **SUGERENCIA, nunca
   autoconfirmación**. La igualdad solo de descripción (unidad distinta) ⇒
   sugerencia con advertencia de unidad.

Resultados: `exact` | `suggested` | `unresolved` | `ambiguous` (≥2
candidatos en cualquier nivel ⇒ `ambiguous`).

- Solo `exact` se asocia automáticamente.
- `suggested` puede ser ACEPTADA EXPLÍCITAMENTE por la usuaria en el preview
  (selección consciente por componente). En la confirmación el servidor
  RE-CALCULA la sugerencia y solo acepta si el `resourceId` aceptado es
  EXACTAMENTE su propia sugerencia única re-derivada; cualquier otro valor ⇒
  rechazo del acepte (jamás asociación silenciosa ni arbitraria).
- `unresolved`/`ambiguous`/sugerencia no aceptada ⇒ el componente se importa
  SIN `resource_id` (`unit_price_source='manual'`), con `rawCode`/`rawUnit`/
  descripción preservados en `notes`, visible y reportado.

Precio del componente material/equipment/tool: `unit_price_snapshot` =
precio `F` cacheado del Excel (evidencia congelada; el precio aprobado
baseline del recurso se muestra en preview como comparación y JAMÁS se
aprueba/modifica desde aquí). Componentes asociados usan
`unit_price_source='resource'`; sin asociar ⇒ `'manual'`.

## 5. Recalculo server-side (fuente única)

- Componente: `round(quantity × (1 + waste) × price, 10)` — paridad con la
  regla canónica del dominio y del trigger BOQ.
- Total template: `calculateApuUnitCostFull(components, default_tool_pct)`.
- `costExcel` (G del TOTAL COSTO ACTIVIDAD) y subtotales G por fila son solo
  EVIDENCIA: diferencia > 0.01 COP ⇒ advertencia `cost_delta` visible en
  preview (no bloquea si los insumos del recálculo son válidos).
- Unidades: `canonicalizeUnit` REUTILIZADO (raw SIEMPRE preservado).

## 6. Persistencia, deduplicación e idempotencia

### 6.1 Tabla nueva `apu_import_batches` (aditiva, RLS ENABLE+FORCE)

```
id uuid PK · organization_id FK · digest_sha256 text · source_filename text
source_sheet text · imported_by FK profiles · imported_at timestamptz
status text ('completed') · total_activities int · total_components int
imported_activities int · imported_components int · linked_boq_items int
skipped_existing int · unresolved_count int · warning_count int
metadata jsonb
UNIQUE (organization_id, digest_sha256)
```

Políticas (paridad `price_observation_batches`): SELECT miembros org;
INSERT roles DB `admin|gerencia` con `imported_by = app._auth_uid()`;
sin UPDATE/DELETE ⇒ inmutable.

### 6.2 Columnas provenance (aditivas, NULL, retrocompatibles)

- `apu_templates`: `import_batch_id` (FK batches, trigger same-org
  controlado), `source_sheet text`, `source_row int`,
  `source_occurrence_index int`.
- `apu_components`: `source_row int`, `source_occurrence_index int`,
  `raw_code text`, `raw_unit text`.

Sin DROP, sin DELETE, sin backfill, sin cambio de tipos. Solo local en esta
oleada (sin `db push` remoto).

### 6.3 RPC atómica `public.import_apu_batch(p_batch jsonb, p_templates jsonb)`

Patrón `import_boq_into_version`: `SECURITY INVOKER` (RLS WITH CHECK aplica
a CADA insert), deny-by-default sin sesión/membresía, REVOKE PUBLIC/anon +
GRANT authenticated. Comportamiento congelado:

1. **Idempotencia:** si existe batch de la org con el mismo
   `digest_sha256` ⇒ retorna `{duplicate: true, batchId}` sin escribir nada.
   Carrera (23505) ⇒ mismo tratamiento.
2. Inserta el batch (`organization_id = app.current_org()`,
   `imported_by = app._auth_uid()`).
3. Por template: si ya existe `(org, code, version=1)` ⇒ `skipped_existing`
   (JAMÁS update); si no, inserta template (+provenance, +`default_tool_pct`)
   y sus componentes con `total_component_cost` RECALCULADO en SQL
   (`round(qty×(1+waste)×price,10)`) — nunca el valor del cliente.
4. Todo en una transacción: error ⇒ revierte todo (sin templates huérfanos).
5. Devuelve conteos + ids creados + skips.

Códigos de template persistidos: `code = codigoVisible` si es único en la
hoja; si se repite, `codigoVisible#occurrenceIndex` para las ocurrencias ≥2
(p. ej. `MAM-01`, `MAM-01#2`). El código visible original es recuperable y
la procedencia exacta queda en `source_row`/`source_occurrence_index`.

### 6.4 Confirmación server-side

- `organizationId`/`userId` SIEMPRE server-side (viewer autenticado).
- Roles app `management|internal`; modo `READ_MODEL_SOURCE=db` +
  `APP_AUTH_MODE=supabase` (paridad catálogo). Roles DB `admin|gerencia`.
- Re-parse COMPLETO del archivo + verificación de digest del preview; el
  preview del navegador es solo intención.
- Aceptes de sugerencias re-validados (§4). Target de linking re-validado.

## 7. BOQ_APU_LINKING_V1

- Objetivo: poblar `boq_items.apu_template_id` SOLO con relaciones
  inequívocas. `code` NO se asume único global (códigos BOQ `1.01…` ≠
  códigos APU `P-01…` ⇒ el matching por código no aplica en Entre Patios).
- **Scope:** una `estimate_version` objetivo seleccionada explícitamente en
  el preview, validada server-side: visible para la org y EDITABLE
  (`draft|review`). Emitidas/aprobadas/archivadas JAMÁS (RLS además bloquea
  UPDATE). Linking es opcional (sin versión objetivo ⇒ solo import).
- **Clave de matching congelada:** descripción normalizada (lower, colapso
  de espacios, sin diacríticos) + unidad canónica (`canonicalizeUnit`).
  Candidatos = ítems no archivados de la versión objetivo.
- Estados por actividad:
  - `linked`: EXACTAMENTE 1 ítem BOQ matchea Y EXACTAMENTE 1 actividad de la
    hoja produce esa clave Y el ítem tiene `apu_template_id IS NULL`.
  - `ambiguous`: ≥2 ítems BOQ con la clave, o ≥2 actividades de la hoja con
    la misma clave (códigos repetidos sin distinción) ⇒ NO vincula.
  - `skipped_existing`: el ítem ya tiene `apu_template_id` ⇒ NO se reemplaza
    (sin confirmación de reemplazo en esta oleada — fuera de alcance).
  - `unresolved`: 0 candidatos.
- UPDATE guardado: `SET apu_template_id = X WHERE id = Y AND
  apu_template_id IS NULL` (carrera ⇒ skip). Nada más cambia en el ítem
  (cantidades, precios, subtotal, AIU intactos — invariante absoluto).
- Templates `skipped_existing` del import participan del linking con su id
  existente (mismo código ⇒ mismo template), reportado.
- Vínculo auditable: conteo en el batch + detalle por actividad en el
  reporte CSV descargable (actividad, clave, estado, ítem vinculado).

## 8. Preview (`/apu/import`)

Resumen: actividades detectadas, componentes detectados, exact matches,
sugerencias, sin resolver, ambiguos, advertencias, errores críticos,
vinculables BOQ, no vinculables. Tabla de actividades: código visible,
descripción, unidad, occurrence index, # componentes, costo Excel
(referencia), costo recalculado, diferencia, estado, acción revisar.
Detalle por actividad: componentes con raw code, recurso asociado/sugerido,
rol laboral, cantidad, desperdicio, precio Excel, precio aprobado baseline
(comparación), subtotal Excel, subtotal recalculado, advertencias.
Filtros: exactos / sugeridos / sin resolver / ambiguos / diferencias de
costo / vinculables BOQ. Errores críticos BLOQUEAN la confirmación.
Lenguaje de usuario final (sin nombres técnicos).

## 9. Seguridad y RLS

- Lectura/escritura SIEMPRE RLS-bound (`createClient()`); nunca service-role.
- `apu_import_batches` tenant-scoped ENABLE+FORCE (count FORCE 30→31).
- Trigger same-org para `apu_templates.import_batch_id` (FK valida sin RLS).
- Roles app: `management|internal`; `site`/`client` ⇒ acceso restringido
  (página y actions). Sin secretos en cliente; archivo nunca persistido.
- El workbook jamás entra a Git (`private/`, `*.xlsx` ignorados); fixtures
  de tests 100% sintéticos sanitizados.

## 10. Fuera de alcance (deudas registradas)

| Deuda | Contenido diferido |
|---|---|
| `QUANTITY_TAKEOFF_IMPORT_V1` (4B.3) | Cantidades, despieces geométricos, `quantity_group_id` |
| `APU_UI_ADVANCED_EDITING_V1` | Editor manual de APU/componentes, resolución posterior de unresolved |
| `APU_REUSABLE_CREW_TEMPLATES_V1` | Cuadrillas reutilizables entre APU |
| `BOQ_TO_CATALOG_ASSISTED_BOOTSTRAP` | Bootstrap asistido de catálogo desde BOQ |
| `BOQ_APU_RELINK_WITH_CONFIRMATION` | Reemplazo confirmado de `apu_template_id` existente |

También fuera: SMTP, usuarios, chat, deploy, db push remoto, escrituras
remotas, datos dummy remotos, snapshots de cálculo APU por versión.

## 11. Golden master

`costos_directos = 336084479.93690735` y `total_costo = 372247169.9781186`
(±0.01) NO cambian: el import no toca `boq_items` (salvo
`apu_template_id`), capítulos, AIU ni cantidades. Regresión 22/22 +
`gm:import` deben seguir PASS.

---

## Historial

| Fecha | Cambio |
|---|---|
| 2026-06-11 | Contrato congelado por agent-orchestrator (FASE 4B.2) |
