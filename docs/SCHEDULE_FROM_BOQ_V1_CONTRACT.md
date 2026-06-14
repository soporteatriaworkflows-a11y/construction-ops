# SCHEDULE_FROM_BOQ_V1 — Contrato congelado

**Estado:** CONGELADO v1 · **Fecha:** 2026-06-14 · **Agente:** agent-orchestrator
**Rama:** `feature/schedule-from-boq-v1` · **Base:** `origin/main = 5c19cb7`
**Decisión de arquitectura aprobada por el usuario (2026-06-14):** EXTENDER la
fundación de planning de Oleada 3B (no crear tablas paralelas).

> Este contrato es la fuente de verdad del alcance. Complementa —no sustituye—
> `docs/PLANNING_CONTRACT.md` (v1, Oleada 3B). Ante conflicto sobre el dominio de
> cronograma puro (CPM, grafo, Gantt), prevalece `PLANNING_CONTRACT.md`. Sobre la
> generación desde BOQ, el contenedor de cronograma y la edición, prevalece este.

---

## 0. Por qué EXTENDER y no crear tablas nuevas

Ya existe (migrado + RLS FORCE + dominio + read-model + UI lectura) la fundación
3B: `schedule_tasks`, `task_dependencies`, `progress_entries`,
`resource_assignments`, el dominio puro `@/modules/planning` (CPM, grafo, fechas,
Gantt, view-model) y los componentes `planning-summary` / `schedule-table` /
`gantt-chart`. Lo único que falta es: un **contenedor de cronograma**, el
**vínculo a presupuesto/BOQ/APU**, el **generador desde BOQ** y los **caminos de
escritura** (hoy todo es solo lectura).

Crear `planning_tasks` / `planning_dependencies` paralelos duplicaría el dominio
y violaría la **regla no negociable #1 (una sola fuente de verdad)**. Por tanto
SCHEDULE_FROM_BOQ_V1 añade SOLO lo que no existe, de forma **100% aditiva**.

---

## 1. Qué es un cronograma (definición congelada)

Un **cronograma** (`planning_schedules`) es un contenedor versionable de
planificación de obra derivado de **un presupuesto** (`estimate_version`) de un
**proyecto**. Agrupa un conjunto de **tareas** (`schedule_tasks`) jerárquicas
(capítulos como resumen, ítems BOQ como actividades, hitos opcionales) y sus
**dependencias** (`task_dependencies`). Un proyecto/versión puede tener varios
cronogramas (p. ej. `draft` y luego `active`).

### Relación proyecto / presupuesto / versión / BOQ

```
project (1) ──< estimate (n) ──< estimate_version (n) ──< chapters / boq_items
   │                                     │
   └────────────< planning_schedules >───┘   (schedule.estimate_version_id)
                        │
                        └──< schedule_tasks (schedule_id)
                                  ├─ chapter_id      → fase/resumen
                                  ├─ boq_item_id     → actividad
                                  └─ apu_template_id → rendimiento (lectura)
```

---

## 2. Modelo de datos (aditivo)

### 2.1 NUEVA tabla `planning_schedules`

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL → organizations | tenant-scoped, RLS directa |
| `project_id` | uuid NOT NULL → projects | |
| `estimate_version_id` | uuid NOT NULL → estimate_versions | origen del cronograma |
| `name` | text NOT NULL | |
| `status` | text NOT NULL DEFAULT `draft` | `draft\|baseline\|active\|archived` |
| `start_date` | date NOT NULL | fecha base del cronograma |
| `end_date` | date NULL | derivada al recalcular |
| `created_by` | uuid → profiles | |
| `created_at` / `updated_at` | timestamptz | trigger `set_updated_at` |
| `archived_at` | timestamptz NULL | archivar ≠ borrar |

Regla: el cronograma puede apuntar a una versión `issued`/`approved` o editable,
pero **NUNCA la modifica** (solo lectura del presupuesto). No DELETE físico desde
la app: se archiva (`status='archived'`, `archived_at`).

### 2.2 ALTER `schedule_tasks` — columnas NUEVAS, todas NULLABLE

