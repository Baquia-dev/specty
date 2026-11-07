// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { hashText } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  cli,
  git,
  inWorktree,
  person,
  read,
  SPEC,
  SPEC_PATH,
  stateIn,
  tryGit,
  writeFiles,
} from "./support";

const TEST = "src/app.test.ts";
const STATE = `.specty/changes/${CHANGE}/state.json`;

/** The test with the greeting and the farewell it expects. */
const lines = (greeting: string, farewell: string) =>
  [
    "it('AC1: saluda', () => {",
    `  expect(greet()).toBe('${greeting}');`,
    "});",
    "",
    "it('AC2: despide', () => {",
    `  expect(bye()).toBe('${farewell}');`,
    "});",
    "",
  ].join("\n");

/** The test as the change's base has it. */
const BASE = lines("hola", "adiós");
/** The test as the person approved it: the change made its greeting its own. */
const LOCKED = lines("hola, Ana", "adiós");
/** Main changes the greeting too: a conflict with the approved test. */
const MAIN_GREETING = lines("buenas", "adiós");

/** The change the agent asks to make to LOCKED, as `git diff` writes it. */
const PATCH = [
  `diff --git a/${TEST} b/${TEST}`,
  `--- a/${TEST}`,
  `+++ b/${TEST}`,
  "@@ -1,3 +1,3 @@",
  " it('AC1: saluda', () => {",
  "-  expect(greet()).toBe('hola, Ana');",
  "+  expect(greet()).toBe('Hola, Ana');",
  " });",
  "",
].join("\n");
const PATCHED = lines("Hola, Ana", "adiós");

/**
 * SPEC's change, in its own folder, with `src/app.test.ts` approved by the person (as the
 * testing phase leaves it in the state, ADR 0014), whose acceptance leaves for the agent the
 * merge of a main that changed the greeting of `src/app.ts` and, in it, `main`'s files.
 */
async function incorporating(main: Readonly<Record<string, string>> = {}) {
  const { root, folder } = await inWorktree({ ...APP, [TEST]: BASE });
  const spec = SPEC.replace("- crear src/app.test.ts", "- modificar src/app.test.ts");
  await writeFiles(folder, { [SPEC_PATH]: spec });
  expect((await cli(folder, ["propose"])).code).toBe(0);
  const approved = await cli(folder, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect(approved.code, approved.out).toBe(0);
  await cli(folder, ["next"]);
  await writeFiles(folder, { "src/app.ts": "1\n", [TEST]: LOCKED });
  const t1 = await cli(folder, ["task", "done", "T1", "--summary", "Uno"]);
  expect(t1.code, t1.out).toBe(0);
  await writeFiles(folder, { "src/app.ts": "2\n" });
  const t2 = await cli(folder, ["task", "done", "T2", "--summary", "Dos"]);
  expect(t2.code, t2.out).toBe(0);
  const locked = { ...(await stateIn(folder)), lockedTests: { [TEST]: hashText(LOCKED) } };
  await writeFiles(folder, { [STATE]: `${JSON.stringify(locked, null, 2)}\n` });
  await writeFiles(root, { "src/app.ts": "main\n", ...main });
  git(root, "commit", "-q", "-am", "main cambia el saludo");
  const refused = await cli(folder, ["accept"], { terminal: person() });
  expect(refused.out).toContain("el merge queda en esta carpeta para que lo resuelva el agente");
  return folder;
}

/** What the guard answers Claude Code when it writes `path` in `folder`. */
const writing = (folder: string, path: string) =>
  cli(folder, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({
      cwd: folder,
      tool_name: "Write",
      tool_input: { file_path: join(folder, path), content: "x\n" },
    }),
  });

/** Whether the merge of main is still in progress in `folder`. */
const merging = (folder: string) =>
  tryGit(folder, "rev-parse", "-q", "--verify", "MERGE_HEAD").status === 0;

/** The agent asks to unlock the approved test with PATCH, justified by the line of main's code. */
const askUnlock = (folder: string) =>
  cli(
    folder,
    [
      "scope",
      "add",
      TEST,
      "--reason",
      "main saluda con mayúscula",
      "--patch",
      "-",
      "--evidence",
      "src/app.ts:1-1",
    ],
    { stdin: PATCH },
  );

/** The agent resolves the conflict on `src/app.ts`, asks for the unlock and the person approves it. */
async function unlocked(): Promise<string> {
  const folder = await incorporating();
  await writeFiles(folder, { "src/app.ts": "resuelto\n" });
  const asked = await askUnlock(folder);
  expect(asked.code, asked.out).toBe(0);
  const approval = await cli(folder, ["approve", "--scope", "S1"], { terminal: person() });
  expect(approval.code, approval.out).toBe(0);
  return folder;
}

describe("the guard keeps the approved tests locked while main is incorporated", () => {
  it("AC1: refuses an approved test git did not leave in conflict, with the unlock command without --task", async () => {
    const folder = await incorporating();
    const denied = await writing(folder, TEST);
    expect(denied.code).toBe(2);
    expect(denied.err).toContain(`\`${TEST}\` es un test aprobado`);
    expect(denied.err).toContain(
      `\`specty scope add ${TEST} --reason "<motivo>" --patch <parche> --evidence <ruta>:<desde>-<hasta>\``,
    );
    expect((await writing(folder, "src/app.ts")).code).toBe(0);
  });

  it("AC2: lets the agent write an approved test git left in conflict, to resolve it", async () => {
    const folder = await incorporating({ [TEST]: MAIN_GREETING });
    expect((await stateIn(folder)).integration).toMatchObject({
      conflicts: expect.arrayContaining([TEST]),
    });
    expect((await writing(folder, TEST)).code).toBe(0);
  });
});

