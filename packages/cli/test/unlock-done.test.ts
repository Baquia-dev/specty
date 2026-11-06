// SPDX-License-Identifier: Apache-2.0
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hashText } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import {
  APP,
  CHANGE,
  CONFIG,
  cli,
  git,
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
const CODE = "export const greet = (name) => 'Hola, ' + name;\n";
/** The test as each patch leaves it. */
const FIXED = "it('AC1: saluda a Ana', () => {}); // Hola, Ana\n";
const OTHER = "it('AC1: saluda a Ana', () => {}); // Hola Ana\n";

/** The patch that turns TEST into `to`, as `git diff` writes it. */
const patchTo = (to: string) =>
  [
    "diff --git a/src/app.test.ts b/src/app.test.ts",
    "--- a/src/app.test.ts",
    "+++ b/src/app.test.ts",
    "@@ -1 +1 @@",
    `-${TEST.trimEnd()}`,
    `+${to.trimEnd()}`,
    "",
  ].join("\n");
/** The patch that deletes TEST. */
const DELETE = [
  "diff --git a/src/app.test.ts b/src/app.test.ts",
  "deleted file mode 100644",
  "--- a/src/app.test.ts",
  "+++ /dev/null",
  "@@ -1 +0,0 @@",
  `-${TEST.trimEnd()}`,
  "",
].join("\n");

/** FEATURE's change with its test approved by the person and T1 active. */
async function implementing(): Promise<string> {
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
  await cli(root, ["next"]);
  return root;
}

/** The agent asks to unlock the approved test for T1 with `patch`. */
async function ask(root: string, patch: string): Promise<void> {
  const asked = await cli(
    root,
    [
      "scope",
      "add",
      "src/app.test.ts",
      "--task",
      "T1",
      "--reason",
      "El test no comprueba el saludo",
      "--patch",
      "-",
      "--evidence",
      "src/app.ts:1-1",
    ],
    { stdin: patch },
  );
  expect(asked.code, asked.out).toBe(0);
}

/** The person approves the scope request `id`. */
async function approve(root: string, id: string): Promise<void> {
  const approval = await cli(root, ["approve", "--scope", id], { terminal: person() });
  expect(approval.code, approval.out).toBe(0);
}

/** FEATURE's change with T1 active and the unlock of its test with `patch` approved as S1. */
async function unlocked(patch: string): Promise<string> {
  const root = await implementing();
  await ask(root, patch);
  await approve(root, "S1");
  return root;
}

const stateOf = async (root: string) =>
  JSON.parse(await read(root, `.specty/changes/${CHANGE}/state.json`));

const auditOf = async (root: string) =>
  (await read(root, `.specty/changes/${CHANGE}/audit.jsonl`))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

const done = (root: string) => cli(root, ["task", "done", "T1", "--summary", "Saluda por nombre"]);

describe("a test that is not as its approved patch leaves it", () => {
  it("AC1: task done does not complete the task, shows the difference and keeps the test unlocked", async () => {
    const root = await unlocked(patchTo(FIXED));
    await writeFiles(root, { "src/app.test.ts": OTHER, "src/app.ts": CODE });
    const refused = await done(root);
    expect(refused.code, refused.out).toBe(2);
    expect(refused.out).toContain(
      [
        "`src/app.test.ts` no quedó como lo deja el parche aprobado en S1.",
        "En cada diferencia, `-` es como lo deja el parche y `+`, como está.",
        "DIFERENCIA CON EL PARCHE DE S1 (src/app.test.ts):",
        "  @@ -1 +1 @@",
        `  -${FIXED.trimEnd()}`,
        `  +${OTHER.trimEnd()}`,
        "SIGUIENTE: deja cada test como lo deja su parche y vuelve a ejecutar `specty task done T1`.",
      ].join("\n"),
    );
    expect(refused.out).toContain(
      'pide otro desbloqueo con el cambio completo, que sustituye al anterior: `specty scope add src/app.test.ts --task T1 --reason "<motivo>" --patch <parche> --evidence <ruta>:<desde>-<hasta>`.',
    );
    const state = await stateOf(root);
    expect(state.tasks.T1.status).toBe("active");
    expect(state.tasks.T1.scopeExtra).toEqual(["src/app.test.ts"]);
    expect(state.lockedTests).toEqual({ "src/app.test.ts": hashText(TEST) });
    // Refused before its verification, which does not run.
    expect((await auditOf(root)).some((entry) => entry.event === "task.verified")).toBe(false);
  });
});

describe("a test as its approved patch leaves it", () => {
  it("AC2: task done completes the task and locks the new version", async () => {
    const root = await unlocked(patchTo(FIXED));
    await writeFiles(root, { "src/app.test.ts": FIXED, "src/app.ts": CODE });
    const t1 = await done(root);
    expect(t1.code, t1.out).toBe(0);
    const state = await stateOf(root);
    expect(state.tasks.T1.status).toBe("done");
    expect(state.lockedTests).toEqual({ "src/app.test.ts": hashText(FIXED) });
  });

  it("AC2 AC3: a patch that deletes the test completes only once it is gone, and unlocks it for good", async () => {
    const root = await unlocked(DELETE);
    // Its criterion keeps a test, in a file of its own.
    const greet = "it('AC1: saluda a Ana por su nombre', () => {});\n";
    await writeFiles(root, { "src/app.ts": CODE, "src/greet.test.ts": greet });
    const kept = await done(root);
    expect(kept.code, kept.out).toBe(2);
    expect(kept.out).toContain("`src/app.test.ts` sigue ahí, y el parche aprobado en S1 lo borra.");
    expect(kept.out).not.toContain("DIFERENCIA CON EL PARCHE");
    await rm(join(root, "src/app.test.ts"));
    const t1 = await done(root);
    expect(t1.code, t1.out).toBe(0);
    expect((await stateOf(root)).lockedTests).toEqual({});
  });
});

describe("a test the approved patch keeps", () => {
  it("AC3: task done does not complete the task when it is gone", async () => {
    const root = await unlocked(patchTo(FIXED));
    await writeFiles(root, { "src/app.ts": CODE });
    await rm(join(root, "src/app.test.ts"));
    const refused = await done(root);
    expect(refused.code, refused.out).toBe(2);
    expect(refused.out).toContain(
      "`src/app.test.ts` ya no está, y el parche aprobado en S1 no lo borra.",
    );
    expect((await stateOf(root)).tasks.T1.status).toBe("active");
  });
});

describe("more than one approved unlock of the same test", () => {
  it("AC4: task done compares it with the last one approved", async () => {
    const root = await implementing();
    await ask(root, patchTo(FIXED));
    await ask(root, patchTo(OTHER));
    await approve(root, "S1");
    await approve(root, "S2");
    await writeFiles(root, { "src/app.test.ts": FIXED, "src/app.ts": CODE });
    const refused = await done(root);
    expect(refused.code, refused.out).toBe(2);
    expect(refused.out).toContain(
      "`src/app.test.ts` no quedó como lo deja el parche aprobado en S2.",
    );
    await writeFiles(root, { "src/app.test.ts": OTHER });
    const t1 = await done(root);
    expect(t1.code, t1.out).toBe(0);
    expect((await stateOf(root)).lockedTests).toEqual({ "src/app.test.ts": hashText(OTHER) });
  });
});

describe("an approved unlock without a patch", () => {
  it("AC5: task done does not compare its test", async () => {
    const root = await implementing();
    await ask(root, patchTo(FIXED));
    // As an older CLI asked for it: without its patch and its evidence.
    const path = join(root, `.specty/changes/${CHANGE}/state.json`);
    const state = await stateOf(root);
    const [request] = state.pending.scopeRequests;
    const { patch: _patch, evidence: _evidence, ...older } = request;
    state.pending.scopeRequests = [older];
    await writeFile(path, `${JSON.stringify(state, null, 2)}\n`);
    await approve(root, "S1");
    await writeFiles(root, { "src/app.test.ts": OTHER, "src/app.ts": CODE });
    const t1 = await done(root);
    expect(t1.code, t1.out).toBe(0);
    expect((await stateOf(root)).lockedTests).toEqual({ "src/app.test.ts": hashText(OTHER) });
  });
});

describe("a test whose locked version is not in the last commit", () => {
  it("AC6: task done does not complete the task and says it cannot check the test", async () => {
    const root = await unlocked(patchTo(FIXED));
    // Past Specty, as a commit by hand could: the last commit no longer has the locked version.
    await writeFiles(root, { "src/app.test.ts": FIXED, "src/app.ts": CODE });
    git(root, "commit", "-q", "-m", "a mano", "--", "src/app.test.ts");
    const refused = await done(root);
    expect(refused.code, refused.out).toBe(2);
    expect(refused.out).toContain(
      "Specty no puede comprobar `src/app.test.ts`: su versión en el último commit no es la que se bloqueó.",
    );
    expect(refused.out).toContain(
      "SIGUIENTE: para y explícaselo al usuario: Specty no completa T1 sin comprobar cada test desbloqueado sobre su versión bloqueada.",
    );
    expect((await stateOf(root)).tasks.T1.status).toBe("active");
  });
});
