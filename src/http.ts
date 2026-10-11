// The remote MCP server: Streamable HTTP, with OAuth sign in through Hatchbox.
//
// Clients that call it without a token get a 401 pointing at this server's protected resource
// metadata (RFC 9728), which names Hatchbox as the authorization server. They sign the user in
// there, then send the access token here. Each request builds a server whose API client
// forwards that token to the Hatchbox API, so nothing is kept between requests and the API
// enforces the same access it does for every other client.

import express, { type NextFunction, type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { TokenVerifier, VerifiedToken } from "./auth.js";
import { HatchboxClient } from "./client.js";
import { createServer } from "./server.js";

export interface HttpAppConfig {
  /** The Hatchbox API, like https://hatchbox.io/api/v1 */
  apiBaseUrl: string;
  /** The authorization server, like https://hatchbox.io */
  issuer: string;
  /** This server's MCP endpoint, like https://mcp.hatchbox.io/mcp. Its path is where the app serves MCP. */
  resourceUrl: string;
  verifier: TokenVerifier;
}

const UNAUTHORIZED_MESSAGE =
  "Unauthorized — your Hatchbox sign in expired or was revoked. Reconnect the Hatchbox MCP server to sign in again.";

type AuthenticatedRequest = Request & { verifiedToken?: VerifiedToken };

export function createHttpApp(config: HttpAppConfig): express.Express {
  const resource = new URL(config.resourceUrl);
  const mcpPath = resource.pathname;
  const metadataPath = `/.well-known/oauth-protected-resource${mcpPath === "/" ? "" : mcpPath}`;
  const metadataUrl = new URL(metadataPath, resource).href;

  const app = express();
  app.disable("x-powered-by");
  // Hatchbox serves the app behind a proxy that terminates TLS
  app.set("trust proxy", true);

  app.use(allowCrossOriginRequests);

  app.get("/up", (_req, res) => {
    res.type("text/plain").send("OK");
  });

  const protectedResourceMetadata = {
    resource: resource.href,
    authorization_servers: [config.issuer],
    bearer_methods_supported: ["header"],
    resource_name: "Hatchbox",
    resource_documentation: "https://hatchbox.io/mcp",
  };
  // The path-specific document is the one RFC 9728 clients ask for. Some clients ask for the
  // root one, so it describes the same resource.
  for (const path of new Set([metadataPath, "/.well-known/oauth-protected-resource"])) {
    app.get(path, (_req, res) => {
      res.set("Cache-Control", "public, max-age=3600").json(protectedResourceMetadata);
    });
  }

  app.all(mcpPath, express.json({ limit: "1mb" }), requireBearerToken(config.verifier, metadataUrl, resource.href), handleMcpRequest(config));

  return app;
}

function allowCrossOriginRequests(req: Request, res: Response, next: NextFunction) {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
    "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version, WWW-Authenticate",
    "Access-Control-Max-Age": "86400",
  });
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

// RFC 6750 section 3: a request without a token gets a bare challenge, a bad token gets
// error="invalid_token". Both point at the resource metadata (RFC 9728 section 5.1).
function requireBearerToken(verifier: TokenVerifier, metadataUrl: string, resourceUrl: string) {
  const challenge = (error?: string) =>
    `Bearer resource_metadata="${metadataUrl}"` + (error ? `, error="${error}"` : "");

  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.authorization ?? "")?.[1];
    if (!token) {
      res.set("WWW-Authenticate", challenge()).status(401).json({ error: "invalid_token", error_description: "Sign in to Hatchbox to use this server" });
      return;
    }

    let verified: VerifiedToken | null;
    try {
      verified = await verifier.verify(token);
    } catch (err) {
      console.error("hatchbox-mcp: token verification failed:", err instanceof Error ? err.message : err);
      res.status(503).json({ error: "temporarily_unavailable", error_description: "Couldn't reach Hatchbox to check the token. Try again shortly." });
      return;
    }

    // A token issued for another resource isn't meant for this server (RFC 8707). Tokens
    // without an audience, including API tokens, are accepted.
    if (!verified || (verified.audience && !sameResource(verified.audience, resourceUrl))) {
      res.set("WWW-Authenticate", challenge("invalid_token")).status(401).json({ error: "invalid_token", error_description: "The token is invalid, expired, or for another server" });
      return;
    }

    req.verifiedToken = verified;
    next();
  };
}

function sameResource(a: string, b: string) {
  return a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
}

function handleMcpRequest(config: HttpAppConfig) {
  return async (req: AuthenticatedRequest, res: Response) => {
    // Stateless: there are no sessions to resume a stream for or to end
    if (req.method !== "POST") {
      res.set("Allow", "POST, OPTIONS").status(405).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed. This server is stateless, so send requests with POST." },
        id: null,
      });
      return;
    }

    const client = new HatchboxClient({
      baseUrl: config.apiBaseUrl,
      token: req.verifiedToken!.token,
      unauthorizedMessage: UNAUTHORIZED_MESSAGE,
    });
    const server = createServer(client);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("hatchbox-mcp: request failed:", err);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
      }
    }
  };
}
