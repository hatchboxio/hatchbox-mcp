import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, missingFields, runAction, textResult } from "./helpers.js";

const inputSchema = {
  action: z
    .enum(["list_for_app", "show_for_app", "list_for_cluster", "show_for_cluster", "create", "update", "attach", "detach"])
    .describe(
      "list_for_app: requires app_id. show_for_app: requires app_id + database_id. " +
        "list_for_cluster: requires database_cluster_id. show_for_cluster/update: require database_cluster_id + database_id. " +
        "create: requires database_cluster_id (+ optional name/path). " +
        "attach: requires app_id + database_id (+ optional env_var). detach: requires app_id + database_id.",
    ),
  app_id: z.number().int().describe("Numeric app id. Required for list_for_app/show_for_app/attach/detach.").optional(),
  database_cluster_id: z
    .number()
    .int()
    .describe(
      "Numeric database cluster id (see hatchbox_accounts action=list_database_clusters). " +
        "Required for list_for_cluster/show_for_cluster/create/update.",
    )
    .optional(),
  database_id: z.number().int().describe("Numeric database id. Required for show_for_app/show_for_cluster/update/attach/detach.").optional(),
  name: z
    .string()
    .describe("Database name. Used by create/update. Ignored for redis/elasticsearch/memcached clusters on create.")
    .optional(),
  path: z
    .string()
    .describe("Absolute file path. Only used (and required on create) for SQLite clusters; on update, re-points every attached app.")
    .optional(),
  env_var: z
    .string()
    .describe(
      "Only used by action=attach. Env var name to store the connection string under. Omit to use the database's " +
        "default (e.g. DATABASE_URL), auto color-prefixed on collision.",
    )
    .optional(),
};

export function registerDatabasesTool(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_databases",
    {
      title: "Hatchbox Databases",
      description:
        "Read, create, update, and attach/detach Hatchbox databases. Responses include connection credentials " +
        "(username/password/connection URIs) in plaintext for relational/redis databases, or a file path for SQLite. " +
        "create does NOT attach the database to any app — call attach afterward. attach/detach create/remove a " +
        "connection env var on the app; a database can be attached to the same app more than once. " +
        "For backups, use the hatchbox_backups tool.",
      inputSchema,
      annotations: { openWorldHint: true },
    },
    async (args) =>
      runAction(async () => {
        const { action, app_id, database_cluster_id, database_id, name, path, env_var } = args;
        switch (action) {
          case "list_for_app": {
            const err = missingFields(args, ["app_id"], action);
            if (err) return err;
            return jsonResult(await client.get(`/apps/${app_id}/databases`));
          }
          case "show_for_app": {
            const err = missingFields(args, ["app_id", "database_id"], action);
            if (err) return err;
            return jsonResult(await client.get(`/apps/${app_id}/databases/${database_id}`));
          }
          case "list_for_cluster": {
            const err = missingFields(args, ["database_cluster_id"], action);
            if (err) return err;
            return jsonResult(await client.get(`/database_clusters/${database_cluster_id}/databases`));
          }
          case "show_for_cluster": {
            const err = missingFields(args, ["database_cluster_id", "database_id"], action);
            if (err) return err;
            return jsonResult(await client.get(`/database_clusters/${database_cluster_id}/databases/${database_id}`));
          }
          case "create": {
            const err = missingFields(args, ["database_cluster_id"], action);
            if (err) return err;
            return jsonResult(await client.post(`/database_clusters/${database_cluster_id}/databases`, { database: { name, path } }));
          }
          case "update": {
            const err = missingFields(args, ["database_cluster_id", "database_id"], action);
            if (err) return err;
            return jsonResult(
              await client.patch(`/database_clusters/${database_cluster_id}/databases/${database_id}`, { database: { name, path } }),
            );
          }
          case "attach": {
            const err = missingFields(args, ["app_id", "database_id"], action);
            if (err) return err;
            return jsonResult(await client.post(`/apps/${app_id}/databases/${database_id}/attachment`, { env_var }));
          }
          case "detach": {
            const err = missingFields(args, ["app_id", "database_id"], action);
            if (err) return err;
            await client.delete(`/apps/${app_id}/databases/${database_id}/attachment`);
            return textResult(`Detached database ${database_id} from app ${app_id}.`);
          }
        }
      }),
  );
}
