---
name: project-context
description: Construction Ops Oleada 1 stack, owned paths, and key constraints for agent-frontend-boq
metadata:
  type: project
---

Stack: Next.js 16.2.6 + React 19 + TypeScript 5.9.3 + Tailwind 3 + shadcn/ui primitives (clsx, tailwind-merge, cva, @radix-ui/react-slot, lucide-react). AG Grid Community 35 (never Enterprise). Zod for form validation. Vitest for tests.

Worktree: `D:\ICONIC\SOFTWARE PRESUPUESTOS\construction-ops\.claude\worktrees\agent-a3395d6797561d60b`
App root: `apps/web`

Owned paths (can edit freely):
- `apps/web/app/(auth)/` — login, onboarding
- `apps/web/app/(dashboard)/` — all authenticated pages (except layout.tsx root)
- `apps/web/components/shared/` — shared product components
- `apps/web/components/ui/` — shadcn/ui wrappers
- `apps/web/lib/utils/` — UI utilities (format, dates)
- `apps/web/tests/unit/components/` — component unit tests
- `tailwind.config.ts`, `postcss.config.js`, `next.config.mjs`

Restricted (do NOT touch):
- `apps/web/app/layout.tsx` — orchestrator-owned
- `apps/web/proxy.ts` — orchestrator-owned
- `package.json` anywhere — request via INTEGRATION_REQUESTS
- `apps/web/modules/apu/`, `boq/`, `estimates/` — cost-domain
- `apps/web/modules/suppliers/`, `pricing/` — pricing agent
- `apps/web/modules/dashboard/` — dashboard agent
- `apps/web/modules/planning/` — planning agent
- `apps/web/modules/exports/` — exports agent
- `apps/web/lib/db/` — db-rls agent
- `supabase/` — db-rls agent

API contract source: `docs/API_CONTRACTS.md` (frozen v1, owned by orchestrator).
Mocks location: `apps/web/lib/utils/mocks/` (provisional, marked as such).

**Why:** Oleada 1 uses static mocks; cost-domain (Oleada 2) will provide real calculation functions. Frontend must NEVER compute financial totals.
**How to apply:** All displayed financial values come from mock data objects that exactly match the frozen interfaces in API_CONTRACTS.md. No arithmetic on DecimalString in components.