| Campo | Tipo | Nota |
|---|---|---|
| `schedule_id` | uuid NULL → planning_schedules ON DELETE CASCADE | NULL ⇒ tarea 3B legacy/huérfana |
| `boq_item_id` | uuid NULL → boq_items ON DELETE SET NULL | actividad ↔ ítem BOQ |
| `apu_template_id` | uuid NULL → apu_templates ON DELETE SET NULL | rendimiento (lectura) |
| `task_type` | text NULL CHECK `chapter\|activity\|milestone` | NULL ⇒ legacy |
| `unit_snapshot` | text NULL | unidad congelada al generar |
| `quantity_snapshot` | numeric(20,10) NULL | cantidad BOQ congelada |
| `productivity_source` | text NULL CHECK `apu\|manual\|unknown` | trazabilidad de la duración |
| `crew_label` | text NULL | cuadrilla (texto libre) |
| `crew_size` | numeric(12,4) NULL CHECK ≥ 0 | tamaño de cuadrilla (recálculo duración) |
| `responsible` | text NULL | responsable (texto libre V1) |
| `notes` | text NULL | |

No se altera ninguna columna ni constraint existente de `schedule_tasks`.
El `UNIQUE (project_id, wbs_code)` se conserva; el generador produce `wbs_code`
únicos por proyecto (prefijo por cronograma).

### 2.3 Reutilizadas SIN cambios

`task_dependencies` (FS/SS/FF/SF + `lag_days`), `progress_entries` (append-only),
`resource_assignments`. El dominio `@/modules/planning` (CPM, grafo, fechas,
Gantt, view-model) se reutiliza tal cual.

### 2.4 Auditoría

V1 usa la columna existente `external_reference` / `notes` y `progress_entries`
(append-only) como rastro. **No** se crea `planning_audit_log` en V1 (se registra
como deuda `SCHEDULE_AUDIT_LOG_V2` si se requiere bitácora formal). Justificación:
mínimo y seguro; evita superficie nueva sin caso de uso confirmado.

---

## 3. Generación inicial desde BOQ

**read-only + write-on-confirm.** Entrada: `projectId`, `estimateVersionId`,
`scheduleName`, `startDate`, opciones:

- `includeChapters` (capítulos como tareas resumen `task_type='chapter'`)
- `onlyPositiveQuantity` (omitir ítems con cantidad 0)
- `includeItemsWithoutApu` (incluir ítems sin APU)
- `createChapterMilestones` (hito por capítulo)
- `minDurationDays` (duración mínima por actividad)

### Mapeo

- **Capítulos** → tareas `task_type='chapter'`, `is_milestone=false`,
  `parent_task_id=NULL`, duración = suma de hijas (resumen). `boq_item_id=NULL`,
  `chapter_id` seteado.
- **Ítems BOQ** → tareas `task_type='activity'`, `parent_task_id` = la tarea del
  capítulo, `boq_item_id` + `apu_template_id` (si el ítem lo tiene),
  `quantity_snapshot` + `unit_snapshot` congelados desde el BOQ.
- **Hitos por capítulo** (opcional) → `task_type='milestone'`, `is_milestone=true`,
  duración 0, `planned_start = planned_end`.

### Preview (no escribe)

Devuelve: capítulos detectados, actividades detectadas, actividades con
APU/rendimiento, actividades sin APU, duración estimada total, advertencias,
total de tareas a crear. **El preview NO inserta**.

---

## 4. Duración estimada (V1, conservadora)

El APU codifica mano de obra como (contrato APU §5):
`quantity_componente_labor = rendimiento_días × integrantes`, con
`unit_price_snapshot = costo_diario_integral`. El producto se persiste junto, así
que **la duración-calendario exacta no es recuperable** sin tamaño de cuadrilla.
Por tanto V1 no inventa duración exacta:

```
persona_dias_por_unidad = Σ(quantity de componentes labor del APU)
duracion_dias = ceil( quantity_snapshot × persona_dias_por_unidad / crew_size )
```

- `crew_size` por defecto = 1 (editable). `productivity_source='apu'`.
- Si el APU **no tiene componentes labor usables** → `productivity_source='unknown'`,
  `duracion_dias = minDurationDays`, **warning**.
- Si el ítem **no tiene APU** → `productivity_source='manual'`,
  `duracion_dias = minDurationDays`, **warning**.
