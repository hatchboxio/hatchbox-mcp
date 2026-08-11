import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, READ_ONLY, runAction, WRITE } from "./helpers.js";

const clusterIdSchema = {
  cluster_id: z.number().int().describe("Numeric cluster id (see hatchbox_list_account_clusters)."),
};

const serverIdSchema = {
  ...clusterIdSchema,
  server_id: z.number().int().describe("Numeric server id (see hatchbox_list_servers)."),
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
      inputSchema: serverIdSchema,
      annotations: READ_ONLY,
    },
    async ({ cluster_id, server_id }) =>
      runAction(async () => jsonResult(await client.get(`/clusters/${cluster_id}/servers/${server_id}`))),
  );

  server.registerTool(
    "hatchbox_provision_server",
    {
      title: "Provision Server",
      description:
        "Re-provision a Hatchbox server, reinstalling/repairing its software stack on the cloud provider. Only " +
        "works on a server that has already been created (has a public IP, or is a self-hosted 'custom' server) — " +
        "creating a brand-new cloud instance isn't available through this API. Fails with a 409 if the server is " +
        "still being created or a provision is already running, 422 if the server hasn't been created on its " +
        "provider yet. Asynchronous — returns a log id, follow up with hatchbox_get_log.",
      inputSchema: serverIdSchema,
      annotations: WRITE,
    },
    async ({ cluster_id, server_id }) =>
      runAction(async () => jsonResult(await client.post(`/clusters/${cluster_id}/servers/${server_id}/provision`))),
  );

  server.registerTool(
    "hatchbox_reboot_server",
    {
      title: "Reboot Server",
      description:
        "Reboot a Hatchbox server over SSH. Fails with a 409 if the server is being created or provisioned, 422 if " +
        "the server has no reachable IP address. Asynchronous — returns a log id, follow up with hatchbox_get_log.",
      inputSchema: serverIdSchema,
      annotations: WRITE,
    },
    async ({ cluster_id, server_id }) =>
      runAction(async () => jsonResult(await client.post(`/clusters/${cluster_id}/servers/${server_id}/reboot`))),
  );
}
