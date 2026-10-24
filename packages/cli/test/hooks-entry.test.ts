// SPDX-License-Identifier: Apache-2.0
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runHook } from "../src/enforce/entry";
import { APP, cli, git, NOW, tempRepo, testEnv, writeFiles } from "./support";

/** `runHook` as `main` calls it, collecting what it prints. */
async function hook(cwd: string, argv: readonly string[], stdin = "") {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runHook(argv, {
    cwd,
    env: testEnv(),
    now: () => NOW,
    io: { out: (text) => out.push(text), err: (text) => err.push(text) },
    stdin: async () => stdin,
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

const write = (root: string) =>
  JSON.stringify({ cwd: root, tool_name: "Write", tool_input: { file_path: "src/app.ts" } });

describe("the hooks' own entry", () => {
  it("answers the guard as the full CLI does, in both forms of `--tool` (AC2)", async () => {
    const root = await tempRepo(APP);
    const full = await cli(root, ["guard", "--tool", "claude-code"], { stdin: write(root) });
    expect(full.code).toBe(2);
    for (const argv of [
      ["guard", "--tool", "claude-code"],
      ["guard", "--tool=claude-code"],
    ]) {
      expect(await hook(root, argv, write(root))).toEqual(full);
    }
    const cursor = await hook(root, ["guard", "--tool", "cursor"], write(root));
    expect(JSON.parse(cursor.out).permission).toBe("deny");
  });

  it("answers git's hooks as the full CLI does, and lets git go on outside Specty (AC2)", async () => {
    const root = await tempRepo(APP);
    await writeFiles(root, { "src/app.ts": "changed\n" });
    git(root, "add", "src/app.ts");
    const full = await cli(root, ["hook", "pre-commit"]);
    expect(full.code).toBe(1);
    expect(await hook(root, ["hook", "pre-commit"])).toEqual(full);
    const plain = await mkdtemp(join(tmpdir(), "specty-plain-"));
    expect(await hook(plain, ["hook", "pre-commit"])).toEqual({ code: 0, out: "", err: "" });
    expect((await hook(root, ["hook", "post-merge"])).code).toBe(0);
  });

  it("leaves any other form to the full CLI (AC3)", async () => {
    const root = await tempRepo(APP);
    for (const argv of [
      ["guard"],
      ["guard", "--tool"],
      ["guard", "--tool", "vim"],
      ["guard", "--tool", "claude-code", "--json"],
      ["hook"],
      ["hook", "--help"],
      ["next"],
    ]) {
      expect(await hook(root, argv), argv.join(" ")).toEqual({ code: undefined, out: "", err: "" });
    }
  });
});
