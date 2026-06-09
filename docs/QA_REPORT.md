# QA Report — Construction Ops

Este documento es propiedad de **agent-qa**. Se actualiza al final de
cada ciclo de validación.

> Validación de **integración de Oleada 1** realizada por el orquestador en
> `integration/wave-1` (pre-merge). La validación QA integral formal es de
> Oleada 4 (`agent-qa`).

---

## Fase 3A — Price Intelligence Foundation (2026-06-10)

**Rama:** `feature/phase3a-price-intelligence-foundation`. **Sin merge a main.**

| Check | Resultado |
|---|---|
| `typecheck` | ✅ 0 errores |
| `lint` | ✅ 0 warnings |
| Tests: 63 archivos, **809 tests** | ✅ PASS (↑52 vs MVP v1) |
| `build` | ✅ Compiled 6.8s |
| `git diff --check` | ✅ Limpio |
| `validate-claude-agents` | ✅ 214/0/0 |
| Golden master regression (COP 372.247.170) | ✅ Intacto |

**Tests nuevos (Fase 3A):**
- `resource-price-observation.test.ts`: fórmula `suggested_net_price` (5 casos) + stale state (9 casos) + validateCreateObservationInput (9 casos) + validateProviderCreateInput (5 casos).
- `observation-approval.test.ts`: fixture list/summary + errores de escritura + ObservationAlreadyReviewedError + ObservationNotFoundError + ProviderRepository.
- `observation-security.test.ts`: aislamiento cross-org + campos 🔒 + INTERNAL_PRICE_FIELDS + CreateObservationInput sin campos server-side + clases de error.

**Observaciones de seguridad:**
- Campos `organization_id`, `created_by`, `approved_by` nunca aceptados desde el navegador: ✅
- FORCE RLS en `resource_price_observations` con 3 policies: ✅
- Append-only: UPDATE solo modifica `status/approved_by/approved_at/rejection_reason`: ✅ (verificado por RLS WITH CHECK)
- Ninguna observación modifica snapshots emitidos: ✅ (by design, sin conexión a BOQ)
- Campos 🔒 no serializados al rol cliente en UI: ✅ (verificado por condicional ViewerRole)

**Cobertura funcional:**
- `suggested_net_price` = `round(observed_price × (1 - discount_percent/100), 10)`: ✅ (trigger DB + tests)
- `isStale` computado en runtime (30d desde approved_at o valid_until expirado): ✅
- Workflow pending → approved | rejected: ✅ (con InsufficientRoleError para roles no autorizados)
- Fixture data para modo demo: ✅ (2 proveedores, 3 observaciones MAT-001)

**Pendientes para Oleada QA formal:**
- Smoke DB real con `supabase db reset` + `PRICE_INTEL_SMOKE_DB=1` (requiere Docker local).
- RLS runtime harness para `resource_price_observations` (extend `rls-runtime/`).
- Validación cross-org a nivel de PostgREST con JWT real.

---

## MVP interno LOCAL-READY (2026-06-09, checkpoint `mvp-internal-local-ready-v1`)

- **4E.3B integrada** en `integration/p1a-functional-resume` (merge `9695322`).
- **Smoke end-to-end** `apps/web/tests/integration/mvp-internal-flow-smoke.test.ts`
  (gated, repo real + RLS, 10 casos): **10/10 PASS**, **0 defectos**. Cubre el ciclo
  completo crear→BOQ→editar→archive/restore→emitir→clonar→comparar→seguridad→
  no-destrucción sobre un estimate sintético local.
- Validación completa: typecheck/lint 0, **757 tests** + **42 integración gated**,
  build (fixture+db-local), **RLS 106/106**, **read-model isolation 12/12**,
  **gm:regression 22/22**, gm:import PASS, validador 214/0/0, diff limpio.
  **Sin migración nueva.**
- `main = origin/main = 2918622` intacta; producción intacta; stashes P1-A intactos.
  Migraciones locales pendientes de reconciliar en pre-release. Siguiente: pre-release
  controlado (no nueva feature).

## 4E.3B — Comparación de versiones IMPLEMENTADA (2026-06-09, Opción B)

Rama `feature/wave-4e3b-estimate-version-compare`. **Todo PASS, sin migración nueva**:
- typecheck/lint 0, **757 tests** + **32 integración gated** (`BOQ_SMOKE_DB=1`): diff
  PURO (deltas financieros, % seguro base=0/≠0, capítulos added/removed/changed/
  unchanged, ítems por qty/price/desc/unit/archived, **matching por
  chapterCode+itemCode+occurrenceIndex** con desempate `sort_order,id` y
  `duplicateCodeWarning`); repo: compara mismo estimate, **VersionMismatchError**
  para estimates distintos, **cross-org bloqueado**, **no muta datos** (V1 issued
  intacta).
- build (`/compare` `ƒ`), **RLS 106/106**, **isolation 12/12**, **gm:regression 22/22**,
  gm:import PASS, validador 214/0/0, `git diff --check` limpio.
- Decisión: **Opción B** (matching por ocurrencia, sin migración). Deuda futura
  `lineage_id` antes de `BOQ_REORDER`.
- **Sin deploy; sin merge a main/integration.** `main = origin/main = 2918622`
  intacta; producción intacta; stashes P1-A intactos.

## 4E.3A integración + 4E.3B blocker (2026-06-09)

- **4E.3A integrada** en `integration/p1a-functional-resume` (merge `cd18f2d`).
  Validación post-integración (todo PASS): typecheck/lint 0, **747 tests** + 28
  integración gated, build fixture+db-local, **RLS 106/106**, **isolation 12/12**,
  **gm:regression 22/22**, gm:import PASS, `git diff --check` limpio.
- **4E.3B (comparación de versiones) DETENIDA en FASE 5 (sin implementar)** por
  blocker de unicidad de ítems verificado en DB local: índices UNIQUE = solo
  `chapters_version_code_uq` + PKs; `boq_items` sin unicidad por `code` ⇒ la clave
  `chapterCode + itemCode` no es única garantizada (datos actuales: 0 duplicados,
  no garantizado). Contrato congelado con el blocker; **decisión de producto
  requerida** (migración de unicidad vs clave determinística por ocurrencia).
- **Pre-release (migraciones):** ejecutar `supabase db push --dry-run --linked`
  (read-only) y reconciliar las migraciones realmente pendientes; **no asumir** que
  `20260606120000` sigue pendiente; aplicar solo las faltantes confirmadas.
- `main = origin/main = 2918622` intacta; producción intacta; stashes P1-A intactos.
  Preview/MV-01 diferidos. `BOQ_REORDER` no iniciado.

## 4E.3A — Emisión / clonación de versiones (2026-06-09, rama funcional)

Rama `feature/wave-4e3a-estimate-issue-clone` (desde integration `9f28c26` que ya
incluye 4E.2B). **Todo PASS**:
- typecheck 0, lint 0, **747 tests** + **28 integración gated** (`BOQ_SMOKE_DB=1`,
  repo real + RLS): emisión draft→issued (issued_at/issued_by server-side, solo
  draft, re-emisión rechazada); **inmutabilidad** de issued (archive/create/AIU
  rechazados); **clonación** issued→nueva draft activa (V02, `source_version_id`,
  capítulos/ítems remapeados, source_code/source_row + estado archivado
  preservados, AIU clonado, **mismo total activo**, issued origen intacta);
  editar la nueva draft NO altera el export del issued (snapshot por `versionId`);
  clonar una draft rechazado; `listEstimateVersions` tenant-scoped; cross-org
  bloqueado.
- build fixture + db-local OK; **RLS harness 106/106**; **read-model isolation
  12/12** (P1-A intacto); **gm:regression 22/22**; gm:import PASS; validador
  214/0/0; `git diff --check` limpio.
- Migración local `20260609130000` verificada con `db reset`; **sin `db push`**.
- **Sin deploy; sin merge a main/integration.** `main = origin/main = 2918622`
  intacta; producción intacta; stashes P1-A intactos. **4E.3B NO iniciada.**

## 4E.2B — BOQ safe delete/archive (2026-06-09, rama funcional)

Rama `feature/wave-4e2b-boq-safe-archive`. **Todo PASS**:
- typecheck 0, lint 0, **743 tests** + **19 integración gated** (`BOQ_SMOKE_DB=1`,
  repo real + RLS local) que cubren los 28 casos del plan: archivar/restaurar ítem
  y capítulo con recálculo financiero exacto y restauración al baseline; capítulo
  archivado excluye sus ítems sin reescribirlos; ítem archivado individualmente
  sigue archivado tras restaurar el capítulo; duplicate-archive / restore-of-active
  rechazados; **no DELETE físico** (fila persiste con `archived_at`/`archived_by`);
  `archived_by` server-side; read-model activo vs `includeArchived`; export excluye
  archivados; cross-org y versión emitida bloqueados; fixture solo lectura; fuente
  de actions/controls/UI.
- build fixture + db-local OK; **RLS harness 106/106**; **read-model isolation 12/12**
  (P1-A intacto); **gm:regression 22/22** (sin degradar registros activos);
  gm:import PASS; validador 214/0/0; `git diff --check` limpio.
- Migración local `20260609120000` verificada con `db reset`; **sin `db push`**.
- **Sin deploy; sin merge a main/integration.** `main = origin/main = 2918622`
  intacta; producción intacta; stashes P1-A intactos. Preview/MV-01 diferidos.

## 4E.2A — Cierre automated-ready (2026-06-07, post-merge)

La usuaria **omitió voluntariamente** el smoke manual de escritura sobre el
presupuesto productivo ENTRE PATIOS. 4E.2A se cierra por **verificación
automatizada NO destructiva**:

- **Smoke automatizado local** (`apps/web/tests/integration/boq-edit-smoke.test.ts`,
  gated `BOQ_SMOKE_DB=1`): **11/11 PASS** usando el repositorio REAL
  (`DbEstimatesWriteRepository`) vía PostgREST con RLS (JWT de usuario sembrado),
  sobre datos sintéticos locales. Cubre editar cantidad/precio + **restauración
  EXACTA al baseline** de subtotal/capítulo/directo/A·I·U·IVA/indirecto/total;
  PATCH-subtotal-only ignorado por el trigger; crear capítulo/ítem manual
  (origen NULL, sort append, código único); editar importado preservando origen;
  mover ítem entre capítulos; cross-org/fixture/versión-emitida bloqueados; export
  payload refleja la edición.
