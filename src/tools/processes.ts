import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, READ_ONLY, runAction, textResult, WRITE } from "./helpers.js";

const appIdSchema = {
  app_id: z.number().int().describe("Numeric app id."),
};

const processIdSchema = {
  ...appIdSchema,
  process_id: z.number().int().describe("Numeric process id (see hatchbox_list_processes)."),
};

export function registerProcessesTools(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_list_processes",
    {
      title: "List App Processes",
      description: "List the individual processes (web/worker/cron) running under a Hatchbox app.",
      inputSchema: appIdSchema,
      annotations: READ_ONLY,
    },
    async ({ app_id }) => runAction(async () => jsonResult(await client.get(`/apps/${app_id}/processes`))),
  );

  server.registerTool(
    "hatchbox_get_process",
    {
      title: "Get App Process",
      description: "Fetch a single process running under a Hatchbox app.",
      inputSchema: processIdSchema,
      annotations: READ_ONLY,
    },
    async ({ app_id, process_id }) =>
      runAction(async () => jsonResult(await client.get(`/apps/${app_id}/processes/${process_id}`))),
  );

  server.registerTool(
    "hatchbox_restart_process",
    {
      title: "Restart App Process",
      description:
        "Restart a single process on a Hatchbox app. To restart every process on an app at once, use " +
        "hatchbox_restart_app instead.",
      inputSchema: processIdSchema,
      annotations: WRITE,
    },
    async ({ app_id, process_id }) =>
      runAction(async () => {
        await client.post(`/apps/${app_id}/processes/${process_id}/restart`);
        return textResult(`Restarting process ${process_id} on app ${app_id}.`);
      }),
  );
}
