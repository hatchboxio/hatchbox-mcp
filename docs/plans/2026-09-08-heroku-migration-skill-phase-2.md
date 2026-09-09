# Heroku Migration Skill — Implementation Plan (Part 2: Phases 3–7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-ruby:subagent-driven-development (recommended) or superpowers-ruby:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `skills/migrate-from-heroku` from an assessment tool into one that actually moves a Rails app — provision handoff, configure, repo changes, deploy and rehearse, cutover — with a rollback path and no destructive action taken unseen.

**Architecture:** Five more phases in `SKILL.md`, each loading one reference. Every Hatchbox write goes through an MCP tool whose real signature is recorded below. The two places where prose alone is too weak get machine support: a `pg_transfer.sh` that *assembles and prints* the restore sequence without running it, and two more completeness gates (reconciliation, cutover) guarded by tests the way the Phase 2 gate is.

**Tech Stack:** TypeScript + vitest (existing), bash (transfer script), Claude Code skill markdown, `@hatchbox/hatchbox-mcp` ≥ 0.7.0.

**Source spec:** `docs/specs/2026-09-04-heroku-migration-skill-design.md`.
**Predecessor:** `docs/plans/2026-09-08-heroku-migration-skill-phase-1.md` (phases 0–2, shipped and validated against a live app).
**Paths:** relative to this repo root.

---

## Scope: why this is one plan and not two

Part 1 split cleanly because phases 0–2 were read-only and shipped standalone value. Phases 3–7 do not divide that way: a configured app that never deploys is worth nothing, and a deploy without cutover is a rehearsal that the plan already requires anyway. The pipeline is the deliverable.

The risk is instead managed *inside* the sequence, which the spec already had right: Phase 6 performs a full data rehearsal days before Phase 7 does it for real. Task 6 builds that rehearsal, and Task 7 reuses it. Nothing in Task 7 is exercised for the first time during the cutover.

## Verified tool signatures

Recorded from source at authoring time, because Part 1's worst defect was inventing `heroku api`, a command that does not exist, and then writing a fixture that implemented it. **Do not add a parameter to any call below without checking `src/tools/*.ts` first.**

| Tool | Parameters |
|---|---|
| `hatchbox_list_account_clusters` | `account_id` |
| `hatchbox_list_account_git_providers` | `account_id` |
| `hatchbox_list_servers` | `cluster_id` |
| `hatchbox_get_cluster` | `cluster_id` (embeds servers) |
| `hatchbox_create_app` | `cluster_id`, `name`, + app write fields |
| `hatchbox_update_app` | `app_id`, + app write fields |
| `hatchbox_create_database` | `database_cluster_id`, `name?`, `path?` |
| `hatchbox_attach_database` | `app_id`, `database_id`, **`env_var?`** |
| `hatchbox_create_env_vars` | `app_id`, `env_vars: [{name, value}]` |
| `hatchbox_update_env_vars` | `app_id`, `env_vars: [{name, value}]` |
| `hatchbox_delete_env_vars` | `app_id`, `names: string[]` |
| `hatchbox_list_processes` | `app_id` |
| `hatchbox_create_process` | `app_id`, `name`, `start_command`, + process write fields |
| `hatchbox_update_process` | `app_id`, `process_id`, + process write fields |
| `hatchbox_create_cron_job` | `app_id`, `name`, `run_at` (cron expression), `command` |
| `hatchbox_deploy_app` | `app_id`, `sha?` |
| `hatchbox_get_log` | `log_id` |
| `hatchbox_enable_app_maintenance` / `..._disable_...` | `app_id` |
| `hatchbox_create_domain` | `app_id`, `name` |

**App write fields** (`create_app` and `update_app`): `branch`, `repo_path`, `connected_account_id`, `pre_build_script`, `build_script`, `post_build_script`, `post_deploy_script`, `failed_deploy_script`, `dns_provider`, `dns_access_token`, `dns_api_user`, `caddyfile`, `health_check_uri`.

**Process write fields**: `name`, `start_command`, `stop_command`, `reload_command`, `restart_on_deploy`, `server_id`, `roles[]`, `socket`, `systemd_type` (`simple`|`oneshot`), `appsignal`, `appsignal_options`. `server_id` and `roles` are **mutually exclusive**. Only one process per app may set `socket: true`.

