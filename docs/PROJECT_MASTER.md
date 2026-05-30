# CONSTRUCTION OPS — DOCUMENTO MAESTRO DEL PROYECTO

**Versión:** 1.0  
**Fecha de consolidación:** 2026-05-29  
**Estado:** Documento de contexto, arquitectura y ejecución inicial  
**Uso previsto:** Entregar este archivo a cualquier chat nuevo, IA, Claude Code o agente técnico antes de comenzar o retomar el desarrollo.  
**Nombre provisional del sistema:** `Construction Ops`  
**Proyecto piloto para validación:** `ENTRE PATIOS — Primer piso`

---

## 0. Cómo usar este documento

Este archivo es la fuente principal de contexto del proyecto. Antes de escribir código, cualquier IA o agente nuevo debe:

1. Leer este documento completo.
2. Pedir o recibir el Excel de referencia:
   - `COT.ENTRE PATIOS 1 PISO (1).xlsx`
3. Revisar el repositorio actual antes de proponer cambios.
4. Identificar en qué fase se encuentra el desarrollo.
5. Confirmar qué archivos puede editar.
6. No modificar cálculos financieros sin pruebas de regresión.
7. Documentar cada supuesto y decisión relevante.

### Regla de privacidad

Este documento **no debe almacenar nombres de clientes, credenciales, contraseñas, API keys, descuentos contractuales personalizados ni información privada innecesaria**. El Excel original contiene información comercial y debe tratarse como archivo privado.

### Regla de continuidad

Cada sesión nueva debe actualizar al final:

```text
docs/HANDOFF_LOG.md
docs/DECISIONS.md
docs/OPEN_QUESTIONS.md
```

Así otra IA puede continuar sin perder contexto.

---

# 1. Visión del producto

## 1.1 Problema actual

La constructora maneja presupuestos de obra muy completos mediante Excel. Los archivos incluyen:

- cantidades detalladas;
- análisis de precios unitarios — APU;
- salarios integrales;
- materiales;
- proveedores;
- variación preventiva de precios;
- cotizaciones por proyecto y por alcance;
- resúmenes generales;
- actas de modificación;
- costos directos e indirectos;
- AIU;
- IVA sobre utilidad;
- valor por metro cuadrado.

El sistema actual funciona, pero exige trabajo manual, conocimiento especializado del archivo y revisión constante. Además, dificulta:

- mantener precios actualizados;
- reutilizar APU entre proyectos;
- comparar presupuesto contra ejecución;
- identificar ahorros comerciales reales;
- ocultar información interna en documentos para clientes;
- conectar presupuesto, compras, cronograma y avance;
- mantener un histórico claro de cambios.

## 1.2 Objetivo

Construir una plataforma interna de gestión de costos y seguimiento de obra que permita:

```text
Crear proyecto
→ crear alcance por piso, etapa o paquete
→ cargar o seleccionar cantidades
→ relacionar cantidades con APU
→ calcular presupuesto
→ actualizar precios maestros
→ congelar snapshots por versión
→ mostrar dashboard interno
→ exportar Excel y PDF para cliente
→ gestionar cronograma y avance
→ registrar modificaciones
→ comparar presupuesto, compras y ejecución
```

## 1.3 Resultado esperado a largo plazo

La plataforma debe servir como núcleo para:

- presupuestos;
- APU;
- cantidades;
- catálogo de materiales;
- seguimiento de obra;
- cronogramas;
- compras;
- control financiero;
- actas de modificación;
- dashboard gerencial;
- reportes para cliente;
- integraciones futuras con IA, n8n y herramientas BIM.

---

# 2. Decisión estratégica sobre OpenConstructionERP, AGPL y AG Grid

## 2.1 Decisión recomendada

**Construir una aplicación propia desde cero mediante agentes, usando un enfoque clean-room.**

OpenConstructionERP se utilizará como:

- referencia funcional;
- fuente de ideas de dominio;
- laboratorio local opcional;
- benchmark de módulos;
- inspiración para verificar que no falten flujos importantes.

No se debe copiar su código dentro del producto propietario sin tomar una decisión legal explícita.

## 2.2 Por qué no adoptar directamente OpenConstructionERP como núcleo cerrado

OpenConstructionERP se distribuye con licencia `AGPL-3.0-or-later`.

La AGPL permite usar y modificar software, pero si se modifica el programa y se ofrece acceso remoto por red, debe ofrecerse a los usuarios de esa versión acceso al código fuente correspondiente modificado.

Esto no impide probarlo localmente ni usarlo como referencia. Sin embargo, puede ser inconveniente si la meta futura es:

- mantener el código propietario;
- ofrecer una plataforma cerrada;
- vender el sistema como producto de ATRIA;
- evitar divulgar personalizaciones propias.

### Alternativas si se quisiera usar OpenConstructionERP directamente

```text
A. Usarlo bajo AGPL y cumplir sus obligaciones.
B. Negociar una licencia comercial con el creador.
C. Usarlo solo como referencia y construir una implementación propia.
```

Para este proyecto se recomienda la opción **C**.

## 2.3 Regla clean-room

Se pueden estudiar:

- pantallas;
- conceptos;
- flujos;
- módulos;
- documentación pública;
- estructuras funcionales generales.

No se debe:

- copiar archivos;
- pegar bloques de código;
- copiar migraciones;
- clonar componentes;
- pedir a una IA que “copie el ERP cambiando nombres”;
- portar código AGPL a una app propietaria.

## 2.4 AG Grid

AG Grid es una librería de tablas para interfaces web. No tiene relación con la licencia AGPL.

### AG Grid Community

- Gratuita para producción.
- Licencia permisiva.
- Adecuada para tablas editables, filtros, ordenamiento y visualización de datos.

### AG Grid Enterprise

- Requiere licencia comercial para producción.
- Incluye funciones avanzadas.
- No se utilizará inicialmente.

### Regla técnica obligatoria

