import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, missingFields, runAction, textResult } from "./helpers.js";

const inputSchema = {
  action: z
    .enum(["list", "show", "create", "update", "delete"])
    .describe(
      "list: requires app_id. show/create/delete: require app_id + name. " +
        "update: requires app_id + name (current) + new_name (the rename target).",
    ),
  app_id: z.number().int().describe("Numeric app id the domain belongs to. Required for every action.").optional(),
  name: z
    .string()
    .describe(
      "The domain's name, e.g. 'example.com' or '*.example.com'. Domains are looked up by name, not id. " +
        "Required for show/create/update/delete; for update this is the CURRENT name.",
    )
    .optional(),
  new_name: z.string().describe("The new name to rename the domain to. Only used by action=update.").optional(),
};

export function registerDomainsTool(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_domains",
    {
      title: "Hatchbox Domains",
      description: "Read and manage the domains attached to a Hatchbox app. Domains are addressed by name, not id.",
      inputSchema,
      annotations: { openWorldHint: true },
    },
    async (args) =>
      runAction(async () => {
        const { action, app_id, name, new_name } = args;
        switch (action) {
          case "list": {
            const err = missingFields(args, ["app_id"], action);
            if (err) return err;
            return jsonResult(await client.get(`/apps/${app_id}/domains`));
          }
          case "show": {
            const err = missingFields(args, ["app_id", "name"], action);
            if (err) return err;
            return jsonResult(await client.get(`/apps/${app_id}/domains/${encodeURIComponent(name!)}`));
          }
          case "create": {
            const err = missingFields(args, ["app_id", "name"], action);
            if (err) return err;
            return jsonResult(await client.post(`/apps/${app_id}/domains`, { domain: { name } }));
          }
          case "update": {
            const err = missingFields(args, ["app_id", "name", "new_name"], action);
            if (err) return err;
            return jsonResult(
              await client.patch(`/apps/${app_id}/domains/${encodeURIComponent(name!)}`, { domain: { name: new_name } }),
            );
          }
          case "delete": {
            const err = missingFields(args, ["app_id", "name"], action);
            if (err) return err;
            await client.delete(`/apps/${app_id}/domains/${encodeURIComponent(name!)}`);
            return textResult(`Deleted domain ${name} from app ${app_id}.`);
          }
        }
      }),
  );
}
