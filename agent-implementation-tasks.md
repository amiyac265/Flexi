# Agent implementation tasks

> **Implementation update — November 2, 2026:** This repo is a standalone download from Figma Make. The user selected Supabase Postgres/Auth. The actual export uses **Next.js + React + Tailwind**, not Vite. The current implementation and setup instructions in [docs/backend-api.md](docs/backend-api.md), [docs/backend-setup.md](docs/backend-setup.md), and [docs/database-schema.md](docs/database-schema.md) supersede conflicting details below. The October proposal is preserved as future design context; it is not a list of implemented tables/features.

Current MVP: signup/login through Supabase Auth; completed workout logs; derived XP, daily/weekly streaks and levels; simple calendar CRUD; preset characters; level-unlocked cosmetics; editorial news/tutorials. There are 18 Next.js API handlers and seven SQL app tables. No Supabase project has yet been provisioned or connected. Social, reminders, active workout sessions, detailed set tracking, automatic scheduling, battle passes, and currency are deferred.

Use with [backend-plan.md](backend-plan.md) and [database-schema.md](database-schema.md). Implement P0 first, then P0b only when that milestone is in scope. Later phases are not part of the initial implementation. This document specifies work to do; no backend or tests have been run against an application repository yet.

## Working rules

1. Inspect repository instructions and existing code before editing. Preserve React/Vite/Tailwind, routing, visual design, and the existing package manager. Follow the existing TypeScript conventions.
2. Make migrations reproducible from a clean local database. Keep schema, permissions, functions, tests, and generated types in Git. Do not leave necessary changes only in the Supabase dashboard.
3. Implement vertical slices: database -> permissions/function -> typed service -> existing UI -> acceptance tests. No fake success responses or browser-only substitutes for backend persistence.
4. The plan's proposed defaults are implementation defaults, not requirements extracted verbatim from the PDF. Record deliberate deviations in a short decision log and update all affected contracts.
5. Never put admin/secret keys in a `VITE_` variable, committed file, browser bundle, or generated frontend helper. Do not introduce a second migration system or rewrite the frontend framework.
6. Prefer short, focused changes with the validation required by the milestone. Complete checks before moving on. Do not silently skip security tests because the UI appears to work.
7. Do not deploy to production, delete existing data, or run a reset against a remote database as part of local setup. Use the team's established release process for the finished implementation.

## T00 — Repository audit and integration map

**Depends on:** nothing.

Inspect the package manifest and lockfile; app entry/routing; auth placeholders; onboarding state; exercise/template mock data; schedule and workout screens; XP/streak calculations; local/session storage; Supabase clients/functions; migrations; current environment conventions; and tests.

Produce `docs/backend/repo-integration-map.md` identifying the concrete files for each feature, generated backend artifacts, any real data requiring migration, and how to isolate typed services from UI components. Determine whether Make exports overwrite files or support reviewed Git merging in this project's workflow. Run the existing build/checks once and record pre-existing failures.

**Done when:** the agent can name the actual integration points and no existing data or UI has been discarded. New backend files have a clearly documented ownership boundary for future Make changes.

## T01 — Supabase foundation and Auth

**Depends on:** T00.

Add/reuse the Supabase client, local configuration, migrations, environment template, Auth screen wiring, auth state handling, and generated database types. Implement signup bootstrap for minimal profile/preferences. Configure sign-in/out, confirmation, reset, protected routes, and onboarding redirection. Add the active-account check used by mutations and RLS without recursive policy evaluation.

**Acceptance:**

- Signup with missing optional metadata succeeds; handle uniqueness is not enforced inside the signup trigger.
- Confirmed user can sign in, refresh, sign out, and reset password. Incomplete onboarding resumes.
- User A cannot read user B's profile/preferences with a crafted Data API request.
- Browser bundle contains only project URL/publishable credentials; admin operations are not exposed.
- Local reset recreates the same schema; generated types compile. Production SMTP configuration requirements are documented.

## T02 — Onboarding, preferences, and catalog

**Depends on:** T01.

Implement onboarding and preference tables/functions; seed a small exercise/template catalog with fixed IDs/slugs; replace relevant frontend mocks. Add the initial current-week target, next-week target updates, local availability windows, and preset avatars. Add guarded profile updates and preferences updates including unit system.

**Acceptance:**

- Onboarding commits all fields together or none; invalid timezone, duplicate handle, overlapping windows, and invalid target fail with safe field errors.
- The same user can retry onboarding without duplicate windows/goal rows; a different user cannot claim their handle.
- Partial drafts cannot mark onboarding complete. Subsequent preference updates cannot change the frozen home timezone or this week's target.
- Catalog selections survive reload. Re-running seed data does not duplicate exercises or templates.
- Client-supplied `xp`, ownership, deletion marker, or onboarding timestamp is rejected/ignored according to the allowlisted contract, with no privileged effect.

## T03 — Persistent workout logging

**Depends on:** T02.

