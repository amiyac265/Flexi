# Flexi backend API handoff

## Interactive Swagger docs

Start the app with `corepack pnpm dev`, then open **http://localhost:3000/api-docs**. The OpenAPI JSON is available at **http://localhost:3000/api/openapi** for importing into Postman or Insomnia.

1. Apply the Supabase migration and configure `.env.local` as described in the setup guide.
2. In Supabase **Authentication → Users**, create a dedicated test user with a confirmed email.
3. Sign in with that account at the top of `/api-docs`. The page automatically authorizes Swagger with the account's access token. Alternatively, click **Authorize** and paste an existing Supabase access token without the `Bearer` prefix.
4. Expand **GET /profile** or **GET /train**, click **Try it out**, then **Execute**.
5. To test a write, use **POST /workouts**. Choose a new `requestId` for each intentional workout; reuse the same ID and payload to test retry handling. Copy returned IDs into GET/DELETE operations.

All 19 endpoints include request/response schemas. Requests affect the configured database: use a test account. Swagger's login session is memory-only, separate from the app's persisted login, and expires on reload. Passwords/tokens are not sent to a third-party Swagger validator; UI assets are served by this app. The docs are public, while the API remains authenticated and protected by the same database policies. Swagger remains independent of the app’s login and onboarding screens.

Updated November 14, 2026. This standalone Next.js app uses Supabase Postgres and Auth. Start with [backend-setup.md](backend-setup.md) to provision a project and apply the migration. There is no Figma runtime connection or Payload dependency.

## Frontend starting point

Use `src/lib/flexi-api.ts`. It has typed methods, attaches the Supabase access token, and normalizes API errors. Call it from browser event handlers/effects; importing it alone does not initialize authentication. The November Figma export is integrated: signup/login/recovery, onboarding, Train, workout history, calendar, character selection, layered outfits, and level-based claims use this client. All personal values come from the API. Social displays only the editorial showcase; friend interactions remain deferred.

```ts
import { flexiAPI } from '@/lib/flexi-api'

const signup = await flexiAPI.signup({
  email, password, displayName,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  weeklyGoal: 3,
  avatar: 'bunny',
})
// If signup.requiresEmailConfirmation, show a confirmation notice and stop here.
// After confirming the email, sign in:
await flexiAPI.login(email, password)
const home = await flexiAPI.train()
// home.progress, home.recentWorkouts, home.upcomingWorkouts, home.news, home.tutorials

// Generate once per intended workout; reuse the SAME requestId for network retries.
const draft = {
  requestId: crypto.randomUUID(),
  title: 'Upper body',
  durationMinutes: 40,
  exercises: [{ name: 'Push-ups', sets: 3, reps: 10, weightKg: 0 }],
}
await flexiAPI.logWorkout(draft)
const progress = await flexiAPI.progress()
```

Use same-origin `/api` inside this app. No cross-origin API access is enabled. If a separately hosted frontend is needed later, implement a reviewed CORS allowlist and preflight handling before using an alternate base URL. Do not assume `createFlexiAPI(otherOrigin)` makes cross-origin access work.

## Authentication

Signup/login/logout use **Supabase Auth directly**, through `flexiAPI.signup`, `login`, and `logout`. There are no `/api/users/*` endpoints or Payload Admin accounts. `signup` returns `{ user, requiresEmailConfirmation }`; if confirmation is required, wait for the user to confirm their email before attempting login. `session()` and `onAuthStateChange()` help the frontend render the appropriate signed-in state. Clear cached private data on logout/account changes.

The browser client uses Supabase's standard persisted session and automatic refresh. Every custom API request sends `Authorization: Bearer <access_token>`. Server handlers verify the token using Supabase Auth `getUser()` and forward that same user identity to the Data API. The app uses a publishable key, never a service-role key. Cookies are not an authentication mechanism for these APIs. Private account UI is loaded in the browser after session restoration; server APIs enforce authentication on every request.

