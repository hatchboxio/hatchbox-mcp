import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = (path: string) => JSON.parse(readFileSync(root + path, "utf8"));

describe("plugin manifest", () => {
  const plugin = readJson(".claude-plugin/plugin.json");
  const pkg = readJson("package.json");

  it("registers the Hatchbox MCP server from the published package", () => {
    const server = plugin.mcpServers.hatchbox;
    expect(server.command).toBe("npx");
    expect(server.args).toContain(pkg.name);
  });

  it("passes the API token through from the environment", () => {
    expect(plugin.mcpServers.hatchbox.env.HATCHBOX_API_TOKEN).toBe("${HATCHBOX_API_TOKEN}");
  });

  it("stays version-locked to the npm package", () => {
    expect(plugin.version).toBe(pkg.version);
  });

  it("is listed in the marketplace manifest", () => {
    const marketplace = readJson(".claude-plugin/marketplace.json");
    expect(marketplace.plugins.map((p: { name: string }) => p.name)).toContain(plugin.name);
  });
});