One signature is better than the spec assumed: **`attach_database` takes an optional `env_var`**, so the injected name can be *chosen* rather than discovered after a colour-prefix collision. Task 2 uses it, and still reads the response back — choosing a name is not proof the server used it.

---

## File Structure

| Path | Responsibility |
|---|---|
| `skills/migrate-from-heroku/SKILL.md` | Phases 3–7 replacing the "not yet implemented" stub |
| `.../references/provisioning.md` | Phase 3 checklist + polling loop |
| `.../references/configure.md` | Phase 4 ordering and why it is load-bearing |
| `.../references/rails-changes.md` | Phase 5 repo edits |
| `.../references/processes.md` | Phase 6 detection table + reconciliation |
| `.../references/database-transfer.md` | Phase 6/7 restore, extensions, guardrails |
| `.../references/cutover.md` | Phase 7 runbook, smoke tests, rollback |
| `.../references/troubleshooting.md` | 402s, failed deploys, log polling |
| `.../scripts/pg_transfer.sh` | Assembles and prints the restore sequence; never executes |
| `.../test/pg_transfer.test.ts` | Asserts the assembled commands |
| `src/skills.test.ts` | Extended: gates for reconciliation and cutover |

---

## Task 1: Phase 3 — the provision handoff

**Files:**
- Create: `skills/migrate-from-heroku/references/provisioning.md`
- Modify: `skills/migrate-from-heroku/SKILL.md`

- [ ] **Step 1: Write the reference**

Create `references/provisioning.md`:

```markdown
# Phase 3 — provisioning (the handoff)

Creating a cluster and creating a server are **dashboard-only**. `hatchbox_provision_server` only
re-provisions a server that already exists; there is no API call that creates one. This phase is
therefore a handoff, and the skill's job is to make it short and unambiguous rather than to
pretend it can be automated.

## Print a checklist with the values filled in

Never print a generic list. Every field comes from Phase 2's `MIGRATION.md`:

- **Provider and region** — matched to `app.region.name` from the inventory.
- **Server size** — the sizing arithmetic from MIGRATION.md, restated with the number.
- **Roles** — `web`, plus `postgresql`; add `redis` when `local.gems.sidekiq` is true or a
  `REDIS_URL` was classified; add `worker` when the Procfile has any non-`web` long-running
  entry; add `cron` when there are scheduled jobs.

State the roles as a single list the user can check off against the dashboard, and say plainly
that a missing `redis` role means Sidekiq will not boot and a missing `cron` role makes
`hatchbox_create_cron_job` fail with a 422.

## Then poll — do not ask

Asking "are you done?" makes the user the scheduler. Poll instead:

1. `hatchbox_list_account_clusters` with the account id until a cluster appears.
2. `hatchbox_list_servers` with that `cluster_id` until a server reports an active state and the
   roles above.

Report what is still missing between polls — "cluster found, waiting on the server" is useful;
silence is not. Stop polling and hand back to the user after ten minutes with no change.

## Verify before leaving the phase

Confirm the roles actually present against the roles required, and **stop here on a mismatch**
rather than discovering it as a 422 three phases later. A cluster whose only server lacks `cron`
can still create an app, an env var and a database — it just cannot create a cron job, and that
failure arrives long after the cause.
```

- [ ] **Step 2: Replace the Phase 3–7 stub in SKILL.md**

In `skills/migrate-from-heroku/SKILL.md`, replace:

```markdown
## Phases 3-7

Not yet implemented. Tell the user the skill currently covers assessment only, and that the
configure and cutover phases are coming.
```

with:

```markdown
## Phase 3 — Provisioning (the handoff)

Read `references/provisioning.md`. Print the filled-in checklist, then poll
`hatchbox_list_account_clusters` and `hatchbox_list_servers` until the server is ready. Verify
the roles match what the app needs before continuing.
```

- [ ] **Step 3: Run the drift guard**

Run: `npm test -- src/skills.test.ts`
Expected: PASS — every tool named above is registered.

- [ ] **Step 4: Commit**

```bash
git add skills/migrate-from-heroku
git commit -m "Add Phase 3: the provision handoff and its polling loop"
```

---

## Task 2: Phase 4 — configure

**Files:**
- Create: `skills/migrate-from-heroku/references/configure.md`
- Modify: `skills/migrate-from-heroku/SKILL.md`

- [ ] **Step 1: Write the reference**

