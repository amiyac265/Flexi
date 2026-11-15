# Flexi

Standalone Next.js + React + Tailwind app with Supabase Postgres/Auth. This code was downloaded from Figma Make; it does not depend on a Figma runtime or database connection.

Start with [backend setup](docs/backend-setup.md), then [API integration](docs/backend-api.md) and [database schema](docs/database-schema.md).

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
# Configure your Supabase project and apply migrations as described in the setup guide.
pnpm dev
```

```sh
pnpm typecheck
pnpm test:backend
pnpm test:database
pnpm build
pnpm test:frontend
```

The backend supports personal workouts/progress, calendar, characters, editorial content, and level-unlocked cosmetics. The November Figma frontend is connected to `src/lib/flexi-api.ts`, including authentication, onboarding, workout history, calendar planning and layered avatar outfits. Apply the new `20261114000000_frontend_integration.sql` migration before using it. Social interactions and battle passes are deferred. No hosted database has been provisioned by this repository alone.

Interactive API testing: start the app and open **http://localhost:3000/api-docs**. Raw OpenAPI: **http://localhost:3000/api/openapi**. Sign in with a confirmed Supabase test account on the docs page; the app and API docs use separate login sessions.

Browser tests use isolated Auth/API fixtures. Install Chromium with `pnpm exec playwright install chromium`, or use installed Chrome with `PLAYWRIGHT_CHANNEL=chrome pnpm test:frontend`. Hosted Auth/email validation remains a deployment check. See the [integration plan](docs/frontend-integration-plan.md).