For direct API testing, provide the bearer header. Do not log tokens or passwords. Signup, email-confirmation notices, login, logout, reset-email requests and recovery-password UI are implemented. Hosted email delivery, redirect URLs and Auth flows still need a dedicated hosted smoke test after applying the new migration. Auth listeners update React state without awaiting other Auth calls; data loads happen in separate effects, following [Supabase Auth event guidance](https://supabase.com/docs/reference/javascript/auth-onauthstatechange).

Home timezone is fixed at signup. Weekly goal can be selected during initial onboarding only while no workout has ever been logged, including voided logs. After onboarding or the first workout, it is fixed, preserving historical streak thresholds. Default timezone is UTC; pass the browser's actual IANA timezone during signup. Default weekly goal is 3 workout days. Later editable targets should introduce effective-dated goal history.

## Custom endpoints

All paths below begin with `/api/flexi`. Success is HTTP 200 with `{ "data": ... }`. Failure is `{ "error": { "code": "...", "message": "..." } }`. Reads return `Cache-Control: private, no-store`. JSON request bodies are limited to 128 KB. Unknown submitted fields are rejected. IDs are opaque **strings**.

| Method | Path | Purpose / input |
|---|---|---|
| GET | `/train` | Profile, progress recap, latest 5 workouts, next 3 plans, up to 5 news and 5 tutorials |
| POST | `/onboarding` | `goals`, `experienceLevel`, `weeklyGoal`, `preferredTime`, `calendarProvider`; complete setup or update fitness preferences |
| GET | `/profile` | Safe profile fields, no password/session internals |
| PATCH | `/profile` | `displayName?`, `avatar?` |
| GET | `/progress` | Totals, level, daily/weekly streaks, weekly progress |
| GET | `/content?kind=news&page=1&limit=20` | Published content; optional `kind=news|tutorial` |
| GET | `/workouts?page=1&limit=20` | Completed workout history |
| GET | `/workouts/:id` | One owned workout, including a voided record when queried explicitly |
| POST | `/workouts` | Log a completed workout; required `requestId`, `title`, `durationMinutes`; optional `notes`, `exercises`, `activity`, `intensity`, `focusArea`, `performedAt`, paired `distance`/`distanceUnit`, and `sport` |
| DELETE | `/workouts/:id` | Void a workout; safe to repeat; soft deletion preserves retry identity |
| GET | `/calendar?from=...&to=...&page=1&limit=20` | Owned entries overlapping the requested interval; cancelled entries excluded |
| POST | `/calendar` | Required `title`, `startsAt`, `endsAt`, `timezone`; optional `notes`, `status`, `workoutType`, `requestId` |
| PATCH | `/calendar/:id` | Any subset of calendar fields except immutable `requestId` |
| DELETE | `/calendar/:id` | Cancel an entry; safe to repeat |
| GET | `/character` | Avatar, level, evolution state, preset image path, equipped cosmetic |
| PATCH | `/character` | `avatar?`, `equipped?` slot map, or legacy `equippedCosmeticId?`; null removes equipment |
| GET | `/shop?page=1&limit=20` | Active cosmetics, each with `owned` and `unlocked` flags; current user level |
| POST | `/shop/:id/claim` | Claim a level-eligible cosmetic; duplicate claims return existing inventory |
| GET | `/inventory?page=1&limit=20` | Owned cosmetics, with populated item where still accessible |

Paginated responses contain `docs`, `totalDocs`, `page`, `totalPages`, and `hasNextPage`. Default limit is 20; maximum is 100. Follow `hasNextPage` for complete history, calendar, or inventory. Train deliberately returns a small preview, not all records.

Error codes include `AUTH_REQUIRED` (401), `INVALID_INPUT` (400/413/415), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `BACKEND_NOT_CONFIGURED` / `BACKEND_UNAVAILABLE` (503), and `INTERNAL_ERROR` (500). Another user's resource returns the same unavailable result as an unknown ID. Render these messages as plain text.

## Workout and progression contract

Example request:

```json
{
  "requestId": "d9daf26a-b577-412a-a6ef-783bf0dd93fc",
  "title": "Upper body",
  "durationMinutes": 40,
  "notes": "Felt good",
  "exercises": [
    {
      "name": "Bench press",
      "muscleGroup": "chest",
      "setDetails": [
        { "reps": 10, "weightKg": 40 },
        { "reps": 8, "weightKg": 45 }
      ]
    }
  ]
}
```

`exercises` is limited to 30 entries. New strength workouts require at least one exercise with `muscleGroup` (`chest|back|shoulders|biceps|triceps|legs|glutes|core`) and 1–20 `setDetails`; every set requires integer `reps` and `weightKg` from 0–2,000. Legacy aggregate exercise summaries remain readable and retryable. This release records a completed workout directly; it does not implement live per-set autosave, workout templates, or a start/finish state machine. Duration must be an integer from 1 to 1,440 minutes. The server assigns owner and `completedAt` (receipt time). Optional `performedAt` accepts an offset-qualified ISO instant from 1970 through now; otherwise it defaults to receipt time. SQL derives `localDate` from that time in the fixed account timezone. These values cannot be edited after creation. Client-submitted XP, level, owner, `localDate` and `completedAt` are rejected.

The imported form also stores `activity` (`strength|running|walking|cycling|rowing|swimming|elliptical|stair-climber|hiking|jump-rope|yoga|sports|other`), optional `intensity` (`light|moderate|intense`), and `focusArea` (`arms|chest|legs|full-body`). New cardio workouts require `distance` (0.001–10,000) and `distanceUnit` (`mi|km|m|yd`) together. New sport workouts use activity `sports` and require `sport` (`basketball|soccer|football|tennis|volleyball|baseball-softball|hockey|golf|pickleball|other`). Activity and focus default to `other` and `full-body`; intensity may be null. These details do not change the reward formula. A backdated workout contributes to its actual local day, not the day it was submitted. Historical records retain their original local dates and retry payloads.

POST returns `{ workout, replayed }`. A repeat with the same user/request ID and normalized payload returns the existing record. A different payload with the same ID returns 409. Retrying a voided workout returns its voided state; use a new ID for an intentional replacement. IDs deduplicate within each account.

Progress fields:

```text
totalWorkouts, totalMinutes, activeDays, totalXp, level,
xpIntoLevel, xpToNextLevel, levelProgressPercent,
dailyStreak, weeklyStreak, bestWeeklyStreak,
weeklyGoal, weekStart, completedDaysThisWeek,
currentWeekPending, lastWorkoutDate
```

- 100 XP per distinct local day with one or more completed workouts. More workouts on that day do not award extra XP.
- `level = 1 + floor(totalXp / 500)`; level progress is 0–499 XP, not the demo UI's previous 0–99 scale.
- Weekly streak counts consecutive Monday-start weeks meeting the signup goal. An unfinished current week preserves the streak ending last week. Daily streak is also available for the existing day-streak UI.
- Void removes workout contribution immediately. If another completed workout remains on that date, its daily XP remains. No separately mutable XP counter exists, so duplicate requests and void retries cannot double-adjust a balance.
- Already claimed cosmetics stay owned if a workout is later voided. There is no competitive economy, spendable XP, or purchase currency in this release.

Refetch `train`, `progress`, and `character` after logging or voiding; refetch `shop` when eligibility may change. Do not optimistically award fixed XP in the browser: a second same-day log grants none. Persist the current draft/request ID until the request outcome is known.

## Calendar contract

```json
{
  "title": "Gym after class",
  "startsAt": "2026-11-04T18:00:00-05:00",
  "endsAt": "2026-11-04T19:00:00-05:00",
  "timezone": "America/New_York",
  "status": "planned"
}
```

Use ISO timestamps with a `Z` or numeric offset. Entries may last up to 24 hours. `status` is `planned`, `completed`, or `cancelled`. Range queries require `from < to` and at most 93 days; without a range, the API uses the previous 7 and next 30 days.

Overlaps and past entries are allowed for this prototype. Partial edits merge inside a transaction; concurrent edits to the same field use the last committed value. No slot recommendation, recurrence, external calendar sync, reminder worker, or automatic workout linkage is implemented. Marking a calendar entry completed **does not** award XP; log an actual workout separately. Calendar create accepts an optional `requestId` using the workout-key format. Reuse the same ID and normalized payload after uncertain outcomes; a changed payload returns 409. A retry after edits/cancellation returns the same record in its current state. Omitted keys preserve the original non-idempotent API behavior. `requestId` cannot be changed by PATCH. `workoutType` is `strength|cardio|mobility|sports|recovery`, default `strength`.

The UI loads all pages for the visible month, includes overlapping overnight events, and uses the account timezone for date/time inputs. Nonexistent DST wall-clock times are rejected; ambiguous times use the first occurrence resolved by the timezone converter. Google export is an explicit link in the saved plan’s agenda and does not establish sync. The export includes that plan’s title, notes, time range, and timezone.

## Cosmetics and character

Use the existing `bunny`, `panda`, `turtle`, and `deer` characters. Level 5 switches to the existing evolved image. The character endpoint returns the appropriate `/avatars/...` image path.

Cosmetics have a `minimumLevel`. An eligible user can claim an item once and equip it. Five outfit slots are supported: `top`, `bottom`, `shoes`, `accessory`, and `background`. `PATCH /character` accepts a partial `equipped` map, for example `{"equipped":{"top":"ITEM_UUID","shoes":null}}`. Changes merge under the profile lock and each item must be owned, active, and match its slot. Legacy `hat`/`outfit` catalog slots map to `accessory`/`top` through `equipmentSlot`. Character returns `equippedCosmetics` for all active layers and the legacy `equippedCosmetic`. The old `equippedCosmeticId` input replaces the whole outfit with one item; null clears it. Do not combine the two equipment inputs.

Catalog DTOs also include `category` (`clothing|accessories|backgrounds|special`), `styleKey` (lowercase letters/digits/hyphens, up to 60 characters), and validated six-digit hex `primaryColor`/`accentColor`. Existing IDs, claims and equipment are preserved by the migration. The UI uses these fields for its garment previews. Archiving a catalog item hides it from the shop and character response while retaining the inventory record. Inventory returns `item: null` for an unavailable/archived catalog item; handle that state. Content and cosmetics expose optional `imageUrl` HTTPS strings instead of Payload Media relationships.

No card payments, token balance, item trading, currency deduction, or battle pass exists. The button should say “Claim” or “Unlock,” not imply a paid purchase.

## Editorial content and catalog

Manage `training_content` and `cosmetic_items` through Supabase Dashboard Table Editor. App users have no write privileges to these tables. The optional `supabase/seed.sql` contains six starter cosmetics and an app-use tutorial. It does not seed fake news, accounts, or exercise histories.

For content, set `status = published` and a `published_at` date that has arrived. For cosmetics, set `active = true` and a `minimum_level`. Optional `image_url` fields accept HTTPS URLs, including public Supabase Storage URLs managed by your team. User uploads and storage-bucket policies are not part of this MVP. Preset animal avatars already live in `public/avatars`.

News is editorial content, not an automatically fetched live news service. Empty content and shop results are expected until editors add records or apply the optional seed.

## Implementation and verification

- Schema: `supabase/migrations/20261102000000_flexi_core.sql` and `supabase/migrations/20261114000000_frontend_integration.sql` (seven app tables, including the preserved editorial leaderboard).
- Routes: `src/app/api/flexi/[...path]/route.ts` delegates to 19 handlers in `src/backend/endpoints.ts`.
- API DTOs/mapping: `src/backend/data.ts`; SQL row/RPC types: `src/backend/database.types.ts`.
- All app tables use RLS. Personal data is visible only to its owner. Ordinary app roles have SELECT grants only; writes go through authenticated database functions.
- Workout logging, voiding, calendar mutations, profile changes, and cosmetic claims are transactional. Private helper functions are not exposed through the Data API. Same-account mutations lock the profile first; unique keys also enforce retry identity and one claim per item.
- Progress uses a database aggregation over all owned completed days, avoiding the Data API row cap. XP and streaks are computed from those dates, with no editable balance.

Run `pnpm typecheck`, `pnpm test:backend`, `pnpm test:database`, and `pnpm build`. The HTTP tests mock Supabase network responses. Database tests execute real PostgreSQL policies/functions in PGlite with Auth schema stand-ins; its queued requests are serialized. `pnpm test:database:native` adds actual separate-connection race tests when native PostgreSQL tools can run. Native PostgreSQL checks passed outside the sandbox, including eight simultaneous workout retries, cosmetic claims and calendar retries.

Use `pnpm smoke:api` after setting up a hosted project and a dedicated test account, as described in the setup guide. Verify signup/email confirmation/login/logout, real persistence after reload, and account isolation there. A successful local build does not mean a cloud database has been provisioned.

The frontend restores the Supabase session and mounts private data by account ID. Mutating calls verify that the session still belongs to that account. Account changes unmount cached UI and clear that account’s session-storage retry drafts. No private progress or inventory is read from the Figma export’s old local-storage keys. Workout and calendar submissions retain their payload and request ID in session storage until a confirmed result, surviving reloads in the same tab. Uncertain submissions are frozen and retried as-is. Successful writes are cleared before refreshing, so a refresh failure cannot cause a second intentional submission.

Friends, friend activity, community competition, battle passes, external news ingestion, notifications, account deletion/export, calendar sync, and mobile health integrations remain future work.

## Onboarding preferences

`POST /onboarding` requires all five fields. Goals are 1–6 values from `build-muscle`, `get-stronger`, `lose-weight`, `improve-endurance`, `stay-consistent`, `move-better`. Experience is `beginner|intermediate|advanced`; preferred time is `morning|midday|evening|flexible`; calendar preference is `google|apple|none`. Weekly goal is an integer 1–7. Repeating the same values is safe. Goals, experience and preferences remain editable; changing a locked weekly goal returns 409. Calendar preference does not grant provider access. Profiles return these values plus `onboardingCompleted`.

## Frontend verification

`pnpm test:frontend` starts an isolated Next.js dev server using fake Supabase configuration and browser-intercepted Auth/API fixtures. It exercises the real components and client but does not contact hosted databases or verify hosted email delivery. Run `pnpm exec playwright install chromium` once, or set `PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome. See `tests/frontend/` and `docs/frontend-integration-plan.md`.
