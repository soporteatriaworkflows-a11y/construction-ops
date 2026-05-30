# Políticas RLS — Construction Ops

Propiedad: **agent-db-rls**. Documentación de las políticas Row Level
Security implementadas en `supabase/migrations/20260530091000_rls_policies.sql`.

Fuente de verdad del modelo: `docs/DATABASE_SCHEMA.md` (Contrato congelado v1).

---

## Principios

1. **RLS habilitado y forzado** (`ENABLE` + `FORCE ROW LEVEL SECURITY`) en las
   20 tablas del contrato v1. `FORCE` aplica las políticas incluso al owner;
   solo un rol con `BYPASSRLS` (p. ej. `service_role` de Supabase) las elude,
   y se reserva para procesos administrativos controlados (migraciones, seeds).
2. **Aislamiento por organización** mediante el helper `app.current_org()`,
   que lee el claim `organization_id` del JWT de Supabase. Sin claim ⇒ NULL ⇒
   ninguna fila visible.
3. **Políticas separadas** por acción (SELECT / INSERT / UPDATE / DELETE),
   salvo tablas operativas simples donde se usa una política `FOR ALL` que
   cubre las cuatro con el mismo predicado de organización.
4. **Inmutabilidad** reforzada por RLS (y, donde aplica, por trigger).

## Helpers SQL (esquema `app`)

| Función | Devuelve | Uso |
|---|---|---|
| `app.current_org()` | `uuid` | organización del JWT; base de todo aislamiento |
| `app.current_role()` | `text` | rol de aplicación del JWT (`admin`, `gerencia`, ...) |
| `app.current_org_user()` | `uuid` | id del usuario (`sub` del JWT) |
| `app.estimate_version_in_org(uuid)` | `boolean` | la versión pertenece a la organización actual |
| `app.estimate_version_locked(uuid)` | `boolean` | la versión está congelada (`approved`/`issued`/`archived`) |

## Clasificación de tablas por estrategia de organización

### A. `organization_id` directo (filtro simple)
`organizations` (self, `id = current_org()`), `profiles`, `projects`,
`resources`, `suppliers`, `pricing_rules`, `labor_roles`, `apu_templates`.

- SELECT/INSERT/UPDATE/DELETE: `organization_id = app.current_org()`.
- `INSERT` fuerza la organización vía `WITH CHECK` (no se puede insertar en
  otra organización).

### B. Organización DERIVADA por JOIN al padre
| Tabla | Cadena de derivación |
|---|---|
| `project_scopes` | → `projects.organization_id` |
| `supplier_products` | → `suppliers.organization_id` |
| `price_observations` | → `supplier_products` → `suppliers.organization_id` |
| `apu_components` | → `apu_templates.organization_id` |
| `estimates` | → `project_scopes` → `projects.organization_id` |
| `quantity_groups` | → `project_scopes` → `projects.organization_id` |
| `quantity_lines` | → `quantity_groups` → `project_scopes` → `projects` |
| `estimate_versions` | → `estimates` → `project_scopes` → `projects` |
| `chapters` | → `estimate_versions` (helper `estimate_version_in_org`) |
| `boq_items` | → `estimate_versions` (helper) |
| `indirect_cost_rules` | → `estimate_versions` (helper) |
| `apu_calculation_snapshots` | → `estimate_versions` (helper) |

**Decisión de diseño**: NO se desnormaliza `organization_id` en las hijas. El
contrato v1 no lo incluye y el JOIN seguro al padre (con índice en cada FK)
mantiene el aislamiento sin duplicar el dato ni arriesgar inconsistencias.

## Inmutabilidad

| Tabla | Regla |
|---|---|
| `apu_calculation_snapshots` | **Totalmente inmutable**: solo SELECT e INSERT. Sin política UPDATE ni DELETE ⇒ ambas denegadas por RLS. El borrado solo ocurre por cascada al eliminar una versión `draft`. |
| `estimate_versions` | UPDATE/DELETE permitidos solo si el estado **anterior** NO es `approved`/`issued`/`archived`. Esto permite *congelar* una versión (draft→issued) pero impide re-editar una ya emitida. |
| `chapters`, `boq_items`, `indirect_cost_rules` | INSERT/UPDATE/DELETE bloqueados cuando la versión padre está congelada (`app.estimate_version_locked`). |
| `price_observations` | **Append-only**: SELECT + INSERT. Sin DELETE. UPDATE solo `admin`/`gerencia` y únicamente para aprobación; un trigger (`app.price_observation_immutable_price`) impide alterar `observed_price`, `observed_at`, `source_type` o `supplier_product_id`. |

## Restricciones de rol adicionales (más allá de la organización)

- `profiles` INSERT/DELETE: solo `admin`. UPDATE de `role`/`email`: solo
  `admin`; cualquier usuario puede editar su propio perfil (`id = current_org_user()`).
- `price_observations` UPDATE (aprobación): solo `admin`/`gerencia`.
- `organizations` INSERT/DELETE: sin política de usuario (administrativo).

## Triggers controlados (solo auditoría/integridad, sin lógica de negocio)

| Trigger | Tabla(s) | Razón |
|---|---|---|
| `*_set_updated_at` | todas las que tienen `updated_at` | refresca `updated_at` en cada UPDATE |
| `price_observations_immutable_price` | `price_observations` | refuerza la inmutabilidad del precio observado en UPDATE |

> Las tablas de detalle/append-only sin `updated_at` (`apu_components`,
> `chapters`, `boq_items`, `indirect_cost_rules`, `quantity_lines`,
> `estimate_versions`, `apu_calculation_snapshots`, `price_observations`,
> `quantity_groups`) no llevan trigger de `updated_at` porque el contrato no
> define esa columna en ellas.

## Verificación

La lógica de aislamiento e inmutabilidad se valida en
`apps/web/tests/regression/rls-isolation.test.ts`, que parsea esta migración
y comprueba, sin base de datos remota, que:

- cada tabla del contrato tiene `ENABLE` + `FORCE ROW LEVEL SECURITY`;
- cada tabla con organización directa filtra por `app.current_org()`;
- las tablas hijas derivan la organización por JOIN/helper;
- `apu_calculation_snapshots` no tiene política UPDATE/DELETE;
- los hijos de versiones emitidas se bloquean vía `estimate_version_locked`;
- `price_observations` no tiene política DELETE.