describe("the unlock of an approved test while the incorporation is pending", () => {
  it("AC3: scope add asks for it with its patch and its evidence, and the merge goes on", async () => {
    const folder = await incorporating();
    await writeFiles(folder, { "src/app.ts": "resuelto\n" });
    const asked = await askUnlock(folder);
    expect(asked.code, asked.out).toBe(0);
    expect(asked.out).toContain("SOLICITUD S1 (desbloquea tests aprobados)");
    expect((await stateIn(folder)).pending).toMatchObject({
      scopeRequests: [
        {
          id: "S1",
          task: "T1",
          paths: [TEST],
          patch: PATCH,
          evidence: [{ path: "src/app.ts", from: 1, to: 1, text: "resuelto" }],
        },
      ],
    });
    expect(merging(folder)).toBe(true);
    // Only an approved test: the rest of what the merge brings together is already open.
    const other = await cli(folder, ["scope", "add", "src/other.ts", "--reason", "otro archivo"]);
    expect(other.code).not.toBe(0);
    expect(other.out).toContain("Solo se amplía el alcance durante la implementación.");
  });

  it("AC4: the person's approval opens the test for the incorporation; without a person, nothing changes", async () => {
    const folder = await incorporating();
    await writeFiles(folder, { "src/app.ts": "resuelto\n" });
    expect((await askUnlock(folder)).code).toBe(0);
    expect((await cli(folder, ["approve", "--scope", "S1"])).code).not.toBe(0);
    expect((await stateIn(folder)).pending).toMatchObject({ scopeRequests: [{ id: "S1" }] });
    const approval = await cli(folder, ["approve", "--scope", "S1"], { terminal: person() });
    expect(approval.code, approval.out).toBe(0);
    expect((await stateIn(folder)).integration).toMatchObject({ unlocked: [TEST] });
    expect((await writing(folder, TEST)).code).toBe(0);
    expect(merging(folder)).toBe(true);
  });
});

describe("`specty integrate` and the approved tests", () => {
  it("AC5: does not commit an approved test main did not change and the agent rewrote", async () => {
    const folder = await incorporating();
    // Past the guard, as a shell command or another agent could.
    await writeFiles(folder, {
      "src/app.ts": "resuelto\n",
      [TEST]: lines("hola, Ana y Luis", "adiós"),
    });
    const refused = await cli(folder, ["integrate"]);
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain(TEST);
    expect(refused.out).toContain(`specty scope add ${TEST} --reason`);
    expect(merging(folder)).toBe(true);
    expect((await stateIn(folder)).integration).not.toHaveProperty("resolved");
  });

  it("AC5: does not commit a conflict on an approved test resolved with lines of neither side", async () => {
    const folder = await incorporating({ [TEST]: MAIN_GREETING });
    await writeFiles(folder, { "src/app.ts": "resuelto\n", [TEST]: lines("buenas, Ana", "adiós") });
    const refused = await cli(folder, ["integrate"]);
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain(TEST);
    expect(merging(folder)).toBe(true);
  });

  it("AC6: commits an approved test main changed as git merges it, and locks that version", async () => {
    const folder = await incorporating({ [TEST]: lines("hola", "chao") });
    const merged = lines("hola, Ana", "chao");
    expect(await read(folder, TEST)).toBe(merged);
    await writeFiles(folder, { "src/app.ts": "resuelto\n" });
    const done = await cli(folder, ["integrate"]);
    expect(done.code, done.out).toBe(0);
    expect(merging(folder)).toBe(false);
    expect((await stateIn(folder)).lockedTests).toEqual({ [TEST]: hashText(merged) });
  });

  it("AC6: commits a conflict on an approved test resolved with main's side, and locks that version", async () => {
    const folder = await incorporating({ [TEST]: MAIN_GREETING });
    await writeFiles(folder, { "src/app.ts": "resuelto\n", [TEST]: MAIN_GREETING });
    const done = await cli(folder, ["integrate"]);
    expect(done.code, done.out).toBe(0);
    expect((await stateIn(folder)).lockedTests).toEqual({ [TEST]: hashText(MAIN_GREETING) });
  });

  it("AC7: commits a test unlocked for the incorporation only as its patch leaves it, and locks it", async () => {
    const folder = await unlocked();
    await writeFiles(folder, { [TEST]: lines("Hola, Ana!", "adiós") });
    const refused = await cli(folder, ["integrate"]);
    expect(refused.code).not.toBe(0);
    expect(refused.out).toContain(`\`${TEST}\` no quedó como lo deja el parche aprobado en S1.`);
    expect(merging(folder)).toBe(true);
    await writeFiles(folder, { [TEST]: PATCHED });
    const done = await cli(folder, ["integrate"]);
    expect(done.code, done.out).toBe(0);
    expect((await stateIn(folder)).lockedTests).toEqual({ [TEST]: hashText(PATCHED) });
  });
});
