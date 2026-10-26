// SPDX-License-Identifier: Apache-2.0
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/** The parts of a GitHub Actions workflow these tests read. */
interface Workflow {
  readonly on: Record<
    string,
    { readonly branches?: readonly string[]; readonly tags?: readonly string[] } | null
  >;
  readonly permissions?: Record<string, string>;
  readonly jobs: Record<
    string,
    {
      readonly if?: string;
      readonly "continue-on-error"?: string | boolean;
      readonly strategy?: { readonly matrix: Record<string, unknown> };
      readonly steps: readonly {
        readonly run?: string;
        readonly uses?: string;
        readonly with?: Record<string, unknown>;
        readonly "working-directory"?: string;
      }[];
    }
  >;
}

const workflow = async (name: string): Promise<Workflow> =>
  parse(
    await readFile(
      join(import.meta.dirname, "..", "..", "..", ".github", "workflows", name),
      "utf8",
    ),
  );

const runs = (steps: Workflow["jobs"][string]["steps"]) => steps.flatMap((step) => step.run ?? []);

describe("the CI", () => {
  it("runs pnpm check on Linux, macOS and Windows with Node 22, and with Node 24 on Linux (AC1, AC3)", async () => {
    const ci = await workflow("ci.yml");
    expect(ci.on.push?.branches).toEqual(["main"]);
    expect(Object.keys(ci.on)).toContain("pull_request");
    const check = ci.jobs.check;
    expect(check?.strategy?.matrix).toMatchObject({
      os: ["ubuntu-latest", "macos-latest", "windows-latest"],
      node: [22],
      include: [{ os: "ubuntu-latest", node: 24 }],
    });
    expect(runs(check?.steps ?? [])).toEqual(
      expect.arrayContaining(["pnpm install --frozen-lockfile", "pnpm check"]),
    );
    // Only Windows may fail without blocking, until it passes once.
    expect(String(check?.["continue-on-error"])).toContain("matrix.os == 'windows-latest'");
  });

  it("runs the pull request's own specty check --changed against a local main (AC1)", async () => {
    const job = (await workflow("ci.yml")).jobs["specty-check"];
    expect(job?.if).toBe("github.event_name == 'pull_request'");
    const steps = job?.steps ?? [];
    const checkout = steps.find((step) => step.uses?.startsWith("actions/checkout@"));
    expect(checkout?.with).toEqual({ "fetch-depth": 0 });
    const commands = runs(steps);
    const at = (text: string) => commands.findIndex((command) => command.includes(text));
    expect(at("git branch main origin/main")).toBeGreaterThanOrEqual(0);
    expect(at("pnpm --filter @baquia-dev/specty build")).toBeGreaterThan(
      at("pnpm install --frozen-lockfile"),
    );
    expect(at("node packages/cli/dist/specty.mjs check --changed")).toBeGreaterThan(
      at("pnpm --filter @baquia-dev/specty build"),
    );
  });
});

describe("the release", () => {
  it("publishes with provenance only from a tag that matches the version, after pnpm check (AC2, AC3)", async () => {
    const release = await workflow("release.yml");
    expect(release.on).toEqual({ push: { tags: ["v*"] } });
    expect(release.permissions).toEqual({ contents: "read", "id-token": "write" });
    const steps = release.jobs.publish?.steps ?? [];
    const commands = runs(steps);
    const at = (text: string) => commands.findIndex((command) => command.includes(text));
    expect(at('= "$GITHUB_REF_NAME"')).toBeGreaterThan(at("pnpm install --frozen-lockfile"));
    expect(at("pnpm check")).toBeGreaterThan(at('= "$GITHUB_REF_NAME"'));
    expect(at("npm publish --provenance --access public")).toBeGreaterThan(at("pnpm check"));
    const publish = steps.find((step) => step.run?.startsWith("npm publish"));
    expect(publish?.["working-directory"]).toBe("packages/cli");
    const pkg = JSON.parse(await readFile(join(import.meta.dirname, "..", "package.json"), "utf8"));
    expect(pkg.private).toBeUndefined();
    expect(pkg.publishConfig).toEqual({ access: "public", provenance: true });
    // npm 11 drops a `bin` written as `./dist/…` when it publishes, and the package loses `specty`.
    expect(pkg.bin).toEqual({ specty: "dist/specty.mjs" });
  });
});
