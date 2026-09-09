# Phase 7 — cutover

Every step here was rehearsed in Phase 6. If any of it is happening for the first time now, stop
and go back.

## 24 hours ahead

Lower the DNS TTL on the hostname to 60 seconds. This has to happen a full TTL in advance or the
old value is still cached when you flip.

## The window

1. `heroku maintenance:on --app <app>`
2. `heroku ps:scale web=0 worker=0 --app <app>` — **and every other process type in the
   inventory's `formation`**, not just these two. A `clock` dyno left running keeps writing to the
   database you are about to dump.
3. **Delete the Heroku Scheduler jobs.** Scaling to zero does not stop them and neither does
   maintenance mode: `ps:scale` sets quantities for Procfile process types, while Scheduler runs
   each job on its own **one-off dyno**, which is a separate mechanism. A nightly job left in
   place keeps running against the old database after you have cut over — sending mail, charging
   cards, writing rows nobody will ever migrate. The Hatchbox cron jobs created in Phase 4 are
   already covering that work, so this is the moment the Heroku copies must go. Remove them in the
   Scheduler dashboard, or detach the add-on.
4. `heroku pg:backups:capture --app <app>` — the final capture, after writes have stopped.
5. `hatchbox_enable_app_maintenance` with `app_id`, so the Hatchbox side does not serve
   half-restored data.
6. Restore per `references/database-transfer.md`.
7. `hatchbox_deploy_app`, poll `hatchbox_get_log` to terminal.
8. `hatchbox_disable_app_maintenance`.
9. Smoke test against the **Hatchbox hostname** recorded in Phase 4 (`<hashid>.hatchboxapp.com`
   — the API does not return it), before any DNS change.
10. `hatchbox_create_domain` with `app_id` and `name`, then point DNS at the server and verify —
    read the SSL section below first, because the order here decides how long TLS is broken.

Step 10 is the first `require_payment_method!` gate the migration touches. On a trial without a
card it 402s there, after everything else has succeeded. **No API call reports whether a card is
on file**, so checking means asking the user to look in the dashboard — and asking before step 1,
not at step 10.

## SSL: creating the domain starts the clock, and DNS has to be there

`hatchbox_create_domain` is not a bookkeeping call. The record's `after_commit` reloads Caddy,
and Caddy's automatic HTTPS immediately tries to obtain a certificate by HTTP-01 — which requires
the hostname to already resolve to this server. Create the domain while DNS still points at
Heroku and that first attempt **fails**; Caddy then retries on a backoff, so the certificate
arrives some minutes after DNS propagates rather than at the moment it propagates.

There is no ordering that avoids a gap entirely, so choose deliberately:

- **Create the domain, then flip DNS.** Safest for availability: if the call 402s you find out
  before traffic has moved. Cost is a TLS-error window that outlasts DNS propagation by however
  long Caddy's backoff takes.
- **Flip DNS, then create the domain.** The certificate issues cleanly on the first attempt.
  Cost is that between the two, requests reach a Caddy with no site block for that hostname. Only
  take this route with a card already confirmed.

Either way, **verify HTTPS explicitly** — `curl -sSI https://<domain>` — rather than assuming the
domain record's existence means the certificate exists. It does not.

**Wildcard domains are a different mechanism.** HTTP-01 cannot validate `*.example.com`, so a
wildcard needs DNS-01: set `dns_provider` and `dns_access_token` on the app
(`hatchbox_update_app`) before creating the domain, or SSL will never come up for it. Apex and
`www` are two separate domain records; create both if the app answers on both.

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
