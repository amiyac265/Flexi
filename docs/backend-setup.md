# Run Flexi independently of Figma

## Interactive Swagger docs

Start the app with `corepack pnpm dev`, then open **http://localhost:3000/api-docs**. The OpenAPI JSON is available at **http://localhost:3000/api/openapi** for importing into Postman or Insomnia.

1. Apply the Supabase migration and configure `.env.local` as described in the setup guide.
2. In Supabase **Authentication → Users**, create a dedicated test user with a confirmed email.
3. Sign in with that account at the top of `/api-docs`. The page automatically authorizes Swagger with the account's access token. Alternatively, click **Authorize** and paste an existing Supabase access token without the `Bearer` prefix.
4. Expand **GET /profile** or **GET /train**, click **Try it out**, then **Execute**.
5. To test a write, use **POST /workouts**. Choose a new `requestId` for each intentional workout; reuse the same ID and payload to test retry handling. Copy returned IDs into GET/DELETE operations.

All 21 endpoints include request/response schemas. Requests affect the configured database: use a test account. Swagger's login session is memory-only, separate from the app's persisted login, and expires on reload. Passwords/tokens are not sent to a third-party Swagger validator; UI assets are served by this app. The docs are public, while the API remains authenticated and protected by the same database policies. Swagger remains independent of the app’s login and onboarding screens.

Updated November 14, 2026. This is a downloaded Next.js/React/Tailwind app. Supabase hosts Postgres and Auth; Next.js runs the frontend and `/api/flexi/*` routes. No Figma account, runtime, database, or environment variables are required.

The repository contains the app and versioned migrations. Local connection settings may already exist; verify the target project before applying anything. This frontend integration does not apply migrations or modify the hosted database.

## 1. Create your Supabase project

