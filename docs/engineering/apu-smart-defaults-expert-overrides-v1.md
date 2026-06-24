# APU Smart Defaults & Expert Overrides — V1 (Ingeniería / Discovery)

> Estado: **DISCOVERY**. Solo auditoría + diseño. **Sin migraciones aplicadas, sin
> cambios de runtime, sin producción.** Rama
> `feat/apu-smart-defaults-expert-overrides-discovery-v1` desde `main=b1492d7`.

## 1. Auditoría del modelo APU actual

### 1.1 Motor (puro, `apps/web/modules/apu/`)
- `apu.ts` — regla canónica:
  `total_component_cost = quantity × (1 + waste_pct) × unit_price_snapshot`.
  - `calculateApuComponentCost` (material/equipo/subcontrato/otros).
  - `calculateLaborComponentCost(hours, hourlyCost, crewSize)` — labor simple.
  - `calculateToolComponentCost(toolPct, totalLabor)` — herramienta menor.
  - `calculateApuUnitCostFull(components, defaultToolPct)` — desglose + total.
  - `buildCrewLaborComponent({ performanceDays, memberCount, role })` —
    **encoding congelado**: `quantity = performanceDays × memberCount`,
    `unit_price_snapshot = costo_diario_integral`. ⚠️ rendimiento y cuadrilla
    se **colapsan en `quantity`**; no se persisten por separado.
- `labor.ts` — `calculateLaborCost(role)` desde `labor_roles` (salario integral
  mensual/diario/horario). Factores prestacionales configurables.
- `decimal.ts` — precisión Q9.
- `pricing-port.ts` — precio vía `budgetReferencePrice` (snapshot), nunca recalcula descuentos.

### 1.2 Persistencia (`apps/web/lib/db/schema.ts`)
| Tabla | Columna | Significado | Default | Restricción |
|---|---|---|---|---|
| `resources` | `default_waste_pct` | **Desperdicio recomendado por recurso (catálogo)** | `0` | `>= 0` |
| `apu_templates` | `default_tool_pct` | Herramienta menor (fracción) por APU | `0` | `[0,1]` |
| `apu_templates` | `origin_type` | `workbook_import` \| `manual` (procedencia) | `workbook_import` | — |
| `apu_templates` | `source_sheet/row/occurrence`, `import_batch_id` | Procedencia Excel | NULL | — |
| `apu_components` | `waste_pct` | **Desperdicio EFECTIVO por línea** | `0` | `>= 0` |
| `apu_components` | `unit_price_source` | `resource\|labor_role\|manual\|supplier_product` | — | enum |
| `apu_components` | `quantity` | Cantidad (incluye rendimiento×cuadrilla en labor) | — | `>= 0` |
| `apu_components` | `labor_role_id` | Vínculo a rol salarial (trazabilidad) | NULL | — |
| `apu_components` | `source_row/occurrence`, `raw_code/raw_unit` | Procedencia Excel | NULL | — |
| `labor_roles` | `base_salary`, `benefits_pct`, `social_security_pct`, … | Factores M.O. | — | `>= 0` |
| `schedule_tasks` | `crew_size` | Cuadrilla (solo **planning**, no APU) | NULL | `>= 0` |

### 1.3 Lectura / Export / Impacto
- **Read-model** (`lib/contracts/read-model.ts`): `ApuComponentView.wastePct`,
  `ApuDetail.defaultToolPct`, `originType`, desgloses por tipo. La UI/export ya ven
  `waste_pct` y `origin`.
- **Export anexo APU** (`server/estimates/export/apu-annex/`): Excel y PDF muestran
  columna **"Desperdicio"** por componente y meta **"Origen"** por APU.
- **BOQ/Presupuesto**: el unitario del APU alimenta el BOQ; el AIU se aplica encima.
- **Cantidades**: independientes del APU (memorias/takeoff); el desperdicio del APU
  NO altera la cantidad de obra, solo el consumo de recurso dentro del unitario.
- **Cronograma**: usa su propio `crew_size`/rendimiento (generator.ts), independiente del APU.
- **Price Intelligence**: alimenta `unit_price_snapshot` vía precios aprobados; no toca factores.

### 1.4 Inmutabilidad (crítico)
- `modules/estimates/snapshot.ts`: snapshots **deep-frozen** en memoria.
- `modules/estimates/clone.ts`: una versión emitida es **inmutable**; para cambiar
  precios/cantidades/factores se **clona** a una nueva versión.
- `EMITTED_STATUSES = issued|approved|archived` (no se recalculan).

