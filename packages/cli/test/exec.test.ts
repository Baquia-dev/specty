// SPDX-License-Identifier: Apache-2.0
import { getPriority, tmpdir } from "node:os";
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

  it("AC8: reads whole a character whose bytes come in two pieces", async () => {
    // «ñ» is 0xC3 0xB1 in UTF-8: the first byte goes alone, and the second a moment later.
    const script =
      "process.stdout.write(Buffer.from([0xc3]), () => setTimeout(() => process.stdout.write(Buffer.from([0xb1, 0x0a])), 100))";
    const result = await execute("node", ["-e", script], { cwd: process.cwd(), whole: true });
    expect(result.stdout).toBe("ñ\n");
    const kept = await execute("node", ["-e", script], { cwd: process.cwd() });
    expect(kept.stdout).toBe("ñ\n");
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

/** Prints its priority and, 100 ms later, that of a process it starts then. */
const PRIORITIES = `const os = require("node:os");
const { execFileSync } = require("node:child_process");
const own = os.getPriority();
setTimeout(() => {
  const child = execFileSync(process.execPath, ["-e", "process.stdout.write(String(require('node:os').getPriority()))"]);
  process.stdout.write(own + " " + child);
}, 100);`;

describe("a command with less priority", () => {
  it("runs at priority 10, as does a process it starts afterwards; otherwise at Specty's (AC1)", async () => {
    // Already below 10, as under a verification that runs with less priority, it stays there.
    const low = String(Math.max(getPriority(), 10));
    const lowered = await execute(process.execPath, ["-e", PRIORITIES], {
      cwd: tmpdir(),
      lowPriority: true,
    });
    expect(lowered.stdout).toBe(`${low} ${low}`);
    const plain = await execute(process.execPath, ["-e", PRIORITIES], { cwd: tmpdir() });
    expect(plain.stdout).toBe(`${getPriority()} ${getPriority()}`);
  });

  // AC3: Windows has no such program, so the test above is how it runs there.
  it.skipIf(process.platform === "win32")(
    "AC3: without the program that starts it lower in its PATH, is lowered once started",
    async () => {
      const lower = Math.min(getPriority() + 5, 19);
      const lowered = await execute(process.execPath, ["-e", PRIORITIES], {
        cwd: tmpdir(),
        env: { PATH: "" },
        lowPriority: true,
        priority: lower,
      });
      expect(lowered.stdout).toBe(`${lower} ${lower}`);
    },
  );
});
