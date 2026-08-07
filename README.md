# hatchbox-mcp

An MCP server that wraps Hatchbox's `/api/v1` API, so an LLM agent can inspect and operate your Hatchbox apps, domains, databases, and servers.

## Tools

One tool per operation, each with a `readOnlyHint` or `destructiveHint` annotation, grouped by resource:

| Resource | Read | Write |
|---|---|---|
| Accounts | `hatchbox_list_accounts`, `hatchbox_get_account`, `hatchbox_list_account_apps`, `hatchbox_list_account_clusters`, `hatchbox_list_account_database_clusters`, `hatchbox_list_account_git_providers` | — |
| User | `hatchbox_get_me` | — |
| Apps | `hatchbox_get_app` | `hatchbox_create_app`, `hatchbox_update_app`, `hatchbox_restart_app`, `hatchbox_deploy_app`, `hatchbox_enable_app_auto_deploy`, `hatchbox_disable_app_auto_deploy` |
| Domains | `hatchbox_list_domains`, `hatchbox_get_domain` | `hatchbox_create_domain`, `hatchbox_update_domain`, `hatchbox_delete_domain` |
| Env vars | — | `hatchbox_create_env_vars`, `hatchbox_update_env_vars`, `hatchbox_delete_env_vars` |
| Processes | `hatchbox_list_processes`, `hatchbox_get_process` | `hatchbox_restart_process` |
| Databases | `hatchbox_list_app_databases`, `hatchbox_get_app_database`, `hatchbox_list_cluster_databases`, `hatchbox_get_cluster_database` | `hatchbox_create_database`, `hatchbox_update_database`, `hatchbox_attach_database`, `hatchbox_detach_database` |
| Clusters | `hatchbox_get_cluster` (embeds servers) | — |
| Servers | `hatchbox_list_servers`, `hatchbox_get_server` | — |
| Backups | `hatchbox_get_latest_backup` | `hatchbox_create_backup` |
| Logs | `hatchbox_get_log` | — |

`hatchbox_restart_app`, `hatchbox_deploy_app`, and `hatchbox_create_backup` are asynchronous: they return a `log_id` you follow up on with `hatchbox_get_log` until `state` is `completed`/`failed`/`aborted`.

## Setup

1. **Get an API token.** Log into your Hatchbox web app, go to `/api_tokens` → New API Token, name it, and copy the revealed token value.
2. **Install dependencies and build:**
   ```
   npm install
   npm run build
   ```
3. **Add it to your MCP client config**, e.g. Claude Code (`.mcp.json` or `claude mcp add`) or Claude Desktop (`claude_desktop_config.json`):
   ```json
   {
     "mcpServers": {
       "hatchbox": {
         "command": "node",
         "args": ["/absolute/path/to/hatchbox-mcp-v2/build/index.js"],
         "env": {
           "HATCHBOX_BASE_URL": "https://your-hatchbox-instance.example.com",
           "HATCHBOX_API_TOKEN": "your-token-here"
         }
       }
     }
   }
   ```
   For local development against `bin/dev`, `HATCHBOX_BASE_URL` is typically `http://app.lvh.me:3000`.

## Development

```
npm run dev    # run directly from src/ via tsx, no build step
npm run build  # compile to build/
npm start      # run the compiled build/index.js
```

## Notes

- The token has no scoping — it's effectively full access as the owning user, gated only by that user's account/subscription status. Treat it like a password.
- Every endpoint is subscription-gated (402) except account discovery — a lapsed/never-paid account can't use the API.
- Requests are rate limited server-side (300/min general, 30/min for actions that queue SSH work like restart/deploy/backups). A 429 includes a `Retry-After` header; the tool surfaces this as a readable error.
