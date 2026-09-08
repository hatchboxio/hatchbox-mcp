# Heroku Migration Skill — Implementation Plan (Part 1: Read-Only Phases)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-ruby:subagent-driven-development (recommended) or superpowers-ruby:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Claude Code plugin from the `hatchbox-mcp` repo that bundles the Hatchbox MCP server with a `migrate-from-heroku` skill capable of taking a Rails app on Heroku through preflight, inventory, and a reviewed migration plan.

**Architecture:** The plugin manifest lives at `.claude-plugin/` in the `hatchbox-mcp` repo and declares both the MCP server (`npx -y @hatchbox/hatchbox-mcp`) and the skill under `skills/`. The skill is markdown with progressive disclosure — `SKILL.md` holds the phase machine and loads one reference per phase. A deterministic bash script does the Heroku inventory. Two vitest suites guard the seams that would otherwise drift silently: skill markdown may only reference MCP tools the server actually registers, and the plugin manifest version must track `package.json`.

**Tech Stack:** TypeScript + vitest (existing), bash + jq (inventory script), Claude Code plugin/skill markdown.

**Source spec:** `docs/specs/2026-09-04-heroku-migration-skill-design.md`.
**Paths:** all `Create`/`Modify` paths below are relative to this repo root.

---

## Scope: why this is Part 1 of two

The spec describes seven phases. This plan covers **Phases 0–2 only**, which stop exactly where the spec's own review gate sits: *"Nothing is written to Hatchbox until the user approves this file."*

That is a real boundary, not an arbitrary split:

- Everything in Part 1 is **read-only** against both Heroku and Hatchbox. The only writes are local files (`.hatchbox/inventory.json`, `MIGRATION.md`).
- It produces working, independently useful software: a customer can install the plugin and get an accurate migration assessment of their Heroku app without touching anything.
- It is safely shippable before the destructive phases exist, so it can go in front of real prospects early and the add-on mapping table can be corrected against real apps.

**Part 2** (separate plan, written after this lands) covers Phases 3–7: the dashboard handoff, configure, repo branch, deploy/rehearse, and cutover — plus `references/rails-changes.md`, `processes.md`, `database-transfer.md`, `cutover.md`, `troubleshooting.md`, and the end-to-end throwaway-app validation the spec requires before publishing.

---

## File Structure

| Path | Responsibility |
|---|---|
| `.claude-plugin/plugin.json` | Plugin manifest: name, version, MCP server registration |
| `.claude-plugin/marketplace.json` | Makes the repo installable via `/plugin marketplace add` |
| `skills/migrate-from-heroku/SKILL.md` | Phase state machine + gates; loads one reference per phase |
| `skills/migrate-from-heroku/references/heroku-inventory.md` | Every read command and what to extract from it |
| `skills/migrate-from-heroku/references/addons.md` | Curated add-on → Hatchbox mapping table |
| `skills/migrate-from-heroku/references/env-vars.md` | keep / drop / re-point / re-signup classification rules |
| `skills/migrate-from-heroku/references/migration-template.md` | The exact `MIGRATION.md` skeleton the skill fills in |
| `skills/migrate-from-heroku/scripts/heroku_inventory.sh` | Deterministic read-only dump → JSON |
| `skills/migrate-from-heroku/test/fixtures/bin/heroku` | Fake `heroku` CLI for tests |
| `skills/migrate-from-heroku/test/fixtures/app/` | Fixture Rails app (Procfile, Gemfile.lock) |
| `skills/migrate-from-heroku/test/inventory.test.ts` | Runs the script against fixtures, asserts JSON shape |
| `src/plugin.test.ts` | Manifest ↔ package.json consistency |
| `src/skills.test.ts` | Skill markdown may only name registered MCP tools |
| `README.md` | Add a Plugin section |

---

