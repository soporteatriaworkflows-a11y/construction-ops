# Preguntas abiertas y blockers

## BLOCKERS activos

_Sin blockers activos._

> **Nota 2026-06-15 (SCHEDULE_PREVIEW_READMODEL_ROOT_CAUSE_V4):** causa raíz REAL
> del preview "muerto" tras V3 identificada y corregida: `loadGeneratorSource` no
> coercía `numeric` a `DecimalString`; con `numeric` serializado como número JS por
> PostgREST, la suma de rendimiento APU (`string.split`) lanzaba `TypeError` no
> tipado → mensaje genérico. Alineado con el read-model probado (quantity-workspace
> `String(...)`). Generador endurecido (datos imperfectos → warnings, no excepción)
> + capítulo sintético "Sin capítulo" + UX de error preciso + código seguro
> `SCHEDULE_PREVIEW_READMODEL_FAILED`. Sin migración. Sin blockers al cierre.
> **Pendiente de verificación en producción tras release** (ver abajo).

> **Nota 2026-06-14 (SCHEDULE_PREVIEW_CREATE_PROD_FIX_V2):** 3 causas de fallo
> silencioso en `/planning/new` resueltas: (1) `mapWriteError` fallthrough → ahora
> siempre devuelve `ScheduleValidationError`; (2) errores de lectura del repo
> `planning_*_read_failed` ahora cubiertos por `toSafeErrorMessage` en actions.ts;
> (3) nodemailer warning eliminado del build (`webpackIgnore` + `serverExternalPackages`).
> Sin blockers al cierre. Pendiente: revisión visual autenticada en producción tras
> el siguiente release autorizado.

> **Nota 2026-06-14 (SCHEDULE_FROM_BOQ_V1 — COMPLETA, Fases 0–8):** la
> planificación se implementó **extendiendo la fundación 3B** (decisión aprobada).
> Todas las fases completas, validadas y comiteadas (`c795b9f`→`3214ce6`); **rama
> publicada `origin/feature/schedule-from-boq-v1`** (sin merge/deploy/db push
> remoto). Validación: suite 1715/0, RLS harness 258/0, isolation 12/0, gm 22/22,
> gm:import PASS, smoke 7/7, agents 214/0. **Deuda nueva
> `SCHEDULE_ROLE_COMPRAS_SEPARATION_V2`:** la UI gatea por ViewerRole (`internal`
> incluye `compras`) y muestra el CTA "Crear cronograma", pero el RPC lo rechaza
> con `app.current_role()` (solo admin/gerencia/presupuestos). Separar `compras`
> a nivel UI requiere un check de `profile.role` server-side; sin contrato no se
> amplía. **Deudas registradas en esta oleada (no bloquean):**
> `SCHEDULE_CRITICAL_PATH_V2`, `SCHEDULE_BASELINE_V2`,
> `SCHEDULE_EXPORT_PDF_EXCEL_V1`, `MS_PROJECT_EXPORT_XML_V1`,
> `RESOURCE_LEVELING_V2`, `SCHEDULE_COMPARE_WITH_BOQ_V2`, `SCHEDULE_AUDIT_LOG_V2`,
> `APU_ADVANCED_EDITOR_V2`, `APU_VERSIONING_V1`. **Pregunta abierta para Fase 3:**
> el encoding APU colapsa `quantity_labor = rendimiento_días × integrantes`, por
> lo que la duración-calendario exacta no es recuperable sin tamaño de cuadrilla;
> V1 usa `crew_size` (default 1, editable) y `productivity_source`
> apu/manual/unknown — sin inventar duración exacta. Confirmar con la usuaria si
> el default de `crew_size` debe ser configurable por organización/proyecto.