- Validación completa: typecheck/lint 0, **736 tests** (+11 integración gated),
  build fixture + db-local, gm 22/22 + import, validador 214/0/0, **RLS runtime
  106/106**, remoto **21/21 Local=Remote** (read-only), `git diff --check` limpio.
- Producción **read-only**: Vercel READY; `/login` 200; rutas protegidas 307→`/login`;
  rutas 4E.2A presentes; control 404; **sin escrituras productivas; ENTRE PATIOS
  intacto**.
- Pendiente OPCIONAL: smoke de escritura real en producción (sesión futura).
  Tag `wave-4e2a-manual-boq-editing-automated-ready-v1`.

## 4E.2A — Edición manual segura de BOQ (2026-06-07, pre-merge)

Validación en `integration/wave-4e2a-manual-boq-editing`:
- **typecheck 0, lint 0, 736 tests** (+24 de 4E.2A: validación de capítulo/ítem,
  subtotal derivado, fixture solo lectura + cross-org, fuente de actions/UI sin
  subtotal/totales del navegador).
- **build fixture + build db-local PASS** (4 rutas nuevas `ƒ` dynamic).
- **gm:regression 22/22, gm:import PASS, validador agentes 214/0/0.**
- **RLS runtime 106/106** (+17 checks 4E.2A): función/trigger presentes, INSERT
  recalcula (999→6), UPDATE cantidad/precio recalcula, **PATCH subtotal-only
  ignorado** (777→20), import RPC compatible, ítem importado recalcula y
  **preserva `source_code`/`source_row`**, mover ítem conserva origen, cantidad
  negativa bloqueada (CHECK), versión emitida ⇒ INSERT bloqueado (RLS).
- Migración `20260606120000` aplicada al remoto ⇒ **21/21 Local = Remote** (0 seeds).
- `git diff --check` limpio; sin secretos ni archivos privados; WIP de seguridad
  ajeno aislado en `git stash` (no commiteado).
- Privacidad/seguridad: cliente RLS-bound sin service-role; cross-org Not-Found;
  fixture write bloqueada; el navegador no puede persistir subtotal arbitrario.

Pendiente de QA integral (Oleada 4) y smoke productivo de la usuaria.

## 4E.1C — Assets oficiales GRUPO ICONIC (2026-06-06, pre-merge)

Validación en `integration/wave-4e1c-official-iconic-assets`: typecheck 0, lint 0
(sin warnings), **712 tests** (assets oficiales existen + firma PNG, guía solo en
`docs/branding` y no en `public`, data URI full/symbol `data:image/png;base64,`,
`hasOfficialLogos()` true, paleta `ICONIC_EXPORT_PALETTE` exacta, **sin dorado
`#C8A24B`**, branding sin `fs`/`path`, Excel embebe imagen + 3 hojas + total general,
PDF `%PDF` con logos full+symbol y sin UUID/source_row, script reproducible + módulo
generado). Build fixture + db-local PASS **sin warnings** (`/api/estimates/export`
`ƒ`). gm:regression 22/22, gm:import PASS, validador 214/0/0, `git diff --check`
limpio. **Sin migración**; contenido/finanzas/seguridad sin cambios; remoto Supabase
**20/20** intacto. Deuda `ICONIC_LOGO_ASSET` resuelta.

---

## 4E.1B — Branding visual de exports (2026-06-06, pre-merge)

Validación de integración en `integration/wave-4e1b-export-branding`: typecheck 0,
lint 0, **710 tests** (+7 branding: consistencia de paleta HEX↔ARGB, `loadBrandLogo`
null sin asset + sin throw, Excel mantiene 3 hojas/total general/creator de marca,
PDF sigue `%PDF`, fuentes con logo+fallback monograma y mecanismo base64). Build
fixture + db-local PASS **sin warnings** (`/api/estimates/export` presente como `ƒ`;
sin `fs` runtime ⇒ sin aviso NFT de Turbopack). gm:regression 22/22, gm:import PASS,
validador 214/0/0, `git diff --check` limpio. **Sin migración**; contenido/finanzas
sin cambios; remoto Supabase **20/20** intacto. **4E.1 cerrada funcionalmente**
(smoke real de la usuaria) antes de iniciar 4E.1B.

---

## 4E.1 — Exportación protegida Excel + PDF (2026-06-05, pre-merge)

Validación de integración del orquestador en `integration/wave-4e1-budget-exports`:
typecheck 0, lint 0, **703 tests** (+16 de export: payload fixture + cross-org
NotFound, Excel parseado con 3 hojas RESUMEN/PRESUPUESTO/TRAZABILIDAD + total general
+ códigos canónicos, PDF `%PDF` en memoria, filename sanitizado/anti path-traversal,
guards de ruta force-dynamic/nodejs/401/404, privacidad estructural del PDF sin
UUID/source_row/secretos, trazabilidad sólo en hoja secundaria del Excel). Build
fixture + build db-local PASS (`/api/estimates/export` presente). gm:regression 22/22,
gm:import PASS, validador 214/0/0, `git diff --check` limpio. **Sin migración**;
remoto Supabase intacto (20/20). No se generaron exports remotos desde terminal.

---

## 4D.2 — SMOKE PRODUCTIVO CERRADO (2026-06-05)

Smoke manual verificado por la usuaria en `construction-ops-psi.vercel.app`:
PRESUPUESTO BASE → V01 abre; AIU editable visible; guardó Administración 3.5 /
Imprevistos 2.5 / Utilidad 4 / IVA 19; **porcentajes persistieron tras recargar**;
edición temporal de Administración cambió el total; restauración a 3.5; **Total
general ≈ $372.247.170**; cálculo y persistencia correctos. **Oleada 4D.2 CERRADA.**
Tag `wave-4d2-editable-aiu-production-v1`.

---

## 4D.2 — AIU editable + total general por versión (2026-06-05)

> Rama `integration/wave-4d2-editable-aiu`. **Sin migración** (remoto **20/20** intacto).

- **Modelo reutilizado**: `indirect_cost_rules` (porcentajes por versión, RLS completa).
- **Cálculo** (Decimal, sin float): humano 3.5→fracción 0.035; A/I/U sobre directTotal, IVA sobre
  utilidad; verificado contra el golden master (admin 11.762.956,79… / total 372.247.169,97… ±0.01).
- **RLS runtime 93/93** (+4 AIU): A inserta/actualiza en su versión draft; cross-org bloqueado
  (WITH CHECK); **versión emitida (approved) ⇒ AIU read-only**.
- **Tests** 687 (+21): aiu-calc (conversión, rangos, fórmulas golden master, IVA sobre utilidad,
  sin AIU ⇒ total=directo) + repo fixture (vacío/no editable, write no soportada) + route-config
  (solo 4 % del navegador; "AIU ajustable por versión"; Guardar; read-only).
- **Seguridad**: navegador solo envía 4 %; viewer/directTotal/montos server-side; upsert atómico;
  sin service-role; sin fallback fixture. **Sin cambios remotos**.
- **Builds**: fixture + db local PASS. typecheck/lint 0, gm 22/22, gm:import, validador 214/0/0.

---

## CIERRE 4D.1 — smoke real de revisión operativa (2026-06-05)

> Verificación MANUAL de la usuaria en `https://construction-ops-psi.vercel.app`.
> Tag `wave-4d1-operational-budget-review-production-v1`.

- PRESUPUESTO BASE → V01: resumen (14 capítulos, ~132 ítems, total directo) ✅; capítulos
  navegables ✅; ítems BOQ visibles ✅; códigos canónicos + trazabilidad correctos ✅; etiquetas
  "normalizado" donde corresponde ✅.
- **Oleada 4D.1 CERRADA.** Siguiente: 4D.2 (AIU editable + total general por versión).

---

## 4D.1 — revisión operativa del presupuesto importado (2026-06-05)

> Rama `integration/wave-4d1-budget-review`. **Sin migración** (remoto **20/20** intacto).

- **Repositorio** (db RLS-bound + fixture): `listChaptersByEstimateVersion`/`getChapterById`/
  `listItemsByChapter`; cross-org ⇒ `[]`/`ChapterNotFoundError`; subtotales recalculados/derivados.
- **Tests** 666 (+16): review fixture (14 capítulos ordenados; Σ subtotales ≈ total directo del
  golden master ±1 COP; cross-org/not-found; ítems ordenados) + route-config (tabla de capítulos,
  detalle de capítulo, trazabilidad discreta, pertenencia validada).
- **UI**: resumen + tabla de capítulos en el detalle del presupuesto; ruta capítulo con ítems BOQ;
  indicador "normalizado" solo cuando `source_code≠code`; reimport bloqueada.
- **Builds**: fixture + db local PASS (ruta capítulo `ƒ`). typecheck/lint 0, gm 22/22, gm:import,
  validador 214/0/0.
- **Sin cambios remotos**; sin importación; valores monetarios derivados de datos persistidos.

---

## CIERRE 4C.3 — smoke real de importación con normalización (2026-06-05)

> Verificación MANUAL de la usuaria en `https://construction-ops-psi.vercel.app` (`supabase`+`db`).
> Tag `wave-4c3-real-excel-import-production-v1`.

- **Excel histórico ORIGINAL importado desde la UI**: upload → preview → sugerencias visibles →
  normalización controlada → Confirmar → "Importación completada" ✅. No usó la copia corregida.
- **Trazabilidad `source_code`/`source_row`** aplicada; **V01 ya contiene datos reales** ✅.
- **Oleada 4C.3 CERRADA.** Siguiente: 4D.1 (revisión operativa del presupuesto importado).

---

## 4C.3 — normalización reversible de códigos (2026-06-05)

> Rama `integration/wave-4c3-source-normalization`. Migración `20260605120000` ⇒ **20/20**.

- **Migración** aditiva/reversible (`source_code`/`source_row` en `chapters`+`boq_items` + CHECK
  `source_row>0`); RPC extendida (misma firma) persiste `code` canónico + origen. Dry-run = 1.
- **RLS runtime 89/89** (+2: capítulo e ítem persisten `code` canónico + `source_code` + `source_row`;
  atomicidad/doble-submit/cross-org/anon intactos).
- **Tests** 650: parser 4C.3 (algoritmo determinista 7→11/8→12/9→13/10→14 + genérico; propagación de
  prefijos; histórico 2.0x→3.0x; ambiguo bloqueado + override que resuelve; sourceCode/sourceRow
  preservados; digest original estable ante overrides) + route-config de la UI "Revisar numeración".
- **Seguridad**: el navegador solo envía intención de mapping (`overrides`); reconstrucción/validación
  server-side; nada se renumera en silencio; reimport bloqueado; sin service-role.
