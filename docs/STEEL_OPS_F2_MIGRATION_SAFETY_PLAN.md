# STEEL OPS F2 — Plan de seguridad de migraciones y registro de riesgos

**Fecha:** 2026-07-03 · **Estado:** BLUEPRINT — F2 (sin migraciones reales)
**Owner:** Agente 6 (Migration Safety) + Agente 8 (Risk) · Oleada F2 Data/RLS/DB
**Alcance:** SOLO documentación. Este plan describe QUÉ contendrá cada
migración futura y bajo qué compuertas se aplicará. **No existe aún ningún
archivo `.sql` de Steel Ops**; nada de este documento toca Supabase, la DB
local ni producción.

Documentos hermanos de la oleada:

- `docs/STEEL_OPS_F2_DATA_RLS_BLUEPRINT.md` — blueprint principal.
- `docs/STEEL_OPS_F2_SCHEMA_DRAFT.md` — borrador de esquema por entidad.
- `docs/STEEL_OPS_F2_RLS_TEST_PLAN.md` — estrategia RLS y plan de pruebas.
- `docs/design-references/STEEL_OPS_V1_BLUEPRINT.md` — blueprint V1 (§16
  secuencia de release, §17 doble candado, §20 fases).

---

## 1. Principios heredados (no negociables)

1. **Aditivo o nada.** Toda migración Steel F2 es puramente aditiva: crea
   tablas/índices/políticas/funciones nuevas con prefijo `steel_`. Prohibido
   `DROP` destructivo, `DELETE`, `ALTER` de tablas existentes (resources,
   suppliers, price_observations, boq_items, project_scopes…) y FKs
   **entrantes** desde tablas existentes hacia `steel_*`.
2. **RLS FORCE desde la primera migración que crea tablas.** Ninguna tabla
   `steel_*` existe ni un solo commit sin `ENABLE ROW LEVEL SECURITY` +
   `FORCE`. El detalle vive en `STEEL_OPS_F2_RLS_TEST_PLAN.md`.
3. **Gate explícito para cualquier remoto.** Precedente directo:
   `V5_6_4_DB_APPLY_GATE` (documentada, terminal) y `V5_6_5A_DB_APPLY_GATE`
   (ejecutada 2026-07-03 con autorización explícita de la usuaria, dry-run
   con exactamente las 2 migraciones esperadas, post-verify por schema dump
   read-only). Steel Ops replica ese patrón con su propia compuerta
   **`STEEL_OPS_DB_APPLY_GATE`** — una por tanda de migraciones.
4. **Secuencia de release del blueprint V1 §16:** mergear modelo (sin efecto
   runtime) → gate DB → mergear app con flag OFF → activar flag por rol →
   validación → GA. Este plan detalla el tramo "modelo → gate DB".
5. **Local primero, siempre.** `supabase db reset --local` limpio (todas las
   migraciones + seeds) y harness RLS (`scripts/rls-runtime/run.ts`) con la
   sección `[ST]` en verde ANTES de considerar cualquier `db push`.

---

## 2. Orden de migraciones propuesto (naming indicativo)

Convención del repo: `YYYYMMDDHHMMSS_slug.sql`, con la RLS en migración
separada inmediatamente posterior (patrón `20260622090000_schedule_from_boq`
+ `20260622090100_rls_schedule_from_boq`). Los timestamps de abajo son
**placeholders ilustrativos** — se fijan el día que se escriban, siempre
posteriores a la última migración de main.

### Migración 1 — `<ts>_steel_ops_base_tables.sql` (tablas base VACÍAS)

- Crea TODAS las tablas `steel_*` del schema draft (takeoffs, source_files,
  elements, lines, line_alerts-ack si aplica, cut_plans, cut_plan_items,
  offcuts, orders, order_lines, order_receipts, supplier_quotes,
  quote_lines, apu_boq_links, actions) con columnas, constraints CHECK,
  índices y FKs **salientes** hacia projects/project_scopes/resources/
  suppliers/boq_items/apu_templates (todas `ON DELETE` conservador, ver
  schema draft).
- **Cero filas.** Sin seeds, sin backfill, sin triggers de negocio.
- Ninguna tabla existente se modifica ⇒ **cero efecto en runtime actual**
  aunque se mergee y despliegue: el app no la referencia todavía y no hay
  FKs entrantes.
- Incluye ya `ENABLE + FORCE ROW LEVEL SECURITY` con una política
  **deny-all provisional** si la política real se difiere a Migración 2
  (recomendación: crear tabla y RLS FORCE en el MISMO archivo cuando sea
  posible; nunca una ventana con tabla sin FORCE).

