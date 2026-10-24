// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  CHANGE,
  CONFIG,
  cli,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "./support";

const TEST = "src/app.test.ts";
const AUDIT = `.specty/changes/${CHANGE}/audit.jsonl`;

/** SPEC's change, approved, in a repository whose test already has three assertions. */
async function withTest(): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": "export const greet = () => 'hola';\n",
    [TEST]:
      "expect(greet()).toBe('hola');\nexpect(greet('Ana')).toBe('hola');\nexpect(1).toBe(1);\n",
    ".specty/config.yaml": CONFIG(),
  });
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  await writeFiles(root, {
    [SPEC_PATH]: SPEC.replace("- crear src/app.test.ts", "- modificar src/app.test.ts"),
  });
  expect((await cli(root, ["propose"])).code).toBe(0);
  const approved = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(approved.code).toBe(0);
  return root;
}

/** The `data` of the audit's last `task.completed` entry. */
async function completed(root: string): Promise<Record<string, unknown>> {
  const entries = (await read(root, AUDIT))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  return entries.findLast((entry) => entry.event === "task.completed")?.data ?? {};
}

describe("tests in task cards and task done", () => {
  it("asks for test first in code tasks and to keep tests in refactors", async () => {
    const root = await withTest();
    const first = await cli(root, ["next"]);
    expect(first.out).toContain("TESTS:\n  Primero el test:");
    await writeFiles(root, { "src/app.ts": "export const greet = (name = 'mundo') => name;\n" });
    expect((await cli(root, ["task", "done", "T1", "--summary", "Uno"])).code).toBe(0);
    const keep = await cli(root, ["next"]);
    expect(keep.out).toContain("TAREA T2");
    expect(keep.out).toContain("TESTS:\n  Si falla un test que ya existía");
    expect(keep.out).not.toContain("Primero el test");
  });

  it("warns when a task removes assertions from a test that already existed", async () => {
    const root = await withTest();
    await cli(root, ["next"]);
    await writeFiles(root, {
      "src/app.ts": "export const greet = (name = 'mundo') => name;\n",
      [TEST]: "// expect(greet()).toBe('hola');\nexpect(1).toBe(1);\n",
    });
    const done = await cli(root, ["task", "done", "T1", "--summary", "Uno"]);
    expect(done.code).toBe(0);
    expect(done.out).toContain(
      "AVISOS:\n  T1 quitó 2 aserciones de src/app.test.ts, un test que ya existía.",
    );
    expect((await completed(root)).removedAssertions).toEqual([{ path: TEST, removed: 2 }]);
    await writeFiles(root, {
      "src/app.ts": "export const greet = (name = 'mundo') => String(name);\n",
    });
    const last = await cli(root, ["task", "done", "T2", "--summary", "Dos"]);
    expect(last.out).not.toContain("T2 quitó");
    expect(await completed(root)).not.toHaveProperty("removedAssertions");
    expect((await cli(root, ["next"])).out).toContain(
      "AVISOS:\n  T1 quitó 2 aserciones de src/app.test.ts, un test que ya existía.\n  Cuéntaselo al usuario",
    );
    const terminal = person();
    expect((await cli(root, ["accept"], { terminal })).code).toBe(0);
    expect(terminal.notes.join("\n")).toContain(
      "T1 quitó 2 aserciones de src/app.test.ts, un test que ya existía.",
    );
  });
});
