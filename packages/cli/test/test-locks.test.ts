// SPDX-License-Identifier: Apache-2.0
import { hashText } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import {
  APP,
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

/** A verification that fails and names the test, as a runner does while the code is missing. */
const RED = `node -e "console.log('FAIL src/app.test.ts'); process.exit(1)"`;
/** Under contract, a feature's tests are approved before its code (ADR 0014). */
const CONTRACT = `${CONFIG(RED)}policy:\n  tests: contract\nchecks:\n  levels: { secrets: off }\n`;
/** SPEC with a test in every task, as `contract` requires to propose it. */
const FEATURE = SPEC.replace(
  "  - files: src/app.ts\n  - ac: AC1\n  - type: refactor",
  "  - files: src/app.ts, src/app.test.ts\n  - ac: AC1\n  - type: refactor",
);
const TEST = "it('AC1: saluda a Ana', () => {});\n";

/** FEATURE's change with its test approved by the person: it is implementing. */
async function approvedTests(): Promise<string> {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": CONTRACT });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: FEATURE });
  expect((await cli(root, ["propose"])).code).toBe(0);
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  await writeFiles(root, { "src/app.test.ts": TEST });
  const sent = await cli(root, ["propose"]);
  expect(sent.code, sent.out).toBe(0);
  const approval = await cli(root, ["approve"], { terminal: person() });
  expect(approval.code, approval.out).toBe(0);
  return root;
}

const stateOf = async (root: string) =>
  JSON.parse(await read(root, `.specty/changes/${CHANGE}/state.json`));

/** What the guard answers Claude Code for `tool` with `input`. */
const guard = (root: string, tool: string, input: Record<string, unknown>) =>
  cli(root, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({ cwd: root, tool_name: tool, tool_input: input }),
  });

describe("approving the tests locks them", () => {
  it("AC1: keeps the hash of each test the person approved", async () => {
    const root = await approvedTests();
    const state = await stateOf(root);
    expect(state.phase).toBe("implementing");
    expect(state.lockedTests).toEqual({ "src/app.test.ts": hashText(TEST) });
  });

  it("AC2: the guard refuses to edit or delete an approved test, and says to stop", async () => {
    const root = await approvedTests();
    await cli(root, ["next"]);
    for (const [tool, input] of [
      ["Write", { file_path: `${root}/src/app.test.ts`, content: "it('AC1', () => {});\n" }],
      ["Bash", { command: "rm src/app.test.ts" }],
    ] as const) {
      const denied = await guard(root, tool, input);
      expect(denied.code, tool).toBe(2);
      expect(denied.err).toContain("`src/app.test.ts` es un test aprobado");
      expect(denied.err).toContain("explícaselo al usuario");
    }
    // The task's code, and a new test in its own file, stay open.
    expect((await guard(root, "Write", { file_path: `${root}/src/app.ts` })).code).toBe(0);
    expect((await guard(root, "Write", { file_path: `${root}/src/greet.test.ts` })).code).toBe(0);
  });
});
