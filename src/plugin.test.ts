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
    expect(server.args.some((a: string) => a.startsWith(pkg.name))).toBe(true);
  });

  // Unpinned, `npx -y @hatchbox/hatchbox-mcp` serves whatever npx has cached rather than the
  // latest release -- observed holding 0.7.0 hours after 0.8.0 was published. That gives version
  // skew without giving freshness: the skill ships in the plugin, the server comes from npm, and
  // nothing made them agree at runtime. Pinning means plugin 0.8.0 runs server 0.8.0, which is
  // also what extends the skills drift guarantee past build time.
  it("pins the server to the exact package version, so the two cannot drift", () => {
    const args: string[] = plugin.mcpServers.hatchbox.args;
    const spec = args.find((a) => a.startsWith(pkg.name));
    expect(spec).toBe(`${pkg.name}@${pkg.version}`);
  });

  it("passes the API token through from the environment", () => {
    expect(plugin.mcpServers.hatchbox.env.HATCHBOX_API_TOKEN).toBe("${HATCHBOX_API_TOKEN}");
  });

  it("stays version-locked to the npm package", () => {
    expect(plugin.version).toBe(pkg.version);
  });

  // The version lived in three places and the test only covered two, so src/server.ts sat at
  // 0.7.0 while npm published 0.8.0 -- the server told every client the wrong version of itself.
  // Reading it from package.json removes the third copy rather than adding a third thing to
  // remember; this test just proves the copy is gone.
  it("reports the package version over MCP, not a hardcoded copy", async () => {
    const src = readFileSync(root + "src/server.ts", "utf8");
    expect(src).not.toMatch(/version:\s*"\d+\.\d+\.\d+"/);

    const { createServer } = await import("./server.js");
    const { HatchboxClient } = await import("./client.js");
    const server = createServer(new HatchboxClient({ baseUrl: "https://example.com", token: "t" }));
    expect((server.server as any)._serverInfo.version).toBe(pkg.version);
  });

  it("is listed in the marketplace manifest", () => {
    const marketplace = readJson(".claude-plugin/marketplace.json");
    expect(marketplace.plugins.map((p: { name: string }) => p.name)).toContain(plugin.name);
  });
});
