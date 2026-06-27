# UIX_THEME_MODES_V4_2 — Base de tema claro/oscuro

## Objetivo
Crear una **base sólida** de tema claro/oscuro para ICONIC OPS con tokens, provider
y componentes theme-aware — sin dark mode improvisado y sin romper la identidad. El
**modo claro es la base actual, tokenizada** (sin cambio visual); el **modo oscuro**
es un command center ICONIC sobrio (navy casi negro, sin negro puro, sin morado/neón).

## Decisión de implementación
- **`darkMode: 'class'`** en Tailwind + **tokens semánticos por CSS variables** (no se
  reescriben clases a mano por toda la app).
- **Provider propio** (sin dependencia nueva: no se instaló `next-themes`).
- Estado inicial fijado por **script inline en `<head>`** antes del paint → sin FOUC ni
  hydration mismatch. `<html suppressHydrationWarning>`.
- **Default: claro.** Persistencia en `localStorage` (`iconic-theme`). Soporte `system`.

## Tokens (CSS variables — `app/globals.css`)
| Token | Light | Dark |
|---|---|---|
| `--c-app` (fondo página) | `#f2f4f7` | `#060b1f` (navy casi negro) |
| `--c-surface` (cards/tablas/inputs) | `#ffffff` | `#0b1230` |
| `--c-surface-soft` | `#f8fafc` | `#101a3d` |
| `--c-surface-muted` | `#eef2f7` | `#141f46` |
| `--c-line` (bordes) | `#e5e7eb` | `#25345f` |
| `--c-content` (texto) | `#1b1f3e` | `#f8fafc` |
| `--c-content-muted` | `#6b7280` | `#aebfdb` |

Expuestos en Tailwind como `bg-app`, `bg-surface`, `bg-surface-soft/muted`, `border-line`,
`text-content`, `text-content-muted`. La marca ICONIC (navy/azul/cian/brand) **no cambia**:
las barras navy (`OperationsHeader`, sidebar, command bars) sirven en ambos modos.

## Toggle
- Componente **`ThemeToggle`** (segmentado **Claro / Oscuro / Sistema**, `role=group` + `aria-pressed`,
  iconos sol/luna/monitor).
- Ubicación: **menú de cuenta** del topbar (sección "Tema"). Discreto, accesible por teclado.

## Componentes tocados (theme-aware vía `dark:` variants — light intacto)
- Fundación: `tailwind.config.ts`, `app/globals.css`, `app/layout.tsx`.
- Tema: `theme-provider.tsx`, `theme-toggle.tsx`.
- Shell: `(dashboard)/layout.tsx` (fondo `bg-app`), `app-topbar.tsx`, `account-menu.tsx`. (Sidebar ya
  era navy → sirve en ambos.)
- Primitivos: `ui/card.tsx`, `ui/input.tsx`, `ui/badge.tsx` (estados sobrios en dark).
- Compartidos: `kpi-card.tsx`, `inline-callout.tsx`, `filter-pills.tsx`. (`OperationsHeader` es navy → sirve.)
- Tablas AG Grid: variante `.dark .ag-theme-alpine` en `globals.css`.

## Cómo probar
1. Topbar → menú de cuenta → sección **Tema** → Oscuro / Claro / Sistema.
2. Recargar: el tema **persiste** (localStorage) y no hay parpadeo (script inline).
3. Verificar legibilidad en ambos temas; el claro debe verse **idéntico** al actual.

## Qué NO se tocó
Supabase, RLS, policies, migrations, Auth, envs/secrets, Vercel config, cálculos BOQ/APU, exports,
`unit_price_snapshot`, datos reales, RPCs, read-model, permisos, lógica del Workspace V3C, companion,
filtro Sin APU, `construction-ops-1rqh`. Sin dependencias nuevas. Sin morado/neón/negro puro.

## Riesgos
- **Tablas densas crudas** (Workspace BOQ, `CatalogExplorer`, listas de capítulos) usan `bg-white` +
  `text-gray-*` directos: en oscuro se ven como **papel claro legible sobre el shell oscuro** (no rotas),
  pero **aún no están dark-themed**. Es el principal pendiente (ver abajo).