## Task 1: Plugin manifest

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Test: `src/plugin.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/plugin.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = (path: string) => JSON.parse(readFileSync(root + path, "utf8"));

describe("plugin manifest", () => {
  const plugin = readJson(".claude-plugin/plugin.json");
  const pkg = readJson("package.json");

  it("registers the Hatchbox MCP server from the published package", () => {
    const server = plugin.mcpServers.hatchbox;
    expect(server.command).toBe("npx");
    expect(server.args).toContain(pkg.name);
  });

  it("passes the API token through from the environment", () => {
    expect(plugin.mcpServers.hatchbox.env.HATCHBOX_API_TOKEN).toBe("${HATCHBOX_API_TOKEN}");
  });

  it("stays version-locked to the npm package", () => {
    expect(plugin.version).toBe(pkg.version);
  });

  it("is listed in the marketplace manifest", () => {
    const marketplace = readJson(".claude-plugin/marketplace.json");
    expect(marketplace.plugins.map((p: { name: string }) => p.name)).toContain(plugin.name);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/plugin.test.ts`
Expected: FAIL — `ENOENT: no such file or directory, open '.../.claude-plugin/plugin.json'`

- [ ] **Step 3: Write the manifests**

Create `.claude-plugin/plugin.json`:

```json
{
  "name": "hatchbox",
  "description": "Manage Hatchbox apps, servers, databases and deploys from Claude Code, and migrate a Rails app from Heroku to Hatchbox.",
  "version": "0.7.0",
  "author": {
    "name": "Hatchbox",
    "url": "https://hatchbox.io"
  },
  "homepage": "https://hatchbox.io/mcp",
  "repository": "https://github.com/hatchboxio/hatchbox-mcp",
  "license": "MIT",
  "keywords": ["hatchbox", "deployment", "rails", "heroku", "devops"],
  "mcpServers": {
    "hatchbox": {
      "command": "npx",
      "args": ["-y", "@hatchbox/hatchbox-mcp"],
      "env": {
        "HATCHBOX_API_TOKEN": "${HATCHBOX_API_TOKEN}"
      }
    }
  }
}
```

Create `.claude-plugin/marketplace.json`:

```json
{
  "name": "hatchbox",
  "owner": {
    "name": "Hatchbox",
    "url": "https://hatchbox.io"
  },
  "plugins": [
    {
      "name": "hatchbox",
      "source": "./",
      "description": "Hatchbox MCP server plus the Heroku migration skill."
    }
  ]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/plugin.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Verify the plugin actually loads in Claude Code**

The test only checks JSON shape; this confirms Claude Code accepts the manifest. In a Claude Code session:

```
/plugin marketplace add ~/code/hatchbox-mcp
/plugin install hatchbox@hatchbox
```

Expected: the plugin installs and `/mcp` lists a `hatchbox` server. If the manifest schema has changed since this plan was written, fix `plugin.json` to match the error Claude Code reports and update the test's assertions to match.

- [ ] **Step 6: Commit**

```bash
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json src/plugin.test.ts
git commit -m "Add Claude Code plugin manifest bundling the MCP server"
```

---

## Task 2: Tool-reference drift guard

This is the test that justifies co-locating the skill with the server: it fails the build if the skill names a tool the server does not register.

**Files:**
- Create: `src/skills.test.ts`
- Create: `skills/migrate-from-heroku/SKILL.md`

- [ ] **Step 1: Write the failing test**

Create `src/skills.test.ts`:

```typescript
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeAll, describe, expect, it } from "vitest";
import { HatchboxClient } from "./client.js";
import { createServer } from "./server.js";

const SKILLS_DIR = fileURLToPath(new URL("../skills/", import.meta.url));

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

describe("skill tool references", () => {
  let registered: Set<string>;

  beforeAll(async () => {
    const client = new HatchboxClient({ baseUrl: "https://example.invalid", token: "test" });
    const server = createServer(client);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client({ name: "test-client", version: "0.0.1" });
    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);
    const { tools } = await mcpClient.listTools();
    registered = new Set(tools.map((t) => t.name));
  });

  it("finds skill markdown to check", () => {
    expect(markdownFiles(SKILLS_DIR).length).toBeGreaterThan(0);
  });

  it("names only tools the server registers", () => {
    for (const file of markdownFiles(SKILLS_DIR)) {
      const referenced = new Set(readFileSync(file, "utf8").match(/hatchbox_[a-z_]+/g) ?? []);
      for (const name of referenced) {
        expect(registered.has(name), `${file} references unknown tool ${name}`).toBe(true);
      }
    }
  });
});
```

Note on the regex: it matches any `hatchbox_`-prefixed token in prose, so if a reference doc coins a phrase like `hatchbox_api_token` the test fails. That is the intended behaviour — reword the prose rather than loosening the pattern.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/skills.test.ts`
Expected: FAIL — `ENOENT ... /skills/` (the directory does not exist yet).