```text
PERMITIDO:
- ag-grid-community
- ag-grid-react

NO INSTALAR SIN APROBACIÓN:
- ag-grid-enterprise
- módulos Enterprise
- licencias comerciales no revisadas
```

---

# 3. Fuente de verdad inicial: Excel real de obra

## 3.1 Archivo golden master

```text
COT.ENTRE PATIOS 1 PISO (1).xlsx
```

Este archivo no es un ejemplo genérico. Es la referencia contractual y lógica para validar que la plataforma replica correctamente la estructura actual.

Debe conservarse como **golden master** para pruebas de regresión.

## 3.2 Hojas detectadas

| Hoja | Rango utilizado | Fórmulas detectadas | Función principal |
|---|---:|---:|---|
| `RESUMEN` | `A1:E35` | 36 | Consolidado general |
| `COTIZACION FULL` | `A1:H199` | 140 | Cotización integral |
| `APU` | `A1:H466` | 152 | Salarios y análisis de precios unitarios |
| `COTIZACION 1 PISO` | `A1:G204` | 134 | Cotización del primer piso |
| `ACTA DE MODIFICACION 01` | `A1:K199` | 129 | Variaciones, cantidades ejecutadas y acta |
| `RESUMEN 1 PISO` | `A1:E35` | 37 | Consolidado financiero del primer piso |
| `CANTIDADES 1 PISO` | `A1:I692` | 132 | Despiece geométrico del primer piso |
| `CANTIDADES` | `A1:I680` | 143 | Cantidades generales |
| `LISTADO MATERIALES` | `A1:G136` | 20 | Precios y proveedores |
| `CANT COMPLETO` | `A1:U215` | 145 | Cálculos auxiliares |
| **TOTAL** | — | **1068** | Fórmulas conectadas |

### Validación preliminar

No se detectaron errores visibles del tipo:

```text
#REF!
#DIV/0!
#VALUE!
#NAME?
#N/A
```

Esto no reemplaza una auditoría completa. Existen referencias cruzadas entre hojas que deben documentarse antes de migrar.

## 3.3 Hallazgos importantes

### A. Cantidades geométricas

Las cantidades no se limitan a una cifra manual. Se calculan mediante despieces:

```text
largo × ancho × alto × multiplicador
largo × alto × cantidad
largo × ancho × cantidad
sumatorias
factores de desperdicio
factores de retiro y expansión
```

Por tanto, la plataforma debe permitir dos modos:

```text
Modo 1: cantidad directa
Modo 2: despiece geométrico con líneas calculadas
```

### B. APU completos

La hoja `APU` contiene:

- salarios;
- subsidio de transporte;
- prestaciones;
- seguridad social;
- parafiscales;
- dotación;
- salario mensual;
- costo diario;
- costo por hora;
- insumos;
- mano de obra;
- herramientas;
- desperdicio;
- total de actividad.

### C. Variación preventiva en materiales

La hoja `LISTADO MATERIALES` incluye:

```text
VR. UNITARIO
3% VAR
```

En varios registros:

```text
precio presupuestado = precio proveedor × 1.03
```

La variación preventiva debe modelarse como regla separada, no como un precio hardcodeado.

### D. Proveedores

Se detectan proveedores como:

```text
Homecenter
HB
Meléndez
Delta
Imperplak SAS
otros
```

La plataforma debe soportar múltiples proveedores por recurso.

### E. Actas de modificación

La hoja `ACTA DE MODIFICACION 01` ya introduce una lógica relevante:

- presupuesto original;
- variación;
- cantidad ajustada o ejecutada;
- valor total ajustado;
- porcentaje ejecutado;
- saldo pendiente.

El sistema debe conservar esta trazabilidad.

## 3.4 Totales de regresión: primer piso

Los siguientes valores deben reproducirse antes de considerar válida la migración:

| Indicador | Valor esperado |
|---|---:|
| Costos directos | `336084479.93690735` |
| Administración | `11762956.797791759` |
| Imprevistos | `8402111.998422684` |
| Utilidad contractual | `13443379.197476294` |
| IVA sobre utilidad | `2554242.047520496` |
| Costos indirectos | `36162690.04121123` |
| Total costo | `372247169.9781186` |
| Área construida | `236.77900000000005` |
| Valor por m² | `1572129.1583211287` |

### Fórmula de indirectos observada

```text
Administración = Costos directos × 3.5%
Imprevistos = Costos directos × 2.5%
Utilidad contractual = Costos directos × 4%
IVA sobre utilidad = Utilidad contractual × 19%
Total = Costos directos + Administración + Imprevistos + Utilidad + IVA
```

Estas tasas deben ser configurables por proyecto y versión.

---

# 4. Alcance funcional

## 4.1 Módulos principales

```text
01. Autenticación y permisos
02. Proyectos
03. Alcances por proyecto
04. Catálogo de recursos
05. Proveedores y productos
06. Historial de precios
07. Catálogo de APU
08. Componentes de APU
09. Cantidades y despieces geométricos
10. BOQ / presupuesto
11. Versiones y snapshots
12. AIU e impuestos
13. Dashboard gerencial
14. Exportaciones
15. Cronograma
16. Dependencias e hitos
17. Avance de obra
18. Actas de modificación
19. Compras y costos reales
20. Integraciones y automatizaciones
```

## 4.2 Separación crítica de capas

La plataforma debe distinguir:

```text
CATÁLOGO MAESTRO
→ recursos, precios, proveedores y APU reutilizables

PROYECTO
→ selección de actividades y cantidades específicas

VERSIÓN DE PRESUPUESTO
→ snapshot congelado de costos entregados o aprobados

EJECUCIÓN
→ compras reales, avances, modificaciones y desviaciones
```

## 4.3 Regla de inmutabilidad

Una cotización aprobada o entregada al cliente **no puede cambiar retroactivamente** cuando cambien los precios maestros.

Debe generarse una nueva versión:

```text
V01 → entregada
V02 → actualizada por cambio de alcance o precios
V03 → aprobada
```

---

# 5. Arquitectura técnica recomendada

## 5.1 Enfoque