### Migración 2 — `<ts>_rls_steel_ops.sql` (RLS + políticas + helpers)

- Políticas SELECT org-scoped + project-scoped para rol cliente
  (`app.is_client_role()` ⇒ `app.has_project_grant(project_id)`), reuso de
  helpers existentes — no se crean helpers duplicados.
- Escrituras por rol interno según matriz del RLS test plan; `consulta`
  sin acceso a Steel Ops V1 (deny total de SELECT, espejo de las 19 tablas
  internas de V5.6.5A).
- `steel_actions` append-only (sin UPDATE/DELETE, patrón
  `apu_manual_actions`/`price_observation_bulk_actions`).
- Actualiza el conteo FORCE esperado del harness (lección del drift 41→43
  detectado en V5.6.4).

### Migración 3 — `<ts>_steel_ops_seed_specs.sql` (seeds revisables)

- Seed de especificaciones estándar: varillas #2–#18 con kg/m normativos y
  longitudes comerciales, perfiles comunes (IPE/HEA/HEB…), como datos de
  referencia por organización u org-agnósticos según decida el data model.
- **Revisable por la usuaria ANTES de aplicar**: los pesos normativos y
  longitudes comerciales default son decisión de negocio (blueprint V1 §22
  y D3). El PR que contenga esta migración adjunta la tabla completa de
  valores en el cuerpo para revisión humana.
- Nunca datos reales de proyectos, clientes ni precios. Los fixtures de
  test viven en `apps/web/tests`/fixtures sanitizados, no en seeds de DB.

### Migración 4 — `<ts>_steel_ops_integration_rpcs.sql` (integración controlada)

- RPCs de mutación crítica (aprobar takeoff, aprobar pedido, emitir
  observación de precio desde quote, vincular a BOQ/APU) con guards
  server-side, idempotencia (`UNIQUE (org, idempotency_key)`) y auditoría
  en `steel_actions`.
- El puente a `price_observations` SOLO emite observaciones `pending`
  (invariante 3A: nada se auto-aprueba); el puente a BOQ es de LECTURA —
  cualquier escritura al BOQ reutiliza los RPCs existentes
  (`add_apu_to_boq`, `update_boq_item_quantity`), jamás uno nuevo paralelo.
- Solo se escribe tras aprobación explícita del diseño de integración
  (docs de Agentes 3 y 4 en el blueprint principal).

Cada migración puede subdividirse en PRs pequeños (≤ ~1 500 líneas netas,
regla §16), pero el ORDEN relativo 1→2→3→4 es invariante y ninguna tanda
salta la compuerta.

---

## 3. Compuerta `STEEL_OPS_DB_APPLY_GATE` — criterios de aplicación

Una compuerta por tanda. Requisitos TODOS obligatorios, en orden:

1. **Autorización humana explícita** de la usuaria, registrada en
   `docs/OPEN_QUESTIONS.md` (compuerta) y `docs/HANDOFF_LOG.md` al
   ejecutarse — patrón exacto de `V5_6_5A_DB_APPLY_GATE`.
2. **Local verde primero:** `supabase db reset --local` aplica TODAS las
   migraciones + seeds sin error; harness RLS completo (baseline intacto +
   sección `[ST]`) 0 FAIL; suite de tests completa verde.
3. **Dry-run remoto** con lista EXACTA de pendientes: deben aparecer solo
   las migraciones Steel de la tanda, **cero migraciones ajenas** (si
   aparece cualquier otra pendiente ⇒ STOP e investigar drift).
4. **Gate estricto de contenido:** solo aditivas; sin DROP destructivo; sin
   DELETE; sin ALTER de tablas existentes; sin seeds no revisados; sin
   `service_role` en flujos de usuario.
5. **Staging/local antes que producción.** Si existe entorno staging, se
   aplica y valida allí primero; producción NUNCA sin aprobación humana
   explícita adicional (la autorización no se hereda entre entornos ni
   entre tandas).
6. **Post-verify read-only** por schema dump: tablas `steel_*` presentes,
   `FORCE` en todas, políticas y helpers referenciados, RPCs con sus
   guards, cero políticas `FOR ALL` residuales — espejo del post-verify de
   V5.6.5A.
7. **Registro:** HANDOFF_LOG con ref del proyecto, migraciones aplicadas,
   resultado del post-verify y siguiente paso.

---

## 4. Plan de rollback

