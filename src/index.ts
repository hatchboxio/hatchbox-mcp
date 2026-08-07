#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { clientFromEnv } from "./client.js";
import { registerAccountsTool } from "./tools/accounts.js";
import { registerMeTool } from "./tools/me.js";
import { registerAppsTool } from "./tools/apps.js";
import { registerDomainsTool } from "./tools/domains.js";
import { registerEnvVarsTool } from "./tools/envVars.js";
import { registerProcessesTool } from "./tools/processes.js";
import { registerDatabasesTool } from "./tools/databases.js";
import { registerClustersTool } from "./tools/clusters.js";
import { registerServersTool } from "./tools/servers.js";
import { registerBackupsTool } from "./tools/backups.js";
import { registerLogsTool } from "./tools/logs.js";

async function main() {
  const client = clientFromEnv();

  const server = new McpServer({
    name: "hatchbox-mcp",
    version: "0.1.0",
  });

  registerAccountsTool(server, client);
  registerMeTool(server, client);
  registerAppsTool(server, client);
  registerDomainsTool(server, client);
  registerEnvVarsTool(server, client);
  registerProcessesTool(server, client);
  registerDatabasesTool(server, client);
  registerClustersTool(server, client);
  registerServersTool(server, client);
  registerBackupsTool(server, client);
  registerLogsTool(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("hatchbox-mcp failed to start:", err);
  process.exit(1);
});
