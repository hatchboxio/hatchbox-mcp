import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeAll, describe, expect, it } from "vitest";
import { HatchboxClient } from "./client.js";
import { createServer } from "./server.js";

const SKILLS_DIR = fileURLToPath(new URL("../skills/", import.meta.url));

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

describe("skill tool references", () => {
  let registered: Set<string>;

  beforeAll(async () => {
    const client = new HatchboxClient({ baseUrl: "https://example.invalid", token: "test" });
    const server = createServer(client);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client({ name: "test-client", version: "0.0.1" });
    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);
    const { tools } = await mcpClient.listTools();
    registered = new Set(tools.map((t) => t.name));
  });

  it("finds skill markdown to check", () => {
    expect(markdownFiles(SKILLS_DIR).length).toBeGreaterThan(0);
  });

  it("keeps a Phase 2 completeness gate with its invariants intact", () => {
    const skill = readFileSync(join(SKILLS_DIR, "migrate-from-heroku/SKILL.md"), "utf8");
    const gate = skill.split("### Completeness gate")[1];
    expect(gate, "SKILL.md has lost its Phase 2 completeness gate").toBeDefined();

    const invariants = (gate.split("Stop here")[0].match(/^- \[ \] /gm) ?? []).length;
    expect(invariants, "the completeness gate should list every silent-emptiness trap").toBeGreaterThanOrEqual(7);
  });

  it("keeps the Phase 6 reconciliation gate intact", () => {
    const skill = readFileSync(join(SKILLS_DIR, "migrate-from-heroku/SKILL.md"), "utf8");
    const gate = skill.split("### Reconciliation gate")[1];
    expect(gate, "SKILL.md has lost its reconciliation gate").toBeDefined();

    const invariants = (gate.split("## Phase 7")[0].match(/^- \[ \] /gm) ?? []).length;
    expect(invariants, "the reconciliation gate should list every process outcome").toBeGreaterThanOrEqual(5);

    expect(gate, "the create pass is the one that gets skipped; the gate must name it").toMatch(/created/);
  });

  it("names only tools the server registers", () => {
    for (const file of markdownFiles(SKILLS_DIR)) {
      const referenced = new Set(readFileSync(file, "utf8").match(/hatchbox_[a-z_]+/g) ?? []);
      for (const name of referenced) {
        expect(registered.has(name), `${file} references unknown tool ${name}`).toBe(true);
      }
    }
  });
});
