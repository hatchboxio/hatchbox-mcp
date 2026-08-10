import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, READ_ONLY, runAction, textResult, WRITE } from "./helpers.js";

const appIdSchema = {
  app_id: z.number().int().describe("Numeric app id."),
};

const cronJobIdSchema = {
  ...appIdSchema,
  cron_job_id: z.number().int().describe("Numeric cron job id (see hatchbox_list_cron_jobs)."),
};

const cronJobWriteFields = {
  name: z.string().describe("Cron job name.").optional(),
  run_at: z
    .string()
    .describe("Cron expression for when to run, e.g. '0 0 * * *' (daily at midnight UTC). Must be a valid cron expression.")
    .optional(),
  command: z.string().describe("Shell command to run, executed from the app's current release directory.").optional(),
  appsignal: z
    .boolean()
    .describe(
      "Wrap the command with AppSignal cron monitoring. Requires AppSignal to already be connected to the app — " +
        "fails with a 422 otherwise.",
    )
    .optional(),
  honeybadger_checkin_id: z
    .string()
    .describe("Wrap the command with a Honeybadger check-in, using this check-in id.")
    .optional(),
};

const CRON_JOB_WRITE_KEYS = Object.keys(cronJobWriteFields) as (keyof typeof cronJobWriteFields)[];

function cronJobParams(args: Record<string, unknown>): Record<string, unknown> {
  const cronJob: Record<string, unknown> = {};
  for (const key of CRON_JOB_WRITE_KEYS) {
    if (args[key] !== undefined) cronJob[key] = args[key];
  }
  return cronJob;
}

const ASYNC_APPLY_NOTE =
  "Applied to the server asynchronously via a background job with no pollable status — unlike " +
  "hatchbox_restart_app/hatchbox_deploy_app, there's no log id to follow up on.";

export function registerCronJobsTools(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_list_cron_jobs",
    {
      title: "List App Cron Jobs",
      description: "List the cron jobs configured on a Hatchbox app.",
      inputSchema: appIdSchema,
      annotations: READ_ONLY,
    },
    async ({ app_id }) => runAction(async () => jsonResult(await client.get(`/apps/${app_id}/cron_jobs`))),
  );

  server.registerTool(
    "hatchbox_get_cron_job",
    {
      title: "Get App Cron Job",
      description: "Fetch a single cron job configured on a Hatchbox app.",
      inputSchema: cronJobIdSchema,
      annotations: READ_ONLY,
    },
    async ({ app_id, cron_job_id }) =>
      runAction(async () => jsonResult(await client.get(`/apps/${app_id}/cron_jobs/${cron_job_id}`))),
  );

  server.registerTool(
    "hatchbox_create_cron_job",
    {
      title: "Create App Cron Job",
      description:
        `Create a new cron job on a Hatchbox app. Fails with a 422 if the app's cluster has no active server with ` +
        `the cron role. ${ASYNC_APPLY_NOTE}`,
      inputSchema: {
        ...cronJobWriteFields,
        ...appIdSchema,
        name: z.string().describe("Cron job name."),
        run_at: z
          .string()
          .describe("Cron expression for when to run, e.g. '0 0 * * *' (daily at midnight UTC). Must be a valid cron expression."),
        command: z.string().describe("Shell command to run, executed from the app's current release directory."),
      },
      annotations: WRITE,
    },
    async (args) =>
      runAction(async () => {
        const { app_id } = args;
        return jsonResult(await client.post(`/apps/${app_id}/cron_jobs`, { cron_job: cronJobParams(args) }));
      }),
  );

  server.registerTool(
    "hatchbox_update_cron_job",
    {
      title: "Update App Cron Job",
      description:
        `Update a cron job on a Hatchbox app. Only the fields you pass are changed. Fails with a 422 if the app's ` +
        `cluster has no active server with the cron role. ${ASYNC_APPLY_NOTE}`,
      inputSchema: { ...cronJobIdSchema, ...cronJobWriteFields },
      annotations: WRITE,
    },
    async (args) =>
      runAction(async () => {
        const { app_id, cron_job_id } = args;
        return jsonResult(
          await client.patch(`/apps/${app_id}/cron_jobs/${cron_job_id}`, { cron_job: cronJobParams(args) }),
        );
      }),
  );

  server.registerTool(
    "hatchbox_delete_cron_job",
    {
      title: "Delete App Cron Job",
      description:
        `Delete a cron job from a Hatchbox app. Allowed even if the app's cluster has no active cron server. ${ASYNC_APPLY_NOTE}`,
      inputSchema: cronJobIdSchema,
      annotations: WRITE,
    },
    async ({ app_id, cron_job_id }) =>
      runAction(async () => {
        await client.delete(`/apps/${app_id}/cron_jobs/${cron_job_id}`);
        return textResult(`Deleted cron job ${cron_job_id} from app ${app_id}.`);
      }),
  );
}
