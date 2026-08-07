import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, runAction } from "./helpers.js";

export function registerMeTool(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_me",
    {
      title: "Hatchbox Current User",
      description:
        "Fetch the Hatchbox user identified by the configured HATCHBOX_API_TOKEN. Useful as a connectivity/auth check " +
        "before calling other hatchbox_* tools. Read-only, no parameters.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => runAction(async () => jsonResult(await client.get("/me"))),
  );
}
