# APU_COST_MODEL_AND_IMPORT_V1 — Documento de Descubrimiento

**Rama de auditoría:** `audit/apu-cost-model-import-v1`
**Fecha:** 2026-06-11
**Tipo:** Inspección read-only. Sin código de producto. Sin migraciones. Sin deploy.
**Autor:** Auditoría autónoma — Claude Code (audit branch)

---

## Objetivo

Inspeccionar el repositorio en su estado actual sobre `main` (HEAD `9f6816f`) y
congelar el diagnóstico técnico de todo lo que existe y todo lo que falta para
implementar el motor APU completo con importación estructurada del modelo
**Entre Patios** y conexión real **APU → BOQ**.

---

## A. Soporte actual reutilizable

### A.1 Esquema de base de datos (migrations aplicadas en `main`)

| Tabla | Migración | Estado |
|---|---|---|
| `labor_roles` | `20260530090300` | ✅ Completa (todos los factores prestacionales) |
| `apu_templates` | `20260530090600` | ✅ Completa (code, name, unit, version, chapter_template_id) |
| `apu_components` | `20260530090600` | ✅ Completa (regla canónica, component_type, unit_price_source) |
| `apu_calculation_snapshots` | `20260530090900` | ✅ Completa (foto inmutable por versión) |
| `resources` (con metadatos import) | `20260611090000` | ✅ Completa (description, category, brand, external_reference, external_sku) |
| `boq_items.apu_template_id` | `20260530090700` | ✅ Columna FK nullable (pendiente poblar) |
| `boq_items.quantity_group_id` | `20260530090700` | ✅ Columna FK nullable (pendiente poblar) |

### A.2 Dominio de costos (`apps/web/modules/apu/`)

| Función | Archivo | Estado |
|---|---|---|
| `calculateLaborCost(role)` | `labor.ts` | ✅ Pura, testeada, sin redondeo intermedio |
| `calculateApuComponentCost(input)` | `apu.ts` | ✅ Regla canónica `qty×(1+waste)×price` |
| `calculateLaborComponentCost(h, cost, crew)` | `apu.ts` | ✅ Cuadrilla explícita como parámetro |
| `calculateToolComponentCost(pct, moTotal)` | `apu.ts` | ✅ Herramienta derivada como % de M.O. |
| `calculateApuUnitCost(componentCosts)` | `apu.ts` | ✅ Suma de componentes |
| `resolveUnitPriceSnapshot(port, resource, version)` | `apu.ts` | ✅ Desde PricingReadPort |

### A.3 Tests existentes

| Archivo | Tests | Estado |
|---|---|---|
| `tests/unit/cost-domain/labor.test.ts` | 9 casos | ✅ Todos PASS |
| `tests/unit/cost-domain/apu.test.ts` | 17 casos | ✅ Todos PASS |
| `scripts/golden-master/first-floor.regression.test.ts` | 22/22 | ✅ Golden master intacto |

### A.4 Read-model

- `ApuSummary { id, code, name, unit, unitCost, componentCount }` — contrato congelado v1
- `listApus(viewer)` implementado en `FixtureReadModelRepository` y `DrizzleReadModelRepository`
- UI page: `app/(dashboard)/apu/page.tsx` — lista de APU con costo unitario

### A.5 Fixture sanitizado v2.0.0

- **1** `laborRole` (Oficial: base 1.300.000, transporte 162.000, factor total ~1.695+)
- **1** `apuTemplate` (Instalación piso porcelanato 60x60, unidad m²)
- **2** `apuComponents` (material porcelanato + labor oficial)
- **14** capítulos + **131** ítems BOQ reales de COTIZACION 1 PISO
- `boqItems[*].apuTemplateId = null` (ninguno linkado a APU)
- `boqItems[*].quantityGroupId = null` (ninguno linkado a cantidades)

### A.6 Infraestructura de importación

