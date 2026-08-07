import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, missingFields, runAction } from "./helpers.js";

const inputSchema = {
  action: z.enum(["list", "show"]).describe("list: requires cluster_id. show: requires cluster_id + server_id."),
  cluster_id: z
    .number()
    .int()
    .describe("Numeric cluster id (see hatchbox_accounts action=list_clusters). Required for every action.")
    .optional(),
  server_id: z.number().int().describe("Numeric server id. Required for show.").optional(),
};

export function registerServersTool(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_servers",
    {
      title: "Hatchbox Servers",
      description:
        "Read the servers in a Hatchbox cluster (state, roles, IPs, size, etc.). Read-only. " +
        "hatchbox_clusters action=show also embeds this same list on the cluster itself.",
      inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      runAction(async () => {
        const { action, cluster_id, server_id } = args;
        switch (action) {
          case "list": {
            const err = missingFields(args, ["cluster_id"], action);
            if (err) return err;
            return jsonResult(await client.get(`/clusters/${cluster_id}/servers`));
          }
          case "show": {
            const err = missingFields(args, ["cluster_id", "server_id"], action);
            if (err) return err;
            return jsonResult(await client.get(`/clusters/${cluster_id}/servers/${server_id}`));
          }
        }
      }),
  );
}