- [ ] **Step 3: Create the skill with its Phase 0 content**

Create `skills/migrate-from-heroku/SKILL.md`:

```markdown
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/skills.test.ts`
Expected: PASS, 2 tests. (`SKILL.md` references `hatchbox_get_me`, which is registered.)

- [ ] **Step 5: Prove the guard actually catches drift**

Temporarily append a bogus tool name to `SKILL.md`:

```bash
echo "hatchbox_delete_universe" >> skills/migrate-from-heroku/SKILL.md
npm test -- src/skills.test.ts
```

Expected: FAIL — `references unknown tool hatchbox_delete_universe`. Then revert:

```bash
git checkout skills/migrate-from-heroku/SKILL.md 2>/dev/null || \
  sed -i '' '$d' skills/migrate-from-heroku/SKILL.md
npm test -- src/skills.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/skills.test.ts skills/migrate-from-heroku/SKILL.md
git commit -m "Add migrate-from-heroku skill with a tool-reference drift guard"
```

---

## Task 3: Heroku inventory script

**Files:**
- Create: `skills/migrate-from-heroku/scripts/heroku_inventory.sh`
- Create: `skills/migrate-from-heroku/test/fixtures/bin/heroku`
- Create: `skills/migrate-from-heroku/test/fixtures/app/Procfile`
- Create: `skills/migrate-from-heroku/test/fixtures/app/config/puma.rb`
- Create: `skills/migrate-from-heroku/test/fixtures/app/bin/rails`
- Create: `skills/migrate-from-heroku/test/fixtures/app/Gemfile.lock`
- Test: `skills/migrate-from-heroku/test/inventory.test.ts`

- [ ] **Step 1: Create the fixtures**

Create `skills/migrate-from-heroku/test/fixtures/bin/heroku` (a fake CLI that answers from
canned data):

```bash
#!/usr/bin/env bash
case "$*" in
  "config -j --app demo")
    echo '{"DATABASE_URL":"postgres://u:p@h/d","RAILS_ENV":"production","SECRET_KEY_BASE":"abc","STRIPE_SECRET_KEY":"sk_live_x","PORT":"5000"}' ;;
  "addons --json --app demo")
    echo '[{"addon_service":{"name":"heroku-postgresql"},"plan":{"name":"heroku-postgresql:standard-0"}},{"addon_service":{"name":"heroku-redis"},"plan":{"name":"heroku-redis:premium-0"}},{"addon_service":{"name":"scheduler"},"plan":{"name":"scheduler:standard"}}]' ;;
  "domains --json --app demo")
    echo '[{"hostname":"demo.example.com","kind":"custom"}]' ;;
  "releases --json --num 1 --app demo")
    echo '[{"version":42,"description":"Deploy abc1234","commit":"abc1234"}]' ;;
  "api GET /apps/demo/formation")
    echo '[{"type":"web","size":"standard-1x","quantity":2},{"type":"worker","size":"standard-1x","quantity":1}]' ;;
  "api GET /apps/demo")
    echo '{"name":"demo","stack":{"name":"heroku-22"},"region":{"name":"us"}}' ;;
  "buildpacks --app demo")
    echo "1. heroku/ruby" ;;
  "pg:info --app demo")
    printf '=== DATABASE_URL\nPlan:                  Standard 0\nPG Version:            16.3\nData Size:            2.4 GB\n' ;;
  *)
    echo "fake heroku: unhandled args: $*" >&2; exit 1 ;;
esac
```

Make it executable: `chmod +x skills/migrate-from-heroku/test/fixtures/bin/heroku`

Create `skills/migrate-from-heroku/test/fixtures/app/Procfile`:

```
web: bundle exec puma -C config/puma.rb
worker: bundle exec sidekiq -q critical -q default
clock: bundle exec clockwork lib/clock.rb
```

