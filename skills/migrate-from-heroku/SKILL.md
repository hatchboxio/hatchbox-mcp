---
name: migrate-from-heroku
description: Use when migrating a Rails application from Heroku to Hatchbox — inventorying a Heroku app's config, add-ons, dynos and database, producing a reviewed migration plan, and carrying out the move. Triggers on "migrate from Heroku", "move off Heroku", "Heroku to Hatchbox", or a Heroku app that needs a new home.
---

# Migrate from Heroku to Hatchbox

Takes one Rails app from Heroku to Hatchbox: inventory, a reviewed plan, then a rehearsed
cutover with a rollback path.

## Before anything else

**Rails only.** If the app is not Rails, stop and say so — the value here is the
framework-specific mapping, and guessing at another stack does the user a disservice.

**One app per run.** If the user has a pipeline, pick the staging app first. Its `MIGRATION.md`
is what the production run reads to avoid re-deciding everything.

## Phase 0 — Preflight

Run these checks before touching anything. Report all failures at once rather than one per turn.

1. `heroku auth:whoami` — the Heroku CLI must be installed and logged in.
2. `jq --version` — required by the inventory script. Install with `brew install jq`.
3. `git status --porcelain` — the working tree must be clean.
4. Confirm a Rails app: `config/application.rb` and `Gemfile.lock` exist.
5. Call `hatchbox_get_me`. This is the canary.

### Reading the `hatchbox_get_me` result

A **402** here means the Hatchbox account cannot use the API yet, and no later phase will work.
There are two distinct 402s and they are only distinguishable by message:

- *Subscription required* — the account has no active subscription. The 7-day free trial counts.
  Send the user to https://hatchbox.io to sign up and subscribe.
- *Payment method required* — subscribed, on trial, no card on file. Domains are gated behind
  this, and a migration needs a domain, so it must be resolved before Phase 7 regardless.

A **401** means `HATCHBOX_API_TOKEN` is missing or wrong — tokens are created at
https://hatchbox.io/api_tokens.

Do not proceed past Phase 0 until `hatchbox_get_me` returns a user.

## Phase 1 — Inventory (read-only)

Read `references/heroku-inventory.md`, then run:

```bash
./skills/migrate-from-heroku/scripts/heroku_inventory.sh <heroku-app-name>
```

It writes `.hatchbox/inventory.json`. **Append `.hatchbox/` to `.gitignore` before running it** —
the file contains every config var in plaintext.

## Phase 2 — Plan (the review gate)

Read `references/addons.md` and `references/env-vars.md`, then write `MIGRATION.md` following
`references/migration-template.md`.

**Names and classifications only — never secret values in `MIGRATION.md`.**

### Completeness gate — run before showing the file

Silent emptiness is this phase's failure mode. A table left empty because nothing was *collected*
reads identically to one empty because there was nothing to collect, and the migration then looks
clean right up until the thing you dropped was needed. Check each invariant below. Where you
genuinely could not fill something in, **write why in the file** — never leave it blank.

- [ ] `scheduler` appears in `addons` → the Scheduled jobs table has rows, or states that the job
      list was not collected from the dashboard and why
- [ ] `local.procfile` contains a `release:` line → the Release phase section quotes that command
      rather than saying "None"
- [ ] `addons` is non-empty → every entry has a row in the Add-ons table, including any bucketed
      as a blocker
- [ ] every judgment-call var present in `config` → carries a non-empty Note saying what was
      decided and why
- [ ] `domains` contains a `kind: "custom"` entry → that hostname appears in the Cutover section
- [ ] `local.gems.rack_timeout` was checked before labelling `RACK_TIMEOUT_SERVICE_TIMEOUT`
- [ ] the `heroku run env` delta against `config` was either run, or its omission stated — and it
      is **not optional** if `local.profile_d_writers` is non-empty

Stop here and have the user approve the file. Nothing is written to Hatchbox until they do.

## Phase 3 — Provisioning (the handoff)

Read `references/provisioning.md`. Print the filled-in checklist, then poll
`hatchbox_list_account_clusters` and `hatchbox_list_servers` until the server is ready. Verify
the roles match what the app needs before continuing.

## Phase 4 — Configure

Read `references/configure.md`. Order is load-bearing: create app → create and attach databases
(reading injected env var names off the responses) → create env vars → set `post_deploy_script`
→ cron jobs. **Do not create processes here.** Domains wait for Phase 7.

## Phase 5 — Repo branch

Read `references/rails-changes.md`. Branch `hatchbox-migration`, make the edits, run the app's
own test suite, present the diff. Push nothing without approval; a failing suite stops the phase.

## Phase 6 — Deploy and rehearse

**This runs days before cutover. It is what makes the real cutover boring.**

1. `hatchbox_deploy_app`, then poll `hatchbox_get_log` to a terminal state. On failure read the
   log body and diagnose against `references/troubleshooting.md` — never report a bare failure.
2. Reconcile processes — `references/processes.md`.
3. Rehearse the data transfer — `references/database-transfer.md`.
4. Smoke test against the Hatchbox hostname, exercising credential paths.

### Reconciliation gate — run before leaving Phase 6

- [ ] every Procfile entry is accounted for as dropped, updated, created, or already correct
- [ ] the `web:` entry was dropped, not translated
- [ ] every entry with no detected counterpart was **created** — state the count, and state zero
      explicitly if it is zero
- [ ] every process write was polled to a terminal state
- [ ] the env var ledger's confirmed names match the intended set from `MIGRATION.md`

## Phase 7 — Cutover

Read `references/cutover.md`. Everything here was rehearsed in Phase 6.

TTL down 24h ahead → maintenance on → scale all dynos to 0 → final capture → Hatchbox maintenance
on → restore → deploy → maintenance off → smoke test on the Hatchbox hostname → create the domain
and flip DNS.

### Cutover gate — run before flipping DNS

- [ ] Phase 6 was rehearsed end to end, including a real restore
- [ ] a card is on file — `hatchbox_create_domain` 402s without one, at the very last step
- [ ] every Procfile dyno type is scaled to 0, not just `web` and `worker`
- [ ] the smoke test exercised mail, storage, a named queue, and an existing signed cookie
- [ ] the Heroku app, its add-ons and its data are all still intact for rollback
- [ ] the rollback order is understood: DNS back first, then `heroku maintenance:off`
