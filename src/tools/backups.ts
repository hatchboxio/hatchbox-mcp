import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, READ_ONLY, runAction, WRITE } from "./helpers.js";

const databaseIdSchema = {
  database_id: z.number().int().describe("Numeric database id (see hatchbox_list_app_databases)."),
};

const backupConfigWriteFields = {
  backup_provider: z
    .string()
    .describe(
      "Where to store backups. Valid values: local, s3, azureblob, r2, spaces, gcs, wasabi, other. " +
        "backup_region is required for s3/spaces/wasabi. backup_endpoint is required for other. local stores on " +
        "the server itself and needs no other backup_* fields.",
    )
    .optional(),
  backup_region: z.string().describe("Storage region. Required when backup_provider is s3, spaces, or wasabi.").optional(),
  backup_bucket: z.string().describe("Bucket/container name. Required for remote providers.").optional(),
  backup_access_key_id: z.string().describe("Access key id for the backup provider. Required for remote providers.").optional(),
  backup_secret_access_key: z
    .string()
    .describe(
      "Secret access key for the backup provider. Required for remote providers. Encrypted at rest — never echoed " +
        "back in responses.",
    )
    .optional(),
  backup_endpoint: z.string().describe("Custom S3-compatible endpoint URL. Required when backup_provider is other.").optional(),
  backup_frequency: z
    .string()
    .describe(
      "Cron expression for how often to back up, e.g. '0 0 * * *' (daily at midnight UTC). Must be a valid cron expression.",
    )
    .optional(),
  backup_retention_period: z
    .string()
    .describe("How long to keep backups, e.g. '30d', '6M', '1y' — a number followed by one of ms/s/m/h/d/w/M/y.")
    .optional(),
  appsignal_app_push_api_key: z
    .string()
    .describe("Wrap backup runs with AppSignal cron monitoring, using this app's push API key.")
    .optional(),
  honeybadger_checkin_id: z.string().describe("Wrap backup runs with a Honeybadger check-in, using this check-in id.").optional(),
};

const BACKUP_CONFIG_WRITE_KEYS = Object.keys(backupConfigWriteFields) as (keyof typeof backupConfigWriteFields)[];

function backupConfigParams(args: Record<string, unknown>): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const key of BACKUP_CONFIG_WRITE_KEYS) {
    if (args[key] !== undefined) config[key] = args[key];
  }
  return config;
}

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

  server.registerTool(
    "hatchbox_test_backup_connection",
    {
      title: "Test Database Backup Connection",
      description:
        "Test the configured remote backup connection for a Hatchbox database. Fails with a 422 for local backups " +
        "(nothing remote to test) or if backups aren't enabled. Asynchronous — returns a log id, follow up with " +
        "hatchbox_get_log.",
      inputSchema: databaseIdSchema,
      annotations: WRITE,
    },
    async ({ database_id }) =>
      runAction(async () => jsonResult(await client.post(`/databases/${database_id}/backups/test_connection`))),
  );

  server.registerTool(
    "hatchbox_get_backup_configuration",
    {
      title: "Get Database Backup Configuration",
      description:
        "Fetch the backup configuration for a Hatchbox database. Credentials (access key/secret, AppSignal push " +
        "key) are reported only as booleans (whether one is set on file) — never echoed back in plaintext.",
      inputSchema: databaseIdSchema,
      annotations: READ_ONLY,
    },
    async ({ database_id }) =>
      runAction(async () => jsonResult(await client.get(`/databases/${database_id}/backup_configuration`))),
  );

  server.registerTool(
    "hatchbox_update_backup_configuration",
    {
      title: "Update Database Backup Configuration",
      description:
        "Configure and enable backups for a Hatchbox database. Only the fields you pass are changed; any update " +
        "implicitly enables backups. Not available for managed databases (back those up via their hosting provider " +
        "instead). Asynchronous apply — returns a log id, follow up with hatchbox_get_log.",
      inputSchema: { ...databaseIdSchema, ...backupConfigWriteFields },
      annotations: WRITE,
    },
    async (args) =>
      runAction(async () => {
        const { database_id } = args;
        return jsonResult(
          await client.patch(`/databases/${database_id}/backup_configuration`, {
            backup_configuration: backupConfigParams(args),
          }),
        );
      }),
  );

  server.registerTool(
    "hatchbox_disable_backups",
    {
      title: "Disable Database Backups",
      description:
        "Disable backups for a Hatchbox database and clear its stored backup configuration/credentials. A no-op if " +
        "backups are already disabled. Asynchronous apply — returns a log id when it actually changes state.",
      inputSchema: databaseIdSchema,
      annotations: WRITE,
    },
    async ({ database_id }) =>
      runAction(async () => jsonResult(await client.delete(`/databases/${database_id}/backup_configuration`))),
  );
}