### 1.5 Cobertura de pruebas (red de seguridad)
`tests/unit/cost-domain/` (apu, apu-foundation, labor, boq, estimates, indirect,
commercial-simulation, decimal, **regression-first-floor** = golden master),
`tests/unit/exports/apu-export-*`, `tests/unit/read-model/apu-detail`,
`tests/unit/apu-builder`, `tests/unit/apu-reconciliation`, `tests/regression/rls-apu-*`,
`gm:regression` (22 casos). Cualquier cambio tiene regresión financiera.

## 2. Clasificación de factores (Fase 2)

| Factor | ¿Existe hoy? | ¿Dónde vive? | ¿Editable? | Default/Override | ¿Afecta unitario? | ¿Afecta cantidad de obra? | ¿AIU/export? | ¿DB? | ¿Migración? | Riesgo histórico |
|---|---|---|---|---|---|---|---|---|---|---|
| Desperdicio material | **Sí** | `resources.default_waste_pct` (def) + `apu_components.waste_pct` (efectivo) | Sí (línea) | Ambos | Sí | No | Export sí, AIU no | Sí | Solo si se agrega traza/rango | Bajo (aditivo) |
| Rendimiento M.O. | Parcial (param) | colapsado en `apu_components.quantity` | No (separado) | Debería ser ambos | Sí | No | No directo | Requiere | **Sí** (nuevas cols) | Medio |
| Productividad cuadrilla | Parcial (param) | colapsado en `quantity` (`memberCount`) | No (separado) | Debería ser ambos | Sí | No | No | Requiere | **Sí** | Medio |
| Coeficiente de consumo | Sí (como `quantity`) | `apu_components.quantity` | Sí | Override | Sí | No | Export (cantidad) | Sí | No | Bajo |
| Merma | = desperdicio | (igual desperdicio) | Sí | Ambos | Sí | No | Export | Sí | No | Bajo |
| Herramienta menor | **Sí** | `apu_templates.default_tool_pct` | Sí (APU) | Default APU | Sí | No | Export | Sí | No | Bajo |
| Factor transporte/acceso | No | — | — | Futuro | Sí | No | — | Requeriría | Sí | N/A |
| Factor ciudad/proyecto | No | — | — | Futuro (nivel 3) | Sí | No | — | Requeriría | Sí | N/A |
| Factor complejidad | No | — | — | Futuro | Sí | No | — | Requeriría | Sí | N/A |
| Factor altura/nivel | No | — | — | Futuro | Sí | No | — | Requeriría | Sí | N/A |
| Factor experiencia cuadrilla | No | — | — | Futuro | Sí | No | — | Requeriría | Sí | N/A |
| Factor equipo/herramienta | Parcial | `default_tool_pct` + filas `equipment/tool` | Sí | Default/línea | Sí | No | Export | Sí | No | Bajo |
| Valores del Excel original | Sí | `source_*`, `origin_type` | Read-only | Trazabilidad | — | — | Export "Origen" | Sí | No | N/A |
| Valores calculados auto | Sí | derivados (snapshot/total) | No | Derivado | Sí | — | Export | Sí (snapshot) | No | N/A |
| Valores manuales | Sí | `unit_price_source='manual'`, `notes` | Sí | Override | Sí | — | Export | Sí | No | Bajo |

**Conclusión Fase 2:** desperdicio y herramienta menor son la **base lista** para el
patrón default+override+traza con cambios **aditivos**. Rendimiento/productividad/cuadrilla
y los factores contextuales (ciudad/altura/complejidad) son **trabajo nuevo** que sí
requiere modelo de datos.

## 3. Brechas vs. el producto deseado
1. **No hay traza recomendado-vs-editado** para `waste_pct` (solo el efectivo).
2. **No hay rangos recomendados** (min/max sugeridos) por recurso/tipo.
3. **No hay "valor recomendado" persistido** junto al efectivo para "volver al recomendado".
4. **Rendimiento/cuadrilla no son editables como factores propios** (colapsados en quantity).
5. **No existe jerarquía** workspace/proyecto/capítulo de defaults.
6. **No existen factores contextuales** (ciudad/altura/complejidad/experiencia).

## 4. Jerarquía de defaults/overrides (Fase 4)

