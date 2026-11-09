// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIG, cli, tempRepo, writeFiles } from "./support";

const RUNNING = ".git/common/specty/locks/verify-slots";

/** The project's tests: they write when they ran and what ran in the clone's places meanwhile. */
const TESTS = [
  'const fs = require("node:fs");',
  `const dir = ${JSON.stringify(RUNNING)};`,
  "const names = fs.existsSync(dir) ? fs.readdirSync(dir) : [];",
  'const marks = names.map((name) => JSON.parse(fs.readFileSync(dir + "/" + name, "utf8")));',
  'fs.writeFileSync("ran.json", JSON.stringify({ at: Date.now(), marks }));',
  "",
].join("\n");

const CHECKS = [
  "checks:",
  "  levels: { secrets: off }",
  "  commands:",
  '    tests: "node tools/tests.js"',
  "internal:",
  "  waits:",
  "    verifyIntervalMs: 100",
  "",
].join("\n");

/** A repository whose only project command is the tests, with a change to check. */
async function repo(): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": "export const a = 1;\n",
    "tools/tests.js": TESTS,
    ".specty/config.yaml": `${CONFIG()}${CHECKS}`,
  });
  await writeFiles(root, { "src/app.ts": "export const a = 2;\n" });
  return root;
}

/** A process that lives `ms` milliseconds, and when it ends. */
function living(ms: number) {
  const child = spawn(process.execPath, ["-e", `setTimeout(() => {}, ${ms})`]);
  const ended = new Promise<number>((done) => child.on("exit", () => done(Date.now())));
  return { pid: child.pid ?? 0, ended };
}

/** The verification of process `pid` in `folder`, taking `weight` places, as its file says. */
async function verifying(root: string, pid: number, folder: string, weight: number) {
  await mkdir(join(root, RUNNING), { recursive: true });
  const entry = { pid, command: "pnpm check", folder, at: "2026-11-09T09:00:00.000Z", weight };
  await writeFile(join(root, RUNNING, `000000000000001-${pid}-1.json`), JSON.stringify(entry));
}

interface Ran {
  readonly at: number;
  readonly marks: readonly Record<string, unknown>[];
}

const ran = async (root: string): Promise<Ran> =>
  JSON.parse(await readFile(join(root, "ran.json"), "utf8"));

const FOLDER_NOTE = "en esta carpeta ya corre otro comando de verificación de Specty";

describe("specty check in a folder where a verification of Specty runs", () => {
  it("AC2: waits for another process's verification in its folder, says so once, and then runs the project's commands", async () => {
    const root = await repo();
    const other = living(1500);
    await verifying(root, other.pid, root, 2);
    const run = await cli(root, ["check"]);
    const ended = await other.ended;
    expect((await ran(root)).at).toBeGreaterThanOrEqual(ended - 100);
    expect(run.err.split(FOLDER_NOTE)).toHaveLength(2);
    expect(run.err).toContain(`${FOLDER_NOTE} (\`pnpm check\`, desde las 09:00 UTC)`);
  });

  it("AC2: marks its folder with a file of weight 0 while its command runs", async () => {
    const root = await repo();
    expect((await cli(root, ["check"])).err).not.toContain(FOLDER_NOTE);
    const { marks } = await ran(root);
    expect(marks.filter((mark) => mark.command === "node tools/tests.js")).toEqual([
      expect.objectContaining({
        pid: process.pid,
        command: "node tools/tests.js",
        folder: root,
        weight: 0,
      }),
    ]);
  });

  it("AC2: runs its commands at once, saying nothing, while verifications of another folder hold every place", async () => {
    const root = await repo();
    const other = living(4000);
    await verifying(root, other.pid, "/otra/carpeta", 2);
    const started = Date.now();
    const run = await cli(root, ["check"]);
    expect((await ran(root)).at - started).toBeLessThan(3000);
    expect(run.err).not.toContain(FOLDER_NOTE);
    expect(run.err).not.toContain("plaza de verificación");
    await other.ended;
  });

  it("AC3: does not wait for the verification in its folder of a process that started it", async () => {
    const root = await repo();
    await verifying(root, process.ppid, root, 2);
    const run = await cli(root, ["check"]);
    expect(run.err).not.toContain(FOLDER_NOTE);
    expect((await ran(root)).marks).toContainEqual(
      expect.objectContaining({ pid: process.ppid, folder: root }),
    );
  });
});