- La duración nunca baja de `minDurationDays`. Siempre editable después.

Fórmula conceptual permitida (`duración = cantidad / rendimiento_diario`) se
respeta dentro de los límites del encoding actual; si no es seguro inferir, se usa
estimación manual conservadora y se documenta con `productivity_source`.

---

## 5. Fechas, dependencias y recálculo (V1)

- `planned_end = planned_start + duration_days` (inclusive, vía `@/modules/planning/date`).
- Dependencia por defecto **FS** (finish-to-start) + `lag_days`.
- Validación **sin ciclos** (reutiliza `graph.ts`/`topologicalSort`).
- Recálculo **downstream**: al cambiar duración/fecha de una tarea, se recalculan
  las sucesoras según tipo de dependencia + lag.
- Tarea sin dependencia → inicia en `schedule.start_date` o fecha manual.
- **Ruta crítica avanzada queda como deuda** (`SCHEDULE_CRITICAL_PATH_V2`); la
  estructura CPM ya existe (`cpm.ts`) y se deja conectada pero no es el foco V1.

### Progreso

- `progress_pct` 0–100 (constraint existente). >100 y <0 rechazados.
- Estado derivado sugerido: `0 ⇒ not_started`, `1–99 ⇒ in_progress`,
  `100 ⇒ completed`; `blocked` manual.
- **Progreso general del cronograma**: promedio ponderado por
  `planned_duration_days` de las tareas hoja (no capítulos). Decisión: ponderar
  por duración (no por conteo) para reflejar esfuerzo. Documentado aquí.

---

## 6. Permisos

| Rol | Crear/editar cronograma | Actualizar progreso | Ver |
|---|---|---|---|
| admin | ✅ | ✅ | ✅ |
| gerencia | ✅ | ✅ | ✅ |
| presupuestos | ✅ | ✅ | ✅ |
| obra | ❌ | ✅ (solo progreso/estado) | ✅ |
| compras | ❌ | ❌ | ✅ |
| consulta / client | ❌ | ❌ | ✅ (campos 🔒 ocultos) |

Validación **en backend** (server action + RLS), no solo ocultar botones. Campos
🔒 (ruta crítica, holguras, recursos internos, `external_reference`) ocultos a
`client` (ya implementado en el read-model 3B; se conserva).

---

## 7. Integración y no-mutación

- `schedule` se crea desde `estimate_version_id`. Tareas guardan `boq_item_id` y
  `apu_template_id` cuando existen. `quantity` queda como referencia indirecta vía
  BOQ. Se muestra `quantity_snapshot`.
- **Warnings**: ítem BOQ sin APU; APU sin rendimiento usable.
- Si el BOQ cambia luego: el cronograma **no muta automáticamente**. Se considera
  "desactualizado". La comparación con BOQ actual se difiere a
  `SCHEDULE_COMPARE_WITH_BOQ_V2`.
- **No mutar**: BOQ, APU, quantities, precios, presupuestos emitidos. Solo lectura.

---

## 8. Fuera de alcance (V1)

Ruta crítica avanzada, nivelación automática de recursos, curva S financiera,
export MS Project XML, import MS Project, notificaciones, chat, edición avanzada
APU, versionamiento APU, IA de programación automática.

Deudas registradas: `SCHEDULE_CRITICAL_PATH_V2`, `SCHEDULE_BASELINE_V2`,
`SCHEDULE_EXPORT_PDF_EXCEL_V1`, `MS_PROJECT_EXPORT_XML_V1`, `RESOURCE_LEVELING_V2`,
`SCHEDULE_COMPARE_WITH_BOQ_V2`, `SCHEDULE_AUDIT_LOG_V2`, `APU_ADVANCED_EDITOR_V2`,
`APU_VERSIONING_V1`.

---

## 9. RLS

`planning_schedules`: `ENABLE` + `FORCE ROW LEVEL SECURITY`, `organization_id`
directo, filtro `app.current_org()`, `WITH CHECK` cruzado (project + estimate
version de la misma org). Las columnas nuevas de `schedule_tasks` heredan la RLS
existente (FORCE ya activo). El harness RLS runtime se extiende para cubrir
`planning_schedules` y el aislamiento cross-org del generador.
