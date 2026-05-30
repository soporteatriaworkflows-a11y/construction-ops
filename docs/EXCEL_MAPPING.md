# Excel Mapping — Construction Ops

Propiedad de **agent-excel-mapper**. Mapea el Excel golden master
`COT.ENTRE PATIOS 1 PISO (1).xlsx` a las entidades del **contrato congelado
v1** (`docs/DATABASE_SCHEMA.md` / `docs/API_CONTRACTS.md`) y documenta hojas,
rangos, columnas, inputs vs derivadas, fórmulas clave, referencias cruzadas y
datos a sanitizar.

> **Privacidad**: el Excel original es privado y NO se versiona (`.gitignore`:
> `private/`, `*.xlsx`, `*.xls`). Los fixtures versionables están sanitizados.

> **Nota de verificación (Oleada 1)**: las coordenadas marcadas
> `TODO_VERIFY` son tentativas (basadas en PROJECT_MASTER §3.2/§3.3 y en la
> semántica estándar de cotizaciones de obra). Se confirman ejecutando
> `scripts/golden-master/dump-workbook.mjs` sobre el Excel privado. La
> **regresión financiera** (§6) NO depende de esas coordenadas: se valida
> contra los 9 totales autoritativos de PROJECT_MASTER §3.4.

---

## 1. Archivo fuente

| Propiedad | Valor |
|---|---|
| Nombre | `COT.ENTRE PATIOS 1 PISO (1).xlsx` |
| Ubicación | `private/` (no versionado) |
| Tamaño aprox. | ~316 KB |
| Hojas | 10 (ver PROJECT_MASTER §3.2) |
| Fórmulas totales | ~1068 (PROJECT_MASTER §3.2) |
| Proyecto piloto | ENTRE PATIOS |
| Alcance de regresión | PRIMER PISO |

### Detección de formato numérico

- Presentación: separador decimal **punto** (`.`), miles **coma** (`,`).
  Internamente `xlsx` entrega `number` IEEE-754.
- El importador convierte cada número a **`DecimalString`** (string) **sin
  redondear**, preservando todos los dígitos (los valores de §6 conservan su
  cola decimal, p. ej. `336084479.93690735`).
- No se asume locale: se usa el valor calculado nativo y `Decimal(value)
  .toString()`.

---

## 2. Convenciones del mapeo

- DB `snake_case` ↔ TS `camelCase` ↔ tipos `PascalCase` (contrato v1).
- Dinero/cantidades/porcentajes ⇒ `DecimalString` (string), nunca `number`.
- Porcentajes como **fracción** (3.5% ⇒ `"0.035"`).
- Dos modos de cantidad (PROJECT_MASTER §3.3.A):
  - **Directo**: una cifra ⇒ `quantity_lines.formula_type='direct'`,
    `direct_quantity`.
  - **Geométrico**: `largo × ancho × alto × multiplicador` ⇒
    `length/width/height/multiplier` con `formula_type ∈ {length, area,
    volume}`.

---

## 3. Hojas — documentación detallada

### 3.1 RESUMEN — `A1:E35` (~36 fórmulas)

- **Propósito**: consolidado general del presupuesto (todos los alcances).
- **Inputs**: encabezado (cliente, proyecto, fecha) → **SANITIZAR**.
- **Derivadas**: costos directos, AIU, IVA, total y valor/m² (referencian
  `COTIZACION FULL`, `CANT COMPLETO`).
- **Entidades destino**: `estimate_versions`, `indirect_cost_rules`,
  bloque auxiliar `estimateTotals`.
- **Referencias cruzadas**: → `COTIZACION FULL`, `CANT COMPLETO`.
- **Sanitizar**: nombre de cliente, razón social, NIT.

### 3.2 COTIZACION FULL — `A1:H199` (~140 fórmulas)

- **Propósito**: cotización integral por capítulos y actividades.
- **Columnas (TODO_VERIFY)**: A código · B descripción · C unidad ·
  D cantidad · E v/r unitario (← APU) · F v/r total (= cant × unit).
