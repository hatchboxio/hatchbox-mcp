import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HatchboxClient } from "../client.js";
import { createServer } from "../server.js";

describe("hatchbox_deploy_app", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let mcpClient: Client;

  beforeEach(async () => {
    fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 99 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const server = createServer(new HatchboxClient({ baseUrl: "https://example.invalid/api/v1", token: "t" }));
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    mcpClient = new Client({ name: "test-client", version: "0.0.1" });
    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);
  });

  afterEach(async () => {
    await mcpClient.close();
    vi.unstubAllGlobals();
  });

  function sent() {
    const [url, init] = fetchMock.mock.calls[0];
    return { url: (url as URL).toString(), method: init.method, body: JSON.parse(init.body) };
  }

  it("deploys the branch's latest commit with an empty body", async () => {
    await mcpClient.callTool({ name: "hatchbox_deploy_app", arguments: { app_id: 7 } });

    expect(sent()).toEqual({ url: "https://example.invalid/api/v1/apps/7/deploy", method: "POST", body: {} });
  });

  it("sends rebuild with the sha", async () => {
    await mcpClient.callTool({ name: "hatchbox_deploy_app", arguments: { app_id: 7, sha: "abc123", rebuild: true } });

    expect(sent().body).toEqual({ sha: "abc123", rebuild: true });
  });

  it("leaves rebuild out when it's false", async () => {
    await mcpClient.callTool({ name: "hatchbox_deploy_app", arguments: { app_id: 7, rebuild: false } });

    expect(sent().body).toEqual({});
  });
});
