# Database Schema — Construction Ops

> **Contrato congelado v1 — cambios únicamente mediante `docs/INTEGRATION_REQUESTS.md`.**
>
> Este documento es propiedad de **agent-orchestrator** y es la fuente
> única de verdad de nombres y tipos de entidades. `agent-db-rls` debe
> implementar **exactamente** este esquema. Ningún agente renombra campos
> unilateralmente.
>
> Fuentes: `docs/PROJECT_MASTER.md` (§6), `docs/DECISIONS.md`,
> `docs/OPEN_QUESTIONS.md`, `docs/API_CONTRACTS.md`, `docs/AGENT_REGISTRY.md`.
> Congelado: 2026-05-29.

---

## Convenciones globales del esquema

1. **PK**: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` en toda tabla.
2. **Nombres**: `snake_case` en PostgreSQL.
3. **Dinero / cantidades financieras**: `NUMERIC(20,10)` (nunca `float`).
   No se redondea en el esquema ni en pasos intermedios. **Q9 RESUELTA
   (2026-05-30)**: el cálculo interno conserva precisión completa
   (`Decimal.js` + `NUMERIC(20,10)` + serialización `string`); el redondeo
   `ROUND_HALF_UP` es solo de **presentación** (UI/PDF cliente 0 decimales;
   Excel técnico 2 decimales; regresión/auditoría raw) y NO muta snapshots.
   Ver `docs/DECISIONS.md` y `docs/API_CONTRACTS.md`.
4. **Fechas auditables**: `TIMESTAMPTZ`. `created_at NOT NULL DEFAULT now()`
   y `updated_at NOT NULL DEFAULT now()` con trigger de actualización.
5. **Fechas de calendario** (sin hora): `DATE`.
6. **Multitenancy**: toda tabla con datos de negocio lleva `organization_id`
   (directo) **o** lo deriva por JOIN (se indica explícitamente). RLS
   habilitado en todas.
7. **FK**: siempre con `ON DELETE` explícito (`CASCADE`, `RESTRICT` o
   `SET NULL`). Índice en cada FK.
8. **Enums**: se modelan como `TEXT` + `CHECK (col IN (...))` para
   flexibilidad de migración (no tipos `ENUM` nativos), salvo que
   `agent-db-rls` justifique lo contrario vía INTEGRATION_REQUESTS.
9. **Inmutabilidad**: snapshots y versiones emitidas no se recalculan;
   las políticas RLS bloquean `UPDATE`/`DELETE` cuando aplica.
10. **Privacidad backend-first**: los campos marcados 🔒 INTERNO no se
    exponen a rol `cliente` desde el backend (no basta ocultarlos en UI).

### Política RLS base (todas las tablas con `organization_id`)
- `SELECT`: permitido si `organization_id = current_org()` (helper que lee
  `organization_id` del JWT/sesión Supabase).
- `INSERT`: fuerza `organization_id = current_org()`.
- `UPDATE`/`DELETE`: solo misma organización **y** solo si el estado lo
  permite (ver reglas de inmutabilidad por tabla).
- Tablas hijas sin `organization_id` directo: RLS por JOIN al padre.

#### Excepción `profiles` (migración `20260602130000`, hotfix 4B.1)
`profiles` NO usa la política base `organization_id = current_org()` para `SELECT`:
eso causaba **recursión RLS** (current_org() lee `profiles`, que re-evalúa la
política) cuando el migrador carece de `BYPASSRLS` (Supabase remoto). En su lugar:
`profiles_self_select USING (id = (SELECT app._auth_uid()))` — cada usuario lee
**solo su propia fila** por `auth.uid()`, sin invocar `current_org()`. Así
`current_org()`/`current_role()` resuelven leyendo esa fila propia sin recursión.
Además, la migración concede `USAGE` sobre el esquema `app` y `EXECUTE` sobre sus
funciones de identidad al rol `authenticated` (sin esto, en remoto las políticas
fallan con "permission denied for schema app"). Listado de miembros de la
organización: diferido a un mecanismo no recursivo en oleada posterior.

### Roles del sistema (en `profiles.role`)
`admin` · `gerencia` · `presupuestos` · `obra` · `compras` · `consulta`
(rol "cliente" es un perfil de **exportación/lectura restringida**, no
necesariamente un rol de fila; se trata en el perfil de exports).

---

# ENTIDADES CONGELADAS v1 (Oleada 1)

## CORE

### `organizations`
1. **Tabla**: `organizations`
2. **Propósito**: tenant raíz. Aísla todos los datos por constructora.
3-5. **Columnas**:
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| name | TEXT | NOT NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL | DEFAULT now() |
6. **PK**: `id`.
7. **FK**: ninguna.
8. **ON DELETE**: n/a (raíz; borrado en cascada hacia hijos vía sus FK).
9. **organization_id**: es la propia organización (self).
10. **RLS**: un usuario solo ve su organización (`id = current_org()`).
11. **Índices**: PK.
12. **Integridad**: `name` no vacío (`CHECK (length(trim(name))>0)`).
13. **Enums**: —.
14. **Inmutabilidad**: —.
15. **Snapshot**: —.
16. 🔒 INTERNO: —.
17. **Dudas**: —.

### `profiles`
1. **Tabla**: `profiles`
2. **Propósito**: usuario de la plataforma, ligado a `auth.users` de Supabase.
3-5. **Columnas**:
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | UUID | NOT NULL | PK = `auth.users.id` |
| organization_id | UUID | NOT NULL | FK organizations |
| full_name | TEXT | NOT NULL | |
| email | TEXT | NOT NULL | UNIQUE por organización |
| role | TEXT | NOT NULL | CHECK rol válido |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |
6. **PK**: `id`.
7. **FK**: `id → auth.users(id)` ON DELETE CASCADE; `organization_id → organizations(id)`.
8. **ON DELETE**: organización RESTRICT (no borrar org con perfiles); auth user CASCADE.
9. **organization_id**: directo.
10. **RLS**: lectura propia organización; escritura de `role` solo `admin`.
11. **Índices**: PK; `(organization_id)`; UNIQUE `(organization_id, email)`.
12. **Integridad**: `role IN ('admin','gerencia','presupuestos','obra','compras','consulta')`.
13. **Enums**: `role`.
14. **Inmutabilidad**: —.
15. **Snapshot**: —.
16. 🔒 INTERNO: `email`, `role` (no exponer a cliente).
17. **Dudas**: ¿soporte multi-organización por usuario? → fuera de v1.

### `projects`
1. **Tabla**: `projects`
2. **Propósito**: obra/proyecto de construcción (ej. ENTRE PATIOS).
3-5. **Columnas**:
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| organization_id | UUID | NOT NULL | FK organizations |
| code | TEXT | NOT NULL | único por org |
| name | TEXT | NOT NULL | |
| status | TEXT | NOT NULL | CHECK; DEFAULT 'active' |
| client_reference | TEXT | NULL | 🔒 referencia comercial |
| location | TEXT | NULL | "Ciudad" en la UI 4B.1 |
| description | TEXT | NULL | descripción libre (4B.1; mig. 20260602120000) |
| start_date | DATE | NULL | |
| estimated_end_date | DATE | NULL | |
| created_by | UUID | NULL | FK profiles; autor (4B.1; mig. 20260602120000) |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |
6. **PK**: `id`.
7. **FK**: `organization_id → organizations(id)`; `created_by → profiles(id)`.
8. **ON DELETE**: org CASCADE; created_by SET NULL (preserva historial).
9. **organization_id**: directo.
10. **RLS**: por organización (sin cambios en 4B.1; `created_by` se setea
    server-side = `viewer.profileId`; no se endurece `projects_insert`).
11. **Índices**: PK; `(organization_id)`; `(created_by)`; UNIQUE `(organization_id, code)`.
12. **Integridad**: `status IN ('active','archived','closed')`.
13. **Enums**: `status`.
14. **Inmutabilidad**: —.
15. **Snapshot**: —.
16. 🔒 INTERNO: `client_reference` (dato comercial; no a cliente).
17. **Dudas**: catálogo de `status` definitivo (provisional).
18. **4B.1**: la columna `code` se autogenera server-side (slug del `name` +
    anti-colisión `-2/-3…`); "Ciudad" de la UI persiste en `location` (no se
    crea columna `city`). Ver `docs/PROJECTS_CRUD_CONTRACT.md`.

### `project_scopes`
1. **Tabla**: `project_scopes`
2. **Propósito**: alcance jerárquico (piso, torre, etapa, paquete, modificación).
3-5. **Columnas**:
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| project_id | UUID | NOT NULL | FK projects |
| parent_scope_id | UUID | NULL | FK self (jerarquía) |
| code | TEXT | NOT NULL | |
| name | TEXT | NOT NULL | |
| scope_type | TEXT | NOT NULL | CHECK |
| status | TEXT | NOT NULL | DEFAULT 'active' |
| description | TEXT | NULL | descripción libre (4B.2; mig. 20260604120000) |
| created_by | UUID | NULL | FK profiles; autor (4B.2; mig. 20260604120000) |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |
6. **PK**: `id`.
7. **FK**: `project_id → projects(id)`; `parent_scope_id → project_scopes(id)`; `created_by → profiles(id)`.
8. **ON DELETE**: project CASCADE; parent SET NULL; created_by SET NULL (preserva historial).
9. **organization_id**: derivado vía `project_id → projects`.
10. **RLS**: por JOIN a `projects` (misma organización; sin cambios en 4B.2).
11. **Índices**: PK; `(project_id)`; `(parent_scope_id)`; `(created_by)`; UNIQUE `(project_id, code)`.
12. **Integridad**: `scope_type IN ('floor','tower','stage','package','unit','modification','other')`; sin ciclos en jerarquía (validación a nivel de app/dominio).
13. **Enums**: `scope_type`, `status`.
14. **Inmutabilidad**: —.
15. **Snapshot**: —.
16. 🔒 INTERNO: —.
17. **Dudas**: profundidad máxima de jerarquía (no restringida en v1).

---

## CATÁLOGO Y PROVEEDORES

### `resources`
1. **Tabla**: `resources`
2. **Propósito**: recurso maestro reutilizable (material, mano de obra, equipo, herramienta, subcontrato).
3-5. **Columnas**:
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| organization_id | UUID | NOT NULL | FK organizations |
| code | TEXT | NOT NULL | único por org |
| name | TEXT | NOT NULL | |
| resource_type | TEXT | NOT NULL | CHECK |
| unit | TEXT | NOT NULL | unidad de medida |
| default_waste_pct | NUMERIC(20,10) | NOT NULL | DEFAULT 0 (fracción, ej. 0.05) |
| active | BOOLEAN | NOT NULL | DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |
6. **PK**: `id`. 7. **FK**: `organization_id`. 8. **ON DELETE**: org CASCADE.
9. **organization_id**: directo. 10. **RLS**: por organización.
11. **Índices**: PK; `(organization_id)`; UNIQUE `(organization_id, code)`; `(organization_id, resource_type)`.
12. **Integridad**: `default_waste_pct >= 0`.
13. **Enums**: `resource_type IN ('material','labor','equipment','tool','subcontract','other')`.
14-15. **Inmutabilidad/Snapshot**: —.
16. 🔒 INTERNO: —. 17. **Dudas**: `default_waste_pct` como fracción (0–1) — confirmado v1.

### `suppliers`
1. **Tabla**: `suppliers` 2. **Propósito**: proveedor (Homecenter, HB, etc.).
3-5. **Columnas**:
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| organization_id | UUID | NOT NULL | FK organizations |
| name | TEXT | NOT NULL | |
| supplier_type | TEXT | NOT NULL | CHECK; DEFAULT 'vendor' |
| contact_data | JSONB | NULL | 🔒 datos de contacto |
| active | BOOLEAN | NOT NULL | DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |
6-8. PK `id`; FK `organization_id`; ON DELETE org CASCADE.
9. directo. 10. RLS por organización.
11. **Índices**: PK; `(organization_id)`; `(organization_id, name)`.
12. **Integridad**: `supplier_type IN ('vendor','distributor','manufacturer','subcontractor','other')`.
13. **Enums**: `supplier_type`.
14-15. —. 16. 🔒 INTERNO: `contact_data`, y el proveedor mismo cuando no aplique mostrarlo a cliente. 17. **Dudas**: —.

### `supplier_products`
1. **Tabla**: `supplier_products` 2. **Propósito**: oferta de un recurso por un proveedor (SKU/URL).
3-5. **Columnas**:
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| supplier_id | UUID | NOT NULL | FK suppliers |
| resource_id | UUID | NOT NULL | FK resources |
| supplier_sku | TEXT | NULL | 🔒 |
| supplier_product_name | TEXT | NULL | |
| product_url | TEXT | NULL | 🔒 |
| location_reference | TEXT | NULL | 🔒 |
| currency | TEXT | NOT NULL | DEFAULT 'COP' |
| active | BOOLEAN | NOT NULL | DEFAULT true |
| manual_override | BOOLEAN | NOT NULL | DEFAULT false |
| last_checked_at | TIMESTAMPTZ | NULL | |
| sync_status | TEXT | NOT NULL | CHECK; DEFAULT 'manual' |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |
6. PK `id`. 7. FK `supplier_id → suppliers(id)`, `resource_id → resources(id)`.
8. **ON DELETE**: supplier CASCADE; resource RESTRICT.
9. **organization_id**: derivado vía `supplier_id → suppliers`.
10. RLS por JOIN a `suppliers`.
11. **Índices**: PK; `(supplier_id)`; `(resource_id)`; UNIQUE `(supplier_id, resource_id, supplier_sku)`.
12. **Integridad**: `currency` ISO-4217 (3 letras).
13. **Enums**: `sync_status IN ('manual','synced','pending','error')`.
14-15. —. 16. 🔒 INTERNO: `supplier_sku`, `product_url`, `location_reference`. 17. **Dudas**: unicidad cuando `supplier_sku` es NULL (índice parcial) → a definir por db-rls.

### `price_observations`
1. **Tabla**: `price_observations` 2. **Propósito**: histórico de precios observados (inmutable append-only).
3-5. **Columnas**:
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| supplier_product_id | UUID | NOT NULL | FK supplier_products |
| observed_price | NUMERIC(20,10) | NOT NULL | 🔒 |
| stock_status | TEXT | NULL | |
| source_type | TEXT | NOT NULL | CHECK |
| source_reference | TEXT | NULL | |
| observed_at | TIMESTAMPTZ | NOT NULL | |
| approved | BOOLEAN | NOT NULL | DEFAULT false |
| approved_by | UUID | NULL | FK profiles |
| notes | TEXT | NULL | 🔒 |
| created_at | TIMESTAMPTZ | NOT NULL | |
6. PK `id`. 7. FK `supplier_product_id → supplier_products(id)`, `approved_by → profiles(id)`.
8. **ON DELETE**: supplier_product CASCADE; approved_by SET NULL.
9. derivado vía `supplier_product_id`. 10. RLS por JOIN.
11. **Índices**: PK; `(supplier_product_id, observed_at DESC)`; `(source_type)`.
12. **Integridad**: `observed_price >= 0`.
13. **Enums**: `source_type IN ('official_api','official_feed','supplier_csv','manual','public_web','invoice','quotation')`.
14. **Inmutabilidad**: ✅ append-only. RLS bloquea `UPDATE`/`DELETE` (salvo set de `approved`/`approved_by` por gerencia/admin vía política específica).
15. **Snapshot**: cada fila es una observación puntual.
16. 🔒 INTERNO: `observed_price`, `notes` (todo el registro es interno).
17. **Dudas**: ¿permitir editar `approved`? → sí, solo aprobación, no el precio.

### `pricing_rules`
1. **Tabla**: `pricing_rules` 2. **Propósito**: reglas de precio (variación preventiva, descuento, impuesto, markup, redondeo, ajuste).
3-5. **Columnas**:
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| organization_id | UUID | NOT NULL | FK organizations |
| name | TEXT | NOT NULL | |
| rule_type | TEXT | NOT NULL | CHECK |
| percentage | NUMERIC(20,10) | NULL | 🔒 fracción |
| scope_type | TEXT | NOT NULL | CHECK; DEFAULT 'global' |
| scope_reference_id | UUID | NULL | id polimórfico según scope_type |
| active | BOOLEAN | NOT NULL | DEFAULT true |
| effective_from | TIMESTAMPTZ | NULL | |
| effective_to | TIMESTAMPTZ | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |
6-8. PK `id`; FK `organization_id`; ON DELETE org CASCADE.
9. directo. 10. RLS por organización.
11. **Índices**: PK; `(organization_id, rule_type)`; `(organization_id, active)`.
12. **Integridad**: `effective_to IS NULL OR effective_to >= effective_from`.
13. **Enums**: `rule_type IN ('preventive_variation','negotiated_discount','tax','commercial_markup','rounding','manual_adjustment')`; `scope_type IN ('global','project','scope','resource','supplier_product')`.
14-15. —.
16. 🔒 INTERNO: `percentage` para `negotiated_discount` (descuento interno). La variación preventiva e impuestos pueden ser visibles según perfil.
17. **Q8/Q9 RESUELTAS (2026-05-30)** — afectan cálculo, no esquema. Q8: la base del `negotiated_discount` (`rule_type='negotiated_discount'`, `percentage`) es `online_public_price` por defecto (excepciones configurables por proveedor/producto). Q9: redondeo `ROUND_HALF_UP` solo en presentación; cálculo raw. Ver `docs/DECISIONS.md`.

### `labor_roles`
1. **Tabla**: `labor_roles` 2. **Propósito**: cargo de mano de obra con factores prestacionales (insumo del costo integral).
3-5. **Columnas**:
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| organization_id | UUID | NOT NULL | FK organizations |
| code | TEXT | NOT NULL | único por org |
| name | TEXT | NOT NULL | |
| base_salary | NUMERIC(20,10) | NOT NULL | 🔒 |
| transport_subsidy | NUMERIC(20,10) | NOT NULL | DEFAULT 0 |
| benefits_pct | NUMERIC(20,10) | NOT NULL | DEFAULT 0 fracción |
| social_security_pct | NUMERIC(20,10) | NOT NULL | DEFAULT 0 |
| payroll_tax_pct | NUMERIC(20,10) | NOT NULL | DEFAULT 0 |
| uniform_cost | NUMERIC(20,10) | NOT NULL | DEFAULT 0 |
| uniform_period_months | NUMERIC(20,10) | NOT NULL | DEFAULT 12 |
| working_days_month | NUMERIC(20,10) | NOT NULL | |
| working_hours_day | NUMERIC(20,10) | NOT NULL | |
| active | BOOLEAN | NOT NULL | DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |
6-8. PK `id`; FK `organization_id`; ON DELETE org CASCADE.
9. directo. 10. RLS por organización.
11. **Índices**: PK; UNIQUE `(organization_id, code)`.
12. **Integridad**: porcentajes `>= 0`; `working_days_month > 0`; `working_hours_day > 0`.
13. **Enums**: —.
14. **Inmutabilidad**: el costo integral calculado (`monthly/daily/hourly_integral_cost`) **NO se almacena aquí**: se calcula en el dominio y se congela como `unit_price_snapshot` al usarse en un APU.
15. **Snapshot**: —.
16. 🔒 INTERNO: `base_salary` y factores (datos sensibles de nómina).
17. **Dudas**: —.

---

## APU Y PRESUPUESTO

### `apu_templates`
1. **Tabla**: `apu_templates` 2. **Propósito**: análisis de precio unitario reutilizable (actividad).
3-5. **Columnas**:
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| organization_id | UUID | NOT NULL | FK organizations |
| code | TEXT | NOT NULL | único por org+version |
| name | TEXT | NOT NULL | |
| unit | TEXT | NOT NULL | |
| chapter_template_id | UUID | NULL | clasificación opcional |
| description | TEXT | NULL | |
| active | BOOLEAN | NOT NULL | DEFAULT true |
| version | INTEGER | NOT NULL | DEFAULT 1 |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |
6-8. PK `id`; FK `organization_id`; ON DELETE org CASCADE.
9. directo. 10. RLS por organización.
11. **Índices**: PK; UNIQUE `(organization_id, code, version)`.
12. **Integridad**: `version >= 1`.
13. **Enums**: —.
14-15. —. 16. 🔒 INTERNO: —. 17. **Dudas**: `chapter_template_id` (catálogo de capítulos maestro) diferido; nullable en v1.

### `apu_components`
1. **Tabla**: `apu_components` 2. **Propósito**: línea de insumo dentro de un APU.
3-5. **Columnas**:
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| apu_template_id | UUID | NOT NULL | FK apu_templates |
| resource_id | UUID | NULL | FK resources |
| component_type | TEXT | NOT NULL | CHECK |
| quantity | NUMERIC(20,10) | NOT NULL | rendimiento/consumo |
| waste_pct | NUMERIC(20,10) | NOT NULL | DEFAULT 0 fracción |
| unit_price_source | TEXT | NOT NULL | CHECK origen del precio |
| unit_price_snapshot | NUMERIC(20,10) | NOT NULL | precio congelado del insumo |
| total_component_cost | NUMERIC(20,10) | NOT NULL | calculado (ver regla) |
| sort_order | INTEGER | NOT NULL | DEFAULT 0 |
| notes | TEXT | NULL | |
6. PK `id`. 7. FK `apu_template_id → apu_templates(id)`, `resource_id → resources(id)`.
8. **ON DELETE**: apu_template CASCADE; resource RESTRICT.
9. derivado vía `apu_template_id`. 10. RLS por JOIN.
11. **Índices**: PK; `(apu_template_id, sort_order)`; `(resource_id)`.
12. **Integridad**: `quantity >= 0`; `waste_pct >= 0`; `unit_price_snapshot >= 0`.
13. **Enums**: `component_type IN ('material','labor','equipment','tool','subcontract','other')`; `unit_price_source IN ('resource','labor_role','manual','supplier_product')`.
14. **Inmutabilidad**: `unit_price_snapshot` se congela al momento de definir/recalcular el APU.
15. **Snapshot**: `unit_price_snapshot`.
16. 🔒 INTERNO: —.
17. **Regla de cálculo** (la implementa cost-domain, no el frontend):
`total_component_cost = quantity × (1 + waste_pct) × unit_price_snapshot`.

### `apu_calculation_snapshots`
1. **Tabla**: `apu_calculation_snapshots` 2. **Propósito**: foto inmutable del costo unitario de un APU para una versión de presupuesto.
3-5. **Columnas**:
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| apu_template_id | UUID | NOT NULL | FK apu_templates |
| estimate_version_id | UUID | NOT NULL | FK estimate_versions |
| calculated_unit_cost | NUMERIC(20,10) | NOT NULL | |
| components_json | JSONB | NOT NULL | detalle congelado |
| created_at | TIMESTAMPTZ | NOT NULL | |
6. PK `id`. 7. FK `apu_template_id`, `estimate_version_id`.
8. **ON DELETE**: apu_template RESTRICT; estimate_version CASCADE.
9. derivado vía `estimate_version_id`. 10. RLS por JOIN.
11. **Índices**: PK; UNIQUE `(apu_template_id, estimate_version_id)`.
12. **Integridad**: `calculated_unit_cost >= 0`.
13. **Enums**: —.
14. **Inmutabilidad**: ✅ total. RLS bloquea `UPDATE`/`DELETE`.
15. **Snapshot**: la tabla entera ES un snapshot.
16. 🔒 INTERNO: —. 17. **Dudas**: —.

### `estimates`
1. **Tabla**: `estimates` 2. **Propósito**: presupuesto de un alcance (contenedor de versiones).
3-5. **Columnas**:
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| project_scope_id | UUID | NOT NULL | FK project_scopes |
| code | TEXT | NOT NULL | |
| name | TEXT | NOT NULL | |
| status | TEXT | NOT NULL | DEFAULT 'draft' |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |
6-8. PK `id`; FK `project_scope_id → project_scopes(id)` ON DELETE CASCADE.
9. derivado vía `project_scope_id → projects`. 10. RLS por JOIN.
11. **Índices**: PK; `(project_scope_id)`; UNIQUE `(project_scope_id, code)`.
12. **Integridad**: `status IN ('draft','active','archived')`.
13. **Enums**: `status`.
14-15. —. 16. 🔒 INTERNO: —. 17. **Dudas**: —.

### `estimate_versions`
1. **Tabla**: `estimate_versions` 2. **Propósito**: versión congelable de un presupuesto (snapshot financiero).
3-5. **Columnas**:
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| estimate_id | UUID | NOT NULL | FK estimates |
| version_number | INTEGER | NOT NULL | |
| status | TEXT | NOT NULL | CHECK; DEFAULT 'draft' |
| created_by | UUID | NULL | FK profiles |
| created_at | TIMESTAMPTZ | NOT NULL | |
| approved_at | TIMESTAMPTZ | NULL | |
| notes | TEXT | NULL | |
6. PK `id`. 7. FK `estimate_id → estimates(id)`, `created_by → profiles(id)`.
8. **ON DELETE**: estimate CASCADE; created_by SET NULL.
9. derivado vía `estimate_id`. 10. RLS por JOIN.
11. **Índices**: PK; UNIQUE `(estimate_id, version_number)`; `(status)`.
12. **Integridad**: `version_number >= 1`.
13. **Enums**: `status IN ('draft','review','approved','issued','archived')`.
14. **Inmutabilidad**: ✅ cuando `status IN ('approved','issued','archived')`: RLS bloquea `UPDATE`/`DELETE` de la versión y de sus hijos (`chapters`, `boq_items`, `apu_calculation_snapshots`). No se recalcula. Cambios ⇒ nueva versión (clonación).
15. **Snapshot**: los hijos contienen `*_snapshot`.
16. 🔒 INTERNO: —. 17. **Dudas**: transición de estados (máquina de estados) la valida cost-domain.

### `chapters`
1. **Tabla**: `chapters` 2. **Propósito**: capítulo del presupuesto dentro de una versión.
3-5. **Columnas**:
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| estimate_version_id | UUID | NOT NULL | FK estimate_versions |
| code | TEXT | NOT NULL | |
| name | TEXT | NOT NULL | |
| sort_order | INTEGER | NOT NULL | DEFAULT 0 |
6-8. PK `id`; FK `estimate_version_id → estimate_versions(id)` ON DELETE CASCADE.
9. derivado. 10. RLS por JOIN.
11. **Índices**: PK; `(estimate_version_id, sort_order)`; UNIQUE `(estimate_version_id, code)`.
12. **Integridad**: —.
13. **Enums**: —.
14. **Inmutabilidad**: hereda de la versión (bloqueo si emitida).
15. **Snapshot**: —. 16. 🔒 INTERNO: —. 17. **Dudas**: —.

### `boq_items`
1. **Tabla**: `boq_items` 2. **Propósito**: ítem de presupuesto (actividad con cantidad y precio congelados).
3-5. **Columnas**:
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| estimate_version_id | UUID | NOT NULL | FK estimate_versions |
| chapter_id | UUID | NOT NULL | FK chapters |
| apu_template_id | UUID | NULL | FK apu_templates |
| quantity_group_id | UUID | NULL | FK quantity_groups |
| code | TEXT | NOT NULL | |
| description_snapshot | TEXT | NOT NULL | descripción congelada |
| unit_snapshot | TEXT | NOT NULL | unidad congelada |
| quantity_snapshot | NUMERIC(20,10) | NOT NULL | cantidad congelada |
| unit_price_snapshot | NUMERIC(20,10) | NOT NULL | precio unitario congelado |
| subtotal | NUMERIC(20,10) | NOT NULL | = quantity × unit_price |
| sort_order | INTEGER | NOT NULL | DEFAULT 0 |
| notes | TEXT | NULL | |
6. PK `id`. 7. FK `estimate_version_id`, `chapter_id`, `apu_template_id`, `quantity_group_id`.
8. **ON DELETE**: estimate_version CASCADE; chapter CASCADE; apu_template SET NULL; quantity_group SET NULL.
9. derivado vía `estimate_version_id`. 10. RLS por JOIN.
11. **Índices**: PK; `(estimate_version_id)`; `(chapter_id, sort_order)`; `(apu_template_id)`.
12. **Integridad**: `quantity_snapshot >= 0`; `unit_price_snapshot >= 0`; `subtotal >= 0`.
13. **Enums**: —.
14. **Inmutabilidad**: hereda de la versión. Los `*_snapshot` no cambian cuando cambia el catálogo maestro.
15. **Snapshot**: `description_snapshot`, `unit_snapshot`, `quantity_snapshot`, `unit_price_snapshot`.
16. 🔒 INTERNO: —. (subtotal y precio presupuestado son cliente-safe).
17. **Regla**: `subtotal = quantity_snapshot × unit_price_snapshot` (cost-domain).

### `indirect_cost_rules`
1. **Tabla**: `indirect_cost_rules` 2. **Propósito**: reglas de AIU/IVA por versión (configurable, no hardcodeado).
3-5. **Columnas**:
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| estimate_version_id | UUID | NOT NULL | FK estimate_versions |
| code | TEXT | NOT NULL | A, I, U, IVA... |
| name | TEXT | NOT NULL | |
| percentage | NUMERIC(20,10) | NOT NULL | fracción (ej. 0.035) |
| base_type | TEXT | NOT NULL | CHECK |
| sort_order | INTEGER | NOT NULL | DEFAULT 0 |
| visible_to_client | BOOLEAN | NOT NULL | DEFAULT true |
6-8. PK `id`; FK `estimate_version_id → estimate_versions(id)` ON DELETE CASCADE.
9. derivado. 10. RLS por JOIN.
11. **Índices**: PK; `(estimate_version_id, sort_order)`; UNIQUE `(estimate_version_id, code)`.
12. **Integridad**: `percentage >= 0`.
13. **Enums**: `base_type IN ('direct_cost','utility','custom')` (ej. IVA aplica sobre `utility`).
14. **Inmutabilidad**: hereda de la versión.
15. **Snapshot**: las tasas quedan congeladas con la versión.
16. 🔒 INTERNO: `percentage` solo si `visible_to_client = false`; el flag decide exposición.
17. **Dudas**: catálogo de `base_type` puede crecer (provisional).

---

## CANTIDADES

### `quantity_groups`
1. **Tabla**: `quantity_groups` 2. **Propósito**: grupo de cantidades (despiece) por alcance.
3-5. **Columnas**:
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| project_scope_id | UUID | NOT NULL | FK project_scopes |
| code | TEXT | NOT NULL | |
| name | TEXT | NOT NULL | |
| unit | TEXT | NOT NULL | |
| calculation_mode | TEXT | NOT NULL | CHECK |
| created_at | TIMESTAMPTZ | NOT NULL | |
6-8. PK `id`; FK `project_scope_id → project_scopes(id)` ON DELETE CASCADE.
9. derivado vía `project_scope_id → projects`. 10. RLS por JOIN.
11. **Índices**: PK; `(project_scope_id)`; UNIQUE `(project_scope_id, code)`.
12. **Integridad**: —.
13. **Enums**: `calculation_mode IN ('direct','length','area','volume','custom')`.
14-15. —. 16. 🔒 INTERNO: —. 17. **Dudas**: —.

### `quantity_lines`
1. **Tabla**: `quantity_lines` 2. **Propósito**: línea de despiece geométrico (largo × ancho × alto × multiplicador, etc.).
3-5. **Columnas**:
| Columna | Tipo | Null | Notas |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| quantity_group_id | UUID | NOT NULL | FK quantity_groups |
| description | TEXT | NULL | |
| length | NUMERIC(20,10) | NULL | |
| width | NUMERIC(20,10) | NULL | |
| height | NUMERIC(20,10) | NULL | |
| multiplier | NUMERIC(20,10) | NOT NULL | DEFAULT 1 |
| direct_quantity | NUMERIC(20,10) | NULL | usado si formula_type='direct' |
| formula_type | TEXT | NOT NULL | CHECK |
| calculated_quantity | NUMERIC(20,10) | NOT NULL | resultado (dominio) |
| notes | TEXT | NULL | |
| sort_order | INTEGER | NOT NULL | DEFAULT 0 |
6-8. PK `id`; FK `quantity_group_id → quantity_groups(id)` ON DELETE CASCADE.
9. derivado. 10. RLS por JOIN.
11. **Índices**: PK; `(quantity_group_id, sort_order)`.
12. **Integridad**: `multiplier >= 0`.
13. **Enums**: `formula_type IN ('direct','length','area','volume','custom')`.
14-15. —. 16. 🔒 INTERNO: —.
17. **Reglas de cálculo** (cost-domain/quantities, no frontend):
- `direct`: `calculated_quantity = direct_quantity`
- `length`: `length × multiplier`
- `area`: `length × width × multiplier`
- `volume`: `length × width × height × multiplier`
- `custom`: fórmula controlada documentada.

---

# ENTIDADES PROVISIONALES v0 — NO congeladas durante Oleada 1

> **Provisional v0 — no congelada durante Oleada 1.** Estructura conceptual
> para previsión de impacto. No implementar todavía. Se congelarán en sus
> oleadas (Planning/Ejecución/Compras/Actas).

- **`schedule_tasks`** — tareas de cronograma; vínculo opcional a `boq_item_id`; `parent_task_id`; fechas, `duration_days`, `progress_pct`, `is_milestone`, `responsible_user_id`. (Oleada 3 / planning)
- **`task_dependencies`** — `predecessor_task_id`, `successor_task_id`, `dependency_type IN (finish_to_start,start_to_start,finish_to_finish,start_to_finish)`, `lag_days`. (Oleada 3)
- **`progress_updates`** — avance reportado por tarea; `reported_date`, `progress_pct`, `executed_quantity`. (Oleada 3)
- **`purchase_records`** — compras reales; `supplier_id`, `invoice_reference`, `total_amount`. 🔒 datos de compra. (Oleada 4 / pricing)
- **`purchase_items`** — líneas de compra; `actual_unit_price`, `actual_total`. 🔒. (Oleada 4)
- **`change_orders`** — actas de modificación; `status`, fechas. (Oleada 4)
- **`change_order_items`** — `original_quantity`, `variation_quantity`, `adjusted_quantity`, `unit_price_snapshot`, `adjusted_total`. (Oleada 4)

Métricas de ahorro (derivadas, dominio, 🔒 INTERNO). **Q8 RESUELTA
(2026-05-30)** — base del descuento = `online_public_price`:
`budget_reference_price = online_public_price × (1 + preventive_variation_pct)`;
`expected_purchase_price = online_public_price × (1 − negotiated_discount_pct)`;
`projected_saving = budget_reference_price − expected_purchase_price`;
`realized_saving = budget_reference_price − actual_purchase_price`.
Excepciones de base configurables por proveedor/producto. Ver `docs/DECISIONS.md`.

---

## Histórico de cambios

| Fecha | Cambio | Migración | Autor |
|-------|--------|-----------|-------|
| 2026-05-29 | Documento inicializado | — | orchestrator |
| 2026-05-29 | **Contrato congelado v1** (20 entidades Oleada 1 + 7 provisionales) | — | orchestrator |
| 2026-05-30 | **Q8/Q9 RESUELTAS** (base descuento = `online_public_price`; redondeo `ROUND_HALF_UP` solo presentación). Afectan cálculo, no esquema | — | orchestrator (Oleada 1.5) |

---

## Planning — entidades congeladas v1 (Oleada 3B)

Esquema NUEVO de planificación/cronograma. Contrato detallado:
`docs/PLANNING_CONTRACT.md §1`. Todas con `organization_id` + **RLS FORCE**
(helper `app.current_org()`), UUID PK, índices por proyecto/organización/fechas.

- **`schedule_tasks`**: tareas/WBS del cronograma. FK a `projects`/`project_scopes`/
  `chapters`/`schedule_tasks`(parent). `planned_start/end` (DATE),
  `planned_duration_days` NUMERIC(12,4), `progress_pct` NUMERIC(7,4) CHECK 0..100,
  `status IN ('not_started','in_progress','completed','blocked','cancelled')`,
  `is_milestone` (hito ⇒ duración 0), `wbs_code`, `external_reference` (🔒).
- **`task_dependencies`**: predecesora→sucesora. `dependency_type IN
  ('FS','SS','FF','SF')`, `lag_days` NUMERIC(12,4). CHECK no autodependencia;
  UNIQUE (predecessor,successor). Ciclos se detectan en el dominio.
- **`progress_entries`**: histórico de avance **append-only** (sin UPDATE/DELETE
  por RLS). `physical_progress_pct` CHECK 0..100; `financial_progress_pct` (🔒,
  derivado server-side); `created_by` (🔒).
- **`resource_assignments`**: recursos/MO por tarea. FK a `resources`/`labor_roles`.

Reglas: hitos con duración 0; no recalcular presupuesto emitido; avance financiero
derivado server-side (sin float); campos `wbs_code`/`dependency_type`/`lag_days`/
`external_reference` reservados para export MS Project futuro (no en 3B).

| Fecha | Cambio | Migración | Autor |
|-------|--------|-----------|-------|
| 2026-05-31 | **Planning congelado v1** (`schedule_tasks`, `task_dependencies`, `progress_entries`, `resource_assignments`) — Oleada 3B | (db-rls) | orchestrator |
| 2026-06-01 | **Auth/RLS por identidad (Oleada 4A.1)** — helpers de identidad real (`auth.uid()`→`profiles`) con compat demo; membresía single-org reutilizando `profiles` (sin tablas nuevas). Ver `docs/AUTH_CONTRACT.md` | (db-rls) | orchestrator |
| 2026-06-01 | **Integración 4A.1** (merge `adeafbe`) — helpers de identidad real integrados; RLS runtime 47/47; reutiliza `profiles`/`organizations` (sin tablas nuevas) | (db-rls) | orchestrator |
