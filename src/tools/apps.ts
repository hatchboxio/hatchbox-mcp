import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, missingFields, runAction, textResult } from "./helpers.js";

const inputSchema = {
  action: z
    .enum(["show", "create", "update", "restart", "deploy", "enable_auto_deploy", "disable_auto_deploy"])
    .describe(
      "show/restart/deploy/enable_auto_deploy/disable_auto_deploy: require app_id. " +
        "create: requires cluster_id + name. update: requires app_id, all other fields optional (only sent fields change).",
    ),
  app_id: z.number().int().describe("Numeric app id. Required for show/update/restart/deploy/enable_auto_deploy/disable_auto_deploy.").optional(),
  cluster_id: z.number().int().describe("Cluster to create the app on (see hatchbox_accounts action=list_clusters). Required for create.").optional(),
  name: z.string().regex(/^[\w-]+$/).describe("App name, letters/numbers/underscore/hyphen only. Required for create.").optional(),
  branch: z.string().describe("Git branch to deploy from.").optional(),
  repo_path: z.string().describe("Repository path, e.g. 'org/repo'.").optional(),
  connected_account_id: z
    .number()
    .int()
    .describe("Git provider connection id to pull the repo from (see hatchbox_accounts action=list_git_providers).")
    .optional(),
  pre_build_script: z.string().optional(),
  build_script: z.string().optional(),
  post_build_script: z.string().optional(),
  post_deploy_script: z.string().optional(),
  failed_deploy_script: z.string().optional(),
  dns_provider: z.string().describe("DNS provider slug. Required together with dns_access_token.").optional(),
  dns_access_token: z.string().describe("DNS provider API token. Required together with dns_provider. Write-only, never returned.").optional(),
  dns_api_user: z.string().optional(),
  caddyfile: z.string().describe("Custom Caddy config imports. Changing this (even to the same value) re-applies Caddy config on next update.").optional(),
  health_check_uri: z.string().describe("URI path Hatchbox polls to confirm a deploy succeeded, e.g. '/up'. Used by create/update only.").optional(),
  sha: z.string().describe("Specific commit SHA to deploy. Only used by action=deploy; omit to deploy the latest commit on the app's branch.").optional(),
};

const APP_WRITE_KEYS = [
  "name",
  "branch",
  "repo_path",
  "connected_account_id",
  "pre_build_script",
  "build_script",
  "post_build_script",
  "post_deploy_script",
  "failed_deploy_script",
  "dns_provider",
  "dns_access_token",
  "dns_api_user",
  "caddyfile",
  "health_check_uri",
] as const;

function appParams(args: Record<string, unknown>): Record<string, unknown> {
  const app: Record<string, unknown> = {};
  for (const key of APP_WRITE_KEYS) {
    if (args[key] !== undefined) app[key] = args[key];
  }
  return app;
}

export function registerAppsTool(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_apps",
    {
      title: "Hatchbox Apps",
      description:
        "Read and manage Hatchbox apps: fetch/create/update app config, restart processes, trigger deploys, and toggle " +
        "auto-deploy. restart/deploy are asynchronous and return a log id — follow up with hatchbox_logs to see progress " +
        "and completion status.",
      inputSchema,
      annotations: { openWorldHint: true },
    },
    async (args) =>
      runAction(async () => {
        const { action, app_id, cluster_id } = args;
        switch (action) {
          case "show": {
            const err = missingFields(args, ["app_id"], action);
            if (err) return err;
            return jsonResult(await client.get(`/apps/${app_id}`));
          }
          case "create": {
            const err = missingFields(args, ["cluster_id", "name"], action);
            if (err) return err;
            return jsonResult(await client.post(`/apps`, { app: { cluster_id, ...appParams(args) } }));
          }
          case "update": {
            const err = missingFields(args, ["app_id"], action);
            if (err) return err;
            return jsonResult(await client.patch(`/apps/${app_id}`, { app: appParams(args) }));
          }
          case "restart": {
            const err = missingFields(args, ["app_id"], action);
            if (err) return err;
            return jsonResult(await client.post(`/apps/${app_id}/restart`));
          }
          case "deploy": {
            const err = missingFields(args, ["app_id"], action);
            if (err) return err;
            return jsonResult(await client.post(`/apps/${app_id}/deploy`, args.sha ? { sha: args.sha } : {}));
          }
          case "enable_auto_deploy": {
            const err = missingFields(args, ["app_id"], action);
            if (err) return err;
            return jsonResult(await client.post(`/apps/${app_id}/auto_deploy`));
          }
          case "disable_auto_deploy": {
            const err = missingFields(args, ["app_id"], action);
            if (err) return err;
            await client.delete(`/apps/${app_id}/auto_deploy`);
            return textResult(`Disabled auto-deploy on app ${app_id}.`);
          }
        }
      }),
  );
}
