# QA Report — Construction Ops

Este documento es propiedad de **agent-qa**. Se actualiza al final de
cada ciclo de validación.

> Validación de **integración de Oleada 1** realizada por el orquestador en
> `integration/wave-1` (pre-merge). La validación QA integral formal es de
> Oleada 4 (`agent-qa`).

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
| RLS multitenant | 🟡 PARCIAL | **Validación estática PASS** (70 tests parsean policies/migraciones: RLS por organización, inmutabilidad, append-only). **Runtime PENDIENTE**: requiere Supabase local/Docker para ejecutar SQL contra Postgres |
| Inmutabilidad de snapshots | ✅ PASS (estático) | Policies bloquean UPDATE/DELETE en `apu_calculation_snapshots` y versiones `approved/issued/archived` (verificado en SQL) |
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

- **RLS runtime**: validado solo estáticamente (texto SQL). Ejecutar contra
  Supabase/Postgres local en un entorno con Docker antes de producción.
- Coordenadas celda-a-celda de hojas auxiliares (APU/CANTIDADES) quedan como
  referencia tentativa; no afectan la regresión de los 9 totales.

---

## Histórico

| Fecha | Auditor | Resultado | Bloqueos |
|-------|---------|-----------|----------|
| 2026-05-29 | preparación inicial | estructura lista | PROJECT_MASTER vacío (B-001) |
| 2026-05-30 | orquestador (integración Oleada 1) | PASS pre-merge | RLS runtime pendiente (no bloqueante) |
| 2026-05-30 | orquestador (merge a main `58f4366`) | ✅ PASS post-merge | RLS runtime pendiente; Q8/Q9 abiertas |

## Validación post-merge (main, 2026-05-30)

Merge `--no-ff` `integration/wave-1` → `main` (commit `58f4366`). Resultados:
typecheck 0 · lint 0 · **test 108 PASS** · build Next 16.2.6 OK · `gm:regression`
**22/22** (9/9 golden master ±0.01 COP) · `gm:import` todas PASS ·
`validate-claude-agents` **214/0/0** · `git diff --check` limpio. Privacidad:
Excel ignorado y no versionado, 0 nombres de cliente en tracked, fixture
sanitizado sin ítem de balanceo. Sin `ag-grid-enterprise`, sin AGPL, sin `.env`
trackeado, sin `package-lock.json`. **Salvedad**: RLS solo estático (runtime
pendiente contra Supabase/Postgres local).
