import { expect, test, type Page } from '@playwright/test'
import { calculateProgress, dateKey } from '../../src/backend/domain'
import type { CalendarEvent, UserProfile, WorkoutLog } from '../../src/backend/data'
import type { ShopItem } from '../../src/lib/flexi-api'

const alice = '00000000-0000-4000-8000-000000000001'
const bob = '00000000-0000-4000-8000-000000000002'
const token = (id: string) =>
  `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 86400, role: 'authenticated' })).toString('base64url')}.test-signature`
const pageOf = <T>(docs: T[], page = 1) => ({
  docs: docs.slice((page - 1) * 2, page * 2),
  page,
  totalDocs: docs.length,
  totalPages: Math.ceil(docs.length / 2),
  hasNextPage: page * 2 < docs.length,
})
const catalog: ShopItem[] = [
  {
    id: '00000000-0000-4000-8000-000000000011',
    slug: 'moss-tee',
    name: 'Moss Tee',
    description: 'A fresh look for your daily movement.',
    slot: 'top',
    equipmentSlot: 'top',
    minimumLevel: 1,
    coinPrice: 120,
    active: true,
    imageUrl: null,
    category: 'clothing',
    styleKey: 'training-tee',
    primaryColor: '#7e9d55',
    accentColor: '#e3eccf',
    owned: false,
    unlocked: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000012',
    slug: 'cloud-shoes',
    name: 'Cloud Shoes',
    description: 'A little spring in every step.',
    slot: 'shoes',
    equipmentSlot: 'shoes',
    minimumLevel: 1,
    coinPrice: 100,
    active: true,
    imageUrl: null,
    category: 'clothing',
    styleKey: 'cloud-shoes',
    primaryColor: '#e6dfcf',
    accentColor: '#7d6b91',
    owned: false,
    unlocked: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000013',
    slug: 'quiet-grove',
    name: 'Quiet Grove',
    description: 'A calm place to recharge.',
    slot: 'background',
    equipmentSlot: 'background',
    minimumLevel: 5,
    coinPrice: 200,
    active: true,
    imageUrl: null,
    category: 'backgrounds',
    styleKey: 'quiet-grove',
    primaryColor: '#dfe9cf',
    accentColor: '#b7d5c3',
    owned: false,
    unlocked: false,
  },
]

