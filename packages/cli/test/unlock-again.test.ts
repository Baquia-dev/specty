// SPDX-License-Identifier: Apache-2.0
import { writeFile } from "node:fs/promises";
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
const CODE = "export const greet = (name) => 'Hola, ' + name;\n";
/** The test as the first unlock leaves it, and as the second one does. */
const FIRST = "it('AC1: saluda a Ana', () => {}); // Hola, Ana\n";
const SECOND = "it('AC1: saluda a Ana', () => {}); // Hola Ana\n";

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

/** FEATURE's change with its test approved by the person, T1 active and its unlock asked as S1. */
async function unlockAsked(): Promise<string> {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": CONTRACT });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: FEATURE });
  expect((await cli(root, ["propose"])).code).toBe(0);
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  await writeFiles(root, { "src/app.test.ts": TEST });
  expect((await cli(root, ["propose"])).code).toBe(0);
  expect((await cli(root, ["approve"], { terminal: person() })).code).toBe(0);
  await cli(root, ["next"]);
  const asked = await ask(root, ["--patch", "-", "--evidence", "src/app.ts:1-1"], patchTo(FIRST));
  expect(asked.code, asked.out).toBe(0);
  return root;
}

/** `scope add` of the approved test for T1 with `extra` options, and `stdin` if given. */
const ask = (root: string, extra: readonly string[], stdin?: string) =>
  cli(
    root,
    [
      "scope",
      "add",
      "src/app.test.ts",
      "--task",
      "T1",
      "--reason",
      "El test no comprueba el saludo",
      ...extra,
    ],
    stdin === undefined ? {} : { stdin },
  );

const decide = (root: string, argv: readonly string[]) => cli(root, argv, { terminal: person() });

const stateOf = async (root: string) =>
  JSON.parse(await read(root, `.specty/changes/${CHANGE}/state.json`));

const lastDecision = async (root: string) =>
  (await read(root, `.specty/changes/${CHANGE}/audit.jsonl`))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .findLast((entry) => entry.event === "scope.decided");

const done = (root: string) => cli(root, ["task", "done", "T1", "--summary", "Saluda por nombre"]);

describe("another unlock of a test already unlocked for the task", () => {
  it("AC7: is a new request, with its patch and its evidence, that the person decides", async () => {
    const root = await unlockAsked();
    expect((await decide(root, ["approve", "--scope", "S1"])).code).toBe(0);
    await writeFiles(root, { "src/app.test.ts": SECOND, "src/app.ts": CODE });
    expect((await done(root)).code).toBe(2);
    // Without them it is not an unlock, and with the test changed the patch is not checked.
    const bare = await ask(root, []);
    expect(bare.code, bare.out).toBe(1);
    expect(bare.out).toContain(
      "Para desbloquear un test aprobado faltan `--patch` y `--evidence`.",
    );
    const options = ["--patch", "-", "--evidence", "src/app.ts:1-1"];
    const changed = await ask(root, options, patchTo(SECOND));
    expect(changed.code, changed.out).toBe(1);
    expect(changed.out).toContain("`src/app.test.ts` no está como se bloqueó.");
    // Back as it was locked, the new unlock is a request.
    await writeFiles(root, { "src/app.test.ts": TEST });
    const again = await ask(root, options, patchTo(SECOND));
    expect(again.code, again.out).toBe(0);
    expect(again.out).toContain("SOLICITUD S2 (desbloquea tests aprobados):\n  src/app.test.ts");
    expect(again.out).toContain("lo decide solo la persona");
    expect((await stateOf(root)).pending.scopeRequests).toMatchObject([
      { id: "S2", task: "T1", paths: ["src/app.test.ts"], patch: patchTo(SECOND) },
    ]);
    expect((await decide(root, ["approve", "--scope", "S2"])).code).toBe(0);
    expect((await stateOf(root)).tasks.T1.scopeExtra).toEqual(["src/app.test.ts"]);
    // The new patch replaces the first one.
    await writeFiles(root, { "src/app.test.ts": SECOND });
    const t1 = await done(root);
    expect(t1.code, t1.out).toBe(0);
    expect((await stateOf(root)).lockedTests).toEqual({ "src/app.test.ts": hashText(SECOND) });
  });
});

describe("approving an unlock whose patch no longer holds", () => {
  it("AC8: Specty rejects it when the test is not as it was locked, and the scope stays", async () => {
    const root = await unlockAsked();
    // Past the guard, as a shell command could.
    await writeFiles(root, { "src/app.test.ts": SECOND });
    const approval = await decide(root, ["approve", "--scope", "S1"]);
    expect(approval.code, approval.out).toBe(2);
    expect(approval.out).toContain("`src/app.test.ts` no está como se bloqueó.");
    expect(approval.out).toContain(
      "Specty rechazó S1: su parche ya no vale para la versión bloqueada del test.",
    );
    expect(approval.out).toContain(
      "SIGUIENTE: pídele a tu agente que deje el test como se bloqueó y vuelva a pedir el desbloqueo.",
    );
    const state = await stateOf(root);
    expect(state.pending.scopeRequests).toEqual([]);
    expect(state.tasks.T1.scopeExtra).toEqual([]);
    const decided = await lastDecision(root);
    expect(decided.actor).toBe("specty");
    expect(decided.data).toEqual({
      id: "S1",
      decision: "rejected",
      reason:
        "Su parche ya no valía al aprobarla. `src/app.test.ts` no está como se bloqueó. El parche se comprueba sobre la versión que aprobó la persona: vuelve a dejar el test así.",
    });
  });

  it("AC8: Specty rejects it when its patch no longer applies", async () => {
    const root = await unlockAsked();
    // A request whose patch does not apply to the locked test, whatever made it so.
    const path = join(root, `.specty/changes/${CHANGE}/state.json`);
    const state = await stateOf(root);
    state.pending.scopeRequests[0].patch = patchTo(FIRST).replace("saluda a Ana", "saluda a Eva");
    await writeFile(path, `${JSON.stringify(state, null, 2)}\n`);
    const approval = await decide(root, ["approve", "--scope", "S1"]);
    expect(approval.code, approval.out).toBe(2);
    expect(approval.out).toContain(
      "El parche no se aplica a la versión bloqueada del test: `git apply` dice «",
    );
    expect((await stateOf(root)).tasks.T1.scopeExtra).toEqual([]);
    expect((await lastDecision(root)).data).toMatchObject({ id: "S1", decision: "rejected" });
  });

  it("AC8: a person's rejection is theirs, unchecked", async () => {
    const root = await unlockAsked();
    await writeFiles(root, { "src/app.test.ts": SECOND });
    const rejection = await decide(root, ["reject", "--scope", "S1", "--reason", "No hace falta"]);
    expect(rejection.code, rejection.out).toBe(0);
    const decided = await lastDecision(root);
    expect(decided.actor).toBe("human");
    expect(decided.data).toEqual({ id: "S1", decision: "rejected", reason: "No hace falta" });
  });
});
