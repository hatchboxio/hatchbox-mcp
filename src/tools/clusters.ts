import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, READ_ONLY, runAction, WRITE } from "./helpers.js";

const clusterIdSchema = {
  cluster_id: z.number().int().describe("Numeric cluster id (see hatchbox_list_account_clusters)."),
};

const clusterWriteFields = {
  maintenance_wday: z
    .number()
    .int()
    .min(0)
    .max(6)
    .nullable()
    .describe("Day of the weekly maintenance window, 0 (Sunday) to 6 (Saturday). null clears it.")
    .optional(),
  maintenance_hour: z
    .number()
    .int()
    .min(0)
    .max(23)
    .nullable()
    .describe("Hour the window opens, 0 to 23, in maintenance_time_zone. The window lasts 3 hours. null clears it.")
    .optional(),
  maintenance_time_zone: z
    .string()
    .nullable()
    .describe(
      "IANA time zone the day and hour are in, e.g. 'America/Chicago', 'Europe/Berlin', or 'Etc/UTC' (plain 'UTC' " +
        "and Rails names like 'Central Time (US & Canada)' are rejected). null clears it.",
    )
    .optional(),
};

export function registerClustersTools(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_get_cluster",
    {
      title: "Get Hatchbox Cluster",
      description:
        "Fetch a Hatchbox server cluster, with its servers embedded under a `servers` key. For a standalone server " +
        "list/get, use hatchbox_list_servers / hatchbox_get_server. Includes the weekly maintenance window " +
        "(maintenance_wday, maintenance_hour, maintenance_time_zone, all null without one) and " +
        "next_maintenance_window_at, the UTC opening of the window that's open now or of the next one. Each server's " +
        "nightly_upgrade_time is the time of day, in maintenance_time_zone, of its daily security upgrade slot (null " +
        "without a window, or for a server that isn't active).",
      inputSchema: clusterIdSchema,
      annotations: READ_ONLY,
    },
    async ({ cluster_id }) => runAction(async () => jsonResult(await client.get(`/clusters/${cluster_id}`))),
  );

  server.registerTool(
    "hatchbox_update_cluster",
    {
      title: "Update Hatchbox Cluster",
      description:
        "Set, move, or clear a Hatchbox cluster's weekly maintenance window, the only cluster setting the API can " +
        "change. Only the fields you pass are changed. A window needs all three of maintenance_wday, " +
        "maintenance_hour, and maintenance_time_zone (422 otherwise); pass null for all three to remove it. Each " +
        "week during the window Hatchbox updates the servers one at a time, which can restart services like " +
        "PostgreSQL and Redis, and every server's nightly security upgrade moves to its own slot starting at the " +
        "window's hour. Returns the updated cluster, as hatchbox_get_cluster does.",
      inputSchema: { ...clusterIdSchema, ...clusterWriteFields },
      annotations: WRITE,
    },
    // Omitted fields are undefined, which JSON.stringify drops, so only the fields passed are sent
    async ({ cluster_id, ...cluster }) =>
      runAction(async () => jsonResult(await client.patch(`/clusters/${cluster_id}`, { cluster }))),
  );
}
