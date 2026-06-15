-- SanLikas — initial schema
-- Hazard reports filed by DRRM authorities (web app) and read by the mobile
-- evacuation agent. Credibility guarantee: only verified authority accounts can
-- write, enforced at the DB level via RLS (design.md §3, Epic 4).

create extension if not exists postgis;

-- ── Authority roster ─────────────────────────────────────────────────────────
-- Who counts as a DRRM authority. Provisioned by an admin (service role) — no
-- public sign-up path to this role.
create table if not exists authority_profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  agency     text not null,                 -- e.g. "Marikina CDRRMO"
  full_name  text,
  created_at timestamptz not null default now()
);

-- ── Hazard reports ───────────────────────────────────────────────────────────
create table if not exists reports (
  id           uuid primary key default gen_random_uuid (),
  authority_id uuid not null references auth.users (id),
  hazard_type  text not null check (
    hazard_type in ('flood', 'landslide', 'fire', 'road_blocked', 'other')
  ),
  description  text not null,
  severity     smallint not null default 2 check (severity between 1 and 3),
  -- Circular hazard zone the router consumes (matches mobile HazardZone).
  lng          double precision not null,
  lat          double precision not null,
  hard_radius_m integer not null default 250 check (hard_radius_m > 0),
  soft_radius_m integer not null default 500 check (soft_radius_m >= hard_radius_m),
  location     geography (point, 4326) generated always as (
    st_setsrid (st_makepoint (lng, lat), 4326)::geography
  ) stored,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  -- NCR bound enforced in the DB, not just the UI (US-1.2).
  constraint reports_in_ncr check (
    lng between 120.90 and 121.15 and lat between 14.30 and 14.80
  )
);

create index if not exists reports_location_idx on reports using gist (location);
create index if not exists reports_active_idx
  on reports (created_at) where resolved_at is null;

-- ── Updated-at trigger ───────────────────────────────────────────────────────
create or replace function set_updated_at () returns trigger
  language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reports_set_updated_at on reports;
create trigger reports_set_updated_at
  before update on reports
  for each row execute function set_updated_at ();

-- ── RLS: the credibility guarantee ───────────────────────────────────────────
alter table reports enable row level security;
alter table authority_profiles enable row level security;

-- Anyone (anon + authenticated) may read reports.
drop policy if exists reports_select_all on reports;
create policy reports_select_all on reports
  for select using (true);

-- Only verified authorities may insert, and only as themselves.
drop policy if exists reports_insert_authority on reports;
create policy reports_insert_authority on reports
  for insert with check (
    authority_id = auth.uid ()
    and exists (select 1 from authority_profiles p where p.user_id = auth.uid ())
  );

-- Authorities may update only their own reports (e.g. mark resolved).
drop policy if exists reports_update_own on reports;
create policy reports_update_own on reports
  for update using (authority_id = auth.uid ())
  with check (authority_id = auth.uid ());
-- No delete policy — hazards are resolved, never erased.

-- An authority may read its own profile (to confirm role in the UI).
drop policy if exists authority_self_select on authority_profiles;
create policy authority_self_select on authority_profiles
  for select using (user_id = auth.uid ());

-- ── Active-hazards RPC (mobile read path) ────────────────────────────────────
-- Returns unresolved, recent reports near a point, in the shape the mobile
-- router consumes. security invoker → still subject to the select policy.
create or replace function get_active_hazards (
  in_lng double precision default null,
  in_lat double precision default null,
  in_radius_m integer default 8000,
  in_max_age_hours integer default 24
)
returns table (
  id            uuid,
  hazard_type   text,
  description   text,
  severity      smallint,
  lng           double precision,
  lat           double precision,
  hard_radius_m integer,
  soft_radius_m integer,
  created_at    timestamptz
)
language sql stable security invoker as $$
  select r.id, r.hazard_type, r.description, r.severity,
         r.lng, r.lat, r.hard_radius_m, r.soft_radius_m, r.created_at
  from reports r
  where r.resolved_at is null
    and r.created_at > now() - make_interval(hours => in_max_age_hours)
    and (
      in_lng is null or in_lat is null
      or st_dwithin(
        r.location,
        st_setsrid(st_makepoint(in_lng, in_lat), 4326)::geography,
        in_radius_m + r.soft_radius_m
      )
    )
  order by r.created_at desc;
$$;
