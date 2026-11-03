# Run Flexi independently of Figma

## Interactive Swagger docs

Start the app with `corepack pnpm dev`, then open **http://localhost:3000/api-docs**. The OpenAPI JSON is available at **http://localhost:3000/api/openapi** for importing into Postman or Insomnia.

1. Apply the Supabase migration and configure `.env.local` as described in the setup guide.
2. In Supabase **Authentication → Users**, create a dedicated test user with a confirmed email.
3. Sign in with that account at the top of `/api-docs`. The page automatically authorizes Swagger with the account's access token. Alternatively, click **Authorize** and paste an existing Supabase access token without the `Bearer` prefix.
4. Expand **GET /profile** or **GET /train**, click **Try it out**, then **Execute**.
5. To test a write, use **POST /workouts**. Choose a new `requestId` for each intentional workout; reuse the same ID and payload to test retry handling. Copy returned IDs into GET/DELETE operations.

All 18 endpoints include request/response schemas. Requests affect the configured database: use a test account. Swagger's login session is memory-only, separate from the app's persisted login, and expires on reload. Passwords/tokens are not sent to a third-party Swagger validator; UI assets are served by this app. The docs are public, while the API remains authenticated and protected by the same database policies. This adds a developer testing page, not app onboarding.

Updated November 2, 2026. This is a downloaded Next.js/React/Tailwind app. Supabase hosts Postgres and Auth; Next.js runs the frontend and `/api/flexi/*` routes. No Figma account, runtime, database, or environment variables are required.

The repository contains code and a migration, not a provisioned hosted database. No Supabase project has been connected or deployed by this implementation.

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

Review the linked project and dry-run output before pushing. Supply credentials only through the CLI's secure prompts/environment support, not source or chat. The only migration initially expected is `20261102000000_flexi_core.sql`.

This creates seven app tables, the Auth signup trigger, private-read policies, and the mutation functions. It does not drop existing tables. If the project already has tables with these names, stop and inspect instead of resetting it. Future changes must be new migration files. See [Supabase's migration workflow](https://supabase.com/docs/guides/local-development/database-migrations).

Optionally open the project's SQL Editor and run `supabase/seed.sql` to add two starter cosmetics and an app-use tutorial. These are sample catalog entries, not news or workout history. You can edit/archive them in Table Editor. No seed has been applied remotely yet.

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

In Supabase **Authentication → URL Configuration**, set the development Site URL to `http://localhost:3000`. Keep email confirmation enabled; confirm the test account's email before logging in. Before external users join, configure your project's email delivery and appropriate signup protection/rate limits. [Supabase email/password signup](https://supabase.com/docs/reference/javascript/auth-signup)

```sh
pnpm dev
```

Visit `http://localhost:3000`. The exported design loads without Supabase configured, with an empty editorial leaderboard. Authenticated endpoints require valid configuration and an applied migration. The existing design still has demo personal counters; frontend integration is a separate task.

## 4. Connect the frontend and test persistence

Use `src/lib/flexi-api.ts` in browser event handlers/effects. See [backend-api.md](backend-api.md) for all 18 endpoints and their contracts. Signup/login call Supabase Auth directly. API calls attach the user's access token; the server verifies it with Supabase and keeps the same identity for database calls.

There are no old `/api/users/*` or Payload `/admin` routes. Use Supabase Dashboard to manage editorial content/catalogs. Password reset screens, signup screens, and replacing the demo frontend counters have not been implemented in this backend task.

For a backend smoke test without waiting on the frontend:

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
```

- `test:backend` exercises the native HTTP handlers and domain rules; Auth/Data API network responses are mocked.
- `test:database` executes the actual migration, RLS, constraints, and functions in embedded PostgreSQL (PGlite), with a minimal Supabase Auth schema stand-in. It does not test Supabase's hosted Auth/email/PostgREST service.
- Optional `pnpm test:database:native` uses installed `initdb`, `pg_ctl`, and `psql` to create a new disposable local cluster, run the same SQL checks, and test simultaneous requests over eight connections. It never uses a hosted connection. This check was blocked here by the execution sandbox's shared-memory restriction; PGlite serializes queued requests and cannot prove true connection races.
- Social interactions/rankings, external news ingestion, payments, battle passes, reminders, and advanced scheduling are deferred. News is editor-managed, not a live external feed.
