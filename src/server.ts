import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "./client.js";
import { registerAccountsTools } from "./tools/accounts.js";
import { registerMeTools } from "./tools/me.js";
import { registerAppsTools } from "./tools/apps.js";
import { registerDomainsTools } from "./tools/domains.js";
import { registerEnvVarsTools } from "./tools/envVars.js";
import { registerProcessesTools } from "./tools/processes.js";
import { registerCronJobsTools } from "./tools/cronJobs.js";
import { registerDatabasesTools } from "./tools/databases.js";
import { registerClustersTools } from "./tools/clusters.js";
import { registerServersTools } from "./tools/servers.js";
import { registerBackupsTools } from "./tools/backups.js";
import { registerLogsTools } from "./tools/logs.js";

export function createServer(client: HatchboxClient): McpServer {
  const server = new McpServer({
    name: "hatchbox-mcp",
    version: "0.2.0",
  });

  registerAccountsTools(server, client);
  registerMeTools(server, client);
  registerAppsTools(server, client);
  registerDomainsTools(server, client);
  registerEnvVarsTools(server, client);
  registerProcessesTools(server, client);
  registerCronJobsTools(server, client);
  registerDatabasesTools(server, client);
  registerClustersTools(server, client);
  registerServersTools(server, client);
  registerBackupsTools(server, client);
  registerLogsTools(server, client);

  return server;
}