- Componentes con literales `bg-white`/`text-gray-*` fuera de los primitivos quedan claros en dark.

## Pendientes (V4.3 / siguiente)
- Dark pass de tablas densas: Workspace BOQ (panels + tabla + celdas + filas selected/hover), Catálogo,
  capítulos, cantidades.
- Migrar literales `bg-white`/`text-gray-*` de páginas a tokens `surface`/`content`.
- Dashboard command-center: revisar contraste de Recharts/sparkbars en dark.
- Pulido de estados/badge en dark por módulo.

## QA
typecheck 0 · lint 0 · tests `theme-modes` 6/0 · suite **2107/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.

---

## V4.2.1 — Dark Coverage Hotfix

Completa la cobertura visual del modo oscuro en superficies densas, para que el dark
mode se sienta ICONIC y **sin grandes bloques blancos**.

### Cómo se cubrió (centralizado + reversible)
- **Capa central en `globals.css`**: remapeo de **utilidades CLARAS PLANAS → tokens** SOLO bajo `.dark`
  (`.dark .bg-white{var(--c-surface)}`, `bg-gray-50/100`→surface-soft/muted, `bg-brand-50`/`bg-slate-50`,
  `border-gray-100/200/300`→line, `text-gray-400/500/600/700/800/900`→content/-muted, `text-slate-*`, y
  **estados sobrios** `bg-amber-50`/`bg-green-50`/`bg-red-50`/`bg-blue-50`/`bg-cyan-50` + textos). Cubre de
  una sola vez TODAS las superficies densas (Workspace, Catálogo, APU, Cantidades, detalle, review-table…)
  sin editar cientos de clases. **No afecta** variantes con opacidad ni `text-white`/`border-white/*` de las barras navy.
- **Excepción blanco-sobre-navy**: `OperationsHeaderAction` primary pasó de `bg-white` → `bg-iconic-white`
  (clase distinta, no remapeada) para seguir blanca sobre la barra navy.
- **Variantes `dark:` puntuales** en zonas con **opacidad** (no cubiertas por el remapeo): Workspace V3C
  (paneles Estado operativo/Resumen financiero, banner, placeholder de detalle, panel de detalle, filas de
  capítulo, hover, **selección**, chip de subtotal, toolbar sticky, OpsKpi warn) + detalle de presupuesto
  (CTA workspace, fila de capítulo archivada) + APU (form de filtros, hover de fila).
- **AG Grid**: variante `.dark .ag-theme-alpine` (ya en V4.2).

### Superficies cubiertas
Workspace BOQ (paneles, KPIs, tabla, headers, filas, hover, **selected**, footer navy, detalle, chips,
estados), Catálogo (cards/tablas/badges vía primitivos + remapeo), APU (KPIs, filtros, tabla, badges),
Cantidades / detalle / capítulos (tablas, filas, estados), badges/estados compartidos (sobrios en dark).

### Pendiente
- Recharts/sparkbars del Dashboard: revisar contraste fino de series en dark (no rompe, pero puede pulirse).
- Casos puntuales con colores muy específicos (degradados decorativos) podrían afinarse por inspección visual.

### QA (V4.2.1)
typecheck 0 · lint 0 · tests `theme-modes` 9/0 · suite **2110/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.
Light mode intacto (variantes `dark:` y remapeo solo bajo `.dark`). Workspace V3C / companion / filtro Sin APU intactos.

---

## V4.2.2 — Theme + Nav Refinement

Iteración visual fuerte a partir de feedback real: dark mode "feo/pesado", cards del dashboard cargadas,
y rediseño del sidebar como rail flotante.

### Dark mode — por qué se rehizo
Se sentía "todo azul oscuro / lleno". Se **bajó la saturación** y se hizo la base más **neutra-profunda**
con más respiración y mejor contraste fondo→superficie→contenido (el acento de marca azul/cian ahora resalta
en vez de saturar). Nuevos valores `.dark`:
`--c-app #0a0e16` · `--c-surface #141925` · `--c-surface-soft #1b2230` · `--c-surface-muted #232c3d` ·
`--c-line #2c3647` · `--c-content #eef2f8` · `--c-content-muted #9aa8c0`. (Antes eran más navy/saturados.)

