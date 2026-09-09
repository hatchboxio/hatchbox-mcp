# Phase 4 — configure

The ordering below is load-bearing for two reasons: process auto-detection must not be
suppressed, and env var names can only be learned from a create response.

## 1. Create the app

`hatchbox_create_app` with `cluster_id`, `name`, `repo_path`, `branch`, and
`connected_account_id` from `hatchbox_list_account_git_providers`.

**This call validates the repository, and a 422 here means the connected Git provider cannot see
it** — see `references/troubleshooting.md`. It is a common first failure for a migration, because
the repo is often private and newer than the Hatchbox GitHub App installation. Nothing is created
when it fails, so the fix is granting access and calling again; there is no partial state to
clean up. Also set `health_check_uri`
if the app has a health endpoint — Hatchbox polls it to decide whether a deploy succeeded, and
without it a booting-but-broken app reports a successful deploy.

### Record the app's Hatchbox hostname now — the API will not give it to you

Every app gets a hostname of the form `<hashid>.hatchboxapp.com`, and Phase 6 and Phase 7 both
smoke test against it. **No API call returns it.** `hatchbox_get_app` does not include it, and
`hatchbox_list_domains` returns `[]` until a custom domain exists — the hostname is derived from
the app's hashid rather than stored as a domain record.

So ask the user to read it off the app's page in the dashboard, and record it in the ledger next
to the app id. Do it here, at creation, not at Phase 6 — discovering the gap mid-cutover with the
maintenance window open is the bad version.

Two conditions have to hold for that hostname to resolve at all, and both are set at creation
time:

- The cluster must already have a server with a public IP. The DNS record is written by an
  `after_create_commit` hook that is skipped when the cluster has no IP yet, and **nothing
  retries it**. Provision the server before creating the app.
- Hostname DNS is managed by Hatchbox. There is nothing for the user to configure.

## 2. Create and attach databases

`hatchbox_create_database` with `database_cluster_id` and `name`, then `hatchbox_attach_database`
with `app_id` and `database_id`.

`attach_database` takes an optional **`env_var`** naming the variable the connection string lands
in. Pass it explicitly rather than relying on the default, which is auto colour-prefixed on
collision — that is how a second attachment becomes `RED_DATABASE_URL`.

**Read the name back off the response regardless.** Choosing a name is not proof the server used
it, and there is no env var read endpoint to check with later. Record every returned name in
`.hatchbox/inventory.json` under a `hatchbox` key; that ledger is what Phase 6 verifies against.

For an app with a second database (Heroku's `HEROKU_POSTGRESQL_<COLOUR>_URL`), attach it under a
name the app already reads, and confirm from the response that it was not renamed underneath you.

## 3. Create env vars

`hatchbox_create_env_vars` with `app_id` and `env_vars: [{name, value}]`, for the classified set
**minus anything an attachment already provided**. Creating a name that already exists fails with
a 422 — that is the signal you tried to set something the attachment owns.

Include the runtime-only variables from Phase 1's `heroku run env` delta. **`SECRET_KEY_BASE` is
the one that matters**: it is set by the Ruby buildpack rather than being a config var, so it does
not appear in `heroku config`, and an app that boots on a freshly generated key invalidates every
existing session and signed cookie without failing anything.

Record the returned names. This is the only readback that exists.

Values go inline in the tool call, which means they go through the conversation. See
"Setting values means putting them through the conversation" in `references/env-vars.md`, and
raise it with the user before sending production credentials.

## 4. Set the scripts

`hatchbox_update_app` with `post_deploy_script` ← the Heroku release phase command.

**It is `post_deploy_script`, not `build_script`.** The release phase runs after the slug is
built and before traffic moves, which is what `post_deploy_script` does; the build script runs at
a different point and will not have a database to migrate against.

## 5. Cron jobs

`hatchbox_create_cron_job` with `app_id`, `name`, `run_at` (a cron expression) and `command`.

Carry the command **verbatim**. A Scheduler entry is arbitrary shell — `rails db:sweep`,
`ruby bin/prune.rb` and `bin/thing --flag` are all valid — and rewriting one into an assumed
`rails <task>` shape breaks it. Translate only the *schedule*: Scheduler's "every 10 minutes"
becomes `*/10 * * * *`, "hourly" becomes `0 * * * *`, "daily at 04:00 UTC" becomes `0 4 * * *`.

This fails with a 422 if no server in the cluster carries the `cron` role. Phase 3 checked that.

## Auto-deploy is ON by default — decide about it here

`hatchbox_create_app` returns `auto_deploy: true`. That is a hazard for the phases that follow:
Phase 5 makes repo changes, and a push or merge to the app's branch will trigger a deploy before
the data is restored and possibly before the env vars are complete.

**Before disabling it, know the trap.** `hatchbox_disable_app_auto_deploy` is ungated, but
`auto_deploys#create` — re-enabling — sits behind `require_payment_method!`. On a trial without a
card you can turn it off and then be unable to turn it back on.

**No API call reports whether a card is on file.** `hatchbox_get_account` does not include it and
there is no billing tool, so "check first" means asking the user to look in the dashboard. If you
are not going to ask, take the other branch: **leave auto-deploy on** and make sure nothing pushes
to the app's branch until Phase 6 is done. Phase 5 works on a `hatchbox-migration` branch and
pushes nothing, so the realistic risk is a teammate or another agent session pushing to the
deploy branch while the app has no data.

Say which one you chose in `MIGRATION.md`. Silently disabling a feature the user cannot restore
is worse than the hazard it avoids.

## What is NOT done here

- **Processes.** See `references/processes.md` — creating one before the first deploy suppresses
  auto-detection.
- **Domains.** Deferred to Phase 7: the only DNS-visible step, and gated behind
  `require_payment_method!`.
