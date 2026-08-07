import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, missingFields, runAction } from "./helpers.js";

const inputSchema = {
  action: z.enum(["show"]).describe("show: requires cluster_id."),
  cluster_id: z
    .number()
    .int()
    .describe("Numeric cluster id (see hatchbox_accounts action=list_clusters). Required.")
    .optional(),
};

export function registerClustersTool(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_clusters",
    {
      title: "Hatchbox Clusters",
      description:
        "Read a Hatchbox server cluster, with its servers embedded under a `servers` key. Read-only. " +
        "For a standalone server list/show, use hatchbox_servers.",
      inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      runAction(async () => {
        const { action, cluster_id } = args;
        switch (action) {
          case "show": {
            const err = missingFields(args, ["cluster_id"], action);
            if (err) return err;
            return jsonResult(await client.get(`/clusters/${cluster_id}`));
          }
        }
      }),
  );
}
