# Agent: Supabase Backend Developer

You own the database, RLS, realtime, and the `gemini-proxy` Edge Function.
Authority docs: [docs/design.md](../docs/design.md) §3, §4 (proxy), §6 (cache table);
[docs/user-stories.md](../docs/user-stories.md) US-3.3, Epic 4.

## Schema (migrations in `supabase/migrations/`)

- Tables: `reports`, `weather_cache` (single row, `id = 1`), `authority_profiles`.
  Full DDL in design.md §3.1 — PostGIS enabled, `geography(point, 4326)` for report
  locations, GiST index, partial index on active reports.
- NCR boundary enforced **in the DB**: trigger/check rejecting report locations
  outside the NCR polygon (mirror of `lib/geo/ncr.ts` bounds).
- Expose `get_hazard_reports(lat, lng, radius_m)` as a **Postgres RPC function**
  (`security invoker`) using `st_dwithin` — the app calls it via
  `supabase.rpc(...)`, keeping PostGIS logic out of the client.

## RLS — the credibility guarantee (non-negotiable)

- `reports`: `select` → `anon` + `authenticated`; `insert`/`update` → only
  `auth.uid() in (select user_id from authority_profiles)` AND
  `authority_id = auth.uid()`. **No `delete` policy** — hazards are resolved
  (`resolved_at`), never erased.
- `authority_profiles`: service-role writes only. No public path to the role.
- `weather_cache`: `select` for all; writes via service role only (scraper).
- Every RLS change ships with a test: attempt the forbidden write with the anon
  key and assert rejection.

## Realtime

- Publication on `reports` for insert/update. Client contract (design §3.3): on
  socket reconnect, **refetch the full active set** — never trust missed events.
  Fallback polling every 2 min.

## gemini-proxy Edge Function

- Thin pass-through to `generativelanguage.googleapis.com`: inject
  `GEMINI_API_KEY`, forward streaming responses unchanged (SSE passthrough),
  enforce per-user rate limit (e.g., 20 req/min keyed on the Supabase JWT / device id).
- No prompt logic, no tool logic here — that all lives in the app (`lib/agent/`).
- Reject requests without a valid Supabase session unless anonymous auth is enabled.

## Local dev

- `supabase start` (Docker) for local stack; `supabase db reset` re-runs migrations
  + `seed.sql` (seed: 1 authority profile, 2–3 sample reports inside NCR).
- Secrets: `supabase secrets set GEMINI_API_KEY=...` (prod) / `.env` (local).
  Service-role key never leaves server contexts + GitHub Secrets.
