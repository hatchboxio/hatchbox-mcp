import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, missingFields, runAction } from "./helpers.js";

const inputSchema = {
  action: z
    .enum(["list", "show", "list_apps", "list_clusters", "list_database_clusters", "list_git_providers"])
    .describe(
      "list: every account you belong to, no params. " +
        "show/list_apps/list_clusters/list_database_clusters/list_git_providers: require account_id.",
    ),
  account_id: z.number().int().describe("Numeric account id. Required for every action except 'list'.").optional(),
};

export function registerAccountsTool(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_accounts",
    {
      title: "Hatchbox Accounts",
      description:
        "Read Hatchbox account info and account-scoped collections (apps, clusters, database clusters, git providers). " +
        "Start here to discover account_id and cluster_id values needed by other hatchbox_* tools. Read-only.",
      inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      runAction(async () => {
        const { action, account_id } = args;
        if (action !== "list") {
          const err = missingFields(args, ["account_id"], action);
          if (err) return err;
        }
        switch (action) {
          case "list":
            return jsonResult(await client.get("/accounts"));
          case "show":
            return jsonResult(await client.get(`/accounts/${account_id}`));
          case "list_apps":
            return jsonResult(await client.get(`/accounts/${account_id}/apps`));
          case "list_clusters":
            return jsonResult(await client.get(`/accounts/${account_id}/clusters`));
          case "list_database_clusters":
            return jsonResult(await client.get(`/accounts/${account_id}/database_clusters`));
          case "list_git_providers":
            return jsonResult(await client.get(`/accounts/${account_id}/git_providers`));
        }
      }),
  );
}
