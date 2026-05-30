import { defineConfig } from 'vitest/config';

/**
 * Config de Vitest local para la regresión del golden master.
 *
 * Propiedad de agent-excel-mapper. Aislada del config de apps/web para no
 * tocar archivos del orquestador. Ejecutar desde la raíz del repo:
 *
 *   pnpm --filter web exec vitest run --config ../../scripts/golden-master/vitest.config.ts
 *
 * o, con node_modules hoisteados:
 *
 *   npx vitest run --config scripts/golden-master/vitest.config.ts
 */
export default defineConfig({
  test: {
    environment: 'node',
    root: __dirname,
    include: ['**/*.test.ts'],
  },
});
