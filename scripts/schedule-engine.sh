#!/usr/bin/env bash
# Starts the Engine workflow every two hours from Supabase (docs/09 §5). GitHub was starting
# its own scheduled runs eight to nine hours late.
#
#   1. Turns on pg_cron and the synchronous `http` extension in the production database.
#   2. Keeps the GitHub token already in Supabase Vault, or replaces it with one you paste
#      (fine-grained, this repo only, Actions read and write). It is never printed.
#   3. Creates or updates the cron job `engine-dispatch` (17 minutes past every second hour).
#      `http` sends the request inside the job, so the token is never written to a table.
#      A status other than 204 fails the job, which cron.job_run_details then shows.
#   4. Removes pg_net, used by the first version: it queued each request, token included, in
#      a table every role could read (2026-11-21).
#   5. Tries to stop roles other than postgres calling the `http` functions.
#   6. Dispatches once now and prints GitHub's answer.
#   7. Checks what the engine, web and admin roles can reach, and fails if any can read the token.
#
# Safe to run again; to renew the token, run it and paste the new one.
# Needs: psql, and the postgres password in the Keychain (service devspot-supabase).
set -euo pipefail

SERVICE="devspot-supabase"
HOST="aws-0-eu-west-2.pooler.supabase.com"
REF="rlfppkooucslfyajxnan"
REPO="majuyi/devspot"
SECRET_NAME="github_engine_dispatch"

# AppleScript gives up on a dialog after two minutes unless told otherwise; creating the token
# on GitHub can take longer, so both dialogs wait ten.
ask() { osascript -e "with timeout of 600 seconds" -e "$1" -e "end timeout" 2>&1; }

answer=$(ask 'button returned of (display dialog "Schedule the devspot engine from Supabase? This sets up the two-hourly job with the http extension, removes pg_net and starts one engine run now." buttons {"Cancel", "Schedule"} default button "Cancel" with title "devspot")' || true)
[ "$answer" = "Schedule" ] || { echo "Cancelled. Nothing changed."; exit 0; }

PGPASSWORD=$(security find-generic-password -s "$SERVICE" -a postgres -w); export PGPASSWORD
CONN="host=$HOST port=5432 dbname=postgres user=postgres.$REF sslmode=require"
q() { psql "$CONN" -v ON_ERROR_STOP=1 -Atq "$@"; }

stored=$(q -c "select count(*) from vault.secrets where name = '$SECRET_NAME'")
if [ "$stored" = "1" ]; then
  prompt="A token is already stored in Supabase Vault. Paste a new one to replace it, or leave this empty to keep it."
else
  prompt="Paste the fine-grained GitHub token (repository majuyi/devspot only, Actions: read and write). It goes to Supabase Vault and nowhere else."
fi
TOKEN=$(ask "text returned of (display dialog \"$prompt\" default answer \"\" with hidden answer buttons {\"Cancel\", \"Continue\"} default button \"Continue\" with title \"devspot\")" || true)
case "$TOKEN" in
  *"timed out"*|*"-1712"*) echo "The token dialog timed out after ten minutes. Nothing changed; run the script again with the token ready."; exit 1 ;;
  *"User canceled"*|*"-128"*) echo "Cancelled. Nothing changed."; exit 0 ;;
esac
if [ -z "$TOKEN" ] && [ "$stored" != "1" ]; then echo "No token given. Nothing changed."; exit 1; fi

