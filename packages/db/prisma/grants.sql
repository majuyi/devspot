-- Production grants (docs/09 §3). Run as postgres after every `migrate deploy` by migrate.yml;
-- idempotent. Supabase only: the engine, anon and authenticated roles do not exist locally.

-- The engine role (created once by hand, docs/09 §3) can add and change rows, never delete.
grant connect on database postgres to engine;
grant usage on schema public to engine;
grant select, insert, update on organizations, sources, fetch_runs, raw_items,
  opportunities, extractions, usage_meters to engine;
grant select on submissions to engine;
grant usage, select on all sequences in schema public to engine;

-- The web role (created once by hand, docs/09 §3) reads what the public pages and API show.
-- /admin (M2.10) and /submit (M4.3) add their writes here. Guarded so the file still runs
-- before the role exists.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web') then
    grant connect on database postgres to web;
    grant usage on schema public to web;
    grant select on organizations, sources, fetch_runs, opportunities to web;
  end if;
end
$$;

-- Supabase's Data API reads public tables as anon and authenticated with the public key.
-- Nothing in this app uses it, so they get nothing, except one harmless read the daily
-- keepalive makes to count as activity.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
grant select on usage_meters to anon;