> **Nota 2026-06-14 (DASHBOARD_ACCESS_NAV_AND_PRICING_KPI_HOTFIX_V1):** copy
> stale "Oleada 3A — modo fixture activo" corregido. Nav "Accesos": la arquitectura
> ya estaba correcta; si el sidebar sigue sin mostrar "Accesos" en producción
> tras el deploy de este hotfix → revisar logs de Vercel para confirmar si
> `resolveCanManageAccess()` está lanzando error silente (el catch captura
> cualquier excepción y retorna false; el guard backend `/settings/access` sigue
> activo independientemente del sidebar). **Deuda: `SCHEDULE_FROM_BOQ_V1`**
> (cronograma tipo MS Project desde presupuesto) registrada como siguiente oleada.
> Sin blockers activos al cierre.

> **Nota 2026-06-14 (QUANTITY_IMPORT_PERSISTENCE_HOTFIX_V1):** blocker
> "importación no guarda nada" resuelto. Los datos sí se persistían en
> `quantity_takeoff_groups`; el problema era de visibilidad (familia de tablas
> distinta a la que leía `/quantities`) + falta de `revalidatePath`.
> **Nuevo blocker resuelto en esta sesión; sin blockers activos al cierre.**
> Deuda registrada: `QUANTITY_IMPORT_BATCH_DETAIL_V1` (vista detalle por lote).

> **Nota 2026-06-13 (QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1):** sin blockers nuevos.
> Deudas registradas en esta oleada (no bloquean): `SCHEDULE_FROM_BOQ_V1`
> (cronograma desde BOQ: capítulos/ítems/cantidades/rendimientos APU/cuadrillas/
> duraciones/dependencias/ruta crítica/Gantt — UI ya muestra mensaje honesto),
> `QUANTITY_WORKSPACE_RLS_HARNESS_V1` (checks dedicados del workspace en el RLS
> runtime harness; hoy cubierto por preflight FORCE=38 + paridad de guards con
> `add_apu_to_boq`/`update_boq_item_quantity`), `EXPORT_QUANTITIES_ANNEX_V1`
> (anexo de cantidades en exports). Preguntas abiertas: ¿el workspace debe
> permitir editar líneas tras crear el grupo (hoy: crear + borrar grupo; editar
> línea individual diferido)? ¿el sync debe ofrecer crear ítem sin APU con precio
> manual autorizado (hoy: requiere APU vinculado)? Recomendación: recoger
> feedback de la usuaria en revisión visual antes de ampliar alcance.

> **Nota 2026-06-13 (APU_EXPORTS_V1):** la deuda `READ_MODEL_ARCHIVED_AT`
> (registrada en HANDOFF/INTEGRATION) quedó **RESUELTA** con un fix de mapeo ORM
> sin migración. No introduce blockers nuevos. La pregunta Q-001 (APU incompleto)
> sigue abierta y es independiente: el export INCLUYE APU incompletos con
> advertencia (no los bloquea), consistente con la recomendación vigente.

---

## PREGUNTAS ABIERTAS

### Q-001 — APU incompleto: ¿bloquear creación o permitir con advertencia?  🟡 PENDIENTE DECISIÓN
- **Contexto**: el hotfix `APU_MANUAL_BUILDER_VALIDATION_AND_ARCHIVE_HOTFIX_V1` rechaza
  cantidad/rendimiento = 0 en el dominio server-side y en SQL. Esto significa que un
  APU con al menos un componente de $0 **no puede persistirse** (la RPC lanza
  `invalid_component_amounts`).
- **Pregunta**: si en el futuro se quiere permitir APUs "incompletos" (ej. actividad
  sin precio de recurso todavía), ¿se elimina el guard `exclusiveMin` y se usa solo
  advertencia en la UI? ¿O se mantiene el bloqueo estricto?
- **Recomendación actual**: mantener el bloqueo estricto (`exclusiveMin: true`);
  un APU a $0 produce un snapshot BOQ a $0 que contamina el presupuesto
  silenciosamente. Si se necesitan "borradores", implementar `apu_draft_templates`
  separado con estado explícito.
- **Impacto**: cambio en `requireDecimal` en `service.ts` + en la migración SQL
  (`v_qty <= 0` volvería a `v_qty < 0`). Requiere decisión explícita del usuario.
