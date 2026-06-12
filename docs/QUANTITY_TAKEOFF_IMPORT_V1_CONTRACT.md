# QUANTITY_TAKEOFF_IMPORT_V1 — Contrato congelado

**Fase:** 4B.3
**Rama:** `feature/quantity-takeoff-import-v1` (base `origin/main = daa4dd9`)
**Estado:** CONGELADO — cualquier cambio requiere decisión del orquestador.
**Propiedad:** agent-orchestrator (autorado directo en esta oleada).
**Patrón base:** `ENTRE_PATIOS_APU_IMPORT_V1` (digest + dos pasos + RPC atómica
RLS-bound + batch inmutable).

Objetivo: importar de forma **supervisada** las memorias de cantidades
(despieces geométricos) de la hoja `CANTIDADES 1 PISO` del workbook real
Entre Patios, preservando provenance completa, recalculando server-side con
Decimal, y vinculando grupos con actividades BOQ **solo cuando la coincidencia
es exacta y no ambigua**. El total importado queda como **memoria trazable
para revisión**: este importador **JAMÁS** muta `boq_items.quantity_snapshot`
ni ningún otro campo de BOQ/APU/AIU/precios/exports.

---

## §1. Fuente admitida

- Workbook local privado: `private/COT.ENTRE PATIOS 1 PISO (1).xlsx`
  (NUNCA versionado; `private/` está en `.gitignore`).
- **Hoja admitida: exactamente una** — `CANTIDADES 1 PISO` (comparación
  normalizada: trim + mayúsculas + colapso de espacios). Si no existe ⇒ error
  crítico `sheet_not_found`. Las hojas `CANTIDADES` y `CANT COMPLETO` quedan
  **fuera de alcance** de V1.
- Extensiones: `.xlsx`/`.xls`; tamaño ≤ límite vigente del importador
  (`APU_IMPORT_LIMITS.maxFileBytes`). Archivo vacío ⇒ error crítico.
- Lectura con SheetJS sobre **valores cacheados**: no se evalúan fórmulas, no
  se ejecutan macros, no se interpreta el texto de fórmula como código. El
  texto de fórmula es **metadato estructural** (clasificación + provenance).
- El subtotal/total enviado por el navegador **nunca** es fuente de verdad:
  preview y confirmación re-parsean y recalculan server-side.

## §2. Gramática congelada de la hoja

Rango efectivo observado: `A1:I692` (las columnas J–Q están vacías; se ignoran
fuera de A–I). Cota dura de lectura: 5000 filas.

| Fila | Reconocimiento |
|---|---|
| Preámbulo | Todas las filas antes del encabezado. Se ignoran (no son datos). |
| Encabezado | Primera fila con `C≈DESCRIPCIÓN` y `D≈UN` (normalizados). Obligatoria; si no aparece ⇒ error crítico `header_not_found`. |
| Capítulo | `B` = entero (sin parte decimal) + `C` con texto + sin dimensiones `E..H`. Los números de capítulo **pueden repetirse** (la hoja real repite 7, 8, 9, 10); se preserva el orden de aparición. |
| Inicio de grupo | Fila no-capítulo con `C` (descripción) y (`B` con patrón de ítem `n.nn` y/o `A` con código visible). Puede traer la primera línea de medición en la misma fila (`E..I`). |
| Línea de medición | Fila con `I` presente (fórmula o literal) que no es total, dentro de un grupo abierto. `D` opcional = etiqueta de elemento (`Z1`, `VC-1`, `A-101`, `1ER PISO`, `(-) MENOS`…) ⇒ se preserva como descripción de la línea. |
| Total de grupo | `I` con fórmula `SUM(rango)` opcionalmente seguida de términos restados (`=SUM(a:b)-Ix-Iy`). Puede vivir en una fila propia **o incrustada en la fila del siguiente capítulo** (caso real fila 187): en ese caso el total se atribuye al grupo anterior y la fila también abre capítulo. Puede **faltar** (grupo MAM-02): total = Σ líneas con advertencia `missing_group_total`. |
| Grupo sin líneas | Grupo con descripción/unidad pero sin ninguna línea de medición (capítulos 11, 12, instalaciones, varios, carpintería). **No se importa**: se reporta como `skipped_no_lines` (advertencia, no error). |

