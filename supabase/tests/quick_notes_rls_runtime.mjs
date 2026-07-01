// quick_notes_rls_runtime.mjs — Harness RUNTIME (out-of-band) de la RLS de quick_notes,
// enfocado en la consistencia project/estimate corregida por
// 20260627093000_quick_notes_project_estimate_policy_patch.sql.
//
// Convención del repo: los tests in-repo (vitest) son ESTÁTICOS (parseo de SQL). El runtime
// real se valida con un harness contra una base MIGRADA, fuera de `pnpm test`, como hace
// agent-qa antes del release. Este script cumple ese rol para el patch.
//
// USO (nunca contra Cloud en el flujo normal; usar base local/desechable):
//   1) Levantar local con AMBAS migraciones aplicadas:  supabase start && supabase db reset
//   2) Instalar el driver ad-hoc si hace falta:          npm i pg
//   3) Ejecutar:  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
//                 node supabase/tests/quick_notes_rls_runtime.mjs
//
// Seguridad: cada escenario corre en su transacción con ROLLBACK; no persiste nada. NO imprime
// la connection string. Requiere conectar como superusuario/owner (postgres) para sembrar
// fixtures; la ACCIÓN se prueba tras `SET LOCAL ROLE authenticated|anon` + claims JWT.
import pg from 'pg';

const CONN = process.env.DATABASE_URL;
if (!CONN) {
  console.error('Falta DATABASE_URL (base local migrada). Abortando sin conectar.');
  process.exit(2);
}

const ORG_A = 'a0000000-0000-0000-0000-0000000000a1';
const ORG_B = 'b0000000-0000-0000-0000-0000000000b2';
const OBRA_A = '0a000000-0000-0000-0000-0000000000a4';
const CONSULTA_A = '0a000000-0000-0000-0000-0000000000a6';
const OBRA_B = '0b000000-0000-0000-0000-0000000000b1';
const PROJ_A = 'c0000000-0000-0000-0000-0000000000a1';
const PROJ_A2 = 'c0000000-0000-0000-0000-0000000000a2';
const PROJ_B = 'c0000000-0000-0000-0000-0000000000b1';
const SCOPE_A = 'd0000000-0000-0000-0000-0000000000a1';
const SCOPE_A2 = 'd0000000-0000-0000-0000-0000000000a2';
const SCOPE_B = 'd0000000-0000-0000-0000-0000000000b1';
const EST_A = 'e0000000-0000-0000-0000-0000000000a1';
const EST_A2 = 'e0000000-0000-0000-0000-0000000000a2';
const EST_B = 'e0000000-0000-0000-0000-0000000000b1';
const NOTE_ACTIVE = 'f0000000-0000-0000-0000-0000000000a1';

async function seed(c) {
  for (const uid of [OBRA_A, CONSULTA_A, OBRA_B]) {
    await c.query(`insert into auth.users (id,email) values ($1,$2)`, [uid, uid + '@harness.test']);
  }
  await c.query(`insert into organizations (id,name) values ($1,'Org A'),($2,'Org B')`, [ORG_A, ORG_B]);
  await c.query(`insert into profiles (id,organization_id,full_name,email,role) values
      ($1,$4,'obra A','obra@a.test','obra'),
      ($2,$4,'consulta A','consulta@a.test','consulta'),
      ($3,$5,'obra B','obra@b.test','obra')`, [OBRA_A, CONSULTA_A, OBRA_B, ORG_A, ORG_B]);
  await c.query(`insert into projects (id,organization_id,code,name) values
      ($1,$4,'PA','A'),($2,$4,'PA2','A2'),($3,$5,'PB','B')`, [PROJ_A, PROJ_A2, PROJ_B, ORG_A, ORG_B]);
  await c.query(`insert into project_scopes (id,project_id,code,name,scope_type) values
      ($1,$4,'SA','A','package'),($2,$5,'SA2','A2','package'),($3,$6,'SB','B','package')`,
    [SCOPE_A, SCOPE_A2, SCOPE_B, PROJ_A, PROJ_A2, PROJ_B]);
  await c.query(`insert into estimates (id,project_scope_id,code,name) values
      ($1,$4,'EA','A'),($2,$5,'EA2','A2'),($3,$6,'EB','B')`, [EST_A, EST_A2, EST_B, SCOPE_A, SCOPE_A2, SCOPE_B]);
  await c.query(`insert into quick_notes (id,organization_id,body,status,created_by) values
      ($1,$2,'nota activa','active',$3)`, [NOTE_ACTIVE, ORG_A, OBRA_A]);
}

async function asUser(c, uid, role, org = ORG_A) {
  await c.query(`set local role authenticated`);
  await c.query(`select set_config('request.jwt.claims',$1,true)`,
    [JSON.stringify({ sub: uid, organization_id: org, user_role: role })]);
}
async function asAnon(c) {
  await c.query(`set local role anon`);
  await c.query(`select set_config('request.jwt.claims','',true)`);
}
async function attempt(c, sql, params) {
  await c.query('savepoint sp');
  try {
    const r = await c.query(sql, params);
    await c.query('release savepoint sp');
    return { ok: true, rows: r.rowCount };
  } catch (e) {
    await c.query('rollback to savepoint sp');
    return { ok: false, rows: 0, code: e.code, message: (e.message || '').split('\n')[0] };
  }
}

