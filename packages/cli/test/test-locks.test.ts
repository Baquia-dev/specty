// SPDX-License-Identifier: Apache-2.0
import { rm } from "node:fs/promises";
import { join } from "node:path";
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

/**
 * A verification that fails and names the test until `src/app.ts` greets with «Hola», as a
 * runner does while the code is missing.
 */
const RED = `node -e "if(!require('fs').readFileSync('src/app.ts','utf8').includes('Hola')){console.log('FAIL src/app.test.ts');process.exit(1)}"`;
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
      // AC6: and how to ask for its unlock, which only the person decides.
      expect(denied.err).toContain("`specty scope add src/app.test.ts --task T1 --reason");
    }
    // The task's code, and a new test in its own file, stay open.
    expect((await guard(root, "Write", { file_path: `${root}/src/app.ts` })).code).toBe(0);
    expect((await guard(root, "Write", { file_path: `${root}/src/greet.test.ts` })).code).toBe(0);
  });
});

describe("tests-locked", () => {
  it("AC3: fails when an approved test changed or is gone, with --spec and without it", async () => {
    const root = await approvedTests();
    // Past the guard, as a shell command or a person could.
    await writeFiles(root, { "src/app.test.ts": "it('AC1: saluda', () => {});\n" });
    for (const argv of [
      ["check", "--changed", "--spec"],
      ["check", "--changed"],
    ]) {
      const run = await cli(root, argv);
      expect(run.code, argv.join(" ")).not.toBe(0);
      expect(run.out).toContain("FALLA tests-locked\n  src/app.test.ts");
    }
    await rm(join(root, "src/app.test.ts"));
    expect((await cli(root, ["check", "--changed"])).out).toMatch(
      /FALLA tests-locked\n {2}src\/app\.test\.ts .*falta/,
    );
  });

  it("AC4: says nothing while the approved tests are as approved, or none is locked", async () => {
    const root = await approvedTests();
    expect((await cli(root, ["check", "--changed"])).out).not.toContain("tests-locked");
    const plain = await tempRepo({ ...APP, ".specty/config.yaml": CONTRACT });
    expect((await cli(plain, ["check", "--changed"])).out).not.toContain("tests-locked");
  });
});

const REASON = "El test espera «Hola, Ana» y el criterio dice «Hola Ana»";

/** FEATURE's change with T1 active and an unlock of its approved test requested. */
async function unlockRequested() {
  const root = await approvedTests();
  await cli(root, ["next"]);
  const asked = await cli(root, [
    "scope",
    "add",
    "src/app.test.ts",
    "--task",
    "T1",
    "--reason",
    REASON,
  ]);
  return { root, asked };
}

describe("unlocking an approved test", () => {
  it("AC1: requests it for an in-scope test, and the request never approves itself", async () => {
    const { root, asked } = await unlockRequested();
    expect(asked.out).toContain("SOLICITUD S1 (desbloquea tests aprobados):\n  src/app.test.ts");
    expect(asked.out).toContain("lo decide solo la persona");
    const state = await stateOf(root);
    expect(state.pending.scopeRequests).toMatchObject([
      { id: "S1", task: "T1", paths: ["src/app.test.ts"], reason: REASON },
    ]);
    expect(state.tasks.T1.scopeExtra).toEqual([]);
  });

  it("AC2: lets no delegated agent approve or reject it", async () => {
    const { root } = await unlockRequested();
    const on = await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
    expect(on.code).toBe(0);
    for (const argv of [
      ["approve", "--scope", "S1"],
      ["reject", "--scope", "S1", "--reason", "no"],
    ]) {
      const refused = await cli(root, argv);
      expect(refused.out, argv[0]).toContain(
        "S1 desbloquea un test aprobado: lo decide solo la persona, también en modo delegado.",
      );
    }
    expect((await stateOf(root)).pending.scopeRequests).toHaveLength(1);
  });

  it("AC3: once the person approves it, the test is open for its task and tests-locked keeps quiet", async () => {
    const { root } = await unlockRequested();
    const approval = await cli(root, ["approve", "--scope", "S1"], { terminal: person() });
    expect(approval.code, approval.out).toBe(0);
    expect((await stateOf(root)).tasks.T1.scopeExtra).toEqual(["src/app.test.ts"]);
    expect((await guard(root, "Write", { file_path: `${root}/src/app.test.ts` })).code).toBe(0);
    await writeFiles(root, { "src/app.test.ts": "it('AC1: saluda a Ana', () => {}); // Hola\n" });
    expect((await cli(root, ["check", "--changed"])).out).not.toContain("FALLA tests-locked");
  });

  it("AC4 AC5: locks the new version when its task is done, and the acceptance shows the unlock", async () => {
    const { root } = await unlockRequested();
    await cli(root, ["approve", "--scope", "S1"], { terminal: person() });
    const fixed = "it('AC1: saluda a Ana', () => {}); // Hola, Ana\n";
    await writeFiles(root, {
      "src/app.test.ts": fixed,
      "src/app.ts": "export const greet = (name) => 'Hola, ' + name;\n",
    });
    const t1 = await cli(root, ["task", "done", "T1", "--summary", "Saluda por nombre"]);
    expect(t1.code, t1.out).toBe(0);
    expect((await stateOf(root)).lockedTests).toEqual({ "src/app.test.ts": hashText(fixed) });
    // T2 is active now, and the test is locked for it again.
    expect((await guard(root, "Write", { file_path: `${root}/src/app.test.ts` })).code).toBe(2);
    const t2 = await cli(root, ["task", "done", "T2", "--summary", "Sin cambios"]);
    expect(t2.code, t2.out).toBe(0);
    expect((await cli(root, ["next"])).out).toContain(
      "TESTS DESBLOQUEADOS:\n  src/app.test.ts (S1, T1)",
    );
  });
});