- `scripts/excel-import/sheet-map.ts`: spec de las 10 hojas declarada (columnas APU como `TODO_VERIFY`)
- `scripts/excel-import/import.ts`: framework idempotente listo; solo valida totales del golden master
- `scripts/golden-master/`: regresión financiera 9 indicadores (22/22 PASS permanente)
- `scripts/golden-master/dump-workbook.mjs`: dump estructural del Excel

---

## B. Brechas reales

### B.1 Hoja APU no parseada

El importador (`import.ts`) valida totales del golden master pero **no extrae** datos de
la hoja `APU`. Las columnas de la hoja están como `TODO_VERIFY` en `sheet-map.ts`. No
existe ningún parser que lea el bloque salarial ni los bloques APU individuales.

**Impacto:** Todos los `apu_templates` y `labor_roles` del fixture son ficticios (1
plantilla demo, 1 rol demo). El proyecto ENTRE PATIOS real tiene múltiples APU y al
menos 2 roles (Oficial + Ayudante).

### B.2 BOQ → APU no vinculado (`BOQ_TO_CATALOG_ASSISTED_BOOTSTRAP`)

Los 131 ítems BOQ tienen `apu_template_id = null`. La columna existe en schema pero
ningún proceso la puebla. La deuda está documentada en `docs/DECISIONS.md` (2026-06-10).

**Impacto:** Sin este vínculo no es posible:
- Desglose por tipo de costo por capítulo (`COST_TYPE_BREAKDOWN_FOUNDATION`)
- Recalcular precios cuando cambian los materiales
- Trazabilidad APU → ítem de presupuesto

### B.3 `labor_role_id` faltante en `apu_components`

`apu_components.unit_price_source = 'labor_role'` es un marker textual, pero no existe
FK `labor_role_id` que apunte a `labor_roles.id`. El vínculo entre un componente laboral
y su rol salarial es **implícito** (no trazable en DB).

**Impacto:** No es posible recalcular automáticamente el `unit_price_snapshot` de mano de
obra cuando cambia el salario del rol. Tampoco hay auditoría de "este costo de M.O. vino
del rol Oficial con base X".

### B.4 Herramienta derivada — semántica ambigua en schema

La función `calculateToolComponentCost(toolPct, totalLaborCost)` computa:
`costo_herramienta = toolPct × totalLaborCost`

Pero en `apu_components` con `component_type='tool'`, la fórmula del contrato es:
`total_component_cost = quantity × (1+waste) × unit_price_snapshot`

Estas dos formas son **incompatibles**. Para herramienta derivada como % de M.O.:
- `quantity` almacena `toolPct` (fracción)
- `unit_price_snapshot` necesita el total de M.O. como snapshot — dato no estático
- La fórmula canónica `qty×(1+waste)×price` NO reproduce el cálculo si `price` es el total MO

No existe en el schema un campo `unit_price_source = 'derived_from_labor'` ni `default_tool_pct`
en `apu_templates`.

### B.5 Sin modelo explícito de cuadrilla

El Excel usa cuadrilla estándar **2 ayudantes + 1 oficial**. La función
`calculateLaborComponentCost(h, cost, crewSize)` acepta `crewSize` como parámetro pero
el schema no tiene tabla ni columna de cuadrilla. El `crewSize` se codifica implícitamente
en la `quantity` del componente de mano de obra.

### B.6 Solo 1 labor role en fixture (falta Ayudante)

El fixture tiene únicamente `ROL-OF-001 Oficial`. El modelo Entre Patios requiere al
menos `ROL-AY-001 Ayudante` (salario base, factores y resultados distintos).

### B.7 Sin UI de detalle APU

La página `/apu` muestra solo el resumen (code, name, unit, unitCost, componentCount).
No existe ruta `/apu/[id]` que muestre el desglose de componentes (insumos, M.O.,
herramienta, desperdicio, subtotales por tipo).

### B.8 Cantidades no vinculadas a BOQ

`boq_items.quantity_group_id` es nullable y siempre null en el fixture. Las
`quantity_groups` y `quantity_lines` de CANTIDADES 1 PISO no están importadas ni
vinculadas a los ítems BOQ correspondientes.

### B.9 `COST_TYPE_BREAKDOWN_FOUNDATION` no resuelta

