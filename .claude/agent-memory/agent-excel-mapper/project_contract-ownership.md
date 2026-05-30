---
name: contract-ownership
description: Frozen v1 data contract and excel-mapper's narrow file ownership
metadata:
  type: project
---

The data contract is **frozen v1** (2026-05-29) in `docs/DATABASE_SCHEMA.md`
and `docs/API_CONTRACTS.md`, owned by agent-orchestrator. 20 entities
(Wave 1) + 7 provisional v0 (change_orders, purchase_*, schedule_*, etc.).

Contract rules that bind fixtures: DB snake_case ↔ TS camelCase ↔
PascalCase types; money/decimals/percentages as `DecimalString` (string),
never number; UUID/dates as ISO strings; percentages as fractions ("0.035").

**Why:** parallel Wave-1 agents must not diverge; fixtures/importer must
respect interfaces exactly so cost-domain/frontend-boq can consume them.

**How to apply:** agent-excel-mapper may ONLY edit `scripts/excel-import/`,
`scripts/golden-master/`, `scripts/fixtures/`, and `docs/EXCEL_MAPPING.md`.
NOT package.json, NOT supabase/migrations, NOT apps/web/modules or app/, NOT
the frozen contract docs or OPEN_QUESTIONS/DECISIONS (orchestrator-owned).
Any need outside scope → `docs/INTEGRATION_REQUESTS.md`. Worktree edits must
use the worktree path, not the shared checkout. See [[golden-master-regression]].
