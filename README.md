# hatchbox-mcp

An MCP server that wraps Hatchbox's `/api/v1` API, so an LLM agent can inspect and operate your Hatchbox apps, domains, databases, and servers.

It also ships a Claude Code skill, **`migrate-from-heroku`**, which uses those tools to take a Rails app from Heroku to Hatchbox. See [The migration skill](#the-migration-skill).

## Tools

One tool per operation, each with a `readOnlyHint` or `destructiveHint` annotation, grouped by resource:

| Resource | Read | Write |
|---|---|---|
| Accounts | `hatchbox_list_accounts`, `hatchbox_get_account`, `hatchbox_list_account_apps`, `hatchbox_list_account_clusters`, `hatchbox_list_account_database_clusters`, `hatchbox_list_account_git_providers` | — |
| User | `hatchbox_get_me` | — |
| Apps | `hatchbox_get_app` | `hatchbox_create_app`, `hatchbox_update_app`, `hatchbox_rename_app`, `hatchbox_enable_app_maintenance`, `hatchbox_disable_app_maintenance`, `hatchbox_restart_app`, `hatchbox_deploy_app`, `hatchbox_enable_app_auto_deploy`, `hatchbox_disable_app_auto_deploy` |
| Domains | `hatchbox_list_domains`, `hatchbox_get_domain` | `hatchbox_create_domain`, `hatchbox_update_domain`, `hatchbox_delete_domain` |
| Env vars | — | `hatchbox_create_env_vars`, `hatchbox_update_env_vars`, `hatchbox_delete_env_vars` |
| Processes | `hatchbox_list_processes`, `hatchbox_get_process` | `hatchbox_create_process`, `hatchbox_update_process`, `hatchbox_delete_process`, `hatchbox_enable_process`, `hatchbox_disable_process`, `hatchbox_restart_process` |
| Cron jobs | `hatchbox_list_cron_jobs`, `hatchbox_get_cron_job` | `hatchbox_create_cron_job`, `hatchbox_update_cron_job`, `hatchbox_delete_cron_job` |
| Databases | `hatchbox_list_app_databases`, `hatchbox_get_app_database`, `hatchbox_list_cluster_databases`, `hatchbox_get_cluster_database` | `hatchbox_create_database`, `hatchbox_update_database`, `hatchbox_attach_database`, `hatchbox_detach_database` |
| Clusters | `hatchbox_get_cluster` (embeds servers) | — |
| Servers | `hatchbox_list_servers`, `hatchbox_get_server` | `hatchbox_provision_server`, `hatchbox_reboot_server` |
| Firewall rules | `hatchbox_list_firewall_rules`, `hatchbox_get_firewall_rule` | `hatchbox_create_firewall_rule`, `hatchbox_delete_firewall_rule` |
| Backups | `hatchbox_get_latest_backup`, `hatchbox_get_backup_configuration` | `hatchbox_create_backup`, `hatchbox_test_backup_connection`, `hatchbox_update_backup_configuration`, `hatchbox_disable_backups` |
| Logs | `hatchbox_list_app_logs`, `hatchbox_get_log` | — |

`hatchbox_restart_app`, `hatchbox_deploy_app`, `hatchbox_rename_app`, `hatchbox_create_backup`, `hatchbox_test_backup_connection`, `hatchbox_update_backup_configuration`, `hatchbox_disable_backups`, `hatchbox_provision_server`, `hatchbox_reboot_server`, `hatchbox_create_process`, `hatchbox_update_process`, `hatchbox_delete_process`, `hatchbox_enable_process`, `hatchbox_disable_process`, `hatchbox_create_firewall_rule`, and `hatchbox_delete_firewall_rule` are asynchronous: they return a log id (as `log_id`, except `hatchbox_delete_process`, `hatchbox_delete_firewall_rule`, and `hatchbox_rename_app`, which return it as `id`) you follow up on with `hatchbox_get_log` until `state` is `completed`/`failed`/`aborted`. `hatchbox_enable_process`/`hatchbox_disable_process` return no log id when the process was already in that state (a no-op).

`hatchbox_enable_app_maintenance`/`hatchbox_disable_app_maintenance` are *not* async in this sense: they return the updated app record immediately (`maintenance: true`/`false`). The Caddy config reload that actually flips the served page happens on the app's servers in the background, with no log id to poll.

`hatchbox_list_app_logs` and `hatchbox_list_firewall_rules` are paginated: they return `{ logs, pagination }` / `{ firewall_rules, pagination }` respectively, where `pagination` carries `current_page`/`total_pages`/`total_count`/`page_limit`. `limit` defaults to and is capped at 100 server-side.

`hatchbox_delete_firewall_rule` fails with a 422 if the rule is one Hatchbox manages itself (SSH, and 80/443 on web servers) — check the `removable` field from `hatchbox_list_firewall_rules`/`hatchbox_get_firewall_rule` before attempting to delete a rule.

`hatchbox_update_app` rejects the `name` field entirely (422) — renaming moves the app's directory and rewrites server config, so it's handled separately by `hatchbox_rename_app`, which also 422s if the new name is unchanged, blank, contains characters other than letters/numbers/hyphens/underscores, or is already taken by another app in the same cluster.

## Setup

1. **Get an API token.** Log into your Hatchbox web app, go to `/api_tokens` → New API Token, name it, and copy the revealed token value.
2. **Add it to your MCP client config.** No install step needed — `npx` fetches and runs the package on demand.

   **Claude Code:**
   ```
   claude mcp add hatchbox -- npx -y @hatchbox/hatchbox-mcp
   ```
   Then set `HATCHBOX_API_TOKEN` for that server (see `claude mcp add --help` for passing env vars, or edit `.mcp.json` directly).

   **Claude Desktop** (`claude_desktop_config.json`):
   ```json
   {
     "mcpServers": {
       "hatchbox": {
         "command": "npx",
         "args": ["-y", "@hatchbox/hatchbox-mcp"],
         "env": {
           "HATCHBOX_API_TOKEN": "your-token-here"
         }
       }
     }
   }
   ```

## Plugin (Claude Code)

The plugin installs the MCP server and the `migrate-from-heroku` skill together, version-locked:
plugin 0.8.1 runs server 0.8.1.

```
/plugin marketplace add hatchboxio/hatchbox-mcp
/plugin install hatchbox@hatchbox
```

Set `HATCHBOX_API_TOKEN` in the environment you launch Claude Code from — the plugin passes it
through. Restart afterwards; a running session does not pick up a changed environment.

If the tools do not appear, run `/mcp`. A cached connection failure makes the server look absent
and reconnects in one command, without a restart.

### Updating

```
/plugin marketplace update hatchbox
/plugin update hatchbox@hatchbox
```

That updates both halves at once — the skill files ship inside the plugin, and the pinned `npx`
spec moves the server with it. Restart to apply.

Note that updates compare version strings: a release whose version did not change is treated as
already current and silently does nothing.

Users of other MCP clients configure the server directly per the Setup section above. The skill
is Claude Code specific.

## The migration skill

`migrate-from-heroku` takes one Rails app from Heroku to Hatchbox across eight phases: preflight,
inventory, a reviewed plan, provisioning handoff, configuration, repo changes, a rehearsed deploy
and data transfer, then cutover.

**It is not read-only.** Phases 0–2 only read, and stop at a plan you approve. From Phase 4 it
creates apps, databases, env vars and cron jobs on Hatchbox; Phase 6 restores your database over
the Hatchbox one; Phase 7 scales your Heroku dynos to zero and moves DNS. Nothing is written
until you approve the plan, and the Heroku app is left intact so a rollback is always available.

Phases 0–6 have been validated end to end against a real app. **Phase 7 has not been executed** —
the DNS flip, certificate issuance and the payment-method gate are documented and desk-checked but
unproven. Treat a first cutover accordingly.

### Before you start

On Hatchbox, in the dashboard — none of this can be done through the API:

- A **cluster**, in a region matching your Heroku app's.
- A **server** in it, **provisioned before you create the app**, or the app's automatic hostname
  never gets a DNS record and nothing retries.
- **Roles** on that server: `web` and `postgresql` always; `redis` if you use Sidekiq or have a
  `REDIS_URL`; `worker` for any non-`web` Procfile entry; `cron` if you have Scheduler jobs.
  A missing `cron` role fails cron creation three phases later, long after the cause.
- An **active subscription** on the account. Every endpoint but account discovery is 402-gated.

Locally:

- The **Heroku CLI**, logged in (`heroku auth:whoami`).
- **`jq`** (`brew install jq`), used by the inventory script.
- A **clean git working tree** in the Rails app you are migrating.

### What the skill will ask you for

It cannot get these itself, and it will stop and ask rather than guess:

- **Your Heroku Scheduler jobs.** They live only in the add-on's dashboard — absent from
  `heroku addons --json` and the platform API.
- **Your app's Hatchbox hostname** (`<hashid>.hatchboxapp.com`), which no API call returns.
- **New credentials** for any add-on you are re-signing up for directly. The Heroku-issued ones
  die with the add-on.
- **A shell on the server** for the database restore, which it prints rather than runs.

## Development

To work on `hatchbox-mcp` itself rather than just using it:

```
git clone git@github.com:hatchboxio/hatchbox-mcp.git
cd hatchbox-mcp
npm install
npm run dev    # run directly from src/ via tsx, no build step
npm run build  # compile to build/
npm start      # run the compiled build/index.js
npm test       # run the test suite
```

To point an MCP client at your local build instead of the published package, use `node` with an absolute path in place of the `npx` command above:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/hatchbox-mcp/build/index.js"]
}
```

For local development against `bin/dev`, `HATCHBOX_BASE_URL` is typically `http://app.lvh.me:3000/api/v1`.

## Notes

- The token has no scoping — it's effectively full access as the owning user, gated only by that user's account/subscription status. Treat it like a password.
- Every endpoint is subscription-gated (402) except account discovery — a lapsed/never-paid account can't use the API.
