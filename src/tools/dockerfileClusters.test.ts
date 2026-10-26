import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HatchboxClient } from "../client.js";
import { createServer } from "../server.js";

// What the Dockerfile cluster tools send: the paths, and container settings nested the way the API merges them
describe("Dockerfile cluster tools", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let mcp: Client;

  beforeEach(async () => {
    fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const server = createServer(new HatchboxClient({ baseUrl: "https://example.invalid", token: "test" }));
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    mcp = new Client({ name: "test-client", version: "0.0.1" });
    await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function lastRequest() {
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    return { method: init.method, path: new URL(url).pathname, body: init.body ? JSON.parse(init.body) : undefined };
  }

  it("nests a process's container limits, leaving out what wasn't passed", async () => {
    await mcp.callTool({ name: "hatchbox_update_process", arguments: { app_id: 1, process_id: 2, memory_mb: 512, cpus: 1.5 } });

    expect(lastRequest()).toEqual({ method: "PATCH", path: "/apps/1/processes/2", body: { process: { container: { memory_mb: 512, cpus: 1.5 } } } });
  });

  it("sends no container for a process update without container settings", async () => {
    await mcp.callTool({ name: "hatchbox_update_process", arguments: { app_id: 1, process_id: 2, start_command: "bin/jobs" } });

    expect(lastRequest().body).toEqual({ process: { start_command: "bin/jobs" } });
  });

  it("updates only the app container settings passed", async () => {
    await mcp.callTool({ name: "hatchbox_update_app_container", arguments: { app_id: 1, container_port: 8080, volumes: ["data:/data"] } });

    expect(lastRequest()).toEqual({ method: "PATCH", path: "/apps/1/container", body: { container: { container_port: 8080, volumes: ["data:/data"] } } });
  });

  it("creates an accessory from a preset and attaches and detaches it by app id", async () => {
    await mcp.callTool({ name: "hatchbox_create_accessory", arguments: { cluster_id: 3, name: "search", kind: "typesense" } });
    expect(lastRequest()).toEqual({ method: "POST", path: "/clusters/3/accessories", body: { accessory: { name: "search", kind: "typesense" } } });

    await mcp.callTool({ name: "hatchbox_attach_accessory", arguments: { cluster_id: 3, accessory_id: 4, app_id: 1, prefix: "SEARCH" } });
    expect(lastRequest()).toEqual({ method: "POST", path: "/clusters/3/accessories/4/attachment", body: { app_id: 1, prefix: "SEARCH" } });

    await mcp.callTool({ name: "hatchbox_detach_accessory", arguments: { cluster_id: 3, accessory_id: 4, app_id: 1 } });
    expect(lastRequest()).toEqual({ method: "DELETE", path: "/clusters/3/accessories/4/attachment", body: { app_id: 1 } });
  });
});
