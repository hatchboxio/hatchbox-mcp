import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, READ_ONLY, runAction, WRITE } from "./helpers.js";

const clusterIdSchema = {
  cluster_id: z.number().int().describe("Numeric id of a Dockerfile cluster (see hatchbox_list_account_clusters)."),
};

const accessoryIdSchema = {
  ...clusterIdSchema,
  accessory_id: z.number().int().describe("Numeric accessory id (see hatchbox_list_accessories)."),
};

// Everything but name, kind and server can be changed later
const accessorySettingsFields = {
  image: z.string().describe("Image reference, like 'typesense/typesense:30.2'. A preset fills it in.").optional(),
  port: z.number().int().min(1).max(65535).describe("Port the container listens on, published on the server's private address. A preset fills it in.").optional(),
  command: z.string().describe("Arguments for the image's entrypoint.").optional(),
  data_path: z.string().describe("Absolute path inside the container whose data is kept on a named volume. A preset fills it in.").optional(),
  health_check_path: z.string().describe("HTTP path that answers 2xx once the container is ready, like '/health'.").optional(),
  env: z
    .string()
    .describe("Env vars as NAME=value lines. A preset fills these in with a generated key; passing env replaces them all.")
    .optional(),
};

const ACCESSORY_SETTINGS_KEYS = Object.keys(accessorySettingsFields) as (keyof typeof accessorySettingsFields)[];

function settingsParams(args: Record<string, unknown>): Record<string, unknown> {
  const accessory: Record<string, unknown> = {};
  for (const key of ACCESSORY_SETTINGS_KEYS) {
    if (args[key] !== undefined) accessory[key] = args[key];
  }
  return accessory;
}

export function registerAccessoriesTools(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_list_accessories",
    {
      title: "List Cluster Accessories",
      description:
        "List the accessories of a Dockerfile cluster: containers like Typesense or Meilisearch run beside its apps, " +
        "each with its server, image, port, host, env and the apps it's attached to. Fails with a 422 on a native cluster.",
      inputSchema: clusterIdSchema,
      annotations: READ_ONLY,
    },
    async ({ cluster_id }) => runAction(async () => jsonResult(await client.get(`/clusters/${cluster_id}/accessories`))),
  );

  server.registerTool(
    "hatchbox_get_accessory",
    {
      title: "Get Cluster Accessory",
      description: "Fetch a single accessory of a Dockerfile cluster, with the apps it's attached to and the env vars they got.",
      inputSchema: accessoryIdSchema,
      annotations: READ_ONLY,
    },
    async ({ cluster_id, accessory_id }) =>
      runAction(async () => jsonResult(await client.get(`/clusters/${cluster_id}/accessories/${accessory_id}`))),
  );

  server.registerTool(
    "hatchbox_create_accessory",
    {
      title: "Create Cluster Accessory",
      description:
        "Run a new accessory container on a Dockerfile cluster. kind 'typesense' or 'meilisearch' fills in the image, " +
        "port, data path, health check and a generated API key; 'custom' needs image and port. Runs on the cluster's " +
        "primary server unless server_id is given; its data stays on that server. Asynchronous — returns the record " +
        "plus a log_id, follow up with hatchbox_get_log. Attach it to an app with hatchbox_attach_accessory.",
      inputSchema: {
        ...clusterIdSchema,
        name: z
          .string()
          .regex(/^[a-z0-9][a-z0-9_-]*$/)
          .describe("Lowercase name, unique in the cluster. The container is hatchbox-<name>, its volume <name>_data."),
        kind: z.enum(["typesense", "meilisearch", "custom"]).describe("A preset, or 'custom' for any image."),
        server_id: z.number().int().describe("Server to run it on (see hatchbox_list_servers).").optional(),
        ...accessorySettingsFields,
      },
      annotations: WRITE,
    },
    async (args) =>
      runAction(async () => {
        const accessory = { name: args.name, kind: args.kind, server_id: args.server_id, ...settingsParams(args) };
        return jsonResult(await client.post(`/clusters/${args.cluster_id}/accessories`, { accessory }));
      }),
  );

  server.registerTool(
    "hatchbox_update_accessory",
    {
      title: "Update Cluster Accessory",
      description:
        "Change an accessory's image, port, command, paths or env, which replaces its container; the data volume is " +
        "kept. Its name, kind and server can't change. Attached apps get a changed port or key in their env vars. " +
        "Asynchronous — returns the record plus a log_id, follow up with hatchbox_get_log.",
      inputSchema: { ...accessoryIdSchema, ...accessorySettingsFields },
      annotations: WRITE,
    },
    async (args) =>
      runAction(async () =>
        jsonResult(
          await client.patch(`/clusters/${args.cluster_id}/accessories/${args.accessory_id}`, { accessory: settingsParams(args) }),
        ),
      ),
  );

  server.registerTool(
    "hatchbox_delete_accessory",
    {
      title: "Delete Cluster Accessory",
      description:
        "Remove an accessory's container and detach it from its apps. Its data volume stays on the server. " +
        "Asynchronous — returns the record plus a log_id, follow up with hatchbox_get_log.",
      inputSchema: accessoryIdSchema,
      annotations: WRITE,
    },
    async ({ cluster_id, accessory_id }) =>
      runAction(async () => jsonResult(await client.delete(`/clusters/${cluster_id}/accessories/${accessory_id}`))),
  );

  server.registerTool(
    "hatchbox_restart_accessory",
    {
      title: "Restart Cluster Accessory",
      description: "Restart an accessory's container. Asynchronous — returns the record plus a log_id, follow up with hatchbox_get_log.",
      inputSchema: accessoryIdSchema,
      annotations: WRITE,
    },
    async ({ cluster_id, accessory_id }) =>
      runAction(async () => jsonResult(await client.post(`/clusters/${cluster_id}/accessories/${accessory_id}/restart`))),
  );

  server.registerTool(
    "hatchbox_attach_accessory",
    {
      title: "Attach Accessory to App",
      description:
        "Give an app on the same cluster the env vars to reach an accessory: <PREFIX>_HOST and _PORT, plus _PROTOCOL " +
        "and _API_KEY for Typesense or _API_KEY for Meilisearch. The prefix defaults to TYPESENSE, MEILISEARCH or the " +
        "accessory's name. The app's servers get the new env vars right away; returns the accessory with its attachments.",
      inputSchema: {
        ...accessoryIdSchema,
        app_id: z.number().int().describe("Numeric id of an app on the same cluster."),
        prefix: z.string().regex(/^[A-Z][A-Z0-9_]*$/).describe("Env var prefix, like SEARCH.").optional(),
      },
      annotations: WRITE,
    },
    async ({ cluster_id, accessory_id, app_id, prefix }) =>
      runAction(async () =>
        jsonResult(await client.post(`/clusters/${cluster_id}/accessories/${accessory_id}/attachment`, { app_id, prefix })),
      ),
  );

  server.registerTool(
    "hatchbox_detach_accessory",
    {
      title: "Detach Accessory from App",
      description: "Remove the env vars an accessory gave an app. Returns the accessory with its remaining attachments.",
      inputSchema: {
        ...accessoryIdSchema,
        app_id: z.number().int().describe("Numeric id of the attached app."),
      },
      annotations: WRITE,
    },
    async ({ cluster_id, accessory_id, app_id }) =>
      runAction(async () =>
        jsonResult(await client.delete(`/clusters/${cluster_id}/accessories/${accessory_id}/attachment`, { app_id })),
      ),
  );
}
