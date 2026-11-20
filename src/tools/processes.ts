import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, READ_ONLY, runAction, textResult, WRITE } from "./helpers.js";

const appIdSchema = {
  app_id: z.number().int().describe("Numeric app id."),
};

const processIdSchema = {
  ...appIdSchema,
  process_id: z.number().int().describe("Numeric process id (see hatchbox_list_processes)."),
};

const PROCESS_NAME_REGEX = /^[\w-]+$/;

const processWriteFields = {
  name: z.string().regex(PROCESS_NAME_REGEX).describe("Process name, letters/numbers/underscore/hyphen only. Unique per app.").optional(),
  start_command: z.string().describe("Shell command that starts the process. Required on create.").optional(),
  stop_command: z.string().describe("Shell command that stops the process.").optional(),
  reload_command: z.string().describe("Shell command that reloads the process without a full restart.").optional(),
  restart_on_deploy: z.boolean().describe("Whether to restart this process automatically on every deploy. Defaults to true.").optional(),
  server_id: z
    .number()
    .int()
    .describe(
      "Pin this process to a specific server (see hatchbox_list_servers). Mutually exclusive with roles — set one " +
        "or the other, not both.",
    )
    .optional(),
  roles: z
    .array(z.string())
    .describe(
      "Run this process on every server in the cluster carrying any of these roles, instead of a single pinned " +
        "server. Mutually exclusive with server_id.",
    )
    .optional(),
  socket: z
    .boolean()
    .describe("Enable socket activation for this process. Only one process per app may have this set.")
    .optional(),
  systemd_type: z.enum(["simple", "oneshot"]).describe("Systemd service type. Defaults to 'simple'.").optional(),
  appsignal: z
    .boolean()
    .describe("Wrap the process with AppSignal monitoring. Requires the app to already have AppSignal connected.")
    .optional(),
  appsignal_options: z.string().describe("Extra CLI options passed to appsignal-wrap when appsignal is enabled.").optional(),
};

// Only apply on a Dockerfile cluster (cluster deploy_strategy "docker"), where each process is a container.
// Sent nested under `container` and merged server-side, so passing one leaves the others as they are.
const containerWriteFields = {
  stop_timeout: z
    .number()
    .int()
    .min(1)
    .max(600)
    .describe("Dockerfile clusters only. Seconds a container gets after SIGTERM before it's killed on a deploy or restart. Defaults to 30.")
    .optional(),
  memory_mb: z
    .number()
    .int()
    .min(64)
    .describe("Dockerfile clusters only. Memory limit per container in megabytes; one that runs out is killed and restarted.")
    .optional(),
  cpus: z
    .number()
    .positive()
    .describe("Dockerfile clusters only. CPU limit per container, like 0.5 or 2. Capped at the server's CPU count.")
    .optional(),
};

const PROCESS_WRITE_KEYS = Object.keys(processWriteFields) as (keyof typeof processWriteFields)[];
const CONTAINER_WRITE_KEYS = Object.keys(containerWriteFields) as (keyof typeof containerWriteFields)[];

function processParams(args: Record<string, unknown>): Record<string, unknown> {
  const process: Record<string, unknown> = {};
  for (const key of PROCESS_WRITE_KEYS) {
    if (args[key] !== undefined) process[key] = args[key];
  }

  const container: Record<string, unknown> = {};
  for (const key of CONTAINER_WRITE_KEYS) {
    if (args[key] !== undefined) container[key] = args[key];
  }
  if (Object.keys(container).length > 0) process.container = container;

  return process;
}

