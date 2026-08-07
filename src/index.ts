#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { clientFromEnv } from "./client.js";
import { registerAccountsTools } from "./tools/accounts.js";
import { registerMeTools } from "./tools/me.js";
import { registerAppsTools } from "./tools/apps.js";
import { registerDomainsTools } from "./tools/domains.js";
import { registerEnvVarsTools } from "./tools/envVars.js";
import { registerProcessesTools } from "./tools/processes.js";
import { registerDatabasesTools } from "./tools/databases.js";
import { registerClustersTools } from "./tools/clusters.js";
import { registerServersTools } from "./tools/servers.js";
import { registerBackupsTools } from "./tools/backups.js";
import { registerLogsTools } from "./tools/logs.js";

async function main() {
  const client = clientFromEnv();

  const server = new McpServer({
    name: "hatchbox-mcp",
    version: "0.1.0",
  });

  registerAccountsTools(server, client);
  registerMeTools(server, client);
  registerAppsTools(server, client);
  registerDomainsTools(server, client);
  registerEnvVarsTools(server, client);
  registerProcessesTools(server, client);
  registerDatabasesTools(server, client);
  registerClustersTools(server, client);
  registerServersTools(server, client);
  registerBackupsTools(server, client);
  registerLogsTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("hatchbox-mcp failed to start:", err);
  process.exit(1);
});
