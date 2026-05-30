/**
 * Test de aislamiento multitenant (RLS) — Construction Ops.
 *
 * Propiedad: agent-db-rls.
 *
 * Estrategia: validación ESTÁTICA de la migración de políticas RLS. NO se
 * conecta a ninguna base de datos (regla: no ejecutar migraciones contra una
 * base remota ni inicializar Supabase). En su lugar, parsea el SQL de
 * `supabase/migrations/*_rls_policies.sql` y verifica, para las 20 tablas del
 * contrato congelado v1, que:
 *
 *  1. RLS está habilitado y forzado (ENABLE + FORCE ROW LEVEL SECURITY).
 *  2. Las tablas con organization_id directo filtran por app.current_org().
 *  3. Las tablas hijas derivan la organización por JOIN / helper seguro
 *     (es decir, NO exponen filas sin acotar por organización).
 *  4. Inmutabilidad:
 *     - apu_calculation_snapshots: sin política UPDATE ni DELETE.
 *     - hijos de versiones emitidas: bloqueados con estimate_version_locked.
 *     - price_observations: append-only (sin DELETE).
 *
 * Esto demuestra que un usuario de la organización A no puede ver, modificar
 * ni eliminar datos de la organización B, porque toda política está acotada
 * por `app.current_org()` (directa o derivada) y `current_org()` proviene del
 * JWT del usuario. Cuando exista una base de pruebas, agent-qa añadirá un test
 * de integración que ejerce las políticas con dos JWT reales.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
// HERE = apps/web/tests/regression → subir 4 niveles a la raíz del repo.
const MIGRATIONS_DIR = join(HERE, "..", "..", "..", "..", "supabase", "migrations");

function readRlsMigration(): string {
  const file = readdirSync(MIGRATIONS_DIR).find((f) =>
    f.endsWith("_rls_policies.sql"),
  );
  if (!file) {
    throw new Error("No se encontró la migración *_rls_policies.sql");
  }
  return readFileSync(join(MIGRATIONS_DIR, file), "utf8");
}

const rlsSql = readRlsMigration();

/** Todas las tablas del contrato congelado v1 (Oleada 1). */
const ALL_TABLES = [
  "organizations",
  "profiles",
  "projects",
  "project_scopes",
  "resources",
  "suppliers",
  "supplier_products",
  "price_observations",
  "pricing_rules",
  "labor_roles",
  "apu_templates",
  "apu_components",
  "apu_calculation_snapshots",
  "estimates",
  "estimate_versions",
  "chapters",
  "boq_items",
  "indirect_cost_rules",
  "quantity_groups",
  "quantity_lines",
] as const;

/** Tablas con organization_id DIRECTO (filtro simple por current_org). */
const DIRECT_ORG_TABLES = [
  "profiles",
  "projects",
  "resources",
  "suppliers",
  "pricing_rules",
  "labor_roles",
  "apu_templates",
] as const;

/** Tablas hijas: organización derivada por JOIN / helper. */
const DERIVED_ORG_TABLES = [
  "project_scopes",
  "supplier_products",
  "price_observations",
  "apu_components",
  "estimates",
  "estimate_versions",
  "chapters",
  "boq_items",
  "indirect_cost_rules",
  "apu_calculation_snapshots",
  "quantity_groups",
  "quantity_lines",
] as const;

describe("RLS — habilitación en todas las tablas del contrato v1", () => {
  it.each(ALL_TABLES)("%s tiene ENABLE ROW LEVEL SECURITY", (table) => {
    const re = new RegExp(
      `ALTER TABLE ${table}\\s+ENABLE ROW LEVEL SECURITY`,
      "i",
    );
    expect(rlsSql).toMatch(re);
  });

  it.each(ALL_TABLES)("%s tiene FORCE ROW LEVEL SECURITY", (table) => {
    const re = new RegExp(
      `ALTER TABLE ${table}\\s+FORCE ROW LEVEL SECURITY`,
      "i",
    );
    expect(rlsSql).toMatch(re);
  });
});

describe("RLS — aislamiento por organización", () => {
  it("organizations se acota a la propia organización (id = current_org)", () => {
    expect(rlsSql).toMatch(/ON organizations[\s\S]*?id = app\.current_org\(\)/i);
  });

  it.each(DIRECT_ORG_TABLES)(
    "%s filtra por organization_id = app.current_org()",
    (table) => {
      const re = new RegExp(
        `ON ${table}[\\s\\S]*?organization_id = app\\.current_org\\(\\)`,
        "i",
      );
      expect(rlsSql).toMatch(re);
    },
  );

  it.each(DERIVED_ORG_TABLES)(
    "%s deriva la organización por JOIN/helper (no expone filas sin acotar)",
    (table) => {
      // Aísla el bloque de políticas de la tabla y verifica que TODA política
      // referencia current_org() (directo en el EXISTS) o el helper seguro
      // estimate_version_in_org / estimate_version_locked.
      const policyBlocks = [...rlsSql.matchAll(/CREATE POLICY[\s\S]*?;/gi)]
        .map((m) => m[0])
        .filter((block) => new RegExp(`ON ${table}\\b`, "i").test(block));

      expect(policyBlocks.length).toBeGreaterThan(0);
      for (const block of policyBlocks) {
        const acotada =
          /app\.current_org\(\)/i.test(block) ||
          /app\.estimate_version_in_org/i.test(block);
        expect(acotada).toBe(true);
      }
    },
  );
});

