// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CHANGE, cli, git, person, read, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

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

/** SPEC's change with both tasks done: the full verification ran twice, last on T2's code. */
async function implemented(): Promise<string> {
  const root = await approved();
  await writeFiles(root, { "src/app.ts": "1\n" });
  expect((await cli(root, ["task", "done", "T1", "--summary", "Uno"])).code).toBe(0);
  await writeFiles(root, { "src/app.ts": "2\n" });
  expect((await cli(root, ["task", "done", "T2", "--summary", "Dos"])).code).toBe(0);
  return root;
}

describe("accept", () => {
  it("does not run the full verification again on the code it passed on (AC2)", async () => {
    const root = await implemented();
    const terminal = person();
    expect((await cli(root, ["accept"], { terminal })).code).toBe(0);
    expect(await runs(root)).toBe(2);
    expect(terminal.notes.join("\n")).toContain(
      `La verificación completa (\`${FULL}\`) ya pasó con este mismo código en T2: no se repite.`,
    );
    expect((await audit(root)).some(({ event }) => event === "change.verified")).toBe(false);
  });

  it("runs it when the code changed since (AC3)", async () => {
    const root = await implemented();
    await writeFiles(root, { "src/app.ts": "3\n" });
    git(root, "commit", "-q", "-am", "Otro arreglo");
    expect((await cli(root, ["accept"], { terminal: person() })).code).toBe(0);
    expect(await runs(root)).toBe(3);
  });

  it("runs it when its last run failed, though an earlier one passed on this code (AC3)", async () => {
    const root = await implemented();
    const passed = (await audit(root)).findLast(({ event }) => event === "task.verified");
    const tree = (passed?.data as Record<string, unknown> | undefined)?.tree;
    const failed = { ts: "2026-10-24T12:00:00.000Z", actor: "specty", event: "change.verified" };
    const file = `.specty/changes/${CHANGE}/audit.jsonl`;
    const line = JSON.stringify({ ...failed, data: { cmd: FULL, exit: 1, ms: 1, tree } });
    await writeFiles(root, { [file]: `${await read(root, file)}${line}\n` });
    expect((await cli(root, ["accept"], { terminal: person() })).code).toBe(0);
    expect(await runs(root)).toBe(3);
  });
});
