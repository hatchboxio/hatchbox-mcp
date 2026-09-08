#!/usr/bin/env bash
# Assembles the Heroku -> Hatchbox database transfer sequence with real values filled in.
# PRINTS ONLY. Nothing here runs anything; the operator reads it and runs the steps.
#
# The connection URI is never printed: Hatchbox databases have a dedicated role and password,
# and inlining it would put the password in this output and in the server's shell history.
set -euo pipefail

heroku_app=""; ssh_host=""; ssh_user=""; database=""; db_uri=""; dump_url=""

while [ $# -gt 0 ]; do
  case "$1" in
    --heroku-app) heroku_app="$2"; shift 2 ;;
    --ssh-host)   ssh_host="$2";   shift 2 ;;
    --ssh-user)   ssh_user="$2";   shift 2 ;;
    --database)   database="$2";   shift 2 ;;
    --db-uri)     db_uri="$2";     shift 2 ;;
    --dump-url)   dump_url="$2";   shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
done

for pair in "heroku-app:$heroku_app" "ssh-host:$ssh_host" "ssh-user:$ssh_user" \
            "database:$database" "db-uri:$db_uri"; do
  if [ -z "${pair#*:}" ]; then
    echo "required argument missing: --${pair%%:*}" >&2
    exit 64
  fi
done

ssh_target="${ssh_user}@${ssh_host}"
remote_dump="/tmp/${heroku_app}.pgsql"
[ -n "$dump_url" ] || dump_url='<paste the URL printed by step 1>'

cat <<STEPS
Database transfer: ${heroku_app} -> ${ssh_target}:${database}

0. Open a shell on the server and set the connection URI for this session. Get the value from
   hatchbox_get_app_database (field: private_connection_uri). **Prefix the export with a space**
   so the password does not land in shell history:

   ssh ${ssh_target}
    export HB_DB_URI='postgresql://...'

   Every command below runs inside that session and refers to \$HB_DB_URI. A Hatchbox database
   has its own role and password — connecting as ${ssh_user} over the local socket will not work.

1. Capture a fresh backup on Heroku (safe, read-only). Run this locally, not on the server.
   The signed URL it prints is short-lived, so do step 2 straight after:

   heroku pg:backups:capture --app ${heroku_app}
   heroku pg:backups:url --app ${heroku_app}

2. Download it onto the Hatchbox server:

   curl -sSL "${dump_url}" -o ${remote_dump}
   ls -lh ${remote_dump}

3. Compare extensions BEFORE restoring (safe). pg_restore will not create an extension the
   target lacks if the role cannot CREATE EXTENSION, and the restore still reports success:

   psql "\$HB_DB_URI" -c '\\dx'
   pg_restore --list ${remote_dump} | grep -i 'EXTENSION' || echo 'no extensions in dump'

   Create anything the dump needs and the target lacks before continuing. If the app role is
   not permitted to, this needs a superuser and is a stop-and-ask, not a workaround.

4. DESTRUCTIVE - restore over the target database. This drops and recreates every object it
   restores. Confirm before running:

   pg_restore --clean --if-exists --no-owner --no-acl --dbname="\$HB_DB_URI" ${remote_dump}

5. Verify (safe):

   psql "\$HB_DB_URI" -c '\\dt'
   psql "\$HB_DB_URI" -c '\\dx'

6. Remove the dump, which contains all of your data (safe):

   rm -f ${remote_dump}

Nothing above has been run. Read step 4 before you run step 4.
STEPS
