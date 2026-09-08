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

Stop here and have the user approve the file. Nothing is written to Hatchbox until they do.

## Phases 3-7

Not yet implemented. Tell the user the skill currently covers assessment only, and that the
configure and cutover phases are coming.
