# UI / Branding ICONIC V1 — Construction Ops

Estado: implementado en `feature/ui-branding-iconic-v1` (sin merge a main, sin
deploy). Refresh **visual** del MVP liberado; **no** cambia lógica de negocio,
cálculos, Decimal.js, RLS, migraciones ni datos.

## Objetivo
Que la app deje de verse blanca/plana/genérica y se perciba dinámica, profesional
y alineada con Grupo ICONIC, conservando legibilidad operativa y preparación
multi-tenant ligera.

## Naming visible
- **Producto/módulo:** "Presupuestos".
- **Workspace/tenant activo:** "Grupo ICONIC".
- **Descriptor:** "Gestión de presupuestos de obra".
- "Construction Ops" permanece solo como nombre técnico interno (repo, metadata de
  exports, variables) — **no** en la experiencia de usuario (sidebar, título del
  navegador y login migrados).

## Estrategia producto vs workspace (multi-tenant ligero)
Fuente única `apps/web/lib/branding/workspace.ts` (`Workspace`: productName,
workspaceName, descriptor, logoFull, logoSymbol, initials, theme).
`getActiveWorkspace()` hoy devuelve Grupo ICONIC; mañana puede resolver branding
por organización sin tocar vistas. Las vistas consumen el workspace, no constantes.

## ADN visual aplicado
Sobrio, técnico y premium. Azul como estructura (sidebar ink, hero), blanco como
respiración (cards), gris claro como soporte (`bg-iconic-gray` del shell),
azul noche para jerarquía (`#020148`), **cian solo como acento** (barra activa de
nav, detalles del hero/login). Curvas amplias en login y hero. Sin degradados
excesivos ni cian dominante; sin convertir la app en landing.

## Paleta oficial / tokens
CSS vars en `globals.css` (`:root`) y Tailwind (`iconic.*` + `brand.*`):
`--iconic-primary #005DD6`, `--iconic-cyan #00B8FF`, `--iconic-ink #020148`,
`--iconic-graphite #1B1F3E`, `--iconic-soft-blue #C7DCED`, `--iconic-gray #F2F4F7`,
`--iconic-white #FFFFFF`. `brand.500=#005DD6`, `brand.900=#020148`.

## Assets encontrados y usados
- Guía visual oficial **presente** en el repo: `docs/branding/ICONIC_EXPORTS_VISUAL_GUIDE.pdf`.
- Logos oficiales (reutilizados, **no** redibujados):
  - `apps/web/public/branding/iconic/grupo-iconic-logo-full.png` → login (logo completo).
  - `apps/web/public/branding/iconic/grupo-iconic-logo-symbol.png` → avatar del
    workspace (sidebar, topbar chip). Vía `next/image`.
- No se generaron logos con IA ni se extrajeron de capturas.

## Componentes modificados
- **Tokens/theme:** `tailwind.config.ts`, `app/globals.css` (CSS vars, body
  `bg-iconic-gray`, focus ring ICONIC).
- **Shell:** `app/(dashboard)/layout.tsx` (sidebar ink + topbar con chip). `app/layout.tsx`
  (título). Nuevos: `components/shared/workspace-brand.tsx`, `components/shared/sidebar-nav.tsx`.
- **Login:** `app/(auth)/layout.tsx` (panel navy + curva + cian), `components/auth/auth-card.tsx`.
- **Dashboard:** `app/(dashboard)/dashboard/page.tsx` (hero con curva/bloque azul + cian; KPI principal en ink).
- **Reutilizables:** `components/ui/{button,badge,card}.tsx` (primario ICONIC, hover),
  `components/shared/{empty-state,page-header}.tsx` (estado vacío branded; header navy + acento).

## Empty states
`EmptyState` rediseñado (tile de icono branded + jerarquía navy). Lo heredan
automáticamente dashboard sin proyectos y todas las vistas que lo usan
(proyectos/presupuestos/catálogo/cantidades/planeación/versiones).

## Decisiones responsive básicas
Sidebar fijo en `lg`; el panel de marca del login se oculta en pantallas pequeñas
(`hidden lg:block`) y queda solo el card. Topbar sticky con descriptor oculto en
móvil (`hidden sm:inline`).

## Preparación multi-tenant ligera
`Workspace` + `WorkspaceTheme` + `getActiveWorkspace()` permiten white-label por
tenant (nombre, avatar, tokens) sin refactor de vistas. Tokens centralizados.

## Deuda visual futura (no bloqueante)
- Cablear `getActiveWorkspace(viewer)` → branding por organización (hoy estático).
- Encabezados de tabla en navy/ink: las tablas son inline por página; se dejó la
  densidad/legibilidad actual y se difiere un componente de tabla compartido para
  no tocar ~10 páginas con riesgo. Las tablas ya heredan badges/botones ICONIC.
- Migrar `text-blue-700` inline (total general/totales) a `text-iconic-primary`.
- Metadata de exports sigue "Construction Ops" (interno).
- Sin tema oscuro; sin librería de iconos nueva (se usó `lucide-react` existente).

## Guía PDF
`docs/branding/ICONIC_EXPORTS_VISUAL_GUIDE.pdf` ya existe en el repo (no fue
necesario crear un sustituto). Esta oleada usó esa guía + los lineamientos del
prompt como fuente de verdad.
