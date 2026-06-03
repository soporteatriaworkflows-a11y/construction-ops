/**
 * route-config.test.ts — Guarda de regresión del render de `/projects/new` (4B.1).
 *
 * El mode-guard de creación depende de variables de entorno de servidor
 * (`APP_AUTH_MODE`/`READ_MODEL_SOURCE`) resueltas en runtime. Si la página se
 * prerenderiza de forma estática, Next hornea el resultado del guard con los
 * defaults de build (`demo`+`fixture`) y bloquea la creación aunque en producción
 * `READ_MODEL_SOURCE=db`. Esta prueba asegura que la página declara render
 * request-time (`export const dynamic = 'force-dynamic'`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const newProjectPagePath = resolve(
  here,
  '../../../app/(dashboard)/projects/new/page.tsx',
);

describe('projects/new — configuración de render', () => {
  const source = readFileSync(newProjectPagePath, 'utf8');

  it('declara render dinámico (request-time), no prerender estático', () => {
    expect(source).toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/);
  });

  it('evalúa el mode-guard en cada request (no constante de módulo)', () => {
    // El guard se invoca dentro del componente, no como constante a nivel módulo.
    expect(source).toMatch(/const\s+canCreate\s*=\s*isCreationModeEnabled\(\)/);
  });
});
