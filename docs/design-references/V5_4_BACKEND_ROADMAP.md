# V5_4_BACKEND_ROADMAP

Fase: `ICONIC_OPS_PRICE_INTELLIGENCE_CLOSEOUT_AND_V5_4_BACKEND_PLANNING`
Fecha: 2026-06-27
Proyecto: ICONIC OPS / Construction Ops

Este roadmap define el orden recomendado para pasar de Price Intelligence UI-only a backend real. Es diagnostico y plan: no autoriza implementacion, migraciones ni cambios en produccion.

## Recomendacion ejecutiva

Confirmacion: V5.4.1 Countdown real dashboard es el primer backend mas seguro.

Motivos:

- Bajo riesgo: usa tablas existentes y lectura org-scoped.
- No requiere migracion: `price_monitor_targets.next_check_at` ya existe y tiene indice parcial para targets enabled.
- No requiere RLS nueva: la lectura ya pasa por `price_monitor_targets` con RLS org-scoped y repository server-side.
- Elimina un dato ilustrativo/hardcoded visible en dashboard.
- Impacta una pantalla principal sin tocar cron, scraper, aprobaciones ni datos historicos.
- Permite validar el pipeline backend con una extension pequena de read/repository antes de abrir tablas nuevas.

## V5.4.1 Countdown real dashboard

### Objetivo

Reemplazar el countdown ilustrativo del dashboard por dato real derivado de targets activos de monitoreo.

### Backend actual relevante

- `price_monitor_targets.next_check_at`: fecha real de proxima revision por target.
- `price_monitor_targets.enabled`: solo targets activos deben competir para el proximo countdown.
- `price_monitor_targets.consecutive_failures`: fuente de alertas de error.
- `DbMonitorRepository.getMonitoringSummary()`: hoy expone `monitoredCount`, `activeCount`, `pausedCount`, `overdueCount`, `erroredCount`, `pendingChangesCount`, `lastRunAt`.
- Dashboard consume `getMonitorRepository().getMonitoringSummary(pricingViewer)`.

### Gap actual

`MonitoringSummary` no expone:

- `nextReviewAt`
- `nextTargetId`
- `nextTargetLabel`
- opcional: `nextTargetResourceCode`, `nextTargetSupplierName`

El dashboard renderiza un anillo con `02h 18m` hardcoded porque no tiene fuente real.

### Archivos que tocaria V5.4.1

- `apps/web/server/pricing/monitor/types.ts`
- `apps/web/server/pricing/monitor/db-repository.ts`
- `apps/web/server/pricing/monitor/fixture-repository.ts`
- `apps/web/app/(dashboard)/dashboard/page.tsx`
- Tests de monitor/dashboard relacionados, probablemente:
  - `apps/web/tests/unit/pricing/monitor-ui.test.ts`
  - `apps/web/tests/unit/pricing/monitor/ui-and-invariants.test.ts`
  - tests del repository/summary si existen o se agregan con fake client
  - `apps/web/tests/unit/dashboard/route-config.test.ts` o equivalente si se valida server safety

No deberia tocar:

- migrations
- RLS policies
- cron route
- monitor service/check-target/scraper
- server actions de monitoring
- approval/review center
- BOQ/APU/snapshots/exports

### Diseno minimo

Extender `MonitoringSummary`:

```ts
interface MonitoringSummary {
  monitoredCount: number;
  activeCount: number;
  pausedCount: number;
  overdueCount: number;
  erroredCount: number;
  pendingChangesCount: number;
  lastRunAt: IsoDateTime | null;
  nextReviewAt: IsoDateTime | null;
  nextTargetId: Uuid | null;
  nextTargetLabel: string | null;
}
```

Query segura:

- `from('price_monitor_targets')`
- filtro `organization_id = viewer.organizationId`
- filtro `enabled = true`
- order `next_check_at ASC`
- limit 1
- select minimo: `id`, `next_check_at`, `resources(code,name)`, `suppliers(name)`

Regla de presentacion:

- Si `nextReviewAt` es null: mostrar `Sin fuentes activas` o `Sin revision programada`.
- Si `nextReviewAt <= now`: mostrar `Ahora` / `Atrasada` y mantener `overdueCount`.
- Si futuro: calcular countdown sin hardcode.

Modulo del helper de formato (regla server/client, leccion P0):

- El helper del countdown debe vivir en el modulo NEUTRO existente `lib/pricing/monitor-ui.ts` (SIN `'use client'`),
  reutilizado por el Server Component del dashboard. NO definirlo en un componente client ni importarlo desde uno.
- Helpers sugeridos: `formatCountdown(nextReviewAt, now)` y/o `formatTimeUntil(nextReviewAt, now)` — PUROS y tolerantes a
  null/fecha invalida/pasado (devuelven etiqueta segura, nunca un valor inventado).

Verificacion previa obligatoria (antes de extender):

