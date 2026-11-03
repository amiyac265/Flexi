// Embedded PostgreSQL: executes real migrations, functions, RLS, roles, and constraints.
// No Supabase project, Docker daemon, native server, or network is required.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
const root = resolve(import.meta.dirname, '..')
const db = new PGlite()
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;`)
  for (const file of readdirSync(join(root, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(root, 'supabase/migrations', file), 'utf8'))
    console.log(`PASS: applied ${file}`)
  }
  const results = await db.exec(readFileSync(join(root, 'tests/database/security.sql'), 'utf8'))
  let checks = 0
  for (const result of results) for (const row of result.rows) for (const value of Object.values(row)) {
    if (typeof value === 'string' && value.startsWith('PASS:')) { console.log(value); checks++ }
  }
  await db.exec("set role authenticated; set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';")
  // PGlite serializes queries. Real multi-connection races are tested by test:database:native.
  const logs = await Promise.all(Array.from({ length: 8 }, () => db.query(`select flexi_log_workout('{"requestId":"parallel-1234","title":"Parallel","durationMinutes":30}') as result;`)))
  assert.equal(logs.filter(r => !r.rows[0].result.replayed).length, 1)
  assert.equal(new Set(logs.map(r => r.rows[0].result.workout.id)).size, 1)
  const claims = await Promise.all(Array.from({ length: 8 }, () => db.query("select flexi_claim_cosmetic('00000000-0000-4000-8000-000000000013') as result;")))
  assert.equal(claims.filter(r => !r.rows[0].result.replayed).length, 1)
  assert.equal(new Set(claims.map(r => r.rows[0].result.inventory.id)).size, 1)
  await db.exec('reset role;')
  const seed = readFileSync(join(root, 'supabase/seed.sql'), 'utf8')
  await db.exec(seed); await db.exec(seed)
  assert.equal((await db.query("select count(*)::integer as total from cosmetic_items where slug in ('starter-headband','training-cape')")).rows[0].total, 2)
  console.log(`PASS: ${checks} security/rule checks plus queued duplicate requests and repeatable seed.`)
} catch (error) {
  console.error(error.message, error.detail ?? '', error.where ?? '')
  process.exitCode = 1
} finally {
  await db.close()
}