Sin APU → BOQ linkage no es posible computar desglose por tipo de costo
(materiales / mano de obra / equipos / subcontratos) por capítulo ni por proyecto.
Esta deuda bloquea el dashboard financiero avanzado.

---

## C. Modelo de datos mínimo propuesto

Las tablas de APU **ya existen** y son suficientes con adiciones aditivas menores.

### C.1 Adición mínima 1: `labor_role_id` en `apu_components`

```sql
-- ADITIVA: no rompe data existente (NULL en todos los rows actuales)
ALTER TABLE apu_components
  ADD COLUMN labor_role_id uuid REFERENCES labor_roles(id) ON DELETE SET NULL;

CREATE INDEX apu_components_labor_role_id_idx ON apu_components (labor_role_id);
```

**Por qué:** traza el origen del `unit_price_snapshot` de labor a su rol salarial,
habilita recalcular snapshots cuando cambia el salario, y permite auditoría.

### C.2 Adición mínima 2: `default_tool_pct` en `apu_templates`

```sql
-- ADITIVA: porcentaje de herramienta menor sobre total M.O. del APU
ALTER TABLE apu_templates
  ADD COLUMN default_tool_pct numeric(20,10) NOT NULL DEFAULT 0,
  ADD CONSTRAINT apu_templates_tool_pct_nonneg CHECK (default_tool_pct >= 0);
```

**Por qué:** resuelve la ambigüedad de semántica de herramienta derivada. El porcentaje
vive en el template (configurable por APU), no en `apu_components` donde `quantity` se
confundiría con rendimiento/consumo. El componente `tool` en `apu_components` se elimina
como fila y se reemplaza por este campo calculado en el dominio.

**Alternativa si se prefiere no agregar columna:** mantener `apu_components` con
`component_type='tool'`, `quantity = toolPct`, `unit_price_source = 'manual'`, y
`unit_price_snapshot = 0` (el dominio calcula el total usando `calculateToolComponentCost`
y lo escribe en `total_component_cost`). Requiere documentar la excepción a la fórmula
canónica y cambiar el CHECK de `unit_price_snapshot >= 0` (ya lo permite).

### C.3 Cuadrillas — sin tabla nueva (encoding en componentes)

Se codifica la cuadrilla como múltiples filas de `apu_components` con
`component_type = 'labor'`, una por cada rol que integra la cuadrilla:

```text
apu_components row: Ayudante
  labor_role_id = UUID(ROL-AY-001)
  quantity      = rendimiento_dias × 2  -- 2 ayudantes en la cuadrilla
  unit_price_snapshot = costo_diario_ayudante  -- snapshot al momento del import

apu_components row: Oficial
  labor_role_id = UUID(ROL-OF-001)
  quantity      = rendimiento_dias × 1  -- 1 oficial
  unit_price_snapshot = costo_diario_oficial
```

Así la cuadrilla queda codificada como múltiples componentes de labor, cada uno con
`labor_role_id` para trazabilidad. No requiere tabla nueva.

---

## D. Labor cost model — estado y brechas

| Aspecto | Estado |
|---|---|
| Tabla `labor_roles` (schema) | ✅ Completa |
| `calculateLaborCost()` (dominio) | ✅ Pura, testeada |
| Factores: base + transporte + beneficios + seg.social + parafiscales + dotación | ✅ Completos |
| Costo mensual / diario / horario calculado (no almacenado) | ✅ Correcto |
| Rol Oficial en fixture | ✅ Con factores ficticios plausibles |
| Rol Ayudante | ❌ Faltante |
| Parser hoja APU → bloque salarial → `labor_roles` DB | ❌ No implementado |
| FK `labor_role_id` en `apu_components` | ❌ Columna no existe |
| Recalculación automática de snapshots ante cambio de salario | ❌ No implementado |

La fórmula salarial implementada en `labor.ts`:
```
salario_integral_mensual =
    base_salary × (1 + benefits_pct + social_security_pct + payroll_tax_pct)
  + transport_subsidy
  + (uniform_cost / uniform_period_months)

costo_diario  = mensual / working_days_month
costo_hora    = diario  / working_hours_day
```

