/**
 * RLS RUNTIME TEST — Construction Ops (Oleada 1.5)
 * Owner: agent-orchestrator (validación de integración; no implementa dominio).
 *
 * Ejecuta pruebas REALES contra el PostgreSQL LOCAL de Supabase (Docker).
 * NO se conecta a ninguna base remota. La cadena de conexión por defecto es la
 * estándar del stack local de Supabase (puerto 54322). Override con LOCAL_DB_URL.
 *
 * Modelo de prueba:
 *   - Conexión como `postgres` (superusuario; ignora RLS).
 *   - Para forzar RLS se ejecuta `SET LOCAL ROLE authenticated` dentro de una
 *     transacción y se inyectan los claims del JWT vía
 *     set_config('request.jwt.claims', ...). El helper app.current_org() lee
 *     ese claim, igual que en Supabase real.
 *   - Las pruebas de mutación se hacen en transacciones con ROLLBACK para no
 *     contaminar los datos sembrados.
 *
 * Cubre el plan de la Fase 5: aislamiento multi-tenant (2 orgs), denegación
 * cross-org (lectura y escritura), usuario sin organización, append-only de
 * price_observations, inmutabilidad de apu_calculation_snapshots y bloqueo de
 * estimate_versions emitidas y sus hijos.
 */
import postgres from 'postgres';

const CONN =
  process.env.LOCAL_DB_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const sql = postgres(CONN, { max: 1, onnotice: () => {} });

// IDs sembrados (org A) — ver supabase/seeds/0001, 0002 y 0003.
const ORG_A = '00000000-0000-0000-0000-0000000000a1';
const USER_A_ADMIN = '00000000-0000-0000-0000-0000000000b1';
const PROJECT_A = '00000000-0000-0000-0000-0000000000c1';
const SCOPE_A = '00000000-0000-0000-0000-0000000000d1'; // alcance "Primer Piso" (seed 0002)
const VERSION_A = '00000000-0000-0000-0000-000000000311';
const APU_A = '00000000-0000-0000-0000-000000000201';
const SUPPLIER_PRODUCT_A = '00000000-0000-0000-0000-000000000111';
// Planning (seed 0003): tarea de mampostería de org A.
const TASK_A = '0d000000-0000-0000-0000-000000000002';
const TASK_A_SUB = '0d000000-0000-0000-0000-000000000003';

// IDs de org B — ahora sembrados por supabase/seeds/0004 (microfase auth 4A.1).
// setupOrgB() abajo los reutiliza con ON CONFLICT DO NOTHING (no-op si ya están).
const ORG_B = '00000000-0000-0000-0000-0000000000a2';
const USER_B_ADMIN = '00000000-0000-0000-0000-0000000000b7';
const PROJECT_B = '00000000-0000-0000-0000-0000000000c2';
const SCOPE_B = '00000000-0000-0000-0000-0000000000d2'; // alcance de B (creado en setup)

// --- Auth 4A.1 (resolución por auth.uid() -> profiles, sin claim de org) ---
// Perfiles de org A (seed 0001) y B (seed 0004) usados para el modo identidad
// real: se fija request.jwt.claims.sub = id del profile, SIN organization_id ni
// user_role, forzando a app.current_org()/current_role() a leer profiles.
const USER_A_OBRA = '00000000-0000-0000-0000-0000000000b4'; // role 'obra' (site)
const USER_B_GERENCIA = '00000000-0000-0000-0000-0000000000b8'; // role 'gerencia'
// Usuario autenticado SIN membresía (auth.users sin profile) — seed 0004.
const USER_NO_PROFILE = '00000000-0000-0000-0000-0000000000bf';

type Claims = Record<string, unknown> | null;

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    pass++;
    console.log(`  ✓ PASS  ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/**
 * Ejecuta `fn` como rol `authenticated` con los claims dados, dentro de una
 * transacción que SIEMPRE se revierte (ROLLBACK). `setup` (opcional) corre como
 * superusuario antes de cambiar de rol (p. ej. para preparar una fila a probar).
 */
async function asUser<T>(
  claims: Claims,
  fn: (q: postgres.ReservedSql) => Promise<T>,
  setup?: (q: postgres.ReservedSql) => Promise<void>,
): Promise<T> {
  const r = await sql.reserve();
  try {
    await r.unsafe('BEGIN');
    if (setup) await setup(r); // como superusuario (RLS no aplica)
    const claimsStr = claims ? JSON.stringify(claims) : '';
    await r`SELECT set_config('request.jwt.claims', ${claimsStr}, true)`;
    await r.unsafe('SET LOCAL ROLE authenticated');
    const out = await fn(r);
    await r.unsafe('ROLLBACK');
    return out;
  } catch (e) {
    try {
      await r.unsafe('ROLLBACK');
    } catch {
      /* noop */
    }
    throw e;
  } finally {
    r.release();
  }
}

const claimsA: Claims = { organization_id: ORG_A, user_role: 'admin', sub: USER_A_ADMIN };
const claimsB: Claims = { organization_id: ORG_B, user_role: 'admin', sub: USER_B_ADMIN };
// "Sin organización": identidad SIN membresía. Antes bastaba con omitir el
// claim organization_id; ahora app.current_org() también resuelve por
// auth.uid()->profiles, así que el sub debe ser un usuario SIN profile
// (USER_NO_PROFILE, seed 0004) para que la organización efectiva sea NULL.
const claimsNoOrg: Claims = { user_role: 'admin', sub: USER_NO_PROFILE };

async function setupOrgB(): Promise<void> {
  // Crea la segunda organización y un proyecto, como superusuario (sin RLS).
  await sql`INSERT INTO organizations (id, name) VALUES (${ORG_B}, 'Constructora Demo B') ON CONFLICT (id) DO NOTHING`;
  // En el stack Supabase real existe el esquema auth y la FK
  // profiles_id_auth_users_fk; el usuario admin de B debe existir en auth.users
  // antes de crear su profile. Guardado por la presencia del esquema auth para
  // que el harness también corra contra un Postgres puro sin auth.
  await sql.unsafe(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'auth' AND table_name = 'users'
      ) THEN
        INSERT INTO auth.users (id, instance_id, aud, role, email)
        VALUES ('${USER_B_ADMIN}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-b@example.test')
        ON CONFLICT (id) DO NOTHING;
      END IF;
    END $$;`);
  await sql`
    INSERT INTO profiles (id, organization_id, full_name, email, role)
    VALUES (${USER_B_ADMIN}, ${ORG_B}, 'Admin B', 'admin-b@example.test', 'admin')
    ON CONFLICT (id) DO NOTHING`;
  await sql`
    INSERT INTO projects (id, organization_id, code, name, status, location)
    VALUES (${PROJECT_B}, ${ORG_B}, 'PROY-B', 'Proyecto B', 'active', 'Demo B')
    ON CONFLICT (id) DO NOTHING`;
}

// Concede SOLO los privilegios que la PLATAFORMA Supabase otorga por defecto al
// rol `authenticated` en una base real (USAGE en `public` + DML en tablas de
// `public`, vía default privileges del rol postgres). NO concede USAGE/EXECUTE
// sobre el esquema `app`: eso DEBE proveerlo una migración (20260602130000), y el
// harness lo valida en lugar de enmascararlo. Así, si un entorno (p. ej. Supabase
// remoto) carece de esos grants, el harness lo detecta con "permission denied for
// schema app" en lugar de pasar en verde engañosamente. Idempotente.
async function ensureGrants(): Promise<void> {
  await sql.unsafe('GRANT USAGE ON SCHEMA public TO authenticated');
  await sql.unsafe(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated',
  );
}

