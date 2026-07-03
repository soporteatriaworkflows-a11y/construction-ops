# V5.6.5A — PROJECT_SCOPED_RLS_GAP_CLOSURE (contrato de fase)

**Fecha:** 2026-07-03 · **Owner:** agent-orchestrator (Program Owner + Security
Architect) · **Estado:** implementado EN RAMA (PR draft), validado contra
Postgres local; **NO aplicado a Supabase Cloud** (compuerta
`V5_6_5A_DB_APPLY_GATE`).

Base verificada: `origin/main = bdaa9cf` (post merge PR #30, V5.6.4 modelo +
migraciones; PR #31 enforcement/UI aún sin merge).
Rama: `feature/v5-6-5a-project-scoped-rls-gap-closure`
(worktree `construction-ops-v565a`).

Relación con V5.6.4: cierra las DOS deudas registradas en
`docs/OPEN_QUESTIONS.md` §V5_6_4_CLIENT_PROJECT_SCOPE:

- **`V5_6_5_CLIENT_RLS_FULL_CHAIN`** — tablas con `organization_id` directo
  que no heredan el patch de `projects_select`.
- **`V5_6_5_CONSULTA_WRITE_HARDENING`** — políticas de escritura org-scoped
  sin check de rol.

Decisiones aprobadas aplicadas (2026-07-02): `consulta` como cliente externo
NO ve APU; `consulta` sin grants ve 0 proyectos; los grants aplican al rol
`consulta` (PostgREST) y al ViewerRole `client` (read-model); regla global 4
(descuentos internos jamás a clientes); seguridad de cliente externo tiene
prioridad sobre funcionalidades nuevas. Sin contratistas, financiero, Omni ni
V5.7B.

---

## 1. Diagnóstico técnico

V5.6.4 parchó `projects_select` para que los roles cliente (`consulta` vía
PostgREST → `profiles.role`; `client` vía claim `user_role` de las lecturas
RLS-scoped del read-model) solo vean proyectos con grant
(`app.has_project_grant`). Las tablas cuya política SELECT deriva por
`EXISTS (... FROM projects ...)` **cascadan automáticamente**: al ocultarse el
proyecto se ocultan sus hijos. Quedaban tres brechas:

1. **SELECT org-scoped sin cascada** — planning (`planning_schedules`,
   `schedule_tasks`, `task_dependencies`, `progress_entries`,
   `resource_assignments`) y cantidades nuevas (`quantity_workspace_groups/
   lines`, `quantity_takeoff_groups/lines`, `quantity_import_batches`) usan
   `organization_id` directo: un `consulta` con JWT válido leía por PostgREST
   la totalidad de planning y cantidades de la organización, incluidos
   proyectos NO asignados. Lo mismo aplicaba a tablas internas sin propósito
   para cliente (catálogo, precios/descuentos, APU, notas internas).
2. **Escrituras org-scoped sin check de rol** — p. ej. `projects_update`,
   `resources_*`, `estimates_all` (FOR ALL), `chapters_*`, planning: un
   `consulta` técnico podía MUTAR filas vía PostgREST directo (gap
   pre-existente a V5.6.4, documentado allí).
3. **Hallazgo P0 nuevo (cerrado en esta fase)** — la política
   `profiles_update` permite a cualquier rol editar su PROPIA fila con
   `WITH CHECK (admin OR id = self)`, sin proteger `profiles.role`:
   `UPDATE profiles SET role='admin' WHERE id=<self>` vía PostgREST era una
   **auto-escalación de privilegios** para cualquier rol no-admin. Contrato
   descubierto al validar: el UPDATE directo de la fila de un TERCERO ya
   afectaba 0 filas (desde `profiles_self_select`, migración
   `20260602130000`, la lectura de columnas del WHERE exige visibilidad
   SELECT, que es self-only — por eso existe la RPC `change_member_role`).
   El hueco real era exclusivamente la fila PROPIA.

## 2. Solución (2 migraciones, solo políticas/función/trigger)

Sin cambios de tablas, columnas ni datos. Sin `service_role`. RLS/FORCE ya
activos en todas las tablas (FORCE count se mantiene en **43**).

### 2.1 `20260702100000_v5_6_5a_client_rls_full_chain.sql`

- Helper **`app.is_client_role()`**: `COALESCE(app.current_role(),'') IN
  ('consulta','client')`. Cubre ambas vías de identidad. Con rol NULL devuelve
  false, pero toda política exige además `organization_id =
  app.current_org()`, que con NULL deniega (deny-by-default intacto).
- **Cadena project-scoped (9 tablas)** — la política SELECT exige, SOLO para
  roles cliente, que el proyecto padre sea visible vía `EXISTS` sobre
  `projects` (o sobre una tabla intermedia ya project-scoped). La RLS de
  `projects` aplica DENTRO del `EXISTS` ⇒ cascada automática de grants sin
  duplicar lógica. Para roles internos el predicado corto-circuita en
  `NOT app.is_client_role()` y el comportamiento queda EXACTAMENTE igual.
- **Deny total de SELECT a cliente (19 tablas internas)** — catálogo, precios
  y descuentos, APU, procedencia de imports y notas internas: `AND NOT
  app.is_client_role()` en el USING del SELECT.
- Toda referencia a columnas de la fila objetivo dentro de un `EXISTS` va
  calificada `tabla.columna` (lección del shadowing, `20260627093000`).

### 2.2 `20260702100100_v5_6_5a_consulta_write_hardening.sql`

- **Split de 6 políticas FOR ALL** (`project_scopes_all`, `estimates_all`,
  `quantity_groups_all`, `quantity_lines_all`, `supplier_products_all`,
  `apu_components_all`) en select/insert/update/delete con el predicado
  EXISTS textual actual; las tres de escritura añaden
  `NOT app.is_client_role()`; en `supplier_products` y `apu_components` el
  SELECT también lo añade (catálogo/APU internos).
- **Guard `NOT app.is_client_role()` en ~41 políticas de escritura
  existentes** (INSERT: WITH CHECK; UPDATE: USING y WITH CHECK; DELETE:
  USING), conservando intactos los guards de inmutabilidad
  (`status NOT IN ('approved','issued','archived')`,
  `app.estimate_version_locked`, `app.estimate_version_in_org`) y los
  `EXISTS` cross-org: `organizations_update`; `projects_*`; `resources_*`;
  `suppliers_*`; `pricing_rules_*`; `labor_roles_*`; `apu_templates_*`;
  `estimate_versions_*`; `chapters_*`; `boq_items_*`;
  `indirect_cost_rules_*`; `apu_calc_snapshots_insert`;
  `price_observations_insert`; `schedule_tasks_*`; `task_dependencies_*`;
  `progress_entries_insert`; `resource_assignments_*`;
  `planning_schedules_insert/_update`. Total del archivo: ~65 políticas
  entre split y guard.
- **Trigger `profiles_guard_privileged_cols`** (BEFORE UPDATE en `profiles`):
  si `current_user = 'authenticated'` (API de datos/app) y cambia
  `role` u `organization_id`, exige actor `admin|gerencia`; `gerencia` nunca
  hacia/desde `admin` (paridad con `change_member_role`). Las RPC
  SECURITY DEFINER (`change_member_role`, `accept_invitation`), migraciones y
  seeds quedan exentas (corren como su owner, `current_user <>
  'authenticated'`). El resto del perfil propio (`full_name`, …) sigue
  editable.
- NO tocadas (ya role-gated, excluyen `consulta`): `quantity_workspace_*`
  (escrituras admin/gerencia/presupuestos), `quantity_takeoff_*`/import
  (admin/gerencia), `quick_notes` insert/update, monitores
  (`pmt/pmr/pms`), `rpo`, `pob/poba`, `price_observations_update_approval`,
  `profiles_insert/_delete` (admin), invitaciones/audit/grants (solo RPC).

## 3. Matriz de tablas

Leyenda: S/I/U/D = operación afectada en esta fase. "Cascada" = hereda el
patch de `projects_select` sin tocar su política.

### 3.1 Project-scoped para cliente (SELECT reescrito; escrituras endurecidas)

| Tabla | Riesgo previo | ¿Cascada por projects? | ¿Patch RLS? | Ops | Tratamiento V5.6.5A |
|---|---|---|---|---|---|
| planning_schedules | cronogramas de TODA la org visibles a consulta | NO (org directo) | Sí | S,I,U | SELECT vía EXISTS projects (project_id); escrituras `NOT is_client_role` (DELETE sigue sin política) |
| schedule_tasks | tareas/costos de planning org-wide | NO | Sí | S,I,U,D | SELECT vía EXISTS projects (project_id); escrituras guard |
| task_dependencies | estructura del plan org-wide | NO | Sí | S,I,U,D | SELECT vía EXISTS schedule_tasks (sucesora, ya scoped); escrituras guard |
| progress_entries | avance físico org-wide | NO | Sí | S,I | SELECT vía EXISTS schedule_tasks (task_id); INSERT guard (append-only se conserva) |
| resource_assignments | asignaciones org-wide | NO | Sí | S,I,U,D | SELECT vía EXISTS schedule_tasks (task_id); escrituras guard |
| quantity_workspace_groups | mediciones org-wide | NO | Sí (solo S) | S | SELECT vía EXISTS project_scopes→projects; escrituras ya role-gated |
| quantity_workspace_lines | dimensiones/cálculo org-wide | NO | Sí (solo S) | S | SELECT vía EXISTS qwg (cascada intermedia); escrituras ya role-gated |
| quantity_takeoff_groups | memorias importadas org-wide | NO | Sí (solo S) | S | SELECT vía EXISTS estimate_versions (cascada); versión NULL ⇒ invisible para cliente (fail-closed) |
| quantity_takeoff_lines | detalle de medición org-wide | NO | Sí (solo S) | S | SELECT vía EXISTS qtg; escrituras ya role-gated |

### 3.2 Deny total de SELECT a cliente (internas; escrituras ya gated o con guard)

| Tabla | Riesgo previo | ¿Cascada? | ¿Patch RLS? | Ops | Tratamiento |
|---|---|---|---|---|---|
| quantity_import_batches | procedencia de imports (sin vínculo a proyecto) | NO | Sí | S | deny cliente |
| quick_notes | notas INTERNAS (contrato V5.4.2a) con posible project/estimate | NO | Sí | S | deny cliente (gate app-side ya existía) |
| apu_templates | recetario APU completo (decisión: consulta NO ve APU) | NO | Sí | S,I,U,D | deny SELECT cliente + guard escrituras |
| apu_components | composición/costos APU | NO (JOIN a apu_templates) | Sí | S,I,U,D | split FOR ALL; SELECT y escrituras deny cliente |
| apu_calculation_snapshots | desglose financiero APU por versión | Sí (estimate_version_in_org) | Sí | S,I | deny SELECT cliente (bloque `[V5.6.5A-SNAPSHOTS]`; **verificado por readmodel-agent: 0 lecturas en la app** — deny seguro); INSERT guard |
| apu_import_batches | procedencia imports APU | NO | Sí | S | deny cliente |
| apu_component_resource_actions | auditoría de reconciliación APU | NO | Sí | S | deny cliente |
| apu_manual_actions | auditoría builder APU | NO | Sí | S | deny cliente |
| resources | catálogo interno con costos de referencia | NO | Sí | S,I,U,D | deny SELECT cliente + guard escrituras |
| labor_roles | tarifas internas de mano de obra | NO | Sí | S,I,U,D | idem |
| suppliers | proveedores internos | NO | Sí | S,I,U,D | idem |
| supplier_products | productos/precios por proveedor | NO (JOIN suppliers) | Sí | S,I,U,D | split FOR ALL; SELECT y escrituras deny cliente |
| pricing_rules | **descuentos internos** (regla global 4) | NO | Sí | S,I,U,D | deny SELECT cliente + guard escrituras |
| price_observations | histórico de precios observados | NO (JOIN) | Sí | S,I | deny SELECT cliente + guard INSERT (append-only intacto) |
| resource_price_observations | inteligencia de precios | NO | Sí | S | deny cliente (escrituras ya gated) |
| price_monitor_targets/runs/results | monitoreo de precios | NO | Sí | S | deny cliente (escrituras ya gated) |
| price_observation_batches | lotes de revisión de precios | NO | Sí | S | deny cliente |
| price_observation_bulk_actions | acciones de revisión | NO | Sí | S | deny cliente |

### 3.3 Ya cascadas (SELECT sin cambio; escrituras endurecidas)

| Tabla | ¿Cascada por projects? | Ops en V5.6.5A | Tratamiento |
|---|---|---|---|
| project_scopes | Sí | I,U,D | split FOR ALL; SELECT intacto; escrituras `NOT is_client_role` |
| estimates | Sí | I,U,D | idem |
| quantity_groups / quantity_lines | Sí | I,U,D | idem |
| estimate_versions | Sí | I,U,D | guard añadido; inmutabilidad emitidos intacta |
| chapters / boq_items / indirect_cost_rules | Sí | I,U,D | guard añadido; `estimate_version_locked` intacto |
| projects | (raíz, patch V5.6.4) | I,U,D | guard añadido |
| organizations | (self) | U | guard añadido |
| profiles | (self-select) | U | trigger anti-escalación (ver §1.3) |

## 4. Anti-fuga y anti-fail-open

- Para el rol cliente, una fila de un proyecto no asignado simplemente NO
  EXISTE (0 filas), igual que datos de otra organización. Sin mensajes de
  permiso a nivel de entidad.
- Sin grants ⇒ **0 filas en TODA la cadena**: verificado por el harness
  (sección [FC], check FC1 sobre 19 tablas: planning completo, workspace,
  takeoff, import batches, quick_notes, APU, catálogo y precios).
- Un takeoff group sin `estimate_version_id` (huérfano) es invisible para el
  cliente: fail-closed, no fail-open.
- `app.is_client_role()` con rol NULL ⇒ false, pero `current_org()` NULL ya
  deniega todo (deny-by-default previo intacto).

## 5. Impacto en la app (informe readmodel-agent, solo lectura)

- Identidad: `withTenantDb` fija claims con `user_role = ViewerRole`
  (`consulta → 'client'`, `role-map.ts`); los repos de planning y
  quantity-workspace usan el server client de Supabase (JWT real ⇒
  `profiles.role = 'consulta'`). `app.is_client_role()` cubre ambas vías.
- `apu_calculation_snapshots`: **0 lecturas en la app** (solo definición en
  `lib/db/schema.ts`) — deny seguro.
- Degradaciones cosméticas para `consulta` (no crashes; lecturas tipo lista
  devuelven menos/0 filas): semáforo de readiness y contadores del anexo APU
  en el detalle de estimate mostrarán "sin APU"; `/apu` queda vacío hasta que
  PR #31 retire `apu` de la matriz para consulta.
- **Cierre de fuga vigente**: `GET /api/estimates/export` en main no tiene
  anti-escalada de perfil (a diferencia de `/api/exports`); un consulta podía
  pedir `kind=apu&profile=technical` y obtener el anexo APU completo. Con
  V5.6.5A el anexo queda vacío/error controlado a nivel DB. Pendiente
  cosmético: devolver 4xx limpio (no bloqueante).
- Dependencia: en main, `toViewerContext` no acarrea `profileId` ⇒ las
  lecturas del read-model para client van sin claim `sub` y `consulta` ve 0
  incluso con grants (fail-closed, seguro pero disruptivo). PR #31 añade el
  acarreo. De ahí el orden de release (§6).

## 6. Orden de release OBLIGATORIO

1. **Merge + deploy de PR #31** (enforcement/UI V5.6.4: matriz sin `apu` para
   consulta, anti-escalada de export, acarreo `profileId→sub`).