- **Responsable**: agent-orchestrator (llevar a usuario antes de APU_ADVANCED_EDITOR_V2).

---

## DEUDA TÉCNICA (no bloqueante)

### B-004 — Supabase Realtime unhealthy en Docker Desktop (Windows)  🟡 DEUDA TÉCNICA
- **Estado**: ABIERTO como deuda técnica no bloqueante desde 2026-05-30 (Oleada 1.5).
- **Síntoma**: en `supabase start`, el contenedor `supabase_realtime_*` queda
  `unhealthy` en Docker Desktop sobre Windows y aborta el arranque por defecto.
  También aparece `WARNING: Analytics on Windows requires Docker daemon exposed
  on tcp://localhost:2375`.
- **NO bloqueó la validación RLS**: el harness RLS solo necesita el contenedor
  `db` (Postgres). Se arrancó con `supabase start -x realtime,studio,storage-api,
  imgproxy,edge-runtime,logflare,mailpit,vector` y Postgres funcionó
  correctamente; **RLS runtime pasó 21/21**.
- **Impacto futuro**: debe revisarse **antes de implementar funcionalidades
  Realtime** (suscripciones, presencia, broadcast) o **antes de producción**.
  Posibles causas a investigar: salud de `vector`/`logflare` (analytics),
  exposición del daemon Docker, versión del stack local, recursos WSL2.
- **Acción**: NO resolver en esta etapa. Reevaluar en la oleada que requiera
  Realtime o en el endurecimiento previo a producción.
- **Responsable**: agent-orchestrator (seguimiento) + agente que requiera Realtime.

---

## BLOCKERS resueltos

### B-005 — Espejo DTO de planning duplicado en el dominio  ✅ RESUELTO
- **Estado**: RESUELTO el 2026-06-01 (Oleada 3C, rama `integration/wave-3c`),
  commit `refactor(planning): fold duplicated DTO mirrors into canonical read model`.
- **Origen**: registrado durante el merge de Oleada 3B (deuda no bloqueante).
  `apps/web/modules/planning/types.ts` redeclaraba los DTOs del read-model
  (`ScheduleTaskView`, `DependencyView`, `MilestoneView`, `ProgressEntryView`,
  `ResourceAssignmentView`, `CriticalPathSummary`) y los enums
  (`ScheduleTaskStatus`, `DependencyType`) en paralelo a la definición canónica
  en `apps/web/lib/contracts/read-model.ts`, con un campo muerto
  `financialProgressPct` en la copia de `ScheduleTaskView`.
- **Resolución**: `types.ts` ahora **re-exporta** esos DTOs/enums desde el
  contrato canónico (fuente única) y conserva exclusivamente los tipos de
  dominio puro (entrada/salida del CPM). Se eliminó el campo muerto
  `financialProgressPct` y el `ScheduleSummaryView` sin uso. La superficie
  pública de `@/modules/planning` se conserva estable (re-exports vía `index`).
  Sin cambios en reglas CPM, holguras, proyección por rol, DB, migraciones,
  seeds ni RLS.
- **Validación**: typecheck/lint 0, **389 tests**, build (`/planning`),
  gm 22/22 + 9/9, `git diff --check` limpio. Cero regresiones. Un solo archivo
  modificado (`types.ts`, 252→176 líneas).

### B-003 — Docker Desktop: content store corrupto (bloqueaba RLS runtime)  ✅ RESUELTO
- **Estado**: RESUELTO el 2026-05-30 (Oleada 1.5, rama `feature/wave-1.5-local-rls`).
- **Síntoma original**: `supabase start` y `docker pull` fallaban con
  `write /var/lib/desktop-containerd/.../io.containerd.metadata.v1.bolt/meta.db: input/output error`;
  `docker system df` no podía listar imágenes (blob faltante / I/O error).
- **Causa**: corrupción del almacén interno de containerd de Docker Desktop
  (NO era falta de espacio; host D: 1.5 TB libres).
