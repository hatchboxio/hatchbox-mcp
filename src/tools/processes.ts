import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, missingFields, runAction, textResult } from "./helpers.js";

const inputSchema = {
  action: z
    .enum(["list", "show", "restart"])
    .describe("list: requires app_id. show/restart: require app_id + process_id."),
  app_id: z.number().int().describe("Numeric app id. Required for every action.").optional(),
  process_id: z.number().int().describe("Numeric process id (see action=list). Required for show/restart.").optional(),
};

export function registerProcessesTool(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_processes",
    {
      title: "Hatchbox App Processes",
      description:
        "Read and restart the individual processes (web/worker/cron) running under a Hatchbox app. " +
        "To restart every process on an app at once, use hatchbox_apps action=restart instead.",
      inputSchema,
      annotations: { openWorldHint: true },
    },
    async (args) =>
      runAction(async () => {
        const { action, app_id, process_id } = args;
        switch (action) {
          case "list": {
            const err = missingFields(args, ["app_id"], action);
            if (err) return err;
            return jsonResult(await client.get(`/apps/${app_id}/processes`));
          }
          case "show": {
            const err = missingFields(args, ["app_id", "process_id"], action);
            if (err) return err;
            return jsonResult(await client.get(`/apps/${app_id}/processes/${process_id}`));
          }
          case "restart": {
            const err = missingFields(args, ["app_id", "process_id"], action);
            if (err) return err;
            await client.post(`/apps/${app_id}/processes/${process_id}/restart`);
            return textResult(`Restarting process ${process_id} on app ${app_id}.`);
          }
        }
      }),
  );
}
