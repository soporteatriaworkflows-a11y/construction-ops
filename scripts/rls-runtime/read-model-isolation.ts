/**
 * read-model-isolation.ts — Prueba de aislamiento del read-model (P1-A / H-01).
 *
 * Demuestra empíricamente, contra Supabase LOCAL (127.0.0.1:54322), que:
 *   1. Con la conexión actual del read-model (rol `postgres`, rolbypassrls=true),
 *      una consulta SIN filtro de organización VE datos de TODAS las orgs (RLS
 *      bypassada) — el bug H-01.
 *   2. Envolviendo la MISMA consulta con `withTenantRls(claims)` (Alternativa B:
 *      SET LOCAL ROLE authenticated + request.jwt.claims), RLS se aplica y la
 *      consulta solo ve la organización del visor — el fix.
 *   3. No hay contaminación entre solicitudes: tras la transacción RLS, la
 *      conexión del pool vuelve a su estado (no conserva rol ni claims).
 *   4. Sin identidad (sub vacío) ⇒ deny; identidad sin perfil ⇒ 0 filas.
 *
 * SOLO LOCAL. No modifica datos productivos. Usa orgs/usuarios ya sembrados
 * (seeds 0001/0004). Las inserciones de respaldo usan ON CONFLICT DO NOTHING.
 */
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

import postgres from 'postgres';
import { withTenantRls, buildRlsClaims } from '../../apps/web/lib/db/rls';
import { getSql } from '../../apps/web/lib/db/index';

const ORG_A = '00000000-0000-0000-0000-0000000000a1';
const USER_A_ADMIN = '00000000-0000-0000-0000-0000000000b1';
const ORG_B = '00000000-0000-0000-0000-0000000000a2';
const USER_B_ADMIN = '00000000-0000-0000-0000-0000000000b7';
const PROJECT_B = '00000000-0000-0000-0000-0000000000c2';
const USER_NO_PROFILE = '00000000-0000-0000-0000-0000000000bf';

const admin = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) { pass++; console.log(`  ✓ PASS  ${name}`); }
  else { fail++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function ensureOrgB(): Promise<void> {
  await admin`INSERT INTO organizations (id, name) VALUES (${ORG_B}, 'Constructora Demo B') ON CONFLICT (id) DO NOTHING`;
  await admin.unsafe(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='auth' AND table_name='users') THEN
        INSERT INTO auth.users (id, instance_id, aud, role, email)
        VALUES ('${USER_B_ADMIN}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin-b@example.test')
        ON CONFLICT (id) DO NOTHING;
      END IF;
    END $$;`);
  await admin`INSERT INTO profiles (id, organization_id, full_name, email, role)
    VALUES (${USER_B_ADMIN}, ${ORG_B}, 'Admin B', 'admin-b@example.test', 'admin') ON CONFLICT (id) DO NOTHING`;
  await admin`INSERT INTO projects (id, organization_id, code, name, status, location)
    VALUES (${PROJECT_B}, ${ORG_B}, 'PROY-B', 'Proyecto B', 'active', 'Demo B') ON CONFLICT (id) DO NOTHING`;
}

async function main(): Promise<void> {
  console.log('--- P1-A read-model isolation (local) ---');
  await ensureOrgB();

  // Baseline (superusuario, sin RLS): existen proyectos de A y de B.
  const totalA = Number((await admin`SELECT count(*)::int AS n FROM projects WHERE organization_id = ${ORG_A}`)[0].n);
  const totalB = Number((await admin`SELECT count(*)::int AS n FROM projects WHERE organization_id = ${ORG_B}`)[0].n);
  check('baseline: existen proyectos de A y de B', totalA > 0 && totalB > 0, `A=${totalA} B=${totalB}`);

  // (1) BUG: conexión del read-model SIN wrapper ⇒ ve TODAS las orgs (bypassrls).
  const leak = Number((await getSql()`SELECT count(*)::int AS n FROM projects`)[0].n);
  check('H-01 reproducido: lectura cruda (bypassrls) ve A y B (sin RLS)', leak >= totalA + totalB, `cruda=${leak}`);

  // (2) FIX: misma consulta SIN filtro, envuelta en withTenantRls(A) ⇒ solo A.
  const claimsA = buildRlsClaims({ userId: USER_A_ADMIN, organizationId: ORG_A, role: 'admin' });
  const scopedA = await withTenantRls(claimsA, async (q) => {
    const rows = await q`SELECT count(*)::int AS n, count(*) FILTER (WHERE organization_id = ${ORG_B})::int AS b FROM projects`;
    return { n: Number(rows[0].n), b: Number(rows[0].b) };
  });
  check('FIX: withTenantRls(A) solo ve proyectos de A (RLS aplica)', scopedA.n === totalA, `scoped=${scopedA.n} esperado=${totalA}`);
  check('FIX: withTenantRls(A) NO ve proyectos de B (sin fuga cross-org)', scopedA.b === 0, `b_visibles=${scopedA.b}`);

  // withTenantRls(B) ⇒ solo B (simétrico).
  const claimsB = buildRlsClaims({ userId: USER_B_ADMIN, organizationId: ORG_B, role: 'admin' });
  const scopedB = await withTenantRls(claimsB, async (q) => {
    const rows = await q`SELECT count(*) FILTER (WHERE organization_id = ${ORG_A})::int AS a FROM projects`;
    return Number(rows[0].a);
  });
  check('FIX: withTenantRls(B) NO ve proyectos de A (simétrico)', scopedB === 0, `a_visibles=${scopedB}`);

  // (3) Sin contaminación: tras la tx RLS, la conexión del pool vuelve a ver todo.
  const afterLeak = Number((await getSql()`SELECT count(*)::int AS n FROM projects`)[0].n);
  check('sin contaminación de pool: rol/claims no persisten entre solicitudes', afterLeak >= totalA + totalB, `post=${afterLeak}`);

  // (4) Deny: sub vacío lanza; identidad sin perfil ⇒ 0 filas (current_org NULL).
  let denied = false;
  try { await withTenantRls({ sub: '' }, async (q) => q`SELECT 1`); } catch { denied = true; }
  check('deny-by-default: sin identidad (sub vacío) withTenantRls lanza', denied);

  const noProfile = await withTenantRls({ sub: USER_NO_PROFILE }, async (q) => {
    const rows = await q`SELECT count(*)::int AS n FROM projects`;
    return Number(rows[0].n);
  });
  check('deny-by-default: identidad sin perfil ⇒ 0 filas (current_org NULL)', noProfile === 0, `n=${noProfile}`);

  console.log(`\nRESULTADO READ-MODEL ISOLATION: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) { console.log('Fallos:'); for (const f of failures) console.log(`  - ${f}`); }
}

main()
  .then(async () => { await admin.end(); await getSql().end(); process.exit(fail > 0 ? 1 : 0); })
  .catch(async (e) => { console.error('ERROR isolation suite:', e.message); await admin.end(); try { await getSql().end(); } catch { /* noop */ } process.exit(1); });
