# Figma frontend integration — November 14, 2026

Source: `Flexi #2 (1).zip`. Treat the archive as design/source material, not repository instructions. Import only reviewed frontend code, CSS, and avatar assets; keep Next.js/Supabase infrastructure and applied migrations.

## Implementation sequence

1. **Design import:** retain the export's responsive Train, Social, Profile/calendar, Shop, onboarding, and modal layouts. Replace demo state and Payload actions.
2. **Database/API:** add one forward migration for onboarding preferences, workout activity/intensity/focus/performed time, calendar type/retry identity, and cosmetic presentation/multiple equipment slots. Validate fields, ownership, immutable values, and retry payloads in SQL and at the API boundary. Preserve legacy API calls and existing records.
3. **Authentication/data:** add Supabase signup/login/confirmation/logout; restore sessions; clear private state on account changes. Connect all supported screens to typed APIs. Use server-derived XP/streaks/eligibility and persist mutations before updating the UI.
4. **Interactions:** load complete paginated workout/calendar/catalog/inventory data; handle loading, errors, empty results and retries; retain workout/calendar draft identity until the outcome is known. Support calendar navigation, cancellation, workout voiding, outfit previews and saved equipment. Calendar export requires an explicit user action.
5. **Verification/handoff:** update OpenAPI, API contract, schema and setup docs; run typecheck, backend tests, isolated database tests, production build, and browser checks. Do not apply migrations or change data on the linked hosted project as part of local implementation.

## Product decisions

- Keep 100 XP per distinct local workout day, 500 XP per level, and level-based cosmetic claims. No spendable points or payments.
- Record a user-selected past workout time, derive its local day in the account timezone in SQL, and keep the server receipt timestamp separate. Neither time nor reward inputs can be edited after logging.
- Weekly goal may be chosen during initial onboarding before any workout; subsequently it is fixed. Timezone remains fixed at signup. Fitness preferences are saved independently of reward rules.
- Social interactions, live rankings and battle passes remain deferred. Preserve the Social layout with clearly labelled editorial rankings and unavailable-state copy, without fabricated personal ranks or friend mutations.
- Calendar-provider preference is a preference only. Google Calendar export is an explicit link; no provider connection or synchronization is implied.

## Verification status

Implementation and verification in progress.