Create `skills/migrate-from-heroku/test/fixtures/app/config/puma.rb`:

```ruby
workers Integer(ENV.fetch("WEB_CONCURRENCY", 2))
threads_count = Integer(ENV.fetch("RAILS_MAX_THREADS", 5))
threads threads_count, threads_count
preload_app!
port ENV.fetch("PORT", 3000)
```

Create `skills/migrate-from-heroku/test/fixtures/app/bin/rails` (contents irrelevant; the script
only lists the directory):

```ruby
#!/usr/bin/env ruby
APP_PATH = File.expand_path("../config/application", __dir__)
require_relative "../config/boot"
require "rails/commands"
```

There is deliberately no `app.json` in the fixture — the script must yield `""` rather than fail
when a file is absent.

Create `skills/migrate-from-heroku/test/fixtures/app/Gemfile.lock`:

```
GEM
  remote: https://rubygems.org/
  specs:
    puma (6.4.2)
    rails (8.0.1)
    sidekiq (7.2.0)

PLATFORMS
  ruby

RUBY VERSION
   ruby 3.3.4p94

BUNDLED WITH
   2.5.11
```

- [ ] **Step 2: Write the failing test**

Create `skills/migrate-from-heroku/test/inventory.test.ts`:

```typescript
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const here = fileURLToPath(new URL("./", import.meta.url));
const script = join(here, "../scripts/heroku_inventory.sh");
const fakeBin = join(here, "fixtures/bin");
const appDir = join(here, "fixtures/app");

describe("heroku_inventory.sh", () => {
  let inventory: any;

  beforeAll(() => {
    const out = join(mkdtempSync(join(tmpdir(), "hb-inv-")), "inventory.json");
    execFileSync("bash", [script, "demo"], {
      cwd: appDir,
      env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, HATCHBOX_INVENTORY_OUT: out },
    });
    inventory = JSON.parse(readFileSync(out, "utf8"));
  });

  it("records the app identity and stack", () => {
    expect(inventory.app.name).toBe("demo");
    expect(inventory.app.stack.name).toBe("heroku-22");
    expect(inventory.app.region.name).toBe("us");
  });

  it("captures config vars verbatim", () => {
    expect(inventory.config.SECRET_KEY_BASE).toBe("abc");
    expect(inventory.config.PORT).toBe("5000");
  });

  it("captures add-ons and the dyno formation", () => {
    expect(inventory.addons.map((a: any) => a.addon_service.name)).toContain("heroku-redis");
    const web = inventory.formation.find((f: any) => f.type === "web");
    expect(web.quantity).toBe(2);
  });

  it("keeps non-JSON heroku output as raw text", () => {
    expect(inventory.buildpacks).toContain("heroku/ruby");
    expect(inventory.pg_info).toContain("PG Version");
  });

  it("reads the local Procfile, config files and Gemfile.lock", () => {
    expect(inventory.local.procfile).toContain("clock:");
    expect(inventory.local.puma_config).toContain("workers");
    expect(inventory.local.bin_scripts).toContain("rails");
    expect(inventory.local.app_json).toBe("");
    expect(inventory.local.ruby_version).toBe("3.3.4");
    expect(inventory.local.gems).toEqual({ puma: true, sidekiq: true, solid_queue: false, rails_12factor: false });
  });

  it("exits 64 when no app name is given", () => {
    try {
      execFileSync("bash", [script], { cwd: appDir, stdio: "pipe" });
      throw new Error("expected a non-zero exit");
    } catch (err: any) {
      expect(err.status).toBe(64);
      expect(err.stderr.toString()).toContain("usage");
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- skills/migrate-from-heroku/test/inventory.test.ts`
Expected: FAIL — script not found.

- [ ] **Step 4: Write the script**

Create `skills/migrate-from-heroku/scripts/heroku_inventory.sh`:

