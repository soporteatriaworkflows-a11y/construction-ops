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