---

## E. Cuadrillas — modelo entre patios

La hoja APU del Excel define implícitamente la cuadrilla por número de filas de
mano de obra dentro de cada bloque APU.

**Cuadrilla base observada en ENTRE PATIOS:** 2 ayudantes + 1 oficial

**Encoding en schema propuesto (sin tabla nueva):**
```text
Para un APU con rendimiento r días/unidad:

  row Ayudante: quantity = r × 2, labor_role_id = ROL-AY-001
  row Oficial:  quantity = r × 1, labor_role_id = ROL-OF-001
```

Si la cuadrilla varía por actividad (albañilería vs acabados vs estructura), se
codifica en las `quantity` de cada APU individualmente.

**Riesgo:** no hay tabla `apu_crew_templates` que reutilice la definición de cuadrilla
entre APU. Si la cuadrilla 2A+1O es estándar en toda la obra, puede crearse como
referencia reutilizable en una oleada posterior.

---

## F. Componentes APU — taxonomía actual y propuesta

| `component_type` | Fórmula en dominio | `quantity` representa | `unit_price_snapshot` | Reutilizable |
|---|---|---|---|---|
| `material` | `qty×(1+waste)×price` | Consumo por unidad APU | Precio del insumo | ✅ Via resource |
| `labor` | `qty×price` (waste=0) | Días×crewSize por unidad APU | Costo diario del rol | ✅ Via labor_role_id |
| `equipment` | `qty×price` | Horas o días | Tarifa horaria/diaria | ✅ Via resource |
| `tool` (derivada) | `toolPct × totalMOCost` | toolPct (fracción) | `0` o total MO (ambiguo) | ⚠️ Ver B.4 |
| `subcontract` | `qty×price` | Unidades subcontratadas | Precio del subcontrato | ✅ Via resource |
| `other` | `qty×(1+waste)×price` | Genérico | Precio genérico | ✅ Manual |

**Propuesta:** resolver la ambigüedad de `tool` con `apu_templates.default_tool_pct`
(ver C.2). Eliminar rows de tipo `tool` de `apu_components`; el dominio lo aplica
automáticamente después de calcular el total de labor.

---

## G. Rendimientos

El campo `apu_components.quantity` almacena el **rendimiento/consumo por unidad
de actividad** del APU.

| Tipo | Significado de `quantity` | Ejemplo Entre Patios |
|---|---|---|
| Material | m², kg, sacos, und... por unidad APU | 1.05 m² porcelanato / m² instalado |
| Labor | Días del rol × crewCount por unidad APU | 0.10 días-oficial / m² instalado |
| Equipment | Horas o días equipo / unidad APU | 0.05 h vibrador / m³ vaciado |
| Subcontract | Unidades subcontratadas / unidad APU | 1 und / und |

**Estado:** el campo existe y está correctamente tipado (`NUMERIC(20,10)`). No se
requiere cambio de schema. El parser del Excel debe leer la columna correcta (TODO_VERIFY).

---

## H. Desperdicios

| Aspecto | Estado |
|---|---|
| Campo `waste_pct` en `apu_components` | ✅ Existe, `DEFAULT 0` |
| Fórmula incorporada en `calculateApuComponentCost` | ✅ `qty × (1+waste) × price` |
| Columna F de la hoja APU (desperdicio) | ⚠️ TODO_VERIFY (tentativo) |
| Desperdicio en `resources.default_waste_pct` (default por recurso) | ✅ Existe |

**Nota:** el `default_waste_pct` en `resources` es el desperdicio por defecto del
material en catálogo. El `waste_pct` en `apu_components` puede sobreescribirlo por
actividad. El import debe decidir cuál priorizar (el del APU sheet suele ser más
específico).

---

## I. Herramienta derivada — análisis del problema

### I.1 Comportamiento en el Excel
En la hoja APU, después del bloque de insumos y mano de obra, aparece una fila
de **herramienta menor** con valor = X% del total de mano de obra del APU.

