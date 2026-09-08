import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = join(fileURLToPath(new URL("./", import.meta.url)), "../scripts/pg_transfer.sh");

function run(args: string[]): string {
  return execFileSync("bash", [script, ...args], { encoding: "utf8" });
}

const ARGS = [
  "--heroku-app", "demo",
  "--ssh-host", "203.0.113.10",
  "--ssh-user", "deploy",
  "--database", "demo_production",
  "--db-uri", "postgresql://u:sekrit@10.0.0.1:5432/demo_production",
  "--dump-url", "https://example.invalid/dump.pgsql",
];

describe("pg_transfer.sh", () => {
  it("prints the capture, download and restore steps in order", () => {
    const out = run(ARGS);
    const capture = out.indexOf("heroku pg:backups:capture");
    const download = out.indexOf("curl");
    const restore = out.indexOf("pg_restore");
    expect(capture).toBeGreaterThan(-1);
    expect(download).toBeGreaterThan(capture);
    expect(restore).toBeGreaterThan(download);
  });

  it("fills in every value rather than leaving a placeholder", () => {
    const out = run(ARGS);
    expect(out).toContain("deploy@203.0.113.10");
    expect(out).toContain("demo_production");
    expect(out).not.toMatch(/<[a-z-]+>/);
  });

  it("marks the destructive steps and no others", () => {
    const lines = run(ARGS).split("\n").filter((l) => l.includes("DESTRUCTIVE"));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toMatch(/drop|--clean|dropdb/i);
  });

  it("uses --no-owner --no-acl so a Heroku-owned dump restores cleanly", () => {
    expect(run(ARGS)).toMatch(/pg_restore[^\n]*--no-owner[^\n]*--no-acl/);
  });

  it("never executes anything itself", () => {
    const out = run(ARGS);
    expect(out).toContain("Nothing above has been run");
  });

  it("connects with the database URI, not a bare local dbname", () => {
    const out = run(ARGS);
    expect(out).toMatch(/pg_restore[^\n]*--dbname="\$HB_DB_URI"/);
    expect(out, "psql must use the URI too — deploy has no local role").not.toMatch(/psql -d demo_production/);
  });

  it("never prints the password, in any command or instruction", () => {
    const out = run(ARGS);
    expect(out).not.toContain("sekrit");
    expect(out).toContain("HB_DB_URI");
  });

  it("exits 64 when a required argument is missing", () => {
    try {
      execFileSync("bash", [script, "--heroku-app", "demo"], { stdio: "pipe" });
      throw new Error("expected a non-zero exit");
    } catch (err: any) {
      expect(err.status).toBe(64);
      expect(err.stderr.toString()).toMatch(/required/);
    }
  });
});