async function setup(page: Page, onboarded = true) {
  const profiles: Record<string, UserProfile> = Object.fromEntries(
    [alice, bob].map((id) => [
      id,
      {
        id,
        displayName: id === alice ? 'Alice' : 'Bob',
        avatar: 'bunny',
        timezone: 'America/New_York',
        weeklyGoal: 3,
        createdAt: new Date().toISOString(),
        goals: onboarded ? ['stay-consistent'] : [],
        experienceLevel: 'beginner',
        preferredTime: 'flexible',
        calendarProvider: 'none',
        onboardingCompleted: onboarded,
      },
    ]),
  )
  const histories: Record<string, WorkoutLog[]> = { [alice]: [], [bob]: [] }
  const plans: Record<string, CalendarEvent[]> = { [alice]: [], [bob]: [] }
  const outfits: Record<string, Record<string, string>> = { [alice]: {}, [bob]: {} }
  const inventories: Record<string, string[]> = { [alice]: [], [bob]: [] }
  const tokens = { [alice]: token(alice), [bob]: token(bob) }
  let connected = false
  const state = {
    failFriends: false,
    failWorkout: false,
    failCalendar: false,
    failTrain: false,
    requests: [] as Array<{
      path: string
      method: string
      userId: string
      body: Record<string, unknown>
    }>,
    profiles,
    histories,
    plans,
    outfits,
    tokens,
  }
  const authUser = (id: string) => ({
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: id === alice ? 'alice@example.test' : 'bob@example.test',
    created_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
  })
  await page.route('http://127.0.0.1:54329/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname
    const headers = {
      'Access-Control-Allow-Origin': 'http://127.0.0.1:3100',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
    }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const body = req.postDataJSON() ?? {}
    if (path.endsWith('/token')) {
      const id = body.email === 'bob@example.test' ? bob : alice
      if (body.password === 'wrong-password')
        return route.fulfill({
          status: 400,
          headers,
          json: { error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
        })
      return route.fulfill({
        headers,
        json: {
          access_token: tokens[id],
          refresh_token: `test-refresh-${id}`,
          token_type: 'bearer',
          expires_in: 86400,
          user: authUser(id),
        },
      })
    }
    if (path.endsWith('/signup')) return route.fulfill({ headers, json: authUser(alice) })
    if (path.endsWith('/user'))
      return route.fulfill({
        headers,
        json: authUser(req.headers().authorization === `Bearer ${tokens[bob]}` ? bob : alice),
      })
    return route.fulfill({ headers, json: {} })
  })
  await page.route('**/api/flexi/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname.replace('/api/flexi/', ''),
      method = req.method()
    const id =
      req.headers().authorization === `Bearer ${tokens[alice]}`
        ? alice
        : req.headers().authorization === `Bearer ${tokens[bob]}`
          ? bob
          : null
    if (!id)
      return route.fulfill({
        status: 401,
        json: { error: { code: 'AUTH_REQUIRED', message: 'Sign in.' } },
      })
    const body = req.postDataJSON() ?? {},
      profile = profiles[id],
      history = histories[id],
      calendar = plans[id]
    const progress = () => calculateProgress(history, profile.timezone, profile.weeklyGoal)
    const equipped = () => catalog.filter((item) => Object.values(outfits[id]).includes(item.id))
    const character = () => ({
      avatar: profile.avatar,
      level: progress().level,
      evolved: progress().level >= 5,
      imagePath: `/avatars/${profile.avatar}-starter.png`,
      equippedCosmetic: equipped()[0] ?? null,
      equippedCosmetics: equipped(),
    })
    const respond = (data: unknown) =>
      route.fulfill({ headers: { 'Cache-Control': 'private, no-store' }, json: { data } })
    const fail = () =>
      route.fulfill({
        status: 503,
        json: {
          error: { code: 'BACKEND_UNAVAILABLE', message: 'Temporarily unavailable. Please retry.' },
        },
      })
    state.requests.push({ path, method, userId: id, body })
    if (path === 'friends') {
      if (state.failFriends) return fail()
      const ownCode = id === alice ? 'AAAAAAAAAAAA' : 'BBBBBBBBBBBB'
      const otherId = id === alice ? bob : alice
      const friend = { id: otherId, displayName: profiles[otherId].displayName, avatar: profiles[otherId].avatar, addedAt: '2026-11-20T12:00:00Z' }
      if (method === 'GET') return respond({ code: ownCode, friends: connected ? [friend] : [] })
      const code = String(body.code).trim().toUpperCase()
      if (code === ownCode || !['AAAAAAAAAAAA', 'BBBBBBBBBBBB'].includes(code)) return route.fulfill({ status: 400, json: { error: { code: 'INVALID_INPUT', message: code === ownCode ? 'That is your code. Ask a friend for theirs!' : 'No friend found. Check the code and try again.' } } })
      const replayed = connected
      connected = true
      return respond({ friend, replayed })
    }
    if (path === 'train') {
      if (state.failTrain) return fail()
      return respond({
        profile,
        progress: progress(),
        recentWorkouts: history.filter((w) => w.status === 'completed').slice(0, 5),
        upcomingWorkouts: calendar.filter((p) => p.status === 'planned').slice(0, 3),
        news: [],
        tutorials: [
          {
            id: 'tutorial',
            title: 'Make showing up a habit',
            kind: 'tutorial',
            summary: 'Small steps build a routine.',
            body: 'Your first active day earns 100 XP.',
            sourceUrl: null,
          },
        ],
      })
    }
    if (path === 'profile' && method === 'PATCH') {
      Object.assign(profile, body)
      return respond(profile)
    }
    if (path === 'onboarding') {
      Object.assign(profile, body, { onboardingCompleted: true })
      return respond(profile)
    }
    if (path === 'character') {
      if (body.avatar) profile.avatar = body.avatar
      for (const [slot, item] of Object.entries(body.equipped ?? {})) {
        if (item === null) delete outfits[id][slot]
        else outfits[id][slot] = String(item)
      }
      return respond(character())
    }
    if (path === 'shop')
      return respond({
        ...pageOf(
          catalog.map((item) => ({ ...item, owned: inventories[id].includes(item.id) })),
          Number(url.searchParams.get('page') ?? 1),
        ),
        level: progress().level,
      })
    if (path === 'inventory')
      return respond(
        pageOf(
          inventories[id].map((item) => ({
            id: `inventory-${item}`,
            owner: id,
            item: catalog.find((c) => c.id === item),
            acquiredAt: new Date().toISOString(),
          })),
          Number(url.searchParams.get('page') ?? 1),
        ),
      )
    if (path.startsWith('shop/')) {
      const item = path.split('/')[1]
      if (!inventories[id].includes(item)) inventories[id].push(item)
      return respond({ inventory: { id: 'inventory', item, owner: id }, replayed: false })
    }
    if (path === 'workouts' && method === 'GET')
      return respond(
        pageOf(
          history.filter((w) => w.status === 'completed'),
          Number(url.searchParams.get('page') ?? 1),
        ),
      )
    if (path === 'workouts' && method === 'POST') {
      let workout = history.find((w) => w.requestId === body.requestId)
      const replayed = Boolean(workout)
      if (!workout) {
        workout = {
          ...body,
          id: crypto.randomUUID(),
          exercises: [],
          completedAt: new Date().toISOString(),
          localDate: dateKey(new Date(body.performedAt), profile.timezone),
          status: 'completed',
          voidedAt: null,
        } as WorkoutLog
        history.unshift(workout)
      }
      if (state.failWorkout) {
        state.failWorkout = false
        return route.abort('failed')
      }
      return respond({ workout, replayed })
    }
    if (path.startsWith('workouts/') && method === 'DELETE') {
      const workout = history.find((w) => w.id === path.split('/')[1])!
      workout.status = 'voided'
      return respond(workout)
    }
    if (path === 'calendar' && method === 'GET')
      return respond(
        pageOf(
          calendar.filter(
            (p) =>
              p.status !== 'cancelled' &&
              p.startsAt < url.searchParams.get('to')! &&
              p.endsAt > url.searchParams.get('from')!,
          ),
          Number(url.searchParams.get('page') ?? 1),
        ),
      )
    if (path === 'calendar' && method === 'POST') {
      let plan = calendar.find((p) => p.requestId === body.requestId)
      if (!plan) {
        plan = {
          ...body,
          id: crypto.randomUUID(),
          owner: id,
          status: 'planned',
          createdAt: new Date().toISOString(),
        } as CalendarEvent
        calendar.push(plan)
      }
      if (state.failCalendar) {
        state.failCalendar = false
        return route.abort('failed')
      }
      return respond(plan)
    }
    if (path.startsWith('calendar/')) {
      const plan = calendar.find((p) => p.id === path.split('/')[1])!
      Object.assign(plan, method === 'DELETE' ? { status: 'cancelled' } : body)
      return respond(plan)
    }
    throw new Error(`Unmocked endpoint: ${method} ${path}`)
  })
  return state
}
async function login(page: Page, email = 'alice@example.test') {
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('test-password-123')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
}

