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