Create `references/configure.md`:

```markdown
# Phase 4 — configure

The ordering below is load-bearing for two reasons: process auto-detection must not be
suppressed, and env var names can only be learned from a create response.

## 1. Create the app

`hatchbox_create_app` with `cluster_id`, `name`, `repo_path`, `branch`, and
`connected_account_id` from `hatchbox_list_account_git_providers`. Also set `health_check_uri`
if the app has a health endpoint — Hatchbox polls it to decide whether a deploy succeeded, and
without it a booting-but-broken app reports a successful deploy.

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

## What is NOT done here

- **Processes.** See `references/processes.md` — creating one before the first deploy suppresses
  auto-detection.
- **Domains.** Deferred to Phase 7: the only DNS-visible step, and gated behind
  `require_payment_method!`.
```

- [ ] **Step 2: Extend SKILL.md**

Append after the Phase 3 section:

```markdown
## Phase 4 — Configure

Read `references/configure.md`. Order is load-bearing: create app → create and attach databases
(reading injected env var names off the responses) → create env vars → set `post_deploy_script`
→ cron jobs. **Do not create processes here.** Domains wait for Phase 7.
```

- [ ] **Step 3: Run the drift guard**

Run: `npm test -- src/skills.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add skills/migrate-from-heroku
git commit -m "Add Phase 4: configure ordering and the env var readback ledger"
```

---

## Task 3: Phase 5 — repo changes

**Files:**
- Create: `skills/migrate-from-heroku/references/rails-changes.md`
- Modify: `skills/migrate-from-heroku/SKILL.md`

- [ ] **Step 1: Write the reference**

Create `references/rails-changes.md`:

```markdown
# Phase 5 — repo changes

Branch `hatchbox-migration`. Make the edits, run the test suite, show the diff. **Nothing is
pushed or merged without approval.**

Most Rails 8 apps need very little here. Resist inventing work.

## What usually changes

| Change | When | Why |
|---|---|---|
| Remove `rails_12factor` | Only if present in `Gemfile.lock` | Abandoned since Rails 4 |
| Confirm `config/puma.rb` binds `$PORT` | Always check, rarely change | Hatchbox uses socket activation against the standard binding |
| Confirm `config/database.yml` reads the attachment's env var | Always | If it hardcodes `DATABASE_URL` and the attachment landed as `RED_DATABASE_URL`, it connects to nothing |
| Add a health endpoint | If `health_check_uri` was set and none exists | Rails 8 ships `/up` by default |

**Do not lead with `rails_12factor`.** It cannot be installed on a modern Rails app, so on
anything recent the advice is unreachable. The modern equivalents are `RAILS_LOG_TO_STDOUT` and
`RAILS_SERVE_STATIC_FILES`, which are env vars, not gems, and were classified in Phase 2.

## Filesystem writers

Heroku's ephemeral disk hides these; a persistent server does not, and the failure inverts. Code
that wrote to `public/system` or `tmp/` and silently lost the files now silently *keeps* them,
filling the disk. Phase 2 flagged any it found as a blocker; if one is being migrated
deliberately, note where the data now accumulates.

## Running the suite

Run the app's own test command, not a guessed one — read it from `bin/ci`, `Rakefile` or the
README. Report failures verbatim. **A red suite stops the phase.** A migration is the worst
possible time to be unsure whether the app worked before you touched it.
```

- [ ] **Step 2: Extend SKILL.md**

```markdown
## Phase 5 — Repo branch

Read `references/rails-changes.md`. Branch `hatchbox-migration`, make the edits, run the app's
own test suite, present the diff. Push nothing without approval; a failing suite stops the phase.
```

- [ ] **Step 3: Commit**

```bash
git add skills/migrate-from-heroku
git commit -m "Add Phase 5: repo changes on a review branch"
```

---

## Task 4: Phase 6 — deploy and poll

**Files:**
- Create: `skills/migrate-from-heroku/references/troubleshooting.md`
- Modify: `skills/migrate-from-heroku/SKILL.md`

- [ ] **Step 1: Write the reference**

Create `references/troubleshooting.md`:

```markdown
# Troubleshooting

## Asynchronous tools and log polling

`hatchbox_deploy_app`, `hatchbox_restart_app`, every process write, `hatchbox_provision_server`
and `hatchbox_reboot_server` are asynchronous. They return a **log id**. The call returning is
not the operation succeeding.

Poll `hatchbox_get_log` with that `log_id` until the status is terminal — `completed`, `failed`
or `aborted`. Poll every 5 seconds for the first minute, then every 15.

`hatchbox_enable_process` and `hatchbox_disable_process` return **no log id on a no-op** (the
process was already in that state). Absence of a log id there is success, not an error.

## A deploy failed

**Never report a bare "the deploy failed."** Fetch the log body and read it. The common causes,
in the order they actually occur:

| Symptom in the log | Cause |
|---|---|
| `Could not find <gem>` / bundler resolution errors | Ruby version mismatch — check `local.ruby_version` against the server |
| `PG::ConnectionBad` during `post_deploy_script` | The attachment's env var name is not what `database.yml` reads |
| `Redis::CannotConnectError` | No `redis` role on any server in the cluster |
| Asset build failures | Node buildpack did work Hatchbox's build script does not — set `build_script` |
| Deploy reports success, app 502s | No `health_check_uri`, so a booting-but-broken app passed |

## The two 402s

Distinguishable only by message, and they mean different things:

- **Subscription required** — no active subscription. The 7-day trial counts. Nothing works.
- **Payment method required** — subscribed, on trial, no card. Gates `domains#create`,
  `domains#update` and `auto_deploys#create` specifically. Everything else works, so this one
  first appears at Phase 7, having let five phases succeed.

Say which one it is and what unblocks it. "402" alone sends the user to the wrong place.

## A 422 on cron job creation

No server in the cluster carries the `cron` role. Phase 3 was supposed to catch this.

## A 422 on env var creation

The name already exists — almost always because a database attachment created it. Do not retry
with `update`; work out which attachment owns it first, because overwriting a live connection
string points the app at nothing.
```

- [ ] **Step 2: Extend SKILL.md**

```markdown
## Phase 6 — Deploy and rehearse

**This runs days before cutover. It is what makes the real cutover boring.**

1. `hatchbox_deploy_app`, then poll `hatchbox_get_log` to a terminal state. On failure read the
   log body and diagnose against `references/troubleshooting.md` — never report a bare failure.
2. Reconcile processes — `references/processes.md`.
3. Rehearse the data transfer — `references/database-transfer.md`.
4. Smoke test against the Hatchbox hostname, exercising credential paths.
```

- [ ] **Step 3: Commit**

```bash
git add skills/migrate-from-heroku
git commit -m "Add Phase 6 deploy step and the troubleshooting reference"
```

---

## Task 5: Process reconciliation and its gate

The single most under-tested step: an unreconciled run leaves the worker check green while
processes that were never created stay silently absent.

**Files:**
- Create: `skills/migrate-from-heroku/references/processes.md`
- Modify: `skills/migrate-from-heroku/SKILL.md`
- Modify: `src/skills.test.ts`

- [ ] **Step 1: Write the reference**

Create `references/processes.md`:

```markdown
# Processes — detect, then reconcile

## What Hatchbox creates by itself

`Apps::DetectProcesses` runs on the **first deploy**, reads `Gemfile.lock` from the deployed
release, and creates:

| Detected | name | start_command | roles | socket |
|---|---|---|---|---|
| rails | `server` | `bin/rails server -b 127.0.0.1 -p $PORT` | web | yes |
| puma, no rails | `server` | `bundle exec --keep-file-descriptors puma -b tcp://127.0.0.1:$PORT` | web | yes |
| config.ru only | `server` | `bundle exec rackup -p $PORT` | web | |
| sidekiq | `sidekiq` | `bundle exec sidekiq` | worker | |
| solid_queue | `solid_queue` | `bin/jobs` | worker | |

Detection **skips any name that already exists.** Creating a `server` or `sidekiq` process before
the first deploy suppresses it. So: deploy first, then reconcile.

## Reconcile in three passes

Call `hatchbox_list_processes` with `app_id` and compare against the Procfile.

**Pass 1 — drop.** The Heroku `web:` line is not translated. Hatchbox's socket-activated `server`
process replaces it. Do not create anything for it.

**Pass 2 — update.** For each Procfile entry whose command differs from its detected counterpart,
`hatchbox_update_process` with `app_id`, `process_id` and the corrected `start_command`. The usual
case is `worker:` — detection creates a bare `bundle exec sidekiq`, and the Procfile's real
command carries queue flags. A missed update produces a worker that runs but silently ignores
every named queue.

