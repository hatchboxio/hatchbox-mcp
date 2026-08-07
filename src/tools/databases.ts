import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, READ_ONLY, runAction, textResult, WRITE } from "./helpers.js";

const appIdSchema = {
  app_id: z.number().int().describe("Numeric app id."),
};

const clusterIdSchema = {
  database_cluster_id: z
    .number()
    .int()
    .describe("Numeric database cluster id (see hatchbox_list_account_database_clusters)."),
};

const CREDENTIALS_NOTE =
  "Responses include connection credentials (username/password/connection URIs) in plaintext for " +
  "relational/redis databases, or a file path for SQLite.";

export function registerDatabasesTools(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_list_app_databases",
    {
      title: "List App Databases",
      description: `List the databases attached to a Hatchbox app. ${CREDENTIALS_NOTE}`,
      inputSchema: appIdSchema,
      annotations: READ_ONLY,
    },
    async ({ app_id }) => runAction(async () => jsonResult(await client.get(`/apps/${app_id}/databases`))),
  );

  server.registerTool(
    "hatchbox_get_app_database",
    {
      title: "Get App Database",
      description: `Fetch a single database attached to a Hatchbox app. ${CREDENTIALS_NOTE}`,
      inputSchema: {
        ...appIdSchema,
        database_id: z.number().int().describe("Numeric database id."),
      },
      annotations: READ_ONLY,
    },
    async ({ app_id, database_id }) =>
      runAction(async () => jsonResult(await client.get(`/apps/${app_id}/databases/${database_id}`))),
  );

  server.registerTool(
    "hatchbox_list_cluster_databases",
    {
      title: "List Cluster Databases",
      description: `List the databases on a Hatchbox database cluster. ${CREDENTIALS_NOTE}`,
      inputSchema: clusterIdSchema,
      annotations: READ_ONLY,
    },
    async ({ database_cluster_id }) =>
      runAction(async () => jsonResult(await client.get(`/database_clusters/${database_cluster_id}/databases`))),
  );

  server.registerTool(
    "hatchbox_get_cluster_database",
    {
      title: "Get Cluster Database",
      description: `Fetch a single database on a Hatchbox database cluster. ${CREDENTIALS_NOTE}`,
      inputSchema: {
        ...clusterIdSchema,
        database_id: z.number().int().describe("Numeric database id."),
      },
      annotations: READ_ONLY,
    },
    async ({ database_cluster_id, database_id }) =>
      runAction(async () =>
        jsonResult(await client.get(`/database_clusters/${database_cluster_id}/databases/${database_id}`)),
      ),
  );

  server.registerTool(
    "hatchbox_create_database",
    {
      title: "Create Database",
      description:
        "Create a new database on a Hatchbox database cluster. Does NOT attach it to any app — call " +
        "hatchbox_attach_database afterward.",
      inputSchema: {
        ...clusterIdSchema,
        name: z.string().describe("Database name. Ignored for redis/elasticsearch/memcached clusters.").optional(),
        path: z.string().describe("Absolute file path. Required for SQLite clusters, unused otherwise.").optional(),
      },
      annotations: WRITE,
    },
    async ({ database_cluster_id, name, path }) =>
      runAction(async () =>
        jsonResult(await client.post(`/database_clusters/${database_cluster_id}/databases`, { database: { name, path } })),
      ),
  );

  server.registerTool(
    "hatchbox_update_database",
    {
      title: "Update Database",
      description: "Update a database on a Hatchbox database cluster.",
      inputSchema: {
        ...clusterIdSchema,
        database_id: z.number().int().describe("Numeric database id."),
        name: z.string().describe("Database name.").optional(),
        path: z.string().describe("Absolute file path. SQLite only — re-points every attached app.").optional(),
      },
      annotations: WRITE,
    },
    async ({ database_cluster_id, database_id, name, path }) =>
      runAction(async () =>
        jsonResult(
          await client.patch(`/database_clusters/${database_cluster_id}/databases/${database_id}`, {
            database: { name, path },
          }),
        ),
      ),
  );

  server.registerTool(
    "hatchbox_attach_database",
    {
      title: "Attach Database to App",
      description:
        "Attach a database to a Hatchbox app, creating a connection env var on the app. A database can be attached " +
        "to the same app more than once.",
      inputSchema: {
        ...appIdSchema,
        database_id: z.number().int().describe("Numeric database id."),
        env_var: z
          .string()
          .describe(
            "Env var name to store the connection string under. Omit to use the database's default " +
              "(e.g. DATABASE_URL), auto color-prefixed on collision.",
          )
          .optional(),
      },
      annotations: WRITE,
    },
    async ({ app_id, database_id, env_var }) =>
      runAction(async () =>
        jsonResult(await client.post(`/apps/${app_id}/databases/${database_id}/attachment`, { env_var })),
      ),
  );

  server.registerTool(
    "hatchbox_detach_database",
    {
      title: "Detach Database from App",
      description: "Detach a database from a Hatchbox app, removing its connection env var.",
      inputSchema: {
        ...appIdSchema,
        database_id: z.number().int().describe("Numeric database id."),
      },
      annotations: WRITE,
    },
    async ({ app_id, database_id }) =>
      runAction(async () => {
        await client.delete(`/apps/${app_id}/databases/${database_id}/attachment`);
        return textResult(`Detached database ${database_id} from app ${app_id}.`);
      }),
  );
}
