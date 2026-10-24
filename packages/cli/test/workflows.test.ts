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
      readonly "continue-on-error"?: string | boolean;
      readonly strategy?: { readonly matrix: Record<string, unknown> };
      readonly steps: readonly {
        readonly run?: string;
        readonly uses?: string;
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
});
