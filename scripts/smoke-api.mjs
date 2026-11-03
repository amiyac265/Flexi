import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const email = process.env.SMOKE_TEST_EMAIL, password = process.env.SMOKE_TEST_PASSWORD
const base = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'
if (!url || !key || !email || !password) throw new Error('Set Supabase settings in .env.local and dedicated test credentials in .env.smoke. See docs/backend-setup.md.')
const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
let token, workoutId, eventId
async function api(path, method = 'GET', body) {
  const response = await fetch(`${base}/api/flexi/${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const result = await response.json()
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${result.error?.code ?? ''}`)
  return result.data
}
try {
  assert.equal((await fetch(`${base}/api/flexi/profile`)).status, 401)
  const login = await auth.auth.signInWithPassword({ email, password })
  if (login.error || !login.data.session) throw new Error('Test login failed. Confirm the email and check local test credentials.')
  token = login.data.session.access_token
  await api('profile'); await api('train'); await api('shop'); await api('inventory'); await api('character')
  const draft = { requestId: crypto.randomUUID(), title: 'Backend smoke test', durationMinutes: 10 }
  const first = await api('workouts', 'POST', draft); workoutId = first.workout.id
  const retry = await api('workouts', 'POST', draft)
  assert.equal(retry.workout.id, workoutId); assert.equal(retry.replayed, true)
  const progress = await api('progress'); assert(progress.totalWorkouts > 0)
  const now = Date.now()
  const event = await api('calendar', 'POST', { title: 'Backend smoke test', startsAt: new Date(now + 3600000).toISOString(), endsAt: new Date(now + 7200000).toISOString(), timezone: 'UTC' })
  eventId = event.id
  assert.equal((await api(`calendar/${eventId}`, 'PATCH', { notes: 'Updated' })).notes, 'Updated')
  assert.equal((await api(`workouts/${workoutId}`, 'DELETE')).status, 'voided'); workoutId = undefined
  assert.equal((await api(`calendar/${eventId}`, 'DELETE')).status, 'cancelled'); eventId = undefined
  console.log('PASS: authentication, reads, workout retry/void, and calendar create/edit/cancel.')
} finally {
  if (token) {
    if (workoutId) await api(`workouts/${workoutId}`, 'DELETE').catch(() => console.error('Could not void test workout. Inspect the dedicated test account.'))
    if (eventId) await api(`calendar/${eventId}`, 'DELETE').catch(() => console.error('Could not cancel test calendar entry. Inspect the dedicated test account.'))
    const { error } = await auth.auth.signOut()
    if (error) { console.error('Test logout failed.'); process.exitCode = 1 }
    else console.log('PASS: logout.')
  }
}
