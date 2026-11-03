# Flexi — standalone application

This repository was downloaded from Figma Make. It is NOT connected to Figma's runtime.
The user chose Supabase database and authentication on November 2, 2026.

- Stack: Next.js App Router, React, Tailwind, Supabase Postgres/Auth.
- Keep frontend designs intact unless UI work is requested. Import later Figma exports through reviewed diffs; do not overwrite backend changes.
- Database source of truth: versioned SQL in `supabase/migrations`. Never change an applied migration; add one.
- Use the publishable key and authenticated user's bearer token for app queries; never bypass RLS with a service-role key in app routes.
- Mutations go through validated database functions. Enforce ownership, immutable fields, retry identity, and reward rules in the database as well as APIs.
- Treat private responses as no-store. Never log passwords, tokens, or private workout notes.
- Secrets belong in local/deployment environment settings, not source or chat. `.env.example` lists public configuration only.
- Schema/data deletion on a live database requires a concrete preservation plan and user authorization. This repo does not itself provision a hosted project.
- Keep the backend API contract and setup guide in `docs/` current. Social interactions and battle passes are deferred.
- Check with `pnpm typecheck`, `pnpm test:backend`, `pnpm test:database` (embedded PostgreSQL), and `pnpm build`.
- Database tests use isolated embedded PostgreSQL; `pnpm test:database:native` additionally tests concurrent connections in a disposable native cluster and do not contact hosted databases. Hosted Auth must also be smoke-tested after project setup.
