# scripts/ — agent-excel-mapper

Herramientas de ingeniería inversa del golden master, fixtures sanitizados,
importador idempotente y regresión financiera.

> Propiedad de **agent-excel-mapper** (`scripts/excel-import/`,
> `scripts/golden-master/`, `scripts/fixtures/`). `xlsx` y `decimal.js` están
> instalados en `apps/web` (ver `docs/DECISIONS.md`). Estos scripts los
> resuelven desde `apps/web/node_modules`.

## Estructura

```
scripts/
├── excel-import/
│   ├── import.ts        Importador idempotente (regresión + privacidad + completitud)
│   ├── sheet-map.ts     Mapa declarativo Excel → entidades del contrato v1
│   └── sanitize.ts      Sanitización de datos privados (alias deterministas)
├── golden-master/
│   ├── dump-workbook.mjs            Volcado estructural del Excel (refs cruzadas, fórmulas)
│   ├── expected-values.ts           Los 9 valores de regresión (PROJECT_MASTER §3.4)
│   ├── recompute-first-floor.ts     Recálculo puro AIU/IVA/total/valor m²
│   ├── first-floor.regression.test.ts  Test Vitest de regresión
│   └── vitest.config.ts             Config local de Vitest (aislada de apps/web)
└── fixtures/
    ├── entre-patios-first-floor.fixture.json   Fixture SANITIZADO (contrato v1)
    └── entre-patios-first-floor.schema-notes.md
```

## Cómo ejecutar

Desde la raíz del repo. `tsx` no es dependencia del proyecto; usar el runner
de TypeScript disponible (Vitest ya está instalado en `apps/web`).

### 1) Dump estructural del Excel (requiere acceso a `private/`)

```bash
node "scripts/golden-master/dump-workbook.mjs" "private/COT.ENTRE PATIOS 1 PISO (1).xlsx"
# Con JSON detallado (NO commitear: puede contener datos privados):
node "scripts/golden-master/dump-workbook.mjs" "private/COT.ENTRE PATIOS 1 PISO (1).xlsx" --json /tmp/dump.json
```

Imprime, por hoja: `!ref`, conteo de fórmulas/inputs y referencias cruzadas.
Es el insumo para confirmar las coordenadas `TODO_VERIFY` de `sheet-map.ts`.

### 2) Regresión financiera (Vitest)

```bash
pnpm --filter web exec vitest run --config ../../scripts/golden-master/vitest.config.ts
```

Valida (±0.01 COP / ±0.001 m²):
- el fixture vs los 9 valores de `PROJECT_MASTER §3.4`;
- la cadena de fórmulas recalculada (Admin/Imprev/Util/IVA/total/valor m²).

### 3) Importador (regresión + privacidad + completitud de hojas)

```bash
# Solo fixture (no requiere el Excel):
pnpm --filter web exec vitest run   # (la regresión); o ejecutar import.ts con un runner TS
# Con el Excel real para validar las 10 hojas:
#   import.ts --excel "private/COT.ENTRE PATIOS 1 PISO (1).xlsx"
```

> `import.ts` también puede ejecutarse con cualquier runner TS/ESM disponible.
> No se añadió script a `package.json` raíz (restringido a orchestrator); ver
> `docs/INTEGRATION_REQUESTS.md` si se desea exponer `pnpm gm:*`.

## Reglas

- El Excel original **nunca** se commitea. `.gitignore` cubre `private/`,
  `*.xlsx`, `*.xls`.
- Los fixtures versionables **no** contienen datos privados (verificado por
  `findPrivateLeaks` en `import.ts`).
- No se ajustan fórmulas/tasas para forzar regresión. Diferencias →
  `docs/OPEN_QUESTIONS.md`.
