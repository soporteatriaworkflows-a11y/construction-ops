# Preguntas abiertas y blockers

## BLOCKERS activos

_Ninguno._

---

## BLOCKERS resueltos

### B-002 — Toolchain del monorepo no inicializado  ✅ RESUELTO
- **Estado**: RESUELTO el 2026-05-29 (Paso 0 / orchestrator).
- **Detectado**: 2026-05-29 (auditoría de arranque).
- **Detalle original**: No existía `package.json` ni configuración de
  toolchain; los `apps/web/app/*.tsx` eran stubs de 1 línea.
- **Acción aplicada**: scaffolding del monorepo pnpm. Creados:
  `package.json` (raíz) con `packageManager: pnpm@11.5.0`,
  `pnpm-workspace.yaml`, `tsconfig.json` base, `apps/web/package.json`,
  configs de Next/Tailwind/PostCSS/ESLint/Vitest, `middleware.ts`,
  `drizzle.config.ts` (esqueleto), `supabase/config.toml`, placeholders
  válidos de páginas y un smoke test.
- **Verificación (todos PASAN)**:
  - `pnpm install` → OK (pnpm 11.5.0, lockfile `pnpm-lock.yaml`).
  - `pnpm run typecheck` → exit 0.
  - `pnpm run lint` → "No ESLint warnings or errors".
  - `pnpm run test` → 1 passed.
  - `pnpm run build` → 8 rutas + middleware compilados.
  - `validate-claude-agents.ps1` → PASS 214 / 0 / 0.
- **Impacto residual**: ninguno. Se habilita la ejecución del checklist de
  merge y el inicio efectivo de la Oleada 1.
- **Responsable**: agent-orchestrator.

### B-001 — docs/PROJECT_MASTER.md está vacío  ✅ RESUELTO
- **Estado**: RESUELTO el 2026-05-29.
- **Detectado**: 2026-05-29.
- **Detalle original**: El archivo `docs/PROJECT_MASTER.md` contenía un
  único carácter en blanco. No tenía visión, dominio, glosario ni
  reglas de negocio.
- **Acción aplicada (2026-05-29)**: El usuario reemplazó manualmente
  el archivo por el documento maestro completo. El archivo ahora
  contiene 2 230 líneas y ~43 KB, con 24 secciones que cubren visión,
  dominio, glosario, arquitectura, fórmulas, política de privacidad,
  proyecto piloto ENTRE PATIOS, librerías aprobadas y nota final.
- **Verificación**: lectura inicial (líneas 1-80) y final (líneas
  2180-2230) confirman que NO es placeholder.
- **Impacto residual**: ninguno. Se desbloquea la Oleada 1.
- **Responsable**: Usuario (manual). Cerrado por Claude Code tras
  verificación.

---

## Preguntas abiertas

1. ¿Cuál es el nombre final del producto?
2. ¿Cuántos decimales se usan para los totales financieros? ¿Se redondea en
   insumo, en APU o en BOQ?
3. ¿El cliente puede ver el desglose de APU o solo el precio unitario final?
4. ¿Los proveedores como Homecenter son visibles en el reporte de cliente?
5. ¿La variación preventiva del 3% es fija o configurable por proyecto?
6. ¿El Gantt se organiza por capítulos del presupuesto o por actividades
   libres?
7. ¿Quiénes son los primeros usuarios y qué roles tienen?
8. ¿La base de descuento se aplica sobre precio público o sobre precio de
   referencia? (pricing).
9. ¿Cuál es la política de redondeo (HALF_EVEN, HALF_UP, etc.) para totales
   en COP?
10. ¿Qué información ve el cliente en el detalle de un APU?
11. ¿La aprobación humana de mapeos SKU requiere doble firma o una sola?
12. ¿Hay un umbral máximo configurable para variación de precio sin
    aprobación?
13. ¿Despliegue final: Vercel + Railway, o solo Vercel?
14. ¿Canal oficial de Homecenter (CSV manual, portal empresarial, API)?
