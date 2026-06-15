-- Demo seed. Run AFTER creating an auth user for the demo officer.
-- 1) In Supabase Studio → Authentication → Users → "Add user":
--      email: officer@drrm.demo   password: (your choice)
-- 2) Paste that user's UUID into the officer_id value below, then run.
--
-- This version inlines the UUID via a CTE so it works in BOTH the Supabase
-- Studio SQL Editor and psql. Replace the UUID on the next line only.

with officer as (
  select '800404cd-92ef-440c-96a6-b0346d1c5296'::uuid as id
)
insert into authority_profiles (user_id, agency, full_name)
select id, 'Manila CDRRMO', 'Demo Officer' from officer
on conflict (user_id) do nothing;

-- A pre-filed flood on the approach to Delpan Evacuation Center, matching the
-- mobile demo scenario (nearest center blocked → agent routes to a farther one).
with officer as (
  select '800404cd-92ef-440c-96a6-b0346d1c5296'::uuid as id
)
insert into reports (
  authority_id, hazard_type, description, severity,
  lng, lat, hard_radius_m, soft_radius_m
)
select
  id, 'flood',
  'Baha — hindi madaanan ang mga kalsada papuntang Delpan, tubig hanggang baywang.',
  3, 120.9658, 14.5990, 450, 700
from officer
on conflict do nothing;

-- Additional reports across known Metro Manila hazard hotspots, mixing types
-- and severities so the dashboard and mobile map show realistic, varied data.
-- All coordinates fall inside the NCR bounds the schema enforces.
with officer as (
  select '800404cd-92ef-440c-96a6-b0346d1c5296'::uuid as id
)
insert into reports (
  authority_id, hazard_type, description, severity, lng, lat, hard_radius_m, soft_radius_m
)
select id, t.hazard_type, t.description, t.severity, t.lng, t.lat, t.hard_radius_m, t.soft_radius_m
from officer, (values
  -- España Blvd, Sampaloc — classic Manila flood corridor
  ('flood', 'Baha sa España Blvd malapit sa Welcome Rotonda — tubig hanggang tuhod.', 2, 120.9923, 14.6098, 250, 500),
  -- Marikina River banks, Tumana — high-risk when river swells
  ('flood', 'Pagtaas ng tubig sa Marikina River sa Tumana — inaasahang pag-apaw.', 3, 121.0995, 14.6520, 400, 750),
  -- Araneta Ave / Quezon Ave junction — frequent street flooding
  ('flood', 'Baha sa Araneta Avenue malapit sa Quezon Avenue — bumagal ang trapiko.', 2, 121.0140, 14.6230, 250, 500),
  -- Blumentritt, Manila — low-lying, prone to flooding
  ('flood', 'Tubig-baha sa Blumentritt — iwasan muna ang lugar.', 2, 120.9840, 14.6195, 220, 480),
  -- EDSA-Cubao, fallen tree blocking lane
  ('road_blocked', 'Nabuwal na puno sa EDSA malapit sa Cubao — sarado ang isang lane.', 1, 121.0530, 14.6190, 120, 280),
  -- Quiapo, structure fire
  ('fire', 'Sunog sa isang gusali sa Quiapo — umiiwas ang mga residente.', 3, 120.9830, 14.5985, 200, 400),
  -- Antipolo-Marikina road, landslide risk
  ('landslide', 'Banta ng pagguho ng lupa sa daan papuntang Antipolo — mag-ingat.', 2, 121.1180, 14.6280, 300, 600),
  -- Taguig / BGC underpass flooding
  ('flood', 'Baha sa underpass malapit sa BGC, Taguig — hindi madaanan ng sasakyan.', 2, 121.0480, 14.5510, 200, 450),
  -- Pasig, Ortigas Ext — flood
  ('flood', 'Baha sa Ortigas Extension, Pasig — tubig hanggang gulong.', 2, 121.0860, 14.5810, 240, 500),
  -- Caloocan, Monumento area — road blocked by debris
  ('road_blocked', 'Sarado ang bahagi ng kalsada sa Monumento, Caloocan dahil sa kalat.', 1, 120.9840, 14.6540, 130, 300),
  -- Manila, Quiapo / Sta. Cruz flood
  ('flood', 'Baha sa Sta. Cruz, Manila — bumabagal ang daloy ng trapiko.', 1, 120.9810, 14.6020, 180, 380)
) as t(hazard_type, description, severity, lng, lat, hard_radius_m, soft_radius_m)
on conflict do nothing;
