# V5_4_1_REAL_MONITORING_COUNTDOWN_DASHBOARD — Countdown real en dashboard

## Objetivo
Reemplazar el countdown ilustrativo/hardcoded del dashboard (`02h 18m`) por dato **real** derivado del próximo target
de monitoreo. Backend/read-model **aditivo** + UI. **Sin migración, sin RLS nueva.**

## Datos reales usados
`price_monitor_targets`: `next_check_at`, `enabled`, `organization_id` (+ joins `resources(code,name)`,
`suppliers(name)` para la etiqueta). Todo **ya existente**.

## Campos agregados a `MonitoringSummary` (aditivo, no rompe consumidores)
- `nextReviewAt: IsoDateTime | null` — min `next_check_at` entre targets `enabled`.
- `nextTargetId: Uuid | null`.
- `nextTargetLabel: string | null` — `"<resourceCode> · <supplierName>"` (lo que haya).

## Query/read-model (db-repository.getMonitoringSummary)
`from('price_monitor_targets').select('id, next_check_at, resources(code,name), suppliers(name)')`
`.eq('organization_id', orgId).eq('enabled', true).order('next_check_at', { ascending: true }).limit(1).maybeSingle()`.
- **Org-scoped** (defensa de aplicación) + RLS existente.
- Si **no hay targets activos** → `null` en los 3 campos.
- Si el **próximo está vencido** (`next_check_at <= now`) → `nextReviewAt` queda en pasado y la UI muestra "Atrasada" (no countdown falso).

## Por qué NO requiere migración
`next_check_at` y `enabled` ya existen en `price_monitor_targets` (migración `20260612090000_price_monitoring.sql`).
Índice `pmt_due_idx` sobre `next_check_at WHERE enabled` ya cubre la selección. No se añade entidad ni columna.

## Por qué NO requiere RLS nueva
`price_monitor_targets` ya tiene RLS FORCE + policy `pmt_select_own_org` (SELECT org-scoped por `app.current_org()`).
La lectura nueva es un SELECT más sobre la misma tabla; el repository además filtra por `viewer.organizationId`.

## Fallback tolerante
- La sub-query del próximo target va en **try/catch**: si falla, devuelve `null` y **NO tumba** el summary.
- El dashboard ya consumía `getMonitoringSummary` con `monitoringSummary = null` por defecto (tolerante) y
  `export const dynamic = 'force-dynamic'`; ambos se conservan. Si el summary falla, el dashboard sigue renderizando.
- UI: `formatCountdown(null)` → "Sin revisión programada".

## Helper neutro (server/client safety, lección P0)
`lib/pricing/monitor-ui.ts` (SIN `'use client'`): `formatTimeUntil(nextReviewAt, now)` + alias `formatCountdown`.
PURO, request-time (sin `setInterval`, sin isla client). Reglas: null/inválido → "Sin revisión programada";
`<= now` → "Atrasada"; futuro → "en 18m" / "en 2h 14m" / "en 1d 3h". El dashboard (Server Component) importa el helper
del módulo neutro; **no** importa de módulos `'use client'`.

## Qué cambió en el dashboard
`app/(dashboard)/dashboard/page.tsx`: el texto `02h 18m` hardcoded → `formatCountdown(monitoringSummary.nextReviewAt)`
+ `nextTargetLabel` (si existe) + "Última: <lastRunAt>". El anillo SVG queda **decorativo** (ya no implica un tiempo falso).

## Confirmación: hardcode eliminado
`02h 18m` ya no aparece en `dashboard/page.tsx` (guard en tests).

## Qué NO se tocó
migrations, Supabase remoto, RLS/policies, Auth/envs/secrets, Vercel config, cron logic, scraper/checkTarget,
server actions, review center, aprobación de precios, BOQ/APU, exports, snapshots, `unit_price_snapshot`, sync BOQ,
`construction-ops-1rqh`. Price Intelligence (panel/filtros/timeline) y campos existentes del summary intactos.

## Tests
`tests/unit/pricing/monitor-ui.test.ts`: formatCountdown/formatTimeUntil (null/inválido/vencido/ahora/min/horas/días),
fixture summary expone el contrato nuevo determinista, guard "dashboard sin 02h 18m", guard server/client.
`monitor/ui-and-invariants.test.ts` sigue verde (contrato aditivo).

## QA
typecheck 0 · lint 0 · tests monitor-ui 31/0 (+ invariants 15/0) · suite verde · build 0 (`/dashboard` compila) · gm 22/22 · diff-check limpio.

## Validación requerida
⚠️ **Validación manual AUTENTICADA del preview antes de merge** (no solo 307): `/dashboard` (countdown real o "Sin
revisión programada", sin `02h 18m`), `/catalog/monitoring` + `?status=…`, `/catalog/prices/review`, `/catalog`, `/apu`.
Light + dark; AppRail/workflow dock/assistant; V5.2.2b/c intactos.

## Pendientes V5.4.2+ (backend)
Notas reales (tabla `quick_notes` + RLS + actions), detalle por target dentro de la corrida, historial paginado. Requieren migración/decisión de privacidad.
