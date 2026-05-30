# Licencias del proyecto

## Decisión principal
Este proyecto se construye en modalidad clean-room.
OpenConstructionERP (AGPL-3.0) se usa SOLO como referencia funcional.
No se copia ni se porta su código.

## Librerías aprobadas
- AG Grid Community: MIT-compatible (Community Edition)
- Frappe Gantt: MIT
- Drizzle ORM: Apache 2.0
- ExcelJS: MIT
- Recharts: MIT
- shadcn/ui: MIT
- Zod: MIT

## Librerías NO aprobadas sin revisión
- ag-grid-enterprise (requiere licencia comercial)
- Cualquier fork de OpenConstructionERP

## Dependencias efectivamente instaladas (Paso 0 — 2026-05-29)

Gestor: pnpm 11.5.0 (Corepack). Lockfile: `pnpm-lock.yaml`.

> Actualizado el 2026-05-29 tras el upgrade a Next.js 16 / React 19.

### Producción (apps/web)
| Paquete | Rango | Licencia |
|---|---|---|
| next | ^16.2.6 | MIT |
| react | ^19.2.6 | MIT |
| react-dom | ^19.2.6 | MIT |
| zod | ^3.23.8 | MIT |
| drizzle-orm | ^0.33.0 | Apache-2.0 |

### Desarrollo (apps/web)
| Paquete | Rango | Licencia |
|---|---|---|
| typescript | ^5.9.3 | Apache-2.0 |
| @types/node | ^20.16.5 | MIT |
| @types/react | ^19.2.15 | MIT |
| @types/react-dom | ^19.2.3 | MIT |
| tailwindcss | ^3.4.13 | MIT |
| postcss | ^8.4.47 | MIT |
| autoprefixer | ^10.4.20 | MIT |
| eslint | ^9.39.4 | MIT |
| eslint-config-next | ^16.2.6 | MIT |
| vitest | ^2.1.1 | MIT |

> Todas las licencias son permisivas (MIT / Apache-2.0). Sin AGPL.
> Sin `ag-grid-enterprise`. AG Grid Community, Recharts, Frappe Gantt,
> ExcelJS y @react-pdf/renderer NO se instalaron en Paso 0; se solicitarán
> en oleadas posteriores vía `docs/INTEGRATION_REQUESTS.md`.
>
> Builds nativos aprobados explícitamente (`allowBuilds` en
> `pnpm-workspace.yaml`, clave vigente en pnpm 11): `esbuild` (vitest +
> drizzle-kit), `sharp` (optimización de imágenes de Next 16),
> `unrs-resolver` (resolver nativo de eslint-config-next).

## Dependencias añadidas — Preparación Oleada 1 (2026-05-29)

### Raíz (devDependencies)
| Paquete | Rango | Licencia | Uso |
|---|---|---|---|
| drizzle-kit | ^0.31.10 | MIT | Migraciones/generación Drizzle (db-rls). Vive en raíz porque `drizzle.config.ts` está en raíz |
| tsx | ^4.22.3 | MIT | Runner TS/ESM para scripts golden-master (`gm:import`). Añadido en la validación empírica del Excel Mapper (Oleada 1) |
| supabase | ^2.102.0 | MIT | **Supabase CLI** (wrapper npm que descarga el binario). Solo desarrollo/local: `supabase start` + `supabase db reset` para validar RLS runtime contra PostgreSQL local. NO se usa `supabase link` ni `db push`. Añadido en Oleada 1.5 (rama `feature/wave-1.5-local-rls`). Sin global; sin remoto |

### apps/web — dependencies
| Paquete | Rango | Licencia | Uso |
|---|---|---|---|
| postgres | ^3.4.9 | Unlicense | Driver PostgreSQL (postgres.js) para el cliente Drizzle |
| decimal.js | ^10.6.0 | MIT | Precisión financiera COP (regresión y cost-domain) |
| ag-grid-community | ^35.3.0 | MIT | Grilla del BOQ (frontend-boq). **Community**, no Enterprise |
| ag-grid-react | ^35.3.0 | MIT | Wrapper React de AG Grid (soporta React 19) |
| clsx | ^2.1.1 | MIT | Utilidad de clases (base shadcn/ui) |
| tailwind-merge | ^3.6.0 | MIT | Merge de clases Tailwind (base shadcn/ui) |
| class-variance-authority | ^0.7.1 | Apache-2.0 | Variantes de componentes (base shadcn/ui) |
| lucide-react | ^1.17.0 | ISC | Iconos (UI) |
| @radix-ui/react-slot | ^1.2.4 | MIT | Primitiva `Slot` (`asChild`) para componentes base shadcn/ui |

### apps/web — devDependencies
| Paquete | Rango | Licencia | Uso |
|---|---|---|---|
| xlsx | ^0.18.5 | Apache-2.0 | Lectura del golden master por el importador (excel-mapper) |

> Todas permisivas (MIT / Apache-2.0 / Unlicense / ISC). **Sin AGPL.**
> Sin `ag-grid-enterprise`.
>
> **Diferidas a oleadas posteriores** (NO instaladas): `recharts`
> (dashboard, Oleada 3), `frappe-gantt` (planning, Oleada 3), `exceljs`
> y `@react-pdf/renderer` (exports, Oleada 3). Se solicitarán vía
> `docs/INTEGRATION_REQUESTS.md` cuando su oleada lo requiera. Nota: el
> importador de Excel usa `xlsx` (lectura); las exportaciones `.xlsx`
> usarán `exceljs` más adelante.