- **Acción aplicada (usuario)**: reparó Docker Desktop (reinicio / purga del
  content store). Verificado: `docker info` Server OK, `docker system df` OK,
  `docker pull alpine` OK, `docker run alpine` → `docker-store-ok`.
- **Re-ejecución (orchestrator)**: `supabase start` descargó imágenes y aplicó
  **11 migraciones** en orden limpio; `db reset` re-aplicó migraciones + **2
  seeds** sin errores; el harness **`scripts/rls-runtime/run.ts` → 21/21 PASS**
  contra Postgres real (aislamiento A/B, denegación cross-org lectura/escritura,
  usuario sin organización, `price_observations` append-only + trigger de
  inmutabilidad, `apu_calculation_snapshots` inmutable, versiones emitidas y sus
  hijos bloqueados, helper `app.current_org()` desde el JWT, control positivo en
  `draft`). NO se conectó base remota; sin `supabase link`/`db push`.
- **Hallazgo lateral (resuelto)**: en el stack Supabase local el esquema `auth`
  existe, así que la migración `0001` activa el FK `profiles_id_auth_users_fk` y
  el seed fallaba (23503). Fix de integración: el seed crea filas `auth.users`
  antes de `profiles`, guardado por la presencia del esquema `auth`. Registrado
  en `docs/INTEGRATION_REQUESTS.md` para aval de `agent-db-rls`. También añadida
  config `[db.seed]` en `supabase/config.toml` (los seeds de `supabase/seeds/`
  no se cargaban por defecto).
- **Impacto residual**: ninguno. RLS runtime validado empíricamente; Oleada 1.5
  puede cerrarse. Habilita la recomendación de merge a `main` y el inicio de
  Oleada 2.
- **Responsable**: usuario (infra) + agent-orchestrator (re-ejecución + fix de seeds).

### B-002 — Toolchain del monorepo no inicializado  ✅ RESUELTO
- **Estado**: RESUELTO el 2026-05-29 (Paso 0 / orchestrator).
- **Detectado**: 2026-05-29 (auditoría de arranque).
- **Detalle original**: No existía `package.json` ni configuración de
  toolchain; los `apps/web/app/*.tsx` eran stubs de 1 línea.
- **Acción aplicada**: scaffolding del monorepo pnpm. Creados:
  `package.json` (raíz) con `packageManager: pnpm@11.5.0`,
  `pnpm-workspace.yaml`, `tsconfig.json` base, `apps/web/package.json`,
  configs de Next/Tailwind/PostCSS/ESLint/Vitest, `middleware.ts`,
  `drizzle.config.ts` (esqueleto), `supabase/config.toml`, placeholders
  válidos de páginas y un smoke test.
- **Verificación (todos PASAN)**:
  - `pnpm install` → OK (pnpm 11.5.0, lockfile `pnpm-lock.yaml`).
  - `pnpm run typecheck` → exit 0.
  - `pnpm run lint` → "No ESLint warnings or errors".
  - `pnpm run test` → 1 passed.
  - `pnpm run build` → 8 rutas + middleware compilados.
  - `validate-claude-agents.ps1` → PASS 214 / 0 / 0.
- **Impacto residual**: ninguno. Se habilita la ejecución del checklist de
  merge y el inicio efectivo de la Oleada 1.
- **Responsable**: agent-orchestrator.

### B-001 — docs/PROJECT_MASTER.md está vacío  ✅ RESUELTO
- **Estado**: RESUELTO el 2026-05-29.
- **Detectado**: 2026-05-29.
- **Detalle original**: El archivo `docs/PROJECT_MASTER.md` contenía un
  único carácter en blanco. No tenía visión, dominio, glosario ni
  reglas de negocio.
- **Acción aplicada (2026-05-29)**: El usuario reemplazó manualmente
  el archivo por el documento maestro completo. El archivo ahora
  contiene 2 230 líneas y ~43 KB, con 24 secciones que cubren visión,
  dominio, glosario, arquitectura, fórmulas, política de privacidad,
  proyecto piloto ENTRE PATIOS, librerías aprobadas y nota final.