test('signup confirmation, errors and onboarding save real preferences', async ({ page }, info) => {
  const app = await setup(page, false)
  await page.goto('/')
  await page.getByRole('button', { name: 'New here? Create an account' }).click()
  await page.getByLabel('Your name').fill('Alice')
  await page.getByLabel('Email', { exact: true }).fill('alice@example.test')
  await page.getByLabel('Password', { exact: true }).fill('test-password-123')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Check your email')
  await page.getByLabel('Email', { exact: true }).fill('alice@example.test')
  await page.getByLabel('Password', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(
    page.getByRole('alert').filter({ hasText: 'Invalid login credentials' }),
  ).toBeVisible()
  await login(page)
  await expect(page.getByRole('heading', { name: 'What are you training for?' })).toBeVisible()
  await page.getByRole('button', { name: /Stay consistent/ }).click()
  await noOverflow(page)
  await page.screenshot({ path: info.outputPath('onboarding.png'), fullPage: true })
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: /Intermediate/ }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'More active days' }).click()
  await page.getByRole('button', { name: /Evening/ }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: /Google Calendar/ }).click()
  await page.getByRole('button', { name: 'Finish setup' }).click()
  await expect(page.getByRole('button', { name: 'Log a workout' })).toBeVisible()
  expect(app.profiles[alice]).toMatchObject({
    onboardingCompleted: true,
    weeklyGoal: 4,
    experienceLevel: 'intermediate',
    preferredTime: 'evening',
    calendarProvider: 'google',
  })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Log a workout' })).toBeVisible()
})

