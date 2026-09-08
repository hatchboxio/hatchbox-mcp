# Phase 7 — cutover

Every step here was rehearsed in Phase 6. If any of it is happening for the first time now, stop
and go back.

## 24 hours ahead

Lower the DNS TTL on the hostname to 60 seconds. This has to happen a full TTL in advance or the
old value is still cached when you flip.

## The window

1. `heroku maintenance:on --app <app>`
2. `heroku ps:scale web=0 worker=0 --app <app>` — and every other process type in the Procfile.
   A `clock` dyno left running will keep writing to the database you are about to dump.
3. `heroku pg:backups:capture --app <app>` — the final capture, after writes have stopped.
4. `hatchbox_enable_app_maintenance` with `app_id`, so the Hatchbox side does not serve
   half-restored data.
5. Restore per `references/database-transfer.md`.
6. `hatchbox_deploy_app`, poll `hatchbox_get_log` to terminal.
7. `hatchbox_disable_app_maintenance`.
8. Smoke test against the **Hatchbox hostname**, before any DNS change.
9. `hatchbox_create_domain` with `app_id` and `name`, then point DNS at the server and verify.

Step 9 is the first `require_payment_method!` gate the migration touches. On a trial without a
card it 402s here, after everything else has succeeded. Check for a card before step 1, not at
step 9.

## Smoke testing means credential paths

There is no env var read endpoint: values are unverifiable by inspection, and a stale or
truncated secret is invisible until something uses it. A homepage returning 200 proves almost
nothing.

Exercise, at minimum:

- **Send a real email.** Catches wrong SMTP credentials, which is the most common re-signup miss.
- **Write and read back an object in the storage bucket.** Catches wrong S3 credentials.
- **Enqueue a job on a named queue and confirm a worker picks it up.** Catches an unreconciled
  process — the failure that otherwise looks like success.
- **Confirm a pre-existing session or signed cookie still validates.** Catches a changed
  `SECRET_KEY_BASE`, which nothing else detects.
- **Confirm the release phase ran** on the new platform, not just that the deploy succeeded.

## Rollback

**Flip DNS back to Heroku, then `heroku maintenance:off`.** In that order — DNS first, so traffic
has somewhere to go before it is allowed to arrive.

Rollback is only possible while Heroku still has its data. **Do not run `heroku pg:reset`, do not
delete add-ons, and do not destroy the Heroku app in the same session as the cutover.** Give it a
week. The whole rollback plan is "the old thing is still there."

Writes that landed on Hatchbox after cutover do not exist on Heroku. Rolling back loses them,
which is why the smoke test happens before the DNS flip rather than after.