Construir un **monolito modular**.

No crear microservicios desde el primer día.

### Razón

Un monolito modular:

- reduce configuración;
- evita duplicación;
- permite que los agentes trabajen por carpetas;
- acelera integración;
- sigue siendo escalable si los límites de dominio son claros.

## 5.2 Stack principal

| Capa | Tecnología recomendada | Razón |
|---|---|---|
| Frontend | Next.js + React + TypeScript | Interfaz moderna y un solo lenguaje |
| Backend inicial | Next.js Route Handlers + Server Actions | Menor complejidad inicial |
| Base de datos | Supabase PostgreSQL | PostgreSQL administrado, Auth, Storage, RLS y Realtime |
| ORM | Drizzle ORM o Prisma | Migraciones y tipado |
| Validación | Zod | Contratos y validación |
| UI | shadcn/ui + Tailwind | Velocidad y consistencia |
| Tabla editable | AG Grid Community | Grillas de presupuesto sin costo Enterprise |
| Dashboard | Recharts | Indicadores y gráficas |
| Cronograma | Frappe Gantt | Gantt web desacoplado |
| Excel | ExcelJS | Exportes `.xlsx` controlados |
| PDF | `@react-pdf/renderer` o generación server-side | Reportes por perfil |
| Automatizaciones | n8n | Sincronización, alertas y tareas programadas |
| Versionamiento | GitHub | Ramas, pull requests y trazabilidad |
| Desarrollo asistido | Claude Code + worktrees + agentes | Paralelización controlada |

## 5.3 Por qué no usar FastAPI desde el primer día

FastAPI es una buena opción, pero agregar un backend separado desde el inicio aumenta:

- contratos duplicados;
- configuración;
- despliegues;
- riesgos de integración;
- tiempo de debugging.

### Cuándo agregar Python o FastAPI

Crear un servicio separado únicamente cuando se necesite:

```text
- lectura avanzada de planos;
- procesamiento BIM;
- cálculos pesados;
- extracción de Excel compleja;
- workers;
- tareas de IA;
- integraciones que requieran Python.
```

El dominio financiero principal puede comenzar en TypeScript si se implementa de forma aislada y testeable.

## 5.4 Arquitectura por módulos

```text
apps/web
├── app
├── components
├── modules
│   ├── auth
│   ├── projects
│   ├── scopes
│   ├── catalog
│   ├── suppliers
│   ├── pricing
│   ├── apu
│   ├── quantities
│   ├── boq
│   ├── estimates
│   ├── execution
│   ├── change-orders
│   ├── planning
│   ├── dashboard
│   └── exports
├── lib
├── server
└── tests

supabase
├── migrations
├── seeds
├── functions
└── policies

scripts
├── excel-import
├── golden-master
├── catalog-sync
└── fixtures

docs
├── PROJECT_MASTER.md
├── API_CONTRACTS.md
├── DATABASE_SCHEMA.md
├── EXCEL_MAPPING.md
├── DECISIONS.md
├── OPEN_QUESTIONS.md
├── HANDOFF_LOG.md
├── QA_REPORT.md
└── LICENSING.md
```

---

# 6. Modelo de datos

## 6.1 Organizaciones y usuarios

### `organizations`

```text
id
name
created_at
```

### `profiles`

```text
id
organization_id
full_name
email
role
created_at
```

### Roles iniciales

```text
admin
gerencia
presupuestos
obra
compras
consulta
```

## 6.2 Proyectos y alcances

### `projects`

```text
id
organization_id
code
name
status
client_reference
location
start_date
estimated_end_date
created_at
updated_at
```

### `project_scopes`

Representa piso, torre, etapa, local o paquete.

```text
id
project_id
parent_scope_id
code
name
scope_type
status
created_at
```

Ejemplo:

```text
ENTRE PATIOS
├── FULL
├── PRIMER PISO
├── SEGUNDO PISO
└── MODIFICACIÓN 01
```

## 6.3 Catálogo y proveedores

### `resources`

```text
id
organization_id
code
name
resource_type
unit
default_waste_pct
active
created_at
updated_at
```

Valores de `resource_type`:

```text
material
labor
equipment
tool
subcontract
other
```

### `suppliers`

```text
id
organization_id
name
supplier_type
contact_data
active
created_at
```

### `supplier_products`

```text
id
supplier_id
resource_id
supplier_sku
supplier_product_name
product_url
location_reference
currency
active
manual_override
last_checked_at
sync_status
created_at
updated_at
```

### `price_observations`

```text
id
supplier_product_id
observed_price
stock_status
source_type
source_reference
observed_at
approved
approved_by
notes
```

Valores de `source_type`:

```text
official_api
official_feed
supplier_csv
manual
public_web
invoice
quotation
```

## 6.4 Reglas de precio

### `pricing_rules`

```text
id
organization_id
name
rule_type
percentage
scope_type
scope_reference_id
active
effective_from
effective_to
```

Tipos:

```text
preventive_variation
negotiated_discount
tax
commercial_markup
rounding
manual_adjustment
```

### Capas de precio obligatorias

```text
online_public_price
budget_reference_price
expected_purchase_price
actual_purchase_price
price_buffer_pct
negotiated_discount_pct
projected_saving
realized_saving
```

## 6.5 Mano de obra

### `labor_roles`

```text
id
organization_id
code
name
base_salary
transport_subsidy
benefits_pct
social_security_pct
payroll_tax_pct
uniform_cost
uniform_period_months
working_days_month
working_hours_day
active
```

### Resultado calculado

```text
monthly_integral_cost
daily_integral_cost
hourly_integral_cost
```

No hardcodear estos resultados. Deben calcularse.

## 6.6 APU

### `apu_templates`

```text
id
organization_id
code
name
unit
chapter_template_id
description
active
version
created_at
updated_at
```

### `apu_components`

```text
id
apu_template_id
resource_id
component_type
quantity
waste_pct
unit_price_source
unit_price_snapshot
total_component_cost
sort_order
notes
```

Tipos:

```text
material
labor
equipment
tool
subcontract
other
```

### Regla

```text
total_component_cost =
quantity × (1 + waste_pct) × unit_price_snapshot
```

### `apu_calculation_snapshots`

```text
id
apu_template_id
estimate_version_id
calculated_unit_cost
components_json
created_at
```

## 6.7 Cantidades

### `quantity_groups`

```text
id
project_scope_id
code
name
unit
calculation_mode
created_at
```

### `quantity_lines`

```text
id
quantity_group_id
description
length
width
height
multiplier
direct_quantity
formula_type
calculated_quantity
notes
sort_order
```

Modos:

```text
direct
length
area
volume
custom
```

Ejemplos:

```text
length: length × multiplier
area: length × width × multiplier
volume: length × width × height × multiplier
custom: fórmula controlada o regla específica
```

## 6.8 Presupuesto y versiones

### `estimates`

```text
id
project_scope_id
code
name
status
created_at
updated_at
```

### `estimate_versions`

```text
id
estimate_id
version_number
status
created_by
created_at
approved_at
notes
```

Estados:

```text
draft
review
approved
issued
archived
```

### `chapters`

```text
id
estimate_version_id
code
name
sort_order
```

### `boq_items`

```text
id
estimate_version_id
chapter_id
apu_template_id
quantity_group_id
code
description_snapshot
unit_snapshot
quantity_snapshot
unit_price_snapshot
subtotal
sort_order
notes
```

### `indirect_cost_rules`

```text
id
estimate_version_id
code
name
percentage
base_type
sort_order
visible_to_client
```

Ejemplo:

```text
A | Administración | 3.5%
I | Imprevistos | 2.5%
U | Utilidad | 4%
IVA sobre utilidad | 19% aplicado sobre U
```

## 6.9 Cronograma y seguimiento

### `schedule_tasks`

```text
id
project_scope_id
boq_item_id
parent_task_id
code
name
start_date
end_date
duration_days
progress_pct
responsible_user_id
resource_summary
is_milestone
created_at
updated_at
```

### `task_dependencies`

```text
id
predecessor_task_id
successor_task_id
dependency_type
lag_days
```

Tipos:

```text
finish_to_start
start_to_start
finish_to_finish
start_to_finish
```

### `progress_updates`

```text
id
task_id
reported_date
progress_pct
executed_quantity
notes
attachment_reference
created_by
created_at
```

## 6.10 Compras y ejecución real

### `purchase_records`

```text
id
project_id
supplier_id
invoice_reference
purchase_date
currency
total_amount
attachment_reference
created_at
```

### `purchase_items`

```text
id
purchase_record_id
resource_id
supplier_product_id
quantity
actual_unit_price
actual_total
```

### Métricas

```text
projected_saving =
budget_reference_price - expected_purchase_price

realized_saving =
budget_reference_price - actual_purchase_price
```

## 6.11 Actas de modificación

### `change_orders`

```text
id
project_scope_id
code
status
presentation_date
approved_date
notes
created_at
```

### `change_order_items`

```text
id
change_order_id
boq_item_id
original_quantity
variation_quantity
adjusted_quantity
unit_price_snapshot
adjusted_total
notes
```

---

# 7. Flujo de precios y Homecenter

## 7.1 Objetivo

Mantener precios actualizados sin alterar retroactivamente presupuestos entregados.

## 7.2 Capas de precio

Ejemplo:

```text
Precio público observado:                     $100.000
Variación preventiva presupuestal:                  3%
Precio de referencia presupuestado:           $103.000

Descuento comercial esperado:                      15%
Costo estimado de compra:                      $85.000

Ahorro comercial proyectado:                  $18.000
```

## 7.3 Información visible y oculta

| Campo | Dashboard interno | Excel cliente | PDF cliente |
|---|---:|---:|---:|
| Precio de referencia presupuestado | Sí | Sí, cuando corresponda | Sí, cuando corresponda |
| Precio público observado | Sí | No | No |
| Variación preventiva | Sí | No | No |
| Descuento negociado | Sí | No | No |
| Precio neto esperado | Sí | No | No |
| Precio real de compra | Sí | No | No |
| Ahorro proyectado | Sí | No | No |
| Ahorro realizado | Sí | No | No |

## 7.4 Homecenter: estrategia prudente

No asumir que existe una API pública documentada.

### Prioridad de integración

```text
1. API o feed oficial entregado por Homecenter Empresas
2. Excel o CSV oficial periódico
3. Cotización o catálogo empresarial
4. Consulta pública controlada por URL o SKU
5. Actualización manual como respaldo
```

### Regla legal y operativa

Antes de implementar scraping o automatización sobre páginas públicas:

```text
- revisar términos del sitio;
- limitar frecuencia;
- no depender de endpoints internos no documentados;
- almacenar timestamp y fuente;
- permitir override manual;
- mantener fallback CSV;
- no actualizar presupuestos emitidos automáticamente.
```

## 7.5 Onboarding de productos

El Excel actual contiene descripciones, pero no necesariamente SKU o URL.

Proceso:

```text
Descripción del Excel
→ candidatos de producto
→ revisión humana
→ aprobación SKU / URL
→ sincronización futura
```

Nunca aprobar automáticamente una coincidencia dudosa.

## 7.6 Flujo n8n sugerido

```text
Cron diario
→ seleccionar productos activos con URL o SKU
→ consultar adaptador de proveedor
→ guardar price_observation
→ comparar contra precio anterior
→ alertar cuando variación supera umbral
→ solicitar aprobación
→ actualizar catálogo maestro aprobado
→ registrar histórico
```

---

# 8. Exportaciones

## 8.1 Perfiles

### Cliente

Incluye:

```text
proyecto
alcance
capítulos
actividades
unidades
cantidades
precios presupuestados
subtotales
AIU visible
total
```

Excluye:

```text
descuentos internos
ahorros
precio neto negociado
margen interno
datos de compras
alertas
```

### Gerencia

Incluye:

```text
presupuesto
costo estimado
precio público
variación
descuento esperado
compras reales
ahorro proyectado
ahorro realizado
margen interno
desviaciones
```

### Compras

Incluye:

```text
material
SKU
proveedor
URL
cantidad requerida
precio observado
precio esperado
precio real
estado de actualización
```

### Obra

Incluye:

```text
capítulo
actividad
cantidad
avance
responsable
inicio
fin
dependencias
alertas
```

## 8.2 Exportables mínimos

```text
Presupuesto_Cliente.xlsx
Presupuesto_Cliente.pdf
Dashboard_Gerencia.xlsx
Listado_Compras.xlsx
Cronograma_Obra.xlsx
Import_MS_Project.xlsx
```

## 8.3 Regla de seguridad

La lógica de exportación debe aplicar permisos en backend. No basta con ocultar columnas en frontend.

---

# 9. Dashboard

## 9.1 Dashboard gerencial

### KPI mínimos

```text
Presupuesto total
Costos directos
Costos indirectos
Utilidad contractual
Costo estimado real
Compras realizadas
Ahorro proyectado
Ahorro realizado
Margen interno proyectado
Margen interno realizado
Avance programado
Avance reportado
Desviación de avance
Fecha estimada de entrega
```

### Gráficas

```text
Costo por capítulo
Presupuesto vs ejecución
Distribución materiales / mano de obra / equipos
Avance programado vs real
Historial de variación de precios
Top materiales por impacto económico
Top desviaciones
```

## 9.2 Dashboard de obra

```text
Tareas activas
Tareas vencidas
Hitos
Avance por capítulo
Responsables
Próximas actividades
Alertas
```

---

# 10. Cronograma

## 10.1 Alcance inicial

```text
crear tarea
asignar fecha inicio
asignar fecha fin
calcular duración
definir dependencia
asignar responsable
relacionar tarea con BOQ
actualizar progreso
crear hito
exportar
```

## 10.2 Relación presupuesto-cronograma

Cada tarea puede relacionarse con uno o varios ítems BOQ.

Ejemplo:

```text
Actividad presupuestada:
Instalación de piso porcelanato | 120 m²

Cronograma:
Tarea: Instalación piso porcelanato primer piso
Cantidad: 120 m²
Rendimiento: 20 m²/día
Duración estimada: 6 días
Dependencia: nivelación terminada
Responsable: cuadrilla acabados
```

## 10.3 Microsoft Project

No intentar generar `.mpp` de forma nativa inicialmente.

Exportar Excel estructurado:

```text
Task Name
Start
Finish
Duration
Predecessors
Resource Names
% Complete
Notes
```

Más adelante evaluar XML y sincronización bidireccional.

---

# 11. Agentes Claude Code

## 11.1 Principio

Los agentes deben trabajar con propiedad clara de archivos y contratos previos.

No abrir varios agentes modificando los mismos archivos.

## 11.2 Agentes

| Agente | Responsabilidad | Archivos principales |
|---|---|---|
| `Agent-Orchestrator` | Arquitectura, decisiones, merges, revisión | `docs/`, archivos compartidos |
| `Agent-DB-RLS` | Esquema PostgreSQL, migraciones, seeds, RLS | `supabase/migrations/`, `supabase/policies/`, `supabase/seeds/` |
| `Agent-Excel-Mapper` | Mapeo del golden master e importador | `scripts/excel-import/`, `docs/EXCEL_MAPPING.md` |
| `Agent-Cost-Domain` | Cálculo APU, BOQ, AIU, snapshots | `apps/web/modules/apu/`, `apps/web/modules/boq/`, `apps/web/modules/estimates/` |
| `Agent-Pricing` | Proveedores, precios e historial | `apps/web/modules/suppliers/`, `apps/web/modules/pricing/` |
| `Agent-Homecenter` | Adaptador Homecenter y fallback CSV | `scripts/catalog-sync/`, `apps/web/modules/pricing/adapters/` |
| `Agent-Frontend-BOQ` | UI proyectos, alcances, grilla y cantidades | `apps/web/modules/projects/`, `apps/web/modules/scopes/`, `apps/web/modules/quantities/` |
| `Agent-Dashboard` | Paneles y alertas | `apps/web/modules/dashboard/` |
| `Agent-Planning` | Gantt, dependencias y avance | `apps/web/modules/planning/`, `apps/web/modules/execution/` |
| `Agent-Exports` | Excel, PDF y perfiles de salida | `apps/web/modules/exports/` |
| `Agent-QA` | Pruebas, regresión, permisos y reportes | `apps/web/tests/`, `scripts/golden-master/`, `docs/QA_REPORT.md` |

## 11.3 Oleadas

### Oleada 0 — Orquestación

```text
Agent-Orchestrator
```

Entrega:

```text
docs/DECISIONS.md
docs/API_CONTRACTS.md
docs/DATABASE_SCHEMA.md
reglas de archivos
worktrees
```

### Oleada 1 — Fundaciones paralelas

```text
Agent-DB-RLS
Agent-Excel-Mapper
Agent-Frontend-BOQ con datos mock
```

### Oleada 2 — Dominio

```text
Agent-Cost-Domain
Agent-Pricing
Agent-Homecenter
```

### Oleada 3 — Producto

```text
Agent-Dashboard
Agent-Planning
Agent-Exports
```

### Oleada 4 — QA e integración

```text
Agent-QA
Agent-Orchestrator
```

## 11.4 Worktrees sugeridos

```bash
git worktree add ../construction-ops-db feature/db-rls
git worktree add ../construction-ops-excel feature/excel-import
git worktree add ../construction-ops-cost feature/cost-domain
git worktree add ../construction-ops-pricing feature/pricing
git worktree add ../construction-ops-ui feature/frontend-boq
git worktree add ../construction-ops-dashboard feature/dashboard
git worktree add ../construction-ops-planning feature/planning
git worktree add ../construction-ops-exports feature/exports
git worktree add ../construction-ops-qa feature/qa
```

## 11.5 Archivos compartidos restringidos