```bash
#!/usr/bin/env bash
# Read-only inventory of a Heroku app. Writes JSON; changes nothing on Heroku.
set -euo pipefail

app="${1:-}"
if [ -z "$app" ]; then
  echo "usage: heroku_inventory.sh <heroku-app-name>" >&2
  exit 64
fi

command -v heroku >/dev/null || { echo "heroku CLI not found" >&2; exit 69; }
command -v jq >/dev/null     || { echo "jq not found (brew install jq)" >&2; exit 69; }

out="${HATCHBOX_INVENTORY_OUT:-.hatchbox/inventory.json}"
mkdir -p "$(dirname "$out")"

# JSON-emitting commands fall back to null so one missing add-on can't abort the run.
json() { heroku "$@" 2>/dev/null || echo 'null'; }
text() { heroku "$@" 2>/dev/null || true; }

config=$(json config -j --app "$app")
addons=$(json addons --json --app "$app")
domains=$(json domains --json --app "$app")
releases=$(json releases --json --num 1 --app "$app")
formation=$(json api GET "/apps/$app/formation")
app_info=$(json api GET "/apps/$app")
buildpacks=$(text buildpacks --app "$app")
pg_info=$(text pg:info --app "$app")

# `[ -f x ] && var=...` would abort under `set -e` when the file is absent; use if/fi.
read_if_present() { if [ -f "$1" ]; then cat "$1"; fi; }

procfile=$(read_if_present Procfile)
app_json=$(read_if_present app.json)
puma_config=$(read_if_present config/puma.rb)
database_yml=$(read_if_present config/database.yml)
bin_scripts=$(ls bin 2>/dev/null | tr '\n' ' ')

ruby_version=""
if [ -f Gemfile.lock ]; then
  ruby_version=$(awk '/^RUBY VERSION/{getline; gsub(/[ ]+/,""); sub(/^ruby/,""); sub(/p[0-9]+$/,""); print}' Gemfile.lock)
fi

has_gem() {
  if [ -f Gemfile.lock ] && grep -qE "^ {4}$1 \(" Gemfile.lock; then echo true; else echo false; fi
}

jq -n \
  --argjson config "$config" \
  --argjson addons "$addons" \
  --argjson domains "$domains" \
  --argjson releases "$releases" \
  --argjson formation "$formation" \
  --argjson app "$app_info" \
  --arg buildpacks "$buildpacks" \
  --arg pg_info "$pg_info" \
  --arg procfile "$procfile" \
  --arg app_json "$app_json" \
  --arg puma_config "$puma_config" \
  --arg database_yml "$database_yml" \
  --arg bin_scripts "$bin_scripts" \
  --arg ruby_version "$ruby_version" \
  --argjson puma "$(has_gem puma)" \
  --argjson sidekiq "$(has_gem sidekiq)" \
  --argjson solid_queue "$(has_gem solid_queue)" \
  --argjson rails_12factor "$(has_gem rails_12factor)" \
  '{
    app: $app,
    config: $config,
    addons: $addons,
    domains: $domains,
    releases: $releases,
    formation: $formation,
    buildpacks: $buildpacks,
    pg_info: $pg_info,
    local: {
      procfile: $procfile,
      app_json: $app_json,
      puma_config: $puma_config,
      database_yml: $database_yml,
      bin_scripts: $bin_scripts,
      ruby_version: $ruby_version,
      gems: {
        puma: $puma,
        sidekiq: $sidekiq,
        solid_queue: $solid_queue,
        rails_12factor: $rails_12factor
      }
    }
  }' > "$out"

echo "Wrote $out"
```

Make it executable: `chmod +x skills/migrate-from-heroku/scripts/heroku_inventory.sh`

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- skills/migrate-from-heroku/test/inventory.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS — existing `client`, `server`, `helpers` suites plus the three new ones.

- [ ] **Step 7: Commit**

```bash
git add skills/migrate-from-heroku/scripts skills/migrate-from-heroku/test
git commit -m "Add read-only Heroku inventory script with fixture-driven tests"
```

---

## Task 4: `references/heroku-inventory.md`

**Files:**
- Create: `skills/migrate-from-heroku/references/heroku-inventory.md`

- [ ] **Step 1: Write the reference**

The file documents what each captured field is *for*, so the model reading it in Phase 1 knows
what to extract rather than dumping raw JSON at the user. Write it with these sections:

