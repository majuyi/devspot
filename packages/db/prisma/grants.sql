-- Production grants (docs/09 §3). Run as postgres after every `migrate deploy` by migrate.yml;
-- idempotent. Each block runs only when its role exists, and connect is granted on the
-- current database, so the same file also runs in CI and local Docker, where the web tests
-- apply it to devspot_web_test and query as `web` to prove these grants are enough.

-- The engine role (created once by hand, docs/09 §3) can add and change rows, never delete.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'engine') then
    execute format('grant connect on database %I to engine', current_database());
    grant usage on schema public to engine;
    grant select, insert, update on organizations, sources, fetch_runs, raw_items,
      opportunities, extractions, usage_meters to engine;
    grant select on submissions to engine;
    grant usage, select on all sequences in schema public to engine;
  end if;
end
$$;

-- The web role (created once by hand, docs/09 §3) reads what the public pages and API show.
-- /admin (M2.10) and /submit (M4.3) add their writes here.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web') then
    execute format('grant connect on database %I to web', current_database());
    grant usage on schema public to web;
    grant select on organizations, sources, fetch_runs, opportunities to web;
  end if;
end
$$;

-- Supabase's Data API reads public tables as anon and authenticated with the public key.
-- Nothing in this app uses it, so they get nothing, except one harmless read the daily
-- keepalive makes to count as activity. Those roles exist only on Supabase.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon')
    and exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from anon, authenticated;
    revoke all on all sequences in schema public from anon, authenticated;
    revoke all on all functions in schema public from anon, authenticated;
    alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
    alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
    alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
    grant select on usage_meters to anon;
  end if;
end
$$;
