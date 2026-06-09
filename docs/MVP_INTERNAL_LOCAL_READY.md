# MVP Interno — Local-Ready (Construction Ops)

> **ACTUALIZACIÓN 2026-06-09 — RELEASE INTERNO V1 EN PRODUCCIÓN.** Mergeado a `main`
> (**`12d53d5`**, tag **`mvp-internal-release-v1`**). Migraciones `20260609120000` +
> `20260609130000` aplicadas al remoto (remoto **23/23**, `db lint` sin errores;
> `20260606120000` ya estaba aplicada). Deploy **automático por Git** (Vercel GitHub
> App autorizada): Preview Ready (`ats9scfxw`), **Production Ready** (`o1rfipxzc`,
> alias `construction-ops-psi.vercel.app`). Smoke productivo: `/login` 200, rutas
> protegidas 307→/login, sin 500. **Rollback app = `2918622`.** Pendiente no
> bloqueante: smoke autenticado tenant, MV-01, BOQ_REORDER, lineage_id, audit trail,
> hardening. Las secciones siguientes documentan el alcance local-ready original.

Estado: **local-ready → released v1** · 2026-06-09 · Rama candidata
`integration/p1a-functional-resume` (mergeada a `main`).

## 1. Flujo funcional cubierto (end-to-end, validado local)
Crear presupuesto → V01 draft → importar BOQ → editar (cantidad/precio, crear
capítulo/ítem manual, mover ítem) → archive/restore (capítulos e ítems) → emitir
V01 (inmutable) → clonar V01→V02 (draft activa) → editar V02 sin alterar V01 →
comparar V01 vs V02 (read-only) → seguridad cross-org → no-destrucción.

## 2. Funciones listas
- **4E.2A** — edición manual de capítulos/ítems; subtotal forzado por trigger
  DB-level (`boq_items_recompute_subtotal`); recálculo server-side de costo
  directo/AIU/indirectos/total; trazabilidad `source_code`/`source_row`.
- **P1-A** — read-model protegido por RLS tenant-scoped (read-model isolation 12/12).
- **4E.2B** — archive/restore reversible (no DELETE físico); archivados excluidos
  de vista activa, cálculos y exports; capítulo archivado excluye sus ítems sin
  reescribirlos; `includeArchived` controlado.
- **4E.3A** — emisión draft→issued (`issued_at`/`issued_by` server-side),
  inmutabilidad real de issued; clonación atómica issued→nueva draft (remapeo de
  `chapter_id`, source/archivado/AIU preservados, mismo total activo,
  `source_version_id`); `listEstimateVersions`; export por `versionId` (snapshot).
- **4E.3B** — comparación read-only de versiones; matching de ítems por
  `chapterCode + itemCode + occurrenceIndex` (orden `sort_order ASC, id ASC`),
  `duplicateCodeWarning`; capítulos por `code`; deltas financieros (% seguro si
  base≠0). UI mínima de comparación.

## 3. Pruebas ejecutadas (local, todo PASS)
- typecheck 0, lint 0, **757 tests** + **42 integración gated** (`BOQ_SMOKE_DB=1`,
  repo real + RLS): por-feature (4E.2A/2B/3A/3B) + **flujo end-to-end del MVP**
  (`apps/web/tests/integration/mvp-internal-flow-smoke.test.ts`, 10 casos).
- build (fixture + db-local), **RLS harness 106/106**, **read-model isolation 12/12**,
  **gm:regression 22/22**, **gm:import PASS**, validador agents **214/0/0**,
  `git diff --check` limpio.

## 4. Migraciones locales candidatas a reconciliar en pre-release
- `20260606120000_boq_items_subtotal_invariant.sql` (4E.2A)
- `20260609120000_boq_archive_metadata.sql` (4E.2B)
- `20260609130000_estimate_version_issue_clone.sql` (4E.3A)

## 5. Nota de release (migraciones)
- Antes del release ejecutar **`supabase db push --dry-run --linked`** (read-only) y
  **reconciliar** qué migraciones faltan realmente en el remoto. **No asumir** que
  alguna sigue pendiente sin verificar. Aplicar **solo** las faltantes confirmadas.

## 6. Pendientes NO bloqueantes
- Preview runtime real + **MV-01** (diferidos a pre-release).
- `BOQ_REORDER` (no iniciado) — requiere antes evaluar **`lineage_id`** (identidad
  de linaje estable de ítems clonados) para un matching robusto en reorder.
- `BOQ_AUDIT_TRAIL` (historial completo de cambios).
- Hardening posterior (P1-A runtime preview, CSP/headers/CI-CD, etc.).

## 7. Producción
Intacta. Vercel sin tocar; sin `db push` remoto; sin datos remotos.

## 8. main
`main = origin/main = 2918622` (intacta).

## 9. Rama candidata
`integration/p1a-functional-resume` — base funcional segura para el pre-release
controlado (merge a `main` + reconciliación de migraciones + deploy a tu orden).