- **Verificación**: lectura inicial (líneas 1-80) y final (líneas
  2180-2230) confirman que NO es placeholder.
- **Impacto residual**: ninguno. Se desbloquea la Oleada 1.
- **Responsable**: Usuario (manual). Cerrado por Claude Code tras
  verificación.

---

## Preguntas abiertas

1. ¿Cuál es el nombre final del producto?
2. ¿Cuántos decimales se usan para los totales financieros? ¿Se redondea en
   insumo, en APU o en BOQ?
3. ¿El cliente puede ver el desglose de APU o solo el precio unitario final?
4. ¿Los proveedores como Homecenter son visibles en el reporte de cliente?
5. ¿La variación preventiva del 3% es fija o configurable por proyecto?
6. ¿El Gantt se organiza por capítulos del presupuesto o por actividades
   libres?
7. ¿Quiénes son los primeros usuarios y qué roles tienen?
8. ✅ **RESUELTA (2026-05-30, Q8)** — ¿La base de descuento se aplica sobre
   precio público o sobre precio de referencia? → **`online_public_price`**.
   `negotiated_discount_pct` se aplica por defecto sobre `online_public_price`,
   NO sobre `budget_reference_price`. Fórmulas canónicas:
   `budget_reference_price = online_public_price × (1 + preventive_variation_pct)`;
   `expected_purchase_price = online_public_price × (1 − negotiated_discount_pct)`;
   `projected_saving = budget_reference_price − expected_purchase_price`;
   `realized_saving = budget_reference_price − actual_purchase_price`.
   Excepciones futuras configurables por proveedor/producto. Descuento, ahorro
   y margen son internos (🔒), nunca al rol cliente. Privacidad backend-first.
   `actual_purchase_price` proviene de factura/compra real. Ver `docs/DECISIONS.md`.
9. ✅ **RESUELTA (2026-05-30, Q9)** — ¿Cuál es la política de redondeo para
   totales en COP? → **cálculo raw, presentación `ROUND_HALF_UP`**.
   Cálculo interno: `Decimal.js`, persistir `NUMERIC(20,10)`, serializar dinero
   como `string` decimal, sin float JS, sin redondear pasos intermedios,
   snapshots con precisión completa. Presentación: `ROUND_HALF_UP`; UI/PDF
   cliente COP sin decimales; Excel técnico interno hasta 2 decimales;
   regresión/auditoría precisión raw completa. El redondeo visual NO modifica
   snapshots, cálculos ni regresión. Ver `docs/DECISIONS.md`.
10. ¿Qué información ve el cliente en el detalle de un APU?
11. ✅ **RESUELTA (2026-05-30, Q11)** — ¿La aprobación humana de mapeos SKU /
    importación de precios requiere doble firma o una sola? → **MVP: aprobación
    SIMPLE** por un usuario interno autorizado. Auditoría obligatoria por
    aprobación: aprobador, timestamp, fuente, motivo, override, observación
    previa, resultado aprobado, `supplierProductId`, `resourceId`, `observedAt`,
    `sourceType`, `sourceReference` (cuando exista). Reglas: la importación NO
    persiste automáticamente (preview primero); coincidencias SKU ambiguas
    quedan `pending`; ningún precio nuevo modifica snapshots emitidos;
    `price_observations` sigue append-only. **Doble aprobación** queda como
    soporte FUTURO configurable (umbral superado, anomalía, proveedor crítico,
    organización lo exige, rol insuficiente) — NO obligatoria aún. Ver
    `docs/DECISIONS.md` y `docs/PRICING_ADAPTER_CONTRACT.md`.
12. ¿Hay un umbral máximo configurable para variación de precio sin
    aprobación? (relacionado con Q11; el umbral disparará doble aprobación
    futura — pendiente de valor concreto).
