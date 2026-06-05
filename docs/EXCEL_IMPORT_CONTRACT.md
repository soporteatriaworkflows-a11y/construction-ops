# EXCEL_IMPORT_CONTRACT — Importación controlada de Excel a V01 (Oleada 4C.1)

Estado: **CONGELADO v1** (2026-06-05). Propiedad: `agent-orchestrator`.
Implementan: `agent-excel-mapper` (parser), `agent-db-rls` (RPC/repo),
`agent-frontend-boq` (UI/action).

Mantiene la disciplina de 4B: deny-by-default, RLS, aislamiento por organización,
IDs/owner server-side, sin fallback silencioso db→fixture, errores sanitizados.

## §1 — Formato Excel V1 (congelado)

- Archivo **`.xlsx`** únicamente. Hoja requerida: **`COTIZACION 1 PISO`** (match por
  nombre normalizado; si falta, se listan las hojas detectadas en el error).
- Columnas mapeadas por **encabezado** (no por posición): obligatorias `code`,
  `description`, `unit`, `quantity`, `unit_price`; opcional `subtotal`. Sinónimos en
  español aceptados (código/descripción/unidad/cantidad/v.unitario/v.total). Si faltan
  los encabezados obligatorios ⇒ se bloquea (sin fallback por posición).
- **Convención de filas** (v1): CHAPTER = `code`+`description` con `unit`/`quantity`/
  `unit_price` vacíos; ITEM = `code`+`description`+`unit` con `quantity`/`unit_price`
  numéricos (pertenece al último capítulo); fila vacía = ignorada.
- SheetJS lee valores cacheados; **no evalúa fórmulas ni ejecuta macros**.
- **No se usa el Excel privado real en desarrollo**: los tests construyen workbooks
  sintéticos sanitizados en memoria.

## §2 — Preview → Confirmación (dos pasos, sin persistir el archivo)

- **Paso A (preview)**: el `.xlsx` viaja por una Server Action; se valida extensión y
  tamaño, se parsea server-side, se normaliza, se calcula resumen y un **digest
  SHA-256** del payload normalizado. NO escribe en DB, NO almacena el archivo, NO
  registra contenido en logs. El preview es client-safe (sin fórmulas ni secretos).
- **Paso B (confirmación)**: el cliente reenvía el MISMO `File` (en memoria) + el
  `digest`. El servidor re-parsea, recalcula el digest y lo **compara**; si difiere,
  bloquea y pide nueva vista previa. No se confía en capítulos/ítems/conteos/totales
  del navegador: se importan SOLO datos recalculados server-side.
- Sin token de servidor persistido, sin Storage, sin disco. Doble submit bloqueado en UI
  (`isPending`).

## §3 — Subtotales y total

Fuente de verdad: **`subtotal = quantity × unit_price`** (Decimal / NUMERIC(20,10), sin
float), recalculado server-side (parser **y** RPC). La columna `subtotal` del Excel NO
se persiste; solo se compara y, si difiere > tolerancia (**0.01 COP**), genera
advertencia. `directTotal` = Σ subtotales recalculados; nunca se confía del navegador
ni del Excel.

## §4 — Límites (documentados)

| Límite | Valor | Razón |
|---|---|---|
| Tamaño archivo | **3 MB** | bodySizeLimit del action = **4 MB** (archivo + overhead), bajo el techo ~4.5 MB de funciones de Vercel |
| Capítulos | 500 | tope razonable de un BOQ |
| Ítems | 5000 | tope razonable de un BOQ |
| Longitud código | 60 | columna `code` |
| Longitud descripción | 500 | snapshot |
| Longitud unidad | 32 | snapshot |
| Negativos | bloqueados | `quantity`/`unit_price` ≥ 0 |

`bodySizeLimit` se configura en `apps/web/next.config.mjs`
(`experimental.serverActions.bodySizeLimit = '4mb'`).

## §5 — Política de sobrescritura

Importar SOLO si la versión activa (V01) está **vacía** (0 capítulos, 0 ítems) y es
**draft**. Si ya tiene contenido: bloquear con mensaje honesto *"Esta versión ya
contiene información. La reimportación estará disponible en una fase posterior."*. Nunca
borra/reemplaza. El guard de versión vacía se re-verifica **dentro de la transacción**
con `SELECT … FOR UPDATE` (anti carrera de doble confirmación); el índice único
`chapters_version_code_uq` es defensa adicional.

## §6 — Migración / RPC (`20260604140000_boq_import_atomic`)

`public.import_boq_into_version(p_version_id uuid, p_chapters jsonb, p_items jsonb)
RETURNS jsonb` — `LANGUAGE plpgsql`, **`SECURITY INVOKER`**, `SET search_path = public`.
RLS aplica a cada INSERT (sin service-role). Identidad por `app._auth_uid()`/
`app.current_org()` (deny sin sesión/membresía). Bloquea la versión `FOR UPDATE`;
valida editable (no emitida) y vacía; inserta capítulos (code→id) e ítems con subtotal
recalculado; atómica (rollback total). Devuelve SOLO `{chapterCount, itemCount,
directTotal}`. Grants: `REVOKE … FROM PUBLIC`/`FROM anon`, `GRANT EXECUTE … TO
authenticated`. NO crea tablas nuevas ni modifica RLS.

## §7 — Capa de servicio (`apps/web/server/estimates/import/`)

- `previewEstimateExcelImport(viewer, estimateId, file)` → valida + parsea + preview (sin
  escritura).
- `confirmEstimateExcelImport(viewer, estimateId, file, digest)` → re-parse + compara
  digest + RPC atómica. Solo en `db`; en `fixture` ⇒ `ImportNotSupportedError`.
- `getEstimateImportStatus(viewer, estimateId)` → estado de la versión activa
  (vacía/importada/importable).
- Parser puro `parse.ts` (agent-excel-mapper). Tipos client-safe en `@/lib/import/types`.

## §8 — UI

`/projects/[id]/scopes/[scopeId]/estimates/[estimateId]` muestra, en la versión activa,
**Total directo** y la sección **Importar Excel** (estado vacío con CTA, o "Importación
completada" con conteos + reimportación bloqueada). Ruta
`…/estimates/[estimateId]/import` con flujo cliente (upload → analizar → preview con
advertencias/errores y resumen por capítulo → confirmar → redirect al detalle con banner
de éxito). Rutas dinámicas (`force-dynamic` + `resolveViewer`).

## §9 — Fuera de alcance / siguiente

4C.2/4D: edición de ítems, reimportación, comparación de versiones, APU editable,
exports, formatos arbitrarios. NO iniciar en 4C.1.
