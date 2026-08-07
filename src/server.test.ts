import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeAll, describe, expect, it } from "vitest";
import { HatchboxClient } from "./client.js";
import { createServer } from "./server.js";

// Every tool below must satisfy Anthropic's Connectors Directory review rules:
// a title, exactly one of readOnlyHint/destructiveHint (never both, never
// neither — a tool must not mix safe and unsafe HTTP methods), and a name
// under the 64-character limit. See src/tools/helpers.ts for the shared
// READ_ONLY/WRITE annotation constants this enforces.
describe("registered tools", () => {
  let tools: Awaited<ReturnType<Client["listTools"]>>["tools"];

  beforeAll(async () => {
    const client = new HatchboxClient({ baseUrl: "https://example.invalid", token: "test" });
    const server = createServer(client);

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client({ name: "test-client", version: "0.0.1" });

    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);

    ({ tools } = await mcpClient.listTools());
  });

  it("registers at least one tool", () => {
    expect(tools.length).toBeGreaterThan(0);
  });

  it("gives every tool a title, name under 64 chars, and a description", () => {
    for (const tool of tools) {
      expect(tool.name.length, `${tool.name} exceeds 64 chars`).toBeLessThanOrEqual(64);
      expect(tool.title, `${tool.name} is missing a title`).toBeTruthy();
      expect(tool.description, `${tool.name} is missing a description`).toBeTruthy();
    }
  });

  it("marks every tool as exactly read-only or destructive, never both or neither", () => {
    for (const tool of tools) {
      const readOnly = tool.annotations?.readOnlyHint === true;
      const destructive = tool.annotations?.destructiveHint === true;
      expect(readOnly !== destructive, `${tool.name} must be exactly one of readOnlyHint/destructiveHint`).toBe(true);
    }
  });

  it("has no duplicate tool names", () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