13. ¿Despliegue final: Vercel + Railway, o solo Vercel?
15. ✅ **IMPLEMENTADOS (2026-06-13)** en `feature/apu-manual-builder-boq-add-v1`
    (base `origin/main = 56b7c0a`; sin merge, sin deploy, sin db push remoto):
    `APU_MANUAL_BUILDER_V1` (creación manual de APU en `/apu/new` + CTAs en `/apu`
    y price-intelligence) y `BOQ_ADD_FROM_APU_V1` (alta de actividad APU al BOQ
    editable desde el workspace, RPC `add_apu_to_boq` con snapshot server-side +
    issued guard + idempotencia). Migración aditiva `20260618090000`. Pendiente:
    revisión visual + release controlado. La edición avanzada se difirió como
    `APU_ADVANCED_EDITOR_V2`. Texto histórico del slice:

    **PRÓXIMOS SLICES IDENTIFICADOS (2026-06-13)** — Tras el release de
    `APU_COMPONENT_RESOURCE_RECONCILIATION_V1 + APU_LIBRARY_OPERATIONAL_UX_V1`,
    la revisión del preview de Vercel confirmó que el flujo de creación manual
    de APU NO existe (ni debe existir en esta rama). Los dos slices siguientes
    son:
    - **`APU_MANUAL_BUILDER_V1`**: crear una plantilla APU directamente desde
      la UI (sin importar Excel), con formulario de componentes, cálculo de
      costo unitario, validación de rol management/internal. CTA preparado
      (actualmente la biblioteca muestra "Sin plantillas APU → Importar APU";
      agregar "Crear APU" requiere este slice).
    - **`BOQ_ADD_FROM_APU_V1`**: seleccionar una plantilla APU existente desde
      el BOQ y crear un ítem de presupuesto vinculado directamente, sin pasar
      por la importación Excel. Requiere UI en `/budget/[id]` + RPC server-side
      + auditoría de versión.
    Ninguno debe iniciarse sin autorización explícita y contrato congelado previo.
    Relacionado: `APU_EXPORTS_V1`, `APU_UI_ADVANCED_EDITING_V1` (deuda registrada
    en el contrato `APU_COMPONENT_RESOURCE_RECONCILIATION_AND_LIBRARY_UX_V1_CONTRACT.md §11`).

14. ✅ **RESUELTA (2026-05-30, Q14)** — ¿Canal oficial de Homecenter? → **MVP:
    adaptador genérico de proveedores con implementación Homecenter por archivo
    CSV/Excel**. Preview obligatorio; aprobación humana antes de persistir;
    permitir SKU y URL cuando existan; matching SKU→`supplierProductId`/
    `resourceId` con candidatos y score; fallback manual; trazabilidad completa.
    NO asumir API pública / feed estable / endpoints internos / acceso
    empresarial concedido. Prohibido scraping agresivo, automatización opaca,
    modificar presupuestos emitidos y persistir coincidencias ambiguas como
    aprobadas. Interfaz **sustituible** para soportar luego API oficial / feed
    oficial / cotización empresarial / carga manual / n8n supervisado. Ver
    `docs/DECISIONS.md` y `docs/PRICING_ADAPTER_CONTRACT.md`.

---

## OPERATIONAL_ACCESS_LAYER_V1 + SMTP_CORPORATIVO_V1 (2026-06-14)

> Sin blockers nuevos al cierre. Rama lista para revisión visual + release
> controlado (2 migraciones aditivas; sin db push remoto este ciclo).

### Deudas registradas (no bloqueantes)
- **`OPERATIONAL_ACCESS_REMOTE_RLS_VERIFY_V1` (release-crítica)**: en Supabase
  remoto el migrador podría NO tener BYPASSRLS (ver fix 4B.1). Verificar en
  staging que las RPCs `SECURITY DEFINER` operan bajo RLS remota — en especial
  `accept_invitation` (escribe `profiles` para un invitado SIN organización) y el
  listado por read-model (drizzle). Si falta bypass, conceder/ajustar antes de
  confiar en el flujo de invitación en producción. Localmente (migrador
  superusuario) todo pasa.