- **Inputs**: cantidades manuales que no provengan de `CANTIDADES`.
- **Derivadas**: v/r total por fila, subtotales por capítulo.
- **Entidades**: `chapters`, `boq_items`, (clasificación) `apu_templates`.
- **Referencias cruzadas**: → `APU` (precio unitario), → `CANTIDADES`.
- **Sanitizar**: encabezado con nombre de cliente.

### 3.3 APU — `A1:H466` (~152 fórmulas)

- **Propósito**: salarios integrales + análisis de precios unitarios.
- **Bloque de mano de obra** (PROJECT_MASTER §3.3.B): salario base, subsidio
  transporte, prestaciones, seguridad social, parafiscales, dotación ⇒
  salario mensual, costo diario, costo/hora. Mapea a `labor_roles`
  (`base_salary`, `transport_subsidy`, `benefits_pct`, `social_security_pct`,
  `payroll_tax_pct`, `uniform_cost`, `uniform_period_months`,
  `working_days_month`, `working_hours_day`). El **costo integral calculado
  NO se almacena** en `labor_roles` (se congela como `unit_price_snapshot`
  al usarse; ver DATABASE_SCHEMA, nota 14 de `labor_roles`).
- **Bloque APU**: insumos, mano de obra, herramientas, desperdicio, total de
  actividad. Mapea a `apu_templates` + `apu_components`.
- **Columnas (TODO_VERIFY)**: A código · B descripción insumo · C unidad ·
  D rendimiento/consumo (`quantity`) · E precio unitario
  (`unitPriceSnapshot`) · F desperdicio (`wastePct`, fracción) ·
  G total componente.
- **Fórmula clave (derivada)**:
  `total_component_cost = quantity × (1 + waste_pct) × unit_price_snapshot`
  (idéntica a la regla del contrato, DATABASE_SCHEMA `apu_components`).
- **Entidades**: `labor_roles`, `apu_templates`, `apu_components`,
  `resources`.
- **Referencias cruzadas**: ← `LISTADO MATERIALES` (precios); usada por
  `COTIZACION FULL` / `COTIZACION 1 PISO`.
- **Sanitizar**: nada relevante (sin datos personales esperados).

### 3.4 COTIZACION 1 PISO — `A1:G204` (~134 fórmulas)

- **Propósito**: cotización del Primer piso (subconjunto del alcance).
- **Columnas (TODO_VERIFY)**: igual que COTIZACION FULL (A–F).
- **Fórmula clave**: `Σ subtotales = costos_directos (primer piso) =
  336084479.93690735`. Es el insumo directo de la base de regresión.
- **Entidades**: `chapters`, `boq_items` (de la versión del primer piso).
- **Referencias cruzadas**: → `APU`, → `CANTIDADES 1 PISO`.

### 3.5 ACTA DE MODIFICACION 01 — `A1:K199` (~129 fórmulas)

- **Propósito**: acta de modificación (PROJECT_MASTER §3.3.E): presupuesto
  original, variación, cantidad ajustada/ejecutada, valor total ajustado,
  % ejecutado, saldo pendiente.
- **Columnas (TODO_VERIFY)**: A código · B descripción · C cantidad original ·
  D variación · E cantidad ajustada · F v/r unitario · G v/r total ajustado ·
  (+ % ejecutado, saldo).
- **Entidades**: `change_orders` / `change_order_items` — **PROVISIONALES v0**
  (NO congeladas en Oleada 1; ver DATABASE_SCHEMA). Se documentan pero NO se
  importan a entidades de v1.
- **Referencias cruzadas**: → `COTIZACION 1 PISO` / `APU`.
- **Sanitizar**: nombres de responsables, firmas.

### 3.6 RESUMEN 1 PISO — `A1:E35` (~37 fórmulas)

- **Propósito**: consolidado financiero del Primer piso. **Fuente directa de
  los 9 valores de regresión**.