### §2.1 Unidad del grupo

`D` en la fila de inicio del grupo es **unidad solo si** su forma normalizada
pertenece a la lista blanca congelada:

```
m², m2, m³, m3, m, ml, kg, un, und, jn, día, dia, mes, viaje, vje, glb, gl, z1…
```

(formalmente: alias reconocidos por `canonicalizeUnit` extendida §2.2 más el
conjunto literal `{m², m2, m³, m3, m, ml, kg, un, und, jn, dia, día, mes,
viaje, vje, glb, gl}`). Si `D` no está en la lista (p. ej. `Z1`, `VC-1`,
`Antejardin`) ⇒ es **etiqueta de elemento de la primera línea**, la unidad del
grupo queda `null` y se emite advertencia `unit_unknown`.

### §2.2 Unidades canonical

Se reutiliza `canonicalizeUnit` (`apps/web/server/pricing/units.ts`,
UNIT_ALIAS_NORMALIZATION_V1) con extensión **aditiva** mínima:

- `m3` → `m³` (y `metro cubico/s`)
- `un` → `und`
- `jn` → `día` (jornada)

El valor raw SIEMPRE se preserva (`metadata.rawUnit` del grupo). La canónica
es solo para comparación/matching. Unidades fuera de tabla: normalización
léxica sin inventar equivalencias (regla vigente V1).

## §3. Fórmulas geométricas reconocidas

La clasificación se hace **parseando el texto** de la fórmula de `I` (jamás
evaluándolo). Una fórmula es reconocida si es un **producto de referencias a
celdas de la PROPIA fila** dentro de `{E,F,G,H}` (con paréntesis y orden
libres, p. ej. `=(E14*G14)*H14`, `=H134*E134`), o la variante aditiva
`=(E+F+G)*H` (suma de dimensiones × cantidad).

`formula_type` congelado (CHECK en DB):

| formula_type | Factores | Ejemplo real |
|---|---|---|
| `direct` | valor literal en `I` sin fórmula | — |
| `count_only` | `H` | `=H232` (propia fila) |
| `length_only` | `E` | — |
| `width_only` | `F` | — |
| `height_only` | `G` | `=G488` |
| `length_count` | `E×H` | `=E47*H47` |
| `width_count` | `F×H` | — |
| `height_count` | `G×H` | `=H193*G193` |
| `length_width` | `E×F` | `=E334*F334` |
| `length_height` | `E×G` | — |
| `width_height` | `F×G` | — |
| `length_width_count` | `E×F×H` | `=(E44*F44)*H44` |
| `length_height_count` | `E×G×H` | `=(E14*G14)*H14` |
| `width_height_count` | `F×G×H` | — |
| `length_width_height` | `E×F×G` | `=(E70*F70*G70)` |
| `length_width_height_count` | `E×F×G×H` | `=(E56*F56*G56)*H56` |
| `dims_sum_count` | `(E+F+G)×H` | `=(E501+F501+G501)*H501` |
| `custom` | cualquier otra (refs a otras filas/hojas, SUM internos, etc.) | `=SUM(H193:H231)` en H |

Reglas:

1. **Recalculo server-side con Decimal** (`decimal.js`): subtotal = producto
   (o suma×cantidad) de los factores que la fórmula referencia, usando los
   **valores cacheados** de las celdas de dimensión. Los factores presentes en
   la hoja pero NO referenciados por la fórmula **no** se usan (caso real:
   fila 59 tiene `F=0.45` pero la fórmula es `=(E59*H59)`).
2. `direct`: subtotal = valor literal de `I`.
3. `custom`: no recalculable ⇒ subtotal = **valor cacheado** de `I` como
   evidencia, con advertencia `custom_formula` (se preserva el texto en
   `raw_values`). Nunca error crítico si hay valor cacheado numérico.
4. Dimensiones con fórmula propia (`G:=2.88+1.15`, `E:=I41`,
   `H:=SUM(H193:H231)`): se usa el **valor cacheado** y se preserva el texto.
   Si la fórmula referencia **otras celdas** (patrón `[A-Z]+[0-9]+`) ⇒
   advertencia `derived_dimension`.
