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
  for (const file of readdirSync(join(root, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) sql(readFileSync(join(root, 'supabase/migrations', file), 'utf8'))
  console.log(sql(readFileSync(join(root, 'tests/database/security.sql'), 'utf8')))
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
  console.log('All database checks passed on an isolated PostgreSQL cluster.')
} catch (error) {
  console.error(error.stderr?.toString() || error.message)
  process.exitCode = 1
} finally {
  if (started) execFileSync('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' })
  rmSync(temporary, { recursive: true, force: true })
}
