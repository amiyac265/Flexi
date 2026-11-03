# Flexi backend API handoff

Updated November 2, 2026. This standalone Next.js app uses Supabase Postgres and Auth. Start with [backend-setup.md](backend-setup.md) to provision a project and apply the migration. There is no Figma runtime connection or Payload dependency.

## Frontend starting point

Use `src/lib/flexi-api.ts`. It has typed methods, attaches the Supabase access token, and normalizes API errors. Call it from browser event handlers/effects; importing it alone does not initialize authentication. The frontend remains owned by the Figma team; the existing `FlexiApp.tsx` demo has **not** been connected to these APIs and still contains local demo XP/workout values.

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

The browser client uses Supabase's standard persisted session and automatic refresh. Every custom API request sends `Authorization: Bearer <access_token>`. Server handlers verify the token using Supabase Auth `getUser()` and forward that same user identity to the Data API. The app uses a publishable key, never a service-role key. Cookies are not an authentication mechanism for these APIs. There is no SSR-protected account UI in this backend task.

For direct API testing, provide the bearer header. Do not log tokens or passwords. Password recovery UI and hosted email delivery must be completed/verified before public launch; signup/login/logout integration is implemented, but a hosted Auth test has not yet been run.

Home timezone and weekly goal are chosen at signup and fixed for this first release. This avoids silently changing historical reward dates or streak thresholds. Default timezone is UTC; pass the browser's actual IANA timezone during signup. Default weekly goal is 3 workout days. Later editable targets should introduce effective-dated goal history.

## Custom endpoints

All paths below begin with `/api/flexi`. Success is HTTP 200 with `{ "data": ... }`. Failure is `{ "error": { "code": "...", "message": "..." } }`. Reads return `Cache-Control: private, no-store`. JSON request bodies are limited to 128 KB. Unknown submitted fields are rejected. IDs are opaque **strings**.

| Method | Path | Purpose / input |
|---|---|---|
| GET | `/train` | Profile, progress recap, latest 5 workouts, next 3 plans, up to 5 news and 5 tutorials |
| GET | `/profile` | Safe profile fields, no password/session internals |
| PATCH | `/profile` | `displayName?`, `avatar?` |
| GET | `/progress` | Totals, level, daily/weekly streaks, weekly progress |
| GET | `/content?kind=news&page=1&limit=20` | Published content; optional `kind=news|tutorial` |
| GET | `/workouts?page=1&limit=20` | Completed workout history |
| GET | `/workouts/:id` | One owned workout, including a voided record when queried explicitly |
| POST | `/workouts` | Log a completed workout; required `requestId`, `title`, `durationMinutes`; optional `notes`, `exercises` |
| DELETE | `/workouts/:id` | Void a workout; safe to repeat; soft deletion preserves retry identity |
| GET | `/calendar?from=...&to=...&page=1&limit=20` | Owned entries overlapping the requested interval; cancelled entries excluded |
| POST | `/calendar` | Required `title`, `startsAt`, `endsAt`, `timezone`; optional `notes`, `status` |
| PATCH | `/calendar/:id` | Any subset of the same editable calendar fields |
| DELETE | `/calendar/:id` | Cancel an entry; safe to repeat |
| GET | `/character` | Avatar, level, evolution state, preset image path, equipped cosmetic |
| PATCH | `/character` | `avatar?`, `equippedCosmeticId?`; null unequips |
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
    { "name": "Push-ups", "sets": 3, "reps": 10, "weightKg": 0 },
    { "name": "Plank", "durationSeconds": 60 }
  ]
}
```

`exercises` is optional and limited to 30 summaries. This release records a completed workout directly; it does not implement live per-set autosave, workout templates, or a start/finish state machine. Duration must be an integer from 1 to 1,440 minutes. The server assigns owner, completion time, and local date. Client-submitted XP, level, owner, completion date, or timestamps are rejected.

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

Overlaps and past entries are allowed for this prototype. Partial edits merge inside a transaction; concurrent edits to the same field use the last committed value. No slot recommendation, recurrence, external calendar sync, reminder worker, or automatic workout linkage is implemented. Marking a calendar entry completed **does not** award XP; log an actual workout separately. Calendar create is not idempotent; after an uncertain network timeout, reload before intentionally creating another entry.

## Cosmetics and character

Use the existing `bunny`, `panda`, `turtle`, and `deer` characters. Level 5 switches to the existing evolved image. The character endpoint returns the appropriate `/avatars/...` image path.

Cosmetics have a `minimumLevel`. An eligible user can claim an item once and equip it. One cosmetic is equipped at a time in this release; `slot` is descriptive metadata for future layering. The server verifies inventory ownership before equipping. Archiving a catalog item hides it from the shop and character response while retaining the inventory record. Inventory returns `item: null` for an unavailable/archived catalog item; handle that state. Content and cosmetics expose optional `imageUrl` HTTPS strings instead of Payload Media relationships.

No card payments, token balance, item trading, currency deduction, or battle pass exists. The button should say “Claim” or “Unlock,” not imply a paid purchase.

## Editorial content and catalog

Manage `training_content` and `cosmetic_items` through Supabase Dashboard Table Editor. App users have no write privileges to these tables. The optional `supabase/seed.sql` contains two starter cosmetics and an app-use tutorial. It does not seed fake news, accounts, or exercise histories.

For content, set `status = published` and a `published_at` date that has arrived. For cosmetics, set `active = true` and a `minimum_level`. Optional `image_url` fields accept HTTPS URLs, including public Supabase Storage URLs managed by your team. User uploads and storage-bucket policies are not part of this MVP. Preset animal avatars already live in `public/avatars`.

News is editorial content, not an automatically fetched live news service. Empty content and shop results are expected until editors add records or apply the optional seed.

## Implementation and verification

- Schema: `supabase/migrations/20261102000000_flexi_core.sql` (seven app tables, including the preserved editorial leaderboard).
- Routes: `src/app/api/flexi/[...path]/route.ts` delegates to 18 handlers in `src/backend/endpoints.ts`.
- API DTOs/mapping: `src/backend/data.ts`; SQL row/RPC types: `src/backend/database.types.ts`.
- All app tables use RLS. Personal data is visible only to its owner. Ordinary app roles have SELECT grants only; writes go through authenticated database functions.
- Workout logging, voiding, calendar mutations, profile changes, and cosmetic claims are transactional. Private helper functions are not exposed through the Data API. Same-account mutations lock the profile first; unique keys also enforce retry identity and one claim per item.
- Progress uses a database aggregation over all owned completed days, avoiding the Data API row cap. XP and streaks are computed from those dates, with no editable balance.

Run `pnpm typecheck`, `pnpm test:backend`, `pnpm test:database`, and `pnpm build`. The HTTP tests mock Supabase network responses. Database tests execute real PostgreSQL policies/functions in PGlite with Auth schema stand-ins; its queued requests are serialized. `pnpm test:database:native` adds actual separate-connection race tests when native PostgreSQL tools can run. Native execution was blocked by sandbox shared-memory permissions in this session.

Use `pnpm smoke:api` after setting up a hosted project and a dedicated test account, as described in the setup guide. Verify signup/email confirmation/login/logout, real persistence after reload, and account isolation there. A successful local build does not mean a cloud database has been provisioned.

The frontend `FlexiApp.tsx` still uses demo personal progress values and is not yet wired to this client. The existing leaderboard display now reads Supabase's editorial `leaderboard_entries`; no live user rankings were added. Friends, friend activity, community competition, battle pass, external news ingestion, notifications, account deletion/export, advanced onboarding/preferences, and mobile health integrations remain future work.
