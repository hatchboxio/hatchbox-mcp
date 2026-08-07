import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, missingFields, runAction } from "./helpers.js";

const inputSchema = {
  action: z.enum(["show"]).describe("show: requires log_id."),
  log_id: z
    .number()
    .int()
    .describe("Numeric log id, returned by whichever action started the async job (restart/deploy/backup create). Required.")
    .optional(),
};

export function registerLogsTool(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_logs",
    {
      title: "Hatchbox Logs",
      description:
        "Read a Hatchbox job log (deploys, restarts, backups, provisioning) and its child logs. Read-only. " +
        "Poll this after hatchbox_apps action=restart/deploy or hatchbox_backups action=create until `state` is " +
        "completed/failed/aborted.",
      inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      runAction(async () => {
        const { action, log_id } = args;
        switch (action) {
          case "show": {
            const err = missingFields(args, ["log_id"], action);
            if (err) return err;
            return jsonResult(await client.get(`/logs/${log_id}`));
          }
        }
      }),
  );
}
