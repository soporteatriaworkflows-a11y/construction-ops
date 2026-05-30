# Decisiones del proyecto

| Fecha | Decisión | Razón | Estado |
|---|---|---|---|
| 2026-05-29 | ORM: Drizzle ORM | Mejor DX con TypeScript, migraciones SQL directas, sin magia | ✅ Aprobado |
| 2026-05-29 | Stack: Next.js 16 + Supabase + Drizzle | Monolito modular, un solo lenguaje, menor complejidad inicial | ✅ Aprobado |
| 2026-05-29 | Licencia: construcción clean-room | No copiar código AGPL. OpenConstructionERP solo como referencia funcional | ✅ Aprobado |
| 2026-05-29 | Grid: AG Grid Community | Sin costo Enterprise, suficiente para grillas de presupuesto | ✅ Aprobado |
| 2026-05-29 | Gantt: Frappe Gantt (MIT) | Zero dependencias, embebible en React, licencia libre | ✅ Aprobado |
| 2026-05-29 | Gestor de paquetes: **pnpm** (workspace) | Lockfile único `pnpm-lock.yaml`; no mezclar npm/yarn; no generar `package-lock.json` | ✅ Aprobado |
| 2026-05-29 | pnpm fijado vía Corepack → `packageManager: pnpm@11.5.0` | Reproducibilidad; `latest-11` resolvió a 11.5.0 | ✅ Aprobado |
| 2026-05-29 | Runtime: Node.js 24 (v24.13.0 detectado) | Objetivo Node 24 LTS; no se cambió globalmente la versión | ✅ Aprobado |
| 2026-05-29 | Test runner: Vitest | Rápido, ESM-first, integra con el stack TS | ✅ Aprobado |
| 2026-05-29 | `drizzle-kit` diferido (no instalado en Paso 0) | No necesario para typecheck/lint/test/build; lo solicitará agent-db-rls vía INTEGRATION_REQUESTS | ✅ Aprobado |
| 2026-05-29 | Aprobación de builds pnpm 11 vía `allowBuilds` (mapa `pkg: bool`) | Clave vigente en pnpm 11.5.0 (verificado en su dist, 91 ocurrencias). Se eliminó `onlyBuiltDependencies` (legacy). Builds aprobados: esbuild, sharp, unrs-resolver | ✅ Aprobado |
| 2026-05-29 | Upgrade a **Next.js 16.2.6 + React 19.2.6** | Migrar antes de tener funcionalidad real; usar estable no-canary (canary 16.3.0 descartado) | ✅ Aprobado |
| 2026-05-29 | Convención de red: **`proxy.ts`** (no `middleware.ts`) | Next 16 deprecó/renombró `middleware` → `proxy`. `middleware.ts` eliminado | ✅ Aprobado |
| 2026-05-29 | Lint: **ESLint 9 flat config** (`eslint.config.mjs`), `eslint .` | Next 16 eliminó `next lint`; se consume el flat config de `eslint-config-next` 16. `.eslintrc.json` eliminado | ✅ Aprobado |
| 2026-05-29 | TypeScript fijado en `^5.9.3` y ESLint en `^9.39.4` | Estables maduros; se descartan TS 6.0.3 y ESLint 10.4.1 por recién liberados | ✅ Aprobado |
| 2026-05-29 | `AGENTS.md` + `@AGENTS.md` en CLAUDE.md | Obligar a consultar la doc versionada de Next en `node_modules/next/dist/docs/` | ✅ Aprobado |
| 2026-05-29 | **Contrato de entidades congelado v1** (DATABASE_SCHEMA + API_CONTRACTS) | Fuente única de verdad para paralelizar Oleada 1 sin divergencias. 20 entidades congeladas + 7 provisionales v0 | ✅ Aprobado |
| 2026-05-29 | DB `snake_case` ↔ TS `camelCase`; tipos `PascalCase` | Convención uniforme entre capas | ✅ Aprobado |
| 2026-05-29 | Dinero como **`string` decimal** en API; `NUMERIC(20,10)` en DB; Decimal.js para operar | Preservar precisión COP; el frontend NO calcula totales financieros | ✅ Aprobado |
| 2026-05-29 | Snapshots y versiones emitidas inmutables (RLS bloquea UPDATE/DELETE) | No recalcular presupuestos emitidos | ✅ Aprobado |
| 2026-05-29 | Privacidad **backend-first** (campos 🔒 no se serializan a rol cliente) | No basta ocultar en UI; el backend omite los campos internos | ✅ Aprobado |
| 2026-05-29 | Alcance Oleada 1 = solo entidades congeladas v1 | Vertical de presupuesto; planning/ejecución/compras/actas diferidas | ✅ Aprobado |
| 2026-05-29 | `.worktreeinclude` limitado al golden master exacto | Los worktrees aislados no copian archivos ignorados por Git; `agent-excel-mapper` necesita el Excel privado. **TEMPORAL Oleada 1**: revisar/retirar tras crear el fixture sanitizado. NO incluye toda `private/` ni `.env` | ✅ Aprobado |
| 2026-05-29 | Dependencias Oleada 1 instaladas (pnpm) | db: drizzle-kit (raíz), postgres. excel/decimal: xlsx, decimal.js. frontend: ag-grid-community/react, clsx, tailwind-merge, cva, lucide-react, @radix-ui/react-slot. Todas permisivas, sin AGPL | ✅ Aprobado |
| 2026-05-29 | Diferidas: recharts, frappe-gantt, exceljs, @react-pdf/renderer | No necesarias hasta Oleada 3 (dashboard/planning/exports); se pedirán vía INTEGRATION_REQUESTS | ✅ Aprobado |
| 2026-05-29 | `drizzle-kit` en `package.json` raíz (no en apps/web) | `drizzle.config.ts` vive en raíz; el CLI se ejecuta desde ahí (`pnpm db:generate`) | ✅ Aprobado |
| 2026-05-30 | `tsx` (devDep raíz) + scripts `gm:dump`/`gm:build-fixture`/`gm:regression`/`gm:import` | Validación empírica del golden master (Oleada 1, Fase 1). `tsx` ejecuta scripts TS del importador | ✅ Aprobado |
| 2026-05-30 | Fixture regenerado **fila por fila** desde el Excel real (v2.0.0) | 14 capítulos + 131 ítems BOQ reales; SIN ítem de balanceo artificial; Σ ítems = costos_directos ±2e-8 COP | ✅ Aprobado |
| 2026-05-30 | `findPrivateLeaks` corregido (escanea solo texto libre) | Evita falsos positivos sobre UUIDs/DecimalString; los datos privados viven en texto, no en números | ✅ Aprobado |

Decisiones abiertas:
- [ ] Nombre final del producto
- [ ] **Q9 — Política exacta de redondeo decimal COP** (NO cerrada; bloquea Oleada 2 / cost-domain; no afecta el esquema congelado v1)
- [ ] **Q8 — Base exacta del descuento** (público vs referencia; NO cerrada; bloquea Oleada 2 / pricing; no afecta el esquema congelado v1)
- [ ] Usuarios iniciales y roles asignados
- [ ] Qué información ve el cliente en APU
- [ ] Proveedores visibles para cliente
- [ ] Frecuencia de sincronización de precios
- [ ] Canal oficial Homecenter Empresas
- [ ] Gantt por capítulos o actividades
- [ ] Ubicación de despliegue (Vercel + Railway o solo Vercel)
