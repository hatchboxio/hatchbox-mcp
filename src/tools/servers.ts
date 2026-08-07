import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, READ_ONLY, runAction } from "./helpers.js";

const clusterIdSchema = {
  cluster_id: z.number().int().describe("Numeric cluster id (see hatchbox_list_account_clusters)."),
};

export function registerServersTools(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_list_servers",
    {
      title: "List Cluster Servers",
      description:
        "List the servers in a Hatchbox cluster (state, roles, IPs, size, etc.). hatchbox_get_cluster also embeds " +
        "this same list on the cluster itself.",
      inputSchema: clusterIdSchema,
      annotations: READ_ONLY,
    },
    async ({ cluster_id }) => runAction(async () => jsonResult(await client.get(`/clusters/${cluster_id}/servers`))),
  );

  server.registerTool(
    "hatchbox_get_server",
    {
      title: "Get Cluster Server",
      description: "Fetch a single server in a Hatchbox cluster.",
      inputSchema: {
        ...clusterIdSchema,
        server_id: z.number().int().describe("Numeric server id."),
      },
      annotations: READ_ONLY,
    },
    async ({ cluster_id, server_id }) =>
      runAction(async () => jsonResult(await client.get(`/clusters/${cluster_id}/servers/${server_id}`))),
  );
}