if [ -n "$TOKEN" ]; then
  case "$TOKEN" in github_pat_*) ;; *) echo "Stopped: that is not a fine-grained token (they start with github_pat_)."; exit 1 ;; esac
  # Checked against GitHub before anything is stored: the token must reach this repo.
  # The header goes in on stdin so the token is not on curl's command line.
  status=$(printf 'Authorization: Bearer %s\n' "$TOKEN" | curl -s -o /dev/null -w '%{http_code}' -H @- \
    -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$REPO/actions/workflows/engine.yml")
  [ "$status" = "200" ] || { echo "Stopped: GitHub answered $status for that token on $REPO. Check its repository access and the Actions permission."; exit 1; }
  echo "== Storing the new token in Vault"
  # On stdin inside a dollar-quoted literal, so it is not on a command line.
  psql "$CONN" -v ON_ERROR_STOP=1 -q <<SQL
do \$do\$
declare existing uuid;
begin
  select id into existing from vault.secrets where name = '$SECRET_NAME';
  if existing is null then
    perform vault.create_secret(\$tok\$$TOKEN\$tok\$, '$SECRET_NAME', 'Dispatches the Engine workflow (docs/09 §5)');
  else
    perform vault.update_secret(existing, \$tok\$$TOKEN\$tok\$);
  end if;
end
\$do\$;
SQL
else
  echo "== Keeping the token already in Vault"
fi
unset TOKEN

echo "== 1 to 4. Extensions, the cron job, pg_net removed"
psql "$CONN" -v ON_ERROR_STOP=1 -q <<SQL
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists http with schema extensions;

-- cron.schedule replaces a job of the same name, so this is safe to run again.
select cron.schedule('engine-dispatch', '17 */2 * * *', \$job\$
do \$d\$
declare answered integer;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '10');
  select status into answered from extensions.http((
    'POST',
    'https://api.github.com/repos/$REPO/actions/workflows/engine.yml/dispatches',
    array[
      extensions.http_header('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '$SECRET_NAME')),
      extensions.http_header('Accept', 'application/vnd.github+json'),
      extensions.http_header('X-GitHub-Api-Version', '2022-11-28'),
      extensions.http_header('User-Agent', 'devspot-pg-cron')
    ],
    'application/json',
    '{"ref": "main", "inputs": {"trigger": "pg_cron"}}'
  )::extensions.http_request);
  if answered <> 204 then
    raise exception 'GitHub answered % to the engine dispatch (401 or 403: renew the token, docs/09 §6)', answered;
  end if;
end
\$d\$
\$job\$) \\g /dev/null

drop extension if exists pg_net;

-- Grant to postgres first, so the job keeps working, then take the http functions from
-- everyone else. Where Supabase's admin owns them, both are no-ops with a warning.
do \$do\$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    join pg_depend d on d.objid = p.oid and d.deptype = 'e'
    join pg_extension e on e.oid = d.refobjid and e.extname = 'http'
  loop
    execute format('grant execute on function %s to postgres', f);
    execute format('revoke execute on function %s from public', f);
  end loop;
end
\$do\$;
SQL
q -c "select format('job %s: %s %s', jobid, schedule, case when active then 'active' else 'INACTIVE' end) from cron.job where jobname = 'engine-dispatch'"

echo "== 6. One dispatch now"
if out=$(q -c "$(q -c "select command from cron.job where jobname = 'engine-dispatch'")" 2>&1); then
  echo "GitHub answered 204: an Engine run has been started (trigger pg_cron)."
else
  echo "The dispatch failed: ${out##*ERROR:  }"
  echo "The job is scheduled, but this run was not started."
fi

echo "== 7. What the app's roles can reach"
report=$(psql "$CONN" -Atq <<'SQL'
select format('%-6s vault: %s, cron: %s, net schema present: %s, can call http: %s', r,
  has_schema_privilege(r, 'vault', 'USAGE'),
  has_schema_privilege(r, 'cron', 'USAGE'),
  exists (select 1 from pg_namespace where nspname = 'net'),
  has_function_privilege(r, 'extensions.http(extensions.http_request)', 'EXECUTE')
    and has_schema_privilege(r, 'extensions', 'USAGE'))
from unnest(array['engine', 'web', 'admin']) as r;
SQL
)
echo "$report"
unset PGPASSWORD
# psql prints booleans as t and f.
if grep -qE 'vault: t,|cron: t,|net schema present: t,' <<<"$report"; then
  echo "STOP: an app role can still reach the token. Tell Claude before anything else."
  exit 1
fi
if grep -qE 'can call http: t$' <<<"$report"; then
  echo "The token is out of their reach. They can still call http (Supabase keeps it open to"
  echo "everyone), which lets them fetch web pages from the database, but not the token."
fi
echo "Done. Tell Claude, and it will check the run."
