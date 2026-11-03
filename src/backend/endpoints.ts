import { AVATARS, BackendError, allowFields, calendarInput, instant, object, text, workoutInput } from './domain.ts'
import { calendarDTO, contentDTO, cosmeticDTO, inventoryDTO, paginated, profileDTO, progressFor, unwrap, workoutDTO, type DB } from './data.ts'
import type { ProfileRow } from './database.types.ts'
import { serverSupabase } from '../lib/supabase/server.ts'
import { isSupabaseConfigured } from '../lib/supabase/config.ts'
export type APIContext = { db: DB; profile: ProfileRow }
type Handler = (req: Request, context: APIContext, id: string | undefined) => Promise<unknown>
export type ResolveContext = (req: Request) => Promise<APIContext>

export async function authenticate(req: Request): Promise<APIContext> {
  const match = /^Bearer ([^\s]+)$/i.exec(req.headers.get('authorization') ?? '')
  if (!match) throw new BackendError('AUTH_REQUIRED', 'Sign in with a Flexi account.', 401)
  if (!isSupabaseConfigured()) throw new BackendError('BACKEND_NOT_CONFIGURED', 'Supabase is not configured. See docs/backend-setup.md.', 503)
  const token = match[1]
  const db = serverSupabase(token)
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) throw new BackendError('AUTH_REQUIRED', 'Your session expired. Please sign in again.', 401)
  const profile = unwrap(await db.from('profiles').select('*').eq('id', data.user.id).maybeSingle())
  return { db, profile }
}
function uuid(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new BackendError('INVALID_INPUT', 'Invalid record ID.')
  return value
}
function pageArgs(req: Request) {
  const params = new URL(req.url).searchParams
  const page = Number(params.get('page') ?? 1), limit = Number(params.get('limit') ?? 20)
  if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new BackendError('INVALID_INPUT', 'Use a positive page and a limit from 1 to 100.')
  return { page, limit, start: (page - 1) * limit, end: page * limit - 1 }
}
export async function readBody(req: Request) {
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new BackendError('INVALID_INPUT', 'Send Content-Type: application/json.', 415)
  const reader = req.body?.getReader()
  if (!reader) throw new BackendError('INVALID_INPUT', 'A JSON request body is required.')
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 128 * 1024) { await reader.cancel(); throw new BackendError('INVALID_INPUT', 'Request body exceeds 128 KB.', 413) }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try { return object(JSON.parse(new TextDecoder().decode(bytes))) }
  catch (error) {
    if (error instanceof BackendError) throw error
    throw new BackendError('INVALID_INPUT', 'Invalid JSON.')
  }
}
function validateProfileChanges(input: Record<string, unknown>, fields: string[]) {
  allowFields(input, fields)
  if ('displayName' in input) input.displayName = text(input.displayName, 'displayName', 60)
  if ('avatar' in input && !AVATARS.includes(input.avatar as typeof AVATARS[number])) throw new BackendError('INVALID_INPUT', 'Choose bunny, panda, turtle, or deer.')
  if ('equippedCosmeticId' in input && input.equippedCosmeticId !== null) input.equippedCosmeticId = uuid(input.equippedCosmeticId)
  return input
}
async function character({ db, profile }: APIContext) {
  const progress = await progressFor(db, profile)
  let equippedCosmetic = null
  if (profile.equipped_cosmetic_id) {
    const result = await db.from('cosmetic_items').select('*').eq('id', profile.equipped_cosmetic_id)
    equippedCosmetic = unwrap(result).map(cosmeticDTO)[0] ?? null
  }
  const evolved = progress.level >= 5
  return { avatar: profile.avatar, level: progress.level, evolved, imagePath: `/avatars/${profile.avatar}-${evolved ? 'evolved' : 'starter'}.png`, equippedCosmetic }
}
async function contentPreview(db: DB, kind: 'news' | 'tutorial') {
  return unwrap(await db.from('training_content').select('*').eq('kind', kind).order('published_at', { ascending: false }).order('id').limit(5)).map(contentDTO)
}
const routes: { path: string; method: string; handler: Handler }[] = []
function endpoint(path: string, method: string, handler: Handler) { routes.push({ path, method, handler }) }
endpoint('profile', 'GET', async (_req, { profile }) => profileDTO(profile))
endpoint('profile', 'PATCH', async (req, { db }) => profileDTO(unwrap(await db.rpc('flexi_update_profile', { p_input: validateProfileChanges(await readBody(req), ['displayName', 'avatar']) }))))
endpoint('progress', 'GET', async (_req, { db, profile }) => progressFor(db, profile))
endpoint('train', 'GET', async (_req, { db, profile }) => {
  const [progress, workouts, events, news, tutorials] = await Promise.all([
    progressFor(db, profile),
    db.from('workout_logs').select('*').eq('status', 'completed').order('completed_at', { ascending: false }).order('id').limit(5),
    db.from('calendar_events').select('*').eq('status', 'planned').gt('ends_at', new Date().toISOString()).order('starts_at').order('id').limit(3),
    contentPreview(db, 'news'), contentPreview(db, 'tutorial'),
  ])
  return { profile: profileDTO(profile), progress, recentWorkouts: unwrap(workouts).map(workoutDTO), upcomingWorkouts: unwrap(events).map(calendarDTO), news, tutorials }
})
endpoint('content', 'GET', async (req, { db }) => {
  const kind = new URL(req.url).searchParams.get('kind'), args = pageArgs(req)
  if (kind && kind !== 'news' && kind !== 'tutorial') throw new BackendError('INVALID_INPUT', 'kind must be news or tutorial.')
  let query = db.from('training_content').select('*', { count: 'exact' }).order('published_at', { ascending: false }).order('id').range(args.start, args.end)
  if (kind === 'news' || kind === 'tutorial') query = query.eq('kind', kind)
  return paginated(await query, args, contentDTO)
})
endpoint('workouts', 'GET', async (req, { db }) => {
  const args = pageArgs(req)
  return paginated(await db.from('workout_logs').select('*', { count: 'exact' }).eq('status', 'completed').order('completed_at', { ascending: false }).order('id').range(args.start, args.end), args, workoutDTO)
})
endpoint('workouts/:id', 'GET', async (_req, { db }, id) => workoutDTO(unwrap(await db.from('workout_logs').select('*').eq('id', uuid(id)).maybeSingle())))
endpoint('workouts', 'POST', async (req, { db }) => {
  const result = unwrap(await db.rpc('flexi_log_workout', { p_input: workoutInput(await readBody(req)) }))
  return { workout: workoutDTO(result.workout), replayed: result.replayed }
})
endpoint('workouts/:id', 'DELETE', async (_req, { db }, id) => workoutDTO(unwrap(await db.rpc('flexi_void_workout', { p_id: uuid(id) }))))
endpoint('calendar', 'GET', async (req, { db }) => {
  const params = new URL(req.url).searchParams, now = Date.now(), args = pageArgs(req)
  const from = instant(params.get('from') ?? new Date(now - 7 * 86400000).toISOString(), 'from')
  const to = instant(params.get('to') ?? new Date(now + 30 * 86400000).toISOString(), 'to')
  if (Date.parse(to) <= Date.parse(from) || Date.parse(to) - Date.parse(from) > 93 * 86400000) throw new BackendError('INVALID_INPUT', 'Use a positive calendar range of at most 93 days.')
  return paginated(await db.from('calendar_events').select('*', { count: 'exact' }).lt('starts_at', to).gt('ends_at', from).neq('status', 'cancelled').order('starts_at').order('id').range(args.start, args.end), args, calendarDTO)
})
endpoint('calendar', 'POST', async (req, { db }) => calendarDTO(unwrap(await db.rpc('flexi_create_calendar', { p_input: calendarInput(await readBody(req)) }))))
endpoint('calendar/:id', 'PATCH', async (req, { db }, id) => {
  const input = await readBody(req)
  allowFields(input, ['title', 'startsAt', 'endsAt', 'timezone', 'notes', 'status'])
  // Merge + validation happens under a database lock, so concurrent partial edits preserve unrelated fields.
  return calendarDTO(unwrap(await db.rpc('flexi_update_calendar', { p_id: uuid(id), p_input: input })))
})
endpoint('calendar/:id', 'DELETE', async (_req, { db }, id) => calendarDTO(unwrap(await db.rpc('flexi_update_calendar', { p_id: uuid(id), p_input: { status: 'cancelled' } }))))
endpoint('character', 'GET', async (_req, ctx) => character(ctx))
endpoint('character', 'PATCH', async (req, { db }) => {
  const profile = unwrap(await db.rpc('flexi_update_profile', { p_input: validateProfileChanges(await readBody(req), ['avatar', 'equippedCosmeticId']) }))
  return character({ db, profile })
})
endpoint('shop', 'GET', async (req, { db, profile }) => {
  const args = pageArgs(req)
  const [result, progress] = await Promise.all([
    db.from('cosmetic_items').select('*', { count: 'exact' }).order('minimum_level').order('id').range(args.start, args.end), progressFor(db, profile),
  ])
  const items = paginated(result, args, cosmeticDTO)
  const inventory = items.docs.length ? unwrap(await db.from('user_cosmetics').select('*').in('item', items.docs.map(item => item.id))) : []
  const owned = new Set(inventory.map(i => i.item))
  return { ...items, docs: items.docs.map(item => ({ ...item, owned: owned.has(item.id), unlocked: progress.level >= item.minimumLevel })), level: progress.level }
})
endpoint('inventory', 'GET', async (req, { db }) => {
  const args = pageArgs(req)
  const result = paginated(await db.from('user_cosmetics').select('*', { count: 'exact' }).order('acquired_at', { ascending: false }).order('id').range(args.start, args.end), args, inventoryDTO)
  const items = result.docs.length ? unwrap(await db.from('cosmetic_items').select('*').in('id', result.docs.map(i => i.item))).map(cosmeticDTO) : []
  return { ...result, docs: result.docs.map(i => ({ ...i, item: items.find(item => item.id === i.item) ?? null })) }
})
endpoint('shop/:id/claim', 'POST', async (_req, { db }, id) => {
  const result = unwrap(await db.rpc('flexi_claim_cosmetic', { p_id: uuid(id) }))
  return { inventory: inventoryDTO(result.inventory), replayed: result.replayed }
})

/** Native Request/Response boundary, shared by Next.js and HTTP contract tests. */
export async function handleAPI(req: Request, segments: string[], resolve: ResolveContext = authenticate): Promise<Response> {
  const headers = { 'Cache-Control': 'private, no-store', 'Vary': 'Authorization' }
  try {
    let id: string | undefined
    const candidates = routes.filter(route => {
      const parts = route.path.split('/')
      return parts.length === segments.length && parts.every((part, i) => part === ':id' || part === segments[i])
    })
    if (!candidates.length) throw new BackendError('NOT_FOUND', 'Endpoint not found.', 404)
    const route = candidates.find(route => route.method === req.method)
    if (!route) return Response.json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }, { status: 405, headers: { ...headers, Allow: candidates.map(r => r.method).join(', ') } })
    const idIndex = route.path.split('/').indexOf(':id')
    if (idIndex >= 0) id = segments[idIndex]
    const context = await resolve(req)
    return Response.json({ data: await route.handler(req, context, id) }, { headers })
  } catch (error) {
    if (error instanceof BackendError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status, headers })
    // Do not log submitted bodies or authorization headers.
    console.error('Flexi API request failed', req.method, segments[0])
    return Response.json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please retry.' } }, { status: 500, headers })
  }
}