- **Celdas clave (derivadas, TODO_VERIFY dirección exacta)**:
  - `costos_directos` ← Σ de `COTIZACION 1 PISO`.
  - `administracion = costos_directos × 0.035`.
  - `imprevistos = costos_directos × 0.025`.
  - `utilidad = costos_directos × 0.04`.
  - `iva_sobre_utilidad = utilidad × 0.19`.
  - `costos_indirectos = administracion + imprevistos + utilidad + iva`.
  - `total_costo = costos_directos + costos_indirectos`.
  - `valor_m2 = total_costo / area_construida` (área ← `CANT COMPLETO`).
- **Entidades**: `indirect_cost_rules` (A/I/U/IVA con sus `percentage` y
  `base_type`), bloque `estimateTotals`.
- **Referencias cruzadas**: → `COTIZACION 1 PISO`, → `CANT COMPLETO`.

### 3.7 CANTIDADES 1 PISO — `A1:I692` (~132 fórmulas)

- **Propósito**: despiece geométrico del Primer piso.
- **Modos** (PROJECT_MASTER §3.3.A): directo y geométrico —
  `largo × ancho × alto × multiplicador`, `largo × alto × cantidad`,
  `largo × ancho × cantidad`, sumatorias, factores de desperdicio/retiro/
  expansión.
- **Columnas (TODO_VERIFY)**: A descripción · B largo · C ancho · D alto ·
  E multiplicador/cantidad · F cantidad calculada.
- **Entidades**: `quantity_groups` (`calculation_mode`), `quantity_lines`
  (`length/width/height/multiplier/direct_quantity/formula_type/
  calculated_quantity`).
- **Referencias cruzadas**: usada por `COTIZACION 1 PISO`.

### 3.8 CANTIDADES — `A1:I680` (~143 fórmulas)

- **Propósito**: cantidades generales (todos los alcances). Estructura análoga
  a CANTIDADES 1 PISO.
- **Entidades / columnas / refs**: igual que §3.7 pero a nivel general.

### 3.9 LISTADO MATERIALES — `A1:G136` (~20 fórmulas)

- **Propósito**: catálogo de materiales con precios y proveedores.
- **Variación preventiva** (PROJECT_MASTER §3.3.C): columnas `VR. UNITARIO` y
  `3% VAR` ⇒ `precio presupuestado = precio proveedor × 1.03`. Se modela como
  `pricing_rules` tipo `preventive_variation` con `percentage = "0.03"`,
  **no** como precio hardcodeado.
- **Columnas (TODO_VERIFY)**: A descripción material · B unidad ·
  C VR. UNITARIO (`price_observations.observed_price`) · D 3% VAR (precio de
  referencia presupuestado) · E proveedor → **SANITIZAR**.
- **Proveedores** (PROJECT_MASTER §3.3.D): Homecenter, HB, Meléndez, Delta,
  Imperplak SAS, otros ⇒ `suppliers` con **alias** (ver `sanitize.ts`).
- **Entidades**: `resources` (material), `suppliers`, `supplier_products`,
  `price_observations`, `pricing_rules`.
- **Sanitizar**: nombre de proveedor, SKU, URL.

### 3.10 CANT COMPLETO — `A1:U215` (~145 fórmulas)

- **Propósito**: cálculos auxiliares y consolidación de cantidades; contiene
  el **área construida**.
- **Celda clave (TODO_VERIFY)**: `area_construida = 236.77900000000005`
  (insumo del `valor_m2`).
- **Entidades**: `quantity_groups`/`quantity_lines` (auxiliar) y
  `estimateTotals.area_construida`.
- **Referencias cruzadas**: usada por `RESUMEN` / `RESUMEN 1 PISO`.

---

## 4. Mapa de referencias cruzadas (dependencias entre hojas)

```
LISTADO MATERIALES ──► APU ──► COTIZACION FULL ──► RESUMEN
                         │           │
                         └──► COTIZACION 1 PISO ──► RESUMEN 1 PISO ◄── CANT COMPLETO
                                     ▲                                 (area_construida)
CANTIDADES 1 PISO ───────────────────┘
CANTIDADES ──► COTIZACION FULL
ACTA DE MODIFICACION 01 ──► (COTIZACION 1 PISO / APU)   [provisional v0]
```