```markdown
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
| `local.ruby_version` | `Gemfile.lock` | Must be an available Ruby on Hatchbox |
| `local.gems` | `Gemfile.lock` | `rails_12factor` gets removed; `puma`/`sidekiq`/`solid_queue` predict auto-detection |

## Sizing heuristic

Sum the formation: a `standard-1x` dyno is 512 MB, `standard-2x` 1 GB, `performance-m` 2.5 GB,
`performance-l` 14 GB. Add the Postgres data size from `pg_info`, then pick the smallest
Hatchbox server that fits with 50% headroom. State the arithmetic in MIGRATION.md so the user
can overrule it.

## Secrets

`.hatchbox/inventory.json` holds every config var in plaintext. The skill appends `.hatchbox/`
to `.gitignore` **before** the first run. Never paste config values into MIGRATION.md, a commit
message, or a chat summary — names only.
```

- [ ] **Step 2: Run the drift guard**

Run: `npm test -- src/skills.test.ts`
Expected: PASS (this file names no MCP tools).

- [ ] **Step 3: Commit**

```bash
git add skills/migrate-from-heroku/references/heroku-inventory.md
git commit -m "Document the Heroku inventory fields and sizing heuristic"
```

---

## Task 5: `references/addons.md`

**Files:**
- Create: `skills/migrate-from-heroku/references/addons.md`

- [ ] **Step 1: Write the mapping table**

Four buckets, and every add-on in the table gets exactly one:

- **replaced** — Hatchbox provides it natively (Postgres, Redis, cron).
- **byo** — keep the vendor, sign up directly, re-point env vars. The account moves off Heroku
  billing; the service is unchanged.
- **drop** — Heroku-platform-specific, no counterpart needed.
- **blocker** — no clean path; stop at Phase 2 and make the user decide.

Header the file with this instruction:

```markdown
# Heroku add-on mapping

Look up every entry in `inventory.json`'s `addons` array. An add-on that is not in this table is
a **blocker** — say so in MIGRATION.md and stop. Do not guess a replacement; a wrong guess here
silently loses data or breaks a production integration at cutover.
```

Then the table. The `Injected vars` column is what `references/env-vars.md` classifies; verify
each against the vendor's current docs as you author the row, since add-ons do rename variables.

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
| `papertrail` | byo | sign up at papertrailapp.com | `PAPERTRAIL_API_TOKEN` |
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
| `fixie` / `quotaguard` / `proximo` | drop | static egress IP — a Hatchbox server already has one. Confirm the destination's allowlist is updated to the new IP, then drop | `FIXIE_URL` / `QUOTAGUARDSTATIC_URL` / `PROXIMO_URL` |
| `ssl` / `expedited-ssl` | drop | Hatchbox terminates TLS via Caddy | none |
| `heroku-deploy-hooks` | drop | replaced by Hatchbox deploy notifications | none |
| `autoidle` / `adept-scale` / `rails-autoscale` | drop | no dyno autoscaling to manage | varies |
| `dyno-metadata` | drop | labs feature; all `HEROKU_*` vars go away | `HEROKU_APP_NAME`, `HEROKU_RELEASE_VERSION`, `HEROKU_SLUG_COMMIT` |

The `fixie`/`quotaguard` row is the one that most often gets mis-bucketed: dropping it is correct
*only* once whoever operates the allowlisted destination has added the Hatchbox server's IP.
Surface that as an action item in MIGRATION.md, not a silent drop.

- [ ] **Step 2: Commit**

```bash
git add skills/migrate-from-heroku/references/addons.md
git commit -m "Add the curated Heroku add-on mapping table"
```

---

## Task 6: `references/env-vars.md`

**Files:**
- Create: `skills/migrate-from-heroku/references/env-vars.md`

- [ ] **Step 1: Write the classification rules**

