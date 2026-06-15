# SanLikas — DRRM Authority Dashboard

Next.js web app where verified DRRM officers file and resolve hazard reports.
Reports are written to Supabase and read live by the SanLikas mobile app's
evacuation agent, which routes residents around them.

## Setup

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Run the schema: in **SQL Editor**, paste and run
   [`../supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql).
   This creates `reports`, `authority_profiles`, the RLS policies (only
   authorities can write; everyone can read), and the `get_active_hazards` RPC.

### 2. Provision a DRRM officer

There is **no public sign-up** — authorities are added by an admin:

1. **Authentication → Users → Add user** — e.g. `officer@drrm.demo` + a password.
2. Copy the new user's UUID.
3. In **SQL Editor**, insert their authority profile:
   ```sql
   insert into authority_profiles (user_id, agency, full_name)
   values ('<paste-uuid>', 'Manila CDRRMO', 'Demo Officer');
   ```
   (Or run [`../supabase/seed.sql`](../supabase/seed.sql) with the UUID — it also
   seeds the demo flood near Delpan.)

### 3. Run the web app

```sh
cd web
cp .env.example .env.local      # fill in Supabase URL + anon key + Mapbox token
npm install
npm run dev                     # http://localhost:3000
```

Sign in with the officer credentials → file a report by clicking the NCR map to
drop a pin, choosing hazard type/severity, and publishing. Active reports list
below the map; **Mark resolved** removes a hazard.

### 4. Connect the mobile app

In the repo root `.env` (the Expo app), set the **same** Supabase project:

```
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

Now a report filed here appears as a hazard the mobile agent routes around. If
these are left unset, the mobile app falls back to bundled seed hazards (offline
demo still works).

## End-to-end demo

1. Web: file a **flood, severity 3** by clicking near Delpan Evacuation Center
   (≈ `14.599, 120.966`).
2. Mobile: open the app → **Saan tayo lilikas?** → **Demo (Manila)** → ask.
3. The agent reports the flood and routes to a farther but safe center; the map
   draws the red hazard buffer and the route bending around it.
4. Web: **Mark resolved** → the mobile agent's next route goes back to the
   nearest center.

## Architecture notes

- **Credibility (Epic 4):** writes are restricted to `authority_profiles` members
  by RLS at the database level — not just the UI. A non-authority who reaches the
  insert endpoint is rejected by Postgres.
- **NCR bound** is a DB check constraint, mirroring the app's `lib/geo/ncr.ts`.
- **Mobile reads** go through the `get_active_hazards` RPC (recency + proximity
  filtered); on failure the app uses seed data and the source is tracked so
  "couldn't check" never reads as "all clear".
