# Heroku inventory

`scripts/heroku_inventory.sh <app>` writes `.hatchbox/inventory.json`. Everything below is read
from that file — do not re-run `heroku` commands ad hoc, because the script is the tested path.

## What each key carries

| Key | Source | What to do with it |
|---|---|---|
| `app.stack` | `heroku api GET /apps/<app>` | `heroku-24`/`heroku-22` imply the Ubuntu baseline; note it in MIGRATION.md, nothing to port |
| `app.region.name` | same | Pick the matching Hatchbox provider region in Phase 3 |
| `config` | `heroku config -j` | Classify per `references/env-vars.md`. **Contains live secrets** |
| `addons` | `heroku addons --json` | Map per `references/addons.md`. Unmappable add-on = blocker |
| `domains` | `heroku domains --json` | `kind: "custom"` entries become Hatchbox domains in Phase 7 |
| `releases[0]` | `heroku releases --json --num 1` | Current deployed commit — the rollback reference point |
| `formation` | `heroku api GET /apps/<app>/formation` | Dyno types/sizes/quantities drive server sizing |
| `buildpacks` | `heroku buildpacks` | Anything beyond `heroku/ruby` and `heroku/nodejs` is a blocker |
| `pg_info` | `heroku pg:info` | Plan, PG version, data size — drives server disk and the restore window |
| `local.procfile` | `./Procfile` | Reconciled against auto-detection in Phase 4 |
| `local.app_json` | `./app.json` | Heroku review-app config. Not portable — read it for env var defaults and addon lists, then drop it |
| `local.puma_config` | `./config/puma.rb` | Check it binds `$PORT`; Hatchbox's socket activation needs the default Rails/Puma binding |
| `local.database_yml` | `./config/database.yml` | Confirm it reads `DATABASE_URL` rather than hardcoding a host |
| `local.bin_scripts` | `ls bin` | A `bin/` entry Heroku's release phase called must be reachable from `post_deploy_script` |
| `local.ruby_version` | `Gemfile.lock` | Must be an available Ruby on Hatchbox |
| `local.gems` | `Gemfile.lock` | `rails_12factor` gets removed; `puma`/`sidekiq`/`solid_queue` predict auto-detection |

## What the script cannot collect

**Heroku Scheduler jobs.** They live in the Scheduler add-on's own dashboard — not in
`heroku addons --json`, which reports only that the add-on is attached, and not in the platform
API. `heroku addons:open scheduler` opens it. (Check `heroku scheduler --help` first in case the
installed plugin version offers a listing; do not assume one exists.)

This is a **manual step and must be named as one**: ask the user to paste the job list — command,
frequency, and dyno size for each — and record it. Producing an empty "Scheduled jobs" table in
MIGRATION.md because nothing was collected is a silent data loss; a migration that drops a nightly
billing job looks completely successful until the end of the month.

**Scheduler commands are arbitrary shell, not necessarily rake tasks.** `rails db:sweep`,
`ruby bin/prune-exports` and `bin/do-thing --flag` are all valid entries. Carry the command
verbatim into the Hatchbox cron job rather than assuming a `rails <task>` shape and rewriting it.

Note also that Scheduler runs each job on its own one-off dyno, whereas a Hatchbox cron job runs
on the server alongside everything else. A job that assumed a whole dyno's memory is worth
flagging.

## Sizing heuristic

Sum the formation: a `standard-1x` dyno is 512 MB, `standard-2x` 1 GB, `performance-m` 2.5 GB,
`performance-l` 14 GB. Add the Postgres data size from `pg_info`, then pick the smallest
Hatchbox server that fits with 50% headroom. State the arithmetic in MIGRATION.md so the user
can overrule it.

## Secrets

`.hatchbox/inventory.json` holds every config var in plaintext. The skill appends `.hatchbox/`
to `.gitignore` **before** the first run. Never paste config values into MIGRATION.md, a commit
message, or a chat summary — names only.