### Sidebar → **rail flotante** (`components/shared/app-rail.tsx`, client)
- "Flotante pero fijo": `fixed inset-y-3 left-3`, **rounded-2xl**, sombra, navy ICONIC.
- **Compacto** (solo íconos, ~4rem) y **se expande al hover** (~14.5rem, con etiquetas). Transición suave.
- **Pin**: botón para dejarlo abierto fijo; **persiste** en `localStorage` (`iconic-rail-pinned`). Con pin, un
  spacer en flujo **empuja** el contenido; en hover (sin pin) **overlayea** sin mover el layout.
- `SidebarNav` recibe `expanded`: colapsado muestra solo íconos (con `title`/`aria-label`); expandido, etiquetas.
  **Mismas rutas/íconos/nombres**; sin cambio de lógica de navegación.
- **Pie del rail**: CTA **Asistente** (dispara `quote-companion:open`, sin tocar la lógica del companion).
- El bloque dominante **"Grupo ICONIC / Modo demostración" se eliminó**; el modo de datos queda como un
  **indicador muy sutil** (punto + texto solo al expandir) en el pie.

### Dashboard — simplificación
- **Centro de mando**: se eliminó la **sub-card con borde/box** de "Distribución por capítulo" (el "card dentro
  de card"); ahora va **integrada** con un divisor sutil. Jerarquía más limpia (encabezado → cifra → estado →
  composición → métricas → acciones).
- **Capítulo de mayor peso**: se quitaron los **círculos/forma decorativa** y el gradiente raro; ahora es una
  card sobria y consistente (ícono plano + barra de progreso + %), theme-aware (claro/oscuro).

### Pendiente
- Pulir contraste de Recharts/sparkbars del dashboard en dark. Posible micro-animación del rail. Revisión
  responsive fina del rail en pantallas muy angostas.

### QA (V4.2.2)
typecheck 0 · lint 0 · tests `theme-modes`/`sidebar-access` ok · suite **2111/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.
Navegación/rutas intactas · Workspace V3C / companion / filtro Sin APU / exports intactos · sin lógica sensible.

---

## V4.2.3 — Premium Iconography + Glass Navigation System

Capa visual sistémica (desde componentes/tokens, no página por página) para una sensación SaaS premium
(Apple/macOS-inspired, glass sobrio, soft UI, táctil), sin neón ni cambios de lógica.

### Iconografía (capa central)
- **`components/shared/iconic-icon.tsx`**: `IconicIcon` (ícono suelto con **tono** semántico) + `IconChip`
  (ícono en "plate" redondeado). Estados: `default / active / muted / primary / success / warning / danger`,
  todos theme-aware (paleta ICONIC). Activo = más presencia (azul/cian); inactivo = sutil (muted).
- **Normalización global** en `globals.css`: `svg.lucide { stroke-width: 1.75; linecap/linejoin round }` →
  todos los íconos lucide de la app pasan a **monoline fino y redondeado** (menos genérico) de una sola vez.
- Adopción: `IconChip` en el dashboard (Capítulo de mayor peso); el resto hereda el trazo normalizado.
  Adopción progresiva de `IconChip` en más action cards = pendiente menor.

### Navegación — glass/dock
- `AppRail`: navy **translúcido + blur** (`glass-navy`), borde `white/12` + ring interno sutil, sombra
  premium y glow cian muy tenue. Active state = cápsula/pill (ya existente). **Pressed state** (`active:scale`)
  en items y CTA. Conserva hover-expand, **pin** persistente, CTA **Asistente**, indicador de modo sutil y rutas.

### Botones / superficies
- **`Button`**: base con radios suaves + **transición completa + `active:scale-[0.98]`** (táctil) + foco con
  offset theme-aware. Primario con sombra que se eleva al hover; **secundario (`outline`) "frosted"**
  (translúcido + `backdrop-blur` + borde sutil); variantes **dark** en todas (secondary/ghost/link/outline).
