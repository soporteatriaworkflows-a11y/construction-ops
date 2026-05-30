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

Decisiones abiertas:
- [ ] Nombre final del producto
- [ ] Política exacta de redondeo decimal
- [ ] Usuarios iniciales y roles asignados
- [ ] Qué información ve el cliente en APU
- [ ] Proveedores visibles para cliente
- [ ] Frecuencia de sincronización de precios
- [ ] Canal oficial Homecenter Empresas
- [ ] Gantt por capítulos o actividades
- [ ] Ubicación de despliegue (Vercel + Railway o solo Vercel)