| Escenario | Acción | Por qué es seguro |
|---|---|---|
| Problema tras activar el módulo | `STEEL_OPS_ENABLED` off (instantáneo, sin deploy de DB) | Doble candado §17: sin flag, `/steel` es not-found para todos |
| Problema tras merge de app, flag nunca encendido | Nada que revertir en runtime; corregir en rama | Flag OFF por defecto = módulo inexistente |
| Migración 1/2 aplicada y diseño debe cambiar | Migración correctiva ADITIVA hacia adelante; en rollback extremo autorizado, DROP de tablas `steel_*` es viable | Sin FKs entrantes desde tablas existentes y sin datos de usuario ⇒ droppables sin tocar nada más |
| Migración 3 (seeds) con valores erróneos | Migración correctiva que actualice/desactive filas seed (los seeds son datos de referencia, no datos de usuario) | Specs versionadas + snapshots en línea: los takeoffs ya calculados no se recalculan |
| Migración 4 (RPCs) con guard defectuoso | Migración que reemplace/retire la función; mientras tanto flag off | RPCs sin estado propio; auditoría append-only intacta |
| **Gate falla a medias** (push parcial, timeout, error en post-verify) | STOP inmediato; NO reintentar a ciegas; snapshot del estado (dry-run + schema dump read-only); documentar en OPEN_QUESTIONS como blocker; decidir con la usuaria si completar la tanda o revertir | El dry-run posterior muestra exactamente qué quedó pendiente; las migraciones Steel son idempotentes entre sí por ser aditivas y ordenadas |

Regla general: **rollback hacia adelante** (migración correctiva) es el
camino preferido; DROP solo como rollback extremo, autorizado y documentado,
y solo mientras las tablas no contengan datos operativos reales.

---

## 5. Feature flags — doble candado y orden de activación

Ambos candados son server-side (blueprint V1 §17); la superficie (sidebar,
⌘K) nunca es el control.

1. **`STEEL_OPS_ENABLED`** (env, default ausente = off): con off, rutas
   `/steel` = not-found universal. Permite mergear modelo, app y hasta
   migraciones aplicadas sin exponer nada.
2. **`ACCESS_MODULES.steel`** (matriz de roles): rollout progresivo —
   `['admin','gerencia']` → +`presupuestos` → +`compras` (pedidos) →
   +`obra` (modo obra). `consulta` NUNCA en V1. Cada ampliación de la
   matriz requiere aprobación explícita (V1 §22, decisión D1 abierta).
3. Guards de página (`requireModuleAccess('steel')`) y de action
   (`checkModuleAccess('steel')`) desde el primer PR de UI; el RLS es la
   barrera final independiente de la app.

Orden completo de release (invariante):

```text
merge modelo (sin efecto) → STEEL_OPS_DB_APPLY_GATE → merge app (flag OFF)
→ activar STEEL_OPS_ENABLED en entorno interno → matriz por rol progresiva
→ validación manual autenticada → GA
```

---

## 6. Checklists

### Pre-merge (cada PR de la oleada F2-implementación)

- [ ] `pnpm typecheck` 0 · `lint` 0 · suite completa verde · `build` 0
- [ ] `gm:regression` 22/22 intacto (finanzas NO tocadas)
- [ ] `git diff --check` limpio; sin `private/`, `*.xlsx`, `*.xls`, `.env`
- [ ] Harness RLS local: baseline previo intacto + sección `[ST]` verde;
      conteo FORCE actualizado
- [ ] Diff contra `origin/main` fresco (lección V5.6.2B)
- [ ] Reporte de agente en PR + HANDOFF_LOG actualizado
- [ ] Ninguna migración ajena arrastrada en la rama

### Pre-apply (antes de ejecutar `STEEL_OPS_DB_APPLY_GATE`)

- [ ] Autorización humana explícita registrada
- [ ] `supabase db reset --local` limpio con la tanda completa
- [ ] Dry-run remoto: pendientes = exactamente la tanda, cero ajenas
- [ ] Revisión de contenido: aditivas, sin DROP/DELETE/ALTER de existentes
- [ ] Seeds (si tanda 3) revisados y aprobados por la usuaria
- [ ] Plan de rollback de la tanda releído y vigente
- [ ] Post-verify preparado (queries read-only de schema dump)

---

## 7. Registro de riesgos (Agente 8)

Severidad = Impacto × Probabilidad. Dueños según registro de agentes del
proyecto (`docs/AGENT_REGISTRY.md`) + roles del blueprint V1 §15.

