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

// Concede los privilegios de tabla/esquema que Supabase otorga por defecto al
// rol `authenticated`. NO afecta RLS (que filtra filas); solo permite que el
// rol intente el acceso para que RLS sea lo que decida. Idempotente.
async function ensureGrants(): Promise<void> {
  await sql.unsafe('GRANT USAGE ON SCHEMA public TO authenticated');
  await sql.unsafe('GRANT USAGE ON SCHEMA app TO authenticated');
  await sql.unsafe('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO authenticated');
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
  // 20 tablas de Oleada 1 + 4 de planning (Oleada 3B) = 24.
  check('Pre-flight: 24 tablas con RLS FORCE', rlsTables === '24', `rlsTables=${rlsTables}`);

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
