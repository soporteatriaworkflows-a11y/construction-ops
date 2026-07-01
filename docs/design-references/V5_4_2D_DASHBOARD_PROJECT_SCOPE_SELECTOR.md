# V5.4.2D - Dashboard Project Scope Selector

## Objetivo

Evitar que el dashboard mezcle presupuesto/capitulos de un proyecto con KPIs operativos de toda la organizacion cuando existen multiples proyectos visibles.

## Alcance implementado

- `/dashboard` renderiza vista global: selector en `Todos los proyectos`.
- `/dashboard?projectId=<id>` renderiza vista scoped si el proyecto esta dentro de `rm.listProjects(viewer)`.
- `projectId` invalido o no visible cae a vista global con aviso amable; no crashea ni devuelve 500.
- El boton principal cambia:
  - global: `Ver proyectos` -> `/projects`.
  - scoped: `Ver proyecto` -> `/projects/:id`.
- Quick Notes queda alineado al alcance:
  - global: lista/crea notas sin `project_id`.
  - scoped: lista/crea notas con `project_id` del proyecto seleccionado.
- La privacidad previa se mantiene: rol `client` no renderiza NotesCard, no ve formulario y no dispara lectura de repositorio.

## Decision financiera

No se agrego suma financiera multi-proyecto. En vista global, `getDashboardSummary(viewer, projectId)` sigue requiriendo un proyecto; por eso el dashboard usa el primer proyecto visible solamente como `Proyecto destacado`, rotulado de forma explicita. Esto evita presentar un total global falso.

## KPIs que siguen org-wide/catalogo

- Proyectos visibles.
- Versiones emitidas.
- Precios por revisar.
- Monitoreos.

`Presupuestos activos` se filtra por proyecto cuando hay `projectId` porque `EstimateListItem` ya expone `projectId`; en global queda como conteo de organizacion.

## Sin migracion

La fase usa campos existentes: `ProjectListItem.id`, `EstimateListItem.projectId` y `quick_notes.project_id` ya soportado por repositorio/actions. No requiere migracion, RLS ni cambios de backend de Price Intelligence.

## Riesgos

- El orden del proyecto destacado en global sigue dependiendo de `listProjects(viewer)`. Ya no define el alcance del dashboard, pero si define que presupuesto se muestra como destacado.
- Una agregacion financiera global real debe hacerse en una fase separada con contrato/test de read-model; no se invento en UI.