# Database transfer

`scripts/pg_transfer.sh` assembles the sequence with real values filled in and prints it. It runs
nothing. Show the output, then execute the steps one at a time, **confirming each step marked
DESTRUCTIVE before running it.**

## Why `--no-owner --no-acl`

A Heroku dump is owned by a Heroku-generated role that does not exist on your server. Without
these flags `pg_restore` emits an ownership error per object and the restore looks catastrophic
while being mostly fine. With them, objects land owned by the connecting user.

## Extensions are the classic trap

`pg_restore` will not create an extension the target database lacks if the restoring role cannot
`CREATE EXTENSION`. `citext` and `pgcrypto` are the two that bite most often: the restore reports
success, and every query touching a `citext` column fails later.

Step 3 of the script lists the installed extensions **before** the restore for exactly this
reason. Compare it against the dump's requirements and create anything missing first.

## A restore overwrites whatever the release phase wrote

Ordering that looks harmless and is not. If you deploy first and restore second, the restore
replaces every table the dump covers — **including anything `post_deploy_script` wrote**. A
release marker, a migration audit row, a deploy timestamp: all reverted to the source platform's
values, and the app then reports that its last release came from Heroku.

Observed on a real rehearsal: `post_deploy_script` ran during the deploy and recorded a Hatchbox
release, the restore landed afterwards, and the app's release marker read `heroku` again.

Two consequences:

- **Phase 6 rehearsal:** the phase deploys before it restores, so the marker is stale by the end.
  **Re-run the release phase after the restore** — redeploy, or run the script by hand — before
  smoke testing, or the release-phase check reports the old platform and looks like a mapping
  failure that isn't one.
- **Phase 7 cutover:** the runbook restores *before* deploying, which is the correct order and
  avoids this entirely. Do not "optimise" by deploying early to save window time.

## Do not re-seed after restoring

If the app seeds data conditionally — "create these rows if the table is empty" — a restore
followed by `db:seed` either duplicates rows or, worse, quietly recreates records whose original
values were the evidence you needed. Anything signed with `SECRET_KEY_BASE` at seed time is
destroyed by re-seeding, and it is exactly what would have proved the key survived the move.

Restore, then verify. Never restore, seed, then verify.

## `pg:reset` is not a rehearsal reset

`heroku pg:reset` destroys data on **Heroku**, the side you are migrating away from and the only
copy that still works. To re-run a rehearsal, restore again over the Hatchbox database; leave
Heroku alone until cutover is complete and verified.

## Sizing the window

Restore time scales with data size, not row count. Time the rehearsal and use that number as the
cutover estimate. A rehearsal that takes four minutes means a maintenance window of at least
four minutes plus the deploy plus DNS propagation — say all three numbers separately in the
runbook rather than one optimistic total.
