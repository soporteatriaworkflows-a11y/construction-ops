# P2D OPS Infrastructure & Performance Baseline

Fecha: 2026-07-07  
Rama: `feature/p2d-infra-performance-fix`  
Base: `origin/main` @ `ee59405` (`feat(steel): complete DXF longitudinal beam dispatch (F8E) (#69)`)

## Resumen ejecutivo

P2D-0/P2D-1 inicia desde `origin/main` en un worktree separado para no interferir con ramas activas de Steel Ops. No se monta VPS, no se cambian secretos, no se ejecutan migraciones y no se modifica lógica funcional de Steel Ops.

La base contiene el hardening P0B esperado para Postgres: `DEFAULT_POSTGRES_POOL_MAX = 1` en `apps/web/lib/db/index.ts`, con override opt-in por `POSTGRES_POOL_MAX`/`DB_POOL_MAX` y clamp máximo de 10.

Esta fase agrega instrumentación liviana y apagada por defecto para medir rutas críticas y operaciones de repositorio/read-model sin exponer datos sensibles. Los logs se emiten solo si `OPS_PERF_LOGS=true`.

## Rama base usada

- Worktree: `D:\ICONIC\SOFTWARE PRESUPUESTOS\construction-ops-p2d`
- Rama nueva: `feature/p2d-infra-performance-fix`
- Tracking inicial: `origin/main`
- Commit base: `ee59405`
- Rama original no tocada: `feature/v5-6-3a-invitation-email-fallback-ux`

## Riesgos de divergencia detectados

- La rama original de trabajo no era `main` y tenía archivos no versionados; por eso se creó worktree separado.
- `origin/main` ya incluye cambios activos de Steel Ops F8E. Esta fase no modifica archivos bajo `apps/web/lib/steel` ni `apps/web/app/(dashboard)/steel`.
- No se detectó divergencia peligrosa en pool Postgres: `DEFAULT_POSTGRES_POOL_MAX = 1` está presente en la base.

## Rutas críticas encontradas

- `/dashboard`: `apps/web/app/(dashboard)/dashboard/page.tsx`
- Budget workspace: `apps/web/app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/workspace/page.tsx`
- `/quantities`: `apps/web/app/(dashboard)/quantities/page.tsx`
- Planning/Gantt list: `apps/web/app/(dashboard)/planning/page.tsx`
- Planning/Gantt detail: `apps/web/app/(dashboard)/planning/[scheduleId]/page.tsx`
- Monitoring: `apps/web/app/(dashboard)/catalog/monitoring/page.tsx`
- Exports: `apps/web/app/api/exports/route.ts` y `apps/web/server/exports/export-service.ts`
- Read model DB/RLS: `apps/web/server/read-model/drizzle-repository.ts`
- Planning service/repository: `apps/web/server/planning/service.ts`, `apps/web/server/planning/repository.ts`
- Steel Ops analizado solo como superficie de inventario: `apps/web/lib/steel/**`, `apps/web/app/(dashboard)/steel/**`

## Archivos tocados

- `.env.example`
- `apps/web/server/performance/ops-perf.ts`
- `apps/web/app/(dashboard)/dashboard/page.tsx`
- `apps/web/app/(dashboard)/quantities/page.tsx`
- `apps/web/app/(dashboard)/catalog/monitoring/page.tsx`
- `apps/web/app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/workspace/page.tsx`
- `apps/web/server/planning/service.ts`
- `apps/web/server/exports/export-service.ts`
- `apps/web/server/read-model/drizzle-repository.ts`
- `docs/audits/P2D_INFRA_PERFORMANCE_BASELINE.md`

## Puntos probables de lentitud

