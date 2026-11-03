import type { SupabaseClient } from '@supabase/supabase-js'
import { BackendError, calculateProgress } from './domain.ts'
import type { Database, ProfileRow, WorkoutRow, CalendarRow, ContentRow, CosmeticRow, InventoryRow } from './database.types.ts'
export type DB = SupabaseClient<Database>
export const profileDTO = (p: ProfileRow) => ({ id: p.id, displayName: p.display_name, avatar: p.avatar, timezone: p.timezone, weeklyGoal: p.weekly_goal, createdAt: p.created_at })
export const workoutDTO = (w: WorkoutRow) => ({ id: w.id, requestId: w.request_id, title: w.title, durationMinutes: w.duration_minutes, notes: w.notes, exercises: w.exercises, completedAt: w.completed_at, localDate: w.local_date, status: w.status, voidedAt: w.voided_at })
export const calendarDTO = (e: CalendarRow) => ({ id: e.id, owner: e.owner, title: e.title, startsAt: e.starts_at, endsAt: e.ends_at, timezone: e.timezone, notes: e.notes, status: e.status, createdAt: e.created_at })
export const contentDTO = (c: ContentRow) => ({ id: c.id, slug: c.slug, title: c.title, kind: c.kind, summary: c.summary, body: c.body, sourceUrl: c.source_url, imageUrl: c.image_url, publishedAt: c.published_at })
export const cosmeticDTO = (c: CosmeticRow) => ({ id: c.id, slug: c.slug, name: c.name, description: c.description, slot: c.slot, minimumLevel: c.minimum_level, active: c.active, imageUrl: c.image_url })
export const inventoryDTO = (i: InventoryRow) => ({ id: i.id, owner: i.owner, item: i.item, acquiredAt: i.acquired_at })
export type UserProfile = ReturnType<typeof profileDTO>
export type WorkoutLog = ReturnType<typeof workoutDTO>
export type CalendarEvent = ReturnType<typeof calendarDTO>
export type TrainingContent = ReturnType<typeof contentDTO>
export type CosmeticItem = ReturnType<typeof cosmeticDTO>
export type UserCosmetic = ReturnType<typeof inventoryDTO>
export type Page<T> = { docs: T[]; totalDocs: number; page: number; totalPages: number; hasNextPage: boolean }
type DBError = { code: string; message: string }
export function databaseError(error: DBError): never {
  const statuses: Record<string, number> = { PT400: 400, PT401: 401, PT403: 403, PT404: 404, PT409: 409 }
  const codes: Record<number, string> = { 400: 'INVALID_INPUT', 401: 'AUTH_REQUIRED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT' }
  const status = statuses[error.code]
  if (status) throw new BackendError(codes[status], error.message, status)
  if (error.code === '42501') throw new BackendError('FORBIDDEN', 'This operation is not allowed.', 403)
  if (error.code.startsWith('22') || error.code === '23514' || error.code === '23502') throw new BackendError('INVALID_INPUT', 'Check the submitted fields.')
  if (error.code === '23505') throw new BackendError('CONFLICT', 'This record already exists.', 409)
  // Never expose database diagnostics, schema internals, or input values to clients.
  throw new BackendError('BACKEND_UNAVAILABLE', 'Database request failed. Check backend setup or retry later.', 503)
}
export function unwrap<T>(result: { data: T; error: DBError | null }): NonNullable<T> {
  if (result.error) databaseError(result.error)
  if (result.data === null) throw new BackendError('NOT_FOUND', 'Record not found.', 404)
  return result.data as NonNullable<T>
}
export function paginated<T, U>(result: { data: T[] | null; error: DBError | null; count: number | null }, args: { page: number; limit: number }, map: (row: T) => U): Page<U> {
  const docs = unwrap(result).map(map)
  const totalDocs = result.count ?? 0
  const totalPages = Math.ceil(totalDocs / args.limit)
  return { docs, totalDocs, page: args.page, totalPages, hasNextPage: args.page < totalPages }
}
export async function progressFor(db: DB, profile: ProfileRow) {
  const days = unwrap(await db.rpc('flexi_progress_days', {}))
  const progress = calculateProgress(days.map(d => ({ localDate: d.local_date, durationMinutes: d.minutes, status: 'completed' })), profile.timezone, profile.weekly_goal)
  return { ...progress, totalWorkouts: days.reduce((total, day) => total + day.workouts, 0) }
}
