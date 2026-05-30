# Handoff Log

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