- Workspace de presupuesto: carga secuencial de items por capitulo (`listItemsByChapter` por capitulo). Es conservador para pool P0B, pero puede ser lento en presupuestos grandes.
- Planning list: lista cronogramas y luego carga tareas por cronograma para calcular conteos y avance.
- Planning detail/Gantt: carga schedule, tasks y dependencies; puede crecer con cronogramas grandes.
- Monitoring: lista targets/runs/summary y luego resultados por run en la pagina.
- Dashboard: combina proyectos, resumen de dashboard y quick notes; depende del read-model y RLS.
- Quantities: resuelve proyecto destacado, overview, grupos de cantidades y lotes importados.
- Exports: consulta overview, estimate detail, schedule/dashboard opcional y genera XLSX/PDF en memoria.
- Read-model DB: cada operacion abre transaccion RLS-scoped; es correcto para seguridad, pero requiere medir duracion por operacion.

## Que se instrumento

Se agrego `apps/web/server/performance/ops-perf.ts` con:

- `isOpsPerfLoggingEnabled()`
- `withOpsPerfSpan(route, span, fn, metadata)`
- `createOpsPerfTrace(route, metadata)`

Los logs tienen formato JSON en `console.info`:

```json
{"event":"ops.perf","route":"/planning","span":"planning.repo.listSchedules","ok":true,"durationMs":12}
```

Metadatos permitidos: ruta logica, nombre del span, duracion, estado, conteos agregados, formato/perfil de export, rol y flags booleanos. No se loguean UUIDs, nombres de proyecto, montos, URLs, secretos ni datos internos.

Instrumentacion aplicada:

- `/dashboard`: `resolveViewer`, `listProjects`, `getDashboardSummary`, `getDashboardQuickNotes`, resumen total.
- Budget workspace: `resolveViewer`, `getEstimateById`, `listChaptersByEstimateVersion`, carga secuencial de items por capitulo, resumen financiero, AIU, APUs para agregar, resumen total.
- `/quantities`: viewer, proyectos, overview, cantidades, batches importados, resumen total.
- `/catalog/monitoring`: targets, recent runs, summary, resumen total.
- Planning service: list schedules, tasks por schedule, detail schedule/tasks/dependencies.
- Exports: read-model calls y generacion XLSX/PDF en memoria.
- Drizzle read-model: duracion de la transaccion RLS-scoped por operacion.

## Como activar/desactivar logs

Por defecto estan apagados.

Activar solo en local/staging:

```bash
OPS_PERF_LOGS=true
```

Desactivar:

```bash
OPS_PERF_LOGS=false
```

Valores aceptados como true: `1`, `true`, `yes`, `on`.

Produccion debe permanecer apagada salvo diagnostico explicito y temporal.

## Proximos pasos recomendados

1. Ejecutar flujos manuales con `OPS_PERF_LOGS=true` en staging/local DB y capturar logs por ruta.
2. Priorizar por `durationMs` y cantidad de spans: dashboard, workspace, planning, quantities, monitoring, exports.
3. Convertir fan-out medido en queries agregadas o read models:
   - Workspace: loader por version que traiga capitulos + items en batch.
   - Planning list: summary por schedule con conteos y avance en query/RPC/view.
   - Monitoring: resultados recientes por runs en una sola consulta.
4. Revisar `EXPLAIN ANALYZE` de queries lentas y RLS antes de agregar indices.
5. Mantener `DEFAULT_POSTGRES_POOL_MAX = 1` hasta tener evidencia de capacidad del pooler.
6. Para exports/imports pesados, preparar jobs asincronicos y storage antes de considerar VPS.
7. Evaluar backend/worker Docker solo para Steel/DXF/PDF/import-export pesados cuando haya tiempos reales que excedan el modelo Vercel.

## Checklist de seguridad de esta fase

- Sin migraciones.
- Sin `db push`.
- Sin cambios en Supabase config/policies.
- Sin secretos ni envs reales.
- Sin deploy.
- Sin cambios funcionales en Steel Ops.
- Logs apagados por defecto.
- Logs sin IDs, montos, URLs ni datos sensibles.