- **Flujo**: precios (LISTADO MATERIALES → APU) → precio unitario
  (APU → COTIZACION) → cantidades (CANTIDADES → COTIZACION) → subtotales →
  consolidado (RESUMEN / RESUMEN 1 PISO) → valor/m² (con área de CANT
  COMPLETO).
- **Detección automática**: `dump-workbook.mjs` reporta, por hoja, los
  `crossSheetRefs` reales leídos de las fórmulas; confróntese con este mapa.
- **Sin referencias circulares esperadas** (PROJECT_MASTER §3.2 no detectó
  `#REF!`); confirmar con el dump.

---

## 5. Mapeo Excel → entidades del contrato v1 (resumen)

| Hoja Excel | Entidad v1 | Campos destino (clave) | Notas |
|---|---|---|---|
| RESUMEN / RESUMEN 1 PISO | `indirect_cost_rules` | `code, name, percentage, base_type, visible_to_client` | A/I/U sobre `direct_cost`; IVA sobre `utility` |
| RESUMEN 1 PISO | `estimateTotals` (aux) | 9 indicadores §6 | fuente de regresión |
| COTIZACION FULL / 1 PISO | `chapters`, `boq_items` | `code, descriptionSnapshot, unitSnapshot, quantitySnapshot, unitPriceSnapshot, subtotal` | `subtotal = qty × unit` |
| APU | `labor_roles` | `base_salary, transport_subsidy, *_pct, uniform_*, working_*` | costo integral se calcula, no se guarda |
| APU | `apu_templates`, `apu_components`, `resources` | `quantity, waste_pct, unit_price_snapshot, total_component_cost` | regla `qty×(1+waste)×price` |
| CANTIDADES / CANTIDADES 1 PISO | `quantity_groups`, `quantity_lines` | `length, width, height, multiplier, direct_quantity, formula_type, calculated_quantity` | directo vs geométrico |
| CANT COMPLETO | `estimateTotals.area_construida` | `area_construida` | 236.779… |
| LISTADO MATERIALES | `resources`, `suppliers`, `supplier_products`, `price_observations`, `pricing_rules` | `observed_price`, variación 3% | proveedores SANITIZADOS |
| ACTA DE MODIFICACION 01 | `change_orders`/`change_order_items` (v0) | original/variación/ajustada | **provisional**, no Oleada 1 |

Detalle programático del mapa en `scripts/excel-import/sheet-map.ts`.

---

## 6. Valores de regresión — Primer piso (fuente de verdad)

| Campo | Valor exacto | Tolerancia |
|-------|-------------|------------|
| costos_directos      | 336084479.93690735   | ±0.01 COP |
| administracion       | 11762956.797791759   | ±0.01 COP |
| imprevistos          | 8402111.998422684    | ±0.01 COP |
| utilidad             | 13443379.197476294   | ±0.01 COP |
| iva_sobre_utilidad   | 2554242.047520496    | ±0.01 COP |
| costos_indirectos    | 36162690.04121123    | ±0.01 COP |
| total_costo          | 372247169.9781186    | ±0.01 COP |
| area_construida      | 236.77900000000005   | ±0.001 |
| valor_m2             | 1572129.1583211287   | ±0.01 COP |

### Cadena de fórmulas (observada, PROJECT_MASTER §3.4)

```
administracion       = costos_directos × 0.035
imprevistos          = costos_directos × 0.025
utilidad             = costos_directos × 0.04
iva_sobre_utilidad   = utilidad        × 0.19
costos_indirectos    = administracion + imprevistos + utilidad + iva_sobre_utilidad
total_costo          = costos_directos + costos_indirectos
valor_m2             = total_costo / area_construida
```

### Verificación de autoconsistencia (analítica)

Recalculando desde `costos_directos = 336084479.93690735` y
`area = 236.77900000000005`:

- `0.035 × directos = 11762956.7977917…` → `11762956.797791759` (±0.01 ✔)
- `0.025 × directos = 8402111.9984226…`  → `8402111.998422684`  (±0.01 ✔)
- `0.04  × directos = 13443379.197476294` → exacto (✔)
- `0.19  × utilidad = 2554242.0475204…`  → `2554242.047520496`  (±0.01 ✔)
- `Σ AIU+IVA = 36162690.0412112…`        → `36162690.04121123`  (±0.01 ✔)
- `directos + indirectos = 372247169.9781185…` → `372247169.9781186` (±0.01 ✔)
- `total / area = 1572129.15832…`        → `1572129.1583211287`  (±0.01 ✔)

Las 9 cifras se reproducen dentro de tolerancia. **NO se ajustó ninguna tasa
ni fórmula.** Las tasas A/I/U/IVA quedan en `indirect_cost_rules`
(configurable por versión), no hardcodeadas en el dominio.

> Verificación ejecutable: `scripts/golden-master/first-floor.regression.test.ts`
> (Vitest) y `scripts/excel-import/import.ts`.

---

## 7. Datos a sanitizar (catálogo)

| Tipo | Origen Excel | Tratamiento |
|---|---|---|
| Nombre/razón social del cliente | RESUMEN / encabezados | alias `Constructora Demo S.A.S.` / `Proyecto Entre Patios` |
| NIT / RUT | encabezados | eliminado |
| Dirección / teléfono / email | encabezados, contactos | eliminado / redactado |
| Nombre de proveedor | LISTADO MATERIALES col E | alias determinista (`sanitize.ts`) |
| SKU / URL de proveedor | LISTADO MATERIALES | ficticio o `null` |
| Nombres de responsables / firmas | ACTA DE MODIFICACION 01 | eliminado |
| Salarios reales de nómina | APU | valores ficticios plausibles en el fixture |

Defensa en profundidad: `import.ts` corre `findPrivateLeaks` sobre el fixture
final (regex de NIT, teléfono, email, URL) y **falla** si detecta fugas.

---

## 8. Fórmulas ambiguas / pendientes de verificación

| # | Ambigüedad | Estado / acción |
|---|---|---|
| A-1 | Coordenadas exactas (col/fila) de cada hoja | `TODO_VERIFY` con `dump-workbook.mjs`; no afecta regresión §6 |
| A-2 | Política de redondeo COP (¿en insumo, APU o BOQ?) | **Q9 abierta** (DECISIONS). El recompute NO redondea para evitar diferencias. La fija cost-domain (Oleada 2) |
| A-3 | Base del descuento (público vs referencia) | **Q8 abierta**; concierne a pricing, no a esta regresión |
| A-4 | Si la variación 3% es fija o por proveedor/material | modelada como `pricing_rule` configurable; confirmar por celda |
| A-5 | Origen exacto de `area_construida` en CANT COMPLETO | `TODO_VERIFY`; valor autoritativo conocido (236.779…) |

Cualquier diferencia que surja al verificar con el Excel real (más allá de
tolerancia) se registra en `docs/OPEN_QUESTIONS.md` y se reporta al
orquestador, **sin** ajustar fórmulas.

---

## 9. Fixture e importador

- **Fixture**: `scripts/fixtures/entre-patios-first-floor.fixture.json`
  (sanitizado, contrato v1). Notas: `…schema-notes.md`.
- **Importador**: `scripts/excel-import/import.ts` (idempotente; regresión +
  privacidad + completitud de hojas). Mapa: `sheet-map.ts`. Sanitización:
  `sanitize.ts`.
- **Regresión**: `scripts/golden-master/` (`expected-values.ts`,
  `recompute-first-floor.ts`, `first-floor.regression.test.ts`).
- **Dump estructural**: `scripts/golden-master/dump-workbook.mjs`.

Comandos en `scripts/README.md`.

---

## Estado de la documentación