- **Builds**: fixture + db local PASS. typecheck/lint 0, gm 22/22, gm:import, validador 214/0/0.
- **Privacidad**: Excel privado real NO usado (fixtures sintéticos); sin importación remota; V01 vacía.

---

## 4C.2 — compatibilidad con plantilla real de cotización (2026-06-05)

> Rama `integration/wave-4c1-excel-import` (fix de parser, **sin migración**). Remoto **19/19** intacto.

- **Causa del fallo** (preview con Excel real): `SUBTOTAL CAPITULO` clasificado como capítulo
  incompleto + número de fila desfasado por `blankrows:false`.
- **Fix** (parser): `blankrows:true` (fila real), palabras reservadas (SUBTOTAL ignorado; TOTAL
  COSTOS DIRECTOS cierra BOQ; AIU/pagos ignorados), 7 columnas (CAP auxiliar ignorada), diagnóstico
  agregado (recorre toda la hoja), duplicados sin normalización (capítulo=error, ítem=warning),
  confirmación bloqueada si hay errores.
- **Tests** 651: parser reescrito (16 casos: forma real, fila real, agregado, duplicados,
  subtotal, fatales). build fixture + db local PASS, gm 22/22, gm:import, validador 214/0/0.
- **Privacidad/seguridad**: Excel privado real NO usado (workbooks sintéticos); sin migración;
  no se confirmó importación (V01 vacía); sin escrituras remotas.

---

## 4C.1 — importación de Excel: validación local + migración remota (2026-06-05)

> Rama `integration/wave-4c1-excel-import`. Migración `20260604140000` ⇒ **19/19**.

- **Migración** aditiva/reversible (RPC `import_boq_into_version`, sin tablas/RLS nuevas);
  dry-run = 1 migración esperada (sin seeds); push controlado.
- **Seguridad RPC**: `SECURITY INVOKER`, autor/identidad por `app._auth_uid()`, `FOR UPDATE`
  + versión vacía (anti doble-submit), subtotal recalculado server-side, `GRANT` solo
  `authenticated` (ACL sin `anon`).
- **RLS runtime 87/87** (+10 import): recálculo server-side, atomicidad (ítem inválido ⇒ 0
  capítulos), doble importación bloqueada (sin duplicar), cross-org `version_not_found`, deny
  sin sesión, anon sin EXECUTE.
- **Tests** 651 (+28): parser (hoja/encabezados/clasificación/recálculo/advertencias/errores/
  digest estable; encabezados ES con acentos), route-config de UI (preview→confirm, digest,
  doble-submit, estado importado/bloqueado).
- **Builds**: fixture PASS; **db LOCAL vacío** PASS; **db LOCAL sembrado** PASS. Ruta `/import`
  `ƒ`. typecheck/lint 0, gm 22/22, gm:import, validador 214/0/0.
- **Privacidad**: Excel privado real NO usado (workbooks sintéticos en memoria); archivo no se
  persiste; contenido no se registra en logs. Sin escrituras remotas salvo la migración; sin
  importación remota desde terminal.

---

## CIERRE 4B.3 — smoke productivo real de presupuesto + V01 (2026-06-04)

> Verificación MANUAL de la usuaria en `https://construction-ops-psi.vercel.app`
> (`supabase`+`db`). Tag `wave-4b3-real-estimates-production-v1`.

- **Presupuesto remoto real creado desde la UI**: `PRESUPUESTO BASE` con **V01** activa
  (ENTRE PATIOS → PRIMER PISO) ✅. Conteos: 0 capítulos / 0 ítems ✅. Placeholder de
  importación de Excel visible ✅. **Sin fixture en DB mode** ✅.
- **Oleada 4B.3 CERRADA.** Siguiente: 4C.1 (importación controlada de Excel a V01).

---

## 4B.3 — presupuesto inicial + V01: validación local + migración remota (2026-06-04)

> Rama `integration/wave-4b3-real-estimates`. Migración `20260604130000` ⇒ **18/18**.

- **Migración** aditiva/reversible (`estimates.description`+`created_by` + RPC atómica);
  dry-run = 1 migración esperada (sin seeds); push controlado. RLS sin cambios.
- **Seguridad de la RPC** (ajuste obligatorio): SIN `p_created_by`; autor derivado de
  `app._auth_uid()`; `SECURITY INVOKER`; `REVOKE FROM PUBLIC+anon` + `GRANT TO authenticated`
  (ACL verificada sin `anon`).
- **RLS runtime 77/77** (+10 estimates): autor derivado, V01, atomicidad (code-dup revierte,
  sin huérfanos), cross-org WITH CHECK, deny sin sesión/membresía, anon sin EXECUTE.
- **Tests** 623 (+35): validación pura, selector sin fallback, fixture, db-repo (RPC sin
  p_created_by, anti-colisión, scope no visible ⇒ deny), route-config de UI.
- **Builds**: fixture PASS; **db LOCAL vacío** PASS; **db LOCAL con estimate+V01** PASS.
  Rutas de estimates `ƒ`. typecheck/lint 0, gm 22/22, gm:import, validador 214/0/0.
- **Sin escrituras remotas** salvo la migración aprobada; sin seeds remotos; sin presupuesto
  remoto creado desde terminal. Sin secretos impresos/en disco.

---

## CIERRE 4B.2 — smoke productivo real de alcances (2026-06-04)

> Verificación MANUAL de la usuaria en `https://construction-ops-psi.vercel.app`
> (`supabase`+`db`). Tag `wave-4b2-real-scopes-production-v1`.

- **Alcance remoto real creado desde la UI**: `PRIMER PISO` (floor) en `ENTRE PATIOS` ✅.
- Listado de alcances ✅; detalle ✅; placeholder de presupuesto visible ✅; footer
  "Datos reales" ✅; **sin fixture en DB mode** ✅. Flujo create → list → detail verificado.
- **Oleada 4B.2 CERRADA.** Siguiente: 4B.3 (presupuesto inicial real por alcance).

---

## 4B.2 — alcances reales: validación local + migración remota (2026-06-04)

> Rama `integration/wave-4b2-real-scopes`. Migración `20260604120000` ⇒ **17/17 Local = Remote**.

- **Migración** aditiva/reversible (`description` + `created_by` en `project_scopes`);
  dry-run = 1 migración esperada (sin seeds); push controlado. RLS sin cambios.
- **RLS runtime 67/67** (+6 checks de `project_scopes`: A ve su alcance, B no; INSERT en su
  proyecto OK; INSERT cross-org bloqueado por WITH CHECK; UPDATE cross-org 0 filas; sin org 0).
- **Tests** 588 (+42 de scopes): validación pura, selector sin fallback, fixture, db-repo con
  cliente simulado (created_by server-side, anti-colisión code, proyecto no visible ⇒ deny),
  route-config de UI (CTAs ancla, hidden projectId, sin campos sensibles).
- **Builds**: fixture PASS; **db LOCAL vacío** PASS; **db LOCAL con proyecto+alcance** PASS.
  Rutas de scopes `ƒ` (request-time). typecheck/lint 0, gm 22/22, gm:import, validador 214/0/0.
- **Sin escrituras remotas** salvo la migración aprobada; sin seeds remotos; sin alcance remoto
  creado desde terminal. Sin secretos impresos/en disco.

---

## CIERRE 4B.1 — smoke productivo real verificado (2026-06-04)

> Verificación MANUAL de la usuaria en `https://construction-ops-psi.vercel.app`
> (`APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=db`). Tag `wave-4b1-real-projects-production-v1`.

- Login real Supabase ✅; footer **"Datos reales"** ✅.
- `/projects` + CTA "+ Nuevo proyecto" + formulario ✅; **proyecto remoto real creado desde la
  UI**: `ENTRE PATIOS` (Cali, Activo) ✅; redirect ✅; detalle `/projects/[id]` visible ✅.
- **Sin datos fixture en producción (DB mode)** ✅. Flujo create → list → detail verificado.
- **Oleada 4B.1 CERRADA.** Siguiente: 4B.2 (alcances reales por proyecto).

---

## CIERRE estabilización de producción 4B.1 — db mode + deploy (2026-06-04)

> `main = origin/main = c6d0ad1` (merge `--no-ff` de `c2f5373`, sin conflictos).
> Production deploy READY → `https://construction-ops-psi.vercel.app`.

- **Diagnóstico**: (1) CTAs no navegaban por `<Link><Button></Button></Link>`
  (`<a><button></button></a>`, interactivo anidado); (2) `/apu`,`/catalog`,`/quantities`,
  `/planning` estáticas y `/estimates` con `getDemoViewer()` exponían demo/fixture en `db`;
  (3) footer hardcodeado `Oleada 3A — fixture`.
- **Fix**: CTAs → `Button asChild` + `Link`; rutas hermanas + layout → `force-dynamic` +
  `resolveViewer()` (viewer real en db, demo en fixture), `/planning` sin UUID demo, empty
  state honesto; footer mode-aware (`readModelModeLabel`: db="Datos reales").
- **Validación** ✅: typecheck/lint 0, **546 tests** (+26), build fixture (rutas dashboard
  todas `ƒ`), **build `db` LOCAL vacío y sembrado** PASS, gm:regression **22/22**, gm:import
  PASS, validate-agents **214/0/0**, `git diff --check` limpio.
- **Preview Vercel** READY (build production-like en infra Vercel; Preview protegido por SSO
  del equipo ⇒ 401 a todo, esperado). **Production** READY + smoke del dominio: `/login` 200;
  `/`,`/dashboard`,`/projects`,`/apu`,`/catalog`,`/quantities`,`/planning`,`/estimates` ⇒
  **307 → /login** (deny-by-default, sin fixture público, sin 500).
- **Sin escrituras remotas** de proyectos; variables de Vercel **no modificadas**; pruebas de
  DB contra Postgres **local**. Sin secretos impresos ni en disco.
- **Pendiente (manual, usuaria)**: login + crear primer proyecto desde `/projects/new`
  (listar, abrir detalle). Verificación autenticada de footer "Datos reales", CTAs y ausencia
  de fixture requiere sesión (solo la usuaria). Rollback = `READ_MODEL_SOURCE=fixture` + redeploy.

---

## CIERRE fix `/dashboard` DB vacía — merge a `main` (2026-06-04)

> `main = origin/main = b942f3f` (merge `--no-ff` de `d1aa929`, sin conflictos).
> Tag `wave-4b1-empty-db-dashboard-ready-v1`.

