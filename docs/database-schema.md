# Implemented database schema

Source of truth: `supabase/migrations/20261102000000_flexi_core.sql`. UUID primary keys and UTC `timestamptz` values. All seven app tables have RLS enabled. Supabase owns `auth.users` and password/session storage.

| Table | Main fields | Relationships / rules |
|---|---|---|
| `profiles` | `id`, `display_name`, `avatar`, `timezone`, `weekly_goal`, `equipped_cosmetic_id`, `created_at` | ID → `auth.users`; signup trigger creates safe defaults/preferences; timezone and goal frozen; equipment must be owned and active |
| `workout_logs` | `owner`, `request_id`, `title`, `duration_minutes`, `notes`, `exercises` JSONB, `completion_input` JSONB, `completed_at`, `local_date`, `status`, `voided_at` | Owner → profile; unique `(owner, request_id)`; immutable completion input; only voiding allowed after creation; date/time/owner assigned by DB |
| `calendar_events` | `owner`, `title`, `starts_at`, `ends_at`, `timezone`, `notes`, `status`, `created_at` | Owner → profile; end after start, max 24 hours; planned/completed/cancelled; calendar status never awards XP |
| `training_content` | `slug`, `title`, `kind`, `summary`, `body`, `source_url`, `image_url`, `status`, `published_at` | Unique slug; kind news/tutorial; app reads only published records whose publication date has arrived |
| `cosmetic_items` | `slug`, `name`, `description`, `slot`, `minimum_level`, `active`, `image_url` | Unique slug; active items visible in shop; level 1–1000; no currency/payment |
| `user_cosmetics` | `owner`, `item`, `acquired_at` | Owner → profile, item → catalog; unique `(owner,item)`; claims remain after voiding workouts; one equipped item per profile |
| `leaderboard_entries` | `display_name`, `handle`, `points`, `workouts`, `streak`, `avatar` | Editorial data retained for the exported UI; unique handle; no links to private app profiles; not live competitive rankings |

Each table also has an `id` UUID. `profiles.id` is the Auth ID; other IDs default to `gen_random_uuid()`. Optional image URLs are HTTPS; storage buckets/user uploads are not provisioned. Character preset images remain static files.

## Access and mutation boundary

Anonymous roles can read active cosmetics, published content, and editorial leaderboard entries. Authenticated roles can additionally read their own profile, workouts, calendar, and inventory. No app role receives direct INSERT/UPDATE/DELETE grants. Metadata supplied at signup can set validated profile preferences only; malformed values fall back to safe defaults and never become privileges/rewards.

Only the following public functions are granted to authenticated callers:

| Function | Inputs | Result |
|---|---|---|
| `flexi_log_workout` | `p_input` JSONB | `{workout,replayed}` |
| `flexi_void_workout` | `p_id` UUID | Workout row |
| `flexi_update_profile` | `p_input` JSONB (`displayName`, `avatar`, `equippedCosmeticId`) | Profile row |
| `flexi_create_calendar` | `p_input` JSONB | Calendar row |
| `flexi_update_calendar` | `p_id`, partial `p_input` JSONB | Calendar row; status cancelled implements delete |
| `flexi_claim_cosmetic` | `p_id` UUID | `{inventory,replayed}` |
| `flexi_progress_days` | None | Daily aggregates for the authenticated user |

Mutation functions use `SECURITY DEFINER` with empty `search_path`, explicit `auth.uid()` ownership, private input-validation helpers, and an account-level profile lock. Helpers live in the unexposed `flexi_private` schema and are not executable by app roles. Public function execution is revoked from anonymous/PUBLIC roles. Account locks serialize same-user reward changes and claims; unique constraints provide a second guard against duplicate records. No function takes a caller-supplied owner ID.

Direct Data API/RPC clients can reach the same public functions, so authorization and durable invariants are enforced there, not only in Next.js. Unknown JSON fields, malformed exercises, immutable preference changes, and ineligible equipment/claims are rejected. API handlers normalize errors and convert SQL snake_case rows into camelCase DTOs.

## Progress, indexes, and lifecycle

100 XP per distinct `local_date` with a completed workout; level is `1 + floor(XP/500)`. The database's local date is computed at insertion in the signup timezone. A workout's duration is 1–1440 whole minutes. Exercise summaries are optional, with at most 30 entries. There are no separate XP balances or XP ledger rows to reconcile. Claim eligibility uses the same completed-day level formula inside the database transaction.

The progress function aggregates all dates in one database snapshot so histories beyond the Data API's default 1,000-row cap remain correct. This is adequate for the MVP; a long-lived high-volume product should consider persisted daily summaries while retaining the same invariants.

Indexes cover `(owner, completed_at, id)` history, completed `(owner, local_date)` reward days, `(owner, starts_at, ends_at)` calendar queries, and published `(kind, published_at)` content. Unique indexes cover workout retry keys, inventory ownership, catalog/content slugs, and editorial handles.

Deleting an Auth user through administrative tooling cascades to their profile and personal rows. There is no user-facing account deletion endpoint yet. Workouts are voided, calendar entries cancelled, and catalogs archived instead of deleting history. Catalog item deletion is restricted while inventory references exist. Editable goals/timezones will need effective-dated rules in a later migration.

Apply future schema changes through new migrations after reviewing existing data. This initial migration has only been applied to isolated test databases, not a hosted project.
