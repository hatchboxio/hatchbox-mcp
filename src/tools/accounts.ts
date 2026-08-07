import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, READ_ONLY, runAction } from "./helpers.js";

const accountIdSchema = {
  account_id: z.number().int().describe("Numeric account id."),
};

export function registerAccountsTools(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_list_accounts",
    {
      title: "List Hatchbox Accounts",
      description:
        "List every Hatchbox account you belong to. Start here to discover account_id values needed by other " +
        "hatchbox_* tools. No parameters.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => runAction(async () => jsonResult(await client.get("/accounts"))),
  );

  server.registerTool(
    "hatchbox_get_account",
    {
      title: "Get Hatchbox Account",
      description: "Fetch a single Hatchbox account by id.",
      inputSchema: accountIdSchema,
      annotations: READ_ONLY,
    },
    async ({ account_id }) =>
      runAction(async () => jsonResult(await client.get(`/accounts/${account_id}`))),
  );

  server.registerTool(
    "hatchbox_list_account_apps",
    {
      title: "List Account Apps",
      description: "List every app under a Hatchbox account.",
      inputSchema: accountIdSchema,
      annotations: READ_ONLY,
    },
    async ({ account_id }) =>
      runAction(async () => jsonResult(await client.get(`/accounts/${account_id}/apps`))),
  );

  server.registerTool(
    "hatchbox_list_account_clusters",
    {
      title: "List Account Clusters",
      description: "List every server cluster under a Hatchbox account.",
      inputSchema: accountIdSchema,
      annotations: READ_ONLY,
    },
    async ({ account_id }) =>
      runAction(async () => jsonResult(await client.get(`/accounts/${account_id}/clusters`))),
  );

  server.registerTool(
    "hatchbox_list_account_database_clusters",
    {
      title: "List Account Database Clusters",
      description: "List every database cluster under a Hatchbox account.",
      inputSchema: accountIdSchema,
      annotations: READ_ONLY,
    },
    async ({ account_id }) =>
      runAction(async () => jsonResult(await client.get(`/accounts/${account_id}/database_clusters`))),
  );

  server.registerTool(
    "hatchbox_list_account_git_providers",
    {
      title: "List Account Git Providers",
      description: "List every connected git provider under a Hatchbox account.",
      inputSchema: accountIdSchema,
      annotations: READ_ONLY,
    },
    async ({ account_id }) =>
      runAction(async () => jsonResult(await client.get(`/accounts/${account_id}/git_providers`))),
  );
}