test('workout retry survives reload, calendar and outfits persist, logout isolates accounts', async ({
  page,
}, info) => {
  const app = await setup(page)
  await page.goto('/')
  await login(page)
  await expect(page.getByText('0 / 500 XP')).toBeVisible()
  await noOverflow(page)
  app.failWorkout = true
  await page.getByRole('button', { name: 'Log a workout' }).click()
  await expect(page.getByRole('heading', { name: 'What did you do?' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Cardio/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Sport/ })).toBeVisible()
  await page.getByRole('button', { name: /Weight/ }).click()
  await expect(page.getByLabel('Workout title')).toHaveValue(
    /^(Morning|Afternoon|Evening) lift$/,
  )
  await page.getByLabel('Workout title').fill('Leg day')
  await page.getByLabel('Exercise 1 muscle group').selectOption('legs')
  await page.getByLabel('Exercise 1 exercise').selectOption('Squat')
  await page.getByLabel('Exercise 1 set 1 weight in pounds').fill('80')
  await page.getByLabel('Exercise 1 set 1 reps').fill('8')
  await page.getByLabel('Notes optional').fill('Private workout note')
  await page.getByRole('button', { name: 'Save workout', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry saved workout' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Log a workout' }).click()
  await page.getByRole('button', { name: /Weight/ }).click()
  await expect(page.getByLabel('Notes optional')).toHaveValue('Private workout note')
  await page.getByRole('button', { name: 'Retry saved workout' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(app.histories[alice]).toHaveLength(1)
  const logs = app.requests.filter((r) => r.path === 'workouts' && r.method === 'POST')
  expect(logs).toHaveLength(2)
  expect(logs[0].body).toEqual(logs[1].body)
  expect(logs[0].body).toMatchObject({
    activity: 'strength',
    focusArea: 'legs',
    exercises: [
      {
        name: 'Squat',
        muscleGroup: 'legs',
        setDetails: [{ reps: 8, weightKg: 36.287 }],
      },
    ],
  })
  expect(logs[0].body).not.toHaveProperty('intensity')
  await expect(page.getByText('100 / 500 XP')).toBeVisible()
  await page.screenshot({ path: info.outputPath('train.png'), fullPage: true })
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await expect(page.getByText('Private workout note', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Plan a workout' }).click()
  await page.getByLabel('Workout title').fill('Tomorrow’s stretch')
  app.failCalendar = true
  await page.getByRole('button', { name: 'Schedule workout', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry saved plan' })).toBeVisible()
  await page.getByRole('button', { name: 'Retry saved plan' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(app.plans[alice]).toHaveLength(1)
  await expect(page.getByRole('link', { name: 'Add to Google Calendar' })).toHaveAttribute(
    'href',
    /dates=\d{8}T\d{6}Z%2F\d{8}T\d{6}Z/,
  )
  await page.getByRole('button', { name: 'Mark plan complete' }).click()
  await expect(page.getByText(/strength · completed/)).toBeVisible()
  await page.getByRole('button', { name: 'Cancel plan', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Add to Google Calendar' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Next month' }).click()
  await page.getByRole('button', { name: 'Previous month' }).click()
  await page.getByRole('button', { name: /Bao/ }).click()
  await expect(page.getByRole('button', { name: /Bao/ })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Quiet Grove', exact: true })).toBeVisible() // Third catalog item is on page two.
  for (const name of ['Moss Tee', 'Cloud Shoes']) {
    await page
      .locator('.product-card')
      .filter({ has: page.getByRole('heading', { name, exact: true }) })
      .getByRole('button', { name: 'Try on' })
      .click()
    await page.getByRole('button', { name: 'Claim & equip' }).click()
    await expect(page.getByText(`${name} claimed and equipped.`)).toBeVisible()
  }
  expect(Object.keys(app.outfits[alice]).sort()).toEqual(['shoes', 'top'])
  await page.getByRole('button', { name: 'My closet', exact: true }).click()
  await expect(page.locator('.product-card')).toHaveCount(2)
  await expect(page.locator('.product-card').filter({ hasText: 'Quiet Grove' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Discover', exact: true }).click()
  await expect(page.locator('.product-card')).toHaveCount(3)
  await page
    .locator('.product-card')
    .filter({ has: page.getByRole('heading', { name: 'Quiet Grove', exact: true }) })
    .getByRole('button', { name: 'Try on' })
    .click()
  await expect(page.getByRole('button', { name: 'Unlocks at level 5' })).toBeDisabled()
  await noOverflow(page)
  await page.screenshot({ path: info.outputPath('shop.png'), fullPage: true })
  await page.reload()
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Alice', exact: true })).toBeVisible()
  await expect(page.getByText('Training with Bao')).toBeVisible()
  await expect(page.locator('.closet-group .equipped')).toHaveCount(2)
  await noOverflow(page)
  await page.screenshot({ path: info.outputPath('profile.png'), fullPage: true })
  await page.getByRole('button', { name: 'Remove Leg day' }).click()
  await page.getByRole('button', { name: 'Confirm remove' }).click()
  await expect(page.getByText('Private workout note', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: /Log out/ }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible()
  await login(page, 'bob@example.test')
  await expect(page.getByText('0 / 500 XP')).toBeVisible()
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Bob', exact: true })).toBeVisible()
  await expect(page.locator('.closet-group .equipped')).toHaveCount(0)
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((key) => key.startsWith('flexi:')),
    ),
  ).toEqual([])
})

test('strength logging builds, adds and removes per-set exercises', async ({ page }) => {
  await setup(page)
  await page.goto('/')
  await login(page)
  await page.getByRole('button', { name: 'Log a workout' }).click()
  await page.getByRole('button', { name: /Weight/ }).click()
  await expect(page.getByLabel('Workout title')).toBeVisible()
  await expect(page.getByLabel('Exercise 1 exercise')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Delete exercise 1' })).toBeDisabled()
  await page.getByLabel('Exercise 1 muscle group').selectOption('chest')
  await expect(page.getByLabel('Exercise 1 exercise').locator('option')).toHaveText([
    'Select exercise',
    'Bench press',
    'Incline dumbbell press',
    'Chest fly',
    'Push-up',
  ])
  await page.getByLabel('Exercise 1 exercise').selectOption('Bench press')
  await page.getByLabel('Exercise 1 number of sets').fill('2')
  await expect(page.getByLabel(/Exercise 1 set .* weight in pounds/)).toHaveCount(2)
  await expect(page.getByLabel(/Exercise 1 set .* reps/)).toHaveCount(2)
  await page.getByRole('button', { name: 'Add another exercise' }).click()
  await expect(page.getByLabel('Exercise 2 muscle group')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete exercise 1' })).toBeEnabled()
  await page.getByRole('button', { name: 'Delete exercise 2' }).click()
  await expect(page.getByLabel('Exercise 2 muscle group')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Delete exercise 1' })).toBeDisabled()
})

test('cardio logging collects a cardio activity, duration and distance', async ({ page }) => {
  const app = await setup(page)
  await page.goto('/')
  await login(page)
  await page.getByRole('button', { name: 'Log a workout' }).click()
  await page.getByRole('button', { name: /Cardio/ }).click()
  await expect(page.getByLabel('Workout title')).toBeVisible()
  await expect(page.getByLabel('Workout title')).toHaveValue(
    /^(Morning|Afternoon|Evening) cardio$/,
  )
  await expect(page.getByLabel('Activity').locator('option')).toHaveText([
    'Walking',
    'Running',
    'Cycling',
    'Rowing',
    'Swimming',
    'Elliptical',
    'Stair climber',
    'Hiking',
    'Jump rope',
  ])
  await page.getByLabel('Activity').selectOption('swimming')
  await page.getByLabel('Workout title').fill('Pool workout')
  await page.getByLabel('Duration').fill('45')
  await page.getByLabel('Distance').fill('1500')
  await page.getByLabel('Distance unit').selectOption('m')
  await page.getByRole('button', { name: 'Save workout', exact: true }).click()
  const request = app.requests.find((item) => item.path === 'workouts' && item.method === 'POST')
  expect(request?.body).toMatchObject({
    title: 'Pool workout',
    activity: 'swimming',
    durationMinutes: 45,
    distance: 1500,
    distanceUnit: 'm',
  })
  expect(request?.body).not.toHaveProperty('intensity')
  expect(request?.body).not.toHaveProperty('focusArea')
})

test('sport logging collects a sport, duration and optional intensity', async ({ page }) => {
  const app = await setup(page)
  await page.goto('/')
  await login(page)
  await page.getByRole('button', { name: 'Log a workout' }).click()
  await page.getByRole('button', { name: /Sport/ }).click()
  await expect(page.getByLabel('Workout title')).toBeVisible()
  await expect(page.getByLabel('Workout title')).toHaveValue(
    /^(Morning|Afternoon|Evening) game$/,
  )
  await expect(page.getByLabel('Sport').locator('option')).toHaveText([
    'Basketball',
    'Soccer',
    'Football',
    'Tennis',
    'Volleyball',
    'Baseball / softball',
    'Hockey',
    'Golf',
    'Pickleball',
    'Other',
  ])
  await page.getByLabel('Sport').selectOption('tennis')
  await page.getByLabel('Workout title').fill('Tennis practice')
  await page.getByLabel('Duration').fill('75')
  await page.getByRole('button', { name: 'Save workout', exact: true }).click()
  const request = app.requests.find((item) => item.path === 'workouts' && item.method === 'POST')
  expect(request?.body).toMatchObject({
    title: 'Tennis practice',
    activity: 'sports',
    sport: 'tennis',
    durationMinutes: 75,
  })
  expect(request?.body).not.toHaveProperty('intensity')
  expect(request?.body).not.toHaveProperty('focusArea')
  expect(request?.body).not.toHaveProperty('distance')
})

test('load failures have a retry and password reset recovery is handled', async ({
  page,
}, info) => {
  const app = await setup(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Forgot password?' }).click()
  await page.getByLabel('Email', { exact: true }).fill('alice@example.test')
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('status')).toContainText('check your email')
  await page.getByRole('button', { name: 'Back to sign in' }).click()
  app.failTrain = true
  await login(page)
  await expect(page.getByRole('alert').filter({ hasText: 'Temporarily unavailable' })).toBeVisible()
  app.failTrain = false
  await page.getByRole('button', { name: 'Reload your data' }).click()
  await expect(page.getByRole('button', { name: 'Log a workout' })).toBeVisible()
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await page.getByRole('button', { name: /Log out/ }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible()
  await page.goto('about:blank')
  await page.goto(
    `/#access_token=${app.tokens[alice]}&refresh_token=test-refresh&expires_in=86400&token_type=bearer&type=recovery`,
  )
  await expect(page.getByRole('heading', { name: 'Set a new password.' })).toBeVisible()
  await page.getByLabel('Password', { exact: true }).fill('replacement-password')
  await page.getByRole('button', { name: 'Save password', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Log a workout' })).toBeVisible()
  await page.getByRole('button', { name: 'Social', exact: true }).click()
  await expect(
    page.getByText('Curated entries. Live rankings are coming later.'),
  ).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: info.outputPath('social.png'), fullPage: true })
})


test('friend codes connect accounts, survive reload and recover from errors', async ({ page }, info) => {
  const app = await setup(page)
  await page.goto('/')
  await login(page)
  await page.getByRole('button', { name: 'Social', exact: true }).click()
  await expect(page.getByLabel('Your friend code', { exact: true })).toHaveValue('AAAAAAAAAAAA')
  await expect(page.getByText('Your circle starts with one friend.')).toBeVisible()
  await page.screenshot({ path: info.outputPath('friends-empty.png'), fullPage: true })
  const input = page.getByLabel('Their friend code')
  const add = page.getByRole('button', { name: 'Add friend', exact: true })
  await input.fill('short')
  await expect(add).toBeDisabled()
  await input.fill('AAAAAAAAAAAA')
  await add.click()
  await expect(page.locator('.friends-panel').getByRole('alert')).toContainText('That is your code')
  await input.fill('000000000000')
  await add.click()
  await expect(page.locator('.friends-panel').getByRole('alert')).toContainText('No friend found')
  app.failFriends = true
  await input.fill('bbbbbbbbbbbb')
  await add.click()
  await expect(page.locator('.friends-panel').getByRole('alert')).toContainText('Temporarily unavailable')
  await expect(input).toHaveValue('bbbbbbbbbbbb')
  app.failFriends = false
  await add.click()
  await expect(page.locator('.friends-panel').getByRole('status')).toContainText('Bob joined your circle!')
  await expect(page.locator('.friend-person')).toHaveCount(1)
  await input.fill('BBBBBBBBBBBB')
  await add.click()
  await expect(page.locator('.friends-panel').getByRole('status')).toContainText('already friends')
  await expect(page.locator('.friend-person')).toHaveCount(1)
  await page.reload()
  await page.getByRole('button', { name: 'Social', exact: true }).click()
  await expect(page.locator('.friend-person')).toContainText('Bob')
  await noOverflow(page)
  await page.screenshot({ path: info.outputPath('friends-added.png'), fullPage: true })
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await page.getByRole('button', { name: /Log out/ }).click()
  await login(page, 'bob@example.test')
  await page.getByRole('button', { name: 'Social', exact: true }).click()
  await expect(page.getByLabel('Your friend code', { exact: true })).toHaveValue('BBBBBBBBBBBB')
  await expect(page.locator('.friend-person')).toContainText('Alice')
  await expect(page.locator('.friend-person')).not.toContainText('Bob')
  app.failFriends = true
  await page.getByRole('button', { name: 'Refresh friends' }).click()
  await expect(page.locator('.friends-panel').getByRole('alert')).toContainText('Temporarily unavailable')
  app.failFriends = false
  await page.getByRole('button', { name: 'Refresh friends' }).click()
  await expect(page.locator('.friends-panel').getByRole('alert')).toHaveCount(0)
})