- Utilidades `.glass` / `.glass-navy` en `globals.css` para barras/menús/acciones premium (blur ligero, no pesado).
- `Card`, `Badge`, `KpiCard`, `InlineCallout`, `FilterPills`, `OperationsHeaderAction` ya theme-aware (V4.2/.1)
  → heredan el nuevo trazo de íconos y conviven con el sistema glass.

### Cubierto globalmente
Trazo de íconos (toda la app), botones (todos los que usan `Button`), rail/navegación, CTA Asistente,
dashboard (cards + iconografía), y los componentes compartidos del shell.

### Pendiente (V5)
- Adoptar `IconChip`/`IconicIcon` en más action cards/toolbars por módulo.
- Glass selectivo en toolbars de tablas densas (Workspace/Catálogo) al hacer su restyle profundo.
- Micro-animaciones y revisión de contraste de Recharts en dark.

### QA (V4.2.3)
typecheck 0 · lint 0 · tests `premium-system` 5/0 · suite **2116/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.
Light limpio · dark elegante · navegación/rutas/Workspace V3C/companion/Sin APU/exports intactos · sin lógica sensible.

---

## V4.2.5 — Signature Visual Redesign

Las iteraciones previas (.1–.4) eran polish incremental; la usuaria pedía un **cambio de identidad
perceptible**. Problema raíz detectado: **dark = "todo navy saturado"** + superficies genéricas + dashboard
"mega-card navy con cards adentro". Tesis (skill `frontend-design`: *gastar la audacia en un solo lugar*):
**mover la base dark a graphite neutro (Linear/Vercel/Raycast) para que el navy ICONIC sea ACENTO, no la app entera.**

### Dark mode (rearmado)
- Base **graphite neutro de baja croma** (NO navy): `--c-app #0c0d10` · `--c-surface #16171b` ·
  `--c-surface-soft #1b1d22` · `--c-surface-muted #23252b` · `--c-line #292b32` (hairline) ·
  `--c-content #eceef2` (blanco suave) · `--c-content-muted #9a9ea8` (gris neutro).
- Acentos ICONIC (azul/cian) **reservados** a CTA/estados/datos/rail. AG Grid dark realineado a graphite.
- Resultado: el navy del rail/command bar **resalta como firma** sobre una base neutra; ya no "todo azul".