Solo `Agent-Orchestrator` puede modificar directamente:

```text
package.json
package-lock.json
pnpm-lock.yaml
.env.example
README.md
docs/PROJECT_MASTER.md
docs/API_CONTRACTS.md
docs/DATABASE_SCHEMA.md
apps/web/app/layout.tsx
apps/web/middleware.ts
supabase/config.toml
```

Los demás agentes deben registrar solicitudes en:

```text
docs/INTEGRATION_REQUESTS.md
```

---

# 12. Estrategia de implementación

## 12.1 Principio

No construir una maqueta desechable.

El objetivo inicial es una **vertical funcional sólida**:

```text
proyecto
→ alcance
→ materiales
→ APU
→ cantidades
→ presupuesto
→ snapshot
→ dashboard
→ exportación
```

Después:

```text
cronograma
→ avance
→ acta de modificación
→ compras
→ sincronización de precios
```

## 12.2 Fase 0 — Preparación

```text
[ ] Crear repositorio GitHub
[ ] Crear estructura documental
[ ] Copiar PROJECT_MASTER.md a docs/
[ ] Crear .env.example
[ ] Crear proyecto Supabase
[ ] Configurar branch main protegida
[ ] Definir estrategia de ramas
[ ] Cargar Excel golden master fuera del repositorio público
[ ] Crear fixtures sanitizados
```

## 12.3 Fase 1 — Base de datos

```text
[ ] organizations
[ ] profiles
[ ] projects
[ ] project_scopes
[ ] resources
[ ] suppliers
[ ] supplier_products
[ ] price_observations
[ ] pricing_rules
[ ] labor_roles
[ ] apu_templates
[ ] apu_components
[ ] estimates
[ ] estimate_versions
[ ] chapters
[ ] boq_items
[ ] indirect_cost_rules
[ ] quantity_groups
[ ] quantity_lines
[ ] RLS inicial
[ ] seeds
```

## 12.4 Fase 2 — Motor de costos

```text
[ ] calcular mano de obra
[ ] calcular componente APU
[ ] calcular APU
[ ] calcular capítulo
[ ] calcular costos directos
[ ] calcular AIU
[ ] calcular IVA sobre utilidad
[ ] calcular total
[ ] calcular valor por m²
[ ] congelar snapshots
[ ] pruebas unitarias
[ ] regresión contra Excel
```

## 12.5 Fase 3 — Importador Excel

```text
[ ] mapear hojas
[ ] importar proveedores
[ ] importar materiales
[ ] importar precios
[ ] importar salarios
[ ] importar APU
[ ] importar capítulos
[ ] importar actividades
[ ] importar cantidades
[ ] crear proyecto piloto
[ ] crear alcance primer piso
[ ] validar totales
```

## 12.6 Fase 4 — Interfaz funcional

```text
[ ] login
[ ] selector de proyecto
[ ] selector de alcance
[ ] vista catálogo
[ ] vista APU
[ ] vista cantidades
[ ] vista presupuesto
[ ] edición controlada
[ ] snapshot de versión
[ ] feedback de errores
```

## 12.7 Fase 5 — Exportaciones

```text
[ ] Excel cliente
[ ] PDF cliente
[ ] Excel gerencia
[ ] Excel compras
[ ] Excel obra
[ ] export MS Project
[ ] pruebas de filtrado de datos sensibles
```

## 12.8 Fase 6 — Cronograma y seguimiento

```text
[ ] tareas
[ ] dependencias
[ ] hitos
[ ] responsables
[ ] relación con BOQ
[ ] porcentaje de avance
[ ] historial de actualizaciones
[ ] dashboard de obra
```

## 12.9 Fase 7 — Homecenter y proveedores

```text
[ ] adaptador genérico de proveedores
[ ] supplier_sku
[ ] product_url
[ ] location_reference
[ ] historial
[ ] carga CSV
[ ] aprobación humana
[ ] alertas
[ ] cron n8n
[ ] prueba controlada con pocos productos
```

## 12.10 Fase 8 — Actas y compras

```text
[ ] actas de modificación
[ ] variaciones
[ ] cantidades ajustadas
[ ] compras
[ ] facturas
[ ] costo real
[ ] ahorro realizado
[ ] desviaciones
```

---

# 13. Jornada intensiva inicial

## 13.1 Disponibilidad informada

```text
Viernes: 6:00 p. m. → 1:00 a. m.        7 horas
Sábado: 7:00 a. m. → 12:00 m.           5 horas
Sábado: 1:30 p. m. → 12:00 a. m.       10.5 horas
Domingo: 9:00 a. m. → 12:00 m.          3 horas
Domingo: 2:00 p. m. → 6:00 p. m.        4 horas
TOTAL:                                  29.5 horas
```

## 13.2 Objetivo de la jornada

No limitar el desarrollo a una maqueta básica. Construir una base seria y dejar funcionando el corazón financiero.

### Resultado mínimo obligatorio

```text
[ ] repositorio estructurado
[ ] Supabase configurado
[ ] esquema inicial
[ ] proyecto ENTRE PATIOS
[ ] alcance PRIMER PISO
[ ] importador reproducible
[ ] catálogo importado
[ ] APU importados
[ ] cantidades importadas
[ ] presupuesto calculado
[ ] regresión contra totales del Excel
[ ] snapshots
[ ] dashboard financiero básico
[ ] Excel cliente
[ ] PDF cliente
[ ] documentación
```

### Resultado ampliado deseable

```text
[ ] Homecenter adapter base
[ ] CSV fallback
[ ] selección y aprobación SKU
[ ] Gantt
[ ] seguimiento
[ ] acta de modificación
[ ] compras reales
```

## 13.3 Secuencia por bloques

### Viernes — Fundaciones

```text
6:00–7:00
- crear repositorio
- crear Next.js
- crear proyecto Supabase
- copiar documento maestro

7:00–8:00
- definir contratos
- decidir ORM
- crear estructura de módulos
- crear agentes

8:00–10:00
- migraciones base
- RLS inicial
- seeds mínimos

10:00–12:00
- importador Excel
- mapeo de hojas
- fixture sanitizado

12:00–1:00
- prueba de regresión inicial
- documentar bloqueos
```