describe("RLS — inmutabilidad de snapshots y versiones emitidas", () => {
  it("apu_calculation_snapshots NO tiene política UPDATE", () => {
    expect(rlsSql).not.toMatch(
      /CREATE POLICY[^;]*FOR UPDATE[\s\S]*?ON apu_calculation_snapshots/i,
    );
    expect(rlsSql).not.toMatch(
      /ON apu_calculation_snapshots[\s\S]*?FOR UPDATE/i,
    );
  });

  it("apu_calculation_snapshots NO tiene política DELETE", () => {
    expect(rlsSql).not.toMatch(
      /ON apu_calculation_snapshots[\s\S]*?FOR DELETE/i,
    );
  });

  it("apu_calculation_snapshots SÍ permite SELECT e INSERT acotados", () => {
    expect(rlsSql).toMatch(/apu_calc_snapshots_select[\s\S]*?FOR SELECT/i);
    expect(rlsSql).toMatch(/apu_calc_snapshots_insert[\s\S]*?FOR INSERT/i);
  });

  it.each(["chapters", "boq_items", "indirect_cost_rules"] as const)(
    "%s bloquea escritura cuando la versión está congelada",
    (table) => {
      const block = rlsSql.slice(rlsSql.indexOf(`ON ${table} `));
      // INSERT/UPDATE/DELETE de la tabla deben invocar estimate_version_locked.
      const writePolicies = [
        ...rlsSql.matchAll(/CREATE POLICY[\s\S]*?;/gi),
      ]
        .map((m) => m[0])
        .filter(
          (b) =>
            new RegExp(`ON ${table}\\b`, "i").test(b) &&
            /FOR (INSERT|UPDATE|DELETE)/i.test(b),
        );
      expect(writePolicies.length).toBeGreaterThan(0);
      for (const p of writePolicies) {
        expect(p).toMatch(/NOT app\.estimate_version_locked/i);
      }
      expect(block.length).toBeGreaterThan(0);
    },
  );

  it("estimate_versions impide UPDATE/DELETE de versiones emitidas", () => {
    const update = rlsSql.match(
      /CREATE POLICY estimate_versions_update[\s\S]*?;/i,
    )?.[0];
    const del = rlsSql.match(
      /CREATE POLICY estimate_versions_delete[\s\S]*?;/i,
    )?.[0];
    expect(update).toBeDefined();
    expect(del).toBeDefined();
    expect(update).toMatch(/status NOT IN \('approved','issued','archived'\)/i);
    expect(del).toMatch(/status NOT IN \('approved','issued','archived'\)/i);
  });

  it("price_observations es append-only (sin política DELETE)", () => {
    expect(rlsSql).not.toMatch(/ON price_observations[\s\S]*?FOR DELETE/i);
    expect(rlsSql).toMatch(/price_observations_insert[\s\S]*?FOR INSERT/i);
    expect(rlsSql).toMatch(/price_observations_select[\s\S]*?FOR SELECT/i);
  });
});

describe("RLS — el aislamiento depende del JWT (no de constantes)", () => {
  it("app.current_org() lee organization_id del JWT", () => {
    const helpers = readHelpersMigration();
    expect(helpers).toMatch(/request\.jwt\.claims[\s\S]*?organization_id/i);
  });

  it("ninguna política contiene un UUID de organización hardcodeado", () => {
    // Las políticas nunca deben fijar una organización concreta.
    const policies = [...rlsSql.matchAll(/CREATE POLICY[\s\S]*?;/gi)].map(
      (m) => m[0],
    );
    const uuidRe =
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    for (const p of policies) {
      expect(uuidRe.test(p)).toBe(false);
    }
  });
});

function readHelpersMigration(): string {
  const file = readdirSync(MIGRATIONS_DIR).find((f) =>
    f.endsWith("_extensions_and_helpers.sql"),
  );
  if (!file) {
    throw new Error("No se encontró la migración *_extensions_and_helpers.sql");
  }
  return readFileSync(join(MIGRATIONS_DIR, file), "utf8");
}
