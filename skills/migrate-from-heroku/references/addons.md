# Heroku add-on mapping

Look up every entry in `inventory.json`'s `addons` array. An add-on that is not in this table is
a **blocker** — say so in MIGRATION.md and stop. Do not guess a replacement; a wrong guess here
silently loses data or breaks a production integration at cutover.

Four buckets, and every add-on gets exactly one:

- **replaced** — Hatchbox provides it natively.
- **byo** — keep the vendor, sign up directly, supply new credentials under the same var name.
- **drop** — Heroku-platform-specific, no counterpart needed.
- **blocker** — no clean path; stop at Phase 2 and make the user decide.

The `Injected vars` column is what `references/env-vars.md` classifies. Verify a row against the
vendor's current docs before relying on it — add-ons do rename their variables.

| Add-on | Bucket | Replacement | Injected vars |
|---|---|---|---|
| `heroku-postgresql` | replaced | Hatchbox `postgresql` role + `hatchbox_create_database` | `DATABASE_URL` |
| `heroku-redis` | replaced | Hatchbox `redis` role | `REDIS_URL`, `REDIS_TLS_URL` |
| `scheduler` | replaced | Hatchbox cron jobs (`hatchbox_create_cron_job`) | none |
| `pgbackups` | replaced | Hatchbox database backups | none |
| `heroku-kafka` | blocker | no Hatchbox equivalent; user must run or buy Kafka | `KAFKA_URL`, `KAFKA_CLIENT_CERT*` |
| `heroku-connect` | blocker | Salesforce sync is Heroku-platform-only | `HEROKU_CONNECT_*` |
| `sendgrid` | byo | sign up at sendgrid.com | `SENDGRID_API_KEY`, `SENDGRID_USERNAME`, `SENDGRID_PASSWORD` |
| `mailgun` | byo | sign up at mailgun.com | `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_SMTP_*` |
| `postmark` | byo | sign up at postmarkapp.com | `POSTMARK_API_TOKEN`, `POSTMARK_SMTP_SERVER` |
| `sendinblue` | byo | sign up at brevo.com | `SENDINBLUE_API_KEY` |
| `cloudinary` | byo | sign up at cloudinary.com | `CLOUDINARY_URL` |
| `bucketeer` | byo | the user's own S3 bucket + IAM user | `BUCKETEER_AWS_ACCESS_KEY_ID`, `BUCKETEER_AWS_SECRET_ACCESS_KEY`, `BUCKETEER_BUCKET_NAME` |
| `memcachier` | byo | sign up at memcachier.com | `MEMCACHIER_SERVERS`, `MEMCACHIER_USERNAME`, `MEMCACHIER_PASSWORD` |
| `cloudamqp` | byo | sign up at cloudamqp.com | `CLOUDAMQP_URL` |
| `bonsai` | byo | sign up at bonsai.io | `BONSAI_URL` |
| `searchbox` / `foundelasticsearch` | byo | sign up with the vendor | `SEARCHBOX_URL` / `FOUNDELASTICSEARCH_URL` |
| `papertrail` | byo | sign up at papertrailapp.com. **Injects nothing** — it attaches a *log drain*, and Hatchbox has no drain equivalent, so logging must be re-pointed as a deliberate step. Larger than a token swap | none |
| `mailtrap` | byo | sign up at mailtrap.io | `SMTP_ADDRESS`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `MAILTRAP_API_TOKEN` |
| `logentries` / `coralogix` | byo | sign up with the vendor | `LOGENTRIES_TOKEN` / `CORALOGIX_PRIVATE_KEY` |
| `newrelic` | byo | sign up at newrelic.com | `NEW_RELIC_LICENSE_KEY` |
| `appsignal` | byo | sign up at appsignal.com | `APPSIGNAL_PUSH_API_KEY` |
| `scout` | byo | sign up at scoutapm.com | `SCOUT_KEY`, `SCOUT_NAME` |
| `rollbar` | byo | sign up at rollbar.com | `ROLLBAR_ACCESS_TOKEN` |
| `sentry` | byo | sign up at sentry.io | `SENTRY_DSN` |
| `bugsnag` | byo | sign up at bugsnag.com | `BUGSNAG_API_KEY` |
| `honeybadger` | byo | sign up at honeybadger.io | `HONEYBADGER_API_KEY` |
| `librato` | byo | sign up at librato.com | `LIBRATO_USER`, `LIBRATO_TOKEN` |
| `blackfire` | byo | sign up at blackfire.io | `BLACKFIRE_SERVER_ID`, `BLACKFIRE_SERVER_TOKEN` |
| `fixie` / `quotaguard` / `proximo` | drop | static egress IP — a Hatchbox server already has one | `FIXIE_URL` / `QUOTAGUARDSTATIC_URL` / `PROXIMO_URL` |
| `ssl` / `expedited-ssl` | drop | Hatchbox terminates TLS via Caddy | none |
| `heroku-deploy-hooks` | drop | replaced by Hatchbox deploy notifications | none |
| `autoidle` / `adept-scale` / `rails-autoscale` | drop | no dyno autoscaling to manage | varies |
| `dyno-metadata` | drop | labs feature; all `HEROKU_*` vars go away | `HEROKU_APP_NAME`, `HEROKU_RELEASE_VERSION`, `HEROKU_SLUG_COMMIT` |

The `fixie`/`quotaguard` row is the one that most often gets mis-bucketed: dropping it is correct
*only* once whoever operates the allowlisted destination has added the Hatchbox server's IP.
Surface that as an action item in MIGRATION.md, not a silent drop.