```markdown
# Env var classification

Every key in `inventory.json`'s `config` object gets exactly one of four labels — **keep**,
**drop**, **re-point**, **re-signup**. Put the table in MIGRATION.md with **names and labels
only — never values**.

## drop — Heroku injects these; Hatchbox does not need them

- `PORT` — Hatchbox sets it per process via socket activation.
- `DYNO`, `DYNO_RAM`, `WEB_CONCURRENCY` (if unset by the app itself)
- `HEROKU_*` — all of them, including the dyno-metadata labs vars.
- `DATABASE_URL` — **the attachment supplies this.** Do not carry Heroku's value across.
- Any add-on var whose add-on is bucketed **drop** in `references/addons.md`.

## re-point — a Hatchbox resource supplies the new value, name unchanged

The skill can fill these in itself; no user input needed.

- `DATABASE_URL` (or whatever `app_attachments[].env_var` reports — read it, do not assume).
- `REDIS_URL` / `REDIS_TLS_URL` — from the Hatchbox `redis` role.

## re-signup — same vendor, new account, name unchanged

Add-ons bucketed **byo** in `references/addons.md`. The Heroku-issued credentials die with the
add-on, so the user signs up with the vendor directly and supplies a new value under the same
variable name. List every one and mark it **needs a value from you** — the skill cannot invent
these, and a migration that silently carries a dead SendGrid key across looks fine until the
first password reset email.

## keep — carry across verbatim

Everything else: `SECRET_KEY_BASE`, `RAILS_ENV`, `RAILS_MASTER_KEY`, app-specific settings,
third-party keys the user owns directly (Stripe, OpenAI, and so on).

## Collisions and readback

`hatchbox_create_env_vars` returns the created records' `id` and `name`. There is **no read
endpoint for env vars** — values can never be read back over the API. Hatchbox's
`create_with_prefix` renames a colliding name (e.g. `FOO` → `RED_FOO`), so always record the
names the create response echoes back rather than the names you sent.

Because values are unverifiable, a stale or truncated secret stays invisible until runtime. The
Phase 6 smoke test must exercise credential-touching paths — send a real email, write to the
storage bucket — not just check that the homepage returns 200.
```

- [ ] **Step 2: Run the drift guard**

Run: `npm test -- src/skills.test.ts`
Expected: PASS — `hatchbox_create_env_vars` is registered.

- [ ] **Step 3: Commit**

```bash
git add skills/migrate-from-heroku/references/env-vars.md
git commit -m "Add env var classification rules and the readback constraint"
```

---

## Task 7: The `MIGRATION.md` template

**Files:**
- Create: `skills/migrate-from-heroku/references/migration-template.md`

- [ ] **Step 1: Write the template**

```markdown
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

## Processes

| Procfile entry | Hatchbox |
|---|---|
| `web:` | dropped — replaced by the auto-detected socket-activated `server` process |

## Scheduled jobs

| Heroku Scheduler | Frequency | Hatchbox cron |
|---|---|---|

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
```

- [ ] **Step 2: Commit**

```bash
git add skills/migrate-from-heroku/references/migration-template.md
git commit -m "Add the MIGRATION.md review-gate template"
```

---

## Task 8: Document the plugin

**Files:**
- Modify: `README.md` (add a section after `## Setup`)

- [ ] **Step 1: Add the Plugin section**

Insert after the existing `## Setup` section:

```markdown
## Plugin (Claude Code)

Claude Code users can install the MCP server and the Heroku migration skill together:

```
/plugin marketplace add hatchboxio/hatchbox-mcp
/plugin install hatchbox@hatchbox
```

Set `HATCHBOX_API_TOKEN` in your environment first — the plugin passes it through to the server.

The bundled `migrate-from-heroku` skill takes a Rails app from Heroku to Hatchbox. It currently
covers preflight, inventory and planning; all of it is read-only and writes nothing to Hatchbox
or Heroku.

Users of other MCP clients configure the server directly per the Setup section above; the skill
is Claude Code specific.
```

- [ ] **Step 2: Run the full suite one last time**

Run: `npm test && npm run build`
Expected: all suites PASS, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document plugin installation and the migration skill"
```

---

## Done when

- `npm test` passes with the three new suites.
- `/plugin marketplace add ~/code/hatchbox-mcp` then `/plugin install hatchbox@hatchbox` gives a
  working `hatchbox` MCP server and a `migrate-from-heroku` skill in a fresh Claude Code session.
- Running the skill against a real Heroku app produces a `MIGRATION.md` whose add-on and env var
  tables a human agrees with — this is the check that matters, and the add-on table should be
  corrected against the first two or three real apps before Part 2 is written.
- No release is cut. Releases in this repo are manual; publishing waits for Part 2 and the
  end-to-end validation the spec requires.
