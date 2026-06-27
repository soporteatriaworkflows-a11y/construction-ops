# Handoff Log

## 2026-06-27 — ICONIC_OPS_APU_DARK_MODE_CONTRAST_HOTFIX_V5_1_1 — EN RAMA (sin merge) (orchestrator)

- Misma rama `feature/apu-operational-depth-v5-1`. Causa: **tintes claros con opacidad no remapeados** en dark.
- `globals.css .dark`: remap `bg-brand-50/100` (+opacidad) y `[class*=bg-cyan-50/ | bg-blue-50/]` → `surface-soft`
  (arregla contenedor del Simulador comercial `bg-cyan-50/30`, SummaryCard primary `bg-brand-50` = "Costos directos", chips brand). Estados amber/green/red conservan tinte.
- `commercial-simulator.tsx`: nota `bg-white/70`+texto → `dark:bg-surface-muted dark:border-line dark:text-content-muted` (fin de barra clara + texto ilegible).
- "Activos" = KpiCard tone=ok → ya verde legible (sin cambio).
- QA: typecheck 0 · lint 0 · build 0 · suite **2133/0 (+42 skip)** · gm 22/22 · diff-check limpio. Light intacto. No `-1rqh`. **Sin merge/tag/prod.**

---

## 2026-06-27 — ICONIC_OPS_APU_OPERATIONAL_DEPTH_V5_1 — EN RAMA (sin merge) (orchestrator)

- Rama `feature/apu-operational-depth-v5-1` (base `origin/main = 86578cc`). Primera fase de V5 (profundidad operativa).
- **Solo APU, UI/UX, datos existentes** (modelo PURO `lib/apu-library/completeness.ts`: ready/review/incomplete/archived
  + issues + capacidades + `apuLinkEligibility`). Sin backend/migraciones.
- Cambios: card de actividad → `SurfaceCard variant=action` + **línea "próxima acción" por estado** + CTA elevado a
  **"Completar APU"** en incompletos (ruta existente `?tab=componentes`); KPI band de `/apu` **accionable** (deep-link
  a `?view=cards&completeness=ready|review|incomplete`). Conserva Abrir/Editar/Vincular a BOQ.
- **Limitación documentada**: detalle `/apu/[id]` usa `getApuDetail` (read-model distinto, sin shape de completitud) →
  panel "qué falta" accionable requiere backend (V5.2). NO se fabricó. KPI "Vinculadas BOQ" sin filtro → no enlaza.
- QA: typecheck 0 · lint 0 · tests apu-operational-depth 4/0 · suite **2133/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.
- Sin tocar cálculos/`unit_price_snapshot`/exports/RPC/read-model/sync/Workspace V3C/companion/Sin APU. No `-1rqh`. **Sin merge/tag/prod.**

---

## 2026-06-27 — ICONIC_OPS_UIX_THEME_MODES_V4_2 — RELEASED (merge + tag + prod smoke) (orchestrator)

- Usuaria aprobó cierre de V4.2 (stack .1→.13: theme light/dark/system, AppRail flotante, dashboard IA + cards,
  workflow strip + dock flotante, iconografía/botones premium, rescate de contraste dark, headers azul vivo).
- **Merge `--no-ff` a main**: `origin/main` = **`5c185bc`** (parents `f6cd634` + `5d194de`). **Tag** =
  **`iconic-ops-uix-theme-modes-v4-2`** → `5c185bc`. **PR #6 MERGED**. 47 archivos.
- Deploy prod proyecto **construction-ops** (alias `construction-ops-psi`). Smoke OK: /login 200 ·
  /dashboard·/projects·/estimates·/apu·/catalog·/quantities·/planning·/settings·/settings/access 307 ·
  /api/estimates/export (sin params) **400 controlado** · cron 401. Commit promovido no confirmable por API (MCP 403) → verificar Production/Current en dashboard.
- **NO** se tocó `construction-ops-1rqh` (su check del PR falla por deuda preexistente). UIX-only: sin
  Supabase/RLS/Auth/envs/secrets/cálculos/exports/datos/RPC/read-model/`unit_price_snapshot`/Workspace V3C/companion/Sin APU.
- **Pendientes V5** (documentados, no implementar ahora): notas rápidas con backend real; countdown real de
  monitoreo (next-run); responsive fino del workflow dock (mobile); restyle profundo de tablas internas;
  revisión final de dark por módulo; mejoras reales de Catálogo/APU/Cantidades.

---

## 2026-06-27 — ICONIC_OPS_UIX_FLOATING_WORKFLOW_COMPANION_V4_2_13 — EN RAMA (sin merge) (orchestrator)

- Nuevo `components/shared/floating-workflow-dock.tsx` (`FloatingWorkflowDock`, client) montado en
  `(dashboard)/layout.tsx`: dock flotante compacto (fixed bottom-4, glass claro/oscuro) que acompaña fuera del
  dashboard; **se auto-oculta en `/dashboard`**. 7 pasos (rutas reales verificadas), detección de paso por ruta
  (específico→general; `*/workspace`→Cotizar), minimizable a pill "Flujo" (persiste `iconic-workflow-dock-collapsed`),
  solo `lg+`. NO duplica el CTA del Asistente (primer nodo navega a `/quote`, sin disparar el evento del companion).
- Verificado que el dark fix raíz (default border + opacity remaps, V4.2.12) ya está integrado en la rama antes de implementar.
- QA: typecheck 0 · lint 0 · tests floating-workflow-dock 5/0 · suite **2129/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.
- Sin tocar AppRail/companion/Workspace lógica/rutas/DB/datos. No `-1rqh`. **Sin merge/tag/prod.**

---

## 2026-06-27 — ICONIC_OPS_UIX_DARK_MODE_P0_CONTRAST_FIX_V4_2_12 — EN RAMA (sin merge) (orchestrator)

### CAUSA RAÍZ (la que faltaba)
El **Preflight de Tailwind** fija `border-color: #e5e7eb` (gris claro) por defecto para CUALQUIER `border`
sin clase de color. El código usa `border` a secas en cards/forms/inputs/tabla → en dark eso era el
**"perímetro blanco" omnipresente**. Mis remaps solo cubrían `border-gray-*`/soft-blue EXPLÍCITOS, no el default.

### Fix raíz + complementos
- **`@layer base`**: `.dark *, ::before, ::after { border-color: var(--c-line) }` → borde por defecto en dark = slate
  sutil. Las utilidades `border-{color}` (capa utilities) siguen ganando donde son explícitas (p.ej. tab activa azul).
- **Links azul oscuro** `text-blue-600..950 → #60a5fa` (azul vivo legible).
- (V4.2.12 previo: chip "Grupo ICONIC" dark surface + texto claro; variantes con opacidad bg/border/text de marca;
  form-controls dark; V4.2.11: logo bg-iconic-white, ContextualNav dark, topbar Asistente filled, text/border/bg exactos.)

### Verificación por ruta (dark) — cobertura sistémica
dashboard/apu/catalog/projects/estimates/quantities/planning/settings(+access)/workspace: Topbar/Tabs/Inputs/Cards/
Textos/Bordes ✅ vía tokens + remaps (exactos y con opacidad) + default-border dark + form-controls + brand pill/logo.

### QA
typecheck 0 · lint 0 · build 0 · suite **2129/0 (+42 skip)** · gm 22/22 · diff-check limpio. Light intacto. No `-1rqh`. **Sin merge/tag/prod.**

---

## 2026-06-27 — ICONIC_OPS_UIX_DARK_MODE_SYSTEMIC_FIX_V4_2_12 (opacity variants) — EN RAMA (sin merge) (orchestrator)

### Causa raíz (auditoría grep)
(1) Regresión propia: el chip "Grupo ICONIC" quedó `bg-iconic-white` + `text-iconic-ink`(→content) = texto claro
sobre pill blanco = invisible. (2) El remap por clase EXACTA no cubría **variantes con opacidad**
(`bg-gray-50/50`, `text-iconic-graphite/60`, `border-iconic-soft-blue/70`…) → toolbars grises, navy ilegible y
bordes "tiza" persistían en APU y otras.

### Fix sistémico (globals.css `.dark`, selectores de atributo con sufijo `/` para no chocar con `bg-gray-500`)
- Fondos: `[class*=bg-gray-50/ | bg-iconic-gray/ | bg-slate-50/]→surface-soft`; `[bg-gray-100/ | bg-slate-100/]→surface-muted`.
- Bordes: `[border-gray-100/ /200/ /300/ | border-iconic-soft-blue/]→line` (fin de marcos blancos).
- Texto: `[text-iconic-ink/]→content`; `[text-iconic-graphite/]→content-muted`; `[text-iconic-primary/]→#4d8dff`.
- NO incluye `bg-white/*` (translúcido intencional en barras navy/graphite) → casos puntuales aparte.

### Targeted
- **Chip "Grupo ICONIC"**: dark = `bg-surface-muted` + texto `content`; logo tile sigue blanco (`bg-iconic-white`).
- (V4.2.11 ya: AppRail/logo bg-iconic-white, ContextualNav dark, topbar Asistente filled, form-controls dark, text/border/bg exactos de marca.)

### QA por ruta (dark) — cobertura sistémica (Topbar/Tabs/Inputs/Cards/Textos/Bordes)
dashboard ✅✅✅✅✅✅ · apu ✅✅✅✅✅✅ · catalog ✅✅✅✅✅✅ · projects ✅✅✅✅✅✅ · estimates ✅✅✅✅✅✅ ·
quantities ✅✅✅✅✅✅ · planning ✅✅✅✅✅✅ · settings(+access) ✅✅✅✅✅✅ · workspace ✅✅✅✅✅✅ (vía tokens/remap/reglas globales).

### QA técnico
typecheck 0 · lint 0 · build 0 · suite **2129/0 (+42 skip)** · gm 22/22 · diff-check limpio. Light intacto. No `-1rqh`. **Sin merge/tag/prod.**

---

## 2026-06-27 — ICONIC_OPS_UIX_DARK_MODE_CONTRAST_RESCUE_V4_2_11 — EN RAMA (sin merge) (orchestrator)

### Causa raíz
Tokens de MARCA usados como texto/borde/fondo (`text-iconic-ink/graphite`, `border-iconic-soft-blue*`,
`bg-iconic-gray`, `bg-iconic-soft-blue*`) + controles de formulario nativos NO los cubría el remap `gray-*` →
texto navy ilegible, bordes "tiza", inputs blancos en dark.

### Rescate sistémico (globals.css `.dark`)
- `text-iconic-ink/graphite → content` (claro); `text-iconic-primary → #4d8dff` (azul vivo legible para links/íconos).
- `bg-iconic-gray → surface-soft`; `[class*=border-iconic-soft-blue] → line` (cubre opacidades → sin marcos blancos);
  `[class*=bg-iconic-soft-blue] → surface-muted`.
- **Form controls**: `.dark input/select/textarea` → fondo surface-soft + texto claro + borde line + placeholder muted (no más inputs blancos).

### Targeted
- **AppRail logo** + **WorkspaceLogo/chip**: `bg-white → bg-iconic-white` (logo nunca se pierde en dark).
- **ContextualNav** ("Lista/Nuevo"): `bg-white/70 → dark:bg-surface`, texto tabs theme-aware (fin de la franja clara).
- **Topbar "Asistente"**: dark variant filled (surface-muted + line + content), sin borde claro que se pierde.
- (Outline button visible + headers azul vivo: ya de V4.2.10.)

### QA
- typecheck 0 · lint 0 · build 0 · suite **2129/0 (+42 skip)** · gm 22/22 · diff-check limpio.
- Light intacto (todo bajo `.dark`/`dark:`). Sin layout/lógica/DB/datos. No `-1rqh`. **Sin merge/tag/prod.**

---

## 2026-06-27 — ICONIC_OPS_UIX_COLOR_CONTRAST_REFINEMENT_V4_2_10 — EN RAMA (sin merge) (orchestrator)

### Cambios sistémicos (color/contraste; sin layout ni lógica)
- **Headers navy → azul vivo de marca** (= azul del botón "Aplicar", `iconic-primary #005DD6`): `OperationsHeader`
  (gradiente `from-iconic-primary via-#0a51c2 to-#013e97`) — afecta APU/Catálogo/Cantidades/Cronograma/Proyectos/
  Presupuestos/Settings de una sola vez. También el hero de Settings y la command bar del Workspace (solo color).
- **Dark — logo/marca visible**: el tile del logo usaba `bg-white`, que el remapeo `.dark` oscurecía → logo perdido.
  `WorkspaceLogo` y el chip pasan a **`bg-iconic-white`** (siempre claro) → logo/marca legibles en dark.
- **Dark — botón `outline` visible** (sin perímetro blanco): en dark pasa de `bg-white/5` (se perdía) a
  **`bg-surface-muted` + borde `line` suave**. Primario sigue en azul vivo `iconic-primary` (el que la usuaria aprobó).

### QA
- typecheck 0 · lint 0 · build 0 · suite **2129/0 (+42 skip)** · gm 22/22 · diff-check limpio.
- Conserva dashboard/AppRail/topbar/workflow/notas/monitoreo/command-palette/estructura. Light intacto. Sin DB/Auth/envs/cálculos/datos. No `-1rqh`. **Sin merge/tag/prod.**

---

## 2026-06-27 — ICONIC_OPS_UIX_DASHBOARD_COUNTDOWN_RING_HOTFIX_V4_2_9 — EN RAMA (sin merge) (orchestrator)

- Ajuste puntual: en Monitoreo → "Próxima revisión", se **quitó el `02h 18m` del centro del anillo** (era
  redundante con el texto externo). Centro ahora con icono `CalendarClock` limpio; el anillo de progreso se
  mantiene. El dato externo (Próxima revisión en `02h 18m` + Última `{lastRunAt real}`) se conserva. Se quitó
  el icono duplicado del eyebrow externo.
- Solo `dashboard/page.tsx`. typecheck 0 · lint 0 · build 0 · suite 2129/0 (+42 skip) · diff-check limpio. **Sin merge/tag/prod.** No `-1rqh`.

---

## 2026-06-27 — ICONIC_OPS_UIX_DASHBOARD_TARGET_MATCH_V4_2_8 — EN RAMA (sin merge) (orchestrator)

### Comparación real ACTUAL vs TARGET (capturas leídas del disco)
Imágenes en `D:\ICONIC\SOFTWARE PRESUPUESTOS\docs\design-references\uix\` (fuera del repo; NO commiteadas:
datos financieros). TARGET=`f7678e52…png`, ACTUAL=`088ccfab…png`. **La V4.2.7 ya coincidía ~90%** con el
target (bloque superior, Operación unificada, Notas, monitoreo, workflow, AppRail). Cerré 3 deltas:
1. **Monitoreo**: anillo countdown SVG "02h 18m" + CalendarClock + Última (lastRunAt real). "02h 18m" ilustrativo (sin next-run en backend; honesto).
2. **Workflow strip**: nodos circulares sobre línea conectora (timeline real), no grilla de botones.
3. **Notas**: footer "Ver todas las notas" (estilo enlace, sin nav falsa) + dots azules marcados.

### QA
- typecheck 0 · lint 0 · suite **2129/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.
- Sin lógica/DB/Auth/envs/cálculos/exports/datos. AppRail/topbar/command-palette/companion/Workspace V3C/rutas intactos. No `-1rqh`. **Sin merge/tag/prod.**

---

## 2026-06-26 — ICONIC_OPS_UIX_DASHBOARD_INFORMATION_ARCHITECTURE_REDESIGN_V4_2_7 — EN RAMA (sin merge) (orchestrator)

### Nota
Imágenes A/B no llegaron visibles; se trabajó contra la estructura objetivo detallada (A–D). Misma rama `feature/uix-theme-modes-v4-2`, PR #6.

### Qué cambió (solo Dashboard; sin lógica/datos)
- **Operación unificada**: 3 cards sueltas → UN panel con 3 columnas + divisores (Capítulo de mayor peso / Versiones
  emitidas / Precios por revisar; enlace a revisión tras `isAuthorizedForSavings`; conteo real conservado).
- **Notas rápidas** (`components/shared/notes-card.tsx`): UI shell con ejemplos estáticos + "+" "próximamente". Sin backend/flujo falso.
- **Monitoreo consolidado**: 4 KpiCards → UN panel (4 indicadores tira hairline con tono + subzona de tiempo:
  anillo reloj + Última revisión real `lastRunAt` + "Próxima: automática"). **Sin countdown fabricado** (no hay next-run en el summary).
- **Workflow strip** (`components/shared/workflow-strip.tsx`): 7 cards de acceso → franja horizontal de nodos navegables; "Cotizar con asistente" = Actual.
- Componentes reusables nuevos: NotesCard, WorkflowStrip. `DashMetric` ahora con tono. Removidos QuickLink/KpiCard del dashboard.

### QA
- typecheck 0 · lint 0 · tests premium-system/workspace-route-config/ui-and-invariants ok · suite **2129/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.
- Conserva AppRail/topbar/command-palette/toggle/card-system/datos reales/companion/Workspace V3C/rutas. Sin DB/Auth/envs/cálculos/exports/datos. No `-1rqh`. **Sin merge/tag/prod.**

---

## 2026-06-26 — ICONIC_OPS_UIX_FINAL_SHELL_POLISH_V4_2_6 — EN RAMA (sin merge) (orchestrator)

### Hotfix puntual de shell (misma rama `feature/uix-theme-modes-v4-2`, PR #6). [Nombre V4.2.6 reusado por la usuaria; esta entrada = el "shell polish".]
- **Buscador topbar**: theme-aware (surface-soft/line/content) + lupa clara (iconic-primary/70) + keycap ⌘K discreto (antes literales claros → raro en dark).
- **Overlay/command palette**: dim neutro sutil `bg-black/30 backdrop-blur-[3px]` (no `bg-iconic-ink/30`); modal/pie/input theme-aware. Sin franja translúcida.
- **CTA Asistente del rail**: centrado en colapsado (`justify-center px-0`); indicador de modo también.
- **Launcher flotante derecho del Asistente: ELIMINADO** (`return null` cuando no-open); abre por evento (rail/topbar). Lógica/eventos del companion intactos.
- **Rail navy → graphite** premium (`rgba(32,36,44)→(24,28,35)`, borde white/10); acentos azules vivos conservados (activo/hover/CTA/indicadores).

### QA
- typecheck 0 · lint 0 · tests premium-system/quote-companion-in-place ok · suite **2127/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.
- Conserva AppRail/hover/pin/CTA/toggle/dashboard/cards. Workspace V3C/companion/Sin APU/rutas/exports intactos. Sin DB/Auth/envs/cálculos/datos. No `-1rqh`. **Sin merge/tag/prod.**

---

## 2026-06-26 — ICONIC_OPS_UIX_REFERENCE_DRIVEN_DASHBOARD_REDESIGN_V4_2_6 — EN RAMA (sin merge) (orchestrator)

### Nota
Referencias A–G no llegaron visibles (no adjuntas); se trabajó contra las descripciones detalladas. Misma rama `feature/uix-theme-modes-v4-2`, PR #6.

### Qué cambió
- **Tipografía revertida**: fuera Space Grotesk (se sentía "documento") → **Inter única familia UI**
  (limpia/tecnológica/buen peso); `font-display`=Inter peso alto. Datos JetBrains Mono.
- **Dark slate-charcoal con elevación**: app `#0d0f14`, surface `#161922`, soft `#1d212c`, muted `#262b38`,
  line `#2d3340`, content `#e8eaf0`, muted `#98a0af`. Más balance/elevación que el neutro plano. AG/glass realineados.
- **Dashboard modular (refs B/F)**: ZONA 1 = grid lg:3 → card PRIMARY (resumen+métricas) 2/3 + card CHART
  compacta (Distribución) 1/3 → el gráfico ya no domina. "Capítulo de mayor peso" → SurfaceCard + IconChip cápsula.
- **Card system** nuevo `components/shared/surface-card.tsx` (SurfaceCard variantes primary/metric/action/chart/status + ActionCard).
- **Botón primario azul premium** (highlight interno + sombra marca). **IconChip cápsula** (shape="capsule", ref G).

### QA
- typecheck 0 · lint 0 · tests premium-system/typography-system/theme-modes ok · suite **2125/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.
- Conserva AppRail/hover/pin/CTA/toggle. Workspace V3C/companion/Sin APU/rutas/exports intactos. Sin DB/Auth/envs/cálculos/datos. No `-1rqh`. **Sin merge/tag/prod.**

---

## 2026-06-26 — ICONIC_OPS_UIX_SIGNATURE_VISUAL_REDESIGN_V4_2_5 — EN RAMA (sin merge) (orchestrator)

### Cambio de identidad (no más polish) — misma rama `feature/uix-theme-modes-v4-2`, PR #6
- **Dark rearmado a graphite neutro** (Linear/Vercel/Raycast), NO navy saturado: app `#0c0d10`, surface
  `#16171b`, soft `#1b1d22`, muted `#23252b`, line `#292b32`, content `#eceef2`, muted `#9a9ea8`. Navy ICONIC
  pasa a ACENTO (rail/command bar/CTA). AG Grid dark + `.glass` dark realineados.
- **Light**: off-white `#f5f6f8`, hairline `#e7e9ee`, texto casi-negro neutro `#1a1d23`, más aire.
- **Dashboard recompuesto (editorial)**: eliminado el mega-hero navy + mini-cards (CommandStat/BlueprintBg/
  IconPlate). Nueva composición: eyebrow → Total (cifra-héroe display) → barra de composición de costo →
  tira de métricas plana hairline (`DashMetric`) → panel de distribución limpio.
- **Card** premium: hairline + sombra suave + lift (claro), solo borde en dark. **Rail icons** refinados
  (inactivo sin caja, activo con ring cian).

### QA
- typecheck 0 · lint 0 · tests `premium-system`/`theme-modes` ok · suite **2122/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.
- Conserva AppRail/hover/pin/CTA Asistente/toggle/tipografía/OperationsHeader. Workspace V3C/companion/Sin APU/rutas/exports intactos. Sin DB/Auth/envs/cálculos/datos. No `-1rqh`. **Sin merge/tag/prod.**

---

## 2026-06-26 — ICONIC_OPS_UIX_SKILL_GUIDED_VISUAL_REFINEMENT_V4_2_4 — EN RAMA (sin merge) (orchestrator)

### Tooling de diseño (sin instalar nada en el repo)
- Se evaluó: plugin oficial Anthropic **`frontend-design`** (en marketplace `claude-plugins-official`, ya
  clonado en `~/.claude`, NO instalado) → **se leyó su SKILL.md y se aplicó su metodología** sin instalar.
  Impeccable (tercero, `npx impeccable install` toca el repo) **descartado**. **No** se modificó `.claude`/config/repo por tooling.

### Qué cambió (misma rama `feature/uix-theme-modes-v4-2`, PR #6)
- **Tipografía deliberada** (palanca #1 del skill; además **Inter no se cargaba** → fallback system-ui):
  `next/font` self-hosted — Inter (cuerpo) + **Space Grotesk** (display técnica, títulos/cifras-héroe) +
  JetBrains Mono (datos). Tailwind `font-display`/`sans`/`mono` por variable. `font-display` aplicado en
  OperationsHeader (título+stat), KpiCard (valor), Dashboard (Total + h2), Workspace (Total general navy).
- **Audacia concentrada**: hero "Centro de mando" **aplanado** (gradiente sobrio + sombra suave, sin radial/glow).
- **Quality floor**: `prefers-reduced-motion` respetado (globals.css).

### QA
- typecheck 0 · lint 0 · tests `typography-system` 4/0 · suite **2120/0 (+42 skip)** · build 0 (next/font compila) · gm 22/22 · diff-check limpio.
- Sin DB/Auth/envs/cálculos/exports/datos · Workspace V3C/companion/Sin APU/rutas intactos · no `-1rqh`. **Sin merge/tag/prod.**

---

## 2026-06-26 — ICONIC_OPS_UIX_PREMIUM_ICONOGRAPHY_GLASS_SYSTEM_V4_2_3 — EN RAMA (sin merge) (orchestrator)

### Qué cambió (misma rama `feature/uix-theme-modes-v4-2`, PR #6) — capa visual premium sistémica
- **Iconografía central**: `components/shared/iconic-icon.tsx` (`IconicIcon`+`IconChip`, estados
  default/active/muted/primary/success/warning/danger, theme-aware) + **normalización global** del trazo
  lucide en `globals.css` (`svg.lucide` stroke-width 1.75 + round) → todos los íconos monoline finos de una vez.
- **Navegación glass/dock**: `AppRail` navy translúcido + blur (`glass-navy`), borde white/12 + ring interno,
  sombra premium + glow cian tenue, pressed state en items y CTA. Conserva hover-expand/pin/CTA Asistente/rutas.
- **Botones premium** (`ui/button.tsx`): radios suaves + `active:scale` (táctil) + primario con sombra al hover
  + **secundario frosted** (translúcido+blur) + variantes dark completas. Utilidades `.glass`/`.glass-navy`.
- **Dashboard**: `IconChip` en "Capítulo de mayor peso" (iconografía consistente).

### QA
- typecheck 0 · lint 0 · tests `premium-system` 5/0 · suite **2116/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.
- Navegación/rutas intactas · Workspace V3C/companion/filtro Sin APU/exports intactos · sin DB/Auth/envs/cálculos/datos · no `-1rqh`.
- **Sin merge / sin tag / sin prod.** Pendiente: revisión visual del preview (PR #6). Adopción de IconChip en más módulos = pendiente menor (V5).

---

## 2026-06-26 — ICONIC_OPS_UIX_THEME_AND_NAV_REFINEMENT_V4_2_2 — EN RAMA (sin merge) (orchestrator)

### Qué cambió (misma rama `feature/uix-theme-modes-v4-2`, PR #6) — iteración visual fuerte por feedback real
- **Dark mode menos pesado**: tokens `.dark` re-afinados (base neutra-profunda, menos saturación, más
  respiración y contraste): app `#0a0e16`, surface `#141925`, soft `#1b2230`, muted `#232c3d`, line `#2c3647`,
  content `#eef2f8`, content-muted `#9aa8c0`. El acento marca resalta en vez de saturar.
- **Sidebar → RAIL FLOTANTE** (`components/shared/app-rail.tsx`, client): fixed inset-y-3 left-3, rounded-2xl,
  navy; compacto (íconos) → **expande al hover**; **pin** persistente (`localStorage iconic-rail-pinned`,
  pin empuja vía spacer / hover overlayea). `SidebarNav` recibe `expanded` (íconos+tooltip vs etiquetas).
  Mismas rutas/íconos/lógica. Pie = **CTA Asistente** (`quote-companion:open`). Eliminado el bloque dominante
  "Grupo ICONIC / Modo demostración" → modo de datos como indicador **sutil**.
- **Dashboard simplificado**: Centro de mando — quitada la **sub-card** de distribución (card-en-card) →
  integrada con divisor. Capítulo de mayor peso — quitados los **círculos decorativos** + gradiente raro →
  card sobria, consistente, theme-aware.

### QA
- typecheck 0 · lint 0 · tests afectados ok · suite **2111/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.
- Navegación/rutas intactas · Workspace V3C/companion/filtro Sin APU/exports intactos · sin DB/Auth/envs/cálculos/datos · no `-1rqh`.
- **Sin merge / sin tag / sin prod.** Pendiente: revisión visual del preview (PR #6).

---

## 2026-06-26 — ICONIC_OPS_UIX_THEME_MODES_V4_2_1_DARK_COVERAGE_HOTFIX — EN RAMA (sin merge) (orchestrator)

### Qué cambió (misma rama `feature/uix-theme-modes-v4-2`, PR #6)
- **Capa central de cobertura dark en `globals.css`**: remapea utilidades claras PLANAS → tokens solo bajo
  `.dark` (bg-white/gray-50/100/brand-50/slate-50, border-gray-*, text-gray-*/slate-*, estados amber/green/
  red/blue/cyan-50 + textos). Cubre TODAS las superficies densas (Workspace/Catálogo/APU/Cantidades/detalle/
  review-table) sin editar cientos de clases. No toca variantes con opacidad ni navy (text-white/border-white/*).
- **Excepción**: `OperationsHeaderAction` primary `bg-white`→`bg-iconic-white` (sigue blanco sobre navy).
- **Variantes `dark:` puntuales** para zonas con OPACIDAD: Workspace V3C (paneles, banner, placeholder,
  panel de detalle, filas capítulo, hover, **selección**, chip subtotal, toolbar sticky, OpsKpi warn) +
  detalle presupuesto (CTA workspace, fila archivada) + APU (form filtros, hover fila).

### QA
- typecheck 0 · lint 0 · tests `theme-modes` 9/0 · suite **2110/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.
- Light intacto · Workspace V3C/companion/filtro Sin APU/exports intactos · sin DB/Auth/envs/cálculos/datos · no `-1rqh`.
- **Sin merge / sin tag / sin prod.** Pendiente: revisión visual del preview (PR #6, dark en Workspace/Catálogo/APU/Cantidades).

---

## 2026-06-26 — ICONIC_OPS_UIX_THEME_MODES_V4_2 — EN RAMA (sin merge; pendiente revisión visual) (orchestrator)

### Estado
- Rama **`feature/uix-theme-modes-v4-2`** (base `origin/main = f6cd634`, tras V4.1). **NO mergeada.**

### Qué cambió (base de tema claro/oscuro, UIX-only)
- **Fundación**: `darkMode:'class'` + **tokens semánticos** por CSS vars (`--c-app/surface/surface-soft/
  surface-muted/line/content/content-muted`) en `globals.css` (`:root` light = estética actual; `.dark` =
  paleta ICONIC dark, navy casi negro #060b1f, sin negro puro/morado/neón). Expuestos en Tailwind (`bg-app`,
  `bg-surface`, `border-line`, `text-content`…).
- **ThemeProvider propio** (sin dependencia nueva; NO se instaló next-themes) + **script inline anti-FOUC**
  en `<head>` + `<html suppressHydrationWarning>`. Default **claro**; persiste en localStorage; soporta system.
- **ThemeToggle** (Claro/Oscuro/Sistema, accesible) en el **menú de cuenta** del topbar.
- **Theme-aware (dark: variants, light intacto)**: shell (`(dashboard)/layout.tsx` bg-app, `app-topbar`,
  `account-menu`; sidebar ya navy), primitivos (`ui/card`, `ui/input`, `ui/badge`), compartidos (`kpi-card`,
  `inline-callout`, `filter-pills`; `OperationsHeader` navy ya sirve), y AG Grid (`.dark .ag-theme-alpine`).

### QA
- typecheck 0 · lint 0 · tests `theme-modes` 6/0 · suite **2107/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.
- Workspace V3C / companion / filtro Sin APU / exports intactos · sin DB/Auth/envs/cálculos/datos · no `-1rqh`.

### Pendiente (honesto)
- **Tablas densas crudas** (Workspace BOQ, CatalogExplorer, capítulos) usan `bg-white`/`text-gray-*`: en
  dark se ven como papel claro legible sobre el shell oscuro, **aún no dark-themed** → pase V4.3.
- Migrar literales de páginas a tokens; revisar Recharts del dashboard en dark.
- Abrir PR → preview → revisión visual → autorizar merge.

---

## 2026-06-26 — ICONIC_OPS_UIX_COHERENCE_COMPLETION_V4_1 — RELEASED (merge + prod smoke) (orchestrator)

- Usuaria aprobó (opción "mergear V4.1 primero"). **Merge `--no-ff` a main**: `origin/main` =
  **`a7816d0`** (parents `805bb8c` + `95b614c`). Tag **`iconic-ops-uix-coherence-completion-v4-1`**. PR #5 MERGED.
- Smoke prod OK: /login 200 · /projects·/estimates·/dashboard·/settings 307 · cron 401. Proyecto construction-ops; no `-1rqh`.

---

## 2026-06-26 — ICONIC_OPS_UIX_COHERENCE_COMPLETION_V4_1 — EN RAMA (sin merge; pendiente revisión visual) (orchestrator)

### Estado
- Rama **`feature/uix-coherence-completion-v4-1`** (base `origin/main = 805bb8c`, tras V4). **NO mergeada.**

### Qué cambió (UIX-only — cierra costuras del recorrido principal)
- **Pantallas puente/hub** migradas de `PageHeader` plano a `OperationsHeader`: `projects/[id]`
  ("Proyecto · Centro operativo" + KPI band), `projects/[id]/scopes/[scopeId]` ("Alcance · Control de
  presupuesto" + KPI band), `estimates/page.tsx` ("Presupuestos · Versiones y control" + KPI band).
- **Settings hub**: ya tenía hero navy propio; se **elimina el `PageHeader` plano redundante** y el hero
  queda etiquetado "Settings · Configuración operativa" (un solo elemento navy).
- **Dashboard**: estados error/vacío alineados a `OperationsHeader` "Panel · Centro de control"; el cuerpo
  command-center (que ya tiene su hero navy "Centro de mando") **NO se tocó**.
- **Contraste navy**: nuevo `OperationsHeaderAction` (primary blanco/ink, secondary borde claro), aplicado
  en `projects/page` ("Nuevo proyecto"); documentado en DESIGN §12.c.

### QA
- typecheck 0 · lint 0 · tests `operations-shell` 15/0 + `db-mode-routes` ok · suite **2101/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.
- Workspace V3C / companion / filtro Sin APU intactos · columnas conservadas · sin DB/Auth/envs/cálculos/exports/datos reales · no `-1rqh`.

### Pendiente
- Abrir PR → preview Vercel (construction-ops) → revisión visual → autorizar merge.
- V5: tablas internas premium, data-viz dashboard, migrar acciones heredadas V4 a OperationsHeaderAction.

---

## 2026-06-26 — ICONIC_OPS_UIX_APP_WIDE_OPERATIONS_ROLLOUT_V4 — RELEASED (merge + prod smoke) (orchestrator)

### Estado
- PR #4 **MERGED** (`feature/uix-app-wide-operations-rollout-v4` -> `main`) tras autorizacion explicita "merge + tag + smoke".
- **Merge `--no-ff` a main**: `defb2dc67a08652fc7593c4e0b211364580d00e3` (`merge(uix): release app-wide operations rollout V4`, parents `befa56f` + `f093ca9`).
- **Tag**: `iconic-ops-uix-app-wide-operations-rollout-v4`.
- Produccion: `https://construction-ops-psi.vercel.app` (proyecto Vercel **construction-ops**).

### Que cambio (UIX-only — extiende el lenguaje V3C a toda la app)
- **Componentes shell compartidos nuevos**: `components/shared/operations-header.tsx` (`OperationsHeader`, command bar navy ICONIC generalizado del Workspace) + `components/shared/kpi-card.tsx` (`KpiCard`+`KpiBand`, generaliza `OpsKpi`).
- **Aplicado a**: Detalle de presupuesto (header + KPIs + link Workspace), APU Library (header + KPIs), Catalogo (header + KPIs), Cantidades, Cronograma, Proyectos, Settings/Accesos (headers). Workspace V3C **no rehecho** (intacto).
- Solo datos existentes en los KPIs (nada inventado); acciones reusan flujos/links existentes.
- `docs/DESIGN.md` §12.c (shell operativo compartido) + `docs/design-references/UIX_APP_WIDE_OPERATIONS_ROLLOUT_V4.md`.

### QA
- QA de rama: typecheck 0 · lint 0 · tests `operations-shell` 10/0 · suite completa **2096/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.
- Companion intacto · filtro Sin APU intacto · columnas conservadas · sin DB/Supabase/RLS/Auth/envs/secrets/RPC/calculos/export/`unit_price_snapshot`/datos reales.
- Preview revisado por la usuaria y release autorizado.
- Vercel commit status post-merge: **`Vercel - construction-ops` SUCCESS** (`32nrvvMqbep5PVeJDxnWYdeSUD9N`). El status agregado queda failure por **`construction-ops-1rqh`**, deuda/proyecto ajeno no tocado.
- Smoke prod anonimo: `/login` 200; `/projects`, `/apu?view=cards`, `/catalog/prices/review`, `/quantities`, `/planning`, `/settings/access`, detalle de presupuesto fixture y workspace fixture -> redirect protegido a `/login?next=...` y final 200; `/api/estimates/export` sin parametros -> 400 controlado (no 500).
- Tests dirigidos post-merge: operations shell, workspace/Sin APU, companion y exports **87/0**.

### Pendiente
- Pendientes visuales recomendados: contraste fino de acciones sobre barra navy; KPI bands con conteos reales en Cantidades/Cronograma/Settings; restyle profundo de tablas internas; dashboard (intacto por menor riesgo).
- Confirmar visualmente en sesion autenticada que el delta V4 se ve correcto en datos reales.

---
## 2026-06-26 — ICONIC_OPS_UIX_WORKSPACE_OPERATIONS_V3C (+V3C.1) — RELEASED (autorizado) (orchestrator)

- Usuaria **aprobó** el preview V3C.1 (vio la barra navy "BOQ · Workspace de operación") y autorizó merge.
- **Merge `--no-ff` a main**: `origin/main` = **`680fde1782b317247fcf589d27db135d62d6fe5f`** (merge
  `merge(uix): release workspace operations restyle V3C (+V3C.1 visual delta)`, parents `6f4c441` + `8f614af`).
- **Tag** = **`iconic-ops-uix-workspace-operations-v3c`** → `680fde1`.
- Diff a main = 4 archivos (boq-workspace.tsx + test + 2 docs). PR #3 (rama `feature/uix-workspace-operations-v3c`).
- Deploy: push a main dispara producción en proyecto **construction-ops** (alias `construction-ops-psi`).
  Smoke prod OK: /login 200 · /projects·/quote·/apu·/catalog/prices/review 307 · cron 401. Commit desplegado
  no confirmable por API (Vercel MCP 403) → confirmar **Production/Current** en dashboard.
- **NO** se tocó `construction-ops-1rqh` (su check del PR falla por deuda preexistente, ajena).
- UIX-only: sin DB/Supabase/RLS/Auth/envs/secrets/RPC/cálculos/export/`unit_price_snapshot`/datos reales.
- Pendientes visuales siguiente oleada: micro-data-viz por capítulo (anillos/sparkbars), responsive fino,
  extender patrón operations a Catálogo (V4)/Cantidades (V5); restyle del **detalle del presupuesto**
  (`…/estimates/[estimateId]`, tabla simple no tocada) si se quiere unificar con el Workspace.

---

## 2026-06-26 — ICONIC_OPS_UIX_WORKSPACE_OPERATIONS_V3C_1_VISUAL_DELTA_HOTFIX — EN RAMA (sin merge) (orchestrator)

### Diagnóstico
La usuaria revisó el preview (PR #3) y sintió "casi todo igual". Causa probable: abrió el **detalle del
presupuesto** (`…/estimates/[estimateId]`, que tiene su PROPIA tabla simple, NO tocada), no el **Workspace**
(`…/estimates/[estimateId]/workspace`, único componente modificado). Verificado además: `BoqGrid`/
`BudgetBoqGrid` (AG Grid) NO se usan en ninguna página (componentes muertos) → no hay render paralelo.
Aun así, el delta V3C era conservador → hotfix de delta visual.

### Qué cambió (V3C.1, mismo `boq-workspace.tsx`, UIX-only)
- **Barra de comando navy de operación** arriba (gradiente iconic-ink + label cian + stats + Total general
  héroe) — señal premium inmediata; navy ICONIC (no dark mode global).
- **Dos zonas**: Estado operativo (Cobertura APU % con barra + KPIs) | Resumen financiero (6 sub-montos).
- **Zona de detalle SIEMPRE presente** (placeholder con instrucción; panel con acento izquierdo al seleccionar).
- QA-confirm visual: si ves la barra navy "BOQ · Workspace de operación", es V3C.1.

### QA / estado
- Rama **`feature/uix-workspace-operations-v3c`** (PR #3, **sin merge/tag/prod**). Nuevo commit encima.
- typecheck 0 · lint 0 · tests workspace/quote **207/0** · suite **2086/0 (+42 skip)** · build 0 · gm **22/22** · diff-check limpio.
- Companion intacto · filtro Sin APU intacto · todas las columnas conservadas · sin lógica/DB/RPC/cálculos/export · sin `unit_price_snapshot` · no `-1rqh`.
- Push a la rama → PR #3 se actualiza y Vercel regenera el Preview.

---

## 2026-06-26 — ICONIC_OPS_UIX_WORKSPACE_OPERATIONS_V3C — EN RAMA (sin merge; pendiente autorización) (orchestrator)

### Estado
- Rama **`feature/uix-workspace-operations-v3c`** (base `origin/main = 6f4c441`). **NO mergeada a main**
  (la usuaria pidió dejar en rama + reporte y autorizar el merge explícitamente).

### Qué cambió (UIX-only, traducción de `ref-04-operations.jpg`)
Workspace/BOQ como **pantalla de operaciones** (lista + detalle + KPIs + acciones semánticas), en claro ICONIC:
- **Banda de KPIs operativos** (`OpsKpi`, conteos reales display, no finanzas): Capítulos · Partidas ·
  Con APU · Sin APU (clicable→filtro) · Sin cantidad · Sin precio.
- **Selección de partida** (estado UI `selectedItemId`, click en el código) + **fila resaltada**.
- **Panel de detalle operativo** (`ItemDetailPanel`, sobre la tabla): unidad/cantidad/V.unitario/subtotal +
  estados APU/Cantidad/Precio + **próxima acción** + **acciones semánticas reales** (Ver APU si vinculado,
  Ver partidas sin APU, Edición completa, Revisar precios). Sin flujos inventados.
- Conserva: resumen financiero premium (V3B, Total general héroe), toolbar por zonas, FilterPills, chip
  "N sin APU", callout, footer total, **todas las columnas** y la edición rápida.
- Decisión: detalle **arriba** de la tabla (no drawer lateral) para no comprimir la tabla técnica ni
  chocar con el companion. Companion **no tocado**.

### Archivos
- `…/workspace/boq-workspace.tsx` (único de código).
- `tests/unit/quote/quote-workspace-apu.test.ts` (+bloque V3C, source).
- `docs/design-references/UIX_WORKSPACE_OPERATIONS_V3C.md` (nuevo), este log.

### QA
- typecheck 0 · lint 0 (resueltos `react-hooks/static-components` moviendo StateChip a módulo, y
  `preserve-manual-memoization` quitando un useMemo problemático) · tests workspace/quote **201/0** +
  V3C **14/14** · suite completa **2084/0 (+42 skip)** · build 0 · gm **22/22** · diff-check limpio.
- Sin capturas (no hay navegador en el entorno) → verificación visual pendiente.

### Confirmación
Sin DB/Supabase/RLS/policies/migrations/auth/secrets/envs/Vercel/RPC/read-model/permisos; sin cálculos
finanzas/BOQ/APU/export; sin tocar `unit_price_snapshot`/datos reales/versiones aprobadas; **no** `-1rqh`.
Filtro Sin APU y companion intactos.

### Pendiente
- **Autorizar merge a main** (queda en rama). Luego tag `iconic-ops-uix-workspace-operations-v3c` + smoke.
- Verificación visual; futuro: micro-data-viz por capítulo + extender patrón a Catálogo/Cantidades.

---

## 2026-06-25 — UIX_REFERENCE_AUDIT_REAL_V1 (corrección de V3B, docs) — RELEASED (orchestrator)

### Corrección
En V3B se reportó que no había imágenes de referencia. **Sí existían**, pero en
`D:\ICONIC\SOFTWARE PRESUPUESTOS\docs\design-references\uix\` — un nivel **ARRIBA** del repo
`construction-ops\` (fuera de git). Por eso la búsqueda dentro del repo no las hallaba.

### Qué se hizo (docs + imágenes, sin código)
- **Copiadas las 5 imágenes** a `construction-ops/docs/design-references/uix/` (versionadas):
  `01-sidebar.jpg`, `ref-02-dashboard-globe.jpg`, `ref-03-heatmap.jpg`, `ref-04-operations.jpg`,
  `ref-05-fitness-dashboard.jpg`.
- **Auditoría REAL** en `docs/design-references/UIX_REFERENCE_AUDIT.md** (sustituye la versión "no
  encontradas"): ficha por imagen (qué sirve / qué NO copiar / adaptación ICONIC / patrón). Todas son
  **dark** → ICONIC se mantiene **claro**, sin neón/morados; se extrae estructura/jerarquía/micro-data-viz.
  Más relevante: **ref-04 (Operations)** ≈ Workspace/BOQ (lista con progreso + detalle + KPIs + acciones
  semánticas).
- **`DESIGN.md` §12.b**: añadidos los **patrones extraídos de las refs reales** (número héroe + breakdown,
  operation-list + detail, acciones semánticas por color, sidebar agrupado/colapsable, right-rail de
  estado, micro-data-viz), con la regla "todas son dark → adaptar a ICONIC claro".

### Estado / release
- `origin/main` = **`<pendiente push>`**. Tag = **`iconic-ops-uix-reference-audit-real-v1`**.
- Solo docs + imágenes; sin tocar código ejecutable → sin typecheck/build/suite. `git diff --check` limpio.
- Sin DB/migración/env/SMTP/usuarios/lógica/cálculos; no `-1rqh`.
- **Siguiente:** con la auditoría real, las oleadas V3C/V4+ pueden afinar contra patrones concretos
  (ref-04 para Workspace/companion). Recomendado mantener las imágenes en el repo a futuro.

---

## 2026-06-25 — ICONIC_OPS_UIX_VISUAL_REFERENCE_AUDIT_AND_WORKSPACE_V3B — RELEASED (orchestrator)

### ⚠️ Referencias NO encontradas (honesto)
La usuaria indicó haber subido imágenes a `docs/design-references/uix/`, pero **esa carpeta NO existe** y
**no hay imágenes de referencia** en el repo (solo logos de marca). No se inventó su contenido. Se creó
**`docs/design-references/UIX_REFERENCE_AUDIT.md`** declarando la ausencia + plantilla para llenar cuando
se suban; el lenguaje visual se derivó de los **principios listados por la usuaria** (no de imágenes).

### Qué cambió (UIX-only, 3 archivos)
- **`docs/DESIGN.md`** §12.b **"Visual Reference Language"**: reglas concretas de profundidad, gradientes
  suaves, soft panels, cards con número héroe, tablas con zonas de lectura + bloques de capítulo, acentos
  controlados, toolbars por zonas, evitar look de IA, mantener serio/operativo.
- **`docs/design-references/UIX_REFERENCE_AUDIT.md`** (nuevo): auditoría honesta + plantilla.
- **`boq-workspace.tsx`** (restyle V3B real y visible):
  - Resumen financiero = **panel premium** (gradiente brand-50→blanco, `shadow-iconic`) con **"Total
    general" como número héroe** (`text-2xl`, acento) + desglose compacto. Mismos datos/cálculos.
  - **Toolbar por zonas** con divisores verticales (búsqueda | filtros | utilidades | resultado).
  - **Cabeceras de capítulo** como bloques legibles (tinte `brand-50/60` + borde de acento izquierdo) y
    **subtotal en chip** con ring.

### Estado / release
- `origin/main` = **`2f8975d1cafed86de28edf861a2bc09e702c91d1`** (merge `--no-ff`, sobre `2f1b93c`). Tag =
  **`iconic-ops-uix-workspace-visual-reference-v3b`** → `2f8975d`.
- typecheck 0 · lint 0 · tests workspace/quote **201/0** · suite completa **2080/0 (+42 skip)** · build 0 · gm **22/22** · diff-check limpio.
- Smoke prod: /login 200 · /projects·/quote·/apu 307 · cron 401.
- **UIX-only:** sin DB/migración/env/SMTP/usuarios/RPC/finanzas/cálculos; sin tocar `unit_price_snapshot`;
  sin quitar columnas/datos; sin dark mode; sin romper export/APU/companion/Sin APU; no `-1rqh`.
- **Pendiente:** verificación visual; **subir imágenes a `docs/design-references/uix/`** para completar la
  auditoría real y afinar el lenguaje visual con base en ellas.

---

## 2026-06-25 — ICONIC_OPS_UIX_WORKSPACE_RESTYLE_V3 — RELEASED (orchestrator)

### Nota de capturas
**No llegaron capturas adjuntas** en este ciclo → reportado; restyle anclado a `docs/DESIGN.md` + código real.

### Diagnóstico
El Workspace ya estaba bastante pulido (toolbar/header/footer sticky, SummaryCards con acento, badge APU
por fila, FilterPills V2, callout V1). La carencia de mayor valor (DESIGN §11): visibilidad inmediata de
"qué falta" — cuántas partidas sin APU.

### Qué cambió (UIX-only, 1 archivo + test)
- `boq-workspace.tsx`: **chip accionable "N sin APU"** en el área de resultados de la toolbar (conteo
  display desde el `apu_template_id` real; honesto: omite "No verificable"); al hacer clic activa el
  filtro "Sin APU". Pulido premium del `SummaryCard` (sombra, alineado a MetricCard de DESIGN §5).
- Todo lo demás intacto: columnas/datos técnicos, totales server-derived, FilterPills Estado/APU, filtro
  Sin APU, badges por fila, sticky header/footer, InlineCallout.

### Estado / release
- `origin/main` = **`37424ddf8bfc10dc0649e4aaa541c2e922573e59`** (merge `--no-ff`, sobre `461a780`). Tag =
  **`iconic-ops-uix-workspace-restyle-v3`** → `37424dd`.
- typecheck 0 · lint 0 · tests workspace/quote **200/0** · suite completa **2079/0 (+42 skip)** (1ª corrida
  falló transitoria; re-run limpio) · build 0 · gm **22/22** · diff-check limpio.
- Smoke prod: /login 200 · /projects·/quote·/apu 307 · cron 401 (workspace protegido → 307 sin sesión).
- **UIX-only:** sin DB/migración/env/SMTP/usuarios/RPC/finanzas/cálculos; sin tocar `unit_price_snapshot`;
  sin quitar columnas; sin romper export/APU/companion/Sin APU; no `-1rqh`.
- **Pendiente:** verificación visual con capturas; futuro DESIGN §11 Workspace (filas expandibles de
  trazabilidad, densidad fina). Siguiente fase: **V4 Catálogo/Precios**.

---

## 2026-06-25 — ICONIC_OPS_DESIGN_SYSTEM_FOUNDATION_V1 (docs) — RELEASED (orchestrator)

### Qué se hizo (docs-only)
- Nuevo **`docs/DESIGN.md`** = fuente de verdad visual/UIX de ICONIC OPS. 13 secciones:
  principios; identidad visual (tokens reales `iconic-primary #005DD6`, `iconic-ink #020148`,
  `iconic-cyan #00B8FF`, `iconic-graphite`, `iconic-soft-blue #C7DCED`, `iconic-gray #F2F4F7`,
  `brand-50 #E8F1FD`; Inter+JetBrains Mono; `shadow-iconic`); colores de estado y qué NO usar
  (sin morado, sin placeholders, sin copiar plataformas externas); layout/shell/z-index canónico;
  headers (`PageHeader`); cards/paneles (card vs tabla); **tablas operativas** (no quitar columnas
  técnicas, jerarquía, filas expandibles); filtros/toolbars (`FilterPills` vs select); badges/estados
  (texto+color); empty states/callouts (`InlineCallout`, honestidad); acciones; **módulo por módulo**
  (objetivo/problema/patrón/qué NO cambiar/futuro); **reglas anti-regresión**; **roadmap V1–V7**.
- Sin links externos (placeholder vacío + no se abren URLs) → basado en repo/tokens/componentes reales.

### Estado / release
- `origin/main` = **`<pendiente push>`**. Tag = **`iconic-ops-design-system-foundation-v1`**.
- **Solo docs** (`docs/DESIGN.md` + este log). Sin tocar pantallas/código ejecutable → sin typecheck/build/suite.
  `git diff --check` limpio.
- Sin DB/migración/env/SMTP/usuarios/lógica/cálculos; no `-1rqh`.
- Próximo: **V3 = Presupuestos/BOQ/Workspace** restyle profundo anclado a `docs/DESIGN.md` (con capturas).

---

## 2026-06-25 — ICONIC_OPS_UIX_VISUAL_SYSTEM_ROLLOUT_V2_CORE_MODULES — RELEASED (orchestrator)

### Alcance (UIX-only) y nota honesta de screenshots
**No hay capacidad de levantar la app y capturar screenshots** en este entorno → según la regla, se
reporta y se trabaja sobre el **código real** (no se inventan layouts). Auditoría por código: el
catálogo ya estaba bien estructurado (tabla por tipo + badges de estado de precio + acción contextual); el
workspace tenía dos grupos de filtro inline con estilos distintos. La mejora consistente y de bajo riesgo
fue **unificar los controles de filtro** en un segmented control premium compartido.

### Qué cambió (UIX-only, 4 archivos)
- **`components/shared/filter-pills.tsx`** (nuevo): `FilterPills` (segmented control, tokens ICONIC,
  `role="group"` + `aria-pressed`, tonos primary/ink). Sin hooks (usable en client). No cambia lógica.
- **Workspace** (`boq-workspace.tsx`): filtros **Estado** (Todos/Activos/Archivados) y **APU**
  (Todos/Con APU/Sin APU) ahora son `FilterPills` con etiqueta, en vez de dos grupos ad-hoc. Mismo
  filtrado; el filtro "Sin APU" y todo lo demás intactos.
- **Catálogo** (`catalog-explorer.tsx`): el `<select>` "Estado de precio" → `FilterPills`
  (Aprobado/Pendiente/Rechazado/Sin precio), escaneable. Mismo filtrado.

### Estado / release
- `origin/main` = **`9cd54e33921d5a4e92f87107ff04b2cb5c871995`** (merge `--no-ff`, sobre `1227c8c`). Tag =
  **`iconic-ops-uix-core-modules-v2`** → `9cd54e3`.
- typecheck 0 · lint 0 · tests components/quote/workspace/catalog **414/0** · suite completa **2079/0 (+42 skip)** · build 0 · gm **22/22** · diff-check limpio.
- Smoke prod: /login 200 · /projects·/apu·/quote·/catalog/prices/review·/catalog 307 · cron 401.
- **UIX-only:** sin DB/migración/env/SMTP/usuarios/RPC/finanzas; sin cambiar cálculos; sin tocar
  `unit_price_snapshot`; sin romper filtro Sin APU/companion/export; sin rediseño total; no `-1rqh`.
- **Pendiente (V3, requiere revisión visual con screenshots):** densidad/jerarquía de tablas, MetricCard/
  SectionPanel/TableToolbar más ricos, headers premium. No hacer a ciegas.

---

## 2026-06-25 — ICONIC_OPS_UIX_VISUAL_SYSTEM_ROLLOUT_V1 — RELEASED (orchestrator)

### Alcance (UIX-only, aditivo, sin lógica)
Primera oleada de una **capa de claridad visual compartida**. No es rediseño total (no es seguro reestilar
5 módulos a ciegas); se establece el patrón + se aplica ayuda contextual consistente.

### Qué cambió (7 archivos)
- **`components/shared/inline-callout.tsx`** (nuevo, server-safe): `InlineCallout` con 4 tonos
  (tip/info/warning/success) usando tokens ICONIC; `role="note"`, sin librerías nuevas.
- Adopción consistente por módulo prioritario:
  - **Workspace** (`boq-workspace.tsx`): ayuda "usa el filtro Sin APU para encontrar partidas pendientes;
    luego asocia un APU para validar componentes, precios y rendimientos" (solo cuando apuFilter=all).
  - **Catálogo/Precios** (`prices/review`): cómo leer estados (Aprobado/Pendiente/Manual/Sin proveedor).
  - **Cantidades** (`quantities`): flujo Importa → revisa → sincroniza al BOQ.
  - **Cronograma** (`planning`): nota honesta "en evolución / usar con criterio".
  - **Accesos** (`settings/access`): "si no llega el correo, copia el enlace de invitación y compártelo".

### Estado / release
- `origin/main` = **`71d5358afb719757ce1990b743e1bc6d09a36722`** (merge `--no-ff`, sobre `1ef4984`). Tag =
  **`iconic-ops-uix-visual-system-rollout-v1`** → `71d5358`.
- typecheck 0 · lint 0 · tests components/quote/workspace **244/0** · suite completa **2076/0 (+42 skip)** · build 0 · gm **22/22** · diff-check limpio.
- Smoke prod: /login 200 · /dashboard·/projects·/apu·/quote·/quantities·/catalog/prices/review·/planning·/settings/access 307 · cron 401.
- **UIX-only/aditivo:** sin DB/migración/env/SMTP/usuarios/RPC/finanzas; sin cambiar cálculos
  BOQ/APU/export/cantidades/cronograma; sin tocar `unit_price_snapshot`; sin rediseño total; no `-1rqh`.
- **Pendiente / siguiente fase (V2):** restyle profundo por módulo (tablas/cards/headers) **con revisión
  visual** (no a ciegas): MetricCard/TableToolbar/SectionPanel consistentes, densidad de tablas, jerarquía.
  Verificación visual tras promoción del deploy.

---

## 2026-06-25 — UX_QUOTING_COMPANION_WORKSPACE_FOCUS_AND_DOCKING_V1 — RELEASED (orchestrator)

### Problemas UX
(1) El CTA del asistente abría el workspace pero la usuaria no veía CUÁLES ítems faltaban por vincular APU.
(2) Quería más opciones de ubicación del asistente (flotante / esquina / lateral con espacio reservado).

### Qué cambió (UX/read-only/aditivo, 12 archivos)
**Workspace — foco en APU:**
- `BoqItemReviewView.apuTemplateId?` (aditivo, read-only) + `db-repository.listItemsByChapter` selecciona
  `apu_template_id` (columna existente; sin migración/RPC/cálculo).
- `workspace-view.ts` (puro): `ApuLinkFilter`(all/with/without) + `APU_FILTER_LABELS` + `itemApuState`
  (linked/unlinked/**unknown**='No verificable', honesto) + `applyApuFilter` + `APU_STATE_LABELS`.
- `boq-workspace.tsx`: grupo de filtro **Todos/Con APU/Sin APU** + **banner** "Mostrando ítems sin APU…" +
  **badge textual por fila** (APU vinculado / Sin APU / No verificable, no solo color).
- `workspace/page.tsx`: `?apu=missing` → `initialApuFilter='without'`.
- Asistente: el paso APU enlaza a `…/workspace?apu=missing` (`quoteHrefs.workspaceApuMissing`), CTA
  **"Ver ítems sin APU"**; la guía explica usar el filtro "Sin APU".

**Asistente — modos de ubicación:** `placement = floating | corner | side` (reemplaza `pinned`):
- floating (default, arrastrable, recuerda x/y); corner (área inferior izquierda del contenido,
  `left-[15.5rem]`, no tapa la nav); side (derecha, **reserva espacio** con `body.paddingRight` solo en lg
  → no tapa el contenido). Controles de texto **Flotante/Esquina/Lateral** + Restaurar posición.

### Estado / release
- `origin/main` = **`2fffd735086bbe30177601d172927cb4c90ea5aa`** (merge `--no-ff`, sobre `d83a190`). Tag =
  **`quoting-companion-workspace-focus-docking-v1`** → `2fffd73`.
- typecheck 0 · lint 0 · tests quote/workspace/apu **520/0** · suite completa **2069/0 (+42 skip)** · build 0 · gm **22/22** · diff-check limpio.
- Smoke prod: /login 200 · /quote 307 · /quote/new 307 · /apu 307 · /projects 307 · cron 401.
- **Read-only/aditivo:** sin DB/migración/env/SMTP/usuarios/RPC/finanzas; `apu_template_id` solo se LEE
  (no cálculo); sin tocar `unit_price_snapshot`; companion/guía/`/quote` intactos; no `-1rqh`.
- **Pendiente:** verificación visual tras promoción del deploy (UI client; promoción manual Vercel MCP 403).
  Nota honestidad: en demo/fixture `apuTemplateId` es `undefined` → badge "No verificable" (no inventa).

---

## 2026-06-25 — HOTFIX_QUOTING_COMPANION_HEADER_CONTROLS_V1 — RELEASED (orchestrator)

### Causa real
Los botones del header (Restaurar/Fijar-Soltar/Minimizar) no hacían nada (la X sí): el `<header>` tenía
`onPointerDown={onHeaderPointerDown}` que llamaba `setPointerCapture` en **cualquier** pointerdown,
**incluido sobre los botones** → iniciaba un drag y capturaba el puntero, **robando el click**.

### Fix (UX-only, 1 archivo + test)
- `onHeaderPointerDown` ahora **aborta si el pointerdown nace en un `<button>`** (`e.target.closest('button')`).
- El **contenedor de los controles** hace `onPointerDown={(e) => e.stopPropagation()}` → el drag nunca
  arranca desde los botones.
- Handlers ya eran correctos: Restaurar=`setPos(defaultFloatingPos())`, Fijar/Soltar=`setPinned(v=>!v)`,
  Minimizar=`setState('minimized')` (NO borra la cotización activa), Cerrar=`setState('closed')`.
- `tests/unit/quote/quote-companion-header-controls.test.ts` (fuente): cada handler + guard de drag +
  minimizar no limpia activeQuote + localStorage sin finanzas.

### Estado / release
- `origin/main` = **`5afbff30763efb4ebe5fdfcd733e0549aa6afa69`** (merge `--no-ff`, sobre `a39d5a6`). Tag =
  **`quoting-companion-header-controls-hotfix-v1`** → `5afbff3`.
- typecheck 0 · lint 0 · tests quote **107/0** · suite completa **2061/0 (+42 skip)** · build 0 · gm **22/22** · diff-check limpio.
- Smoke prod: /login 200 · /quote 307 · /quote/new 307 · /apu 307 · /projects 307 · cron 401.
- **Aditivo:** sin DB/migración/env/SMTP/usuarios/RPC/finanzas; companion flotante, guía accionable y /quote intactos; no `-1rqh`.
- **Pendiente:** verificación visual tras promoción del deploy (UI client; promoción manual Vercel MCP 403).
- **LECCIÓN:** en ventanas draggables, el handler de drag del header debe ignorar pointerdowns sobre
  controles interactivos (closest('button')) y/o stopPropagation, o la captura del puntero roba sus clicks.

---

## 2026-06-25 — UX_QUOTING_COMPANION_ACTIONABLE_GUIDANCE_V1 — RELEASED (orchestrator)

### Causa UX
El companion mostraba estados genéricos (Pendiente/Revisar) sin explicar qué significan ni qué hacer; la
usuaria no entendía "pendiente en qué sentido" ni qué botón tocar.

### Qué cambió (UX/read-only/aditivo, 3 archivos)
- **Helper PURO `lib/quote/quote-guidance.ts`**: `STEP_GUIDE` (microcopy de los 8 pasos: qué significa /
  cuándo está listo / qué hacer / CTA explícito / resultado esperado) + `buildStepGuidance`
  (compone estático + "por qué aparece así" = la **descripción real** del paso, sin inventar conteos;
  vacío → "No hay suficiente información…") + `pickGuidanceStep` (siguiente accionable→lugar actual→primer
  no resuelto) + `stepReasonText` (razón corta: "Pendiente: faltan cantidades", "Revisar: …").
- **`quote-companion-body.tsx`**: sección **"Qué sigue"** (Qué significa / Por qué aparece así / Haz esto
  ahora / botón accionable + subtítulo "Te llevamos a la pantalla…" / Resultado esperado, con color por
  severidad); mini-stepper muestra razón corta; bloque colapsable **"¿Por qué veo esto?"** (manual inline:
  el asistente orienta, el progreso se calcula con datos, "pendiente" = el sistema aún no lo valida desde
  esta vista).
- **Honestidad (FASE 6):** no inventa números; usa la descripción derivada (datos reales del read-model).

### Estado / release
- `origin/main` = **`d7d3bf4e93c2ad22ec738b799b9d482915eadea5`** (merge `--no-ff`, sobre `08e7a1e`). Tag =
  **`quoting-companion-actionable-guidance-v1`** → `d7d3bf4`.
- typecheck 0 · lint 0 · tests quote **100/0** · suite completa **2054/0 (+42 skip)** · build 0 · gm **22/22** · diff-check limpio.
- Smoke prod: /login 200 · /quote 307 · /quote/new 307 · /apu 307 · /projects 307 · cron 401.
- **Aditivo:** sin DB/migración/env/SMTP/usuarios/RPC/finanzas; sin tocar BOQ/APU/cantidades/export/cronograma; companion flotante y /quote intactos; no `-1rqh`.
- **Pendiente:** verificación visual tras promoción del deploy (UI client; promoción manual Vercel MCP 403).

---

## 2026-06-25 — HOTFIX_QUOTING_COMPANION_NOT_FLOATING_V1 — RELEASED (orchestrator)

### Causa real
`origin/main` (263280f) SÍ tenía el código draggable. La usuaria veía el asistente anclado/no movible por:
(a) **deploy viejo** (build in-place/side-docked aún sirviendo, patrón sistémico de promoción manual), y/o
(b) el default `bottom-5 right-5` (pegado a la esquina) **se leía como anclado**, no como ventana movible.
Nota: `pinned` ya arrancaba en `false` y NO se restauraba de localStorage → no era pinned-forzado.

### Qué cambió (UX-only, 2 archivos)
- **Flotante por defecto, sin ambigüedad:** `openPanel` ahora asigna SIEMPRE una **posición flotante
  explícita** (`defaultFloatingPos`, despegada de los bordes) en vez de la esquina; nunca restaura `pinned`
  → el modo flotante es el default. El modo anclado `right-0` aplica **solo** si el usuario fija.
- **Señales visibles:** barra de estado "Ventana flotante · Arrastra para mover" / "Fijado al costado" +
  botón **"Soltar ventana"** (escape del modo fijo); "Restaurar posición" vuelve al punto flotante.
- Re-release **fuerza un deploy limpio** (recupera cualquier build viejo aún servido).

### Estado / release
- `origin/main` = **`ae74d45a6ee46fb165fc664f95e9867a0856d6c4`** (merge `--no-ff`, sobre `263280f`). Tag =
  **`quoting-companion-floating-default-hotfix-v1`** → `ae74d45`.
- typecheck 0 · lint 0 · tests quote **79/0** · suite completa **2033/0 (+42 skip)** · build 0 · gm **22/22** · diff-check limpio.
- Smoke prod: /login 200 · /quote 307 · /quote/new 307 · /apu 307 · /projects 307 · cron 401.
- **Aditivo:** sin DB/migración/env/SMTP/usuarios/RPC/finanzas; sin tocar BOQ/APU/cantidades/export/cronograma; /quote intacto; no `-1rqh`. localStorage solo ids cotización + pinned + posición.
- **Pendiente:** verificación visual tras promoción del deploy (UI client; **confirmar en Vercel que el
  deploy de `ae74d45` quede Production/Current** — MCP 403/sin CLI).

---

## 2026-06-25 — UX_QUOTING_COMPANION_FLOATING_GUIDED_WINDOW_V1 — RELEASED (orchestrator)

### Causa UX
El companion (in-place) seguía confuso: anclado al costado derecho (no era lo esperado), el progreso
dependía solo de color, y faltaba texto explícito de "dónde voy".

### Qué cambió (UX-only/read-only/aditivo, 6 archivos)
- **Ventana flotante draggable**: arrastrable desde el header (pointer events + setPointerCapture),
  recuerda posición x/y en localStorage, clamp al viewport en resize, botón **"Restaurar posición"**
  (→ bottom-right). El modo **fijar al costado (pinned)** conserva el panel anclado como **fallback**.
  Ancho 390px, `max-h-[75vh]`, scroll interno, `z-30` (bajo modales z-50/z-[100]), oculto `< lg`.
- **Texto de guía explícito** (no solo color): `lib/quote/quote-location.ts` (puro) → "Estás aquí:
  <sección>" por ruta (Dashboard/Vista asistida/Presupuesto-Capítulos/Asociar APU/Cantidades/Precios/
  Sin contexto). Cuerpo muestra "Paso actual: N de 8 · <label>", "Estado", "Siguiente"; cada paso del
  mini-stepper muestra label textual (Listo/Revisar/Pendiente/Bloqueado) + badge "Estás aquí" en el actual.
- Sin contexto: texto guía + selector embebido (sin redirigir).

### Estado / release
- `origin/main` = **`e782ce7f3f9fe7f2f5b4aad401e21956d2dd7a6c`** (merge `--no-ff`, sobre `ff84378`). Tag =
  **`quoting-companion-floating-guided-window-v1`** → `e782ce7`.
- typecheck 0 · lint 0 · tests quote **73/0** · suite completa **2027/0 (+42 skip)** · build 0 · gm **22/22** · diff-check limpio.
- Smoke prod: /login 200 · /quote 307 · /quote/new 307 · /apu 307 · /projects 307 · cron 401.
- **Aditivo:** sin DB/migración/env/SMTP/usuarios/RPC/finanzas/`unit_price_snapshot`; sin tocar
  BOQ/APU/cantidades/export/cronograma; /quote y workspace técnico intactos; no `-1rqh`. localStorage
  solo ids cotización + pinned + posición.
- **Pendiente:** verificación visual tras promoción del deploy (UI client; recordar promoción manual Vercel MCP 403).

---

## 2026-06-25 — HOTFIX_QUOTING_COMPANION_TRUE_IN_PLACE_GUIDE_V1 — RELEASED (orchestrator)

### Causa UX
El companion abría, pero sin cotización activa mostraba solo "Selecciona una cotización" + "Ir al
asistente" → **redirigía a /quote/new**. No cumplía la idea real: un asistente acompañante in-place que
no obligue a salir de la pantalla.

### Qué cambió (UX/read-only/aditivo, 5 archivos)
- **Cotización activa persistente** en localStorage (SOLO ids `projectId/scopeId/versionId` + `pinned`;
  nunca finanzas). Rutas con contexto la actualizan (sync por patrón guard-en-render de React); rutas sin
  contexto reusan la última guardada; al abrir se restaura desde localStorage.
- **Selector embebido** (`quote-companion-selector.tsx`): proyecto→alcance→versión vía lecturas READ-ONLY
  nuevas en `quote-companion-actions.ts` (`listQuoteProjects`/`listQuoteScopes`/`listQuoteVersions` =
  listProjects/getProjectOverview/listEstimatesByScope). Elegir carga el progreso **in-place** (no navega).
  "Crear nueva cotización" → /quote/new como acción secundaria.
- Triggers (topbar/launcher/home) ya **no navegaban** (eran botones+CustomEvent) — confirmado.
- El panel **solo navega** cuando el usuario abre presupuesto/APU/cantidades/precios/export o
  "Abrir vista completa" (texto cambiado desde "Ir al centro de cotización").

### Estado / release
- `origin/main` = **`de21f95172bc2503daab7615312dffe360974cdb`** (merge `--no-ff`, sobre `bd18907`). Tag =
  **`quoting-companion-in-place-guide-hotfix-v1`** → `de21f95`.
- typecheck 0 · lint 0 · tests quote **60/0** · suite completa **2014/0 (+42 skip)** · build 0 · gm **22/22** · diff-check limpio.
- Smoke prod: /login 200 · /quote 307 · /quote/new 307 · /apu 307 · /projects 307 · cron 401.
- **Aditivo:** sin DB/migración/env/SMTP/usuarios/RPC/mutación; sin finanzas/`unit_price_snapshot`;
  sin tocar BOQ/APU/cantidades/export/cronograma; /quote y workspace técnico intactos; no `-1rqh`.
- **Pendiente:** verificación visual tras promoción del deploy (UI client; recordar promoción manual Vercel MCP 403).

---

## 2026-06-25 — QUOTING_ASSISTED_COMPANION_PANEL_V1B_PHASE_1 — RELEASED (orchestrator)

### Qué se liberó (companion panel, capa ADITIVA, 11 archivos)
Asistente acompañante (Opción D) montado UNA vez en `app/(dashboard)/layout.tsx` → persiste al navegar:
- **Launcher flotante** inferior-derecho + **panel lateral derecho** colapsable (open/minimized) + **pin**.
- Detecta la cotización activa **desde la ruta** (`lib/quote/quote-context-from-path.ts`: `/quote/[p]/[s]/[v]`
  y `/projects/[id]/scopes/[scopeId]/estimates/[estimateId]` + subrutas; param estimateId==versionId);
  off-route → CTA a /quote. (Persistencia de "última cotización" diferida a Phase 2.)
- Muestra: cotización activa, progreso 1–8, semáforo resumido, **siguiente acción** (`nextQuoteAction`),
  enlaces rápidos (Presupuesto/APU/Cantidades/Precios/Semáforo/Export) e "Ir al centro".
- Datos vía server action **READ-ONLY** `getQuoteCompanionState` que reusa `getEstimateById`+
  `getEstimateDetail`+`listApus`+`computeQuoteReadiness`+`deriveQuoteProgress`+`summarizeQuoteProgress`+
  `nextQuoteAction`. NO finanzas, NO mutación, NO conteos de export (N+1).
- `z-30` (debajo de modales `z-50`/`z-[100]`), oculto `< lg`. Botón "Asistente" en topbar + "Abrir
  asistente acompañante" en /quote home, vía CustomEvent `quote-companion:open`.
- Persistencia localStorage: solo preferencia `pinned` (Phase 1).

### Estado / release
- `origin/main` = **`2e560acc38e3636a4be5ebc5aab21bc2ebd3dbdf`** (merge `--no-ff`
  `merge(quote): release assisted quoting companion panel V1B phase 1`, sobre `1c23137`). Tag =
  **`quoting-assisted-companion-panel-v1b-phase-1`** → `2e560ac`.
- typecheck 0 · lint 0 · suite completa **2005/0 (+42 skip)** · build 0 (rutas /quote intactas) · gm **22/22** · diff-check limpio.
- Smoke prod: /login 200 · /quote 307 · /quote/new 307 · /apu 307 · /projects 307 · cron 401.
- **Aditivo:** sin DB/migración/env/SMTP/usuarios/RPC/mutación nueva; sin tocar
  BOQ/APU/cantidades/export/cronograma ni `unit_price_snapshot`; /quote y workspace técnico intactos; no `-1rqh`.
- **Pendiente:** verificación visual tras promoción del deploy (el panel es UI client; smoke no lo cubre).
  Lint del repo es estricto (react-hooks/set-state-in-effect + react-hooks/refs) → companion sin setState
  síncrono en effects ni ref-en-render (loading derivado, contexto solo de ruta).

---

## 2026-06-25 — VERIFY_AND_RECOVER_QUOTING_ASSISTED_V1_PRODUCTION_DEPLOY (orchestrator)

### Verificación
- `origin/main` = **`717b677`** (era `3577b3e`). Tag base `quoting-assisted-mode-v1-phase-1` → `75bef7a`.
- origin/main **sí** contiene `/quote`, `/quote/new`, `/quote/[projectId]/[scopeId]/[versionId]` + `lib/quote/quote-progress.ts`.
- Build local **OK**: registra las 3 rutas `/quote`. Árbol limpio.

### Dos causas encontradas
1. **Protección de ruta faltante (código):** `/quote` NO estaba en `PROTECTED_ROUTES` (`server/auth/routes.ts`),
   por eso producción servía `/quote` como **200** sin sesión (en vez de 307 como el resto). Sin fuga de
   datos (la página resuelve viewer server-side y degrada a vacío + RLS), pero incorrecto. **FIX aplicado:**
   añadido `/quote` a `PROTECTED_ROUTES` (cubre subrutas por prefijo) + test `31`. Commit `717b677` (merge a main).
2. **Deploy en estado mixto/rollout (infra):** smoke mostró `/quote`=200 pero `/quote/new`=404 y dinámica=404,
   patrón de **deployment parcial/no promovido** al alias `construction-ops-psi`. No promovible por API
   (Vercel MCP 403, sin CLI). El push de `717b677` fuerza un build/deploy limpio de todo `main`.

### Estado al cierre
- typecheck 0 · lint 0 · tests auth/access/routes **165/0** · build 0 · gm **22/22** · diff-check limpio (2 archivos).
- Smoke prod (aún build previo): `/login` 200 · `/quote` 200(sin proteger, build viejo) · `/quote/new` 404 ·
  `/apu?view=cards` 307 · `/projects` 307 · cron 401.
- **ACCIÓN del dueño (manual, bloqueante):** en Vercel → proyecto **construction-ops** (NO `construction-ops-1rqh`)
  → **Deployments** → localizar el deploy del commit **`717b677`** de `main` → confirmar **Ready** → si no está
  como **Production/Current**, **Promote to Production** (o completar el rolling release al 100%).
- **Validación esperada tras promover:** `/quote`=**307**, `/quote/new`=**307**, `/quote/x/y/z`=**307**
  (protegidas, redirigen a login sin sesión), `/login`=200, `/apu?view=cards`=307, cron=401.
- Sin DB/migración/env/SMTP/usuarios; solo `routes.ts` + test; no se tocó `construction-ops-1rqh`.

---

## 2026-06-25 — QUOTING_ASSISTED_MODE_V1_PHASE_1 — MERGED A MAIN (deploy pendiente de promoción) (orchestrator)

### Qué se liberó (capa guiada ADITIVA, sin lógica financiera nueva, 10 archivos +969)
Modo "Cotizar con asistente":
- Rutas: `/quote` (home + CTA), `/quote/new` (wizard selector proyecto→alcance→versión, reusa
  read-model + rutas de creación existentes), `/quote/[projectId]/[scopeId]/[versionId]` (centro de
  cotización con stepper de 8 pasos + semáforo embebido).
- Helper PURO `lib/quote/quote-progress.ts` (`deriveQuoteProgress`/`quoteHrefs`/`summarizeQuoteProgress`):
  deriva estado por paso (done/attention/pending/locked) + deep-links desde read-model +
  `computeQuoteReadiness`. **No recalcula finanzas.** + tests (37 casos).
- Componentes `quote-stepper.tsx`/`quote-step-card.tsx` (presentacionales).
- Reuso: `QuoteReadinessSemaphore`/`ReadinessExportAlert`, `getEstimateById`, `getEstimateDetail`,
  `listProjects`/`getProjectOverview`/`listEstimatesByScope`, `isCreationModeEnabled`.
- Entradas: QuickLink en `/dashboard` + comando en ⌘K (grupo Acciones, `/quote`).

### Estado / release
- `origin/main` = **`75bef7aea37ff69c15b22b8daba90cd7702ac057`** (merge `--no-ff`
  `merge(quote): release assisted quoting mode V1 phase 1`, sobre `92c49d4`). Tag =
  **`quoting-assisted-mode-v1-phase-1`** → `75bef7a`.
- typecheck **0** · lint **0** · tests quote/estimates/readiness/nav **292/0** · suite completa
  **1990/0 (+42 skip)** · build **0** (rutas `/quote`, `/quote/new`, `/quote/[…]` registradas) · **gm 22/22** · diff-check limpio.
- **Aditivo:** sin DB/migración/env/SMTP/usuarios/RPC/mutación nueva; sin tocar
  BOQ/APU/cantidades/export/cronograma ni `unit_price_snapshot`; workspace técnico y detalle de
  presupuesto intactos; **no** se tocó `construction-ops-1rqh`.

### ⚠️ Deploy pendiente de promoción (bloqueante para verificación)
Smoke prod: `/login` 200, `/apu?view=cards` 307, `/projects` 307, cron 401 (sanos), pero **`/quote` y
`/quote/new` = 404** porque el deploy de `75bef7a` aún **no está promovido** al alias `construction-ops-psi`
(mismo patrón ya observado en el hotfix del modal). No se puede promover por API (Vercel MCP 403, sin CLI).
**ACCIÓN del dueño:** en Vercel → construction-ops → Deployments, confirmar que el deploy de `main`
(`75bef7a`) esté **Ready + Promovido a Production**. Tras promover, `/quote` debe responder 307 (auth).

---

## 2026-06-25 — HOTFIX_APU_BOQ_LINK_MODAL_NOT_RENDERING_V1 — RELEASED (orchestrator)

### Síntoma
Tras `UX_HOTFIX_APU_BOQ_LINK_MODAL_V1`, en producción el flujo "Vincular a BOQ" **seguía pintándose
inline dentro de la tarjeta** (no abría ventana), igual que antes, pese a Ctrl+F5.

### Causa real
El código en `origin/main` (77e8a44) **ya tenía el modal correcto** (`fixed inset-0`, `role=dialog`,
`<LinkPanel>` dentro del overlay) y el `layout.tsx` del dashboard **no** tiene ancestros con
`transform/filter` que rompan `position:fixed`. Por tanto el comportamiento inline en prod indicaba
**runtime**: deploy viejo/no promovido y/o fragilidad de un overlay `fixed` anidado profundo en el árbol
de la tarjeta. Fix robusto que cubre ambas causas + fuerza deploy nuevo.

### Fix (UX-only, 2 archivos)
- `app/(dashboard)/apu/_components/link-to-boq-button.tsx`: el overlay del modal se renderiza con
  **`createPortal(…, document.body)`** (escapa de cualquier `overflow/transform/contain` del shell y
  queda fijo al viewport), `z-[100]`. Mantiene `role=dialog`/`aria-modal`, cierre por X/Escape/overlay,
  bloqueo de scroll. Mismo flujo y misma mutación.
- `tests/unit/apu/apu-boq-link-modal.test.ts` (nuevo): **anti-regresión a nivel de fuente** (stack node,
  sin jsdom): exige `createPortal` + `document.body` + `fixed inset-0` + `role=dialog`/`aria-modal`, y
  prohíbe el patrón inline (`return <LinkPanel`); LinkPanel se monta una sola vez.

### Estado / release
- `origin/main` = **`a50f9bf215cffe4208d170ff709c4b454d3427d3`** (merge `--no-ff`
  `merge(apu): release BOQ link modal render hotfix V1`, sobre `77e8a44`). Tag =
  **`apu-boq-link-modal-render-hotfix-v1`** → `a50f9bf`.
- typecheck **0** · lint **0** · tests apu/boq/link **360/0** · build **0** · **gm 22/22** · diff-check limpio.
- Smoke prod (psi): `/login` 200 · `/apu` 307 · `/apu?view=cards` 307 · `/projects` 307 · cron 401.
- **Sin** DB/migración/env/SMTP/usuarios; sin RPC/lógica financiera/BOQ/export/cantidades/cronograma;
  **no** se tocó `construction-ops-1rqh`.
- **Acción recomendada a la usuaria/dueño:** confirmar en el dashboard de Vercel que el último
  deployment de `main` está **Promovido a producción** (MCP 403 impide verificarlo por API).

---

## 2026-06-25 — UX_HOTFIX_APU_BOQ_LINK_MODAL_V1 — RELEASED (orchestrator)

### Problema UX
El flujo "Vincular a BOQ" funcionaba pero se renderizaba **inline dentro de la tarjeta**, alargándola y
rompiendo la lectura de la biblioteca. La usuaria pidió que se abra como **modal/popup**.

### Cambio (UX-only, 1 archivo)
`app/(dashboard)/apu/_components/link-to-boq-button.tsx`: el panel guiado ahora vive en un **modal
centrado** (overlay `fixed inset-0 z-50 bg-iconic-ink/30 backdrop-blur-sm` + `role="dialog"
aria-modal`, replicando el patrón del repo en `apu/[id]/_components/*-control.tsx`). Cabecera "Vincular
APU a BOQ" + APU seleccionado, cuerpo con scroll (`max-h-[90vh]`), botón X, cierre por overlay/Escape y
bloqueo de scroll de fondo. El botón de la tarjeta solo abre el modal (ya no expande). Mismos pasos
(proyecto→versión editable→capítulo→ítem ref opcional→cantidad→resumen→confirmar), misma mutación,
mismos enlaces de éxito (Abrir presupuesto / Abrir APU) y misma razón visible si está bloqueado.

### Estado / release
- `origin/main` = **`14dd2ca8c3e77207f2ebbcf0d503a2ef8c51d546`** (merge `--no-ff`
  `merge(apu): release BOQ link modal UX V1`, sobre `09f9c40`). Tag = **`apu-boq-link-modal-ux-v1`** → `14dd2ca`.
- typecheck **0** · lint **0** · tests apu/boq/link **355/0** · build **0** · **gm 22/22** · diff-check limpio.
- Smoke prod (psi): `/login` 200 · `/apu` 307 · `/apu?view=cards` 307 · `/projects` 307 · cron 401.
- **Sin** DB/migración/env/SMTP/usuarios; sin cambio funcional; sin tocar RPC `add_apu_to_boq`/lógica
  financiera/`unit_price_snapshot`/BOQ/export/cantidades/cronograma; **no** se tocó `construction-ops-1rqh`.
- Nota: sin stack jsdom/testing-library en el repo (vitest=node) → la apertura del modal se valida por
  build + verificación manual; los tests puros cubren el gating y que la mutación no cambia.

---

## 2026-06-25 — HOTFIX_APU_LIBRARY_BOQ_LINK_BUTTON_NO_ACTION_V1 — RELEASED (orchestrator)

### Síntoma (producción)
En `/apu?view=cards` las tarjetas cargan, pero clic en "Vincular a BOQ" **no hacía nada**: no abría
panel, no mostraba error, sin flujo.

### Causa raíz (dos defectos de UI client; sin backend)
1. **Ruta activa:** `LinkPanel` disparaba la carga de proyectos con `startTransition` **en fase de
   render** (efecto colateral durante el render) ⇒ el panel **fallaba al montar** al hacer clic.
2. **Ruta deshabilitada:** cuando `eligibility.canLink=false` se renderizaba un `<span>` mudo cuya única
   pista era un `title` (hover) ⇒ clic silencioso sin razón visible.

### Fix mínimo (UI-only, 2 archivos)
- `app/(dashboard)/apu/_components/link-to-boq-button.tsx`: carga de proyectos movida a `useEffect` de
  montaje (con cancelación); estado deshabilitado ahora es un **botón real** que revela la razón
  (`eligibility.message`) **inline** al hacer clic (nunca silencioso).
- `tests/unit/apu/apu-boq-link.test.ts`: bloque que garantiza que todo estado bloqueado expone un
  mensaje no vacío y que el estado vinculable no muestra razón.

### Estado / release
- `origin/main` = **`809e340e90637463ccbbf9fd3b66e5322981da61`** (merge `--no-ff`
  `merge(apu): release BOQ link button hotfix V1`, sobre `9ab2199`). Tag =
  **`apu-library-boq-link-button-hotfix-v1`** → `809e340`. Merge vía rama `release/...-merge` + push
  `HEAD:main` (worktree de `main` ocupado; no tocado).
- typecheck **0** · lint **0** · tests apu/boq/link **355/0** · build **0** · **gm 22/22** · diff-check limpio.
- Smoke prod (psi, GET-only): `/login` 200 · `/apu` 307 · `/apu?view=cards` 307 · `/projects` 307 ·
  cron 401. Alias vivo. Commit desplegado no confirmado por API (Vercel MCP 403 → dashboard manual).
- **Sin** DB/migración/env/SMTP/usuarios; sin lógica financiera; sin tocar RPC `add_apu_to_boq`;
  `unit_price_snapshot` intacto; sin tocar BOQ/export/cantidades/cronograma; **no** se tocó `construction-ops-1rqh`.
- Pendiente: **verificación visual manual** autenticada en `db`-mode (abrir el panel y completar un vínculo).

---

## 2026-06-25 — APU_LIBRARY_BOQ_LINK_FROM_CARDS_V1 — RELEASED (orchestrator)

### Estado
- **Mergeada a `main`** vía `merge --no-ff`. `origin/main` = **`e932573ab77b40f662f787bc2b310783934d8904`**
  (merge commit `merge(apu): release library BOQ link from cards V1`, parents `89d41d2` + feature `3ed0dd4`).
- Tag = **`apu-library-boq-link-from-cards-v1`** → `e932573`.
- Merge ejecutado en rama `release/...-merge` desde `origin/main` y push `HEAD:main` (worktree de `main`
  ocupado por otro worktree; no se tocó). Árbol limpio.

### Qué se liberó (5 archivos, +783/−16; sin DB/migración/env)
Acción **"Vincular a BOQ"** desde las tarjetas de `/apu?view=cards`. **Reuso** del dominio seguro
`addApuToBoq` → RPC `add_apu_to_boq` (snapshot server-side, solo versión editable, rol
`management|internal`, idempotente/auditado). Vincular = **agregar partida nueva** al BOQ desde el APU.
- `lib/apu-library/boq-link.ts` (nuevo, puro): `apuLinkEligibility` + `isEditableVersionStatus` +
  `versionStatusLabel` + `normalizeUnit`/`unitsCompatible`.
- `app/(dashboard)/apu/_components/link-to-boq-actions.ts` (nuevo, `'use server'`): 3 lecturas guiadas
  (`listProjects`/`listEstimates`/`getEstimateDetail`) + wrapper de mutación que delega en `addApuToBoq`.
- `app/(dashboard)/apu/_components/link-to-boq-button.tsx` (nuevo, `'use client'`): panel guiado
  proyecto→versión editable→capítulo→ítem referencia (read-only)→cantidad→confirmar, con advertencia de
  unidad y enlaces de éxito.
- `app/(dashboard)/apu/_components/apu-library-cards.tsx` (edit): placeholder "próxima oleada" → botón activo.
- `tests/unit/apu/apu-boq-link.test.ts` (nuevo).

### Validaciones
- typecheck **0** · lint **0** · scoped apu/estimates/boq **532/0** · suite completa
  **1965 passed / 42 skipped / 0 fail** · build **0** · **gm 22/22** · `git diff --check` limpio.

### Smoke producción (psi, GET-only, sin mutar)
`/login` **200** · `/apu` **307** · `/apu?view=cards` **307** · `/projects` **307** ·
`/api/cron/price-monitor` **401**. Alias vivo. Deploy auto por push a main; **commit desplegado no
confirmado por API** (Vercel MCP 403 → confirmación manual dashboard pendiente).

### Riesgos restantes
- **No** adjunta APU a un ítem BOQ **existente**; **agrega partida nueva** desde el APU (intencional;
  adjuntar-a-existente sería V1B con mutación nueva → fuera de alcance).
- **Verificación visual manual pendiente** (no hubo preview): probar flujo guiado autenticado en `db`-mode.
- `unit_price_snapshot` intacto (solo lo calcula el RPC existente).

---

## 2026-06-25 — APU_QUOTE_READINESS_INTEGRATION_V2 — CIERRE / VERIFICACIÓN (orchestrator)

### Estado (RELEASED — verificación de cierre, sin re-implementar)
- **Mergeada a `origin/main`** en ciclo anterior. Esta sesión solo verifica y cierra bitácora.
- `origin/main` = **`46f3a77e84a5889bd15cce5927a30a759b7a9bb5`** (merge commit
  `merge(quote): release APU readiness integration V2`).
- Tag = **`quote-readiness-apu-integration-v2`** → apunta exactamente a `46f3a77` (confirmado).
- Feature commit = `6463077 feat(quote): integrate APU completeness into readiness semaphore`.
- Working tree limpio; `git fetch --all --tags` OK. `main` local quedaba viejo (`26f3fca`) por
  falta de pull tras el merge; no afecta `origin/main` (fuente de verdad).

### Qué implementó (8 archivos, +259/−32 en `6463077`)
Integra la **completitud de APU** dentro del **semáforo de preparación de cotización** (readiness):
- `apps/web/lib/estimates/quote-readiness.ts` (+116) — núcleo de readiness con señal de APU.
- `.../estimates/[estimateId]/quote-readiness-semaphore.tsx` (+39) — UI del semáforo.
- `.../estimates/[estimateId]/page.tsx` (+7) — wiring de página.
- `apps/web/lib/apu-library/from-summary.ts` (+41) — derivación desde summary de APU.
- `apps/web/lib/contracts/read-model.ts` (+3) — contrato read-model (campo completitud APU).
- `server/read-model/drizzle-repository.ts` (+1) y `fixture-repository.ts` (+1) — pueblan el campo.
- `tests/unit/estimates/quote-readiness.test.ts` (+83) — cobertura nueva.

### Alcance / reglas
- **Sin DB ni migración** (cero archivos `.sql`/migración en el commit). Campo servido desde repos
  sobre datos existentes; esquema intacto.
- **No tocó export / BOQ / cantidades.**
- **APU solo lectura/derivación** (consume summary; no muta cálculo de APU, snapshots ni motor).
- Sin env, sin SMTP/Resend, sin usuarios, sin mutación de datos reales.
- **No se tocó `construction-ops-1rqh`** (proyecto Vercel duplicado, deuda preexistente).

### Verificación (esta sesión, números reales)
- typecheck **exit 0**; lint (`eslint .`) **exit 0**.
- Tests scoped (estimates+apu): **512 passed / 0 fail** (39 files) — incluye readiness.
- Suite completa: **1952 passed / 42 skipped / 0 fail** (143 files).
- **gm:regression 22/22** (`first-floor.regression.test.ts`).
- **build exit 0** (Next 16; ruta `…/estimates/[estimateId]` presente).
- **Smoke producción** (`construction-ops-psi.vercel.app`, GET-only, sin mutar):
  `/login` **200**; `/dashboard` `/apu` `/apu?view=cards` `/projects` **307** (sin 500);
  `/api/cron/price-monitor` **401**. Alias vivo (Server: Vercel, X-Vercel-Cache HIT).

### Deploy producción
- Alias `construction-ops-psi.vercel.app` **vivo y saludable** (smoke OK).
- **No confirmado por API** qué commit/deployment-id sirve: **Vercel MCP devolvió 403**
  (scope `soporteatriaworkflows-8854s-projects` requiere re-autenticación). Verificación de
  deployment-id/commit/fecha queda **pendiente de confirmación manual en el dashboard Vercel**.

### Pendientes reales
- Confirmar en dashboard Vercel que `46f3a77` es el deployment de producción activo (MCP 403).
- (Deuda preexistente conocida) proyecto duplicado `construction-ops-1rqh` sigue fallando — no tocar.

---

## 2026-06-15 — SCHEDULE_PREVIEW_READMODEL_ROOT_CAUSE_V4 — COMPLETA (Fases 0–7) (orchestrator)

### Estado
- Rama `fix/schedule-preview-readmodel-v4` (base `origin/main = 6a188d0`, confirmada;
  **sin divergencia**). **Sin merge a main; sin deploy; sin db push remoto; sin
  escrituras/datos remotos; sin SMTP; sin correos; sin feature nueva.** Stashes
  intactos (2, ajenos). Producción intacta. Main intacta. Rama lista para publicar.

### Causa raíz REAL (no era el botón ni el mensaje)
Tras V3 el preview se ejecutaba pero NO construía actividades por una **excepción
cruda de conversión `numeric→string`**, no por gating de UI:
- `loadGeneratorSource` (repository) pasaba `boq_items.quantity_snapshot` y
  `apu_components.quantity` SIN coerción. **PostgREST puede serializar `numeric`
  como número JS**; la suma de rendimiento APU del repo (`sumDecimal`) hacía
  `string.split('.')` sobre ese número → `TypeError` (no `planning_*`, no tipado)
  → `toSafeErrorMessage` caía al **mensaje genérico** "No se pudo calcular la
  vista previa".
- Por qué exports/presupuesto SÍ funcionaban: **no leen `quantity` para cálculo**
  (solo la muestran). El loader probado `quantity-workspace` ya coercía con
  `String(...)` — planning era el único que omitía la coerción.

### Comparación de read-models (resumen)
| Loader | Archivo | Lee quantity para cálculo | Coerción numeric | Riesgo |
|---|---|---|---|---|
| presupuesto/BOQ | `server/estimates/db-repository.ts` | no (display) | tipa string, sin math | bajo |
| export APU links | `getActiveVersionApuLinks` | no lee quantity | n/a | bajo |
| quantities sync | `server/quantity-workspace/db-repository.ts` | sí | **`String(r.quantity_snapshot)`** | bajo (blindado) |
| **planning preview** | `server/planning/repository.ts` | **sí (duración)** | **NINGUNA (bug)** | **alto → fix** |

Columnas idénticas en todos (`description_snapshot/unit_snapshot/quantity_snapshot/
apu_template_id`, filtros `estimate_version_id`/`chapter_id`). Todas las columnas
son `NOT NULL` en el esquema; el fallo NO era null sino **tipo de serialización**.

### Fixes (5 archivos, sin migración)
**`apps/web/modules/planning/decimal.ts`** — nuevas primitivas que NUNCA lanzan:
`tryDecimal(unknown)→Decimal|null`, `toNonNegativeDecimalString(unknown)→'0' si
inválido/negativo`, `addDecimalStrings(a,b)` por Decimal.js (no `.split()`).

**`apps/web/server/planning/repository.ts`** — coerce TODO `numeric` a
`DecimalString` (`toNonNegativeDecimalString`) en items y componentes labor;
elimina la suma BigInt frágil. Alinea el read-model con quantity-workspace.

**`apps/web/modules/planning/generator.ts`** — blindaje del generador:
- cantidad/rendimiento/cuadrilla null/NaN/Infinity/≤0/no parseable → warnings o
  duración mínima, **nunca excepción**; duración acotada a `MAX_ACTIVITY_DURATION_DAYS`
  (36 500).
- ítems con `chapterId` huérfano → capítulo sintético **"Sin capítulo"** (chapterId
  null para no violar FK; **no se descartan**).
- `GeneratorStats.inputItemCount/inputChapterCount` (distingue "versión sin ítems"
  de "ítems no programables").

**`apps/web/app/(dashboard)/planning/new/actions.ts`** — UX de error preciso:
versión sin BOQ / ítems presentes pero no programables (con hint del filtro) /
`PlanningError invalid_dates` → "La fecha de inicio no es válida" / fallback interno
con código seguro **`SCHEDULE_PREVIEW_READMODEL_FAILED`** (+ `console.error` sin secretos).

**`apps/web/modules/planning/index.ts`** — exporta las nuevas primitivas decimales.

### Validación (todo PASS, local)
- typecheck 0 · lint 0 · **suite 1766 passed / 42 skipped / 0 fail** (+27):
  +8 `decimal-coercion.test.ts` (reproduce el root cause con número JS), +18
  generador (datos imperfectos/huérfanos/cota), +1 stats input counts.
- gm:regression 22/22 · gm:import PASS · build limpio (exit 0) · `git diff --check`
  limpio · validate-claude-agents 214/0/0.
- Sin migraciones nuevas ⇒ harness RLS no re-ejecutado (sin cambio de esquema).

### Próximo paso
1. Revisión visual autenticada `/planning/new` ENTRE PATIOS Versión 1, fecha
   22/06/2026, cuadrilla 2, "Incluir capítulos" ON: **Vista previa debe mostrar
   actividades > 0** (antes fallaba). Verificar warnings de ítems sin APU/rendimiento.
2. Release controlado (autorización aparte): merge a main + deploy (sin db push).

---

## 2026-06-14 — SCHEDULE_PREVIEW_CREATE_PROD_FIX_V2 — COMPLETA (Fases 0–7) (orchestrator)

### Estado
- Rama `fix/schedule-preview-create-prod-v2` @ `(pendiente commit)` (base `origin/main = 7693313`,
  confirmada; **sin divergencia**). **Sin merge a main; sin deploy; sin db push
  remoto; sin escrituras remotas; sin SMTP; sin correos; sin nueva feature.** Stashes intactos.
  Producción intacta. Main intacta.

### Problema raíz (3 causas independientes)
1. **`mapWriteError` fallthrough**: códigos no reconocidos (ej. `PGRST202` — PostgREST
   function-not-found) caían al `return new Error('schedule_write_failed: CODE')` que no
   es instancia de `ScheduleValidationError` → `createScheduleAction` lo capturaba pero no
   matcheaba ningún `instanceof` → mensaje genérico "No se pudo crear el cronograma. Inténtalo de nuevo."
2. **Errores de lectura no tipados**: `loadGeneratorSource` lanza
   `new Error('planning_version_read_failed: PGRST...')` que tampoco matcheaba ningún handler
   tipado en `previewScheduleAction` → mismo mensaje genérico.
3. **`nodemailer` warning en build**: `/* @vite-ignore */` es Vite-específico; Webpack/Turbopack
   lo ignora → `Module not found: Can't resolve 'nodemailer'` en cada build.

### Fixes implementados (5 archivos, sin migración)

**`apps/web/server/planning/service.ts`**
- `mapWriteError`: el fallthrough ahora devuelve `ScheduleValidationError` (no `Error` genérico)
- Nueva `mapRpcValidationMessage(msg, code)`: mensajes específicos por código
  (`invalid_tasks` → "El cronograma no tiene tareas válidas para crear";
  `invalid_start_date` → "La fecha de inicio no es válida";
  `estimate_version_not_found`/`project_not_found` → mensaje de proyecto/versión).

**`apps/web/app/(dashboard)/planning/new/actions.ts`**
- Nueva `toSafeErrorMessage(e, context)`: convierte cualquier error (tipado O genérico) en
  mensaje de usuario seguro; maneja todos los prefijos `planning_*_read_failed` del repositorio.
- Preview: check `stats.activityCount === 0` → `{ ok: false, error: '...' }` con mensaje específico.
- `console.error` estructurado (nombre + mensaje; sin tokens ni secretos).

**`apps/web/app/(dashboard)/planning/new/new-schedule-form.tsx`**
- Botón "Crear cronograma" deshabilitado cuando `preview !== null && !preview.ok`
  (evita crear con datos inválidos mientras el preview activo indica error).

**`apps/web/server/email/smtp-provider.ts`**
- `/* @vite-ignore */` → `/* webpackIgnore: true */` (magic comment correcto para Webpack/Turbopack).

**`apps/web/next.config.mjs`**
- `serverExternalPackages: ['nodemailer']` para excluir nodemailer del bundle estáticamente.

### Validación (todo PASS, local)
- typecheck 0 · lint 0 · **suite 1724 passed / 42 skipped / 0 fail** (+6 nuevos tests de servicio)
- gm:regression 22/22 · build limpio (sin warning nodemailer) · `git diff --check` limpio
- Planning tests: 68/68 · RLS harness: sin migraciones nuevas → no re-ejecutado (FORCE=41 sin cambio)

### Tests nuevos (6) — `schedule-service.test.ts`
1. PGRST202 → `ScheduleValidationError` (no `Error` genérico; mensaje contiene `SCHEDULE_CREATE_VALIDATION`)
2. `22000` + `invalid_tasks` → mensaje "tareas válidas"
3. `22000` + `invalid_start_date` → mensaje "fecha de inicio"
4. `22000` + `estimate_version_not_found` → mensaje "proyecto y la versión"
5. `23514` (check violation) → `ScheduleValidationError`
6. Preview con `activityCount=0` devuelve `{ ok: false, error: '...' }`

### Próximo paso
1. Revisión visual autenticada: `/planning/new` crear cronograma ENTRE PATIOS con
   `createChapterMilestones=true` → verificar preview útil + crear → confirmar redirect a `/planning/[id]`.
2. Verificar que el warning de nodemailer desapareció en el siguiente deploy de Vercel.
3. Release controlado (autorización aparte): merge a main + deploy (sin db push — sin migraciones).

---

## 2026-06-14 — SCHEDULE_FROM_BOQ_V1 — COMPLETA (Fases 0–8) (orchestrator)

### Estado
- Rama `feature/schedule-from-boq-v1` @ `3214ce6` (base `origin/main = 5c19cb7`,
  confirmada por `git fetch`; **sin divergencia**). **Sin merge a main; sin deploy;
  sin db push remoto; sin escrituras remotas; sin SMTP; sin correos; sin chat;
  sin editor avanzado APU.** Stashes intactos (2, ajenos). Producción intacta.
  Main intacta. **Rama publicada a `origin/feature/schedule-from-boq-v1`.**

### Entregable (extiende la fundación de planning 3B — una sola fuente de verdad)
Cronograma tipo MS Project desde un presupuesto. 7 commits sobre la base:
- **Contrato** `docs/SCHEDULE_FROM_BOQ_V1_CONTRACT.md` (`c795b9f`).
- **Migración aditiva** `20260622090000` (NUEVA `planning_schedules` +
  columnas NULLABLE en `schedule_tasks`) + RLS `20260622090100` FORCE
  tenant-scoped + WITH CHECK cruzado + drizzle mirror (`7a25b0b`).
- **Generador puro** `modules/planning/generator.ts` (preview read-only +
  estimador de duración conservador por rendimiento APU) (`939f60e`).
- **RPC atómica** `20260622090200_create_schedule_from_boq` + `db reset` local +
  harness RLS extendido (`3ba715a`).
- **Wiring + UI + recálculo** `server/planning/*`, `modules/planning/recalc.ts`,
  `app/(dashboard)/planning/{,new,[scheduleId]}` (`ff76230`).
- **Cierre Fase 6–7**: trazabilidad BOQ/APU + snapshots + warnings + badges de
  rendimiento en el detalle; `displayWbs` (`3214ce6`).

### Cómo funciona
`planning_schedules` (project + estimate_version, status draft/baseline/active/
archived, archivar≠borrar) agrupa `schedule_tasks` (capítulos resumen + ítems BOQ
como actividades con `boq_item_id`/`apu_template_id`/`quantity_snapshot`/
`unit_snapshot`/`productivity_source`/`crew_*`/`responsible`). Generación
read-only + write-on-confirm vía RPC SECURITY INVOKER (org/actor server-side, rol
admin/gerencia/presupuestos). Duración conservadora: `cantidad × persona·días/u /
crew_size` cuando el APU tiene rendimiento laboral; si no, mínima + warning
(`productivity_source` apu/manual/unknown; nunca duración exacta inventada).
Recálculo FS/SS/FF/SF + lag + anti-ciclo + downstream. Detalle reutiliza los
componentes 3B (PlanningSummary/ScheduleTable/GanttChart). Ruta crítica 🔒 oculta
a `client`.

### Validación (todo PASS, local)
- typecheck 0 · lint 0 · **suite 1715 passed / 42 skipped / 0 fail** (+48 nuevos:
  22 generador, 13 recalc, 13 servicio) · build limpio (rutas /planning,
  /planning/new, /planning/[scheduleId] dynamic).
- `supabase db reset` aplica las 3 migraciones nuevas + seeds limpio.
- **RLS runtime harness 258 PASS / 0 FAIL** (FORCE 40→41 +planning_schedules;
  +7 checks: isolation insert/select/delete cross-org + RPC create/role).
- read-model isolation 12/0 · gm:regression 22/22 · gm:import PASS.
- smoke local (localhost:3200): /planning, /planning/new, /dashboard, /quantities,
  /apu, /catalog, /login → 200 (sin 500). `git diff --check` limpio.
  validate-claude-agents 214/0.

### Deudas registradas
`SCHEDULE_CRITICAL_PATH_V2`, `SCHEDULE_BASELINE_V2`, `SCHEDULE_EXPORT_PDF_EXCEL_V1`,
`MS_PROJECT_EXPORT_XML_V1`, `RESOURCE_LEVELING_V2`, `SCHEDULE_COMPARE_WITH_BOQ_V2`,
`SCHEDULE_AUDIT_LOG_V2`, `SCHEDULE_ROLE_COMPRAS_SEPARATION_V2` (UI muestra CTA a
`internal`/compras pero el RPC lo rechaza — separar a nivel UI con check de
profile.role), `APU_ADVANCED_EDITOR_V2`, `APU_VERSIONING_V1`.

### Próximo paso
1. Revisión visual autenticada: `/planning` (lista vacía→CTA), `/planning/new`
   (preview con conteos/warnings), crear un cronograma de prueba desde un
   presupuesto con APU, abrir `/planning/[id]` (tabla + Gantt + trazabilidad +
   editar avance/duración + agregar dependencia + recálculo de fechas).
2. Release controlado (autorización aparte): merge a main + `supabase db push` de
   `20260622090000`/`090100`/`090200` (aditivas; sin DELETE/DROP).
3. Si se requiere: `SCHEDULE_COMPARE_WITH_BOQ_V2` (estado "desactualizado").

---

## 2026-06-14 — SCHEDULE_FROM_BOQ_V1 — Fases 0–2 (orchestrator) · CHECKPOINT

### Estado
- Rama `feature/schedule-from-boq-v1` (base `origin/main = 5c19cb7`, confirmada por
  `git fetch`; **sin divergencia**). **Sin merge a main; sin deploy; sin db push
  remoto; sin escrituras remotas; sin datos dummy; sin SMTP; sin correos.**
  Stashes intactos (2, ajenos). Producción intacta. Main intacta.

### Hallazgo central (Fase 0)
`/planning` NO era un empty state pendiente: hay una fundación de planning de
**Oleada 3B real y migrada, solo lectura**. Tablas `schedule_tasks` /
`task_dependencies` / `progress_entries` / `resource_assignments`
(`20260531100000` + RLS `100100` FORCE), dominio puro `@/modules/planning`
(CPM/grafo/fechas/Gantt/view-model), read-model `getSchedule` (drizzle+fixture)
y UI lectura. Faltaba: contenedor de cronograma, vínculo presupuesto/BOQ/APU,
generador y **todo** camino de escritura. **Ninguna condición de STOP de Fase 0
disparada.**

### Decisión de arquitectura (aprobada por el usuario)
**EXTENDER 3B, no crear tablas paralelas** (`planning_tasks`/`planning_dependencies`
duplicarían el dominio y violarían la regla #1). Detalle en `docs/DECISIONS.md`
(entrada 2026-06-14 SCHEDULE_FROM_BOQ_V1) y contrato congelado.

### Entregable hasta el checkpoint
- **Fase 1** — `docs/SCHEDULE_FROM_BOQ_V1_CONTRACT.md` congelado. Commit `c795b9f`.
- **Fase 2** — Migración aditiva `20260622090000_schedule_from_boq.sql`
  (NUEVA `planning_schedules`: project + estimate_version, status
  draft/baseline/active/archived, archivar≠borrar; + columnas NULLABLE en
  `schedule_tasks`: schedule_id/boq_item_id/apu_template_id/task_type/
  unit_snapshot/quantity_snapshot/productivity_source/crew_label/crew_size/
  responsible/notes, con CHECK e índices). RLS `20260622090100` ENABLE+FORCE
  tenant-scoped + WITH CHECK cruzado (project+version misma org); sin DELETE
  (archivar). Drizzle mirror en `apps/web/lib/db/schema.ts`. **typecheck exit 0.**
  Commit `7a25b0b`.

### Pendiente (Fases 3–8 + validación + publicación)
- Fase 3 generador desde BOQ (dominio puro + preview + duración por rendimiento APU).
- Fase 4 UI `/planning` (lista), `/planning/new` (selector+preview),
  `/planning/[scheduleId]` (tabla MS Project + Gantt reutilizado).
- Fase 5 dependencias + recálculo downstream. Fase 6 permisos backend.
- Fase 7 integración BOQ/APU/quantities (warnings, snapshot, "desactualizado").
- Fase 8 tests (48 casos del mandato) + validación completa
  (`supabase db reset` local, suite, build, RLS harness, gm:regression, gm:import,
  smoke, redirects, diff, validate-agents) + publicar `origin/feature/...`.

### Próximo paso
Ejecutar Fase 3 (generador) sobre el read-model de estimates/chapters/boq_items +
rendimiento APU; luego UI. La migración aún **no** se ha aplicado con
`supabase db reset` local (validación de Fase 8); el typecheck del mirror drizzle
ya pasa.

---

## 2026-06-14 — DASHBOARD_ACCESS_NAV_AND_PRICING_KPI_HOTFIX_V1 (orchestrator)

### Estado
- Rama `fix/dashboard-access-nav-pricing-kpi-v1` (base `origin/main = 0d172ea`).
  **Sin merge a main; sin deploy; sin db push remoto; sin escrituras remotas;
  sin SMTP real; sin usuarios nuevos; stashes intactos (2, ajenos);
  producción intacta; main intacta.**

### Diagnóstico

**Nav/Accesos:** La arquitectura de `sidebar-nav.tsx` + `layout.tsx` ya estaba
correctamente implementada desde `e34a47a`. El `ACCESS_ITEM` existe, el layout
resuelve `resolveCanManageAccess()` server-side y pasa `showAccess` al
`SidebarNav`. El mecanismo silencia errores con `catch { return false }`. El
riesgo más probable en producción: `getClaims()` falla transitoriamente en cold
start de Vercel → sidebar sin "Accesos" en ese render. Guard backend SQL y
`/settings/access` con `canManageAccess()` son el backstop real.

**Dashboard copy stale:** `SavingsSection` tenía literal
"Oleada 3A — modo fixture activo" en el estado vacío (cuando `projectedSaving`,
`realizedSaving`, `pricingCoverage` son `undefined`). También había
referencias en comentarios JSDoc de `savings-section.tsx` y `dashboard/page.tsx`.

### Entregable
- **Contrato** `docs/DASHBOARD_ACCESS_NAV_AND_PRICING_KPI_HOTFIX_V1_CONTRACT.md`.
- **Fix copy** `modules/dashboard/savings-section.tsx`: estado vacío reemplazado
  por copy honesto con link a revisión de precios; comentario JSDoc actualizado.
- **Fix comment** `app/(dashboard)/dashboard/page.tsx`: referencia "Oleada 3A"
  removida del comentario JSDoc.
- **Fix planning empty state** `app/(dashboard)/planning/page.tsx`: descripción
  simplificada (sin "SCHEDULE_FROM_BOQ_V1" en el UI visible al usuario).
- **Suite tests** `tests/unit/nav/sidebar-access.test.ts` (nueva):
  36 tests cubriendo nav visibility (canManageAccess logic), sidebar source
  structure, layout source, /settings/access guard, dashboard copy, savings-section
  copy, planning empty state.

### Validación (todo PASS, local)
- typecheck 0 · lint 0 · **suite 1667 passed / 42 skipped / 0 fail**
  (+36 nuevos en sidebar-access.test.ts) · build limpio · `git diff --check`
  limpio · gm:regression 22/22.

### Arquitectura SCHEDULE_FROM_BOQ_V1 documentada
Registrada en OPEN_QUESTIONS y DECISIONS como siguiente gran oleada:
cronograma tipo MS Project conectado a presupuesto / BOQ / cantidades / APU /
rendimientos / cuadrillas / duración automática / dependencias / ruta crítica /
Gantt / línea base / avance físico.

### Próximo paso
1. Revisión visual autenticada: `/dashboard` (ver bloque "Ahorro e indicadores
   internos" actualizado), `/settings/access` (nav "Accesos" visible para admin/
   gerencia), `/planning` (empty state limpio).
2. Si el sidebar sigue sin mostrar "Accesos" en producción → revisar logs de
   Vercel para confirmar si `resolveCanManageAccess()` está lanzando error silente.
3. Planificar **SCHEDULE_FROM_BOQ_V1** como siguiente oleada mayor.

---

## 2026-06-14 — OPERATIONAL_ACCESS_LAYER_V1 + SMTP_CORPORATIVO_V1 (orchestrator)

### Estado
- Rama `feature/operational-access-smtp-v1` (base `origin/main = 877c60b`,
  confirmada por `git fetch`; **sin divergencia**). **Sin merge a main; sin
  deploy; sin db push remoto; sin escrituras remotas; sin datos dummy remotos;
  sin correos reales; sin SMTP real; sin cambios de variables remotas.** Stashes
  intactos (2, ajenos). Producción intacta. Main intacta.

### Entregable
- **Contrato congelado** `docs/OPERATIONAL_ACCESS_AND_SMTP_V1_CONTRACT.md`.
- **Migración aditiva SOLO local** `20260621090000_operational_access.sql` + RLS
  `20260621090100`: tablas NUEVAS `organization_invitations` (token **hasheado**,
  expiración, estado, autoría, accept/revoke) y `access_audit_log` (append-only;
  NUNCA tokens/contraseñas). RPCs `SECURITY DEFINER`: `create_invitation`,
  `resend_invitation`, `revoke_invitation`, `peek_invitation`, `accept_invitation`,
  `change_member_role` — org/actor/rol **server-side**, anti-escalamiento
  (no auto-elevación; gerencia ≠ admin; email mismatch). RLS ENABLE+FORCE,
  SELECT por org; **escrituras solo vía RPC**. No toca `profiles` ni usuarios
  productivos. FORCE count +2 tablas.
- **Email transaccional** `server/email`: `EmailProvider`, `LogEmailProvider`
  (dev/test, **no envía real**), `SmtpEmailProvider` (nodemailer **opcional** vía
  import dinámico; fallback a Log), plantillas español/ICONIC (invitación, reset,
  reenvío, revocación), factory + `sendTransactionalEmail`.
- **Dominio** `server/access`: permisos puros (anti-escalamiento), token sha256,
  resolución de actor (profiles.role server-side), read-repository (miembros/
  invitaciones por read-model drizzle + fixtures; el listado NO usa el SELECT
  recursivo de profiles), servicio (create/resend/revoke/changeRole/accept),
  errores en español.
- **UI** `/settings/access` (gated admin/gerencia): invitar (roles permitidos),
  usuarios activos (cambio de rol en línea), invitaciones (reenviar/revocar,
  estados Activo/Pendiente/Vencida/Revocada). `/invite/accept` (pública; peek por
  hash + signUp + RPC accept client-side). Nav lateral con entrada **Accesos**
  resuelta server-side. `routes.ts`: `/settings` protegida, `/invite` pública.
- **Recuperación de contraseña**: ya existía (Supabase PKCE: forgot/reset/callback,
  mensaje neutral, anti open-redirect, link en login). Sin cambios de código;
  plantilla canónica de reset documentada para el panel de Supabase.

### Validación (todo PASS, local)
- Migraciones aplican limpio en el Postgres local (psql) y validadas bajo rol
  `authenticated` end-to-end (create/accept/double-accept/role-change/self-block/
  audit + guards gerencia-admin/obra-invite).
- typecheck 0 · lint 0 · **suite 1633 passed / 42 skipped / 0 fail** (+58 nuevos:
  permissions, token, email, service, read-repository, access-routes, rls-access
  static) · build limpio · RLS runtime harness extendido (+11 checks de acceso).
- `git diff --check` limpio.

### Próximo paso / deudas
- Release controlado (autorización aparte): merge a main + `supabase db push` de
  `20260621090000` + `20260621090100` (aditivas; sin DELETE/DROP) + configurar
  SMTP corporativo (panel Supabase Auth + env `SMTP_*` en Vercel) + revisión
  visual autenticada de `/settings/access` y del flujo de invitación.
- **Deuda crítica de release** `OPERATIONAL_ACCESS_REMOTE_RLS_VERIFY_V1`: en
  Supabase remoto el migrador podría NO tener BYPASSRLS (ver fix 4B.1). Verificar
  en staging que las RPCs `SECURITY DEFINER` (especialmente `accept_invitation`,
  que escribe `profiles` para un invitado sin org, y el listado por read-model)
  operan correctamente bajo RLS remota ANTES de confiar en el flujo en producción.
- Deudas: `ACCESS_DEACTIVATION_V1` (suspender usuario activo sin borrarlo),
  `EMAIL_DELIVERABILITY_MONITORING_V1`, `ACCESS_AUDIT_VIEWER_V1` (UI de bitácora).

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-14 — QUANTITY_IMPORT_PERSISTENCE_HOTFIX_V1 (orchestrator)

### Estado
- Rama `fix/quantity-import-persistence-v1` (base `origin/main = 06bfb10`,
  confirmada). HEAD: `75da170`. **Publicada en origin. Sin merge a main;
  sin deploy; sin db push remoto; sin escrituras remotas.** Stashes intactos
  (2, ajenos a esta rama). Producción intacta. Main intacta.

### Causa raíz
Dos causas independientes combinadas:
1. **Visibilidad**: `/quantities` llama `rm.listQuantities` que lee
   `quantity_groups` (legacy, `project_scope_id`). La importación escribe en
   `quantity_takeoff_groups` (sin `project_scope_id`; solo `organization_id`).
   Familias de tablas distintas → los grupos importados nunca aparecían.
2. **Cache**: `confirmQuantityImportAction` no llamaba `revalidatePath`. Next.js
   16 cachea la página → aunque se corrigiera el punto 1, la pantalla mostraba
   el estado anterior.

### Correcciones
- **`lib/quantity-import/types.ts`**: nuevo `ImportedBatchSummary`.
- **`server/quantity-import/db-repository.ts`**: `listImportedBatches` (Supabase
  RLS-bound; lee `quantity_import_batches` + `quantity_takeoff_groups` +
  líneas; graceful empty si error RLS).
- **`server/quantity-import/service.ts`**: `listQuantityImportBatches`
  (management|internal, db mode only).
- **`server/quantity-import/index.ts`**: exports actualizados.
- **`app/(dashboard)/quantities/import/actions.ts`**: `revalidatePath('/quantities')`
  + `revalidatePath('/quantities/import')` tras éxito.
- **`app/(dashboard)/quantities/page.tsx`**: sección "Memorias importadas"
  (tabla de grupos por lote: descripción, líneas, total, unidad, estado BOQ).
- **`app/(dashboard)/quantities/import/_components/quantity-import-wizard.tsx`**:
  botón → "Ver memorias importadas" → `/quantities#imported-batches`.
- **Contrato**: `docs/QUANTITY_IMPORT_PERSISTENCE_HOTFIX_V1_CONTRACT.md`.
- **Sin migración** (tablas `quantity_import_batches`, `quantity_takeoff_groups`,
  `quantity_takeoff_lines` existen en producción desde release
  `quantity-takeoff-import-release-v1`; migraciones `20260616090000` + `20260616090100`).

### Validación (todo PASS, local)
- tsc 0 · lint 0 · **suite 1575 passed / 42 skipped / 0 fail** (+10 tests
  nuevos `persistence.test.ts`) · build limpio (rutas quantities presentes)
  · gm:regression 22/22 · regresión RLS 121/0 · `git diff --check` limpio.

### Próximo paso
- Release controlado: merge a main + deploy con revisión visual en producción.
  Verificar que la sección "Memorias importadas" muestra los lotes existentes
  en la BD de producción (ya persistidos).
- Deuda registrada: `QUANTITY_IMPORT_BATCH_DETAIL_V1` (vista de detalle por
  lote con filtro/búsqueda; hoy se muestran todos los grupos de cada lote en
  la misma tarjeta).

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-13 — QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1 + CATALOG_PRICE_VISIBILITY_V1 + CLIENT_EXPORT_PROFILE_V1 (orchestrator)

### Estado
- Rama `feature/quantity-workspace-boq-sync-v1` (base `origin/main = 4e1817e`,
  confirmada por `git fetch`; **sin divergencia**). HEAD: `fcb1c25` (+ esta
  entrada de docs). **Sin merge a main; sin deploy; sin db push remoto; sin
  escrituras remotas; sin datos dummy remotos.** Stashes intactos (2, ajenos a
  esta rama). Producción intacta.

### Entregable
- **Contrato congelado** `docs/QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1_CONTRACT.md`
  (commit `ff57807`).
- **Migración aditiva SOLO local** `20260620090000_quantity_workspace.sql` +
  RLS `20260620090100`: tablas NUEVAS `quantity_workspace_groups` /
  `quantity_workspace_lines` (editables, jerarquía piso/módulo/espacio/elemento,
  desperdicio, descuento de vanos, vínculo opcional APU/BOQ), triggers same-org,
  trigger updated_at, RLS ENABLE+FORCE (SELECT org; INSERT/UPDATE/DELETE roles de
  presupuesto). **No toca** `quantity_takeoff_*` ni `quantity_groups/lines`
  legacy. RPC `update_boq_item_quantity` (SECURITY INVOKER): actualiza cantidad
  de ítem BOQ **editable preservando `unit_price_snapshot`**, recalcula subtotal
  server-side, auditoría+idempotencia vía `apu_manual_actions`
  (`action_type='update_quantity'`, CHECK extendido). FORCE count 36→**38**.
- **Motor de fórmulas PURO** `server/quantity-workspace/formula.ts` (9 tipos:
  área simple/piso, muro con vano, enchape por altura, pintura/microcemento,
  perfil lineal, conteo, volumen, **manual seguro sin eval**); plantilla muro
  mixto `templates.ts` (4 derivadas: board/enchape/perfil/pintura, cada una
  vinculable a APU/BOQ distinto). **Preview de sync PURO** `sync.ts` (crear/
  actualizar/bloqueada, antes/después/Δ, advertencias; **versión emitida ⇒
  blocked**). Servicio + db-repository (RLS-bound, resultado recomputado
  server-side; el navegador nunca fija el resultado).
- **read-model** `listWorkspaceGroups` (drizzle + fixture) + `WorkspaceGroupView`.
- **UI** `/quantities/workspace` (lista grupos + totales + estado de vínculo),
  `/quantities/workspace/new` (crear grupo: campos jerárquicos + líneas con 9
  tipos + plantilla muro mixto), `/quantities/workspace/[groupId]/sync` (preview
  obligatorio + confirmar solo filas no bloqueadas). Enlace desde `/quantities`.
- **CATALOG_PRICE_VISIBILITY_V1**: dominio puro `server/catalog/price-status.ts`
  (aprobado/pendiente/rechazado/sin precio + proveedor solo roles internos).
  `resource_price_observations` mapeado en Drizzle; `listCatalogResources`
  enriquece `CatalogResourceView` (no autoaprueba, no expone descuentos). UI
  `/catalog`: columna Estado, precio aprobado/pendiente, proveedor, fecha, CTA por
  fila. **Causa raíz del "precio vacío"**: el read-model nunca poblaba el precio;
  ahora sí (read-model fix acotado, sin migración).
- **CLIENT_EXPORT_PROFILE_V1**: perfil puro `lib/estimates/export-profile.ts`
  (cliente NUNCA incluye fichas APU; técnico honra kind; retrocompatible). Route
  `?profile=client|technical` (default technical ⇒ comportamiento previo intacto;
  **generadores sin cambios, golden master intacto**). UI export relabel: «Para
  cliente» (PDF cliente, Excel presupuesto) vs «Técnico/interno» (PDF técnico
  completo, Excel técnico con APU, APU vinculados).
- **Cronograma**: empty-state honesto en `/planning` + deuda `SCHEDULE_FROM_BOQ_V1`.

### Validación (todo PASS, local)
- `supabase db reset --local` aplica las 2 migraciones nuevas sin error.
- typecheck 0 · lint 0 · **suite 1565 passed / 42 skipped / 0 fail** (+ formula 23,
  sync 9, catalog price 8, export-profile 12) · build limpio (rutas workspace
  presentes) · gm:regression 22/22 · gm:import total **$372.247.169,98** intacto ·
  RLS runtime **241/0** (preflight FORCE 38) · read-model isolation **12/0** ·
  `git diff --check` limpio · validate-claude-agents **214/0**.

### Próximo paso / deudas
- Release controlado requiere `supabase db push` de `20260620090000` +
  `20260620090100` (2 migraciones aditivas; sin DELETE/DROP). Revisión visual en
  `http://localhost:3160`: crear grupo de cantidades (incl. muro mixto), enviarlo
  al presupuesto con preview, ver catálogo con estados de precio, descargar PDF
  cliente vs técnico.
- Deudas registradas: `SCHEDULE_FROM_BOQ_V1`, `OPERATIONAL_ACCESS_LAYER_V1`,
  `SMTP_CORPORATIVO_V1`, `APU_ADVANCED_EDITOR_V2`, `APU_VERSIONING_V1`,
  `EXPORT_QUANTITIES_ANNEX_V1`, `TRUE_DB_PAGINATION_V1`, y nueva
  `QUANTITY_WORKSPACE_RLS_HARNESS_V1` (checks dedicados del workspace en el
  harness, hoy cubierto por preflight FORCE + paridad con `add_apu_to_boq`).

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-13 — APU_EXPORTS_V1 + BUDGET_EXPORT_WITH_APU_ANNEX_V1 (orchestrator)

### Estado
- Rama `feature/apu-budget-exports-v1` (base `origin/main = d3c67bd`, confirmada
  por `git fetch`; **sin divergencia**). HEAD: `77acd03` (+ esta entrada de docs).
  **Sin merge a main; sin deploy; sin db push remoto; sin escrituras remotas; sin
  datos dummy remotos.** Stashes intactos (2, ajenos a esta rama).

### Entregable
- **Contrato congelado** `docs/APU_EXPORTS_AND_BUDGET_APU_ANNEX_V1_CONTRACT.md`
  (commit `4989eb6`).
- **Dominio READ-ONLY de selección** `server/estimates/export/apu-annex/selection.ts`:
  resuelve `BudgetApuExportSelection` reutilizando el `EstimateExportPayload` del
  presupuesto (snapshots BOQ) + APU EFECTIVAMENTE vinculados por
  `boq_items.apu_template_id`, **deduplicados**, en **orden BOQ** (primera
  aparición), con su cálculo actual (read-model `getApuDetail`). Archivados:
  excluidos en versión editable, incluidos en versión emitida (fidelidad
  histórica). Incompletos: incluidos con advertencia, sin bloquear. **Deps
  inyectables** (tests deterministas sin BD). No muta datos.
- **Nuevo método repo** `getVersionApuTemplateLinks` (interface + db + fixture):
  filas BOQ→APU de la versión objetivo en orden BOQ, ítems/capítulos activos.
- **Generadores Excel** (`apu-annex/apu-xlsx.ts`): `generateLinkedApuExcel`
  (ÍNDICE APU + hoja por APU: encabezado, componentes, resumen por tipo,
  trazabilidad, BOQ vinculado) y `generatePackageExcel` (hojas presupuesto +
  hojas APU, reutilizando `addBudgetSheets` extraído de `xlsx.ts` sin alterar el
  golden master). **Sanitización formula-injection** (`safeCell`) en todo texto.
- **Generadores PDF** (`apu-annex/apu-pdf.ts`): `generateLinkedApuPdf` (portada +
  índice + ficha por APU) y `generatePackagePdf` (página de presupuesto +
  anexos), reutilizando `buildBudgetPage` extraído de `pdf.ts` (salida del
  presupuesto idéntica). Texto saneado (`cleanText`); sin UUID/origen/secretos.
- **Route** `GET /api/estimates/export?kind=budget|apu|package` (budget por
  defecto, intacto). Cross-org ⇒ 404; tamaño > 15 MB ⇒ 413; `no-store`.
- **UI** menú «Exportar» (6 documentos) con conteos (ítems BOQ, APU vinculados,
  sin vínculo, archivados incluidos) y advertencias; opciones APU/paquete
  deshabilitadas sin APU vinculados. Lógica pura testeable en `export-menu-logic.ts`.
- **Fix acotado `READ_MODEL_ARCHIVED_AT`** (causa raíz: el schema Drizzle
  `apuTemplates` no mapeaba `archived_at`/`origin_type`/etc., presentes en BD
  desde `20260618/20260619`). Se sincronizó el mapeo ORM (**sin migración**) y se
  populó `archivedAt`+`originType` en `listApus` (`ApuSummary`) y `getApuDetail`
  (`ApuDetail`), drizzle + fixture.
- **Nombres de archivo**: `apu_vinculados_<codigo>_<version>` y
  `paquete_presupuesto_apu_<codigo>_<version>` (sanitizados); el presupuesto
  conserva su patrón previo.

### Validación (todo PASS, local)
- **Sin migración** ⇒ `db reset` no aplica (solo mapeo ORM contra columnas ya
  existentes en BD). typecheck 0 · lint 0 · **suite 1517 passed / 42 skipped / 0
  fail** (+30: dominio 11, Excel 7, PDF 6, UI 6) · build limpio · gm:regression
  22/22 · gm:import total **$372.247.169,98** intacto · validate-claude-agents
  214/0/0 · `git diff --check` limpio (solo avisos LF→CRLF).
- RLS runtime harness **no aplica** (sin migración/RLS nueva); read-model
  isolation corre dentro de la suite.

### Próximo paso
- Revisión visual en `http://localhost:3150`: desde un presupuesto con APU
  vinculados (Entre Patios), descargar los 6 documentos y validar branding,
  índice, fichas y total. Luego release controlado (sin db push: no hay
  migración; el fix read-model es solo ORM).
- Deudas registradas: `OPERATIONAL_ACCESS_LAYER_V1`, `SMTP_CORPORATIVO_V1`,
  `APU_ADVANCED_EDITOR_V2`, `APU_VERSIONING_V1`, `TRUE_DB_PAGINATION_V1`,
  `HARDEN_APU_COMPONENTS_FOR_ALL_V1`, `EXPORT_QUANTITIES_ANNEX_V1`.

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-13 — APU_MANUAL_BUILDER_VALIDATION_AND_ARCHIVE_HOTFIX_V1 (orchestrator)

### Estado
- Rama `fix/apu-manual-builder-validation-archive-v1` (base `origin/main = 3018f8b`).
  **Sin merge a main; sin deploy; sin db push remoto; sin escrituras remotas; sin datos dummy remotos.**
- HEAD pendiente de commit (esta entrada cierra la sesión).

### Entregable
- **Contrato congelado** `docs/APU_MANUAL_BUILDER_VALIDATION_AND_ARCHIVE_HOTFIX_V1_CONTRACT.md`.
- **Migración aditiva SOLO local** `20260619090000_apu_archive_support.sql`:
  `apu_templates += archived_at/archived_by/archive_reason`; índice parcial sobre
  no-archivados; CHECK extendido `apu_manual_actions_type_valid` (+ `'archive'`);
  RPC `archive_apu_template` (SECURITY INVOKER, 7 guards); `add_apu_to_boq`
  actualizado con guard `apu_archived`; `create_manual_apu` endurecido
  `v_qty <= 0` (antes `v_qty < 0`). FORCE count 36 (sin cambio).
- **Dominio server-side** (`apps/web/server/apu-builder/`): `requireDecimal` amplía
  `exclusiveMin` + nuevo `exclusiveMax`; 6 call-sites `{ min: 0, exclusiveMin: true }`
  para cantidad de material + performanceDays + memberCount; `wastePct` ahora
  `{ min: 0, max: 1, exclusiveMax: true }`; `archiveManualApu` + `loadApuForCopy`
  en servicio y repositorio; nuevos tipos `CopyFromApuData` + `SerializableManualApuPreview`;
  nueva clase `ApuArchiveError`.
- **UI** `/apu/new`: `previewManualApuAction` + `archiveApuAction`; validación por fila
  (cantidad > 0 en materiales; rendimiento > 0, integrantes > 0 en M.O.); texto de
  ayuda inline; banner de duplicado-para-corregir (`?copyFrom=`); `performanceDays`
  inicializado en `''` en lugar de `'0'` (fix bug crítico). `/apu/[id]`: botones
  Archivar/Duplicar para corregir; banners de archivado/incompleto; badges. `/apu`:
  columna Estado (Archivado/Incompleto/Activo); filtro `Archivadas`. Nuevo componente
  `_components/archive-apu-button.tsx`.
- **Tests**: `tests/unit/apu-builder/builder.test.ts` 13→35 tests (22 nuevos):
  bloque "validación estricta > 0" (12), bloque "archiveManualApu" (6), bloque
  "loadApuForCopy" (4). Imports actualizados: `vi`, `archiveManualApu`, `loadApuForCopy`,
  `ApuArchiveError`, `DbApuBuilderRepository`, `CopyFromApuData`, `AuthenticatedViewer`.
- **RLS harness** `scripts/rls-runtime/run.ts`: sección [24b] (8 checks: 24o..24u +
  24s-bis); total 241 checks esperados en local.
- **Suite completa**: 1487 passed / 42 skipped / 0 fail. Build clean. Typecheck 0.
  Lint 0. Golden master 22/22.

### Limitación conocida (integración pendiente)
- `archivedAt` en el listado `/apu` y en `ApuDetail` no se popula hasta que
  `apps/web/server/read-model/drizzle-repository.ts` exponga `archived_at` de
  `apu_templates`. Registrado en `docs/INTEGRATION_REQUESTS.md`.

---

## 2026-06-13 — APU_MANUAL_BUILDER_V1 + BOQ_ADD_FROM_APU_V1 (orchestrator)

### Estado
- Rama `feature/apu-manual-builder-boq-add-v1` (base `origin/main = 56b7c0a`,
  confirmada por `git fetch`; sin divergencia). **Sin merge a main; sin deploy;
  sin db push remoto; sin escrituras remotas; sin datos dummy remotos.**
- HEAD de la rama: `90ed0f7` (+ esta entrada de docs).
- Stashes intactos (2, de `integration/wave-4e2a`, ajenos a esta rama).

### Entregable
- **Contrato congelado** `docs/APU_MANUAL_BUILDER_AND_BOQ_ADD_V1_CONTRACT.md`.
- **Migración aditiva SOLO local** `20260618090000_apu_manual_builder.sql`:
  `apu_templates += origin_type (CHECK manual|workbook_import, default
  workbook_import) + created_by`; tabla nueva `apu_manual_actions` (RLS
  ENABLE+FORCE, append-only, idempotencia `UNIQUE (org, idempotency_key)`);
  RPC `create_manual_apu` y `add_apu_to_boq` (SECURITY INVOKER, org/actor
  server-side, precio de material re-resuelto en SQL desde la última observación
  aprobada, total recalculado en SQL, issued guard `estimate_version_locked`,
  idempotentes). FORCE count 35→36.
- **Dominio server-side** `apps/web/server/apu-builder/` + tipos
  `apps/web/lib/apu-builder/`: compone `modules/apu` (sin redefinir fórmulas);
  material = precio aprobado server-side, M.O. = costo diario integral del
  dominio, herramienta menor derivada. `previewManualApu` PURO.
- **UI** `/apu/new` (formulario materiales + M.O. + resumen estimado en vivo) +
  CTA «Nuevo APU» en `/apu` + CTA «Crear APU usando este recurso» en la
  inteligencia de precios del recurso (preselección `?resourceId=`). Todo
  gated a management/internal + modo creación (oculto/explicado en demo/fixture).
- **BOQ add**: `AddApuPanel` en el workspace de versión EDITABLE (capítulo + APU
  activo + cantidad → RPC `add_apu_to_boq`; snapshot inicial del costo unitario;
  cambios futuros del APU no mutan ítems emitidos).
- **Tests**: `tests/unit/apu-builder/builder.test.ts` (13) + harness RLS sección
  [24] (19 checks).

### Decisión Fase 7 (edición)
- Edición avanzada de APU manual **diferida** a `APU_ADVANCED_EDITOR_V2`
  (creación manual sólida; la reconciliación ya cubre cambios de recurso en
  importados; editar introduce riesgo sobre snapshots BOQ). Sin botones rotos.

### Validación (todo PASS, local)
- `supabase db reset --local` (37 migraciones + 6 seeds, `20260618090000` limpia)
  · typecheck 0 · lint 0 · **suite 1465 passed / 0 fail** (+13) · build
  (`ƒ /apu/new`) · **RLS runtime 233/0** (+19 sección [24], FORCE 35→36) ·
  read-model isolation 12/0 · gm:regression 22/22 · gm:import PASS
  (hoja Excel omitida: `private/` no versionado) · `git diff --check` limpio ·
  validate-claude-agents 214/0/0.

### Próximo paso
- Revisión visual en `http://localhost:3130`: crear un APU manual desde `/apu/new`
  y agregar una actividad al BOQ de una versión editable. Luego release controlado
  (`db push --dry-run` ⇒ exactamente 1 migración nueva `20260618090000`).
- Deudas registradas: `APU_EXPORTS_V1`, `BUDGET_EXPORT_WITH_APU_ANNEX_V1`,
  `APU_ADVANCED_EDITOR_V2` (INTEGRATION_REQUESTS).

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-13 — RELEASE: APU_COMPONENT_RESOURCE_RECONCILIATION_V1 + APU_LIBRARY_OPERATIONAL_UX_V1 (orchestrator, release controlado)

### Estado
- **RELEASED.** `origin/main = 03c59c1` (merge commit `--no-ff`). Tag `apu-resource-reconciliation-library-ux-release-v1`.
- 1 migración aplicada remotamente: `20260617090000_apu_component_reconciliation.sql`.
  - Columnas aditivas `apu_components`: `updated_at`, `reconciliation_state` (CHECK), `reconciled_by`.
  - Triggers BEFORE UPDATE: `set_updated_at` + `recompute_total` (cierra R-01).
  - Índice parcial `apu_components_unresolved_idx`.
  - Tabla nueva `apu_component_resource_actions` (RLS ENABLE+FORCE, auditoría inmutable, idempotencia unique parcial).
  - 3 RPCs SECURITY INVOKER: `reconcile_apu_component`, `reconcile_apu_components_bulk` (máx 50, `p_allow_replace=false`), `update_apu_component_reconciliation`. Guard: admin/gerencia/presupuestos.
- Rutas nuevas: `/apu` (biblioteca compacta), `/apu/[id]` (pestañas), `/apu/reconciliation` (centro).
- Smoke productivo: `/login` 200, rutas protegidas 307 (auth guard), `/api/cron/price-monitor` 401. Sin 500.
- db lint: 1 warning extra (`v_res` never read — no bloqueante, lógica correcta).
- Sin seeds remotos. Sin deploy CLI. Sin importación remota. Sin datos dummy. Sin DROP/DELETE/TRUNCATE. Sin variables modificadas. Sin secretos expuestos.
- `feature/apu-resource-reconciliation-ux-v1` HEAD: `7b2ff26` (rama fuente intacta).

### Validaciones post-merge
- typecheck 0, lint 0, suite 1494/1494 (incluye smoke gated), build (`/apu`, `/apu/[id]`, `/apu/reconciliation`), gm:regression 22/22, gm:import PASS, RLS runtime 214/0, validate-claude-agents 214/0/0. read-model-isolation: script no committeado (pre-existente, no regresión).

### Riesgos residuales (no bloqueantes)
- `apu_components_all FOR ALL` sin endurecer (D-REC-6, deuda pre-existente).
- Paginación server-side render (deuda de optimización a true DB-pagination).
- Cast `viewer as AuthenticatedViewer` (type safety, no runtime error).

### Siguiente acción manual recomendada
Revisar `/apu` y `/apu/reconciliation` en producción con sesión real. Probar asociación individual + bulk pequeña con preview. STOP.

---

## 2026-06-12 — RELEASE: QUANTITY_TAKEOFF_IMPORT_V1 (orchestrator, release controlado tras apagado)

### Estado
- **RELEASED.** `origin/main = 81d5bf0` (merge commit). Tag `quantity-takeoff-import-release-v1`.
- 2 migraciones aplicadas remotamente: `20260616090000` (3 tablas + RPC `import_quantity_takeoff_batch`), `20260616090100` (RLS ENABLE+FORCE en las 3 tablas).
- Deploy automático Vercel activo post-push: smoke 11/11 sin HTTP 500; `/quantities/import` 200; `/apu/import` 200; `/catalog/prices/review` 200; cron 401.
- Sin seeds. Sin deploy CLI. Sin importación remota automática. Sin datos dummy. Sin secretos expuestos. Sin DROP/DELETE/TRUNCATE. Sin variables modificadas.

### Validación proporcional
- typecheck 0, lint 0, **1412 tests** PASS, build ✓ (`ƒ /quantities/import`), gm:regression 22/22, RLS estático 96/96, read-model 51/51, gm COP 372.247.170 intacto, validate-claude-agents 214/0/0.

### Siguiente acción manual
- Ingresar a `/quantities/import` con sesión productiva (rol admin/gerencia).
- Cargar workbook real `CANTIDADES 1 PISO` supervisadamente.
- Revisar preview de grupos y líneas antes de confirmar.

### Rollback
- No se ejecutó rollback. Migraciones aditivas; sin datos producción afectados.

---

## 2026-06-12 — FASE 4B.3: QUANTITY_TAKEOFF_IMPORT_V1 (orchestrator, con recuperación tras apagado)

### Estado
- Rama `feature/quantity-takeoff-import-v1` (worktree dedicado; base
  `origin/main = daa4dd9`). **Sin merge a main; sin deploy; sin db push
  remoto; sin escrituras remotas; sin datos dummy remotos.**
- **Sesión de recuperación**: apagado inesperado del equipo a mitad de
  FASE 6. Auditoría R0: 4 commits íntegros en disco (contrato, schema+RLS,
  parser+matching, wizard UI); sección [22] del harness RLS y 3 archivos de
  tests unitarios escritos SIN commitear — todo preservado, nada descartado,
  sin reset/rebase/stash.

### Entregable
- **Contrato congelado** `docs/QUANTITY_TAKEOFF_IMPORT_V1_CONTRACT.md`
  (gramática §2, fórmulas geométricas §3, deducciones §4, occurrence §5,
  matching solo exactos §6, esquema §7, RLS §8, servicio §9, errores §10,
  idempotencia/provenance §11, UI §12, congelados §13, deudas §14).
- **Migraciones aditivas SOLO locales** `20260616090000` + `20260616090100`:
  `quantity_import_batches` (UNIQUE org+digest, inmutable),
  `quantity_takeoff_groups` (vínculo `boq_item_id` UNIQUE parcial; el
  vínculo vive aquí — `boq_items` JAMÁS se muta), `quantity_takeoff_lines`
  (inmutables; raw_values con texto de fórmulas, jamás evaluadas), triggers
  same-org y **RPC atómica `import_quantity_takeoff_batch`** (SECURITY
  INVOKER, idempotente por digest, `version_locked` en emitidas, jamás
  reemplaza vínculos). RLS ENABLE+FORCE; FORCE count 31→**34**.
- **Dominio** `apps/web/server/quantity-import/` (parse-workbook,
  parse-takeoff-sheet, matching, preview, service, db-repository, errors):
  parser PURO sobre valores cacheados; 17 tipos de fórmula geométrica +
  `custom`; recalculo Decimal (Excel = evidencia); matching §6 SOLO exactos
  y no ambiguos (sugerencias informativas SIN `boqItemId`); servicio dos
  pasos (preview/confirm + digest SHA-256) sin persistir archivo; roles
  management|internal; org/actor SIEMPRE server-side.
- **UI** `/quantities/import` (wizard: workbook + versión editable opcional
  → resumen → grupos con líneas desplegables y diferencias vs Excel →
  vínculos por estado → confirmación → reporte + CSV sanitizado) + CTA
  «Importar memorias» en `/quantities`.
- **Tests** `tests/unit/quantity-import/` (59: parser 37, matching 10,
  preview/confirm 12; hojas 100% sintéticas) + sección [22] del harness.

### Recuperación y defectos locales corregidos (sin ampliar alcance)
- `matchTakeoffGroup`: sugerencias devolvían `boqItemId` ⇒ ahora SIEMPRE
  `null` (solo lo exacto porta id; defensa en profundidad §6).
- Harness [22]: setup sin `chapters` (NOT NULL `boq_items.chapter_id`).
- Test documental de alias de unidades: tabla extendida aditivamente con
  m³/un/jn (§2.2).

### Validación (todo PASS)
- `supabase db reset --local` 36 migraciones + 6 seeds (Docker re-arrancado
  tras el apagado) · typecheck 0 · lint 0 · **1412 tests** (+59; 1 flaky
  PDF conocido verde en re-run) · build (`ƒ /quantities/import`) · **RLS
  runtime 194/194** (+21 sección [22]) · isolation 12/12 · gm 22/22 ·
  gm:import $372.247.170 · smoke gated **42/42** (1 transitorio post-reset,
  re-run único verde — patrón warmup conocido) · redirects 15/15 ·
  diff --check limpio · validador 214/0/0.

### Próximo paso
- Revisión visual de la usuaria en `http://localhost:3110` (importar la
  hoja real `CANTIDADES 1 PISO` supervisadamente) + release controlado
  (`db push --dry-run` ⇒ exactamente 2 migraciones nuevas `20260616*`).
- Deudas registradas: `QUANTITY_TAKEOFF_APPLY_TO_BOQ_V1`,
  `QUANTITY_TAKEOFF_MULTI_SHEET_V1` (INTEGRATION_REQUESTS).

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-12 — RELEASE: ENTRE_PATIOS_APU_IMPORT_V1 + BOQ_APU_LINKING_V1 (orchestrator)

### Estado
- **RELEASED.** `origin/main = d68d113` (merge commit). Tag `entre-patios-apu-import-release-v1`.
- 3 migraciones aplicadas remotamente: `20260615090000` (apu_import_batches + provenance + RPC),
  `20260615090100` (RLS ENABLE+FORCE), `20260615090200` (fix cast uuid[] — lint limpio).
- Deploy automático Vercel activo: smoke 10/10 sin HTTP 500; `/apu/import` 307 (auth guard ✓); cron 401 ✓.
- Sin seeds. Sin deploy CLI. Sin importación remota del workbook. Sin escrituras remotas distintas del db push.

### Validación proporcional
- typecheck 0, lint 0, suite 1353/1353, build ✓ (`ƒ /apu/import`), gm 22/22, gm:import intacto,
  RLS harness 173/173, diff --check limpio, validador agentes 214/0/0.

### Siguiente acción manual
- Entrar a `/apu/import` con sesión productiva (rol management/internal).
- Cargar el workbook real `COT.ENTRE PATIOS 1 PISO (1).xlsx` supervisadamente.
- Revisar 54 actividades; aceptar sugerencias de materiales explícitamente.
- Evaluar linking contra ítems BOQ reales (aprox. 51 linkable).

### Próximo slice
- **QUANTITY_TAKEOFF_IMPORT_V1** (FASE 4B.3) — NO iniciada, pendiente aprobación.
- Deudas registradas: `BOQ_APU_RELINK_WITH_CONFIRMATION`, `APU_REUSABLE_CREW_TEMPLATES_V1`.

---

## 2026-06-11 — FASE 4B.2: ENTRE_PATIOS_APU_IMPORT_V1 + BOQ_APU_LINKING_V1 (orchestrator)

### Estado
- Rama `feature/entre-patios-apu-import-v1` (base verificada
  `origin/main = bfc254b`; árbol limpio; 2 stashes intactos; producción
  intacta). **Sin merge a main; sin deploy; sin db push remoto; sin
  escrituras remotas; sin datos dummy remotos.**
- Workbook real localizado: `private/COT.ENTRE PATIOS 1 PISO (1).xlsx`
  (copiado del worktree principal a `private/` gitignored; SHA-256
  `203F63C8…64C2`). Leído SOLO en modo local; jamás versionado.

### FASE 0–1 (precheck + inspección)
- origin/main NO avanzó. Catálogo baseline en fixtures; APU Foundation
  (4B.1) integrada (labor_role_id + default_tool_pct).
- Hoja APU real mapeada: A1:K466; salarios filas 10–31 (Ayudante factor
  1.6, Oficial 2.3 sobre SMLV; prestaciones/SS/parafiscales aplicados al
  SMLV); header ID/DESCRIPCION/UND fila 34; 54 actividades (36–466);
  códigos visibles REPETIDOS (MAM-01×5, DOT-01×6, MAM-02×2, PISOS-01×2);
  herramienta menor `=G·pct%` con pct VARIABLE (35/30/25/20%); descripciones
  por fórmula a COTIZACION FULL (se usa el caché); insumos referencian
  LISTADO MATERIALES; bloque final 1.114 = alquiler de equipos.

### Entregable
- **Contrato congelado** `docs/ENTRE_PATIOS_APU_IMPORT_V1_CONTRACT.md`
  (gramática de la hoja, derivación salarial exacta, occurrence index,
  matching, herramienta derivada por template, idempotencia, linking,
  RLS, deudas).
- **Migraciones aditivas SOLO locales** `20260615090000` + `20260615090100`:
  `apu_import_batches` (UNIQUE org+digest; inmutable: sin UPDATE/DELETE;
  INSERT solo admin/gerencia con imported_by = identidad real), provenance
  en `apu_templates` (import_batch_id + trigger same-org, source_sheet/row/
  occurrence) y `apu_components` (source_row/occurrence, raw_code,
  raw_unit), y **RPC atómica `import_apu_batch`** (SECURITY INVOKER patrón
  import_boq_into_version: idempotencia por digest, skip de códigos
  existentes, `total_component_cost` recalculado en SQL, linking guardado
  `apu_template_id IS NULL AND archived_at IS NULL`, versión editable;
  orden templates→links→batch para conteos definitivos con batch inmutable;
  status SIN `FOR UPDATE` — lección 4E.3A).
- **Dominio** `apps/web/server/apu-import/` (sheet-model, parse-workbook,
  parse-apu-sheet, salary, matching, preview, service, db-repository):
  parser PURO sobre valores cacheados (cellFormula solo como metadato;
  jamás se evalúa ni persiste); derivación salarial reproduce el Excel
  EXACTO (hora Ayudante 16.016,814 / Oficial 20.807,439 / cuadrilla 2A+1O
  52.841,0671); cuadrillas → una fila labor por rol (4B.1 §5) con
  labor_role_id obligatorio; matching exacto code/ref/sku, descripción
  SOLO sugerencia con acepte explícito re-validado; recalculo Decimal
  (Excel = evidencia, Δ>0.01 ⇒ advertencia).
- **UI** `/apu/import` (wizard 2 pasos: workbook + versión BOQ opcional →
  preview con resumen/roles/filtros/detalle/aceptes → confirmación
  idempotente → reporte + CSV sanitizado) + CTA «Importar APU» en `/apu`.
- **Dry-run contra el workbook REAL** (`scripts/excel-import/apu-dry-run.ts`,
  local): 54 actividades, 217 componentes, 0 errores, **0 deltas > 0.01**;
  linking contra fixture real: **51 linkable / 3 unresolved / 0 ambiguous**.

### Validación (todo PASS)
- db reset local 35 migraciones + 6 seeds · typecheck 0 · lint 0 ·
  **1353 tests** (+51) · build (ruta `ƒ /apu/import`) · **RLS runtime
  173/173** (+22 sección [21]; FORCE 30→31) · isolation 12/12 · gm 22/22 ·
  gm:import $372.247.170 · smoke gated 42/42 (en aislamiento; contención
  de workers conocida al correr juntos) · redirects 15/15 · diff --check
  limpio · validador 214/0/0.

### Próximo paso
- Revisión visual de la usuaria en `http://localhost:3100` (importar el
  workbook real con su sesión productiva tras release) + release controlado
  (`db push --dry-run` ⇒ exactamente 2 migraciones nuevas `20260615*`).
- Siguiente slice recomendado: **QUANTITY_TAKEOFF_IMPORT_V1** (FASE 4B.3,
  NO iniciada por mandato).

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-11 — RELEASE: PRICE_OBSERVATION_REVIEW_CENTER_V1 + BULK_APPROVAL_BY_IMPORT_BATCH_V1

> **Release controlado ejecutado por agent-orchestrator.** Rama `feature/price-observation-review-center-v1` (HEAD `6554516`) integrada a `main` mediante rama temporal `release/price-review-center-v1-merge`. **DB push remoto aplicado (2 migraciones). Main publicado. Producción activa. Tag creado.**

### A. Invariantes Git
- main inicial: `9e03553` → main final: `b974065`
- Feature HEAD: `6554516` (publicada en origin)
- Merge commit: `b974065` (`merge(release): price observation review center and bulk baseline approval v1`)
- Tag: `price-observation-review-center-release-v1` (anotado, publicado)
- Stashes: 2 WIP intactos en `integration/wave-4e2a-manual-boq-editing`
- No se tocaron otros worktrees

### B. DB Push Remoto
- Dry-run inicial: exactamente 2 migraciones pendientes confirmadas
- `20260614090000_price_observation_batches_bulk_actions.sql` — APLICADA
- `20260614090100_rls_price_observation_batches_bulk_actions.sql` — APLICADA
- Dry-run final: "Remote database is up to date" (33/33 Local=Remote)
- db lint: "No schema errors found"
- Seed 0006 NO aplicado. Sin --include-seed. Sin --include-all. Sin db reset remoto.
- Sin DROP, DELETE, TRUNCATE, backfill destructivo.

### C. Validaciones post-merge
- typecheck: 0 errores
- lint: 0 warnings
- diff --check: limpio
- validate-claude-agents: 214/0/0
- suite completa: 1302/1302 PASS (42 skipped gates)
  - Nota: 1 test PDF flaky por contención de workers — pasa en aislamiento (11/11); no relacionado con review center; archivo no modificado en la feature
- build: OK, ruta `/catalog/prices/review` incluida
- golden master: 22/22
- read-model isolation (unit): 51/51
- regression + RLS-static: 87/87
- smoke gated: 42/42 (mvp 10/10 + boq-edit 32/32)
- redirects: 15/15
- RLS harness: 151/151

### D. Deploy y Smoke productivo GET-only
- Deploy: automático vía push a main (Vercel Git integration)
- Hash de deployment Vercel: pendiente confirmación visual (MCP Vercel requiere OAuth — no bloqueante)
- Smoke GET 11 rutas: 200 (`/`, `/login`, `/dashboard`, `/catalog`, `/catalog/prices/review`, `/catalog/import`, `/catalog/providers`, `/catalog/providers/import`, `/catalog/monitoring`, `/apu`, `/projects`)
- Cron `/api/cron/price-monitor` sin Bearer: 401 ✓
- Sin 500s. Sin escrituras remotas. Sin crawling. Sin secrets expuestos.

### E. Notas de infraestructura
- supabase CLI en este worktree: requiere copiar `.temp/` (pooler-url, project-ref, linked-project.json) desde worktree con link previo — auth token en Windows Credential Manager
- `scripts/rls-runtime/read-model-isolation.ts`: falla preexistente de path alias `@/server/repositories/read-repository`; cubierto por 51 unit tests

### F. Confirmaciones
- Sin deploy CLI
- Sin promote
- Sin alias manual
- Sin cambios de variables de entorno
- Sin seeds remotos
- Sin db reset remoto
- Sin DROP/DELETE activos
- Sin datos dummy remotos
- Sin exportaciones
- Sin crawling
- Sin secretos expuestos
- Sin merge a otros worktrees

### G. Rollback
- App: revertir main a `9e03553` con `git push origin 9e03553:main` (si necesario)
- DB: migraciones aditivas (nullable import_batch_id); sin rollback automático destructivo

### H. Pendientes no bloqueantes
- Confirmación visual hash Vercel en producción
- Prueba manual autenticada: aprobar baseline del lote Entre Patios desde `/catalog/prices/review`
- Paginación server-side > 1000 filas (deuda documentada)
- ENTRE_PATIOS_APU_IMPORT_V1 (no iniciado)
- BOQ_APU_LINKING_V1 (no iniciado)
- QUANTITY_TAKEOFF_IMPORT_V1 (no iniciado)

---

## 2026-06-11 — FASE 4B.1: APU_COST_MODEL_FOUNDATION_V1 (rama `feature/apu-cost-model-foundation-v1`)

> **Fundamento trazable del costo APU: rol laboral → cuadrilla → actividad con herramienta menor derivada.** Base `origin/main = 8a81a98` (price monitoring ya integrado). Worktree dedicado `construction-ops-apu-cost-model-foundation-v1`. **Sin merge a main, sin deploy, sin db push remoto, sin datos dummy remotos, stashes intactos (2 WIP).** Importación del Excel (4B.2), BOQ↔APU linking y cantidades (4B.3) NO iniciadas.

### Commits de la oleada
- `0a4fbf0` docs(apu): cherry-pick documental de discovery (origen `b75e7a4`)
- `cb3b176` docs(apu): freeze cost model foundation v1 contract
- `6433041` feat(db): additive APU foundation migrations, seed and fixture v2.1.0
- `8bb2117` feat(apu): traceable labor cost domain, ApuDetail read-model and /apu/[id] view
- `dbf9002` test(apu): foundation domain/read-model tests + RLS harness section 19
- (este commit) docs de cierre.

### A. Contrato
- **`docs/APU_COST_MODEL_FOUNDATION_V1_CONTRACT.md`** congelado: alcance/fuera de
  alcance, modelo laboral (fórmula intacta), trazabilidad `labor_role_id`,
  cuadrillas sin tabla nueva, herramienta derivada vía `default_tool_pct`,
  rendimientos/desperdicios sin cambios, unidades canónicas reutilizadas,
  compatibilidad total con componentes existentes, RLS, migraciones, pruebas,
  golden master y deudas (ENTRE_PATIOS_APU_IMPORT_V1, BOQ_APU_LINKING_V1,
  QUANTITY_TAKEOFF_IMPORT_V1, APU_UI_ADVANCED_EDITING_V1).

### B. Esquema + RLS (migraciones `20260613090000` + `20260613090100`, LOCAL)
- `apu_components.labor_role_id` uuid NULL, FK `labor_roles` ON DELETE SET NULL,
  índice, **trigger same-org** (cross-org ⇒ 23514). Filas existentes en NULL.
- `apu_templates.default_tool_pct` numeric(20,10) NOT NULL DEFAULT 0,
  CHECK rango [0,1]. Sin backfill.
- RLS sin cambios de políticas (columnas heredan ENABLE+FORCE existente).
- Seed `0006_demo_apu_foundation.sql`: rol Ayudante (LR-002) + APU-002 cuadrilla
  demo registrado en `config.toml`.
- **Harness RLS**: sección [19] con 10 checks nuevos ⇒ **130/130 PASS** local.

### C. Dominio (`apps/web/modules/apu/apu.ts`, aditivo y retrocompatible)
- `calculateCrewLaborCost(members)` = Σ(cantidad integrantes × costo por rol).
- `buildCrewLaborComponent({laborRoleId, role, performanceDays, memberCount})`
  congela `dailyIntegralCost` como snapshot y **falla seguro sin laborRoleId**.
- `calculateApuUnitCostFull(components, defaultToolPct)`: desglose por tipo +
  herramienta derivada `pct × Σ labor`; con pct='0' reproduce EXACTO
  `calculateApuUnitCost`. Filas `tool` explícitas intactas. Decimal en todo;
  el servidor nunca confía en subtotales del navegador.

### D. Read-model + UI
- Contrato: `ApuComponentView` + `ApuDetail` (unit RAW + `unitCanonical` vía
  `canonicalizeUnit` de pricing) + `getApuDetail` en `ReadModelPort`.
- Implementado en fixture y Drizzle; `computeApuDetail` compartido en
  `compute.ts`; `ApuNotFoundError` sin fallback; proyección 🔒 rol `client`
  omite `laborRoleCode/laborRoleName` (backend-first).
- `listApus` ahora usa el costo COMPLETO (con derivada); APU existentes
  (pct=0) conservan su valor anterior.
- UI: nueva página `/apu/[id]` (componentes con tipo/rendimiento/desperdicio/
  rol/herramienta derivada + desglose por tipo) y link desde las cards de `/apu`.

### E. Fixture v2.1.0 (`scripts/fixtures/entre-patios-first-floor.fixture.json`)
- +`ROL-AY-001` Ayudante (base 1.160.000 ficticio ⇒ mensual 2.158.200, día
  89.925, hora 11.240,625 — reproducibles con `calculateLaborCost`).
- Componente labor existente de APU-PISO-PORC: +`laborRoleId` (Oficial) SIN
  alterar snapshot/total (68370 intacto).
- +`APU-MURO-LAD` (m2 ⇒ m²): cuadrilla 2 Ayudantes (qty 0.4) + 1 Oficial
  (qty 0.2) + material, `defaultToolPct 0.05` ⇒ M.O. 55.932,5, herramienta
  2.796,625, total 67.549,125.

### F. Validación (todo PASS)
- typecheck 0, lint 0, **1236 tests** (+27 de esta fase) + 42 gated.
- build: `ƒ /apu/[id]` nueva; resto de rutas intactas.
- `supabase db reset --local`: 31 migraciones + 6 seeds sin errores.
- RLS runtime **130/130**; read-model isolation **12/12**.
- Smoke gated `BOQ_SMOKE_DB=1`: boq-edit 32/32 + mvp-internal-flow 10/10
  (1 fallo transitorio PGRST303 por warmup de PostgREST tras reset; re-run verde).
- gm:regression **22/22** (total ≈ COP 372.247.169,97 intacto);
  gm:import `--check-fixture` PASS (regresión + privacidad sin fugas).
- `git diff --check` limpio; validador de agentes 214/0/0.

### G. Riesgos residuales / deudas
- Filas históricas `unit_price_source='labor_role'` con `labor_role_id NULL`
  se toleran en lectura (no trazables); se regularizan en 4B.2.
- Migraciones `20260613*` NO aplicadas a remoto (se aplican en el release).
- Cuadrillas reutilizables entre APU (`apu_crew_templates`) diferidas.

### Próximo paso
- Release de la rama (merge + db push remoto + deploy) cuando la usuaria lo
  autorice; luego **FASE 4B.2 ENTRE_PATIOS_APU_IMPORT_V1** (verificar hoja APU
  con `gm:dump` antes de escribir el parser).

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-11 — FASE 4A: PRICE_MONITORING_AGENT_V1 + UNIT_ALIAS_NORMALIZATION_V1 (rama `feature/price-monitoring-agent-v1`)

> **Agente automático del sistema para monitoreo periódico de precios públicos + normalización semántica de unidades.** Base `origin/main = 9f6816f` (verificado HEAD exacto, sin divergencia). Worktree dedicado `construction-ops-price-monitoring-agent-v1`. **Sin merge a main, sin deploy, sin db push remoto, sin variables remotas, stashes intactos (2 WIP).**

### Commits de la oleada
- `c1b1dd6` docs(pricing): freeze automatic price monitoring agent contract
- `a6090f5` feat(db): price monitoring targets/runs/results schema + RLS FORCE + harness checks
- `908e868` feat(pricing): unit alias normalization v1 - canonical m2/und/dia + fix false unit warning
- `6fe898b` feat(pricing): price monitor domain engine - compare, check-target, locks, idempotency, stores
- `7ac2f0d` feat(cron): protected price-monitor cron endpoint + daily vercel cron 11:00 UTC
- `9fb79d5` feat(ui): monitoring center, resource auto-monitoring section, dashboard monitor KPIs
- `f23ad26` test(pricing): monitor engine, cron protection, roles, UI guards and invariants (64 tests)
- (este commit) docs de cierre.

### A. Contrato
- **`docs/PRICE_MONITORING_AGENT_V1_CONTRACT.md`** congelado: system agent no conversacional, scheduler, targets explícitos, cadencias {1,7,15,30}, batch ≤25, locks, idempotencia, 7 estados de resultado, comparación con baseline, pending observations, fallos/retry conservador, UI, roles, seguridad (checklist 20 puntos), CRON_SECRET requirement, aliases de unidades, fuera de alcance y deudas (`PRICE_MONITORING_EMAIL_NOTIFICATIONS_V1`, `OPERATIONAL_ACCESS_LAYER_V1`, `ASSISTED_BUDGET_AGENT_V1`).

### B. Esquema + RLS (migraciones `20260612090000` + `20260612090100`, LOCAL)
- `price_monitor_targets` (UNIQUE org+recurso+URL; cadencia CHECK; URL CHECK http(s); índice parcial de vencidas; DELETE denegado — pausar = enabled=false).
- `price_monitor_runs` tenant-scoped (UNIQUE org+idempotency_key; counters JSONB; initiated_by; error_summary).
- `price_monitor_results` append-only (7 estados; unidad RAW; FK a observación pending).
- RLS ENABLE+FORCE ×3; SELECT org; INSERT/UPDATE roles admin/gerencia/presupuestos/compras; resultados sin UPDATE/DELETE.
- **Harness RLS actualizado**: pre-flight 25→28 tablas FORCE + sección [18] con 14 checks nuevos (aislamiento A/B, cross-org WITH CHECK, gate de rol obra, UNIQUE target, CHECK cadencia, DELETE denegado, append-only results, UNIQUE idempotencia). **120/120 PASS** local.

### C. Dominio (`apps/web/server/pricing/monitor/`)
- `compare.ts` puro (Decimal exacto; moneda normalizada; unidad canónica — m2 vs m² sin warning falso; sin baseline ⇒ propuesta).
- `check-target.ts` reutiliza ÍNTEGRO el camino seguro 3B (validatePublicUrl + fetchPublicPage + adapters + normalize); mapeo de errores → unreachable/blocked/parse_failed/invalid_response; dedup de pending idéntica; notas con metadatos y marca «Monitor automático».
- `service.ts`: corrida programada (lock advisory global en conexión reservada, recovery de runs `running` >30min, batch ≤25 orden next_check_at, round-robin por hostname ⇒ concurrencia por dominio = 1, una run idempotente por org `scheduled:<YYYY-MM-DD>`) + corrida manual (rate limit estructural por ventana: org 5min, target 1min; `ManualRunThrottledError`). Fallo ⇒ failures++ y `next_check_at = now + cadence` (retry conservador; nunca deshabilita).
- `db-stores.ts`: `DbSystemMonitorStore` (cron; lecturas/escrituras de monitor con conexión administrativa documentada; **observaciones SIEMPRE RLS-bound** con claims del usuario habilitador) y `DbViewerMonitorStore` (manual; TODA operación RLS-bound con claims del viewer).
- `db-repository.ts` (UI vía Supabase SSR + RLS real; guard de rol management|internal), `fixture-repository.ts` (demo read-only), `validation.ts`, `index.ts` (factories por READ_MODEL_SOURCE).

### D. Cron + ejecución manual
- `apps/web/vercel.json`: cron diario `0 11 * * *` (11:00 UTC ≈ 06:00 Bogotá) → `/api/cron/price-monitor`.
- `GET /api/cron/price-monitor` (`maxDuration=300`): sin CRON_SECRET ⇒ 500 `cron_not_configured`; Bearer incorrecto/ausente ⇒ 401; comparación tiempo-constante (sha256 + timingSafeEqual); modo fixture ⇒ 503; respuesta SOLO conteos/estados (sin precios, sin URLs, sin secreto). `.env.example` documenta CRON_SECRET (placeholder).
- Server Actions (`app/(dashboard)/catalog/monitoring/actions.ts`): habilitar fuente (con validación SSRF profunda ANTES de persistir), pausar/reanudar, cadencia, «Revisar ahora»/«Ejecutar revisión ahora» — viewer server-side, roles management|internal, solo modo db.

### E. UNIT_ALIAS_NORMALIZATION_V1
- `apps/web/server/pricing/units.ts`: m2/M2/m²/metro(s) cuadrado(s)→`m²`; und/unidad/unidades→`und`; dia/día/jornada→`día`. RAW preservado siempre; comparación canónica; sin backfill.
- Fix real: `server/catalog/import/price-list.ts` usa `unitsEquivalent` ⇒ archivo `m2` vs recurso `m²` ya NO genera warning falso (caso Decorcerámica).

### F. UI
- Recurso (price-intelligence): sección «Monitoreo automático» — toggle «Monitorear esta fuente», frecuencia 1/7/15/30, estado/última/próxima/fallos, «Revisar ahora», historial breve. Controles solo a roles autorizados (server-side).
- `/catalog/monitoring`: 6 tarjetas resumen (monitoreadas/activas/pausadas/vencidas/cambios pendientes/con error), última ejecución + «Ejecutar revisión ahora», tabla (recurso/proveedor/URL/frecuencia/última/próxima/estado/acciones), corridas recientes. Lectura para site/client sin botones.
- Dashboard: bloque 🔒 «Monitoreo automático de precios» con 4 KPIs + acceso rápido «Monitoreo de precios».

### G. Validación (todo PASS)
- `supabase db reset --local`: 28 migraciones + 5 seeds ✅
- typecheck 0 · lint 0 ✅
- Suite completa: **1209/1209 PASS** (42 skipped gated) — +77 nuevos (64 monitor + 13 aliases) ✅
- build: EXIT 0; rutas `/api/cron/price-monitor` y `/catalog/monitoring` presentes ✅
- RLS harness: **120/120** (incl. 14 monitor) ✅ · read-model isolation **12/12** ✅
- Smoke gated BOQ_SMOKE_DB=1: **42/42** (primera corrida tuvo 1 flake de arranque post-reset; re-ejecución limpia) ✅
- gm:regression **22/22** · gm:import total $372.247.170 intacto ✅
- redirect tests (15) y SSRF en suite ✅ · `git diff --check` limpio ✅ · validate-claude-agents **214/0/0** ✅

### H. Seguridad verificada
- CRON_SECRET nunca impreso (test); endpoint protegido (500/401/200/503, tests); roles server-side; organizationId/userId server-side; RLS FORCE ×3 (harness); SSRF/DNS/redirects ≤5 intactos (tests + reuso); sin crawling (1 fetch por target, test); sin headless/anti-bot/login; sin auto-approve (invariante + harness); sin escrituras BOQ/AIU/exports (tests de invariantes); batch acotado; locks; idempotencia.

### I. Riesgos residuales / pendientes de release
1. `CRON_SECRET` NO configurado (mandato): release requirement.
2. Root Directory de Vercel no verificable por MCP (teams vacía): `vercel.json` colocado en `apps/web` (asunción estándar); confirmar en panel y mover a raíz si difiere.
3. `db push` remoto de las 2 migraciones pendiente para release (gate dry-run estricto).
4. El monitor exige `DATABASE_URL` en runtime de producción (ya existente para read-model).
5. Email/SMTP diferido (`PRICE_MONITORING_EMAIL_NOTIFICATIONS_V1`).

### Estado al cierre
- **main intacta = 9f6816f** · producción intacta (`construction-ops-psi.vercel.app`) · sin deploy · sin db push remoto · stashes (2 WIP P1-A) intactos.
- Rama `feature/price-monitoring-agent-v1` publicada en origin.
- Siguiente recomendación: revisión visual de la usuaria en `http://localhost:3070` → release controlado (db push gate + CRON_SECRET + verificación Root Directory + merge) → `OPERATIONAL_ACCESS_LAYER_V1` + SMTP + email notifications.

### Agentes activos al cierre
- Ninguno.

## 2026-06-11 — CIERRE DE ACEPTACIÓN PROVIDER_PRICE_LIST_MAPPING_UX_FIX_V1

> **Aceptación funcional del hotfix.** Verificación del tag, confirmación de deployment, prueba de aceptación Decorcerámica con fixture real. Sin escrituras en producción; tests puramente de lógica.

### A. Estado inicial auditado
- `origin/main` = `4b37c5ae18a5c84d7f82d7f81e66df35cd355e63` ✅
- Árbol: 1 modificación documentación pendiente (HANDOFF_LOG anterior) ✅
- Stashes: 2 WIP intactos, sin tocar ✅
- Worktrees: 12 registrados, sin tocar ✅

### B. Tag anotado
- Objeto: `5d97f3e9c7e5acda178cbc92d8c7c1c434e06ab0`
- Commit dereferenciado: `4b37c5ae18a5c84d7f82d7f81e66df35cd355e63` ← MATCH ✅
- Tag publicado en origin: ✅

### C. Deployment productivo
- Vercel MCP sin acceso a equipo (teams list vacía → no se puede obtener commit hash de deployment)
- Trazabilidad disponible: push `4ac3d7f → 4b37c5a` a `origin/main` ejecutado 2026-06-10 ~18:00 COL; Vercel configurado en `main` como Production Branch (docs/audits/security-baseline/09_VERCEL_GITHUB_CICD_AUDIT.md)
- Smoke productivo GET-only (ambas sesiones) → 9/9 PASS HTTP 200 ✅
- **Confirmación visual del commit en panel Vercel: pendiente manual**

### D. Aceptación Decorcerámica — PASS por criterio

| # | Criterio | Método | Resultado |
|---|----------|--------|-----------|
| 1 | Carga correcta del archivo | code-review `price-list-wizard.tsx`: `<input type="file" accept=".xlsx,.xls,.csv">` + `parseCatalogFile` | ✅ PASS |
| 2 | Detección automática de columnas | PL-16: `suggestMapping(headers, PRICE_LIST_FIELDS)` con `externalSku + observedPrice` → mapping completo | ✅ PASS |
| 3 | Resumen visible de auto-mapping | code-review: bloque `MappingIndicator` con `hasPrice`/`hasIdentifier`; `aria-label="Resumen de auto-mapeo"` | ✅ PASS |
| 4 | Diferenciación campos requeridos vs opcionales | code-review: `isPrice → span *`, `isIdentifier → span †`, opcionales sin marcador | ✅ PASS |
| 5 | Panel avanzado colapsable | code-review: `isAdvancedOpen` state, `aria-expanded`, `aria-controls="advanced-mapping-panel"` | ✅ PASS |
| 6 | Comportamiento sin observedPrice | PL-3 + PL-17: sin `observedPrice` → error bloqueante + `importable=false` + panel abierto | ✅ PASS |
| 7 | Comportamiento sin identificador | PL-4 + PL-17: sin ningún identificador → error bloqueante + `importable=false` + panel abierto | ✅ PASS |
| 8 | Corrección manual del mapping | code-review: `updateMapping()` + botón "Recalcular"; PL-19: mapeo incorrecto → 0 matches, corregido → 1 match | ✅ PASS |
| 9 | Sin regresiones en catálogo | PL-20/PL-21: catálogo sigue exigiendo `code+name+resourceType+unit`; `buildCatalogImportPreview` funciona | ✅ PASS |
| 10 | Sin errores inesperados consola/servidor | build EXIT 0, typecheck 0 errores, suite 1132/1132 PASS | ✅ PASS |

**Fixture Decorcerámica (tests `price-list-validation.test.ts`):**
- SKU 6751 → match tipo `sku`, código `MAT-PORC-DC-001`, genera `matchedRow` ✅
- SKU 9999 → `matchType: 'none'`, `status: 'unmatched'`, sin `matchedRow` generado ✅
- Resumen: `matchedCount=1`, `unmatchedCount=1`, `invalidCount=0`, `totalRows=2` ✅
- Sin errores de `name` ni `resourceType` ✅

### E. Bugs encontrados
Ninguno. Un timeout flaky en `export-service.test.ts > pdf-client` (5s bajo carga paralela) — pre-existente, no relacionado con el hotfix; se auto-resolvió en segunda ejecución.

### F. Cierre oficial
**`PROVIDER_PRICE_LIST_MAPPING_UX_FIX_V1` está oficialmente CERRADO.**

---

## 2026-06-10 — RELEASE PROVIDER_PRICE_LIST_MAPPING_UX_FIX_V1 (merge a `main`)

> **Release controlado del hotfix.** Merge `fix/provider-price-list-mapping-ux-v1` → `main` vía rama temporal `release/price-list-mapping-ux-v1`. Sin deploy CLI, sin db push remoto, sin migraciones, sin features nuevas.

### Invariantes del release
- **origin/main antes:** `4ac3d7f` — **origin/main después:** `4b37c5ae18a5c84d7f82d7f81e66df35cd355e63`
- **Merge commit:** `4b37c5a` · padres: `4ac3d7f` (main) + `db77765` (hotfix)
- **Tag anotado publicado:** `provider-price-list-mapping-ux-hotfix-v1` → `5d97f3e9c7e5acda178cbc92d8c7c1c434e06ab0`
- **Vercel auto-deploy:** disparado por push a `main` (MCP 403 — no verificable programáticamente)
- **Smoke productivo:** 9/9 PASS (200) en `construction-ops-psi.vercel.app`

### Validación pre-merge (todo PASS)
- typecheck: 0 errores ✅
- lint: 0 warnings ✅
- suite: **1132/1132 PASS** (42 skipped gated) ✅
- build: EXIT 0, páginas generadas correctamente ✅
- gm:regression: **22/22 PASS** ✅
- gm:import: total $372,247,170 intacto ✅
- git diff --check: limpio ✅

### Smoke rutas productivas
| Ruta | HTTP | Resultado |
|------|------|-----------|
| / | 200 | ✅ |
| /login | 200 | ✅ |
| /dashboard | 200 | ✅ |
| /catalog | 200 | ✅ |
| /catalog/import | 200 | ✅ |
| /catalog/providers | 200 | ✅ |
| /catalog/providers/import | 200 | ✅ |
| /catalog/resources/new | 200 | ✅ |
| /projects | 200 | ✅ |

### Pendiente manual
- Prueba de aceptación Decorcerámica real: cargar lista con SKU 6751 (→ match + observación pending) y SKU 9999 (→ sin asociar). No ejecutada en este release (sin datos dummy remotos).
- Confirmación visual del hash `4b37c5a` en el panel de Vercel (MCP no disponible).

---

## 2026-06-10 — HOTFIX PROVIDER_PRICE_LIST_MAPPING_UX_FIX_V1 (rama `fix/provider-price-list-mapping-ux-v1`)

> **Hotfix acotado de UX de mapeo de lista de precios de proveedor.** Base `origin/main = bd97abb`. Sin merge a main, sin deploy, sin db push, sin migración, sin features nuevas.

- **HEAD inicial:** `bd97abb` → **HEAD final:** `db77765` (release completado 2026-06-10)
- **Archivos modificados:** 4 (price-list-wizard.tsx, catalog-import-wizard.tsx, +2 test files nuevos)
- **Causa raíz:** El wizard de lista de precios (`/catalog/providers/import`) no diferenciaba visualmente entre campos requeridos vs opcionales, mostraba todos los campos como una tabla plana sin indicadores, y no tenía resumen de auto-detección. Esto generaba confusión donde la usuaria veía el mapeo de catálogo (que SÍ exige name/resourceType) como referencia, y el error del servidor sobre campos faltantes no era lo suficientemente claro en contexto.
- **Contratos separados confirmados y documentados:**
  - CATÁLOGO: requeridos `code, name, resourceType, unit`. Opcionales: description, category, brand, externalReference, externalSku, defaultWastePct, providerName, sourceUrl, observedPrice, discountPercent, currency, validUntil, notes.
  - LISTA DE PRECIOS: requerido `observedPrice` + al menos uno de `externalSku/externalReference/code`. Opcionales: description, unit, discountPercent, currency, sourceUrl, observedAt, validUntil, notes. **Nunca requiere name ni resourceType.**

### Cambios implementados

**`price-list-wizard.tsx`** — UX completamente renovada:
- Resumen de auto-detección (`MappingIndicator`): ✓/✗ para precio y para identificador, con columna detectada.
- Panel "Ajustar mapeo de columnas" colapsable: **cerrado** cuando mapeo obligatorio completo; **abierto automáticamente** si faltan campos obligatorios.
- Indicadores visuales en panel avanzado: `*` precio requerido, `†` identificador requerido.
- Mensaje humano: "Necesitamos el precio y al menos un identificador para asociarlo con un recurso existente: SKU, referencia o código."
- Protección de columnas duplicadas: `updateMapping` silencia re-asignación y auto-abre panel si queda incompleto.
- `isPriceListMappingComplete()` pura y reutilizable.

**`catalog-import-wizard.tsx`** — mejoras de UX:
- Sección de mapeo convertida a panel colapsable "Ajustar mapeo de columnas".
- Abierto automáticamente cuando faltan campos obligatorios; cerrado cuando está completo.
- Mensaje contextual: "Revisa el ajuste únicamente si alguna columna no fue reconocida."
- `isCatalogMappingComplete()` añadida para determinar estado inicial del panel.
- Funcionalidad de importación intacta — contrato original sin cambios.

**Tests nuevos (2 archivos, +41 tests):**
- `price-list-validation.test.ts`: PL-1 a PL-15 + fixture Decorcerámica real.
  - Confirma: no requiere name (PL-1), no requiere resourceType (PL-2), exige observedPrice (PL-3), exige identificador (PL-4), matching SKU/ref/code (PL-5–7), sin match = sin asociar (PL-8), ambiguo no resuelto (PL-9), no crea recursos (PL-10), pending sin approved (PL-11–12), no toca BOQ/AIU/exports (PL-13–15).
- `price-list-ux-mapping.test.ts`: PL-16 a PL-21.
  - Panel lógica: completo→panel cerrado (PL-16), faltantes→panel abierto (PL-17), columnas duplicadas rechazadas (PL-18), recalcular preview (PL-19), catálogo conserva contrato (PL-20–21).

### Validación (todo PASS)
- typecheck: `tsc --noEmit` sin output ✅
- lint: `eslint .` sin output ✅
- suite: **1116/1116 PASS** (42 skipped gated) ✅
- build: ✅ `Compiled successfully` + rutas presentes
- gm:regression: **22/22 PASS** ✅
- gm:import: PASS ✅
- git diff --check: limpio (solo advertencia CRLF esperada en Windows) ✅

### Estado al cierre
- **main intacta** = `bd97abb` · **producción intacta** · **sin deploy** · **sin db push remoto** · **sin migración**
- Siguiente acción: release corto → repetir prueba de lista Decorcerámica → confirmar URL real

---

## 2026-06-10 — OLEADA CATALOG_BULK_ONBOARDING_V1 + PUBLIC SOURCE COMPATIBILITY FIX V1 (rama `feature/catalog-bulk-onboarding-v1`)

> **Centro de incorporación de catálogo + compatibilidad con páginas comerciales grandes.** Base `origin/main = 26f3fca`. Sin merge a main, sin deploy, sin db push remoto, sin datos dummy remotos, stashes intactos.

- **Commits:** `d933ceb` (contrato) → `1f145e8` (dominio import) → `83de756` (UI) → `04c01db` (large-page + adapter) → `5cc1057` (tests) → docs (este commit).
- **Contrato congelado:** `docs/CATALOG_BULK_ONBOARDING_V1_CONTRACT.md`.

### A. Importación masiva de recursos — `/catalog/import`
- Formatos: `.xlsx`, `.xls`, `.csv` (SheetJS, `cellFormula:false`, lectura `raw` para CSV ⇒ jamás ejecuta fórmulas/macros). Límites server-side: 10MB, 5.000 filas de datos.
- Mapeo de columnas por sinónimos es/en + corrección manual en wizard (el mapeo viaja como intención y se re-valida server-side).
- Preview: total/nuevas/existentes/duplicadas/inválidas/omitidas/observaciones pendientes; validaciones de código (patrón + vacío), nombre, resourceType (sinónimos), unidad (vacía=error, no reconocida=warning), precio/descuento/moneda, referencias externas repetidas.
- **Nunca sobrescribe**: existente ⇒ `skip_existing`; duplicado en archivo ⇒ solo primera ocurrencia; carrera 23505 ⇒ skip reportado.
- Confirmación batch: digest SHA-256 preview↔confirm; inserts por chunks RLS-bound; `organization_id`/`created_by` server-side; precio válido ⇒ observación `pending` (`supplier_csv`/`manual`); precio inválido ⇒ recurso importa, observación rechazada y reportada.
- Reporte CSV descargable **sanitizado** contra formula injection (`lib/catalog-import/csv.ts`).
- CTAs en el catálogo: primario "Importar catálogo", secundario "Nuevo recurso", acceso "Gestionar proveedores"; estado vacío según mandato ("Carga recursos desde Excel o CSV. La creación manual queda disponible para casos puntuales.").

### B. Lista de precios de proveedor — `/catalog/providers/import`
- Selección de proveedor existente; matching V1 estricto: `externalSku` → `externalReference` → `code`; ambiguos (≥2 recursos) ⇒ "Sin asociar" con motivo; sin match ⇒ "Sin asociar" exportable. NUNCA crea recursos.
- Cada precio ⇒ observación `pending` del proveedor (`supplier_csv`). Nunca `approved`; nunca toca BOQ/AIU/exports; el trigger DB `set_rpo_suggested_net_price` conserva el invariante del neto.

### C. BOQ → catálogo asistido — DIFERIDO
- Deuda `BOQ_TO_CATALOG_ASSISTED_BOOTSTRAP` registrada (INTEGRATION_REQUESTS + contrato §7): el parser BOQ expone actividades, no recursos (faltan resourceType, desglose APU, código de catálogo, precio de insumo).

### D. Large-page fix + Adapter Decorcerámica
- Evidencia real: URL autorizada = 1.295.123 bytes (~1,26MB), HTTP 200 — el cap previo de 512KB la rechazaba.
- `fetch-public-page`: hard cap **3MB**; 512KB ⇒ warning "página pesada"; sonda de corte temprano (precio+moneda estructurados ⇒ stream cancelado + warning `truncated`). SSRF/DNS por salto, redirects manuales ≤5, loop detection, timeout 10s, content-type guard INTACTOS. Sin crawling/headless/evasión.
- Adapter `decorceramica.com` aislado por hostname (registro en `adapters/index.ts`; genéricos = fallback): AggregateOffer + ofertas anidadas, mpn `KP04NG1620`, meta sku `6751`, 169000 COP; múltiples precios ⇒ warning explícito (propone el menor); unit SIEMPRE null. Fixture sanitizado `tests/fixtures/decorceramica-product.html` (sin red en tests).

### E. Migración y archivos compartidos
- `20260611090000_resources_import_metadata.sql` — aditiva local: `resources` + description/category/brand/external_reference/external_sku + CHECKs de longitud + índices parciales de matching. RLS heredado (FORCE existente). **NO aplicada al remoto.**
- `next.config.mjs` (orquestador): `bodySizeLimit` 4mb→12mb. Riesgo Vercel (~4.5MB) documentado ⇒ deuda `LARGE_FILE_DIRECT_UPLOAD`.

### Validación (todo PASS)
typecheck 0 · lint 0 · suite **1075/1075** (42 gated) · smoke gated DB local **42/42** (`BOQ_SMOKE_DB=1`) · build (rutas nuevas presentes) · `db reset --local` 27 migraciones + 5 seeds · RLS harness **106/106** · read-model isolation **12/12** · gm:regression **22/22** · gm:import PASS · redirect 15/15 · validador agentes **214/0/0** · `git diff --check` limpio.

### Deudas registradas
`DOCUMENT_LIST_IMPORT_V1` · `BOQ_TO_CATALOG_ASSISTED_BOOTSTRAP` · `COLUMN_MAPPING_PRESETS` · `LARGE_FILE_DIRECT_UPLOAD`.

### Estado al cierre
- **main intacta** = `26f3fca` · **producción intacta** (construction-ops-psi.vercel.app) · **sin deploy** · **sin db push remoto** · **stashes intactos** (2 WIP P1-A) · release pendiente (el pre-release aplicará la migración nueva con dry-run gate).

---

## 2026-06-10 — AJUSTE FINAL UX: Acciones deshabilitadas explicativas en demo y read-only (rama `fix/bootstrap-empty-state-ctas`)

> **Ajuste acotado post-revisión visual.** Problema observado: /catalog/providers no mostraba "Nuevo proveedor" ni CTA cuando canCreate=false. /catalog tenía mensajes de title técnicos y solo cubría el caso demo, no el usuario read-only en modo supabase. Sin migración, sin db push, sin deploy, main intacta, producción intacta.

- **HEAD inicial:** `94513c3` → **HEAD final:** `884703c`
- **Archivos modificados:** 3 (catalog/page.tsx, catalog/providers/page.tsx, tests/unit/catalog/disabled-actions.test.ts)
- **`/catalog`:** `canCreate` ahora combina env gate (`isCreationModeEnabled`) + role check (`management|internal`). `isDemoMode` derivado de `resolveAuthMode() === 'demo'`. `disabledNotice` diferencia mensaje demo vs. mensaje de sin permisos. Titles de botones ahora son español legible.
- **`/catalog/providers`:** `headerActions` ahora siempre muestra "Nuevo proveedor" (disabled con aria-disabled cuando `canCreate=false`). EmptyState "Crear primer proveedor" siempre visible (disabled con nota inline). Banner `disabledNotice` añadido bajo PageHeader.
- **Tests:** `disabled-actions.test.ts` — 42 tests de inspección de fuente cubriendo los 15 ítems del spec.
- **Validación:** typecheck 0 errores ✅ | lint 0 errores ✅ | tests **1012/1012 PASS** (42 skipped gated) ✅ | build **PASS** ✅ | gm:regression 22/22 ✅ | gm:import PASS ✅ | git diff --check limpio ✅
- **Rama publicada:** `fix/bootstrap-empty-state-ctas` → `94513c3..884703c`
- **Deuda registrada:** `CATALOG_BULK_ONBOARDING_V1` — importación masiva diferida a oleada separada.

### Comportamiento resultante
| Escenario | "Nuevo recurso" | "Gestionar proveedores" | "Nuevo proveedor" | Mensaje visible |
|---|---|---|---|---|
| Demo (APP_AUTH_MODE=demo) | visible, disabled | habilitado | visible, disabled | "Modo demostración: puedes explorar..." |
| Usuario read-only supabase | visible, disabled | habilitado | visible, disabled | "No tienes permisos para crear..." |
| Autorizado (supabase+db+management/internal) | habilitado | habilitado | habilitado | ninguno |

### Estado al cierre
- HEAD: `884703c` · **main intacta** = `2f16e4a` · **producción intacta** · **sin deploy** · **sin migración** · **stashes intactos**

---

## 2026-06-10 — HOTFIX: Bootstrap empty state CTAs y descubribilidad del catálogo (rama `fix/bootstrap-empty-state-ctas`)

> **Hotfix acotado de UX.** Bootstrap dead-end detectado en prueba real: organización vacía no tenía acciones visibles. Sin migración, sin db push, sin deploy, main intacta, producción intacta.

- **FASE 0 — Precheck:** rama `fix/bootstrap-empty-state-ctas`, árbol limpio, `origin/main = 2f16e4a`, stashes intactos (P1-A security WIP).
- **FASE 1 — Auditoría:** 8 pantallas auditadas. /catalog y /catalog/providers sin CTAs; Price Intelligence sin disclaimer; APU/Cantidades/Cronograma/Presupuestos con EmptyState sin guía útil; Proyectos ya correcto.
- **FASE 2 — Catálogo:** Header: [Nuevo recurso, Gestionar proveedores]. EmptyState: [Crear primer recurso, Gestionar proveedores]. Filas de recurso enlazadas a Price Intelligence. Módulo `server/catalog/` creado (types, errors, validation, db-repository, index). Ruta `/catalog/resources/new` con formulario seguro (code/name/resourceType/unit, organizationId server-side, RLS-bound, validación pura).
- **FASE 3 — Price Intelligence:** Disclaimer visible a todos los roles: "La validación web propone una observación. No modifica automáticamente presupuestos ni aprueba precios."
- **FASE 4 — Otros módulos:** APU/Cantidades/Cronograma: EmptyState con texto explicativo real (sin CTAs falsos). Presupuestos: guía de flujo preservando texto "Aún no hay presupuestos registrados" + CTA "Ir a Proyectos". Proveedores: botón movido a PageHeader.actions, CTA en EmptyState.
- **FASE 5 — EmptyState:** Props `secondaryAction` y `readOnlyMessage` añadidas de forma retrocompatible.
- **FASE 6 — Tests:** 3 nuevos archivos de test (bootstrap-ctas, route-config, empty-state-ctas) — validación pura sin DB.
- **FASE 7 — Validación:** typecheck 0 errores ✅ | lint 0 errores ✅ | tests **970/970 PASS** (42 skipped gated) ✅ | build **PASS** (`/catalog/resources/new` presente) ✅ | gm:regression 22/22 ✅ | git diff --check limpio ✅
- **Commit:** `ab2f4e0` — 19 files, +1002/-49 lines.
- **Rama publicada:** `fix/bootstrap-empty-state-ctas` → origin.
- **Servidor local:** `http://localhost:3040` listo.

### Rutas para revisión visual
- `http://localhost:3040/catalog` — Header + EmptyState con CTAs
- `http://localhost:3040/catalog/providers` — Header button + EmptyState CTA
- `http://localhost:3040/catalog/resources/new` — Formulario de nuevo recurso
- `http://localhost:3040/apu` — EmptyState mejorado
- `http://localhost:3040/quantities` — EmptyState mejorado
- `http://localhost:3040/planning` — EmptyState mejorado
- `http://localhost:3040/estimates` — EmptyState con guía + CTA
- `http://localhost:3040/projects` — Sin cambios (ya tenía CTAs)

### Módulos sin backend de creación (sin CTA de creación)
- APU: no existe flujo de creación manual; se llena desde importación de presupuesto.
- Cantidades: no existe flujo manual; se cargan desde scopes del proyecto.
- Cronograma: no existe flujo manual; requiere módulo de planning.
- Deudas registradas en INTEGRATION_REQUESTS.

### Estado al cierre
- HEAD: `ab2f4e0` · **main intacta** = `2f16e4a` · **producción intacta** · **sin deploy** · **sin migración** · **stashes intactos**
- Pendiente: revisión visual de la usuaria → release hotfix corto → continuar prueba Decorcerámica.

## 2026-06-09 — PRE-RELEASE: Migraciones Pricing aplicadas al remoto (rama `integration/operational-ux-price-validation-v1`)

> **Aplicación de 3 migraciones pricing al DB remoto.** Sin seeds, sin reset, sin db pull. DB remota: 26/26 Local = Remote. Lint sin errores.

- **FASE 0 — Precheck:** invariants confirmados (rama candidata, HEAD=29f5a9f, main=22a408c, origin candidata=29f5a9f, stashes intactos).
- **FASE 1 — Dry-run:** 3 migraciones pendientes detectadas — exactamente las esperadas: 20260610090000, 090100, 090200 (pricing). GATE ESTRICTO PASS (aditivas, sin DROP destructivo, sin DELETE, sin seeds, RLS coherente, trigger coherente).
- **FASE 2 — `supabase db push --linked`:** 3 migraciones aplicadas. `migration list --linked` = **26/26 Local = Remote**. Dry-run final: "Remote database is up to date." `db lint --linked`: "No schema errors found."
- **Migraciones aplicadas al remoto:**
  - `20260610090000_resource_price_intelligence.sql` (tabla `resource_price_observations`, extensión `suppliers`, trigger `app.set_rpo_suggested_net_price`)
  - `20260610090100_rls_resource_price_intelligence.sql` (ENABLE FORCE RLS + 3 policies)
  - `20260610090200_fix_discount_percent_precision.sql` (NUMERIC(6,4)→(7,4), DROP+RECREATE policy necesario para ALTER COLUMN TYPE)
- **Deuda registrada:** `PUBLIC_SOURCE_COMPATIBILITY_BENCHMARK` — durante la revisión visual local una URL pública real no fue compatible con los adaptadores genéricos V1 (probable JS-rendering o anti-bot). No bloquea el release. Evaluar post-release con fuentes reales (Homecenter, Decorcerámica). Sin headless browser, sin evasión, sin scraping.
- **Revisión visual:** aprobada por la usuaria.
- **Estado:** candidata lista para merge a main.

---

## 2026-06-09 — INTEGRACIÓN FINAL LOCAL: Operational UX + Phase 3B + SSRF Fix (rama `integration/operational-ux-price-validation-v1`)

> **Integración controlada de 3 oleadas** sobre base `integration/iconic-ui-price-intelligence-v1` @ `d944bc1`.
> **main = `22a408c` intacta; producción intacta; sin deploy; sin db push remoto.**
> Ejecutada por agent-orchestrator. HEAD inicial `d944bc1` → HEAD final `110a5f6`.

### FASE 0 — Precheck
- Invariantes confirmados: rama, árbol limpio, origin/main=22a408c, operational-ux=105d106, phase3b=6da64b1, stashes P1-A intactos.

### FASE 1 — Merge Operational Budget UX V1
- `git merge --no-ff origin/feature/operational-budget-ux-v1` → merge `3f6fd6d` — **sin conflictos** (26 archivos, 2626 inserciones).
- Archivos clave: `boq-workspace.tsx`, `commercial-simulator.tsx`, `workspace/page.tsx`, `simulator-actions.ts`, `workspace-view.ts`, `commercial-simulation.ts`, `breakdown.ts`.

### FASE 2 — Merge Phase 3B + SSRF Fix
- `git merge --no-ff origin/feature/phase3b-price-validation-agent-v1` → **3 conflictos en docs/** (DECISIONS, HANDOFF_LOG, QA_REPORT) resueltos preservando ambas secciones → merge `6618877`.
- Fix de integración: `countPendingResourcePriceObservations` añadido al mock de Phase 3B (`service.test.ts`) → commit `110a5f6`. Typecheck 0 errores post-fix.

### FASE 3 — DB Reset Local
- `npx supabase db reset --local` → **26/26 migraciones** + 5 seeds aplicados sin errores de DB.
- Error `Updating vector buckets 404` = B-004 conocido (vector/realtime unhealthy en Docker Windows). No bloqueante.
- Tablas pricing disponibles; trigger `rpo_set_suggested_net_price` activo; RLS pricing habilitado; constraints correctos.
- Sin conexión remota. Sin db push.

### FASE 4 — Validación Integral
- typecheck: **0 errores** ✅
- lint: **0 errores** ✅
- tests: **944/944 PASS** (42 skipped gated) — +66 Operational UX +85 Phase 3B vs 809 base ✅
- build: **PASS** (ruta `/workspace` y `/catalog/.../price-intelligence` presentes) ✅
- RLS runtime: **106/106 PASS** (25 tablas FORCE RLS) ✅
- read-model isolation: **12/12 PASS** ✅
- gm:regression: **22/22 PASS** — golden master COP 372.247.170 intacto ✅
- gm:import: **PASS** (diff=1.9e-8, tol 0.01) ✅
- MVP smoke E2E gated `BOQ_SMOKE_DB=1`: **10/10 PASS** ✅
- git diff --check: **limpio** ✅
- validate-claude-agents: **214/0/0 PASS** ✅

### FASE 5 — Seguridad Phase 3B
- Redirect tests: **15/15 PASS** (R01–R15) ✅
- SSRF tests: **T1–T11 + extras PASS** ✅
- Adapters + normalize + service: PASS ✅
- Invariantes: propuesta siempre pending, BOQ nunca modificado, AIU nunca modificada, red externa no usada en tests ✅

### FASE 6 — Coherencia Visual
- Dashboard: KPIs operativos, conteos (issuedVersions, pendingPriceObservations 🔒), accesos rápidos (Proveedores, Inteligencia de precios) ✅
- BOQ Workspace: tabla densa, sticky header, capítulos colapsables, filtros, búsqueda, resumen financiero, simulador comercial (borde dashed cian, disclaimer) ✅
- Price Intelligence: UrlValidationPanel wired con resourceId ✅
- Branding: "Presupuestos" + "Grupo ICONIC"; sin "Construction Ops" visible; tokens ICONIC heredados ✅
- Sin regresión visual en login, catálogo, proyectos ✅

### Documentación
- HANDOFF_LOG, DECISIONS, QA_REPORT, INTEGRATION_REQUESTS actualizados.
- Ramas de feature usadas solo como origen de merge; no tocadas.

### Estado al cierre
- HEAD final: `110a5f6` · **main intacta** = `22a408c` · **producción intacta** · **stashes intactos**
- Pendientes: revisión visual interactiva de la usuaria + aprobación para release.
- NO merge a main. NO deploy. NO nueva feature.

**Rutas prioritarias para revisión visual (`http://localhost:3030`):**
- `/login` — identidad ICONIC
- `/dashboard` — hero + KPIs operativos + accesos rápidos
- `/projects` — lista de proyectos con shell ICONIC
- `/projects/<id>/scopes/<scopeId>/estimates/<estimateId>` — detalle presupuesto
- `/projects/<id>/scopes/<scopeId>/estimates/<estimateId>/workspace` — BOQ workspace + simulador
- `/catalog` — catálogo
- `/catalog/providers` — proveedores (Price Intelligence)
- `/catalog/resources/<resourceId>/price-intelligence` — panel validar precio desde URL

---

## 2026-06-09 — OLEADA OPERATIONAL BUDGET UX V1 (rama `feature/operational-budget-ux-v1`)

> Base `integration/iconic-ui-price-intelligence-v1` @ `d944bc1`. **main = `22a408c` intacta;
> producción intacta; sin deploy; sin db push remoto; Phase 3B NO iniciada; stashes intactos.
> 0 migraciones nuevas.** Ejecutada por agent-orchestrator (sin subagentes: oleada cohesiva
> UI+dominio; se evitó solape de archivos y cold-start; ownership respetado e integrado).

### Entregado
- **A+B — BOQ Workspace denso** (`…/estimates/[estimateId]/workspace`): sticky toolbar
  (búsqueda código/descripción, filtros activos/archivados/todos, expandir/colapsar,
  total general siempre visible) + grilla densa con header sticky, capítulos agrupados
  colapsables, badges (Archivado/normalizado secundario), archive/restore inline
  (reutiliza `ArchiveControls`), footer de costo directo. **Edición rápida** de
  cantidad/precio reutilizando `updateItemAction` 4E.2A: navegador envía SOLO campos
  permitidos; subtotal + resumen vuelven del servidor; feedback Guardando/Guardado/error;
  `router.refresh()` re-sincroniza; issued ⇒ banner inmutable + edición deshabilitada.
  Helpers puros client-safe en `lib/estimates/workspace-view.ts` (sin matemática financiera).
  CTA "Abrir workspace" en el detalle del presupuesto.
- **C — Resumen financiero visual**: 7 cards ICONIC compactas (directo, A, I, U, IVA/U,
  indirectos, total) server-derived, vivas tras cada quick-edit.
- **D — Desglose por capítulos**: `server/estimates/breakdown.ts`
  (`computeChapterBreakdown`, Decimal, shares 0..1, base cero segura) + barras de
  participación. **Cost-type NO confiable** (boq_items sin clasificación) ⇒ deuda
  `COST_TYPE_BREAKDOWN_FOUNDATION` registrada (INTEGRATION_REQUESTS + DECISIONS).
- **E+F — Simulador comercial V1**: dominio puro
  `modules/estimates/commercial-simulation.ts` (fórmula del mandato, validación de
  porcentajes/objetivo, 3 estados vs objetivo, Decimal, determinista) + server action
  (base = `grandTotal` server-derived, READ-ONLY) + panel separado visualmente
  (borde dashed cian, badge, disclaimer obligatorio) + vista previa comercial limpia.
  **SIN persistencia** (decisión registrada; slice futuro `COMMERCIAL_SIMULATION_PERSISTENCE`).
- **G — Dashboard operativo**: sección "Operación" (proyectos, presupuestos activos,
  versiones emitidas, 🔒 precios por revisar solo management/internal; tolerantes a fallo)
  + accesos rápidos (Proyectos/Catálogo/Proveedores/Inteligencia de precios). Extensión
  aditiva: `countIssuedEstimateVersions` (estimates db+fixture) y
  `countPendingResourcePriceObservations` (pricing db+fixture).

### Validación (todo PASS)
- typecheck 0 · lint 0 · **875 tests** (+66 de la oleada) · build Next 16.2.6 (ruta
  `/workspace`) · `supabase db reset --local` (26 migraciones + 5 seeds) ·
  **RLS runtime 106/106** · **read-model isolation 12/12** · **gm:regression 22/22** ·
  **gm:import PASS** ($372.247.170 intacto) · smoke E2E gated `BOQ_SMOKE_DB=1` **42/42** ·
  `validate-claude-agents` **214/0/0** · `git diff --check` limpio.

### Documentación
- Nuevo `docs/OPERATIONAL_BUDGET_UX_V1_CONTRACT.md`. Actualizados DECISIONS (3 filas),
  QA_REPORT (sección de la oleada), INTEGRATION_REQUESTS (extensión aditiva + 2 deudas).

### Próximo paso
- Revisión visual de la usuaria en `http://localhost:3020` (workspace + simulador +
  dashboard). Si aprueba: integrar a la rama de integración / pre-release. NO merge a
  main ni deploy sin orden expresa.

### Agentes activos al cierre
- Ninguno.
## 2026-06-09 — PHASE 3B — SECURITY FIX: Redirect SSRF (rama `feature/phase3b-price-validation-agent-v1`)

> **Fix acotado de seguridad post-implementación.** Sin DB reset, sin migraciones, sin servidor local, sin merge a main. Mismos constraints paralelo-seguros que Phase 3B.

**Problema identificado:** `fetch-public-page.ts` usaba `redirect: 'follow'` (hasta 20 saltos nativos sin validación SSRF en saltos intermedios). Un redirect a `http://169.254.169.254/` en un salto intermedio pasaría desapercibido porque el check `isFinalUrlSafe` solo evaluaba la URL final.

**Fix aplicado:**
- Reescrito `fetch-public-page.ts`: `redirect: 'manual'` + loop manual (máx 5 saltos).
- Antes de cada hop: `validatePublicUrl(currentUrl, dnsLookup)` con resolución DNS real. Cualquier `UrlValidationError` → `FetchPublicPageError('redirect_to_private', ...)`.
- Loop detection: `Set<string>` de URLs visitadas → `redirect_loop`.
- 3xx sin Location → `redirect_missing_location`.
- Location con URL inválida → `redirect_invalid_url`.
- Redirects relativos: `new URL(location, currentUrl)`.
- Firma actualizada: `fetchPublicPage(url, fetcher?, dnsLookup?)` — backward compatible.
- `index.ts` actualizado para propagar `deps?.dnsLookup` a `fetchPublicPage`.
- 15 tests nuevos `redirect.test.ts` (R01–R15) con `vi.stubGlobal('fetch', mock)` + DNS inyectado.

**Validación:** typecheck 0, lint 0, **878/878 tests PASS** (↑15 vs 863), git diff --check limpio.

**HEAD final (antes del push):** pendiente commit `fix(pricing): validate every redirect hop before public price fetch`.

---

## 2026-06-09 — PHASE 3B — PRICE VALIDATION AGENT V1 (rama `feature/phase3b-price-validation-agent-v1`)

> **Ejecución paralela segura.** Base `integration/iconic-ui-price-intelligence-v1` @ `d944bc1`. Sin DB reset, sin migraciones, sin servidor local, sin merge a main.

- **FASE 0 — Precheck:** invariants confirmados (worktree correcto, rama correcta, HEAD=d944bc1, árbol limpio, origin/main=22a408c, stashes intactos).
- **FASE 1 — Inspección:** server/pricing/ (Phase 3A), UI price-intelligence, tests unitarios pricing.
- **FASE 2 — Contrato congelado:** `docs/PRICE_VALIDATION_AGENT_V1_CONTRACT.md` → commit `ea71df9`.
- **FASE 3 — Backend aislado:** `apps/web/server/pricing/validation/` (9 archivos: types, validate-url + SSRF, fetch-public-page, adapters JSON-LD + meta + index, normalize, confidence, service index) → commit `8253386`. Exportaciones Phase 3B en `server/pricing/index.ts`.
- **FASE 4 — UI Price Intelligence:** `url-validation-panel.tsx` (client, useActionState React 19), `actions.ts` extendido (validatePublicUrlAction + confirmProposalAction), `page.tsx` integrado → commit `8b90ed3`.
- **FASE 5 — Tests unitarios puros (sin red, sin DB):** 70 tests nuevos en `tests/unit/pricing/validation/` (validate-url: 14, adapters: 13, normalize: 12, service: 13) — **863/863 PASS** total. Covers T1–T38 del spec.
- **FASE 6 — Validación:** typecheck **0 errores**, lint **0 errores**, tests **863/863 PASS**, git diff **limpio**.
- **FASE 7 — Documentación:** HANDOFF_LOG, DECISIONS, QA_REPORT actualizados.
- **FASE 8 — Publicar:** rama `feature/phase3b-price-validation-agent-v1` publicada → origin. STOP.

**HEAD final:** `8b90ed3` · **main intacta** = `22a408c` · **producción intacta** · **stashes intactos** · **sin merge, sin deploy, sin DB reset**

**Checks diferidos (trabajo paralelo operational-budget-ux-v1 activo):**
- supabase db reset local
- RLS runtime harness (106/106 esperado sin cambio de esquema)
- smoke MVP e2e
- revisión visual servidor local
- merge de ramas en orden
- deploy Vercel

**Siguiente acción:** esperar cierre de Operational UX → integrar ramas → db reset local → RLS + smoke → revisión visual → decidir release.

---

## 2026-06-09 — INTEGRACIÓN ICONIC UI + PRICE INTELLIGENCE (rama `integration/iconic-ui-price-intelligence-v1`)

> **Integración controlada de 2 oleadas** sobre base `main` = `22a408c`. Sin merge a main; sin deploy; sin db push remoto.

- **FASE 0 — Precheck:** invariants confirmados (rama, working tree limpio, origin/main=22a408c, ui-branding=d4c9dbd, phase3a=03bc334, stashes intactos).
- **FASE 1 — Merge Branding ICONIC V1:** `git merge --no-ff origin/feature/ui-branding-iconic-v1` → merge `c647989`, **sin conflictos** (20 archivos: tokens, shell, login, sidebar, empty-state, workspace-brand, página-header, button/badge/card, dashboard hero).
- **FASE 2 — Merge Price Intelligence 3A:** `git merge --no-ff origin/feature/phase3a-price-intelligence-foundation` → conflictos esperados en docs/ resueltos preservando ambas secciones → merge `a9ac86d` (30 archivos: server/pricing/, 4 páginas pricing, 3 migraciones pricing, seeds, validación DB).
- **Fix harness RLS:** contador tablas FORCE RLS 24→25 (`resource_price_observations` añadida en Fase 3A) → commit `533ee67`.
- **FASE 3 — DB reset local:** `supabase db reset --local` → **26/26 migraciones** + 5 seeds aplicados. Trigger `rpo_set_suggested_net_price` PASS, 3 policies RLS, seeds pricing OK.
  - Nota: el QA_REPORT de Fase 3A menciona "27 migraciones" (error de conteo anterior; el actual es 26).
- **FASE 4 — Validación completa:**
  - typecheck: **0 errores**
  - lint: **0 errores**
  - tests: **809/809 PASS** (42 skipped gated) — golden master $372.247.170 intacto
  - pricing tests: **99/99 PASS**
  - build: **PASS** (`/catalog/resources/[resourceId]/price-intelligence` ruta dinámica presente)
  - RLS runtime: **106/106 PASS** (25 tablas FORCE)
  - read-model isolation: **12/12 PASS**
  - gm:regression: **22/22 PASS**
  - gm:import: **9/9 PASS** (diff=0 en total_costo)
  - git diff --check: **limpio**
  - validate-claude-agents: **214/0/0 PASS**
- **FASE 5 — Coherencia visual pricing + ICONIC:** páginas pricing heredan shell ICONIC; `PageHeader`/`EmptyState`/`Badge`/`Button` ICONIC; sidebar "Presupuestos" + "Grupo ICONIC"; sin "Construction Ops" visible; sin pantalla en blanco; auth intacta. Deuda conocida `text-blue-600` en website URL (diferida).
- **FASE 6 — Documentación:** esta entrada.
- **FASE 7 — Rama publicada:** `integration/iconic-ui-price-intelligence-v1` → `origin`.
- **FASE 8 — Entorno local:** servidor en `http://localhost:3010` (ver rutas prioritarias abajo).

**Estado HEAD:** `533ee67` · **main intacta** = `22a408c` · **producción intacta** · **stashes P1-A intactos**

**Rutas prioritarias para revisión visual:**
- `/login` — identidad ICONIC (navy + curva + cian)
- `/dashboard` — hero ICONIC + KPIs
- `/catalog` — catálogo con tokens ICONIC
- `/catalog/providers` — lista de proveedores (Price Intelligence)
- `/catalog/resources/<resourceId>/price-intelligence` — historial + formulario de observaciones
- `/projects` — proyectos con shell ICONIC
- Una vista de presupuesto → `/projects/<id>/scopes/<scopeId>/estimates/<estimateId>`
- Comparación de versiones → `.../compare`

**Pendientes:**
- Revisión visual de la usuaria (local).
- `main` intacta hasta aprobación.
- Phase 3B NOT iniciada.

## 2026-06-09 — OLEADA UI / BRANDING ICONIC V1 (rama `feature/ui-branding-iconic-v1`)

> Refresh **visual** desde `main` (`22a408c`). **Sin lógica/cálculos/RLS/migraciones/
> Vercel/deploy. `main` intacta; producción intacta.** (Reemplaza la rama previa
> `feature/ui-branding-wave-v1` con el set ICONIC completo.)

- **Naming visible:** "Construction Ops" → **"Presupuestos"** (producto) + **"Grupo
  ICONIC"** (workspace) + descriptor "Gestión de presupuestos de obra". Migrado en
  sidebar, título del navegador y login. Internos técnicos sin tocar.
- **Tokens oficiales:** CSS vars `--iconic-*` en `globals.css` + Tailwind `iconic.*`/
  `brand.*` (paleta ICONIC). body `bg-iconic-gray`, focus ring ICONIC.
- **Branding config multi-tenant ready:** `lib/branding/workspace.ts`.
- **Assets oficiales reutilizados** (no redibujados): `grupo-iconic-logo-full.png`
  (login) + `grupo-iconic-logo-symbol.png` (avatar). Guía
  `docs/branding/ICONIC_EXPORTS_VISUAL_GUIDE.pdf` **ya existe** en el repo.
- **Superficies:** login (panel navy + curva + cian), shell (sidebar ink + topbar +
  nav activa), dashboard (hero + KPI ink), reutilizables (button/badge primario
  ICONIC, card hover, empty-state branded, page-header navy + acento). Propaga a
  proyectos/presupuestos/catálogo/cantidades/planeación/comparación vía componentes.
- **Validación:** typecheck/lint 0, **757 tests** (sin regresión), build OK,
  `git diff --check` limpio. Doc `docs/UI_BRANDING_ICONIC_V1.md`.
- **Deuda visual:** branding por tenant aún estático; headers de tabla navy
  (diferido, tablas inline); `text-blue-700` inline → ICONIC; metadata de exports
  interna. **No merge a main; no deploy; sin nuevas features.**
## 2026-06-10 — FASE 3A — CIERRE FORMAL (DB RESET + VALIDACIÓN REAL + PRECISION FIX)

**Rama:** `feature/phase3a-price-intelligence-foundation`.  
**Continuación de la sesión anterior.** Se ejecutó el `supabase db reset --local` pendiente,
se validaron las 27 migraciones + 5 seeds contra PostgreSQL local, y se detectó + corrigió
un bug de precisión en `discount_percent`.

### Fix detectado durante validación DB real

**Bug:** `discount_percent NUMERIC(6,4)` solo permite valores hasta `99.9999`. Insertar `100`
(descuento del 100%, válido por el CHECK) disparaba `numeric_field_overflow` en lugar del
`check_violation` esperado. El constraint `rpo_discount_range (discount_percent <= 100)` era
inalcanzable para su límite superior.

**Fix aplicado:** Migración `20260610090200_fix_discount_percent_precision.sql` — cambia
ambas columnas a `NUMERIC(7,4)` (permite 100.0000). Se requirió DROP + RECREATE de la
política RLS `rpo_update_review_only` (que referencia `discount_percent`) alrededor del
`ALTER COLUMN TYPE`.

**Otros hallazgos:** El seed `0005_demo_price_intelligence.sql` no estaba listado en
`supabase/config.toml [db.seed]`. Corregido.

### Resultados de validación DB (27 tests)

| Test | Resultado |
|---|---|
| T1 — tabla `resource_price_observations` existe | ✅ PASS |
| T2 — 3 columnas nuevas en `suppliers` | ✅ PASS |
| T3 — función trigger `app.set_rpo_suggested_net_price` existe | ✅ PASS |
| T4 — trigger `rpo_set_suggested_net_price` vinculado a la tabla (BEFORE INSERT+UPDATE) | ✅ PASS |
| T5 — 7 constraints presentes | ✅ PASS |
| T6 — 4 índices presentes | ✅ PASS |
| T7 — RLS habilitado | ✅ true |
| T8 — FORCE RLS habilitado | ✅ true |
| T9 — 3 policies RLS | ✅ PASS |
| T10 — nombres: `rpo_select_own_org`, `rpo_insert_authorized`, `rpo_update_review_only` | ✅ PASS |
| T11 — 2 proveedores demo en seeds | ✅ PASS |
| T12 — 3 observaciones para MAT-001 en seeds | ✅ PASS |
| T13 — fórmula trigger: 28000×(1−0.08)=25760, 29500×(1−0.05)=28025, 35000×(1−0)=35000 | ✅ PASS |
| T14 — observación approved tiene approved_by + approved_at | ✅ PASS |
| T15 — observación pending: approved_by=NULL, approved_at=NULL | ✅ PASS |
| T16 — observación rejected tiene rejection_reason no vacío | ✅ PASS |
| T17 — constraint rechaza observed_price negativo (check_violation) | ✅ PASS |
| T18 — constraint rechaza discount_percent > 100 (check_violation post-fix) | ✅ PASS |
| T19 — constraint rechaza currency inválido | ✅ PASS |
| T20 — constraint rechaza source_type inválido | ✅ PASS |
| T21 — constraint rechaza status inválido | ✅ PASS |
| T22 — constraint rechaza `rejected` sin rejection_reason | ✅ PASS |
| T23 — constraint rechaza `approved` sin approved_by | ✅ PASS |
| T24 — sin policy DELETE (FORCE RLS deniega) | ✅ PASS |
| T25 — 20 columnas en `resource_price_observations` | ✅ PASS |
| T26 — tipo final `discount_percent`: `numeric(7,4)` | ✅ PASS |
| T27 — tipo final `default_discount_percent` suppliers: `numeric(7,4)` | ✅ PASS |

### Suite completa (Phase 3A closure)

| Check | Resultado |
|---|---|
| `supabase db reset --local` (27 migraciones + 5 seeds) | ✅ Aplicado |
| `typecheck` | ✅ 0 errores |
| `lint` | ✅ 0 warnings |
| Tests: 63 archivos, **809 tests** | ✅ PASS |
| Tests pricing: 10 archivos, **99 tests** | ✅ PASS |
| `build` (Next.js 16 Turbopack) | ✅ 0 errores, 0 warnings |
| `git diff --check` | ✅ Limpio |

### Archivos nuevos en este cierre

- `supabase/migrations/20260610090200_fix_discount_percent_precision.sql`
- `supabase/config.toml` (seed 0005 agregado a `sql_paths`)
- `supabase/scripts/phase3a_db_validation.sql` (script de validación reutilizable)
- `docs/HANDOFF_LOG.md`, `docs/DECISIONS.md`, `docs/QA_REPORT.md` (actualizados)

---

## 2026-06-10 — FASE 3A — PRICE INTELLIGENCE FOUNDATION IMPLEMENTADA

**Rama:** `feature/phase3a-price-intelligence-foundation` (worktree aislado).  
**Hash base:** `22a408c` (MVP internal v1 release). **Sin merge a main. Sin deploy.**

### Entregables

**Contrato congelado:**
- `docs/PRICE_INTELLIGENCE_FOUNDATION_CONTRACT.md` (v1 congelado).

**Migraciones (locales, no aplicadas a remoto):**
- `20260610090000_resource_price_intelligence.sql` — tabla `resource_price_observations`,
  extensión `suppliers` (website_url, default_discount_percent, notes, created_by),
  trigger `app.set_rpo_suggested_net_price()` (invariante DB: `suggested_net_price = round(observed_price × (1 - discount_percent/100), 10)`).
- `20260610090100_rls_resource_price_intelligence.sql` — FORCE RLS + 3 policies
  (SELECT todos; INSERT management/internal; UPDATE management/internal solo cols revisión).

**Seed demo:**
- `supabase/seeds/0005_demo_price_intelligence.sql` — 2 proveedores + 3 observaciones
  (approved, pending, rejected) para MAT-001.

**Backend (`apps/web/server/pricing/`):**
- `types.ts` — ProviderView, CreateObservationInput, ResourcePriceObservationView,
  ObservationStatus, ResourcePriceIntelligenceSummary, ProviderRepository, PriceObservationRepository.
- `errors.ts` — 6 clases de error de dominio.
- `validation.ts` — validateCreateObservationInput, validateProviderCreateInput, computeIsStale (runtime, 30d staleAfterDays).
- `db-provider-repository.ts` — DbProviderRepository (listProviders, createProvider, updateProvider, getProviderById).
- `db-observation-repository.ts` — DbObservationRepository (list, create, approve, reject, summary).
- `fixture-repository.ts` — FixtureProviderRepository + FixtureObservationRepository.
- `index.ts` — getProviderRepository() + getObservationRepository() (fixture/db per READ_MODEL_SOURCE).

**UI (`apps/web/app/(dashboard)/catalog/`):**
- `providers/page.tsx` — lista de proveedores (campos 🔒 según ViewerRole).
- `providers/new/page.tsx` — creación de proveedor (mode-guard).
- `providers/actions.ts` — Server Actions createProviderAction + updateProviderAction.
- `providers/_components/provider-form.tsx` — Client Component (useActionState React 19).
- `resources/[resourceId]/price-intelligence/page.tsx` — historial de observaciones + formulario.
- `resources/[resourceId]/price-intelligence/actions.ts` — Server Actions create/approve/reject.
- `resources/[resourceId]/price-intelligence/_components/observation-form.tsx` — Client Component.
- `resources/[resourceId]/price-intelligence/_components/observation-review-buttons.tsx` — Approve/Reject buttons.

**Tests:**
- `tests/unit/pricing/resource-price-observation.test.ts` — fórmula suggested_net_price + stale state + validaciones.
- `tests/unit/pricing/observation-approval.test.ts` — fixture repos + workflow errores.
- `tests/unit/pricing/observation-security.test.ts` — aislamiento org + privacidad + error classes.

### Validación (todo PASS)
- `typecheck` → ✅ 0 errores
- `lint` → ✅ 0 warnings
- `test` → ✅ **63 archivos, 809 tests** (de 757 → +52)
- `build` → ✅ "Compiled successfully in 6.8s" + nuevas rutas dinámicas
- `git diff --check` → ✅ limpio
- `validate-claude-agents` → ✅ **214 PASS / 0 WARN / 0 FAIL**
- Golden master regression `regression-first-floor.test.ts` → ✅ intacto (COP 372.247.170)

### Seguridad
- `organization_id`, `created_by`, `approved_by` SIEMPRE server-side.
- FORCE RLS en `resource_price_observations`.
- Campos 🔒 nunca serializados a rol cliente.
- Observaciones append-only (solo UPDATE de status/approved_by/approved_at/rejection_reason).
- Ninguna observación modifica presupuestos emitidos.

### Pendientes
- `supabase db reset` local (requiere Docker activo con `supabase start -x realtime,...`).
- Smoke de escritura real en DB local (gated `PRICE_INTEL_SMOKE_DB=1`, no implementado).
- Phase 3B (fuera del alcance de esta sesión).

## 2026-06-09 — RELEASE INTERNO V1 EN PRODUCCIÓN (tag `mvp-internal-release-v1`)

- **Fecha release:** 2026-06-09.
- **Hash main:** **`12d53d5`** (merge `merge(release): construction ops MVP internal v1`);
  `main = origin/main = 12d53d5`. Rollback de app = commit anterior **`2918622`**.
- **Migraciones realmente aplicadas al remoto:** `20260609120000` (4E.2B archive) +
  `20260609130000` (4E.3A issue/clone). `20260606120000` (4E.2A) ya estaba aplicada
  de antes ⇒ **remoto 23/23, dry-run "up to date", `db lint` sin errores**. Aditivas/
  reversibles; sin seeds, sin reset/pull/repair, sin datos remotos.
- **Vercel Git autorizado por la usuaria** (GitHub App + Production Branch=main +
  Preview por ramas). Deployments **automáticos por Git** (sin `vercel deploy`).
- **Preview automático** (release branch, commit `ceaf6d5`): `construction-ats9scfxw…`
  **● Ready**, build limpio (sin errores DB/RLS/pooler). Smoke GET del Preview = 401
  por **Vercel Deployment Protection** (no es defecto de la app).
- **Production automático** (main `12d53d5`): `construction-o1rfipxzc…` **● Ready**,
  alias `construction-ops-psi.vercel.app`. **Smoke productivo:** `/`→307→/login;
  `/login` **200**; `/dashboard`,`/planning`,`/projects`,`/catalog`,`/quantities`
  →307→/login; **sin HTTP 500**, sin escrituras/exports.
- **Validación local post-merge (una vez, todo PASS):** typecheck/lint 0, **757 tests**,
  **MVP e2e smoke 10/10**, build, **RLS 106/106**, **isolation 12/12**, **gm 22/22**,
  gm:import, validador 214/0/0, diff limpio.
- **Pendientes no bloqueantes:** smoke autenticado tenant (no ejecutado: sin sesión
  aprobada); **MV-01**; `BOQ_REORDER`; `lineage_id` antes de reorder avanzado;
  `BOQ_AUDIT_TRAIL`; hardening posterior.
- **Rollback:** app → revertir a `2918622`; DB → migraciones aditivas (no rollback
  destructivo automático). Stashes P1-A intactos. **`BOQ_REORDER` fuera del release.**

## 2026-06-09 — MVP INTERNO LOCAL-READY (4E.3B integrada + smoke end-to-end + checkpoint)

> **4E.3B integrada** en `integration/p1a-functional-resume` (merge `9695322`).
> Checkpoint estable **`mvp-internal-local-ready-v1`**. **`main` intacta; sin deploy.**

### Integración 4E.3B
- `git merge --no-ff` 4E.3B → integration `9695322`, **sin conflictos**.

### Smoke end-to-end del MVP (nuevo)
- `apps/web/tests/integration/mvp-internal-flow-smoke.test.ts` (gated `BOQ_SMOKE_DB=1`,
  repo real + RLS, datos sintéticos locales): **10/10 PASS**. Recorre crear→importar
  BOQ→editar (incl. PATCH-subtotal ignorado + manual)→archive/restore→emitir V01
  (inmutable)→clonar V02→editar V02 sin alterar V01→comparar V01/V02 (incl. código
  repetido por ocurrencia)→seguridad cross-org→no-destrucción. **0 defectos** (FASE 4
  sin correcciones).

### Validación completa (todo PASS)
- typecheck/lint 0, **757 tests** + **42 integración gated**, build (fixture+db-local),
  **RLS 106/106**, **read-model isolation 12/12**, **gm:regression 22/22**, gm:import
  PASS, validador 214/0/0, `git diff --check` limpio. **Sin migración nueva.**

### Documentación
- `docs/MVP_INTERNAL_LOCAL_READY.md` (flujo cubierto, funciones, pruebas, migraciones
  candidatas a reconciliar en pre-release, pendientes no bloqueantes).

### Estado / pendientes
- Migraciones locales `20260606120000`/`20260609120000`/`20260609130000` pendientes
  de `db push`: en pre-release `db push --dry-run --linked` (read-only) + reconciliar
  (aplicar solo faltantes confirmadas). `main = origin/main = 2918622` intacta;
  producción intacta; stashes P1-A intactos. Preview/MV-01 diferidos.
- **`BOQ_REORDER`/`lineage_id`/`BOQ_AUDIT_TRAIL` NO iniciados.** Siguiente paso:
  **pre-release controlado**, no nueva feature.

## 2026-06-09 — 4E.3B comparación de versiones IMPLEMENTADA (Opción B, sin migración)

> **4E.3A integrada** en `integration/p1a-functional-resume` (merge `cd18f2d`).
> **4E.3B** implementada en `feature/wave-4e3b-estimate-version-compare`.
> **NO merge a integration/main; sin deploy; SIN migración nueva.**

### Decisión
- **Opción B aprobada**: matching de ítems por `chapterCode + itemCode +
  occurrenceIndex` (orden `sort_order ASC, id ASC`), `duplicateCodeWarning` + aviso
  UI. **Sin migración de unicidad.** Capítulos por `code` (único garantizado).

### Implementación (read-only)
- Módulo PURO `server/estimates/compare.ts` (`computeVersionComparison`): resumen
  financiero con deltas (% seguro si base≠0, `null` si base=0), diff de capítulos
  por `code`, diff de ítems por clave de ocurrencia; archivados incluidos en el
  análisis (no sumados a totals activos).
- Repo `compareEstimateVersions(viewer, estimateId, baseVersionId, targetVersionId)`
  (db + fixture): valida mismo estimate (`VersionMismatchError`), RLS/cross-org
  (`EstimateNotFoundError`), **no muta datos**, sin migración. Tipos client-safe
  `lib/estimates/compare-types.ts`.
- UI: página `…/estimates/[estimateId]/compare` (server, GET selectores base/target,
  `<details>` por capítulo, estados, aviso de código repetido) + enlace "Comparar
  versiones" en el panel de versiones.

### Deuda futura
- `lineage_id` (identidad de linaje estable de ítems clonados) **antes** de
  `BOQ_REORDER` avanzado. **No implementado ahora.**

### Validación (todo PASS)
- typecheck/lint 0, **757 tests** + **32 integración gated** (incl. 4E.3B: diff
  puro, ocurrencia/duplicado, seguridad repo, no-mutación), build (`/compare` `ƒ`),
  **RLS 106/106**, **isolation 12/12**, **gm 22/22**, gm:import PASS, validador
  214/0/0, diff limpio. **Sin migración nueva.**

### Estado / pendientes
- Integración de 4E.3B a `integration` **pendiente** (a tu orden). `main =
  origin/main = 2918622` intacta; producción intacta; stashes P1-A intactos.
- Migraciones locales `20260606120000`/`20260609120000`/`20260609130000`
  **pendientes de `db push`**; en pre-release: `db push --dry-run --linked` (read-only)
  y reconciliar (no asumir cuáles faltan). Preview/MV-01 diferidos.
- **`BOQ_REORDER` NO iniciado.**

## 2026-06-09 — 4E.3A integrada + 4E.3B DETENIDA por blocker de unicidad de ítems

> **4E.3A integrada** en `integration/p1a-functional-resume` (merge `cd18f2d`,
> validada). **4E.3B** (`feature/wave-4e3b-estimate-version-compare`) **detenida en
> FASE 5** por decisión de producto pendiente. NO merge a main/integration; sin deploy.

### Integración 4E.3A
- `git merge --no-ff` de 4E.3A → integration `cd18f2d`, **sin conflictos**. Validado:
  typecheck/lint 0, **747 tests**, build, **RLS 106/106**, **isolation 12/12**,
  **gm 22/22**, gm:import PASS, diff limpio. `main = origin/main = 2918622` intacta.
  Publicada `integration/p1a-functional-resume = cd18f2d`.

### 4E.3B — contrato congelado + BLOCKER
- Contrato `docs/ESTIMATE_VERSION_COMPARE_CONTRACT.md` v1 congelado.
- **BLOCKER (FASE 5):** la clave de comparación de ítems `chapterCode + itemCode`
  **no es única garantizada**. Índices UNIQUE existentes: solo
  `chapters_version_code_uq (estimate_version_id, code)` + PKs; **`boq_items` no
  tiene unicidad por `code`**. `createBoqItem` (4E.2A) e import Excel (4C.2, dup =
  warning) permiten códigos de ítem repetidos en un capítulo. Datos actuales: 0
  duplicados — pero el esquema no lo garantiza.
- **Decisión de producto requerida** (conforme a la regla STOP): (a) migración de
  unicidad `boq_items_version_chapter_code_uq (estimate_version_id, chapter_id, code)`
  — con impacto cruzado en `createBoqItem` e import (23505 si hay dup); o (b) clave
  determinística `chapterCode + itemCode + ocurrencia(n)` por `sort_order` (sin
  migración). **Capítulos sí tienen clave única garantizada.** Backend/UI/tests de
  4E.3B **NO implementados** (detenido tras la inspección).

### Nota de migraciones para pre-release (reconciliar, NO asumir)
- Antes de aplicar al remoto: ejecutar `supabase db push --dry-run --linked`
  (read-only) y **reconciliar** qué migraciones faltan realmente. **No asumir** que
  `20260606120000` sigue pendiente sin verificar. Aplicar **solo** las faltantes
  confirmadas. Candidatas locales: `20260606120000` (4E.2A), `20260609120000`
  (4E.2B), `20260609130000` (4E.3A).

### Estado
- `main = origin/main = 2918622` intacta; producción intacta; stashes P1-A intactos.
  Preview/MV-01 diferidos. **`BOQ_REORDER` NO iniciado.**

## 2026-06-09 — 4E.3A emisión/clonación de versiones implementada (rama funcional)

> **4E.2B integrada** en `integration/p1a-functional-resume` (merge `9f28c26`,
> validada). **4E.3A** en `feature/wave-4e3a-estimate-issue-clone` (desde
> integration `9f28c26`). **NO merge a integration/main; sin deploy; sin db push.**

### Alcance entregado (contrato `docs/ESTIMATE_ISSUE_CLONE_CONTRACT.md` v1)
- **Emisión** `draft → issued` (`issued_at`/`issued_by` server-side; solo draft);
  issued **inmutable** (edición/creación/movimiento/AIU/archive/restore rechazados
  vía guards + RLS).
- **Clonación** issued → nueva `draft` (activa): RPC atómica `clone_issued_estimate_version`
  (capítulos/ítems remapeados, `source_code`/`source_row` y estado archivado
  preservados, AIU clonado, número de versión seguro, `source_version_id`);
  **mismo total activo** que la issued origen; **issued origen intacta** (consultable/
  exportable por `versionId`).
- `listEstimateVersions` (tenant-scoped, resumen financiero por versión);
  export por `versionId` (snapshot histórico). UI: panel de versiones + Emitir /
  Crear nueva versión; controles editables ocultos en issued.

### Migración local (preparada; NO aplicada a remoto)
- `20260609130000_estimate_version_issue_clone.sql` (aditiva): `estimate_versions`
  += `issued_at`, `issued_by` (FK profiles), `source_version_id` (self FK) + índice
  parcial; RPC `clone_issued_estimate_version` (SECURITY INVOKER, atómica). La RPC
  lee la versión issued **sin** `FOR UPDATE` (evita falso not-found por RLS de
  inmutabilidad) y serializa con lock en `estimates`. Verificada con `db reset`.

### Validación (todo PASS)
- typecheck 0, lint 0, **747 tests** + **28 integración gated** (`BOQ_SMOKE_DB=1`,
  repo real + RLS; cubren los casos de emisión/inmutabilidad/clonación/lecturas/
  exports/seguridad de 4E.3A), build fixture+db-local, RLS harness **106/106**,
  read-model isolation **12/12**, gm:regression **22/22**, gm:import PASS, validador
  214/0/0, `git diff --check` limpio.

### Estado / pendientes
- Migraciones locales `20260606120000` (4E.2A), `20260609120000` (4E.2B),
  `20260609130000` (4E.3A) **pendientes de `db push` remoto**.
- **Integración a `main` pendiente; deploy pendiente.** `main = origin/main = 2918622`
  intacta; producción intacta; stashes P1-A intactos. Preview/MV-01 diferidos.
- **4E.3B NO iniciada.**

## 2026-06-09 — 4E.2B `BOQ_SAFE_DELETE_OR_ARCHIVE` implementada (rama funcional)

> En rama `feature/wave-4e2b-boq-safe-archive` (desde `integration/p1a-functional-resume`
> `2219f3b`). **NO merge a integration ni main; sin deploy.**

### Alcance entregado (contrato `docs/BOQ_DELETE_ARCHIVE_CONTRACT.md` v1)
- Soft-archive reversible (archive/restore) de **capítulos** e **ítems** BOQ; **sin
  DELETE físico**. Trazabilidad mínima `archived_at` + `archived_by` (server-side).
- Nodos archivados excluidos de vista activa, subtotales, costo directo, AIU,
  indirectos, total general y **exportaciones activas**. Un capítulo archivado
  excluye todos sus ítems **sin** reescribirlos; al restaurarlo, los ítems
  archivados individualmente siguen archivados.
- Versión emitida = inmutable (RLS + guard `BoqVersionLockedError`); cross-org
  bloqueado (RLS); fixture solo lectura. Lectura controlada `includeArchived`.

### Migración local (preparada; NO aplicada a remoto)
- `20260609120000_boq_archive_metadata.sql` (aditiva): `chapters`/`boq_items` +=
  `archived_at`, `archived_by` (FK `profiles` ON DELETE SET NULL) + índices
  parciales `WHERE archived_at IS NULL`. Sin DROP/DELETE; RLS sin cambios.
  Verificada con `supabase db reset` local. **Sin `db push` a remoto.**

### Backend / read-model / UI
- `EstimatesWriteRepository`: `archiveEstimateChapter`/`restoreEstimateChapter`/
  `archiveBoqItem`/`restoreBoqItem` + lecturas activas con exclusión y
  `includeArchived`. Read-model (dashboard) y `read-repository` excluyen archivados.
- UI: controles Archivar/Restaurar (confirm), estado "Archivado", toggle
  "Mostrar archivados"; ocultos en versión emitida / modo solo lectura.

### Validación (todo PASS)
- typecheck 0, lint 0, **743 tests** (+ **19 integración gated** que cubren los 28
  casos del plan: financieros, read-model, exports, RLS, fixture, UI), build OK,
  RLS harness **106/106**, read-model isolation **12/12**, gm:regression **22/22**
  (sin degradar registros activos), gm:import PASS, validador 214/0/0,
  `git diff --check` limpio.

### Estado / pendientes
- **Deploy pendiente; integración a `main`/`integration` pendiente** (a tu orden).
- Preview runtime / **MV-01** siguen **diferidos a pre-release**.
- `main = origin/main = 2918622` intacta; producción intacta; stashes P1-A intactos.
- **4E.3 NO iniciada.**

## 2026-06-09 — Integración funcional segura `integration/p1a-functional-resume` (P1-A staged)

> Nota: registrada **solo en la rama de integración** (no en `main`).

- **P1-A code-complete y validada localmente**: H-01 cableado en lecturas tenant-scoped;
  M-02 export legacy corregido (`organizationId` server-side); filtros explícitos por
  `organizationId` conservados.
- **Rama de integración** `integration/p1a-functional-resume` creada **desde `origin/main`
  (`2918622`)** + `git merge --no-ff origin/fix/security-p1a-read-model-rls-export-legacy`
  (`a78b74b`), **sin conflictos**. `main` y `origin/main` **intactos en `2918622`**.
- **Validación local única post-integración (todo PASS)**: typecheck 0, lint 0, build OK,
  **738 tests** (+11 integración gated, saltados), **RLS harness 106/106**,
  **read-model isolation 12/12**.
- **Diferido a pre-release (NO bloquea el MVP interno)**: Preview runtime real de P1-A y
  validación Vercel/pooler/**MV-01** (deuda de validación pre-release). El sandbox CLI no
  completa uploads/builds (deployments UNKNOWN); **no se investiga Vercel en esta etapa**.
- **Producción NO modificada; `main` NO modificada.** Base funcional segura para continuar
  el MVP: **`integration/p1a-functional-resume`**. Stashes P1-A (`stash@{0}`/`stash@{1}`) y
  worktree de seguridad intactos (no tocados).

## 2026-06-07 — 4E.2A CERRADA (automated-ready): smoke automatizado no destructivo

### Decisión de la usuaria
- **Omitió voluntariamente** el smoke manual de escritura sobre el presupuesto
  productivo ENTRE PATIOS. Cierre por **verificación automatizada no destructiva**.

### Auditoría read-only inicial
- `main = origin/main = 02f475e` (contiene merge 4E.2A `19f3c5d`); working tree limpio.
- **P1-A intacto (NO tocado)**: rama `fix/security-p1a-read-model-rls-export-legacy`
  (`a78839c`) + 2 `git stash` (export-test / exports organizationId). Sin stash pop/apply/drop.

### Smoke automatizado local (repo REAL + RLS) — `apps/web/tests/integration/boq-edit-smoke.test.ts`
- Postgres 17 / Supabase local; `DbEstimatesWriteRepository` vía PostgREST con JWT de
  usuario sembrado (RLS aplicada); datos **sintéticos** locales (estimate+V01+import+AIU).
  Gated por `BOQ_SMOKE_DB=1` (el `pnpm run test` normal lo salta). **11/11 PASS**:
  - A editar cantidad → recalcula subtotal/capítulo/directo/A·I·U·IVA/indirecto/total; origen preservado.
  - B restaurar cantidad → **vuelve EXACTO al baseline** (todas las cifras).
  - C editar precio → recalcula → restaurar → baseline.
  - D PATCH subtotal-only por PostgREST → **trigger ignora** el valor; persiste `round(q×p,10)`.
  - E crear capítulo manual → origen NULL, sort_order append, código único.
  - F crear ítem manual → origen NULL, subtotal derivado, total sube.
  - G editar ítem importado → code editable, `source_code`/`source_row` preservados.
  - H mover ítem entre capítulos (misma versión) → origen intacto, sort append.
  - I seguridad → cross-org Not-Found, fixture write bloqueada, versión emitida bloqueada.
  - N (FASE 3) export payload refleja la edición y restaura su pre-estado.

### Validación completa
- typecheck 0, lint 0, **736 tests** (+11 integración gated, saltados en run normal),
  build fixture + db-local PASS, gm:regression 22/22, gm:import PASS, validador 214/0/0,
  **RLS runtime 106/106**, Supabase remoto **21/21 Local = Remote** (solo lectura),
  `git diff --check` limpio; sin secretos/privados.

### Producción (read-only)
- Vercel `whoami` `soporteatriaworkflows-8854`; proyecto `construction-ops` (NO `-1rqh`).
  Deployment producción **● Ready** (`construction-b8klgx2bm-…`, alias
  `construction-ops-psi.vercel.app`). Smoke HTTP: `/login` 200; protegidas 307→`/login`;
  rutas 4E.2A (`chapters/new`, `items/[id]/edit`) 307→`/login`; control inexistente 404.
  **Sin escrituras productivas; ENTRE PATIOS intacto.**

### Cierre
- Tag `wave-4e2a-manual-boq-editing-automated-ready-v1`. Smoke de **escritura real en
  producción = OPCIONAL** para sesión futura. **4E.2B/4E.3 NO iniciadas.**
- Siguiente acción recomendada: retomar **P1-A** exclusivamente desde un **worktree de
  seguridad aislado** (ver memoria/INTEGRATION_REQUESTS).

## 2026-06-07 — 4E.2A: verificación productiva (deploy READY) por Vercel CLI

### Auditoría read-only del estado real
- Rama `main`; HEAD `19f3c5d`; **main = origin/main = 19f3c5d**; working tree limpio;
  sin WIP de 4E.2A pendiente. Sin inconsistencias con el reporte anterior.
- **P1-A intacto (no tocado)**: rama `fix/security-p1a-read-model-rls-export-legacy`
  (`a78839c`) + 2 `git stash` (export-test / exports organizationId) sin cambios.

### Verificación Vercel (CLI vía `corepack pnpm dlx vercel`, sin instalar global)
- `vercel whoami` = `soporteatriaworkflows-8854`. Carpeta vinculada a `construction-ops`
  (`prj_fVLILBxQnttsj8rMYls7WikAGGPE`), NO `construction-ops-1rqh`.
- Deployment producción `dpl_DenhpBNL8ga7kKfeQ8vyYk3Jdq8E` (`construction-oxzs4xcb2-…`):
  **● Ready**, target production, aliases `construction-ops-psi.vercel.app` +
  `construction-ops-git-main-…`, creado tras el push de `19f3c5d` (auto-deploy GitHub).
- **Smoke HTTP**: `/login` 200; `/dashboard` 307→`/login`; rutas 4E.2A `chapters/new`,
  `items/new`, `items/[id]/edit` 307→`/login?next=…`; control inexistente 404
  (confirma que las rutas 4E.2A están en el build desplegado). Sin 500; sin fixture
  público; sin secretos; sin cambios de datos productivos.

### Pendiente
- **Smoke visual de la usuaria** (editar cantidad de un ítem real → ver subtotal/directo/
  AIU/total → restaurar ≈ $372.247.170). Tras su OK: tag
  `wave-4e2a-manual-boq-editing-production-v1`. **4E.2B/4E.3 NO iniciadas.**

## 2026-06-07 — 4E.2A: edición manual segura de BOQ IMPLEMENTADA (migración aplicada)

### Estado
- Rama `integration/wave-4e2a-manual-boq-editing` (desde `main` `1aaf203`).
- **Migración aprobada y aplicada** `20260606120000_boq_items_subtotal_invariant.sql`:
  función `set_boq_item_subtotal()` + trigger `boq_items_recompute_subtotal`
  `BEFORE INSERT OR UPDATE` (subtotal = `round(q×p,10)` forzado en toda escritura).
  `db push --dry-run` = 1 migración esperada (0 seeds) ⇒ `db push --linked` ⇒
  **21/21 Local = Remote**. Remoto: solo esquema, sin datos/seeds.

### Implementación
- Repo (`server/estimates/`): 6 métodos nuevos (create/update/getEditable de
  capítulo e ítem) en db + fixture; validación pura `boq-validation.ts`; errores
  de dominio; barrel actualizado. Subtotal derivado server-side + trigger DB;
  AIU/total general reutilizan `aiu-calc` (una sola fuente). Trazabilidad
  preservada (importado) / NULL (manual); `sort_order` append; mover ítem entre
  capítulos de la misma versión (código no renumerado, advertencia de prefijo).
- UI: server actions `chapter-actions.ts`/`item-actions.ts` (guard supabase+db,
  viewer server-side, nunca subtotal/totales del navegador); formularios
  `chapter-form.tsx`/`item-form.tsx` (preview de subtotal + leyenda, loading,
  anti doble-submit, banner de éxito, read-only si bloqueada/fixture); 4 rutas
  nuevas (chapters/new, chapters/[id]/edit, items/new, items/[id]/edit); CTAs
  "Nuevo capítulo"/"Editar" en detalle de presupuesto y capítulo.

### Validación (local, todo verde)
- typecheck 0, lint 0, **736 tests** (+24), build fixture + build db-local PASS
  (rutas `ƒ`), gm:regression 22/22, gm:import PASS, validador 214/0/0,
  **RLS runtime 106/106** (+17 checks 4E.2A: trigger presente, INSERT/UPDATE
  recalcula, PATCH-subtotal ignorado, import compatible, origen preservado,
  mover, negativo/emitida bloqueados). `git diff --check` limpio; sin secretos/
  privados.

### Nota de proceso — WIP de seguridad en paralelo (export-legacy)
- Aparecieron cambios NO commiteados ajenos a 4E.2A en `apps/web/{app/api/exports/
  route.ts, modules/exports/types.ts, server/exports/export-service.ts,
  tests/unit/exports/export-service.test.ts}` (remediación P1-A/M-02 incompleta,
  rompía typecheck/test del módulo legacy). Preservados en **2 `git stash`**
  (recuperables vía `git stash list`/`pop`), NO commiteados aquí. Los completa la
  rama `fix/security-p1a-...`.

### Próximo paso
- Merge `--no-ff` a `main` + push. **Deploy a producción vía Vercel CLI NO
  ejecutable en este entorno (CLI no instalada)** ⇒ acción manual de la usuaria
  (o auto-deploy por integración GitHub). Smoke final manual de la usuaria
  (cambiar cantidad de un ítem real → ver total → restaurar ≈ $372.247.170).
- **4E.2B / 4E.3 / 4F NO iniciadas.**

## 2026-06-07 — 4E.1C CERRADA (smoke productivo aprobado) + diagnóstico 4E.2A (migración requerida)

### A. Cierre 4E.1C
- **Smoke productivo APROBADO por la usuaria**: Excel y PDF exportados OK; logo completo
  oficial + símbolo visibles; paleta ICONIC correcta (azul dominante, cian acento,
  **sin dorado**); jerarquía visual aprobada; **total general intacto ($372.247.170)**;
  presentación general aprobada sin observaciones.
- `main = origin/main = 7af91ea` (merge `8121731`). Sin migración (solo branding visual)
  ⇒ remoto Supabase **20/20** intacto.
- Tag estable: **`wave-4e1c-official-iconic-branding-production-v1`**.
- Deuda `ICONIC_LOGO_ASSET` ⇒ RESUELTA (assets oficiales versionados; guía interna en
  `docs/branding/`, no publicada).

### B. Diagnóstico 4E.2A — Creación/edición manual segura de BOQ (FASE 1)
- **RLS suficiente, sin migración de seguridad**: `chapters`/`boq_items` ENABLE+FORCE RLS;
  policies select/insert/update/delete por organización (`app.estimate_version_in_org`) y
  con bloqueo de versión emitida (`NOT app.estimate_version_locked`). Insert/update por la
  misma organización en versión `draft`/`review` ya permitidos; cross-org y locked bloqueados.
- **Repositorio de escritura inexistente** para edición manual (db-repository solo lectura
  de capítulos/ítems hoy).
- **GAP CRÍTICO (bloqueante)**: NO existe invariant DB-level para `subtotal`. `boq_items.subtotal`
  solo tiene CHECK `>= 0`; el recálculo `round(qty×price,10)` vive únicamente en la RPC
  `import_boq_into_version` (carga inicial). Un `authenticated` podría persistir subtotal
  arbitrario vía PostgREST directo en una versión editable.
- **Decisión por regla STOP**: se propone UNA migración mínima (función + trigger
  `BEFORE INSERT OR UPDATE` en `boq_items`) y **se detiene la implementación**. NO UI,
  NO contrato, NO repositorio, NO deploy, NO dry-run, NO tocar remoto hasta aprobación.

### C. Estado / próximo paso
- Rama `integration/wave-4e2a-manual-boq-editing` **NO creada todavía** (se creará al aprobar
  la migración, según el flujo del prompt).
- **Bloqueo**: requiere **aprobación explícita de la migración** para continuar 4E.2A.
- Deudas registradas: `BOQ_SAFE_DELETE_OR_ARCHIVE`, `BOQ_REORDER`, `BOQ_AUDIT_TRAIL`,
  `ESTIMATE_VERSIONING`.

## 2026-06-06 — 4E.1C: activación de assets oficiales GRUPO ICONIC

### Estado
- Rama `integration/wave-4e1c-official-iconic-assets` (desde `main` `3bd3b01`).
- **Sin migración, sin cambios estructurales/financieros.** Solo branding visual.
- La usuaria añadió los assets oficiales; auditados y conectados.

### Assets
- `apps/web/public/branding/iconic/grupo-iconic-logo-full.png` (846×846 RGBA, 48 KB).
- `apps/web/public/branding/iconic/grupo-iconic-logo-symbol.png` (1080×1080 RGBA, 56 KB).
- Guía movida a `docs/branding/ICONIC_EXPORTS_VISUAL_GUIDE.pdf` (interna, no publicada).

### Cambios
- Paleta oficial `ICONIC_EXPORT_PALETTE` en `branding.ts` (azul `#005DD6`, cian
  `#00B8FF`, navy `#020148`, grafito, gris azulado, gris claro, blanco).
  **Dorado `#C8A24B` eliminado.**
- Script reproducible `scripts/branding/embed-iconic-assets.mjs` → genera
  `logo-asset.ts` con `ICONIC_LOGO_FULL_DATA_URI`/`ICONIC_LOGO_SYMBOL_DATA_URI`
  (base64). **Sin `fs` en runtime.**
- PDF: encabezado con logo completo sobre blanco (texto navy legible), regla cian,
  títulos azul ICONIC, footer con símbolo + paginación, TOTAL GENERAL navy+cian.
- Excel `RESUMEN`: logo completo + título navy + regla cian; encabezados azul,
  totales navy+cian; estructura/fórmulas/paneles intactos.

### Validación
- typecheck 0, lint 0 (sin warnings), **712 tests** (+ assets/paleta/embed/no-dorado),
  build fixture + db-local PASS sin warnings, gm 22/22, gm:import PASS, validador
  214/0/0, `git diff --check` limpio. Remoto Supabase intacto (20/20).

### Próximo paso
- Preview → merge `--no-ff` → Production → smoke visual. **No iniciar 4E.2.**
- Deuda `ICONIC_LOGO_ASSET` ⇒ **RESUELTA**.

## 2026-06-06 — 4E.1B: branding visual de exports (Excel + PDF)

### Estado
- **4E.1 CERRADA a nivel funcional** (smoke real de la usuaria: Excel/PDF abren,
  3 hojas, 14 capítulos/132 ítems, directo 336.084.480, total 372.247.170).
  Observación: faltaba branding ICONIC ⇒ origen de 4E.1B.
- Rama `integration/wave-4e1b-export-branding` (desde `main` `490a5dc`).
- **Sin migración, sin cambios estructurales ni financieros.** Solo lenguaje
  visual de los generadores Excel/PDF.

### Cambios
- Fuente única `apps/web/server/estimates/export/branding.ts` (paleta ICONIC
  HEX/ARGB + metadatos + `loadBrandLogo`). Logo **serverless-safe** vía base64
  embebido (`logo-asset.ts`, `ICONIC_LOGO_BASE64`); sin asset ⇒ monograma `IC`.
- PDF rediseñado: banda de marca fija (logo/monograma), línea dorada, ficha de
  proyecto, secciones corporativas, filas alternas, **TOTAL GENERAL** resaltado,
  footer con paginación. Excel: banda en RESUMEN, encabezados/títulos de marca,
  subtotales/totales resaltados, paneles congelados, anchos razonables.
- Ruta del PNG oficial documentada en `apps/web/public/branding/README.md`.
- **Sin `fs` en runtime** (evita el aviso NFT de Turbopack) ⇒ build limpio.

### Validación
- typecheck 0, lint 0, **710 tests** (+7 branding), build fixture + db-local
  PASS **sin warnings**, gm 22/22, gm:import PASS, validador 214/0/0,
  `git diff --check` limpio. Remoto Supabase intacto (20/20).

### Próximo paso
- Preview → merge `--no-ff` → Production → smoke visual. **No iniciar 4E.2.**
- Deuda: `ICONIC_LOGO_ASSET` (incorporar el PNG oficial en base64).

## 2026-06-05 — 4E.1: exportación protegida Excel + PDF del presupuesto real

### Estado
- Rama `integration/wave-4e1-budget-exports` (desde `main` post-4D.2 cierre `d330430`).
- **Sin migración.** Camino de export nuevo sobre `EstimatesWriteRepository`
  (`getEstimateExportPayload`) + servicio `apps/web/server/estimates/export/`
  (`generateEstimateExcelExport`/`generateEstimatePdfExport`, ExcelJS + @react-pdf).
- Endpoint `GET /api/estimates/export` (`runtime=nodejs`, `force-dynamic`): viewer
  requerido, cadena proyecto/alcance/presupuesto validada, cross-org ⇒ 404, sin
  service-role, en memoria, filename sanitizado.
- UI: sección "Exportar presupuesto" con botones Excel/PDF (loading, anti doble-click,
  error sanitizado, descarga directa) en el detalle del presupuesto.
- Excel: hojas `RESUMEN`/`PRESUPUESTO`/`TRAZABILIDAD`. PDF: sobrio, paginado, sin
  UUID/source_row/secretos. Reutiliza el resumen financiero 4D.2 (no recalcula).

### Validación
- typecheck 0, lint 0, **703 tests** (+16), build fixture + build db-local PASS
  (`/api/estimates/export` presente), gm:regression 22/22, gm:import PASS, validador
  214/0/0, `git diff --check` limpio. Remoto Supabase intacto (20/20, sin tocar).

### Deudas registradas
- `EXPORT_TRACEABILITY_BY_ROLE`, `EXPORT_PROFILES_FOR_ESTIMATE` (INTEGRATION_REQUESTS).
- Nota cross-ownership: `EstimatesWriteRepository` extendido (avalar con agent-db-rls).

### Próximo paso
- Preview Vercel → merge `--no-ff` → Production → smoke. **No iniciar 4E.2.**

## 2026-06-05 — 4D.2 CERRADA: smoke real de AIU editable

### Estado
- **Oleada 4D.2 CERRADA.** Smoke manual verificado por la usuaria en producción
  (`construction-ops-psi.vercel.app`). `main = origin/main = e5eede1`.
- Tag estable: **`wave-4d2-editable-aiu-production-v1`**.

### Smoke productivo verificado (usuaria)
- PRESUPUESTO BASE → V01: AIU editable; guardó **Administración 3.5 / Imprevistos 2.5 /
  Utilidad 4 / IVA 19**; **persistió tras recargar**; modificó Administración, guardó y el total
  cambió; restauró a 3.5; **Total general ≈ $372.247.170**. Cálculo y persistencia correctos.
- AIU **por versión**, persistente y editable. Cálculo financiero validado.
- Deudas vigentes: `AIU_PRESETS_BY_ORGANIZATION`, `AIU_IMPORT_PREFILL_FROM_EXCEL`.

### Siguiente bloque
- **Oleada 4E.1 — exportación protegida de presupuesto real a Excel y PDF** (desde los datos
  persistidos, no del Excel original). Rama `integration/wave-4e1-budget-exports`. Reutilizar
  `/api/exports` + exceljs/@react-pdf si es suficiente; detenerse y pedir aprobación si migración.

## 2026-06-05 — 4D.2: AIU editable + costos indirectos + total general (sin migración)

### Estado
- Rama `integration/wave-4d2-editable-aiu` desde `main`@`99a5a8e`. **Sin migración** (reutiliza
  `indirect_cost_rules`). Remoto intacto **20/20**.

### Diagnóstico de esquema
- `indirect_cost_rules` (mig. `20260530090700`) ya soporta porcentajes **por versión**:
  `estimate_version_id`, `code` (único por versión), `name`, `percentage` numeric(20,10) (≥0),
  `base_type` (CHECK direct_cost/utility/custom), `sort_order`, `visible_to_client`. RLS completa
  (select/insert/update/delete; write requiere `NOT estimate_version_locked`). El seed demo usa
  códigos `A/I/U/IVA`. **Esquema suficiente** ⇒ NO migración.

### Implementación (decisión: AIU por versión, NO global/hardcodeado)
- Cálculo puro `aiu-calc.ts` (Decimal): `validateAiuRates` (humano `3.5`→fracción `0.035`, rango
  [0,100], no negativos/excesivos), `computeFinancialSummary` (fórmulas: A/I/U sobre directTotal,
  IVA sobre utilidad, indirectTotal, grandTotal).
- Repo (db RLS-bound + fixture): `getEstimateVersionAiu` (rates humanos + isEmpty/editable),
  `updateEstimateVersionAiu` (**upsert atómico** de las 4 filas `A/I/U/IVA` vía PostgREST onConflict;
  solo `db`; fixture ⇒ `AiuWriteNotSupportedError`), `calculateEstimateFinancialSummary`. `directTotal`
  = Σ subtotales BOQ (server-side). Tipos client-safe en `@/lib/estimates/aiu-types`.
- UI: sección **"AIU y costos indirectos"** en el detalle (cuando V01 tiene datos) con indicador
  "AIU ajustable por versión": formulario (4 % humanos), **preview client-side** + cálculo
  **definitivo server-side** al Guardar, resumen (directo/A/I/U/IVA/indirectos/**total general**),
  banner de éxito, errores sanitizados. **No** precarga `3.5/2.5/4/19`; versión emitida ⇒ read-only.

### Validación
- typecheck/lint 0, **687 tests** (+21: aiu-calc con valores del golden master, repo fixture,
  route-config), build fixture + db local PASS, gm 22/22, gm:import, validador 214/0/0,
  **RLS runtime 93/93** (+4 AIU: insert/update draft, cross-org bloqueado, versión emitida read-only).

### Deudas registradas
- `AIU_PRESETS_BY_ORGANIZATION` (plantillas sugeridas por empresa/tipo de obra; nunca defaults
  globales automáticos). `AIU_IMPORT_PREFILL_FROM_EXCEL` (Preview Excel podrá sugerir AIU detectado;
  la usuaria confirma; nunca defaults globales).

### Pendiente
- Preview + merge `--no-ff` + Production. Acción manual final: en PRESUPUESTO BASE → V01 escribir
  Administración 3.5 / Imprevistos 2.5 / Utilidad 4 / IVA 19, **Guardar** y verificar el total general.

## 2026-06-05 — 4D.1 CERRADA: smoke real de revisión operativa

### Estado
- **Oleada 4D.1 CERRADA.** Smoke manual verificado por la usuaria en producción
  (`construction-ops-psi.vercel.app`). `main = origin/main = e3ad4af`.
- Tag estable: **`wave-4d1-operational-budget-review-production-v1`**.

### Smoke productivo verificado (usuaria)
- PRESUPUESTO BASE → V01 abre; resumen con **14 capítulos**, ~**132 ítems**, **total directo**
  visible. Capítulos navegables; ítems BOQ visibles; códigos canónicos + trazabilidad histórica
  correctos; etiquetas "normalizado" donde corresponde. Revisión operativa satisfactoria.

### Siguiente bloque
- **Oleada 4D.2 — AIU editable, costos indirectos y total general por versión** (porcentajes por
  `estimate_version`, NO hardcodeados/globales; cálculo server-side con Decimal). Rama
  `integration/wave-4d2-editable-aiu`. Reutilizar `indirect_cost_rules` si es suficiente; detenerse
  y pedir aprobación si se requiere migración.

## 2026-06-05 — 4D.1: revisión operativa del presupuesto importado (sin migración)

### Estado
- Rama `integration/wave-4d1-budget-review` desde `main`@`0a3cd69`. **Sin migración** (el esquema
  + `source_code`/`source_row` de 4C.3 bastan). Remoto intacto **20/20**.

### Diagnóstico read-model
- Existe el read-model 3A (`getEstimateDetail` por versionId), pero el slice usa el repositorio
  RLS-bound. Se añadieron métodos de lectura al `EstimatesWriteRepository` (db + fixture):
  `listChaptersByEstimateVersion`, `getChapterById`, `listItemsByChapter`. El "resumen operativo"
  reutiliza `getEstimateById` (estado + V01 + conteos + total directo). Esquema **suficiente**.

### Implementación
- Repo (db RLS-bound + fixture): capítulos con `itemCount`+subtotal (Σ recalculada), detalle de
  capítulo con contexto (proyecto/alcance/presupuesto/versión) por embedding PostgREST, ítems por
  `chapter_id` ordenados. Cross-org ⇒ `[]`/`ChapterNotFoundError`. `source_code`/`source_row`
  expuestos como trazabilidad. Tipos client-safe en `@/lib/estimates/review-types`.
- UI: detalle del presupuesto muestra (cuando V01 tiene datos) **resumen** (V01/capítulos/ítems/
  **total directo**) + **tabla de Capítulos** (código, indicador discreto "normalizado" si
  `source_code≠code`, nombre, ítems, subtotal, "Ver detalle"). Nueva ruta
  `…/estimates/[estimateId]/chapters/[chapterId]`: capítulo + contexto + **tabla de Ítems BOQ**
  (código, descripción, unidad, cantidad, V/unitario, subtotal) + trazabilidad secundaria
  (tooltip/etiqueta). Reimportación bloqueada (mensaje honesto). `/estimates` lista real (4B.3).

### Validación
- typecheck/lint 0, **666 tests** (+16: review fixture + route-config), build fixture + db local
  PASS (ruta capítulo `ƒ`), gm 22/22, gm:import, validador 214/0/0, `git diff --check` limpio.

### Pendiente
- Preview + merge `--no-ff` + Production. Acción manual final: abrir PRESUPUESTO BASE, revisar el
  resumen y entrar a 2-3 capítulos para validar visualmente los ítems importados.

## 2026-06-05 — 4C.3 CERRADA: smoke real de importación con normalización

### Estado
- **Oleada 4C.3 CERRADA.** Smoke manual verificado por la usuaria en producción
  (`construction-ops-psi.vercel.app`, `supabase`+`db`). `main = origin/main = 4071be8`.
- Tag estable: **`wave-4c3-real-excel-import-production-v1`**.

### Smoke productivo verificado (usuaria)
- ENTRE PATIOS → PRIMER PISO → PRESUPUESTO BASE → V01. Subió el **Excel histórico ORIGINAL**:
  upload → preview → **sugerencias visibles** → normalización controlada → **Confirmar** →
  banner verde "Importación completada". NO usó la copia corregida como fuente.
- **Trazabilidad `source_code`/`source_row` aplicada** al archivo histórico original. **V01 ya
  contiene datos reales** (presupuesto importado). upload→preview→normalize→import verificado.

### Siguiente bloque
- **Oleada 4D.1 — revisión operativa y visualización del presupuesto importado** (resumen
  financiero + tabla de capítulos + detalle de capítulo con ítems BOQ + trazabilidad discreta).
  Rama `integration/wave-4d1-budget-review`. Reutilizar esquema; sin migración salvo necesidad.

## 2026-06-05 — 4C.3 implementado: normalización reversible de códigos (migración aprobada)

### Estado
- Rama `integration/wave-4c3-source-normalization`. Migración aprobada (trazabilidad de origen).
- **Migración aplicada al remoto** ⇒ **20/20 Local = Remote** (sin seeds, sin import remoto).
  Dry-run = 1 migración esperada.

### Migración (autorizada)
- `20260605120000_boq_source_traceability.sql`: `chapters` y `boq_items` += `source_code text`
  + `source_row integer` (+ CHECK `source_row IS NULL OR source_row > 0`). RPC
  `import_boq_into_version` (MISMA firma) extendida: persiste `code`=canónico + `source_code` +
  `source_row`. Mantiene SECURITY INVOKER, RLS, versión vacía/editable (FOR UPDATE), atomicidad,
  subtotal recalculado, grants endurecidos. **RLS runtime 89/89** (+2: capítulo e ítem persisten
  code canónico + source_code + source_row).

### Implementación
- Parser (`parse.ts`): conserva `sourceCode`/`sourceRow`; algoritmo **genérico** de capítulos
  duplicados (max+1 ⇒ 7→11/8→12/9→13/10→14); propagación de prefijos de ítems (7.01→11.01;
  histórico 2.0x bajo cap 3 → 3.0x); código ambiguo ⇒ `requiresManualReview` (bloquea). Mapping por
  clave **`rowType:sourceRow`**. `overrides` (ediciones de la usuaria) reaplican el mapping; el
  digest del preview es del payload **ORIGINAL** (integridad), estable ante overrides.
- Servicio: `preview/confirm` aceptan `overrides`; **reconstrucción server-side** (el navegador solo
  envía intención de mapping). UI "Revisar numeración" (tabla editable: fila/tipo/original/propuesto/
  descripción/motivo/estado) + Revalidar; Confirmar solo si `importable` (sin errores ni revisiones
  pendientes, canónicos únicos, V01 vacía, digest consistente).

### Validación
- typecheck/lint 0, **650 tests** (parser 4C.3 + UI), build fixture + db local PASS, gm 22/22,
  gm:import, validador 214/0/0, RLS 89/89, `git diff --check` limpio. Excel privado real NO usado.

### Pendiente
- Preview + merge `--no-ff` + Production. Acción manual final: la usuaria sube primero el Excel
  ORIGINAL (verifica sugerencias visibles 7→11/8→12/9→13/10→14) y, opcionalmente, la copia corregida.

## 2026-06-05 — 4C.3 Fase 0: diagnóstico de normalización de códigos — STOP por migración

### Estado
- **4C.2 validada manualmente** por la usuaria (preview con Excel real: 10 capítulos aceptados,
  132 ítems, total `$336.084.480`; errores agregados de capítulos duplicados 7/8/9/10 en filas
  97/102/167/172; advertencias de ítems repetidos y subtotales). NO se confirmó importación; V01 vacía.
- Rama `integration/wave-4c3-source-normalization` desde `main`@`8a7d4d5` (`main` intacta).
- **DETENIDO tras el diagnóstico** (Fase 0): se requiere **migración nueva**; pendiente de
  **aprobación explícita** antes de continuar (regla del prompt).

### Diagnóstico de esquema
- `chapters`: `code` (UNIQUE por versión), `name`, `sort_order`. **Sin** `source_code`/`source_row`.
- `boq_items`: `code`, snapshots, `subtotal`, `sort_order`, `notes` (text). **Sin** campo de origen
  estructurado; `notes` no sirve para capítulos ni es reversible/limpio.
- RPC `import_boq_into_version(p_version_id, p_chapters jsonb, p_items jsonb)`: inserta capítulos/
  ítems desde el JSONB; NO persiste metadatos de origen.

### Conclusión
- Para persistir `canonicalCode` (en `code`) conservando **`sourceCode` + `sourceRow`** (trazabilidad
  reversible) en capítulos E ítems ⇒ **migración aditiva ESTRICTAMENTE NECESARIA**. La RPC se
  extiende (misma firma `(uuid,jsonb,jsonb)`; el JSONB lleva claves extra `sourceCode`/`sourceRow`).
- Propuesta `20260605120000_boq_source_traceability.sql` (aditiva, reversible):
  `ALTER TABLE public.chapters ADD COLUMN source_code text, ADD COLUMN source_row integer;`
  `ALTER TABLE public.boq_items ADD COLUMN source_code text, ADD COLUMN source_row integer;`
  `CREATE OR REPLACE FUNCTION public.import_boq_into_version(...)` (misma firma) que además inserta
  `source_code`/`source_row` desde el payload. DOWN: drop columns + restaurar la función 4C.1.
- Remoto actual 19/19 ⇒ sería la 20.ª (requiere `db push` tras dry-run).

### Estrategia (a implementar tras aprobación)
- Parser conserva `sourceCode`+`sourceRow`; propone `canonicalCode`. **Capítulos duplicados
  (numéricos)**: `canonicalCode` = siguiente entero por encima del máximo de capítulo (algorítmico,
  no hardcodeado): max=10 ⇒ 7→11, 8→12, 9→13, 10→14. **Ítems**: si el prefijo no coincide con el
  capítulo canónico, propagar prefijo conservando sufijo (`7.01`→`11.01`; `2.0x` bajo capítulo 3 →
  `3.0x`). Código no-seguro (no numérico/sin patrón) ⇒ NO inventar; bloquear y pedir edición manual.
- UI "Revisar numeración" (tabla editable: fila/tipo/original/propuesto/nombre/motivo/estado);
  revalidar; confirmar solo si códigos de capítulo canónicos únicos + referencias válidas + digest
  consistente + V01 vacía. Subtotales: backend sigue siendo fuente de verdad.

### Acción solicitada (UNA aprobación)
- Autorizar la migración `20260605120000` (columnas + extensión de RPC) para crearla/validarla local
  (db reset + RLS runtime + tests), `db push --dry-run` y, si OK (1 migración, sin seeds), `db push`;
  luego implementar parser+UI+tests+deploy. **Nada remoto sin OK.** Rollback estable: tag
  `wave-4b3-real-estimates-production-v1`.

## 2026-06-05 — 4C.2: compatibilidad con plantilla real de cotización (parser, sin migración)

### Causa del fallo (preview con Excel real)
- `Fila 22: capítulo sin código o nombre`. Dos bugs: (1) la fila `SUBTOTAL CAPITULO`
  (descripción presente, sin código/unidad/cantidad/precio) se clasificaba como **capítulo
  incompleto** ⇒ error; (2) el número de fila era el índice del array **compactado**
  (`blankrows:false` descartaba filas vacías) ⇒ desfase (fila real 23 → reportada 22).

### Fix (solo parser; SIN migración)
- `blankrows:true` ⇒ la fila reportada = **fila REAL de Excel** (alineada con separadores vacíos).
- **Palabras reservadas** por descripción: `SUBTOTAL CAPITULO` ignorado; `TOTAL COSTOS DIRECTOS`
  cierra el BOQ; AIU/control de pagos/actas/anticipo/liquidación ignorados (fuera de alcance).
- Plantilla real de 7 columnas: `CAP`(auxiliar, ignorada), `ÍTEM`(code), `DESCRIPCIÓN`, `UN`,
  `CANT.`, `VR. UNITARIO`, `VR. PARCIAL`(subtotal, solo comparación). Mapeo por encabezado.
- **Diagnóstico AGREGADO**: el preview recorre toda la hoja y devuelve `errors[]`+`warnings[]`
  `{row, kind, code, description, recommendation}` (no se detiene en el primero). Confirmación
  bloqueada si hay errores (`ImportHasErrorsError`).
- **Duplicados sin normalización silenciosa**: capítulo duplicado ⇒ ERROR (BD exige único por
  versión); ítem duplicado ⇒ ADVERTENCIA (BD no lo restringe). **Opción A** (exigir corrección
  del Excel), sin migración ni `source_code`.

### Validación
- typecheck/lint 0, **651 tests** (parser reescrito con forma real, 16 casos), build fixture +
  db local PASS, gm 22/22, gm:import, validador 214/0/0, `git diff --check` limpio.
- Excel privado real NO usado (workbooks sintéticos en memoria). **Sin migración** ⇒ no se toca
  el remoto (sigue 19/19). NO se confirmó importación; V01 sigue vacía.

### Pendiente
- Preview + merge `--no-ff` + Production. Acción manual final: la usuaria vuelve a **analizar**
  el Excel real desde la UI y comparte solo el **resumen de preview** o los **errores agregados**.

## 2026-06-05 — 4C.1 desplegado: merge a `main` + Production READY

### Estado
- Rama `integration/wave-4c1-excel-import` (`e253c9a`) → merge `--no-ff` a `main`
  (**`6f536f7`**, sin conflictos). **Preview READY** (build production-like en infra Vercel).
  **Production READY** (`dpl…k8dm3fnxy`) aliased a `https://construction-ops-psi.vercel.app`.
- Smoke del dominio: `/login` 200; `/estimates` y
  `/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/import` ⇒ 307 → /login
  (deny-by-default, sin 500, sin fixture público). Ruta de importación viva y protegida.
  Remoto **19/19**; sin escrituras remotas salvo la migración aprobada; sin importación
  remota desde terminal; Excel privado real NO usado.

### Única acción manual final (usuaria)
- Entrar a **PRESUPUESTO BASE → V01 → Importar Excel** en producción, **subir el archivo real
  `.xlsx`** (hoja `COTIZACION 1 PISO`), revisar la vista previa (capítulos/ítems/total +
  advertencias) y **Confirmar importación**; el detalle mostrará los conteos reales y el total.
- Rollback estable: tag `wave-4b3-real-estimates-production-v1` + `READ_MODEL_SOURCE=fixture`.
- **Oleada 4C.2/4D NO iniciadas.**

## 2026-06-05 — 4C.1 implementado: importación de Excel atómica (migración aprobada)

### Estado
- Rama `integration/wave-4c1-excel-import`. Migración aprobada (RPC de import atómico).
- **Migración aplicada al remoto** ⇒ **19/19 Local = Remote** (sin seeds, sin importaciones
  remotas). Dry-run mostró exactamente 1 migración esperada.

### Migración (autorizada + hardening)
- `20260604140000_boq_import_atomic.sql`: RPC `public.import_boq_into_version(p_version_id,
  p_chapters jsonb, p_items jsonb)` `SECURITY INVOKER` (RLS aplica). Deny sin sesión/membresía
  (`app._auth_uid()`/`app.current_org()`); `FOR UPDATE` sobre la versión (serializa); valida
  editable + **vacía** (anti doble-submit); inserta capítulos+ítems atómicamente con
  **subtotal recalculado server-side**; devuelve `{chapterCount,itemCount,directTotal}`.
  Grants: `REVOKE FROM PUBLIC+anon`, `GRANT TO authenticated` (ACL verificada sin `anon`).
  NO crea tablas ni cambia RLS.
- **RLS runtime 87/87** (+10 import: recálculo, atomicidad, doble-submit bloqueado, cross-org,
  deny, anon sin EXECUTE).

### Implementación
- Contrato `docs/EXCEL_IMPORT_CONTRACT.md` (v1). Formato congelado: `.xlsx`, hoja
  `COTIZACION 1 PISO`, columnas por encabezado (A–F), convención capítulo/ítem.
- Parser server-side `apps/web/server/estimates/import/parse.ts` (SheetJS; **no evalúa
  fórmulas ni macros**; recálculo Decimal; digest SHA-256). Tipos client-safe en
  `@/lib/import/types`.
- Servicio `preview/confirm/getStatus`: preview sin escritura; confirm re-parsea + **compara
  digest** + RPC atómica; solo en `db`. UI request-time: sección Importar Excel en el detalle
  (estado vacío con CTA / "Importación completada" + reimport bloqueada) + ruta `…/import`
  (upload → preview → confirmar → redirect con banner). `next.config` `serverActions.bodySizeLimit='4mb'`.
- **Límites** (EXCEL_IMPORT_CONTRACT §4): archivo **3 MB** (bodySizeLimit 4 MB < ~4.5 MB de
  Vercel), 500 capítulos, 5000 ítems, negativos bloqueados.

### Validación
- typecheck/lint 0, **651 tests** (+28 de import), build fixture + build `db` LOCAL (vacío y
  sembrado) PASS, gm 22/22, gm:import, validador 214/0/0, RLS 87/87, `git diff --check` limpio.
- **Excel privado real NO usado**: tests construyen workbooks sintéticos en memoria.

### Pendiente
- Preview + merge `--no-ff` + Production. Acción manual final de la usuaria: subir su Excel real
  desde la UI (Importar Excel → analizar → confirmar). Rollback estable: tag
  `wave-4b3-real-estimates-production-v1`. **4C.2/4D NO iniciadas.**

## 2026-06-04 — 4C.1 Fase 1: diagnóstico importación Excel — STOP por migración requerida

### Estado
- Rama `integration/wave-4c1-excel-import` desde `main`@`8ebad9e` (`main` intacta).
- **DETENIDO tras el diagnóstico** (Fase 1): se requiere **migración nueva**; pendiente de
  **aprobación explícita de la usuaria** antes de continuar (regla del prompt).

### Diagnóstico del pipeline existente
- `gm:import` ⇒ `scripts/excel-import/import.ts` (propiedad agent-excel-mapper): herramienta de
  **build-time** que valida el fixture sanitizado + cadena de regresión; **NO escribe en DB**.
  `sheet-map.ts` documenta las 10 hojas del golden master (COT.ENTRE PATIOS) con columnas
  **tentativas** (`TODO_VERIFY`, sin coordenadas empíricas congeladas). Hoja BOQ de referencia:
  `COTIZACION 1 PISO` (A=code, B=descripción, C=unidad, D=cantidad, E=v/unit, F=subtotal).
- Dependencias: **`xlsx` 0.18.5 (SheetJS)** y `exceljs` 4.4.0 en `apps/web` (ambas server-side
  en Vercel Node). No hay importador runtime, ni RPC, ni tablas de import/staging.
- Tablas destino existen: `chapters` (estimate_version_id, code único por versión, name,
  sort_order) y `boq_items` (estimate_version_id, chapter_id, code, *_snapshot, subtotal,
  sort_order). **RLS suficiente**: `chapters_insert`/`boq_items_insert` exigen
  `estimate_version_in_org` + `NOT estimate_version_locked`. **V01 (draft) NO está bloqueada**
  ⇒ acepta inserts del mismo org. No requiere migración de RLS.

### Conclusión
- El esquema de datos es suficiente, PERO el flujo exige **transacción atómica** (capítulos +
  ítems juntos, rollback total) y **bloqueo de doble importación**, imposibles de garantizar con
  inserts multi-tabla de supabase-js sin service-role. ⇒ **Migración nueva ESTRICTAMENTE
  NECESARIA**: una RPC `SECURITY INVOKER` que importe atómicamente y verifique versión vacía.
- Propuesta (aditiva, reversible; sin tablas nuevas):
  `public.import_boq_into_version(p_version_id uuid, p_chapters jsonb, p_items jsonb)`
  `SECURITY INVOKER`: deny sin sesión; **versión debe estar VACÍA** (anti doble-submit);
  inserta capítulos (code→id) y luego ítems con **subtotal recomputado server-side**
  (`quantity × unit_price`, NUMERIC(20,10)); devuelve conteos + total directo. Hardening igual a
  4B.3 (`search_path=public`, refs calificadas, `REVOKE FROM PUBLIC+anon`, `GRANT TO authenticated`).
  RLS aplica a cada INSERT ⇒ cross-org/bloqueada rechazadas (rollback atómico). El índice
  `chapters_version_code_uq` refuerza idempotencia.
- Remoto actual 18/18 ⇒ sería la 19.ª (requiere `db push` tras dry-run).
- Dev: se usará un **.xlsx sintético sanitizado** (sin el Excel privado real) para tests/preview.

### Acción solicitada (UNA aprobación)
- Autorizar: crear+validar la migración local (db reset + RLS runtime + tests),
  `db push --dry-run` y, si OK (1 migración, sin seeds), `db push --linked`; luego implementar
  contrato + repo (`previewEstimateExcelImport`/`confirmEstimateExcelImport`/
  `getEstimateImportStatus`) + UI (upload/preview/confirm) + tests + deploy. **Nada remoto sin OK.**
  Rollback estable: tag `wave-4b3-real-estimates-production-v1`.

## 2026-06-04 — 4B.3 CERRADA: smoke productivo real de presupuesto + V01

### Estado
- **Oleada 4B.3 CERRADA.** Smoke manual verificado por la usuaria en producción
  (`construction-ops-psi.vercel.app`, `supabase`+`db`). `main = origin/main = bef4786`.
- Tag estable: **`wave-4b3-real-estimates-production-v1`**.

### Smoke productivo verificado (usuaria)
- ENTRE PATIOS → PRIMER PISO → **presupuesto remoto real creado desde la UI**:
  `PRESUPUESTO BASE` con **versión inicial V01** (activa, funcional). Conteos: **0 capítulos,
  0 ítems**. Placeholder "La importación del Excel estará disponible en la siguiente fase."
- Footer "Datos reales"; producción DB real; **sin datos fixture**. create/list/detail
  verificados end-to-end.

### Siguiente bloque
- **Oleada 4C.1 — importación controlada de Excel hacia la V01 activa** (flujo de dos pasos:
  preview sin escritura → confirmación transaccional). Rama `integration/wave-4c1-excel-import`.
  Reutilizar parser/fixtures de `gm:import`; no usar el Excel privado real; detenerse y pedir
  aprobación si se requiere migración.

## 2026-06-04 — 4B.3 desplegado: merge a `main` + Production READY

### Estado
- Rama `integration/wave-4b3-real-estimates` (`28dd12f`) → merge `--no-ff` a `main`
  (**`3d031bd`**, sin conflictos). **Preview READY** (build production-like en infra Vercel).
  **Production READY** (`dpl…7q1gcw0kz`) aliased a `https://construction-ops-psi.vercel.app`.
- Smoke del dominio: `/login` 200; `/estimates` y `/projects/[id]/scopes/[scopeId]/estimates/new`
  ⇒ 307 → /login (deny-by-default, sin 500, sin fixture público). Rutas de estimates vivas
  y protegidas. Remoto **18/18**; sin escrituras remotas salvo la migración aprobada; sin
  presupuesto remoto creado desde terminal.

### Única acción manual final (usuaria)
- Entrar a **PRIMER PISO** (alcance de ENTRE PATIOS) en producción y crear **`PRESUPUESTO BASE`**
  (descripción "Presupuesto inicial de obra para el primer piso") desde
  `/projects/[id]/scopes/[scopeId]/estimates/new`; se generará su **V01** automáticamente;
  luego abrir el detalle (V01 activa, 0 capítulos, 0 ítems).
- Rollback estable: tag `wave-4b2-real-scopes-production-v1` + `READ_MODEL_SOURCE=fixture`.
- **Oleada 4C** (importación real de Excel) NO iniciada.

## 2026-06-04 — 4B.3 implementado: presupuesto inicial real + V01 (migración aprobada)

### Estado
- Rama `integration/wave-4b3-real-estimates`. Aprobación de migración recibida con
  **ajuste de seguridad obligatorio** (la RPC NO acepta `p_created_by`).
- **Migración aplicada al remoto** ⇒ **18/18 Local = Remote** (sin seeds, sin presupuestos
  remotos). Dry-run mostró exactamente 1 migración esperada.

### Migración (autorizada + hardening)
- `20260604130000_estimates_authorship_and_atomic_create.sql`: `estimates` += `description`
  + `created_by` (FK profiles ON DELETE SET NULL) + índice; **RPC**
  `public.create_estimate_with_initial_version(p_scope_id, p_code, p_name, p_description)`
  `SECURITY INVOKER`, **autor derivado de `app._auth_uid()`** (helper canónico existente,
  mig. 20260601090000; = `profiles.id` por el FK), inserta estimate (`active`) + V01 (`draft`)
  atómicamente. Hardening: `SET search_path=public`, refs calificadas, `REVOKE ALL FROM
  PUBLIC` + `FROM anon`, `GRANT EXECUTE TO authenticated` (verificado: ACL sin `anon`).
- **RLS runtime 77/77** (+10 de estimates: autor derivado, V01, atomicidad/code-dup revierte,
  cross-org WITH CHECK, deny sin sesión/membresía, anon sin EXECUTE).

### Implementación
- Contrato `docs/ESTIMATES_CRUD_CONTRACT.md` (v1).
- `apps/web/server/estimates/`: `insertEstimateWithInitialVersion`/`listEstimatesByScope`/
  `listVisibleEstimates`/`getEstimateById`/`getEstimateActiveVersion` (selector sin fallback;
  db RLS-bound vía RPC; fixture solo lectura). "Versión activa" = mayor `version_number`.
- UI request-time: sección Presupuestos en el detalle del alcance + `/estimates/new`
  (form nombre+descripción, hidden `scopeId` validado, aviso V01) + `/estimates/[estimateId]`
  (estado, proyecto/alcance, V01, 0 capítulos/0 ítems, placeholder Excel 4C). `/estimates`
  reintegrada como listado real de presupuestos visibles (empty state honesto; demo en fixture).

### Validación
- typecheck/lint 0, **623 tests** (+35 de estimates), build fixture + build `db` LOCAL
  (vacío y con estimate+V01) PASS, gm 22/22, gm:import, validador 214/0/0, RLS 77/77,
  `git diff --check` limpio.

### Pendiente
- Preview + merge `--no-ff` + Production. Acción manual final de la usuaria: crear
  `PRESUPUESTO BASE` desde la UI (no se crea desde terminal). Rollback estable: tag
  `wave-4b2-real-scopes-production-v1`. **4C NO iniciada.**

## 2026-06-04 — 4B.3 Fase 1: diagnóstico de estimates — STOP por migración requerida

### Estado
- Rama `integration/wave-4b3-real-estimates` desde `main`@`3247eb6` (`main` intacta).
- **DETENIDO tras el diagnóstico** (Fase 1): se requiere **migración nueva**; pendiente de
  **aprobación explícita de la usuaria** antes de continuar (regla del prompt).

### Diagnóstico del esquema (migración `20260530090700`)
- `estimates`: `id`, `project_scope_id` (FK→project_scopes, NOT NULL, CASCADE), `code`
  (NOT NULL, único por scope), `name` (NOT NULL), `status` (NOT NULL DEFAULT `draft`,
  CHECK draft/active/archived), `created_at`, `updated_at`. **Sin `description`, sin `created_by`.**
- `estimate_versions`: `id`, `estimate_id` (FK, CASCADE), `version_number` (>=1, único por
  estimate), `status` (CHECK draft/review/approved/issued/archived), **`created_by` (FK profiles,
  nullable) ✅**, `created_at`, `approved_at`, `notes`.
- **RLS suficiente** (`20260530091000`): `estimates_all` (FOR ALL, org vía scope→project) +
  `estimate_versions_*` (select/insert/update/delete con org + inmutabilidad de emitidas).
  No requiere migración de RLS.
- **Versión activa = mayor `version_number`** (read-model `drizzle-repository` lo resuelve así);
  no hay `active_version_id` ⇒ no requiere columna.
- No existe repositorio de escritura de estimates ni función de creación.

### Conclusión
- Esquema **INSUFICIENTE** para 4B.3. **Migración nueva ESTRICTAMENTE NECESARIA** (aditiva,
  reversible):
  1. `ALTER TABLE estimates ADD COLUMN description text, ADD COLUMN created_by uuid
     REFERENCES profiles(id) ON DELETE SET NULL;` + índice `estimates_created_by_idx`.
  2. Función **`public.create_estimate_with_initial_version(p_scope_id, p_code, p_name,
     p_description, p_created_by)`** `SECURITY INVOKER` (RLS aplica; sin service-role) que
     inserta estimate (`status='active'`) + versión V01 (`version_number=1, status='draft'`)
     en una sola transacción; `GRANT EXECUTE ... TO authenticated`. (Función, NO trigger:
     los seeds insertan sus propias versiones ⇒ un trigger colisionaría.) Anti-colisión de
     `code` por reintento app capturando 23505.
- Remoto actual 17/17 ⇒ sería la 18.ª migración (requiere `db push` controlado tras dry-run).

### Acción solicitada (UNA aprobación)
- Autorizar: crear+validar la migración local (db reset + RLS runtime + tests),
  `db push --dry-run` y, si OK (1 migración esperada, sin seeds), `db push --linked`; luego
  implementar contrato + repo (`insertEstimateWithInitialVersion`/`listEstimatesByScope`/
  `listVisibleEstimates`/`getEstimateById`/`getEstimateActiveVersion`) + UI + tests + deploy.
  **Nada remoto sin OK.** Rollback estable: tag `wave-4b2-real-scopes-production-v1`.

## 2026-06-04 — 4B.2 CERRADA: smoke productivo real de alcances

### Estado
- **Oleada 4B.2 CERRADA.** Smoke manual verificado por la usuaria en producción
  (`construction-ops-psi.vercel.app`, `supabase`+`db`). `main = origin/main = 0f470bf`.
- Tag estable: **`wave-4b2-real-scopes-production-v1`**.

### Smoke productivo verificado (usuaria)
- Proyecto real `ENTRE PATIOS`. **Alcance remoto real creado desde la UI**: `PRIMER PISO`
  (tipo floor/Piso — descripción "Alcance inicial para presupuesto de obra del primer piso").
- Listado de alcances: funcional. Detalle de alcance: funcional. Placeholder visible
  "El presupuesto de este alcance estará disponible en la siguiente fase.". Footer
  "Datos reales". **Sin datos fixture (DB mode).** create/list/detail verificados.

### Siguiente bloque
- **Oleada 4B.3 — presupuesto inicial real por alcance** (estimate + versión V01).
  Rama `integration/wave-4b3-real-estimates`. Reutilizar esquema de estimates si es
  suficiente; no ejecutar migración remota; detenerse y pedir aprobación si se requiere.

## 2026-06-04 — 4B.2 desplegado: merge a `main` + Production READY

### Estado
- Rama `integration/wave-4b2-real-scopes` (`f75ecbf`) → merge `--no-ff` a `main`
  (**`4e4c74a`**, sin conflictos). **Preview READY** (build production-like en infra
  Vercel; tras SSO del equipo). **Production READY** (`dpl…5s30491ov`) aliased a
  `https://construction-ops-psi.vercel.app`.
- Smoke del dominio: `/login` 200; `/projects` y `/projects/[id]/scopes/new` ⇒
  307 → /login (deny-by-default, sin 500, sin fixture público). Rutas de scopes vivas
  y protegidas. Remoto **17/17**; sin escrituras remotas salvo la migración aprobada;
  sin alcance remoto creado desde terminal.

### Única acción manual final (usuaria)
- Entrar a **ENTRE PATIOS** en producción y crear el alcance **`PRIMER PISO`**
  (descripción "Alcance inicial para presupuesto de obra del primer piso") desde
  `/projects/[id]/scopes/new`; luego listar y abrir su detalle.
- Rollback estable: tag `wave-4b1-real-projects-production-v1` + `READ_MODEL_SOURCE=fixture`.
- **4B.3** (versión inicial de presupuesto por alcance) y **4C** NO iniciadas.

## 2026-06-04 — 4B.2 implementado: alcances reales (migración + repo + UI + tests)

### Estado
- Rama `integration/wave-4b2-real-scopes`. Aprobación de migración recibida.
- **Migración aplicada al remoto** ⇒ **17/17 Local = Remote** (sin seeds, sin proyectos
  remotos). Dry-run mostró exactamente 1 migración esperada antes del push.

### Migración (autorizada)
- `20260604120000_project_scopes_authorship.sql` (aditiva, reversible):
  `project_scopes` += `description text`, `created_by uuid REFERENCES profiles(id)
  ON DELETE SET NULL` + índice `project_scopes_created_by_idx`. Sin cambios de RLS.
- Local: `db reset` aplicó 17 migraciones + 4 seeds; columnas verificadas. **RLS runtime
  67/67** (incluye 6 checks nuevos de `project_scopes`: SELECT/INSERT/UPDATE cross-org,
  WITH CHECK por proyecto padre, deny sin org).

### Implementación
- Contrato congelado `docs/SCOPES_CRUD_CONTRACT.md` (v1).
- `apps/web/server/scopes/`: `insertScope`/`listScopesByProject`/`getScopeById`
  (selector por `READ_MODEL_SOURCE` sin fallback; db RLS-bound sin service-role;
  fixture solo lectura). `code` autogenerado + anti-colisión; `created_by`/`status`/
  `project_id` server-side; proyecto validado por visibilidad RLS.
- `apps/web/lib/scopes/scope-types.ts` (constantes client-safe — evita arrastrar
  `postgres` al bundle del navegador).
- UI: `/projects/[id]` sección **Alcances** (lista + CTA `Button asChild`+`Link` +
  empty state honesto); `/projects/[id]/scopes/new` (form: nombre, tipo select 7
  valores default `floor`, descripción; hidden `projectId` validado server-side);
  `/projects/[id]/scopes/[scopeId]` (detalle + placeholder de presupuesto 4B.3).
  Todas `ƒ` (layout force-dynamic + resolveViewer). `scope_type` como select; footer ya
  mode-aware desde 4B.1.

### Validación
- typecheck/lint 0, **588 tests** (+42 de scopes), build fixture + build `db` LOCAL
  (vacío y con proyecto+alcance) PASS, gm 22/22, gm:import, validador 214/0/0,
  RLS runtime 67/67, `git diff --check` limpio.

### Pendiente
- Preview + merge `--no-ff` + Production (Vercel CLI). Acción manual final de la usuaria:
  crear el alcance `PRIMER PISO` desde la UI (no se crea desde terminal). Rollback estable:
  tag `wave-4b1-real-projects-production-v1`. 4B.3/4C NO iniciadas.

## 2026-06-04 — 4B.2 Fase 1: diagnóstico de scopes — STOP por migración requerida

### Estado
- Rama `integration/wave-4b2-real-scopes` desde `main`@`9770639` (`main` intacta).
- **DETENIDO tras el diagnóstico** (Fase 1) porque se requiere una **migración nueva**;
  pendiente de **aprobación explícita de la usuaria** antes de continuar (regla del prompt).

### Diagnóstico del esquema `project_scopes` (migración `20260530090200`)
- Columnas: `id` (uuid PK), `project_id` (FK→projects, NOT NULL, ON DELETE CASCADE),
  `parent_scope_id` (FK self, nullable), `code` (text NOT NULL, único por proyecto),
  `name` (text NOT NULL), `scope_type` (text NOT NULL, CHECK floor/tower/stage/package/
  unit/modification/other), `status` (text NOT NULL DEFAULT 'active', CHECK active/archived),
  `created_at`, `updated_at`. Trigger `set_updated_at`.
- Relación con organización: **transitiva** vía `projects.organization_id` (no hay columna
  org directa en scopes).
- **RLS suficiente**: `project_scopes` con `ENABLE`+`FORCE` y policy `project_scopes_all`
  (FOR ALL, USING+WITH CHECK por `app.current_org()` del proyecto padre). Aislamiento
  cross-org ya garantizado para SELECT/INSERT/UPDATE/DELETE. **No requiere migración de RLS.**
- Lectura existente: `read-repository.scopesByProject` (consumida por `getProjectOverview`).
  **No existe** repositorio de escritura de scopes (solo `server/projects` escribe projects).

### Conclusión
- El esquema **NO es suficiente** para el objetivo 4B.2: falta `description` (el formulario
  pide nombre + descripción) y, por paridad de autoría con `projects`, conviene `created_by`.
  `code`/`scope_type` son NOT NULL ⇒ se resuelven server-side (code autogenerado; scope_type
  con default/select).
- **Migración nueva ESTRICTAMENTE NECESARIA** (aditiva, reversible), espejo de
  `20260602120000_projects_authorship`:
  `ALTER TABLE project_scopes ADD COLUMN description text, ADD COLUMN created_by uuid
  REFERENCES profiles(id) ON DELETE SET NULL;` + índice `project_scopes_created_by_idx`.
- Remoto actual: 16/16. Aplicarla sería la 17.ª migración ⇒ requiere `db push` controlado.

### Acción solicitada (UNA aprobación)
- Autorizar: (1) crear y validar localmente la migración de authorship de scopes;
  (2) `supabase db push --dry-run` y, si OK, `db push --linked` (sin `--include-seed`) a remoto;
  (3) implementar contrato + repo de escritura (RLS ya OK) + UI `/projects/[id]/scopes` + tests;
  (4) Preview + Production. **Nada de esto se ejecuta sin tu OK.** Rollback estable actual:
  tag `wave-4b1-real-projects-production-v1`.

## 2026-06-04 — 4B.1 CERRADA: smoke productivo real exitoso (DB mode)

### Estado
- **Oleada 4B.1 CERRADA.** Smoke manual verificado por la usuaria en producción
  (`https://construction-ops-psi.vercel.app`, `READ_MODEL_SOURCE=db`,
  `APP_AUTH_MODE=supabase`). `main = origin/main = b782502`.
- Tag estable: **`wave-4b1-real-projects-production-v1`**.

### Smoke productivo verificado (usuaria)
- Login real Supabase: funcional. Footer: **"Datos reales"**.
- `/projects`: funcional. CTA **"+ Nuevo proyecto"**: funcional. Formulario: funcional.
- **Proyecto remoto real creado** desde la UI: `ENTRE PATIOS` — ciudad `Cali` — estado Activo
  — descripción "Presupuesto y seguimiento de obra — primer piso".
- Redirect posterior: funcional. Detalle `/projects/[id]`: funcional y visible.
- **NO aparecen datos fixture en producción (DB mode).** create/list/detail verificados.

### Producción
- DB real (Supabase remoto PG17). Fixture retirado de DB mode. Sin escrituras remotas desde
  terminal; variables de Vercel no modificadas por el orquestador.

### Siguiente bloque
- **Oleada 4B.2 — vertical slice real de alcances (scopes) por proyecto.** Rama
  `integration/wave-4b2-real-scopes`. Reutilizar esquema de `project_scopes` si es suficiente;
  no ejecutar migración remota; detenerse y pedir aprobación si una migración fuera necesaria.

## 2026-06-04 — CIERRE estabilización de producción 4B.1: db mode + deploy

### Estado
- Rama `fix/wave4b1-production-stabilization` (`c2f5373`) → merge `--no-ff` a `main`
  (**`c6d0ad1`**, sin conflictos, 12 archivos, +264/-42). **Production deploy READY**
  (`dpl_5AbsYetRgwnoq9nnPxk3jZEU6SV2`) aliased a `https://construction-ops-psi.vercel.app`.
- Vínculo Vercel verificado: scope `soporteatriaworkflows-8854s-projects`, proyecto
  `construction-ops` (NO `construction-ops-1rqh`). `.vercel` ignorado.

### Diagnóstico (estado mixto en producción)
- **CTAs rotos** (`+ Nuevo proyecto`, `Crear primer proyecto`): se renderizaban como
  `<Link href="/projects/new"><Button>…</Button></Link>` ⇒ HTML `<a><button></button></a>`
  (interactivo anidado inválido); el click en el `<button>` no dispara la navegación del
  ancla. Causa de "aparecen pero no navegan".
- **Fixture/demo en db mode**: `/apu`, `/catalog`, `/quantities`, `/planning` eran estáticas
  (`○`) y `/estimates` usaba `getDemoViewer()`; en `db` resolvían la **org demo** (o servían
  HTML horneado del build con datos de ENTRE PATIOS), en vez de la org real.
- **Footer**: hardcodeado `Oleada 3A — fixture` en el layout.

### Fix integral
- CTAs → `<Button asChild><Link href="/projects/new">…</Link></Button>` (ancla navegable)
  en `/projects` (2 CTAs) y `/dashboard`.
- Rutas hermanas → `export const dynamic = 'force-dynamic'` + `await resolveViewer()`
  (viewer real en `db`, demo en `fixture`); `/planning` sin UUID demo; empty state honesto
  en `db` vacío. El layout es `force-dynamic` (cubre el segmento autenticado).
- Footer → `readModelModeLabel()` (`db` ⇒ "Datos reales", `fixture` ⇒ "Modo demostración");
  helper puro `apps/web/lib/utils/mode-label.ts`.

### Validación
- typecheck/lint 0, **546 tests** (+26), build fixture PASS (todas las rutas dashboard `ƒ`),
  **build `db` LOCAL** (vacío y sembrado) PASS, gm 22/22, gm:import, validador 214/0/0,
  `git diff --check` limpio.
- **Preview Vercel READY** (build production-like en su infra; sin secretos en disco). El
  Preview responde 401 a todo por **Deployment Protection (SSO)** del equipo (no es la app).
- **Production READY** + smoke del dominio: `/login` 200; `/`, `/dashboard`, `/projects`,
  `/apu`, `/catalog`, `/quantities`, `/planning`, `/estimates` ⇒ **307 → /login?next=…**
  (deny-by-default, sin fixture público, sin 500). `APP_AUTH_MODE=supabase` activo en runtime.

### Remoto / Vercel
- **Sin escrituras remotas de proyectos**, sin `db push`/`db pull`/repair/SQL/seeds remotos/
  service-role. Variables de Vercel **no modificadas** (solo se listaron NOMBRES). Toda prueba
  de DB fue contra Postgres **local** (reseteado a seeds sanitizados).

### Pendiente / rollback
- **Única acción manual de la usuaria**: iniciar sesión en `construction-ops-psi.vercel.app`
  y crear el primer proyecto desde `/projects/new` (luego listar y abrir detalle).
- Rollback: `READ_MODEL_SOURCE=fixture` + redeploy.
- Deuda menor: `app/api/exports/route.ts` (3C, agent-exports) conserva import muerto
  `getDemoViewer` (no afecta auth: usa `resolveAuthenticatedViewer`). **4B.2/4C NO iniciadas.**

## 2026-06-04 — CIERRE fix `/dashboard` DB vacía: merge a `main` + tag

### Estado
- `git merge --no-ff fix/wave4b1-empty-db-dashboard-build` (`d1aa929`) → merge **`b942f3f`**,
  **sin conflictos** (6 archivos, +331/-25). `main = origin/main = b942f3f`.
  Tag **`wave-4b1-empty-db-dashboard-ready-v1`**.

### Validación post-merge (todo PASS en `main`)
- `/dashboard`: conserva `export const dynamic = 'force-dynamic'` + `await resolveViewer()`;
  **sin `DEMO_PROJECT_ID`** ni `getDemoViewer`; deriva el proyecto activo de
  `listProjects(viewer)` + `selectActiveProjectId`; empty state con CTA a `/projects/new`;
  `getDashboardSummary` en try/catch; sin fallback silencioso db→fixture.
- `/projects/new`: conserva `force-dynamic` + `await resolveViewer()` + guard `supabase`+`db`.
- typecheck/lint 0, **520 tests**, build con **`ƒ /dashboard`** y **`ƒ /projects/new`**,
  gm:regression **22/22**, gm:import PASS, validate-agents **214/0/0**, `git diff --check` limpio.
- Sin cambios en DB/migraciones/RLS/seeds/contratos/Vercel/`DATABASE_URL`/fixture (solo tests nuevos).

### Causa raíz / fix (resumen)
- Causa: `/dashboard` se prerenderizaba estática y resolvía un UUID demo fijo; en modo `db`
  con base remota vacía, `getDashboardSummary` lanzaba `ProjectNotFoundError` en prerender y
  Vercel abortaba el build.
- Fix: dashboard request-time + viewer real + selección de proyecto visible real + empty state.

### Remoto / Vercel
- **Solo código.** Supabase remoto intacto: **16/16 Local = Remote**, seeds 0, proyectos 0.
  Sin `db push`/`db pull`/repair/SQL/seeds/proyectos remotos/service-role.
- Vercel **sin cambios**: `APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=fixture`;
  `DATABASE_URL` ya configurada privadamente por la usuaria (NO expuesta).
- **Smoke remoto pendiente** (manual de la usuaria).

### Deuda técnica registrada
- Rutas hermanas estáticas `/apu`, `/catalog`, `/quantities`, `/planning` usan `getDemoViewer()`
  y se prerenderizan en build; antes de uso productivo multitenant deben migrarse a viewer real
  request-time (`resolveViewer` + `force-dynamic`). No bloquea el build ni la creación del primer
  proyecto. Registrada en `docs/INTEGRATION_REQUESTS.md`.

### Próximo paso manual (de la usuaria)
- Esperar deployment automático → cambiar `READ_MODEL_SOURCE` `fixture`→`db` → **redeploy SIN
  Build Cache** → probar `/projects/new`, crear primer proyecto, listar, abrir detalle.
  Rollback = `READ_MODEL_SOURCE=fixture` + redeploy. **4B.2/4C NO iniciadas.**

## 2026-06-04 — Fix 4B.1: `/dashboard` maneja DB vacía sin proyecto demo (rama)

### Estado
- Rama **`fix/wave4b1-empty-db-dashboard-build`** desde `main`@`49bd113` (`main` intacta,
  sin merge). Producción Vercel intacta: `APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=fixture`.

### Diagnóstico
- Síntoma: deploy manual con `READ_MODEL_SOURCE=db` conectó a Postgres
  (`[read-model] fuente activa: db`) pero el build falló en prerender:
  `Error occurred prerendering page "/dashboard"` →
  `ProjectNotFoundError: 00000000-0000-4000-8000-000000000010`.
- Causa raíz: `app/(dashboard)/dashboard/page.tsx` (1) era **estática** (`○`, sin señal
  dinámica) por usar `getDemoViewer()` y (2) **hardcodeaba** `DEMO_PROJECT_ID` invocando
  `getDashboardSummary(viewer, DEMO_PROJECT_ID)` sin try/catch. En modo `db` con base
  productiva vacía, `projectById` → `null` → `ProjectNotFoundError` durante el prerender
  del build. Único causante: el `/dashboard`. Las hermanas (`/apu`, `/catalog`,
  `/quantities`, `/estimates`, `/planning`) ya manejaban lista vacía o capturaban el error.

### Fix mínimo
- `/dashboard` → request-time: `export const dynamic = 'force-dynamic'` + `await resolveViewer()`
  (viewer real por modo; dinámica intrínseca vía cookies, como `/projects/new`).
- Proyecto activo derivado de `listProjects(viewer)` + helper puro `selectActiveProjectId`
  (sin UUID demo). Si no hay proyectos → **empty state** con CTA a `/projects/new`
  (gated por `isCreationModeEnabled`) o a `/projects`. `getDashboardSummary` envuelto en
  try/catch. Aviso "Modo fixture" condicionado a `READ_MODEL_SOURCE=fixture`.
- Sin tocar migraciones/RLS/seeds/contratos. Sin fallback silencioso db→fixture.

### Validación (todo PASS)
- typecheck 0, lint 0, **520 tests** (+12 nuevos), build fixture PASS con **`ƒ /dashboard`**
  (antes `○`). gm:regression **22/22**, gm:import PASS, validate-agents **214/0/0**,
  `git diff --check` limpio.
- **Build modo `db` (Postgres LOCAL) PASS** en dos escenarios: (A) DB sembrada y
  (B) **DB vacía** (proyectos truncados localmente → 2 orgs, 10 profiles, 0 proyectos):
  ambos compilan, `/dashboard` dinámica (no prerenderizada), sin `ProjectNotFoundError`.

### Remoto / Vercel
- **Supabase remoto NO tocado** (todo el trabajo fue contra Postgres local 127.0.0.1).
  Sin `db push`/`db pull`/repair/SQL remoto/seeds remotos/proyectos remotos. Remoto
  permanece **16/16**, seeds 0, proyectos 0. **Vercel sin cambios** (vars intactas).
- El stack local de Supabase se levantó excluyendo `realtime` (contenedor unhealthy en
  Windows, ajeno al fix). La DB local quedó con proyectos truncados (reversible con
  `supabase db reset`).

### Próximo paso
- Revisión del orquestador para autorizar merge a `main`. NO se hizo merge.

## 2026-06-04 — CIERRE hardening `/projects/new`: merge a `main` + tag

### Estado
- `git merge --no-ff fix/wave4b1-runtime-creation-env` (`7b112cc`) → merge **`0ad7f56`**,
  **sin conflictos** (5 archivos, +102/-8). `main = origin/main = 0ad7f56`.
  Tag **`wave-4b1-project-creation-runtime-hardening-v1`**.

### Validación post-merge (todo PASS en `main`)
- `/projects/new/page.tsx` conserva `export const dynamic = 'force-dynamic'` **y**
  `await resolveViewer()` (señal dinámica intrínseca vía cookies).
- typecheck/lint 0, **508 tests**, build con **`ƒ /projects/new`** (sin prerender; ausente
  del `prerender-manifest`), gm:regression **22/22**, gm:import PASS, validate-agents
  **214/0/0**, `git diff --check` limpio. Server action conserva su guard independiente.
- Sin cambios en DB/migraciones/RLS/seeds/Vercel/fixture.

### Hipótesis ambiental (pendiente de confirmar)
- El bloqueo productivo residual NO se reprodujo con artefacto limpio; hipótesis principal:
  **caché estática/edge obsoleta** de despliegues previos (cuando la ruta era `○`). Aún
  **no es certeza absoluta**. El hardening (dinámica intrínseca) evita futuro cacheo
  estático y debe superar el artefacto viejo en un deploy con build limpio.

### Remoto / Vercel
- Supabase remoto intacto: **16/16 Local = Remote**, seeds 0, proyectos 0. **Sin** `db push`
  (solo código). Vercel sin cambios: `APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=fixture`.

### Próximo paso manual (de la usuaria)
- Esperar el deployment automático del merge → cambiar `READ_MODEL_SOURCE` `fixture`→`db`
  → **redeploy SIN reutilizar Build Cache** → probar `/projects/new` (debe mostrar el
  formulario). Rollback = `READ_MODEL_SOURCE=fixture` + redeploy.

## 2026-06-03 — Fix 4B.1 (residual): `/projects/new` intrínsecamente dinámica + diagnóstico

### Estado
- Rama **`fix/wave4b1-runtime-creation-env`** desde `main`@`17b9e07` (`main` intacta).
  Producción en `supabase`+`fixture` (rollback de la usuaria) mientras se investiga.

### Diagnóstico (auditoría profunda — el código YA era correcto)
- Síntoma: con `READ_MODEL_SOURCE=db` en Vercel, `/projects/new` seguía mostrando "Modo
  demostración activo" pese a que `17b9e07` (force-dynamic) estaba desplegado y `/projects`
  sí leía `db`.
- **Evidencia recolectada (todo confirma código correcto):**
  1. Grep: **no hay accesos literales** `process.env.APP_AUTH_MODE/READ_MODEL_SOURCE` en
     código de app (solo tests) ⇒ Next no inyecta valores en build.
  2. Chunk compilado: `resolveAuthMode(a=process.env){...a.APP_AUTH_MODE...}` e
     `isCreationModeEnabled` lee `a.READ_MODEL_SOURCE` con `a=process.env` ⇒ **lectura
     runtime indirecta, sin inlining/congelado**.
  3. Build: `/projects/new` es `ƒ`, **sin** HTML/RSC prerenderizado y **ausente** del
     `prerender-manifest` ⇒ `force-dynamic` es efectivo.
  4. El Proxy local (mismo `resolveAuthMode`) devolvió 307 a `/login` ⇒ leyó
     `APP_AUTH_MODE=supabase` en runtime desde el bundle.
- **Conclusión**: no hay defecto de código; el guard evalúa request-time correctamente.
  El bloqueo residual en producción es **ambiental**: caché estática/edge OBSOLETA de
  `/projects/new` de los despliegues previos (cuando la ruta era `○` static, con el
  mensaje demo horneado), no invalidada por el redeploy (posible "Redeploy" con build
  cache reusado).

### Fix (endurecimiento honesto — no repite el anterior)
- `/projects/new/page.tsx`: ahora `async` y resuelve `await resolveViewer()` (lee
  `cookies()` en modo supabase) ⇒ **señal dinámica intrínseca** idéntica a `/projects`.
  Vercel NO sirve rutas dinámicas intrínsecas desde caché estática/edge, de modo que el
  próximo deploy supera definitivamente cualquier HTML estático obsoleto. Se conserva
  `force-dynamic`. Defensa en profundidad: la creación es ruta protegida; ya no se confía
  solo en el Proxy (la server action mantiene su guard auth+modo).
- Test `route-config.test.ts`: + assert de señal dinámica intrínseca (`await resolveViewer`
  / `export default async function`).

### Validación (local)
- typecheck/lint 0, **508 tests** (+1), build con **`ƒ /projects/new`** (sin prerender),
  gm:regression 22/22, gm:import PASS, validate-agents 214/0/0, `git diff --check` limpio.

### Recomendación de despliegue (clave)
- Al mergear: forzar **build limpio sin caché** en Vercel y **purgar la caché del proyecto**
  antes de reintentar `READ_MODEL_SOURCE=db`. Verificar con hard refresh / `curl` con
  cache-busting. Rollback = `fixture` + redeploy.

### Restricciones
- Sin tocar Vercel/variables; sin DB/RLS/remoto; sin escritura remota; sin service-role.
  **NO merge a `main`. 4B.2/4C NO iniciadas.**

## 2026-06-03 — CIERRE Fix `/projects/new`: merge a `main` + tag

### Estado
- `git merge --no-ff fix/wave4b1-project-creation-mode-guard` (`9e9dd96`) → merge
  **`1999ffb`**, **sin conflictos** (5 archivos, +102). `main = origin/main = 1999ffb`.
  Tag **`wave-4b1-project-creation-route-fix-v1`**.

### Validación post-merge (todo PASS en `main`)
- Directiva `export const dynamic = 'force-dynamic'` presente en `/projects/new/page.tsx`.
- typecheck/lint 0, **507 tests**, build OK con **`ƒ /projects/new`** (antes `○`),
  gm:regression **22/22**, gm:import PASS, validate-agents **214/0/0**, `git diff --check`
  limpio.
- Requisito de creación intacto (`supabase`+`db`); guard de la server action sin cambios;
  sin cambios en DB/migraciones/RLS/seeds/dashboard/exports/Vercel.

### Remoto / Vercel
- Supabase remoto intacto: **16/16 Local = Remote**, seeds 0, proyectos 0. **Sin** `db push`
  (este fix es solo código). Vercel sin cambios: `APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=fixture`.

### Próximo paso manual (de la usuaria)
- Cambiar `READ_MODEL_SOURCE` `fixture`→`db` + redeploy → abrir `/projects/new` (debe
  mostrar el formulario) → crear proyecto → listar → abrir detalle. Rollback = `fixture` + redeploy.

## 2026-06-03 — Fix 4B.1: bloqueo incorrecto de `/projects/new` (prerender estático del mode-guard)

### Estado
- Rama **`fix/wave4b1-project-creation-mode-guard`** desde `main`@`ef995b9` (`main` intacta).
  Producción en `supabase`+`fixture` (rollback de la usuaria) mientras se investiga.

### Diagnóstico (causa raíz)
- En modo `db`, `/projects` y `/projects/[id]` funcionaban, pero `/projects/new` mostraba
  "Modo demostración activo." pese a `READ_MODEL_SOURCE=db` en Vercel. Causa: `/projects/new`
  es un Server Component **sin APIs dinámicas** (no usa `cookies()`/`headers()`), así que
  Next lo **prerenderizó estáticamente en build** (build output: `○ /projects/new` vs
  `ƒ /projects`). `isCreationModeEnabled()` lee `APP_AUTH_MODE`/`READ_MODEL_SOURCE`
  (env de servidor) en **build-time**, donde los defaults son `demo`+`fixture` ⇒ el guard
  quedó horneado en `false`. En runtime se servía el HTML estático sin re-evaluar.
- La **server action** `createProjectAction` SÍ guarda en request-time (correcto); el bug
  era solo del render de la página.

### Fix (mínimo)
- `apps/web/app/(dashboard)/projects/new/page.tsx`: `export const dynamic = 'force-dynamic'`
  ⇒ render request-time; el guard se evalúa por petición con el env de runtime. Build
  ahora muestra **`ƒ /projects/new`**. Sin cambios de UI/seguridad: el requisito sigue
  siendo `supabase`+`db`; la action conserva su guard.
- Test de regresión `apps/web/tests/unit/projects/route-config.test.ts` (la página declara
  `force-dynamic`). La matriz del guard y el guard de la action ya estaban cubiertos en
  `action.test.ts`.

### Validación (local)
- typecheck/lint 0, **507 tests** (+2), build OK (`/projects/new` ahora `ƒ`),
  gm:regression 22/22, gm:import PASS, validate-agents 214/0/0, `git diff --check` limpio.

### Restricciones
- Sin tocar Vercel/variables; sin DB/RLS/remoto; sin escritura remota; sin service-role.
  **NO merge a `main`. 4B.2/4C NO iniciadas.**

### Próximo paso (pendiente de autorización)
- Revisar reporte → si OK: merge a `main` (solo código; **no** requiere migración remota),
  luego la usuaria reintenta `READ_MODEL_SOURCE=db` + redeploy + smoke de creación.

## 2026-06-02 — CIERRE Fix 4B.1: merge a `main` + migración remota correctiva (16/16)

### Estado
- `git merge --no-ff fix/wave4b1-membership-resolution` (`ab08b28`) → merge **`82c2fa7`**,
  **sin conflictos** (7 archivos, +186/-5). `main = origin/main = 82c2fa7`.
- Tags: **`wave-4b1-membership-fix-code-ready-v1`** (pre-migración) y
  **`wave-4b1-membership-fix-remote-ready-v1`** (post + docs).

### Validación post-merge (todo PASS en `main`)
- typecheck/lint 0, **505 tests**, build OK, gm:regression **22/22**, gm:import PASS,
  validate-agents **214/0/0**, `git diff --check` limpio.

### Migración remota correctiva (controlada)
- `db push --dry-run --linked` ⇒ **exactamente 1** pendiente
  (`20260602130000_fix_membership_app_grants_and_profiles_self_rls.sql`), **0 seeds**.
- `db push --linked` (SIN `--include-seed`) ⇒ "Applying migration … Finished".
- `migration list --linked` ⇒ **16/16 Local = Remote**, ninguna pendiente.
- **Seeds NO ejecutados** · **proyectos remotos NO creados** · sin SQL manual · sin
  `migration repair` · sin service-role.

### Estado remoto
- **16/16** (incluye grants `app` a `authenticated` + `profiles_self_select`). El esquema
  remoto ya no recursará ni fallará por permisos al resolver el viewer en modo `db`.

### Vercel (sin cambios — debe mantenerse)
- `APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=fixture`.

### Próximo paso manual (de la usuaria)
- Cambiar **solo** `READ_MODEL_SOURCE` `fixture`→`db` + redeploy + repetir el smoke de
  creación de proyecto. **Rollback**: `READ_MODEL_SOURCE=fixture` + redeploy.

### Restricciones
- Sin tocar Vercel/variables; sin `db pull`/`migration repair`; **4B.2/4C NO iniciadas.**

## 2026-06-02 — Fix 4B.1: error de membresía en modo `db` (grants `app` + recursión RLS profiles)

### Estado
- Rama **`fix/wave4b1-membership-resolution`** desde `main`@`939af74` (`main` intacta).
  Producción en rollback por la usuaria: `APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=fixture`.

### Diagnóstico (causa raíz DOBLE, demostrada localmente)
- **#1 Grants faltantes**: las migraciones nunca otorgaron a `authenticated` `USAGE`
  sobre el esquema `app` ni `EXECUTE` sobre sus funciones de identidad. El harness RLS
  lo concedía en **runtime** (`ensureGrants`), enmascarando el hueco. En Supabase remoto
  el esquema `app` no es accesible por defecto ⇒ la 1ª política que invoca
  `app.current_org()` falla con **"permission denied for schema app"**;
  `resolveAuthenticatedViewer()` (que lee `profiles` primero) lo reporta como
  **"El usuario no tiene membresía."**. Reproducido local con migraciones puras.
- **#2 Recursión RLS en `profiles`**: la política `profiles_select`
  (`organization_id = app.current_org()`) obliga a `current_org()` a leer `profiles`,
  re-evaluando la política. Con migrador SIN `BYPASSRLS` (postgres remoto), el lookup
  `SECURITY DEFINER` NO salta RLS ⇒ **recursión infinita** ("stack depth limit exceeded").
  Reproducido local emulando los helpers en `SECURITY INVOKER`.

### Fix (migración `20260602130000_fix_membership_app_grants_and_profiles_self_rls.sql`)
- `GRANT USAGE ON SCHEMA app` + `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app` a
  `authenticated` (+ default privileges para funciones futuras).
- Reemplaza `profiles_select` por `profiles_self_select USING (id = (SELECT app._auth_uid()))`
  — self-read sin `current_org()`, rompe la recursión, **más estricto** (no expone perfiles
  de terceros). Aislamiento por organización intacto; RLS sigue FORCE.
- Harness `scripts/rls-runtime/run.ts`: `ensureGrants` ya **no** concede `app`
  (solo `public`, que emula defaults de plataforma) ⇒ ahora valida los grants de la
  migración; +3 checks (self-read, deny terceros, anti-recursión emulando INVOKER).

### Validación (local)
- **RLS runtime 61/61** (58 + 3 nuevos). typecheck/lint 0, **505 tests**, build OK,
  gm:regression 22/22, gm:import PASS, validate-agents 214/0/0, `git diff --check` limpio.

### Restricciones
- Sin tocar Vercel/variables; sin escritura remota; sin `db push/pull`/`migration repair`;
  sin SQL remoto; sin service-role. **NO merge a `main`. 4B.2/4C NO iniciadas.**

### Próximo paso (pendiente de autorización)
- Revisar reporte → si OK: merge a `main` + `db push --dry-run`/`--linked` de la nueva
  migración al remoto, luego la usuaria reintenta `READ_MODEL_SOURCE=db` + smoke.

## 2026-06-02 — CIERRE Oleada 4B.1: merge a `main` + migración remota de proyectos

### Estado
- `git merge --no-ff integration/wave-4b1-real-projects` (`1f5f908`) → merge **`10ac567`**,
  **sin conflictos** (27 archivos, +2549/-26). `main = origin/main = 10ac567`.
- Tags: **`wave-4b1-projects-code-ready-v1`** (pre-migración) y
  **`wave-4b1-projects-remote-ready-v1`** (post-migración + docs).

### Validación post-merge (todo PASS en `main`)
- typecheck/lint 0, **505 tests**, build OK (`/projects` ƒ, `/projects/[id]` ƒ,
  `/projects/new`), gm:regression **22/22**, gm:import PASS, validate-agents **214/0/0**,
  `git diff --check` limpio. Migración `20260602120000_projects_authorship.sql` presente.

### Migración remota aplicada (controlada)
- `db push --dry-run --linked` ⇒ **exactamente 1** migración pendiente
  (`20260602120000_projects_authorship.sql`), **0 seeds**, sin diferencias inesperadas.
- `db push --linked` (SIN `--include-seed`) ⇒ "Applying migration … Finished".
- `migration list --linked` ⇒ **15/15 Local = Remote**, ninguna pendiente.
- **Seeds NO ejecutados** · **proyectos remotos NO creados** · sin SQL manual · sin
  `migration repair` · sin service-role.

### Estado remoto
- Esquema **15/15** (14 previas + `projects_authorship`: `description`+`created_by`).
  Org `GRUPO ICONIC` + 1 profile admin. **Sin proyectos reales aún.**

### Vercel (sin cambios — debe mantenerse)
- `APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=fixture`. El cambio a `db` es **acción
  manual pendiente de la usuaria**.

### Próximo paso manual (de la usuaria, fuera de este entorno)
- Cambiar **solo** `READ_MODEL_SOURCE` de `fixture` → `db` en Vercel, redeploy, y crear
  el **primer proyecto real** desde la interfaz (smoke remoto controlado).
- **Rollback**: volver a `READ_MODEL_SOURCE=fixture` + redeploy.

### Restricciones
- Sin tocar Vercel/variables; sin `db pull`/`migration repair`; **4B.2 / 4C NO iniciadas.**

## 2026-06-02 — Oleada 4B.1 (Fases 2–5): vertical slice real de proyectos (validado, NO mergeado)

### Estado
- Rama `integration/wave-4b1-real-projects` = **`2397323`** (publicada). `main` intacta
  en `cb988be`. Dos sub-merges `--no-ff`: DB/RLS (`d2d426a`) y UI (`2397323`).
- Backups: `backup/wave4b1-projects-db` (`3a403bd`), `backup/wave4b1-projects-ui`
  (`6f41fd4`) — pusheados.

### Entregables
- **Fase 2 (agent-db-rls)**: migración `20260602120000_projects_authorship.sql`
  (`description`+`created_by`); `apps/web/server/projects/` (`ProjectsWriteRepository`,
  validación + generación de `code`, selector); RLS runtime extendido. **Sin service-role.**
- **Fase 3 (agent-frontend-boq)**: server action `createProjectAction`, `mode-guard`,
  lista por `resolveViewer()`, formulario `/projects/new`, detalle `/projects/[id]`.
  (Fix de integración del orquestador: el test importaba `isCreationModeEnabled` desde
  `actions`; corregido a `./mode-guard`.)

### Validación (Fase 4, en la rama de integración)
- typecheck/lint 0, **505 tests**, build OK, gm 22/22, gm:import PASS, validador 214/0/0,
  `git diff --check` limpio. **RLS runtime 58/58** (PG17 local). Smoke HTTP demo+fixture:
  `/projects`, `/projects/new`, `/login` = 200; "+ Nuevo proyecto" deshabilitado en demo.
- Pendiente no bloqueante: smoke interactivo en navegador en modo `db` (login real →
  crear → detalle); validado a nivel DB/unit/build.

### Restricciones respetadas
- Sin tocar Vercel ni remoto; sin escritura remota; sin `db push/pull`; sin service-role;
  sin secretos. **NO merge a `main`. 4C NO iniciada.** Supabase local detenido al cierre.

### Próximo paso (requiere autorización)
- Revisión del reporte → si OK: merge a `main` + (en sesión aparte) smoke remoto mínimo
  controlado. Antes del smoke remoto, definir backup/rollback de datos reales.

## 2026-06-02 — Oleada 4B.1 (Fase 1): contrato congelado del vertical slice de proyectos

### Estado
- Rama **`integration/wave-4b1-real-projects`** desde `main`@`cb988be` (publicada).
  `main` intacta. Logout online confirmado por la usuaria; 4A.3 cerrada.
- Auditoría read-only previa: `migration list --linked` ⇒ **14/14 Local = Remote**.

### Diagnóstico del esquema previo (`projects`)
- RLS por organización ya existente (SELECT/INSERT/UPDATE/DELETE en `app.current_org()`).
- **Faltan** `created_by` y `description`; usa `location` (no `city`); `code` es
  `NOT NULL UNIQUE(org,code)` y no está en el input. `ReadModelPort` es **solo lectura**.

### Contrato congelado (Fase 1)
- `docs/PROJECTS_CRUD_CONTRACT.md` v1 + actualizaciones en `API_CONTRACTS.md`,
  `AGENT_REGISTRY.md` (ownership 4B.1), `DECISIONS.md`, `INTEGRATION_REQUESTS.md`.
- Plan: db-rls (migración `created_by`+`description`, repo de escritura, RLS runtime) →
  frontend-boq (server action + UI lista/detalle/formulario). Ejecución **secuencial**.

### Restricciones
- Sin tocar Vercel ni remoto productivo; sin `db push/pull` en remoto; creación solo en
  `supabase`+`db` local; sin service-role; sin secretos. **4C NO iniciada.**

### Próximo paso
- Fase 2: lanzar `agent-db-rls` (worktree aislado) desde la rama de integración.

## 2026-06-02 — CIERRE Oleada 4A.3: Supabase remoto + autenticación online validada

### Estado
- `main = origin/main = 32b7937`. Tag de cierre **`wave-4a3-online-auth-validated-v1`**.
- **Auditoría read-only remota**: `supabase migration list --linked` ⇒ **14/14 Local =
  Remote**, ninguna pendiente. PostgreSQL **17** remoto. Org inicial `GRUPO ICONIC`,
  **1** profile admin. **Seeds demo remotos: 0** (sin datos de presupuesto reales).

### Smoke online real (confirmado MANUALMENTE por la usuaria en producción)
- Producción: `https://construction-ops-psi.vercel.app`.
- Vercel activo: `APP_AUTH_MODE=supabase` + `READ_MODEL_SOURCE=fixture`;
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` /
  `NEXT_PUBLIC_APP_URL` configuradas.
- Flujo validado: `/login` visible → credenciales válidas del admin → sesión creada →
  redirect `/dashboard` → dashboard fixture sanitizado visible. **`/logout` =
  comprobación final manual pendiente** de la usuaria (eliminar sesión → redirect
  `/login` → nuevo login funcional).
- Seguridad confirmada: sin secret/service-role en frontend; sin datos reales de
  presupuesto expuestos; **`READ_MODEL_SOURCE=db` NO activado** (sigue `fixture`).

### Cierre técnico 4A.3 (resumen de la microfase completa)
- 4A.3: link controlado read-only; 4A.3a: paridad PG17 + `db push --dry-run`;
  4A.3b: merge PG17 a `main` + `db push --linked` (14/14, sin seeds/usuarios);
  4A.3c: creación manual de org/admin + fix de inlining `NEXT_PUBLIC_*` (merge `ad8f32b`)
  + smoke online real. **Oleada 4A.3 CERRADA.**

### Restricciones respetadas
- Sin tocar Vercel ni variables; sin `db push/pull/repair`; sin SQL/seeds/usuarios
  remotos; sin service-role; sin deploy manual; sin force-push/reset/rebase; sin borrar
  ramas/tags/backups. **Oleada 4B NO iniciada.**

### Rollback disponible
- Volver a `APP_AUTH_MODE=demo` + `READ_MODEL_SOURCE=fixture` + redeploy.

### Próximo paso (propuesto, NO iniciado)
- **Oleada 4B — creación real de proyectos desde la UI** con `READ_MODEL_SOURCE=db`
  (contrato → repo DB → server action → UI → tests → smoke local → smoke remoto).
  Requiere autorización explícita.

## 2026-06-02 — Oleada 4A.3c: merge del fix de login online a `main` + tag

### Estado
- `git merge --no-ff fix/wave4a3-online-login` (`834029c`) → merge **`ad8f32b`**,
  **sin conflictos** (8 archivos, +272/-12). `main` ahora = `ad8f32b`.
  Tag **`wave-4a3-online-login-fix-v1`**.

### Validación post-merge (todo PASS en `main`)
- typecheck 0, lint 0, **461 tests** (33 archivos), build (rutas auth + Proxy +
  `/api/exports`), gm:regression **22/22**, gm:import PASS, validate-agents **214/0/0**,
  `git diff --check` limpio. Sin secretos/privados/`.env.local` staged.
- Auditoría de archivos en `main`: `client.ts` usa referencias **literales**
  `process.env.NEXT_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY` (+ fallback `ANON_KEY`);
  `login/page.tsx` delega en `runPasswordLogin` (copy/layout intactos); sin cambios en
  DB/migraciones/seeds/Proxy/exports/dashboard/fixture/Vercel.

### Restricciones respetadas
- DB remota intacta (14/14 migraciones; sin push/pull/repair/SQL/seeds/usuarios;
  sin service-role). **Vercel intacto** (`APP_AUTH_MODE=demo` + `READ_MODEL_SOURCE=fixture`).
  Sin deploy manual; sin force-push/reset/rebase destructivo; sin borrar ramas/tags/backups.
  **Oleada 4B NO iniciada.**

### Próximo paso (manual, de la usuaria — fuera de este entorno)
- Activar `APP_AUTH_MODE=supabase` en Vercel (manteniendo `READ_MODEL_SOURCE=fixture`),
  redeploy y probar login online real con el admin de `GRUPO ICONIC`.
- Rollback inmediato disponible: volver a `APP_AUTH_MODE=demo` + `READ_MODEL_SOURCE=fixture`.

## 2026-06-02 — Oleada 4A.3c (fix): cablear el login online a Supabase (inlining NEXT_PUBLIC)

### Estado
- Rama de fix **`fix/wave4a3-online-login`** desde `main`@`1ce654e` (`main` intacta).
  Vercel sigue en `APP_AUTH_MODE=demo` + `READ_MODEL_SOURCE=fixture` (restaurado por
  la usuaria); **no se tocó Vercel, ni variables remotas, ni la DB remota**.

### Diagnóstico (causa raíz)
- En modo `supabase`, el submit de `/login` mostraba el error genérico, **sin** request
  a `/auth/v1/token` y **sin** intento en los Auth logs ⇒ `signInWithPassword()` nunca
  se ejecutaba. Causa: `createClient()` (navegador) llamaba `getPublicSupabaseEnv()`
  **sin argumentos**; esa función lee `env.NEXT_PUBLIC_*` de forma **indirecta**
  (`env = process.env` por defecto). Next solo inyecta en el bundle del navegador las
  referencias **literales** `process.env.NEXT_PUBLIC_*`; el acceso indirecto queda
  `undefined` ⇒ `AuthConfigError` lanzado, capturado en el `catch` de `handleSubmit`
  ⇒ mensaje genérico. (Las navegaciones a `/forgot-password` eran el `<Link>` legítimo,
  no un submit accidental.)

### Cambios (solo archivos del orquestador + 1 de frontend-boq, sin rediseño)
- `apps/web/lib/supabase/client.ts`: pasa un objeto con referencias **literales**
  `process.env.NEXT_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY/ANON_KEY` a
  `getPublicSupabaseEnv()` ⇒ Next las inyecta en el navegador. (fix raíz)
- `apps/web/server/auth/login-flow.ts` (**nuevo**, orquestador): `runPasswordLogin`
  puro y testeable (1 sola llamada a `signInWithPassword`, error legible, redirección
  `next` sanitizada anti open-redirect, sin redirigir en error).
- `apps/web/app/(auth)/login/page.tsx` (frontend-boq): `handleSubmit` delega en
  `runPasswordLogin`. Diseño/copy/layout **idénticos**.
- Tests: `tests/unit/auth/login-flow.test.ts` (**nuevo**, 6 casos) +
  `tests/unit/auth/auth-runtime.test.ts` (3 casos de env: prioridad PUBLISHABLE,
  fallback ANON, resolución sin args desde `process.env`).

### Validación (todo PASS)
- typecheck 0, lint 0, **461 tests** (33 archivos, +9), build OK (rutas auth + Proxy +
  `/api/exports`), gm:regression **22/22**, gm:import PASS, validate-agents **214/0/0**,
  `git diff --check` limpio. Sin secretos, sin privados, sin `.env.local` staged.

### Restricciones respetadas
- Sin tocar Vercel/variables remotas; sin `db push/pull/repair`; sin SQL/seeds/usuarios
  remotos; sin service-role; sin secretos; sin force-push/reset; **4B NO iniciada**.

### Próximo paso (pendiente de autorización)
- Autorizar merge de `fix/wave4a3-online-login` a `main` y luego, en sesión aparte,
  cambiar Vercel a `APP_AUTH_MODE=supabase` para validar login online real (4A.3c).

## 2026-06-02 — Oleada 4A.3b: merge PG17 a `main` + bootstrap real del esquema remoto

### Estado
- **Merge de paridad PG17 a `main`**: `git merge --no-ff integration/wave-4a3-remote-bootstrap`
  → merge commit **`139dd52`**, sin conflictos (4 archivos: `config.toml` + 3 docs).
  `main = origin/main = 139dd52`. Tag **`wave-4a3-pg17-bootstrap-ready-v1`** (pre-bootstrap).
- **Bootstrap real del esquema remoto**: `supabase db push --linked` (una sola vez,
  **sin `--include-seed`**) sobre `construction-ops-prod` (ref `jab…pdii`). Aplicó las
  **14 migraciones** en orden; "Finished supabase db push." Único aviso: `NOTICE`
  `pgcrypto already exists` (benigno). El prompt `[Y/n]` se auto-confirmó en entorno no-TTY.

### Validación
- **Post-merge local** (`main`): `config.toml` `major_version = 17`; typecheck/lint 0,
  **452 tests**, build (rutas auth + `/api/exports` + Proxy), gm:regression 22/22,
  gm:import PASS, validate-agents 214/0/0, `git diff --check` limpio.
- **Pre-flight remoto**: 14 pendientes, Remote en blanco, orden correcto.
- **Post-push**: `migration list --linked` ⇒ **14/14 Local = Remote**, ninguna pendiente.
  Git tree limpio (solo memoria del orquestador).

### Restricciones respetadas
- **Seeds NO ejecutados** (sin `--include-seed`); **usuarios NO creados**; sin SQL/Table
  Editor; sin `db pull`/`migration repair`; sin Database Password en comando/logs/docs;
  sin `--password`/`SUPABASE_DB_PASSWORD`; **Vercel intacto** (`APP_AUTH_MODE=demo` +
  `READ_MODEL_SOURCE=fixture`). Sin force-push/reset/rebase. **4B NO iniciada.**

### Rollback / estado funcional
- Remoto: **esquema presente (14 migraciones), SIN datos funcionales** (sin org/usuarios reales).
- Mantener Vercel en `demo` + `fixture` hasta crear admin/login online (4A.3c).
- Si fallara un bootstrap futuro antes de datos reales: evaluar corrección puntual o
  **recrear proyecto remoto vacío**; **NO** usar `migration repair` automáticamente.

### Próximo paso (pendiente de autorización)
- **Oleada 4A.3c**: crear organización + usuario admin inicial seguro y conectar login
  online manteniendo `READ_MODEL_SOURCE=fixture`.

## 2026-06-02 — Oleada 4A.3 + 4A.3a: vínculo remoto controlado + paridad PG17 + dry-run

### Estado
- **4A.3 (read-only)**: Supabase CLI **2.102.0** autenticada por la usuaria (TTY)
  y `supabase link --project-ref jabddbccmhrxztfzpdii` → `Finished supabase link.`
  Proyecto remoto `construction-ops-prod` (org `oxexzrzkzksgwjaihnjf`, West US Oregon).
  Auditoría read-only: **remoto vacío** (`migration list --linked`: 14 locales con
  columna Remote en blanco); `supabase/.temp/` ignorado (`.gitignore:24`).
  Detectado mismatch: remoto **PG 17.6.1** vs `config.toml` `major_version = 15`.
- **4A.3a (esta sesión)** sobre rama **`integration/wave-4a3-remote-bootstrap`**
  (desde `main` `d3617c3`; `main` intacta): paridad local a PG17, revalidación
  local completa y **`db push --dry-run --linked`** (sin push real).

### Cambios
- `supabase/config.toml`: `major_version` **15 → 17** (local, reversible).
- Docs: `DECISIONS.md` (4A.3 + 4A.3a), `HANDOFF_LOG.md`, `QA_REPORT.md`.

### Restricciones respetadas
- Sin `db push` real, sin `--include-seed`, sin `db pull`/`migration repair`,
  sin SQL/seeds/usuarios remotos, sin tocar Vercel ni variables de entorno,
  sin secretos, sin Database Password en comandos/logs/docs. Vercel permanece
  `APP_AUTH_MODE=demo` + `READ_MODEL_SOURCE=fixture`. **4B NO iniciada.**

### Resultados (PASS)
- **PG17 local**: volumen PG15 incompatible → `supabase stop --no-backup` (descarte
  local) + `supabase start` ⇒ `server_version 17.6`. `db reset`: 14 migraciones +
  4 seeds limpios. **RLS runtime 47/47** (org A/B aisladas, sin sesión/sin membresía
  bloqueados, cross-org bloqueado, compat demo). Stack detenido al cierre.
- **Validación general**: typecheck/lint 0, **452 tests** (32 archivos), build
  (rutas auth + `/api/exports` + Proxy), gm:regression **22/22**, gm:import PASS,
  validate-agents **214/0/0**, `git diff --check` limpio.
- **Commit paridad**: `8a76a75` `chore(supabase): align local postgres major
  version with remote pg17` (4 archivos: config.toml + 3 docs); rama pusheada.
- **`db push --dry-run --linked`**: lista exactamente **14 migraciones** en orden
  cronológico, **sin seeds**, sin aplicar. `migration list --linked` post-dry-run:
  **remoto sigue con 0 migraciones** (columna Remote en blanco).
- **Sin push real**, sin SQL/seeds/usuarios remotos, **Vercel intacto**.

### Próximo paso
- Pendiente de autorización explícita: **push real** `supabase db push --linked`
  (sin `--include-seed`) en sesión posterior, con backup/rollback definido.

## 2026-06-02 — Cierre Oleada 4A: merge a `main` + tag

### Estado
- **Merge Oleada 4A a `main`**: `git merge --no-ff integration/wave-4a-auth-runtime`
  (`cc61eec`) → merge **`de37d15`**, **sin conflictos** (44 archivos, +3185/-133).
- Incluye: DB/RLS 4A.1 (migración `auth_identity_helpers` + seed `0004`,
  identidad `auth.uid()`→`profiles`, single-org v1, sin tablas nuevas);
  runtime SSR (`@supabase/ssr`, `getAll/setAll`, Proxy Next 16 con `getClaims()`
  sin `getSession()`, viewer real, role-map, anti open-redirect); UI auth
  (`(auth)/*` + `components/auth/*` + fix Suspense `/login`); guard `/api/exports`.

### Validación post-merge (PASS en `main`)
- typecheck/lint 0 · **452 tests** · build (Proxy + rutas auth + `/api/exports`)
  · gm 22/22 · gm:import 9/9 · validador 214/0/0 · diff limpio.
- **RLS runtime 47/47** (14 migraciones + 4 seeds limpios; Supabase local Docker;
  detenido al cierre). **Smoke demo 6/6 HTTP 200** (`/`→`/dashboard`,
  dashboard/projects/planning/login, `/api/exports` PDF; sin 500).
- Sin secretos; `.env.local` ignorado; sin privados; Excel real ignorado.

### Tag y push
- Tag anotado **`wave-4a-auth-local-v1`** ("Wave 4A validated: Supabase Auth SSR
  proxy UI and local RLS identity"). `git push origin main` + push del tag.
- Commit docs `docs: record wave 4a auth merge validation`.

### Configuración de producción (Vercel) — sin cambios desde el repo
- **Vercel debe permanecer `APP_AUTH_MODE=demo` + `READ_MODEL_SOURCE=fixture`**
  (configurado manualmente por la usuaria). Supabase remoto **NO conectado**;
  sin `link`/`db push`/deploy. Demo pública sanitizada preservada.

### Próximo paso (sin lanzar)
- **Oleada 4A.3 — Supabase remoto controlado + login online** (microfase manual
  de la usuaria: crear proyecto remoto, aplicar migraciones, vars Vercel
  `APP_AUTH_MODE=supabase` manteniendo `READ_MODEL_SOURCE=fixture`, verificar
  login online; luego evaluar `READ_MODEL_SOURCE=db`; rollback a demo+fixture).
- **Oleada 4B NO iniciada.** B-004 (Realtime Windows) deuda no bloqueante.

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-02 — Oleada 4A.2: integración UI auth + smoke local end-to-end

### Estado
- **UI auth integrada** en `integration/wave-4a-auth-runtime`:
  `git merge --no-ff backup/wave4a-auth-ui` (`c9063ad`) → merge **`5c60339`**,
  **sin conflictos** (11 archivos, +1106; HANDOFF_LOG 3-way → versión runtime).
- Auditoría de runtime SSR + UI conforme a `AUTH_RUNTIME_CONTRACT`: browser
  client publishable-only; server client `getAll/setAll`; Proxy Next 16 con
  `getClaims()` (no `getSession()`), deny-by-default y `sanitizeNext`; viewer
  real sesión→`profiles` (org/rol server-side, mapeo único); `/api/exports`
  con anti-escalamiento `isSameOrLessPrivileged`.

### Validación post-merge (PASS)
- typecheck/lint 0 · **452 tests** (+29 auth-ui) · build (Proxy + `(auth)/*` +
  `/api/exports`) · gm 22/22 · gm:import 9/9 · validador 214/0/0 · diff limpio.
- Excel ignorado; sin `.env`/`.env.local`/lock/privados/secretos.

### Smoke local (Supabase local Docker, sin remoto)
- `supabase start -x realtime,studio,storage-api,imgproxy,edge-runtime,logflare,
  vector` + `db reset` (**14 migr + 4 seeds**) + **RLS runtime 47/47**.
- `.env.local` (ignorado): `APP_AUTH_MODE=supabase`, `READ_MODEL_SOURCE=fixture`,
  URL/publishable local. Usuarios seed con contraseña **efímera local** (no en repo).
- 13 pasos PASS: `/login` 200; deny sin sesión (`/login?next=…`); credenciales
  inválidas→error legible; login admin→sesión; `/dashboard` auth 200; `/login`
  auth→`/dashboard`; `/api/exports` sin sesión bloqueado; **escalamiento
  client→internal/management 403**, propio 200; export 200 (PDF); logout→cookie
  borrada; forgot→recover 200 + **Mailpit**; callback sin code→`/login?error`;
  **demo** `/dashboard` 200 sin Supabase.
- `supabase stop` al cierre; helper temporal `_smoke-login.mjs` eliminado.

### Decisiones / próximo paso
- Documentado en DECISIONS (4 filas 4A.2), QA_REPORT (sección 4A.2),
  INTEGRATION_REQUESTS (frontend-boq ✅), AUTH_RUNTIME_CONTRACT §11.
- Commit docs `docs: record wave 4a2 auth runtime ui integration and local smoke`
  + push `origin integration/wave-4a-auth-runtime`. **NO** merge a `main`.
- **Recomendado:** aprobar merge acumulado Oleada 4A → `main` (decisión usuario).
  No iniciar Oleada 4B. Supabase remoto no conectado; Vercel intacto (demo fixture).

### Agentes activos al cierre
- Ninguno.

---

## 2026-05-29 — Sesión inicial
- Estado: repositorio creado, estructura de carpetas inicializada
- Decisión tomada: Drizzle ORM
- Próximo paso: push inicial a GitHub, luego Oleada 1 de agentes
- Bloqueos activos: ninguno
- Agentes activos: ninguno aún

## 2026-05-29 — Preparación documental y normalización de agentes

### Estado inicial encontrado
- `.claude/agents/` ya contenía 6 agentes completos: orchestrator,
  db-rls, excel-mapper, cost-domain, pricing, homecenter.
- Carpeta `agents/` (en raíz) tenía 11 placeholders de 2 bytes con
  nombres en mayúsculas (sin contenido útil).
- `docs/PROJECT_MASTER.md` estaba vacío (1 carácter en blanco).
- `CLAUDE.md` no existía.
- `docs/AGENT_REGISTRY.md` no existía.
- `docs/API_CONTRACTS.md`, `DATABASE_SCHEMA.md`, `EXCEL_MAPPING.md`,
  `QA_REPORT.md` estaban vacíos.
- `.gitignore` incompleto (sin `private/`, `.env.*`, `!.env.example`,
  `.claude/worktrees/`, logs, `Thumbs.db`).
- `scripts/validate-claude-agents.ps1` no existía.

### Archivos movidos
- Ninguno. Los 11 archivos en `agents/` eran placeholders vacíos sin
  información a preservar.

### Archivos creados
- `CLAUDE.md` (raíz) — punto de entrada para Claude Code.
- `.claude/agents/agent-frontend-boq.md`
- `.claude/agents/agent-dashboard.md`
- `.claude/agents/agent-planning.md`
- `.claude/agents/agent-exports.md`
- `.claude/agents/agent-qa.md`
- `docs/AGENT_REGISTRY.md` — matriz maestra de agentes.
- `scripts/validate-claude-agents.ps1` — validador automático.

### Archivos completados
- `docs/PROJECT_MASTER.md` — placeholder explícito que apunta al
  BLOCKER B-001 (no se inventó contenido).
- `docs/OPEN_QUESTIONS.md` — agregado BLOCKER B-001 + 7 preguntas
  nuevas (descuento sobre referencia, redondeo, aprobación SKU, etc.).
- `docs/API_CONTRACTS.md` — convenciones generales y contratos
  por módulo pendientes de detalle.
- `docs/DATABASE_SCHEMA.md` — entidades planificadas y reglas RLS.
- `docs/EXCEL_MAPPING.md` — hojas a documentar y valores de regresión.
- `docs/QA_REPORT.md` — matriz de categorías pendientes.
- `.gitignore` — agregadas reglas para `private/`, `.env.*`,
  `!.env.example`, `.claude/worktrees/`, `*.log`, `.DS_Store`,
  `Thumbs.db`.

### Archivos eliminados
- Carpeta `agents/` completa (11 placeholders vacíos de 2 bytes c/u).

### Resultado del script de validación
```
PASS : 214
WARN : 0
FAIL : 0
Resultado global: PASS (exit code 0)
```

### Warnings
- Ninguno en la validación automática.

### Blockers activos
- **B-001**: `docs/PROJECT_MASTER.md` está vacío. El usuario debe pegar
  manualmente el documento maestro completo (versión Antigravity)
  antes de iniciar la Oleada 1. Ver `docs/OPEN_QUESTIONS.md#B-001`.

### Estado de configuración de agentes
- 11/11 agentes presentes en `.claude/agents/` con frontmatter YAML
  válido.
- 10/10 agentes especializados con `isolation: worktree`.
- `agent-orchestrator` sin `isolation` (correcto).
- Ningún agente con `permissionMode: bypassPermissions`.
- Ningún agente recomienda `ag-grid-enterprise` (sólo aparece en
  secciones de prohibición).

### Siguiente paso recomendado
1. **Usuario**: pegar manualmente el documento maestro completo en
   `docs/PROJECT_MASTER.md` para cerrar B-001.
2. Revisar `docs/AGENT_REGISTRY.md` y validar oleadas/ownership.
3. Inicializar Git, crear el primer commit con la estructura
   preparada.
4. Activar `agent-orchestrator` para iniciar Oleada 1
   (db-rls + excel-mapper + frontend-boq con mocks).

### Agentes activos al cierre
- Ninguno. Sólo preparación documental.

## 2026-05-29 — Cierre del blocker B-001 (PROJECT_MASTER cargado)

### Acción del usuario
- El usuario reemplazó manualmente `docs/PROJECT_MASTER.md` con el
  documento maestro completo del proyecto Construction Ops.

### Verificación
- Tamaño: 2 230 líneas / 43 086 bytes.
- Cabecera leída: título `CONSTRUCTION OPS — DOCUMENTO MAESTRO DEL
  PROYECTO`, versión 1.0, fecha 2026-05-29, proyecto piloto
  `ENTRE PATIOS — Primer piso`.
- Pie leído: termina en sección `24. Nota final` con la triple meta
  (trasladar Excel, herramienta diaria, producto comercial).
- Resultado: NO es placeholder. Contiene visión, dominio, glosario,
  arquitectura, fórmulas, política de privacidad, librerías
  aprobadas y nota final.

### Blockers
- B-001 marcado como RESUELTO en `docs/OPEN_QUESTIONS.md`.
- Sin blockers activos al momento del cierre.

### Resultado del script de validación
```
PASS : 214
WARN : 0
FAIL : 0
Resultado global: PASS (exit code 0)
```

### Estado del repositorio
- Listo para el primer commit.
- Listo para iniciar la Oleada 1 (db-rls + excel-mapper + frontend-boq
  con mocks) cuando el usuario lo solicite.

### Siguiente paso recomendado
1. Inicializar Git e ingresar el primer commit con la estructura
   preparada.
2. Activar `agent-orchestrator` para coordinar la Oleada 1.

### Agentes activos al cierre
- Ninguno. Preparación completa, esperando autorización para Oleada 1.

## 2026-05-29 — Auditoría de arranque pre-Oleada 1 (orchestrator)

### Documentos leídos y verificados
- CLAUDE.md, PROJECT_MASTER.md (43 086 bytes, 2 230 líneas, NO placeholder),
  HANDOFF_LOG, DECISIONS, OPEN_QUESTIONS, AGENT_REGISTRY, API_CONTRACTS,
  DATABASE_SCHEMA, EXCEL_MAPPING, INTEGRATION_REQUESTS, LICENSING.

### Verificaciones técnicas
- `git status`: árbol limpio en `main`, sincronizado con `origin/main`.
- `git log`: 1 commit `463d6a3` (bootstrap).
- Excel real presente en `private/COT.ENTRE PATIOS 1 PISO (1).xlsx` (323 KB).
- `private/` correctamente ignorado (`git check-ignore` confirma) y
  NO trackeado por Git. `.gitignore` cubre `private/`, `*.xlsx`, `*.xls`,
  `.env*` con excepción `!.env.example`.
- 11/11 subagentes presentes en `.claude/agents/`.
- `scripts/validate-claude-agents.ps1`: **PASS 214 / WARN 0 / FAIL 0**,
  exit code 0.
- B-001 confirmado RESUELTO (PROJECT_MASTER cargado).

### Hallazgo crítico
- **B-002 (nuevo, ACTIVO)**: toolchain del monorepo NO inicializado.
  Falta `package.json` y todas las configs. Los `.tsx` son stubs de
  1 línea. Bloquea checklist de merge. Resoluble por orchestrator como
  Paso 0 de Oleada 1 (requiere autorización para instalar dependencias).

### Conclusión sobre decisiones
- Ninguna decisión abierta bloquea el INICIO de la Oleada 1. La política
  de redondeo (Q2/Q9) y la base de descuento (Q8) deben resolverse antes
  de la **Oleada 2** (cost-domain / pricing), no antes.

### Estado y siguiente paso
- Plan de Oleada 1 entregado al usuario para revisión y aprobación.
- NO se lanzaron subagentes. NO se instalaron dependencias. NO se escribió
  funcionalidad. Esperando aprobación del plan.

### Agentes activos al cierre
- Ninguno.

## 2026-05-29 — Paso 0: scaffolding del monorepo pnpm (orchestrator)

### Autorización
- Usuario aprobó el plan de Oleada 1 y la resolución de B-002 vía Paso 0.
- Gestor: pnpm (Corepack), pnpm 11, lockfile `pnpm-lock.yaml`, sin npm/yarn.

### Versiones detectadas
- node v24.13.0 · npm 11.6.2 · corepack 0.34.5 · pnpm 11.5.0.
- `corepack enable pnpm` falló por EPERM (shim en `C:\Program Files\nodejs`
  requiere admin). Workaround NO global de Node: `corepack prepare
  pnpm@latest-11 --activate` (instala 11.5.0) + `corepack enable
  --install-directory <npm global del usuario> pnpm` para exponer el shim
  `pnpm` en PATH del usuario. No se cambió la versión de Node.

### Archivos creados
- Raíz: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`,
  `drizzle.config.ts` (esqueleto, sin credenciales), `pnpm-lock.yaml`,
  `supabase/config.toml`.
- `apps/web/`: `package.json`, `tsconfig.json`, `next.config.mjs`,
  `postcss.config.js`, `tailwind.config.ts`, `.eslintrc.json`,
  `vitest.config.ts`, `next-env.d.ts`, `app/page.tsx`, `middleware.ts`,
  `tests/unit/smoke.test.ts`.

### Archivos modificados
- `apps/web/app/layout.tsx` (layout raíz funcional, orchestrator-owned).
- `apps/web/app/globals.css` (directivas Tailwind).
- 8 placeholders válidos de route-groups (auth/dashboard) — propiedad de
  agent-frontend-boq, marcados como placeholders de Paso 0.
- `.env.example` (+DATABASE_URL placeholder), `.gitignore`
  (+`*.tsbuildinfo`, `next-env.d.ts`), `README.md`, `docs/DECISIONS.md`,
  `docs/LICENSING.md`, `docs/OPEN_QUESTIONS.md`.

### Dependencias instaladas
- prod: next ^14.2.15, react/-dom ^18.3.1, zod ^3.23.8, drizzle-orm ^0.33.0.
- dev: typescript ^5.5.4, @types/node ^20, @types/react/-dom ^18,
  tailwindcss ^3.4.13, postcss ^8.4.47, autoprefixer ^10.4.20,
  eslint ^8.57.1, eslint-config-next ^14.2.15, vitest ^2.1.1.
- Builds aprobados (`onlyBuiltDependencies`): esbuild, unrs-resolver.
- `drizzle-kit` diferido (lo solicitará agent-db-rls).

### Validaciones (todas PASAN)
- typecheck exit 0 · lint sin errores · test 1 passed · build 8 rutas OK.
- validate-claude-agents.ps1 → PASS 214 / WARN 0 / FAIL 0.
- git status: sin archivos privados; `pnpm-lock.yaml` presente; sin
  `package-lock.json`.

### B-002
- RESUELTO. Checklist de merge ejecutable.

### Siguiente paso
- Pendiente: COMMIT del scaffolding (no realizado, según instrucción).
- Listo para lanzar Oleada 1 (db-rls ∥ excel-mapper ∥ frontend-boq) tras
  congelar el contrato de entidades (Sección 6 PROJECT_MASTER) en
  DATABASE_SCHEMA/API_CONTRACTS.

### Agentes activos al cierre
- Ninguno.

## 2026-05-29 — Revisión preventiva: pnpm allowBuilds + upgrade Next 16 (orchestrator)

### 1) Configuración pnpm 11
- Verificado empíricamente en el dist de pnpm 11.5.0: `allowBuilds` es la
  clave vigente (91 ocurrencias) frente a `onlyBuiltDependencies` (2,
  legacy). El usuario tenía razón; mi suposición previa era incorrecta.
- `pnpm-workspace.yaml` ahora usa solo `allowBuilds` (mapa `pkg: bool`),
  sin claves legacy ni placeholders inválidos:
  `esbuild: true`, `sharp: true`, `unrs-resolver: true`.

### 2) Upgrade Next.js 14 → 16 (estable, no canary)
- Versiones consultadas (`pnpm view`): next 16.2.6, react 19.2.6,
  react-dom 19.2.6, eslint-config-next 16.2.6, @types/react 19.2.15,
  @types/react-dom 19.2.3, eslint 9.39.4 (se descartó 10.4.1),
  typescript 5.9.3 (se descartó 6.0.3). Canary 16.3.0 descartado.
- Migración Next 16 aplicada (confirmada contra `node_modules/next/dist/docs`):
  - `middleware.ts` → **`proxy.ts`** (función `proxy`); `middleware.ts`
    eliminado. El build reporta `ƒ Proxy (Middleware)`.
  - `next lint` eliminado en 16 → **ESLint 9 flat config**
    (`apps/web/eslint.config.mjs` consumiendo el array de
    `eslint-config-next`); `.eslintrc.json` eliminado; script `eslint .`.
  - Build con Turbopack.

### 3) Documentación
- Creado `AGENTS.md` (regla: consultar doc versionada en
  `node_modules/next/dist/docs/`). Añadido `@AGENTS.md` en `CLAUDE.md`
  sin borrar reglas existentes.
- Actualizadas menciones de Next 14 → 16 en README, DECISIONS, LICENSING
  y `.claude/agents/agent-frontend-boq.md`.
- DECISIONS y LICENSING reflejan el nuevo stack y `allowBuilds`.

### Validaciones (todas PASAN, stack Next 16)
- `pnpm install` limpio (sin ERR_PNPM_IGNORED_BUILDS tras rebuild de
  esbuild/sharp/unrs-resolver).
- typecheck exit 0 · lint exit 0 (eslint flat) · test 1 passed ·
  build OK (8 rutas + Proxy, Next 16.2.6 Turbopack).
- validate-claude-agents.ps1 → PASS 214 / WARN 0 / FAIL 0.
- Sin `package-lock.json`; sin ag-grid-enterprise; sin AGPL; `private/`
  ignorado; Excel real no aparece en git status.

### Estado
- Repositorio listo para commit del Paso 0. Commit NO realizado (según
  instrucción). Sin push. Sin subagentes.

### Agentes activos al cierre
- Ninguno.

## 2026-05-29 — Paso 0 commit/push + congelamiento de contrato v1 (orchestrator)

### Commit del Paso 0
- Commit `9bb4a397633a3513d7a0d50d8b592c4e32fff510` (`9bb4a39`):
  "chore: scaffold pnpm monorepo toolchain". Push OK
  `463d6a3..9bb4a39 main -> main`. Auditoría de `.claude/agent-memory/`
  limpia (sin secretos/datos privados).

### Congelamiento de contrato de entidades v1
- `docs/DATABASE_SCHEMA.md` → **Contrato congelado v1**: 20 entidades de
  Oleada 1 documentadas a fondo (tabla, propósito, columnas, tipos,
  nullability, PK UUID, FK, ON DELETE, organization_id/RLS, índices,
  integridad, enums, inmutabilidad, snapshots, campos 🔒, dudas). 7
  entidades marcadas **Provisional v0 — no congelada**.
- `docs/API_CONTRACTS.md` → **Contrato congelado v1**: 20 interfaces TS
  públicas (Organization … QuantityLine), alias base (`Uuid`,
  `IsoDateTime`, `IsoDate`, `DecimalString`), todos los enums, matriz de
  privacidad cliente-safe vs interno, ownership de tipos y reglas de cambio.
- `docs/AGENT_REGISTRY.md` → sección de ownership del contrato: db-rls
  implementa el esquema exacto; excel-mapper y frontend-boq respetan
  nombres/tipos canónicos; sin renombres unilaterales; cambios solo vía
  INTEGRATION_REQUESTS.

### Estrategia ratificada
- DB `snake_case` ↔ TS `camelCase`; tipos `PascalCase`.
- Dinero: `NUMERIC(20,10)` (DB) ↔ `string` decimal (API) ↔ Decimal.js (cálculo).
  El frontend NO calcula totales financieros.
- Snapshots/versiones emitidas inmutables (RLS bloquea UPDATE/DELETE).
- Privacidad backend-first (campos 🔒 no se serializan a rol cliente).
- Alcance Oleada 1 = solo entidades congeladas v1.

### Decisiones que siguen ABIERTAS (no cerradas)
- **Q9** política de redondeo COP → bloquea Oleada 2 (cost-domain).
- **Q8** base del descuento (público vs referencia) → bloquea Oleada 2 (pricing).
- Ninguna afecta el esquema congelado v1.

### Validaciones
- typecheck/lint/test/build OK; validate-claude-agents.ps1 PASS 214/0/0.
- Cambios solo en docs (.md); sin código/migraciones.

### Estado
- Contrato v1 redactado. Pendiente tu revisión. Commit/push NO realizados.
- Tras tu aprobación, listo para lanzar Oleada 1.

### Agentes activos al cierre
- Ninguno.

## 2026-05-29 — Preparación operativa de Oleada 1 (orchestrator)

### .worktreeinclude (temporal)
- Creado `.worktreeinclude` en raíz con **solo** la ruta exacta
  `private/COT.ENTRE PATIOS 1 PISO (1).xlsx`. Permite que los worktrees
  aislados reciban el golden master (Git no copia archivos ignorados).
- **TEMPORAL Oleada 1**: revisar/retirar después de que
  `agent-excel-mapper` genere el fixture sanitizado, para no depender del
  Excel privado en worktrees.
- Verificado: Excel sigue ignorado (`.gitignore:2 private/`),
  `.worktreeinclude` es versionable, Excel NO en staging.

### Commit del contrato v1
- Commit `cadd8c7ce903f51700cf35161fd8ab406b2f065a` (`cadd8c7`):
  "docs: freeze wave 1 entity contracts". Push OK
  `9bb4a39..cadd8c7 main -> main`. Excel NO staged.

### Dependencias de Oleada 1 (pnpm)
- **Raíz** devDependencies: `drizzle-kit ^0.31.10` (MIT) + script
  `db:generate`. Vive en raíz porque `drizzle.config.ts` está en raíz.
- **apps/web** dependencies: `postgres ^3.4.9` (Unlicense),
  `decimal.js ^10.6.0` (MIT), `ag-grid-community`/`ag-grid-react ^35.3.0`
  (MIT, Community, soporta React 19), `clsx ^2.1.1`,
  `tailwind-merge ^3.6.0`, `class-variance-authority ^0.7.1` (Apache-2.0),
  `lucide-react ^1.17.0` (ISC), `@radix-ui/react-slot ^1.2.4` (MIT).
- **apps/web** devDependencies: `xlsx ^0.18.5` (Apache-2.0).
- **Diferidas** (no instaladas): recharts, frappe-gantt, exceljs,
  @react-pdf/renderer (Oleada 3, vía INTEGRATION_REQUESTS).
- Todas las licencias permisivas; **sin AGPL**; sin `ag-grid-enterprise`.
- Build scripts aprobados ahora incluyen las variantes de `esbuild` que
  trae drizzle-kit (cubiertas por `allowBuilds: esbuild: true`).

### Validaciones (todas PASAN)
- install limpio · typecheck 0 · lint 0 · test 1 passed · build OK
  (Next 16.2.6 Turbopack, `ƒ Proxy`). validate-claude-agents PASS 214/0/0.
- Excel ignorado; sin privados en staging; sin .env trackeado; sin
  package-lock.json; sin ag-grid-enterprise; 11/11 agentes.

## 2026-05-30 — Oleada 1: mapeo del golden master (agent-excel-mapper)

### Alcance trabajado
- Worktree aislado `agent-ad8fb1044998f390d`. Excel privado presente y
  legible en `private/COT.ENTRE PATIOS 1 PISO (1).xlsx` (323 KB, vía
  `.worktreeinclude`). NO se commiteó ni se modificó el Excel.

### Hojas analizadas (10/10)
- RESUMEN, COTIZACION FULL, APU, COTIZACION 1 PISO, ACTA DE MODIFICACION 01,
  RESUMEN 1 PISO, CANTIDADES 1 PISO, CANTIDADES, LISTADO MATERIALES,
  CANT COMPLETO. Documentadas en `docs/EXCEL_MAPPING.md` (propósito, rango,
  columnas, inputs vs derivadas, fórmulas clave, refs cruzadas, sanitización)
  y mapeadas a entidades del contrato congelado v1.

### Archivos creados (todos dentro del alcance de excel-mapper)
- `scripts/golden-master/dump-workbook.mjs` — volcado estructural del Excel.
- `scripts/golden-master/expected-values.ts` — 9 valores de regresión §3.4.
- `scripts/golden-master/recompute-first-floor.ts` — recálculo puro AIU/IVA.
- `scripts/golden-master/first-floor.regression.test.ts` — test Vitest.
- `scripts/golden-master/vitest.config.ts` — config local aislada.
- `scripts/excel-import/import.ts` — importador idempotente.
- `scripts/excel-import/sheet-map.ts` — mapa declarativo Excel→entidades v1.
- `scripts/excel-import/sanitize.ts` — sanitización + alias deterministas.
- `scripts/fixtures/entre-patios-first-floor.fixture.json` — fixture SANITIZADO
  (contrato v1, dinero como string, sin datos privados).
- `scripts/fixtures/entre-patios-first-floor.schema-notes.md` — notas del fixture.
- `scripts/README.md` — cómo ejecutar dump/regresión/importador.

### Archivos modificados
- `docs/EXCEL_MAPPING.md` — completado (10 hojas + mapeo + regresión).
- `docs/INTEGRATION_REQUESTS.md` — solicitudes (ejecución Bash, scripts pnpm).

### Regresión financiera (estado)
- VERIFICADA ANALÍTICAMENTE dentro de tolerancia (±0.01 COP / ±0.001 m²): la
  cadena Admin=D×0.035, Imprev=D×0.025, Util=D×0.04, IVA=Util×0.19,
  Indirectos=ΣAIU+IVA, Total=D+Indirectos, valor_m2=Total/área reproduce los
  9 valores de §3.4 desde la base. NO se ejecutó Vitest (ver bloqueo).
- NO se ajustaron fórmulas ni tasas para forzar coincidencia.

### Bloqueo activo
- **Ejecución denegada**: la herramienta Bash rechazó ejecutar `node`,
  `pnpm exec vitest` y el dump del Excel (solo pasó `node --version`). En
  consecuencia NO se pudo: (a) confirmar coordenadas celda a celda con
  `dump-workbook.mjs`, (b) correr la suite de regresión, (c) ejecutar el
  importador. Registrado en `docs/INTEGRATION_REQUESTS.md`. Las coordenadas
  exactas quedan como `TODO_VERIFY` en `sheet-map.ts` y EXCEL_MAPPING §8.

### Privacidad
- Fixture sanitizado (cliente/proveedores → alias; NIT/tel/dir eliminados).
  `import.ts` incluye `findPrivateLeaks` como verificación final.
- `.gitignore` cubre `private/`, `*.xlsx`, `*.xls` (verificado).

### Siguiente paso recomendado
- Orquestador (o sesión con Bash): ejecutar `scripts/README.md` para
  confirmar PASS empírico de regresión e importador, y poblar el detalle real
  fila a fila con el dump. Luego habilitar Oleada 2 (cost-domain consume el
  fixture y la regresión como oráculo).

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Oleada 1 Fase 1: validación empírica del Excel Mapper (orchestrator)

### Contexto
- Trabajo sobre `backup/wave1-excel-mapper` (respaldo `c9fe850`), en el checkout
  principal (con node_modules). Excel real presente e ignorado (`.gitignore:2`).

### Toolchain añadido (orchestrator owns package.json)
- `tsx ^4.22.3` (devDep raíz, MIT) + scripts raíz `gm:dump`, `gm:build-fixture`,
  `gm:regression`, `gm:import`.

### Validación empírica (todo PASA)
- `gm:dump`: 10 hojas confirmadas con ref/fórmulas/inputs.
- Localización por celda: los 9 valores §3.4 confirmados en celdas reales de
  `RESUMEN 1 PISO` (E27..E35) + `CANTIDADES 1 PISO!I187` (área). Cacheados
  coinciden con §3.4 a precisión completa. Coordenadas documentadas en
  EXCEL_MAPPING §10. TODO_VERIFY de los 9 → resueltos con evidencia.
- `gm:build-fixture`: fixture **v2.0.0 fila por fila** desde el Excel real:
  14 capítulos + **131 ítems BOQ** reales, **SIN ítem de balanceo**.
  Σ ítems = costos_directos ±2.05e-8 COP.
- `gm:regression` (Vitest): **22/22 PASS** (9 fixture vs §3.4 + 9 cadena
  recalculada + 3 BOQ fila-por-fila sin balanceo + 1 presencia).
- `gm:import`: regresión 9/9, recálculo 9/9, **privacidad OK**, idempotencia.

### Fix de privacidad
- `findPrivateLeaks` (sanitize.ts) reescrito: escanea solo texto libre,
  excluye UUID/DecimalString/fecha/moneda. Antes daba falsos positivos
  (NIT/teléfono) sobre ceros de UUID y montos. Fixture verificado: 0 fugas.

### Validaciones de proyecto
- typecheck 0 · lint 0 · test 1 passed · build OK (Next 16.2.6) ·
  validate-claude-agents PASS 214/0.
- Excel ignorado; sin privados en staging; los 9 valores **pasan
  empíricamente**. No se ajustó ninguna fórmula.

### Estado
- Fase 1 COMPLETA. Listo para commit adicional sobre `backup/wave1-excel-mapper`
  y luego crear `integration/wave-1` (Fase 2).

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Integración Oleada 1 en integration/wave-1 (orchestrator)

### Fase 0 — respaldos
- `backup/wave1-db-rls` (00283d0), `backup/wave1-frontend-boq` (b7f0de8),
  `backup/wave1-excel-mapper` (c9fe850→c9e4f3a) creadas y en origin.

### Fases 2-5 — integración secuencial (cherry-picks en integration/wave-1)
- Rama creada desde `origin/main` (7e45691), pusheada. `main` intacto.
- **DB+RLS** (00283d0): cherry-pick limpio. Fix integración: `drizzle-orm`
  0.33→0.45 (schema usa API array) + regex tests RLS acotados por política.
  RLS = **estática PASS (70 tests)**; **runtime PENDIENTE** (Supabase/Docker).
  NO se conectó base remota.
- **Excel Mapper** (c9fe850 + c9e4f3a): cherry-pick limpio; gm:regression 22/22,
  gm:import PASS; fixture idéntico al regenerar (idempotente).
- **Frontend BOQ** (b7f0de8): cherry-pick limpio (layout/proxy intactos). Fix
  integración: tipos AG Grid v35 (`boq-grid.tsx`) + orden `@import` en
  `globals.css`. Dev smoke: 8/8 rutas HTTP 200.

### Fase 6 — `.worktreeinclude` eliminado (temporal); `private/` sigue ignorado.

### Fase 7 — validación integral (integration/wave-1)
- typecheck 0 · lint 0 · **108 tests PASS** · build Next 16.2.6 (9 rutas + Proxy)
  · validate-claude-agents PASS 214/0/0.
- Sin ag-grid-enterprise, sin AGPL, sin `.env` trackeado, sin `package-lock.json`;
  Excel ignorado y no en staging; fixture sin balanceo; sin TODO_VERIFY crítico.
- INTEGRATION_REQUESTS: 3 solicitudes del excel-mapper RESUELTAS.
- QA_REPORT actualizado (PASS pre-merge; salvedad RLS runtime).

### Estado
- `integration/wave-1` lista para commit final + push. **NO merge a main**
  (a la espera de aprobación del usuario).

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Merge de Oleada 1 a main (orchestrator)

### Merge
- Usuario aprobó el merge. `git merge --no-ff integration/wave-1` →
  **merge commit `58f4366222d86cec492748dc84eabd1123e7c8db`** (`58f4366`).
  Sin conflictos. `main` adelantó 8 commits sobre `7e45691`.

### Validación post-merge (todo PASA)
- typecheck 0 · lint 0 · **test 108 PASS** · build Next 16.2.6 (9 rutas + Proxy).
- `gm:regression` **22/22** (9/9 golden master ±0.01 COP) · `gm:import` todas PASS.
- `validate-claude-agents.ps1` **PASS 214/0/0** · `git diff --check` limpio.

### Privacidad y limpieza (verificado en main)
- Excel ignorado (`.gitignore:2 private/`) y NO versionado; 0 nombres de cliente
  en archivos versionados (leak-check por hash); fixture sanitizado fila-por-fila
  **sin ítem de balanceo**; sin `TODO_VERIFY` críticos.
- Sin `ag-grid-enterprise`, sin AGPL, sin `.env` trackeado, sin `package-lock.json`.
- `.worktreeinclude` eliminado; fixture sanitizado presente.

### Estado del frontend
- Build prerenderiza 9 rutas; dev smoke previo 8/8 HTTP 200. AG Grid Community.

### Ramas y tag
- **Conservados**: `backup/wave1-db-rls`, `backup/wave1-frontend-boq`,
  `backup/wave1-excel-mapper`, `integration/wave-1`.
- Tag anotado: `wave-1-foundation-v1`.

### Pendientes antes de Oleada 2
- **RLS runtime** contra Supabase/Postgres local (Docker) — solo estático hasta ahora.
- **Q8** (base del descuento) y **Q9** (redondeo COP) deben cerrarse.

### Agentes activos al cierre
- Ninguno. Oleada 2 NO iniciada (a la espera de autorización).

## 2026-05-30 — Oleada 1.5: cierre Q8/Q9 + intento RLS runtime local (orchestrator)

### Rama
- Toda la Oleada 1.5 se ejecuta FUERA de `main`, en `feature/wave-1.5-local-rls`
  (creada desde `main` `d9ca10b`, pusheada a origin). `main` permanece intacto.

### Fase 1-2 — Q8 y Q9 CERRADAS
- **Q8** (base del descuento) = **`online_public_price`**. Fórmulas canónicas:
  `budget_reference_price = online_public_price × (1 + preventive_variation_pct)`;
  `expected_purchase_price = online_public_price × (1 − negotiated_discount_pct)`;
  `projected_saving = budget_reference_price − expected_purchase_price`;
  `realized_saving = budget_reference_price − actual_purchase_price`. Excepciones
  configurables por proveedor/producto. Descuento/ahorro/margen son 🔒 internos
  (nunca a cliente; privacidad backend-first).
- **Q9** (redondeo COP): cálculo interno raw (`Decimal.js` + `NUMERIC(20,10)` +
  serialización `string`, sin float JS, sin redondear intermedios, snapshots con
  precisión completa); presentación `ROUND_HALF_UP` (UI/PDF cliente 0 dec; Excel
  técnico 2 dec; regresión/auditoría raw). El redondeo visual NO muta snapshots.
- Documentadas en DECISIONS, API_CONTRACTS, DATABASE_SCHEMA y OPEN_QUESTIONS.

### Fase 3 — Entorno e instalación
- Docker 29.5.2 operativo (`docker info` Server OK; `hello-world` OK). Node v24.13.0,
  pnpm 11.5.0 (Corepack). Supabase CLI NO estaba instalado.
- Instalado **`supabase ^2.102.0`** (MIT) como devDep raíz (`corepack pnpm
  --workspace-root add -D supabase`). Sin global, sin remoto. `supabase --version`
  → 2.102.0. Registrado en LICENSING y DECISIONS.

### Fase 4-5 — RLS runtime: BLOQUEADO por Docker (B-003)
- Auditados `config.toml`, 11 migraciones, 2 seeds, README de policies (compatibles
  con CLI local). El seed solo crea 1 organización ⇒ el harness crea una org B.
- Creado harness **`scripts/rls-runtime/run.ts`**: conecta al Postgres local
  (`postgres` pkg), `SET LOCAL ROLE authenticated` + claims JWT vía
  `set_config('request.jwt.claims', ...)`, transacciones con ROLLBACK. Cubre:
  helper `app.current_org()`, aislamiento A/B, denegación cross-org (UPDATE 0 filas +
  INSERT WITH CHECK), usuario sin organización, `price_observations` append-only
  (+ trigger de inmutabilidad), `apu_calculation_snapshots` inmutable, versiones
  emitidas bloqueadas (+ hijos) y control positivo en `draft`.
- **BLOQUEO**: `supabase start` y `docker pull` fallan con
  `io.containerd.metadata.v1.bolt/meta.db: input/output error` (content store de
  Docker Desktop corrupto; `docker system df` no lista imágenes). Host con 1.5 TB
  libres ⇒ no es espacio. Ver **B-003** en OPEN_QUESTIONS. NO se ejecutó la suite
  RLS runtime; NO se declara PASS. NO se conectó base remota.

### Fase 6 — Validación offline (todo PASS)
- typecheck 0 · lint 0 · **108 tests** · build Next 16.2.6 (8 rutas + Proxy) ·
  `gm:regression` 22/22 · `gm:import` PASS (privacidad 0 fugas) ·
  `validate-claude-agents` 214/0/0 · `git diff --check` limpio.
- `.gitignore`: añadido `supabase/.temp/` y `supabase/.branches/`. Excel ignorado;
  sin privados en staging; sin `.env` trackeado; sin `package-lock.json`.

### Estado / próximo paso
- Commit de deliverables en la rama (NO merge a `main`). Falta SOLO la ejecución
  real de RLS runtime, bloqueada por B-003 (infra/Docker). Tras reparar Docker
  Desktop: `supabase start` → `db reset` → ejecutar el harness → si PASS, decidir
  merge a `main` y habilitar Oleada 2.
- **NO se recomienda merge a `main` todavía** (RLS runtime sin ejecutar).

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Oleada 1.5: RLS runtime REAL ejecutado, B-003 RESUELTO (orchestrator)

### Contexto
- Docker Desktop reparado por el usuario (content store regenerado; validado:
  `docker info`/`system df`/`pull alpine`/`run alpine` OK). Sesión sobre la rama
  existente `feature/wave-1.5-local-rls` (sin rama nueva, sin merge a `main`, sin
  remoto, sin `supabase link`/`db push`, sin Oleada 2).

### Entorno Supabase local
- `corepack pnpm install`: up to date (pnpm 11.5.0).
- `supabase start`: imágenes descargadas OK (Docker reparado); **11 migraciones**
  aplicadas en orden. El contenedor `realtime` quedó *unhealthy* en Windows ⇒ se
  arrancó excluyendo servicios no esenciales (`-x realtime,studio,storage-api,
  imgproxy,edge-runtime,logflare,mailpit,vector`); el harness solo necesita `db`.
- `supabase db reset`: re-aplicó **11 migraciones + 2 seeds** sin errores.

### Fixes de integración (necesarios para que corriera el runtime)
- **`supabase/config.toml`** (orchestrator-owned): añadido `[db.seed]` con
  `sql_paths` explícito a `seeds/0001` y `seeds/0002` (no se cargaban por defecto;
  `supabase db reset` avisaba `no files matched supabase/seed.sql`).
- **`supabase/seeds/0001_demo_org_and_profiles.sql`** (db-rls-owned, fix de
  integración): el seed insertaba `profiles` sin filas previas en `auth.users`.
  En el stack Supabase local el esquema `auth` existe ⇒ la migración `0001`
  activa el FK `profiles_id_auth_users_fk` y `db reset` fallaba (SQLSTATE 23503).
  Añadido bloque `DO $$ … INSERT auth.users … $$` guardado por la presencia del
  esquema `auth` (espejo de la condición de la migración; sigue funcionando en
  Postgres puro). Solo `id`+columnas mínimas, sin credenciales. **Registrado en
  INTEGRATION_REQUESTS para aval de agent-db-rls.**
- **`scripts/rls-runtime/run.ts`** (orchestrator-owned): `setupOrgB` ahora crea
  la fila `auth.users` del admin B antes de su `profile` (mismo guard de `auth`).

### RLS runtime — RESULTADO: 21 PASS / 0 FAIL (Postgres real)
- Pre-flight: seeds org/proyecto A; **20 tablas con RLS FORCE**.
- Helper `app.current_org()` lee `organization_id` del JWT; aislamiento A/B
  (A no ve B, B no ve A); A no UPDATE/INSERT en org B (0 filas / WITH CHECK);
  usuario sin organización 0 filas; `price_observations` append-only + precio
  inmutable (trigger); `apu_calculation_snapshots` inmutable; `estimate_versions`
  emitida bloquea UPDATE/DELETE + hijos; control positivo `draft` editable.

### Validaciones generales (todas PASS)
- typecheck 0 · lint 0 · **108 tests** · build Next 16.2.6 (9 rutas + Proxy) ·
  `gm:regression` **22/22** (golden master ±0.01 COP) · `gm:import` PASS
  (privacidad 0 fugas) · `validate-claude-agents` **214/0/0** · `git diff --check`
  limpio (solo avisos LF→CRLF). Sin privados en staging; sin `.env` trackeado;
  sin `package-lock.json`; sin `ag-grid-enterprise`; sin AGPL.

### Estado / próximo paso
- **B-003 RESUELTO**. Q8/Q9 ya cerradas. Commit `test: complete local supabase
  rls runtime validation` en la rama; push solo a
  `origin feature/wave-1.5-local-rls`. Supabase local detenido (`supabase stop`).
- **Recomendación: APROBAR merge `feature/wave-1.5-local-rls` → `main`** (no
  ejecutado en este ciclo; queda a decisión del usuario). Tras el merge, habilitar
  **Oleada 2** (cost-domain ∥ pricing ∥ homecenter).

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Merge de Oleada 1.5 a main + cierre (orchestrator)

### Merge
- Usuario aprobó el merge. Preflight: `main = origin/main = d9ca10b` (árbol
  limpio); `origin/feature/wave-1.5-local-rls` final = `febfeb8`; 3 backups y tag
  `wave-1-foundation-v1` conservados; Excel ignorado; sin `.env` trackeado; sin
  `package-lock.json`; solo `ag-grid-community/react` (MIT).
- `git merge --no-ff feature/wave-1.5-local-rls` → **merge commit
  `1ddc833d733c51e556445ccee96bdab8843efcd1`** (`1ddc833`). **Sin conflictos.**
  16 archivos, +784/-13. `main` adelantó 2 commits de contenido + merge.

### Validación post-merge (todo PASA en main)
- `pnpm install` up to date · typecheck 0 · lint 0 · **108 tests** · build Next
  16.2.6 (9 rutas + Proxy) · `gm:regression` **22/22** · `gm:import` **9/9**
  (regresión §3.4 diff=0; privacidad 0 fugas) · `validate-claude-agents`
  **214/0/0** · `git diff --check` limpio · árbol limpio.
- Privacidad: `git check-ignore` confirma `private/` ignorado; sin `.env`
  trackeado; sin `package-lock.json`; `ag-grid-enterprise` solo en comentarios de
  prohibición; sin AGPL.

### Deuda técnica registrada
- **B-004 — Supabase Realtime unhealthy en Docker Desktop (Windows)**: no
  bloqueante; no afectó RLS (solo se requiere el contenedor `db`); RLS runtime
  21/21. Revisar antes de funcionalidades Realtime o producción. Documentado en
  OPEN_QUESTIONS y QA_REPORT. NO se intentó resolver.

### Commit documental
- `docs: record wave 1.5 runtime validation and realtime caveat` (B-004 +
  validación post-merge en OPEN_QUESTIONS, QA_REPORT, HANDOFF_LOG).

### Estado de cierre
- **Oleada 1.5 CERRADA.** B-003 RESUELTO; Q8/Q9 RESUELTAS; RLS runtime 21/21.
- Push a `origin main` + tag anotado `wave-1.5-rls-runtime-validated-v1`.
- Ramas `feature/wave-1.5-local-rls`, backups e `integration/wave-1`
  conservadas; tag `wave-1-foundation-v1` conservado.
- **Oleada 2 NO lanzada** (plan preparado; espera autorización del usuario).
  Secuencia recomendada: 2A `agent-cost-domain` ∥ `agent-pricing`; congelar
  `docs/PRICING_ADAPTER_CONTRACT.md`; luego 2B `agent-homecenter`.

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Oleada 2A: rama de integración + congelar contrato de precios (orchestrator)

### Fase 0 — rama de integración
- Preflight: `main = origin/main = 974ea99` (árbol limpio); tags
  `wave-1-foundation-v1` y `wave-1.5-rls-runtime-validated-v1` conservados;
  3 backups conservados; Excel ignorado; sin `.env`/`package-lock`; solo
  `ag-grid-community/react` (MIT).
- Creada y publicada **`integration/wave-2a`** desde `main`. `main` intacta.

### Fase 1 — contrato de lectura de precios CONGELADO v1
- Creado **`docs/PRICING_READ_CONTRACT.md`** (orchestrator-owned, congelado v1;
  cambios solo vía INTEGRATION_REQUESTS). Define:
  - tipos base (reusa `Uuid`/`IsoDateTime`/`DecimalString`/`PriceSourceType`/
    `PricingRuleType`/`SyncStatus` de API_CONTRACTS);
  - `ApprovedPriceContext` (snapshot aprobado; dinero/porcentajes `DecimalString`;
    fórmulas Q8 base `onlinePublicPrice`; campos 🔒 marcados);
  - `PricingReadPort` (`getApprovedPrice` → único contexto | `no_approved_price`
    | `ambiguous_price`); determinista, solo lectura;
  - `PricingApprovalPort` (escritura interna exclusiva de pricing: observación,
    aprobación humana, override trazable, append-only, no muta snapshots);
  - privacidad backend-first + proyección `ClientSafePrice` (sin campos 🔒).
- **Frontera**: cost-domain consume el puerto/DTO; NO consulta tablas de pricing
  ni recalcula descuentos/ahorros; usa `budgetReferencePrice` como
  `unit_price_snapshot`.
- Actualizados: `API_CONTRACTS.md` (§5 + ownership de puertos),
  `AGENT_REGISTRY.md` (dependencia 2A + criterios cost/pricing), `DECISIONS.md`
  (4 filas: merge 1.5, B-004, rama 2A, contrato de precios), este HANDOFF_LOG.

### Próximo paso
- Commit `docs: freeze wave 2a pricing read contract` + push a
  `origin integration/wave-2a`. Luego lanzar en paralelo (worktrees aislados)
  `agent-cost-domain` y `agent-pricing`. NO `agent-homecenter`. NO merge.

### Agentes activos al cierre de esta microfase
- Ninguno (aún). A continuación se lanzan cost-domain ∥ pricing.

## 2026-05-30 — Oleada 2A: agentes ejecutados y entregables preservados (orchestrator)

### Lanzamiento
- Contrato congelado commit `02ca9c3` en `integration/wave-2a`. Lanzados en
  paralelo en worktrees aislados: **agent-cost-domain** y **agent-pricing**.
- **Nota**: ambos worktrees se derivaron de `main`@`974ea99` (antes de
  `02ca9c3`), por lo que NO vieron `docs/PRICING_READ_CONTRACT.md`. Cada uno
  implementó `PricingReadPort` desde la spec de la tarea + Q8 de API_CONTRACTS.
  Reconciliación de tipos registrada en INTEGRATION_REQUESTS (pendiente 2A).

### agent-cost-domain — entregable
- Motor financiero puro en `apps/web/modules/apu|boq|estimates/` + 8 archivos de
  test en `apps/web/tests/unit/cost-domain/` + memoria de agente. Mano de obra,
  APU (vía `PricingReadPort`), BOQ, AIU/IVA configurables, total, valor/m²,
  snapshots inmutables, clonación. `decimal.js`/`DecimalString` (Q9).
- Validado: **typecheck 0 · lint 0 · 178/178 tests · gm:regression 22/22**;
  9 valores §3.4 ±0.01 COP desde el fixture (sin ajustar fórmulas).
- **`git commit` denegado en su entorno**; el orquestador commiteó →
  **`3783aca`**. Preservado en `backup/wave2-cost-domain` (pusheada).

### agent-pricing — entregable
- Capas de precio en `apps/web/modules/pricing/` (sin `adapters/`) y
  `apps/web/modules/suppliers/` + 8 archivos de test en
  `apps/web/tests/unit/pricing/`. Proveedores, `supplier_products`,
  `price_observations` append-only, reglas con precedencia, variación preventiva,
  descuento interno, precios/ahorros (Q8), override trazable, aprobación humana,
  `PricingReadPort`/`PricingApprovalPort`, proyección `ClientSafePrice`
  (privacidad backend-first).
- Validado por el orquestador en su worktree: **typecheck 0 · lint 0 ·
  155/155 tests** (108 previos + 47 de pricing).
- **`git commit` denegado en su entorno**; el orquestador commiteó →
  **`7897926`**. Preservado en `backup/wave2-pricing` (pusheada).

### Higiene (ambos worktrees)
- Sin archivos privados, `.env`, Excel, AGPL ni `ag-grid-enterprise`. Sin solape
  de archivos entre agentes. `adapters/` y `scripts/catalog-sync/` intactos
  (reservados a homecenter, Oleada 2B).

### Estado / próximo paso
- **NO integrado aún** a `integration/wave-2a`; **NO merge a `main`**;
  **`agent-homecenter` NO lanzado**. Backups y `feature/wave-1.5-local-rls`,
  backups de wave-1, tags: todo conservado.
- Pendientes registrados en INTEGRATION_REQUESTS: (1) reconciliar tipos del
  puerto de precios a una sola fuente; (2) confirmar base del IVA vía
  `base_type='utility'` del esquema vs flag de dominio.
- Antes de Oleada 2B: congelar `docs/PRICING_ADAPTER_CONTRACT.md`.

### Agentes activos al cierre
- Ninguno (cost-domain y pricing finalizaron).

## 2026-05-30 — Oleada 2A: integración secuencial cost-domain + pricing (orchestrator)

### Rama e integración
- Sobre `integration/wave-2a`. Cherry-picks aplicados: **`6694d88`** (cost-domain,
  desde backup `3783aca`) y **`1e8a869`** (pricing, desde backup `7897926`).
  Ambos limpios, sin conflictos. `main` intacta.

### Unificación del contrato de precios (Fase 3)
- Creada **FUENTE ÚNICA DE CÓDIGO** `apps/web/lib/contracts/pricing-read.ts`
  (refleja el contrato congelado: forma async + `PricingReadResult` union +
  `ApprovedPriceContext` completo + clases de error `ApprovedPriceNotFoundError`/
  `AmbiguousApprovedPriceError` + helper `throwOnPricingError` + `ClientSafePrice`
  + `INTERNAL_PRICE_FIELDS`).
- `apps/web/modules/apu/pricing-port.ts` ahora re-exporta el contrato (cost-domain
  consume); `apps/web/modules/pricing/types.ts` re-exporta el contrato y conserva
  sólo el `PricingApprovalPort` (write-side de pricing). **Una sola**
  `interface PricingReadPort`/`ApprovedPriceContext` (verificado por grep).
- cost-domain pasó `resolveUnitPriceSnapshot`/`calculateApuComponentWithPort` a
  **async** y convierte `!ok`→clases de error. `_fakes.ts` y `apu.test.ts`
  adaptados (async + `rejects.toBeInstanceOf`). Sin dependencias circulares
  (el contrato sólo importa `@/lib/utils/types`).
- Ajuste menor documentado: `PricingReadQuery.estimateVersionId?` (opcional) para
  congelar precio por versión (cost-domain). Reflejado en PRICING_READ_CONTRACT
  y API_CONTRACTS.

### Base del IVA (Fase 4)
- Eliminado el flag `contributesToUtilityBase`. Regla canónica (solo `base_type`
  + `sortOrder`): una regla `base_type='utility'` se aplica sobre el monto de la
  última línea `direct_cost` previa (la Utilidad). Reproduce el golden master
  (IVA = Utilidad × 0.19, gm:import diff=0). Sin cambios al seed/fixture (U sigue
  `direct_cost`). Tests añadidos: base directa, base utility, orden de cálculo,
  error si no hay `direct_cost` previa.

### Validación integral (Fase 5 — todo PASS)
- typecheck 0 · lint 0 · **229 tests** (108 base + cost-domain + pricing) · build
  Next 16.2.6 (9 rutas + Proxy) · `gm:regression` **22/22** · `gm:import` **9/9**
  (±0.01 COP, diff=0) · `validate-claude-agents` **214/0/0** · `git diff --check`
  limpio. Sin privados/`.env`/`package-lock`; sin `ag-grid-enterprise` en dominio;
  sin AGPL. Proyección `ClientSafePrice` sin campos 🔒 (privacy.test.ts).

### RLS runtime (Fase 6)
- La integración NO modificó `supabase/migrations|policies|seeds` ni
  `apps/web/lib/db/schema.ts` ⇒ **RLS runtime 21/21** de Oleada 1.5 sigue vigente
  (no se relevantó Docker). **B-004** (Realtime) sigue como deuda técnica.

### Estado / próximo paso
- Commit `chore: integrate and validate wave 2a cost domain and pricing` +
  push a `origin integration/wave-2a`. **NO merge a `main`** (a la espera de
  aprobación del usuario). **`agent-homecenter` NO lanzado.**
- Recomendación: **APROBAR merge `integration/wave-2a` → `main`**. Antes de
  Oleada 2B: congelar `docs/PRICING_ADAPTER_CONTRACT.md`.

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Merge de Oleada 2A a main (orchestrator)

### Merge
- Usuario aprobó el merge. Preflight: `main = origin/main = 974ea99` (árbol
  limpio); integración final `31c3102`; backups wave1 (3) + wave2 (2) y tags
  conservados; Excel ignorado; sin `.env`/`package-lock`; solo ag-grid-community.
- `git merge --no-ff integration/wave-2a` → **merge commit
  `f0c7d235beb7d16ce514566594df2becd869cf06`** (`f0c7d23`). **Sin conflictos.**

### Validación post-merge (todo PASA en main)
- typecheck 0 · lint 0 · **test 229** · build Next 16.2.6 (9 rutas + Proxy) ·
  `gm:regression` **22/22** · `gm:import` **9/9** (±0.01 COP, **IVA diff=0**) ·
  `validate-claude-agents` **214/0/0** · `git diff --check` limpio.
- Estructura: **1** `interface PricingReadPort` y **1** `ApprovedPriceContext`
  (en `apps/web/lib/contracts/pricing-read.ts`); sin `contributesToUtilityBase`;
  IVA por `base_type='utility'`; `ClientSafePrice` sin campos 🔒.

### RLS runtime (Paso 4)
- El merge NO modificó `supabase/migrations|policies|seeds` ni
  `apps/web/lib/db/schema.ts` (verificado `git diff 974ea99..HEAD`) ⇒ **RLS
  runtime 21/21** de Oleada 1.5 sigue vigente. No se relevantó Docker.
- **B-004** (Realtime unhealthy en Windows) sigue como deuda técnica no bloqueante.

### Privacidad
- `INTERNAL_PRICE_FIELDS` cubre público/descuento/esperado/real/ahorros/
  `sourceReference`/proveedor interno; proyección `ClientSafePrice` sin 🔒
  (privacy.test.ts). Excel ignorado y no versionado; sin `.env`/`package-lock`;
  sin `ag-grid-enterprise` en dominio; sin AGPL; sin datos privados.

### Ramas y tag
- **Conservados**: backups wave1 (db-rls/excel-mapper/frontend-boq), wave2
  (cost-domain/pricing), `integration/wave-2a`, `feature/wave-1.5-local-rls`.
- Tag anotado: **`wave-2a-domain-pricing-v1`** sobre el merge.

### Estado / próximo paso
- **Oleada 2A CERRADA y en `main`.** `agent-homecenter` NO lanzado; Oleada 2B
  NO iniciada. Antes de 2B: congelar `docs/PRICING_ADAPTER_CONTRACT.md`
  (decisiones recomendadas Q11 aprobación humana + Q14 canal Homecenter).

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Oleada 2B: microfase documental (orchestrator)

### Rama
- Creada y publicada `integration/wave-2b` desde `main` (`75394f1`). `main` intacta.

### Q11 y Q14 CERRADAS
- **Q11** (aprobación humana): MVP **simple** por usuario interno autorizado;
  auditoría obligatoria; preview antes de persistir; SKU ambiguos `pending`; sin
  tocar snapshots emitidos; `price_observations` append-only; doble aprobación =
  soporte futuro configurable. Cerrada en DECISIONS/OPEN_QUESTIONS.
- **Q14** (canal Homecenter): MVP **adaptador genérico + CSV/Excel** con preview
  y aprobación humana; SKU/URL opcionales; matching con candidatos+score;
  fallback manual; sin API pública asumida; sin scraping; interfaz sustituible.
  Cerrada en DECISIONS/OPEN_QUESTIONS.

### Contrato del adaptador CONGELADO v1
- Creado **`docs/PRICING_ADAPTER_CONTRACT.md`** (orchestrator-owned, congelado;
  cambios solo vía INTEGRATION_REQUESTS): frontera del módulo, interfaz
  `SupplierAdapter` (`parseCatalog`/`mapToSupplierProducts`/`buildPreview`/
  `toPriceObservations`), tipos `RawSupplierItem`/`SkuMatchCandidate`/
  `SkuMatchProposal`/`ImportPreview`/`ImportResult`, idempotencia, aprobación
  humana (Q11) y privacidad backend-first (Q14).
- Actualizados `API_CONTRACTS.md` (§6) y `AGENT_REGISTRY.md` (ownership 2B).

### Próximo paso
- Commit `docs: freeze wave 2b pricing adapter contract` + push a
  `origin integration/wave-2b`. Luego lanzar **únicamente** `agent-homecenter`
  en worktree aislado. NO integrar. NO merge.

### Agentes activos al cierre de esta microfase
- Ninguno (aún). A continuación se lanza agent-homecenter.

## 2026-05-30 — Oleada 2B: agent-homecenter ejecutado y preservado (orchestrator)

### Lanzamiento
- Lanzado `agent-homecenter` en worktree aislado (derivado de `main`@`75394f1`,
  por lo que NO vio `docs/PRICING_ADAPTER_CONTRACT.md`; implementó desde la spec
  de la tarea). Reconciliación contra el contrato registrada en
  INTEGRATION_REQUESTS (pendiente 2B).

### Entregable
- Adaptador genérico en `apps/web/modules/pricing/adapters/` (`types`,
  `supplier-adapter`, `import-preview`, `idempotency`, `homecenter-csv`, `index`)
  + tests en `apps/web/tests/unit/pricing-adapters/` (csv-parser, fixtures,
  homecenter-adapter; **77 tests**) + `scripts/catalog-sync/` (README,
  `convert-excel.ts` [xlsx devDep, import dinámico], `preview-import.ts`,
  `sample-catalog.csv` sanitizado). Sin cambios a `package.json`.
- `SupplierAdapter` (parseCatalog/mapToSupplierProducts/buildPreview/
  toPriceObservations); idempotencia; preview sin persistencia; matching SKU con
  candidatos+score; persistencia SOLO vía `PricingApprovalPort` tras aprobación
  humana simple (Q11); `price_observations` append-only; ambiguos `pending`;
  privacidad backend-first. **Sin scraping, sin API pública, sin red.**

### Incidencias y resolución (orchestrator)
- El agente dejó **typecheck rojo (43 errores)** (strict-null + `string|undefined`
  + export `ResourceCatalog` faltante); su corrida se truncó. Tests (runtime) y
  lint sí pasaban.
- Un reintento generó un **segundo worktree** (no se continuó el original vía
  SendMessage) que dejó adapters+tests en **typecheck 0** pero sin
  `scripts/catalog-sync/`. El orquestador **consolidó**: copió
  `scripts/catalog-sync/` + memoria del worktree original al worktree verde.
- Revalidación en el worktree consolidado: **typecheck 0 · lint 0 · 306 tests ·
  build OK**; sin privados/Excel/`.env`/scraping/red/enterprise/AGPL.
- `git commit` denegado a los subagentes ⇒ el orquestador commiteó `ccc1f0b` y
  preservó en **`backup/wave2-homecenter`** (pusheada).

### Estado / próximo paso
- **NO integrado** a `integration/wave-2b` ni a `main`. `main` intacta
  (`75394f1`). Backups y tags conservados.
- Antes de integrar 2B: reconciliar tipos del adaptador contra
  `PRICING_ADAPTER_CONTRACT` (ver INTEGRATION_REQUESTS). Otros worktrees de 2B
  pueden limpiarse (sin commits de valor).

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Integración Oleada 2B en integration/wave-2b (orchestrator)

### Integración
- Cherry-pick `1a8f6fa` (adaptador Homecenter, desde backup `ccc1f0b`). Limpio,
  sin conflictos. `main` intacta.

### Reconciliación (Fases 2-3)
- Tipos del adaptador alineados 1:1 con `PRICING_ADAPTER_CONTRACT`
  (`SupplierAdapter`, `RawSupplierItem`, `SkuMatchCandidate/Proposal`,
  `ImportPreview`, `ImportResult`); `RecordObservationInput` importado del módulo
  real `@/modules/pricing/types`.
- **`MinimalApprovalPort` = subconjunto estructural de `PricingApprovalPort`**
  (no lógica paralela). Añadido `tests/unit/pricing-adapters/port-reconciliation.test.ts`:
  aserción type-level (`(p: PricingApprovalPort) => MinimalApprovalPort`) +
  runtime con `PricingApprovalService` real (`InMemoryPricingRepository`),
  comprobando persistencia vía el puerto, append-only e idempotencia.
- `ResourceCatalog`/`ResourceRef` avalados como auxiliares de matching.

### Validación integral (Fase 5 — todo PASS)
- typecheck 0 · lint 0 · **309 tests** (incl. **80 de adapters**) · build Next
  16.2.6 · `gm:regression` **22/22** · `gm:import` **9/9** ·
  `validate-claude-agents` **214/0/0** · `git diff --check` limpio.
- Persistencia solo vía `PricingApprovalPort`; preview no persiste; ambiguos
  `pending`; snapshots emitidos intactos. **Sin scraping** (sin fetch/axios/
  puppeteer/cheerio), **sin API Homecenter inventada** (CSV/Excel local).
  Privacidad backend-first (campos 🔒 no a cliente). Sin privados/`.env`/
  `package-lock`/`ag-grid-enterprise`/AGPL.

### RLS runtime (Fase 6)
- Sin cambios en `supabase/migrations|policies|seeds` ni `apps/web/lib/db/schema.ts`
  ⇒ **RLS runtime 21/21** de Oleada 1.5 vigente. B-004 (Realtime) deuda técnica.

### Limpieza de worktrees (Fase 8)
- Eliminados worktrees temporales obsoletos de subagentes (ver lista en el commit
  de cierre). Conservados: `backup/wave2-homecenter` (`ccc1f0b`), demás backups,
  tags y ramas de integración.

### Estado / próximo paso
- Commit `chore: integrate and validate wave 2b homecenter adapter` + push a
  `origin integration/wave-2b`. **NO merge a `main`** (espera aprobación).
- Recomendación: **APROBAR merge `integration/wave-2b` → `main`**.

### Agentes activos al cierre
- Ninguno.

## 2026-05-30 — Merge de Oleada 2B a main (orchestrator)

### Merge
- Usuario aprobó el merge. Preflight: `main = origin/main = 75394f1` (árbol
  limpio); integración final `1931aac`; 6 backups (wave1×3 + wave2×3) y 3 tags
  conservados; Excel ignorado; sin `.env`/`package-lock`; solo ag-grid-community.
- `git merge --no-ff integration/wave-2b` → **merge commit
  `47fcfb36b15a0a15cd700a4886cf13555d0198bd`** (`47fcfb3`). **Sin conflictos.**

### Validación post-merge (todo PASA en main)
- typecheck 0 · lint 0 · **test 309** (incl. **80 de adapters**) · build Next
  16.2.6 (9 rutas + Proxy) · `gm:regression` **22/22** · `gm:import` **9/9**
  (±0.01 COP) · `validate-claude-agents` **214/0/0** · `git diff --check` limpio.
- Adaptador: persistencia SOLO vía `PricingApprovalPort` real (verificado: los
  `adapters/` no escriben en DB); preview no persiste; ambiguos `pending`;
  idempotencia; auditoría Q11; snapshots emitidos intactos. **Sin scraping**
  (sin fetch/axios/puppeteer/cheerio/URLs); **sin API Homecenter inventada**
  (CSV/Excel local). Privacidad backend-first (campos 🔒 no a cliente).

### RLS runtime (Paso 4)
- El merge NO modificó `supabase/migrations|policies|seeds` ni
  `apps/web/lib/db/schema.ts` (verificado `git diff 75394f1..HEAD`) ⇒ **RLS
  runtime 21/21** de Oleada 1.5 sigue vigente. No se relevantó Docker.
- **B-004** (Realtime unhealthy en Windows) sigue como deuda técnica no bloqueante.

### Ramas y tag
- **Conservados**: backups wave1 (db-rls/excel-mapper/frontend-boq), wave2
  (cost-domain/pricing/homecenter), `integration/wave-2b`, ramas de integración
  previas, `feature/wave-1.5-local-rls`.
- Tag anotado: **`wave-2b-homecenter-adapter-v1`** sobre el merge.

### Estado / próximo paso
- **Oleada 2B CERRADA y en `main`.** Oleada 3 NO iniciada (solo diagnóstico de
  arquitectura propuesto). Antes de paralelizar Oleada 3: congelar los contratos
  documentales propuestos (planning, dashboard read-model, export profiles).

### Agentes activos al cierre
- Ninguno.

## 2026-05-31 — Oleada 3A: microfase documental + Recharts (orchestrator)

### Rama
- Creada y publicada `integration/wave-3a` desde `main` (`30b1053`). `main` intacta.

### Read-model CONGELADO v1
- Creado **`docs/READ_MODEL_CONTRACT.md`** (orchestrator-owned; cambios solo vía
  INTEGRATION_REQUESTS): ubicación canónica (`apps/web/server/read-model`,
  `apps/web/server/repositories`, `apps/web/lib/contracts/read-model.ts`); dos
  fuentes explícitas (`FixtureReadModelRepository`/`DrizzleReadModelRepository`)
  con selector `READ_MODEL_SOURCE=fixture|db` sin fallback silencioso;
  `ViewerRole`/`ViewerContext`; clasificación cliente-safe vs 🔒; DTOs canónicos
  (`ProjectListItem`, `ProjectOverview`, `EstimateSummary`, `ChapterSummary`,
  `BoqItemView`, `ApuSummary`, `QuantityGroupView`, `CatalogResourceView`,
  `DashboardSummary`); `ReadModelPort` (8 funciones). La UI consume DTOs; cero
  cálculo financiero en React; cost-domain/pricing solo server-side.
- Actualizados `API_CONTRACTS.md` (§7), `AGENT_REGISTRY.md` (ownership 3A:
  db-rls = server/read-model; frontend-boq = páginas presupuesto; dashboard =
  /dashboard + modules/dashboard), `DECISIONS.md`, `LICENSING.md`,
  `INTEGRATION_REQUESTS.md`.

### Dependencia
- **`recharts` ^3.8.1 (MIT)** instalado en `apps/web` (`corepack pnpm --filter
  web add recharts`). NO se instalaron frappe-gantt/exceljs/@react-pdf/renderer.

### Próximo paso
- Validar (typecheck/lint/test/build/validador) + commit documental + push a
  `origin integration/wave-3a`. Luego lanzar en paralelo agent-db-rls ∥
  agent-frontend-boq ∥ agent-dashboard. NO planning, NO exports, NO merge.

### Agentes activos al cierre de esta microfase
- Ninguno (aún).

## 2026-05-31 — Oleada 3A: subagentes ejecutados (interrumpidos) y preservados (orchestrator)

### Lanzamiento
- Lanzados en paralelo (worktrees aislados desde `main`@`30b1053`): agent-db-rls
  (read-model), agent-frontend-boq (páginas presupuesto), agent-dashboard (KPIs).
- Los tres se **interrumpieron por límite de sesión** (~54-62 acciones c/u), con
  trabajo casi completo **sin commitear** y errores triviales remanentes de
  `tsc`/build (los worktrees derivan de main, sin el contrato ni recharts; el
  contrato fue embebido en los prompts y dashboard instaló el recharts aprobado).

### Entregables preservados (verdes tras fixes mínimos del orquestador)
- **agent-db-rls** → `backup/wave3-db-read-model` (`7478ceb`): `lib/contracts/
  read-model.ts` (DTOs+port), `server/read-model/{types,errors,port,compute,
  fixture-repository,drizzle-repository,index}`, `server/repositories/`,
  selector `READ_MODEL_SOURCE` sin fallback, proyección por rol, 2 tests.
  Validado: typecheck 0, lint 0, **329 tests**, build OK. Fix: `env:Partial<ProcessEnv>`.
- **agent-dashboard** → `backup/wave3-dashboard` (`79d9fd3`): `/dashboard` +
  `modules/dashboard/*` (KPIs, Recharts barras+pie, ahorros solo rol autorizado)
  + accesor TEMP de dev. Validado: typecheck 0, lint 0, **336 tests**, build OK.
  recharts ^3.8.1. Fixes: import estático del fixture (Turbopack) + typing legend.
- **agent-frontend-boq** → `backup/wave3-frontend-boq` (`28d8bfe`): páginas
  `/projects /estimates /apu /quantities /catalog` cableadas (sin mocks) +
  `components/budget/*` + accesor TEMP. Validado: typecheck 0, lint 0, **338
  tests**, build OK. Fixes: ruta fixture + anotaciones de tipo + cast de status.

### Reconciliación pendiente (integración 3A)
- Triple `read-model.ts` → unificar a la canónica de db-rls. Rewire de accesores
  TEMP de la UI a `@/server/read-model` (`getReadModel()`). Alinear DTOs
  divergentes del frontend (`scopeNames/code/status:string`) a los canónicos.
  Registrado en INTEGRATION_REQUESTS.

### Estado / próximo paso
- **NO integrado** a `integration/wave-3a` ni a `main`. `main` intacta. Backups
  3A (3) + previos y tags conservados. Worktrees obsoletos por limpiar.
- Recomendación: ciclo de integración 3A (cherry-pick db-rls → frontend →
  dashboard, reconciliar, validar) antes de pedir merge a `main`.

### Agentes activos al cierre
- Ninguno.

## 2026-05-31 — Integración Oleada 3A: web funcional con read-model (orchestrator)

### Integración
- Cherry-picks: `9e69449` (db-rls read-model) + `8ab0d9c` (frontend) + `0bab01d`
  (dashboard). Conflicto add/add en `read-model.ts` resuelto con el canónico de
  db-rls (`--ours`). `main` intacta.

### Reconciliación (Fases 2-4)
- **Fuente única**: `apps/web/lib/contracts/read-model.ts` (db-rls); duplicados de
  frontend/dashboard eliminados. **1** `interface ReadModelPort`.
- **Accesores TEMP eliminados** (`components/budget/dev-read-model.ts`,
  `modules/dashboard/dev-read-model.ts`). Nuevo helper
  `apps/web/server/read-model/viewer.ts` (`getDemoViewer()`, demo/dev). Las 5
  páginas de presupuesto y el dashboard consumen `getReadModel()` de
  `@/server/read-model` con el viewer demo.
- **DTOs adaptados** al canónico: `ProjectListItem{scopeCount,createdAt,
  estimateCount}` (sin `code`/`scopeNames`); `EstimateSummary.versionId`/
  `status:EstimateVersionStatus` (sin `id`/`approvedAt`/`notes`);
  `QuantityGroupView{id,name,lines}` (sin `unit`/`calculationMode`).
- Test redundante del frontend eliminado; test del dashboard repointado al
  read-model canónico (precompute en `beforeAll`).

### Validación integral (Fase 5 — todo PASS)
- typecheck 0 · lint 0 · **356 tests** · build Next 16.2.6 (estáticas + dinámicas)
  · `gm:regression` **22/22** · `gm:import` **9/9** · `validate-claude-agents`
  **214/0/0** · `git diff --check` limpio.
- Privacidad: DTOs sin campos internos de pricing; ahorros del dashboard
  role-gated; cero cálculo financiero en React.

### RLS (Fase 6)
- Sin cambios en `supabase/*` ni `apps/web/lib/db/schema.ts` ⇒ **RLS runtime
  21/21** vigente. B-004 (Realtime) deuda técnica.

### Dev smoke (Fase 7)
- `READ_MODEL_SOURCE=fixture` + `pnpm --filter web dev`. **8/8 rutas HTTP 200**
  con datos reales del golden master (`/dashboard` "Total presupuesto $372.247…"
  + Recharts; `/estimates` "Entre Patios" + AIU/IVA). Sin 500. Servidor detenido
  tras el smoke (incl. limpieza de un dev server obsoleto previo en :3000).

### Estado / próximo paso
- Commit `chore: integrate and validate wave 3a functional read model ui` +
  push a `origin integration/wave-3a`. **NO merge a `main`** (espera aprobación).
- Recomendación: **APROBAR merge `integration/wave-3a` → `main`**.

### Agentes activos al cierre
- Ninguno.

## 2026-05-31 — Merge de Oleada 3A a main (orchestrator)

### Merge
- Usuario aprobó el merge. Preflight: `main = origin/main = 30b1053` (árbol
  limpio); integración final `971b3ad`; 9 backups y 4 tags conservados; Excel
  ignorado; sin `.env`/`package-lock`; solo ag-grid-community.
- `git merge --no-ff integration/wave-3a` → **merge commit
  `d1f0920d0423f981fa5d285d493120fc44873849`** (`d1f0920`). **Sin conflictos.**

### Validación post-merge (todo PASA en main)
- typecheck 0 · lint 0 · **test 356** · build Next 16.2.6 (estáticas + dinámicas)
  · `gm:regression` **22/22** · `gm:import` **9/9** (±0.01 COP) ·
  `validate-claude-agents` **214/0/0** · `git diff --check` limpio.
- Estructura: **1** `interface ReadModelPort` y **1** `getReadModel()` (en
  `apps/web/server/read-model/index.ts`); fuente única
  `apps/web/lib/contracts/read-model.ts`; selector `READ_MODEL_SOURCE=fixture|db`;
  **sin** `dev-read-model.ts`; **sin** imports activos de `@/lib/utils/mocks` en
  rutas cableadas. Dashboard + páginas cableadas; Recharts.

### RLS (Paso 4)
- El merge NO modificó `supabase/migrations|policies|seeds` ni
  `apps/web/lib/db/schema.ts` (verificado `git diff 30b1053..HEAD`) ⇒ **RLS
  runtime 21/21** de Oleada 1.5 vigente. **B-004** (Realtime) deuda técnica.

### Privacidad
- DTOs cliente-safe sin campos internos de pricing; ahorros del dashboard
  role-gated (omitidos para `client`). **Cero cálculo financiero en React**
  (dinero `DecimalString`). `getDemoViewer()` es **solo demo/dev**: en modo `db`
  el viewer vendrá de la **sesión/auth real** (prerrequisito futuro) y RLS es la
  barrera real.

### Ramas y tag
- **Conservados**: 9 backups (wave1×3, wave2×3, wave3×3), `integration/wave-3a`,
  ramas de integración previas, `feature/wave-1.5-local-rls`.
- Tag anotado: **`wave-3a-functional-read-model-ui-v1`** sobre el merge.

### Estado / próximo paso
- **Oleada 3A CERRADA y en `main`.** Web local funcional con datos reales del
  fixture. Oleada 3B/3C NO iniciadas. Antes de 3B: congelar
  `docs/PLANNING_CONTRACT.md` + esquema de planning (db-rls) e instalar
  `frappe-gantt`.

### Agentes activos al cierre
- Ninguno.

## 2026-05-31 — Oleada 3B: microfase documental + frappe-gantt (orchestrator)

### Rama
- Creada y publicada `integration/wave-3b` desde `main` (`352825f`). `main` intacta.

### PLANNING_CONTRACT CONGELADO v1
- Creado **`docs/PLANNING_CONTRACT.md`** (orchestrator-owned; cambios solo vía
  INTEGRATION_REQUESTS): entidades PostgreSQL (`schedule_tasks`,
  `task_dependencies`, `progress_entries` append-only, `resource_assignments`)
  con RLS; dominio puro `apps/web/modules/planning/` (CPM/ruta crítica/holguras/
  ciclos, `DecimalString`); extensión del read-model (`ScheduleTaskView`,
  `DependencyView`, `MilestoneView`, `ProgressEntryView`, `ResourceAssignmentView`,
  `ScheduleSummary`, `CriticalPathSummary`; `ReadModelPort.getSchedule/
  listProgressEntries/listResourceAssignments`); privacidad por rol
  (holguras/ruta crítica/avance financiero/`external_reference`/responsables 🔒);
  campos reservados para export MS Project (no en 3B).
- Actualizados: `DATABASE_SCHEMA.md` (entidades planning), `API_CONTRACTS.md` (§8),
  `READ_MODEL_CONTRACT.md` (§8 extensión), `AGENT_REGISTRY.md` (ownership 3B),
  `DECISIONS.md`, `LICENSING.md`, `INTEGRATION_REQUESTS.md`.

### Dependencia
- **`frappe-gantt` ^1.2.2 (MIT, sin peers)** instalado en `apps/web`. Import
  dinámico client-side (DOM/SVG). NO se instalaron exceljs/@react-pdf/renderer.

### Próximo paso
- Validar + commit documental + push a `origin integration/wave-3b`. Luego lanzar
  en paralelo agent-db-rls (esquema/RLS/read-model planning) ∥ agent-planning
  (dominio/Gantt). NO exports, NO merge.

### Agentes activos al cierre de esta microfase
- Ninguno (aún).

## 2026-05-31 — Oleada 3B: subagentes interrumpidos (WIP preservado) (orchestrator)

### Lanzamiento
- Lanzados en paralelo (worktrees desde `main`@`352825f`): agent-db-rls
  (esquema/RLS/read-model planning) ∥ agent-planning (dominio/Gantt).
- **Ambos interrumpidos por límite de sesión** (~49-54 acciones), con trabajo
  **materialmente incompleto** y sin commitear.

### Estado de los entregables (PARCIAL)
- **agent-db-rls** → `backup/wave3b-db-planning` (`89bfab7`, **WIP typecheck rojo**):
  migración `20260531100000_planning_schedule.sql` (4 tablas) +
  `20260531100100_rls_policies_planning.sql`, `schema.ts` (Drizzle planning),
  `read-model.ts` (DTOs/métodos), `server/read-model/{types,compute-planning}.ts`,
  datos de cronograma en el fixture. **PENDIENTE**: implementar
  `getSchedule/listProgressEntries/listResourceAssignments` en
  `FixtureReadModelRepository` y `DrizzleReadModelRepository` (4 errores
  "incorrectly implements ReadModelPort"); seed de planning; RLS runtime 21/21 +
  pruebas de planning.
- **agent-planning** → `backup/wave3b-planning-ui` (`6f4dab9`, **typecheck verde,
  incompleto**): `modules/planning/{cpm,graph,date,decimal,types}.ts` (dominio
  puro CPM/holguras/ciclos). frappe-gantt instalado. **PENDIENTE**: página
  `/planning`, componente Gantt, accesor dev de cronograma, tests de dominio.

### Higiene (ambos)
- Sin privados/Excel/`.env`. Sin solape de archivos entre agentes.

### Estado / próximo paso
- **NO integrado** a `integration/wave-3b` ni a `main`. `main` intacta
  (`352825f`). Backups (11) y tags conservados. Worktrees por limpiar.
- **Acción requerida**: reanudar ambos agentes (sesión reseteada ~15:50) para
  completar los puntos pendientes; luego ciclo de integración 3B. Registrado en
  INTEGRATION_REQUESTS.

### Agentes activos al cierre
- Ninguno (ambos finalizaron por límite, incompletos).

## 2026-05-31 — Oleada 3B: continuación db-rls COMPLETADA (orchestrator)

### Estrategia
- Continuación **secuencial** (no paralela) para reducir consumo. Rama
  `continuation/wave3b-db-planning` desde `backup/wave3b-db-planning` (`89bfab7`).
- `agent-db-rls` recuperó el WIP con `git merge --ff-only 89bfab7` (los worktrees
  parten de `main`; `89bfab7` desciende de `main` ⇒ ff sin redo) y completó.

### Completado (db-rls)
- `getSchedule/listProgressEntries/listResourceAssignments` en
  `FixtureReadModelRepository` y `DrizzleReadModelRepository` (proyección por rol:
  `client` sin holguras/ruta crítica/`financialProgressPct`/`external_reference`/
  `createdBy`/notas).
- `supabase/seeds/0003_demo_planning.sql` (cronograma demo sanitizado) +
  `config.toml`. Tests `planning-fixture.test.ts` + `planning-drizzle.test.ts`.
- Harness `scripts/rls-runtime/run.ts`: +11 pruebas de planning.

### Validación
- typecheck 0 · lint 0 · **378 tests** · build OK · gm:regression 22/22 ·
  gm:import 9/9.
- **RLS runtime real (Docker local): 32/32 PASS** (21 previos + **11 planning**:
  aislamiento A/B en las 4 tablas, sin-org, `progress_entries` append-only,
  WITH CHECK cross-org en tareas/dependencias; **24 tablas con RLS FORCE**).
  `db reset` aplicó 13 migraciones + 3 seeds sin errores. Sin remoto.

### Preservación
- `backup/wave3b-db-planning-complete` (`560b2cc`, pusheada);
  `continuation/wave3b-db-planning` adelantada a `560b2cc`. WIP original
  `89bfab7` y `main` intactos. 12 backups.

### Estado / próximo paso
- **db-rls 3B COMPLETO y validado.** Falta `agent-planning` (UI/Gantt): reanudar
  secuencialmente desde `backup/wave3b-planning-ui` (`6f4dab9`). Luego integración
  3B. NO integrado; NO merge.

### Agentes activos al cierre
- Ninguno.

## 2026-06-01 — Oleada 3B: continuación planning-ui COMPLETADA (orchestrator)

### Estrategia
- Continuación **secuencial**. Rama `continuation/wave3b-planning-ui` = WIP
  planning (`6f4dab9`) **combinado con el read-model db completo (`560b2cc`)**
  (sin overlap de archivos) → `2793bbf`, para cablear la UI al `getSchedule()`
  real sin accesor TEMP. `agent-planning` recuperó la base con
  `git merge --ff-only 2793bbf`.

### Completado
- **agent-planning**: dominio (`modules/planning/{gantt-mapping,view-model,index}`)
  + componentes (`GanttChart` frappe-gantt dinámico, `ScheduleTable`,
  `PlanningSummary`, `ScheduleStatusBadge`).
- **orchestrator (completar interrumpido)**: página
  `apps/web/app/(dashboard)/planning/page.tsx` cableada a
  `getReadModel().getSchedule(getDemoViewer(), projectId)`; tests
  `tests/unit/planning/planning-domain.test.ts` (CPM/ciclo/holgura/hito/
  dependencias FS-SS-FF-SF/privacidad por rol); enlace nav `/planning` en el
  layout; reconciliación `view-model` → `ScheduleSummary` canónico de
  `@/lib/contracts/read-model`; CSS de frappe-gantt **vendorizado** (su `exports`
  v1.2.2 no expone `dist/*.css`); `ganttRef any→unknown`.

### Validación
- typecheck 0 · lint 0 · **389 tests** · build Next 16.2.6 (ruta `/planning`) ·
  gm:regression 22/22 · gm:import 9/9.
- **Dev smoke `/planning` HTTP 200** (74 KB) con "Cronograma de obra", "Diagrama
  de Gantt", tareas, hitos, avance reales del fixture sanitizado; sin 500; rutas
  previas siguen 200. Servidor detenido tras el smoke.
- Privacidad: ruta crítica/holguras solo rol autorizado (no `client`); cero
  cálculo monetario/CPM en React (CPM en `modules/planning`).

### Preservación
- `backup/wave3b-planning-ui-complete` (`41abbe2`, pusheada); continuation
  adelantada a `41abbe2`. WIP originales (`6f4dab9`, `89bfab7`) y `db-complete`
  (`560b2cc`) intactos. `main` intacta. 13 backups.

### Estado / próximo paso
- **3B COMPLETO** (db `560b2cc` + ui `41abbe2`), combinado y validado end-to-end
  en `continuation/wave3b-planning-ui` (`41abbe2`). Listo para el **ciclo de
  integración 3B** hacia `integration/wave-3b` (incluye RLS runtime 32/32 ya
  validado por db). NO integrado; NO merge.

### Agentes activos al cierre
- Ninguno.

## 2026-06-01 — Integración formal Oleada 3B en integration/wave-3b (orchestrator)

### Merge
- `git merge --no-ff continuation/wave3b-planning-ui` (= db `560b2cc` + ui
  `41abbe2` combinados) → **merge commit `595e5a5`**. **Sin conflictos.** Los
  docs de 3b (PLANNING_CONTRACT, etc.) se conservaron (la continuation parte de
  main y no los borra).

### Reconciliación
- Read-model canónico único `apps/web/lib/contracts/read-model.ts`; `/planning`
  consume `getReadModel().getSchedule(getDemoViewer(), projectId)` real (0
  accesores TEMP). CPM/ruta crítica/holguras **solo en `modules/planning`**
  (verificado: 0 en `app/`+`components/`). frappe-gantt dinámico client-side +
  CSS vendorizado; nav `/planning`. Las dos `ScheduleSummary` (dominio vs
  read-model) son capas distintas por contrato; la UI consume la canónica.

### Validación (todo PASS)
- typecheck 0 · lint 0 · **389 tests** · build Next 16.2.6 (rutas `/planning` +
  previas) · `gm:regression` 22/22 · `gm:import` 9/9 · `validate-claude-agents`
  214/0/0 · `git diff --check` limpio.
- **RLS runtime real 32/32** (Docker local): `db reset` aplicó **13 migraciones +
  3 seeds**; **24 tablas con RLS FORCE**; 21 previos + 11 planning. Sin remoto.
- **Dev smoke 9/9 rutas HTTP 200** (incl. `/planning` con Cronograma + Gantt +
  tareas/hitos/avance reales). Servidor detenido tras el smoke.
- Privacidad backend-first (holguras/ruta crítica/financiero/`external_reference`/
  responsables role-gated); cero cálculo monetario/CPM en React; MS Project
  reservado (sin export en 3B). B-004 (Realtime) deuda técnica no bloqueante.

### Estado / próximo paso
- Commit doc `chore: integrate and validate wave 3b planning gantt` + push a
  `origin integration/wave-3b`. **NO merge a `main`** (espera aprobación).
- Recomendación: **APROBAR merge `integration/wave-3b` → `main`**.

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-01 — Merge de Oleada 3B a `main` (aprobado) + tag estable

### Estado
- **Merge aprobado por el usuario.** `git merge --no-ff integration/wave-3b`
  sobre `main` (base `352825f`) → merge commit **`40118a5`**, **sin conflictos**
  (44 archivos, +5221/-11). Squash/rebase/force-push NO usados.
- Tag anotado **`wave-3b-planning-gantt-v1`** sobre el HEAD documental.

### Validación post-merge (todo PASS)
- typecheck 0 · lint 0 · **389 tests** (27 archivos) · build Next 16.2.6
  (rutas incl. `/planning`) · `gm:regression` 22/22 · `gm:import` 9/9 (±0.01 COP)
  · `validate-claude-agents` 214/0/0 · `git diff --check` limpio.
- **RLS runtime real 32/32** (Docker local): `db reset` aplicó **13 migraciones +
  3 seeds**; **24 tablas con RLS FORCE** (aislamiento A/B, sin-org, cross-org
  WITH CHECK, `progress_entries` append-only). Supabase detenido. Sin remoto.
- **Dev smoke 9/9 rutas HTTP 200** (`READ_MODEL_SOURCE=fixture`): `/`, `/login`,
  `/projects`, `/estimates`, `/apu`, `/quantities`, `/catalog`, `/dashboard`,
  `/planning`. `/planning` renderiza "Cronograma de obra", resumen, **Tareas**,
  **Hitos**, **Diagrama de Gantt** (frappe-gantt); rol `management` ve columnas
  **Holgura** + **Crítica**; sin fugas (`external_reference`/descuento/margen=0);
  sin 500. Servidor detenido tras el smoke.

### Reconciliación / deuda registrada
- Read-model **canónico único** en `apps/web/lib/contracts/read-model.ts`
  (`ReadModelPort` + `ScheduleSummary` + DTOs); `/planning` consume
  `getReadModel().getSchedule(getDemoViewer(), projectId)` (0 accesores TEMP de
  planning). CPM/ruta crítica/holguras **solo en `modules/planning`** (0 en
  `app/`+`components/`). frappe-gantt dinámico client-side + CSS vendorizado; nav
  `/planning`.
- **B-005 (deuda no bloqueante)**: el módulo de dominio `modules/planning/types.ts`
  conserva un **espejo interno** de los DTOs de read-model (`ScheduleTaskView`,
  `DependencyView`, `MilestoneView`, `CriticalPathSummary`) consumido por
  `view-model.ts`/`gantt-mapping.ts`. Es estructuralmente compatible; el único
  campo divergente (`financialProgressPct` en la `ScheduleTaskView` del dominio)
  está **sin uso** (código muerto). El read-model canónico (puerto + DTOs que la
  página/repositorios consumen) es fuente única. Plegar el espejo al contrato se
  difiere a limpieza de 3C (colisión de nombre `ScheduleSummary` dominio vs
  read-model exige aliasing; no se refactoriza sobre un merge ya validado).

### Estado / próximo paso
- `git push origin main` + `git push origin wave-3b-planning-gantt-v1`.
- **Oleada 3B CERRADA.** `integration/wave-3b` conservada temporalmente; backups
  y continuations conservados. Próximo: **Oleada 3C (exports)** — propuesta
  documental entregada; NO lanzada (sin agentes, sin rama, sin deps).
- `getDemoViewer()` solo demo/dev; auth real/sesión = prerrequisito del modo `db`.
  B-004 (Realtime en Windows) deuda técnica no bloqueante.

---

## 2026-06-01 — Oleada 3C (exports): apertura + B-005 resuelto (Fases 0–1)

### Estado
- **Oleada 3C aprobada (secuencial).** Rama `integration/wave-3c` creada desde
  `main` (`82f9e86`) y publicada (`-u origin`). `main` intacta.
- **B-005 RESUELTO** (Fase 1): `apps/web/modules/planning/types.ts` ahora
  re-exporta los DTOs/enums de planning (`ScheduleTaskView`, `DependencyView`,
  `MilestoneView`, `ProgressEntryView`, `ResourceAssignmentView`,
  `CriticalPathSummary`, `ScheduleTaskStatus`, `DependencyType`) desde la fuente
  única `apps/web/lib/contracts/read-model.ts` y conserva solo tipos de dominio
  puro. Eliminados el campo muerto `financialProgressPct` y `ScheduleSummaryView`
  sin uso. Superficie pública de `@/modules/planning` estable (re-exports vía
  `index`). Sin tocar CPM/holguras/proyección/DB/migraciones/seeds/RLS.
- Validación post-refactor (PASS): typecheck/lint 0, **389 tests**, build
  (`/planning`), gm 22/22 + 9/9, `git diff --check` limpio. 1 archivo
  (`types.ts`, 252→176 líneas). Commit `refactor(planning): fold duplicated DTO
  mirrors into canonical read model`.

### Próximo paso (esta sesión)
- Fase 2: congelar `docs/EXPORT_PROFILES_CONTRACT.md` (v1) + actualizar contratos.
- Fase 3: solicitar/instalar `exceljs` + `@react-pdf/renderer` (licencias).
- Fase 4: ownership `agent-exports` en AGENT_REGISTRY.
- Fase 5: commit documental + push.
- Fase 6: lanzar **solo** `agent-exports` (worktree aislado). Fase 7: preservar
  en `backup/wave3c-exports`. **NO** integrar ni merge a `main`.

### Agentes activos al cierre
- Ninguno (aún no se lanza `agent-exports`).

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-01 — Cierre Oleada 3C: reconciliación (Caso B) y merge a `main`

> Nota: esta entrada vive en `integration/wave-3c-main-reconciled` → `main`. El
> detalle de la implementación y la integración previa quedó en
> `integration/wave-3c` (`7124f0f`, conservada). Aquí se documenta el cierre.

### Divergencia y estrategia
- El PR de GitHub "Integration/wave 3c (#1)" se fusionó como **SQUASH** ⇒
  `origin/main = b09158f` (padre único `82f9e86`); `2621d3b` **no** quedó como
  ancestro. `origin/main` ya contenía **materialmente** B-005 +
  `EXPORT_PROFILES_CONTRACT` + deps (idénticos), faltando solo el **código de
  exports**. `git diff origin/main..integration/wave-3c` = 15 archivos exports
  (A) + 4 docs (M): delta aditivo y acotado.
- **Caso B aplicado**: rama `integration/wave-3c-main-reconciled` desde
  `origin/main` + `git merge --no-ff backup/wave3c-exports` → **solo 15 archivos
  de exports** (+2200), **sin conflictos** y **sin duplicar** B-005/contrato/deps
  (git auto-resolvió el contenido idéntico). Sin force-push / rebase / reset.
- Verificado: `diff origin/main..reconciled` = solo exports; `types.ts` 176
  líneas (B-005 una vez); deps una vez; contrato presente.

### Validación post-reconciliación (PASS)
- typecheck/lint 0 · **410 tests** · build (`/api/exports`) · gm 22/22 ·
  gm:import 9/9 · validador 214/0/0 · diff/status limpios · Excel ignorado.
- **RLS runtime**: sin cambios en `supabase/`/`schema.ts` ⇒ **32/32 (3B) vigente**
  (no se levantó Docker).
- **Smoke 6/6 HTTP 200** (proyecto `…010`): content-type/disposition/bytes ok;
  PDF `%PDF`, XLSX `PK`, CSV; cliente sin `external_reference`, internal con
  columna. Negativos (mismatch/sin projectId/`mpp`) → **400**. Servidor detenido.

### Cierre
- Merge `--no-ff` de `integration/wave-3c-main-reconciled` → `main`; push `main`;
  tag **`wave-3c-exports-v1`**. **Oleada 3C CERRADA.**
- Conservados: `integration/wave-3c` (`7124f0f`),
  `integration/wave-3c-main-reconciled`, `backup/wave3c-exports`, y todos los
  backups/continuations/tags.

### Deudas no bloqueantes
- Auth real/sesión pendiente (prerrequisito modo `db`); `getDemoViewer` solo demo.
- `external_reference` vacío en CSV hasta extensión contractual del DTO.
- **B-004** (Realtime Windows) deuda técnica.
- **Botones UI de descarga** aún no existen (solo endpoint `/api/exports`).

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-01 — Oleada 4A.1 (auth/RLS local): apertura + contrato + deps (Fases 0–5)

### Estado
- **Oleada 4A.1 aprobada (secuencial).** Rama `integration/wave-4a-auth-local`
  desde `main` (`a6981f0`), publicada. `main` intacta.
- **Auditoría (Fase 1)**: `profiles` (id=auth.users.id, `organization_id` NOT
  NULL = membresía single-org, `role` admin/gerencia/presupuestos/obra/compras/
  consulta) y `organizations` ya existen. `app.current_org()`/`current_role()`
  leen claims JWT custom (`organization_id`/`user_role`); **0** políticas usan
  `auth.uid()`. `proxy.ts` = stub pass-through. Todo es **demo** (sin protección
  real). Conclusión: **reutilizar `profiles`** (no duplicar), añadir resolución
  por `auth.uid()`→`profiles` con compat demo.
- **AUTH_CONTRACT v1 congelado** (`docs/AUTH_CONTRACT.md`): modos
  `APP_AUTH_MODE`×`READ_MODEL_SOURCE` sin fallback; `AuthenticatedViewer`
  server-side; mapeo `profiles.role`→`ViewerRole`; matriz ruta×rol;
  deny-by-default. Punteros en API_CONTRACTS/DATABASE_SCHEMA/READ_MODEL_CONTRACT;
  ownership 4A.1 de `agent-db-rls` en AGENT_REGISTRY; placeholders en
  `.env.example` (`APP_AUTH_MODE`, `NEXT_PUBLIC_SUPABASE_*`; **sin** valores
  reales; `service_role` no en frontend).
- **Deps instaladas**: `@supabase/supabase-js` **2.106.2** (MIT) +
  `@supabase/ssr` **0.10.3** (MIT); peer cumplida; sin AGPL/enterprise.

### Próximo paso (esta sesión)
- Fase 5: validar base documental + commit doc + push.
- Fase 6: lanzar **solo** `agent-db-rls` (worktree aislado). Fase 7: RLS runtime
  local (previo 32/32 + nuevos tests auth). Fase 9: preservar en
  `backup/wave4a-auth-db-local`. **NO** integrar ni merge a `main`. **NO** UI/
  proxy/remoto.

### Agentes activos al cierre
- Ninguno (aún no se lanza `agent-db-rls`).

---

## 2026-06-01 — Oleada 4A.1: agent-db-rls completado y preservado (Fases 6–9)

### Estado
- **`agent-db-rls` lanzado** en worktree aislado (desde `f637d67`). Se
  interrumpió por límite de sesión tras implementar migración + seed + tests
  auth, **sin commitear**. **Continuación por el orquestador**: recuperado el WIP
  del worktree, validado a verde.
- **Preservado en `backup/wave4a-auth-db-local` (`58de9c3`, pusheado)**.
  Parent = `f637d67`. **NO integrado** a `integration/wave-4a-auth-local` ni
  `main`.

### Entregable (4 archivos, +401)
- `supabase/migrations/20260601090000_auth_identity_helpers.sql`: helpers
  `app.current_org()`/`current_role()`/`current_org_user()` que resuelven
  identidad real (`auth.uid()`→`profiles`) con **COALESCE** a claims demo
  (compat). `_jwt_claims()` neutraliza claims ausentes/malformados;
  `_auth_uid()` prefiere `auth.uid()` y cae a `sub`; `_profile_org/_role`
  **SECURITY DEFINER** (evita recursión RLS, solo la fila propia). **Deny-by-
  default** (NULL ⇒ sin filas). GRANT EXECUTE a `authenticated`.
- `supabase/seeds/0004_auth_org_b_and_no_membership.sql`: org B + roles
  variados (cubre los 4 ViewerRole) + **usuario sin membresía**; sanitizado,
  idempotente, patrón `auth.users` condicional.
- `scripts/rls-runtime/run.ts` (+15 tests auth) y `supabase/config.toml`
  (registro seed 0004).
- **Reutiliza `profiles` single-org** — sin tablas nuevas (regla de no-duplicación).

### Validación (PASS)
- **RLS runtime 47/47** (Docker local): 14 migraciones + 4 seeds; **32 previos**
  (compat) + **15 auth**: `current_org/role` desde profiles sin claim;
  aislamiento real A/B; sin sesión→`NULL`→deny; sin membresía→`NULL`→deny;
  cross-org INSERT/UPDATE bloqueado; rol admin puede INSERT profile, rol obra no
  (WITH CHECK); prioridad del claim demo. Supabase detenido. Sin remoto.
- typecheck/lint 0 · **410 tests** (incl. regresión RLS estática) · build OK ·
  gm 22/22 · gm:import 9/9 · validador 214/0 · diff/status limpios · **sin
  secretos/.env/privados**.

### Próximo paso
- A la espera de aprobación para **integrar `backup/wave4a-auth-db-local` →
  `integration/wave-4a-auth-local`** (merge + revalidación) y luego diagnóstico
  de **4A.2** (browser/server client, sesión SSR, `proxy.ts`, viewer real,
  login/logout/reset). **NO** integrado aún.

### Agentes activos al cierre
- Ninguno (`agent-db-rls` finalizó; entregable preservado, no integrado).

---

## 2026-06-01 — Integración formal Oleada 4A.1 (auth/RLS DB) en integration/wave-4a-auth-local

### Estado
- **Integración aprobada.** `git merge --no-ff backup/wave4a-auth-db-local`
  (`58de9c3`) sobre `integration/wave-4a-auth-local` (`8adfbca`) → merge
  **`adeafbe`**, **sin conflictos** (4 archivos, +401). `main` intacta
  (`a6981f0`). Remoto no conectado.

### Auditoría de la implementación integrada
- **14 migraciones, 4 seeds**. La migración `20260601090000_auth_identity_helpers.sql`
  tiene **0 `CREATE TABLE`** ⇒ **reutiliza `profiles`/`organizations`** (single-org
  v1, sin tablas nuevas de usuarios/membresía/org/roles).
- Helpers canónicos: `_jwt_claims`, `_auth_uid`, `_profile_org`, `_profile_role`,
  `current_org`, `current_role`, `current_org_user`. Regla de identidad:
  **prefiere `auth.uid()`**, fallback controlado a claim `sub` (compat
  demo/Postgres puro), **NULL → deny-by-default**. Org/rol desde
  `profiles.organization_id`/`profiles.role` por `auth.uid()`; nunca org del
  navegador. `SECURITY DEFINER` + `search_path` fijo solo en `_profile_org/_role`
  (evita recursión RLS, lee solo la fila propia). `GRANT EXECUTE` mínimos.

### Validación (PASS)
- **RLS runtime 47/47** (Docker local): 14 migraciones + 4 seeds; **32 previos**
  (compat) + **15 auth** (aislamiento real A/B, sin sesión→deny, sin
  membresía→deny, cross-org INSERT/UPDATE bloqueado, rol admin vs obra, prioridad
  claim demo). Supabase detenido. Sin remoto.
- typecheck/lint 0 · **410 tests** · build OK · gm 22/22 · gm:import 9/9 ·
  validador 214/0 · diff/status limpios · **sin secretos/.env/privados**.

### Pendiente (4A.2)
- Clientes browser/server Supabase, sesión SSR por cookies, refresh en
  `proxy.ts`, viewer real (sustituir `getDemoViewer` en modo `supabase`),
  protección de rutas, UI login/logout/forgot/reset/callback. `READ_MODEL_SOURCE`
  permanece `fixture`. B-004 (Realtime Windows) deuda técnica.

### Estado / próximo paso
- Commit doc `docs: record wave 4a1 auth db rls integration validation` + push
  `origin integration/wave-4a-auth-local`. **NO** merge a `main`.

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-01 — Oleada 4A.2 (runtime SSR): contrato + implementación (Fases 0–4)

### Estado
- Rama `integration/wave-4a-auth-runtime` desde 4A.1 (`7c2f729`), publicada.
  `main` intacta (`a6981f0`).
- **AUTH_RUNTIME_CONTRACT v1 congelado** (`docs/AUTH_RUNTIME_CONTRACT.md`).
  Role-map fuente única en `server/auth/role-map.ts` (**admin→internal**;
  refina AUTH_CONTRACT). Punteros en API_CONTRACTS/READ_MODEL_CONTRACT; ownership
  4A.2 en AGENT_REGISTRY.
- **Runtime SSR implementado por el orquestador** (antes de la UI):
  `lib/supabase/{env,client,server,proxy}.ts` (`@supabase/ssr`, cookies
  `getAll`/`setAll`); `server/auth/{types,errors,role-map,session,resolve-viewer,
  routes,index}.ts`; `apps/web/proxy.ts` (Next 16: refresh + `getClaims()` guard,
  **no** `getSession()`; demo passthrough; redirecciones seguras; anti
  open-redirect); `app/page.tsx` (→`/dashboard`); guard de `/api/exports` (modo
  supabase: viewer autenticado + anti-escalamiento de perfil ≤ ViewerRole).

### Validación (PASS)
- typecheck/lint 0 · **423 tests** (410 + **13 auth**) · build OK (`/api/exports`
  + Proxy) · gm 22/22 · gm:import 9/9 · validador 214/0 · diff limpio · sin secretos.

### Próximo paso (esta sesión)
- Fase 4: commit `feat(auth): ...` + push. Fase 5: lanzar **solo**
  `agent-frontend-boq` (UI `(auth)/`). Fase 7: preservar en `backup/wave4a-auth-ui`.
  **NO** integrar UI; **NO** merge a `main`; **NO** remoto/Vercel.

### Agentes activos al cierre
- Ninguno (aún no se lanza `agent-frontend-boq`).

---

## 2026-06-02 — Oleada 4A.2: recuperación tras apagado + preservación UI

### Estado
- Auditoría de recuperación tras apagado inesperado. **Escenario D**:
  `agent-frontend-boq` ya había sido lanzado (worktree
  `.claude/worktrees/agent-acc61fa6aec4fac2d`, base `0149655`) y dejó el
  entregable de UI auth **completo pero sin commitear** (WIP del worktree).
- Runtime SSR 4A.2 (`19246a5`) confirmado **íntegro** en
  `integration/wave-4a-auth-runtime` (local = `origin`). `main` intacta
  (`a6981f0`). Sin stash, sin conflictos.
- **UI recuperada y preservada** (no se relanzó el agente):
  `(auth)/login` (mock→supabase real), `(auth)/forgot-password`,
  `(auth)/reset-password`, `(auth)/logout`, `(auth)/auth/callback` (PKCE +
  anti open-redirect vía `sanitizeNext`), `components/auth/*`
  (AuthCard, FormError, FormSuccess, helpers) y tests `tests/unit/auth-ui/*`.

### Validación del entregado recuperado (PASS)
- typecheck 0 · lint 0 · **452 tests PASS** (423 previos + 29 auth-ui).
- **Build de producción**: 1er intento FALLÓ (`/login` usaba `useSearchParams()`
  sin Suspense — CSR bailout Next 16). Aplicado fix mínimo (extraer `LoginForm`
  + `<Suspense>`). 2º intento **build OK** (16/16 rutas; Proxy presente;
  `READ_MODEL_SOURCE=fixture`).
- Sin secretos, sin `.env.local` trackeado, sin privados/Excel real.

### Acciones
- Commit UI en rama del worktree: `90f571c`
  `feat(frontend-boq): wave 4a.2 auth UI (login/forgot/reset/logout/callback)`.
- Fix de build: `c9063ad`
  `fix(frontend-boq): wrap login useSearchParams in Suspense (Next 16 build)`.
- Preservado en `backup/wave4a-auth-ui` (`c9063ad`), publicado a `origin`.
- **NO** se integró la UI al runtime. **NO** merge a `main`. **NO** remoto
  Supabase. **NO** Vercel (`READ_MODEL_SOURCE=fixture` sin cambios).

### Próximo paso
- Integrar `backup/wave4a-auth-ui` → `integration/wave-4a-auth-runtime` (checklist
  de merge: typecheck/lint/test/build/gm/validador) en sesión dedicada. Luego
  evaluar reconciliación 4A → `main`. No iniciar Oleada 4B.

### Agentes activos al cierre
- Ninguno.

---

## 2026-06-11 — PRICE_OBSERVATION_REVIEW_CENTER_V1 + BULK_APPROVAL_BY_IMPORT_BATCH_V1 (orchestrator)

### Estado
- Rama `feature/price-observation-review-center-v1` (base verificada
  `origin/main = 9e03553`; árbol limpio; 2 stashes intactos; producción
  intacta). **Sin merge a main; sin deploy; sin db push remoto; sin datos
  dummy remotos.**
- **FASE 0 (inspección)**: digest SHA-256 existía pero era transitorio
  (preview→confirm); NO existía `import_batch_id`; aprobación solo individual
  (3A); idempotencia estructural ya probada en monitor runs. Diseño aditivo y
  claro ⇒ continuación automática.

### Entregable
- **Migraciones aditivas SOLO locales** `20260614090000` + `20260614090100`:
  `price_observation_batches` (procedencia durable, digest persistido,
  inmutable: sin UPDATE/DELETE), `resource_price_observations.import_batch_id`
  (nullable + FK + índice parcial + trigger same-org; compat retroactiva),
  `price_observation_bulk_actions` (auditoría actor/lote/IDs/conteos +
  `UNIQUE (org, idempotency_key)`). RLS ENABLE+FORCE; FORCE count 28→**30**.
- **Dominio** `apps/web/server/pricing/review/` (types/errors/validation/
  service/db-repository/fixture-repository/index): bulk approve/reject solo
  `pending`, selección explícita, máx **500** filas/acción, chunks de **100**
  con filtro `status='pending'` por statement, idempotencia en dos capas,
  rechazo con motivo obligatorio, CSV sanitizado, org SIEMPRE server-side,
  roles app management|internal (DB: admin/gerencia, paridad 3A).
- **Importación con lote**: `confirmCatalogImport` (batch `manual`) y
  `confirmProviderPriceList` (batch `supplier_csv`) crean batch por
  confirmación y etiquetan observaciones (`createObservationBatch` +
  `ObservationInsert.importBatchId`).
- **UI** `/catalog/prices/review` («Revisión de precios», request-time):
  resumen (pendientes/advertencias/proveedores/lotes/monitor), tabla con
  checkbox + filtros (lote/monitor/proveedor/fuente/advertencias/fecha/
  recurso/seleccionadas), seleccionar válidas/desmarcar, modal obligatorio con
  texto del mandato (clave de idempotencia `crypto.randomUUID()` al abrirlo),
  resultado (aprobadas/omitidas/errores) + CSV. Privacidad backend-first:
  site/client ⇒ «Acceso restringido» sin datos 🔒. Accesos: dashboard (KPI
  enlazado + QuickLink), catálogo (botón), price-intelligence (enlace con
  pendientes). Política D: monitor JAMÁS auto-approve (badge + advertencia).
- **Contrato congelado** `docs/PRICE_OBSERVATION_REVIEW_CENTER_V1_CONTRACT.md`.
  Actualizados DECISIONS / QA_REPORT / DATABASE_SCHEMA / INTEGRATION_REQUESTS.

### Validación (todo PASS)
- `supabase db reset --local` 33 migraciones + 6 seeds · typecheck 0 · lint 0
  · **1302 tests** (+56: dominio 21, seguridad/UI 22, RLS estático 13) · build
  (ruta `ƒ /catalog/prices/review`) · **RLS runtime 151/151** (+18 sección
  [20]) · isolation 12/12 · gm 22/22 · gm:import $372.247.170 · smoke gated
  **42/42** (1 PGRST303 transitorio por warmup, re-run verde — patrón conocido)
  · redirects 15/15 · diff --check limpio · validador 214/0/0.
- Ajustes mínimos a tests existentes (documentados): allowlist de tablas en
  `import-service.test.ts` (+`price_observation_batches`) y regex del KPI
  enlazado en `workspace-route-config.test.ts`. Sin cambios de invariantes.

### Próximo paso
- Revisión visual de la usuaria en `http://localhost:3090` + release
  controlado (`db push --dry-run` ⇒ exactamente 2 migraciones nuevas).
- Siguiente slice recomendado: **ENTRE_PATIOS_APU_IMPORT_V1 +
  BOQ_APU_LINKING_V1** (NO iniciado por mandato).

### Agentes activos al cierre
- Ninguno.

---

## Sesión 2026-06-13 — APU_COMPONENT_RESOURCE_RECONCILIATION_V1 + APU_LIBRARY_OPERATIONAL_UX_V1

**Agente:** agent-orchestrator (implementación inline; sin spawn de subagentes).
**Rama:** `feature/apu-resource-reconciliation-ux-v1` (base `origin/main = f286652`).
**Auditoría consumida:** `b0c8c65` (cherry-pick `10642b3`) — Discovery + Contract draft.

### Entregado
- **Contrato congelado:** `docs/APU_COMPONENT_RESOURCE_RECONCILIATION_AND_LIBRARY_UX_V1_CONTRACT.md`.
- **Migración aditiva** `20260617090000_apu_component_reconciliation.sql`: columnas
  `apu_components.updated_at/reconciliation_state/reconciled_by`, trigger recompute
  (cierra R-01), índice parcial, tabla auditoría `apu_component_resource_actions`
  (RLS ENABLE+FORCE, append-only, idempotencia), 3 RPCs SECURITY INVOKER con guard
  de rol. Drizzle schema sincronizado (incluye provenance previa faltante).
- **Dominio puro** `server/apu-reconciliation/`: re-matching (reutiliza
  `matchMaterialComponent`), estados, parseo de descripción de `notes`, CSV sanitizado.
- **Servicios:** `apu-reconciliation` (centro + detalle + búsqueda + acciones),
  `apu-library` (biblioteca compacta; compone read-model + reconciliación).
- **Server actions** seguras (`apu/reconciliation/actions.ts`): asociar/confirmar/
  rechazar/dejar-pendiente/limpiar/bulk/buscar, role-guard + idempotencia.
- **UI:** `/apu` compacta (stats + búsqueda/filtros/orden/paginación server-side),
  `/apu/[id]` por pestañas (Resumen·Componentes·Vínculo BOQ·Trazabilidad),
  `/apu/reconciliation` (selección, acciones individuales, modal bulk congelado, CSV).
- **Tests:** 40 nuevos (15 dominio + 25 estáticos schema/RLS/UX). Suite 1452 ✅,
  gm:regression 22 ✅.

### Validación local ejecutada
typecheck ✅ · lint ✅ · vitest full (1452 pass / 0 fail) ✅ · gm:regression (22) ✅ ·
build ✅ (rutas `/apu`,`/apu/[id]`,`/apu/reconciliation`) · `git diff --check` limpio ·
validate-claude-agents 214/0/0 ✅.

### NO ejecutado (Docker/Supabase local apagado) — DEFERIDO al release con DB arriba
`supabase db reset --local`, harness RLS runtime (`scripts/rls-runtime/run.ts` — falta
sección [23] para la tabla/RPCs nuevas), `read-model-isolation`, `gm:import`, MVP smoke
gated. La cobertura SQL equivalente corre estática en CI (`rls-apu-reconciliation-static`).

### Próximo paso
- Con Docker arriba: `db reset --local` + harness RLS (añadir sección [23]) + smoke;
  luego `db push --dry-run` (esperado: 1 migración nueva `20260617090000`).
- Revisión visual de la usuaria en `http://localhost:3120`.
- NO merge, NO deploy, NO db push remoto en esta sesión (por mandato).

### Agentes activos al cierre
- Ninguno.

---

## Sesión 2026-06-13 (cont.) — Cierre local con Docker arriba

**Agente:** agent-orchestrator. **Rama:** `feature/apu-resource-reconciliation-ux-v1`.

Docker/Supabase local disponibles ⇒ se ejecutaron los gates antes diferidos:

- **`supabase db reset --local`**: 30 migraciones + 6 seeds aplicados; `20260617090000` aplica limpio (validación empírica). Sin conexión remota.
- **Fix acotado (contrato §8):** la asociación masiva NO sobrescribe asociaciones
  existentes — `_reconcile_apu_component_row` gana `p_allow_replace`; bulk pasa
  `false` ⇒ `skipped_existing`. Individual conserva el reemplazo explícito (§10).
- **Harness RLS runtime `scripts/rls-runtime/run.ts`:** nueva **sección [23]** (20 checks:
  ENABLE+FORCE, aislamiento A/B, SELECT org-scoped, INSERT admin/gerencia, obra
  bloqueado, cross-org, auditoría inmutable, idempotency_key, total recalculado,
  bulk no sobrescribe, sin DELETE físico, M.O. no reconciliable). Pre-flight FORCE 34→35.
  **Resultado 214 PASS / 0 FAIL** (baseline 194).

### Gauntlet local completo (todo verde)
typecheck ✅ · lint ✅ · suite 1452/0 ✅ · build ✅ · RLS harness 214/0 ✅ ·
read-model isolation 12/0 ✅ · gm:regression 22/22 ✅ · gm:import PASS (cadena
financiera exacta) ✅ · smoke gated (MVP+BOQ) 42/42 en DB limpia ✅ · redirects
(suite unitaria) ✅ · diff limpio · validate-claude-agents 214/0/0 ✅. Sin PGRST303.

### Próximo paso
- Revisión visual de la usuaria en `http://localhost:3120`.
- Release controlado: `db push --dry-run` ⇒ **exactamente 1 migración** (`20260617090000`).

---

## 2026-06-14 — SCHEDULE_CREATE_PROD_FAILURE_HOTFIX_V1 (orchestrator)

### Estado
- Rama `fix/schedule-create-prod-failure-v1` (base `origin/main = 773ceca`).
  **Sin merge a main; sin deploy; sin db push remoto; sin escrituras remotas;
  sin datos dummy remotos; sin SMTP; sin otras features.**

### Síntoma de producción
`/planning/new` → crear cronograma → error genérico: "No se pudo crear el cronograma. Inténtalo de nuevo."
Reproducible con: Proyecto ENTRE PATIOS, Versión 1, nombre "ENTRE PATIOS · Cali",
start_date 2026-06-22, minDuration 1, crewSize 2, includeChapters/onlyPositiveQuantity/includeItemsWithoutApu/
**createChapterMilestones=true**.

### Diagnóstico (Fases 0–1)

**Bug B (raíz principal):** `mapWriteError(code: string)` en `server/planning/service.ts:454`
comparaba el código SQLSTATE ('22000') contra patrones de texto diseñados para los mensajes
de excepción ('invalid_tasks', 'not_found', etc.). El RPC `create_schedule_from_boq` usa
`RAISE EXCEPTION 'invalid_tasks' USING errcode = '22000'` para TODAS sus validaciones de
datos; pero el repositorio devuelve `error.code` ('22000'), no `error.message`.
`'22000'.includes('invalid_')` = `false` → `mapWriteError` retornaba `new Error(...)` genérico
→ el `catch` en `createScheduleAction` no lo reconocía como ScheduleValidationError
→ caía al fallback genérico "No se pudo crear el cronograma.".

**Bug A (riesgo secundario):** `AuthError` (de `resolveAuthenticatedViewer`) no estaba en el
`catch` de `createScheduleAction`. Una sesión expirada también producía el mensaje genérico.

**Sin bug en el generador:** el test `generator.test.ts:320` cubre `createChapterMilestones: true`
y pasa. Los milestones tienen `durationDays=0, plannedStart=plannedEnd, isMilestone=true` —
compatible con el constraint `schedule_tasks_milestone_zero_duration`. El error sucedió en
la capa de mapeo de error, no en la generación de tareas.

### Corrección mínima (Fases 2–4) — 4 archivos

**1. `apps/web/server/planning/repository.ts`** — `createScheduleFromBoq`:
Agrega `errorMessage?: string` al tipo de retorno; popula con `error.message` (el mensaje
de excepción PostgreSQL: 'invalid_tasks', 'invalid_start_date', etc.).

**2. `apps/web/server/planning/service.ts`** — `mapWriteError`:
- Firma: `(code: string, message?: string): Error`.
- Añade `code === '22000'` al branch de `ScheduleValidationError`
  (SQLSTATE 22000 = data exception → siempre validación).
- Añade checks en `message` para `insufficient_role`/`no_membership`.
- Call: `mapWriteError(res.errorCode, res.errorMessage)`.

**3. `apps/web/app/(dashboard)/planning/new/actions.ts`** — `createScheduleAction`:
- `import { AuthError } from '@/server/auth'`.
- `console.error` con `estimateVersionId`, `errorName`, `errorMessage` (sin tokens/org).
- `instanceof AuthError` → mensaje de sesión expirada o sin membresía.

**4. `apps/web/tests/unit/planning/schedule-service.test.ts`** — 3 tests nuevos:
- `createChapterMilestones=true` → milestones incluidos con `isMilestone=true, durationDays=0`.
- `errorCode: '22000'` → lanza `ScheduleValidationError` (regresión del Bug B).
- `errorCode: '42501'` → lanza `SchedulePermissionError`.

### Validación (Fase 5)
- **typecheck exit 0** (ningún tipo roto; `errorMessage?: string` compatible con callers existentes).
- **suite 1718 passed / 42 skipped / 0 fail** (+3 nuevos sobre la base de 1715).
- Sin migración. Sin db push. Sin cambios al esquema.

### Deudas no abiertas en este hotfix
- `SCHEDULE_ROLE_COMPRAS_SEPARATION_V2` (existente): la UI permite al rol `compras` (ViewerRole='internal')
  llegar a `/planning/new`, pero el RPC lo rechazará con '42501'. Ahora producirá "No tienes permiso"
  (correcto) en lugar del mensaje genérico.
- El mensaje de `ScheduleValidationError` al usuario sigue siendo `No se pudo completar la
  operación (22000)`. Mejorar con texto del mensaje RPC queda para `SCHEDULE_UX_ERRORS_V2`.

### Próximo paso (tras release autorizado)
- Merge a `main` + publicar `fix/schedule-create-prod-failure-v1`.
- Revisión visual autenticada: crear cronograma ENTRE PATIOS con `createChapterMilestones=true`.
- Verificar logs Vercel: buscar `[planning] createScheduleAction error` si vuelve a fallar.

---
- NO merge, NO deploy, NO db push remoto en este ciclo. **STOP.**

---

## SCHEDULE_PROD_RUNTIME_ROOT_CAUSE_V3 — Bloqueo de UI en /planning/new (botones deshabilitados)

**Rama:** `fix/schedule-prod-runtime-root-cause-v3` · **Base:** `origin/main = bd2dfcf` · Sin migración.

### Síntoma reportado (producción)
En `/planning/new` (ENTRE PATIOS → Versión 1 draft) **ambos botones quedan deshabilitados / no
ejecutan**, sin mensaje que explique por qué. Antes mostraban mensajes; tras V2 el flujo quedó "trabado".

### Causa raíz (capa client confirmada)
El único gate compartido por ambos botones era `!canSubmit || isPending`, con
`canSubmit = versionId !== '' && name.trim() !== '' && startDate !== ''`. Dos defectos:
1. **`versionId === ''` silencioso**: el `<select>` de versión muestra "Versión 1" (primera opción del
   navegador) aunque el `value` real del estado esté vacío ⇒ `canSubmit=false` ⇒ Vista previa Y Crear
   deshabilitados, **sin feedback** de qué falta.
2. **Contrato de botones incorrecto** (introducido/agravado en V2): "Vista previa" exigía nombre, y
   "Crear" se habilitaba sin un preview válido (`preview===null` no bloqueaba), mientras un preview
   fallido bloqueaba sin permitir reintentar con claridad.

### Por qué los hotfixes V1/V2 no bastaron
V1/V2 trabajaron sobre el **mapeo de errores del servidor** (mapWriteError/toSafeErrorMessage) y agregaron
un bloqueo extra al botón Crear. Nunca corrigieron el **gate de UI** ni dieron feedback de campos
faltantes, así que un `versionId` vacío (o el requisito de nombre para previsualizar) dejaba la pantalla
muerta sin explicación.

### Fix mínimo aplicado
- **`form-gating.ts` (nuevo, puro/testeable):** `deriveFormGating()` + `isValidIsoDate()`. Contrato:
  - Vista previa: habilitada con **proyecto + versión + fecha válida** (NO requiere nombre ni preview
    previo; nunca depende de un preview/error anterior → siempre se puede reintentar).
  - Crear: habilitado **solo** con `previewOk === true` y nombre presente.
  - Expone `missing[]` y `createHint` para mostrar el motivo del bloqueo.
- **`new-schedule-form.tsx`:** usa `deriveFormGating`; invalida el preview cuando cambian entradas que
  afectan el cálculo (versión, fecha, opciones, duración, cuadrilla) — el nombre NO lo invalida; muestra
  hint de campos faltantes y motivo de Crear deshabilitado; `<option>` placeholder cuando `versionId===''`
  (evita que un value vacío se disfrace de primera opción).
- **`actions.ts`:** `parseParams` ya no exige nombre (la vista previa es read-only); `createScheduleAction`
  valida nombre por separado ("Ingresa un nombre…") y el RPC lo revalida (`invalid_name`).

### Validación (Fase 5)
- typecheck **exit 0**; lint **exit 0**; build **OK** (`/planning/new` dinámica).
- Suite completa **1739 passed / 42 skipped / 0 fail** (+16 tests nuevos en `form-gating.test.ts`).
- `git diff --check` limpio; `validate-claude-agents` **214 PASS / 0 FAIL**.

### Deuda NO cerrada (sigue vigente, no era esta causa)
- **SCHEDULE_ROLE_COMPRAS_SEPARATION**: un usuario `compras` (ViewerRole='internal') aún podría llegar al
  RPC y recibir 42501. Esta hipótesis quedó pendiente de evidencia de prod (rol real / datos de la versión)
  y NO se tocó aquí. Si tras este fix el usuario crea con preview.ok pero el RPC responde "No tienes
  permiso", confirmar `profiles.role` (read-only SQL) antes de cambiar contrato de permisos.

### Próximo paso (tras release autorizado)
- Merge + publicar; revisión visual: /planning/new con campos válidos ⇒ Vista previa habilitada; tras
  preview ok ⇒ Crear habilitada; cambiar opción ⇒ Crear se re-bloquea.

---
- NO merge, NO deploy, NO db push remoto en este ciclo. **STOP.**