Implement session and child tables, owner FKs, one-active-session uniqueness, start/cancel/save functions, typed services, and autosave. Create the schedule table foundation here as well so the session's optional schedule FK and later completion logic have valid targets; its user-facing functions/UI arrive in T05. Support template starts and custom sessions assembled from the catalog. Keep IDs stable within drafts. Copy targets/name/mode snapshots on the server. Existing snapshot data must survive saves and catalog edits.

**Acceptance:**

- Start, log strength or timed/distance sets, navigate away, refresh, and resume the saved session.
- Starting twice with the same request UUID returns the same session; a different payload with that UUID rejects. A different request while an active session exists returns `ACTIVE_SESSION_EXISTS`.
- Simultaneous draft saves using the same revision yield one success and one conflict. A stale device cannot overwrite the successful save.
- A forged parent/exercise/set owner or child ID belonging to another session fails. Direct table writes fail.
- Templates can be edited/archived without changing an already started session's snapshots.
- Offline/timeout state is visible; autosaves serialize and the UI can reload canonical state to resolve uncertainty.

## T04 — Completion, ledger, and weekly streak

**Depends on:** T03.

Implement completion/void functions, daily projection, append-only reward ledger, weekly goal calculation, and progress reads. Use one transaction and the lock order from the plan. Integrate real XP/level/streak displays; remove client-side reward writes/calculations used as authority.

**Acceptance:**

1. Completing an empty session fails without creating a ledger event.
2. First qualifying workout on a day produces total XP 100; a second same-day workout leaves total XP at 100.
3. Two concurrent completions/retries of the same session produce one transition. Repeats return the completed state even after the revision changed; the repeat's newly applied XP delta is zero.
4. Void one of two same-day workouts: total remains 100. Void the last: total becomes zero. Retry either void: no additional reversal. Complete a new workout that same day: total returns to 100 with a new reward revision.
5. Total XP never goes negative, and every date satisfies all schema reconciliation invariants after each mutation.
6. Complete across midnight: credit belongs to the server completion date in the home timezone. Client clock/timezone/XP input cannot move the date or reward.
7. Test Monday rollover, year rollover, daylight-saving changes, weeks with no activity, next-week target changes, current-week pending behavior, best streak, and retroactive void effects.
8. Seed multiple distinct days through controlled **test-only fixtures**, not production RPC parameters. Verify 500 XP yields level 2; 499 XP would yield level 1 in the pure formula test.
9. Trigger a deliberate error late in completion: session, daily count, and ledger all roll back.

## T05 — Scheduling, recommendations, and in-app reminders

**Depends on:** T02, T04. The schedule/session foreign key foundation was created in T03.

Implement calendar CRUD RPCs with request IDs/versions, session linkage, deterministic time/template suggestions, notification table, internal due-reminder function, and Cron configuration. The browser may display suggestions without an extra public RPC: scheduling still revalidates ownership, overlap, and time constraints on the server.

**Acceptance:**

- Two concurrent overlapping bookings for the same user cannot both succeed; adjacent bookings can. Different users may book the same times.
- Retried create returns the same entry. Stale schedule version cannot overwrite a later change.
- Starting from a schedule verifies owner and planned status, copies its template, and rejects a conflicting explicit template. Cancelling an active session leaves the schedule planned; completed/voided session behavior matches the plan.
- Schedule cancellation/reschedule while a linked session is active is rejected with an actionable conflict.
- Suggestion ordering is deterministic; no external-calendar availability is implied. DST gap/fold behavior matches the contract.
- Worker retries create one reminder per schedule version. Reschedule/cancel/complete invalidates prior reminders, including when the worker runs concurrently.
- New near-term bookings become due immediately; worker outages do not send stale reminders after workout start.
- No browser user can invoke the internal worker or create notifications. UI explicitly describes reminders as in-app.

## T06 — Account deletion and operational readiness

**Depends on:** T01–T05.

Implement the authenticated Edge Function for account deletion, recent reauthentication verification, deletion marker, retry behavior, Auth Admin deletion, and UI sign-out/cache cleanup. Reauthentication must be established through a server-verifiable fresh credential/auth flow; a client boolean or a newly refreshed JWT's issuance time is insufficient. Define how a partially failed deletion retries while the marker remains set.

Finish dev/staging/prod configuration, custom SMTP setup instructions, safe structured logs, Cron monitoring, and database reconciliation checks. No uploads exist in P0; document storage cleanup ordering before uploads are later enabled.

**Acceptance:**

- User A cannot delete B by changing an ID, token, or body field. Invalid/expired sessions fail.
- After deletion, all owned schedules, sessions, children, preferences, daily rows, ledger entries, and notifications are removed; catalog survives. Include multiple reward transitions and deferred cross-FKs in this test.
- A stale token for a deleted/deleting user cannot write new app rows or read another user's data.
- A simulated failure after the deletion marker is set returns a retryable error; retry finishes deletion safely. No premature success screen.
- Logs contain no credentials, private notes, or full bodies. Preview frontend builds use staging credentials.

## T07 — P0 integration and release gate

**Depends on:** T06.

