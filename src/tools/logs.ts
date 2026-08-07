import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, READ_ONLY, runAction } from "./helpers.js";

export function registerLogsTools(server: McpServer, client: HatchboxClient) {
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
