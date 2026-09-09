import { readFileSync } from "node:fs";
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
import { registerFirewallRulesTools } from "./tools/firewallRules.js";

// Read from package.json rather than repeating the number here. npm always ships package.json
// regardless of the `files` allowlist, so this resolves in the published package too.
const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

export function createServer(client: HatchboxClient): McpServer {
  const server = new McpServer({
    name: "hatchbox-mcp",
    version,
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
  registerFirewallRulesTools(server, client);

  return server;
}
