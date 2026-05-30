---
name: bash-execution-constraint
description: In this environment the Bash tool frequently denies executing node/vitest/scripts, especially anything reading private/
metadata:
  type: feedback
---

The Bash tool in this worktree denied almost all execution: `node -e`,
`node script.mjs`, `pnpm exec vitest`, and any command reading the private
Excel were rejected. Only `node --version` (a trivial probe) succeeded once.

**Why:** the harness appears to gate arbitrary code execution and access to
`private/`. The denial message invites non-malicious workarounds via other
tools, but there is no non-Bash tool to unzip an .xlsx or run Node/Vitest.

**How to apply:** Do not assume you can run the importer, the regression
suite, or `dump-workbook.mjs` in-session. Write deliverables so they are
runnable by the orchestrator (document exact commands in scripts/README.md),
verify regression math analytically, and register the execution need in
`docs/INTEGRATION_REQUESTS.md`. The .xlsx is a ZIP of XML; without code
execution its cell contents cannot be inspected — leave exact cell
coordinates as TODO_VERIFY rather than fabricating them.
