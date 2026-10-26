// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { execute, MAX_OUTPUT } from "../src/io/exec";
import { createGit } from "../src/io/git";
import { tempRepo, writeFiles } from "./support";

/** Past the 512 KB a verification keeps: 700 lines of 1 KB. */
const BIG = `${"a".repeat(1023)}\n`.repeat(700);

describe("a command's output", () => {
  it("is whole for git, whatever its size", async () => {
    const root = await tempRepo({ "a.ts": "1;\n", "big.txt": BIG });
    const repo = createGit(root);
    expect(await repo.output(["show", "HEAD:big.txt"])).toBe(BIG.trimEnd());
    // A long diff keeps its first file: what reads it would miss that file.
    await writeFiles(root, { "a.ts": "eval(x);\n", "big.txt": BIG.replaceAll("a", "b") });
    const diff = (await repo.run(["diff", "--", "a.ts", "big.txt"])).stdout;
    expect(diff.length).toBeGreaterThan(MAX_OUTPUT);
    expect(diff.startsWith("diff --git a/a.ts")).toBe(true);
  });

  it("keeps the last 512 KB of a verification, so that its log does not grow without end", async () => {
    const size = MAX_OUTPUT + 1000;
    const script = `process.stdout.write("x".repeat(${size - 1}) + "y")`;
    const result = await execute("node", ["-e", script], { cwd: process.cwd() });
    expect(result.stdout.length).toBe(MAX_OUTPUT);
    expect(result.stdout.endsWith("y")).toBe(true);
  });
});

describe("a command past its time limit", () => {
  it("ends with every process it started, not only its shell (AC1)", async () => {
    const root = await tempRepo({ "slow.js": "setTimeout(() => {}, 60000);\n" });
    const started = Date.now();
    // `&&` keeps the shell alive: killing it alone leaves `node` holding the output open.
    const result = await execute("node slow.js && echo done", [], {
      cwd: root,
      shell: true,
      timeoutMs: 500,
    });
    expect(result).toMatchObject({ code: undefined, timedOut: true });
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 20_000);
});
