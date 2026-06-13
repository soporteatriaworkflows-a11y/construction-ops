# Preguntas abiertas y blockers

## BLOCKERS activos

_Sin blockers activos._

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