### Sábado mañana — Motor financiero

```text
7:00–9:00
- cálculo mano de obra
- cálculo APU

9:00–10:30
- BOQ
- capítulos
- AIU
- IVA

10:30–12:00
- importar primer piso
- comparar totales
- corregir diferencias
```

### Sábado tarde y noche — Interfaz y salida

```text
1:30–3:30
- proyectos
- alcances
- presupuesto

3:30–5:30
- cantidades
- tabla editable
- snapshots

5:30–7:00
- dashboard

7:00–9:00
- Excel cliente
- PDF cliente
- pruebas privacidad

9:00–10:30
- proveedores
- historial
- capas de precio

10:30–12:00
- adaptador Homecenter base
- CSV fallback
```

### Domingo mañana — Seguimiento

```text
9:00–10:30
- cronograma
- tareas
- dependencias

10:30–12:00
- avance
- dashboard obra
- actas
```

### Domingo tarde — QA y estabilización

```text
2:00–3:30
- regresión
- permisos
- exportaciones

3:30–4:30
- corregir bloqueantes

4:30–5:15
- documentación
- handoff

5:15–6:00
- demo completa
- commit estable
- tag
```

---

# 14. Criterios de aceptación

## 14.1 Costos

```text
[ ] Reproduce los totales del golden master
[ ] Permite configurar AIU
[ ] Calcula IVA sobre utilidad
[ ] Mantiene snapshots
[ ] No cambia presupuestos emitidos al actualizar catálogo
```

## 14.2 Cantidades

```text
[ ] Cantidad directa
[ ] Largo
[ ] Área
[ ] Volumen
[ ] Multiplicador
[ ] Sumatorias
[ ] Trazabilidad
```

## 14.3 Catálogo

```text
[ ] Materiales
[ ] Mano de obra
[ ] Equipos
[ ] Proveedores
[ ] Historial de precios
[ ] Variación preventiva
[ ] Descuento interno
[ ] Override manual
```

## 14.4 Privacidad

```text
[ ] Cliente no ve descuentos internos
[ ] Cliente no ve ahorro
[ ] Cliente no ve costos reales
[ ] Cliente no ve proveedores privados salvo decisión explícita
[ ] Variables de entorno no se versionan
[ ] Base protegida por RLS
```

## 14.5 Exportación

```text
[ ] Excel cliente
[ ] PDF cliente
[ ] Excel gerencia
[ ] Excel compras
[ ] Excel cronograma
```

## 14.6 Cronograma

```text
[ ] Crear tarea
[ ] Editar fechas
[ ] Crear dependencia
[ ] Crear hito
[ ] Actualizar avance
[ ] Vincular BOQ
```

## 14.7 Calidad

```text
[ ] tests unitarios
[ ] tests regresión
[ ] logs
[ ] errores visibles
[ ] commits pequeños
[ ] documentación actualizada
```

---

# 15. Reglas para todas las IA y agentes

```text
1. Leer PROJECT_MASTER.md antes de trabajar.
2. No inventar estructura sin revisar documentación.
3. No copiar código AGPL.
4. No instalar ag-grid-enterprise.
5. No hardcodear precios, descuentos o AIU.
6. No duplicar lógica financiera en frontend y backend.
7. El dominio de costos debe tener una sola fuente de verdad.
8. Todo cambio financiero requiere pruebas.
9. Toda versión emitida debe conservar snapshot.
10. Los datos privados nunca se incluyen en fixtures públicos.
11. No mezclar dashboard interno con exportaciones para cliente.
12. No modificar archivos compartidos sin autorización del orquestador.
13. Documentar supuestos.
14. Mantener HANDOFF_LOG.md.
15. Detener integración cuando falle regresión.
```

---

# 16. Riesgos conocidos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Fórmulas cruzadas entre hojas | Alto | Mapear antes de migrar |
| Diferencias de redondeo | Alto | Definir precisión decimal |
| Cambios retroactivos de precios | Alto | Snapshots |
| SKU ambiguos | Alto | Aprobación humana |
| Filtración de descuento interno | Alto | Export profiles y permisos backend |
| Agentes editando mismos archivos | Alto | Worktrees y ownership |
| Dependencias con licencias comerciales | Medio | Auditoría de paquetes |
| Intentar demasiados módulos simultáneamente | Medio | Oleadas y vertical funcional |
| Homecenter sin API pública | Medio | Adaptador desacoplado y CSV |
| Excel con datos privados | Alto | Fixtures sanitizados |

---

# 17. Decisiones abiertas

Registrar respuestas en `docs/DECISIONS.md`.

```text
[ ] Nombre final del producto
[ ] ORM: Drizzle o Prisma
[ ] Política exacta de redondeo
[ ] Usuarios iniciales y roles
[ ] Qué información ve el cliente en APU
[ ] Proveedores visibles para cliente
[ ] Alcance de compras
[ ] Frecuencia de sincronización
[ ] Canal oficial Homecenter Empresas
[ ] Descuento predeterminado o por proveedor
[ ] Gantt por capítulos o actividades
[ ] Ubicación del despliegue
```

---

# 18. Prompt de arranque para un chat nuevo

Copiar y pegar este bloque en un chat nuevo y adjuntar:

```text
- PROJECT_MASTER.md
- COT.ENTRE PATIOS 1 PISO (1).xlsx
- repositorio o enlace GitHub actual
```

