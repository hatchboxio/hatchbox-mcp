import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, READ_ONLY, runAction } from "./helpers.js";

export function registerLogsTools(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_list_app_logs",
    {
      title: "List App Logs",
      description:
        "List a Hatchbox app's job logs (deploys, restarts, backups, provisioning), newest first — including " +
        "auto-deploys triggered by a git push, not just ones started through this API. Summaries only, without " +
        "the log body (use hatchbox_get_log for a single entry's full body). Paginated: results come back as " +
        "`{ logs, pagination }`, where `pagination` has current_page/total_pages/total_count/page_limit; " +
        "`limit` is capped at 100 server-side regardless of what's requested.",
      inputSchema: {
        app_id: z.number().int().describe("Numeric app id."),
        page: z.number().int().optional().describe("Page number, 1-indexed. Defaults to 1."),
        limit: z.number().int().optional().describe("Results per page. Defaults to and is capped at 100."),
      },
      annotations: READ_ONLY,
    },
    async ({ app_id, page, limit }) =>
      runAction(async () => {
        const { data, headers } = await client.getPaginated(`/apps/${app_id}/logs`, { page, limit });
        return jsonResult({
          logs: data,
          pagination: {
            current_page: Number(headers["current-page"]),
            total_pages: Number(headers["total-pages"]),
            total_count: Number(headers["total-count"]),
            page_limit: Number(headers["page-limit"]),
          },
        });
      }),
  );

  server.registerTool(
    "hatchbox_get_log",
    {
      title: "Get Hatchbox Log",
      description:
        "Read a Hatchbox job log (deploys, restarts, backups, provisioning) and its child logs. Poll this after " +
        "hatchbox_restart_app, hatchbox_deploy_app, or hatchbox_create_backup until `state` is completed/failed/aborted.",
      inputSchema: {
        log_id: z.number().int().describe("Numeric log id, returned by whichever action started the async job."),
      },
      annotations: READ_ONLY,
    },
    async ({ log_id }) => runAction(async () => jsonResult(await client.get(`/logs/${log_id}`))),
  );
}