export function registerProcessesTools(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_list_processes",
    {
      title: "List App Processes",
      description: "List the individual processes (web/worker/cron) running under a Hatchbox app.",
      inputSchema: appIdSchema,
      annotations: READ_ONLY,
    },
    async ({ app_id }) => runAction(async () => jsonResult(await client.get(`/apps/${app_id}/processes`))),
  );

  server.registerTool(
    "hatchbox_get_process",
    {
      title: "Get App Process",
      description: "Fetch a single process running under a Hatchbox app.",
      inputSchema: processIdSchema,
      annotations: READ_ONLY,
    },
    async ({ app_id, process_id }) =>
      runAction(async () => jsonResult(await client.get(`/apps/${app_id}/processes/${process_id}`))),
  );

  server.registerTool(
    "hatchbox_create_process",
    {
      title: "Create App Process",
      description:
        "Create a new process (web/worker/cron) on a Hatchbox app. Requires name and start_command (on a Dockerfile " +
          "cluster start_command may be blank to run the image's own command). Set either " +
        "server_id or roles to control where it runs (not both) — omit both to leave it unscheduled. Asynchronous " +
        "— returns a log_id, follow up with hatchbox_get_log.",
      inputSchema: {
        ...appIdSchema,
        ...processWriteFields,
        ...containerWriteFields,
        name: z.string().regex(PROCESS_NAME_REGEX).describe("Process name, letters/numbers/underscore/hyphen only. Unique per app."),
        start_command: z.string().describe("Shell command that starts the process."),
      },
      annotations: WRITE,
    },
    async (args) =>
      runAction(async () => {
        const { app_id } = args;
        return jsonResult(await client.post(`/apps/${app_id}/processes`, { process: processParams(args) }));
      }),
  );

  server.registerTool(
    "hatchbox_update_process",
    {
      title: "Update App Process",
      description: "Update a process on a Hatchbox app. Only the fields you pass are changed. Asynchronous — returns a log_id, follow up with hatchbox_get_log.",
      inputSchema: { ...processIdSchema, ...processWriteFields, ...containerWriteFields },
      annotations: WRITE,
    },
    async (args) =>
      runAction(async () => {
        const { app_id, process_id } = args;
        return jsonResult(await client.patch(`/apps/${app_id}/processes/${process_id}`, { process: processParams(args) }));
      }),
  );

  server.registerTool(
    "hatchbox_delete_process",
    {
      title: "Delete App Process",
      description:
        "Delete a process from a Hatchbox app. Asynchronous — returns an id (the log id, not named log_id for this " +
        "endpoint), follow up with hatchbox_get_log.",
      inputSchema: processIdSchema,
      annotations: WRITE,
    },
    async ({ app_id, process_id }) =>
      runAction(async () => jsonResult(await client.delete(`/apps/${app_id}/processes/${process_id}`))),
  );

  server.registerTool(
    "hatchbox_enable_process",
    {
      title: "Enable App Process",
      description:
        "Enable a disabled process on a Hatchbox app. A no-op if already enabled (no log_id is returned in that " +
        "case). Otherwise asynchronous — returns a log_id, follow up with hatchbox_get_log.",
      inputSchema: processIdSchema,
      annotations: WRITE,
    },
    async ({ app_id, process_id }) =>
      runAction(async () => jsonResult(await client.post(`/apps/${app_id}/processes/${process_id}/activation`))),
  );

  server.registerTool(
    "hatchbox_disable_process",
    {
      title: "Disable App Process",
      description:
        "Disable a process on a Hatchbox app. A no-op if already disabled (no log_id is returned in that case). " +
        "Otherwise asynchronous — returns a log_id, follow up with hatchbox_get_log.",
      inputSchema: processIdSchema,
      annotations: WRITE,
    },
    async ({ app_id, process_id }) =>
      runAction(async () => jsonResult(await client.delete(`/apps/${app_id}/processes/${process_id}/activation`))),
  );

  server.registerTool(
    "hatchbox_restart_process",
    {
      title: "Restart App Process",
      description:
        "Restart a single process on a Hatchbox app. To restart every process on an app at once, use " +
        "hatchbox_restart_app instead.",
      inputSchema: processIdSchema,
      annotations: WRITE,
    },
    async ({ app_id, process_id }) =>
      runAction(async () => {
        await client.post(`/apps/${app_id}/processes/${process_id}/restart`);
        return textResult(`Restarting process ${process_id} on app ${app_id}.`);
      }),
  );
}
