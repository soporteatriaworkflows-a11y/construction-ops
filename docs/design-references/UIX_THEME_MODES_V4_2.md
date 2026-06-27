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
