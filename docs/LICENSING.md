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
> `pnpm-workspace.yaml`, clave vigente en pnpm 11): `esbuild` (vitest),
> `sharp` (optimización de imágenes de Next 16), `unrs-resolver`
> (resolver nativo de eslint-config-next).