Create a project in the [Supabase Dashboard](https://supabase.com/dashboard). Use a development project first. Keep the database password in your password manager.

From the project's **Connect** dialog, find the project URL and **publishable key**. These are the only Supabase settings the running app needs. Do not use the secret/service-role key: app requests must retain row-level security.

## 2. Apply the database migration

Use the Supabase CLI from this repository. The project reference appears in the dashboard project URL. Install/authenticate following the [official CLI instructions](https://supabase.com/docs/guides/local-development/cli/getting-started), then:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --remote --dry-run
supabase db push --remote
```

Review the linked project and dry-run output before pushing. Supply credentials only through the CLI's secure prompts/environment support, not source or chat. A new project applies all six versioned migrations, including `20261120000000_friends.sql`. Existing projects apply only pending migrations. Never edit or reapply an applied migration.

The migrations create the app tables, the Auth signup trigger, private-read policies, and the mutation functions. It does not drop existing tables. If the project already has tables with these names, stop and inspect instead of resetting it. Future changes must be new migration files. See [Supabase's migration workflow](https://supabase.com/docs/guides/local-development/database-migrations).

Optionally open the project's SQL Editor and run `supabase/seed.sql` to add six starter cosmetics and an app-use tutorial. These are sample catalog entries, not news or workout history. You can edit/archive them in Table Editor. No seed has been applied remotely yet.

## 3. Configure this app

Use Node 24.22.1 or newer and the pnpm version pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Edit `.env.local` locally:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

The URL and publishable key are intentionally browser-visible. Never put a secret key, database password, or service-role token in a `NEXT_PUBLIC_*` variable. Restart the dev server after changing configuration.

In Supabase **Authentication → URL Configuration**, set the development Site URL to `http://localhost:3000`. Add your development and deployment origins (ending in `/`) to the allowed redirect URLs for password recovery. Keep email confirmation enabled; confirm the test account's email before logging in. Before external users join, configure your project's email delivery and appropriate signup protection/rate limits. [Supabase email/password signup](https://supabase.com/docs/reference/javascript/auth-signup)

```sh
pnpm dev
```

Visit `http://localhost:3000`. The app opens on the new sign-in screen and restores existing sessions. Missing configuration displays a setup error. Apply all pending migrations before signing in: the new frontend requires the integration fields. No demo personal counters are shown.

## 4. Test the integrated frontend and persistence

Use `src/lib/flexi-api.ts` in browser event handlers/effects. See [backend-api.md](backend-api.md) for all 21 endpoints and their contracts. Signup/login call Supabase Auth directly. API calls attach the user's access token; the server verifies it with Supabase and keeps the same identity for database calls.

There are no old `/api/users/*` or Payload `/admin` routes. Use Supabase Dashboard to manage editorial content/catalogs. Signup, email confirmation, login/logout, password recovery, four-step onboarding, workout logging/history, calendar planning, character selection and layered cosmetics are connected. Friend codes support immediate mutual connections; shared activity, live rankings, and battle passes remain deferred.

For a hosted backend smoke test with a dedicated test account:

1. In Supabase Authentication, create a dedicated test user and confirm their email (or use the normal signup flow). The migration's trigger creates their profile.
2. Create a local, gitignored `.env.smoke` with `SMOKE_TEST_EMAIL`, `SMOKE_TEST_PASSWORD`, and optionally `SMOKE_BASE_URL=http://localhost:3000`.
3. With the app running, run `pnpm smoke:api`.

The smoke test logs in, checks auth and reads, logs/retries/voids one workout, creates/edits/cancels one calendar entry, and logs out. It prints results, not credentials or tokens. It intentionally leaves soft-deleted test records. Use a dedicated development account. A real hosted smoke test has not been run in this session.

## 5. Deploy independently

Deploy this repository as a **Next.js** app to a Node-compatible host such as Vercel. The build command is `pnpm build`; this is not a Vite `dist` deployment. Supply the three environment variables above in the host's settings before building. Public variables are compiled into browser bundles, so rebuild after changing them.

Set `NEXT_PUBLIC_SITE_URL` and Supabase Auth Site URL to the deployed HTTPS origin. Use separate Supabase projects for production and development when you start storing real user data. Apply reviewed migrations to the intended project before deploying code that requires them. Validate signup, email confirmation, login, logout, reload persistence, and account isolation after deployment.

Figma remains a source of frontend designs. Bring later exports into a branch and review their diffs; do not overwrite `supabase/`, API routes, Supabase clients, configuration, or backend docs with a new export.

## Checks and limits

```sh
pnpm typecheck
pnpm test:backend
pnpm test:database
pnpm build
pnpm test:frontend
```

- `test:backend` exercises the native HTTP handlers and domain rules; Auth/Data API network responses are mocked.
- `test:database` executes the actual migration, RLS, constraints, and functions in embedded PostgreSQL (PGlite), with a minimal Supabase Auth schema stand-in. It does not test Supabase's hosted Auth/email/PostgREST service.
- Optional `pnpm test:database:native` uses installed `initdb`, `pg_ctl`, and `psql` to create a new disposable local cluster, run the same SQL checks, and test simultaneous requests over eight connections. It never uses a hosted connection. This check passed outside the sandbox. PGlite serializes queued requests, so the native test additionally verifies eight simultaneous workout retries, claims and calendar retries.
- Shared social activity/live rankings, external news ingestion, payments, battle passes, reminders, and advanced scheduling are deferred. News is editor-managed, not a live external feed.

## November frontend acceptance check

After reviewing and applying the new migration on a development project:

1. Sign up, confirm the email, sign in, complete onboarding, and reload. Verify the saved name, goal, preferences and timezone.
2. Request a password reset and follow the email link back to the app. Set a new password and verify it works after logout. This validates the project-specific email service and redirect allowlist, which local fixtures cannot verify.
3. Log a strength workout with multiple exercises and per-set reps/weight, intensity, notes and a past time. Then log cardio with an activity, duration, distance/unit, and no intensity. Log a sport with its type and duration. Reload; verify all histories and 100 XP per distinct local day. Log another workout on that day; verify no additional XP. Remove a workout and verify recalculated totals.
4. Schedule a workout, navigate months, reload, mark the plan complete/cancel it, and explicitly export a saved event to Google Calendar. Calendar status alone must not award XP.
5. Claim eligible cosmetics, preview/equip different slots, switch avatars and reload. Confirm locked and unowned items cannot be equipped; archived items remain owned without rendering.
6. Sign out, sign into a second test account, and verify that history, equipment, calendar and retry drafts do not leak across accounts.

`pnpm test:frontend` uses fake Auth/API responses against an isolated local Next.js server; it never needs `.env.smoke`. Install Chromium with `pnpm exec playwright install chromium` or run with `PLAYWRIGHT_CHANNEL=chrome` when Chrome is installed. These browser tests complement SQL/RLS tests; they do not replace the hosted acceptance check above.


## Demo: add a friend

Apply the new `20261120000000_friends.sql` migration to the intended development project. It backfills codes for existing profiles, gives new signups a code automatically, and adds the friendship table and authenticated RPCs. It preserves existing data. This code change does not apply hosted migrations automatically.

```sh
npx supabase migration list --remote
npx supabase db push --remote --dry-run
# Review the project and pending changes, then:
npx supabase db push --remote
```

Start with `corepack pnpm dev`. Use two confirmed test accounts in separate browser profiles (or one regular and one incognito window). Complete onboarding, then open **Social** in each. Copy account B's **Your friend code**, paste it into account A's **Their friend code**, and select **Add friend**. B appears in A's list immediately. Select **Refresh friends** in B to see A. Reload to verify persistence. Repeating the add shows “already friends” without duplicating the connection. Self codes and unknown codes display errors. Only display name and character are shown; private workout data remains private.

The Social tab fetches friend data independently so a missing migration does not break the rest of the app. Apply the migration and select **Refresh friends** if this section reports a backend setup error. Browser tests use mocked accounts; the two-account hosted check above remains necessary after applying the migration.
