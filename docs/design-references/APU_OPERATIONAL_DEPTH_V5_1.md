# APU_OPERATIONAL_DEPTH_V5_1 — APU como workspace operativo

## Objetivo
Que la Biblioteca APU ayude a entender de inmediato qué está completo, qué tiene pendientes, qué falta por
resolver, qué está vinculado al BOQ y **qué acción sigue** — usando SOLO datos/estados existentes. UI/UX, sin backend.

## Datos disponibles (auditados)
- `result.stats`: totalApus, totalComponents, linkedToBoq, complete, withPending, withUnresolved.
- `lib/apu-library/completeness.ts` (PURO): estados `ready` (Listo para usar) / `review` (Requiere revisión) /
  `incomplete` (Incompleto) / `archived`, con `issues` (no_components, zero_unit_cost, materials_without_price,
  unresolved_resources, no_category, ambiguous, suggested, no_boq_link) y `editableCapabilities`.
- `apuLinkEligibility` (vincular a BOQ) + `LinkToBoqButton` (flujo existente).
- Filtro GET `completeness` con valores reales: `''/ready/review/incomplete/archived`.

## Estados usados (existentes, sin inventar)
ready / review / incomplete / archived · vinculado/sin vínculo BOQ (`item.boqLinked`) · solo lectura (`!canMutate`).

## Acciones por estado (sin botones falsos; rutas existentes)
- `incomplete` → guía "Siguiente: completar componentes/precios" + el CTA "Editar componentes" se **eleva a
  "Completar APU"** (botón primario, ruta `/apu/[id]?tab=componentes`).
- `review` → "Siguiente: revisar pendientes" (Abrir → `/apu/[id]`).
- `ready` + sin BOQ → "Listo · siguiente: vincular a BOQ" (`LinkToBoqButton` existente).
- `ready` + vinculado → "Listo para usar · vinculado a BOQ" (indicador success).
- `archived` / `!canMutate` → "Archivado · solo lectura" / "Solo lectura" (sin CTA falso).

## Rutas intervenidas
- `/apu` (vista tarjetas): KPI band **accionable** (Completas/Con pendientes/Sin resolver → deep-link al filtro
  `?view=cards&completeness=ready|review|incomplete`).
- Card de actividad (`apu-library-cards.tsx`): `SurfaceCard variant="action"` (consistencia V4.2 + lift) + línea de
  **próxima acción** por estado + CTA elevado en incompletos. Conserva Abrir / Editar / Vincular a BOQ.

## Qué se puede con datos existentes vs backend
- **Hecho (datos existentes)**: estados, issues, próxima acción, KPIs accionables, badges, capacidades editables.
- **Pendiente (backend)**: detalle `/apu/[id]` usa `getApuDetail` (read-model distinto, sin el shape de completitud)
  → un panel "qué falta" accionable en el detalle requiere exponer esos campos en el read-model (V5.2/backend). NO se
  fabricó. Filtro "Vinculadas BOQ" no tiene parámetro → KPI no enlaza (documentado).

## Archivos modificados
- `app/(dashboard)/apu/_components/apu-library-cards.tsx` (SurfaceCard + ApuNextAction + CTA por estado).
- `app/(dashboard)/apu/page.tsx` (KPIs con `href` al filtro de completitud).
- `tests/unit/apu/apu-operational-depth.test.ts` (nuevo).

## Qué NO se tocó
Cálculos APU/BOQ, fórmulas, `unit_price_snapshot`, exports, RPCs, read-model, Supabase/RLS/Auth/envs, sync BOQ,
Workspace V3C lógica, companion, filtro Sin APU, `construction-ops-1rqh`. Sin backend ni migraciones. Detalle `/apu/[id]`
no se modificó (limitación documentada). Dark/light heredan el sistema V4.2 (la card usa tokens/remaps).

## Riesgos
- Bajo: solo UI de la vista tarjetas + KPIs. Sin capturas (revisión en preview). La card pasó de `div` a `SurfaceCard`
  (mismo box, rounded-2xl) — verificar densidad visual.

## Pendientes V5.2/V5.3
- Detalle `/apu/[id]` accionable (requiere campos de completitud en `getApuDetail`).
- Workspace técnico: acciones por fila/estado más explícitas.
- Catálogo / centro de control de precios (V5.2).

## QA
typecheck 0 · lint 0 · tests `apu-operational-depth` 4/0 · suite **2133/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.

---

## V5.1.1 — Dark mode contrast hotfix (APU + relacionados)

Barrido grep en zonas reportadas. Hallazgos: **tintes claros con opacidad no remapeados**.
- `bg-cyan-50/30` (contenedor del **Simulador comercial**) y `bg-white/70` (nota del simulador) → barras claras en dark.
- Opacidades de `bg-brand-50/` y `bg-brand-100` (chips/secciones, p.ej. "Costos directos"/SummaryCard primary) no cubiertas.
- "Activos" = `KpiCard tone="ok"` → ya **verde legible** en dark (sin cambio).

**Correcciones (sistémicas + targeted):**
- `globals.css .dark`: remap de tintes claros de marca/acento → superficie: `bg-brand-50`, `bg-brand-100`,
  `[class*=bg-brand-50/ | bg-brand-100/ | bg-cyan-50/ | bg-blue-50/]` → `surface-soft`. (Estados amber/green/red conservan tinte.)
  → arregla el contenedor del Simulador (cyan-50/30), SummaryCard primary (brand-50) y chips brand en dark.
- `commercial-simulator.tsx`: la nota `bg-white/70 + text-iconic-graphite` (barra clara + texto claro = ilegible) →
  `dark:bg-surface-muted dark:border-line dark:text-content-muted`.
- "Costos directos": SummaryCard `accent=primary` (bg-brand-50) → ahora superficie; `accent=ink` ya era `bg-white`→surface.

Light intacto (todo bajo `.dark`). QA: typecheck 0 · lint 0 · suite 2133/0 · build 0 · gm 22/22 · diff-check limpio.