- **Causa raíz**: `/dashboard` se prerenderizaba estáticamente y dependía de un UUID demo fijo
  (`DEMO_PROJECT_ID`) durante el prerender; en modo `db` con base remota vacía,
  `getDashboardSummary` lanzaba `ProjectNotFoundError` y el build de Vercel abortaba.
- **Fix**: dashboard request-time (`force-dynamic` + `await resolveViewer()`), proyecto activo
  derivado de `listProjects(viewer)` (`selectActiveProjectId`, sin UUID demo), empty state con CTA
  a `/projects/new`, `getDashboardSummary` en try/catch, sin fallback silencioso db→fixture.
- **Post-merge `main`** ✅: typecheck/lint 0, **520 tests**, build con **`ƒ /dashboard`** y
  **`ƒ /projects/new`**, gm:regression **22/22**, gm:import PASS, validate-agents **214/0/0**,
  `git diff --check` limpio.
- **Builds en modo `db` (Postgres LOCAL) PASS** (verificados en rama): (A) DB sembrada y
  (B) **DB vacía** (2 orgs / 10 profiles / 0 proyectos) — ambos compilan, `/dashboard` dinámica,
  sin `ProjectNotFoundError`.
- **Solo código** (sin migración): remoto intacto **16/16**, seeds 0, proyectos 0.
  **Vercel intacto** (`supabase`+`fixture`; `DATABASE_URL` privada, no expuesta).
- **Deuda**: rutas hermanas estáticas `/apu`,`/catalog`,`/quantities`,`/planning` deben migrarse
  a viewer real request-time antes de uso productivo multitenant.
- **Pendiente (manual, usuaria)**: `READ_MODEL_SOURCE` `fixture`→`db` + **redeploy SIN Build
  Cache** + smoke de creación de proyecto. Rollback = `fixture` + redeploy.

---

## CIERRE hardening `/projects/new` — merge a `main` (2026-06-04)

> `main = origin/main = 0ad7f56` (merge `--no-ff` de `7b112cc`, sin conflictos).
> Tag `wave-4b1-project-creation-runtime-hardening-v1`.

- **Post-merge `main`** ✅: `/projects/new` conserva `force-dynamic` + `await resolveViewer()`
  (dinámica intrínseca); typecheck/lint 0, **508 tests**, build con **`ƒ /projects/new`**
  (sin prerender; ausente del `prerender-manifest`), gm:regression **22/22**, gm:import PASS,
  validate-agents **214/0/0**, `git diff --check` limpio.
- **Solo código** (sin migración): remoto intacto **16/16**, seeds 0, proyectos 0.
  **Vercel intacto** (`supabase`+`fixture`).
- **Hipótesis ambiental** (caché estática/edge obsoleta) **aún no confirmada como certeza**.
- **Pendiente (manual, usuaria)**: `READ_MODEL_SOURCE` `fixture`→`db` + **redeploy SIN Build
  Cache** + smoke `/projects/new`. Rollback = `fixture` + redeploy.

---

## Fix 4B.1 (residual) — `/projects/new` intrínsecamente dinámica (2026-06-03)

> Rama `fix/wave4b1-runtime-creation-env` (NO mergeada). Solo código (sin migración).

- **Diagnóstico (código ya correcto)** ✅: sin literales `process.env.*` (no inlining);
  chunk compilado lee `a.READ_MODEL_SOURCE`/`a.APP_AUTH_MODE` con `a=process.env`
  (runtime); `/projects/new` es `ƒ`, sin prerender ni entrada en `prerender-manifest`
  (force-dynamic efectivo); el Proxy local leyó `supabase` en runtime (307→/login).
  **Conclusión: el guard evalúa request-time correctamente; el bloqueo residual en prod
  es caché estática/edge OBSOLETA de despliegues previos (`○`), no defecto de código.**
- **Fix (endurecimiento)**: `/projects/new` ahora `async` + `await resolveViewer()`
  (señal dinámica intrínseca vía `cookies()`, como `/projects`) + se conserva
  `force-dynamic`. Vercel no sirve rutas dinámicas intrínsecas desde caché estática ⇒
  el próximo deploy supera el HTML obsoleto. Defensa en profundidad (no solo Proxy).
- **Validación local** ✅: typecheck/lint 0, **508 tests** (+1), build con `ƒ /projects/new`
  (sin prerender), gm 22/22, gm:import PASS, validate-agents 214/0/0, `git diff --check` limpio.
- **Recomendación de deploy**: build limpio sin caché + purgar caché del proyecto antes de
  reintentar `db`. Rollback = `fixture` + redeploy. Sin escritura remota; Vercel intacto.

---

## CIERRE Fix `/projects/new` — merge a `main` (2026-06-03)

> `main = origin/main = 1999ffb` (merge `--no-ff` de `9e9dd96`, sin conflictos).
> Tag `wave-4b1-project-creation-route-fix-v1`.

- **Post-merge `main`** ✅: directiva `force-dynamic` presente; typecheck/lint 0,
  **507 tests**, build OK con **`ƒ /projects/new`** (antes `○`), gm:regression **22/22**,
  gm:import PASS, validate-agents **214/0/0**, `git diff --check` limpio.
- **Solo código** (sin migración): remoto intacto **16/16**, seeds 0, proyectos 0.
  **Vercel intacto** (`supabase`+`fixture`).
- **Pendiente (manual, usuaria)**: `READ_MODEL_SOURCE` `fixture`→`db` + redeploy + smoke de
  creación (`/projects/new` debe mostrar formulario). Rollback = `fixture` + redeploy.

---

## Fix 4B.1 — bloqueo de `/projects/new` por prerender estático (2026-06-03)

> Rama `fix/wave4b1-project-creation-mode-guard` (NO mergeada). Solo código (sin migración).

- **Síntoma**: en modo `db`, `/projects/new` mostraba "Modo demostración activo." pese a
  `READ_MODEL_SOURCE=db`. (`/projects` y `/projects/[id]` OK.)
- **Causa raíz** ✅: `/projects/new` se prerenderizaba **estáticamente** (`○`) por no usar
  APIs dinámicas; `isCreationModeEnabled()` se evaluaba en **build-time** con defaults
  `demo`+`fixture` ⇒ guard horneado en `false`. La server action guardaba bien
  (request-time); el bug era solo el render de la página.
- **Fix**: `export const dynamic = 'force-dynamic'` en `/projects/new/page.tsx` ⇒
  request-time. Build pasa de `○` a **`ƒ /projects/new`**. Sin cambios de seguridad.
- **Validación local** ✅: typecheck/lint 0, **507 tests** (+2: regresión route-config),
  build OK, gm 22/22, gm:import PASS, validate-agents 214/0/0, `git diff --check` limpio.
- **Sin** escritura remota; **Vercel intacto**; **NO merge a main**. No requiere migración.

---

## CIERRE Fix 4B.1 — merge a `main` + migración remota correctiva (2026-06-02)

> `main = origin/main = 82c2fa7` (merge `--no-ff` de `ab08b28`, sin conflictos).
> Tags `wave-4b1-membership-fix-code-ready-v1` / `wave-4b1-membership-fix-remote-ready-v1`.

- **Post-merge `main`** ✅: typecheck/lint 0, **505 tests**, build OK, gm:regression
  **22/22**, gm:import PASS, validate-agents **214/0/0**, `git diff --check` limpio.
- **Dry-run remoto** ✅: exactamente **1** migración pendiente
  (`20260602130000_fix_membership_app_grants_and_profiles_self_rls.sql`), **0 seeds**.
- **Push real** `db push --linked` (sin `--include-seed`) ✅: migración aplicada.
- **`migration list --linked`** ✅: **16/16 Local = Remote**, ninguna pendiente.
- **Seeds NO ejecutados** · **proyectos remotos NO creados** · sin SQL manual · sin
  `migration repair` · sin service-role · **Vercel intacto** (`supabase`+`fixture`).
- **Pendiente (manual, usuaria)**: `READ_MODEL_SOURCE` `fixture`→`db` + redeploy + repetir
  smoke de creación. Rollback = `fixture` + redeploy.

---

## Fix 4B.1 — membresía en modo `db` (grants `app` + recursión RLS profiles) (2026-06-02)

> Rama `fix/wave4b1-membership-resolution` (NO mergeada). Migración
> `20260602130000_fix_membership_app_grants_and_profiles_self_rls.sql`.

- **Síntoma remoto**: con `READ_MODEL_SOURCE=db`, `/projects` mostraba "El usuario no
  tiene membresía." (login/logout OK). Rollback a `fixture` por la usuaria; 0 proyectos
  remotos creados.
- **Causa raíz #1 (grants)** ✅ demostrada: migraciones sin `GRANT USAGE`/`EXECUTE` de
  `app` a `authenticated`; el harness los daba en runtime (enmascaraba). En remoto ⇒
  "permission denied for schema app" en la 1ª lectura (`profiles`).
- **Causa raíz #2 (recursión)** ✅ demostrada: `profiles_select` basada en
  `current_org()` recursa cuando el `SECURITY DEFINER` no salta RLS (postgres remoto sin
  `BYPASSRLS`) ⇒ "stack depth limit exceeded".
- **Fix**: migración concede `USAGE`/`EXECUTE` de `app` a `authenticated`; reemplaza
  `profiles_select` por `profiles_self_select` (self-read por `auth.uid()`, sin
  `current_org()`). Harness deja de enmascarar y valida los grants; +3 checks.
- **Validación local** ✅: **RLS runtime 61/61** (58+3), typecheck/lint 0, **505 tests**,
  build OK, gm 22/22, gm:import PASS, validate-agents 214/0/0, `git diff --check` limpio.
- **Sin** escritura remota; **Vercel intacto**; **NO merge a main**. Pendiente:
  merge + `db push` de la migración + reintento `db` por la usuaria.

---

## CIERRE Oleada 4B.1 — merge a `main` + migración remota de proyectos (2026-06-02)

> `main = origin/main = 10ac567` (merge `--no-ff` de `1f5f908`, sin conflictos).
> Tags `wave-4b1-projects-code-ready-v1` y `wave-4b1-projects-remote-ready-v1`.

- **Post-merge `main`** ✅: typecheck/lint 0, **505 tests**, build OK, gm:regression
  **22/22**, gm:import PASS, validate-agents **214/0/0**, `git diff --check` limpio.
- **Dry-run remoto** ✅: exactamente **1** migración pendiente
  (`20260602120000_projects_authorship.sql`), **0 seeds**, sin diferencias inesperadas.
