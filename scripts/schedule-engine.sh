#!/usr/bin/env bash
# Starts the Engine workflow every two hours from Supabase (docs/09 §5). GitHub was starting
# its own scheduled runs eight to nine hours late.
#
#   1. Turns on pg_cron and pg_net in the production database if they are off.
#   2. Asks for a fine-grained GitHub token (this repo only, Actions read and write) in a
#      hidden dialog and stores it in Supabase Vault. It is not printed or kept anywhere else.
#   3. Creates or updates the cron job `engine-dispatch` (17 minutes past every second hour).
#   4. Dispatches once now and prints GitHub's answer (204 means the run was started).
#   5. Checks that the engine, web and admin roles cannot read Vault or the cron schema.
#
# Safe to run again; to renew the token, run it again with the new one.
# Needs: psql, and the postgres password in the Keychain (service devspot-supabase).
set -euo pipefail

SERVICE="devspot-supabase"
HOST="aws-0-eu-west-2.pooler.supabase.com"
REF="rlfppkooucslfyajxnan"
REPO="majuyi/devspot"
SECRET_NAME="github_engine_dispatch"

answer=$(osascript -e 'button returned of (display dialog "Schedule the devspot engine from Supabase? This turns on pg_cron and pg_net, stores a GitHub token in Supabase Vault and starts one engine run now." buttons {"Cancel", "Schedule"} default button "Cancel" with title "devspot")' 2>/dev/null || true)
[ "$answer" = "Schedule" ] || { echo "Cancelled. Nothing changed."; exit 0; }

TOKEN=$(osascript -e 'text returned of (display dialog "Paste the fine-grained GitHub token (repository majuyi/devspot only, Actions: read and write). It goes to Supabase Vault and nowhere else." default answer "" with hidden answer buttons {"Cancel", "Continue"} default button "Continue" with title "devspot")' 2>/dev/null || true)
[ -n "$TOKEN" ] || { echo "No token given. Nothing changed."; exit 1; }
case "$TOKEN" in github_pat_*) ;; *) echo "Stopped: that is not a fine-grained token (they start with github_pat_)."; exit 1 ;; esac

# Checked against GitHub before anything is stored: the token must reach this repo.
# The header goes in on stdin so the token is not on curl's command line.
status=$(printf 'Authorization: Bearer %s\n' "$TOKEN" | curl -s -o /dev/null -w '%{http_code}' -H @- \
  -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$REPO/actions/workflows/engine.yml")
[ "$status" = "200" ] || { echo "Stopped: GitHub answered $status for that token on $REPO. Check its repository access and the Actions permission."; exit 1; }

PGPASSWORD=$(security find-generic-password -s "$SERVICE" -a postgres -w); export PGPASSWORD
CONN="host=$HOST port=5432 dbname=postgres user=postgres.$REF sslmode=require"

echo "== 1 to 3. Extensions, Vault secret and the cron job"
# The token travels on stdin inside a dollar-quoted literal, so it is not on a command line.
psql "$CONN" -v ON_ERROR_STOP=1 -q <<SQL
-- As Supabase's docs install them.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

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

-- cron.schedule replaces a job of the same name, so this is safe to run again.
select cron.schedule('engine-dispatch', '17 */2 * * *', \$job\$
  select net.http_post(
    url := 'https://api.github.com/repos/$REPO/actions/workflows/engine.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '$SECRET_NAME'),
      'Accept', 'application/vnd.github+json',
      'Content-Type', 'application/json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'devspot-pg-cron'),
    body := '{"ref": "main", "inputs": {"trigger": "pg_cron"}}'::jsonb,
    timeout_milliseconds := 10000)
\$job\$);
SQL
unset TOKEN
psql "$CONN" -Atqc "select format('job %s: %s %s', jobid, schedule, case when active then 'active' else 'INACTIVE' end) from cron.job where jobname = 'engine-dispatch'"

echo "== 4. One dispatch now"
id=$(psql "$CONN" -Atqc "select command from cron.job where jobname = 'engine-dispatch'" | psql "$CONN" -Atq)
for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 2
  result=$(psql "$CONN" -Atqc "select coalesce(status_code::text, error_msg) from net._http_response where id = $id")
  [ -n "$result" ] && break
done
case "$result" in
  204) echo "GitHub answered 204: an Engine run has been started (trigger pg_cron)." ;;
  "") echo "No answer from GitHub after 20 seconds. Check later: select * from net._http_response where id = $id;" ;;
  *) echo "GitHub answered: $result. The job is scheduled but this dispatch did not start a run." ;;
esac

echo "== 5. The app's roles cannot read the token"
psql "$CONN" -Atq <<'SQL'
select format('%-6s vault usage: %s, cron usage: %s, net usage: %s', r,
  has_schema_privilege(r, 'vault', 'USAGE'),
  has_schema_privilege(r, 'cron', 'USAGE'),
  has_schema_privilege(r, 'net', 'USAGE'))
from unnest(array['engine', 'web', 'admin']) as r;
SQL
unset PGPASSWORD
echo "Done. Each line above should end in false. Tell Claude, and it will check the run."