**Pass 3 — create.** *This is the pass that gets skipped.* Every Procfile entry with **no**
detected counterpart needs `hatchbox_create_process` with `app_id`, `name`, `start_command`.
Second Sidekiq processes for other queues, clock processes, anything bespoke.

Set `roles: ["worker"]` for background processes — not `server_id`; the two are mutually
exclusive and pinning to a server means the process does not move when the cluster grows. Leave
`socket` alone: only one process per app may set it, and the detected `server` already has it.

## Enumerate pass 3 explicitly — do not leave it implicit

Before finishing, list every Procfile entry and what happened to it: dropped, updated, created,
or already correct. A reconciliation that only updates detected processes **looks like it
worked** — the web process serves, the worker consumes its default queue — while every process
that needed creating silently does not exist. Nothing errors. The output is the only place that
absence becomes visible.

Process writes are asynchronous: each returns a log id, and each must be polled to a terminal
state before the next.
```

- [ ] **Step 2: Add the gate to SKILL.md**

Append to the Phase 6 section:

```markdown
### Reconciliation gate — run before leaving Phase 6

- [ ] every Procfile entry is accounted for as dropped, updated, created, or already correct
- [ ] the `web:` entry was dropped, not translated
- [ ] every entry with no detected counterpart was **created** — state the count, and state zero
      explicitly if it is zero
- [ ] every process write was polled to a terminal state
- [ ] the env var ledger's confirmed names match the intended set from `MIGRATION.md`
```

- [ ] **Step 3: Write the failing test**

In `src/skills.test.ts`, add inside the existing `describe("skill tool references")` block:

```typescript
  it("keeps the Phase 6 reconciliation gate intact", () => {
    const skill = readFileSync(join(SKILLS_DIR, "migrate-from-heroku/SKILL.md"), "utf8");
    const gate = skill.split("### Reconciliation gate")[1];
    expect(gate, "SKILL.md has lost its reconciliation gate").toBeDefined();

    const invariants = (gate.split("## Phase 7")[0].match(/^- \[ \] /gm) ?? []).length;
    expect(invariants, "the reconciliation gate should list every process outcome").toBeGreaterThanOrEqual(5);

    expect(gate, "the create pass is the one that gets skipped; the gate must name it").toMatch(/created/);
  });
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test -- src/skills.test.ts`
Expected: FAIL — `SKILL.md has lost its reconciliation gate` if Step 2 has not been done, or the
invariant count assertion if the gate is short.

- [ ] **Step 5: Verify it passes once Step 2 is in place**

Run: `npm test -- src/skills.test.ts`
Expected: PASS.

- [ ] **Step 6: Prove the guard fires**

```bash
# Remove one invariant from the reconciliation gate in SKILL.md, then:
npm test -- src/skills.test.ts
```

Expected: FAIL with `expected 4 to be greater than or equal to 5`. Restore the line and re-run;
expected PASS.

- [ ] **Step 7: Commit**

```bash
git add skills/migrate-from-heroku src/skills.test.ts
git commit -m "Add process reconciliation with an explicit create-pass gate"
```

---

## Task 6: The data transfer script

**Files:**
- Create: `skills/migrate-from-heroku/scripts/pg_transfer.sh`
- Create: `skills/migrate-from-heroku/references/database-transfer.md`
- Test: `skills/migrate-from-heroku/test/pg_transfer.test.ts`

The script **assembles and prints** the sequence. It never executes anything. That makes the
riskiest part of the migration reviewable and unit-testable, and satisfies the spec's rule that
every remote command is displayed with real values before it runs.

- [ ] **Step 1: Write the failing test**

Create `skills/migrate-from-heroku/test/pg_transfer.test.ts`:

```typescript
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = join(fileURLToPath(new URL("./", import.meta.url)), "../scripts/pg_transfer.sh");

function run(args: string[]): string {
  return execFileSync("bash", [script, ...args], { encoding: "utf8" });
}

const ARGS = [
  "--heroku-app", "demo",
  "--ssh-host", "203.0.113.10",
  "--ssh-user", "deploy",
  "--database", "demo_production",
  "--dump-url", "https://example.invalid/dump.pgsql",
];