| Hoja | Estado |
|------|--------|
| RESUMEN | ✅ Documentada (coords TODO_VERIFY) |
| COTIZACION FULL | ✅ Documentada (coords TODO_VERIFY) |
| APU | ✅ Documentada (coords TODO_VERIFY) |
| COTIZACION 1 PISO | ✅ Documentada (coords TODO_VERIFY) |
| ACTA DE MODIFICACION 01 | ✅ Documentada (entidades v0) |
| RESUMEN 1 PISO | ✅ Documentada (regresión §6) |
| CANTIDADES 1 PISO | ✅ Documentada (coords TODO_VERIFY) |
| CANTIDADES | ✅ Documentada (coords TODO_VERIFY) |
| LISTADO MATERIALES | ✅ Documentada (coords TODO_VERIFY) |
| CANT COMPLETO | ✅ Documentada (coords TODO_VERIFY) |

> Las 10 hojas están mapeadas a entidades v1 y a la cadena de regresión.

---

## 10. Coordenadas confirmadas EMPÍRICAMENTE (Oleada 1, Fase 1 — 2026-05-30)

Ejecutado `gm:dump` + buscador sobre el Excel real. Los 9 valores de §6/§3.4
se localizaron en celdas reales con su fórmula (valor cacheado: `xlsx` no
evalúa fórmulas pero sí lee el último valor calculado):

| Indicador | Celda autoritativa | Fórmula | Valor cacheado |
|---|---|---|---|
| costos_directos | `RESUMEN 1 PISO!E27` | `=SUM(E13:E26)` | 336084479.93690735 |
| administracion | `RESUMEN 1 PISO!E28` | `=E27*D28` (D28=0.035) | 11762956.797791759 |
| imprevistos | `RESUMEN 1 PISO!E29` | `=E27*D29` (D29=0.025) | 8402111.998422684 |
| utilidad | `RESUMEN 1 PISO!E30` | `=E27*D30` (D30=0.04) | 13443379.197476294 |
| iva_sobre_utilidad | `RESUMEN 1 PISO!E31` | `=E30*D31` (D31=0.19) | 2554242.047520496 |
| costos_indirectos | `RESUMEN 1 PISO!E32` | `=SUM(E28:E31)` | 36162690.04121123 |
| total_costo | `RESUMEN 1 PISO!E33` | `=E32+E27` | 372247169.9781186 |
| area_construida | `CANTIDADES 1 PISO!I187`→`COTIZACION 1 PISO!E45`→`RESUMEN 1 PISO!D35` | `=SUM(I182:I183)-I184-I185-I186` | 236.77900000000005 |
| valor_m2 | `RESUMEN 1 PISO!E35` | `=E33/D35` | 1572129.1583211287 |

Los 9 cacheados de `RESUMEN 1 PISO` **coinciden con §6/§3.4 a precisión
completa**. Los `TODO_VERIFY` de los 9 indicadores quedan **resueltos con
evidencia** (A-1 y A-5 cerrados para estos valores).

### BOQ fila por fila (sin balanceo)
- 14 capítulos reales en `RESUMEN 1 PISO!B13:E26` (código, nombre, % incidencia,
  subtotal); cada subtotal `='COTIZACION 1 PISO'!G…`.
- 131 ítems reales en `COTIZACION 1 PISO` (cabecera fila 11: A=código,
  B=ítem, C=descripción, D=unidad, E=cant., F=vr.unitario, G=vr.parcial).
- `gm:build-fixture` regenera el fixture v2 fila por fila; Σ ítems =
  costos_directos dentro de **±2.05e-8 COP**, **sin ítem de balanceo**.

### Datos privados detectados y EXCLUIDOS (nunca al fixture)
`COTIZACION 1 PISO` filas 4–8: contratante, contratista, encargado y N° de
cotización (personas/empresa). El generador no copia esas filas. Las
descripciones de actividades de obra NO son datos personales y se conservan.
`findPrivateLeaks` (texto libre) confirma **0 fugas**.

> Estado: las 10 hojas documentadas; coordenadas de los 9 indicadores y del
> BOQ confirmadas empíricamente. Coordenadas celda-a-celda de hojas auxiliares
> (APU/CANTIDADES) siguen como referencia tentativa; no afectan la regresión.
