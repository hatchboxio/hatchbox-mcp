import { createServer as createNodeServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { TokenVerifier, VerifiedToken } from "./auth.js";
import { createHttpApp } from "./http.js";

const tokens: Record<string, Omit<VerifiedToken, "token">> = {
  good: { scopes: [], subject: "user_1", audience: "https://mcp.example.test/mcp", expiresAt: 4_000_000_000 },
  personal: { scopes: [], subject: "user_1" },
  elsewhere: { scopes: [], subject: "user_1", audience: "https://other.example.test" },
};

let verifierError: Error | undefined;
const verifier: TokenVerifier = {
  async verify(token) {
    if (verifierError) throw verifierError;
    return tokens[token] ? { token, ...tokens[token] } : null;
  },
};

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

describe("remote MCP server", () => {
  let api: Server;
  let apiRequests: IncomingMessage[];
  let mcp: Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Stands in for the Hatchbox API
    api = createNodeServer((req, res) => {
      apiRequests.push(req);
      if (req.headers.authorization === "Bearer revoked") {
        res.writeHead(401).end();
      } else {
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ id: 1, email: "one@example.com" }));
      }
    });
    const apiUrl = await listen(api);

    const app = createHttpApp({
      apiBaseUrl: `${apiUrl}/api/v1`,
      issuer: "https://hatchbox.example.test",
      resourceUrl: "https://mcp.example.test/mcp",
      verifier,
    });
    mcp = createNodeServer(app);
    baseUrl = await listen(mcp);
  });

  afterAll(() => {
    api.close();
    mcp.close();
  });

  beforeEach(() => {
    apiRequests = [];
    verifierError = undefined;
  });

  async function connect(token: string) {
    const client = new Client({ name: "test-client", version: "0.0.1" });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    await client.connect(transport);
    return client;
  }

  const initialize = (headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }),
    });

  it("asks clients without a token to sign in", async () => {
    const response = await initialize();
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://mcp.example.test/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it("rejects unknown tokens as invalid", async () => {
    const response = await initialize({ Authorization: "Bearer unknown" });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("rejects tokens issued for another resource", async () => {
    const response = await initialize({ Authorization: "Bearer elsewhere" });
    expect(response.status).toBe(401);
  });

  it("answers 503 when tokens can't be checked", async () => {
    verifierError = new Error("Hatchbox is down");
    const response = await initialize({ Authorization: "Bearer good" });
    expect(response.status).toBe(503);
  });

  it("publishes protected resource metadata naming Hatchbox", async () => {
    for (const path of ["/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource"]) {
      const response = await fetch(`${baseUrl}${path}`);
      expect(response.status).toBe(200);
      const metadata = await response.json();
      expect(metadata.resource).toBe("https://mcp.example.test/mcp");
      expect(metadata.authorization_servers).toEqual(["https://hatchbox.example.test"]);
    }
  });

  it("lists tools for a signed in client", async () => {
    const client = await connect("good");
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("hatchbox_get_me");
    await client.close();
  });

  it("forwards the client's token to the Hatchbox API", async () => {
    const client = await connect("personal");
    const result = await client.callTool({ name: "hatchbox_get_me", arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(apiRequests.map((r) => [r.url, r.headers.authorization])).toEqual([["/api/v1/me", "Bearer personal"]]);
    await client.close();
  });

  it("tells the user to sign in again when the API rejects the token", async () => {
    tokens.revoked = { scopes: [], subject: "user_1" };
    const client = await connect("revoked");
    const result = await client.callTool({ name: "hatchbox_get_me", arguments: {} });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("Reconnect the Hatchbox MCP server");
    await client.close();
    delete tokens.revoked;
  });

  it("refuses GET, since there are no sessions to stream", async () => {
    const response = await fetch(`${baseUrl}/mcp`, { headers: { Authorization: "Bearer good", Accept: "text/event-stream" } });
    expect(response.status).toBe(405);
  });

  it("allows cross-origin requests", async () => {
    const response = await fetch(`${baseUrl}/mcp`, { method: "OPTIONS", headers: { Origin: "https://claude.ai" } });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-headers")).toContain("Authorization");
    expect(response.headers.get("access-control-expose-headers")).toContain("WWW-Authenticate");
  });

  it("answers health checks", async () => {
    const response = await fetch(`${baseUrl}/up`);
    expect(response.status).toBe(200);
  });
});
