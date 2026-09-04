import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, READ_ONLY, runAction, textResult, WRITE } from "./helpers.js";

const appIdSchema = {
  app_id: z.number().int().describe("Numeric app id."),
};

const APP_NAME_REGEX = /^[\w-]+$/;

const appWriteFields = {
  branch: z.string().describe("Git branch to deploy from.").optional(),
  repo_path: z.string().describe("Repository path, e.g. 'org/repo'.").optional(),
  connected_account_id: z
    .number()
    .int()
    .describe("Git provider connection id to pull the repo from (see hatchbox_list_account_git_providers).")
    .optional(),
  pre_build_script: z.string().optional(),
  build_script: z.string().optional(),
  post_build_script: z.string().optional(),
  post_deploy_script: z.string().optional(),
  failed_deploy_script: z.string().optional(),
  dns_provider: z.string().describe("DNS provider slug. Set together with dns_access_token.").optional(),
  dns_access_token: z.string().describe("DNS provider API token. Set together with dns_provider. Write-only, never returned.").optional(),
  dns_api_user: z.string().optional(),
  caddyfile: z.string().describe("Custom Caddy config imports. Changing this (even to the same value) re-applies Caddy config on next update.").optional(),
  health_check_uri: z.string().describe("URI path Hatchbox polls to confirm a deploy succeeded, e.g. '/up'.").optional(),
};

const APP_WRITE_KEYS = Object.keys(appWriteFields) as (keyof typeof appWriteFields)[];

function appParams(args: Record<string, unknown>): Record<string, unknown> {
  const app: Record<string, unknown> = {};
  for (const key of APP_WRITE_KEYS) {
    if (args[key] !== undefined) app[key] = args[key];
  }
  return app;
}

export function registerAppsTools(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_get_app",
    {
      title: "Get Hatchbox App",
      description: "Fetch a Hatchbox app's configuration.",
      inputSchema: appIdSchema,
      annotations: READ_ONLY,
    },
    async ({ app_id }) => runAction(async () => jsonResult(await client.get(`/apps/${app_id}`))),
  );

  server.registerTool(
    "hatchbox_create_app",
    {
      title: "Create Hatchbox App",
      description: "Create a new Hatchbox app on a cluster.",
      inputSchema: {
        ...appWriteFields,
        cluster_id: z.number().int().describe("Cluster to create the app on (see hatchbox_list_account_clusters)."),
        name: z.string().regex(APP_NAME_REGEX).describe("App name, letters/numbers/underscore/hyphen only."),
      },
      annotations: WRITE,
    },
    async (args) =>
      runAction(async () => {
        const { cluster_id, name } = args;
        return jsonResult(await client.post(`/apps`, { app: { cluster_id, name, ...appParams(args) } }));
      }),
  );

  server.registerTool(
    "hatchbox_update_app",
    {
      title: "Update Hatchbox App",
      description:
        "Update a Hatchbox app's configuration. Only the fields you pass are changed. Renaming isn't supported here " +
        "(a rename moves the app directory and rewrites server config, so it's a separate async operation) — use " +
        "hatchbox_rename_app instead.",
      inputSchema: { ...appIdSchema, ...appWriteFields },
      annotations: WRITE,
    },
    async (args) =>
      runAction(async () => {
        const { app_id } = args;
        return jsonResult(await client.patch(`/apps/${app_id}`, { app: appParams(args) }));
      }),
  );

  server.registerTool(
    "hatchbox_rename_app",
    {
      title: "Rename Hatchbox App",
      description:
        "Rename a Hatchbox app. Moves the app directory and rewrites every systemd unit on its servers, so it runs " +
        "as a background script rather than a plain field update — the app keeps its old name until the script " +
        "completes. Asynchronous — returns an id (the log id, not named log_id for this endpoint), follow up with " +
        "hatchbox_get_log. Fails with a 422 if the new name matches the current name, is blank, contains characters " +
        "other than letters/numbers/hyphens/underscores, or is already taken by another app in the same cluster.",
      inputSchema: {
        ...appIdSchema,
        name: z.string().regex(APP_NAME_REGEX).describe("New app name, letters/numbers/underscore/hyphen only."),
      },
      annotations: WRITE,
    },
    async ({ app_id, name }) => runAction(async () => jsonResult(await client.post(`/apps/${app_id}/rename`, { app: { name } }))),
  );

  server.registerTool(
    "hatchbox_enable_app_maintenance",
    {
      title: "Enable App Maintenance Mode",
      description:
        "Put a Hatchbox app into maintenance mode, serving a maintenance page instead of the app. Returns the " +
        "updated app record immediately with `maintenance: true` — the actual Caddy config reload on the app's " +
        "servers happens in the background, with no log id to follow up on.",
      inputSchema: appIdSchema,
      annotations: WRITE,
    },
    async ({ app_id }) => runAction(async () => jsonResult(await client.post(`/apps/${app_id}/maintenance`))),
  );

  server.registerTool(
    "hatchbox_disable_app_maintenance",
    {
      title: "Disable App Maintenance Mode",
      description:
        "Take a Hatchbox app out of maintenance mode. Returns the updated app record immediately with " +
        "`maintenance: false` — the actual Caddy config reload on the app's servers happens in the background, " +
        "with no log id to follow up on.",
      inputSchema: appIdSchema,
      annotations: WRITE,
    },
    async ({ app_id }) => runAction(async () => jsonResult(await client.delete(`/apps/${app_id}/maintenance`))),
  );

  server.registerTool(
    "hatchbox_restart_app",
    {
      title: "Restart Hatchbox App",
      description:
        "Restart every process on a Hatchbox app. Asynchronous — returns a log id, follow up with hatchbox_get_log " +
        "to see progress and completion status.",
      inputSchema: appIdSchema,
      annotations: WRITE,
    },
    async ({ app_id }) => runAction(async () => jsonResult(await client.post(`/apps/${app_id}/restart`))),
  );

  server.registerTool(
    "hatchbox_deploy_app",
    {
      title: "Deploy Hatchbox App",
      description:
        "Trigger a deploy of a Hatchbox app. Asynchronous — returns a log id, follow up with hatchbox_get_log to see " +
        "progress and completion status.",
      inputSchema: {
        ...appIdSchema,
        sha: z.string().describe("Specific commit SHA to deploy. Omit to deploy the latest commit on the app's branch.").optional(),
      },
      annotations: WRITE,
    },
    async ({ app_id, sha }) =>
      runAction(async () => jsonResult(await client.post(`/apps/${app_id}/deploy`, sha ? { sha } : {}))),
  );

  server.registerTool(
    "hatchbox_enable_app_auto_deploy",
    {
      title: "Enable App Auto-Deploy",
      description: "Enable auto-deploy on a Hatchbox app, so pushes to its branch trigger a deploy automatically.",
      inputSchema: appIdSchema,
      annotations: WRITE,
    },
    async ({ app_id }) => runAction(async () => jsonResult(await client.post(`/apps/${app_id}/auto_deploy`))),
  );

  server.registerTool(
    "hatchbox_disable_app_auto_deploy",
    {
      title: "Disable App Auto-Deploy",
      description: "Disable auto-deploy on a Hatchbox app.",
      inputSchema: appIdSchema,
      annotations: WRITE,
    },
    async ({ app_id }) =>
      runAction(async () => {
        await client.delete(`/apps/${app_id}/auto_deploy`);
        return textResult(`Disabled auto-deploy on app ${app_id}.`);
      }),
  );
}
