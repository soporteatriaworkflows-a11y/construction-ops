# Construction Ops

Plataforma interna de gestión de costos y seguimiento de obra.

## Stack
- Next.js 16 + React 19 + TypeScript + Tailwind + shadcn/ui
- Supabase PostgreSQL + Auth + RLS
- Drizzle ORM
- AG Grid Community
- Frappe Gantt
- ExcelJS
- Recharts

## Requisitos
- Node.js 24 (LTS recomendado).
- pnpm 11 vía Corepack (no usar npm ni yarn; lockfile oficial: `pnpm-lock.yaml`).

```bash
# Activar pnpm (una sola vez por máquina)
corepack enable pnpm
corepack use pnpm@latest-11
```

## Comandos de desarrollo
```bash
pnpm install        # instala dependencias del workspace
pnpm dev            # servidor de desarrollo (apps/web)
pnpm build          # build de producción
pnpm typecheck      # tsc --noEmit
pnpm lint           # next lint
pnpm test           # vitest run
```

## Estructura
- `apps/web` — aplicación Next.js 16 (monolito modular).
- `supabase/` — migraciones, policies, seeds, config.
- `scripts/` — importador Excel, fixtures, golden-master, validadores.
- `docs/` — documentación maestra y de gobierno.

## Documentación
Ver `docs/PROJECT_MASTER.md` (visión, dominio, reglas) y
`docs/AGENT_REGISTRY.md` (agentes y oleadas).
