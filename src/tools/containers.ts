import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, READ_ONLY, runAction, WRITE } from "./helpers.js";

const appIdSchema = {
  app_id: z.number().int().describe("Numeric app id."),
};

const containerWriteFields = {
  dockerfile: z.string().describe("Path of the Dockerfile inside the repository, like 'Dockerfile' or 'docker/Dockerfile.prod'.").optional(),
  container_port: z.number().int().min(1).max(65535).describe("Port the web process listens on inside the container.").optional(),
  health_check_timeout: z
    .number()
    .int()
    .min(10)
    .max(1800)
    .describe("Seconds a new web container gets to pass its health check before the deploy fails.")
    .optional(),
  pre_deploy_command: z
    .string()
    .describe("Runs once from the new image before any container is swapped, like 'bin/rails db:migrate'. Empty to skip.")
    .optional(),
  volumes: z
    .array(z.string())
    .describe("Mounts as 'source:/path/in/container', where source is a named volume or an absolute host path. Replaces the whole list.")
    .optional(),
  asset_path: z
    .string()
    .describe("Absolute path of the compiled assets inside the image, kept across deploys so old asset URLs still load. Empty for none.")
    .optional(),
  build_secrets: z
    .array(z.string())
    .describe("Names of the app's env vars handed to `docker build` as BuildKit secrets. Replaces the whole list.")
    .optional(),
};

const CONTAINER_WRITE_KEYS = Object.keys(containerWriteFields) as (keyof typeof containerWriteFields)[];

export function registerContainersTools(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_get_app_container",
    {
      title: "Get App Container Settings",
      description:
        "Fetch how an app on a Dockerfile cluster (cluster deploy_strategy 'docker') is built and run: its Dockerfile, " +
        "port, health check timeout, pre-deploy command, volumes, asset path and build secrets. Fails with a 422 for " +
        "an app on a native cluster.",
      inputSchema: appIdSchema,
      annotations: READ_ONLY,
    },
    async ({ app_id }) => runAction(async () => jsonResult(await client.get(`/apps/${app_id}/container`))),
  );

  server.registerTool(
    "hatchbox_update_app_container",
    {
      title: "Update App Container Settings",
      description:
        "Change how an app on a Dockerfile cluster is built and run. Only the fields you pass are changed; they apply " +
        "on the next deploy (use hatchbox_deploy_app). Returns the settings as saved. Fails with a 422 for an app on a " +
        "native cluster or an invalid value.",
      inputSchema: { ...appIdSchema, ...containerWriteFields },
      annotations: WRITE,
    },
    async (args) =>
      runAction(async () => {
        const container: Record<string, unknown> = {};
        for (const key of CONTAINER_WRITE_KEYS) {
          if (args[key] !== undefined) container[key] = args[key];
        }
        return jsonResult(await client.patch(`/apps/${args.app_id}/container`, { container }));
      }),
  );
}
