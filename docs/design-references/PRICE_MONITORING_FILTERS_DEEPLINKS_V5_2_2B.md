# PRICE_MONITORING_FILTERS_DEEPLINKS_V5_2_2B — Filtros + deep-links (server-side)

## Objetivo
Filtrar `/catalog/monitoring` por estado y conectar el flujo (Monitoring↔Review↔Price Intelligence↔Catálogo),
**server-side**, con helpers neutros y datos existentes. Sin backend, sin tocar cron/actions, sin isla client.

## Filtros implementados (server-side)
`status` en `searchParams`: `all` (default) · `healthy` (Saludables) · `overdue` (Atrasados) · `error` (Con error) ·
`paused` (Pausados). Status inválido → fallback `all`. Derivados de `getMonitorTargetStatus` (datos reales
enabled/isOverdue/hasFailureAlert/consecutiveFailures).

## Filtros NO implementados (a propósito)
`changes=pending` como filtro de tabla (es métrica de **summary**, no por target → se mantiene como deep-link a
`/catalog/prices/review`). `search` libre, `status=active` como key única, `supplier=missing`: diferidos.

## Deep-links
- KPI **Atrasadas** → `/catalog/monitoring?status=overdue` · **Pausadas** → `?status=paused` · **Con error** → `?status=error`.
- KPI **Cambios pendientes** → `/catalog/prices/review` (conservado).
- **Pills** `<Link>` server-rendered: Todos/Saludables/Atrasados/Con error/Pausados (con conteos + estado activo).
- **`/catalog` → `/catalog/monitoring`**: acción "Monitoreo" en el header del catálogo.
- **`/catalog/prices/review` → `/catalog/monitoring`**: enlace en el breadcrumb.
- Target → `/catalog/resources/[id]/price-intelligence` (conservado).

## Helper neutro actualizado (`lib/pricing/monitor-ui.ts`)
Añadidos (PUROS, sin `'use client'`): `MonitorFilterStatus`, `parseMonitorStatus` (normaliza/fallback all),
`MONITOR_FILTER_LABELS`, `filterTargetsByStatus` (tolerante a null/lista vacía), `getMonitorStatusCounts`.

## Server/client safety (lección P0)
- Filtrado **100% server-side** en `monitoring/page.tsx` (Server Component): lee `searchParams`, filtra con el helper
  neutro, renderiza **pills `<Link>`** (sin `useState`, **sin isla client nueva**).
- `monitor-controls.tsx` (`'use client'`) se sigue importando **solo como componentes** (RunNow/Toggle/Cadence).
- Tests guard: el page no declara `'use client'` ni importa helpers de monitor-controls; helpers en módulo neutro.

## Empty state filtrado
Si el filtro no arroja targets: "No hay fuentes {estado}" + "Cambia el filtro para ver otras fuentes monitoreadas"
(no tabla vacía sin contexto). Si no hay ninguna fuente: empty state original.

## Acciones conservadas (sin tocar lógica)
RunNowButton, TargetToggleButton, CadenceForm, enlaces a price-intelligence, permisos/roles. Sin cambios.

## Qué NO se tocó
cron/actions/repo del monitor, Supabase/RLS/migrations/Auth/envs/Vercel, read-model, cálculos, exports,
`unit_price_snapshot`, sync, aprobación, scraper, dashboard countdown, APU/Workspace/Cantidades, `construction-ops-1rqh`.
(No se tocó `globals.css` ni archivos no relacionados presentes en el working tree.)

## Validación requerida
⚠️ **Validación manual AUTENTICADA del preview antes de merge** (no solo 307): `/catalog/monitoring` +
`?status=all|healthy|overdue|error|paused`, pills + estado activo, KPIs clicables, empty state filtrado, deep-links a
review/price-intelligence, `/catalog` (acción Monitoreo), `/catalog/prices/review` (enlace), `/apu`. Light + dark.

## QA
typecheck 0 · lint 0 · tests `monitor-ui` 18/0 · suite verde · build 0 (`/catalog/monitoring` compila) · gm 22/22 · diff-check limpio.

## Pendientes V5.2.2c
Lectura/timeline de corridas y errores + price-intelligence (historial sobre observaciones reales).