Ejemplo típico: herramienta = 5% × total_MO_del_APU

### I.2 Implementación en dominio (existente)
```typescript
// apu.ts — ya implementado
function calculateToolComponentCost(toolPct, totalLaborCost):
  return toolPct × totalLaborCost
```

### I.3 Problema de schema actual
`apu_components` almacena todos los componentes con la fórmula canónica
`qty×(1+waste)×price`. Para herramienta derivada:
- `quantity = toolPct` (fracción como 0.05)
- `unit_price_snapshot` = ??? (no es un precio de insumo; es el total MO, que es dinámico)
- `total_component_cost` = `toolPct × totalMO` (correcto, pero no sigue la fórmula canónica)

### I.4 Resolución propuesta
Ver C.2. Almacenar `default_tool_pct` en `apu_templates` y NO crear filas de tipo
`tool` en `apu_components`. El dominio lo aplica como paso final del cálculo APU:

```text
unitCost =
  Σ(material_components)
  + Σ(labor_components)
  + Σ(equipment_components)
  + apu_templates.default_tool_pct × Σ(labor_components)  ← herramienta derivada
```

---

## J. Cantidades y despieces

### J.1 Schema existente
- `quantity_groups` (mode: direct/length/area/volume/custom) — completo
- `quantity_lines` (length, width, height, multiplier, formula_type) — completo
- `boq_items.quantity_group_id UUID NULL` — FK existe, siempre null

### J.2 Hoja CANTIDADES 1 PISO
- 692 filas de despiece geométrico
- Modos: directo, área (largo×ancho), volumen, factores de desperdicio/retiro
- 14 grupos (uno por capítulo / actividad principal)
- `sheet-map.ts` spec declarada pero columnas TODO_VERIFY

### J.3 Brechas
- Parser de la hoja CANTIDADES 1 PISO no implementado
- `boq_items.quantity_group_id` nunca poblado
- Sin relación UI entre cantidad calculada y el ítem de presupuesto que la consume

### J.4 Prioridad de implementación
Baja en APU_COST_MODEL_AND_IMPORT_V1; las cantidades son un flujo independiente.
Relacionar cantidades con BOQ puede hacerse en un slice posterior.

---

## K. Relación APU → BOQ

### K.1 Schema
`boq_items.apu_template_id UUID NULL REFERENCES apu_templates(id) ON DELETE SET NULL`

La columna existe. En el fixture actual, es null en todos los ítems (131 filas).

### K.2 Significado
- Si `apu_template_id IS NOT NULL`: el precio unitario del ítem BOQ vino de ese APU.
- Si `apu_template_id IS NULL`: precio manual o importado sin mapeo APU.

### K.3 Flujo que habilita esta relación
```
apu_template → apu_components → calculateApuUnitCost()
    ↓
unit_price_snapshot en boq_item = APU unit cost
    ↓
subtotal = quantity_snapshot × unit_price_snapshot
    ↓
Σ subtotales = costos_directos
```

### K.4 Cómo poblar
Después de importar `apu_templates` desde la hoja APU, se puede linkar por:
1. **Código APU en BOQ**: si COTIZACION 1 PISO referencia el código del APU → match directo
2. **Descripción**: matching fuzzy por descripción de actividad → requiere aprobación humana
3. **Manual**: UI de emparejamiento APU → BOQ ítem

La opción 1 es la más limpia y reproducible. Requiere verificar si COTIZACION 1 PISO
contiene la referencia al código APU correspondiente.

### K.5 Deuda documentada
`BOQ_TO_CATALOG_ASSISTED_BOOTSTRAP` — decisión 2026-06-10 en `docs/DECISIONS.md`.

---

## L. Importación estructurada Entre Patios

### L.1 Estructura real de la hoja APU (observada en `EXCEL_MAPPING.md`)

