# hatchbox-mcp

An MCP server that wraps Hatchbox's `/api/v1` API, so an LLM agent can inspect and operate your Hatchbox apps, domains, databases, and servers.

It also ships a Claude Code skill, **`migrate-from-heroku`**, which uses those tools to take a Rails app from Heroku to Hatchbox. See [Migrating from Heroku](#migrating-from-heroku).

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

## Migrating from Heroku

The `migrate-from-heroku` skill moves one Rails app from Heroku to Hatchbox in Claude Code. It
plans before it changes anything and waits for your approval, then creates your app, databases,
env vars and cron jobs on Hatchbox, rehearses the deploy and data transfer, and finally cuts over.
Your Heroku app is left intact throughout, so you can always roll back.

### Install and run

1. Install or update Claude Code to the latest version
2. Make sure your Hatchbox account has an active subscription
3. Create an API token at https://hatchbox.io/api_tokens
4. Add `export HATCHBOX_API_TOKEN=<your token>` to your shell profile (e.g. `~/.zshrc`)
5. Install the Heroku CLI, run `heroku login`, and confirm with `heroku auth:whoami`
6. Install `jq` (`brew install jq`)
7. In the Hatchbox dashboard, connect GitHub and grant it access to the repo of the Rails app you're migrating
8. In the Hatchbox dashboard, add your SSH public key so you can `ssh deploy@<server-ip>` — the database restore runs from a shell on the server
9. In the Hatchbox dashboard, create a cluster in the region closest to your Heroku app's region
10. In that cluster, create a server with the `web` and `postgresql` roles, plus `redis` if you use Sidekiq or Redis, `worker` for any non-web Procfile entries, and `cron` if you use Heroku Scheduler — wait until it shows active
11. Open a **new** terminal window so it picks up `HATCHBOX_API_TOKEN`, then start Claude Code from there
12. Run `/plugin marketplace add hatchboxio/hatchbox-mcp`
13. Run `/plugin install hatchbox@hatchbox`
14. Quit and restart Claude Code, again from a terminal that has the token
15. Run `/mcp` and confirm `hatchbox` is connected; if it isn't, reconnect it there
16. Ask Claude to call `hatchbox_get_me` and confirm it returns your user
17. `cd` into the Rails app's repo and make sure `git status` is clean
18. Ask Claude to run the `migrate-from-heroku` skill on your Heroku app, giving it the Heroku app name
19. Answer what it stops to ask for: your Heroku Scheduler jobs, approval of the generated `MIGRATION.md`, your app's `<hashid>.hatchboxapp.com` hostname from the dashboard, fresh credentials for any add-ons you're re-signing up for, and the output of the database restore commands you run on the server
20. Stop after Phase 6 unless you have a custom domain you control and are prepared for a real cutover — Phase 7 has not been tested yet
21. Report anything that was wrong, confusing, or needed a workaround at https://github.com/hatchboxio/hatchbox-mcp/issues, noting which phase it happened in

### Updating

1. Run `/plugin marketplace update hatchbox`
2. Run `/plugin update hatchbox@hatchbox`
3. Restart Claude Code

Using a different MCP client? Configure the server directly as described in [Setup](#setup) — the
skill itself is Claude Code only.

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
