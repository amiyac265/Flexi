/** Public OpenAPI contract. Contains no environment values, credentials, or user data. */
type Schema = Record<string, unknown>
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const string = (maxLength?: number): Schema => ({ type: 'string', ...(maxLength ? { maxLength } : {}) })
const integer = (minimum = 0, maximum?: number): Schema => ({ type: 'integer', minimum, ...(maximum === undefined ? {} : { maximum }) })
const uuid = { type: 'string', format: 'uuid' }
const timestamp = { type: 'string', format: 'date-time' }
const nullableURL = { type: 'string', format: 'uri', nullable: true }
const avatar = { type: 'string', enum: ['bunny', 'panda', 'turtle', 'deer'] }
const obj = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({ type: 'object', properties, ...(required.length ? { required } : {}) })
const input = (properties: Record<string, Schema>, required: string[] = []): Schema => ({ ...obj(properties, required), additionalProperties: false })
const array = (items: Schema): Schema => ({ type: 'array', items })
const page = (items: Schema, extra: Record<string, Schema> = {}): Schema => obj({ docs: array(items), totalDocs: integer(), page: integer(1), totalPages: integer(), hasNextPage: { type: 'boolean' }, ...extra })
const profileFields = { displayName: { ...string(60), minLength: 1 }, avatar }
const exerciseFields = { name: { ...string(120), minLength: 1 }, sets: integer(1, 100), reps: integer(1, 1000), weightKg: { type: 'number', minimum: 0, maximum: 2000 }, durationSeconds: integer(1, 86400) }
const workoutFields = {
  requestId: { type: 'string', pattern: '^[a-zA-Z0-9_-]{8,80}$', description: 'Generate once per intended workout; reuse the same ID and payload for retries.' },
  title: { ...string(120), minLength: 1 }, durationMinutes: integer(1, 1440), notes: string(2000),
  exercises: { ...array(ref('Exercise')), maxItems: 30, default: [] },
}
const calendarFields = {
  title: { ...string(120), minLength: 1 }, startsAt: timestamp, endsAt: timestamp,
  timezone: { ...string(100), example: 'America/New_York' }, notes: string(2000),
  status: { type: 'string', enum: ['planned', 'completed', 'cancelled'], default: 'planned' },
}
const cosmetic = obj({ id: uuid, slug: string(), name: string(), description: { type: 'string', nullable: true }, slot: { type: 'string', enum: ['hat', 'outfit', 'accessory'] }, minimumLevel: integer(1, 1000), active: { type: 'boolean' }, imageUrl: nullableURL })
const inventoryFields = { id: uuid, owner: uuid, item: uuid, acquiredAt: timestamp }
const schemas: Record<string, Schema> = {
  Profile: obj({ id: uuid, ...profileFields, timezone: string(), weeklyGoal: integer(1, 7), createdAt: timestamp }),
  ProfileUpdate: input(profileFields),
  Exercise: input(exerciseFields, ['name']),
  WorkoutInput: input(workoutFields, ['requestId', 'title', 'durationMinutes']),
  Workout: obj({ id: uuid, ...workoutFields, completedAt: timestamp, localDate: { type: 'string', format: 'date' }, status: { type: 'string', enum: ['completed', 'voided'] }, voidedAt: { ...timestamp, nullable: true } }),
  WorkoutResult: obj({ workout: ref('Workout'), replayed: { type: 'boolean' } }),
  WorkoutPage: page(ref('Workout')),
  CalendarInput: input(calendarFields, ['title', 'startsAt', 'endsAt', 'timezone']),
  CalendarUpdate: input(calendarFields),
  CalendarEvent: obj({ id: uuid, owner: uuid, ...calendarFields, createdAt: timestamp }),
  CalendarPage: page(ref('CalendarEvent')),
  Progress: obj({
    totalWorkouts: integer(), totalMinutes: integer(), activeDays: integer(), totalXp: integer(), level: integer(1), xpIntoLevel: integer(0, 499), xpToNextLevel: integer(1, 500),
    levelProgressPercent: { type: 'number', minimum: 0, maximum: 100 }, dailyStreak: integer(), weeklyStreak: integer(), bestWeeklyStreak: integer(), weeklyGoal: integer(1, 7),
    weekStart: { type: 'string', format: 'date' }, completedDaysThisWeek: integer(0, 7), currentWeekPending: { type: 'boolean' }, lastWorkoutDate: { type: 'string', format: 'date', nullable: true },
  }),
  Content: obj({ id: uuid, slug: string(), title: string(), kind: { type: 'string', enum: ['news', 'tutorial'] }, summary: string(), body: { type: 'string', nullable: true }, sourceUrl: nullableURL, imageUrl: nullableURL, publishedAt: timestamp }),
  ContentPage: page(ref('Content')),
  Cosmetic: cosmetic,
  Character: obj({ avatar, level: integer(1), evolved: { type: 'boolean' }, imagePath: string(), equippedCosmetic: { ...cosmetic, nullable: true } }),
  CharacterUpdate: input({ avatar, equippedCosmeticId: { ...uuid, nullable: true, description: 'An owned, active catalog item ID; null unequips.' } }),
  ShopPage: page({ allOf: [ref('Cosmetic'), obj({ owned: { type: 'boolean' }, unlocked: { type: 'boolean' } })] }, { level: integer(1) }),
  Inventory: obj(inventoryFields),
  InventoryPage: page(obj({ ...inventoryFields, item: { ...cosmetic, nullable: true, description: 'Null if the catalog item is archived or unavailable.' } })),
  ClaimResult: obj({ inventory: ref('Inventory'), replayed: { type: 'boolean' } }),
  Train: obj({ profile: ref('Profile'), progress: ref('Progress'), recentWorkouts: array(ref('Workout')), upcomingWorkouts: array(ref('CalendarEvent')), news: array(ref('Content')), tutorials: array(ref('Content')) }),
  Error: obj({ error: obj({ code: string(), message: string() }) }),
}
const pagination = [
  { name: 'page', in: 'query', schema: { ...integer(1, 100000), default: 1 } },
  { name: 'limit', in: 'query', schema: { ...integer(1, 100), default: 20 } },
]
const idParameter = { name: 'id', in: 'path', required: true, description: 'Copy an ID from the corresponding list or creation response.', schema: uuid }
const errors = Object.fromEntries(Object.entries({
  '400': 'Invalid submitted fields or query parameters.', '401': 'Missing, invalid, or expired access token.', '403': 'Operation not permitted, item not owned, or required level not reached.',
  '404': 'Record unavailable to this account.', '409': 'Retry ID reused for a different workout.', '413': 'JSON body exceeds 128 KB.', '415': 'Send application/json.',
  '500': 'Unexpected server error.', '503': 'Supabase is not configured or the database request failed.',
}).map(([status, description]) => [status, { description, content: { 'application/json': { schema: ref('Error') } } }]))
type Operation = { operationId: string; tags: string[]; summary: string; description?: string; parameters?: unknown[]; requestBody?: unknown; responses: Record<string, unknown> }
function operation(operationId: string, tag: string, summary: string, response: string, options: { description?: string; parameters?: unknown[]; body?: string; example?: unknown } = {}): Operation {
  return {
    operationId, tags: [tag], summary, description: options.description, parameters: options.parameters,
    ...(options.body ? { requestBody: { required: true, content: { 'application/json': { schema: ref(options.body), example: options.example } } } } : {}),
    responses: { '200': { description: 'Success. Data is wrapped in a data property.', content: { 'application/json': { schema: obj({ data: ref(response) }) } } }, ...errors },
  }
}
export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Flexi API', version: '1.0.0',
    description: 'Single-user fitness backend: Train, profiles, workouts, progress, calendar, characters, and cosmetics. Sign in above or use Authorize with a Supabase access token (without the Bearer prefix). All operations require authentication. Try it out makes real requests to this app and its configured database. Signup and login are handled by Supabase Auth, not these API routes. Personal responses are not cached.',
  },
  servers: [{ url: '/api/flexi', description: 'This application' }],
  security: [{ bearerAuth: [] }],
  tags: ['Train', 'Profile', 'Workouts', 'Calendar', 'Character', 'Shop'].map(name => ({ name })),
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Supabase Auth access token. Paste only the token, without Bearer.' } }, schemas },
  paths: {
    '/train': { get: operation('getTrain', 'Train', 'Get home recap', 'Train', { description: 'Progress, five recent workouts, three upcoming plans, and up to five news and tutorial entries.' }) },
    '/content': { get: operation('getContent', 'Train', 'List published news or tutorials', 'ContentPage', { parameters: [...pagination, { name: 'kind', in: 'query', schema: { type: 'string', enum: ['news', 'tutorial'] } }] }) },
    '/profile': {
      get: operation('getProfile', 'Profile', 'Read your profile', 'Profile'),
      patch: operation('updateProfile', 'Profile', 'Change display name or avatar', 'Profile', { body: 'ProfileUpdate', example: { displayName: 'Test Athlete', avatar: 'bunny' }, description: 'Timezone and weekly goal are fixed at signup in this release.' }),
    },
    '/progress': { get: operation('getProgress', 'Profile', 'Get XP, level and streaks', 'Progress', { description: '100 XP per distinct completed local workout day; 500 XP per level. Multiple logs on one day do not multiply XP.' }) },
    '/workouts': {
      get: operation('listWorkouts', 'Workouts', 'List completed workouts', 'WorkoutPage', { parameters: pagination }),
      post: operation('logWorkout', 'Workouts', 'Log a completed workout', 'WorkoutResult', {
        body: 'WorkoutInput', example: { requestId: 'swagger-workout-001', title: 'Upper body', durationMinutes: 30, exercises: [{ name: 'Push-ups', sets: 3, reps: 10 }] },
        description: 'Use a NEW requestId for each intentional workout. Repeating the same ID and normalized payload safely returns the original record. A changed payload with that ID returns 409. The database assigns owner and completion date/time.',
      }),
    },
    '/workouts/{id}': {
      get: operation('getWorkout', 'Workouts', 'Read an owned workout', 'Workout', { parameters: [idParameter], description: 'Also returns your voided records when queried directly.' }),
      delete: operation('voidWorkout', 'Workouts', 'Void a workout', 'Workout', { parameters: [idParameter], description: 'Soft deletion removes its progress contribution; safe to repeat. Other workouts on the same day retain that day’s XP.' }),
    },
    '/calendar': {
      get: operation('listCalendar', 'Calendar', 'List calendar entries overlapping a range', 'CalendarPage', { parameters: [...pagination, { name: 'from', in: 'query', schema: timestamp, description: 'Default: seven days ago.' }, { name: 'to', in: 'query', schema: timestamp, description: 'Default: 30 days ahead. Positive interval, maximum 93 days.' }] }),
      post: operation('createCalendarEvent', 'Calendar', 'Plan a workout', 'CalendarEvent', { body: 'CalendarInput', example: { title: 'Gym', startsAt: '2026-11-05T18:00:00-05:00', endsAt: '2026-11-05T19:00:00-05:00', timezone: 'America/New_York' }, description: 'End after start; maximum 24 hours. Overlaps and past entries are allowed. Calendar completion never awards XP. Creation is not retry-idempotent.' }),
    },
    '/calendar/{id}': {
      patch: operation('updateCalendarEvent', 'Calendar', 'Edit a calendar entry', 'CalendarEvent', { parameters: [idParameter], body: 'CalendarUpdate', example: { title: 'Leg day', notes: 'Bring water' }, description: 'Partial fields are merged atomically. Calendar status is independent of actual workout logs.' }),
      delete: operation('cancelCalendarEvent', 'Calendar', 'Cancel a calendar entry', 'CalendarEvent', { parameters: [idParameter], description: 'Sets status to cancelled; safe to repeat.' }),
    },
    '/character': {
      get: operation('getCharacter', 'Character', 'Read avatar, evolution and equipment', 'Character'),
      patch: operation('updateCharacter', 'Character', 'Change avatar or equip a cosmetic', 'Character', { body: 'CharacterUpdate', example: { avatar: 'panda', equippedCosmeticId: null }, description: 'Use a cosmetic item ID from the shop, not an inventory row ID. Claim it first. Null unequips.' }),
    },
    '/shop': { get: operation('listShop', 'Shop', 'List active cosmetics with eligibility', 'ShopPage', { parameters: pagination }) },
    '/shop/{id}/claim': { post: operation('claimCosmetic', 'Shop', 'Claim a level-unlocked cosmetic', 'ClaimResult', { parameters: [idParameter], description: 'No payment or currency. Claims are deduplicated per user/item. Reach minimumLevel first. Already claimed items remain owned after voiding workouts.' }) },
    '/inventory': { get: operation('listInventory', 'Shop', 'List owned cosmetics', 'InventoryPage', { parameters: pagination }) },
  },
}
