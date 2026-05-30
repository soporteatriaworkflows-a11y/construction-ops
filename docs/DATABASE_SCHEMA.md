# Database Schema — Construction Ops

Este documento es propiedad de **agent-orchestrator** y se sincroniza
con las migraciones que crea **agent-db-rls**.

> ⏳ **Pendiente**: el detalle se completa al inicio de la Oleada 1,
> después de que el usuario cargue `docs/PROJECT_MASTER.md` y de que
> `agent-db-rls` proponga el esquema base.

---

## Stack

- **DB**: PostgreSQL gestionado por Supabase.
- **ORM**: Drizzle ORM (TypeScript).
- **RLS**: habilitado en toda tabla con datos por organización.
- **Tipos numéricos**: `NUMERIC(20, 10)` para campos financieros.

---

## Entidades planificadas (a confirmar y detallar)

### Core
- `organizations`
- `profiles`
- `projects`
- `project_scopes`

### Recursos y proveedores
- `resources`
- `suppliers`
- `supplier_products`
- `price_observations`
- `pricing_rules`
- `labor_roles`

### APU y presupuesto
- `apu_templates`
- `apu_components`
- `apu_calculation_snapshots`
- `estimates`
- `estimate_versions` (status: `draft` | `approved` | `issued` | `archived`)
- `chapters`
- `boq_items`
- `indirect_cost_rules`

### Cantidades
- `quantity_groups`
- `quantity_lines`

### Ejecución y cronograma
- `schedule_tasks`
- `task_dependencies`
- `progress_updates`

### Compras y cambios
- `purchase_records`
- `purchase_items`
- `change_orders`
- `change_order_items`

---

## Reglas globales del esquema

1. Toda tabla incluye `created_at`, `updated_at` con `TIMESTAMPTZ`.
2. Toda tabla con datos sensibles incluye `organization_id` y RLS.
3. Snapshots (`apu_calculation_snapshots`,
   `estimate_versions.status in (approved, issued, archived)`) son
   inmutables: las políticas RLS bloquean UPDATE y DELETE.
4. UUIDs como PK por defecto.
5. FK con `ON DELETE` explícito (CASCADE, RESTRICT o SET NULL).
6. Índice en cada FK y en campos usados frecuentemente en `WHERE`.
7. Triggers `updated_at` automáticos en todas las tablas con
   `updated_at`.

---

## Política RLS resumida

- `SELECT` permitido si `row.organization_id = current_setting('jwt.organization_id')`.
- `INSERT` fuerza `organization_id` del usuario.
- `UPDATE`/`DELETE` permitido sólo en la misma organización y sólo si
  el estado lo permite (no `issued`).
- Para tablas hijas se decide caso por caso si desnormalizar
  `organization_id` o derivarlo vía JOIN.

---

## Diagrama (placeholder)

> Se generará con `dbml` o `mermaid` cuando el esquema esté congelado.

---

## Histórico de cambios

| Fecha | Cambio | Migración | Autor |
|-------|--------|-----------|-------|
| 2026-05-29 | Documento inicializado | — | orchestrator |
