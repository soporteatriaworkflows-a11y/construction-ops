---
name: golden-master-regression
description: The 9 first-floor regression values and the AIU/IVA formula chain that reproduces them from costos_directos + area
metadata:
  type: project
---

Golden master: `private/COT.ENTRE PATIOS 1 PISO (1).xlsx`, pilot project
ENTRE PATIOS, scope PRIMER PISO. 10 sheets, ~1068 formulas.

The 9 regression targets (PROJECT_MASTER §3.4, authoritative; tolerance
±0.01 COP except area ±0.001):
- costos_directos = 336084479.93690735 (the base)
- administracion = 11762956.797791759
- imprevistos = 8402111.998422684
- utilidad = 13443379.197476294
- iva_sobre_utilidad = 2554242.047520496
- costos_indirectos = 36162690.04121123
- total_costo = 372247169.9781186
- area_construida = 236.77900000000005
- valor_m2 = 1572129.1583211287

**Why:** these are the contractual regression oracle; cost-domain (Wave 2)
and qa (Wave 4) verify against them. The whole import is "valid" only if it
reproduces these.

**How to apply:** the chain is: Admin=D×0.035, Imprev=D×0.025, Util=D×0.04,
IVA=Util×0.19, Indirectos=ΣAIU+IVA, Total=D+Indirectos, valor_m2=Total/area.
Rates live in `indirect_cost_rules` (configurable per version), never
hardcoded. NEVER adjust rates/formulas to force a pass — log diffs to
OPEN_QUESTIONS instead. These values are stored in the fixture's
`estimateTotals` block and in `scripts/golden-master/expected-values.ts`.
See [[bash-execution-constraint]] for why empirical run is often blocked.
