/** Framework-independent validation and progression rules. No client-supplied rewards. */
export const AVATARS = ['bunny', 'panda', 'turtle', 'deer'] as const
export type Avatar = typeof AVATARS[number]
export const XP_PER_DAY = 100
export const XP_PER_LEVEL = 500

export class BackendError extends Error {
  status: number
  code: string
  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'BackendError'
    this.code = code
    this.status = status
  }
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BackendError('INVALID_INPUT', 'Expected a JSON object.')
  }
  return value as Record<string, unknown>
}

export function allowFields(value: Record<string, unknown>, fields: readonly string[]) {
  const extra = Object.keys(value).filter((key) => !fields.includes(key))
  if (extra.length) throw new BackendError('INVALID_INPUT', `Unsupported fields: ${extra.join(', ')}.`)
}

export function text(value: unknown, field: string, max = 120): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new BackendError('INVALID_INPUT', `${field} must be 1–${max} characters.`)
  }
  return value.trim()
}

export function integer(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new BackendError('INVALID_INPUT', `${field} must be an integer from ${min} to ${max}.`)
  }
  return value
}

export function timezone(value: unknown): string {
  const zone = text(value, 'timezone', 100)
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format() }
  catch { throw new BackendError('INVALID_INPUT', 'Use a valid IANA timezone, such as America/New_York.') }
  return zone
}

export function instant(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new BackendError('INVALID_INPUT', `${field} must be an ISO timestamp including a timezone offset.`)
  }
  return new Date(value).toISOString()
}

export function dateKey(date: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const part = (name: string) => parts.find((p) => p.type === name)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function addDays(day: string, count: number): string {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}

export function weekStart(day: string): string {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
  return addDays(day, -((weekday + 6) % 7))
}

export type LoggedExercise = {
  name: string; sets?: number; reps?: number; weightKg?: number; durationSeconds?: number
}
export type WorkoutInput = {
  requestId: string; title: string; durationMinutes: number; notes?: string; exercises: LoggedExercise[]
}

export function workoutInput(value: unknown): WorkoutInput {
  const data = object(value)
  allowFields(data, ['requestId', 'title', 'durationMinutes', 'notes', 'exercises'])
  const requestId = text(data.requestId, 'requestId', 80)
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) {
    throw new BackendError('INVALID_INPUT', 'requestId must be 8–80 letters, digits, underscores or hyphens.')
  }
  const raw = data.exercises ?? []
  if (!Array.isArray(raw) || raw.length > 30) throw new BackendError('INVALID_INPUT', 'Use at most 30 exercises.')
  const exercises = raw.map((value) => {
    const exercise = object(value)
    allowFields(exercise, ['name', 'sets', 'reps', 'weightKg', 'durationSeconds'])
    const result: LoggedExercise = { name: text(exercise.name, 'exercise name') }
    if (exercise.sets !== undefined) result.sets = integer(exercise.sets, 'sets', 1, 100)
    if (exercise.reps !== undefined) result.reps = integer(exercise.reps, 'reps', 1, 1000)
    if (exercise.durationSeconds !== undefined) result.durationSeconds = integer(exercise.durationSeconds, 'durationSeconds', 1, 86400)
    if (exercise.weightKg !== undefined) {
      if (typeof exercise.weightKg !== 'number' || !Number.isFinite(exercise.weightKg) || exercise.weightKg < 0 || exercise.weightKg > 2000) {
        throw new BackendError('INVALID_INPUT', 'weightKg must be a number from 0 to 2000.')
      }
      result.weightKg = Math.round(exercise.weightKg * 1000) / 1000
    }
    return result
  })
  const result: WorkoutInput = {
    requestId, title: text(data.title, 'title'),
    durationMinutes: integer(data.durationMinutes, 'durationMinutes', 1, 1440), exercises,
  }
  if (data.notes !== undefined && data.notes !== '') result.notes = text(data.notes, 'notes', 2000)
  return result
}

export type CalendarInput = {
  title: string; startsAt: string; endsAt: string; timezone: string; notes?: string;
  status: 'planned' | 'completed' | 'cancelled'
}

export function calendarInput(value: unknown): CalendarInput {
  const data = object(value)
  allowFields(data, ['title', 'startsAt', 'endsAt', 'timezone', 'notes', 'status'])
  const startsAt = instant(data.startsAt, 'startsAt')
  const endsAt = instant(data.endsAt, 'endsAt')
  const duration = Date.parse(endsAt) - Date.parse(startsAt)
  if (duration <= 0 || duration > 24 * 60 * 60 * 1000) throw new BackendError('INVALID_INPUT', 'Calendar entries must end after they start and last at most 24 hours.')
  const status = data.status ?? 'planned'
  if (!['planned', 'completed', 'cancelled'].includes(String(status))) throw new BackendError('INVALID_INPUT', 'Invalid calendar status.')
  return {
    title: text(data.title, 'title'), startsAt, endsAt, timezone: timezone(data.timezone),
    status: status as CalendarInput['status'],
    ...(data.notes !== undefined && data.notes !== '' ? { notes: text(data.notes, 'notes', 2000) } : {}),
  }
}

export type ProgressWorkout = { localDate: string; status: string; durationMinutes: number }
export function calculateProgress(workouts: ProgressWorkout[], zone: string, weeklyGoal = 3, now = new Date()) {
  const valid = workouts.filter((workout) => workout.status === 'completed')
  const days = [...new Set(valid.map((workout) => workout.localDate))].sort()
  const today = dateKey(now, zone)
  const thisWeek = weekStart(today)
  const daySet = new Set(days)
  const totalXp = days.length * XP_PER_DAY
  const weeks = new Map<string, number>()
  for (const day of days) weeks.set(weekStart(day), (weeks.get(weekStart(day)) ?? 0) + 1)
  const successful = [...weeks].filter(([, count]) => count >= weeklyGoal).map(([week]) => week).sort()
  const successfulSet = new Set(successful)
  let weeklyStreak = 0
  let week = successfulSet.has(thisWeek) ? thisWeek : addDays(thisWeek, -7)
  while (successfulSet.has(week)) { weeklyStreak++; week = addDays(week, -7) }
  let bestWeeklyStreak = 0
  let run = 0
  let previous: string | undefined
  for (const week of successful) {
    run = previous && addDays(previous, 7) === week ? run + 1 : 1
    bestWeeklyStreak = Math.max(bestWeeklyStreak, run)
    previous = week
  }
  let dailyStreak = 0
  let day = daySet.has(today) ? today : addDays(today, -1)
  while (daySet.has(day)) { dailyStreak++; day = addDays(day, -1) }
  const xpIntoLevel = totalXp % XP_PER_LEVEL
  return {
    totalWorkouts: valid.length, totalMinutes: valid.reduce((sum, workout) => sum + workout.durationMinutes, 0),
    activeDays: days.length, totalXp, level: 1 + Math.floor(totalXp / XP_PER_LEVEL), xpIntoLevel,
    xpToNextLevel: XP_PER_LEVEL - xpIntoLevel, levelProgressPercent: xpIntoLevel / XP_PER_LEVEL * 100,
    dailyStreak, weeklyStreak, bestWeeklyStreak,
    weeklyGoal, weekStart: thisWeek, completedDaysThisWeek: weeks.get(thisWeek) ?? 0,
    currentWeekPending: !successfulSet.has(thisWeek),
    lastWorkoutDate: days.at(-1) ?? null,
  }
}

export type Progress = ReturnType<typeof calculateProgress>

