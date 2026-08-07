import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, READ_ONLY, runAction, textResult, WRITE } from "./helpers.js";

const appIdSchema = {
  app_id: z.number().int().describe("Numeric app id the domain belongs to."),
};

const domainNameSchema = z
  .string()
  .describe("The domain's name, e.g. 'example.com' or '*.example.com'. Domains are looked up by name, not id.");

export function registerDomainsTools(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_list_domains",
    {
      title: "List App Domains",
      description: "List every domain attached to a Hatchbox app.",
      inputSchema: appIdSchema,
      annotations: READ_ONLY,
    },
    async ({ app_id }) => runAction(async () => jsonResult(await client.get(`/apps/${app_id}/domains`))),
  );

  server.registerTool(
    "hatchbox_get_domain",
    {
      title: "Get App Domain",
      description: "Fetch a single domain attached to a Hatchbox app, by name.",
      inputSchema: { ...appIdSchema, name: domainNameSchema },
      annotations: READ_ONLY,
    },
    async ({ app_id, name }) =>
      runAction(async () => jsonResult(await client.get(`/apps/${app_id}/domains/${encodeURIComponent(name)}`))),
  );

  server.registerTool(
    "hatchbox_create_domain",
    {
      title: "Create App Domain",
      description: "Attach a new domain to a Hatchbox app.",
      inputSchema: { ...appIdSchema, name: domainNameSchema },
      annotations: WRITE,
    },
    async ({ app_id, name }) =>
      runAction(async () => jsonResult(await client.post(`/apps/${app_id}/domains`, { domain: { name } }))),
  );

  server.registerTool(
    "hatchbox_update_domain",
    {
      title: "Rename App Domain",
      description: "Rename a domain attached to a Hatchbox app.",
      inputSchema: {
        ...appIdSchema,
        name: domainNameSchema.describe("The domain's CURRENT name."),
        new_name: z.string().describe("The new name to rename the domain to."),
      },
      annotations: WRITE,
    },
    async ({ app_id, name, new_name }) =>
      runAction(async () =>
        jsonResult(
          await client.patch(`/apps/${app_id}/domains/${encodeURIComponent(name)}`, { domain: { name: new_name } }),
        ),
      ),
  );

  server.registerTool(
    "hatchbox_delete_domain",
    {
      title: "Delete App Domain",
      description: "Remove a domain from a Hatchbox app.",
      inputSchema: { ...appIdSchema, name: domainNameSchema },
      annotations: WRITE,
    },
    async ({ app_id, name }) =>
      runAction(async () => {
        await client.delete(`/apps/${app_id}/domains/${encodeURIComponent(name)}`);
        return textResult(`Deleted domain ${name} from app ${app_id}.`);
      }),
  );
}
