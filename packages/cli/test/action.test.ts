// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { ciTemplates } from "../src/check/ci";

/** The Action at the repository's root. */
const ACTION = join(import.meta.dirname, "..", "..", "..", "action.yml");

type Step = Readonly<Record<string, unknown>>;

/** The steps of the composite Action. */
async function steps(): Promise<Step[]> {
  const action: unknown = parse(await readFile(ACTION, "utf8"));
  const runs = typeof action === "object" && action !== null && "runs" in action ? action.runs : {};
  const list = typeof runs === "object" && runs !== null && "steps" in runs ? runs.steps : [];
  return Array.isArray(list)
    ? list.filter((step): step is Step => typeof step === "object" && step !== null)
    : [];
}

/** Runs the Action's `specty ci` step with bash, `npx` replaced by a script that prints its args. */
async function runStep(env: Readonly<Record<string, string>>) {
  const script = (await steps()).find((step) => step.name === "specty ci")?.run;
  expect(typeof script).toBe("string");
  const bin = await mkdtemp(join(tmpdir(), "specty-npx-"));
  await writeFile(
    join(bin, "npx"),
    '#!/bin/sh\necho "npx $*"\n[ -n "$NPX_EXIT" ] && exit "$NPX_EXIT"\nexit 0\n',
  );
  await chmod(join(bin, "npx"), 0o755);
  return spawnSync("bash", ["-c", String(script)], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`, ...env },
  });
}

describe("the GitHub Action", () => {
  it("AC3: runs `specty ci` with the version its tag names, or its input", async () => {
    const tagged = await runStep({ SPECTY_VERSION: "", ACTION_REF: "v0.3.1" });
    expect(tagged.status).toBe(0);
    expect(tagged.stdout.trim()).toBe("npx -y @baquia-dev/specty@0.3.1 ci");
    const pinned = await runStep({ SPECTY_VERSION: "1.2.3", ACTION_REF: "main" });
    expect(pinned.stdout.trim()).toBe("npx -y @baquia-dev/specty@1.2.3 ci");
  });

  it("AC3: fails asking for the version without one, and when `specty ci` fails", async () => {
    const untagged = await runStep({ SPECTY_VERSION: "", ACTION_REF: "main" });
    expect(untagged.status).not.toBe(0);
    expect(untagged.stdout).toContain("::error::");
    expect(untagged.stdout).toContain("version");
    const failing = await runStep({ SPECTY_VERSION: "1.2.3", ACTION_REF: "", NPX_EXIT: "1" });
    expect(failing.status).toBe(1);
  });

  it("AC3: prepares Node and reads the event only from the environment", async () => {
    const all = await steps();
    expect(all.some((step) => String(step.uses).startsWith("actions/setup-node@"))).toBe(true);
    const run = all.find((step) => step.name === "specty ci");
    // Expressions go through `env`, never into the script, so no input can inject a command.
    expect(String(run?.run)).not.toContain(`\${{`);
    expect(run?.env).toMatchObject({
      SPECTY_VERSION: `\${{ inputs.version }}`,
      ACTION_REF: `\${{ github.action_ref }}`,
    });
  });
});

describe("the CI template of `specty check --install`", () => {
  it("AC4: runs `specty ci` on pull requests, with the same exact version", () => {
    const [github] = ciTemplates({
      stack: undefined,
      version: "1.2.3",
      branch: "main",
      lang: "es",
    });
    expect(github?.text).toContain(
      [
        "      - name: specty ci",
        "        if: github.event_name == 'pull_request'",
        "        shell: bash",
        "        run: npx -y @baquia-dev/specty@1.2.3 ci",
      ].join("\n"),
    );
    expect(github?.text).toContain("npx -y @baquia-dev/specty@1.2.3 check --all --json");
  });
});
