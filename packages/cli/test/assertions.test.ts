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

const ASSERTIONS =
  "expect(greet()).toBe('hola');\nexpect(greet('Ana')).toBe('hola');\nexpect(1).toBe(1);\n";

/** SPEC's change (or `spec`), approved, in a repository whose test already has three assertions. */
async function withTest(
  config = CONFIG(),
  spec = SPEC.replace("- crear src/app.test.ts", "- modificar src/app.test.ts"),
): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": "export const greet = () => 'hola';\n",
    [TEST]: ASSERTIONS,
    ".specty/config.yaml": config,
  });
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  await writeFiles(root, { [SPEC_PATH]: spec });
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

/** Two refactors, each with the test it keeps, under `policy.tests: contract` (ADR 0014). */
const REFACTORS = SPEC.replace("- crear src/app.test.ts", "- modificar src/app.test.ts")
  .replace(
    "- [ ] T1: Saludar por nombre\n  - files: src/app.ts, src/app.test.ts\n  - ac: AC1",
    "- [ ] T1: Saludar por nombre\n  - files: src/app.ts, src/app.test.ts\n  - ac: AC1\n  - type: refactor",
  )
  .replace(
    "  - files: src/app.ts\n  - ac: AC1\n  - type: refactor",
    "  - files: src/app.ts, src/app.test.ts\n  - ac: AC1\n  - type: refactor",
  );
const CONTRACT = `${CONFIG()}policy:\n  tests: contract\nchecks:\n  levels: { secrets: off }\n`;

describe("a refactor under contract", () => {
  it("is not done while it removes assertions from a test that already existed", async () => {
    const root = await withTest(CONTRACT, REFACTORS);
    await cli(root, ["next"]);
    await writeFiles(root, {
      "src/app.ts": "export const greet = () => 'hola' ;\n",
      [TEST]: "// expect(greet()).toBe('hola');\nexpect(1).toBe(1);\n",
    });
    const refused = await cli(root, ["task", "done", "T1", "--summary", "Uno"]);
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain(
      "T1 es un refactor y quitó 2 aserciones de src/app.test.ts, un test que ya existía:",
    );
    expect(refused.out).toContain("devuelve las aserciones");
    const state = JSON.parse(await read(root, `.specty/changes/${CHANGE}/state.json`));
    expect(state.tasks.T1.status).toBe("active");
    await writeFiles(root, { [TEST]: ASSERTIONS });
    expect((await cli(root, ["task", "done", "T1", "--summary", "Uno"])).code).toBe(0);
  });
});