Create focused database authorization/invariant tests and browser flows, document setup and deployment, and run the clean-room validation sequence below. Test the actual frontend after wiring it; preserve its visual design and loading/error/empty states.

Minimum browser flows: new-user onboarding -> scheduled workout -> log -> complete -> reload progress; sign-out/sign-in with history preserved; second user denied first user's data; void -> corrected progress; account deletion. Test reset/confirmation links against approved redirects in staging.

**Done when:** clean setup is reproducible, required tests pass, all displayed core data is real, no critical security/transaction failures remain, and remaining limitations are explicitly P0b/P1/P2. Provide exact changed files, migration list, test results, and environment prerequisites to the reviewer.

## T08 — P0b friends and consented summaries

**Depends on:** P0 release gate. Implement only when moving into the social beta milestone.

Implement canonical friendships, blocks, exact-handle discovery, bounded private rate limiting, summary RPC, and frontend integration. Add minimal identity responses and share-progress opt-in settings. On lookup, an unavailable handle returns a normal empty result so the lookup counter still commits; do not let failed lookups bypass counting through transaction rollback.

**Acceptance:**

- Request, accept, decline, requester-cancel, remove, block, unblock all enforce actor-specific permissions.
- Concurrent reciprocal requests produce one pending relationship; no auto-accept. Accept-versus-block ends with no accessible friendship when the block succeeds.
- Stranger, pending friend, blocked user, and unshared friend cannot see progress. Friend sees only the documented summary, never raw workouts/notes/email/preferences.
- Opt-out/unfriend/block revokes the next API read and clears cached UI data. Unblock does not restore prior friendship.
- Exact-handle lookup cannot enumerate by partial handle or email. Rate limits apply to found and missing handles and to repeated new requests.
- Account deletion removes both-direction social rows and private rate counters.

## Suggested API examples

These are contract examples, not code to paste without adapting names to generated Supabase types. RPC arguments should use a consistent `p_` prefix; do not overload function signatures.

```ts
// Client owns only the retry key and editable input, never the user ID or rewards.
const start = {
  p_client_request_id: crypto.randomUUID(),
  p_template_id: selectedTemplateId,
  p_scheduled_workout_id: null,
  p_custom_title: null,
};

const completionInput = {
  p_session_id: session.id,
  p_expected_revision: session.revision,
};

type CompletionResult = {
  session_id: string;
  status: "completed";
  revision: number;
  already_completed: boolean;
  xp_delta_applied: number; // 100 first daily activation, otherwise 0 on completion
  progress: {
    total_xp: number;
    level: number;
    local_date: string;
    week_start: string;
    target_days: number;
    completed_days: number;
    current_streak_weeks: number;
    best_streak_weeks: number;
    current_week_pending: boolean;
  };
};
```

Do not grant a client method like `award_xp(user_id, amount)`. The completion/void transaction alone determines reward transitions. The implementation should derive the TypeScript response types from stable function results where possible and validate JSON envelopes where the database type generator returns generic JSON.

## Validation sequence for the implementation repository

Use the repo's package manager and installed Supabase CLI; the commands below are representative. Run local destructive resets only against the local stack.

```text
install dependencies using the existing lockfile
start local Supabase
supabase db reset
supabase db lint --local
supabase test db
generate Supabase TypeScript types and compare with committed output
run frontend typecheck and focused unit tests
run the production frontend build
run focused Playwright flows against the local stack
run same-user completion/booking concurrency tests with separate connections
```

Database tests must exercise `anon` and different authenticated identities, not only the database owner. Use test transactions/time-controlled fixtures for date-boundary cases; never expose test-clock or admin helpers to the production API. Review grants and function signatures in addition to testing visible UI behavior. On staging, verify Auth redirects/SMTP, reminder scheduling, error reporting, and a synthetic backup/restore drill appropriate to the chosen hosting plan.

## Copyable implementation prompt

> Implement P0 of this fitness app backend in the existing Figma Make-generated GitHub repository. Read `backend-plan.md`, `database-schema.md`, and `agent-implementation-tasks.md` first. Inspect repository instructions and the actual frontend/backend code before changing anything. Preserve React + Vite + Tailwind and the current UI. Use Supabase Auth, relational Postgres tables, SQL migrations, RLS, transactional RPCs, and an Edge Function for account deletion. Implement T00–T07 in dependency order, adapting file paths to the repo. Keep all mutations server-authorized, rewards derived from completed workout days, and completed sessions immutable except through the void workflow. Replace core mock data with typed services and real persistence. Run the required ownership, idempotency, concurrency, timezone, reward-reversal, reminder, and deletion tests. Document assumptions, actual environment setup, migration steps, checks run, and limitations. Do not implement P0b/P1/P2, replace the frontend framework, expose admin credentials, delete existing production data, or deploy to production as part of this task. If real prototype data exists, produce and validate a migration mapping before moving it. If a contract is inconsistent with the inspected repo, resolve ordinary integration details locally and document the change; request a product decision only when it changes the agreed behavior.

To include the social beta in a subsequent implementation request, explicitly add: “After P0 passes its release gate, implement T08 and its privacy/abuse tests.”
