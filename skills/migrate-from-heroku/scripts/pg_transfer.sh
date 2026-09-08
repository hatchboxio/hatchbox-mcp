#!/usr/bin/env bash
# Assembles the Heroku -> Hatchbox database transfer sequence with real values filled in.
# PRINTS ONLY. Nothing here runs anything; the operator reads it and runs the steps.
set -euo pipefail

heroku_app=""; ssh_host=""; ssh_user=""; database=""; dump_url=""

while [ $# -gt 0 ]; do
  case "$1" in
    --heroku-app) heroku_app="$2"; shift 2 ;;
    --ssh-host)   ssh_host="$2";   shift 2 ;;
    --ssh-user)   ssh_user="$2";   shift 2 ;;
    --database)   database="$2";   shift 2 ;;
    --dump-url)   dump_url="$2";   shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
done

for pair in "heroku-app:$heroku_app" "ssh-host:$ssh_host" "ssh-user:$ssh_user" \
            "database:$database" "dump-url:$dump_url"; do
  if [ -z "${pair#*:}" ]; then
    echo "required argument missing: --${pair%%:*}" >&2
    exit 64
  fi
done

ssh_target="${ssh_user}@${ssh_host}"
remote_dump="/tmp/${heroku_app}.pgsql"

cat <<STEPS
Database transfer: ${heroku_app} -> ${ssh_target}:${database}

1. Capture a fresh backup on Heroku (safe, read-only):

   heroku pg:backups:capture --app ${heroku_app}
   heroku pg:backups:url --app ${heroku_app}

2. Download it onto the Hatchbox server:

   ssh ${ssh_target} 'curl -sSL "${dump_url}" -o ${remote_dump}'
   ssh ${ssh_target} 'ls -lh ${remote_dump}'

3. Confirm the extensions the dump needs exist (safe):

   ssh ${ssh_target} 'psql -d ${database} -c "\\dx"'

4. DESTRUCTIVE - restore over the target database. This drops and recreates every object
   it restores. Confirm before running:

   ssh ${ssh_target} 'pg_restore --clean --if-exists --no-owner --no-acl \\
     --dbname=${database} ${remote_dump}'

5. Verify (safe):

   ssh ${ssh_target} 'psql -d ${database} -c "\\dt"'
   ssh ${ssh_target} 'psql -d ${database} -c "\\dx"'

6. Remove the dump, which contains all of your data (safe):

   ssh ${ssh_target} 'rm -f ${remote_dump}'

Nothing above has been run. Read step 4 before you run step 4.
STEPS