5. Comparación contra el valor Excel cacheado de `I`: |recalc − excel| >
   1e-6 ⇒ se reporta diferencia (advertencia `excel_mismatch` con ambos
   valores). **El valor server-side manda** en `subtotal_calculated`; el de
   Excel queda en `raw_values` como evidencia.
6. `I` sin fórmula y sin valor numérico, o fórmula irreconocible sin valor
   cacheado numérico ⇒ la línea se omite con advertencia `line_unparseable`
   (no aborta el grupo).

## §4. Deducciones y total de grupo

- Una línea es **deducción** si su fila aparece como término **restado** en la
  fórmula del total del grupo (`=SUM(I173:I177)-I178-I179-I180`) **o** si su
  etiqueta `D` normalizada contiene `menos`. Se marca `raw_values.deduction =
  true`.
- Total de grupo recalculado = Σ subtotales(no deducidas) − Σ
  subtotales(deducidas), con Decimal.
- Comparación contra el total cacheado del Excel (cuando existe):
  diferencia > 1e-6 ⇒ advertencia `group_total_mismatch` (evidencia, no
  bloqueo). `total_calculated` persiste SIEMPRE el valor server-side.

## §5. Occurrence index

- Clave de ocurrencia del grupo: `itemCode normalizado + '|' + descripción
  normalizada` (la normalización de descripción reutiliza
  `normalizeDescription` del módulo APU). Contador 1-based en orden de hoja.
- Se persiste en `quantity_takeoff_groups.occurrence_index` y participa en el
  matching BOQ (§6) y en la idempotencia semántica del reporte.

## §6. Matching BOQ (solo exactos y no ambiguos)

- La **versión de presupuesto es explícita y opcional** (selector de versiones
  EDITABLES `draft|review`, mismo repositorio del importador APU). Sin
  versión ⇒ todos los grupos quedan `not_evaluated` (importación como memoria
  sin vínculo).
- Candidatos: `boq_items` de la versión objetivo, no archivados.
- **Vínculo exacto (estado `linked`)** requiere TODAS:
  1. `código de ítem` del grupo (columna B, p. ej. `1.01`) == `boq_items.code`
     normalizado;
  2. descripción normalizada del grupo == descripción normalizada del ítem;
  3. unidad canonical equivalente (`unitsEquivalent`); si la unidad del grupo
     es `null` (§2.1) la condición de unidad **no se cumple** ⇒ máximo
     `suggested`;
  4. pareo por **occurrence index**: cuando código+descripción+unidad se
     repiten, el n-ésimo grupo se aparea con el n-ésimo ítem BOQ en orden
     estable (`sort_order, id`); si los conteos no permiten pareo unívoco ⇒
     `ambiguous`;
  5. el ítem BOQ **no** tiene ya un takeoff group vinculado
     (`quantity_takeoff_groups.boq_item_id`), ni de este batch ni de otro ⇒ si
     lo tiene, `skipped_existing` (**jamás** se reemplaza un vínculo
     existente, ni silenciosamente ni de otro modo).
- `suggested`: coincide la descripción normalizada (y opcionalmente el
  código), pero falla unidad o código. **Solo informativo en V1**: la
  confirmación NO vincula sugerencias.
- `ambiguous`: ≥2 candidatos que satisfacen las condiciones de exactitud sin
  pareo unívoco. No se vincula.
- `unresolved`: sin candidato.
- El vínculo se materializa como `quantity_takeoff_groups.boq_item_id` (FK
  `ON DELETE SET NULL`). **No se escribe NADA en `boq_items`** (a diferencia
  del importador APU): el BOQ permanece intacto byte a byte.

## §7. Esquema aditivo (migraciones SOLO locales)

`20260616090000_quantity_takeoff_import.sql` +
`20260616090100_rls_quantity_takeoff_import.sql`. Todo aditivo: sin DROP, sin
DELETE, sin backfill, sin cambio de tipos, sin tocar tablas legacy
(`quantity_groups`/`quantity_lines` quedan intactas). **Sin `db push` remoto
en esta oleada.**