| Nivel | ¿Existe hoy? | ¿Cuándo? | ¿DB? | ¿JSON sirve? | Impacto cálculo | Impacto export | Auditoría |
|---|---|---|---|---|---|---|---|
| 1. Sistema | Parcial (recurso) | Ahora | No (constantes/recurso) | Sí | Base | Sí | Origen |
| 2. Empresa/workspace | No | V1D+ | Tabla nueva | Sí (config) | Default | Sí | Sí |
| 3. Proyecto (ciudad/tipo) | No | V1D | Tabla/JSON en `projects` | Sí | Default | Sí | Sí |
| 4. Capítulo/actividad | No | V1D+ | JSON en chapter | Sí | Default | Sí | Sí |
| 5. APU | Parcial (`default_tool_pct`) | V1B | Cols/JSON en `apu_templates` | Sí | Default | Sí | Sí |
| 6. Línea/recurso | **Sí** (`waste_pct`) | V1B | Col existente | — | Efectivo | Sí | Necesita flag origen |
| 7. Override puntual por ítem BOQ | No | Futuro | — | Sí | Efectivo | Sí | Sí |

**Resolución (regla):** valor efectivo = el del nivel **más específico definido**;
si no hay override, hereda hacia arriba hasta el sistema. La traza guarda **de qué
nivel** salió el efectivo.

## 5. Estrategia de datos (Fase 5) — 3 opciones

### Opción A — Columnas explícitas en tablas existentes
Agregar a `apu_components`: `waste_pct_source` (`recommended|manual|excel`),
`recommended_waste_pct`; a `apu_templates`/`projects`: columnas de defaults.
- **Ventajas**: query/check SQL nativos, tipado fuerte, fácil de exportar/filtrar.
- **Riesgos**: muchas columnas si crecen los factores; migraciones por cada factor nuevo.
- **Migración**: aditiva (cols NULLABLE/con default). Compatible con datos actuales.
- **RLS**: heredan las políticas de la tabla (sin cambios).
- **Export/Tests**: directo; golden master no cambia si defaults reproducen el efectivo.
- **MVP**: muy fácil para desperdicio (1–2 columnas). **Futuro**: rígido al escalar factores.

### Opción B — Metadata JSON versionada en APU/línea
Columna `factors_meta jsonb` en `apu_components` (y/o `apu_templates`) con
`{ waste: { source, recommended, range }, performance: {...}, ... }`.
- **Ventajas**: flexible, agrega factores sin migrar; ideal para experimentación.
- **Riesgos**: validación en app (no en SQL), riesgo de drift de forma, queries más
  difíciles, export debe interpretar JSON.
- **Migración**: aditiva (una columna jsonb).
- **RLS**: igual (misma fila).
- **Export/Tests**: requiere serializadores y validadores (zod) propios.
- **MVP**: medio. **Futuro**: muy flexible pero menos auditable.

### Opción C — Tabla separada de *adjustment factors / overrides*
Tabla `apu_factor_overrides` (scope: system/workspace/project/chapter/apu/component,
factor_type, recommended_value, effective_value, source, range_min/max, justification,
created_by, created_at).
- **Ventajas**: modela la **jerarquía completa** y la **trazabilidad/auditoría** de
  forma limpia; extensible a cualquier factor y nivel; histórico de cambios natural.
- **Riesgos**: join adicional en cálculo/lectura; más complejidad inicial.
- **Migración**: tabla nueva + índices + RLS por `organization_id`/scope. Aditiva,
  no toca datos actuales (sin filas = comportamiento idéntico a hoy).
- **RLS**: nueva política multitenant (igual patrón que tablas existentes).
- **Export/Tests**: resolver "efectivo" con precedencia; tests de jerarquía + golden master.
- **MVP**: medio-alto. **Futuro**: el más sólido para producto vendible.

### Recomendación
- **MVP (V1B) — Opción A acotada** SOLO para desperdicio: añadir `recommended_waste_pct`
  + `waste_pct_source` a `apu_components` (aditivo, bajo riesgo, golden master estable).
- **Producto (V1D+) — migrar a Opción C** (`apu_factor_overrides`) para la jerarquía y
  los factores contextuales (ciudad/altura/rendimiento/etc.).
- **Opción B (JSON)**: descartada como fuente de verdad financiera (poca auditabilidad);
  aceptable solo para *hints* de UI no financieros.

> Ninguna migración se aplica en esta oleada.

## 6. Estrategia de cálculo (Fase 6)
- **Unitario recomendado** = recalcular el APU usando, por cada factor, el **valor
  recomendado** del nivel correspondiente (sin overrides manuales).
- **Unitario ajustado** = el cálculo actual (con `waste_pct` efectivo) — **idéntico a hoy**.
- **Delta por override** = ajustado − recomendado (por componente y total).
- **Origen del valor**: `waste_pct_source` (recommended/manual/excel) por línea.
- **Validación de rangos**: comparar efectivo vs `[range_min, range_max]` recomendado →
  bandera `out_of_range` (advertencia, no error).
