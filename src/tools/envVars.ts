import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, runAction, textResult, WRITE } from "./helpers.js";

const appIdSchema = {
  app_id: z.number().int().describe("Numeric app id."),
};

const envVarsSchema = z
  .array(
    z.object({
      name: z.string().describe("Env var name. Will be uppercased server-side."),
      value: z.string().describe("Env var value."),
    }),
  )
  .describe('Env vars to set, e.g. [{"name": "FOO", "value": "bar"}].');

export function registerEnvVarsTools(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_create_env_vars",
    {
      title: "Create App Env Vars",
      description:
        "Create new environment variables on a Hatchbox app. Fails with a 422 if a name already exists — use " +
        "hatchbox_update_env_vars to change an existing one. Values are write-only — reads elsewhere never return them.",
      inputSchema: { ...appIdSchema, env_vars: envVarsSchema },
      annotations: WRITE,
    },
    async ({ app_id, env_vars }) =>
      runAction(async () => jsonResult(await client.post(`/apps/${app_id}/env_vars`, { env_vars }))),
  );

  server.registerTool(
    "hatchbox_update_env_vars",
    {
      title: "Update App Env Vars",
      description: "Update existing environment variables on a Hatchbox app.",
      inputSchema: { ...appIdSchema, env_vars: envVarsSchema },
      annotations: WRITE,
    },
    async ({ app_id, env_vars }) =>
      runAction(async () => {
        await client.patch(`/apps/${app_id}/env_vars`, { env_vars });
        return textResult(`Updated ${env_vars.length} env var(s) on app ${app_id}.`);
      }),
  );

  server.registerTool(
    "hatchbox_delete_env_vars",
    {
      title: "Delete App Env Vars",
      description: "Remove environment variables from a Hatchbox app. Unknown names are ignored, not errors.",
      inputSchema: {
        ...appIdSchema,
        names: z.array(z.string()).describe("Env var names to remove."),
      },
      annotations: WRITE,
    },
    async ({ app_id, names }) =>
      runAction(async () => {
        await client.delete(`/apps/${app_id}/env_vars`, { env_vars: names });
        return textResult(`Removed env var(s) ${names.join(", ")} from app ${app_id}.`);
      }),
  );
}
