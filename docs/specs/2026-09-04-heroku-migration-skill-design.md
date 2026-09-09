# Heroku → Hatchbox Migration Skill — Design

Date: 2026-09-04

## Problem

Prospective Hatchbox customers leaving Heroku have no guided path. Hatchbox has the marketing
pages (`vs/heroku`, `alternatives/heroku`) but nothing that actually moves an app.

What we have to build on is a published MCP server that exposes the whole `/api/v1` surface to a
coding agent. A migration skill turns that into a guided, mostly-automated migration that runs in
the customer's own repo.

## Goals

- Take a Rails app running on Heroku and get it running on Hatchbox, with its data, on a
  planned cutover with a rollback path.
- Be honest about the manual steps rather than papering over them.
- Never take a destructive action the user hasn't seen written out first.

## Non-goals

- Non-Rails stacks (refuse with an explanation).
- Migrating a whole Heroku pipeline in one pass.
- Near-zero-downtime cutover via replication.
- Provisioning infrastructure — the API can't, so the skill doesn't pretend to.

## Audience constraint: the 402 gates come first

Every endpoint the skill needs is behind `require_subscription!`. A second gate,
`require_payment_method!`, additionally gates `domains#create`, `domains#update` and
`auto_deploys#create` behind a card on file *during the trial*. Domains are load-bearing for a migration.

So a "potential customer" cannot run this cold. The real order is: sign up → subscribe → add a
card → create cluster + server → then the skill can act. Phase 0 checks this with
`hatchbox_get_me` and routes to signup on a 402, and the skill's README states it up front. A
prospect discovering this as an error on their first tool call is the failure mode to avoid.

## Architecture

An MCP-first orchestrator. The skill drives three things:

1. The **`heroku` CLI**, read-only, for inventory.
2. The customer's **git repo**, on a branch, for code changes.
3. **`@hatchbox/hatchbox-mcp` ≥ 0.7.0** for everything on the Hatchbox side.

Plus one guarded **SSH** sequence for the database restore, which has no API equivalent.

No hand-rolled HTTP. The Hatchbox API contract lives in the MCP server, which is versioned and
tested independently.

### Structure

In the `hatchbox-mcp` repo, under `skills/`:

```
migrate-from-heroku/
  SKILL.md                    ← phase state machine + gates
  references/
    heroku-inventory.md       ← every read command, what to extract
    addons.md                 ← curated mapping table (~30 add-ons)
    env-vars.md               ← keep / drop / re-point / re-signup rules
    rails-changes.md          ← puma, release phase, gems to drop
    processes.md              ← Procfile vs. Hatchbox auto-detection
    database-transfer.md      ← SSH sequence + confirmation guardrails
    cutover.md                ← runbook, smoke tests, rollback
    troubleshooting.md        ← 402s, failed deploys, log polling
  scripts/
    heroku_inventory.sh       ← deterministic read-only dump → JSON
```

Progressive disclosure: `SKILL.md` holds the phase machine and reads only the reference for the
phase it is in.

## Phases

### 0 — Preflight

Verify: `heroku` CLI installed and authenticated (`heroku auth:whoami`), MCP server reachable,
clean git tree, Rails app present. `hatchbox_get_me` is the canary — a 402 here means the account
isn't subscribed, and the skill routes to signup rather than failing thirty calls later.

### 1 — Inventory (read-only)

`scripts/heroku_inventory.sh <app>` collects:

- `heroku config -j`
- `heroku addons --json`
- `heroku domains --json`
- `heroku buildpacks`
- `heroku pg:info` (plan, size, PG version)
- `heroku releases --json` (current commit)
- `heroku api GET /apps/<app>/formation` (dyno types, sizes, quantities)
- `heroku api GET /apps/<app>` (stack, region)

Locally: `Procfile`, `app.json`, `Gemfile.lock` (Ruby version, `rails_12factor`, puma, sidekiq,
solid_queue), `config/puma.rb`, `config/database.yml`, `bin/` scripts.

Output: `.hatchbox/inventory.json`.

### 2 — Plan (the review gate)

Writes `MIGRATION.md`:

- Add-on table, bucketed per `references/addons.md`.
- Env var table classified **keep** / **drop** (Heroku-injected: `PORT`, `DYNO`, `HEROKU_*`,
  `DATABASE_URL`) / **re-point** / **re-signup**.
- Procfile reconciled against what Hatchbox will auto-detect (see Phase 4).
- Heroku Scheduler → cron jobs.
- Release phase → `post_deploy_script`.
- Required repo changes.
- Server sizing derived from the dyno formation and `pg:info`.
- **Blockers**: unclassifiable add-ons, local-filesystem writes (Heroku's ephemeral disk hides
  these), anything using Heroku platform APIs.