### Light mode
- Off-white `#f5f6f8`, hairlines suaves `#e7e9ee`, **texto casi-negro neutro** `#1a1d23` (menos "navy en el
  texto"), más aire. Cards con sombra muy suave + lift sutil (Apple-like). Sin dañar la estética clara.

### Dashboard (recomposición editorial)
- **Eliminado el mega-hero navy** con gradiente/glow y sus mini-cards (`CommandStat`/`BlueprintBg`/`IconPlate`).
- Nueva composición sobre superficies de tema: eyebrow → **Total presupuesto** como cifra-héroe display →
  **barra de composición de costo** (instrumento firma, específico de obra) → **tira de métricas plana con
  hairlines** (`DashMetric`, sin cajas navy) → **panel de distribución limpio**. "Diseñado, no ensamblado".

### Card system / superficies
- `Card` premium: hairline `+ ` sombra muy suave + lift al hover (claro); en **dark solo borde fino** (sin
  sombra pesada, estilo Linear). Métricas planas con hairline dividers en vez de cajas con borde grueso.

### Botones / iconos
- Botones ya táctiles (V4.2.3); el dashboard ahora usa `Button` primario/`outline frosted` (no botones ad-hoc navy).
- **Rail icons** refinados: inactivo **sin caja** (monoline limpio, hover sutil), activo con contenedor + ring cian.

### Qué se conserva (V4.2.3/.4)
AppRail (layout, hover-expand, pin, CTA Asistente), theme toggle, tipografía (Inter/Space Grotesk/JetBrains),
iconografía monoline global, OperationsHeader navy (ahora como acento), KPI honestos, rutas/lógica.

### Pendiente (V5)
- Restyle profundo de tablas internas (Workspace/Catálogo) con el nuevo sistema de superficies.
- Variantes formales de card (primary/secondary/action/status) como API; extender `DashMetric`/IconChip a más módulos.

### QA (V4.2.5)
typecheck 0 · lint 0 · tests `premium-system`/`theme-modes` ok · suite **2122/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.
Sin tocar lógica/DB/Auth/envs/cálculos/exports/datos · Workspace V3C/companion/Sin APU/rutas intactos · no `-1rqh`.

---

## V4.2.6 — Reference-driven dashboard redesign

Iteración guiada por referencias (B = grid de cards con jerarquía; C/D = soft-UI + botones azules;
F = card system; G = icon-chips cápsula). **Nota:** las imágenes no llegaron visibles; se trabajó contra
las descripciones detalladas de cada referencia.

### Tipografía (corregida)
- **Revertida la display editorial** (Space Grotesk se sentía "documento"). Ahora **Inter es la única
  familia UI** (limpia, tecnológica, buen peso de producto); `font-display` = Inter en peso alto + tracking
  apretado (misma familia, no editorial). Datos en JetBrains Mono.

### Dark mode (rearmado a slate-charcoal con elevación)
- `--c-app #0d0f14` (slate-charcoal, navy profundo suave) · `--c-surface #161922` (claramente elevada) ·
  soft `#1d212c` · muted `#262b38` · line `#2d3340` · content `#e8eaf0` · muted `#98a0af`. Más balance y
  elevación que el neutro plano de V4.2.5; acentos azul/cian dosificados. AG Grid/glass realineados.

### Dashboard (recomposición modular — refs B/F)
- **ZONA 1 = grid `lg:grid-cols-3`**: card **PRIMARY** (resumen + Total héroe + barra de composición +
  métricas integradas hairline) ocupa **2/3**; card **CHART compacta** (Distribución por capítulo) ocupa
  **1/3** → el gráfico **ya no domina** la pantalla.
- "Capítulo de mayor peso" → `SurfaceCard variant=primary` con `IconChip` en cápsula.

### Card system (`components/shared/surface-card.tsx`)
- `SurfaceCard` con variantes **primary / metric / action / chart / status** (peso visual propio) +
  `ActionCard` (enlace con lift). Soft-UI: hairline + sombra muy suave (claro), borde fino (dark).

### Botones / iconos
- **Primario azul premium**: highlight interno (`inset`) + sombra de marca; hover eleva. (Secundario frosted
  y ghost de V4.2.3 se conservan.)
- **`IconChip` cápsula** (`shape="capsule"`, ref G) + ring sutil. Rail icons (V4.2.5) se conservan.

### Qué se conserva
AppRail (layout, hover-expand, pin, CTA Asistente), theme toggle, modo claro/oscuro/sistema, lógica del
dashboard/Workspace/companion/Sin APU, rutas.

### Pendiente (V5)
- Responsive fino del nuevo grid en mobile (refs E); variantes de card en más módulos; restyle profundo de
  tablas internas (Workspace/Catálogo) con el card system; revisar contraste Recharts en dark.

### QA (V4.2.6)
typecheck 0 · lint 0 · tests `premium-system`/`typography-system`/`theme-modes` ok · suite **2125/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.
Sin tocar lógica/DB/Auth/envs/cálculos/exports/datos · Workspace V3C/companion/Sin APU/rutas intactos · no `-1rqh`.

---

## V4.2.6 — Final Shell Polish (hotfix)

Hotfix puntual de shell sobre la misma rama (no rediseño). Correcciones de feedback del preview:

1. **Buscador topbar**: theme-aware (tokens `surface-soft`/`line`/`content`), **lupa clara** (`iconic-primary/70`),
   keycap `⌘K` discreto. Se entiende como input de búsqueda en claro y oscuro (antes usaba literales claros → "raro" en dark).
2. **Overlay / command palette**: dim **neutro sutil** (`bg-black/30 backdrop-blur-[3px]`) en vez del tinte navy
   (`bg-iconic-ink/30`); modal y pie **theme-aware** (`bg-surface`/`border-line`). Solo el panel centrado, sin franja translúcida rara.
3. **CTA Asistente del rail**: **centrado en estado colapsado** (`justify-center px-0`); ok en hover/pinned. Indicador de modo también centrado.
4. **Botón flotante derecho del Asistente: ELIMINADO** (era redundante con topbar + rail). El companion cerrado/minimizado
   ya **no renderiza launcher** (`return null`); abre por el evento `quote-companion:open` (rail/topbar). Lógica/eventos del companion intactos.
5. **Color del rail navy → graphite premium**: fondo `rgba(32,36,44)→(24,28,35)` (dark-gray, no navy saturado),
   borde `white/10`. Acentos azules vivos se conservan (item activo, hover, CTA Asistente, indicadores).

Conserva: estructura del AppRail, hover-expand, pin, CTA abajo, dashboard/cards de esta oleada, toggle, navegación, Workspace V3C/companion/Sin APU/exports.

### QA (V4.2.6 Shell Polish)
typecheck 0 · lint 0 · tests `premium-system`/`quote-companion-in-place` ok · suite **2127/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.

---

## V4.2.7 — Dashboard Information Architecture Redesign

Reorganización de la arquitectura de información del **Dashboard** (solo UI; sin lógica/datos).
**Nota:** imágenes A/B no llegaron visibles; se trabajó contra la estructura objetivo detallada (A–D).

### A. Bloque superior (se conserva de V4.2.6)
Card PRIMARY "Centro de mando" (2/3, con métricas integradas) + card CHART compacta "Distribución por capítulo" (1/3).

### B. Operación unificada + Notas
- **Antes**: 3 cards sueltas (Capítulo de mayor peso / Versiones emitidas / Precios por revisar).
- **Ahora**: **un solo panel** (`SurfaceCard`) dividido en 3 columnas con **divisores sutiles** (`divide-x`):
  Capítulo de mayor peso (barra+%), Versiones emitidas (cifra), Precios por revisar (cifra + enlace al centro
  de revisión **tras `isAuthorizedForSavings`**). El conteo real se conserva (`countPendingResourcePriceObservations`).
- **Card "Notas rápidas"** nueva (`components/shared/notes-card.tsx`): UI shell premium con ejemplos estáticos
  (Revisar proveedor acero · Validar AIU · Llamar a Homecenter) + "+" marcado "próximamente". **Sin backend ni flujo falso.**

### C. Monitoreo automático de precios (consolidado)
- **Antes**: 4 KpiCards sueltas. **Ahora**: **un panel** con los 4 indicadores como tira hairline
  (Fuentes monitoreadas / Cambios pendientes / Fuentes con error / Fuentes vencidas, con tono semántico) +
  **subzona de tiempo** a la derecha: anillo con reloj + **"Última revisión"** (real, `monitoringSummary.lastRunAt`) +
  "Próxima revisión: automática (programada)". **No se fabricó countdown** (no existe timestamp de próxima corrida
  en el summary; un countdown real requeriría backend fuera de alcance — honesto).

### D. Workflow strip (reemplaza accesos rápidos)
- **Antes**: 7 cards de acceso. **Ahora**: **franja horizontal** (`components/shared/workflow-strip.tsx`) con nodos
  conectados (icono+label), navegables a rutas existentes; "Cotizar con asistente" marcado **"Actual"**.
  Responsive con scroll horizontal en pantallas pequeñas.

### Se conserva
AppRail/topbar/command-palette, claro/oscuro/sistema, card system (SurfaceCard), navegación, datos reales
(topSlice, versiones, precios pendientes, monitoringSummary), companion, Workspace V3C. Secciones "Pendientes
y alertas" y ahorros NO se tocaron.

### Pendiente (V5)
- Backend real de notas (hoy shell); timestamp de "próxima corrida" para countdown real; responsive fino del
  panel Operación/monitoreo en mobile; consolidar "Pendientes y alertas" si se desea menos repetición.

### QA (V4.2.7)
typecheck 0 · lint 0 · tests `premium-system`/`workspace-route-config`/`ui-and-invariants` ok · suite **2129/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.

---

## V4.2.8 — Dashboard target match (cierre de deltas)

Se compararon las capturas reales **ACTUAL** (`088ccfab…png`) vs **TARGET** (`f7678e52…png`) leídas desde
`D:\ICONIC\SOFTWARE PRESUPUESTOS\docs\design-references\uix\` (fuera del repo; NO se commitean: muestran datos
financieros). **Hallazgo:** la composición V4.2.7 ya coincidía ~90% con el target (mismo bloque superior,
Operación unificada, Notas, monitoreo, workflow). Se cerraron 3 deltas concretos hacia el target:

1. **Monitoreo — anillo countdown**: la subzona de tiempo pasó de un reloj + texto a un **anillo circular**
   (SVG donut) con **"02h 18m"** al centro + icono `CalendarClock` + "Próxima revisión en" + "Última: {lastRunAt real}".
   ⚠️ El "02h 18m" es **valor ilustrativo** (el summary no tiene next-run; honesto, igual que el mock del target).
2. **Workflow strip → timeline**: nodos **circulares** (`rounded-full`, borde 2px, actual relleno azul) sobre
   una **línea conectora** con leve degradado; "Cotizar con asistente" = "Actual". Menos "grilla de botones", más timeline.
3. **Notas rápidas**: footer cambió a **"Ver todas las notas"** (estilo enlace, `title` "próximamente"; sin nav
   falsa) + dots azules más marcados.

Lo demás del dashboard NO se rehizo (ya coincidía). AppRail/topbar/command-palette/tema sin cambios.

### QA (V4.2.8)
typecheck 0 · lint 0 · suite **2129/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio. Sin lógica/DB/datos · no `-1rqh`.

---

## V4.2.13 — Floating Workflow Companion

**Objetivo:** versión compacta y flotante del workflow strip del Dashboard que acompaña al usuario fuera del
dashboard (saber dónde está, qué módulo sigue, navegar rápido) sin volver al Dashboard.

- **Componente**: `components/shared/floating-workflow-dock.tsx` (`FloatingWorkflowDock`, client). Montado en
  `(dashboard)/layout.tsx` → aparece en todas las rutas del dashboard y **se auto-oculta en `/dashboard`** (la barra grande ya existe).
- **Visual**: dock `fixed bottom-4 left-1/2`, `glass` (claro/oscuro), borde sutil, sombra; nodos redondos, íconos
  monoline, paso activo azul vivo (relleno) + label, inactivos muted (label desde `xl`). No es una card gigante.
- **Pasos** (7, mismos del dashboard): Cotizar con asistente `/quote` · Proyectos `/projects` · Catálogo `/catalog` ·
  Proveedores `/catalog/providers` · Inteligencia de precios `/catalog` · Monitoreo `/catalog/monitoring` ·
  Revisión `/catalog/prices/review`. **Rutas reales** (verificadas); sin inventar.
- **Detección de paso** (específico→general): review→Revisión, monitoring→Monitoreo, providers→Proveedores,
  catalog→Catálogo, quote→Cotizar, `*/workspace`→Cotizar (presupuesto activo), projects/estimates→Proyectos.
- **Minimizar/restaurar**: chevron → pill "Flujo"; persiste en `localStorage` (`iconic-workflow-dock-collapsed`).
- **Responsive**: solo `lg+` (oculto en mobile para no tapar); labels inactivos desde `xl`; ancho `min(56rem, 100vw-8rem)` con scroll interno.
- **Assistant**: NO agrega botón de Asistente; el primer nodo solo **navega** a `/quote` (no dispara el evento del companion).
- **Riesgos/pendientes**: en `/workspace` el dock flota sobre el área inferior (minimizable si estorba); mobile sin dock (futuro: dock de íconos).

### QA (V4.2.13)
typecheck 0 · lint 0 · tests `floating-workflow-dock` 5/0 · suite **2129/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.
