---
name: conventions
description: Build/test/validation conventions for the cost-domain financial engine in Construction Ops
metadata:
  type: project
---

The financial engine lives in `apps/web/modules/{apu,boq,estimates}/` (cost-domain ownership). Tests in `apps/web/tests/unit/cost-domain/` (Vitest).

**Why:** Contract is frozen v1 in `docs/API_CONTRACTS.md`; money is `DecimalString` (string), operated with `decimal.js` (already installed in apps/web). Q9 (DECISIONS.md): no float, no intermediate rounding, presentation rounding (ROUND_HALF_UP) lives outside the domain.

**How to apply:**
- Domain decimals: use `DomainDecimal`/`toDecimal`/`toDecimalString` from `modules/apu/decimal.ts`. `toDecimalString` = `toFixed()` → no trailing zeros (e.g. `62370`, not `62370.00`). Write test assertions accordingly.
- Contract types are at `@/lib/utils/types` (owned by orchestrator/frontend-boq — do not edit). Import them, don't redefine.
- AIU rates come from `indirect_cost_rules` (configurable, never hardcoded). `baseType` ∈ {direct_cost, utility, custom}. The utility line (code 'U') feeds the IVA base via `contributesToUtilityBase` flag.
- Validation gates (run from worktree root): `pnpm run typecheck` (0), `pnpm run lint` (0), `pnpm run test`, `pnpm run gm:regression` (must stay 22/22).
- Regression oracle: `scripts/fixtures/entre-patios-first-floor.fixture.json` (sanitized, real BOQ rows). The 9 §3.4 values must reproduce within ±0.01 COP / ±0.001 m² from BOQ items + rules + area — never tweak formulas to force a match.
- Fixture import path from `tests/unit/cost-domain/`: `../../../../../scripts/fixtures/...` (5 levels up to repo root).
