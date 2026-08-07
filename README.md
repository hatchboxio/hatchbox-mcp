# hatchbox-mcp

An MCP server that wraps Hatchbox's `/api/v1` API, so an LLM agent can inspect and operate your Hatchbox apps, domains, databases, and servers.

## Tools

Grouped by resource, each taking an `action` parameter:

| Tool | Actions |
|---|---|
| `hatchbox_accounts` | list, show, list_apps, list_clusters, list_database_clusters, list_git_providers |
| `hatchbox_me` | (single action — fetches the authenticated user) |
| `hatchbox_apps` | show, create, update, restart, deploy, enable_auto_deploy, disable_auto_deploy |
| `hatchbox_domains` | list, show, create, update, delete |
| `hatchbox_env_vars` | create, update, delete |
| `hatchbox_processes` | list, show, restart |
| `hatchbox_databases` | list_for_app, show_for_app, list_for_cluster, show_for_cluster, create, update, attach, detach |
| `hatchbox_clusters` | show (embeds servers) |
| `hatchbox_servers` | list, show |
| `hatchbox_backups` | create, latest |
| `hatchbox_logs` | show — poll this after any async action (restart/deploy/backup) |

Restart, deploy, and backup-create are asynchronous: they return a `log_id` you follow up on with `hatchbox_logs` until `state` is `completed`/`failed`/`aborted`.

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