describe("pg_transfer.sh", () => {
  it("prints the capture, download and restore steps in order", () => {
    const out = run(ARGS);
    const capture = out.indexOf("heroku pg:backups:capture");
    const download = out.indexOf("curl");
    const restore = out.indexOf("pg_restore");
    expect(capture).toBeGreaterThan(-1);
    expect(download).toBeGreaterThan(capture);
    expect(restore).toBeGreaterThan(download);
  });

  it("fills in every value rather than leaving a placeholder", () => {
    const out = run(ARGS);
    expect(out).toContain("deploy@203.0.113.10");
    expect(out).toContain("demo_production");
    expect(out).not.toMatch(/<[a-z-]+>/);
  });

  it("marks the destructive steps and no others", () => {
    const lines = run(ARGS).split("\n").filter((l) => l.includes("DESTRUCTIVE"));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toMatch(/drop|--clean|dropdb/i);
  });

  it("uses --no-owner --no-acl so a Heroku-owned dump restores cleanly", () => {
    expect(run(ARGS)).toMatch(/pg_restore[^\n]*--no-owner[^\n]*--no-acl/);
  });

  it("never executes anything itself", () => {
    const out = run(ARGS);
    expect(out).toContain("Nothing above has been run");
  });

  it("exits 64 when a required argument is missing", () => {
    try {
      execFileSync("bash", [script, "--heroku-app", "demo"], { stdio: "pipe" });
      throw new Error("expected a non-zero exit");
    } catch (err: any) {
      expect(err.status).toBe(64);
      expect(err.stderr.toString()).toMatch(/required/);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- skills/migrate-from-heroku/test/pg_transfer.test.ts`
Expected: FAIL — script not found.

- [ ] **Step 3: Write the script**

Create `skills/migrate-from-heroku/scripts/pg_transfer.sh`:

```bash
#!/usr/bin/env bash
# Assembles the Heroku -> Hatchbox database transfer sequence with real values filled in.
# PRINTS ONLY. Nothing here runs anything; the operator reads it and runs the steps.
set -euo pipefail

heroku_app=""; ssh_host=""; ssh_user=""; database=""; dump_url=""

while [ $# -gt 0 ]; do
  case "$1" in
    --heroku-app) heroku_app="$2"; shift 2 ;;
    --ssh-host)   ssh_host="$2";   shift 2 ;;
    --ssh-user)   ssh_user="$2";   shift 2 ;;
    --database)   database="$2";   shift 2 ;;
    --dump-url)   dump_url="$2";   shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
done

for pair in "heroku-app:$heroku_app" "ssh-host:$ssh_host" "ssh-user:$ssh_user" \
            "database:$database" "dump-url:$dump_url"; do
  if [ -z "${pair#*:}" ]; then
    echo "required argument missing: --${pair%%:*}" >&2
    exit 64
  fi
done

ssh_target="${ssh_user}@${ssh_host}"
remote_dump="/tmp/${heroku_app}.pgsql"

cat <<STEPS
Database transfer: ${heroku_app} -> ${ssh_target}:${database}

1. Capture a fresh backup on Heroku (safe, read-only):

   heroku pg:backups:capture --app ${heroku_app}
   heroku pg:backups:url --app ${heroku_app}

2. Download it onto the Hatchbox server:

   ssh ${ssh_target} 'curl -sSL "${dump_url}" -o ${remote_dump}'
   ssh ${ssh_target} 'ls -lh ${remote_dump}'

3. Confirm the extensions the dump needs exist (safe):

   ssh ${ssh_target} 'psql -d ${database} -c "\\dx"'

4. DESTRUCTIVE - restore over the target database. This drops and recreates every object
   it restores. Confirm before running:

   ssh ${ssh_target} 'pg_restore --clean --if-exists --no-owner --no-acl \\
     --dbname=${database} ${remote_dump}'

5. Verify (safe):

   ssh ${ssh_target} 'psql -d ${database} -c "\\dt"'
   ssh ${ssh_target} 'psql -d ${database} -c "\\dx"'

6. Remove the dump, which contains all of your data (safe):

   ssh ${ssh_target} 'rm -f ${remote_dump}'

Nothing above has been run. Read step 4 before you run step 4.
STEPS
```

Make it executable: `chmod +x skills/migrate-from-heroku/scripts/pg_transfer.sh`

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- skills/migrate-from-heroku/test/pg_transfer.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the reference**

Create `references/database-transfer.md`:

```markdown
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
```

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add skills/migrate-from-heroku
git commit -m "Add the database transfer script, its tests, and the restore reference"
```

---

## Task 7: Phase 7 — cutover

**Files:**
- Create: `skills/migrate-from-heroku/references/cutover.md`
- Modify: `skills/migrate-from-heroku/SKILL.md`
- Modify: `src/skills.test.ts`

- [ ] **Step 1: Write the reference**

Create `references/cutover.md`:

```markdown
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
```

- [ ] **Step 2: Add Phase 7 and its gate to SKILL.md**

```markdown
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
```

- [ ] **Step 3: Write the failing test**

In `src/skills.test.ts`:

```typescript
  it("keeps the Phase 7 cutover gate intact", () => {
    const skill = readFileSync(join(SKILLS_DIR, "migrate-from-heroku/SKILL.md"), "utf8");
    const gate = skill.split("### Cutover gate")[1];
    expect(gate, "SKILL.md has lost its cutover gate").toBeDefined();

    const invariants = (gate.match(/^- \[ \] /gm) ?? []).length;
    expect(invariants, "the cutover gate should list every precondition").toBeGreaterThanOrEqual(6);

    expect(gate, "rollback depends on Heroku still holding its data").toMatch(/rollback/i);
  });
```

- [ ] **Step 4: Run to verify it fails, then passes**

Run: `npm test -- src/skills.test.ts`
Expected: FAIL before Step 2's gate exists; PASS after.

- [ ] **Step 5: Prove it fires**

Delete one invariant from the cutover gate, run `npm test -- src/skills.test.ts`, expect
`expected 5 to be greater than or equal to 6`, then restore and re-run for PASS.

- [ ] **Step 6: Commit**

```bash
git add skills/migrate-from-heroku src/skills.test.ts
git commit -m "Add Phase 7 cutover, its runbook, and the pre-flip gate"
```

---

## Task 8: End-to-end validation against the testbed

The spec is explicit: *"A skill that drives `pg_restore` against a production database does not
ship untested."*

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run phases 3–7 against the testbed**

Against `hb-migration-testbed` and the existing Hatchbox cluster, with `MIGRATION.md` from the
Phase 2 run already approved. Record for each phase: what the skill did, what it got wrong, and
what a human had to supply.

The checks most likely to expose a defect, in order:

1. **`mailers_queue` and the cron job** — both depend on the create pass in reconciliation. If
   `worker_critical_queue` is green while these are red, pass 3 was skipped and the skill looked
   like it worked.
2. **`secret_key_base`** — green only if `SECRET_KEY_BASE` was carried across from the runtime
   delta rather than from `heroku config`, where it does not appear.
3. **`encoding`** — exercises `bin/prune-exports`, plain Ruby with no Rails, against the server's
   locale. Green here means the `LANG` judgment call was made correctly.
4. **The extensions** — `citext` and `pgcrypto` must survive the restore.

Baseline is **13 of 14 green with `storage` red by design** (no S3 add-on; Active Storage is on
local disk). Compare against that, not against all-green.

- [ ] **Step 2: Fix what the run exposes, then re-run**

Phase 1's live run turned up four defects that 39 passing tests had not — an invented CLI command
among them. Expect the same here and budget for it. Re-run until the only red check is `storage`.

- [ ] **Step 3: Update the README**

Replace the coverage sentence in the Plugin section:

```markdown
The bundled `migrate-from-heroku` skill takes a Rails app from Heroku to Hatchbox: preflight,
inventory, a reviewed migration plan, then configure, deploy, a rehearsed data transfer, and
cutover with a rollback path. Nothing is written to Hatchbox before you approve the plan, and no
destructive command runs before it has been shown to you with its real values filled in.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Document full migration coverage after end-to-end validation"
```

---

## Done when

- `npm test` passes, including the two new gate tests and the six `pg_transfer.sh` tests.
- Every gate test has been shown to fail when an invariant is deleted. A gate nobody has broken
  on purpose is a gate nobody knows works.
- Phases 3–7 have run end to end against the testbed, with 13 of 14 smoke checks green and
  `storage` red by design.
- `MIGRATION.md` from the Phase 2 run needed no correction after the fact — if the plan said
  something the migration then contradicted, the plan was wrong and the reference that produced
  it needs fixing before this ships.