- **UI**: chip por factor + impacto en vivo (recomendado → ajustado, %).
- **Export**: en perfil técnico, columnas "Recomendado" y "Aplicado"; en perfil cliente,
  solo "Aplicado".

**Ejemplo numérico (desperdicio):**
```
Material base (cantidad):      100 und
Precio unitario snapshot:      $1.000
— Recomendado: desperdicio 7%  → cantidad efectiva 107 → costo $107.000
— Experto ajusta a 12%         → cantidad efectiva 112 → costo $112.000
Delta por override:            +5 und  /  +$5.000  (+4,67%)
Origen del valor:              "Editado manualmente"
Rango sugerido:                5%–10%  → 12% = fuera de rango (advertencia ámbar)
```

## 7. Compatibilidad con presupuestos existentes (Fase 7)
- **No recalcular históricos**: emitidos/aprobados/archivados siguen con su snapshot.
- **Borradores**: muestran recomendado pero **no** cambian el efectivo sin acción.
- **Defaults retro-aplicados = NO**: introducir `recommended_waste_pct` con el **mismo
  valor que el efectivo actual** garantiza delta 0 → golden master intacto.
- **Inmutabilidad reforzada**: cualquier edición de factores opera solo sobre versiones
  editables; las emitidas exigen clonado (mecánica existente).
- **Criterio de aceptación de seguridad**: `gm:regression` 22/22 sin cambios y suite
  financiera verde tras cada fase.

## 8. Plan por fases (ingeniería)

| Fase | Alcance | Archivos probables | ¿DB? | Pruebas | Riesgo | Aceptación |
|---|---|---|---|---|---|---|
| **V1 Discovery** | Auditoría + diseño (este doc) | `docs/**` | No | — | Nulo | Docs aprobados |
| **V1A UI read-only** | Mostrar valor+origen+rango sin editar | `modules/apu/*` (helpers puros de origen/rango), UI APU detail, read-model view (campo origen) | No (deriva de datos) | unit (helpers) + UI render | Bajo | No cambia cálculo; gm 22/22 |
| **V1B Overrides internos** | Editar desperdicio (+herramienta) en APU borrador con traza | `apu_components` (+`recommended_waste_pct`,`waste_pct_source`), server action edición, `modules/apu`, UI experto | **Sí (aditiva)** | unit cálculo recomendado/ajustado, regresión, RLS | Medio | Default reproduce efectivo actual; gm 22/22 |
| **V1C Export** | Override+origen en anexo APU (perfil técnico) | `server/estimates/export/apu-annex/*`, fixtures export | No | export tests (Excel/PDF) | Bajo | Cliente sin datos internos |
| **V1D Defaults por proyecto** | Jerarquía workspace/proyecto/capítulo (Opción C) | `apu_factor_overrides` (tabla), resolver de precedencia, UI plantillas | **Sí (tabla nueva+RLS)** | jerarquía, RLS multitenant, regresión | Medio-alto | Sin filas = comportamiento actual |
| **V1E Inteligencia** | Sugerir rangos por histórico/ciudad/proyecto | `modules/pricing`/analítica, jobs read-only | Posible (lectura) | unit sugerencias | Medio | Solo sugiere, no aplica |
| **Fase aparte** | Rendimiento/productividad/cuadrilla editables | nuevas cols `performance_days`,`crew_*` o `apu_factor_overrides`; refactor `buildCrewLaborComponent` | **Sí** | regresión fuerte | Alto | Encoding retrocompatible |

## 9. Riesgos detectados
1. **Rendimiento/cuadrilla colapsados en `quantity`**: hacerlos editables es el cambio
   de mayor riesgo (toca el encoding congelado y snapshots). Aislar en fase aparte.
2. **Doble fuente de verdad** si se introduce JSON no validado: evitar (usar Opción A/C).
3. **Retro-aplicación accidental** de recomendados a históricos: prohibido; defaults =
   valor efectivo actual al migrar.
4. **Export cliente**: no filtrar rangos/justificaciones internas → fuga de criterio.
5. **RLS**: nueva tabla (V1D) necesita política multitenant correcta desde el inicio.
6. **Golden master**: cualquier cambio de cálculo debe mantener `gm:regression` 22/22.

## 10. Decisión recomendada
Avanzar a **V1A (UI read-only)** primero — **cero DB, cero riesgo de cálculo** — para
validar el patrón con usuarios; luego **V1B** con la Opción A acotada a desperdicio.
Reservar la Opción C (`apu_factor_overrides`) y el rendimiento editable para fases
con contrato y migración revisados aparte.
