# V5.4.3 - Monitoring Runs Details

## Objetivo

Hacer mas operativa la seccion `Corridas recientes` en `/catalog/monitoring`, mostrando que paso dentro de cada corrida sin crear rutas nuevas ni tocar cron, server actions, RLS o migraciones.

## Alcance implementado

- Repository aditivo: `MonitorRepository.listRunResults(viewer, runId, limit)`.
- Tipo nuevo: `MonitorRunResultDetailView`.
- UI server-rendered con `<details>` por corrida reciente.
- Limites de volumen: 5 runs recientes y 10 resultados visibles por run.
- Copy de overflow: si el repositorio devuelve mas de 10, se muestra `Mostrando los primeros 10 resultados de esta corrida.`
- Fixtures demo con run exitoso, run parcial con `pending_created`/`changed`, run fallido y run sin resultados.

## Datos mostrados por run

Cada corrida muestra estado, fecha relativa, duracion, `trigger_type`, counters y `error_summary` si existe.

Al expandir, cada resultado muestra:

- recurso;
- proveedor;
- estado del resultado;
- precio detectado si existe;
- moneda/unidad;
- warnings;
- observacion vinculada si existe;
- `checkedAt`;
- accion sugerida.

## Acciones sugeridas

- `pending_created` / `changed`: Revisar cambios en Price Review.
- `unreachable` / `blocked` / `parse_failed` / `invalid_response`: Revisar URL/proveedor/fuente.
- `running`: Esperar o revisar luego.
- Sin resultados: Sin resultados disponibles.

## Seguridad y limites

- Lectura DB sigue RLS-bound via Supabase SSR del viewer.
- El metodo DB filtra por `organization_id = viewer.organizationId` y `run_id`.
- No se crean ni modifican datos.
- No se toca cron, actions, aprobacion/rechazo de precios, Quick Notes, selector Dashboard Project Scope, BOQ/APU/exports ni Vercel/envs.
- No hay migraciones ni `db push`.

## QA recomendado

- `pnpm.cmd typecheck`
- `pnpm.cmd exec vitest run tests/unit/pricing/monitor-ui.test.ts tests/unit/pricing/monitor/repository-roles.test.ts tests/unit/pricing/monitor/ui-and-invariants.test.ts`
- `pnpm.cmd lint`
- `pnpm.cmd test`
- `pnpm.cmd build`
- `pnpm.cmd gm:regression`
- `git diff --check`