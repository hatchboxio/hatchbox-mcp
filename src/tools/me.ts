import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HatchboxClient } from "../client.js";
import { jsonResult, READ_ONLY, runAction } from "./helpers.js";

export function registerMeTools(server: McpServer, client: HatchboxClient) {
  server.registerTool(
    "hatchbox_get_me",
    {
      title: "Get Current Hatchbox User",
      description:
        "Fetch the Hatchbox user identified by the configured HATCHBOX_API_TOKEN. Useful as a connectivity/auth check " +
        "before calling other hatchbox_* tools. No parameters.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => runAction(async () => jsonResult(await client.get("/me"))),
  );
}
