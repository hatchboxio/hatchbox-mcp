import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, missingFields, runAction, textResult } from "./helpers.js";

const inputSchema = {
  action: z
    .enum(["create", "update", "delete"])
    .describe(
      "create/update: require app_id + env_vars (array of {name, value}). " +
        "delete: requires app_id + names (array of strings).",
    ),
  app_id: z.number().int().describe("Numeric app id. Required for every action.").optional(),
  env_vars: z
    .array(
      z.object({
        name: z.string().describe("Env var name. Will be uppercased server-side."),
        value: z.string().describe("Env var value."),
      }),
    )
    .describe(
      "Env vars to create or update, e.g. [{\"name\": \"FOO\", \"value\": \"bar\"}]. " +
        "create fails with a 422 if a name already exists — use action=update to change an existing one.",
    )
    .optional(),
  names: z
    .array(z.string())
    .describe("Env var names to remove. Only used by action=delete. Unknown names are ignored, not errors.")
    .optional(),
};

export function registerEnvVarsTool(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_env_vars",
    {
      title: "Hatchbox App Env Vars",
      description:
        "Create, update, or delete environment variables on a Hatchbox app. Values are write-only — reads elsewhere " +
        "never return them (app config, database credentials via hatchbox_databases are separate).",
      inputSchema,
      annotations: { openWorldHint: true },
    },
    async (args) =>
      runAction(async () => {
        const { action, app_id, env_vars, names } = args;
        switch (action) {
          case "create": {
            const err = missingFields(args, ["app_id", "env_vars"], action);
            if (err) return err;
            return jsonResult(await client.post(`/apps/${app_id}/env_vars`, { env_vars }));
          }
          case "update": {
            const err = missingFields(args, ["app_id", "env_vars"], action);
            if (err) return err;
            await client.patch(`/apps/${app_id}/env_vars`, { env_vars });
            return textResult(`Updated ${env_vars!.length} env var(s) on app ${app_id}.`);
          }
          case "delete": {
            const err = missingFields(args, ["app_id", "names"], action);
            if (err) return err;
            await client.delete(`/apps/${app_id}/env_vars`, { env_vars: names });
            return textResult(`Removed env var(s) ${names!.join(", ")} from app ${app_id}.`);
          }
        }
      }),
  );
}
