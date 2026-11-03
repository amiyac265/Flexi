import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { authenticate, handleAPI, readBody, type APIContext } from '../../src/backend/endpoints.ts'
import { databaseError } from '../../src/backend/data.ts'
import type { Database, ProfileRow } from '../../src/backend/database.types.ts'
const id = '00000000-0000-4000-8000-000000000001'
const profile: ProfileRow = { id, display_name: 'Alice', avatar: 'bunny', timezone: 'UTC', weekly_goal: 3, equipped_cosmetic_id: null, created_at: '2026-11-02T12:00:00Z' }
const workout = { id, owner: id, request_id: 'request-1234', title: 'Gym', duration_minutes: 30, notes: '', exercises: [], status: 'completed', local_date: '2026-11-02', completed_at: '2026-11-02T12:00:00Z', voided_at: null }
function request(path: string, method = 'GET', body?: unknown) {
  return new Request(`http://localhost/api/flexi/${path}`, { method, ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) })
}
function context(fetcher: typeof fetch, p = profile): APIContext {
  return { profile: p, db: createClient<Database>('http://supabase.invalid', 'test-only-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetcher } }) }
}
const neverFetch: typeof fetch = async () => { throw new Error('Unexpected database request') }
const run = (req: Request, ctx = context(neverFetch)) => handleAPI(req, new URL(req.url).pathname.split('/').slice(3), async () => ctx)

test('all 18 routes require a bearer token; cookies alone are not authentication', async () => {
  const routes = [['profile','GET'],['profile','PATCH'],['progress','GET'],['train','GET'],['content','GET'],['workouts','GET'],[`workouts/${id}`,'GET'],['workouts','POST'],[`workouts/${id}`,'DELETE'],['calendar','GET'],['calendar','POST'],[`calendar/${id}`,'PATCH'],[`calendar/${id}`,'DELETE'],['character','GET'],['character','PATCH'],['shop','GET'],['inventory','GET'],[`shop/${id}/claim`,'POST']]
  for (const [path, method] of routes) {
    const req = request(path, method)
    req.headers.set('Cookie', 'fake-session=admin')
    const response = await handleAPI(req, path.split('/'))
    assert.equal(response.status, 401, `${method} ${path}`)
    assert.match(response.headers.get('cache-control')!, /no-store/)
  }
})
test('profile returns only public profile fields and responses vary by Authorization', async () => {
  const response = await run(request('profile'))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('vary'), 'Authorization')
  assert.deepEqual(Object.keys((await response.json()).data).sort(), ['id','displayName','avatar','timezone','weeklyGoal','createdAt'].sort())
})
test('router returns 404/405 and allowed verbs without executing a mutation', async () => {
  assert.equal((await run(request('missing'))).status, 404)
  const response = await run(request('progress', 'POST'))
  assert.equal(response.status, 405)
  assert.equal(response.headers.get('allow'), 'GET')
})
test('workout HTTP contract normalizes input, uses RPC and hides internal fields', async () => {
  let calls = 0
  const ctx = context(async (url, init) => {
    calls++
    assert.match(String(url), /rpc\/flexi_log_workout$/)
    const body = JSON.parse(String(init?.body))
    assert.deepEqual(body.p_input, { requestId: 'request-1234', title: 'Gym', durationMinutes: 30, exercises: [] })
    return Response.json({ workout: { ...workout, completion_input: { secret: true } }, replayed: true })
  })
  const response = await run(request('workouts', 'POST', { requestId: 'request-1234', title: ' Gym ', durationMinutes: 30 }), ctx)
  assert.equal(response.status, 200)
  const result = (await response.json()).data
  assert.equal(result.replayed, true)
  assert.equal(result.workout.durationMinutes, 30)
  assert.equal(result.workout.owner, undefined)
  assert.equal(result.workout.completion_input, undefined)
  assert.equal(calls, 1)
})
test('bad inputs are rejected before calling Supabase', async () => {
  for (const extra of [{ owner: id }, { xp: 9999 }, { completedAt: '2000-01-01' }]) {
    assert.equal((await run(request('workouts', 'POST', { requestId: 'request-1234', title: 'Gym', durationMinutes: 30, ...extra }))).status, 400)
  }
  assert.equal((await run(request('profile', 'PATCH', { weeklyGoal: 1 }))).status, 400)
  assert.equal((await run(request('character', 'PATCH', { equippedCosmeticId: 'invalid' }))).status, 400)
  assert.equal((await run(request('workouts/not-a-uuid'))).status, 400)
  assert.equal((await run(request('content?kind=secret'))).status, 400)
  assert.equal((await run(request('workouts?limit=101'))).status, 400)
  assert.equal((await run(request('calendar?from=2026-01-01T00:00:00Z&to=2027-01-01T00:00:00Z'))).status, 400)
})
test('body parsing enforces JSON, object shape and actual byte size', async () => {
  await assert.rejects(readBody(new Request('http://localhost', { method: 'POST', body: '{}' })), /Content-Type/)
  await assert.rejects(readBody(request('profile', 'PATCH', [])), /JSON object/)
  await assert.rejects(readBody(request('profile', 'PATCH', { data: 'a'.repeat(131073) })), /128 KB/)
  await assert.rejects(readBody(new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' })), /Invalid JSON/)
})
test('database errors preserve safe statuses and redact internal diagnostics', async () => {
  const ctx = context(async () => Response.json({ code: 'PT409', message: 'This requestId was already used for a different workout.' }, { status: 409 }))
  const response = await run(request('workouts', 'POST', { requestId: 'request-1234', title: 'Gym', durationMinutes: 30 }), ctx)
  assert.equal(response.status, 409)
  assert.equal((await response.json()).error.code, 'CONFLICT')
  assert.throws(() => databaseError({ code: 'XX000', message: 'private database internals' }), error => error instanceof Error && !error.message.includes('private database internals'))
})
test('calendar PATCH delegates atomic partial updates and cancellation to RPC', async () => {
  const ctx = context(async (url, init) => {
    assert.match(String(url), /rpc\/flexi_update_calendar$/)
    const body = JSON.parse(String(init?.body))
    assert.equal(body.p_id, id)
    assert.deepEqual(body.p_input, { status: 'cancelled' })
    return Response.json({ id, owner: id, title: 'Gym', starts_at: '2026-11-02T12:00:00Z', ends_at: '2026-11-02T13:00:00Z', timezone: 'UTC', notes: '', status: 'cancelled', created_at: '2026-11-02T12:00:00Z' })
  })
  const response = await run(request(`calendar/${id}`, 'DELETE'), ctx)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).data.status, 'cancelled')
})
test('progress uses aggregated dates without undercounting workouts or minutes', async () => {
  const ctx = context(async (url) => {
    assert.match(String(url), /rpc\/flexi_progress_days$/)
    return Response.json([{ local_date: '2026-11-01', workouts: 3, minutes: 90 }, { local_date: '2026-11-02', workouts: 1, minutes: 10 }])
  })
  const data = (await (await run(request('progress'), ctx)).json()).data
  assert.equal(data.totalWorkouts, 4); assert.equal(data.totalMinutes, 100); assert.equal(data.totalXp, 200)
})
test('workout pagination uses an exact count and stable ordering', async () => {
  const ctx = context(async (url) => {
    const query = new URL(String(url)).searchParams
    assert.equal(query.get('offset'), '2'); assert.equal(query.get('limit'), '2')
    assert.match(query.get('order')!, /completed_at.desc,id.asc/)
    return Response.json([workout], { headers: { 'Content-Range': '2-2/3' } })
  })
  const result = (await (await run(request('workouts?page=2&limit=2'), ctx)).json()).data
  assert.equal(result.totalDocs, 3); assert.equal(result.page, 2); assert.equal(result.hasNextPage, false)
})
test('authentication verifies the bearer token with Supabase before reading a profile', async (t) => {
  const originalURL = process.env.NEXT_PUBLIC_SUPABASE_URL, originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.invalid'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-only-key'
  t.after(() => {
    if (originalURL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalURL
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey
  })
  const calls: string[] = []
  t.mock.method(globalThis, 'fetch', async (url: string | URL, init?: RequestInit) => {
    calls.push(String(url))
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer rejected-token')
    return Response.json({ code: 'bad_jwt', message: 'Invalid token' }, { status: 401 })
  })
  await assert.rejects(authenticate(new Request('http://localhost', { headers: { Authorization: 'Bearer rejected-token' } })), /session expired/)
  assert.equal(calls.length, 1)
  assert.match(calls[0], /auth\/v1\/user$/)
})
