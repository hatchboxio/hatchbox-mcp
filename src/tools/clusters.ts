import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, READ_ONLY, runAction } from "./helpers.js";

export function registerClustersTools(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_get_cluster",
    {
      title: "Get Hatchbox Cluster",
      description:
        "Fetch a Hatchbox server cluster, with its servers embedded under a `servers` key. For a standalone server " +
        "list/get, use hatchbox_list_servers / hatchbox_get_server.",
      inputSchema: {
        cluster_id: z.number().int().describe("Numeric cluster id (see hatchbox_list_account_clusters)."),
      },
      annotations: READ_ONLY,
    },
    async ({ cluster_id }) => runAction(async () => jsonResult(await client.get(`/clusters/${cluster_id}`))),
  );
}