- **Push real** `db push --linked` (sin `--include-seed`) ✅: migración aplicada.
- **`migration list --linked`** ✅: **15/15 Local = Remote**, ninguna pendiente.
- **Seeds NO ejecutados** · **proyectos remotos NO creados** · sin SQL manual · sin
  `migration repair` · sin service-role · **Vercel intacto** (`supabase`+`fixture`).
- **Pendiente (manual, usuaria)**: cambiar `READ_MODEL_SOURCE` `fixture`→`db` + redeploy +
  crear primer proyecto real (smoke remoto). Rollback = `fixture` + redeploy.

---

## Oleada 4B.1 — vertical slice real de proyectos (validación local) (2026-06-02)

> Rama `integration/wave-4b1-real-projects` (`2397323`). **NO** mergeado a `main`.
> Contrato `docs/PROJECTS_CRUD_CONTRACT.md` v1.

### Implementación (secuencial db-rls → frontend-boq)
- **DB/RLS** (backup `backup/wave4b1-projects-db` `3a403bd`): migración
  `20260602120000_projects_authorship.sql` (`description` + `created_by` FK profiles
  ON DELETE SET NULL + índice); módulo `apps/web/server/projects/` con
  `ProjectsWriteRepository` (`createProject`/`getProjectById`), impl db (RLS-bound, **sin
  service-role**) + fixture (escritura no soportada), validación pura + generación de
  `code` (slug + anti-colisión 23505), selector por `READ_MODEL_SOURCE`.
- **UI** (backup `backup/wave4b1-projects-ui` `6f41fd4`): server action
  `createProjectAction` (viewer real server-side; ignora org/created_by/code/id/role del
  navegador; redirect Next 16 fuera del try/catch), `mode-guard` (creación solo
  `supabase`+`db`), lista por `resolveViewer()`, formulario `/projects/new`, detalle
  `/projects/[id]` con `notFound()` cross-org.

### Resultados (todo PASS)
- typecheck 0, lint 0, **505 tests** (37 archivos; +44 sobre 461: validación/repo/selector/
  action), build OK (`/projects` ƒ, `/projects/[id]` ƒ, `/projects/new`), gm:regression
  **22/22**, gm:import PASS, validate-agents **214/0/0**, `git diff --check` limpio.
- **RLS runtime 58/58** (47 previos + 11 de projects): INSERT en org del viewer OK +
  visible en SELECT; `created_by` = autor; aislamiento SELECT A/B; getById cross-org → 0
  filas; sin sesión → deny (SELECT+INSERT); sin membresía → deny; INSERT con
  `organization_id` ajeno (spoofing) → rechazado por `WITH CHECK`.