```
A1:H466 — ~152 fórmulas
│
├─ BLOQUE SALARIAL (primeras filas)
│   Código | Cargo       | Unidad | Valor/mes | Vr.diario | Vr.hora
│   ───────────────────────────────────────────────────────────────
│   Línea subsidio transporte
│   Línea beneficios/prestaciones
│   Línea seguridad social
│   Línea parafiscales
│   Línea dotación
│   Línea costo mensual integral
│   Línea costo diario
│   Línea costo hora
│   (Una sección por cada rol: Ayudante, Oficial)
│
└─ BLOQUES APU (por actividad)
    Cabecera: Código APU | Nombre actividad | Unidad
    ────────────────────────────────────────────────
    Fila insumo: Código | Descripción | Unidad | Rendimiento | Precio | Desperdicio | Total
    Fila insumo: ...
    Fila M.O.:  Código | Descripción | Unidad | Rendimiento | Precio | Desperdicio | Total
    Fila M.O.:  ...
    Fila Herramienta menor: % sobre M.O.
    ────────────────────────────────────
    Total APU (precio unitario)
```

Coordenadas exactas marcadas como TODO_VERIFY en `sheet-map.ts`.

### L.2 Pipeline de importación propuesto

```text
1. Open APU sheet (read-only)
2. Detect salary block boundaries
   → for each rol: extract salary components → calculate costs
   → upsert labor_roles (skip if exists by code)

3. Detect APU block boundaries (headers vs component rows)
   → for each APU block:
     a. Extract header (code, name, unit)
     b. For each material component row:
        - resolve resource_id by code (require match; no silent create)
        - store quantity, waste_pct, unit_price_snapshot
     c. For each labor component row:
        - resolve labor_role_id by code
        - snapshot daily cost from calculateLaborCost()
        - quantity = rendimiento × crewCount
     d. Extract tool_pct from herramienta row
     e. Upsert apu_template (skip if exists by code + version)
     f. Delete + re-insert apu_components (idempotente)

4. (Separate pass) Link BOQ items to APU templates
   - Match by APU code reference in COTIZACION 1 PISO
   - Update boq_items.apu_template_id where match found
   - Report unmatched items

5. Regression: verify unit costs produce costos_directos within tolerance
```

### L.3 Datos sanitizables en APU sheet
- Salarios reales → reemplazar con valores ficticios plausibles en fixture
- Datos de contacto de subcontratistas (si aparecen) → redactar
- Las **descripciones de actividades de obra** no son datos personales → conservar

---

## M. Estrategia de deduplicación

| Entidad | Clave de deduplicación | Política |
|---|---|---|
| `labor_roles` | `(organization_id, code)` | Skip si existe; no update silencioso |
| `apu_templates` | `(organization_id, code, version)` | Skip si existe mismo code+version |
| `apu_components` | FK `apu_template_id` | DELETE + RE-INSERT (idempotente por template) |
| `resources` | `(organization_id, code)` | Skip si existe (regla ya aprobada en DECISIONS) |

**Regla:** nunca sobrescribir en silencio. Misma política que la importación de catálogo
aprobada el 2026-06-10 (`IMPORTACIÓN NUNCA SOBRESCRIBE`).

---

## N. Códigos visibles vs IDs internos

| Entidad | Campo visible (código de negocio) | ID interno (UUID) |
|---|---|---|
| `labor_roles` | `code` (ej. "OF-001", "AY-001") | `id` UUID |
| `apu_templates` | `code` (ej. "APU-001", "PISO-PORC") | `id` UUID |
| `resources` | `code` (ej. "MAT-CEM-001") | `id` UUID |
| `boq_items` | `code` (ej. "1.1", "2.3") en el presupuesto | `id` UUID |

**Regla de import:** los códigos del Excel se mapean a `code` (visible, repetible si
el Excel los usa). Los UUIDs son generados por la DB y nunca provienen del Excel.
Si el Excel no tiene código visible, generar uno determinístico como slug de descripción.

**Riesgo:** el Excel de Entre Patios puede no tener códigos de APU explícitos; pueden
aparecer como números de fila, sub-capítulo o solo como descripción. Verificar con
`dump-workbook.mjs` antes de implementar el parser.

---

## O. RLS requerido

