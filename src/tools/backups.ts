import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, missingFields, runAction } from "./helpers.js";

const inputSchema = {
  action: z
    .enum(["create", "latest"])
    .describe(
      "create: trigger a new backup run (async, returns a log id — poll with hatchbox_logs). " +
        "latest: get a presigned download URL for the most recent completed backup. Both require database_id.",
    ),
  database_id: z.number().int().describe("Numeric database id (see hatchbox_databases). Required.").optional(),
};

export function registerBackupsTool(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_backups",
    {
      title: "Hatchbox Database Backups",
      description:
        "Trigger and download backups for a Hatchbox database. Only for unmanaged databases with backups enabled " +
        "(managed databases should be backed up via their hosting provider instead); create fails with a 409 if a " +
        "backup is already running, and latest only works when the backup provider is S3/S3-compatible.",
      inputSchema,
      annotations: { openWorldHint: true },
    },
    async (args) =>
      runAction(async () => {
        const { action, database_id } = args;
        const err = missingFields(args, ["database_id"], action);
        if (err) return err;
        switch (action) {
          case "create":
            return jsonResult(await client.post(`/databases/${database_id}/backups`));
          case "latest":
            return jsonResult(await client.get(`/databases/${database_id}/backups/latest`));
        }
      }),
  );
}
