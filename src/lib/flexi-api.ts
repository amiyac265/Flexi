/** Browser client for frontend integration. Supabase handles session persistence/refresh. */
import type { CalendarEvent, CosmeticItem, Page, TrainingContent, UserCosmetic, UserProfile, WorkoutLog } from '../backend/data.ts'
import { AVATARS, integer, text, timezone, type Avatar, type CalendarInput, type Progress, type WorkoutInput } from '../backend/domain.ts'
import { browserSupabase } from './supabase/browser.ts'

export class FlexiAPIError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'FlexiAPIError'
    this.code = code
    this.status = status
  }
}
type Character = { avatar: Avatar; level: number; evolved: boolean; imagePath: string; equippedCosmetic: CosmeticItem | null }
type PublicProfile = UserProfile
type PublicWorkout = WorkoutLog
type Train = { profile: PublicProfile; progress: Progress; recentWorkouts: PublicWorkout[]; upcomingWorkouts: CalendarEvent[]; news: TrainingContent[]; tutorials: TrainingContent[] }
type ShopItem = CosmeticItem & { owned: boolean; unlocked: boolean }
type PopulatedInventory = Omit<UserCosmetic, 'item'> & { item: CosmeticItem | string | null }

export function createFlexiAPI(base = '/api') {
  async function request<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
    const { data: auth, error } = await browserSupabase().auth.getSession()
    if (error || !auth.session) throw new FlexiAPIError('AUTH_REQUIRED', 'Sign in with a Flexi account.', 401)
    const response = await fetch(`${base}${path}`, {
      method, cache: 'no-store', credentials: 'omit',
      headers: { Authorization: `Bearer ${auth.session.access_token}`, ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    })
    const result = await response.json().catch(() => null)
    if (!response.ok) {
      throw new FlexiAPIError(result?.error?.code ?? 'REQUEST_FAILED', result?.error?.message ?? result?.errors?.[0]?.message ?? 'Request failed.', response.status)
    }
    return (path.startsWith('/flexi/') ? result.data : result) as T
  }
  const query = (params: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value))
    return search.size ? `?${search}` : ''
  }
  return {
    signup: async (input: { email: string; password: string; displayName: string; timezone: string; weeklyGoal?: number; avatar?: Avatar }) => {
      const displayName = text(input.displayName, 'displayName', 60)
      const zone = timezone(input.timezone)
      const weeklyGoal = integer(input.weeklyGoal ?? 3, 'weeklyGoal', 1, 7)
      const avatar = input.avatar ?? 'bunny'
      if (!AVATARS.includes(avatar)) throw new FlexiAPIError('INVALID_INPUT', 'Invalid character.', 400)
      const { data, error } = await browserSupabase().auth.signUp({
        email: input.email, password: input.password,
        options: { data: { displayName, timezone: zone, weeklyGoal, avatar } },
      })
      if (error) throw new FlexiAPIError(error.code ?? 'SIGNUP_FAILED', error.message, error.status ?? 400)
      return { user: data.user, requiresEmailConfirmation: !data.session }
    },
    login: async (email: string, password: string) => {
      const { data, error } = await browserSupabase().auth.signInWithPassword({ email, password })
      if (error) throw new FlexiAPIError(error.code ?? 'LOGIN_FAILED', error.message, error.status ?? 401)
      return { user: data.user }
    },
    logout: async () => {
      const { error } = await browserSupabase().auth.signOut()
      if (error) throw new FlexiAPIError(error.code ?? 'LOGOUT_FAILED', error.message, error.status ?? 500)
    },
    session: () => browserSupabase().auth.getSession(),
    onAuthStateChange: (callback: Parameters<ReturnType<typeof browserSupabase>['auth']['onAuthStateChange']>[0]) => browserSupabase().auth.onAuthStateChange(callback),
    train: () => request<Train>('/flexi/train'),
    profile: () => request<PublicProfile>('/flexi/profile'),
    updateProfile: (input: { displayName?: string; avatar?: Avatar }) => request<PublicProfile>('/flexi/profile', 'PATCH', input),
    progress: () => request<Progress>('/flexi/progress'),
    content: (kind?: 'news' | 'tutorial', page = 1) => request<Page<TrainingContent>>(`/flexi/content${query({ kind, page })}`),
    workouts: (page = 1) => request<Page<PublicWorkout>>(`/flexi/workouts${query({ page })}`),
    workout: (id: string) => request<PublicWorkout>(`/flexi/workouts/${encodeURIComponent(id)}`),
    logWorkout: (input: Omit<WorkoutInput, 'exercises'> & { exercises?: WorkoutInput['exercises'] }) => request<{ workout: PublicWorkout; replayed: boolean }>('/flexi/workouts', 'POST', input),
    voidWorkout: (id: string) => request<PublicWorkout>(`/flexi/workouts/${encodeURIComponent(id)}`, 'DELETE'),
    calendar: (from: string, to: string, page = 1) => request<Page<CalendarEvent>>(`/flexi/calendar${query({ from, to, page })}`),
    createCalendarEvent: (input: Omit<CalendarInput, 'status'> & { status?: CalendarInput['status'] }) => request<CalendarEvent>('/flexi/calendar', 'POST', input),
    updateCalendarEvent: (id: string, input: Partial<CalendarInput>) => request<CalendarEvent>(`/flexi/calendar/${encodeURIComponent(id)}`, 'PATCH', input),
    cancelCalendarEvent: (id: string) => request<CalendarEvent>(`/flexi/calendar/${encodeURIComponent(id)}`, 'DELETE'),
    character: () => request<Character>('/flexi/character'),
    updateCharacter: (input: { avatar?: Avatar; equippedCosmeticId?: string | null }) => request<Character>('/flexi/character', 'PATCH', input),
    shop: (page = 1) => request<Page<ShopItem> & { level: number }>(`/flexi/shop${query({ page })}`),
    inventory: (page = 1) => request<Page<PopulatedInventory>>(`/flexi/inventory${query({ page })}`),
    claimCosmetic: (id: string) => request<{ inventory: UserCosmetic; replayed: boolean }>(`/flexi/shop/${encodeURIComponent(id)}/claim`, 'POST', {}),
  }
}

export const flexiAPI = createFlexiAPI()