async function main(): Promise<void> {
  console.log('RLS RUNTIME — PostgreSQL local (Supabase Docker)\n');

  // --- Pre-flight: migraciones aplicadas + seeds presentes (como superusuario) ---
  const [{ count: orgCount }] = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count FROM organizations WHERE id = ${ORG_A}`;
  check('Pre-flight: seed org A aplicado', orgCount === '1', `orgCount=${orgCount}`);

  const [{ count: projCount }] = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count FROM projects WHERE id = ${PROJECT_A}`;
  check('Pre-flight: seed proyecto A aplicado', projCount === '1');

  const [{ count: rlsTables }] = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relrowsecurity AND c.relforcerowsecurity`;
  // 20 tablas de Oleada 1 + 4 de planning (Oleada 3B) + 1 resource_price_observations (Fase 3A)
  // + 3 de price monitoring (Fase 4A: targets/runs/results)
  // + 2 del review center (batches + bulk_actions)
  // + 1 apu_import_batches (FASE 4B.2)
  // + 3 quantity takeoff import (FASE 4B.3: batches/groups/lines) = 34.
  // 35 tras APU_COMPONENT_RESOURCE_RECONCILIATION_V1 (+apu_component_resource_actions).
  // 36 tras APU_MANUAL_BUILDER_V1 + BOQ_ADD_FROM_APU_V1 (+apu_manual_actions).
  check('Pre-flight: 36 tablas con RLS FORCE', rlsTables === '36', `rlsTables=${rlsTables}`);

  const [{ count: taskCount }] = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count FROM schedule_tasks WHERE id = ${TASK_A}`;
  check('Pre-flight: seed planning A aplicado', taskCount === '1', `taskCount=${taskCount}`);

  await ensureGrants();
  await setupOrgB();

  // === 1) Helper lee organization_id del JWT ===
  const orgFromJwt = await asUser(claimsA, async (q) => {
    const [{ org }] = await q<{ org: string | null }[]>`SELECT app.current_org() AS org`;
    return org;
  });
  check('Helper app.current_org() = org del JWT (A)', orgFromJwt === ORG_A, `got=${orgFromJwt}`);

  // === 2) Usuario A lee SOLO datos de org A ===
  const aSeesOwn = await asUser(claimsA, async (q) => {
    const rows = await q<{ id: string }[]>`SELECT id FROM projects`;
    return rows.map((r) => r.id);
  });
  check('A ve su propio proyecto', aSeesOwn.includes(PROJECT_A));
  check('A NO ve el proyecto de B', !aSeesOwn.includes(PROJECT_B));

  // === 3) Usuario B lee SOLO datos de org B ===
  const bSees = await asUser(claimsB, async (q) => {
    const rows = await q<{ id: string }[]>`SELECT id FROM projects`;
    return rows.map((r) => r.id);
  });
  check('B ve su propio proyecto', bSees.includes(PROJECT_B));
  check('B NO ve el proyecto de A', !bSees.includes(PROJECT_A));

  // === 4) Usuario A NO puede modificar datos de org B (UPDATE filtra 0 filas) ===
  const updCount = await asUser(claimsA, async (q) => {
    const res = await q`UPDATE projects SET name = 'HACKED' WHERE id = ${PROJECT_B}`;
    return res.count;
  });
  check('A no puede UPDATE proyecto de B (0 filas)', updCount === 0, `count=${updCount}`);

  // === 4b) Usuario A NO puede INSERT en org B (WITH CHECK lanza error) ===
  let insBlocked = false;
  try {
    await asUser(claimsA, async (q) => {
      await q`INSERT INTO projects (organization_id, code, name, status)
              VALUES (${ORG_B}, 'X', 'X', 'active')`;
    });
  } catch {
    insBlocked = true;
  }
  check('A no puede INSERT proyecto en org B (WITH CHECK)', insBlocked);

  // === 5) Usuario sin organización: 0 filas en recursos protegidos ===
  const noOrgRows = await asUser(claimsNoOrg, async (q) => {
    const rows = await q<{ id: string }[]>`SELECT id FROM projects`;
    return rows.length;
  });
  check('Usuario sin organización no ve proyectos', noOrgRows === 0, `rows=${noOrgRows}`);

  // === 5b) project_scopes — aislamiento por org (vía proyecto padre), 4B.2 ===
  // A ve su propio alcance (Primer Piso de PROJECT_A).
  const aSeesScope = await asUser(claimsA, async (q) => {
    const rows = await q<{ id: string }[]>`SELECT id FROM project_scopes`;
    return rows.map((r) => r.id);
  });
  check('scopes: A ve su propio alcance', aSeesScope.includes(SCOPE_A));

  // B NO ve los alcances de A (cross-org bloqueado en SELECT).
  const bSeesScope = await asUser(claimsB, async (q) => {
    const rows = await q<{ id: string }[]>`SELECT id FROM project_scopes`;
    return rows.map((r) => r.id);
  });
  check('scopes: B NO ve el alcance de A', !bSeesScope.includes(SCOPE_A));

  // A puede INSERT un alcance en SU proyecto (WITH CHECK pasa) — incl. description/created_by.
  const aInsertOwn = await asUser(claimsA, async (q) => {
    const rows = await q<{ id: string }[]>`
      INSERT INTO project_scopes (project_id, code, name, scope_type, description, created_by)
      VALUES (${PROJECT_A}, 'P2', 'Segundo Piso', 'floor', 'desc', ${USER_A_ADMIN})
      RETURNING id`;
    return rows.length;
  });
  check('scopes: A puede INSERT alcance en su proyecto (WITH CHECK)', aInsertOwn === 1);

  // A NO puede INSERT un alcance en el proyecto de B (cross-org WITH CHECK lanza).
  let scopeCrossBlocked = false;
  try {
    await asUser(claimsA, async (q) => {
      await q`INSERT INTO project_scopes (project_id, code, name, scope_type)
              VALUES (${PROJECT_B}, 'X', 'X', 'floor')`;
    });
  } catch {
    scopeCrossBlocked = true;
  }
  check('scopes: A no puede INSERT alcance en proyecto de B (WITH CHECK)', scopeCrossBlocked);

  // B NO puede UPDATE el alcance de A (0 filas por USING).
  const bUpdScopeA = await asUser(claimsB, async (q) => {
    const res = await q`UPDATE project_scopes SET name = 'HACKED' WHERE id = ${SCOPE_A}`;
    return res.count;
  });
  check('scopes: B no puede UPDATE alcance de A (0 filas)', bUpdScopeA === 0, `count=${bUpdScopeA}`);

  // Usuario sin organización no ve alcances.
  const noOrgScopes = await asUser(claimsNoOrg, async (q) => {
    const rows = await q<{ id: string }[]>`SELECT id FROM project_scopes`;
    return rows.length;
  });
  check('scopes: usuario sin organización no ve alcances', noOrgScopes === 0, `rows=${noOrgScopes}`);

  // === 6) price_observations append-only ===
  // Setup (superusuario): inserta una observación de precio para org A.
  const obsResult = await asUser(
    claimsA,
    async (q) => {
      // Como authenticated: DELETE no tiene política => 0 filas borradas.
      const del = await q`DELETE FROM price_observations WHERE supplier_product_id = ${SUPPLIER_PRODUCT_A}`;
      // Sigue existiendo.
      const [{ count }] = await q<{ count: string }[]>`
        SELECT count(*)::text AS count FROM price_observations
        WHERE supplier_product_id = ${SUPPLIER_PRODUCT_A}`;
      // UPDATE del precio observado: trigger de inmutabilidad debe lanzar error.
      let priceImmutable = false;
      try {
        await q`UPDATE price_observations SET observed_price = 999
                WHERE supplier_product_id = ${SUPPLIER_PRODUCT_A}`;
      } catch {
        priceImmutable = true;
      }
      return { delCount: del.count, stillThere: count, priceImmutable };
    },
    async (q) => {
      await q`
        INSERT INTO price_observations
          (supplier_product_id, observed_price, source_type, observed_at, approved)
        VALUES (${SUPPLIER_PRODUCT_A}, 28000, 'manual', now(), false)`;
    },
  );
  check('price_observations: DELETE no borra (append-only)', obsResult.delCount === 0, `del=${obsResult.delCount}`);
  check('price_observations: la fila persiste', obsResult.stillThere === '1');
  check('price_observations: precio observado inmutable (trigger)', obsResult.priceImmutable);

  // === 7) apu_calculation_snapshots inmutable ===
  const snap = await asUser(claimsA, async (q) => {
    // INSERT permitido (la versión pertenece a la org).
    const [{ id }] = await q<{ id: string }[]>`
      INSERT INTO apu_calculation_snapshots
        (apu_template_id, estimate_version_id, calculated_unit_cost, components_json)
      VALUES (${APU_A}, ${VERSION_A}, 14700, '[]'::jsonb)
      RETURNING id`;
    // UPDATE: sin política => 0 filas.
    const upd = await q`UPDATE apu_calculation_snapshots SET calculated_unit_cost = 1 WHERE id = ${id}`;
    // DELETE: sin política => 0 filas.
    const del = await q`DELETE FROM apu_calculation_snapshots WHERE id = ${id}`;
    return { inserted: !!id, updCount: upd.count, delCount: del.count };
  });
  check('snapshot: INSERT permitido en versión de la org', snap.inserted);
  check('snapshot: UPDATE denegado (0 filas)', snap.updCount === 0, `upd=${snap.updCount}`);
  check('snapshot: DELETE denegado (0 filas)', snap.delCount === 0, `del=${snap.delCount}`);

  // === 8) estimate_versions emitida bloquea modificación y a sus hijos ===
  const issued = await asUser(
    claimsA,
    async (q) => {
      // Intenta re-editar la versión emitida: USING evalúa OLD.status => 0 filas.
      const upd = await q`UPDATE estimate_versions SET version_number = 99 WHERE id = ${VERSION_A}`;
      const del = await q`DELETE FROM estimate_versions WHERE id = ${VERSION_A}`;
      // Insertar un capítulo en la versión congelada: WITH CHECK lanza error.
      let childBlocked = false;
      try {
        await q`INSERT INTO chapters (estimate_version_id, code, name, sort_order)
                VALUES (${VERSION_A}, 'CX', 'Bloqueado', 99)`;
      } catch {
        childBlocked = true;
      }
      return { updCount: upd.count, delCount: del.count, childBlocked };
    },
    async (q) => {
      // Como superusuario: congela la versión a 'issued' SOLO dentro de esta tx.
      await q`UPDATE estimate_versions SET status = 'issued' WHERE id = ${VERSION_A}`;
    },
  );
  check('estimate_versions emitida: UPDATE bloqueado (0 filas)', issued.updCount === 0, `upd=${issued.updCount}`);
  check('estimate_versions emitida: DELETE bloqueado (0 filas)', issued.delCount === 0, `del=${issued.delCount}`);
  check('estimate_versions emitida: INSERT de hijo bloqueado', issued.childBlocked);

  // === 9) En estado draft SÍ se puede editar dentro de la org (control positivo) ===
  const draftUpd = await asUser(claimsA, async (q) => {
    const res = await q`UPDATE estimate_versions SET notes = 'editable' WHERE id = ${VERSION_A} AND status = 'draft'`;
    return res.count;
  });
  check('estimate_versions draft: UPDATE permitido en la org (1 fila)', draftUpd === 1, `count=${draftUpd}`);

  // === 10) PLANNING — aislamiento org A/B en las 4 tablas ===
  // 10a) A ve sus tareas; B no ve ninguna tarea de A.
  const aSeesTasks = await asUser(claimsA, async (q) => {
    const rows = await q<{ id: string }[]>`SELECT id FROM schedule_tasks`;
    return rows.map((r) => r.id);
  });
  check('planning: A ve su tarea de cronograma', aSeesTasks.includes(TASK_A));

  const bSeesTasks = await asUser(claimsB, async (q) => {
    const rows = await q<{ id: string }[]>`SELECT id FROM schedule_tasks`;
    return rows.map((r) => r.id);
  });
  check('planning: B NO ve tareas de A', !bSeesTasks.includes(TASK_A));

  // 10b) Aislamiento en las 4 tablas para B (no ve nada de A).
  const bPlanningCounts = await asUser(claimsB, async (q) => {
    const [{ t }] = await q<{ t: string }[]>`SELECT count(*)::text AS t FROM schedule_tasks`;
    const [{ d }] = await q<{ d: string }[]>`SELECT count(*)::text AS d FROM task_dependencies`;
    const [{ p }] = await q<{ p: string }[]>`SELECT count(*)::text AS p FROM progress_entries`;
    const [{ r }] = await q<{ r: string }[]>`SELECT count(*)::text AS r FROM resource_assignments`;
    return { t, d, p, r };
  });
  check(
    'planning: B no ve dependencias/avances/recursos de A (4 tablas vacías)',
    bPlanningCounts.t === '0' &&
      bPlanningCounts.d === '0' &&
      bPlanningCounts.p === '0' &&
      bPlanningCounts.r === '0',
    JSON.stringify(bPlanningCounts),
  );

  // 10c) Usuario sin organización no ve tareas de cronograma.
  const noOrgTasks = await asUser(claimsNoOrg, async (q) => {
    const rows = await q<{ id: string }[]>`SELECT id FROM schedule_tasks`;
    return rows.length;
  });
  check('planning: usuario sin organización no ve tareas', noOrgTasks === 0, `rows=${noOrgTasks}`);

  // 10d) A puede leer y escribir avance autorizado en su propia tarea.
  const authoredEntry = await asUser(claimsA, async (q) => {
    const [{ id }] = await q<{ id: string }[]>`
      INSERT INTO progress_entries
        (organization_id, project_id, task_id, recorded_at, physical_progress_pct)
      VALUES (${ORG_A}, ${PROJECT_A}, ${TASK_A}, now(), 50)
      RETURNING id`;
    return id;
  });
  check('planning: A puede INSERT avance en su tarea (autorizado)', !!authoredEntry);

  // 10e) progress_entries es APPEND-ONLY: sin UPDATE ni DELETE.
  const appendOnly = await asUser(
    claimsA,
    async (q) => {
      const upd = await q`UPDATE progress_entries SET physical_progress_pct = 1 WHERE task_id = ${TASK_A}`;
      const del = await q`DELETE FROM progress_entries WHERE task_id = ${TASK_A}`;
      return { updCount: upd.count, delCount: del.count };
    },
  );
  check('planning: progress_entries UPDATE denegado (0 filas)', appendOnly.updCount === 0, `upd=${appendOnly.updCount}`);
  check('planning: progress_entries DELETE denegado (0 filas)', appendOnly.delCount === 0, `del=${appendOnly.delCount}`);

  // 10f) A NO puede colgar una tarea de su org sobre el proyecto de B (WITH CHECK).
  let crossProjectBlocked = false;
  try {
    await asUser(claimsA, async (q) => {
      await q`INSERT INTO schedule_tasks
                (organization_id, project_id, wbs_code, name, planned_start, planned_end, planned_duration_days)
              VALUES (${ORG_A}, ${PROJECT_B}, 'X', 'X', '2026-06-01', '2026-06-02', 1)`;
    });
  } catch {
    crossProjectBlocked = true;
  }
  check('planning: A no puede crear tarea sobre proyecto de B (WITH CHECK)', crossProjectBlocked);

  // 10g) B NO puede UPDATE una tarea de A (USING filtra 0 filas).
  const bUpdTaskA = await asUser(claimsB, async (q) => {
    const res = await q`UPDATE schedule_tasks SET name = 'HACKED' WHERE id = ${TASK_A}`;
    return res.count;
  });
  check('planning: B no puede UPDATE tarea de A (0 filas)', bUpdTaskA === 0, `count=${bUpdTaskA}`);

  // 10h) A NO puede crear una dependencia que apunte a tareas inexistentes para su org
  //      (las tareas de la dependencia deben ser de la misma org — WITH CHECK).
  let depCrossBlocked = false;
  try {
    await asUser(claimsB, async (q) => {
      // B intenta crear una dependencia usando tareas de A (que B no ve).
      await q`INSERT INTO task_dependencies
                (organization_id, project_id, predecessor_task_id, successor_task_id, dependency_type)
              VALUES (${ORG_B}, ${PROJECT_B}, ${TASK_A}, ${TASK_A_SUB}, 'FS')`;
    });
  } catch {
    depCrossBlocked = true;
  }
  check('planning: B no puede crear dependencia sobre tareas de A (WITH CHECK)', depCrossBlocked);

  // ===========================================================================
  // 11) AUTH 4A.1 — identidad REAL resuelta por auth.uid() -> profiles.
  //     Modo: claims SOLO con `sub` = id del profile, SIN organization_id ni
  //     user_role. app.current_org()/current_role() deben resolver por profiles.
  //     (Coexiste con el modo claims-demo de los tests 1..10, ya verde.)
  // ===========================================================================
  console.log('\n--- AUTH 4A.1: identidad real por auth.uid() -> profiles ---');

  // Claims de "sesión real": solo el sub (como entrega Supabase Auth). Sin org.
  const realA: Claims = { sub: USER_A_ADMIN, role: 'authenticated' };
  const realAObra: Claims = { sub: USER_A_OBRA, role: 'authenticated' };
  const realB: Claims = { sub: USER_B_GERENCIA, role: 'authenticated' };
  const realNoProfile: Claims = { sub: USER_NO_PROFILE, role: 'authenticated' };
  const noSession: Claims = null; // sin request.jwt.claims => sin auth.uid().

  // 11a) current_org() resuelve la org desde profiles (sin claim de org).
  const orgFromProfile = await asUser(realA, async (q) => {
    const [{ org }] = await q<{ org: string | null }[]>`SELECT app.current_org() AS org`;
    return org;
  });
  check(
    'auth: current_org() resuelve org A desde profiles (sin claim org)',
    orgFromProfile === ORG_A,
    `got=${orgFromProfile}`,
  );

  // 11b) current_role() resuelve el rol desde profiles (sin claim user_role).
  const roleFromProfile = await asUser(realA, async (q) => {
    const [{ r }] = await q<{ r: string | null }[]>`SELECT app.current_role() AS r`;
    return r;
  });
  check(
    'auth: current_role() resuelve rol admin desde profiles (sin claim rol)',
    roleFromProfile === 'admin',
    `got=${roleFromProfile}`,
  );

  // 11c) Usuario real de A ve su proyecto y NO el de B (aislamiento por uid).
  const realASees = await asUser(realA, async (q) => {
    const rows = await q<{ id: string }[]>`SELECT id FROM projects`;
    return rows.map((r) => r.id);
  });
  check('auth: usuario real A ve su proyecto', realASees.includes(PROJECT_A));
  check('auth: usuario real A NO ve proyecto de B', !realASees.includes(PROJECT_B));

  // 11d) Usuario real de B ve su proyecto y NO el de A (y viceversa).
  const realBSees = await asUser(realB, async (q) => {
    const rows = await q<{ id: string }[]>`SELECT id FROM projects`;
    return rows.map((r) => r.id);
  });
  check('auth: usuario real B ve su proyecto', realBSees.includes(PROJECT_B));
  check('auth: usuario real B NO ve proyecto de A', !realBSees.includes(PROJECT_A));

  // 11e) Sin sesión (sin claims => sin auth.uid()): deny-by-default, 0 filas.
  const noSessionRows = await asUser(noSession, async (q) => {
    const [{ org }] = await q<{ org: string | null }[]>`SELECT app.current_org() AS org`;
    const rows = await q<{ id: string }[]>`SELECT id FROM projects`;
    return { org, count: rows.length };
  });
  check('auth: sin sesión => current_org() NULL', noSessionRows.org === null, `org=${noSessionRows.org}`);
  check('auth: sin sesión => 0 proyectos (deny-by-default)', noSessionRows.count === 0, `rows=${noSessionRows.count}`);

  // 11f) Usuario autenticado SIN membresía (auth.uid sin profile): deny, 0 filas.
  const noProfile = await asUser(realNoProfile, async (q) => {
    const [{ org }] = await q<{ org: string | null }[]>`SELECT app.current_org() AS org`;
    const rows = await q<{ id: string }[]>`SELECT id FROM projects`;
    return { org, count: rows.length };
  });
  check('auth: sin membresía => current_org() NULL', noProfile.org === null, `org=${noProfile.org}`);
  check('auth: sin membresía => 0 proyectos (deny-by-default)', noProfile.count === 0, `rows=${noProfile.count}`);

  // 11g) Cross-org WRITE bloqueada en modo real: A no inserta en org B.
  let realInsBlocked = false;
  try {
    await asUser(realA, async (q) => {
      await q`INSERT INTO projects (organization_id, code, name, status)
              VALUES (${ORG_B}, 'X', 'X', 'active')`;
    });
  } catch {
    realInsBlocked = true;
  }
  check('auth: cross-org INSERT bloqueado en modo real (WITH CHECK)', realInsBlocked);

  // 11h) Cross-org UPDATE filtra 0 filas en modo real (A sobre proyecto de B).
  const realUpd = await asUser(realA, async (q) => {
    const res = await q`UPDATE projects SET name = 'HACKED' WHERE id = ${PROJECT_B}`;
    return res.count;
  });
  check('auth: cross-org UPDATE no afecta filas en modo real (0 filas)', realUpd === 0, `count=${realUpd}`);

  // 11i) Autorización por rol resuelto desde profiles:
  //   profiles_insert exige app.current_role() = 'admin'. El admin real de A
  //   puede crear un profile en su org; el rol 'obra' (insuficiente) no.
  //   Se usa el id de USER_NO_PROFILE (existe en auth.users por el seed 0004,
  //   satisface el FK profiles_id_auth_users_fk, y aún no tiene profile). Ambos
  //   intentos corren en transacciones con ROLLBACK, así que no se pisan.
  const adminCanInsertProfile = await asUser(realA, async (q) => {
    const res = await q`
      INSERT INTO profiles (id, organization_id, full_name, email, role)
      VALUES (${USER_NO_PROFILE}, ${ORG_A}, 'Nuevo', 'nuevo@example.test', 'consulta')`;
    return res.count;
  });
  check('auth: rol admin (por profiles) puede INSERT profile en su org', adminCanInsertProfile === 1, `count=${adminCanInsertProfile}`);

  let obraInsertBlocked = false;
  try {
    await asUser(realAObra, async (q) => {
      await q`
        INSERT INTO profiles (id, organization_id, full_name, email, role)
        VALUES (${USER_NO_PROFILE}, ${ORG_A}, 'Nuevo2', 'nuevo2@example.test', 'consulta')`;
    });
  } catch {
    obraInsertBlocked = true;
  }
  check('auth: rol insuficiente (obra) NO puede INSERT profile (WITH CHECK)', obraInsertBlocked);

  // 11j) Compat: el modo claims-demo SIGUE funcionando junto al modo real.
  //   Con claim organization_id explícito, el COALESCE prioriza el claim.
  const claimOverrides = await asUser(claimsA, async (q) => {
    const [{ org }] = await q<{ org: string | null }[]>`SELECT app.current_org() AS org`;
    return org;
  });
  check('auth: claim organization_id sigue teniendo prioridad (compat demo)', claimOverrides === ORG_A, `got=${claimOverrides}`);

  // ===========================================================================
  // 12) PROJECTS 4B.1 — escritura real con autoría + aislamiento por org.
  //     Migración 20260602120000 (description + created_by). Cubre el contrato
  //     PROJECTS_CRUD_CONTRACT §9. Usa la identidad real (sub=profile, sin claim
  //     de org), igual que el flujo de la app. Todo en tx con ROLLBACK.
  // ===========================================================================
  console.log('\n--- PROJECTS 4B.1: escritura real, autoría y aislamiento ---');

  // 12pre) Migración aplicada: columnas description + created_by presentes.
  const [{ count: colCount }] = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects'
      AND column_name IN ('description','created_by')`;
  check('projects: columnas description + created_by existen', colCount === '2', `cols=${colCount}`);

  // 12a) INSERT en la org del viewer (modo real) ⇒ OK; created_by = autor;
  //      organization_id = org del viewer; aparece en SELECT de esa org.
  const created = await asUser(realA, async (q) => {
    const [row] = await q<{ id: string; organization_id: string; created_by: string | null }[]>`
      INSERT INTO projects (organization_id, created_by, code, name, status, location, description)
      VALUES (app.current_org(), app.current_org_user(), 'proy-4b1-a', 'Proyecto 4B1 A', 'active', 'Bogota', 'desc')
      RETURNING id, organization_id, created_by`;
    const seen = await q<{ id: string }[]>`SELECT id FROM projects WHERE id = ${row!.id}`;
    return { row: row!, visible: seen.length === 1 };
  });
  check('projects: INSERT del viewer crea fila en su org', created.row.organization_id === ORG_A, `org=${created.row.organization_id}`);
  check('projects: created_by = autor (app.current_org_user)', created.row.created_by === USER_A_ADMIN, `by=${created.row.created_by}`);
  check('projects: el proyecto creado aparece en SELECT de su org', created.visible);

  // 12b) Aislamiento A/B: B NO ve el proyecto recién creado por A.
  //      (Se recrea dentro de la misma tx para poder observarlo desde B.)
  const isolation = await asUser(
    claimsB,
    async (q) => {
      const rows = await q<{ id: string }[]>`SELECT id FROM projects WHERE code = 'proy-iso-a'`;
      return rows.length;
    },
    async (q) => {
      // Setup (superusuario): inserta un proyecto de A directamente.
      await q`INSERT INTO projects (organization_id, created_by, code, name, status)
              VALUES (${ORG_A}, ${USER_A_ADMIN}, 'proy-iso-a', 'Iso A', 'active')`;
    },
  );
  check('projects: B NO ve un proyecto de A (aislamiento SELECT)', isolation === 0, `rows=${isolation}`);

  // 12c) getById cross-org ⇒ 0 filas (B no puede leer el proyecto de A por id).
  const crossById = await asUser(claimsB, async (q) => {
    const rows = await q<{ id: string }[]>`SELECT id FROM projects WHERE id = ${PROJECT_A}`;
    return rows.length;
  });
  check('projects: getById cross-org devuelve 0 filas', crossById === 0, `rows=${crossById}`);

  // 12d) Sin sesión ⇒ INSERT y SELECT denegados.
  const noSessionProj = await asUser(noSession, async (q) => {
    const rows = await q<{ id: string }[]>`SELECT id FROM projects`;
    return rows.length;
  });
  check('projects: sin sesión no ve proyectos (deny)', noSessionProj === 0, `rows=${noSessionProj}`);
  let noSessionInsBlocked = false;
  try {
    await asUser(noSession, async (q) => {
      await q`INSERT INTO projects (organization_id, code, name, status)
              VALUES (${ORG_A}, 'x', 'x', 'active')`;
    });
  } catch {
    noSessionInsBlocked = true;
  }
  check('projects: sin sesión no puede INSERT (deny)', noSessionInsBlocked);

  // 12e) Sin membresía (auth.uid sin profile) ⇒ INSERT y SELECT denegados.
  const noMembershipProj = await asUser(realNoProfile, async (q) => {
    const rows = await q<{ id: string }[]>`SELECT id FROM projects`;
    return rows.length;
  });
  check('projects: sin membresía no ve proyectos (deny)', noMembershipProj === 0, `rows=${noMembershipProj}`);
  let noMembershipInsBlocked = false;
  try {
    await asUser(realNoProfile, async (q) => {
      await q`INSERT INTO projects (organization_id, code, name, status)
              VALUES (app.current_org(), 'x', 'x', 'active')`;
    });
  } catch {
    noMembershipInsBlocked = true;
  }
  check('projects: sin membresía no puede INSERT (deny)', noMembershipInsBlocked);

  // 12f) Spoofing: A intenta INSERT con organization_id de B ⇒ rechazado (WITH CHECK).
  let spoofBlocked = false;
  try {
    await asUser(realA, async (q) => {
      await q`INSERT INTO projects (organization_id, created_by, code, name, status)
              VALUES (${ORG_B}, app.current_org_user(), 'spoof', 'Spoof', 'active')`;
    });
  } catch {
    spoofBlocked = true;
  }
  check('projects: INSERT con organization_id de otra org rechazado (spoofing/WITH CHECK)', spoofBlocked);

  // ===========================================================================
  // 13) MEMBERSHIP FIX 4B.1 — grants de `app` + self-read NO recursivo en profiles.
  //     Migración 20260602130000. El harness YA NO concede app usage/execute
  //     (ver ensureGrants): que las secciones AUTH/PROJECTS anteriores pasen
  //     demuestra que la migración otorga USAGE/EXECUTE de `app` a authenticated
  //     (causa #1, "permission denied for schema app" en remoto).
  // ===========================================================================
  console.log('\n--- MEMBERSHIP 4B.1: grants app + self-read profiles sin recursion ---');

  // 13a) Self-read: A ve EXACTAMENTE su propia fila de profiles; no la de terceros.
  const selfRead = await asUser(realA, async (q) => {
    const own = await q<{ id: string }[]>`SELECT id FROM profiles WHERE id = ${USER_A_ADMIN}`;
    const others = await q<{ id: string }[]>`SELECT id FROM profiles WHERE id <> ${USER_A_ADMIN}`;
    return { own: own.length, others: others.length };
  });
  check('membership: A lee su propio profile (self-read)', selfRead.own === 1, `own=${selfRead.own}`);
  check('membership: A NO ve perfiles de terceros (deny-by-default)', selfRead.others === 0, `others=${selfRead.others}`);

  // 13b) Regresión anti-recursión (causa #2): se emula el `postgres` remoto SIN
  //      BYPASSRLS poniendo los lookups de identidad en SECURITY INVOKER (en la
  //      misma tx, revertido por ROLLBACK). Con la política self-based, leer
  //      profiles y projects NO debe recursar ("stack depth limit exceeded").
  let noRecursion = false;
  let recursionDetail = '';
  try {
    const res = await asUser(
      realA,
      async (q) => {
        const own = await q<{ id: string }[]>`SELECT id FROM profiles WHERE id = ${USER_A_ADMIN}`;
        const proj = await q<{ n: number }[]>`SELECT count(*)::int AS n FROM projects`;
        return { own: own.length, proj: proj[0]!.n };
      },
      async (q) => {
        await q.unsafe('ALTER FUNCTION app._profile_org(uuid) SECURITY INVOKER');
        await q.unsafe('ALTER FUNCTION app._profile_role(uuid) SECURITY INVOKER');
      },
    );
    noRecursion = res.own === 1 && res.proj >= 1;
    recursionDetail = `own=${res.own} proj=${res.proj}`;
  } catch (e) {
    recursionDetail = (e as Error).message;
  }
  check('membership: sin BYPASSRLS (INVOKER) no hay recursion RLS en profiles', noRecursion, recursionDetail);

  // ===========================================================================
  // 14) ESTIMATES 4B.3 — RPC atómica create_estimate_with_initial_version.
  //     Autor DERIVADO de app._auth_uid() (sin p_created_by). SECURITY INVOKER:
  //     RLS aplica a ambos INSERT. Atomicidad: si un INSERT falla, no hay huérfanos.
  // ===========================================================================
  console.log('\n--- ESTIMATES 4B.3: RPC atómica estimate + V01 ---');

  // 14a) Usuario real A crea estimate + V01; el autor se deriva de su identidad.
  const estCreated = await asUser(realA, async (q) => {
    const [est] = await q<{ id: string; created_by: string }[]>`
      SELECT id, created_by
      FROM public.create_estimate_with_initial_version(${SCOPE_A}, 'PB', 'Presupuesto Base', NULL)`;
    const vers = await q<{ n: number; cb: string | null; st: string }[]>`
      SELECT version_number AS n, created_by AS cb, status AS st
      FROM estimate_versions WHERE estimate_id = ${est!.id}`;
    return { est: est!, vers };
  });
  check('estimates: RPC crea estimate (status active) con autor derivado', estCreated.est.created_by === USER_A_ADMIN, `cb=${estCreated.est.created_by}`);
  check('estimates: RPC crea exactamente la versión V01', estCreated.vers.length === 1 && estCreated.vers[0]!.n === 1, `vers=${estCreated.vers.length}`);
  check('estimates: V01 en draft con autor derivado', estCreated.vers[0]?.st === 'draft' && estCreated.vers[0]?.cb === USER_A_ADMIN);

  // 14b) Atomicidad: segundo RPC con el MISMO code en el MISMO scope ⇒ 23505 ⇒
  //      toda la transacción revierte (no hay segundo estimate ni V01 huérfana).
  const atomicity = await asUser(realA, async (q) => {
    await q`SELECT public.create_estimate_with_initial_version(${SCOPE_A}, 'DUP', 'Uno', NULL)`;
    // SAVEPOINT: en la app cada RPC es su propia transacción; aquí aislamos el
    // fallo del 2.º RPC para no envenenar la tx del harness y poder contar después.
    let dupBlocked = false;
    await q.unsafe('SAVEPOINT sp_dup');
    try {
      await q`SELECT public.create_estimate_with_initial_version(${SCOPE_A}, 'DUP', 'Dos', NULL)`;
    } catch {
      dupBlocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_dup');
    }
    const ests = await q<{ n: number }[]>`SELECT count(*)::int AS n FROM estimates WHERE project_scope_id = ${SCOPE_A} AND code = 'DUP'`;
    const vers = await q<{ n: number }[]>`
      SELECT count(*)::int AS n FROM estimate_versions ev
      JOIN estimates e ON e.id = ev.estimate_id
      WHERE e.project_scope_id = ${SCOPE_A} AND e.code = 'DUP'`;
    return { dupBlocked, ests: ests[0]!.n, vers: vers[0]!.n };
  });
  check('estimates: code duplicado revierte la transacción (23505)', atomicity.dupBlocked);
  check('estimates: tras el duplicado queda 1 estimate (sin huérfanos)', atomicity.ests === 1, `n=${atomicity.ests}`);
  check('estimates: tras el duplicado queda 1 versión (sin huérfanos)', atomicity.vers === 1, `n=${atomicity.vers}`);

  // 14c) Cross-org: A intenta crear estimate sobre un scope de B ⇒ RLS WITH CHECK
  //      revierte (excepción). El scope de B se prepara como superusuario en setup.
  let estCrossBlocked = false;
  try {
    await asUser(
      realA,
      async (q) => {
        await q`SELECT public.create_estimate_with_initial_version(${SCOPE_B}, 'X', 'X', NULL)`;
      },
      async (q) => {
        await q`INSERT INTO project_scopes (id, project_id, code, name, scope_type)
                VALUES (${SCOPE_B}, ${PROJECT_B}, 'SB', 'Scope B', 'floor')
                ON CONFLICT (id) DO NOTHING`;
      },
    );
  } catch {
    estCrossBlocked = true;
  }
  check('estimates: A no puede crear estimate en scope de B (RLS WITH CHECK)', estCrossBlocked);

  // 14d) Sin sesión ⇒ RPC abortada (no_session).
  let estNoSessionBlocked = false;
  try {
    await asUser(noSession, async (q) => {
      await q`SELECT public.create_estimate_with_initial_version(${SCOPE_A}, 'X', 'X', NULL)`;
    });
  } catch {
    estNoSessionBlocked = true;
  }
  check('estimates: sin sesión la RPC aborta (deny)', estNoSessionBlocked);

  // 14e) Sin membresía ⇒ RPC abortada (no_membership).
  let estNoMembershipBlocked = false;
  try {
    await asUser(realNoProfile, async (q) => {
      await q`SELECT public.create_estimate_with_initial_version(${SCOPE_A}, 'X', 'X', NULL)`;
    });
  } catch {
    estNoMembershipBlocked = true;
  }
  check('estimates: sin membresía la RPC aborta (deny)', estNoMembershipBlocked);

  // 14f) Grants: el rol `anon` NO puede ejecutar la RPC (permission denied).
  let anonDenied = false;
  {
    const r = await sql.reserve();
    try {
      await r.unsafe('BEGIN');
      await r.unsafe('SET LOCAL ROLE anon');
      try {
        await r`SELECT public.create_estimate_with_initial_version(${SCOPE_A}, 'X', 'X', NULL)`;
      } catch {
        anonDenied = true;
      }
      await r.unsafe('ROLLBACK');
    } finally {
      r.release();
    }
  }
  check('estimates: rol anon NO puede ejecutar la RPC (grants)', anonDenied);

  // ===========================================================================
  // 15) IMPORT BOQ 4C.1 — RPC atómica import_boq_into_version.
  //     Subtotal recalculado server-side; versión vacía/editable; doble-import
  //     bloqueado; cross-org/anon denegados. Se crea un V01 draft fresco vía la
  //     RPC de 4B.3 y se importa sobre él (todo en la tx del harness, revertido).
  // ===========================================================================
  console.log('\n--- IMPORT BOQ 4C.1: RPC atómica import_boq_into_version ---');

  // 4C.3: `code` = canónico; se persisten source_code/source_row originales.
  const impChapters = [{ code: '11', name: 'Preliminares', sortOrder: 0, sourceCode: '7', sourceRow: 97 }];
  const impItems = [
    { chapterCode: '11', code: '11.01', description: 'Excavación', unit: 'm3', quantity: '2', unitPrice: '3', sortOrder: 0, sourceCode: '7.01', sourceRow: 98 },
    { chapterCode: '11', code: '11.02', description: 'Relleno', unit: 'm3', quantity: '4', unitPrice: '5', sortOrder: 1, sourceCode: '7.02', sourceRow: 99 },
  ];

  // 15a) Import exitoso: conteos + directTotal recalculado (2*3 + 4*5 = 26).
  const imp = await asUser(realA, async (q) => {
    const [{ id: estId }] = await q<{ id: string }[]>`
      SELECT id FROM public.create_estimate_with_initial_version(${SCOPE_A}, 'IMP', 'Imp', NULL)`;
    const [{ vid }] = await q<{ vid: string }[]>`
      SELECT id AS vid FROM estimate_versions WHERE estimate_id = ${estId} ORDER BY version_number DESC LIMIT 1`;
    const [{ res }] = await q<{ res: { chapterCount: number; itemCount: number; directTotal: string } }[]>`
      SELECT public.import_boq_into_version(${vid}, ${sql.json(impChapters)}, ${sql.json(impItems)}) AS res`;
    // Subtotal recalculado server-side (no se confía en columna F del Excel).
    const sub = await q<{ subtotal: string; q: string; p: string }[]>`
      SELECT subtotal, quantity_snapshot AS q, unit_price_snapshot AS p
      FROM boq_items WHERE estimate_version_id = ${vid} AND code = '11.01'`;
    // Trazabilidad: code canónico + source_code/source_row originales persistidos.
    const ch = await q<{ code: string; source_code: string | null; source_row: number | null }[]>`
      SELECT code, source_code, source_row FROM chapters WHERE estimate_version_id = ${vid}`;
    const it = await q<{ code: string; source_code: string | null; source_row: number | null }[]>`
      SELECT code, source_code, source_row FROM boq_items WHERE estimate_version_id = ${vid} AND code = '11.01'`;
    return { res, vid, sub: sub[0]!, ch: ch[0]!, it: it[0]! };
  });
  check('import: conteos correctos (1 cap / 2 ítems)', imp.res.chapterCount === 1 && imp.res.itemCount === 2, JSON.stringify(imp.res));
  check('import: directTotal recalculado server-side = 26', Number(imp.res.directTotal) === 26, `dt=${imp.res.directTotal}`);
  check('import: subtotal recalculado = quantity × unit_price (6)', Number(imp.sub.subtotal) === 6, `sub=${imp.sub.subtotal}`);
  check('import 4C.3: capítulo persiste code canónico (11) + source_code (7) + source_row (97)', imp.ch.code === '11' && imp.ch.source_code === '7' && imp.ch.source_row === 97, JSON.stringify(imp.ch));
  check('import 4C.3: ítem persiste code canónico (11.01) + source_code (7.01) + source_row (98)', imp.it.code === '11.01' && imp.it.source_code === '7.01' && imp.it.source_row === 98, JSON.stringify(imp.it));

  // 15b) Doble importación bloqueada (versión ya no vacía) ⇒ revierte (savepoint).
  const dbl = await asUser(realA, async (q) => {
    const [{ id: estId }] = await q<{ id: string }[]>`
      SELECT id FROM public.create_estimate_with_initial_version(${SCOPE_A}, 'IMP2', 'Imp2', NULL)`;
    const [{ vid }] = await q<{ vid: string }[]>`
      SELECT id AS vid FROM estimate_versions WHERE estimate_id = ${estId} ORDER BY version_number DESC LIMIT 1`;
    await q`SELECT public.import_boq_into_version(${vid}, ${sql.json(impChapters)}, ${sql.json(impItems)})`;
    let blocked = false;
    await q.unsafe('SAVEPOINT sp_imp');
    try {
      await q`SELECT public.import_boq_into_version(${vid}, ${sql.json(impChapters)}, ${sql.json(impItems)})`;
    } catch {
      blocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_imp');
    }
    const [{ n }] = await q<{ n: number }[]>`SELECT count(*)::int AS n FROM boq_items WHERE estimate_version_id = ${vid}`;
    return { blocked, items: n };
  });
  check('import: doble importación bloqueada (version_not_empty)', dbl.blocked);
  check('import: tras el bloqueo siguen 2 ítems (sin duplicar)', dbl.items === 2, `n=${dbl.items}`);

  // 15c) Atomicidad: ítem con chapterCode inexistente ⇒ revierte TODO (0 cap/0 ítems).
  const atom = await asUser(realA, async (q) => {
    const [{ id: estId }] = await q<{ id: string }[]>`
      SELECT id FROM public.create_estimate_with_initial_version(${SCOPE_A}, 'IMP3', 'Imp3', NULL)`;
    const [{ vid }] = await q<{ vid: string }[]>`
      SELECT id AS vid FROM estimate_versions WHERE estimate_id = ${estId} ORDER BY version_number DESC LIMIT 1`;
    const badItems = JSON.stringify([{ chapterCode: 'NOPE', code: 'X', description: 'x', unit: 'u', quantity: '1', unitPrice: '1' }]);
    let blocked = false;
    await q.unsafe('SAVEPOINT sp_atom');
    try {
      await q`SELECT public.import_boq_into_version(${vid}, ${sql.json(impChapters)}, ${badItems}::jsonb)`;
    } catch {
      blocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_atom');
    }
    const [{ c }] = await q<{ c: number }[]>`SELECT count(*)::int AS c FROM chapters WHERE estimate_version_id = ${vid}`;
    return { blocked, chapters: c };
  });
  check('import: ítem con capítulo inexistente revierte la transacción', atom.blocked);
  check('import: atomicidad ⇒ 0 capítulos tras el fallo (sin huérfanos)', atom.chapters === 0, `c=${atom.chapters}`);

  // 15d) Cross-org: A importa en una versión de B ⇒ version_not_found (RLS) ⇒ revierte.
  let impCrossBlocked = false;
  try {
    await asUser(
      realA,
      async (q) => {
        await q`SELECT public.import_boq_into_version(${'00000000-0000-0000-0000-0000000000e2'}, ${sql.json(impChapters)}, ${sql.json(impItems)})`;
      },
      async (q) => {
        // Versión de B (superusuario): estimate + versión draft bajo PROJECT_B/SCOPE_B.
        await q`INSERT INTO project_scopes (id, project_id, code, name, scope_type)
                VALUES (${SCOPE_B}, ${PROJECT_B}, 'SB', 'Scope B', 'floor') ON CONFLICT (id) DO NOTHING`;
        await q`INSERT INTO estimates (id, project_scope_id, code, name, status)
                VALUES ('00000000-0000-0000-0000-0000000000e1', ${SCOPE_B}, 'EB', 'Est B', 'active') ON CONFLICT (id) DO NOTHING`;
        await q`INSERT INTO estimate_versions (id, estimate_id, version_number, status)
                VALUES ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', 1, 'draft') ON CONFLICT (id) DO NOTHING`;
      },
    );
  } catch {
    impCrossBlocked = true;
  }
  check('import: A no puede importar en versión de B (RLS ⇒ version_not_found)', impCrossBlocked);

  // 15e) Sin sesión / sin membresía ⇒ RPC abortada.
  let impNoSession = false;
  try {
    await asUser(noSession, async (q) => {
      await q`SELECT public.import_boq_into_version(${imp.vid}, ${sql.json(impChapters)}, ${sql.json(impItems)})`;
    });
  } catch {
    impNoSession = true;
  }
  check('import: sin sesión la RPC aborta (deny)', impNoSession);

  // 15f) Grants: el rol `anon` NO puede ejecutar la RPC de import.
  let impAnonDenied = false;
  {
    const r = await sql.reserve();
    try {
      await r.unsafe('BEGIN');
      await r.unsafe('SET LOCAL ROLE anon');
      try {
        await r`SELECT public.import_boq_into_version(${imp.vid}, ${sql.json(impChapters)}, ${sql.json(impItems)})`;
      } catch {
        impAnonDenied = true;
      }
      await r.unsafe('ROLLBACK');
    } finally {
      r.release();
    }
  }
  check('import: rol anon NO puede ejecutar la RPC de import (grants)', impAnonDenied);

  // ===========================================================================
  // 16) AIU 4D.2 — indirect_cost_rules editable por versión (RLS).
  // ===========================================================================
  console.log('\n--- AIU 4D.2: indirect_cost_rules por versión (RLS) ---');
  const aiuObjs = (vid: string) => [
    { estimate_version_id: vid, code: 'A', name: 'Administración', percentage: '0.035', base_type: 'direct_cost', sort_order: 0, visible_to_client: true },
    { estimate_version_id: vid, code: 'I', name: 'Imprevistos', percentage: '0.025', base_type: 'direct_cost', sort_order: 1, visible_to_client: true },
  ];

  // 16a) A inserta/actualiza AIU en SU versión draft (editable).
  const aiuOk = await asUser(realA, async (q) => {
    const [{ id: estId }] = await q<{ id: string }[]>`
      SELECT id FROM public.create_estimate_with_initial_version(${SCOPE_A}, 'AIU', 'Aiu', NULL)`;
    const [{ vid }] = await q<{ vid: string }[]>`
      SELECT id AS vid FROM estimate_versions WHERE estimate_id = ${estId} ORDER BY version_number DESC LIMIT 1`;
    await q`INSERT INTO indirect_cost_rules ${q(aiuObjs(vid))}`;
    const [{ n }] = await q<{ n: number }[]>`SELECT count(*)::int AS n FROM indirect_cost_rules WHERE estimate_version_id = ${vid}`;
    // UPDATE del porcentaje (versión draft permite UPDATE).
    const upd = await q`UPDATE indirect_cost_rules SET percentage = '0.04' WHERE estimate_version_id = ${vid} AND code = 'A'`;
    return { n, upd: upd.count };
  });
  check('aiu: A puede insertar AIU en su versión draft', aiuOk.n === 2, `n=${aiuOk.n}`);
  check('aiu: A puede actualizar el porcentaje (draft editable)', aiuOk.upd === 1, `upd=${aiuOk.upd}`);

  // 16b) Cross-org: A NO puede insertar AIU en una versión de B (WITH CHECK).
  let aiuCrossBlocked = false;
  try {
    await asUser(
      realA,
      async (q) => {
        await q`INSERT INTO indirect_cost_rules ${q(aiuObjs('00000000-0000-0000-0000-0000000000e2'))}`;
      },
      async (q) => {
        await q`INSERT INTO project_scopes (id, project_id, code, name, scope_type)
                VALUES (${SCOPE_B}, ${PROJECT_B}, 'SB', 'Scope B', 'floor') ON CONFLICT (id) DO NOTHING`;
        await q`INSERT INTO estimates (id, project_scope_id, code, name, status)
                VALUES ('00000000-0000-0000-0000-0000000000e1', ${SCOPE_B}, 'EB', 'Est B', 'active') ON CONFLICT (id) DO NOTHING`;
        await q`INSERT INTO estimate_versions (id, estimate_id, version_number, status)
                VALUES ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', 1, 'draft') ON CONFLICT (id) DO NOTHING`;
      },
    );
  } catch {
    aiuCrossBlocked = true;
  }
  check('aiu: A no puede insertar AIU en versión de B (WITH CHECK)', aiuCrossBlocked);

  // 16c) Versión EMITIDA (approved) ⇒ AIU read-only (INSERT/UPDATE bloqueados).
  let aiuLockedBlocked = false;
  await asUser(
    realA,
    async (q) => {
      let blocked = false;
      await q.unsafe('SAVEPOINT sp_aiu');
      try {
        await q`INSERT INTO indirect_cost_rules
                  (estimate_version_id, code, name, percentage, base_type, sort_order, visible_to_client)
                VALUES ('00000000-0000-0000-0000-0000000000e3', 'A', 'Admin', '0.03', 'direct_cost', 0, true)`;
      } catch {
        blocked = true;
        await q.unsafe('ROLLBACK TO SAVEPOINT sp_aiu');
      }
      aiuLockedBlocked = blocked;
    },
    async (q) => {
      // Versión de A en estado approved (emitida).
      const [{ id: estId }] = await q<{ id: string }[]>`
        INSERT INTO estimates (id, project_scope_id, code, name, status)
        VALUES ('00000000-0000-0000-0000-0000000000e4', ${SCOPE_A}, 'EMIT', 'Emit', 'active')
        ON CONFLICT (id) DO NOTHING RETURNING id`;
      void estId;
      await q`INSERT INTO estimate_versions (id, estimate_id, version_number, status)
              VALUES ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e4', 1, 'approved')
              ON CONFLICT (id) DO NOTHING`;
    },
  );
  check('aiu: versión emitida (approved) ⇒ INSERT de AIU bloqueado (read-only)', aiuLockedBlocked);

  // ===========================================================================
  // 17) BOQ MANUAL EDITING 4E.2A — invariant DB-level del subtotal + edición.
  //     Trigger boq_items_recompute_subtotal fuerza subtotal=round(q×p,10) en
  //     TODO INSERT/UPDATE; trazabilidad; mover ítem; versión bloqueada.
  // ===========================================================================
  console.log('\n--- BOQ MANUAL 4E.2A: invariant subtotal + edición segura ---');

  // 17a) Catálogo: función + trigger presentes (BEFORE INSERT OR UPDATE).
  const trig = await sql<{ fn: number; tg: number; ev: string | null }[]>`
    SELECT
      (SELECT count(*)::int FROM pg_proc WHERE proname = 'set_boq_item_subtotal') AS fn,
      (SELECT count(*)::int FROM pg_trigger WHERE tgname = 'boq_items_recompute_subtotal' AND NOT tgisinternal) AS tg,
      (SELECT CASE WHEN bool_or(action_timing='BEFORE') AND
                        bool_and(event_manipulation IN ('INSERT','UPDATE'))
                   THEN string_agg(DISTINCT event_manipulation, ',' ORDER BY event_manipulation) END
       FROM information_schema.triggers
       WHERE trigger_name = 'boq_items_recompute_subtotal') AS ev`;
  check('boq-subtotal: función set_boq_item_subtotal presente', trig[0]!.fn === 1, `fn=${trig[0]!.fn}`);
  check('boq-subtotal: trigger boq_items_recompute_subtotal presente', trig[0]!.tg === 1, `tg=${trig[0]!.tg}`);
  check('boq-subtotal: trigger BEFORE INSERT+UPDATE', trig[0]!.ev === 'INSERT,UPDATE', `ev=${trig[0]!.ev}`);

  // Capítulos de prueba: 2 para el escenario de mover ítem.
  const meChapters = [
    { code: '11', name: 'Preliminares', sortOrder: 0, sourceCode: '7', sourceRow: 97 },
    { code: '12', name: 'Cimentación', sortOrder: 1, sourceCode: '8', sourceRow: 110 },
  ];
  const meItems = [
    { chapterCode: '11', code: '11.01', description: 'Excavación', unit: 'm3', quantity: '2', unitPrice: '3', sortOrder: 0, sourceCode: '7.01', sourceRow: 98 },
  ];

  const me = await asUser(realA, async (q) => {
    const [{ id: estId }] = await q<{ id: string }[]>`
      SELECT id FROM public.create_estimate_with_initial_version(${SCOPE_A}, 'MANUAL', 'Manual', NULL)`;
    const [{ vid }] = await q<{ vid: string }[]>`
      SELECT id AS vid FROM estimate_versions WHERE estimate_id = ${estId} ORDER BY version_number DESC LIMIT 1`;
    await q`SELECT public.import_boq_into_version(${vid}, ${sql.json(meChapters)}, ${sql.json(meItems)})`;
    const [{ id: ch11 }] = await q<{ id: string }[]>`SELECT id FROM chapters WHERE estimate_version_id = ${vid} AND code = '11'`;
    const [{ id: ch12 }] = await q<{ id: string }[]>`SELECT id FROM chapters WHERE estimate_version_id = ${vid} AND code = '12'`;

    // 17b) INSERT manual con subtotal MENTIROSO (999) ⇒ recalculado a 6 (=3×2).
    const [ins] = await q<{ subtotal: string; source_code: string | null; source_row: number | null }[]>`
      INSERT INTO boq_items (estimate_version_id, chapter_id, code, description_snapshot, unit_snapshot,
        quantity_snapshot, unit_price_snapshot, subtotal, sort_order)
      VALUES (${vid}, ${ch11}, '11.99', 'Manual', 'un', 3, 2, 999, 1)
      RETURNING subtotal, source_code, source_row`;

    // 17c) UPDATE cantidad ⇒ subtotal recalculado (q=5,p=2 ⇒ 10).
    const [updQ] = await q<{ subtotal: string }[]>`
      UPDATE boq_items SET quantity_snapshot = 5 WHERE estimate_version_id = ${vid} AND code = '11.99' RETURNING subtotal`;
    // 17d) UPDATE precio ⇒ subtotal recalculado (q=5,p=4 ⇒ 20).
    const [updP] = await q<{ subtotal: string }[]>`
      UPDATE boq_items SET unit_price_snapshot = 4 WHERE estimate_version_id = ${vid} AND code = '11.99' RETURNING subtotal`;
    // 17e) PATCH subtotal-only (777) ⇒ ignorado, recalculado a 20 (q=5,p=4).
    const [patch] = await q<{ subtotal: string }[]>`
      UPDATE boq_items SET subtotal = 777 WHERE estimate_version_id = ${vid} AND code = '11.99' RETURNING subtotal`;

    // 17f) UPDATE de ítem IMPORTADO: cambia cantidad, subtotal recalculado,
    //      source_code/source_row PRESERVADOS.
    const [updImp] = await q<{ subtotal: string; source_code: string | null; source_row: number | null }[]>`
      UPDATE boq_items SET quantity_snapshot = 10 WHERE estimate_version_id = ${vid} AND code = '11.01'
      RETURNING subtotal, source_code, source_row`;

    // 17g) Mover ítem importado de cap 11 → cap 12 (misma versión); origen intacto.
    const [moved] = await q<{ chapter_id: string; source_code: string | null; subtotal: string }[]>`
      UPDATE boq_items SET chapter_id = ${ch12}, sort_order = 5 WHERE estimate_version_id = ${vid} AND code = '11.01'
      RETURNING chapter_id, source_code, subtotal`;

    return { vid, ch11, ch12, ins, updQ, updP, patch, updImp, moved };
  });
  check('boq-subtotal: INSERT recalcula subtotal (999→6)', Number(me.ins.subtotal) === 6, `sub=${me.ins.subtotal}`);
  check('boq-subtotal: INSERT manual ⇒ source_code/source_row NULL', me.ins.source_code === null && me.ins.source_row === null);
  check('boq-subtotal: UPDATE cantidad recalcula subtotal (→10)', Number(me.updQ.subtotal) === 10, `sub=${me.updQ.subtotal}`);
  check('boq-subtotal: UPDATE precio recalcula subtotal (→20)', Number(me.updP.subtotal) === 20, `sub=${me.updP.subtotal}`);
  check('boq-subtotal: PATCH subtotal-only ignorado (777→20)', Number(me.patch.subtotal) === 20, `sub=${me.patch.subtotal}`);
  check('boq-subtotal: UPDATE importado recalcula subtotal (10×3=30)', Number(me.updImp.subtotal) === 30, `sub=${me.updImp.subtotal}`);
  check('boq-subtotal: UPDATE importado preserva origen (7.01/98)', me.updImp.source_code === '7.01' && me.updImp.source_row === 98, JSON.stringify(me.updImp));
  check('boq-subtotal: mover ítem cambia chapter_id y conserva origen', me.moved.chapter_id === me.ch12 && me.moved.source_code === '7.01');

  // 17h) Valor negativo bloqueado por CHECK (boq_items_nonneg).
  let negBlocked = false;
  await asUser(realA, async (q) => {
    const [{ id: estId }] = await q<{ id: string }[]>`
      SELECT id FROM public.create_estimate_with_initial_version(${SCOPE_A}, 'NEG', 'Neg', NULL)`;
    const [{ vid }] = await q<{ vid: string }[]>`
      SELECT id AS vid FROM estimate_versions WHERE estimate_id = ${estId} ORDER BY version_number DESC LIMIT 1`;
    await q`SELECT public.import_boq_into_version(${vid}, ${sql.json([meChapters[0]])}, ${sql.json([])})`;
    const [{ id: chid }] = await q<{ id: string }[]>`SELECT id FROM chapters WHERE estimate_version_id = ${vid} AND code = '11'`;
    await q.unsafe('SAVEPOINT sp_neg');
    try {
      await q`INSERT INTO boq_items (estimate_version_id, chapter_id, code, description_snapshot, unit_snapshot,
        quantity_snapshot, unit_price_snapshot, subtotal, sort_order)
        VALUES (${vid}, ${chid}, 'NEG', 'x', 'u', -1, 2, 0, 0)`;
    } catch {
      negBlocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_neg');
    }
  });
  check('boq-subtotal: cantidad negativa bloqueada (CHECK)', negBlocked);

  // 17i) Versión EMITIDA (approved) ⇒ INSERT manual de ítem bloqueado (RLS).
  let boqLockedBlocked = false;
  await asUser(
    realA,
    async (q) => {
      let blocked = false;
      await q.unsafe('SAVEPOINT sp_boq_lock');
      try {
        await q`INSERT INTO chapters (estimate_version_id, code, name, sort_order)
                VALUES ('00000000-0000-0000-0000-0000000000e3', 'LK', 'Locked', 0)`;
      } catch {
        blocked = true;
        await q.unsafe('ROLLBACK TO SAVEPOINT sp_boq_lock');
      }
      boqLockedBlocked = blocked;
    },
    async (q) => {
      await q`INSERT INTO estimates (id, project_scope_id, code, name, status)
              VALUES ('00000000-0000-0000-0000-0000000000e4', ${SCOPE_A}, 'EMIT', 'Emit', 'active')
              ON CONFLICT (id) DO NOTHING`;
      await q`INSERT INTO estimate_versions (id, estimate_id, version_number, status)
              VALUES ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e4', 1, 'approved')
              ON CONFLICT (id) DO NOTHING`;
    },
  );
  check('boq-manual: versión emitida ⇒ INSERT de capítulo bloqueado (read-only)', boqLockedBlocked);

  // === 18) PRICE MONITORING (Fase 4A) — targets/runs/results ===
  console.log('\n[18] Price monitoring — aislamiento, roles, unicidad y append-only');
  const RES_A = '00000000-0000-0000-0000-0000000000e1'; // Cemento gris (seed 0002)
  const MON_URL = 'https://proveedor-demo.example.test/producto-1';

  // 18a) Admin de A crea target en su org; created_by derivado; lo ve.
  const monCreate = await asUser(realA, async (q) => {
    const [row] = await q<{ id: string; organization_id: string; created_by: string }[]>`
      INSERT INTO price_monitor_targets (organization_id, resource_id, source_url, cadence_days, created_by)
      VALUES (${ORG_A}, ${RES_A}, ${MON_URL}, 7, ${USER_A_ADMIN})
      RETURNING id, organization_id, created_by`;
    const seen = await q<{ id: string }[]>`
      SELECT id FROM price_monitor_targets WHERE id = ${row!.id}`;
    return { row: row!, visible: seen.length === 1 };
  });
  check('monitor: admin A crea target en su org', monCreate.row.organization_id === ORG_A);
  check('monitor: created_by = autor server-side', monCreate.row.created_by === USER_A_ADMIN);
  check('monitor: el autor ve su target (SELECT propio)', monCreate.visible);

  // 18b) B no ve targets de A (aislamiento SELECT) — target sembrado como su.
  const monIso = await asUser(
    claimsB,
    async (q) => {
      const rows = await q<{ id: string }[]>`
        SELECT id FROM price_monitor_targets WHERE organization_id = ${ORG_A}`;
      const all = await q<{ id: string }[]>`SELECT id FROM price_monitor_targets`;
      return { aRows: rows.length, total: all.length };
    },
    async (q) => {
      await q`INSERT INTO price_monitor_targets (id, organization_id, resource_id, source_url, cadence_days, created_by)
        VALUES ('00000000-0000-0000-0000-00000000f001', ${ORG_A}, ${RES_A}, ${MON_URL}, 7, ${USER_A_ADMIN})
        ON CONFLICT (id) DO NOTHING`;
    },
  );
  check('monitor: B NO ve targets de A (aislamiento SELECT)', monIso.aRows === 0 && monIso.total === 0, JSON.stringify(monIso));

  // 18c) B no puede insertar target en org A (WITH CHECK cross-org).
  let monCrossBlocked = false;
  await asUser(claimsB, async (q) => {
    await q.unsafe('SAVEPOINT sp_mon_cross');
    try {
      await q`INSERT INTO price_monitor_targets (organization_id, resource_id, source_url, cadence_days, created_by)
        VALUES (${ORG_A}, ${RES_A}, 'https://otro.example.test/p', 7, ${USER_B_ADMIN})`;
    } catch {
      monCrossBlocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_mon_cross');
    }
  });
  check('monitor: INSERT cross-org bloqueado (WITH CHECK)', monCrossBlocked);

  // 18d) Rol obra (site) NO puede crear targets (gate de rol).
  let monRoleBlocked = false;
  await asUser(realAObra, async (q) => {
    await q.unsafe('SAVEPOINT sp_mon_role');
    try {
      await q`INSERT INTO price_monitor_targets (organization_id, resource_id, source_url, cadence_days, created_by)
        VALUES (${ORG_A}, ${RES_A}, 'https://obra.example.test/p', 7, ${USER_A_OBRA})`;
    } catch {
      monRoleBlocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_mon_role');
    }
  });
  check('monitor: rol obra NO crea targets (solo admin/gerencia/presupuestos/compras)', monRoleBlocked);

  // 18e) Unicidad org+recurso+URL.
  let monDupBlocked = false;
  await asUser(realA, async (q) => {
    await q`INSERT INTO price_monitor_targets (organization_id, resource_id, source_url, cadence_days, created_by)
      VALUES (${ORG_A}, ${RES_A}, ${MON_URL}, 7, ${USER_A_ADMIN})`;
    await q.unsafe('SAVEPOINT sp_mon_dup');
    try {
      await q`INSERT INTO price_monitor_targets (organization_id, resource_id, source_url, cadence_days, created_by)
        VALUES (${ORG_A}, ${RES_A}, ${MON_URL}, 30, ${USER_A_ADMIN})`;
    } catch {
      monDupBlocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_mon_dup');
    }
  });
  check('monitor: target duplicado (org+recurso+URL) bloqueado (UNIQUE)', monDupBlocked);

  // 18f) Cadencia inválida bloqueada por CHECK.
  let monCadenceBlocked = false;
  await asUser(realA, async (q) => {
    await q.unsafe('SAVEPOINT sp_mon_cad');
    try {
      await q`INSERT INTO price_monitor_targets (organization_id, resource_id, source_url, cadence_days, created_by)
        VALUES (${ORG_A}, ${RES_A}, 'https://cad.example.test/p', 3, ${USER_A_ADMIN})`;
    } catch {
      monCadenceBlocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_mon_cad');
    }
  });
  check('monitor: cadence_days fuera de {1,7,15,30} bloqueada (CHECK)', monCadenceBlocked);

  // 18g) DELETE de target denegado incluso para admin (pausar = enabled=false).
  const monDelete = await asUser(realA, async (q) => {
    const [t] = await q<{ id: string }[]>`
      INSERT INTO price_monitor_targets (organization_id, resource_id, source_url, cadence_days, created_by)
      VALUES (${ORG_A}, ${RES_A}, 'https://del.example.test/p', 7, ${USER_A_ADMIN})
      RETURNING id`;
    const del = await q`DELETE FROM price_monitor_targets WHERE id = ${t!.id}`;
    const [{ upd }] = await q<{ upd: number }[]>`
      UPDATE price_monitor_targets SET enabled = false, updated_at = now()
      WHERE id = ${t!.id} RETURNING 1 AS upd`;
    return { deleted: del.count, paused: upd === 1 };
  });
  check('monitor: DELETE de target denegado (0 filas)', monDelete.deleted === 0, `del=${monDelete.deleted}`);
  check('monitor: pausar vía UPDATE enabled=false permitido', monDelete.paused);

  // 18h) Runs y results tenant-scoped; results append-only (sin UPDATE).
  const monRun = await asUser(realA, async (q) => {
    const [t] = await q<{ id: string }[]>`
      INSERT INTO price_monitor_targets (organization_id, resource_id, source_url, cadence_days, created_by)
      VALUES (${ORG_A}, ${RES_A}, 'https://run.example.test/p', 7, ${USER_A_ADMIN})
      RETURNING id`;
    const [r] = await q<{ id: string }[]>`
      INSERT INTO price_monitor_runs (organization_id, trigger_type, status, initiated_by, idempotency_key)
      VALUES (${ORG_A}, 'manual', 'running', ${USER_A_ADMIN}, 'manual:harness-18h')
      RETURNING id`;
    const [res] = await q<{ id: string }[]>`
      INSERT INTO price_monitor_results (organization_id, run_id, target_id, status, detected_price, currency, unit, checked_at)
      VALUES (${ORG_A}, ${r!.id}, ${t!.id}, 'unchanged', 100, 'COP', 'm2', now())
      RETURNING id`;
    const updRes = await q`UPDATE price_monitor_results SET status = 'changed' WHERE id = ${res!.id}`;
    const delRun = await q`DELETE FROM price_monitor_runs WHERE id = ${r!.id}`;
    return { created: !!res?.id, resultUpdates: updRes.count, runDeletes: delRun.count };
  });
  check('monitor: run+result manual creados RLS-bound', monRun.created);
  check('monitor: results append-only (UPDATE denegado)', monRun.resultUpdates === 0, `upd=${monRun.resultUpdates}`);
  check('monitor: DELETE de run denegado', monRun.runDeletes === 0, `del=${monRun.runDeletes}`);

  // 18i) Idempotencia: misma (org, idempotency_key) bloqueada (UNIQUE).
  let monIdemBlocked = false;
  await asUser(realA, async (q) => {
    await q`INSERT INTO price_monitor_runs (organization_id, trigger_type, status, idempotency_key)
      VALUES (${ORG_A}, 'scheduled', 'running', 'scheduled:2026-06-12')`;
    await q.unsafe('SAVEPOINT sp_mon_idem');
    try {
      await q`INSERT INTO price_monitor_runs (organization_id, trigger_type, status, idempotency_key)
        VALUES (${ORG_A}, 'scheduled', 'running', 'scheduled:2026-06-12')`;
    } catch {
      monIdemBlocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_mon_idem');
    }
  });
  check('monitor: idempotency_key duplicada por org bloqueada (UNIQUE)', monIdemBlocked);

  // === 19) APU FOUNDATION (FASE 4B.1) — labor_role_id, default_tool_pct ===
  console.log('\n[19] APU foundation — trazabilidad labor_role_id y default_tool_pct');
  const ROLE_AY_A = '00000000-0000-0000-0000-0000000000f2'; // Ayudante (seed 0006)
  const APU_CREW_A = '00000000-0000-0000-0000-000000000202'; // APU-002 (seed 0006)
  const ROLE_B = '00000000-0000-0000-0000-0000000000f9'; // rol de org B (setup)

  // 19a) labor_role_id NULLABLE retrocompatible: componente sin rol se inserta.
  const apuNullable = await asUser(realA, async (q) => {
    const [row] = await q<{ id: string; labor_role_id: string | null }[]>`
      INSERT INTO apu_components (apu_template_id, component_type, quantity, waste_pct,
        unit_price_source, unit_price_snapshot, total_component_cost, sort_order)
      VALUES (${APU_A}, 'material', 1, 0, 'manual', 100, 100, 90)
      RETURNING id, labor_role_id`;
    return row!;
  });
  check('apu: labor_role_id nullable (componente sin rol OK, retrocompatible)',
    !!apuNullable.id && apuNullable.labor_role_id === null);

  // 19b) FK válida: labor_role_id inexistente bloqueado.
  let apuFkBlocked = false;
  await asUser(realA, async (q) => {
    await q.unsafe('SAVEPOINT sp_apu_fk');
    try {
      await q`INSERT INTO apu_components (apu_template_id, labor_role_id, component_type,
        quantity, waste_pct, unit_price_source, unit_price_snapshot, total_component_cost, sort_order)
        VALUES (${APU_A}, '00000000-0000-0000-0000-00000000dead', 'labor', 1, 0, 'labor_role', 100, 100, 91)`;
    } catch {
      apuFkBlocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_apu_fk');
    }
  });
  check('apu: labor_role_id inexistente bloqueado (FK/trigger)', apuFkBlocked);

  // 19c) Componente trazable del seed 0006 visible para A con su rol.
  const apuSeenA = await asUser(realA, async (q) => {
    const rows = await q<{ labor_role_id: string | null }[]>`
      SELECT labor_role_id FROM apu_components
      WHERE apu_template_id = ${APU_CREW_A} AND labor_role_id = ${ROLE_AY_A}`;
    return rows.length;
  });
  check('apu: A ve componente labor trazable (labor_role_id Ayudante)', apuSeenA === 1, `n=${apuSeenA}`);

  // 19d) B NO ve componentes del APU de A (aislamiento por JOIN a template).
  const apuSeenB = await asUser(claimsB, async (q) => {
    const rows = await q<{ id: string }[]>`
      SELECT id FROM apu_components WHERE apu_template_id = ${APU_CREW_A}`;
    return rows.length;
  });
  check('apu: B NO ve componentes del APU de A (cross-org SELECT = 0)', apuSeenB === 0, `n=${apuSeenB}`);

  // 19e) B NO puede insertar componentes en el template de A (RLS WITH CHECK).
  let apuCrossInsertBlocked = false;
  await asUser(claimsB, async (q) => {
    await q.unsafe('SAVEPOINT sp_apu_cross');
    try {
      await q`INSERT INTO apu_components (apu_template_id, component_type, quantity, waste_pct,
        unit_price_source, unit_price_snapshot, total_component_cost, sort_order)
        VALUES (${APU_CREW_A}, 'material', 1, 0, 'manual', 100, 100, 92)`;
    } catch {
      apuCrossInsertBlocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_apu_cross');
    }
  });
  check('apu: INSERT cross-org en template de A bloqueado (RLS)', apuCrossInsertBlocked);

  // 19f) Trigger same-org: vincular un rol de OTRA org al template de A bloqueado.
  let apuSameOrgBlocked = false;
  await asUser(
    realA,
    async (q) => {
      await q.unsafe('SAVEPOINT sp_apu_sameorg');
      try {
        await q`INSERT INTO apu_components (apu_template_id, labor_role_id, component_type,
          quantity, waste_pct, unit_price_source, unit_price_snapshot, total_component_cost, sort_order)
          VALUES (${APU_CREW_A}, ${ROLE_B}, 'labor', 1, 0, 'labor_role', 100, 100, 93)`;
      } catch {
        apuSameOrgBlocked = true;
        await q.unsafe('ROLLBACK TO SAVEPOINT sp_apu_sameorg');
      }
    },
    async (q) => {
      await q`INSERT INTO labor_roles (id, organization_id, code, name, base_salary,
        working_days_month, working_hours_day)
        VALUES (${ROLE_B}, ${ORG_B}, 'LR-B-001', 'Oficial B', 1000000, 24, 8)
        ON CONFLICT (id) DO NOTHING`;
    },
  );
  check('apu: labor_role_id de otra org bloqueado (trigger same-org)', apuSameOrgBlocked);

  // 19g) default_tool_pct: válido OK; fuera de rango (>1 y <0) bloqueado (CHECK).
  const toolPct = await asUser(realA, async (q) => {
    const [ok] = await q<{ default_tool_pct: string }[]>`
      UPDATE apu_templates SET default_tool_pct = 0.05 WHERE id = ${APU_A}
      RETURNING default_tool_pct`;
    let highBlocked = false;
    await q.unsafe('SAVEPOINT sp_tool_high');
    try {
      await q`UPDATE apu_templates SET default_tool_pct = 1.5 WHERE id = ${APU_A}`;
    } catch {
      highBlocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_tool_high');
    }
    let negBlockedPct = false;
    await q.unsafe('SAVEPOINT sp_tool_neg');
    try {
      await q`UPDATE apu_templates SET default_tool_pct = -0.01 WHERE id = ${APU_A}`;
    } catch {
      negBlockedPct = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_tool_neg');
    }
    return { ok: Number(ok!.default_tool_pct) === 0.05, highBlocked, negBlockedPct };
  });
  check('apu: default_tool_pct = 0.05 aceptado', toolPct.ok);
  check('apu: default_tool_pct > 1 bloqueado (CHECK rango)', toolPct.highBlocked);
  check('apu: default_tool_pct negativo bloqueado (CHECK rango)', toolPct.negBlockedPct);

  // 19h) RLS ENABLE + FORCE conservado en las tablas APU tras las migraciones.
  const apuForce = await sql<{ relname: string; rls: boolean; force: boolean }[]>`
    SELECT relname, relrowsecurity AS rls, relforcerowsecurity AS force
    FROM pg_class
    WHERE relname IN ('apu_templates', 'apu_components', 'labor_roles')`;
  check('apu: RLS ENABLE+FORCE conservado (apu_templates/apu_components/labor_roles)',
    apuForce.length === 3 && apuForce.every((r) => r.rls && r.force),
    JSON.stringify(apuForce));

  // === 20) PRICE REVIEW CENTER (V1) — batches, bulk actions e import_batch_id ===
  console.log('\n[20] Review center — lotes, acciones masivas, idempotencia y compat');
  const DIGEST_64 = 'a'.repeat(64);

  // 20a) Admin A crea batch; imported_by server-side; lo ve.
  const batchCreate = await asUser(realA, async (q) => {
    const [b] = await q<{ id: string; organization_id: string; imported_by: string }[]>`
      INSERT INTO price_observation_batches
        (organization_id, source_type, digest_sha256, label, imported_by, total_rows)
      VALUES (${ORG_A}, 'supplier_csv', ${DIGEST_64}, 'Lote harness A', ${USER_A_ADMIN}, 3)
      RETURNING id, organization_id, imported_by`;
    const seen = await q<{ id: string }[]>`
      SELECT id FROM price_observation_batches WHERE id = ${b!.id}`;
    return { row: b!, visible: seen.length === 1 };
  });
  check('review: admin A crea batch en su org', batchCreate.row.organization_id === ORG_A);
  check('review: imported_by = autor server-side', batchCreate.row.imported_by === USER_A_ADMIN);
  check('review: el autor ve su batch (SELECT propio)', batchCreate.visible);

  // 20b) B NO ve batches de A (aislamiento) y NO puede crear batch en org A.
  const BATCH_A_SEED = '00000000-0000-0000-0000-00000000f101';
  const batchIso = await asUser(
    claimsB,
    async (q) => {
      const aRows = await q<{ id: string }[]>`
        SELECT id FROM price_observation_batches WHERE organization_id = ${ORG_A}`;
      let crossBlocked = false;
      await q.unsafe('SAVEPOINT sp_pob_cross');
      try {
        await q`INSERT INTO price_observation_batches
          (organization_id, source_type, digest_sha256, imported_by, total_rows)
          VALUES (${ORG_A}, 'manual', ${DIGEST_64}, ${USER_B_ADMIN}, 1)`;
      } catch {
        crossBlocked = true;
        await q.unsafe('ROLLBACK TO SAVEPOINT sp_pob_cross');
      }
      return { aRows: aRows.length, crossBlocked };
    },
    async (q) => {
      await q`INSERT INTO price_observation_batches
        (id, organization_id, source_type, digest_sha256, label, imported_by, total_rows)
        VALUES (${BATCH_A_SEED}, ${ORG_A}, 'manual', ${DIGEST_64}, 'Lote seed A', ${USER_A_ADMIN}, 1)
        ON CONFLICT (id) DO NOTHING`;
    },
  );
  check('review: B NO ve batches de A (aislamiento SELECT)', batchIso.aRows === 0, `n=${batchIso.aRows}`);
  check('review: INSERT de batch cross-org bloqueado (WITH CHECK)', batchIso.crossBlocked);

  // 20c) Rol obra (site) NO crea batches.
  let batchRoleBlocked = false;
  await asUser(realAObra, async (q) => {
    await q.unsafe('SAVEPOINT sp_pob_role');
    try {
      await q`INSERT INTO price_observation_batches
        (organization_id, source_type, digest_sha256, imported_by, total_rows)
        VALUES (${ORG_A}, 'manual', ${DIGEST_64}, ${USER_A_OBRA}, 1)`;
    } catch {
      batchRoleBlocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_pob_role');
    }
  });
  check('review: rol obra NO crea batches (gate de rol)', batchRoleBlocked);

  // 20d) Batch inmutable: UPDATE y DELETE denegados (sin política) incluso para
  // admin. El batch se siembra en el setup de ESTA transacción (asUser revierte).
  const seedBatchA = async (q: postgres.ReservedSql): Promise<void> => {
    await q`INSERT INTO price_observation_batches
      (id, organization_id, source_type, digest_sha256, label, imported_by, total_rows)
      VALUES (${BATCH_A_SEED}, ${ORG_A}, 'manual', ${DIGEST_64}, 'Lote seed A', ${USER_A_ADMIN}, 1)
      ON CONFLICT (id) DO NOTHING`;
  };
  const batchImmutable = await asUser(
    realA,
    async (q) => {
      const visible = await q<{ id: string }[]>`
        SELECT id FROM price_observation_batches WHERE id = ${BATCH_A_SEED}`;
      const upd = await q`UPDATE price_observation_batches SET label = 'mutado' WHERE id = ${BATCH_A_SEED}`;
      const del = await q`DELETE FROM price_observation_batches WHERE id = ${BATCH_A_SEED}`;
      return { exists: visible.length === 1, updates: upd.count, deletes: del.count };
    },
    seedBatchA,
  );
  check('review: batch seed visible antes de probar inmutabilidad', batchImmutable.exists);
  check('review: UPDATE de batch denegado (procedencia inmutable)', batchImmutable.updates === 0, `upd=${batchImmutable.updates}`);
  check('review: DELETE de batch denegado', batchImmutable.deletes === 0, `del=${batchImmutable.deletes}`);

  // 20e) Observación con import_batch_id de la MISMA org: FK válida, insertable.
  const obsWithBatch = await asUser(
    realA,
    async (q) => {
      const [o] = await q<{ id: string; import_batch_id: string | null }[]>`
        INSERT INTO resource_price_observations
          (organization_id, resource_id, observed_price, discount_percent, suggested_net_price,
           unit, currency, source_type, observed_at, status, created_by, import_batch_id)
        VALUES (${ORG_A}, ${RES_A}, 50000, 0, 0, 'und', 'COP', 'supplier_csv', now(), 'pending',
                ${USER_A_ADMIN}, ${BATCH_A_SEED})
        RETURNING id, import_batch_id`;
      return o!;
    },
    seedBatchA,
  );
  check('review: observación vinculada a batch de su org (FK válida)', obsWithBatch.import_batch_id === BATCH_A_SEED);

  // 20f) Observación apuntando a batch de OTRA org bloqueada (trigger same-org).
  const BATCH_B_SEED = '00000000-0000-0000-0000-00000000f102';
  let obsCrossBatchBlocked = false;
  await asUser(
    realA,
    async (q) => {
      await q.unsafe('SAVEPOINT sp_rpo_xbatch');
      try {
        await q`INSERT INTO resource_price_observations
          (organization_id, resource_id, observed_price, discount_percent, suggested_net_price,
           unit, currency, source_type, observed_at, status, created_by, import_batch_id)
          VALUES (${ORG_A}, ${RES_A}, 50000, 0, 0, 'und', 'COP', 'supplier_csv', now(), 'pending',
                  ${USER_A_ADMIN}, ${BATCH_B_SEED})`;
      } catch {
        obsCrossBatchBlocked = true;
        await q.unsafe('ROLLBACK TO SAVEPOINT sp_rpo_xbatch');
      }
    },
    async (q) => {
      await q`INSERT INTO price_observation_batches
        (id, organization_id, source_type, digest_sha256, imported_by, total_rows)
        VALUES (${BATCH_B_SEED}, ${ORG_B}, 'manual', ${DIGEST_64}, ${USER_B_ADMIN}, 1)
        ON CONFLICT (id) DO NOTHING`;
    },
  );
  check('review: batch de otra org bloqueado (trigger same-org)', obsCrossBatchBlocked);

  // 20g) Compatibilidad retroactiva: observación SIN batch sigue siendo
  // legible y aprobable (UPDATE de revisión solo toca filas pending).
  const obsLegacy = await asUser(realA, async (q) => {
    const [o] = await q<{ id: string }[]>`
      INSERT INTO resource_price_observations
        (organization_id, resource_id, observed_price, discount_percent, suggested_net_price,
         unit, currency, source_type, observed_at, status, created_by)
      VALUES (${ORG_A}, ${RES_A}, 70000, 0, 0, 'und', 'COP', 'manual', now(), 'pending', ${USER_A_ADMIN})
      RETURNING id`;
    const [{ approved }] = await q<{ approved: number }[]>`
      WITH upd AS (
        UPDATE resource_price_observations
        SET status = 'approved', approved_by = ${USER_A_ADMIN}, approved_at = now()
        WHERE id = ${o!.id} AND status = 'pending'
        RETURNING 1
      ) SELECT count(*)::int AS approved FROM upd`;
    return { approved };
  });
  check('review: observación histórica sin batch aprobable (compat)', obsLegacy.approved === 1);

  // 20h) UPDATE masivo solo toca pending: approved NO se sobrescribe.
  const bulkOnlyPending = await asUser(realA, async (q) => {
    const [p] = await q<{ id: string }[]>`
      INSERT INTO resource_price_observations
        (organization_id, resource_id, observed_price, discount_percent, suggested_net_price,
         unit, currency, source_type, observed_at, status, created_by)
      VALUES (${ORG_A}, ${RES_A}, 1000, 0, 0, 'und', 'COP', 'manual', now(), 'pending', ${USER_A_ADMIN})
      RETURNING id`;
    const [a] = await q<{ id: string }[]>`
      INSERT INTO resource_price_observations
        (organization_id, resource_id, observed_price, discount_percent, suggested_net_price,
         unit, currency, source_type, observed_at, status, created_by, approved_by, approved_at)
      VALUES (${ORG_A}, ${RES_A}, 2000, 0, 0, 'und', 'COP', 'manual', now(), 'approved',
              ${USER_A_ADMIN}, ${USER_A_ADMIN}, now())
      RETURNING id`;
    const upd = await q`
      UPDATE resource_price_observations
      SET status = 'approved', approved_by = ${USER_A_ADMIN}, approved_at = now()
      WHERE organization_id = ${ORG_A} AND status = 'pending'
        AND id IN (${p!.id}, ${a!.id})`;
    return { updated: upd.count };
  });
  check('review: UPDATE masivo solo afecta pending (approved se omite)', bulkOnlyPending.updated === 1, `n=${bulkOnlyPending.updated}`);

  // 20i) Cross-org: A NO puede aprobar observaciones de B (0 filas).
  const OBS_B_SEED = '00000000-0000-0000-0000-00000000f103';
  const crossApprove = await asUser(
    realA,
    async (q) => {
      const upd = await q`
        UPDATE resource_price_observations
        SET status = 'approved', approved_by = ${USER_A_ADMIN}, approved_at = now()
        WHERE id = ${OBS_B_SEED} AND status = 'pending'`;
      return upd.count;
    },
    async (q) => {
      await q`INSERT INTO resources (id, organization_id, code, name, resource_type, unit)
        VALUES ('00000000-0000-0000-0000-00000000f104', ${ORG_B}, 'RB-001', 'Recurso B', 'material', 'und')
        ON CONFLICT (id) DO NOTHING`;
      await q`INSERT INTO resource_price_observations
        (id, organization_id, resource_id, observed_price, discount_percent, suggested_net_price,
         unit, currency, source_type, observed_at, status, created_by)
        VALUES (${OBS_B_SEED}, ${ORG_B}, '00000000-0000-0000-0000-00000000f104', 3000, 0, 0,
                'und', 'COP', 'manual', now(), 'pending', ${USER_B_ADMIN})
        ON CONFLICT (id) DO NOTHING`;
    },
  );
  check('review: aprobación masiva cross-org bloqueada (0 filas)', crossApprove === 0, `n=${crossApprove}`);

  // 20j) Bulk action: admin A crea registro auditado; initiated_by server-side.
  const bulkAction = await asUser(realA, async (q) => {
    const [r] = await q<{ id: string; organization_id: string; initiated_by: string }[]>`
      INSERT INTO price_observation_bulk_actions
        (organization_id, action_type, initiated_by, selected_count, idempotency_key, metadata)
      VALUES (${ORG_A}, 'approve', ${USER_A_ADMIN}, 5, 'harness-20j', '{"selectedIds":[]}')
      RETURNING id, organization_id, initiated_by`;
    const [{ upd }] = await q<{ upd: number }[]>`
      WITH u AS (
        UPDATE price_observation_bulk_actions
        SET succeeded_count = 4, skipped_count = 1
        WHERE id = ${r!.id} RETURNING 1
      ) SELECT count(*)::int AS upd FROM u`;
    const del = await q`DELETE FROM price_observation_bulk_actions WHERE id = ${r!.id}`;
    return { row: r!, counterUpdated: upd === 1, deletes: del.count };
  });
  check('review: bulk action creada con initiated_by server-side', bulkAction.row.initiated_by === USER_A_ADMIN);
  check('review: contadores de bulk action actualizables por el revisor', bulkAction.counterUpdated);
  check('review: DELETE de bulk action denegado (auditoría inmutable)', bulkAction.deletes === 0, `del=${bulkAction.deletes}`);

  // 20k) Idempotencia: misma (org, idempotency_key) bloqueada (UNIQUE).
  let bulkIdemBlocked = false;
  await asUser(realA, async (q) => {
    await q`INSERT INTO price_observation_bulk_actions
      (organization_id, action_type, initiated_by, selected_count, idempotency_key)
      VALUES (${ORG_A}, 'approve', ${USER_A_ADMIN}, 1, 'harness-20k')`;
    await q.unsafe('SAVEPOINT sp_poba_idem');
    try {
      await q`INSERT INTO price_observation_bulk_actions
        (organization_id, action_type, initiated_by, selected_count, idempotency_key)
        VALUES (${ORG_A}, 'reject', ${USER_A_ADMIN}, 1, 'harness-20k')`;
    } catch {
      bulkIdemBlocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_poba_idem');
    }
  });
  check('review: idempotency_key duplicada por org bloqueada (UNIQUE)', bulkIdemBlocked);

  // 20l) Rol obra NO crea bulk actions (solo admin/gerencia).
  let bulkRoleBlocked = false;
  await asUser(realAObra, async (q) => {
    await q.unsafe('SAVEPOINT sp_poba_role');
    try {
      await q`INSERT INTO price_observation_bulk_actions
        (organization_id, action_type, initiated_by, selected_count, idempotency_key)
        VALUES (${ORG_A}, 'approve', ${USER_A_OBRA}, 1, 'harness-20l')`;
    } catch {
      bulkRoleBlocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_poba_role');
    }
  });
  check('review: rol obra NO crea bulk actions (solo admin/gerencia)', bulkRoleBlocked);

  // 20m) B NO ve bulk actions de A.
  const bulkIso = await asUser(
    claimsB,
    async (q) => {
      const rows = await q<{ id: string }[]>`
        SELECT id FROM price_observation_bulk_actions WHERE organization_id = ${ORG_A}`;
      return rows.length;
    },
    async (q) => {
      await q`INSERT INTO price_observation_bulk_actions
        (id, organization_id, action_type, initiated_by, selected_count, idempotency_key)
        VALUES ('00000000-0000-0000-0000-00000000f105', ${ORG_A}, 'approve', ${USER_A_ADMIN}, 1, 'harness-20m')
        ON CONFLICT (id) DO NOTHING`;
    },
  );
  check('review: B NO ve bulk actions de A (aislamiento SELECT)', bulkIso === 0, `n=${bulkIso}`);

  // 20n) RLS ENABLE + FORCE conservado en las tablas nuevas.
  const reviewForce = await sql<{ relname: string; rls: boolean; force: boolean }[]>`
    SELECT relname, relrowsecurity AS rls, relforcerowsecurity AS force
    FROM pg_class
    WHERE relname IN ('price_observation_batches', 'price_observation_bulk_actions')`;
  check('review: RLS ENABLE+FORCE en batches y bulk_actions',
    reviewForce.length === 2 && reviewForce.every((r) => r.rls && r.force),
    JSON.stringify(reviewForce));

  // ===========================================================================
  // 21) ENTRE_PATIOS_APU_IMPORT_V1 — apu_import_batches + RPC import_apu_batch.
  // ===========================================================================
  console.log('\n=== 21) APU import batches (ENTRE_PATIOS_APU_IMPORT_V1) ===');

  const DIGEST_A = 'a'.repeat(64);
  const DIGEST_B = 'b'.repeat(64);
  const DIGEST_C = 'c'.repeat(64);
  const DIGEST_D = 'd'.repeat(64);
  const DIGEST_E = 'e'.repeat(64);

  // 21a) Batch tenant-scoped: admin A crea con imported_by = identidad real.
  const apuBatch = await asUser(realA, async (q) => {
    const [row] = await q<{ id: string; organization_id: string; imported_by: string }[]>`
      INSERT INTO apu_import_batches
        (organization_id, digest_sha256, source_filename, source_sheet, imported_by)
      VALUES (${ORG_A}, ${DIGEST_A}, 'harness.xlsx', 'APU', ${USER_A_ADMIN})
      RETURNING id, organization_id, imported_by`;
    // 21d) Inmutable: UPDATE/DELETE sin política ⇒ 0 filas.
    const upd = await q`UPDATE apu_import_batches SET warning_count = 99 WHERE id = ${row!.id}`;
    const del = await q`DELETE FROM apu_import_batches WHERE id = ${row!.id}`;
    // imported_by ajeno ⇒ WITH CHECK bloquea.
    let spoofBlocked = false;
    await q.unsafe('SAVEPOINT sp_aib_spoof');
    try {
      await q`INSERT INTO apu_import_batches
        (organization_id, digest_sha256, source_filename, source_sheet, imported_by)
        VALUES (${ORG_A}, ${DIGEST_B}, 'harness.xlsx', 'APU', ${USER_B_ADMIN})`;
    } catch {
      spoofBlocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_aib_spoof');
    }
    return { row: row!, upd: upd.count, del: del.count, spoofBlocked };
  });
  check('apu-import: admin A crea batch con imported_by = identidad real', apuBatch.row.imported_by === USER_A_ADMIN);
  check('apu-import: batch INMUTABLE (UPDATE denegado, 0 filas)', apuBatch.upd === 0, `upd=${apuBatch.upd}`);
  check('apu-import: batch INMUTABLE (DELETE denegado, 0 filas)', apuBatch.del === 0, `del=${apuBatch.del}`);
  check('apu-import: imported_by ajeno bloqueado (WITH CHECK)', apuBatch.spoofBlocked);

  // 21b) Rol obra NO crea batches (solo admin/gerencia).
  let apuRoleBlocked = false;
  await asUser(realAObra, async (q) => {
    await q.unsafe('SAVEPOINT sp_aib_role');
    try {
      await q`INSERT INTO apu_import_batches
        (organization_id, digest_sha256, source_filename, source_sheet, imported_by)
        VALUES (${ORG_A}, ${DIGEST_B}, 'harness.xlsx', 'APU', ${USER_A_OBRA})`;
    } catch {
      apuRoleBlocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_aib_role');
    }
  });
  check('apu-import: rol obra NO crea batches (solo admin/gerencia)', apuRoleBlocked);

  // 21c) B NO ve batches de A (aislamiento SELECT).
  const APU_BATCH_A_SEED = '00000000-0000-0000-0000-00000000f201';
  const apuIso = await asUser(
    claimsB,
    async (q) => {
      const rows = await q<{ id: string }[]>`
        SELECT id FROM apu_import_batches WHERE organization_id = ${ORG_A}`;
      return rows.length;
    },
    async (q) => {
      await q`INSERT INTO apu_import_batches
        (id, organization_id, digest_sha256, source_filename, source_sheet, imported_by)
        VALUES (${APU_BATCH_A_SEED}, ${ORG_A}, ${DIGEST_C}, 'harness.xlsx', 'APU', ${USER_A_ADMIN})
        ON CONFLICT (id) DO NOTHING`;
    },
  );
  check('apu-import: B NO ve batches de A (aislamiento SELECT)', apuIso === 0, `n=${apuIso}`);

  // 21e) Idempotencia estructural: digest duplicado por org bloqueado (UNIQUE);
  //      el MISMO digest en otra org SÍ es válido.
  const apuIdem = await asUser(realA, async (q) => {
    await q`INSERT INTO apu_import_batches
      (organization_id, digest_sha256, source_filename, source_sheet, imported_by)
      VALUES (${ORG_A}, ${DIGEST_D}, 'harness.xlsx', 'APU', ${USER_A_ADMIN})`;
    let blocked = false;
    await q.unsafe('SAVEPOINT sp_aib_idem');
    try {
      await q`INSERT INTO apu_import_batches
        (organization_id, digest_sha256, source_filename, source_sheet, imported_by)
        VALUES (${ORG_A}, ${DIGEST_D}, 'otro.xlsx', 'APU', ${USER_A_ADMIN})`;
    } catch {
      blocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_aib_idem');
    }
    return blocked;
  });
  check('apu-import: digest duplicado por org bloqueado (UNIQUE org+digest)', apuIdem);
  const apuIdemOtherOrg = await asUser(claimsB, async (q) => {
    const [row] = await q<{ id: string }[]>`
      INSERT INTO apu_import_batches
        (organization_id, digest_sha256, source_filename, source_sheet, imported_by)
      VALUES (${ORG_B}, ${DIGEST_C}, 'harness-b.xlsx', 'APU', ${USER_B_ADMIN})
      RETURNING id`;
    return row !== undefined;
  }, async (q) => {
    await q`INSERT INTO apu_import_batches
      (id, organization_id, digest_sha256, source_filename, source_sheet, imported_by)
      VALUES (${APU_BATCH_A_SEED}, ${ORG_A}, ${DIGEST_C}, 'harness.xlsx', 'APU', ${USER_A_ADMIN})
      ON CONFLICT (id) DO NOTHING`;
  });
  check('apu-import: mismo digest en OTRA org permitido (aislamiento real)', apuIdemOtherOrg);

  // 21f) Trigger same-org: template de A NO puede referenciar batch de B.
  let apuCrossBatchBlocked = false;
  await asUser(
    realA,
    async (q) => {
      await q.unsafe('SAVEPOINT sp_aib_cross');
      try {
        await q`INSERT INTO apu_templates
          (organization_id, code, name, unit, import_batch_id)
          VALUES (${ORG_A}, 'HARN-X1', 'Cross batch', 'm2', '00000000-0000-0000-0000-00000000f202')`;
      } catch {
        apuCrossBatchBlocked = true;
        await q.unsafe('ROLLBACK TO SAVEPOINT sp_aib_cross');
      }
    },
    async (q) => {
      await q`INSERT INTO apu_import_batches
        (id, organization_id, digest_sha256, source_filename, source_sheet, imported_by)
        VALUES ('00000000-0000-0000-0000-00000000f202', ${ORG_B}, ${DIGEST_E}, 'b.xlsx', 'APU', ${USER_B_ADMIN})
        ON CONFLICT (id) DO NOTHING`;
    },
  );
  check('apu-import: trigger same-org bloquea batch de otra org en apu_templates', apuCrossBatchBlocked);

  // 21g) RPC import_apu_batch: atómica, recalcula server-side, idempotente.
  const apuRpcBatch = {
    digestSha256: 'f'.repeat(64),
    sourceFilename: 'harness.xlsx',
    sourceSheet: 'APU',
    totalActivities: 1,
    totalComponents: 2,
    unresolvedCount: 0,
    warningCount: 0,
    metadata: { kind: 'harness' },
  };
  const apuRpcTemplates = [
    {
      code: 'HARN-APU-01',
      name: 'Actividad harness',
      unit: 'm2',
      description: null,
      defaultToolPct: '0.35',
      sourceRow: 36,
      sourceOccurrenceIndex: 1,
      components: [
        {
          componentType: 'material',
          resourceId: null,
          laborRoleId: null,
          quantity: '0.1',
          wastePct: '0.1',
          unitPriceSource: 'manual',
          unitPriceSnapshot: '31827',
          sortOrder: 0,
          notes: null,
          sourceRow: 37,
          sourceOccurrenceIndex: 1,
          rawCode: 'Insumo',
          rawUnit: 'Un',
        },
        {
          componentType: 'tool',
          resourceId: null,
          laborRoleId: null,
          quantity: '1',
          wastePct: '0',
          unitPriceSource: 'manual',
          unitPriceSnapshot: '100',
          sortOrder: 1,
          notes: null,
          sourceRow: 38,
          sourceOccurrenceIndex: 1,
          rawCode: 'Herramienta',
          rawUnit: 'Gbl',
        },
      ],
    },
  ];
  const apuRpc = await asUser(realA, async (q) => {
    const [{ res }] = await q<{ res: { duplicate: boolean; batchId: string; importedActivities: number; importedComponents: number; skippedExisting: number } }[]>`
      SELECT public.import_apu_batch(${sql.json(apuRpcBatch)}, ${sql.json(apuRpcTemplates)}, NULL, '[]'::jsonb) AS res`;
    const comp = await q<{ total: string; raw_code: string | null; raw_unit: string | null; source_row: number | null }[]>`
      SELECT c.total_component_cost AS total, c.raw_code, c.raw_unit, c.source_row
      FROM apu_components c JOIN apu_templates t ON t.id = c.apu_template_id
      WHERE t.organization_id = ${ORG_A} AND t.code = 'HARN-APU-01' AND c.sort_order = 0`;
    const [tpl] = await q<{ default_tool_pct: string; import_batch_id: string | null; source_row: number | null }[]>`
      SELECT default_tool_pct, import_batch_id, source_row
      FROM apu_templates WHERE organization_id = ${ORG_A} AND code = 'HARN-APU-01'`;
    // Segunda llamada con el MISMO digest ⇒ duplicate, nada nuevo.
    const [{ res: res2 }] = await q<{ res: { duplicate: boolean; importedActivities: number } }[]>`
      SELECT public.import_apu_batch(${sql.json(apuRpcBatch)}, ${sql.json(apuRpcTemplates)}, NULL, '[]'::jsonb) AS res`;
    // Tercera llamada: digest distinto pero MISMO code ⇒ skipped_existing (no sobrescribe).
    const batch3 = { ...apuRpcBatch, digestSha256: '9'.repeat(64) };
    const [{ res: res3 }] = await q<{ res: { duplicate: boolean; importedActivities: number; skippedExisting: number } }[]>`
      SELECT public.import_apu_batch(${sql.json(batch3)}, ${sql.json(apuRpcTemplates)}, NULL, '[]'::jsonb) AS res`;
    const [{ n: tplCount }] = await q<{ n: number }[]>`
      SELECT count(*)::int AS n FROM apu_templates WHERE organization_id = ${ORG_A} AND code = 'HARN-APU-01'`;
    return { res, res2, res3, comp: comp[0]!, tpl: tpl!, tplCount };
  });
  check('apu-import RPC: crea batch + template + componentes', !apuRpc.res.duplicate && apuRpc.res.importedActivities === 1 && apuRpc.res.importedComponents === 2, JSON.stringify(apuRpc.res));
  check('apu-import RPC: total recalculado server-side (0.1×1.1×31827 = 3500.97)', Number(apuRpc.comp.total) === 3500.97, `total=${apuRpc.comp.total}`);
  check('apu-import RPC: raw values + source_row preservados', apuRpc.comp.raw_code === 'Insumo' && apuRpc.comp.raw_unit === 'Un' && apuRpc.comp.source_row === 37, JSON.stringify(apuRpc.comp));
  check('apu-import RPC: default_tool_pct + provenance en template', Number(apuRpc.tpl.default_tool_pct) === 0.35 && apuRpc.tpl.import_batch_id !== null && apuRpc.tpl.source_row === 36, JSON.stringify(apuRpc.tpl));
  check('apu-import RPC: mismo digest ⇒ duplicate (idempotente, sin re-importar)', apuRpc.res2.duplicate === true && apuRpc.res2.importedActivities === 1);
  check('apu-import RPC: código existente ⇒ skipped (no sobrescribe)', apuRpc.res3.duplicate === false && apuRpc.res3.importedActivities === 0 && apuRpc.res3.skippedExisting === 1, JSON.stringify(apuRpc.res3));
  check('apu-import RPC: una sola plantilla con ese código (sin duplicados)', apuRpc.tplCount === 1, `n=${apuRpc.tplCount}`);

  // 21h) RPC sin sesión ⇒ abortada (no_session).
  let apuRpcNoSession = false;
  try {
    await asUser(noSession, async (q) => {
      await q`SELECT public.import_apu_batch(${sql.json(apuRpcBatch)}, '[]'::jsonb, NULL, '[]'::jsonb)`;
    });
  } catch {
    apuRpcNoSession = true;
  }
  check('apu-import RPC: sin sesión ⇒ abortada (no_session)', apuRpcNoSession);

  // 21i) Linking BOQ: exacto vincula una vez; existente NO se reemplaza;
  //      versión emitida ⇒ version_locked.
  const apuLink = await asUser(realA, async (q) => {
    const [{ id: estId }] = await q<{ id: string }[]>`
      SELECT id FROM public.create_estimate_with_initial_version(${SCOPE_A}, 'APULNK', 'ApuLink', NULL)`;
    const [{ vid }] = await q<{ vid: string }[]>`
      SELECT id AS vid FROM estimate_versions WHERE estimate_id = ${estId} ORDER BY version_number DESC LIMIT 1`;
    const [{ chid }] = await q<{ chid: string }[]>`
      INSERT INTO chapters (estimate_version_id, code, name, sort_order)
      VALUES (${vid}, 'C1', 'Cap', 0) RETURNING id AS chid`;
    const [{ bid }] = await q<{ bid: string }[]>`
      INSERT INTO boq_items (estimate_version_id, chapter_id, code, description_snapshot, unit_snapshot,
        quantity_snapshot, unit_price_snapshot, subtotal, sort_order)
      VALUES (${vid}, ${chid}, '1.01', 'Demolición harness', 'M²', 10, 100, 0, 0)
      RETURNING id AS bid`;

    const linkBatch = { ...apuRpcBatch, digestSha256: '8'.repeat(64) };
    const linkTemplates = [{ ...apuRpcTemplates[0]!, code: 'HARN-APU-LNK' }];
    const links = [{ templateCode: 'HARN-APU-LNK', boqItemId: bid }];
    const [{ res }] = await q<{ res: { linkedBoqItems: number } }[]>`
      SELECT public.import_apu_batch(${sql.json(linkBatch)}, ${sql.json(linkTemplates)}, ${vid}, ${sql.json(links)}) AS res`;
    const [item] = await q<{ apu_template_id: string | null; quantity_snapshot: string; subtotal: string }[]>`
      SELECT apu_template_id, quantity_snapshot, subtotal FROM boq_items WHERE id = ${bid}`;

    // Re-link con OTRA plantilla ⇒ apu_template_id existente NO se reemplaza.
    const linkBatch2 = { ...apuRpcBatch, digestSha256: '7'.repeat(64) };
    const linkTemplates2 = [{ ...apuRpcTemplates[0]!, code: 'HARN-APU-LNK2' }];
    const links2 = [{ templateCode: 'HARN-APU-LNK2', boqItemId: bid }];
    const [{ res: res2 }] = await q<{ res: { linkedBoqItems: number } }[]>`
      SELECT public.import_apu_batch(${sql.json(linkBatch2)}, ${sql.json(linkTemplates2)}, ${vid}, ${sql.json(links2)}) AS res`;
    const [itemAfter] = await q<{ apu_template_id: string | null }[]>`
      SELECT apu_template_id FROM boq_items WHERE id = ${bid}`;
    return { res, res2, item: item!, itemAfter: itemAfter!, vid, bid };
  });
  check('apu-import linking: exacto y único vincula (1 ítem)', apuLink.res.linkedBoqItems === 1, JSON.stringify(apuLink.res));
  check('apu-import linking: cantidades/subtotal del BOQ intactos', Number(apuLink.item.quantity_snapshot) === 10 && Number(apuLink.item.subtotal) === 1000, JSON.stringify(apuLink.item));
  check('apu-import linking: vínculo existente NO se reemplaza (0 filas)', apuLink.res2.linkedBoqItems === 0 && apuLink.itemAfter.apu_template_id === apuLink.item.apu_template_id);

  // Versión emitida ⇒ version_locked (sin importar nada).
  let apuLinkLocked = false;
  try {
    await asUser(
      realA,
      async (q) => {
        const linkBatch = { ...apuRpcBatch, digestSha256: '6'.repeat(64) };
        await q`SELECT public.import_apu_batch(${sql.json(linkBatch)}, '[]'::jsonb, '00000000-0000-0000-0000-00000000f203', '[]'::jsonb)`;
      },
      async (q) => {
        await q`INSERT INTO estimates (id, project_scope_id, code, name, status)
                VALUES ('00000000-0000-0000-0000-00000000f204', ${SCOPE_A}, 'APULCK', 'ApuLock', 'active')
                ON CONFLICT (id) DO NOTHING`;
        await q`INSERT INTO estimate_versions (id, estimate_id, version_number, status)
                VALUES ('00000000-0000-0000-0000-00000000f203', '00000000-0000-0000-0000-00000000f204', 1, 'issued')
                ON CONFLICT (id) DO NOTHING`;
      },
    );
  } catch {
    apuLinkLocked = true;
  }
  check('apu-import linking: versión emitida ⇒ version_locked (abortada)', apuLinkLocked);

  // 21j) RLS ENABLE + FORCE en la tabla nueva.
  const apuImportForce = await sql<{ relname: string; rls: boolean; force: boolean }[]>`
    SELECT relname, relrowsecurity AS rls, relforcerowsecurity AS force
    FROM pg_class
    WHERE relname = 'apu_import_batches'`;
  check('apu-import: RLS ENABLE+FORCE en apu_import_batches',
    apuImportForce.length === 1 && apuImportForce.every((r) => r.rls && r.force),
    JSON.stringify(apuImportForce));

  // ===========================================================================
  // 22) QUANTITY_TAKEOFF_IMPORT_V1 — quantity_import_batches/takeoff_groups/
  //     takeoff_lines + RPC import_quantity_takeoff_batch.
  // ===========================================================================
  console.log('\n=== 22) Quantity takeoff import (QUANTITY_TAKEOFF_IMPORT_V1) ===');

  const QDIG_A = '1a'.repeat(32);
  const QDIG_B = '1b'.repeat(32);
  const QDIG_C = '1c'.repeat(32);
  const QDIG_D = '1d'.repeat(32);
  const QDIG_E = '1e'.repeat(32);

  // 22a) Batch tenant-scoped: admin A crea con imported_by = identidad real;
  //      inmutable (UPDATE/DELETE sin política); imported_by ajeno bloqueado.
  const qtyBatch = await asUser(realA, async (q) => {
    const [row] = await q<{ id: string; imported_by: string }[]>`
      INSERT INTO quantity_import_batches
        (organization_id, digest_sha256, source_filename, source_sheet, imported_by)
      VALUES (${ORG_A}, ${QDIG_A}, 'harness.xlsx', 'CANTIDADES 1 PISO', ${USER_A_ADMIN})
      RETURNING id, imported_by`;
    const upd = await q`UPDATE quantity_import_batches SET warning_count = 99 WHERE id = ${row!.id}`;
    const del = await q`DELETE FROM quantity_import_batches WHERE id = ${row!.id}`;
    let spoofBlocked = false;
    await q.unsafe('SAVEPOINT sp_qib_spoof');
    try {
      await q`INSERT INTO quantity_import_batches
        (organization_id, digest_sha256, source_filename, source_sheet, imported_by)
        VALUES (${ORG_A}, ${QDIG_B}, 'harness.xlsx', 'CANTIDADES 1 PISO', ${USER_B_ADMIN})`;
    } catch {
      spoofBlocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_qib_spoof');
    }
    return { row: row!, upd: upd.count, del: del.count, spoofBlocked };
  });
  check('qty-import: admin A crea batch con imported_by = identidad real', qtyBatch.row.imported_by === USER_A_ADMIN);
  check('qty-import: batch INMUTABLE (UPDATE denegado, 0 filas)', qtyBatch.upd === 0, `upd=${qtyBatch.upd}`);
  check('qty-import: batch INMUTABLE (DELETE denegado, 0 filas)', qtyBatch.del === 0, `del=${qtyBatch.del}`);
  check('qty-import: imported_by ajeno bloqueado (WITH CHECK)', qtyBatch.spoofBlocked);

  // 22b) Rol obra NO crea batches ni grupos (solo admin/gerencia).
  let qtyRoleBlocked = false;
  let qtyGroupRoleBlocked = false;
  await asUser(realAObra, async (q) => {
    await q.unsafe('SAVEPOINT sp_qib_role');
    try {
      await q`INSERT INTO quantity_import_batches
        (organization_id, digest_sha256, source_filename, source_sheet, imported_by)
        VALUES (${ORG_A}, ${QDIG_B}, 'harness.xlsx', 'CANTIDADES 1 PISO', ${USER_A_OBRA})`;
    } catch {
      qtyRoleBlocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_qib_role');
    }
    await q.unsafe('SAVEPOINT sp_qtg_role');
    try {
      await q`INSERT INTO quantity_takeoff_groups
        (organization_id, description, source_row)
        VALUES (${ORG_A}, 'Grupo obra', 10)`;
    } catch {
      qtyGroupRoleBlocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_qtg_role');
    }
  });
  check('qty-import: rol obra NO crea batches (solo admin/gerencia)', qtyRoleBlocked);
  check('qty-import: rol obra NO crea grupos (solo admin/gerencia)', qtyGroupRoleBlocked);

  // 22c) B NO ve batches ni grupos de A (aislamiento SELECT).
  const QTY_BATCH_A_SEED = '00000000-0000-0000-0000-00000000f301';
  const qtyIso = await asUser(
    claimsB,
    async (q) => {
      const batches = await q<{ id: string }[]>`
        SELECT id FROM quantity_import_batches WHERE organization_id = ${ORG_A}`;
      const groups = await q<{ id: string }[]>`
        SELECT id FROM quantity_takeoff_groups WHERE organization_id = ${ORG_A}`;
      const lines = await q<{ id: string }[]>`
        SELECT id FROM quantity_takeoff_lines WHERE organization_id = ${ORG_A}`;
      return batches.length + groups.length + lines.length;
    },
    async (q) => {
      await q`INSERT INTO quantity_import_batches
        (id, organization_id, digest_sha256, source_filename, source_sheet, imported_by)
        VALUES (${QTY_BATCH_A_SEED}, ${ORG_A}, ${QDIG_C}, 'harness.xlsx', 'CANTIDADES 1 PISO', ${USER_A_ADMIN})
        ON CONFLICT (id) DO NOTHING`;
      await q`INSERT INTO quantity_takeoff_groups
        (id, organization_id, import_batch_id, description, source_row)
        VALUES ('00000000-0000-0000-0000-00000000f302', ${ORG_A}, ${QTY_BATCH_A_SEED}, 'Grupo harness', 14)
        ON CONFLICT (id) DO NOTHING`;
      await q`INSERT INTO quantity_takeoff_lines
        (id, organization_id, group_id, formula_type, source_row, subtotal_calculated)
        VALUES ('00000000-0000-0000-0000-00000000f303', ${ORG_A}, '00000000-0000-0000-0000-00000000f302', 'length_height_count', 14, 10.08)
        ON CONFLICT (id) DO NOTHING`;
    },
  );
  check('qty-import: B NO ve batches/grupos/líneas de A (aislamiento SELECT)', qtyIso === 0, `n=${qtyIso}`);

  // 22d) Líneas INMUTABLES (UPDATE/DELETE sin política ⇒ 0 filas).
  const qtyLineImmutable = await asUser(realA, async (q) => {
    const upd = await q`UPDATE quantity_takeoff_lines SET subtotal_calculated = 999
      WHERE id = '00000000-0000-0000-0000-00000000f303'`;
    const del = await q`DELETE FROM quantity_takeoff_lines
      WHERE id = '00000000-0000-0000-0000-00000000f303'`;
    return { upd: upd.count, del: del.count };
  });
  check('qty-import: líneas INMUTABLES (UPDATE denegado, 0 filas)', qtyLineImmutable.upd === 0);
  check('qty-import: líneas INMUTABLES (DELETE denegado, 0 filas)', qtyLineImmutable.del === 0);

  // 22e) Idempotencia estructural: digest duplicado por org bloqueado (UNIQUE);
  //      el MISMO digest en otra org SÍ es válido.
  const qtyIdem = await asUser(realA, async (q) => {
    await q`INSERT INTO quantity_import_batches
      (organization_id, digest_sha256, source_filename, source_sheet, imported_by)
      VALUES (${ORG_A}, ${QDIG_D}, 'harness.xlsx', 'CANTIDADES 1 PISO', ${USER_A_ADMIN})`;
    let blocked = false;
    await q.unsafe('SAVEPOINT sp_qib_idem');
    try {
      await q`INSERT INTO quantity_import_batches
        (organization_id, digest_sha256, source_filename, source_sheet, imported_by)
        VALUES (${ORG_A}, ${QDIG_D}, 'otro.xlsx', 'CANTIDADES 1 PISO', ${USER_A_ADMIN})`;
    } catch {
      blocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_qib_idem');
    }
    return blocked;
  });
  check('qty-import: digest duplicado por org bloqueado (UNIQUE org+digest)', qtyIdem);
  const qtyIdemOtherOrg = await asUser(claimsB, async (q) => {
    const [row] = await q<{ id: string }[]>`
      INSERT INTO quantity_import_batches
        (organization_id, digest_sha256, source_filename, source_sheet, imported_by)
      VALUES (${ORG_B}, ${QDIG_C}, 'harness-b.xlsx', 'CANTIDADES 1 PISO', ${USER_B_ADMIN})
      RETURNING id`;
    return row !== undefined;
  });
  check('qty-import: mismo digest en OTRA org permitido (aislamiento real)', qtyIdemOtherOrg);

  // 22f) Triggers same-org: grupo de A NO referencia batch de B; línea de A
  //      NO referencia grupo de B.
  let qtyCrossBatchBlocked = false;
  let qtyCrossGroupBlocked = false;
  await asUser(
    realA,
    async (q) => {
      await q.unsafe('SAVEPOINT sp_qtg_cross');
      try {
        await q`INSERT INTO quantity_takeoff_groups
          (organization_id, import_batch_id, description, source_row)
          VALUES (${ORG_A}, '00000000-0000-0000-0000-00000000f304', 'Cross batch', 10)`;
      } catch {
        qtyCrossBatchBlocked = true;
        await q.unsafe('ROLLBACK TO SAVEPOINT sp_qtg_cross');
      }
      await q.unsafe('SAVEPOINT sp_qtl_cross');
      try {
        await q`INSERT INTO quantity_takeoff_lines
          (organization_id, group_id, formula_type, source_row, subtotal_calculated)
          VALUES (${ORG_A}, '00000000-0000-0000-0000-00000000f305', 'direct', 11, 1)`;
      } catch {
        qtyCrossGroupBlocked = true;
        await q.unsafe('ROLLBACK TO SAVEPOINT sp_qtl_cross');
      }
    },
    async (q) => {
      await q`INSERT INTO quantity_import_batches
        (id, organization_id, digest_sha256, source_filename, source_sheet, imported_by)
        VALUES ('00000000-0000-0000-0000-00000000f304', ${ORG_B}, ${QDIG_E}, 'b.xlsx', 'CANTIDADES 1 PISO', ${USER_B_ADMIN})
        ON CONFLICT (id) DO NOTHING`;
      await q`INSERT INTO quantity_takeoff_groups
        (id, organization_id, description, source_row)
        VALUES ('00000000-0000-0000-0000-00000000f305', ${ORG_B}, 'Grupo B', 12)
        ON CONFLICT (id) DO NOTHING`;
    },
  );
  check('qty-import: trigger same-org bloquea batch de otra org en grupos', qtyCrossBatchBlocked);
  check('qty-import: trigger same-org bloquea grupo de otra org en líneas', qtyCrossGroupBlocked);

  // 22g) RPC import_quantity_takeoff_batch: atómica, idempotente, vincula solo
  //      exactos sin reemplazar, sin mutar BOQ, y aborta en versión emitida.
  const qtyRpcBatch = {
    digestSha256: '2a'.repeat(32),
    sourceFilename: 'harness.xlsx',
    sourceSheet: 'CANTIDADES 1 PISO',
    unresolvedCount: 0,
    warningCount: 0,
    metadata: { kind: 'harness' },
  };
  const qtyRpcGroups = (boqItemId: string | null) => [
    {
      visibleCode: 'P-01',
      itemCode: '1.01',
      description: 'Demolicion harness',
      unit: 'm²',
      sourceRow: 14,
      occurrenceIndex: 1,
      totalCalculated: '10.08',
      boqItemId,
      metadata: { linkStatus: boqItemId ? 'linked' : 'not_evaluated' },
      lines: [
        {
          description: null,
          formulaType: 'length_height_count',
          length: '4.2',
          width: null,
          height: '2.4',
          count: '1',
          rawValues: { i: { v: 10.08, f: '(E14*G14)*H14' } },
          sourceRow: 14,
          subtotalCalculated: '10.08',
          sortOrder: 0,
        },
      ],
    },
  ];
  const qtyRpc = await asUser(realA, async (q) => {
    // Versión editable + ítem BOQ propios del harness.
    const vid = '00000000-0000-0000-0000-00000000f306';
    const bid = '00000000-0000-0000-0000-00000000f308';
    const [{ res }] = await q<{ res: { duplicate: boolean; batchId: string; groupsCreated: number; linesCreated: number; linkedBoqItems: number } }[]>`
      SELECT public.import_quantity_takeoff_batch(${sql.json(qtyRpcBatch)}, ${sql.json(qtyRpcGroups(bid))}, ${vid}) AS res`;
    const [item] = await q<{ quantity_snapshot: string; subtotal: string }[]>`
      SELECT quantity_snapshot, subtotal FROM boq_items WHERE id = ${bid}`;
    const [group] = await q<{ import_batch_id: string | null; boq_item_id: string | null; total_calculated: string }[]>`
      SELECT import_batch_id, boq_item_id, total_calculated
      FROM quantity_takeoff_groups
      WHERE organization_id = ${ORG_A} AND description = 'Demolicion harness'
      ORDER BY created_at DESC LIMIT 1`;
    // Mismo digest ⇒ duplicate, nada nuevo.
    const [{ res: res2 }] = await q<{ res: { duplicate: boolean } }[]>`
      SELECT public.import_quantity_takeoff_batch(${sql.json(qtyRpcBatch)}, ${sql.json(qtyRpcGroups(bid))}, ${vid}) AS res`;
    // Digest distinto apuntando al MISMO ítem ⇒ no reemplaza (linked=0).
    const batch3 = { ...qtyRpcBatch, digestSha256: '2b'.repeat(32) };
    const [{ res: res3 }] = await q<{ res: { duplicate: boolean; linkedBoqItems: number; groupsCreated: number } }[]>`
      SELECT public.import_quantity_takeoff_batch(${sql.json(batch3)}, ${sql.json(qtyRpcGroups(bid))}, ${vid}) AS res`;
    return { res, res2, res3, item: item!, group: group! };
  }, async (q) => {
    await q`INSERT INTO estimates (id, project_scope_id, code, name, status)
            VALUES ('00000000-0000-0000-0000-00000000f307', ${SCOPE_A}, 'QTYHRN', 'QtyHarness', 'active')
            ON CONFLICT (id) DO NOTHING`;
    await q`INSERT INTO estimate_versions (id, estimate_id, version_number, status)
            VALUES ('00000000-0000-0000-0000-00000000f306', '00000000-0000-0000-0000-00000000f307', 1, 'draft')
            ON CONFLICT (id) DO NOTHING`;
    await q`INSERT INTO chapters (id, estimate_version_id, code, name, sort_order)
            VALUES ('00000000-0000-0000-0000-00000000f30b', '00000000-0000-0000-0000-00000000f306', 'C1', 'Cap', 0)
            ON CONFLICT (id) DO NOTHING`;
    await q`INSERT INTO boq_items (id, estimate_version_id, chapter_id, code, description_snapshot, unit_snapshot, quantity_snapshot, unit_price_snapshot, subtotal, sort_order)
            VALUES ('00000000-0000-0000-0000-00000000f308', '00000000-0000-0000-0000-00000000f306', '00000000-0000-0000-0000-00000000f30b', '1.01', 'Demolicion harness', 'm²', 10, 100, 1000, 0)
            ON CONFLICT (id) DO NOTHING`;
  });
  check('qty-import RPC: crea batch + grupo + línea (atómica)', !qtyRpc.res.duplicate && qtyRpc.res.groupsCreated === 1 && qtyRpc.res.linesCreated === 1, JSON.stringify(qtyRpc.res));
  check('qty-import RPC: vincula SOLO exactos (1 ítem)', qtyRpc.res.linkedBoqItems === 1);
  check('qty-import RPC: grupo estampado con import_batch_id y vínculo', qtyRpc.group.import_batch_id !== null && qtyRpc.group.boq_item_id !== null);
  check('qty-import RPC: BOQ intacto (quantity/subtotal sin mutar)', Number(qtyRpc.item.quantity_snapshot) === 10 && Number(qtyRpc.item.subtotal) === 1000, JSON.stringify(qtyRpc.item));
  check('qty-import RPC: digest repetido ⇒ duplicate (idempotente)', qtyRpc.res2.duplicate === true);
  check('qty-import RPC: vínculo existente NO se reemplaza (linked=0)', qtyRpc.res3.duplicate === false && qtyRpc.res3.linkedBoqItems === 0 && qtyRpc.res3.groupsCreated === 1, JSON.stringify(qtyRpc.res3));

  // Versión emitida ⇒ version_locked (sin importar nada).
  let qtyLocked = false;
  try {
    await asUser(
      realA,
      async (q) => {
        const lockedBatch = { ...qtyRpcBatch, digestSha256: '2c'.repeat(32) };
        await q`SELECT public.import_quantity_takeoff_batch(${sql.json(lockedBatch)}, ${sql.json(qtyRpcGroups(null))}, '00000000-0000-0000-0000-00000000f309')`;
      },
      async (q) => {
        await q`INSERT INTO estimates (id, project_scope_id, code, name, status)
                VALUES ('00000000-0000-0000-0000-00000000f30a', ${SCOPE_A}, 'QTYLCK', 'QtyLock', 'active')
                ON CONFLICT (id) DO NOTHING`;
        await q`INSERT INTO estimate_versions (id, estimate_id, version_number, status)
                VALUES ('00000000-0000-0000-0000-00000000f309', '00000000-0000-0000-0000-00000000f30a', 1, 'issued')
                ON CONFLICT (id) DO NOTHING`;
      },
    );
  } catch {
    qtyLocked = true;
  }
  check('qty-import RPC: versión emitida ⇒ version_locked (abortada)', qtyLocked);

  // 22h) RLS ENABLE + FORCE en las 3 tablas nuevas.
  const qtyForce = await sql<{ relname: string; rls: boolean; force: boolean }[]>`
    SELECT relname, relrowsecurity AS rls, relforcerowsecurity AS force
    FROM pg_class
    WHERE relname IN ('quantity_import_batches', 'quantity_takeoff_groups', 'quantity_takeoff_lines')`;
  check('qty-import: RLS ENABLE+FORCE en las 3 tablas nuevas',
    qtyForce.length === 3 && qtyForce.every((r) => r.rls && r.force),
    JSON.stringify(qtyForce));

  // ===========================================================================
  // 23) APU_COMPONENT_RESOURCE_RECONCILIATION_V1 — apu_component_resource_actions
  //     (auditoría append-only) + RPCs reconcile_apu_component /
  //     reconcile_apu_components_bulk / update_apu_component_reconciliation.
  // ===========================================================================
  console.log('\n=== 23) APU component reconciliation (APU_COMPONENT_RESOURCE_RECONCILIATION_V1) ===');

  // RES_A (MAT-001, org A) ya está declarado arriba (sección 21); se reutiliza.
  const RES_A2 = '00000000-0000-0000-0000-00000000fb05'; // recurso org A (harness)
  const APU_TPL_A = '00000000-0000-0000-0000-000000000202'; // APU-002 (seed 0006), org A
  const LABOR_COMP = '00000000-0000-0000-0000-000000000213'; // componente M.O. (seed 0006)
  const RES_B_REC = '00000000-0000-0000-0000-00000000fb01'; // recurso org B (harness)
  const COMP_PENDING = '00000000-0000-0000-0000-00000000fb02';
  const COMP_ASSOC = '00000000-0000-0000-0000-00000000fb03';
  const AUDIT_A = '00000000-0000-0000-0000-00000000fb04';
  const RECON_KEY = 'harness-recon-idem-1';

  // Setup (superusuario): recursos auxiliares + un componente pendiente y uno
  // asociado en APU-002 (org A). Idempotente; vive solo en la transacción.
  const reconSetup = async (q: postgres.ReservedSql) => {
    await q`INSERT INTO resources (id, organization_id, code, name, resource_type, unit)
      VALUES (${RES_A2}, ${ORG_A}, 'MAT-A2-REC', 'Material A2 recon', 'material', 'm2')
      ON CONFLICT (id) DO NOTHING`;
    await q`INSERT INTO resources (id, organization_id, code, name, resource_type, unit)
      VALUES (${RES_B_REC}, ${ORG_B}, 'MAT-B-REC', 'Material B recon', 'material', 'm2')
      ON CONFLICT (id) DO NOTHING`;
    await q`INSERT INTO apu_components
      (id, apu_template_id, resource_id, labor_role_id, component_type, quantity, waste_pct,
       unit_price_source, unit_price_snapshot, total_component_cost, sort_order, raw_code, raw_unit,
       notes, reconciliation_state)
      VALUES (${COMP_PENDING}, ${APU_TPL_A}, NULL, NULL, 'material', 2, 0, 'manual', 100, 200, 20,
       'RAWX', 'm2', 'Sin asociar al catálogo: "Material pendiente"', 'pending')
      ON CONFLICT (id) DO NOTHING`;
    await q`INSERT INTO apu_components
      (id, apu_template_id, resource_id, labor_role_id, component_type, quantity, waste_pct,
       unit_price_source, unit_price_snapshot, total_component_cost, sort_order, reconciliation_state)
      VALUES (${COMP_ASSOC}, ${APU_TPL_A}, ${RES_A}, NULL, 'material', 1, 0, 'resource', 50, 50, 21,
       'associated')
      ON CONFLICT (id) DO NOTHING`;
  };

  // 23a) RLS ENABLE + FORCE en la tabla de auditoría.
  const recForce = await sql<{ relname: string; rls: boolean; force: boolean }[]>`
    SELECT relname, relrowsecurity AS rls, relforcerowsecurity AS force
    FROM pg_class WHERE relname = 'apu_component_resource_actions'`;
  check('recon: RLS ENABLE+FORCE en apu_component_resource_actions',
    recForce.length === 1 && recForce.every((r) => r.rls && r.force), JSON.stringify(recForce));

  // 23b) admin A asocia componente pendiente vía RPC; total recalculado;
  //      idempotencia por (org, key) ⇒ una sola fila de auditoría; org del actor.
  const recRpc = await asUser(realA, async (q) => {
    const [r1] = await q<{ res: { status: string; resourceId: string } }[]>`
      SELECT public.reconcile_apu_component(${COMP_PENDING}, ${RES_A}, true, ${RECON_KEY}) AS res`;
    const [r2] = await q<{ res: { status: string } }[]>`
      SELECT public.reconcile_apu_component(${COMP_PENDING}, ${RES_A}, true, ${RECON_KEY}) AS res`;
    const [comp] = await q<{ resource_id: string; reconciliation_state: string; total_component_cost: string }[]>`
      SELECT resource_id, reconciliation_state, total_component_cost FROM apu_components WHERE id = ${COMP_PENDING}`;
    const [{ count }] = await q<{ count: string }[]>`
      SELECT count(*)::text AS count FROM apu_component_resource_actions WHERE idempotency_key = ${RECON_KEY}`;
    const [audit] = await q<{ organization_id: string }[]>`
      SELECT organization_id FROM apu_component_resource_actions WHERE idempotency_key = ${RECON_KEY} LIMIT 1`;
    return { r1: r1!.res, r2: r2!.res, comp: comp!, count, audit: audit! };
  }, reconSetup);
  check('recon: admin A asocia componente pendiente (status reconciled)',
    recRpc.r1.status === 'reconciled' && recRpc.comp.resource_id === RES_A);
  check('recon: total recalculado server-side (2×100=200)', Number(recRpc.comp.total_component_cost) === 200);
  check('recon: idempotencia por key (1 sola fila de auditoría)', recRpc.count === '1', `count=${recRpc.count}`);
  check('recon: 2ª llamada idempotente devuelve el mismo resultado', recRpc.r2.status === 'reconciled');
  check('recon: componente reconciliado preserva la organización del actor (A)',
    recRpc.audit.organization_id === ORG_A);

  // 23c) rol obra (site) bloqueado en la RPC (insufficient_role).
  let recObraBlocked = false;
  await asUser(realAObra, async (q) => {
    await q.unsafe('SAVEPOINT sp_rec_obra');
    try {
      await q`SELECT public.reconcile_apu_component(${COMP_PENDING}, ${RES_A}, true, NULL)`;
    } catch {
      recObraBlocked = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_rec_obra');
    }
  }, reconSetup);
  check('recon: rol obra (site) bloqueado en la RPC (insufficient_role)', recObraBlocked);

  // 23d) cross-org: admin A no puede asociar un recurso de org B (resource_not_found).
  const recCross = await asUser(realA, async (q) => {
    const [r] = await q<{ res: { status: string } }[]>`
      SELECT public.reconcile_apu_component(${COMP_PENDING}, ${RES_B_REC}, true, NULL) AS res`;
    const [comp] = await q<{ resource_id: string | null }[]>`
      SELECT resource_id FROM apu_components WHERE id = ${COMP_PENDING}`;
    return { res: r!.res, comp: comp! };
  }, reconSetup);
  check('recon: cross-org recurso B bloqueado (resource_not_found, sin asociar)',
    recCross.res.status === 'resource_not_found' && recCross.comp.resource_id === null);

  // 23e) aislamiento SELECT: B NO ve la auditoría de A.
  const recIso = await asUser(realB, async (q) => {
    const rows = await q<{ id: string }[]>`
      SELECT id FROM apu_component_resource_actions WHERE organization_id = ${ORG_A}`;
    return rows.length;
  }, async (q) => {
    await reconSetup(q);
    await q`INSERT INTO apu_component_resource_actions
      (id, organization_id, action_type, apu_component_id, resource_id, initiated_by, metadata)
      VALUES (${AUDIT_A}, ${ORG_A}, 'associate', ${COMP_PENDING}, ${RES_A}, ${USER_A_ADMIN}, '{}'::jsonb)
      ON CONFLICT (id) DO NOTHING`;
  });
  check('recon: B NO ve auditoría de A (aislamiento SELECT)', recIso === 0, `n=${recIso}`);

  // 23f) auditoría INMUTABLE: UPDATE/DELETE sin política ⇒ 0 filas (no DELETE físico).
  const recImmutable = await asUser(realA, async (q) => {
    const upd = await q`UPDATE apu_component_resource_actions SET skipped_count = 99 WHERE id = ${AUDIT_A}`;
    const del = await q`DELETE FROM apu_component_resource_actions WHERE id = ${AUDIT_A}`;
    const [{ count }] = await q<{ count: string }[]>`
      SELECT count(*)::text AS count FROM apu_component_resource_actions WHERE id = ${AUDIT_A}`;
    return { upd: upd.count, del: del.count, count };
  }, async (q) => {
    await reconSetup(q);
    await q`INSERT INTO apu_component_resource_actions
      (id, organization_id, action_type, apu_component_id, resource_id, initiated_by, metadata)
      VALUES (${AUDIT_A}, ${ORG_A}, 'associate', ${COMP_PENDING}, ${RES_A}, ${USER_A_ADMIN}, '{}'::jsonb)
      ON CONFLICT (id) DO NOTHING`;
  });
  check('recon: auditoría INMUTABLE (UPDATE denegado, 0 filas)', recImmutable.upd === 0, `upd=${recImmutable.upd}`);
  check('recon: auditoría INMUTABLE (DELETE denegado, 0 filas)', recImmutable.del === 0, `del=${recImmutable.del}`);
  check('recon: sin DELETE físico (fila de auditoría intacta)', recImmutable.count === '1');

  // 23g) INSERT autorizado admin A; rol obra bloqueado (WITH CHECK rol).
  const recInsert = await asUser(realA, async (q) => {
    const ins = await q`INSERT INTO apu_component_resource_actions
      (organization_id, action_type, apu_component_id, resource_id, initiated_by, metadata)
      VALUES (${ORG_A}, 'associate', ${COMP_PENDING}, ${RES_A}, ${USER_A_ADMIN}, '{}'::jsonb)`;
    return ins.count;
  }, reconSetup);
  check('recon: INSERT auditoría autorizado para admin A', recInsert === 1);

  let recInsObra = false;
  await asUser(realAObra, async (q) => {
    await q.unsafe('SAVEPOINT sp_rec_ins_obra');
    try {
      await q`INSERT INTO apu_component_resource_actions
        (organization_id, action_type, initiated_by, metadata)
        VALUES (${ORG_A}, 'associate', ${USER_A_OBRA}, '{}'::jsonb)`;
    } catch {
      recInsObra = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_rec_ins_obra');
    }
  });
  check('recon: rol obra (site/client) NO inserta auditoría (WITH CHECK rol)', recInsObra);

  // 23h) cross-org INSERT auditoría (org B desde sesión A) bloqueado.
  let recCrossIns = false;
  await asUser(realA, async (q) => {
    await q.unsafe('SAVEPOINT sp_rec_xorg');
    try {
      await q`INSERT INTO apu_component_resource_actions
        (organization_id, action_type, initiated_by, metadata)
        VALUES (${ORG_B}, 'associate', ${USER_A_ADMIN}, '{}'::jsonb)`;
    } catch {
      recCrossIns = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_rec_xorg');
    }
  });
  check('recon: cross-org INSERT auditoría (org B desde A) bloqueado', recCrossIns);

  // 23i) bulk asocia el pendiente y NO sobrescribe la asociación existente.
  const recBulk = await asUser(realA, async (q) => {
    const pairs = [
      { componentId: COMP_PENDING, resourceId: RES_A },
      { componentId: COMP_ASSOC, resourceId: RES_A2 }, // ya asociado a RES_A ⇒ skip
    ];
    const [r] = await q<{ res: { succeeded: number; skipped: number } }[]>`
      SELECT public.reconcile_apu_components_bulk(${sql.json(pairs)}, true, NULL) AS res`;
    const [assoc] = await q<{ resource_id: string }[]>`
      SELECT resource_id FROM apu_components WHERE id = ${COMP_ASSOC}`;
    return { res: r!.res, assoc: assoc! };
  }, reconSetup);
  check('recon: bulk asocia 1 y NO sobrescribe la existente (skipped_existing)',
    recBulk.res.succeeded === 1 && recBulk.res.skipped === 1, JSON.stringify(recBulk.res));
  check('recon: asociación existente preservada (sin reemplazo silencioso)',
    recBulk.assoc.resource_id === RES_A);

  // 23j) update: clear desasocia (pending); reject ⇒ intentionally_unresolved.
  const recUpdate = await asUser(realA, async (q) => {
    await q`SELECT public.update_apu_component_reconciliation(${COMP_ASSOC}, 'clear', NULL)`;
    const [aClear] = await q<{ resource_id: string | null; reconciliation_state: string }[]>`
      SELECT resource_id, reconciliation_state FROM apu_components WHERE id = ${COMP_ASSOC}`;
    await q`SELECT public.update_apu_component_reconciliation(${COMP_PENDING}, 'reject', NULL)`;
    const [aReject] = await q<{ reconciliation_state: string }[]>`
      SELECT reconciliation_state FROM apu_components WHERE id = ${COMP_PENDING}`;
    return { aClear: aClear!, aReject: aReject! };
  }, reconSetup);
  check('recon: clear desasocia (resource_id NULL, state pending)',
    recUpdate.aClear.resource_id === null && recUpdate.aClear.reconciliation_state === 'pending');
  check('recon: reject ⇒ intentionally_unresolved', recUpdate.aReject.reconciliation_state === 'intentionally_unresolved');

  // 23k) componente de M.O. nunca se reconcilia (labor_component).
  const recLabor = await asUser(realA, async (q) => {
    const [r] = await q<{ res: { status: string } }[]>`
      SELECT public.reconcile_apu_component(${LABOR_COMP}, ${RES_A}, true, NULL) AS res`;
    return r!.res;
  });
  check('recon: componente M.O. no reconciliable (labor_component)', recLabor.status === 'labor_component');

  // ===========================================================================
  // 24) APU manual builder + BOQ add (APU_MANUAL_BUILDER_V1 + BOQ_ADD_FROM_APU_V1)
  //     RPCs create_manual_apu / add_apu_to_boq (SECURITY INVOKER).
  // ===========================================================================
  console.log('\n=== 24) APU manual builder + BOQ add (APU_MANUAL_BUILDER_V1 + BOQ_ADD_FROM_APU_V1) ===');

  const MB_RES = '00000000-0000-0000-0000-00000000fc01'; // material org A con precio aprobado
  const MB_RES_NOPRICE = '00000000-0000-0000-0000-00000000fc02'; // material org A sin precio
  const MB_RES_B = '00000000-0000-0000-0000-00000000fc03'; // material org B
  const MB_ROLE = '00000000-0000-0000-0000-00000000fc04'; // rol M.O. org A
  const MB_APU_A = '00000000-0000-0000-0000-00000000fc05'; // APU org A (tool 0.1)
  const MB_APU_B = '00000000-0000-0000-0000-00000000fc06'; // APU org B
  const MB_EST = '00000000-0000-0000-0000-00000000fc07';
  const MB_VER_DRAFT = '00000000-0000-0000-0000-00000000fc08';
  const MB_VER_ISSUED = '00000000-0000-0000-0000-00000000fc09';
  const MB_CHAP = '00000000-0000-0000-0000-00000000fc0a'; // capítulo en versión draft
  const MB_CHAP_ISS = '00000000-0000-0000-0000-00000000fc0b'; // capítulo en versión issued
  const MB_AUDIT_A = '00000000-0000-0000-0000-00000000fc0c';
  const MB_KEY_CREATE = 'harness-mb-create-1';
  const MB_KEY_ADD = 'harness-mb-add-1';

  const mbSetup = async (q: postgres.ReservedSql) => {
    await q`INSERT INTO resources (id, organization_id, code, name, resource_type, unit)
      VALUES (${MB_RES}, ${ORG_A}, 'MB-MAT-A', 'Material MB A', 'material', 'm2'),
             (${MB_RES_NOPRICE}, ${ORG_A}, 'MB-MAT-NP', 'Material sin precio', 'material', 'm2'),
             (${MB_RES_B}, ${ORG_B}, 'MB-MAT-B', 'Material MB B', 'material', 'm2')
      ON CONFLICT (id) DO NOTHING`;
    // Observación APROBADA para MB_RES (org A, precio 100) y MB_RES_B (org B, 999).
    await q`INSERT INTO resource_price_observations
      (organization_id, resource_id, observed_price, suggested_net_price, unit, source_type,
       observed_at, status, created_by, approved_by, approved_at)
      VALUES
      (${ORG_A}, ${MB_RES}, 100, 100, 'm2', 'manual', now(), 'approved', ${USER_A_ADMIN}, ${USER_A_ADMIN}, now()),
      (${ORG_B}, ${MB_RES_B}, 999, 999, 'm2', 'manual', now(), 'approved', ${USER_B_ADMIN}, ${USER_B_ADMIN}, now())
      ON CONFLICT DO NOTHING`;
    await q`INSERT INTO labor_roles
      (id, organization_id, code, name, base_salary, working_days_month, working_hours_day)
      VALUES (${MB_ROLE}, ${ORG_A}, 'MB-OFICIAL', 'Oficial MB', 1000000, 30, 8)
      ON CONFLICT (id) DO NOTHING`;
    // APU org A con tool 0.1 y componentes (material total 200 + labor total 1000).
    await q`INSERT INTO apu_templates (id, organization_id, code, name, unit, default_tool_pct, origin_type, active)
      VALUES (${MB_APU_A}, ${ORG_A}, 'MB-APU-A', 'Actividad MB A', 'm2', 0.1, 'manual', true)
      ON CONFLICT (id) DO NOTHING`;
    await q`INSERT INTO apu_components
      (apu_template_id, resource_id, labor_role_id, component_type, quantity, waste_pct,
       unit_price_source, unit_price_snapshot, total_component_cost, sort_order)
      VALUES
      (${MB_APU_A}, ${MB_RES}, NULL, 'material', 2, 0, 'resource', 100, 200, 0),
      (${MB_APU_A}, NULL, ${MB_ROLE}, 'labor', 1, 0, 'labor_role', 1000, 1000, 1)
      ON CONFLICT DO NOTHING`;
    await q`INSERT INTO apu_templates (id, organization_id, code, name, unit, origin_type, active)
      VALUES (${MB_APU_B}, ${ORG_B}, 'MB-APU-B', 'Actividad MB B', 'm2', 'manual', true)
      ON CONFLICT (id) DO NOTHING`;
    // Presupuesto + versión draft (editable) + versión issued (bloqueada) + capítulos.
    await q`INSERT INTO estimates (id, project_scope_id, code, name, status)
      VALUES (${MB_EST}, ${SCOPE_A}, 'MB-EST', 'Presupuesto MB', 'active')
      ON CONFLICT (id) DO NOTHING`;
    await q`INSERT INTO estimate_versions (id, estimate_id, version_number, status)
      VALUES (${MB_VER_DRAFT}, ${MB_EST}, 1, 'draft'),
             (${MB_VER_ISSUED}, ${MB_EST}, 2, 'issued')
      ON CONFLICT (id) DO NOTHING`;
    await q`INSERT INTO chapters (id, estimate_version_id, code, name, sort_order)
      VALUES (${MB_CHAP}, ${MB_VER_DRAFT}, '01', 'Capítulo MB', 0),
             (${MB_CHAP_ISS}, ${MB_VER_ISSUED}, '01', 'Capítulo MB issued', 0)
      ON CONFLICT (id) DO NOTHING`;
    // Fila de auditoría persistente (aislamiento cross-org).
    await q`INSERT INTO apu_manual_actions (id, organization_id, action_type, apu_template_id, initiated_by)
      VALUES (${MB_AUDIT_A}, ${ORG_A}, 'create_manual_apu', ${MB_APU_A}, ${USER_A_ADMIN})
      ON CONFLICT (id) DO NOTHING`;
  };

  // 24a) RLS ENABLE+FORCE en apu_manual_actions.
  const mbForce = await sql<{ relname: string; rls: boolean; force: boolean }[]>`
    SELECT relname, relrowsecurity AS rls, relforcerowsecurity AS force
    FROM pg_class WHERE relname = 'apu_manual_actions'`;
  check('mb: RLS ENABLE+FORCE en apu_manual_actions',
    mbForce.length === 1 && mbForce.every((r) => r.rls && r.force), sql.json(mbForce));

  // 24b) create_manual_apu: admin A crea APU manual; precio de material resuelto
  //      server-side (100) ⇒ total 200; labor total 1000; origen + autoría.
  const mbCreate = await asUser(realA, async (q) => {
    const [r] = await q<{ res: { apuTemplateId: string; componentCount: number } }[]>`
      SELECT public.create_manual_apu(
        ${sql.json({ code: 'MB-NEW-1', name: 'APU manual nuevo', unit: 'm2', defaultToolPct: 0.05 })},
        ${sql.json([
          { componentType: 'material', resourceId: MB_RES, quantity: '2', wastePct: '0' },
          { componentType: 'labor', laborRoleId: MB_ROLE, quantity: '1', wastePct: '0', unitPriceSnapshot: '1000' },
        ])},
        ${MB_KEY_CREATE}
      ) AS res`;
    const tplId = r!.res.apuTemplateId;
    const [tpl] = await q<{ origin_type: string; created_by: string | null }[]>`
      SELECT origin_type, created_by FROM apu_templates WHERE id = ${tplId}`;
    const comps = await q<{ component_type: string; total_component_cost: string; unit_price_snapshot: string }[]>`
      SELECT component_type, total_component_cost, unit_price_snapshot
      FROM apu_components WHERE apu_template_id = ${tplId} ORDER BY sort_order`;
    return { res: r!.res, tpl: tpl!, comps };
  }, mbSetup);
  const mbMat = mbCreate.comps.find((c) => c.component_type === 'material');
  check('mb: create_manual_apu crea plantilla con 2 componentes', mbCreate.res.componentCount === 2);
  check('mb: origin_type=manual + created_by=actor (server-side)',
    mbCreate.tpl.origin_type === 'manual' && mbCreate.tpl.created_by === USER_A_ADMIN);
  check('mb: precio de material resuelto server-side (snapshot=100, total=200)',
    !!mbMat && Number(mbMat.unit_price_snapshot) === 100 && Number(mbMat.total_component_cost) === 200);

  // 24c) create_manual_apu: material sin precio aprobado ⇒ error (no inventa precio).
  let mbNoPrice = false;
  await asUser(realA, async (q) => {
    await q.unsafe('SAVEPOINT sp_mb_np');
    try {
      await q`SELECT public.create_manual_apu(
        ${sql.json({ code: 'MB-NP', name: 'x', unit: 'm2', defaultToolPct: 0 })},
        ${sql.json([{ componentType: 'material', resourceId: MB_RES_NOPRICE, quantity: '1', wastePct: '0' }])},
        NULL)`;
    } catch {
      mbNoPrice = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_mb_np');
    }
  }, mbSetup);
  check('mb: material sin precio aprobado bloqueado (resource_no_approved_price)', mbNoPrice);

  // 24d) create_manual_apu: recurso de otra org ⇒ bloqueado (sin precio en la org A).
  let mbCrossRes = false;
  await asUser(realA, async (q) => {
    await q.unsafe('SAVEPOINT sp_mb_xr');
    try {
      await q`SELECT public.create_manual_apu(
        ${sql.json({ code: 'MB-XR', name: 'x', unit: 'm2', defaultToolPct: 0 })},
        ${sql.json([{ componentType: 'material', resourceId: MB_RES_B, quantity: '1', wastePct: '0' }])},
        NULL)`;
    } catch {
      mbCrossRes = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_mb_xr');
    }
  }, mbSetup);
  check('mb: recurso cross-org bloqueado en create_manual_apu', mbCrossRes);

  // 24e) create_manual_apu: rol obra (site) bloqueado.
  let mbCreateObra = false;
  await asUser(realAObra, async (q) => {
    await q.unsafe('SAVEPOINT sp_mb_obra');
    try {
      await q`SELECT public.create_manual_apu(
        ${sql.json({ code: 'MB-OB', name: 'x', unit: 'm2', defaultToolPct: 0 })},
        ${sql.json([{ componentType: 'material', resourceId: MB_RES, quantity: '1', wastePct: '0' }])},
        NULL)`;
    } catch {
      mbCreateObra = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_mb_obra');
    }
  }, mbSetup);
  check('mb: rol obra (site) bloqueado en create_manual_apu', mbCreateObra);

  // 24f) create_manual_apu: idempotencia por (org, key) ⇒ 1 plantilla, 1 auditoría.
  const mbIdem = await asUser(realA, async (q) => {
    const [r1] = await q<{ res: { apuTemplateId: string } }[]>`
      SELECT public.create_manual_apu(
        ${sql.json({ code: 'MB-IDEM', name: 'idem', unit: 'm2', defaultToolPct: 0 })},
        ${sql.json([{ componentType: 'material', resourceId: MB_RES, quantity: '1', wastePct: '0' }])},
        ${MB_KEY_CREATE + '-x'}) AS res`;
    const [r2] = await q<{ res: { apuTemplateId: string } }[]>`
      SELECT public.create_manual_apu(
        ${sql.json({ code: 'MB-IDEM', name: 'idem', unit: 'm2', defaultToolPct: 0 })},
        ${sql.json([{ componentType: 'material', resourceId: MB_RES, quantity: '1', wastePct: '0' }])},
        ${MB_KEY_CREATE + '-x'}) AS res`;
    const [{ count }] = await q<{ count: string }[]>`
      SELECT count(*)::text AS count FROM apu_templates WHERE organization_id = ${ORG_A} AND code = 'MB-IDEM'`;
    return { same: r1!.res.apuTemplateId === r2!.res.apuTemplateId, count };
  }, mbSetup);
  check('mb: create idempotente por key (mismo id, 1 sola plantilla)',
    mbIdem.same && mbIdem.count === '1', `count=${mbIdem.count}`);

  // 24g) add_apu_to_boq: admin A agrega APU a versión editable; snapshot=1300
  //      (200 + 1000 + 0.1×1000), subtotal=3×1300=3900; apu_template_id asignado.
  const mbAdd = await asUser(realA, async (q) => {
    const [r] = await q<{ res: { boqItemId: string; unitPrice: string; subtotal: string } }[]>`
      SELECT public.add_apu_to_boq(${MB_VER_DRAFT}, ${MB_CHAP}, ${MB_APU_A}, 3, ${MB_KEY_ADD}) AS res`;
    const [item] = await q<{ apu_template_id: string; unit_price_snapshot: string; subtotal: string }[]>`
      SELECT apu_template_id, unit_price_snapshot, subtotal FROM boq_items WHERE id = ${r!.res.boqItemId}`;
    // Costo unitario esperado por la fórmula del dominio (defensa: igualdad SQL).
    const [{ expected }] = await q<{ expected: string }[]>`
      SELECT round(
        COALESCE(SUM(total_component_cost),0)
        + (SELECT default_tool_pct FROM apu_templates WHERE id = ${MB_APU_A})
          * COALESCE(SUM(total_component_cost) FILTER (WHERE component_type='labor'),0), 10)::text AS expected
      FROM apu_components WHERE apu_template_id = ${MB_APU_A}`;
    return { res: r!.res, item: item!, expected };
  }, mbSetup);
  check('mb: add_apu_to_boq crea ítem con apu_template_id', mbAdd.item.apu_template_id === MB_APU_A);
  check('mb: snapshot unit_price server-side = 1300', Number(mbAdd.item.unit_price_snapshot) === 1300);
  check('mb: subtotal server-side = 3×1300 = 3900', Number(mbAdd.item.subtotal) === 3900);
  check('mb: unit_price RPC == fórmula del dominio (defensa en profundidad)',
    Number(mbAdd.res.unitPrice) === Number(mbAdd.expected));

  // 24h) add_apu_to_boq: versión emitida bloqueada (version_locked).
  let mbIssued = false;
  await asUser(realA, async (q) => {
    await q.unsafe('SAVEPOINT sp_mb_iss');
    try {
      await q`SELECT public.add_apu_to_boq(${MB_VER_ISSUED}, ${MB_CHAP_ISS}, ${MB_APU_A}, 1, NULL)`;
    } catch {
      mbIssued = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_mb_iss');
    }
  }, mbSetup);
  check('mb: add_apu_to_boq bloquea versión emitida (version_locked)', mbIssued);

  // 24i) add_apu_to_boq: capítulo de otra versión ⇒ chapter_not_in_version.
  let mbChapMismatch = false;
  await asUser(realA, async (q) => {
    await q.unsafe('SAVEPOINT sp_mb_ch');
    try {
      await q`SELECT public.add_apu_to_boq(${MB_VER_DRAFT}, ${MB_CHAP_ISS}, ${MB_APU_A}, 1, NULL)`;
    } catch {
      mbChapMismatch = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_mb_ch');
    }
  }, mbSetup);
  check('mb: capítulo fuera de la versión bloqueado (chapter_not_in_version)', mbChapMismatch);

  // 24j) add_apu_to_boq: APU de otra org ⇒ apu_not_found.
  let mbCrossApu = false;
  await asUser(realA, async (q) => {
    await q.unsafe('SAVEPOINT sp_mb_xa');
    try {
      await q`SELECT public.add_apu_to_boq(${MB_VER_DRAFT}, ${MB_CHAP}, ${MB_APU_B}, 1, NULL)`;
    } catch {
      mbCrossApu = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_mb_xa');
    }
  }, mbSetup);
  check('mb: APU cross-org bloqueado en add_apu_to_boq (apu_not_found)', mbCrossApu);

  // 24k) add_apu_to_boq: idempotencia ⇒ un solo ítem BOQ.
  const mbAddIdem = await asUser(realA, async (q) => {
    await q`SELECT public.add_apu_to_boq(${MB_VER_DRAFT}, ${MB_CHAP}, ${MB_APU_A}, 5, ${MB_KEY_ADD + '-y'})`;
    await q`SELECT public.add_apu_to_boq(${MB_VER_DRAFT}, ${MB_CHAP}, ${MB_APU_A}, 5, ${MB_KEY_ADD + '-y'})`;
    const [{ count }] = await q<{ count: string }[]>`
      SELECT count(*)::text AS count FROM boq_items
      WHERE chapter_id = ${MB_CHAP} AND apu_template_id = ${MB_APU_A} AND quantity_snapshot = 5`;
    return count;
  }, mbSetup);
  check('mb: add idempotente por key (1 solo ítem BOQ)', mbAddIdem === '1', `count=${mbAddIdem}`);

  // 24l) add_apu_to_boq: rol obra (site) bloqueado.
  let mbAddObra = false;
  await asUser(realAObra, async (q) => {
    await q.unsafe('SAVEPOINT sp_mb_addob');
    try {
      await q`SELECT public.add_apu_to_boq(${MB_VER_DRAFT}, ${MB_CHAP}, ${MB_APU_A}, 1, NULL)`;
    } catch {
      mbAddObra = true;
      await q.unsafe('ROLLBACK TO SAVEPOINT sp_mb_addob');
    }
  }, mbSetup);
  check('mb: rol obra (site) bloqueado en add_apu_to_boq', mbAddObra);

  // 24m) Aislamiento cross-org de apu_manual_actions: B no ve la auditoría de A.
  const mbIsoB = await asUser(realB, async (q) => {
    const [{ count }] = await q<{ count: string }[]>`
      SELECT count(*)::text AS count FROM apu_manual_actions WHERE id = ${MB_AUDIT_A}`;
    return count;
  }, mbSetup);
  const mbIsoA = await asUser(realA, async (q) => {
    const [{ count }] = await q<{ count: string }[]>`
      SELECT count(*)::text AS count FROM apu_manual_actions WHERE id = ${MB_AUDIT_A}`;
    return count;
  }, mbSetup);
  check('mb: apu_manual_actions aislada por organización (B no ve, A sí)',
    mbIsoB === '0' && mbIsoA === '1', `B=${mbIsoB} A=${mbIsoA}`);

  // 24n) apu_manual_actions es append-only: UPDATE no afecta filas (sin policy UPDATE).
  const mbAppendOnly = await asUser(realA, async (q) => {
    const res = await q`UPDATE apu_manual_actions SET action_type = 'add_apu_to_boq' WHERE id = ${MB_AUDIT_A}`;
    return res.count;
  }, mbSetup);
  check('mb: apu_manual_actions append-only (UPDATE no afecta filas)', mbAppendOnly === 0, `affected=${mbAppendOnly}`);

  // --- Resumen ---
  console.log(`\nRESULTADO RLS RUNTIME: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    console.log('Fallos:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  await sql.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error('ERROR en la suite RLS runtime:', e);
  try {
    await sql.end();
  } catch {
    /* noop */
  }
  process.exit(1);
});