### A. `quantity_import_batches`

`id`, `organization_id` FK, `digest_sha256` (`^[0-9a-f]{64}$`),
`source_filename`, `source_sheet`, `imported_by` FK profiles,
`imported_at`, `status` (`completed`), `total_groups`, `total_lines`,
`linked_boq_items`, `unresolved_count`, `warning_count`, `metadata jsonb`.
`UNIQUE (organization_id, digest_sha256)` ⇒ **idempotencia estructural**.
Inmutable: sin UPDATE/DELETE por RLS.

### B. `quantity_takeoff_groups`

`id`, `organization_id` FK, `estimate_version_id` FK nullable,
`boq_item_id` FK nullable (`ON DELETE SET NULL`), `import_batch_id` FK
nullable, `visible_code` nullable (columna A), `item_code` nullable (columna
B), `description` NOT NULL, `unit` nullable (canonical), `source_row` int,
`occurrence_index` int ≥1, `total_calculated numeric(20,10)`, `metadata jsonb`
(rawUnit, capítulo, totalExcel, fórmula del total, linkStatus, advertencias).

### C. `quantity_takeoff_lines`

`id`, `organization_id` FK, `group_id` FK (`ON DELETE CASCADE`),
`description` nullable (etiqueta D), `formula_type` (CHECK §3),
`length/width/height/count numeric(20,10)` nullable (valores cacheados
presentes en la hoja, usados o no por la fórmula), `raw_values jsonb`
(valores y textos de fórmula originales de `D..I`, flag `deduction`,
valor Excel de `I`), `source_row` int, `subtotal_calculated numeric(20,10)`.

### D. RPC atómica `import_quantity_takeoff_batch(p_batch, p_groups, p_version_id)`

`SECURITY INVOKER` (RLS aplica a cada escritura), `search_path = public`.
Orden interno (patrón `import_apu_batch`): valida sesión/membresía/digest ⇒
idempotencia (org, digest) ⇒ valida versión visible y EDITABLE si se envía ⇒
inserta groups+lines ⇒ re-verifica cada vínculo BOQ bajo transacción (ítem de
la versión, no archivado, sin takeoff previo — `NOT EXISTS` sobre
`quantity_takeoff_groups.boq_item_id`) ⇒ inserta el batch AL FINAL con conteos
definitivos ⇒ estampa `import_batch_id` en los groups creados. Cualquier error
revierte TODO. Carrera de digest (23505) ⇒ revierte el perdedor completo.
`REVOKE PUBLIC/anon; GRANT authenticated`.

### E. Triggers same-org (las FK ignoran RLS)

- `quantity_takeoff_groups.import_batch_id` → batch de la misma org.
- `quantity_takeoff_groups.boq_item_id` → ítem cuya cadena
  versión→estimate→scope→project pertenece a la misma org.
- `quantity_takeoff_groups.estimate_version_id` → misma org (misma cadena).
- `quantity_takeoff_lines.organization_id` == org de su `group_id`.

Sin `SECURITY DEFINER`; schema-qualified; `search_path` fijo.

## §8. RLS (ENABLE + FORCE en las 3 tablas)

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `quantity_import_batches` | org propia | roles DB `admin/gerencia` + `imported_by = identidad real` | — (inmutable) | — |
| `quantity_takeoff_groups` | org propia | `admin/gerencia`, org propia | `admin/gerencia`, org propia (estampar batch; revisión futura del vínculo) | — |
| `quantity_takeoff_lines` | org propia | `admin/gerencia`, org propia | — (memoria inmutable) | — |

Cross-org bloqueado por políticas + triggers §7.E. El harness RLS runtime
(`scripts/rls-runtime/run.ts`) añade sección dedicada con pruebas de
aislamiento de 2 orgs y de inmutabilidad.

## §9. Servicio y seguridad (dos pasos, sin persistir archivo)

- `previewQuantityImport(viewer, file, linkVersionId)` — parsea + matchea,
  NO escribe; devuelve preview + digest SHA-256 de la hoja.