| Tabla | RLS actual | Notas para APU import |
|---|---|---|
| `labor_roles` | ✅ Por org (SELECT/INSERT/UPDATE/DELETE) | No cambios requeridos |
| `apu_templates` | ✅ Por org | No cambios requeridos |
| `apu_components` | ✅ Por JOIN a apu_templates | No cambios requeridos |
| `apu_calculation_snapshots` | ✅ Inmutable, por JOIN | No cambios requeridos |

Las nuevas columnas (`labor_role_id`, `default_tool_pct`) no requieren políticas nuevas;
se protegen por la RLS de sus respectivas tablas.

Si se agrega una tabla `apu_crew_templates` en el futuro, necesitará RLS con
`organization_id` y policy completa.

---

## P. Migraciones aditivas probables

| Migración (timestamp tentativo) | Tipo | Riesgo |
|---|---|---|
| `20260613090000_apu_components_labor_role_id.sql` | ALTER TABLE ADD COLUMN NULLABLE | Bajo — no afecta rows existentes |
| `20260613090100_apu_templates_default_tool_pct.sql` | ALTER TABLE ADD COLUMN DEFAULT 0 | Bajo — retrocompatible |
| Ninguna migración para cuadrillas | — | Se codifica en components existentes |
| Ninguna migración para BOQ→APU link | — | Columna ya existe (nullable) |
| Ninguna migración para cantidades→BOQ | — | Columna ya existe (nullable) |

**Total: 2 migraciones aditivas menores.** Sin DROP. Sin cambio de tipos. Sin afectación
de datos existentes. Sin cambio en RLS (columnas nuevas heredan protección de sus tablas).

---

## Q. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Estructura hoja APU no verificada empíricamente (TODO_VERIFY) | Alta | Alto | Ejecutar `gm:dump` con Excel real antes de escribir el parser |
| COTIZACION 1 PISO no referencia códigos APU directamente | Media | Medio | Implementar fallback de matching por descripción con aprobación humana |
| Confusión semántica de `quantity` para tool vs rendimiento | Alta | Medio | Adoptar C.2 (`default_tool_pct` en templates) |
| merge conflict con `feature/price-monitoring-agent-v1` en docs/ y schema | Alta | Bajo | Ver S. Esperar cierre de price-monitoring antes de implementar |
| Salarios reales del Excel vs fixture ficticio | Alta | Alto | Sanitizar en `sanitize.ts`; `findPrivateLeaks` en CI |
| Redondeo intermedio en salario integral | Baja | Bajo | `calculateLaborCost` ya usa Decimal.js sin redondeo intermedio |
| APU templates con mismo código en distintas versiones | Baja | Medio | UNIQUE `(organization_id, code, version)` ya en schema |

---

## R. Slices recomendados de implementación posterior

```text
SLICE 1 — Roles laborales reales (riesgo bajo, independiente)
  Objetivo: Importar Oficial + Ayudante con datos sanitizados
  Entrega: 2 labor_roles en fixture + test de regresión de costo integral
  Duración estimada: 2-3 h
  Bloquea: SLICE 2

SLICE 2 — Parser hoja APU (riesgo alto por TODO_VERIFY)
  Objetivo: Extraer all APU templates + components de la hoja APU real
  Prerequisito: dump-workbook confirma coordenadas
  Entrega: fixture con APU reales (many templates, many components)
  Duración estimada: 4-6 h (incluye verificación empírica)
  Bloquea: SLICE 3

SLICE 3 — Migraciones labor_role_id + default_tool_pct (riesgo mínimo)
  Objetivo: Persistir origen de M.O. y herramienta en schema
  Prerequisito: esperar cierre de price-monitoring-agent-v1
  Duración estimada: 1-2 h
  Bloquea: SLICE 4

SLICE 4 — Import seed APU a DB local (riesgo bajo)
  Objetivo: Seed con APU reales en DB local + regresión RLS
  Entrega: APU page poblada con datos reales Entre Patios
  Duración estimada: 2-3 h

SLICE 5 — Linker BOQ → APU (riesgo medio)
  Objetivo: Poblar boq_items.apu_template_id por matching de códigos
  Prerequisito: SLICE 2 + SLICE 4
  Duración estimada: 2-4 h (incluye matching + aprobación)
  Bloquea: COST_TYPE_BREAKDOWN_FOUNDATION

SLICE 6 — APU detail view UI
  Objetivo: Página /apu/[id] con desglose de componentes
  Prerequisito: SLICE 4
  Duración estimada: 2-3 h

SLICE 7 — COST_TYPE_BREAKDOWN_FOUNDATION
  Objetivo: Desglose materiales/M.O./equipos por capítulo en dashboard
  Prerequisito: SLICE 5
  Duración estimada: 3-4 h
```