**Nothing is written to Hatchbox until the user approves this file.**

### 3 — Provision (the handoff)

Creating a cluster and creating a server are dashboard-only — `hatchbox_provision_server` only
re-provisions a server that already exists. The skill prints a personalized checklist (provider
and region matched to the Heroku region, server size from Phase 2, roles `web` + `postgresql`,
plus `redis` if needed) and then **polls** `hatchbox_list_account_clusters` and
`hatchbox_list_servers` until the server is ready, rather than asking the user whether they're
done.

### 4 — Configure

Ordering is load-bearing, for two reasons documented below (auto-detection, and env var name
readback).

1. `hatchbox_create_app` — cluster, name, repo, branch, `connected_account_id` from
   `hatchbox_list_account_git_providers`.
2. `hatchbox_create_database`, then `hatchbox_attach_database`. **Read the injected env var name
   off the response** (`app_attachments[].env_var`) — do not assume `DATABASE_URL`.
3. `hatchbox_create_env_vars` for the classified set, minus anything the attachment already
   provided. **Record the returned names** — this is the only readback available.
4. `hatchbox_update_app` for build and deploy scripts (`post_deploy_script` ← release phase).
5. Cron jobs via `hatchbox_create_cron_job`.

Domains are deliberately deferred to Phase 7 — they are the only DNS-visible step, and they sit
behind `require_payment_method!`.

**Processes are NOT created here.** `Apps::DetectProcesses` runs on the first deploy, reads
`Gemfile.lock` from the deployed release, and creates:

| Detected | name | start_command | roles | socket |
|---|---|---|---|---|
| rails | `server` | `bin/rails server -b 127.0.0.1 -p $PORT` | web | ✓ |
| puma (no rails) | `server` | `bundle exec --keep-file-descriptors puma -b tcp://127.0.0.1:$PORT` | web | ✓ |
| config.ru only | `server` | `bundle exec rackup -p $PORT` | web | |
| sidekiq | `sidekiq` | `bundle exec sidekiq` | worker | |
| solid_queue | `solid_queue` | `bin/jobs` | worker | |

Detection skips any name that already exists, so pre-creating a `server` or `sidekiq` process
would suppress it. The skill therefore **deploys first, then reconciles**: `hatchbox_update_process`
to adjust a detected process whose Procfile equivalent differs (e.g. `bundle exec sidekiq -q
critical -q default`), and `hatchbox_create_process` only for Procfile entries with no detected
counterpart (clock processes, second workers, custom queues).

The Heroku `web:` Procfile line is dropped, not translated — Hatchbox's socket-activated web
process replaces it.

### 5 — Repo branch

Branch `hatchbox-migration`. Edits per `references/rails-changes.md`, run the test suite, present
the diff. Nothing pushed or merged without approval.

### 6 — Deploy and rehearse

1. `hatchbox_deploy_app`, poll `hatchbox_get_log` to a terminal state
   (`completed`/`failed`/`aborted`). On failure, fetch the log body and diagnose — never report a
   bare "it failed."
2. Reconcile processes (see Phase 4).
3. Data rehearsal: `heroku pg:backups:capture` → `pg:backups:url` → SSH → `pg_restore`.
4. Smoke test against the Hatchbox hostname.

**This runs days before cutover.** It is what makes the real cutover boring.

### 7 — Cutover

1. Lower DNS TTL to 60s, 24h ahead.
2. `heroku maintenance:on`
3. `heroku ps:scale web=0 worker=0`
4. `heroku pg:backups:capture`
5. Restore over SSH (see below).
6. `hatchbox_deploy_app` → smoke test.
7. `hatchbox_create_domain` for the real hostname, flip DNS, verify.

`hatchbox_enable_app_maintenance` / `hatchbox_disable_app_maintenance` gate the Hatchbox side
while the restore is in flight. **Rollback: flip DNS back, `heroku maintenance:off`.** Do not
destroy the Heroku app in the same session.

## Verification without env var reads

`GET /api/v1/apps/:id/env_vars` does not exist, and adding it was declined (2026-09-04): Hatchbox
is not ready to expose env var values over the API. The skill works around it:

- **Names**: `create` renders `_env_var.json.jbuilder` (`id`, `name`), so `hatchbox_create_env_vars`
  echoes back what it created. This is how the skill learns that `EnvVar.create_with_prefix`
  renamed a colliding var to e.g. `RED_FOO`.
- **The database URL**: the database payload carries `app_attachments[].env_var`, plus `username`,
  `password`, and `private_connection_uri`. The skill reads the attachment's env var name rather
  than assuming it.
