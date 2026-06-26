# UIX_COHERENCE_COMPLETION_V4_1 — Cierre de costuras del recorrido

## Objetivo
Cerrar las costuras visuales que quedaron tras V4 en el recorrido principal
**Proyectos → Proyecto → Alcance → Presupuesto → Workspace**, para que el flujo
se sienta continuo. Sin restyle profundo de tablas internas (eso es V5).

## Pantallas intervenidas y costura cerrada
| Ruta | Antes | Ahora |
|---|---|---|
| `projects/[id]` | `PageHeader` plano | `OperationsHeader` "Proyecto · Centro operativo" + KPI band (Alcances/Activos/Archivados) |
| `projects/[id]/scopes/[scopeId]` | `PageHeader` plano | `OperationsHeader` "Alcance · Control de presupuesto" + KPI band (Presupuestos/Activos/Archivados) |
| `estimates/page.tsx` | `PageHeader` plano | `OperationsHeader` "Presupuestos · Versiones y control" + KPI band |
| `settings/page.tsx` | `PageHeader` plano **encima** del hero navy (redundante) | Se elimina el header plano; el **hero navy** existente queda etiquetado "Settings · Configuración operativa" (un solo elemento navy) |
| `dashboard/page.tsx` | estados error/vacío con `PageHeader` plano | `OperationsHeader` "Panel · Centro de control" (el cuerpo command-center NO se tocó; ya tenía su hero navy "Centro de mando") |

## Contraste sobre navy (nuevo, reutilizable)
- **`OperationsHeaderAction`** (en `components/shared/operations-header.tsx`): acción legible sobre la
  barra navy. `primary` = superficie blanca + texto ink (alto contraste); `secondary` = borde/texto claros.
  Aplicado como patrón en `projects/page.tsx` ("Nuevo proyecto"). Los botones azules llenos heredados de
  V4 quedan funcionales (texto blanco); migrarlos a esta variante es trabajo incremental (pendiente menor).

## Archivos modificados
- `components/shared/operations-header.tsx` (+`OperationsHeaderAction`).
- `app/(dashboard)/projects/[id]/page.tsx`, `…/scopes/[scopeId]/page.tsx`, `estimates/page.tsx`,
  `settings/page.tsx`, `dashboard/page.tsx`, `projects/page.tsx`.
- Tests: `tests/unit/components/operations-shell.test.ts` (+adopción V4.1 + OperationsHeaderAction),
  `tests/unit/dashboard/db-mode-routes.test.ts` (CTA /projects/new vía OperationsHeaderAction).
- Docs: este archivo, `DESIGN.md` §12.c, `HANDOFF_LOG.md`.

## Qué NO se tocó
Supabase, RLS, policies, migrations, Auth, envs/secrets, Vercel config, cálculos BOQ/APU, exports,
`unit_price_snapshot`, datos reales, RPCs, read-model, permisos, **Workspace V3C**, companion, filtro
Sin APU, tablas internas profundas, `construction-ops-1rqh`. Sin columnas eliminadas, sin datos/botones
inventados, sin dark mode/morados/neón. KPIs solo con datos existentes.

## QA
typecheck 0 · lint 0 · tests `operations-shell` 15/0 + `db-mode-routes` ok · suite **2101/0 (+42 skip)** ·
build 0 · gm 22/22 · `git diff --check` limpio.

## Pendientes para V5 (restyle profundo)
- Tablas internas premium (Catálogo `CatalogExplorer`, capítulos del detalle, grupos de Cantidades).
- Dashboard command-center: refinamiento de data-viz (no header).
- Migrar los botones de acción heredados de V4 (apu/catalog/quantities/planning) a `OperationsHeaderAction`.
- KPI bands con conteos más ricos donde haya datos (cronograma: hitos/en riesgo; cantidades: conflictos).
- Responsive fino de las bandas navy en pantallas medianas.
