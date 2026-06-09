# UI / Branding Wave V1 — Construction Ops

Estado: implementado en `feature/ui-branding-wave-v1` (sin merge a main, sin deploy).
Refresh **visual** del MVP ya liberado; **no** cambia lógica de negocio, cálculos,
RLS, migraciones ni comportamiento de datos.

## Objetivo
Que la app se vea sólida, dinámica y alineada con ICONIC, manteniendo el producto
neutral y preparado para multi-tenant. El nombre visible deja de ser
"Construction Ops".

## Naming visible
- **Producto/módulo:** "Presupuestos".
- **Workspace/tenant activo:** "Grupo ICONIC".
- "Construction Ops" permanece solo como nombre técnico interno (repo, comentarios,
  metadata de exports), **no** en la experiencia de usuario.

## Estrategia producto vs workspace (multi-tenant ready)
- Fuente única: `apps/web/lib/branding/workspace.ts` (`Workspace`: productName,
  workspaceName, tagline, logoSymbol, logoFull, initials, theme).
- `getActiveWorkspace()` hoy devuelve el workspace por defecto (Grupo ICONIC);
  mañana puede resolver branding por organización (nombre, avatar, tokens) sin
  tocar las vistas. Las vistas consumen el workspace, no constantes hardcodeadas.

## Paleta / tokens (ICONIC oficial)
Definidos en `tailwind.config.ts`:
- `brand.50…900` remapeado a la familia azul ICONIC (500 `#005DD6`, 900 navy `#020148`).
- `iconic`: `primary #005DD6`, `accent #00B8FF` (cian), `navy #020148`,
  `graphite #1B1F3E`, `soft #C7DCED`, `light #F2F4F7`.
- Espejo de la paleta de exports (`server/estimates/export/branding.ts`).

## Componentes / vistas afectadas
- **App shell** (`app/(dashboard)/layout.tsx`): sidebar navy ICONIC con
  `WorkspaceBrand`, navegación con estado activo (`SidebarNav`), top header con
  nombre de producto + tagline + chip del workspace; fondo `iconic-light`.
- **Login** (`app/(auth)/layout.tsx` + `components/auth/auth-card.tsx`): fondo navy
  con acento radial, logo + "Presupuestos" / "Grupo ICONIC", pie de marca.
- **Metadata** (`app/layout.tsx`): título `Presupuestos · Grupo ICONIC` (+ template).
- **Dashboard** (`app/(dashboard)/dashboard/page.tsx`): hero con degradado de marca.
- **Empty states** (`components/shared/empty-state.tsx`): tile de icono branded,
  jerarquía mejorada (impacta dashboard vacío, estimates/catalog/quantities/planning
  y todas las vistas que usan `EmptyState`).
- **Primitivas** (`components/ui/button.tsx`, `badge.tsx`, `card.tsx`): botón y
  badge primarios en azul ICONIC; cards con elevación sutil en hover.
- **Componentes nuevos:** `components/shared/workspace-brand.tsx`
  (`WorkspaceLogo`, `WorkspaceBrand`), `components/shared/sidebar-nav.tsx`.

## Logo / avatar usado
- Logos oficiales ya versionados: `public/branding/iconic/grupo-iconic-logo-symbol.png`
  (avatar del workspace) y `grupo-iconic-logo-full.png`. Renderizados con `next/image`.
- **No** se creó placeholder: el asset oficial ya existe en el repo. `initials: "GI"`
  queda como respaldo conceptual en la config.

## Empty states añadidos / mejorados
`EmptyState` ahora es branded (tile de icono + jerarquía). Las vistas que ya lo
usan (dashboard sin proyectos, listas vacías) heredan el nuevo aspecto sin cambios
de lógica. No se añadieron rutas ni estados nuevos de negocio.

## Preparación futura multi-tenant
- `Workspace` + `WorkspaceTheme` + `getActiveWorkspace()` permiten white-label por
  tenant (nombre, avatar y tokens) sin refactor de vistas.
- Tokens centralizados en Tailwind; el shell/login/hero consumen `iconic-*`.

## Deuda / pendientes (no bloqueantes)
- Tokens de tema por tenant aún estáticos (un solo workspace activo); falta el
  cableado `getActiveWorkspace(viewer)` → branding por organización.
- Metadata de exports (`author/creator` en PDF/XLSX) sigue diciendo
  "Construction Ops" (interno, fuera del alcance visual de la app).
- Sin tema oscuro; sin animaciones avanzadas; iconografía vía `lucide-react` ya
  instalada (sin librería nueva).

## Restricciones respetadas
Sin cambios de lógica/cálculos/RLS/migraciones/Supabase/Vercel/deploy; sin
BOQ_REORDER ni lineage_id; `main` intacta. Validado: typecheck/lint 0, 757 tests,
build OK, `git diff --check` limpio.