const results = [];
const rec = (name, expected, pass, obs) => results.push({ name, expected, pass, obs });

async function scenario(client, fn) {
  await client.query('begin');
  try { await seed(client); await fn(client); }
  finally { await client.query('rollback'); }
}

async function main() {
  const c = new pg.Client({ connectionString: CONN, ssl: false });
  await c.connect();
  try {
    const INS = `insert into quick_notes (organization_id,body,created_by,project_id,estimate_id) values ($1,$2,$3,$4,$5)`;

    // project/estimate CONSISTENTE -> PASS
    await scenario(c, async (c) => {
      await asUser(c, OBRA_A, 'obra');
      const r = await attempt(c, INS, [ORG_A, 'ok', OBRA_A, PROJ_A, EST_A]);
      rec('project/estimate consistente', 'PASS', r.ok === true, `ok=${r.ok} code=${r.code || ''}`);
    });
    // project/estimate INCONSISTENTE (misma org, distinto proyecto) -> FAIL (42501)
    await scenario(c, async (c) => {
      await asUser(c, OBRA_A, 'obra');
      const r = await attempt(c, INS, [ORG_A, 'x', OBRA_A, PROJ_A, EST_A2]);
      rec('project/estimate inconsistente', 'FAIL(42501)', r.ok === false && r.code === '42501', `ok=${r.ok} code=${r.code}`);
    });
    // estimate CROSS-ORG -> FAIL
    await scenario(c, async (c) => {
      await asUser(c, OBRA_A, 'obra');
      const r = await attempt(c, INS, [ORG_A, 'x', OBRA_A, null, EST_B]);
      rec('estimate cross-org', 'FAIL(42501)', r.ok === false && r.code === '42501', `ok=${r.ok} code=${r.code}`);
    });
    // project CROSS-ORG -> FAIL
    await scenario(c, async (c) => {
      await asUser(c, OBRA_A, 'obra');
      const r = await attempt(c, INS, [ORG_A, 'x', OBRA_A, PROJ_B, null]);
      rec('project cross-org', 'FAIL(42501)', r.ok === false && r.code === '42501', `ok=${r.ok} code=${r.code}`);
    });
    // estimate NULL (nota dashboard/global) -> PASS
    await scenario(c, async (c) => {
      await asUser(c, OBRA_A, 'obra');
      const r = await attempt(c, INS, [ORG_A, 'global', OBRA_A, null, null]);
      rec('estimate null (global)', 'PASS', r.ok === true, `ok=${r.ok} code=${r.code || ''}`);
    });
    // project NULL + estimate NOT NULL (misma org) -> PASS (contrato preservado)
    await scenario(c, async (c) => {
      await asUser(c, OBRA_A, 'obra');
      const r = await attempt(c, INS, [ORG_A, 'solo-estimate', OBRA_A, null, EST_A]);
      rec('project null + estimate in-org', 'PASS', r.ok === true, `ok=${r.ok} code=${r.code || ''}`);
    });

    // Regresión: consulta NO crea
    await scenario(c, async (c) => {
      await asUser(c, CONSULTA_A, 'consulta');
      const r = await attempt(c, INS, [ORG_A, 'x', CONSULTA_A, null, null]);
      rec('consulta no crea', 'FAIL(42501)', r.ok === false && r.code === '42501', `ok=${r.ok} code=${r.code}`);
    });
    // Regresión: cross-org SELECT vacío
    await scenario(c, async (c) => {
      await asUser(c, OBRA_B, 'obra', ORG_B);
      const r = await c.query(`select count(*)::int n from quick_notes where organization_id=$1`, [ORG_A]);
      rec('cross-org SELECT vacío', 'n=0', r.rows[0].n === 0, `n=${r.rows[0].n}`);
    });
    // Regresión: anon sin acceso
    await scenario(c, async (c) => {
      await asAnon(c);
      const r = await attempt(c, `select count(*)::int n from quick_notes`);
      rec('anon sin acceso', 'denied', r.ok === false, `ok=${r.ok} code=${r.code || ''}`);
    });
    // Regresión: archive-only (editar body bloqueado)
    await scenario(c, async (c) => {
      await asUser(c, OBRA_A, 'obra');
      const r = await attempt(c, `update quick_notes set body='hack' where id=$1`, [NOTE_ACTIVE]);
      rec('archive-only (no edit body)', 'denied', r.ok === false && /archive_only/.test(r.message || ''), `ok=${r.ok} code=${r.code}`);
    });
    // Regresión: DELETE denegado
    await scenario(c, async (c) => {
      await asUser(c, OBRA_A, 'obra');
      const r = await attempt(c, `delete from quick_notes where id=$1`, [NOTE_ACTIVE]);
      rec('DELETE denegado', '0 filas', r.ok === true && r.rows === 0, `ok=${r.ok} rows=${r.rows}`);
    });

    const fails = results.filter((r) => !r.pass);
    for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  [esp:${r.expected}] (${r.obs})`);
    console.log(`\n${results.length - fails.length}/${results.length} PASS`);
    process.exit(fails.length === 0 ? 0 : 1);
  } finally {
    await c.end().catch(() => {});
  }
}
main();
