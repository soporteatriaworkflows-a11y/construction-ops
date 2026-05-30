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
pnpm gm:regression  # regresión financiera del golden master (22 tests)
pnpm gm:import      # importador idempotente + chequeo de privacidad
```

## Validación RLS runtime (local, requiere Docker)
Valida las políticas Row Level Security contra un PostgreSQL **local** de
Supabase. NO usa base remota (`supabase link` / `db push` están prohibidos).
```bash
corepack pnpm exec supabase start        # levanta el stack local (Docker)
corepack pnpm exec supabase db reset     # aplica migraciones + seeds desde cero
pnpm --filter web exec tsx ../../scripts/rls-runtime/run.ts   # pruebas RLS reales
corepack pnpm exec supabase stop         # detiene el stack
```
> Si `supabase start` falla con `io.containerd...meta.db: input/output error`,
> el almacén de Docker Desktop está corrupto: reinicia Docker Desktop y, si
> persiste, usa *Troubleshoot → Clean / Purge data*.

## Estructura
- `apps/web` — aplicación Next.js 16 (monolito modular).
- `supabase/` — migraciones, policies, seeds, config.
- `scripts/` — importador Excel, fixtures, golden-master, validadores.
- `docs/` — documentación maestra y de gobierno.

## Documentación
Ver `docs/PROJECT_MASTER.md` (visión, dominio, reglas) y
`docs/AGENT_REGISTRY.md` (agentes y oleadas).
