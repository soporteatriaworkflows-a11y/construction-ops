# ICONIC_OPS_V5_5_1A_OPERATIONAL_REVIEW_CONSOLE

# V5.5.1a Operational Review Console

## Scope

Adds a read-only operational console to `/catalog/prices/review` so internal users can prioritize price review work without changing the approval/rejection workflow.

## Location

- Page: `apps/web/app/(dashboard)/catalog/prices/review/page.tsx`
- Client UI: `apps/web/app/(dashboard)/catalog/prices/review/_components/operational-review-console.tsx`
- Read-model: `apps/web/server/pricing/review/db-repository.ts`

The existing review table remains below the console. The existing bulk approve/reject actions stay in `ReviewTable` and `actions.ts` only.

## Read-Model

`getOperationalReviewConsole(viewer, limits)` is added to `PriceReviewRepository`.

It reads through the existing RLS-bound Supabase SSR client and filters every tenant-scoped query with `organization_id = viewer.organizationId`.

Tables used:

- `resource_price_observations`
- `resources`
- `price_observation_batches`
- `suppliers`
- `price_monitor_results`
- `price_monitor_targets`

No legacy `price_observations` or `supplier_products` source is used.

## KPIs

Implemented:

- pending observations
- pending with warnings
- pending created by monitor
- resources without approved price in the bounded operational scan
- stale approved prices in the bounded operational scan
- failing or overdue monitor targets in the bounded operational scan

Coverage KPIs are explicitly bounded by `resourceScan` to avoid loading the complete catalog.

## Lists

Implemented read-only lists:

- `Revision urgente`: pending with warnings, monitor-created changes, high derived delta, missing supplier.
- `Cobertura de catalogo`: resources without approved price, stale approved price, observations without supplier.
- `Salud de fuentes`: overdue/failing targets and recent monitor results with warnings.
- `Actividad reciente`: recent approved/rejected observations for operator context.

Each list is limited and shows copy when only the first critical signals are shown.

## Filters

Client-side filters over the already-loaded console payload:

- severity: all, action required, warning, informational
- supplier
- resource search

Status/origin filters are intentionally left for a later pass to keep V5.5.1a small.

## Severity

Severity is derived server-side only:

- `action_required`: pending warning, monitor change, high delta, missing approved, failing target.
- `warning`: stale price, missing supplier, overdue target, monitor warning.
- `informational`: recent approved/rejected activity.

No DB column, SLA, owner, snooze or dismiss state is introduced.

## Delta

Delta is calculated server-side against the latest approved observation before the current observation date. It is labeled as `Comparacion derivada` and falls back to `Sin precio anterior aprobado`.

This is not an exact historical baseline and does not claim to be the baseline used by any monitor run.

## Privacy

The route keeps the existing internal/management guard. Client/site roles do not load observations, batches or console data. The console component receives data only after the server-side role check.

## Out of Scope

- migrations
- RLS changes
- Supabase Cloud / db push
- Vercel env changes
- approval/rejection workflow changes
- BOQ/APU/exports
- ownership/responsibles
- SLA
- snooze/dismiss
- exact audit trail
- exact historical baseline