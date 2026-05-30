import { describe, it, expect } from "vitest";

/**
 * Smoke test de Paso 0: confirma que el runner de Vitest está operativo.
 * agent-frontend-boq / agent-cost-domain añadirán tests reales en sus áreas.
 */
describe("toolchain smoke", () => {
  it("ejecuta Vitest correctamente", () => {
    expect(1 + 1).toBe(2);
  });
});