```text
Actúa como arquitecto técnico senior y orquestador del proyecto Construction Ops.

Antes de proponer código:
1. Lee por completo el archivo PROJECT_MASTER.md.
2. Revisa el estado actual del repositorio.
3. Revisa el Excel COT.ENTRE PATIOS 1 PISO (1).xlsx como golden master.
4. Identifica la fase actual, entregables completos, bloqueos y archivos que puedes editar.
5. Revisa docs/HANDOFF_LOG.md, docs/DECISIONS.md y docs/OPEN_QUESTIONS.md si existen.
6. No copies código AGPL de OpenConstructionERP.
7. No instales AG Grid Enterprise.
8. No cambies cálculos financieros sin pruebas de regresión.
9. No expongas descuentos internos en exportaciones para clientes.
10. Mantén una sola fuente de verdad para presupuesto y APU.

Necesito que comiences respondiendo con:
A. Estado encontrado.
B. Riesgos.
C. Próximos pasos en orden.
D. Archivos que planeas modificar.
E. Pruebas que ejecutarás.
F. Qué agentes o worktrees conviene activar.

Después de entregar ese análisis, ejecuta la siguiente tarea solicitada sin rehacer lo que ya existe.
```

---

# 19. Prompt para Claude Code Orchestrator

```text
You are the senior technical orchestrator for Construction Ops.

Read docs/PROJECT_MASTER.md completely before touching code.

Primary objective:
Build a proprietary clean-room construction budgeting and site progress platform. Do not copy AGPL code from OpenConstructionERP. OpenConstructionERP may be studied only as a functional reference.

Golden master:
COT.ENTRE PATIOS 1 PISO (1).xlsx

Non-negotiable rules:
1. Keep one source of truth for financial calculations.
2. Preserve immutable estimate snapshots.
3. Separate client exports from internal pricing and savings.
4. Do not install ag-grid-enterprise.
5. Use AG Grid Community only if needed.
6. Add regression tests against the golden master.
7. Protect private business data.
8. Use worktrees and file ownership for parallel agents.
9. Keep shared-file edits under the orchestrator.
10. Update docs/HANDOFF_LOG.md after each milestone.

Start by:
- auditing the repository;
- identifying the current phase;
- creating or updating docs/DECISIONS.md;
- creating or updating docs/API_CONTRACTS.md;
- creating or updating docs/DATABASE_SCHEMA.md;
- proposing worktrees;
- listing blocking decisions;
- executing the highest-priority non-blocked task.
```

---

# 20. Prompt para Agent-Excel-Mapper

```text
You are Agent-Excel-Mapper.

Read docs/PROJECT_MASTER.md and the golden-master workbook:
COT.ENTRE PATIOS 1 PISO (1).xlsx

Your job:
1. Map workbook sheets, ranges, headers, formulas and dependencies.
2. Document cross-sheet references.
3. Identify which cells are editable inputs and which are derived.
4. Create a sanitized fixture.
5. Build a reproducible import script.
6. Create regression assertions for:
   - direct costs
   - AIU
   - VAT on utility
   - total
   - built area
   - value per m2
7. Update docs/EXCEL_MAPPING.md.
8. Do not expose client names in public fixtures.
9. Do not modify UI files.
10. Commit small changes.
```

---

# 21. Prompt para Agent-Cost-Domain

```text
You are Agent-Cost-Domain.

Read docs/PROJECT_MASTER.md and docs/EXCEL_MAPPING.md.

Your job:
1. Implement labor calculations.
2. Implement APU component calculations.
3. Implement BOQ and chapter calculations.
4. Implement indirect cost rules.
5. Implement VAT on utility.
6. Implement estimate version snapshots.
7. Implement rounding policy after it is documented.
8. Write unit tests.
9. Run golden-master regression.
10. Do not duplicate formulas in UI.
11. Do not modify export templates.
12. Stop and report if regression fails.
```

---

# 22. Prompt para Agent-Pricing y Homecenter

```text
You are Agent-Pricing / Agent-Homecenter.

Read docs/PROJECT_MASTER.md.

Your job:
1. Implement suppliers, supplier products and price observations.
2. Separate public price, budget reference price, expected purchase price and actual purchase price.
3. Implement preventive variation and negotiated discount rules.
4. Implement manual override.
5. Implement CSV fallback.
6. Build an adapter interface for providers.
7. Create a Homecenter adapter skeleton.
8. Do not assume an official API exists.
9. Do not scrape aggressively.
10. Require human approval for SKU mapping and large price changes.
11. Never update issued estimate versions retroactively.
12. Do not expose negotiated discounts in client exports.
```

---

# 23. Fuentes oficiales útiles

## OpenConstructionERP

```text
Repositorio:
https://github.com/datadrivenconstruction/OpenConstructionERP

Documentación:
https://openconstructionerp.com/docs.html

Términos y licencia:
https://github.com/datadrivenconstruction/OpenConstructionERP/blob/main/TERMS.md
https://www.gnu.org/licenses/agpl-3.0.html
```

## AG Grid

```text
Community vs Enterprise:
https://www.ag-grid.com/javascript-data-grid/community-vs-enterprise/

Licencias:
https://github.com/ag-grid/ag-grid/blob/latest/LICENSE.txt
```

## Supabase

```text
Documentación:
https://supabase.com/docs

RLS:
https://supabase.com/docs/guides/database/postgres/row-level-security

Seguridad API:
https://supabase.com/docs/guides/api/securing-your-api
```

## Librerías

```text
Frappe Gantt:
https://github.com/frappe/gantt

ExcelJS:
https://github.com/exceljs/exceljs
```

## Homecenter

```text
Sitio:
https://www.homecenter.com.co/

App y cotizaciones:
https://www.homecenter.com.co/homecenter-co/content/app-homecenter/
```

---

# 24. Nota final

Este proyecto no debe plantearse como un simple “Excel en una web”.

Debe construirse como:

```text
sistema de costos
+
biblioteca de APU
+
motor de cantidades
+
catálogo de proveedores
+
precios versionados
+
dashboard interno
+
exportaciones seguras
+
cronograma
+
seguimiento de obra
+
historial de modificaciones
```

La primera meta es trasladar la inteligencia del Excel actual a una arquitectura mantenible sin perder precisión financiera. La segunda meta es convertir esa estructura en una herramienta diaria de la constructora. La tercera meta, si se decide, será desarrollar un producto comercial reutilizable.