- Confirmar si `app/(dashboard)/dashboard/page.tsx` YA consume `getMonitorRepository().getMonitoringSummary(...)`.
  - Si ya lo consume: extender esa misma llamada (campos aditivos `nextReviewAt`/`nextTargetId`/`nextTargetLabel`).
  - Si NO lo consume: anadir la llamada de forma TOLERANTE (try/catch o equivalente), sin convertirla en dependencia dura del render.

Requisitos del dashboard (no romper la pantalla principal):

- Mantener `export const dynamic = 'force-dynamic'` en el dashboard (lectura request-time, sin prerender).
- Fallback tolerante: si la query/summary falla o devuelve null, el dashboard NO debe caer; muestra
  `Sin revision programada` (o estado vacio equivalente) y conserva el resto del panel.
- La extension de `getMonitoringSummary` debe ser org-scoped y tolerante: un fallo en la sub-query del proximo target
  no debe tumbar el summary completo ni el dashboard.

### Migracion

No requiere migracion porque:

- `next_check_at` ya existe en `price_monitor_targets`.
- `enabled` ya existe.
- indices existentes cubren seleccion de vencidas/proximas (`pmt_due_idx` sobre `next_check_at WHERE enabled`).
- No se agrega entidad ni persistencia nueva.

### RLS

No requiere RLS nueva porque:

- `price_monitor_targets` ya tiene RLS FORCE.
- `pmt_select_own_org` permite SELECT solo de `organization_id = app.current_org()`.
- El repository ya filtra por `viewer.organizationId` como defensa de aplicacion.

### Tests obligatorios

Concretos y verificables:

- **Summary selecciona el target enabled mas proximo**: `getMonitoringSummary` devuelve `nextReviewAt` = el `next_check_at`
  minimo entre targets `enabled=true` (+ `nextTargetId`/`nextTargetLabel` correspondientes).
- **Ignora pausados**: targets con `enabled=false` no compiten por el proximo (aunque su `next_check_at` sea menor).
- **Null si no hay activos**: sin targets `enabled`, `nextReviewAt`/`nextTargetId`/`nextTargetLabel` = `null`.
- **Vencidos sin countdown falso**: si el proximo `next_check_at <= now`, el dashboard muestra `Atrasada`/`Ahora`, nunca un countdown inventado.
- **Guard hardcode**: el source de `dashboard/page.tsx` NO contiene `"02h 18m"` (check de fuente, estilo de los guards existentes).
- **Guard server/client (P0)**: el dashboard (Server Component) NO importa helpers desde modulos `'use client'`; el helper
  de countdown vive en `lib/pricing/monitor-ui.ts` (modulo neutro, sin `'use client'`).
- **Fixture determinista**: `fixture-repository.ts` cumple el contrato nuevo con datos fijos (mismo `nextReviewAt`/target en cada corrida del test).
- **Helpers puros**: `formatCountdown`/`formatTimeUntil` toleran null/fecha invalida/pasado (tests unitarios en `monitor-ui.test.ts`).
- **Invariantes**: no se tocan cron, server actions, review center, BOQ/APU/exports (checks de no-regresion).

Ubicacion sugerida: extender `tests/unit/pricing/monitor-ui.test.ts` (helpers + guards) y
`tests/unit/pricing/monitor/ui-and-invariants.test.ts` (summary/fixture); agregar guard del dashboard donde corresponda
(p.ej. `tests/unit/dashboard/route-config.test.ts` o equivalente de fuente).

### Rutas a validar autenticadas

- `/dashboard`: debe mostrar countdown real o estado vacio segun datos.
- `/catalog/monitoring`: debe seguir cargando panel, filtros y runs timeline.
- `/catalog/monitoring?status=overdue`
- `/catalog/monitoring?status=paused`
- `/catalog/monitoring?status=error`
- `/catalog/prices/review`: no debe romper conteos de pendientes.

### Riesgo Vercel/prod

Riesgo bajo si se mantiene como lectura request-time. Riesgos concretos:

- Consulta extra en dashboard puede fallar y ocultar panel si no se mantiene tolerante a fallo.
- Diferencia de zonas horarias: `next_check_at` es timestamptz; comparar/formatear siempre desde ISO.
- Cache/prerender: dashboard debe seguir `dynamic = 'force-dynamic'`.

## V5.4.2 Notas reales minimas

### Objetivo

Convertir `NotesCard` de ejemplos estaticos a notas reales operativas.

### Motivo

Valor operativo alto, pero requiere backend completo: migracion, RLS, repository, server actions, tests y decision de privacidad.

### Diseno minimo propuesto

Tabla `quick_notes`:

- `id uuid primary key default gen_random_uuid()`
- `organization_id uuid not null references organizations(id) on delete cascade`
- `project_id uuid null references projects(id) on delete cascade`
- `estimate_id uuid null references estimates(id) on delete cascade`
- `body text not null`
- `status text not null default 'active' check in ('active','archived')`
- `created_by uuid not null references profiles(id) on delete restrict`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `archived_at timestamptz null`
- `archived_by uuid null references profiles(id) on delete set null`

RLS minimo:

- SELECT: miembros internos de la org; clientes sin acceso por defecto salvo decision explicita.
- INSERT: roles internos autorizados (`admin`, `gerencia`, `presupuestos`, `compras`, tal vez `obra`).
- UPDATE/archive: creador o management/internal segun decision.
- DELETE: denegado; archivar en vez de borrar.
- WITH CHECK: `organization_id = app.current_org()`, `created_by = app._auth_uid()`, project/estimate deben pertenecer a la org.

Server actions:

- `createQuickNoteAction`
- `archiveQuickNoteAction`

Repository:

- `listQuickNotes(viewer, { projectId?, estimateId?, limit })`
- `createQuickNote(viewer, input)`
- `archiveQuickNote(viewer, noteId)`

Riesgo principal: privacidad. Las notas pueden contener informacion interna, negociaciones, proveedores o criterio financiero. Por defecto no exponer a `client`.

## V5.4.3 Historial runs por target

### Objetivo

Profundizar el timeline usando `price_monitor_results` sin nueva tabla inicial.

### Diseno MVP

- `listRunResults(viewer, runId, limit)` en `MonitorRepository`.
- Join con `price_monitor_targets`, `resources`, `suppliers`.
- Mostrar por resultado: target, recurso, proveedor, status, checkedAt, detectedPrice si rol autorizado, warnings, observationId.
- Limite/paginacion obligatoria.

### Migracion

No requerida para MVP. Puede requerirse mas adelante si se quiere retencion, snapshots enriquecidos de recurso/proveedor al momento de la corrida o logs descargables.

### Riesgo

Volumen y privacidad de precios detectados. Mantener limites y proyeccion por rol.

## V5.4.4 Price Intelligence source/history

### Pregunta de producto

Decidir si basta con `resource_price_observations` append-only o si se necesita una tabla de eventos/deltas.

### Opciones

- Sin migracion: timeline basado en observations + batches + monitor results + bulk actions.
- Con migracion: `price_observation_events` para eventos de estado, delta, reviewer note, retry/log.

### Vencido autoritativo

Hoy `isStale` se calcula runtime desde `valid_until` o `approved_at + 30 dias`. Persistir `expired` requeriria job/proceso y decision sobre si cambia estado historico automaticamente.

## Que NO implementar todavia

- No tocar Supabase remoto.
- No crear migrations hasta que V5.4.1 cierre y V5.4.2 tenga decision de privacidad.
- No tocar RLS/policies sin contrato de tabla.
- No tocar cron logic, scraper, fetcher, validation adapters ni `checkTarget`.
- No tocar aprobacion nueva de precios ni bulk review.
- No tocar BOQ/APU, formulas, exports, `unit_price_snapshot`, sync BOQ ni RPCs.
- No tocar Vercel config/envs/secrets.
- No tocar `construction-ops-1rqh`.

## Como evitar romper Price Intelligence recien cerrado

- Mantener V5.4.1 como lectura pura.
- Extender tipos de forma aditiva, nunca renombrar campos existentes.
- Mantener fallback tolerante: si summary falla, dashboard no cae.
- Tests que aseguren que `/catalog/monitoring` sigue importando helpers neutrales y no client modules.
- No modificar server actions ni cron para el countdown.
- Validar rutas principales autenticadas antes de merge.

## Prompt seguro para implementar V5.4.1

```text
Implementa ICONIC_OPS_V5_4_1_REAL_MONITORING_COUNTDOWN_DASHBOARD.

Alcance estricto:
- Reemplazar countdown ilustrativo/hardcoded del dashboard por dato real.
- No crear migraciones.
- No tocar RLS/policies/Supabase remoto/Auth/envs/Vercel config.
- No tocar cron logic, scraper/checkTarget, server actions, review center, BOQ/APU/exports/snapshots.

Backend:
- Extender MonitoringSummary con nextReviewAt, nextTargetId, nextTargetLabel.
- Derivar el proximo target desde price_monitor_targets enabled=true, org del viewer, order next_check_at asc limit 1.
- Mantener getMonitoringSummary tolerante y org-scoped.
- Actualizar fixture repository con datos deterministas.

UI:
- Dashboard deja de mostrar '02h 18m' hardcoded.
- Mostrar Ahora/Atrasada si nextReviewAt <= now; mostrar Sin revision programada si null.
- Helpers de formato (formatCountdown/formatTimeUntil) en el modulo NEUTRO lib/pricing/monitor-ui.ts, no en 'use client'.
- Verificar primero si dashboard/page.tsx ya consume getMonitoringSummary; si no, anadir la llamada de forma tolerante.
- Mantener dynamic = 'force-dynamic' y fallback tolerante: si el summary falla, el dashboard no cae.

Tests:
- Summary selecciona el target enabled mas proximo.
- Ignora pausados.
- Nulls sin targets activos.
- Dashboard no contiene hardcode.
- /catalog/monitoring y runs timeline siguen intactos.
```

## Confirmaciones

- Este documento no implementa codigo.
- No crea migraciones.
- No modifica Supabase, RLS, policies, Auth, envs/secrets, Vercel config, BOQ/APU, formulas, exports, datos reales, RPCs, cron logic ni server action logic.
- No toca `construction-ops-1rqh`.
