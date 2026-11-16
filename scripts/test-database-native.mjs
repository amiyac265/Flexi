// Runs ONLY a new local PostgreSQL cluster. No hosted URL or existing database is used.
import { execFileSync, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
const exec = promisify(execFile)
const root = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync('/tmp/flexi-db-test-')
const data = join(temporary, 'data'), socket = join(temporary, 'socket')
mkdirSync(socket, { mode: 0o700 })
const port = String(18000 + Math.floor(Math.random() * 10000))
const args = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port, '-d', 'postgres']
let started = false
const sql = (input) => execFileSync('psql', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
try {
  execFileSync('initdb', ['-D', data, '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'pipe' })
  execFileSync('pg_ctl', ['-D', data, '-l', join(temporary, 'postgres.log'), '-o', `-F -k ${socket} -p ${port} -c listen_addresses=''`, '-w', '-t', '20', 'start'], { stdio: 'pipe' })
  started = true
  // Minimal Auth schema stand-in; tests actual Postgres RLS/functions, not the Auth service.
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;`)
  for (const file of readdirSync(join(root, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    if (file === '20261116000000_coin_economy.sql') sql(readFileSync(join(root, 'tests/database/coin-backfill-before.sql'), 'utf8'))
    sql(readFileSync(join(root, 'supabase/migrations', file), 'utf8'))
    if (file === '20261116000000_coin_economy.sql') console.log(sql(readFileSync(join(root, 'tests/database/coin-backfill-after.sql'), 'utf8')))
  }
  for (const file of ['security.sql', 'coins.sql']) console.log(sql(readFileSync(join(root, 'tests/database', file), 'utf8')))
  const prefix = "set role authenticated; set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';"
  const parallel = async (statement) => {
    const results = await Promise.all(Array.from({ length: 8 }, () => exec('psql', [...args, '-c', prefix + statement])))
    return results.map(r => JSON.parse(r.stdout.trim()))
  }
  const logs = await parallel(`select flexi_log_workout('{"requestId":"parallel-1234","title":"Parallel","durationMinutes":30}');`)
  assert.equal(logs.filter(r => !r.replayed).length, 1)
  assert.equal(new Set(logs.map(r => r.workout.id)).size, 1)
  const claims = await parallel("select flexi_claim_cosmetic('00000000-0000-4000-8000-000000000013');")
  assert.equal(claims.filter(r => !r.replayed).length, 1)
  assert.equal(new Set(claims.map(r => r.inventory.id)).size, 1)
  console.log('PASS: 8 concurrent workout retries and 8 concurrent claims each produce one record.')
  // Distinct concurrent entries cross the 25th milestone once; concurrent spending cannot overdraw.
  const racer = '00000000-0000-4000-8000-000000000006'
  const racePrefix = `set role authenticated; set request.jwt.claim.sub = '${racer}';`
  sql(`insert into auth.users values('${racer}','{}'); ${racePrefix}
    do $$ begin for i in 1..24 loop perform flexi_log_workout(jsonb_build_object('requestId','race-setup-'||i,'title','Gym','durationMinutes',30)); end loop; end $$;`)
  const rewards = await Promise.all(Array.from({ length: 8 }, (_, i) => exec('psql', [...args, '-c', racePrefix + `select flexi_log_workout('{"requestId":"race-entry-${i}","title":"Gym","durationMinutes":30}');`])))
  assert.equal(rewards.reduce((sum, r) => sum + JSON.parse(r.stdout.trim()).workout.coin_reward, 0), 120)
  assert.equal(JSON.parse(sql(racePrefix + 'select flexi_wallet();')).balance, 360)
  const spends = await Promise.allSettled(['10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000006'].map(id => exec('psql', [...args, '-c', racePrefix + `select flexi_claim_cosmetic('${id}');`])))
  assert.equal(spends.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal(JSON.parse(sql(racePrefix + 'select flexi_wallet();')).balance, 160)
  const paymentOrder = JSON.parse(sql(racePrefix + "select flexi_create_coin_order('pocket','race-payment-123');"))
  const deliveries = await Promise.all(Array.from({ length: 8 }, () => exec('psql', [...args, '-c', `set role service_role; select flexi_fulfill_coin_order('${paymentOrder.id}','cs_test_racingpayment','${racer}',99,'usd');`])))
  assert.equal(deliveries.filter(r => !JSON.parse(r.stdout.trim()).replayed).length, 1)
  assert.equal(JSON.parse(sql(racePrefix + 'select flexi_wallet();')).balance, 260)
  console.log('PASS: concurrent milestone rewards, competing purchases and duplicate payment deliveries preserve coin balances.')
  console.log('All database checks passed on an isolated PostgreSQL cluster.')
} catch (error) {
  console.error(error.stderr?.toString() || error.message)
  process.exitCode = 1
} finally {
  if (started) execFileSync('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' })
  rmSync(temporary, { recursive: true, force: true })
}
