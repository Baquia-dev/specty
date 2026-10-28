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

/**
 * A runner in miniature: each test says, after `WANT:`, what `src/app.ts` must contain, and
 * fails naming itself while it does not.
 */
const RUNNER = `node -e "const fs=require('fs');for(const t of ['src/app.test.ts','src/greet.test.ts']){if(!fs.existsSync(t))continue;const m=/WANT: (\\S+)/.exec(fs.readFileSync(t,'utf8'));if(m&&!fs.readFileSync('src/app.ts','utf8').includes(m[1])){console.log('FAIL '+t);process.exit(1)}}"`;
const CONTRACT = `${CONFIG(RUNNER)}policy:\n  tests: contract\nchecks:\n  levels: { secrets: off }\n`;

/** SPEC with a test in every task, as `contract` requires to propose it. */
const FEATURE = SPEC.replace(
  "  - files: src/app.ts\n  - ac: AC1\n  - type: refactor",
  "  - files: src/app.ts, src/app.test.ts\n  - ac: AC1\n  - type: refactor",
);
const TEST = "it('AC1: saluda a Ana', () => {}); // WANT: Hola\n";

const stateOf = async (root: string) =>
  JSON.parse(await read(root, `.specty/changes/${CHANGE}/state.json`));
const auditOf = async (
  root: string,
): Promise<{ readonly event: string; readonly data: Record<string, unknown> }[]> =>
  (await read(root, `.specty/changes/${CHANGE}/audit.jsonl`))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

/** FEATURE's change under contract, its test approved and its tasks done: in acceptance. */
async function accepting(): Promise<string> {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": CONTRACT });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: FEATURE });
  expect((await cli(root, ["propose"])).code).toBe(0);
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  await writeFiles(root, { "src/app.test.ts": TEST });
  expect((await cli(root, ["propose"])).code).toBe(0);
  expect((await cli(root, ["approve"], { terminal: person() })).code).toBe(0);
  await cli(root, ["next"]);
  await writeFiles(root, { "src/app.ts": "export const greet = (name) => 'Hola, ' + name;\n" });
  expect((await cli(root, ["task", "done", "T1", "--summary", "Saluda"])).code).toBe(0);
  expect((await cli(root, ["task", "done", "T2", "--summary", "Igual"])).code).toBe(0);
  return root;
}

/** Asks for an adjustment, edits the spec with `edit` and has the person approve it. */
async function adjusted(root: string, edit: (spec: string) => string) {
  expect((await cli(root, ["adjust", "Cambia el saludo"])).code).toBe(0);
  await writeFiles(root, { [SPEC_PATH]: edit(await read(root, SPEC_PATH)) });
  const proposed = await cli(root, ["propose"]);
  expect(proposed.code, proposed.out).toBe(0);
  const approval = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(approval.code, approval.out).toBe(0);
}

const task = (id: string, type: string, files: string) =>
  `- [ ] ${id}: Ajuste ${id}\n  - files: ${files}\n  - ac: AC1\n  - type: ${type}\n`;

describe("an adjustment under contract", () => {
  it("AC1 AC2: a modified criterion unlocks its tests and goes back to the gate 2", async () => {
    const root = await accepting();
    // Refined criterion, and its task is a fix: the person still approves the new test.
    await adjusted(
      root,
      (spec) =>
        `${spec.replace("imprime «Hola, Ana».", "imprime «Hola, Ana!».")}${task("T3", "fix", "src/app.ts, src/app.test.ts")}`,
    );
    const state = await stateOf(root);
    expect(state.phase).toBe("testing");
    expect(state.testCycle).toBe("feature");
    expect(state.lockedTests).toEqual({});
    const approved = (await auditOf(root)).findLast((entry) => entry.event === "spec.approved");
    expect(approved?.data.unlocked).toEqual(["src/app.test.ts"]);
    const rewritten = "it('AC1: saluda a Ana!', () => {}); // WANT: '!'\n";
    await writeFiles(root, { "src/app.test.ts": rewritten });
    const sent = await cli(root, ["propose"]);
    expect(sent.code, sent.out).toBe(0);
    expect(sent.out).toContain("los apruebe con `specty approve`");
    expect((await stateOf(root)).testsSubmittedAt).toBeDefined();
    expect((await cli(root, ["approve"], { terminal: person() })).code).toBe(0);
    const locked = await stateOf(root);
    expect(locked.phase).toBe("implementing");
    expect(locked.lockedTests).toEqual({ "src/app.test.ts": hashText(rewritten) });
    expect(locked.testCycle).toBeUndefined();
  });

  it("AC3: an added defect follows a bug's cycle, its red test locked with no person", async () => {
    const root = await accepting();
    await adjusted(
      root,
      (spec) =>
        `${spec.replace("- crear src/app.test.ts — prueba\n", "- crear src/app.test.ts — prueba\n- crear src/greet.test.ts — el defecto\n")}${task("T3", "fix", "src/app.ts, src/greet.test.ts")}`,
    );
    const state = await stateOf(root);
    expect(state.phase).toBe("testing");
    expect(state.testCycle).toBe("bug");
    expect(Object.keys(state.lockedTests)).toEqual(["src/app.test.ts"]);
    const defect = "it('AC1: saluda sin nombre', () => {}); // WANT: mundo\n";
    await writeFiles(root, { "src/greet.test.ts": defect });
    const sent = await cli(root, ["propose"]);
    expect(sent.code, sent.out).toBe(0);
    expect(sent.out).toContain("Tests en rojo y bloqueados");
    const locked = await stateOf(root);
    expect(locked.phase).toBe("implementing");
    expect(Object.keys(locked.lockedTests).toSorted()).toEqual([
      "src/app.test.ts",
      "src/greet.test.ts",
    ]);
  });
});