---

## S. Archivos con potencial de solapamiento con `feature/price-monitoring-agent-v1`

La rama `feature/price-monitoring-agent-v1` (HEAD `399997f`) incluye cambios en:

| Archivo | Tipo de cambio | Riesgo de solapamiento con APU |
|---|---|---|
| `supabase/migrations/20260612090000_price_monitoring.sql` | Tabla nueva pricing | Bajo — APU usará timestamp posterior |
| `supabase/migrations/20260612090100_rls_price_monitoring.sql` | RLS nueva tabla | Bajo — no afecta APU tables |
| `supabase/migrations/20260611090000_resources_import_metadata.sql` | ALTER resources | ⚠️ Medio — APU también modifica resources indirectamente |
| `docs/DATABASE_SCHEMA.md` | Sección pricing + schema | ⚠️ Alto — APU necesita documentar columnas nuevas en mismo doc |
| `docs/DECISIONS.md` | Decisiones pricing | ⚠️ Alto — APU necesita agregar decisiones en mismo doc |
| `scripts/rls-runtime/run.ts` | Nuevos checks RLS | ⚠️ Medio — APU también agregará checks RLS |
| `apps/web/server/catalog/import/` | Import de catálogo | Bajo — APU usa scripts/ no server/catalog/ |

**No hay solapamiento en:**
- `apps/web/modules/apu/` — no tocado por price-monitoring
- `scripts/excel-import/` — no tocado por price-monitoring
- `apps/web/tests/unit/cost-domain/` — no tocado
- `supabase/migrations/20260530090600_apu_templates_components.sql` — no tocado
- `apps/web/app/(dashboard)/apu/` — no tocado

**Regla:** APU_COST_MODEL_AND_IMPORT_V1 NO debe iniciar hasta que `feature/price-monitoring-agent-v1`
haya cerrado (merge a main). Los timestamps de migración APU deben ser posteriores a
`20260612*`. Los docs compartidos (DATABASE_SCHEMA, DECISIONS) se actualizarán con merge
secuencial sin conflicto si price-monitoring ya está en main.

---

## T. Orden recomendado de implementación posterior

```
0. ESPERAR: cierre y merge de feature/price-monitoring-agent-v1 a main
   ↓
1. Verificación empírica de la hoja APU con dump-workbook.mjs
   (confirmar coordenadas TODO_VERIFY)
   ↓
2. Migración: labor_role_id en apu_components (SLICE 3)
   Migración: default_tool_pct en apu_templates (SLICE 3)
   ↓
3. Sanitizar y agregar Ayudante al fixture (SLICE 1)
   Parser bloque salarial hoja APU → actualizar fixture (SLICE 1)
   ↓
4. Parser bloques APU → apu_templates + apu_components en fixture (SLICE 2)
   Test de regresión: costos unitarios APU dentro de tolerancia
   ↓
5. Seed DB local con APU reales, RLS runtime checks nuevos (SLICE 4)
   ↓
6. Linker BOQ → APU por código (SLICE 5)
   Test de regresión: costos_directos aún = $336,084,479.94
   ↓
7. APU detail view /apu/[id] (SLICE 6)
   ↓
8. COST_TYPE_BREAKDOWN_FOUNDATION (SLICE 7)
```

---

*Documento generado por auditoría read-only en rama `audit/apu-cost-model-import-v1`.*
*No se modificaron archivos de producto, migraciones, seeds ni documentos maestros compartidos.*