- **The ledger**: every create response is recorded (names only) in `.hatchbox/inventory.json`.
  Phase 6 verifies intended-set against confirmed-set from that ledger.
- **What cannot be verified: values.** A stale or truncated secret is undetectable until runtime.
  Phase 6's smoke test therefore must exercise credential-touching paths — send a test email, hit
  the storage bucket — not just check that the homepage returns 200. `references/cutover.md`
  carries this as an explicit checklist rather than leaving it to judgment.

## State and secrets

- `MIGRATION.md` — human-readable, on the migration branch. **Names and classifications only,
  never secret values.**
- `.hatchbox/inventory.json` — holds every config var in plaintext. The skill appends it to
  `.gitignore` **before** writing it.
- The staging run's `MIGRATION.md` is what the production run reads to avoid re-deciding.

## Error handling

- Two distinct 402s (subscription vs. card-on-trial) → distinct explanations, since they are
  distinguishable only by message.
- Async tools (`deploy`, `restart`, process writes, `provision`, `reboot`) return a `log_id` and
  are always polled to a terminal state. `enable_process`/`disable_process` return no log id on a
  no-op.
- Unclassified add-on → hard stop at Phase 2.
- SSH: every remote command is assembled and displayed with real host, user and database filled
  in; each destructive one is confirmed before it runs.

## Testing

- `heroku_inventory.sh` against recorded fixtures.
- **End-to-end: migrate a throwaway Heroku app to a real Hatchbox account before publishing, and
  re-run it on every skill change.** A skill that drives `pg_restore` against a production
  database does not ship untested.

## Prerequisite work

None blocking. MCP v0.7.0 added `hatchbox_enable_app_maintenance`, `hatchbox_disable_app_maintenance`
and `hatchbox_rename_app`, which closes the last gap.

## Open questions

None. The last one — where the skill lives — was resolved 2026-09-08 (Decision 11).

## Decisions

1. **A public Claude Code skill**, installed by the customer and run in their own repo — not a
   docs article, an internal-only skill, or an in-product wizard. *Rationale:* distributable to
   prospects, doubles as marketing, ships without product changes.
2. **Act, with one dashboard handoff.** Seven phases; the pause is only for creating a cluster and
   a server. *Rationale:* the API cannot provision infrastructure; everything else it can do.
3. **Repo changes on a `hatchbox-migration` branch, user reviews the diff.** Run the test suite,
   push nothing without approval.
4. **A curated `references/addons.md` mapping table** (~30 add-ons: bucket, replacement path,
   injected env vars). Unclassifiable add-ons block cutover rather than being guessed at.
5. **Rails only.** Refuse other stacks with an explanation. *Rationale:* the framework-specific
   advice is the value.
6. **One Heroku app per run, staging first**, with decisions persisted for the production run.
7. **Cutover via maintenance window, not replication.** Rehearse fully, then dynos to 0 → final
   capture → restore → deploy → DNS flip.
8. **SSH: display every remote command with real values, confirm each destructive one.** The skill
   runs them; nothing destructive executes unseen.
9. **MCP-first.** `@hatchbox/hatchbox-mcp` ≥ 0.7.0 is a declared prerequisite; no hand-rolled HTTP.
   *Rationale:* the "thin driver over a CLI" option turned out to already be built and published.
10. **No env var read endpoint.** Declined 2026-09-04 — Hatchbox is not ready to give read access
    to env var values. The skill builds around it via create-response readback and a names-only
    ledger.
11. **Where the skill lives: a `skills/` directory in the `hatchbox-mcp` repo**, packaged as a
    Claude Code plugin that registers the MCP server and ships the skill together. Decided
    2026-09-08. *Rationale:* the skill's correctness is defined by the MCP tool surface it calls,
    so a tool rename and the skill's reference update belong in one commit and one tag — a
    compatibility matrix across two repos fails silently, mid-migration, in a skill that drives
    `pg_restore` against a production database. It also gives `public/mcp.md`'s already-planned
    "one-click install bundle" a concrete form: one install, both halves. *Cost accepted:* the MCP
    repo is otherwise client-neutral (Claude Code, Codex, Cursor, VS Code, Claude Desktop), and a
    `skills/` directory is Claude Code specific; it stays additive and out of the npm package
    contents. Releases there are manual, so skill-only edits trigger no npm publish. *Revisit
    when:* there are three or four skills and some don't depend on the MCP server — extracting
    markdown into a public `hatchbox-skills` repo is an afternoon, which is why starting
    co-located is the cheap direction to be wrong in.
