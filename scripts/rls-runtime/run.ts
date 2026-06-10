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
  // 20 tablas de Oleada 1 + 4 de planning (Oleada 3B) + 1 resource_price_observations (Fase 3A) = 25.
  check('Pre-flight: 25 tablas con RLS FORCE', rlsTables === '25', `rlsTables=${rlsTables}`);

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
