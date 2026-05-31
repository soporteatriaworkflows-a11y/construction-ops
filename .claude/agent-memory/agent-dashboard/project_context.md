---
name: project-context
description: Wave 3A agent-dashboard context — DashboardSummary DTO, fixture location, ownership
metadata:
  type: project
---

Working in worktree agent-ad8e4fac570508d5a on branch feature/wave-1.5-local-rls.
Wave 3A: build /dashboard page with real KPIs from DashboardSummary DTO.

Key paths:
- Dashboard page: apps/web/app/(dashboard)/dashboard/page.tsx
- Dashboard module: apps/web/modules/dashboard/
- Dashboard tests: apps/web/tests/unit/dashboard/
- Fixture: scripts/fixtures/entre-patios-first-floor.fixture.json
- Read model contract: docs/READ_MODEL_CONTRACT.md
- Shared components: apps/web/components/shared/ and apps/web/components/ui/

DashboardSummary fields:
- projectId, budget, directCost, indirectCost (all DecimalString)
- chapterDistribution: ChapterDistributionSlice[] (chapterId, code, name, subtotal, share)
- topChapters: ChapterSummary[] (id, code, name, subtotal, itemCount)
- estimateStatus: EstimateVersionStatus
- lastUpdatedAt: IsoDateTime
- projectedSaving?, realizedSaving?, pricingCoverage? — ONLY for management/internal roles

Fixture has 14 chapters with real BOQ data from golden master.
Project totals: directCosts=336084479.94, indirectCosts=36162690.04, total=372247169.98

recharts installed: ^3.8.1
No @/server/read-model in this worktree — create dev-read-model.ts in modules/dashboard/

**Why:** Wave 3A parallel agent; db-rls owns server/read-model but not in this worktree.
**How to apply:** Create temporary fixture accessor in modules/dashboard/dev-read-model.ts.
