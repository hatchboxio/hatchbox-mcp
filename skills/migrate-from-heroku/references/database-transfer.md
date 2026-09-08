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
