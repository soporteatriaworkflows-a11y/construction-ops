# V5.6.6C — INTERNAL_PROJECT_GRANTS (contrato de fase)

**Fecha:** 2026-07-04 · **Owner:** agent-orchestrator · **Estado:** EN RAMA
(PR local), validado contra Postgres local; **NO aplicado a Supabase Cloud**
(compuerta `V5_6_6C_DB_APPLY_GATE`).

Base: `origin/main = b487028` (post V5.6.6B). Rama:
`feature/v5-6-6c-internal-project-grants` (worktree construction-ops-v566c).
Matriz oficial: `docs/design-references/V5_6_6_ROLE_MATRIX.md`.

## 1. Decisiones aprobadas implementadas

1. `obra` scoped por proyecto (deny-by-default sin asignación).
2. `compras` scoped por proyecto según asignación de admin/gerencia.
3. `presupuestos`, `admin`, `gerencia`: allow-all (sin cambio).
4. `consulta/client`: conserva el scoping V5.6.4/V5.6.5A intacto.
5. Se REUTILIZA `project_access_grants` (sin modelo paralelo): misma tabla,
   mismas RPCs, misma auditoría, misma UI de asignación.
6. Backfill de continuidad para obra/compras existentes; usuarios nuevos de
   esos roles nacen con 0 proyectos.
7. El rol DB sigue siendo `consulta` (sin rol `cliente`).

## 2. Migraciones (locales, gated)

**`20260703090000_v5_6_6c_internal_grants.sql`**
- `grant_project_access`: el destinatario puede ser `consulta`, `obra` o
  `compras`; los allow-all se rechazan con `grants_only_for_scoped_roles`
  (reemplaza `grants_only_for_consulta`). `revoke_project_access` sin cambios.
- Backfill único: cada obra/compras existente recibe grants a los proyectos
  actuales de su organización (`granted_by NULL` = sistema; auditado con
  `metadata.backfill=true` y `metadata.phase='v5_6_6c'`, distinguible del
  backfill V5.6.4). Idempotente (`ON CONFLICT DO NOTHING`); no-op en bases
  recién creadas (harness: migraciones antes que seeds).

**`20260703090100_v5_6_6c_scoped_role_rls.sql`**
- Helper `app.is_scoped_role()`: `consulta`,`client`,`obra`,`site`,`compras`.
- `projects_select`: rol scoped ⇒ solo proyectos con `has_project_grant`
  (cascada automática a scopes/estimates/versions/chapters/boq/quantities,
  igual que V5.6.4).
- Las 9 políticas SELECT project-chain de V5.6.5A (planning ×5, workspace ×2,
  takeoff ×2) cambian su corto-circuito de `is_client_role()` a
  `is_scoped_role()`: cuerpos idénticos, conjunto ampliado.
- Los deny totales de V5.6.5A (APU/precios/notas/imports, `is_client_role`)
  NO cambian: compras conserva catálogo/proveedores/monitoreo y obra sus
  lecturas operativas.

**Nota de claims (defensa en profundidad):** la vía PostgREST directa (riesgo
real: JWT del usuario) resuelve `current_role()` = `profiles.role`
(`obra`/`compras`) ⇒ scoped en DB. La vía read-model envía ViewerRole: obra
(`site`) queda scoped también en DB; compras colapsa en `internal` (no
distinguible del resto sin romper la paridad de claims), y su corte en la app
lo hace el choke point de grants del read-model (`projectGrants` en el
viewer). Ambos roles quedan cubiertos por al menos dos barreras.

## 3. App-layer

- `server/auth/types.ts`: `SCOPED_PROFILE_ROLES = [consulta, obra, compras]`
  + `isScopedProfileRole()`.
- `resolve-viewer.ts`: los roles scoped resuelven sus grants RLS-bound
  (fail-closed: error ⇒ []); `toViewerContext` normaliza fail-closed también
  para scoped sin grants resueltos.
- `server/read-model/project-grants.ts` (helper puro): el alcance depende de
  los GRANTS, no del ViewerRole — una lista restringe a cualquier rol; `'all'`
  no restringe; `undefined` es fail-closed solo para `client` (paridad
  V5.6.4/literales demo). Fixture y exports heredan por reuso del helper.
- `settings/access` (members-table): la celda "Proyectos" con asignación por
  RPC ahora aplica a consulta, obra y compras; los allow-all muestran
  "Todos (allow-all)".
- Empty states amables ("Aún no tienes proyectos asignados") en `/projects` y
  dashboard para cualquier rol scoped sin grants.

## 4. Comportamiento final por rol

- admin/gerencia/presupuestos: todos los proyectos (sin cambio alguno).
- obra: solo proyectos asignados (0 sin grants), planning/cantidades solo de
  esos proyectos; sigue sin editar presupuesto/AIU (V5.6.6B).
- compras: solo proyectos asignados; catálogo/proveedores/monitoreo completos
  sin necesidad de grants; sigue sin editar presupuesto/AIU (V5.6.6B).
- consulta/client: exactamente igual que V5.6.4/V5.6.5A.
- Anti-fuga: URL directa / SELECT por id de un proyecto no asignado responde
  igual que uno inexistente (0 filas / not-found).

## 5. Validación (local)

Harness RLS `scripts/rls-runtime/run.ts`: **346 PASS / 0 FAIL** tras
`supabase db reset --local`. Sección nueva `[IG]` (17 checks): obra 0/1/N
grants + paridad claim `site`; compras 0/1 grants + dominio catálogo intacto
+ BOQ inalcanzable sin grant (0 filas); presupuestos/admin/gerencia
allow-all; consulta intacta; anti-fuga de existencia; RPC acepta obra/compras
y rechaza allow-all (flip documentado de GR9); el check FC de "interno
org-wide" pasó de obra a presupuestos (obra ahora es scoped).

Incidente de recovery documentado: un fallo transitorio del contenedor local
(`permission denied for function _reconcile_apu_component_row`) se clasificó
como NO reproducible tras comparar ACLs y correr main puro vs rama — no es
deuda ni regresión; sin hotfix.

## 6. Orden de release (futuro, requiere autorización)

1. Merge del PR (sin efecto runtime hasta migraciones: el app-layer es
   fail-closed pero los roles scoped sin tabla actualizada simplemente
   conservan el comportamiento actual org-wide en DB hasta el gate).
2. **`V5_6_6C_DB_APPLY_GATE`**: aplicar las 2 migraciones a
   `construction-ops-prod` (backfill incluido) + post-verify + smoke.
   Reportar conteos del backfill (grants creados por obra/compras).
3. Validación manual: obra/compras 0/1/N grants; asignación desde
   /settings/access; empty states.

Nota de secuencia inversa a V5.6.4: aquí el app-layer puede desplegarse antes
que la migración SIN corte para obra/compras (resolve-viewer leerá 0 grants →
fail-closed 0 proyectos SOLO si la RPC/backfill no están; por eso el ORDEN
recomendado es migraciones ANTES del deploy del app-layer, o en la misma
ventana). Detalle: sin migración, la lectura de grants de obra/compras
devuelve las filas que existan (ninguna) ⇒ 0 proyectos. El backfill es lo que
garantiza continuidad ⇒ **aplicar gate y deploy en la misma ventana**.
