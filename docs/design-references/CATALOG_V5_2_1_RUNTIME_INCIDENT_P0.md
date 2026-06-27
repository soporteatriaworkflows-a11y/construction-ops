# P0 — /catalog roto tras V5.2.1 (runtime) · Incidente + hotfix

## Síntoma
`/catalog` no renderiza (preview y producción) tras V5.2.1. El smoke previo (HTTP 307) NO validó el render
autenticado: 307 es solo el redirect de auth, no confirma que la página cargue con sesión.

## Causa raíz (técnica)
`app/(dashboard)/catalog/page.tsx` es **Server Component**. V5.2.1 movió/usó el helper `isOldPrice` (y
`priceAgeDays`/`PRICE_OLD_THRESHOLD_DAYS`) definido en `catalog-explorer.tsx`, que está marcado **`'use client'`**.
En Next/React, una función exportada por un módulo `'use client'` e importada en un **Server Component** se
convierte en una **referencia de cliente** (proxy), no en la función real. Al invocarla server-side
(`resources.filter((r) => isOldPrice(r.priceDate))`) **lanza en runtime** y rompe el render de la página.

Por qué no lo detectó el CI: `build` y `typecheck` son estáticos (el import es válido); los `tests` importan el
helper en Node sin cruzar el límite server/client; el `smoke` 307 no rendiza autenticado.

## Fix (hotfix V5.2.1.1, sin backend)
- Nuevo módulo **PURO server-safe** `lib/catalog/price-age.ts` con `PRICE_OLD_THRESHOLD_DAYS`, `priceAgeDays`,
  `isOldPrice` (tolerantes a null/undefined/fecha inválida).
- `catalog/page.tsx` (server): importa `isOldPrice` desde `@/lib/catalog/price-age` (ya NO desde el módulo client).
- `catalog-explorer.tsx` (client): importa esos helpers desde el módulo puro y los re-exporta (compat).
- Test: importa los helpers desde el módulo puro; `filterResources`/`CatalogFilters` siguen desde el explorer.

## Defensas de datos (ya presentes / confirmadas)
`priceAgeDays` guarda null + `Number.isFinite`; el explorer usa `r.priceStatus ?? 'none'`, `r.supplierName ?? ''`,
precio con fallback "Sin precio aprobado", empty state si no hay recursos. El catálogo tolera null/undefined.

## Validación
- typecheck 0 · lint 0 · tests catalog 13/0 · suite **2146/0 (+42 skip)** · build 0 (ruta `/catalog` compila) · gm 22/22.
- ⚠️ **No se pudo validar el render AUTENTICADO localmente** (sin navegador/sesión en este entorno). Se requiere
  **validación manual del preview** de `/catalog` (con sesión) antes de mergear. El smoke HTTP solo confirma 307.

## No-alcance
Sin Supabase/RLS/policies/migrations/Auth/envs/Vercel/cálculos/exports/datos reales/RPC/read-model/`unit_price_snapshot`/
sync/aprobación/scraper/V5.2.2/`construction-ops-1rqh`. Solo se reubicó un helper UI puro.

## Recomendación
**Merge del hotfix** tras confirmación manual del render autenticado de `/catalog` en el preview. Si por algún
motivo el render siguiera fallando, **rollback de V5.2.1** (revert del merge `e3f51a7`) para restaurar producción.