- `confirmQuantityImport(viewer, file, expectedDigest, options)` — re-parsea,
  compara digest (mismatch ⇒ error `digest_mismatch`), re-matchea
  server-side y ejecuta UNA transacción (RPC). El cliente solo envía
  **intención** (versión objetivo); nada del cliente se persiste sin
  re-validación.
- Roles de aplicación: `management | internal` (paridad importador APU).
  DB: `admin/gerencia` vía RLS.
- Solo `READ_MODEL_SOURCE=db` + `APP_AUTH_MODE=supabase` (gate
  `isCreationModeEnabled`); organización y actor SIEMPRE server-side.
- Errores sanitizados hacia el cliente (catálogo de errores §10).
- Reporte CSV final **sanitizado** con `buildSanitizedCsv` (anti
  formula-injection: prefijos `= + - @ \t` neutralizados).

## §10. Errores críticos vs advertencias

**Críticos (bloquean preview/confirmación):** `file_invalid`,
`file_too_large`, `workbook_unreadable`, `sheet_not_found`,
`header_not_found`, `no_groups_found`, `digest_mismatch`, `version_invalid`
(no visible o no editable), `not_supported` (modo), `insufficient_role`.

**Advertencias (no bloquean; se muestran y persisten en metadata):**
`unit_unknown`, `custom_formula`, `derived_dimension`, `excel_mismatch`,
`group_total_mismatch`, `missing_group_total`, `line_unparseable`,
`skipped_no_lines`, `zero_quantity` (H=0 ⇒ subtotal 0; frecuente y legítimo
en la hoja real: pisos 2/3 desactivados), `duplicate_code`.

## §11. Idempotencia y provenance

- Digest SHA-256 estable del contenido celda a celda de la hoja (fila,
  columna, valor, texto de fórmula) — mismo algoritmo del importador APU.
- `UNIQUE (organization_id, digest_sha256)` + verificación temprana en la RPC
  ⇒ re-importar el mismo workbook es **no-op informativo** (`duplicate: true`
  con los conteos del batch original).
- Provenance por grupo y por línea: `source_row`, `occurrence_index`,
  `raw_values` (valores y fórmulas originales), `import_batch_id`, archivo,
  hoja, actor, timestamp.

## §12. UI — `/quantities/import`

- CTA visible en `/quantities` («Importar memorias»), gated igual que el
  resto de flujos de creación.
- Wizard (patrón `apu-import-wizard`): 1) workbook + versión opcional ⇒
  2) resumen (grupos/líneas/vínculos/advertencias) ⇒ 3) grupos detectados con
  líneas desplegables, fórmula reconocida, subtotales recalculados y
  diferencias vs Excel ⇒ 4) vinculaciones BOQ por estado (`linked`,
  `suggested`, `unresolved`, `ambiguous`, `skipped_existing`) ⇒
  5) confirmación ⇒ 6) reporte final + CSV sanitizado.
- Sin editor de cantidades (fuera de alcance V1). Sin cálculo financiero en
  React: todos los números llegan calculados del servidor.

## §13. Qué NO hace este importador (congelado)

- NO modifica `boq_items` (ni `quantity_snapshot`, ni `quantity_group_id`,
  ni ningún campo): el vínculo vive solo en `quantity_takeoff_groups`.
- NO toca APU (`apu_templates/components/snapshots`), AIU
  (`indirect_cost_rules`), precios (`resource_price_observations`,
  aprobaciones), exports históricos, versiones emitidas/aprobadas/archivadas.
- NO escribe en `quantity_groups`/`quantity_lines` legacy.
- NO ejecuta macros ni evalúa fórmulas; NO persiste el archivo.
- NO reconcilia recursos APU; NO implementa SMTP/usuarios/chat.
- NO hace `db push` remoto, deploy, ni merge a `main` en esta oleada.

## §14. Fuera de alcance V1 (deudas explícitas)

- Hojas `CANTIDADES` (general) y `CANT COMPLETO`.
- Aceptación manual de sugerencias BOQ (flujo accept del APU import).
- Editor/CRUD de memorias importadas y aplicación del total a
  `boq_items.quantity_snapshot` (requerirá flujo de revisión dedicado).
- Sincronización takeoff ⇄ `quantity_groups` legacy.
- Importación multi-hoja o multi-piso.