- **Smoke HTTP demo+fixture**: `/projects` 200, `/projects/new` 200, `/login` 200;
  "+ Nuevo proyecto" **deshabilitado** en demo (`aria-disabled`, title "Disponible en
  modo supabase+db"). La demo pública (fixture) sigue operativa.

### Pendiente (no bloqueante para revisión)
- **Smoke interactivo en navegador en modo `db`** (login real → crear → ver en lista →
  abrir detalle): validado a nivel **DB (RLS 58/58)** + **unit (action/mode-guard/
  validación)** + **build**; falta la confirmación manual con sesión real local (los
  seeds no fijan contraseña de login). Recomendado antes del smoke remoto.

### Restricciones respetadas
- Sin tocar Vercel ni remoto productivo; sin escritura remota; sin service-role; sin
  secretos; sin `package.json`. **NO merge a `main`. 4C NO iniciada.**

---

## CIERRE Oleada 4A.3 — Supabase remoto + autenticación online validada (2026-06-02)

> Cierre técnico de la microfase 4A.3 completa. `main = origin/main = 32b7937`.
> Tag `wave-4a3-online-auth-validated-v1`.

- **Auditoría read-only remota** ✅: `supabase migration list --linked` ⇒ **14/14
  Local = Remote**, ninguna pendiente. PostgreSQL **17**. Org `GRUPO ICONIC`, 1 profile
  admin (rol `admin`). **Seeds demo remotos: 0**.
- **Smoke online real** ✅ (confirmado manualmente por la usuaria en
  `https://construction-ops-psi.vercel.app`): `/login` visible → login admin válido →
  sesión creada → redirect `/dashboard` → dashboard fixture sanitizado visible.
  **`/logout` = comprobación final manual pendiente** (eliminar sesión → `/login` →
  re-login funcional).
- **Privacidad/seguridad** ✅: sin secret/service-role en frontend; clave publishable/anon
  (pública); sin datos reales de presupuesto expuestos; **`READ_MODEL_SOURCE=db` NO
  activado** (sigue `fixture`).
- **Vercel** (debe mantenerse): `APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=fixture`.
  Rollback = `demo` + `fixture` + redeploy.
- **Restricciones**: DB remota intacta (sin push/pull/repair/SQL/seeds/usuarios); sin
  deploy manual; sin force-push. **4B NO iniciada.**

---

## Oleada 4A.3c — fix login online (merge a `main`) (2026-06-02)

> Merge `--no-ff` de `fix/wave4a3-online-login` (`834029c`) a `main` → merge `ad8f32b`,
> **sin conflictos** (8 archivos, +272/-12).

- **Causa raíz**: el cliente de navegador resolvía `NEXT_PUBLIC_*` de forma **indirecta**
  (`env.X` con `env = process.env`); Next/Turbopack solo inyecta en el bundle las
  referencias **literales** `process.env.NEXT_PUBLIC_*`, así que en el navegador quedaban
  `undefined` y `getPublicSupabaseEnv()` lanzaba **antes** de `signInWithPassword()`
  (error genérico, sin request a `/auth/v1/token`, sin log de Auth).
- **Fix**: `client.ts` pasa referencias literales inyectables; submit extraído a
  `server/auth/login-flow.ts` (`runPasswordLogin`, puro: 1 sola llamada a Supabase,
  error legible, redirección `next` sanitizada anti open-redirect). Diseño/copy intactos.
- **Post-merge `main` (`ad8f32b`)** ✅: typecheck 0, lint 0, **461 tests** (33 archivos),
  build (rutas auth + Proxy + `/api/exports`), gm:regression **22/22**, gm:import PASS,
  validate-agents **214/0/0**, `git diff --check` limpio.
- **DB remota intacta** (14/14 migraciones; sin push/pull/repair/SQL/seeds/usuarios);
  **Vercel intacto** (`APP_AUTH_MODE=demo` + `READ_MODEL_SOURCE=fixture`).
- **Activación online pendiente** (paso manual de la usuaria). Rollback = `demo`+`fixture`.
  Tag `wave-4a3-online-login-fix-v1`. **4B NO iniciada.**

---

## Oleada 4A.3b — bootstrap real del esquema remoto (2026-06-02)

> Merge de paridad PG17 a `main` (`139dd52`) + `supabase db push --linked` (una vez,
> sin seeds) sobre `construction-ops-prod`.

- **Post-merge `main`** ✅: `config.toml` `major_version = 17`; typecheck/lint 0,
  **452 tests**, build, gm:regression 22/22, gm:import PASS, validate-agents 214/0/0,
  `git diff --check` limpio. Tag `wave-4a3-pg17-bootstrap-ready-v1`.
- **Push real** `db push --linked` ✅: 14 migraciones aplicadas en orden (único aviso
  `NOTICE pgcrypto already exists`, benigno). "Finished supabase db push."
- **Post-push** `migration list --linked` ✅: **14/14 Local = Remote**, ninguna pendiente.
- **Seeds NO ejecutados** · **usuarios NO creados** · sin SQL/`migration repair` ·
  **Vercel intacto** (`demo`+`fixture`). Tag `wave-4a3-remote-schema-bootstrap-v1`.
- **Estado remoto**: esquema presente, **sin datos funcionales** (sin org/usuarios reales).

**Resultado microfase**: ✅ PASS. Esquema remoto listo; pendiente 4A.3c (org + admin + login online).

---

## Oleada 4A.3a — paridad local Postgres 17 + dry-run remoto (2026-06-02)

> Microfase de bootstrap remoto en `integration/wave-4a3-remote-bootstrap`. Solo
> alineación local + `db push --dry-run` (sin push real). Validación read-only.

- **Contexto**: remoto `construction-ops-prod` vinculado y **vacío** (0 migraciones).
  Mismatch resuelto en local: `config.toml` `major_version` 15 → **17** (paridad con
  remoto PG 17.6.1).
- **Revalidación local en PG17** ✅: `server_version 17.6`; `db reset` (14 migraciones
  + 4 seeds) limpio; **RLS runtime 47/47 PASS** (0 FAIL).
- **Validación general** ✅: typecheck/lint 0, **452 tests** PASS, build PASS, gm:regression
  **22/22**, gm:import PASS, validate-agents **214/0/0**, `git diff --check` limpio.
- **Dry-run** `db push --dry-run --linked` ✅: listó **14 migraciones** en orden,
  **sin seeds**, **sin** aplicar cambios; `migration list --linked` confirma remoto con
  **0 migraciones** aplicadas.
- **Sin** cambios remotos · **Vercel intacto** (`demo` + `fixture`). Commit `8a76a75`.

**Resultado microfase**: ✅ PASS. Listo para autorizar `db push` real en sesión posterior.

---

## Última auditoría

- **Fecha**: 2026-05-30
- **Tipo**: validación de integración de Oleada 1 (rama `integration/wave-1`).
- **Resultado global**: ✅ PASS para merge a `main` (con salvedades de runtime documentadas).

---

## Categorías de validación (integración Oleada 1)

| Categoría | Estado | Detalle |
|-----------|--------|---------|
| Regresión financiera (golden master) | ✅ PASS (empírico) | 9/9 valores §3.4 confirmados en celdas reales del Excel; `gm:regression` 22/22; `gm:import` todas PASS; ±0.01 COP. Sin ajustar fórmulas |
| Fixture fila-por-fila | ✅ PASS | 14 capítulos + 131 ítems reales; SIN ítem de balanceo; Σ=costos_directos ±2.05e-8 |
| Privacidad (fixture/Excel) | ✅ PASS | Excel ignorado y no commiteado; `findPrivateLeaks` 0 fugas; datos de contratante/contratista excluidos |
| RLS multitenant | ✅ PASS (runtime) | **Estático** 70 tests + **Runtime 21/21 PASS** contra Postgres local (Supabase Docker): aislamiento A/B, denegación cross-org (UPDATE 0 filas + INSERT WITH CHECK), usuario sin organización 0 filas, helper `app.current_org()` desde JWT, 20 tablas con RLS FORCE |
| Inmutabilidad de snapshots | ✅ PASS (runtime) | `apu_calculation_snapshots` UPDATE/DELETE 0 filas; `price_observations` DELETE 0 filas + trigger de precio inmutable; versiones `issued` UPDATE/DELETE bloqueado + INSERT de hijo bloqueado; control positivo `draft` editable. Verificado en runtime real |
| Idempotencia importador | ✅ PASS | `gm:build-fixture` reproduce el fixture byte-idéntico (salvo EOL) |
| Privacidad por rol (endpoints) | ⏳ Pendiente | Requiere pricing/exports (Oleada 2-3) |
| Exportaciones por perfil | ⏳ Pendiente | Requiere exports (Oleada 3) |
| Licencias | ✅ PASS | Todas permisivas (MIT/Apache/Unlicense/ISC); sin AGPL; sin ag-grid-enterprise |
| Archivos privados en Git | ✅ PASS | `.gitignore` cubre `private/`, `*.xlsx`, `.env*`; Excel no en staging |
| Configuración de agentes | ✅ PASS | `validate-claude-agents.ps1` PASS 214/0/0 |
| Build / lint / typecheck / test | ✅ PASS | typecheck 0, lint 0, **108 tests PASS**, build Next 16.2.6 (9 rutas + Proxy); dev smoke 8/8 rutas HTTP 200 |

---

## FAIL bloqueantes activos

Ninguno.

## Salvedades (no bloqueantes para merge)

- Coordenadas celda-a-celda de hojas auxiliares (APU/CANTIDADES) quedan como
  referencia tentativa; no afectan la regresión de los 9 totales.

## Deuda técnica (no bloqueante)

- **B-004 — Supabase Realtime unhealthy en Docker Desktop (Windows)**: el
  contenedor `realtime` queda `unhealthy` y aborta `supabase start` por defecto.
  NO afecta RLS (solo se requiere el contenedor `db`); se arrancó excluyendo
  servicios no esenciales y el RLS runtime pasó 21/21. Revisar antes de
  implementar funcionalidades Realtime o antes de producción. Ver
  `docs/OPEN_QUESTIONS.md#B-004`.
- **B-005 — Espejo DTO de planning duplicado en el dominio (Oleada 3B)** ✅
  **RESUELTO 2026-06-01** (Oleada 3C, `integration/wave-3c`): `types.ts` ahora
  re-exporta los DTOs/enums de planning desde la **fuente única**
  `apps/web/lib/contracts/read-model.ts` y conserva solo tipos de dominio puro;
  se eliminó el campo muerto `financialProgressPct` y el `ScheduleSummaryView`
  sin uso. Validación: typecheck/lint 0, 389 tests, build (`/planning`),
  gm 22/22 + 9/9, diff limpio; cero regresiones (1 archivo, 252→176 líneas).
  Ver `docs/OPEN_QUESTIONS.md#B-005`.

---

## Histórico

| Fecha | Auditor | Resultado | Bloqueos |
|-------|---------|-----------|----------|
| 2026-05-29 | preparación inicial | estructura lista | PROJECT_MASTER vacío (B-001) |
| 2026-05-30 | orquestador (integración Oleada 1) | PASS pre-merge | RLS runtime pendiente (no bloqueante) |
| 2026-05-30 | orquestador (merge a main `58f4366`) | ✅ PASS post-merge | RLS runtime pendiente; Q8/Q9 abiertas |
| 2026-05-30 | orquestador (Oleada 1.5, rama `feature/wave-1.5-local-rls`) | 🟡 PARCIAL | Q8/Q9 RESUELTAS; offline PASS; **RLS runtime BLOQUEADO por corrupción del content store de Docker Desktop** |
| 2026-05-30 | orquestador (Oleada 1.5, RLS runtime real) | ✅ PASS | Docker reparado; **RLS runtime 21/21 PASS** contra Postgres local (Supabase Docker); B-003 RESUELTO |
| 2026-05-30 | orquestador (merge Oleada 1.5 a main `1ddc833`) | ✅ PASS post-merge | Ninguno bloqueante; B-004 (Realtime) como deuda técnica |
| 2026-05-30 | orquestador (integración Oleada 2A en `integration/wave-2a`) | ✅ PASS pre-merge | cost-domain + pricing integrados y unificados; **229 tests**; gm 22/22 + 9/9; sin merge a main |
| 2026-05-30 | orquestador (merge Oleada 2A a main `f0c7d23`) | ✅ PASS post-merge | **229 tests**; gm 22/22 + 9/9 diff=0; IVA por `base_type='utility'`; sin cambios de DB ⇒ RLS 21/21 vigente; tag `wave-2a-domain-pricing-v1` |
| 2026-05-30 | orquestador (integración Oleada 2B en `integration/wave-2b`) | ✅ PASS pre-merge | adaptador Homecenter integrado y reconciliado; **309 tests** (80 adapters); gm 22/22 + 9/9; persistencia solo vía `PricingApprovalPort` real; sin scraping; sin merge a main |
| 2026-05-30 | orquestador (merge Oleada 2B a main `47fcfb3`) | ✅ PASS post-merge | **309 tests** (80 adapters); gm 22/22 + 9/9; sin cambios de DB ⇒ RLS 21/21 vigente; sin scraping/API inventada; tag `wave-2b-homecenter-adapter-v1` |
| 2026-05-31 | orquestador (integración Oleada 3A en `integration/wave-3a`) | ✅ PASS pre-merge | read-model canónico cableado a la UI; **356 tests**; gm 22/22 + 9/9; dev smoke 8/8 HTTP 200 datos reales; sin merge a main |
| 2026-05-31 | orquestador (merge Oleada 3A a main `d1f0920`) | ✅ PASS post-merge | **356 tests**; gm 22/22 + 9/9; 1 `ReadModelPort`/`getReadModel`; sin dev-read-model/mocks activos; sin cambios de DB ⇒ RLS 21/21 vigente; tag `wave-3a-functional-read-model-ui-v1` |
| 2026-06-01 | orquestador (integración Oleada 3B en `integration/wave-3b` `595e5a5`) | ✅ PASS pre-merge | planning DB+RLS+read-model+dominio CPM+`/planning`+Gantt; **389 tests**; **RLS runtime 32/32** (24 tablas FORCE); gm 22/22 + 9/9; dev smoke **9/9 HTTP 200**; CPM server-side; sin merge a main |
| 2026-06-01 | orquestador (merge Oleada 3B a main `40118a5`) | ✅ PASS post-merge | sin conflictos; **389 tests**; build (`/planning`); gm 22/22 + 9/9; validador 214/0; **RLS runtime 32/32** (13 migraciones + 3 seeds, 24 tablas FORCE); dev smoke **9/9 HTTP 200** (sin fugas internas; rol management ve Holgura/Crítica); read-model canónico único; CPM solo en `modules/planning`; B-005 (espejo DTO interno, campo muerto) deuda no bloqueante; tag `wave-3b-planning-gantt-v1` |
| 2026-06-01 | orquestador (integración Oleada 3C exports `integration/wave-3c` `4b904db`) | ✅ PASS pre-merge | 5 formatos × 4 perfiles; whitelist server-side; **0 tablas crudas**, **0 recálculo** (Decimal Q9); **410 tests**; build (`/api/exports`); gm 22/22 + 9/9; smoke 6/6 HTTP 200 + negativos 400; privacidad por perfil; RLS 32/32 vigente; sin merge a main |
| 2026-06-01 | orquestador (reconciliación + merge Oleada 3C a main, Caso B squash) | ✅ PASS post-merge | `origin/main` divergió por PR squash (`b09158f`); rama `integration/wave-3c-main-reconciled` desde `origin/main` + merge `backup/wave3c-exports` (solo 15 archivos exports, sin conflictos/duplicación) → merge a `main`; **410 tests**; build (`/api/exports`); gm 22/22 + 9/9; validador 214/0; **smoke 6/6 HTTP 200** + negativos 400; privacidad por perfil; **RLS runtime 32/32 vigente** (sin cambios DB); tag `wave-3c-exports-v1` |
| 2026-06-01 | orquestador (integración Oleada 4A.1 auth/RLS `integration/wave-4a-auth-local` `adeafbe`) | ✅ PASS pre-merge | merge `--no-ff backup/wave4a-auth-db-local`, **sin conflictos** (4 archivos, +401); helpers de identidad real (`auth.uid()`→`profiles`) con compat demo, deny-by-default, SECURITY DEFINER (sin recursión); **reutiliza `profiles`/`organizations`** (0 tablas nuevas); 14 migraciones + 4 seeds; **RLS runtime 47/47** (32 previos + 15 auth: aislamiento real A/B, sin sesión/sin membresía→deny, cross-org bloqueado, rol admin vs obra, compat demo); typecheck/lint 0, **410 tests**, build, gm 22/22 + 9/9, validador 214/0; sin secretos/.env/privados; **sin merge a main** |
| 2026-06-02 | orquestador (integración 4A.2 UI auth `integration/wave-4a-auth-runtime` `5c60339`) | ✅ PASS pre-merge | merge `--no-ff backup/wave4a-auth-ui`, **sin conflictos** (11 archivos, +1106); runtime SSR + UI auth; **452 tests** (+29 auth-ui); build (Proxy + `(auth)/*` + `/api/exports`); gm 22/22 + 9/9; validador 214/0; **RLS runtime 47/47**; smoke local Supabase (login real, anti-escalamiento, logout, forgot/Mailpit); sin merge a main |
| 2026-06-02 | orquestador (merge Oleada 4A a main `de37d15`) | ✅ PASS post-merge | `--no-ff` sin conflictos (44 archivos, +3185/-133); DB/RLS + runtime SSR + UI auth; typecheck/lint 0, **452 tests**, build (Proxy + rutas auth + `/api/exports`), gm 22/22 + 9/9, validador 214/0/0; **RLS runtime 47/47** (14 migr + 4 seeds); **smoke demo 6/6 HTTP 200** (`/`→`/dashboard`, dashboard/projects/planning/login 200, `/api/exports` PDF); sin secretos/.env.local/privados; tag `wave-4a-auth-local-v1`; **Vercel demo+fixture**; remoto NO conectado; **Oleada 4A CERRADA** |

## Validación Oleada 1.5 (rama `feature/wave-1.5-local-rls`, 2026-05-30)

Objetivo: validar RLS **runtime** real contra PostgreSQL local (Supabase/Docker).

**Resuelto:**
- Q8 (base del descuento = `online_public_price`) y Q9 (redondeo `ROUND_HALF_UP`
  solo presentación) cerradas en DECISIONS/API_CONTRACTS/DATABASE_SCHEMA/OPEN_QUESTIONS.
- Supabase CLI `supabase ^2.102.0` (MIT) instalado como devDep raíz (sin global, sin remoto).
- Harness de pruebas RLS runtime creado: `scripts/rls-runtime/run.ts` (2 orgs,
  aislamiento, cross-org, sin-org, append-only, inmutabilidad de snapshots,
  versiones emitidas) — pendiente de ejecución real.

**Offline (todo PASS):** typecheck 0 · lint 0 · **108 tests** · build Next 16.2.6 ·
`gm:regression` 22/22 · `gm:import` PASS · `validate-claude-agents` 214/0/0 ·
`git diff --check` limpio. Excel ignorado; sin privados en staging.

**BLOQUEO (infraestructura, no código):** `supabase start` y `docker pull`
fallan con `write .../io.containerd.metadata.v1.bolt/meta.db: input/output error`.
El content store de containerd de Docker Desktop está corrupto (`docker system df`
no puede listar imágenes: blob faltante). Host con 1.5 TB libres ⇒ no es espacio.
**Requiere intervención del usuario**: reiniciar Docker Desktop y, si persiste,
*Troubleshoot → Clean / Purge data* (o reset a fábrica) para regenerar el store;
luego reintentar `supabase start` + `db reset` + `scripts/rls-runtime/run.ts`.
NO se conectó ninguna base remota. RLS runtime sigue **PENDIENTE** (solo estático).

## Validación RLS runtime REAL (rama `feature/wave-1.5-local-rls`, 2026-05-30)

Docker Desktop reparado por el usuario (content store regenerado). El orquestador
re-ejecutó el flujo completo contra el PostgreSQL local de Supabase (Docker).
**NO se conectó base remota; sin `supabase link`/`db push`.**

**Entorno:**
- `supabase start`: imágenes descargadas; **11 migraciones** aplicadas en orden.
  Servicios no esenciales excluidos (`-x realtime,studio,storage-api,imgproxy,
  edge-runtime,logflare,mailpit,vector`) por contenedor `realtime` *unhealthy*
  en Windows; el `db` (Postgres 15) es lo único requerido por el harness.
- `supabase db reset`: re-aplicó **11 migraciones + 2 seeds** sin errores.
- Fix de integración: `[db.seed]` en `config.toml` (los seeds no se cargaban por
  defecto) + seed `0001` ahora crea filas `auth.users` antes de `profiles`
  (FK `profiles_id_auth_users_fk` activo en el stack Supabase real).

**Harness `scripts/rls-runtime/run.ts` → 21 PASS / 0 FAIL:**

| # | Verificación runtime | Resultado |
|---|----------------------|-----------|
| Pre | seed org A / proyecto A aplicados; **20 tablas con RLS FORCE** | ✅ |
| 1 | helper `app.current_org()` = `organization_id` del JWT | ✅ |
| 2 | A ve su proyecto y **NO** ve el de B | ✅ |
| 3 | B ve su proyecto y **NO** ve el de A | ✅ |
| 4 | A no puede UPDATE proyecto de B (0 filas) | ✅ |
| 4b | A no puede INSERT en org B (WITH CHECK lanza error) | ✅ |
| 5 | usuario **sin organización** no ve proyectos (0 filas) | ✅ |
| 6 | `price_observations` **append-only** (DELETE 0 filas) + fila persiste + precio inmutable (trigger) | ✅ |
| 7 | `apu_calculation_snapshots` **inmutable** (INSERT ok; UPDATE/DELETE 0 filas) | ✅ |
| 8 | `estimate_versions` **emitida** (`issued`) bloquea UPDATE/DELETE + INSERT de hijo (capítulo) | ✅ |
| 9 | control positivo: en `draft` SÍ se edita dentro de la org (1 fila) | ✅ |

**Validaciones de proyecto (todas PASS):** typecheck 0 · lint 0 · **108 tests** ·
build Next 16.2.6 (9 rutas + Proxy) · `gm:regression` **22/22** · `gm:import`
PASS (privacidad 0 fugas) · `validate-claude-agents` **214/0/0** ·
`git diff --check` limpio (solo avisos LF→CRLF). Sin privados en staging; sin
`.env` trackeado; sin `package-lock.json`; sin `ag-grid-enterprise`; sin AGPL.

**Conclusión:** B-003 RESUELTO. RLS multitenant e inmutabilidad de snapshots
validados **empíricamente**. **Recomendación: APROBAR merge de
`feature/wave-1.5-local-rls` → `main`** (queda a decisión del usuario; este ciclo
NO hace merge). Habilita el inicio de Oleada 2 (cost-domain / pricing / homecenter).

## Validación post-merge (main, 2026-05-30)

Merge `--no-ff` `integration/wave-1` → `main` (commit `58f4366`). Resultados:
typecheck 0 · lint 0 · **test 108 PASS** · build Next 16.2.6 OK · `gm:regression`
**22/22** (9/9 golden master ±0.01 COP) · `gm:import` todas PASS ·
`validate-claude-agents` **214/0/0** · `git diff --check` limpio. Privacidad:
Excel ignorado y no versionado, 0 nombres de cliente en tracked, fixture
sanitizado sin ítem de balanceo. Sin `ag-grid-enterprise`, sin AGPL, sin `.env`
trackeado, sin `package-lock.json`. **Salvedad**: RLS solo estático (runtime
pendiente contra Supabase/Postgres local).

## Validación post-merge Oleada 1.5 (main, 2026-05-30)

Merge `--no-ff` `feature/wave-1.5-local-rls` → `main` (merge commit `1ddc833`),
sin conflictos. Validación post-merge en `main`:
typecheck 0 · lint 0 · **test 108 PASS** · build Next 16.2.6 (9 rutas + Proxy) ·
`gm:regression` **22/22** · `gm:import` **9/9 PASS** (regresión §3.4 diff=0;
cadena recálculo ±1.9e-8; privacidad 0 fugas) · `validate-claude-agents`
**214/0/0** · `git diff --check` limpio · árbol limpio. **Privacidad**: Excel
ignorado (`git check-ignore` confirma `private/`); sin `.env` trackeado; sin
`package-lock.json`; solo `ag-grid-community`/`ag-grid-react` (MIT), `enterprise`
únicamente en comentarios de prohibición; sin AGPL. **RLS runtime 21/21**
(validado en la rama; ver sección anterior). **Deuda técnica**: B-004 (Realtime
unhealthy en Windows), no bloqueante. **Oleada 1.5 CERRADA**; Q8/Q9 RESUELTAS.

## Validación integración Oleada 2A (rama `integration/wave-2a`, 2026-05-30)

Integración secuencial de los entregables de Oleada 2A en `integration/wave-2a`
(cherry-picks `6694d88` cost-domain + `1e8a869` pricing), unificación del
contrato de precios y resolución de la base del IVA. **Sin merge a `main`.**

**Unificación del contrato:**
- Fuente única de código `apps/web/lib/contracts/pricing-read.ts`. **Una sola**
  `interface PricingReadPort` / `ApprovedPriceContext` (verificado por grep).
  cost-domain re-exporta vía `modules/apu/pricing-port.ts`; pricing vía
  `modules/pricing/types.ts`. Sin dependencias circulares (el contrato solo
  importa `@/lib/utils/types`). cost-domain pasó su puerto a **async** + clases
  de error `ApprovedPriceNotFoundError`/`AmbiguousApprovedPriceError`.

**Base del IVA:**
- Eliminado el flag `contributesToUtilityBase` (sin código activo). Regla
  canónica: `base_type='utility'` aplica sobre el monto de la última línea
  `direct_cost` previa (Utilidad). IVA = Utilidad × 0.19, **diff=0** en gm:import.

**Resultados (todo PASS):** typecheck 0 · lint 0 · **229 tests** (cost-domain +
pricing + base) · build Next 16.2.6 (9 rutas + Proxy) · `gm:regression` **22/22**
· `gm:import` **9/9** (±0.01 COP, diff=0) · `validate-claude-agents` **214/0/0**
· `git diff --check` limpio.

**Privacidad:** proyección `ClientSafePrice` sin campos 🔒 (privacy.test.ts);
`INTERNAL_PRICE_FIELDS` cubre descuentos/ahorros/precio público/proveedor
interno; `price_observations` append-only y snapshots inmutables (tests de
pricing + cost-domain). Excel ignorado; sin `.env`/`package-lock`; sin
`ag-grid-enterprise` en dominio; sin AGPL; sin datos privados.

**RLS runtime:** la integración NO modificó `supabase/migrations|policies|seeds`
ni `apps/web/lib/db/schema.ts` ⇒ la validación **RLS runtime 21/21** de Oleada
1.5 continúa vigente (no se relevantó Docker). **B-004** (Realtime) sigue como
deuda técnica no bloqueante.

**Recomendación:** ✅ **APROBAR merge `integration/wave-2a` → `main`** (queda a
decisión del usuario; este ciclo NO hace merge). Antes de Oleada 2B: congelar
`docs/PRICING_ADAPTER_CONTRACT.md`.

## Validación integración Oleada 2B (rama `integration/wave-2b`, 2026-05-30)

Integración del adaptador Homecenter (cherry-pick `1a8f6fa` desde
`backup/wave2-homecenter`) + reconciliación contra el contrato congelado.
**Sin merge a `main`.**

**Reconciliación:**
- Tipos del adaptador alineados 1:1 con `PRICING_ADAPTER_CONTRACT`
  (`SupplierAdapter`, `RawSupplierItem`, `SkuMatchCandidate/Proposal`,
  `ImportPreview`, `ImportResult`); `RecordObservationInput` importado del módulo
  real `@/modules/pricing/types`.
- **Consumo del `PricingApprovalPort` real**: `MinimalApprovalPort` confirmado
  como subconjunto estructural (no lógica paralela). Añadido
  `tests/unit/pricing-adapters/port-reconciliation.test.ts` (type-level +
  runtime con `PricingApprovalService` real, append-only e idempotencia).
- `ResourceCatalog`/`ResourceRef` avalados como auxiliares de matching.

**Resultados (todo PASS):** typecheck 0 · lint 0 · **309 tests** (incl. **80 de
adapters**: CSV/Excel válido, columna faltante, precio inválido, moneda, SKU
opcional/ambiguo, matching con candidatos+score, fallback manual, preview sin
persistencia, aprobación, rechazo, duplicado, idempotencia, auditoría,
privacidad, reconciliación de puerto) · build Next 16.2.6 · `gm:regression`
**22/22** · `gm:import` **9/9** · `validate-claude-agents` **214/0/0** ·
`git diff --check` limpio.

**Privacidad/seguridad:** persistencia exclusivamente vía `PricingApprovalPort`
(el adaptador no escribe en DB); `price_observations` append-only; preview no
persiste; ambiguos `pending`; sin tocar snapshots emitidos. Campos 🔒
(SKU/URL/`sourceReference`/proveedor/precio público/candidatos/score/aprobador/
motivos) no se exponen a cliente. **Sin scraping** (sin `fetch`/`axios`/
`puppeteer`/`cheerio`), **sin API Homecenter inventada** (solo CSV/Excel local;
"homecenter" únicamente como `providerKey`/ejemplo CLI). Excel ignorado; sin
`.env`/`package-lock`; sin `ag-grid-enterprise`; sin AGPL.

**RLS runtime:** la integración NO modificó `supabase/migrations|policies|seeds`
ni `apps/web/lib/db/schema.ts` ⇒ **RLS runtime 21/21** de Oleada 1.5 vigente.
**B-004** (Realtime) sigue como deuda técnica no bloqueante.

**Recomendación:** ✅ **APROBAR merge `integration/wave-2b` → `main`** (queda a
decisión del usuario; este ciclo NO hace merge).

## Validación integración Oleada 3A (rama `integration/wave-3a`, 2026-05-31)

Integración de la visibilidad funcional: read-model canónico cableado a las
pantallas (cherry-picks `9e69449` db-rls + `8ab0d9c` frontend + `0bab01d`
dashboard). **Sin merge a `main`.**

**Reconciliación:**
- Fuente única `apps/web/lib/contracts/read-model.ts` (conflicto add/add resuelto
  con el canónico de db-rls); **1** `interface ReadModelPort` (verificado).
- Accesores TEMP `dev-read-model.ts` eliminados; las 5 páginas de presupuesto y el
  dashboard consumen `getReadModel()` de `@/server/read-model` con `getDemoViewer()`
  (helper demo; en `db` el viewer vendrá de la sesión y RLS filtra).
- Páginas adaptadas a los DTOs canónicos. Test redundante del frontend eliminado;
  test del dashboard repointado al read-model canónico.

**Resultados (todo PASS):** typecheck 0 · lint 0 · **356 tests** · build Next
16.2.6 (rutas estáticas + dinámicas) · `gm:regression` **22/22** · `gm:import`
**9/9** (±0.01 COP) · `validate-claude-agents` **214/0/0** · `git diff --check`
limpio.

**Dev smoke local (`READ_MODEL_SOURCE=fixture`):** 8/8 rutas **HTTP 200** con
datos reales del golden master:

| Ruta | HTTP | Nota |
|------|------|------|
| `/` | 200 | landing |
| `/login` | 200 | — |
| `/projects` | 200 | proyecto real (alcances/conteos) |
| `/estimates` | 200 | BOQ + AIU/IVA reales ("Entre Patios") |
| `/apu` | 200 | plantillas APU reales |
| `/quantities` | 200 | grupos/líneas reales |
| `/catalog` | 200 | recursos (precio referencia cliente-safe) |
| `/dashboard` | 200 | KPIs reales (Total presupuesto $372.247…) + Recharts |

**Privacidad:** los DTOs cliente-safe no exponen `onlinePublicPrice`/
`negotiatedDiscount`/`sourceReference`/SKU; `DashboardSummary.{projectedSaving,
realizedSaving,pricingCoverage}` son role-gated (omitidos para `client`).
**Cero cálculo financiero en React** (dinero `DecimalString` ya calculado).
Excel ignorado; sin `.env`/`package-lock`; sin `ag-grid-enterprise`; sin AGPL.

**RLS runtime:** la integración NO modificó `supabase/migrations|policies|seeds`
ni `apps/web/lib/db/schema.ts` ⇒ **RLS runtime 21/21** de Oleada 1.5 vigente.
**B-004** (Realtime) deuda técnica no bloqueante.

**Recomendación:** ✅ **APROBAR merge `integration/wave-3a` → `main`** (queda a
decisión del usuario; este ciclo NO hace merge).

## Validación integración Oleada 3B (rama `integration/wave-3b`, 2026-06-01)

Integración formal de la planificación: merge `--no-ff` de
`continuation/wave3b-planning-ui` (db `560b2cc` + ui `41abbe2` combinados) →
merge commit **`595e5a5`**. Sin conflictos. **Sin merge a `main`.**

**Reconciliación:** read-model canónico único (`apps/web/lib/contracts/read-model.ts`);
`/planning` consume `getReadModel().getSchedule(getDemoViewer(), projectId)` real
(0 accesores TEMP); `view-model` consume el `ScheduleSummary` canónico del
read-model; CPM/ruta crítica/holguras **solo en `apps/web/modules/planning/`**
(0 en React); frappe-gantt con import dinámico client-side + CSS vendorizado
(su `exports` v1.2.2 no expone `dist/*.css`); nav `/planning`.

**Resultados (todo PASS):** typecheck 0 · lint 0 · **389 tests** · build Next
16.2.6 (rutas `/planning` + previas) · `gm:regression` **22/22** · `gm:import`
**9/9** · `validate-claude-agents` **214/0/0** · `git diff --check` limpio.

**RLS runtime real (Docker local): 32/32 PASS** — `db reset` aplicó **13
migraciones + 3 seeds** sin errores; **24 tablas con RLS FORCE**; 21 previos + 11
planning (aislamiento org A/B en las 4 tablas, usuario sin org sin acceso,
`progress_entries` append-only UPDATE/DELETE denegados, INSERT autorizado, WITH
CHECK cross-org en tarea/dependencia). Sin remoto.

**Dev smoke (`READ_MODEL_SOURCE=fixture`): 9/9 rutas HTTP 200** — `/`, `/login`,
`/projects`, `/estimates`, `/apu`, `/quantities`, `/catalog`, `/dashboard`,
`/planning`. `/planning` muestra "Cronograma de obra", resumen, tareas, hitos,
dependencias, % avance y **Diagrama de Gantt** con datos reales del fixture
sanitizado; sin 500.

**Privacidad:** ruta crítica/holguras/avance financiero/`external_reference`/
responsables/recursos internos son role-gated (omitidos para `client`). Cero
cálculo monetario/CPM en React. Compatibilidad MS Project reservada (sin export
en 3B). Excel ignorado; sin `.env`/`package-lock`; sin `ag-grid-enterprise`; sin
AGPL. **B-004** (Realtime) deuda técnica no bloqueante.

**Recomendación:** ✅ **APROBAR merge `integration/wave-3b` → `main`** (queda a
decisión del usuario; este ciclo NO hace merge).

---

## Validación de integración — Oleada 4A.2 (auth runtime + UI) — 2026-06-02

> Validación de integración por el orquestador en
> `integration/wave-4a-auth-runtime` (pre-merge). QA integral formal = Oleada 4.

**Merge:** `git merge --no-ff backup/wave4a-auth-ui` → `5c60339`, **sin
conflictos** (11 archivos, +1106). Runtime SSR (`19246a5`) + UI auth integrados.

**Auditoría de implementación (contrato `AUTH_RUNTIME_CONTRACT`):**
- Browser client `createBrowserClient` solo con clave **publishable** (0 secretos).
- Server client `createServerClient` con cookies SSR `getAll()`/`setAll()` (sin
  adaptadores legacy `get/set/remove`).
- Proxy Next 16 (`proxy.ts`): refresh + **`getClaims()`** como guard (NUNCA
  `getSession()`); rutas públicas/protegidas; deny-by-default; `sanitizeNext`
  (anti open-redirect: `//`, `/\`, esquemas, control chars).
- Viewer real: sesión→`profiles` por `auth.uid()`; `organizationId`/rol
  server-side; mapeo único `role-map.ts`; deny sin sesión/membresía/rol; **org
  y rol nunca desde el navegador**.
- `/api/exports`: modo supabase exige viewer; **anti-escalamiento** vía
  `isSameOrLessPrivileged` (perfil ≤ ViewerRole).

**Resultados (todo PASS):** typecheck 0 · lint 0 · **452 tests** (+29 auth-ui) ·
build Next 16.2.6 (Proxy + `(auth)/*` + `/api/exports`) · `gm:regression`
**22/22** · `gm:import` **9/9** · `validate-claude-agents` **214/0/0** ·
`git diff --check` limpio.

**Smoke local (Supabase local Docker, sin remoto):**
- `supabase start` (sin realtime/studio/storage/imgproxy/edge/logflare/vector) +
  `db reset` (**14 migraciones + 4 seeds** limpios) + **RLS runtime 47/47**.
- 1) `/login` 200. 2) `/dashboard` sin sesión → `/login?next=/dashboard`.
  3) credenciales inválidas → "Invalid login credentials" (mapeado a mensaje
  legible, sin stack). 4) login admin → sesión + cookies SSR. 5) `/dashboard`
  auth → 200. 6) `/login` auth → `/dashboard`. 7) `/api/exports` sin sesión →
  bloqueado por Proxy (307 `/login`). 8) escalamiento client→internal **403**,
  client→management **403**, client→client **200**. 9) export autorizado **200**
  (PDF `%PDF`, `Content-Disposition: attachment`, `X-Export-Profile: client`).
  10) logout → cookie `Max-Age=0` + `/login`. 11) forgot → `recover` 200 +
  **Mailpit** "Reset Your Password". 12) `/reset-password` 200, callback sin code
  → `/login?error`. 13) **demo** (`APP_AUTH_MODE=demo`) → `/dashboard` 200 sin
  Supabase, `/api/exports` 200.

**Privacidad/seguridad:** sin `service_role` en frontend; `.env.local` **ignorado**
(no trackeado); contraseñas de prueba **efímeras locales** (no en repo/docs);
Excel privado ignorado; sin `.env`/lock/privados; sin AGPL/enterprise.

**Deudas no bloqueantes:** B-004 (Realtime en Docker/Windows). Nota: `/api/exports`
sin sesión responde **307→/login** (Proxy lo intercepta antes del handler `401`);
deny equivalente — el 401 del handler aplica si se invoca fuera del matcher.

**Recomendación:** ✅ **APROBAR merge acumulado de Oleada 4A
(`integration/wave-4a-auth-runtime`) → `main`** (queda a decisión del usuario;
este ciclo NO hace merge). Sin remoto; Vercel en demo fixture intacto.