- **`ACCESS_DEACTIVATION_V1`**: suspender el acceso de un usuario ACTIVO sin
  borrarlo (requiere `profiles.status` o tabla de suspensión + ajuste en
  `resolveAuthenticatedViewer`). Diferido; no hay borrado físico de usuarios.
- **`ACCESS_AUDIT_VIEWER_V1`**: UI de la bitácora `access_audit_log`.
- **`EMAIL_DELIVERABILITY_MONITORING_V1`**: monitoreo de entregabilidad SMTP.

### Pregunta abierta
- Q-ACC-1: ¿el primer admin real de cada organización se crea por seed/manual o
  se habilita un bootstrap controlado? Hoy ya existe un admin en producción; la
  cadena de invitaciones parte de él. Recomendación: documentar el bootstrap y no
  exponer creación de admin fuera de un admin existente (ya garantizado por RPC).

### SCHEDULE_PROD_RUNTIME_ROOT_CAUSE_V3
- Q-PLAN-1 (pendiente de evidencia de prod, read-only): si tras este fix el usuario
  obtiene preview.ok pero "Crear" responde "No tienes permiso…", confirmar
  `profiles.role` del usuario (¿`compras`?) y los conteos de capítulos/ítems de
  "Versión 1" de ENTRE PATIOS antes de decidir si `compras` debe poder crear
  cronogramas (cambio de contrato de permisos) o si la versión está vacía.

---

## V5_6_4_CLIENT_PROJECT_SCOPE (2026-07-02)

> Contrato: `docs/design-references/V5_6_4_CLIENT_PROJECT_SCOPE.md`. Decisiones
> ya aprobadas por la usuaria: consulta-cliente NO ve APU; 0 grants = 0
> proyectos con empty state; grants solo para rol `consulta` en esta fase;
> internos intactos; sin contratistas/financiero/Omni.

### Compuerta pendiente (release-crítica)
- **`V5_6_4_DB_APPLY_GATE`**: las migraciones `project_access_grants` + RLS
  project-scoped de `projects_select` están EN RAMA y validadas por
  tests/harness, pero **NO aplicadas a Supabase Cloud**. Requiere autorización
  explícita. Orden de release: aplicar migraciones (con backfill) → verificar
  harness/queries → merge/deploy del enforcement app-layer. Si el enforcement
  se despliega antes que la migración, `consulta` queda fail-closed en 0
  proyectos (seguro pero disruptivo para consultas internas existentes).

### Deudas registradas (no bloqueantes de V5.6.4, sí de cuentas cliente reales)
- **`V5_6_5_CLIENT_RLS_FULL_CHAIN`**: tablas con `organization_id` directo que
  NO heredan el patch de `projects_select` (planning: `schedule_tasks`,
  `task_dependencies`, `progress_entries`, `resource_assignments`,
  `planning_schedules`; cantidades: `quantity_workspace_*`,
  `quantity_takeoff_*`, `quantity_import_batches`) siguen org-scoped vía
  PostgREST para `consulta`. Cerrar antes de entregar cuentas a clientes
  externos reales.
- **`V5_6_5_CONSULTA_WRITE_HARDENING`**: políticas de escritura org-scoped sin
  check de rol (p. ej. `projects_update`) permiten hoy mutaciones de
  `consulta` vía PostgREST directo. Gap PRE-existente a V5.6.4; cerrar en
  V5.6.5 (add `app.current_role() NOT IN ('consulta')` o allowlist por tabla).

### Pregunta abierta
- Q-SCOPE-1: cuando exista el rol `cliente` real, ¿la asignación se hará por
  proyecto (como ahora) o por versión de presupuesto emitida (proyección aún
  más estrecha)? La infraestructura de grants soporta ampliar a
  `estimate_version_id` nullable en el futuro sin romper el modelo actual.