| Riesgo | Impacto | Prob. | Mitigación | Dueño |
|---|---|---|---|---|
| Duplicar fuente de verdad de precios (catálogo steel paralelo) | Alto | Media | Prohibición de diseño (§14 V1): steel CONSUME `resources`+`supplier_products`+`price_observations` y solo EMITE observaciones `pending`; revisión de schema draft rechaza cualquier tabla de precio vivo `steel_*`; snapshots solo para trazabilidad | agent-pricing + orquestador |
| Duplicar jerarquía de obra | Alto | Media | `project_scopes` reutilizado (torre/piso = scopes; zona/frente = atributos de línea); el schema draft NO define tablas de jerarquía; checklist de revisión del blueprint lo verifica | agent-db-rls + orquestador |
| Errores de kg (peso mal calculado → pedido malo → plata) | Alto | Media | Pesos normativos en seed revisado por la usuaria; `unit_weight_*_snapshot` por línea; alerta A3 (kg/ml no corresponde al №/perfil); dominio puro con tests de tabla contra valores normativos; pedido inmutable solo tras aprobación humana | agent-cost-domain (motor) + QA |
| Pérdida de confianza del usuario | Alto | Media | Human-in-the-loop en cada frontera (interpretar→confirmar→pedir→aprobar); confidence score + `needs_review`; export marcado BORRADOR hasta aprobar; trazabilidad línea→archivo/página; nunca auto-confirmar bajo umbral | Fable QA/Workflow |
| PDF/despiece ambiguo (`5#5600`: ¿600 o 60 cm?) | Medio | Alta | Parser propone con confianza + explicación legible; ambigüedad ⇒ `needs_review` obligatorio; correcciones humanas guardadas por org; plantilla interna como camino feliz; PDF escaneado diferido | agente import/source |
| Permisos mal configurados (fuga a consulta/cliente) | Alto | Baja | RLS ENABLE+FORCE desde migración 1; deny total a `consulta` en V1; harness `[ST]` con checks anti-fail-open (espejo sección [FC] 328/0); doble candado de flags; guards de página y action | agent-db-rls + agent-qa |
| Datos sensibles en Git o exports (archivos de ingenieros, precios internos) | Alto | Media | Archivos fuente SOLO en Storage privado con hash (nunca en repo — reglas 8/12); fixtures sanitizados; export proveedor sin precios internos/descuentos (regla no negociable 4) con test dedicado; scan pre-commit de `*.xlsx`/`private/` | agente import/source + agent-exports |
| Pedidos incorrectos o aprobados sin revisión | Alto | Baja | RPC de aprobación con guard de rol + confirmación explícita; pedido inmutable tras `approved` (cambios = adenda auditada); auditoría append-only con actor+fecha; alertas A6/A13 antes de aprobar | agent-pricing (pedidos) + QA |
| Price drift (precio vivo difiere del snapshot) | Medio | Alta | Snapshot con fecha+referencia en línea/pedido; alerta "precio vigente difiere del snapshot" en dominio puro; NUNCA recálculo silencioso (espejo de inmutabilidad de presupuestos emitidos); `valid_until` en quotes ⇒ estado `expired` | agent-pricing |
| Costos mal vinculados a APU/BOQ | Medio | Media | Estados de vínculo explícitos (no vinculado→sugerido→vinculado→aprobado); NUNCA se modifica BOQ real sin aprobación humana; escritura al BOQ solo vía RPCs existentes; reportes de "acero sin actividad / actividad sin acero" | agente APU/BOQ integration |
| Merge prematuro / migración aplicada antes del gate | Alto | Baja | Compuerta `STEEL_OPS_DB_APPLY_GATE` documentada en OPEN_QUESTIONS ANTES del primer PR de modelo; dry-run con cero ajenas; secuencia de release invariante (§5); regla "PR draft, sin merge" de la oleada; precedente operativo V5.6.4/V5.6.5A | orquestador |

Riesgos de segunda línea (monitorear, sin acción F2): volumen de líneas en
torres grandes (índices por takeoff/scope/spec previstos en schema draft),
colisión de alcance con módulo Cantidades V5.7 (contrato de límites en
blueprint principal), licencias de librerías PDF/OCR (gate LICENSING.md,
fases 7+).

---

## 8. Qué NO hace esta oleada (confirmación de alcance)

- No crea archivos en `supabase/migrations/`.
- No ejecuta `supabase db push`, `db reset`, `link` ni comando alguno
  contra DB local o remota.
- No toca `.env`, Vercel, producción, UIX, `app/(dashboard)/steel`,
  `modules/steel`, ni APU/BOQ/catálogo existentes.
- No define SQL final: los nombres de columnas/políticas del schema draft
  son propuesta a congelar en el contrato de F2-implementación.