2. **Compuerta `V5_6_5A_DB_APPLY_GATE`**: aplicar `20260702100000` +
   `20260702100100` a Supabase Cloud (db push autorizado) + post-verify
   (políticas presentes, helper y trigger creados, smoke).
3. Validación manual `consulta` (0/1/N grants): planning y cantidades solo del
   proyecto asignado; APU/precios/notas en 0 vía PostgREST; escrituras
   directas denegadas; auto-cambio de rol imposible.

> **NO entregar cuentas `consulta` a clientes externos reales antes de
> completar el paso 2.** (Regla heredada de V5.6.4 §3; esta fase la
> satisface una vez aplicada la migración.)

## 7. QA de esta fase (local)

- `supabase db reset --local`: las 2 migraciones aplican limpias sobre la
  cadena completa (55 migraciones).
- Harness RLS runtime (`scripts/rls-runtime/run.ts`): **328 PASS / 0 FAIL**.
  Baseline previo 277/0 INTACTO (cero regresión interna); sección nueva
  `[FC]` con 51 checks: anti-fail-open (19 tablas), grant simple/múltiple,
  paridad claim `client`, cascadas intermedias (lines→groups,
  dependencies→tasks), takeoff huérfano fail-closed, deny APU/precios/notas
  con grant activo, internos sin regresión (admin/obra/presupuestos),
  escrituras de consulta denegadas (7 casos), anti-escalación de profiles
  (5 casos incl. RPC exenta y contrato de terceros 0-filas).
- `pnpm typecheck` baseline: 0 errores (sin cambios de app en esta fase).
- FORCE count: 43 (sin tablas nuevas).

## 8. Qué NO se hizo (fuera de alcance, intencional)

- NO se tocó Supabase Cloud, ni db push, ni Vercel/envs/DATABASE_URL/SMTP.
- NO se tocó PR #31 ni la matriz `module-access.ts` (app intacta).
- NO se restringieron roles INTERNOS entre sí (p. ej. `obra` escribiendo
  catálogo): fuera del alcance cliente-externo; queda como pregunta abierta
  en OPEN_QUESTIONS si se desea una matriz de escritura interna por rol.
- NO se protegió `profiles.email` en el trigger (cambiarlo no escala
  privilegios; desincronización con auth.email es un tema de integridad
  aparte).
- NO se mezcló contratistas/financiero/Omni/V5.7B ni avance de obra.
