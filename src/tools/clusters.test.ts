import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HatchboxClient } from "../client.js";
import { createServer } from "../server.js";

describe("hatchbox_update_cluster", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let mcpClient: Client;

  beforeEach(async () => {
    fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 12 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const server = createServer(new HatchboxClient({ baseUrl: "https://example.invalid/api/v1", token: "t" }));
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    mcpClient = new Client({ name: "test-client", version: "0.0.1" });
    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function sent() {
    const [url, init] = fetchMock.mock.calls[0];
    return { url: (url as URL).toString(), method: init.method, body: JSON.parse(init.body) };
  }

  it("patches only the window fields it's given", async () => {
    await mcpClient.callTool({ name: "hatchbox_update_cluster", arguments: { cluster_id: 12, maintenance_hour: 4 } });

    expect(sent()).toEqual({
      url: "https://example.invalid/api/v1/clusters/12",
      method: "PATCH",
      body: { cluster: { maintenance_hour: 4 } },
    });
  });

  it("sends null to clear the window", async () => {
    await mcpClient.callTool({
      name: "hatchbox_update_cluster",
      arguments: { cluster_id: 12, maintenance_wday: null, maintenance_hour: null, maintenance_time_zone: null },
    });

    expect(sent().body).toEqual({
      cluster: { maintenance_wday: null, maintenance_hour: null, maintenance_time_zone: null },
    });
  });

  it("rejects a day outside 0 to 6 without calling the API", async () => {
    const result = await mcpClient.callTool({
      name: "hatchbox_update_cluster",
      arguments: { cluster_id: 12, maintenance_wday: 7, maintenance_hour: 3, maintenance_time_zone: "Etc/UTC" },
    });

    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
