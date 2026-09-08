# Migration plan template

Write this to `MIGRATION.md` at the repo root. It is the review gate — the user approves this
file before anything is written to Hatchbox.

---

# Migrating <app> from Heroku to Hatchbox

Generated <date> from `.hatchbox/inventory.json`. **Nothing has been changed yet.**

## Blockers

<Unmappable add-ons, non-`heroku/ruby` buildpacks, local filesystem writes, Heroku platform API
usage. If this section is non-empty, the migration does not proceed until each is resolved.
If it is empty, write "None found." and say what was checked.>

## Target infrastructure

| | Heroku today | Hatchbox target |
|---|---|---|
| Region | | |
| Web | <n> x <size> | <server size> |
| Worker | <n> x <size> | same server, `worker` process |
| Postgres | <plan>, <version>, <size> | `postgresql` role |
| Redis | <plan> | `redis` role / none |

Sizing arithmetic: <show it>

## Add-ons

| Add-on | Plan | Bucket | Replacement | Action needed from you |
|---|---|---|---|---|

## Environment variables

| Name | Label | Note |
|---|---|---|

**<n> variables need new values from you** (the re-signup rows). No values appear in this file.

The Note column is **mandatory** for every judgment-call var in `references/env-vars.md` — say
what you decided and why. A judgment var with a blank Note means the decision was never made.

## Processes

| Procfile entry | Hatchbox |
|---|---|
| `web:` | dropped — replaced by the auto-detected socket-activated `server` process |

## Scheduled jobs

| Command | Frequency | Hatchbox cron job |
|---|---|---|

<Collected from the Scheduler dashboard, not from the CLI — see `references/heroku-inventory.md`.
If you could not get the list, say so here explicitly rather than leaving the table empty.>

## Release phase

<The `release:` Procfile entry, if any, becomes the app's `post_deploy_script` in Phase 4. Quote
the command here. If there is no release phase, write "None.">

## Repo changes

<The diff Phase 5 will make, described. Nothing is committed yet.>

## Cutover

Rehearsal: <date>. Cutover: <date>. Expected downtime: <derived from the Postgres data size>.
Rollback: flip DNS back to Heroku, `heroku maintenance:off`. The Heroku app is not destroyed.

## Approval

- [ ] I have read the blockers and the env var table and approve proceeding to Phase 3.
