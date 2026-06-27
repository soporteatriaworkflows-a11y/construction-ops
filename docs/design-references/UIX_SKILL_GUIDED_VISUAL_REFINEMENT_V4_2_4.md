# UIX_SKILL_GUIDED_VISUAL_REFINEMENT_V4_2_4 — Refinamiento guiado por skill

## Skills usadas (cómo, sin instalar nada en el repo)
- **Plugin oficial Anthropic `frontend-design`** (marketplace `claude-plugins-official`, ya clonado en
  `~/.claude/plugins/marketplaces/...`, **no instalado**). Se **leyó su `SKILL.md`** y se aplicó su
  metodología directamente. NO se ejecutó ningún instalador, NO se tocó el repo ni `.claude`/config.
- **Impeccable** (tercero): evaluado y **descartado** — requiere `npx impeccable install` (escribe en el
  proyecto/`.claude`), dependencia innecesaria habiendo skill oficial seguro.
- Capacidad: un plugin no se "hot-carga" a la sesión activa; por eso se aplicó la guía leyéndola. Para
  futuras sesiones, instalar con `/plugin install frontend-design@claude-plugins-official` (no toca el repo).

## Archivos creados por las skills
Ninguno. Las skills no generaron archivos en el repo (solo se usó su criterio).

## Diagnóstico (lente frontend-design)
- **Tipografía = mayor falla**: todo Inter + mono, y además **Inter ni siquiera se cargaba** (no había
  next/font ni `<link>` → fallback a `system-ui`). Inter-en-todo = default templado → "no se siente premium".
- **Hero del dashboard = "respuesta plantilla"** (número grande + stats + gradiente), que el skill nombra
  como patrón a evitar.
- **Audacia dispersa** (gradientes/glows/glass por todos lados) en vez de concentrada en una firma.
- **Conservar**: tokens ICONIC, rail flotante, OperationsHeader, honestidad de KPIs, eyebrows con contexto real.

## Decisiones tomadas
1. **Sistema tipográfico deliberado** (palanca #1): self-hosted vía `next/font` — **Inter** (cuerpo),
   **Space Grotesk** (display técnica/sobria, carácter de "instrumento") para títulos y cifras-héroe,
   **JetBrains Mono** (datos). Tailwind expone `font-display` (+ `sans`/`mono` por variable).
2. **Concentrar la audacia / "quitar un accesorio"**: el hero del dashboard se **aplanó** (gradiente
   vertical sobrio + sombra suave, sin radial saturado ni doble glow cian); la tipografía display carga el peso.
3. **Quality floor**: respetar `prefers-reduced-motion` (transiciones/animaciones reducidas).

## Cambios implementados
- `app/layout.tsx`: carga de fuentes (next/font) + variables en `<html>`.
- `tailwind.config.ts`: `fontFamily.sans/display/mono` por variable.
- `app/globals.css`: body usa `var(--font-inter)`; bloque `@media (prefers-reduced-motion)`.
- `font-display` aplicado central en cifras-héroe/títulos: `OperationsHeader` (título + stat), `KpiCard`
  (valor), Dashboard (Total presupuesto + h2 "Operación"), Workspace (Total general navy).
- Dashboard "Centro de mando": hero aplanado (menos gradiente/glow).

## Qué mejoró frente a V4.2.3
- Tipografía real y con personalidad (antes caía a system-ui). Títulos/cifras con Space Grotesk → menos
  genérico, más "instrumento técnico". Hero más sobrio (audacia concentrada). Accesibilidad: reduced-motion.

## Pendiente (V5)
- Extender `font-display` a más encabezados de sección por módulo; revisar escala/tracking fino.
- Repensar a fondo el "signature" del dashboard (instrumento de cobertura/avance) si se quiere más carácter.
- Aplanar más superficies secundarias con gradientes residuales; contraste de Recharts en dark.

## Riesgos
- `next/font/google` descarga las fuentes en build (requiere red en build; verificado OK localmente y en Vercel).
- Cambio de familia tipográfica = cambio de marca visible (reversible revirtiendo `font-display`/fuentes).

## QA
typecheck 0 · lint 0 · tests `typography-system` 4/0 · suite **2120/0 (+42 skip)** · build 0 · gm 22/22 · diff-check limpio.
Sin tocar lógica/DB/Auth/envs/cálculos/exports/datos · Workspace V3C/companion/Sin APU/rutas intactos · no `-1rqh`.
