#!/usr/bin/env node
// Runs the remote MCP server. Configured entirely by environment variables:
//
//   HATCHBOX_OAUTH_CLIENT_ID / HATCHBOX_OAUTH_CLIENT_SECRET (required)
//     A confidential OAuth application created in the Hatchbox admin, used to introspect tokens.
//   MCP_SERVER_URL   This server's public MCP endpoint (default https://mcp.hatchbox.io/mcp)
//   HATCHBOX_URL     The Hatchbox app that signs users in (default https://hatchbox.io)
//   HATCHBOX_BASE_URL  The API the tools call (default $HATCHBOX_URL/api/v1)
//   PORT             (default 3000)

import { IntrospectionVerifier } from "./auth.js";
import { createHttpApp } from "./http.js";

function main() {
  const clientId = process.env.HATCHBOX_OAUTH_CLIENT_ID;
  const clientSecret = process.env.HATCHBOX_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error(
      "HATCHBOX_OAUTH_CLIENT_ID and HATCHBOX_OAUTH_CLIENT_SECRET must be set. Create a confidential OAuth application in the Hatchbox admin for this server.",
    );
    process.exit(1);
  }

  const issuer = (process.env.HATCHBOX_URL || "https://hatchbox.io").replace(/\/+$/, "");
  const app = createHttpApp({
    issuer,
    apiBaseUrl: process.env.HATCHBOX_BASE_URL || `${issuer}/api/v1`,
    resourceUrl: process.env.MCP_SERVER_URL || "https://mcp.hatchbox.io/mcp",
    verifier: new IntrospectionVerifier({ introspectionUrl: `${issuer}/oauth/introspect`, clientId, clientSecret }),
  });

  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, () => {
    console.log(`hatchbox-mcp listening on port ${port}`);
  });

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}

main();
