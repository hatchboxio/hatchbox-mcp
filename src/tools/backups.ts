import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, READ_ONLY, runAction, WRITE } from "./helpers.js";

const databaseIdSchema = {
  database_id: z.number().int().describe("Numeric database id (see hatchbox_list_app_databases)."),
};

export function registerBackupsTools(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_create_backup",
    {
      title: "Create Database Backup",
      description:
        "Trigger a new backup run for a Hatchbox database. Only for unmanaged databases with backups enabled " +
        "(managed databases should be backed up via their hosting provider instead). Fails with a 409 if a backup is " +
        "already running. Asynchronous — returns a log id, follow up with hatchbox_get_log.",
      inputSchema: databaseIdSchema,
      annotations: WRITE,
    },
    async ({ database_id }) => runAction(async () => jsonResult(await client.post(`/databases/${database_id}/backups`))),
  );

  server.registerTool(
    "hatchbox_get_latest_backup",
    {
      title: "Get Latest Database Backup",
      description:
        "Get a presigned download URL for the most recent completed backup of a Hatchbox database. Only works when " +
        "the backup provider is S3/S3-compatible.",
      inputSchema: databaseIdSchema,
      annotations: READ_ONLY,
    },
    async ({ database_id }) =>
      runAction(async () => jsonResult(await client.get(`/databases/${database_id}/backups/latest`))),
  );
}
