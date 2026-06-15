-- Enable Supabase Realtime on the reports table so the mobile app receives
-- INSERT / UPDATE events the moment an authority files or resolves a report.
-- Free tier: 200 concurrent connections, 2M messages/month — ample for a pilot.
--
-- Run this in the Supabase SQL Editor (or via the migration pipeline).

-- Add the table to the realtime publication. supabase_realtime exists by
-- default; the guard avoids an error if reports is already a member.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'reports'
  ) then
    alter publication supabase_realtime add table reports;
  end if;
end $$;

-- REPLICA IDENTITY FULL makes UPDATE/DELETE events carry the full old row, so
-- the client can react to a report being resolved (resolved_at set) reliably.
alter table reports replica identity full;
