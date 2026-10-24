// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CHANGE, cli, person, read, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

/** The full verification, which counts its runs in `.git/runs`, outside the code it verifies. */
const FULL = `node -e "require('fs').appendFileSync('.git/runs','x')"`;
const CONFIG = `version: 1\nlanguage: es\ngit:\n  worktrees: false\nverify:\n  default: ${JSON.stringify(FULL)}\n  full: ${JSON.stringify(FULL)}\n`;

/** SPEC's change, approved, with T1 active; each task's verification is the full one. */
async function approved(): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": "export const greet = () => 'hola';\n",
    ".specty/config.yaml": CONFIG,
  });
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  expect((await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) })).code).toBe(
    0,
  );
  await cli(root, ["next"]);
  return root;
}

const audit = async (root: string): Promise<Record<string, unknown>[]> =>
  (await read(root, `.specty/changes/${CHANGE}/audit.jsonl`))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

/** How many times the full verification ran. */
const runs = async (root: string) => (await read(root, ".git/runs")).length;

describe("a verification", () => {
  it("records the code it ran on (AC1)", async () => {
    const root = await approved();
    await writeFiles(root, { "src/app.ts": "1\n" });
    expect((await cli(root, ["task", "done", "T1", "--summary", "Uno"])).code).toBe(0);
    await writeFiles(root, { "src/app.ts": "2\n" });
    expect((await cli(root, ["task", "done", "T2", "--summary", "Dos"])).code).toBe(0);
    const verified = (await audit(root)).filter(({ event }) => event === "task.verified");
    const trees = verified.map((entry) => (entry.data as Record<string, unknown>).tree);
    expect(trees).toEqual([expect.stringMatching(/^sha256:/), expect.stringMatching(/^sha256:/)]);
    // Different code, a different tree.
    expect(trees[0]).not.toBe(trees[1]);
    expect(await runs(root)).toBe(2);
  });
});
