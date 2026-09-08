import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const here = fileURLToPath(new URL("./", import.meta.url));
const script = join(here, "../scripts/heroku_inventory.sh");
const fakeBin = join(here, "fixtures/bin");
const appDir = join(here, "fixtures/app");

describe("heroku_inventory.sh", () => {
  let inventory: any;

  beforeAll(() => {
    const out = join(mkdtempSync(join(tmpdir(), "hb-inv-")), "inventory.json");
    execFileSync("bash", [script, "demo"], {
      cwd: appDir,
      env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, HATCHBOX_INVENTORY_OUT: out },
    });
    inventory = JSON.parse(readFileSync(out, "utf8"));
  });

  it("records the app identity and stack", () => {
    expect(inventory.app.name).toBe("demo");
    expect(inventory.app.stack.name).toBe("heroku-22");
    expect(inventory.app.region.name).toBe("us");
  });

  it("captures config vars verbatim", () => {
    expect(inventory.config.SECRET_KEY_BASE).toBe("abc");
    expect(inventory.config.PORT).toBe("5000");
  });

  it("captures add-ons and the dyno formation", () => {
    expect(inventory.addons.map((a: any) => a.addon_service.name)).toContain("heroku-redis");
    const web = inventory.formation.find((f: any) => f.type === "web");
    expect(web.quantity).toBe(2);
    expect(web.size).toBe("standard-1x");
  });

  // The formation and app record were silently null on the first live run because the
  // script called `heroku api`, which is not a CLI command, and the fixture implemented
  // the invented command faithfully. Assert the fields are populated, and that anything
  // that DID fall back is named rather than passing as an empty result.
  it("populates every field it does not report as uncollected", () => {
    expect(inventory.uncollected).toEqual([]);
    expect(inventory.app).not.toBeNull();
    expect(inventory.formation).not.toBeNull();
    expect(inventory.formation.length).toBeGreaterThan(0);
  });

  it("keeps non-JSON heroku output as raw text", () => {
    expect(inventory.buildpacks).toContain("heroku/ruby");
    expect(inventory.pg_info).toContain("PG Version");
  });

  it("reads the local Procfile, config files and Gemfile.lock", () => {
    expect(inventory.local.procfile).toContain("clock:");
    expect(inventory.local.puma_config).toContain("workers");
    expect(inventory.local.bin_scripts).toContain("rails");
    expect(inventory.local.app_json).toBe("");
    expect(inventory.local.profile).toContain("EXPORT_ARCHIVE_ROOT");
    expect(inventory.local.package_json).toContain("heroku-postbuild");
    // The grep finds files that name .profile.d directly. package.json does NOT appear:
    // heroku-postbuild only points at bin/stamp-runtime-env, which is the actual writer.
    expect(inventory.local.profile_d_writers).toContain("Rakefile");
    expect(inventory.local.profile_d_writers).toContain("bin/stamp-runtime-env");
    expect(inventory.local.profile_d_writers).not.toContain("package.json");
    expect(inventory.local.ruby_version).toBe("3.3.4");
    expect(inventory.local.gems).toEqual({ puma: true, sidekiq: true, solid_queue: false, rails_12factor: false });
  });

  it("exits 64 when no app name is given", () => {
    try {
      execFileSync("bash", [script], { cwd: appDir, stdio: "pipe" });
      throw new Error("expected a non-zero exit");
    } catch (err: any) {
      expect(err.status).toBe(64);
      expect(err.stderr.toString()).toContain("usage");
    }
  });
});
