# UIX_REFERENCE_AUDIT — Auditoría de referencias visuales

> Complemento de `docs/DESIGN.md`. Inspiración de **calidad/jerarquía/composición**,
> nunca copia de branding/colores externos. Imágenes versionadas en
> `docs/design-references/uix/`.
>
> **Importante (todas las refs son DARK):** ICONIC OPS se mantiene **claro** (navy +
> azul + neutros). NO convertir a dark mode ni usar morados/neón de las referencias.
> Se extrae estructura, jerarquía, densidad de datos y micro-data-viz, adaptados a la
> paleta ICONIC (`iconic-primary #005DD6`, `iconic-ink #020148`, `iconic-cyan #00B8FF`
> uso escaso, `iconic-soft-blue #C7DCED`, `brand-50 #E8F1FD`).

## Referencias auditadas (5)

### ref-01 — `01-sidebar.jpg` (rail / sidebar, app cripto "Thor")
- **Sirve:** rail con **modo colapsado icono-only** + **tooltips** al hover; ítem activo en
  **pill** lleno; ítems de acción destacados (uno verde "Add Liquidity", uno azul "Your Wallet");
  acción "Collapse Sidebar" explícita; footer con accesos.
- **NO copiar:** branding Thor; acentos verde/cyan neón; fondo negro.
- **Adaptación ICONIC:** el sidebar ya es navy `iconic-ink`. Adoptar **colapsable icono-only +
  tooltips** y pill activo (ya existe NavLink pill). Acentos solo `iconic-primary`/`iconic-cyan` escasos.
- **Patrón aplicable:** rail colapsable con tooltips (futuro shell); pill activo (ya en DESIGN §3).

### ref-02 — `ref-02-dashboard-globe.jpg` (analytics "General statistics")
- **Sirve:** **número héroe** gigante ("7,541,390") con barra multibanda de actividad; **lista
  rankeada** con valores + %; mini-paneles (Total earning con sparkbars, Trend con line chart,
  Total coverage con **donut %**, Time Statistic con **barras por mes**); tarjetas "Most engaged"
  con icono; forecast con **deltas ▲%**.
- **NO copiar:** globo neón morado/azul, fondo negro, gradientes saturados.
- **Adaptación ICONIC:** MetricCard con número héroe + delta; donut/sparkbars en `iconic-primary`/
  `iconic-cyan`; fondo blanco con realce `brand-50`.
- **Patrón aplicable:** dashboard/resumen con **1 número héroe + breakdown + micro-data-viz**
  (DESIGN §5/§12.b). Ya aplicado parcialmente al resumen del Workspace (Total general héroe).

### ref-03 — `ref-03-heatmap.jpg` (IoT "Urban Sound", la más cercana a ICONIC en color)
- **Sirve:** **sidebar agrupado** por secciones (Overview / Metrics / Account) con sub-ítems y
  **badges de conteo**; **búsqueda con hint ⌘**; **columna derecha de cards apiladas** (Noise levels
  número héroe + sparkline, **Device health** filas clave/valor con dot de estado, **Predictive
  analytics** con barra de progreso %); tarjeta de usuario en el footer.
- **NO copiar:** la visualización hexagonal específica; fondo oscuro.
- **Adaptación ICONIC:** usa **azules muy alineados a ICONIC** → buena guía de calidad en claro.
  Adoptar: sidebar con **secciones + badges de conteo**, **right-rail de cards informativas**,
  **barras de progreso con %**, búsqueda con hint ⌘ (ya existe ⌘K).
- **Patrón aplicable:** navegación contextual agrupada; paneles laterales de estado; progress bars.

### ref-04 — `ref-04-operations.jpg` (manufactura "Operations" — LA MÁS RELEVANTE para obra)
- **Sirve:** **lista de operaciones** con **anillo de progreso por ítem** + ítem **seleccionado
  resaltado** (azul); **botones de acción por tipo, semánticos** (Start=verde, Changeover=azul,
  Downtime=ámbar, Finish=rojo); **"Operation details"** con chips fecha/hora; **barra de producción**
  con fila de KPIs **Planned / To do / Done / Waste**; **Efficiency** bar chart con barra resaltada
  (+10 badge); paneles Comment + People.
- **NO copiar:** fondo índigo/oscuro; estética genérica.
- **Adaptación ICONIC (alta):** mapea casi 1:1 al **Workspace/BOQ y a la cotización asistida**:
  - lista de capítulos/partidas con **estado/progreso** + selección resaltada;
  - **acciones semánticas por color** (revisar/asociar/exportar) — con paleta ICONIC + estados;
  - fila de **KPIs** estilo Planned/Done → directo/total/AIU/IVA/indirectos (ya como SummaryCards);
  - **barras** para participación por capítulo / eficiencia (futuro, sin neón).
- **Patrón aplicable:** "operation-list + detail" como modelo de jerarquía para Workspace y companion;
  fila de KPIs con etiquetas; barras de participación.

### ref-05 — `ref-05-fitness-dashboard.jpg` (fitness)
- **Sirve:** saludo/hero ("Hello, Alex!"); **MetricCards con sparkline + número grande + Goal/Average**;
  **donut** (Sleep) y **barra de progreso** (Weight plan %); **calendario** con día resaltado;
  **segmented pills** (All / Alone / With friends); **tarjetas de actividad** con hora + flecha (next).
- **NO copiar:** acento verde lima/neón; fondo oscuro.
- **Adaptación ICONIC:** MetricCard con sparkline + valor + referencia secundaria; **segmented
  controls** (ya = `FilterPills`); tarjetas de "siguiente acción" (ya en companion "Qué sigue").
- **Patrón aplicable:** MetricCard enriquecida (sparkline + meta), pills (hecho), next-action cards (hecho).

## Síntesis — patrones a aplicar en ICONIC (en claro, paleta ICONIC)

1. **Número héroe** por panel + breakdown secundario (Workspace resumen ✅; extender a dashboard).
2. **Micro-data-viz**: anillos de progreso, sparkbars/sparklines, barras de participación — en
   `iconic-primary`/`iconic-cyan`, sin neón. (Pendiente: por capítulo/estado.)
3. **Operation-list + detail** (ref-04) como modelo de jerarquía para Workspace/companion.
4. **Acciones semánticas por color** (estado), no decorativas.
5. **Sidebar**: agrupado por secciones + badges de conteo + colapsable icono-only con tooltips.
6. **Right-rail / cards de estado** apiladas con clave/valor + dot.
7. **Segmented pills** (`FilterPills`) y **next-action cards** (companion) — ya implementados.
8. **Profundidad**: `shadow-iconic` + bordes `iconic-soft-blue`, fondos `brand-50→blanco`. Nada de dark.

> Regla permanente: si una referencia contradice la paleta/claridad ICONIC, **gana ICONIC**.
